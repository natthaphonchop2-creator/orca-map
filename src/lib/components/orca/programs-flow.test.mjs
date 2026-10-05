import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the real component script with its matching Svelte runtime.
import { effect_root, flush, untrack } from 'svelte/internal/client';
import { importTypeScript } from '../../orca/test-import.mjs';

// The real script of AddProgramFlow.svelte, run without a browser: the save
// payload, the draft that survives a reload, stale discovery and repeated saves.
const catalogHelpers = await importTypeScript(new URL('../../orca/program-catalog.ts', import.meta.url));
const tools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
const { catalogSource } = await importTypeScript(new URL('../../orca/catalog.ts', import.meta.url));
const { policyStep } = await importTypeScript(new URL('../../orca/company-account.ts', import.meta.url));
const component = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
	.replace('$props()', '$state(testProps)');
const names = [
	'catalogSource', 'currentCompany', 'localeHref', 't', 'orcaError', 'programSaveError', 'programSaveConflict', 'ProgramService', 'OrcaService', 'policyStep', 'onDestroy', 'onMount', 'untrack',
	...Object.keys(catalogHelpers), ...Object.keys(tools)
];
const require = createRequire(import.meta.url);
const compiled = compileModule(
	`export function harness(testProps, deps) {
		const { ${[...new Set(names)].join(', ')} } = deps;
		${script}
		return {
			discover, accountReady, companyAccountReady, save, pick, change, loadCatalog,
			setConnections(list) { data.connections = list; },
			set(input) {
				if (input.selected !== undefined) selected = input.selected;
				if (input.name !== undefined) name = input.name;
				if (input.note !== undefined) note = input.note;
				if (input.preset !== undefined) preset = input.preset;
			},
			setMode(value) { accountMode = value; },
			get state() { return { step, sourceID, tools, toolsFor, toolsAccount, companyAccount, accountMode, companyAllowed, discovering, discoverError, selected, preset, name, note, saving, saveError, saved, sources }; }
		};
	}`,
	{ filename: 'add-program-flow-test.svelte.js', generate: 'client' }
).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const definition = (name, readOnlyHint) => ({ name, description: name, inputSchema: {}, definition: { name, annotations: readOnlyHint === undefined ? undefined : { readOnlyHint } } });
const offered = [definition('list', true), definition('get', true), definition('create', false), definition('email')];
const candidates = [{ id: 'flow', name: 'FlowAccount', setupStatus: 'available' }, { id: 'peak', name: 'PEAK', setupStatus: 'available' }];

