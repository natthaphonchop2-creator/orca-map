import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the component's actual reactive script.
import { effect_root, flush, untrack } from 'svelte/internal/client';

const require = createRequire(import.meta.url);
const component = await readFile(new URL('./WorkspaceWizard.svelte', import.meta.url), 'utf8');
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { connectionReady } = await import(moduleURL(stripTypeScriptTypes(
	await readFile(new URL('../../orca/activation.ts', import.meta.url), 'utf8')
)));
const { unavailableGatewayTools } = await import(moduleURL(stripTypeScriptTypes(
	await readFile(new URL('../../orca/gateway-tool-selection.ts', import.meta.url), 'utf8')
)));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(`
export function harness(testProps, connectionReady, unavailableGatewayTools, OrcaService, t, orcaError, memberName, tick, untrack, window) {
	${script}
	return {
		move, save, selectConnection, selectAllApprovedTools, toggleMyMembership, removeUnavailableTool, validation,
		toggleTool(name) { toolNames = toggle(toolNames, name); },
		confirm() { reviewed = true; },
		searchTools(value) { toolQuery = value; },
		customizeTools() { customToolsOpen = true; },
		replaceConnection(value) { data = { ...data, connections: [value] }; },
		get state() { return { step, flowSteps, toolsOnly, connectionID, toolQuery, customToolsOpen, eligibleTools, allApprovedSelected, unavailableTools, toolNames, visibleTools, memberIDs, unitIDs, dailyLimit, status, reviewed, error }; }
	};
}`, { filename: 'workspace-wizard-test.svelte.js', generate: 'client' }).js.code
	.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));

const connection = {
	id: 'server-one', name: 'Source', enabled: true, reviewedTools: true,
	toolNames: ['read', 'control'],
	tools: [{ name: 'read', description: 'Read records' }, { name: 'control', description: 'Control tool' }]
};
const existing = {
	id: 'gateway-one', name: 'Gateway', description: 'Existing purpose', connectionID: connection.id,
	toolNames: ['read', 'revoked'], memberIDs: ['member-one'], unitIDs: ['department-one'],
	dailyLimit: 27, status: 'active', version: 9
};
const bootstrap = {
	connections: [connection], members: [{ id: 'member-one', email: 'member@example.test' }],
	units: [{ id: 'department-one', name: 'Department' }], currentUserID: 'member-one', canManage: true
};

function setup(context, overrides = {}) {
	const writes = [];
	const saved = [];
	let view;
	const stop = effect_root(() => {
		view = harness({
			data: bootstrap,
			existing, initialStep: 'tools',
			onsaved: async (hub) => saved.push(hub), onreload: async () => {}, ...overrides
		}, connectionReady, unavailableGatewayTools,
			{ hub: async (input, id) => { writes.push({ input, id }); return { ...input, id }; } },
			(_th, en) => en, (error) => error.message, (member) => member.email,
			async () => {}, untrack, { scrollTo() {} });
	});
	context.after(stop);
	flush();
	return { view, writes, saved };
}

test('tool editing exposes revoked selections despite search and requires explicit removal', async (context) => {
	const { view, writes } = setup(context);
	assert.equal(view.state.step, 2);
	assert.deepEqual(view.state.flowSteps, [2, 4]);
	assert.deepEqual(view.state.toolNames, ['read', 'revoked']);
	assert.deepEqual(view.state.unavailableTools, ['revoked']);
	view.searchTools('control');
	assert.deepEqual(view.state.visibleTools.map((tool) => tool.name), ['control']);
	assert.deepEqual(view.state.unavailableTools, ['revoked']);
	await view.move(4);
	assert.equal(view.state.step, 2);
	assert.match(view.state.error, /Remove tools/);
	view.confirm();
	await view.save();
	assert.equal(writes.length, 0);
	view.removeUnavailableTool('read');
	assert.deepEqual(view.state.toolNames, ['read', 'revoked']);
	view.removeUnavailableTool('revoked');
	assert.deepEqual(view.state.toolNames, ['read']);
	assert.equal(view.state.reviewed, false);
	assert.deepEqual(view.state.unavailableTools, []);
	await view.move(4);
	assert.equal(view.state.step, 4);
	await view.save();
	assert.equal(writes.length, 0, 'saving still requires explicit review');
	view.confirm();
	await view.save();
	assert.equal(writes.length, 1);
});

