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
const readTS = async (name) =>
	stripTypeScriptTypes(await readFile(new URL(`../../orca/${name}.ts`, import.meta.url), 'utf8'));
const sourcesURL = moduleURL(await readTS('gateway-sources'));
const { gatewaySources } = await import(sourcesURL);
const { connectionReady } = await import(
	moduleURL(
		(await readTS('activation')).replace(/(['"])\.\/gateway-sources(?:\.ts)?\1/, JSON.stringify(sourcesURL))
	)
);
const { unavailableGatewayTools } = await import(moduleURL(await readTS('gateway-tool-selection')));
const { matchesToolSearch, toolPresentation } = await import(
	moduleURL(await readTS('tool-presentation'))
);
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(
	`
export function harness(testProps, connectionReady, unavailableGatewayTools, gatewaySources, matchesToolSearch, toolPresentation, orcaLocale, OrcaService, t, orcaError, memberName, tick, untrack, window) {
	${script}
	return {
		move, save, selectConnection, selectAllApprovedTools, toggleMyMembership, removeUnavailableTool, validation, toggleSourceTool, toggleCustomization,
		confirm() { reviewed = true; },
		setName(value) { name = value; reviewed = false; },
		searchTools(value) { toolQuery = value; },
		replaceConnections(values) { data = { ...data, connections: values }; },
		replaceExisting(value) { existing = value; },
		get state() { return { step, flowSteps, toolsOnly, sources, selectedConnectionIDs, selectedToolCount, sourceGroups, sourceIssue, missingSources, toolQuery, customToolsOpen, memberIDs, unitIDs, dailyLimit, status, reviewed, error }; }
	};
}`,
	{ filename: 'workspace-wizard-test.svelte.js', generate: 'client' }
).js.code.replaceAll(
	'svelte/internal/client',
	pathToFileURL(require.resolve('svelte/internal/client')).href
);
const { harness } = await import(moduleURL(compiled));

const connection = {
	id: 'server-one',
	name: 'Drive',
	enabled: true,
	reviewedTools: true,
	toolNames: ['read', 'control'],
	tools: [
		{ name: 'read', description: 'Read records' },
		{ name: 'control', description: 'Control tool' }
	]
};
const another = {
	...connection,
	id: 'server-two',
	name: 'Accounts',
	toolNames: ['read', 'list_files'],
	tools: [
		{ name: 'read', title: 'Read account summary' },
		{ name: 'list_files', description: 'Files in the source account' },
		{ name: 'unapproved' }
	]
};
const existing = {
	id: 'gateway-one',
	name: 'Gateway',
	description: 'Existing purpose',
	connectionID: connection.id,
	toolNames: ['read', 'revoked'],
	memberIDs: ['member-one'],
	unitIDs: ['department-one'],
	dailyLimit: 27,
	status: 'active',
	version: 9
};
const bootstrap = {
	connections: [connection, another],
	members: [{ id: 'member-one', email: 'member@example.test' }],
	units: [{ id: 'department-one', name: 'Department' }],
	currentUserID: 'member-one',
	canManage: true
};

function setup(context, overrides = {}) {
	const writes = [];
	const saved = [];
	let view;
	const stop = effect_root(() => {
		view = harness(
			{
				data: bootstrap,
				existing,
				initialStep: 'tools',
				onsaved: async (hub) => saved.push(hub),
				onreload: async () => {},
				...overrides
			},
			connectionReady,
			unavailableGatewayTools,
			gatewaySources,
			matchesToolSearch,
			toolPresentation,
			{ value: 'en' },
			{
				hub: async (input, id) => {
					writes.push({ input, id });
					return { ...input, id };
				}
			},
			(_th, en) => en,
			(error) => error.message,
			(member) => member.email,
			async () => {},
			untrack,
			{ scrollTo() {} }
		);
	});
	context.after(stop);
	flush();
	return { view, writes, saved };
}
const group = (view, id = connection.id) =>
	view.state.sourceGroups.find((source) => source.connectionID === id);

test('checking multiple Servers snapshots their currently approved tools without changing other selections', (context) => {
	const { view } = setup(context, {
		existing: undefined,
		initialStep: undefined
	});
	assert.deepEqual(view.state.sources, []);
	view.selectConnection(connection.id);
	view.toggleSourceTool(connection.id, 'control');
	view.confirm();
	view.selectConnection(another.id);
	assert.deepEqual(view.state.sources, [
		{ connectionID: connection.id, toolNames: ['read'] },
		{ connectionID: another.id, toolNames: ['read', 'list_files'] }
	]);
	assert.equal(
		view.state.selectedToolCount,
		3,
		'same-named tools in different Servers remain distinct'
	);
	assert.equal(view.state.reviewed, false);
	assert.equal(group(view, another.id).toolNames.includes('unapproved'), false);
	view.selectConnection(connection.id);
	assert.deepEqual(view.state.sources, [
		{ connectionID: another.id, toolNames: ['read', 'list_files'] }
	]);
	assert.deepEqual(
		connection.toolNames,
		['read', 'control'],
		'selection never mutates source inventory'
	);
});

test('a Gateway caps sources at twenty while allowing selected sources to be removed', (context) => {
	const connections = Array.from({ length: 21 }, (_, index) => ({
		...connection,
		id: `server-${index}`,
		name: `Source ${index}`
	}));
	const { view } = setup(context, {
		existing: undefined,
		initialStep: undefined,
		data: { ...bootstrap, connections }
	});
	connections.forEach((source) => view.selectConnection(source.id));
	assert.equal(view.state.sources.length, 20);
	assert.match(view.state.error, /up to 20 sources/);
	view.selectConnection(connections[0].id);
	view.selectConnection(connections[20].id);
	assert.equal(view.state.sources.length, 20);
	assert.equal(view.state.selectedConnectionIDs.includes(connections[20].id), true);
});

test('new Gateway source-link defaults are a snapshot; existing subsets are never expanded', (context) => {
	const fresh = setup(context, {
		existing: undefined,
		initialConnectionID: connection.id
	}).view;
	assert.equal(fresh.state.step, 1);
	assert.deepEqual(fresh.state.sources, [
		{ connectionID: connection.id, toolNames: ['read', 'control'] }
	]);
	fresh.replaceConnections([
		{
			...connection,
			toolNames: [...connection.toolNames, 'new-tool'],
			tools: [...connection.tools, { name: 'new-tool' }]
		}
	]);
	assert.deepEqual(group(fresh).toolNames, ['read', 'control']);
	assert.equal(group(fresh).allApprovedSelected, false);
	const subset = setup(context, {
		existing: { ...existing, toolNames: ['control'] }
	}).view;
	assert.deepEqual(group(subset).toolNames, ['control']);
	assert.deepEqual(subset.state.customToolsOpen, []);
});

test('legacy tool editing exposes revoked selections despite search and requires explicit removal', async (context) => {
	const { view, writes } = setup(context);
	assert.equal(view.state.step, 2);
	assert.deepEqual(view.state.flowSteps, [2, 4]);
	assert.deepEqual(group(view).toolNames, ['read', 'revoked']);
	view.searchTools('control');
	assert.deepEqual(
		group(view).visibleTools.map((tool) => tool.name),
		['control']
	);
	assert.deepEqual(group(view).unavailableTools, ['revoked']);
	await view.move(4);
	assert.equal(view.state.step, 2);
	assert.match(view.state.error, /Remove tools/);
	view.confirm();
	await view.save();
	assert.equal(writes.length, 0);
	view.removeUnavailableTool(connection.id, 'read');
	assert.deepEqual(group(view).toolNames, ['read', 'revoked']);
	view.removeUnavailableTool(connection.id, 'revoked');
	assert.deepEqual(group(view).toolNames, ['read']);
	assert.equal(view.state.reviewed, false);
	await view.move(4);
	assert.equal(view.state.step, 4);
	await view.save();
	assert.equal(writes.length, 0, 'saving still requires explicit review');
	view.confirm();
	await view.save();
	assert.equal(writes.length, 1);
});

test('multi-source tool-only editing preserves members, policy, source identities and optimistic version', async (context) => {
	const sources = [
		{ connectionID: connection.id, toolNames: ['read', 'control'] },
		{ connectionID: another.id, toolNames: ['read', 'list_files'] }
	];
	const old = { ...existing, sources };
	const { view, writes, saved } = setup(context, { existing: old });
	view.toggleSourceTool(another.id, 'read');
	view.selectConnection(connection.id);
	view.toggleMyMembership();
	await view.move(3);
	assert.equal(view.state.step, 2);
	assert.deepEqual(view.state.memberIDs, old.memberIDs);
	assert.deepEqual(view.state.selectedConnectionIDs, [connection.id, another.id]);
	view.replaceExisting({ ...old, version: 10 });
	await view.move(4);
	view.confirm();
	await view.save();
	assert.deepEqual(writes, [
		{
			id: 'gateway-one',
			input: {
				name: old.name,
				description: old.description,
				sources: [
					{ connectionID: connection.id, toolNames: ['read', 'control'] },
					{ connectionID: another.id, toolNames: ['list_files'] }
				],
				connectionID: connection.id,
				toolNames: ['read', 'control'],
				memberIDs: old.memberIDs,
				unitIDs: old.unitIDs,
				dailyLimit: old.dailyLimit,
				status: old.status,
				version: 9
			}
		}
	]);
	assert.equal(saved.length, 1);
	assert.deepEqual(sources[1].toolNames, ['read', 'list_files'], 'original hub remains immutable');
});

test('new multi-source Gateway saves both inventories and projects only the first into legacy fields', async (context) => {
	const { view, writes } = setup(context, {
		existing: undefined,
		initialStep: undefined
	});
	view.setName('Operations');
	view.selectConnection(connection.id);
	view.selectConnection(another.id);
	view.toggleMyMembership();
	await view.move(2);
	await view.move(3);
	await view.move(4);
	view.confirm();
	await view.save();
	assert.equal(writes.length, 1);
	assert.deepEqual(writes[0].input.sources, [
		{ connectionID: connection.id, toolNames: ['read', 'control'] },
		{ connectionID: another.id, toolNames: ['read', 'list_files'] }
	]);
	assert.deepEqual(writes[0].input.toolNames, ['read', 'control']);
	assert.equal(writes[0].input.connectionID, connection.id);
});

test('live revocation in any source blocks save without silently removing it or adding future tools', async (context) => {
	const { view, writes } = setup(context, {
		existing: {
			...existing,
			sources: [
				{ connectionID: connection.id, toolNames: ['read'] },
				{ connectionID: another.id, toolNames: ['read'] }
			]
		}
	});
	await view.move(4);
	view.confirm();
	view.replaceConnections([
		connection,
		{
			...another,
			toolNames: ['list_files', 'new-tool'],
			tools: [{ name: 'list_files' }, { name: 'new-tool' }]
		}
	]);
	assert.deepEqual(group(view, another.id).toolNames, ['read']);
	assert.deepEqual(group(view, another.id).unavailableTools, ['read']);
	await view.save();
	assert.equal(writes.length, 0);
	assert.match(view.state.error, /Remove tools/);
	view.removeUnavailableTool(another.id, 'read');
	await view.save();
	assert.match(view.state.error, /at least one tool from each source/);
	view.toggleSourceTool(another.id, 'list_files');
	view.confirm();
	await view.save();
	assert.deepEqual(writes[0].input.sources[1].toolNames, ['list_files']);
});

test('bulk selection is scoped to one source, ignores search and retains revoked selections', (context) => {
	const { view } = setup(context, {
		existing: {
			...existing,
			sources: [
				{ connectionID: connection.id, toolNames: ['read', 'revoked'] },
				{ connectionID: another.id, toolNames: ['read'] }
			]
		}
	});
	view.searchTools('control');
	view.confirm();
	view.selectAllApprovedTools(connection.id);
	assert.deepEqual(group(view).toolNames, ['read', 'revoked', 'control']);
	assert.deepEqual(group(view, another.id).toolNames, ['read']);
	assert.deepEqual(group(view).unavailableTools, ['revoked']);
	assert.equal(view.state.reviewed, false);
	assert.deepEqual(
		group(view).visibleTools.map((tool) => tool.name),
		['control']
	);
	view.removeUnavailableTool(connection.id, 'revoked');
	view.toggleSourceTool(connection.id, 'control');
	assert.deepEqual(group(view).toolNames, ['read']);
});

test('read-only source selection excludes unapproved write tools', (context) => {
	const readOnly = {
		...connection,
		reviewedTools: false,
		reviewedReadOnly: true,
		toolNames: ['get-record', 'list-records'],
		tools: [{ name: 'get-record' }, { name: 'list-records' }, { name: 'delete-record' }]
	};
	const { view } = setup(context, {
		existing: undefined,
		data: { ...bootstrap, connections: [readOnly] }
	});
	view.selectConnection(connection.id);
	assert.deepEqual(group(view).toolNames, ['get-record', 'list-records']);
	view.toggleSourceTool(connection.id, 'delete-record');
	assert.deepEqual(group(view).toolNames, ['get-record', 'list-records']);
});

test('disabled, unreviewed and incomplete sources stay selected but cannot expand grants or save', async (context) => {
	for (const change of [
		{ enabled: false },
		{ reviewedTools: false },
		{ tools: [{ name: 'read' }] },
		{ archivedAt: '2026-09-19' }
	]) {
		const { view, writes } = setup(context, {
			initialStep: undefined,
			existing: {
				...existing,
				sources: [
					{ connectionID: connection.id, toolNames: ['read'] },
					{ connectionID: another.id, toolNames: ['read'] }
				]
			},
			data: {
				...bootstrap,
				connections: [{ ...connection, ...change }, another]
			}
		});
		assert.deepEqual(group(view).eligibleTools, []);
		view.selectAllApprovedTools(connection.id);
		assert.deepEqual(group(view).toolNames, ['read']);
		view.confirm();
		await view.save();
		assert.equal(writes.length, 0);
		view.selectConnection(connection.id);
		assert.deepEqual(view.state.selectedConnectionIDs, [another.id]);
		assert.equal(view.validation(3), '');
		view.selectConnection(connection.id);
		assert.deepEqual(
			view.state.selectedConnectionIDs,
			[another.id],
			'disabled source cannot be added back'
		);
	}
});

test('a deleted or missing source remains visible until explicitly removed', (context) => {
	const { view } = setup(context, {
		initialStep: undefined,
		data: { ...bootstrap, connections: [another] },
		existing: {
			...existing,
			sources: [
				{ connectionID: connection.id, toolNames: ['read'] },
				{ connectionID: another.id, toolNames: ['read'] }
			]
		}
	});
	assert.deepEqual(view.state.missingSources, [
		{ connectionID: connection.id, toolNames: ['read'] }
	]);
	assert.match(view.validation(1), /not found/);
	view.selectConnection(connection.id);
	assert.deepEqual(view.state.missingSources, []);
	assert.equal(view.validation(3), '');
});

test('explicit empty multi-source data does not fall back to stale legacy fields', (context) => {
	const { view } = setup(context, {
		initialStep: undefined,
		existing: { ...existing, sources: [] }
	});
	assert.deepEqual(view.state.sources, []);
	assert.match(view.validation(1), /select at least one enabled source/);
});

test('tool search finds friendly titles, Thai action labels and exact technical identifiers', (context) => {
	const { view } = setup(context, {
		existing: {
			...existing,
			sources: [{ connectionID: another.id, toolNames: ['read', 'list_files'] }]
		}
	});
	view.searchTools('account summary');
	assert.deepEqual(
		group(view, another.id).visibleTools.map((tool) => tool.name),
		['read']
	);
	view.searchTools('ดูรายการไฟล์');
	assert.deepEqual(
		group(view, another.id).visibleTools.map((tool) => tool.name),
		['list_files']
	);
	view.searchTools('list_files');
	assert.deepEqual(
		group(view, another.id).visibleTools.map((tool) => tool.name),
		['list_files']
	);
});

test('missing definitions require explicit removal and normal flows retain all steps', (context) => {
	assert.deepEqual(
		unavailableGatewayTools({ toolNames: ['read', 'missing'], tools: [{ name: 'read' }] }, [
			'read',
			'missing',
			'revoked'
		]),
		['missing', 'revoked']
	);
	assert.deepEqual(unavailableGatewayTools(undefined, ['read']), ['read']);
	const normal = setup(context, { initialStep: undefined }).view;
	assert.deepEqual(normal.state.flowSteps, [1, 2, 3, 4]);
	assert.equal(normal.state.step, 1);
	const fresh = setup(context, { existing: undefined }).view;
	assert.equal(fresh.state.toolsOnly, false);
	assert.deepEqual(fresh.state.flowSteps, [1, 2, 3, 4]);
});

test('the multi-source wizard compiles without accessibility warnings', () => {
	const result = compile(component, {
		filename: 'WorkspaceWizard.svelte',
		generate: 'client'
	});
	assert.deepEqual(result.warnings, []);
});