function memoryStorage() {
	const store = new Map();
	return { store, getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
}

async function setup(context, { props = {}, service = {}, storage = memoryStorage() } = {}) {
	const writes = [];
	const navigations = [];
	let refreshes = 0;
	const mounts = [];
	const destroys = [];
	globalThis.window = { sessionStorage: storage, scrollTo() {} };
	let view;
	const stop = effect_root(() => {
		view = harness(
			{
				data: { connections: [{ id: 'old', name: 'FlowAccount', mcpID: 'x' }], hubs: [], members: [], platformOperator: false },
				mode: 'page', step: 'connect', sourceID: 'flow', address: '/app?view=add-program&source=flow&step=connect',
				navigate: async (href) => { navigations.push(href); },
				onchanged: async () => { refreshes++; },
				...props
			},
			{
				...catalogHelpers, ...tools, catalogSource, policyStep, untrack,
				OrcaService: { programAccountPolicy: service.policy ?? (async () => undefined) },
				currentCompany: () => 'default', localeHref: (href) => href, t: (th) => th, orcaError: (cause) => cause.message,
				programSaveError: (cause) => tools.programSaveMessage(cause.message, (th) => th) ?? cause.message,
				programSaveConflict: (cause) => cause?.status === 409,
				onMount: (fn) => mounts.push(fn), onDestroy: (fn) => destroys.push(fn),
				ProgramService: {
					candidates: async () => candidates,
					discover: service.discover ?? (async () => offered),
					save: service.save ?? (async (input, id) => { writes.push({ input, id }); return { ...input, id: id ?? `saved-${writes.length}`, version: (input.version ?? 0) + 1 }; })
				}
			}
		);
	});
	for (const fn of mounts) fn();
	await view.loadCatalog();
	flush();
	context.after(() => {
		for (const fn of destroys) fn();
		stop();
		delete globalThis.window;
	});
	return { view, writes, navigations, storage, refreshes: () => refreshes };
}

test('an account that works leads to step 3 with a read-only start and the program name prefilled, not taken twice', async (context) => {
	const { view, navigations } = await setup(context);
	await view.accountReady('flow');
	assert.deepEqual(navigations, ['/app?view=add-program&source=flow&step=tools']);
	assert.equal(view.state.toolsFor, 'flow');
	assert.equal(view.state.preset, 'read');
	assert.deepEqual(view.state.selected, ['list', 'get']);
	assert.equal(view.state.name, 'FlowAccount (2)', 'another program already uses the name');
	// A late answer for another program never moves the page.
	await view.accountReady('peak');
	assert.equal(navigations.length, 1);
});

test('"อนุญาต N อย่างนี้" sends reviewedTools:true, reviewedReadOnly for reads and the optional note, then opens step 4', async (context) => {
	const { view, writes, navigations, refreshes, storage } = await setup(context, { props: { step: 'tools' } });
	await view.discover('flow');
	flush();
	await view.save();
	assert.deepEqual(writes, [{ input: { name: 'FlowAccount (2)', description: '', mcpID: 'flow', toolNames: ['list', 'get'], scopeNote: '', reviewedTools: true, reviewedReadOnly: true, enabled: true }, id: undefined }]);
	assert.equal(refreshes(), 1);
	assert.equal(navigations.at(-1), '/app?view=add-program&source=flow&step=done&connection=saved-1');
	assert.equal(storage.store.has('orca.addProgram.default'), false, 'the draft is cleared after saving');
	assert.deepEqual([...storage.store.keys()], ['orca.addProgram.saved.default'], 'only which program was saved stays');
	// Change tools make it a normal (not read-only) review; saving again changes the same program.
	view.set({ preset: 'write', selected: ['list', 'email'], note: '  ฝ่ายบัญชี ' });
	await view.save();
	assert.equal(writes.length, 2);
	assert.equal(writes[1].id, 'saved-1');
	assert.equal(writes[1].input.version, 1);
	assert.equal(writes[1].input.reviewedTools, true);
	assert.equal(writes[1].input.reviewedReadOnly, false);
	assert.equal(writes[1].input.scopeNote, 'ฝ่ายบัญชี');
});

test('Back from step 4 and a reload at step 3 update the program already saved; step 1 starts a new one', async (context) => {
	const storage = memoryStorage();
	const first = await setup(context, { props: { step: 'tools' }, storage });
	await first.view.discover('flow');
	flush();
	await first.view.save();
	assert.equal(first.writes[0].id, undefined, 'the first save creates the program');
	assert.ok(storage.store.get('orca.addProgram.saved.default'), 'this tab remembers what it saved');
	// The reload: the page's own memory is gone, the company data now has the program.
	const savedProgram = { id: 'saved-1', name: 'FlowAccount (2)', description: '', mcpID: 'flow', enabled: true, toolNames: ['list', 'get'], version: 1 };
	const data = { connections: [{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, savedProgram], hubs: [], members: [], platformOperator: false };
	const reloaded = await setup(context, { props: { step: 'tools', data }, storage });
	await reloaded.view.discover('flow');
	flush();
	await reloaded.view.save();
	assert.equal(reloaded.writes.length, 1);
	assert.equal(reloaded.writes[0].id, 'saved-1', 'an update, not a second copy');
	assert.equal(reloaded.writes[0].input.version, 1);
	// An archived program, or another program's memory, is never updated.
	const archived = { ...data, connections: [{ ...savedProgram, archivedAt: '2026-09-29T00:00:00Z' }] };
	const afterArchive = await setup(context, { props: { step: 'tools', data: archived }, storage });
	await afterArchive.view.discover('flow');
	flush();
	await afterArchive.view.save();
	assert.equal(afterArchive.writes[0].id, undefined);
	// Step 1 forgets it: choosing again is a new program.
	const again = await setup(context, { props: { step: 'choose', data }, storage });
	flush();
	assert.equal(storage.store.has('orca.addProgram.saved.default'), false);
	assert.equal(again.view.state.saved, undefined);
	const fresh = await setup(context, { props: { step: 'tools', data }, storage });
	await fresh.view.discover('flow');
	flush();
	await fresh.view.save();
	assert.equal(fresh.writes[0].id, undefined);
});

test('saving again goes on the version this tab saved: a newer program is refused and shown, never overwritten (Codex release review 65)', async (context) => {
	const storage = memoryStorage();
	let current = 0;
	const writes = [];
	const save = async (input, id) => {
		writes.push({ input, id });
		if (id && input.version !== current) throw Object.assign(new Error('someone else changed this program'), { status: 409 });
		current += 1;
		return { ...input, id: 'saved-1', version: current };
	};
	const { view, refreshes } = await setup(context, { props: { step: 'tools' }, service: { save }, storage });
	await view.discover('flow');
	flush();
	await view.save();
	assert.equal(current, 1);
	assert.match(storage.store.get('orca.addProgram.saved.default'), /"version":1/, 'the tab remembers the version it saved');
	// Another admin narrows the program (version 2), and this page refreshes.
	current = 2;
	view.setConnections([{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, { id: 'saved-1', name: 'FlowAccount (2)', description: '', mcpID: 'flow', enabled: true, toolNames: ['list'], version: 2 }]);
	flush();
	// Back at step 3 with the old ticks: the save goes on version 1 and is refused.
	view.set({ selected: ['list', 'get'] });
	await view.save();
	assert.equal(writes[1].input.version, 1, 'on the version this tab saved, not the newest');
	assert.equal(current, 2, 'nothing overwritten');
	assert.deepEqual(view.state.selected, ['list'], 'the page now shows the newer program');
	assert.match(view.state.saveError, /หน้านี้แสดงฉบับล่าสุดแล้ว/);
	assert.ok(refreshes() >= 2);
	// Checked, saved again: now on version 2.
	await view.save();
	assert.equal(writes[2].input.version, 2);
	assert.equal(current, 3);
});

test('after a reload, saving again goes on the version this tab stored, so a newer program is still refused (Codex release review 65)', async (context) => {
	const storage = memoryStorage();
	const first = await setup(context, { props: { step: 'tools' }, storage });
	await first.view.discover('flow');
	flush();
	await first.view.save();
	assert.match(storage.store.get('orca.addProgram.saved.default'), /"version":1/);
	// Someone else saved version 2; this tab reloads at step 3 with its draft.
	const newer = { id: 'saved-1', name: 'FlowAccount (2)', description: '', mcpID: 'flow', enabled: true, toolNames: ['list'], version: 2 };
	const data = { connections: [{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, newer], hubs: [], members: [], platformOperator: false };
	const reloaded = await setup(context, { props: { step: 'tools', data }, storage });
	await reloaded.view.discover('flow');
	flush();
	await reloaded.view.save();
	assert.equal(reloaded.writes[0].id, 'saved-1');
	assert.equal(reloaded.writes[0].input.version, 1, 'the stored version, not the newest');
});

test('when storage stops taking writes, saving again still uses the newest version this page knows (Codex release review 66)', async (context) => {
	const storage = memoryStorage();
	let current = 0;
	const writes = [];
	const save = async (input, id) => {
		writes.push({ input, id });
		if (id && input.version !== current) throw Object.assign(new Error('someone else changed this program'), { status: 409 });
		current += 1;
		return { ...input, id: 'saved-1', version: current };
	};
	const { view } = await setup(context, { props: { step: 'tools' }, service: { save }, storage });
	await view.discover('flow');
	flush();
	await view.save();
	// From here on, storage reads work but writes fail.
	storage.setItem = () => { throw new Error('quota'); };
	current = 2;
	view.setConnections([{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, { id: 'saved-1', name: 'FlowAccount (2)', description: '', mcpID: 'flow', enabled: true, toolNames: ['list'], version: 2 }]);
	flush();
	await view.save();
	assert.equal(writes[1].input.version, 1, 'refused once, as it should be');
	await view.save();
	assert.equal(writes[2].input.version, 2, 'then on the newest version, not the stale stored one');
	assert.equal(current, 3);
});

test('Back to step 3 after a reload, with no draft left, starts from the program this tab saved, not the defaults (Codex release review 66)', async (context) => {
	const storage = memoryStorage();
	const first = await setup(context, { props: { step: 'tools' }, storage });
	await first.view.discover('flow');
	first.view.set({ preset: 'write', selected: ['list', 'email'], name: 'บัญชีของเรา', note: 'เฉพาะฝ่ายบัญชี' });
	flush();
	await first.view.save();
	assert.equal(storage.store.has('orca.addProgram.default'), false, 'the draft is gone after the save');
	const savedProgram = { id: 'saved-1', name: 'บัญชีของเรา', description: '', mcpID: 'flow', enabled: true, scopeNote: 'เฉพาะฝ่ายบัญชี', toolNames: ['list', 'email'], version: 1 };
	const data = { connections: [{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, savedProgram], hubs: [], members: [], platformOperator: false };
	const back = await setup(context, { props: { step: 'tools', data }, storage });
	await back.view.discover('flow');
	flush();
	assert.deepEqual([...back.view.state.selected].sort(), ['email', 'list']);
	assert.equal(back.view.state.name, 'บัญชีของเรา');
	assert.equal(back.view.state.note, 'เฉพาะฝ่ายบัญชี');
	assert.equal(back.view.state.preset, 'write');
	await back.view.save();
	assert.equal(back.writes[0].id, 'saved-1');
	assert.deepEqual(back.writes[0].input.toolNames, ['list', 'email'], 'nothing it saved is overwritten by the defaults');
});

test('Back to step 3 when the program no longer offers anything it saved: its name and note stay, nothing is ticked, and nothing is saved until reviewed (Codex release review 67)', async (context) => {
	const storage = memoryStorage();
	const first = await setup(context, { props: { step: 'tools' }, storage });
	await first.view.discover('flow');
	first.view.set({ preset: 'write', selected: ['create'], name: 'บัญชีของเรา', note: 'เฉพาะฝ่ายบัญชี' });
	flush();
	await first.view.save();
	const savedProgram = { id: 'saved-1', name: 'บัญชีของเรา', description: '', mcpID: 'flow', enabled: true, scopeNote: 'เฉพาะฝ่ายบัญชี', toolNames: ['create'], version: 1 };
	const data = { connections: [{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, savedProgram], hubs: [], members: [], platformOperator: false };
	// The provider dropped "create": only read tools are offered now.
	const back = await setup(context, { props: { step: 'tools', data }, storage, service: { discover: async () => [definition('list', true), definition('get', true)] } });
	await back.view.discover('flow');
	flush();
	assert.deepEqual(back.view.state.selected, [], 'no default ticks in place of the saved ones');
	assert.equal(back.view.state.name, 'บัญชีของเรา');
	assert.equal(back.view.state.note, 'เฉพาะฝ่ายบัญชี');
	await back.view.save();
	assert.equal(back.writes.length, 0, 'nothing saved before a tick is chosen');
	assert.equal(back.view.state.saveError, 'ติ๊กอย่างน้อย 1 อย่าง');
	back.view.set({ selected: ['list'] });
	await back.view.save();
	assert.equal(back.writes[0].id, 'saved-1');
	assert.equal(back.writes[0].input.name, 'บัญชีของเรา');
	assert.equal(back.writes[0].input.version, 1);
});

test('a refused save shows the newer program whole: its name and note too, so saving again never puts back ones this page never showed (Codex release review 67)', async (context) => {
	const storage = memoryStorage();
	let current = 0;
	const writes = [];
	const save = async (input, id) => {
		writes.push({ input, id });
		if (id && input.version !== current) throw Object.assign(new Error('someone else changed this program'), { status: 409 });
		current += 1;
		return { ...input, id: 'saved-1', version: current };
	};
	const { view } = await setup(context, { props: { step: 'tools' }, service: { save }, storage });
	await view.discover('flow');
	view.set({ name: 'FlowAccount บัญชี', note: 'ของเรา' });
	flush();
	await view.save();
	// Another admin renames it and changes the note (version 2).
	current = 2;
	view.setConnections([{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, { id: 'saved-1', name: 'FlowAccount ฝ่ายขาย', description: '', mcpID: 'flow', enabled: true, scopeNote: 'ฝ่ายขายเท่านั้น', toolNames: ['list'], version: 2 }]);
	flush();
	await view.save();
	assert.equal(writes[1].input.version, 1, 'refused once');
	assert.equal(view.state.name, 'FlowAccount ฝ่ายขาย', 'the newer name is shown');
	assert.equal(view.state.note, 'ฝ่ายขายเท่านั้น', 'the newer note is shown');
	await view.save();
	assert.equal(writes[2].input.version, 2);
	assert.equal(writes[2].input.name, 'FlowAccount ฝ่ายขาย', 'the other admin\'s name is kept');
	assert.equal(writes[2].input.scopeNote, 'ฝ่ายขายเท่านั้น', 'and their note');
});

test('a refused save whose refresh failed takes nothing: the page keeps its edits and says to save again (Codex release review 68)', async (context) => {
	const storage = memoryStorage();
	let current = 0;
	const writes = [];
	const save = async (input, id) => {
		writes.push({ input, id });
		if (id && input.version !== current) throw Object.assign(new Error('someone else changed this program'), { status: 409 });
		current += 1;
		return { ...input, id: 'saved-1', version: current };
	};
	const { view } = await setup(context, { props: { step: 'tools' }, service: { save }, storage });
	await view.discover('flow');
	flush();
	await view.save();
	// Someone else saves version 2; this page's refresh fails, so its data still has version 1.
	current = 2;
	view.setConnections([{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, { id: 'saved-1', name: 'FlowAccount (2)', description: '', mcpID: 'flow', enabled: true, scopeNote: '', toolNames: ['list', 'get'], version: 1 }]);
	flush();
	view.set({ selected: ['list'], name: 'ของฉัน' });
	await view.save();
	assert.equal(writes[1].input.version, 1, 'refused');
	assert.deepEqual(view.state.selected, ['list'], 'the edits stay');
	assert.equal(view.state.name, 'ของฉัน');
	assert.match(view.state.saveError, /ยังโหลดฉบับล่าสุดไม่ได้/);
	assert.doesNotMatch(view.state.saveError, /หน้านี้แสดงฉบับล่าสุดแล้ว/, 'never claims to show the newest');
	await view.save();
	assert.equal(writes[2].input.version, 1, 'still on the version it saved: refused again, nothing overwritten');
	assert.equal(current, 2);
});

test('the server\'s B3 refusal reads in Thai', async (context) => {
	assert.equal(tools.programSaveMessage('review at least one selected tool', (th) => th), 'เลือกสิ่งที่ AI ทำได้อย่างน้อย 1 อย่าง');
	assert.equal(tools.programSaveMessage('Review at least one selected tool', (_th, en) => en), 'Choose at least one thing AI can do.');
	assert.match(tools.programSaveMessage('the scope note is too long', (th) => th), /หมายเหตุยาวเกินไป/);
	assert.equal(tools.programSaveMessage('something else', (th) => th), undefined);
	// Backend 1956664 (before B3), during the workspace-first deploy: the note, not the tools (Codex release review 63).
	assert.match(tools.programSaveMessage('review at least one selected tool and describe the actual upstream data scope', (th) => th), /ยังต้องใส่หมายเหตุ/);
	assert.doesNotMatch(tools.programSaveMessage('review at least one selected tool and describe the actual upstream data scope', (th) => th), /เลือกสิ่งที่ AI ทำได้/);
	const { view } = await setup(context, { props: { step: 'tools' }, service: { save: async () => { throw new Error('review at least one selected tool'); } } });
	await view.discover('flow');
	flush();
	await view.save();
	assert.equal(view.state.saveError, 'เลือกสิ่งที่ AI ทำได้อย่างน้อย 1 อย่าง');
	const service = await readFile(new URL('../../services/orca-programs.ts', import.meta.url), 'utf8');
	assert.match(service, /programSaveMessage\(parsed\.message, t\)/);
	for (const name of ['./programs/AddProgramFlow.svelte', './programs/ProgramToolsTab.svelte'])
		assert.match(await readFile(new URL(name, import.meta.url), 'utf8'), /= programSaveError\(cause\)/, name);
});

test('ticked tools survive a reload through the draft; a broken draft falls back to the read-only start', async (context) => {
	const storage = memoryStorage();
	const first = await setup(context, { props: { step: 'tools' }, storage });
	await first.view.discover('flow');
	first.view.set({ preset: 'write', selected: ['list', 'create'], name: 'FlowAccount บัญชี', note: 'n' });
	flush();
	assert.ok(storage.store.get('orca.addProgram.default'), 'written to sessionStorage');
	const second = await setup(context, { props: { step: 'tools' }, storage });
	await second.view.discover('flow');
	assert.deepEqual(second.view.state.selected, ['list', 'create']);
	assert.equal(second.view.state.preset, 'write');
	assert.equal(second.view.state.name, 'FlowAccount บัญชี');
	// A draft that claims read-only cannot carry a change tool back in.
	storage.store.set('orca.addProgram.default', JSON.stringify({ v: 1, sourceID: 'flow', toolNames: ['list', 'create'], preset: 'read', name: 'x', note: '', at: Date.now() }));
	const third = await setup(context, { props: { step: 'tools' }, storage });
	await third.view.discover('flow');
	assert.deepEqual(third.view.state.selected, ['list']);
	storage.store.set('orca.addProgram.default', '{broken');
	const fourth = await setup(context, { props: { step: 'tools' }, storage });
	await fourth.view.discover('flow');
	assert.deepEqual(fourth.view.state.selected, ['list', 'get']);
});

test('discovery that finds nothing or fails stays on step 2 with a plain message, and a stale answer is ignored', async (context) => {
	const empty = await setup(context, { service: { discover: async () => [] } });
	await empty.view.accountReady('flow');
	assert.deepEqual(empty.navigations, []);
	assert.match(empty.view.state.discoverError, /ยังไม่พบสิ่งที่ AI ทำได้ใน FlowAccount/);
	const failing = await setup(context, { service: { discover: async () => { throw new Error('ยังเชื่อมไม่ได้'); } } });
	await failing.view.accountReady('flow');
	assert.equal(failing.view.state.discoverError, 'ยังเชื่อมไม่ได้');
	let release;
	const slow = await setup(context, { service: { discover: () => new Promise((done) => { release = done; }) } });
	const pending = slow.view.discover('flow');
	slow.view.change();
	release(offered);
	assert.equal(await pending, false);
	assert.equal(slow.view.state.toolsFor, '');
});

test('nothing is saved without a name or a ticked tool', async (context) => {
	const { view, writes } = await setup(context, { props: { step: 'tools' } });
	await view.discover('flow');
	view.set({ selected: [] });
	await view.save();
	assert.equal(view.state.saveError, 'ติ๊กอย่างน้อย 1 อย่าง');
	view.set({ selected: ['list'], name: '  ' });
	await view.save();
	assert.equal(view.state.saveError, 'ตั้งชื่อที่ทีมเห็นก่อน');
	assert.deepEqual(writes, []);
});

test('in the workspace form\'s sheet the steps stay in place and finish by handing back the program', async (context) => {
	const completed = [];
	const { view, navigations } = await setup(context, {
		props: {
			mode: 'sheet', step: undefined, sourceID: undefined, initialSourceID: '',
			data: { connections: [{ id: 'conn-flow', name: 'FlowAccount', mcpID: 'flow' }], hubs: [], members: [], platformOperator: false },
			oncompleted: async (connection) => { completed.push(connection.id); }
		}
	});
	assert.equal(view.state.step, 'choose');
	// A program already connected is handed back as it is.
	view.pick('flow', 'conn-flow');
	await Promise.resolve();
	assert.deepEqual(completed, ['conn-flow']);
	view.pick('peak');
	await Promise.resolve();
	flush();
	assert.equal(view.state.step, 'connect');
	assert.equal(view.state.sourceID, 'peak');
	await view.accountReady('peak');
	flush();
	assert.equal(view.state.step, 'tools');
	await view.save();
	assert.deepEqual(completed, ['conn-flow', 'saved-1']);
	assert.deepEqual(navigations, [], 'the sheet never navigates the page');
});

test('บัญชีกลาง at step 2: offered unless the program allows personal accounts only, or its policy could not be read', async (context) => {
	const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); flush(); } };
	const warn = await setup(context, { service: { policy: async () => ({ mode: 'warn', revision: 2 }) } });
	await settle();
	assert.equal(warn.view.state.companyAllowed, true);
	assert.equal(warn.view.state.accountMode, 'personal', 'each person\'s own stays the start');
	const only = await setup(context, { service: { policy: async () => ({ mode: 'personal_only', revision: 1 }) } });
	await settle();
	assert.equal(only.view.state.companyAllowed, false);
	const failed = await setup(context, { service: { policy: async () => { throw new Error('down'); } } });
	await settle();
	assert.equal(failed.view.state.companyAllowed, false, 'unknown is never offered');
	const reload = await setup(context, { props: { programAccountID: 'pac-1' }, service: { policy: async () => ({ mode: 'allowed', revision: 1 }) } });
	assert.equal(reload.view.state.accountMode, 'company', 'a reload with the account in the address keeps the choice');
});

test('a company account connected at step 2: step 3 reads what AI can do on it, and the save names it', async (context) => {
	const asked = [];
	const { view, writes, navigations } = await setup(context, { service: { discover: async (id, account) => { asked.push([id, account]); return offered; } } });
	await view.companyAccountReady('flow', 'pac-1');
	assert.deepEqual(asked, [['flow', 'pac-1']]);
	assert.deepEqual(navigations, ['/app?view=add-program&source=flow&step=tools&account=pac-1']);
	assert.equal(view.state.toolsAccount, 'pac-1');
	// A late answer for another program never moves the page.
	await view.companyAccountReady('peak', 'pac-2');
	assert.equal(navigations.length, 1);

	// Step 3 as the address opens it: the account from the address.
	const page = await setup(context, { props: { step: 'tools', programAccountID: 'pac-1', address: '/app?view=add-program&source=flow&step=tools&account=pac-1' }, service: { discover: async (id, account) => { asked.push([id, account]); return offered; } } });
	await page.view.discover('flow');
	flush();
	await page.view.save();
	assert.equal(asked.at(-1)[1], 'pac-1');
	assert.equal(page.writes.length, 1);
	assert.equal(page.writes[0].input.programAccountID, 'pac-1');
	assert.equal(page.navigations.at(-1), '/app?view=add-program&source=flow&step=done&account=pac-1&connection=saved-1');
	assert.deepEqual(writes, []);
});

test('tools read on another account than the address names are never saved on it', async (context) => {
	const { view, writes } = await setup(context, { props: { step: 'tools', programAccountID: 'pac-1' } });
	await view.discover('flow', '');
	flush();
	await view.save();
	assert.deepEqual(writes, [], 'the tools were read on the manager\'s own account');
});

test('back to each person\'s own account after saving with a company account says so on the same program', async (context) => {
	const completed = [];
	const { view, writes } = await setup(context, {
		props: {
			mode: 'sheet', step: undefined, sourceID: undefined, initialSourceID: 'flow',
			oncompleted: async (connection) => { completed.push(connection.id); }
		}
	});
	await view.companyAccountReady('flow', 'pac-1');
	flush();
	assert.equal(view.state.step, 'tools');
	assert.equal(view.state.companyAccount, 'pac-1');
	await view.save();
	assert.equal(writes[0].input.programAccountID, 'pac-1');
	// The manager goes back to step 2 and connects their own account instead.
	await view.accountReady('flow');
	flush();
	assert.equal(view.state.companyAccount, '');
	await view.save();
	assert.equal(writes.length, 2);
	assert.equal(writes[1].id, 'saved-1', 'the same program');
	assert.equal(writes[1].input.programAccountID, '', 'each person\'s own account, explicitly');
	assert.deepEqual(completed, ['saved-1', 'saved-1']);
});