test('Tools to Review saves only the selected tool change and preserves the existing policy version', async (context) => {
	const { view, writes, saved } = setup(context);
	view.removeUnavailableTool('revoked');
	await view.move(3);
	assert.equal(view.state.step, 2, 'the tool-only flow cannot enter the members step');
	view.toggleMyMembership();
	assert.deepEqual(view.state.memberIDs, ['member-one']);
	await view.move(4);
	view.confirm();
	await view.save();
	assert.deepEqual(writes, [{
		id: 'gateway-one',
		input: {
			name: existing.name, description: existing.description, connectionID: existing.connectionID,
			toolNames: ['read'], memberIDs: existing.memberIDs, unitIDs: existing.unitIDs,
			dailyLimit: existing.dailyLimit, status: existing.status, version: existing.version
		}
	}]);
	assert.equal(saved.length, 1);
});

test('new server tools are never granted automatically and live revocations invalidate review', async (context) => {
	const { view, writes } = setup(context, { existing: { ...existing, toolNames: ['read'] } });
	await view.move(4);
	view.confirm();
	view.replaceConnection({ ...connection, toolNames: ['control', 'new-tool'], tools: [{ name: 'control' }, { name: 'new-tool' }] });
	assert.deepEqual(view.state.toolNames, ['read']);
	assert.deepEqual(view.state.unavailableTools, ['read']);
	await view.save();
	assert.equal(writes.length, 0);
	assert.match(view.state.error, /Remove tools/);
	await view.move(2);
	view.removeUnavailableTool('read');
	assert.deepEqual(view.state.toolNames, []);
	await view.move(4);
	assert.match(view.state.error, /at least one tool/);
	view.toggleTool('control');
	await view.move(4);
	view.confirm();
	await view.save();
	assert.deepEqual(writes[0].input.toolNames, ['control']);
});

test('a missing tool definition is also visible for explicit removal', () => {
	assert.deepEqual(unavailableGatewayTools({ toolNames: ['read', 'missing'], tools: [{ name: 'read' }] }, ['read', 'missing', 'revoked']), ['missing', 'revoked']);
	assert.deepEqual(unavailableGatewayTools(undefined, ['read']), ['read']);
});

test('normal create and edit flows keep all four steps and a direct-tools hint does not skip new setup', (context) => {
	const normal = setup(context, { initialStep: undefined }).view;
	assert.equal(normal.state.step, 1);
	assert.deepEqual(normal.state.flowSteps, [1, 2, 3, 4]);
	const fresh = setup(context, { existing: undefined }).view;
	assert.equal(fresh.state.step, 1);
	assert.equal(fresh.state.toolsOnly, false);
	assert.deepEqual(fresh.state.toolNames, []);
});

test('loading an existing subset or choosing a new source never grants all approved tools automatically', (context) => {
	const subset = setup(context, { existing: { ...existing, toolNames: ['control'] } }).view;
	assert.deepEqual(subset.state.toolNames, ['control']);
	assert.equal(subset.state.customToolsOpen, false);
	assert.equal(subset.state.allApprovedSelected, false);
	const fresh = setup(context, { existing: undefined, initialConnectionID: connection.id }).view;
	assert.equal(fresh.state.connectionID, connection.id);
	assert.deepEqual(fresh.state.toolNames, []);
	assert.equal(fresh.state.customToolsOpen, false);
	fresh.selectConnection(connection.id);
	assert.deepEqual(fresh.state.toolNames, []);
});

test('explicit bulk selection uses the complete approved inventory despite search and retains revoked selections', (context) => {
	const source = {
		...connection,
		tools: [...connection.tools, { name: 'unapproved', description: 'Not allowed by this server' }]
	};
	const { view } = setup(context, { data: { ...bootstrap, connections: [source] } });
	view.searchTools('control');
	assert.deepEqual(view.state.visibleTools.map((tool) => tool.name), ['control']);
	view.confirm();
	view.selectAllApprovedTools();
	assert.deepEqual([...view.state.toolNames].sort(), ['control', 'read', 'revoked']);
	assert.equal(view.state.allApprovedSelected, true);
	assert.deepEqual(view.state.unavailableTools, ['revoked'], 'bulk selection does not silently remove a revoked selection');
	assert.equal(view.state.reviewed, false);
	assert.equal(view.state.customToolsOpen, false);
	assert.deepEqual(view.state.visibleTools.map((tool) => tool.name), ['control']);
});

