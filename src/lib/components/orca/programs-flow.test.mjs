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
const component = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
	.replace('$props()', '$state(testProps)');
const names = [
	'catalogSource', 'currentCompany', 'localeHref', 't', 'orcaError', 'ProgramService', 'onDestroy', 'onMount', 'untrack',
	...Object.keys(catalogHelpers), ...Object.keys(tools)
];
const require = createRequire(import.meta.url);
const compiled = compileModule(
	`export function harness(testProps, deps) {
		const { ${[...new Set(names)].join(', ')} } = deps;
		${script}
		return {
			discover, accountReady, save, pick, change, loadCatalog,
			set(input) {
				if (input.selected !== undefined) selected = input.selected;
				if (input.name !== undefined) name = input.name;
				if (input.note !== undefined) note = input.note;
				if (input.preset !== undefined) preset = input.preset;
			},
			get state() { return { step, sourceID, tools, toolsFor, discovering, discoverError, selected, preset, name, note, saving, saveError, saved, sources }; }
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
				...catalogHelpers, ...tools, catalogSource, untrack,
				currentCompany: () => 'default', localeHref: (href) => href, t: (th) => th, orcaError: (cause) => cause.message,
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
	assert.equal(storage.store.size, 0, 'the draft is cleared after saving');
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
