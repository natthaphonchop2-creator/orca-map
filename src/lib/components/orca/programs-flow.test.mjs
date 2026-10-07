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
	'catalogSource', 'currentCompany', 'localeHref', 't', 'orcaError', 'showToast', 'programSaveError', 'programSaveConflict', 'ProgramService', 'OrcaService', 'policyStep', 'onDestroy', 'onMount', 'untrack',
	...Object.keys(catalogHelpers), ...Object.keys(tools)
];
const require = createRequire(import.meta.url);
const compiled = compileModule(
	`export function harness(testProps, deps) {
		const { ${[...new Set(names)].join(', ')} } = deps;
		${script}
		return {
			discover, accountReady, companyAccountReady, save, retry, accountChanged, pick, change, loadCatalog,
			setConnections(list) { data.connections = list; },
			set(input) {
				if (input.selected !== undefined) selected = input.selected;
				if (input.name !== undefined) name = input.name;
				if (input.note !== undefined) note = input.note;
				if (input.preset !== undefined) preset = input.preset;
			},
			setMode(value) { accountMode = value; },
			get state() { return { step, sourceID, tools, toolsFor, toolsAccount, toolsAccountHint, companyAccount, accountMode, companyAllowed, discovering, discoverError, selected, preset, name, note, saving, saveError, saved, sources }; }
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
	const toasts = [];
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
				OrcaService: { programAccountPolicy: service.policy ?? (async () => undefined), programAccounts: service.accounts ?? (async () => []) },
				currentCompany: () => 'default', localeHref: (href) => href, t: (th) => th, orcaError: (cause) => cause.message, showToast: (message) => toasts.push(message),
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
	return { view, writes, navigations, toasts, storage, refreshes: () => refreshes };
}

// Owner decision 2026-10-07 ("บันทึกอัตโนมัติ"): once the account works, the classified read-only tools are saved
// without a click, and the page then names what AI may read, with a way to change it.
test('W0: an account that works saves the program read-only, with its name not taken twice, and goes back to the catalog', async (context) => {
	const { view, navigations, writes, toasts, refreshes } = await setup(context);
	await view.accountReady('flow');
	assert.equal(view.state.toolsFor, 'flow');
	assert.equal(view.state.preset, 'read');
	assert.deepEqual(view.state.selected, ['list', 'get']);
	// The read-only start the owner chose, saved and reviewed as read-only: never a tool that changes data.
	assert.deepEqual(writes, [{ input: { name: 'FlowAccount (2)', description: '', mcpID: 'flow', toolNames: ['list', 'get'], scopeNote: '', reviewedTools: true, reviewedReadOnly: true, enabled: true }, id: undefined }]);
	assert.equal(refreshes(), 1);
	assert.deepEqual(navigations, ['/app?view=servers&catalog=1&added=saved-1'], 'back to the catalog, where the card now says เชื่อมแล้ว and a line names what AI may read');
	assert.deepEqual(toasts, ['เชื่อม FlowAccount แล้ว']);
	// A late answer for another program never moves the page or saves.
	await view.accountReady('peak');
	assert.equal(navigations.length, 1);
	assert.equal(writes.length, 1);
});

test('W0 (owner: บันทึกอัตโนมัติ): a write or an unannotated tool is never auto-approved; only classified reads are', async (context) => {
	for (const discovered of [
		[definition('create', false)],
		[definition('email')],
		[definition('email'), definition('create', false)],
		[{ name: 'odd', description: 'odd', inputSchema: {}, definition: { name: 'odd', annotations: { readOnlyHint: 'true' } } }],
		[{ name: 'purge', description: 'purge', inputSchema: {}, definition: { name: 'purge', annotations: { readOnlyHint: true, destructiveHint: true } } }]
	]) {
		const run = await setup(context, { service: { discover: async () => discovered } });
		await run.view.accountReady('flow');
		assert.deepEqual(run.writes, [], discovered.map((item) => item.name).join());
		assert.deepEqual(run.navigations, ['/app?view=add-program&source=flow&step=tools'], 'it asks first');
	}
	// Mixed: only the classified reads are saved, never the write or the unannotated tool beside them.
	const mixed = await setup(context);
	await mixed.view.accountReady('flow');
	assert.deepEqual(mixed.writes[0].input.toolNames, ['list', 'get']);
	assert.equal(mixed.writes[0].input.reviewedReadOnly, true);
	// A selection that somehow holds a write is never auto-saved either.
	const source = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
	assert.match(source, /autoReviewSelection\(tools, selected\)\.length > 0/);
});

test('W0: with nothing read-only, the page asks what AI may do before saving; from the create form or onboarding it goes back there', async (context) => {
	const changing = [definition('create', false), definition('send', false)];
	const asks = await setup(context, { service: { discover: async () => changing } });
	await asks.view.accountReady('flow');
	assert.deepEqual(asks.writes, [], 'nothing that changes data is saved unasked');
	assert.deepEqual(asks.navigations, ['/app?view=add-program&source=flow&step=tools']);
	const fromForm = await setup(context, { props: { returnTo: 'new' } });
	await fromForm.view.accountReady('flow');
	assert.deepEqual(fromForm.navigations, ['/app?view=new&connection=saved-1']);
	const fromWelcome = await setup(context, { props: { returnTo: 'welcome' } });
	await fromWelcome.view.accountReady('flow');
	assert.deepEqual(fromWelcome.navigations, ['/app?view=welcome&page=2&added=saved-1']);
});

test('"อนุญาต N อย่างนี้" sends reviewedTools:true, reviewedReadOnly for reads and the optional note, then goes back to the catalog', async (context) => {
	const { view, writes, navigations, refreshes, storage } = await setup(context, { props: { step: 'tools' } });
	await view.discover('flow');
	flush();
	await view.save();
	assert.deepEqual(writes, [{ input: { name: 'FlowAccount (2)', description: '', mcpID: 'flow', toolNames: ['list', 'get'], scopeNote: '', reviewedTools: true, reviewedReadOnly: true, enabled: true }, id: undefined }]);
	assert.equal(refreshes(), 1);
	assert.equal(navigations.at(-1), '/app?view=servers&catalog=1&added=saved-1');
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

test('a company account connected in the connect step: what AI can do is read on it, and the save names it', async (context) => {
	const asked = [];
	const { view, writes, navigations } = await setup(context, { service: { discover: async (id, account) => { asked.push([id, account]); return offered; } } });
	await view.companyAccountReady('flow', 'pac-1');
	assert.deepEqual(asked, [['flow', 'pac-1']]);
	assert.equal(view.state.toolsAccount, 'pac-1');
	// W0: saved read-only on the company account at once, then back to the catalog.
	assert.equal(writes.length, 1);
	assert.equal(writes[0].input.programAccountID, 'pac-1');
	assert.equal(writes[0].input.reviewedReadOnly, true);
	assert.deepEqual(navigations, ['/app?view=servers&catalog=1&added=saved-1']);
	// A late answer for another program never moves the page.
	await view.companyAccountReady('peak', 'pac-2');
	assert.equal(navigations.length, 1);
	assert.equal(writes.length, 1);

	// Step 3 as the address opens it: the account from the address.
	const page = await setup(context, { props: { step: 'tools', programAccountID: 'pac-1', address: '/app?view=add-program&source=flow&step=tools&account=pac-1' }, service: { discover: async (id, account) => { asked.push([id, account]); return offered; } } });
	await page.view.discover('flow');
	flush();
	await page.view.save();
	assert.equal(asked.at(-1)[1], 'pac-1');
	assert.equal(page.writes.length, 1);
	assert.equal(page.writes[0].input.programAccountID, 'pac-1');
	assert.equal(page.navigations.at(-1), '/app?view=servers&catalog=1&added=saved-1');
});

test('the address a company account signed in as reaches the summary before saving, from step 2 or the managers\' list after a reload (CA1b O15)', async (context) => {
	const { view } = await setup(context);
	await view.companyAccountReady('flow', 'pac-1', 'office@example.com');
	flush();
	assert.equal(view.state.toolsAccount, 'pac-1');
	assert.equal(view.state.toolsAccountHint, 'office@example.com');
	await view.accountReady('flow');
	flush();
	assert.equal(view.state.toolsAccountHint, '', 'each person\'s own account shows no company address');

	const asked = [];
	const page = await setup(context, {
		props: { step: 'tools', programAccountID: 'pac-1', address: '/app?view=add-program&source=flow&step=tools&account=pac-1' },
		service: { accounts: async () => { asked.push('accounts'); return [{ id: 'pac-2', accountHint: 'other@example.com' }, { id: 'pac-1', accountHint: 'office@example.com' }]; } }
	});
	await page.view.discover('flow');
	await new Promise((resolve) => setTimeout(resolve, 0));
	flush();
	assert.deepEqual(asked, ['accounts']);
	assert.equal(page.view.state.toolsAccountHint, 'office@example.com', 'the account the address names, not another');

	const failing = await setup(context, { props: { step: 'tools', programAccountID: 'pac-1' }, service: { accounts: async () => { throw new Error('offline'); } } });
	assert.equal(await failing.view.discover('flow'), true, 'a hint that can\'t be read never stops step 3');
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(failing.view.state.toolsAccountHint, '');

	// Shown as text next to "connected with the company account", never as a link; step 2 hands it on.
	assert.match(component, /\{#if toolsAccountHint\}<span class="ap-strip-account">\{t\('บัญชีที่เชื่อม', 'Connected account'\)\}: \{toolsAccountHint\}<\/span>\{\/if\}/);
	assert.match(component, /onready=\{\(accountID, accountHint\) => companyAccountReady\(sourceID, accountID, accountHint\)\}/);
	const connect = await readFile(new URL('./programs/CompanyAccountConnect.svelte', import.meta.url), 'utf8');
	assert.match(connect, /await onready\(use\.id, use\.accountHint\);/, 'a ready account used as it is');
	assert.match(connect, /await onready\(connected\.id, connected\.accountHint\);/, 'an account just connected');
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

test('a refused save whose newest program uses another account reads the tools on that account first, and never saves the old one over it (Codex release review deploy44 rounds 1 and 2)', async (context) => {
	const settle = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); flush(); } };
	const asked = [];
	let refuse = false;
	const writes = [];
	const discover = async (id, account) => { asked.push(account ?? ''); return offered; };
	const save = async (input, id) => {
		if (refuse) { refuse = false; throw Object.assign(new Error('conflict'), { status: 409 }); }
		writes.push({ input, id });
		return { ...input, id: id ?? `saved-${writes.length}`, version: (input.version ?? 0) + 1 };
	};
	// In the sheet the account lives in the flow, so a change is seen at once.
	const sheet = await setup(context, { props: { mode: 'sheet', step: undefined, sourceID: undefined, initialSourceID: 'flow', oncompleted: async () => {} }, service: { discover, save } });
	await sheet.view.companyAccountReady('flow', 'pac-A');
	flush();
	sheet.view.set({ selected: ['list', 'get'], name: 'ของแท็บนี้' });
	await sheet.view.save();
	assert.equal(writes[0].input.programAccountID, 'pac-A');
	// This tab ticks more (its draft keeps them) while another manager moves the program to company account B; this tab saves again.
	sheet.view.set({ selected: ['list', 'get'], name: 'ของแท็บนี้อีก' });
	flush();
	sheet.view.setConnections([{ id: 'saved-1', name: 'FlowAccount', mcpID: 'flow', programAccountID: 'pac-B', toolNames: ['list'], scopeNote: '', version: 2, enabled: true, description: '' }]);
	refuse = true;
	await sheet.view.save();
	await settle();
	assert.equal(sheet.view.state.companyAccount, 'pac-B', 'the flow moves to B first');
	assert.equal(asked.at(-1), 'pac-B', 'the tools are read again on B');
	assert.equal(sheet.view.state.toolsAccount, 'pac-B');
	assert.deepEqual(sheet.view.state.selected, ['list'], 'the newest program as it is, not this tab\'s ticks');
	assert.equal(sheet.view.state.name, 'FlowAccount');
	assert.match(sheet.view.state.saveError, /บัญชีกลางอีกบัญชี/);
	await sheet.view.save();
	assert.equal(writes.length, 2);
	assert.equal(writes[1].input.programAccountID, 'pac-B', 'never A over B');
	assert.equal(writes[1].input.version, 2);

	// On the page the address moves to the newest program's account; nothing saves before it does.
	writes.length = 0;
	const page = await setup(context, {
		props: { step: 'tools', programAccountID: 'pac-A', address: '/app?view=add-program&source=flow&step=tools&account=pac-A' },
		service: { discover, save }
	});
	await page.view.discover('flow');
	flush();
	await page.view.save();
	page.view.setConnections([{ id: 'saved-1', name: 'FlowAccount', mcpID: 'flow', programAccountID: '', toolNames: ['list'], scopeNote: '', version: 2, enabled: true, description: '' }]);
	refuse = true;
	await page.view.save();
	await settle();
	assert.equal(page.navigations.at(-1), '/app?view=add-program&source=flow&step=tools', 'each person\'s own account now');
	assert.match(page.view.state.saveError, /แต่ละคนใช้บัญชีของตัวเอง/);
	await page.view.save();
	assert.equal(writes.length, 1, 'only the first save: the address still names A');
});

test('when the newest program\'s account cannot be read, Try again reads that account too, and nothing saves until it is read (Codex release review deploy44 round 2)', async (context) => {
	const settle = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); flush(); } };
	let refuse = false;
	let failOn = '';
	const asked = [];
	const writes = [];
	const discover = async (id, account) => { asked.push(account ?? ''); if (account === failOn) throw new Error('ยังอ่านบัญชีนี้ไม่ได้'); return offered; };
	const save = async (input, id) => {
		if (refuse) { refuse = false; throw Object.assign(new Error('conflict'), { status: 409 }); }
		writes.push({ input, id });
		return { ...input, id: id ?? `saved-${writes.length}`, version: (input.version ?? 0) + 1 };
	};
	const { view } = await setup(context, { props: { mode: 'sheet', step: undefined, sourceID: undefined, initialSourceID: 'flow', oncompleted: async () => {} }, service: { discover, save } });
	await view.companyAccountReady('flow', 'pac-A');
	flush();
	await view.save();
	view.setConnections([{ id: 'saved-1', name: 'FlowAccount', mcpID: 'flow', programAccountID: 'pac-B', toolNames: ['list'], scopeNote: '', version: 2, enabled: true, description: '' }]);
	refuse = true;
	failOn = 'pac-B';
	await view.save();
	await settle();
	assert.equal(asked.at(-1), 'pac-B');
	assert.equal(view.state.discoverError, 'ยังอ่านบัญชีนี้ไม่ได้');
	await view.save();
	assert.equal(writes.length, 1, 'the tools read on A are never saved on B\'s program');
	// ลองอีกครั้ง reads B again, never A.
	await view.discover('flow');
	assert.equal(asked.at(-1), 'pac-B');
	await view.save();
	assert.equal(writes.length, 1);
	// B can be read now: the newest program's ticks, saved on B.
	failOn = '';
	await view.discover('flow');
	flush();
	await view.save();
	assert.equal(writes.length, 2);
	assert.equal(writes[1].input.programAccountID, 'pac-B');
	assert.deepEqual(writes[1].input.toolNames, ['list']);
});

test('a discovery that ends after the program changed never opens step 3 for the other program', async (context) => {
	let release;
	const { view } = await setup(context, {
		props: { mode: 'sheet', step: undefined, sourceID: undefined, initialSourceID: 'flow', oncompleted: async () => {} },
		service: { discover: () => new Promise((done) => { release = done; }) }
	});
	const pending = view.companyAccountReady('flow', 'pac-A');
	view.pick('peak');
	flush();
	release(offered);
	await pending;
	flush();
	assert.equal(view.state.sourceID, 'peak');
	assert.equal(view.state.step, 'connect', 'still choosing the account for the other program');
	assert.equal(view.state.companyAccount, '', 'and with no account from the first one');
	// The same for each person's own account.
	const own = view.accountReady('peak');
	view.pick('flow');
	flush();
	release(offered);
	await own;
	flush();
	assert.equal(view.state.sourceID, 'flow');
	assert.equal(view.state.step, 'connect');
});

test('W0 (Codex review 1): a refused or failed auto-save is shown on the connect page with a retry, for each person\'s own account and for บัญชีกลาง', async (context) => {
	for (const company of [false, true]) {
		let fail = true;
		const writes = [];
		const run = await setup(context, {
			service: {
				save: async (input, id) => {
					if (fail) throw new Error('บันทึกไม่สำเร็จ');
					writes.push({ input, id });
					return { ...input, id: id ?? 'saved-1', version: 1 };
				}
			}
		});
		if (company) {
			run.view.setMode('company');
			await run.view.companyAccountReady('flow', 'pac-1');
		} else await run.view.accountReady('flow');
		assert.equal(run.view.state.saveError, 'บันทึกไม่สำเร็จ', company ? 'company' : 'personal');
		assert.deepEqual(run.navigations, [], 'it stays on the connect page');
		assert.equal(run.view.state.step, 'connect');
		// ลองอีกครั้ง: the same save, on the same account.
		fail = false;
		await run.view.retry();
		assert.equal(writes.length, 1);
		assert.equal(writes[0].input.programAccountID, company ? 'pac-1' : undefined);
		assert.deepEqual(writes[0].input.toolNames, ['list', 'get']);
		assert.deepEqual(run.navigations, ['/app?view=servers&catalog=1&added=saved-1']);
	}
	const source = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
	const connect = source.slice(source.indexOf("{:else if step === 'connect'}\n"), source.indexOf("{#key sourceID}"));
	assert.match(connect, /\{#if saveError && !discovering && toolsFor === sourceID\}<div class="ap-error ap-save-error" role="alert">[\s\S]*?\{saveError\}[\s\S]*?onclick=\{retry\}>\{t\('ลองอีกครั้ง', 'Try again'\)\}/);
});

test('Codex W0 review 2 (MAJOR 1): after a failed auto-save, switching whose account AI uses never retries on the other one', async (context) => {
	const failing = (writes) => async (input, id) => {
		writes.push({ input, id });
		throw new Error('บันทึกไม่สำเร็จ');
	};
	// Company account pac-A first, then each person's own.
	{
		const writes = [];
		const run = await setup(context, { service: { save: failing(writes) } });
		run.view.setMode('company');
		await run.view.companyAccountReady('flow', 'pac-A');
		assert.equal(writes.length, 1);
		assert.equal(writes[0].input.programAccountID, 'pac-A');
		assert.equal(run.view.state.saveError, 'บันทึกไม่สำเร็จ');
		// The change event did not arrive (or came late): ลองอีกครั้ง checks the account chosen now.
		run.view.setMode('personal');
		await run.view.retry();
		assert.equal(writes.length, 1, 'nothing saved on pac-A after choosing personal');
		assert.equal(run.view.state.saveError, '');
		assert.equal(run.view.state.toolsFor, '', 'what was read on pac-A is dropped');
		assert.equal(run.view.state.toolsAccount, '');
		// Connecting the person's own account then saves without any company account.
		await run.view.accountReady('flow');
		assert.equal(writes.length, 2);
		assert.equal(writes[1].input.programAccountID, undefined);
	}
	// Each person's own first, then the company account.
	{
		const writes = [];
		const run = await setup(context, { service: { save: failing(writes) } });
		await run.view.accountReady('flow');
		assert.equal(writes.length, 1);
		run.view.setMode('company');
		run.view.accountChanged();
		assert.equal(run.view.state.saveError, '', 'the change clears the retry at once');
		assert.equal(run.view.state.toolsFor, '');
		await run.view.retry();
		assert.equal(writes.length, 1, 'no personal save while บัญชีกลาง is chosen');
	}
	const source = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
	assert.equal(source.match(/bind:group=\{accountMode\} onchange=\{accountChanged\}/g)?.length, 2, 'both choices clear what was read');
});

test('Codex W0 review 2 (NOTE): a retry after a conflict whose newer program holds writes opens the tools review instead of saving', async (context) => {
	let attempt = 0;
	const writes = [];
	const newer = { id: 'saved-1', name: 'FlowAccount (2)', description: '', mcpID: 'flow', enabled: true, toolNames: ['list', 'create'], reviewedTools: true, reviewedReadOnly: false, version: 2 };
	const run = await setup(context, {
		service: {
			save: async (input, id) => {
				attempt++;
				writes.push({ input, id });
				if (attempt === 1) return { ...input, id: 'saved-1', version: 1 };
				const error = new Error('conflict');
				error.status = 409;
				throw error;
			}
		}
	});
	await run.view.accountReady('flow');
	assert.equal(writes.length, 1);
	// Back on the connect page: someone else saved a version with a write tool; this tab's save is refused.
	run.view.setConnections([{ id: 'old', name: 'FlowAccount', mcpID: 'x' }, newer]);
	await run.view.save(true);
	assert.equal(writes.length, 2);
	assert.deepEqual(run.view.state.selected, ['list', 'create'], 'the newest program is shown');
	assert.ok(run.view.state.saveError);
	run.navigations.length = 0;
	await run.view.retry();
	assert.equal(writes.length, 2, 'no silent save of a selection with a write');
	assert.deepEqual(run.navigations, ['/app?view=add-program&source=flow&step=tools'], 'the manager reviews what AI may do first');
});