test('read-only bulk selection respects the Server-reviewed allowlist', (context) => {
	const source = {
		...connection, reviewedTools: false, reviewedReadOnly: true,
		toolNames: ['get-record', 'list-records'],
		tools: [{ name: 'get-record' }, { name: 'list-records' }, { name: 'delete-record' }]
	};
	const { view } = setup(context, {
		data: { ...bootstrap, connections: [source] }, existing: { ...existing, toolNames: [] }
	});
	view.searchTools('get-record');
	view.selectAllApprovedTools();
	assert.deepEqual(view.state.toolNames, ['get-record', 'list-records']);
	assert.equal(view.state.toolNames.includes('delete-record'), false);
});

test('a custom deselection after bulk selection requires review and saves only the remaining subset', async (context) => {
	const { view, writes } = setup(context, { existing: { ...existing, toolNames: ['read'] } });
	view.selectAllApprovedTools();
	assert.deepEqual(view.state.toolNames, ['read', 'control']);
	view.customizeTools();
	view.confirm();
	view.toggleTool('control');
	assert.deepEqual(view.state.toolNames, ['read']);
	assert.equal(view.state.allApprovedSelected, false);
	assert.equal(view.state.reviewed, false);
	await view.move(4);
	await view.save();
	assert.equal(writes.length, 0);
	view.confirm();
	await view.save();
	assert.deepEqual(writes[0].input.toolNames, ['read']);
	assert.equal(writes[0].input.version, existing.version);
});

test('switching sources resets bulk selection, search and review without selecting the new source tools', (context) => {
	const another = { ...connection, id: 'server-two', name: 'Another source', toolNames: ['other'], tools: [{ name: 'other' }] };
	const { view } = setup(context, {
		initialStep: undefined, existing: { ...existing, toolNames: ['read'] },
		data: { ...bootstrap, connections: [connection, another] }
	});
	view.selectAllApprovedTools();
	view.customizeTools();
	view.searchTools('control');
	view.confirm();
	view.selectConnection(another.id);
	assert.equal(view.state.connectionID, another.id);
	assert.deepEqual(view.state.toolNames, []);
	assert.equal(view.state.toolQuery, '');
	assert.equal(view.state.customToolsOpen, false);
	assert.equal(view.state.reviewed, false);
	assert.deepEqual(view.state.visibleTools.map((tool) => tool.name), ['other']);
	view.selectAllApprovedTools();
	assert.deepEqual(view.state.toolNames, ['other']);
});

test('bulk selection is a no-op when no tools are eligible or all approved tools are already selected', (context) => {
	const complete = setup(context, { existing: { ...existing, toolNames: [...connection.toolNames] } }).view;
	assert.equal(complete.state.allApprovedSelected, true);
	complete.confirm();
	complete.selectAllApprovedTools();
	assert.deepEqual(complete.state.toolNames, ['read', 'control']);
	assert.equal(complete.state.reviewed, true);
	const empty = setup(context, {
		existing: { ...existing, toolNames: [] },
		data: { ...bootstrap, connections: [{ ...connection, toolNames: [], tools: [] }] }
	}).view;
	assert.deepEqual(empty.state.eligibleTools, []);
	assert.equal(empty.state.allApprovedSelected, false);
	empty.confirm();
	empty.selectAllApprovedTools();
	assert.deepEqual(empty.state.toolNames, []);
	assert.equal(empty.state.reviewed, true);
});

test('a disabled, unreviewed or incomplete Server cannot expand the Gateway selection', (context) => {
	for (const change of [
		{ enabled: false },
		{ reviewedTools: false },
		{ tools: [{ name: 'read' }] }
	]) {
		const { view } = setup(context, {
			existing: { ...existing, toolNames: ['read'] },
			data: { ...bootstrap, connections: [{ ...connection, ...change }] }
		});
		assert.deepEqual(view.state.eligibleTools, []);
		view.selectAllApprovedTools();
		assert.deepEqual(view.state.toolNames, ['read']);
	}
});

test('the wizard and Gateway detail compile after adding the tool editing path', async () => {
	for (const file of ['WorkspaceWizard.svelte', 'WorkspaceDetail.svelte']) {
		const result = compile(await readFile(new URL(`./${file}`, import.meta.url), 'utf8'), { filename: file, generate: 'client' });
		assert.deepEqual(result.warnings, []);
	}
});
