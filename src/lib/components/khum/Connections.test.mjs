import { importTypeScript, typescriptModuleURL } from '../../orca/test-import.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the real component script with its matching Svelte runtime.
import { effect_root, flush, untrack } from 'svelte/internal/client';

const component = await readFile(new URL('./Connections.svelte', import.meta.url), 'utf8');
const { filterCatalog, catalogSourceDisplayName } = await importTypeScript(new URL('../../orca/catalog.ts', import.meta.url));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const require = createRequire(import.meta.url);
const compiled = compileModule(
	`export function harness(testProps, OrcaService, onMount, onDestroy, tick, t, orcaError, window, filterCatalog, catalogSourceDisplayName, untrack) {
		${script}
		return {
			openForm, closeForm, toggleEnabled, applyInitialSelection, sourceChanged, sourceAccountReady, sourceStateChanged, discover, save,
			setCandidates(items) { candidates = items; },
			setManager(value) { data = { ...data, canManage: value }; },
			select(id) { mcpID = id; sourceChanged(); },
			fill(input) {
				if (input.name !== undefined) name = input.name;
				if (input.scope !== undefined) scopeNote = input.scope;
				if (input.tools !== undefined) toolNames = input.tools;
				if (input.reviewed !== undefined) reviewedTools = input.reviewed;
				if (input.readOnly !== undefined) { readOnly = input.readOnly; reviewedTools = false; }
				if (input.step !== undefined) step = input.step;
			},
			get state() { return { step, mcpID, tools, discoveredID, toolNames, readOnly, reviewedTools, toolsReviewed, formOpen, sourceReady, setupBusy, discovering, error, name, selectableCandidates, sourceLabel }; }
		};
	}`,
	{ filename: 'connections-test.svelte.js', generate: 'client' }
).js.code.replaceAll(
	'svelte/internal/client',
	pathToFileURL(require.resolve('svelte/internal/client')).href
);
const { harness } = await import(
	'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);
function deferred() {
	let resolve, reject;
	const promise = new Promise((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}
async function setup(context, methods = {}, props = {}) {
	let view, teardown;
	let writes = [],
		refreshes = 0;
	const stop = effect_root(() => {
		view = harness(
			{
				data: { canManage: true, connections: [], hubs: [] },
				onchanged: async () => {
					refreshes++;
				},
				...props
			},
			{
				discover: async () => [{ name: 'search', description: 'Search documents' }],
				connection: async (payload, id) => {
					writes.push({ payload, id });
					return { ...payload, id: id ?? 'saved' };
				},
				...methods
			},
			() => {},
			(fn) => {
				teardown = fn;
			},
			async () => {},
			(_th, en) => en,
			(error) => error.message,
			{ scrollTo() {} },
			filterCatalog,
			catalogSourceDisplayName,
			untrack
		);
	});
	context.after(() => {
		teardown();
		stop();
	});
	view.setCandidates([
		{ id: 'a', name: 'Source A' },
		{ id: 'b', name: 'Source B' }
	]);
	await view.openForm();
	view.select('a');
	flush();
	return { view, writes, refreshes: () => refreshes };
}

test('discovery from an old source cannot advance or overwrite a new source', async (context) => {
	const pending = deferred();
	const { view } = await setup(context, {
		discover: async (id) => (id === 'a' ? pending.promise : [{ name: 'read-b' }])
	});
	const checkingA = view.sourceAccountReady('a');
	view.select('b');
	await view.sourceAccountReady('b');
	pending.resolve([{ name: 'private-a' }]);
	await checkingA;
	assert.equal(view.state.step, 2);
	assert.equal(view.state.discoveredID, 'b');
	assert.deepEqual(
		view.state.tools.map((tool) => tool.name),
		['read-b']
	);
	assert.equal(view.state.discovering, false);
});

test('late failure after closing the form stays out of the connection list', async (context) => {
	const pending = deferred();
	const { view } = await setup(context, { discover: async () => pending.promise });
	const checking = view.sourceAccountReady('a');
	view.closeForm();
	pending.reject(new Error('old connection failed'));
	await checking;
	assert.equal(view.state.formOpen, false);
	assert.equal(view.state.error, '');
	assert.equal(view.state.discovering, false);
});

test('account callback advances while child is checking; loss of readiness invalidates review', async (context) => {
	const { view } = await setup(context);
	view.sourceStateChanged({ sourceID: 'a', busy: true, ready: false });
	await view.sourceAccountReady('a');
	assert.equal(view.state.step, 2);
	view.sourceStateChanged({ sourceID: 'a', busy: false, ready: true });
	view.fill({ tools: ['search'], reviewed: true, step: 3 });
	assert.equal(view.state.toolsReviewed, true);
	view.sourceStateChanged({ sourceID: 'b', busy: false, ready: false });
	assert.equal(view.state.step, 3);
	view.sourceStateChanged({ sourceID: 'a', busy: true, ready: false });
	assert.equal(view.state.step, 1);
	assert.equal(view.state.toolsReviewed, false);
	assert.equal(view.state.discoveredID, '');
});

test('saving requires the final step and explicit tool review, retaining edit version and disabled status', async (context) => {
	const { view, writes, refreshes } = await setup(context);
	await view.openForm({
		id: 'existing',
		mcpID: 'a',
		name: 'Finance documents',
		scopeNote: 'Finance account',
		enabled: false,
		toolNames: ['search'],
		version: 7
	});
	await view.sourceAccountReady('a');
	view.fill({ reviewed: true });
	await view.save();
	assert.equal(writes.length, 0);
	view.fill({ step: 3, reviewed: false });
	await view.save();
	assert.equal(writes.length, 0);
	view.fill({ reviewed: true });
	await view.save();
	assert.equal(writes.length, 1);
	assert.equal(writes[0].id, 'existing');
	assert.equal(writes[0].payload.version, 7);
	assert.equal(writes[0].payload.enabled, false);
	assert.equal(writes[0].payload.mcpID, 'a');
	assert.deepEqual(writes[0].payload.toolNames, ['search']);
	assert.equal(writes[0].payload.reviewedTools, true);
	assert.equal(writes[0].payload.reviewedReadOnly, false);
	assert.equal(refreshes(), 1);
	assert.equal(view.state.formOpen, false);
});

test('source change clears tool consent but retains a custom connection name', async (context) => {
	const { view, writes } = await setup(context);
	assert.equal(view.state.name, 'Source A');
	view.select('b');
	assert.equal(view.state.name, 'Source B');
	await view.sourceAccountReady('b');
	view.fill({
		name: 'Team account',
		scope: 'Team documents',
		tools: ['search'],
		reviewed: true,
		step: 3
	});
	view.select('a');
	await view.sourceAccountReady('b');
	await view.save();
	assert.equal(view.state.step, 1);
	assert.equal(view.state.name, 'Team account');
	assert.deepEqual(view.state.toolNames, []);
	assert.equal(view.state.toolsReviewed, false);
	assert.equal(writes.length, 0);
});

test('failed discovery is retryable and never silently selects tools', async (context) => {
	let attempts = 0;
	const { view } = await setup(context, {
		discover: async () => {
			if (++attempts === 1) throw new Error('source unavailable');
			return [{ name: 'search' }];
		}
	});
	await view.sourceAccountReady('a');
	assert.equal(view.state.step, 1);
	assert.equal(view.state.discoveredID, '');
	assert.equal(view.state.error, 'source unavailable');
	await view.discover();
	assert.equal(view.state.step, 2);
	assert.equal(view.state.error, '');
	assert.deepEqual(view.state.toolNames, []);
	assert.equal(view.state.reviewedTools, false);
});

test('editing retains the stored source instead of silently migrating an existing connection', async (context) => {
	const { view } = await setup(context);
	await view.openForm({
		id: 'existing',
		mcpID: 'a',
		name: 'Existing source',
		scopeNote: 'Account A',
		enabled: true,
		toolNames: ['search'],
		version: 2
	});
	view.select('b');
	assert.equal(view.state.mcpID, 'a');
	assert.equal(view.state.name, 'Existing source');
});

const googleCandidates = [
	{ id: 'legacy-drive', name: 'Google Drive', endpointHost: 'google-drive-mcp.obot.ai' },
	{ id: 'official-drive', name: 'Google Drive · ORCA', endpointHost: 'drivemcp.googleapis.com' },
	{ id: 'hotel-drive', name: 'Hotel Drive', endpointHost: 'files.hotel.invalid' }
];

test('new connections show one Google Drive choice and use its product name', async (context) => {
	const { view } = await setup(context);
	view.setCandidates(googleCandidates);
	await view.openForm();
	assert.deepEqual(
		view.state.selectableCandidates.map((source) => source.id),
		['official-drive', 'hotel-drive']
	);
	view.select('official-drive');
	assert.equal(view.state.name, 'Google Drive');
	assert.equal(view.state.sourceLabel, 'Google Drive');
});

test('an explicit legacy link and an edited legacy connection keep their original source', async (context) => {
	const discovered = [];
	const { view, writes } = await setup(
		context,
		{
			discover: async (id) => {
				discovered.push(id);
				return [{ name: 'read' }];
			}
		},
		{ initialSourceID: 'legacy-drive' }
	);
	view.setCandidates(googleCandidates);
	await view.applyInitialSelection();
	assert.equal(view.state.mcpID, 'legacy-drive');
	assert.equal(view.state.sourceLabel, 'Google Drive');
	assert.deepEqual(
		view.state.selectableCandidates.map((source) => source.id),
		['legacy-drive', 'hotel-drive']
	);
	await view.sourceAccountReady('legacy-drive');
	assert.deepEqual(discovered, ['legacy-drive']);
	assert.equal(writes.length, 0);
	await view.openForm({
		id: 'existing',
		mcpID: 'legacy-drive',
		name: 'Team archive',
		toolNames: ['read'],
		enabled: true,
		version: 4
	});
	view.select('official-drive');
	assert.equal(view.state.mcpID, 'legacy-drive');
	assert.equal(view.state.name, 'Team archive');
	assert.equal(view.state.selectableCandidates[0].id, 'legacy-drive');
});

test('management permission loss ignores discovery and releases pending state', async (context) => {
	const pending = deferred();
	const { view, writes } = await setup(context, { discover: async () => pending.promise });
	const checking = view.sourceAccountReady('a');
	view.setManager(false);
	pending.resolve([{ name: 'search' }]);
	await checking;
	assert.equal(view.state.discoveredID, '');
	assert.equal(view.state.step, 1);
	assert.equal(view.state.discovering, false);
	await view.save();
	assert.equal(writes.length, 0);
});

test('normal review saves explicitly selected write tools without claiming read-only', async (context) => {
	const { view, writes } = await setup(context, { discover: async () => [{ name: 'update_record' }, { name: 'delete_record' }] });
	await view.sourceAccountReady('a');
	view.fill({ name: 'Business system', scope: 'Connected account permissions', tools: ['update_record'], reviewed: true, step: 3 });
	await view.save();
	assert.equal(writes.length, 1);
	assert.equal(writes[0].payload.reviewedTools, true);
	assert.equal(writes[0].payload.reviewedReadOnly, false);
	assert.deepEqual(writes[0].payload.toolNames, ['update_record']);
});

test('editing and pausing preserve existing read-only mode until explicitly changed and reviewed', async (context) => {
	const { view, writes } = await setup(context);
	const existing = { id: 'read-only', mcpID: 'a', name: 'Documents', scopeNote: 'Documents account', description: '', enabled: true, reviewedReadOnly: true, toolNames: ['search'], version: 3 };
	await view.openForm(existing);
	await view.sourceAccountReady('a');
	assert.equal(view.state.readOnly, true);
	view.fill({ reviewed: true, step: 3 });
	await view.save();
	assert.equal(writes[0].payload.reviewedReadOnly, true);
	await view.toggleEnabled(existing);
	assert.equal(writes[1].payload.reviewedReadOnly, true);
	assert.equal(writes[1].payload.reviewedTools, false);
	assert.equal(writes[1].payload.enabled, false);
	await view.openForm(existing);
	await view.sourceAccountReady('a');
	view.fill({ reviewed: true, step: 3 });
	view.fill({ readOnly: false });
	await view.save();
	assert.equal(writes.length, 2);
	view.fill({ reviewed: true });
	await view.save();
	assert.equal(writes[2].payload.reviewedReadOnly, false);
	assert.equal(writes[2].payload.reviewedTools, true);
});

test('policy editing loads fresh tools directly and preserves selections, version and disabled state', async (context) => {
	const discovered = [];
	const { view, writes } = await setup(context, {
		discover: async (id) => {
			discovered.push(id);
			return [{ name: 'search' }, { name: 'new-tool' }];
		}
	}, { mode: 'policy' });
	await view.openForm({ id: 'existing', mcpID: 'a', name: 'Finance', description: 'Saved description', scopeNote: 'Finance account', toolNames: ['search'], reviewedReadOnly: true, enabled: false, version: 11 });
	assert.deepEqual(discovered, ['a']);
	assert.equal(view.state.step, 2);
	assert.equal(view.state.discoveredID, 'a');
	assert.deepEqual(view.state.toolNames, ['search']);
	assert.equal(view.state.readOnly, true);
	assert.equal(view.state.reviewedTools, false);
	view.fill({ step: 3 });
	await view.save();
	assert.equal(writes.length, 0);
	view.fill({ reviewed: true });
	await view.save();
	assert.deepEqual(writes[0], { id: 'existing', payload: { name: 'Finance', description: 'Saved description', mcpID: 'a', toolNames: ['search'], scopeNote: 'Finance account', reviewedTools: true, reviewedReadOnly: true, enabled: false, version: 11 } });
});

test('failed policy discovery stays in tools, preserves selection and cannot save until retry succeeds', async (context) => {
	let attempts = 0;
	const { view, writes } = await setup(context, {
		discover: async () => {
			if (++attempts === 1) throw new Error('source account needs attention');
			return [{ name: 'search' }];
		}
	}, { mode: 'policy' });
	await view.openForm({ id: 'existing', mcpID: 'a', name: 'Documents', scopeNote: 'Account', toolNames: ['search'], enabled: true, version: 3 });
	assert.equal(view.state.step, 2);
	assert.deepEqual(view.state.toolNames, ['search']);
	assert.equal(view.state.discoveredID, '');
	view.fill({ reviewed: true, step: 3 });
	await view.save();
	assert.equal(writes.length, 0);
	await view.discover();
	assert.equal(view.state.step, 2);
	assert.equal(view.state.reviewedTools, false);
	assert.deepEqual(view.state.toolNames, ['search']);
});

test('late policy discovery cannot replace a newly opened server or restore review consent', async (context) => {
	const pending = deferred();
	const { view } = await setup(context, {
		discover: async (id) => id === 'a' ? pending.promise : [{ name: 'read-b' }]
	}, { mode: 'policy' });
	const opening = view.openForm({ id: 'first', mcpID: 'a', name: 'A', toolNames: ['search'] });
	await Promise.resolve();
	await view.openForm({ id: 'second', mcpID: 'b', name: 'B', toolNames: ['read-b'] });
	pending.resolve([{ name: 'search' }]);
	await opening;
	assert.equal(view.state.discoveredID, 'b');
	assert.deepEqual(view.state.toolNames, ['read-b']);
	assert.deepEqual(view.state.tools.map((tool) => tool.name), ['read-b']);
	assert.equal(view.state.reviewedTools, false);
});

test('embedded connection creation completes in place with the saved record and waits for refresh', async (context) => {
  const completed = [];
  const busyEvents = [];
  const { view, writes, refreshes } = await setup(context, {}, {
    embedded: true,
    oncompleted: async (connection) => { completed.push(connection); },
    onbusychange: (value) => { busyEvents.push(value); }
  });
  await view.sourceAccountReady('a');
  flush();
  view.fill({ name: 'Finance account', scope: 'Finance', tools: ['search'], reviewed: true, step: 3 });
  await view.save();
  flush();
  assert.equal(writes.length, 1);
  assert.equal(refreshes(), 1);
  assert.equal(completed[0].id, 'saved');
  assert.equal(completed[0].mcpID, 'a');
  assert.equal(view.state.formOpen, true, 'the dialog remains mounted until its parent closes it');
  assert.equal(busyEvents.at(-1), false);
});

test('embedded completion retry does not create a second connection after a successful write', async (context) => {
  let completeAttempts = 0;
  const { view, writes, refreshes } = await setup(context, {}, {
    embedded: true,
    oncompleted: async () => {
      completeAttempts++;
      if (completeAttempts === 1) throw new Error('Temporary refresh failure');
    }
  });
  await view.sourceAccountReady('a');
  view.fill({ name: 'Finance account', scope: 'Finance', tools: ['search'], reviewed: true, step: 3 });
  await view.save();
  assert.match(view.state.error, /Temporary refresh failure/);
  await view.save();
  assert.equal(writes.length, 1);
  assert.equal(completeAttempts, 2);
  assert.equal(refreshes(), 2);
});
