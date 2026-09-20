import { importTypeScript } from '../../orca/test-import.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the component's actual reactive script.
import { effect_root, flush, untrack } from 'svelte/internal/client';

const require = createRequire(import.meta.url);
const component = await readFile(new URL('./WorkspaceDetail.svelte', import.meta.url), 'utf8');
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { personalKeyAvailable, workspaceToolingReady } = await importTypeScript(new URL('../../orca/activation.ts', import.meta.url));
const { gatewaySources, gatewayToolCount, gatewayHasMember, gatewayMemberIDs } = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const { matchesToolSearch, toolPresentation } = await importTypeScript(new URL('../../orca/tool-presentation.ts', import.meta.url));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(`
export function harness(testProps, OrcaService, personalKeyAvailable, workspaceToolingReady, t, orcaError, onMount, onDestroy, untrack, gatewaySources, gatewayToolCount, gatewayHasMember, gatewayMemberIDs, matchesToolSearch, toolPresentation, OrcaUserSourcesService) {
	const orcaLocale = $state({ value: 'en' });
	const page = $state({ url: new URL('https://orca.example.test/app?tab=connect') });
	${script}
	return {
		createKey, revokeKey, clearCreatedKey, changeStatus, loadUserSources, saveIdentity,
		setUserSource(value) { userSourceID = value; },
		nameKey(value) { keyName = value; },
		expiry(value) { expiryDays = value; },
		setSources(value, connections) { hub = { ...hub, sources: value }; data = { ...data, connections }; },
		reveal() { revealKey = true; },
		changeActor(id) { data = { ...data, currentUserID: id }; },
		changeHub(id) { hub = { ...hub, id }; },
		setMembership(direct, effective, teams = []) { hub = { ...hub, memberIDs: direct, effectiveMemberIDs: effective, accessUnitIDs: teams }; },
		changeTab(tab) { page.url = new URL('https://orca.example.test/app?tab=' + tab); },
		pause() { hub = { ...hub, status: 'paused' }; },
		archive() { hub = { ...hub, status: 'archived' }; },
		remove() { hub = { ...hub, status: 'deleted' }; },
		get state() { return { newKey, newKeyID, revealKey, keyError, archived, canConnect, activeTab, userSourceID, userSources, userSourcesError, identitySaved, selectedUserSource }; }
	};
}`, { filename: 'workspace-detail-test.svelte.js', generate: 'client' }).js.code
	.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));

function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

function setup(context, service = {}, hubOverrides = {}) {
	const revoked = [];
	const destroyCallbacks = [];
	let view;
	const stop = effect_root(() => {
		view = harness({
			data: {
				currentUserID: 'member-one', members: [], canManage: true,
				connections: [{ id: 'server-one', enabled: true, reviewedTools: true, toolNames: ['read'], tools: [{ name: 'read' }] }]
			},
			hub: { id: 'gateway-one', connectionID: 'server-one', status: 'active', toolNames: ['read'], memberIDs: ['member-one', 'member-two'], dailyLimit: 100, ...hubOverrides },
			onchanged: async () => {}
		}, {
			keys: async () => [],
			createKey: async () => ({ id: 22, key: 'synthetic-new-key' }),
			revokeKey: async (hubID, id) => { revoked.push({ hubID, id }); },
			...service
		}, personalKeyAvailable, workspaceToolingReady,
			(_th, en) => en, (error) => error.message, () => {},
			(callback) => destroyCallbacks.push(callback), untrack, gatewaySources, gatewayToolCount, gatewayHasMember, gatewayMemberIDs, matchesToolSearch, toolPresentation, { list: service.userSourcesList ?? (async () => ({ items: [] })) });
	});
	let destroyed = false;
	const destroy = () => {
		if (destroyed) return;
		destroyed = true;
		destroyCallbacks.forEach((callback) => callback());
		stop();
	};
	context.after(destroy);
	flush();
	view.nameKey('Test client');
	return { view, revoked, destroy };
}

test('revoking an older key preserves the newly created one-time secret and reveal state', async (context) => {
	const { view, revoked } = setup(context);
	await view.createKey();
	view.reveal();
	await view.revokeKey(11);
	assert.deepEqual(revoked, [{ hubID: 'gateway-one', id: 11 }]);
	assert.equal(view.state.newKey, 'synthetic-new-key');
	assert.equal(view.state.newKeyID, 22);
	assert.equal(view.state.revealKey, true);
	await view.revokeKey(22);
	assert.equal(view.state.newKey, '');
	assert.equal(view.state.newKeyID, undefined);
	assert.equal(view.state.revealKey, false);
});

test('a failed revocation keeps its still-active one-time secret available', async (context) => {
	const { view } = setup(context, { revokeKey: async () => { throw new Error('Revocation failed'); } });
	await view.createKey();
	view.reveal();
	await view.revokeKey(22);
	assert.equal(view.state.newKey, 'synthetic-new-key');
	assert.equal(view.state.newKeyID, 22);
	assert.equal(view.state.revealKey, true);
	assert.equal(view.state.keyError, 'Revocation failed');
});

for (const boundary of ['actor', 'hub', 'tab', 'paused', 'archived', 'deleted', 'dismiss', 'destroy']) {
	test(`${boundary} invalidation clears both the secret and its tracked ID`, async (context) => {
		const { view, destroy } = setup(context);
		await view.createKey();
		view.reveal();
		if (boundary === 'actor') view.changeActor('member-two');
		if (boundary === 'hub') view.changeHub('gateway-two');
		if (boundary === 'tab') view.changeTab('tools');
		if (boundary === 'paused') view.pause();
		if (boundary === 'archived') view.archive();
		if (boundary === 'deleted') view.remove();
		if (boundary === 'dismiss') view.clearCreatedKey();
		if (boundary === 'destroy') destroy();
		flush();
		assert.equal(view.state.newKey, '');
		assert.equal(view.state.newKeyID, undefined);
		assert.equal(view.state.revealKey, false);
	});
}

test('a late creation cannot restore a secret or tracked ID after leaving the tab', async (context) => {
	const pending = deferred();
	const { view } = setup(context, { createKey: async () => pending.promise });
	const creating = view.createKey();
	view.changeTab('tools');
	flush();
	pending.resolve({ id: 22, key: 'synthetic-new-key' });
	await creating;
	assert.equal(view.state.newKey, '');
	assert.equal(view.state.newKeyID, undefined);
});

test('a delayed revocation preserves a different key created while the request was in flight', async (context) => {
	const pending = deferred();
	let sequence = 21;
	const { view } = setup(context, {
		createKey: async () => ({ id: ++sequence, key: 'synthetic-key-' + sequence }),
		revokeKey: async () => pending.promise
	});
	await view.createKey();
	const revoking = view.revokeKey(22);
	view.nameKey('Another client');
	await view.createKey();
	view.reveal();
	pending.resolve();
	await revoking;
	assert.equal(view.state.newKey, 'synthetic-key-23');
	assert.equal(view.state.newKeyID, 23);
	assert.equal(view.state.revealKey, true);
});

test('Gateway detail compiles without warnings', () => {
	const result = compile(component, { filename: 'WorkspaceDetail.svelte', generate: 'client' });
	assert.deepEqual(result.warnings, []);
});

test('team-derived members can create a key and effective revocation clears the displayed secret', async (context) => {
	const { view } = setup(context);
	view.setMembership(['owner'], ['owner', 'member-one'], ['finance']);
	flush();
	assert.equal(view.state.canConnect, true);
	await view.createKey();
	view.reveal();
	view.setMembership(['owner'], ['owner'], ['finance']);
	flush();
	assert.equal(view.state.canConnect, false);
	assert.equal(view.state.newKey, '');
	assert.equal(view.state.revealKey, false);
});

test('pausing or activating preserves direct grants and team grants without flattening effective members', async (context) => {
	const writes = [];
	const { view } = setup(context, { hub: async (input) => { writes.push(input); } });
	view.setMembership(['owner'], ['owner', 'member-one'], ['finance']);
	flush();
	await view.changeStatus();
	assert.deepEqual(writes[0].memberIDs, ['owner']);
	assert.deepEqual(writes[0].accessUnitIDs, ['finance']);
	assert.equal(Object.hasOwn(writes[0], 'effectiveMemberIDs'), false);
});


test('archived detail falls back from connect tab and blocks activation and key creation', async (context) => {
  let writes = 0;
  const { view } = setup(context, {
    hub: async () => { writes++; }, createKey: async () => { writes++; }
  });
  view.archive(); flush();
  await view.changeStatus(); await view.createKey();
  assert.equal(view.state.archived, true);
  assert.equal(view.state.activeTab, 'overview');
  assert.equal(view.state.canConnect, false);
  assert.equal(writes, 0);
});

test('a late key response cannot reveal a secret after archiving the Gateway', async (context) => {
  const pending = deferred();
  const { view } = setup(context, { createKey: async () => pending.promise });
  const creating = view.createKey();
  view.archive(); flush();
  pending.resolve({ id: 22, key: 'synthetic-revoked-key' });
  await creating;
  assert.equal(view.state.newKey, '');
  assert.equal(view.state.newKeyID, undefined);
});

test('never-expiring key choice is explicit while the default remains seven days', async (context) => {
  const expiries = [];
  const { view } = setup(context, { createKey: async (_hub, _name, days) => { expiries.push(days); return {id:22,key:'synthetic-key'}; } });
  await view.createKey();
  view.clearCreatedKey();
  view.nameKey('Persistent client');
  view.expiry(0);
  await view.createKey();
  assert.deepEqual(expiries, [7, 0]);
});

test('pausing a Gateway sends every source, and a ready secondary source allows key creation', async (context) => {
  let saved;
  const { view } = setup(context, {hub: async (value) => { saved=value; }});
  const sources = [{connectionID:'server-one',toolNames:['read']},{connectionID:'server-two',toolNames:['search']}];
  view.setSources(sources,[{id:'server-one',enabled:false,reviewedTools:true,toolNames:['read'],tools:[{name:'read'}]}, {id:'server-two',enabled:true,reviewedTools:true,toolNames:['search'],tools:[{name:'search'}]}]);
  flush();
  assert.equal(view.state.canConnect, true);
  await view.changeStatus();
  assert.deepEqual(saved.sources, sources);
  assert.equal(saved.status, 'paused');
});

test('identity updates preserve tool and audience grants and permit an explicit return to ORCA mode', async (context) => {
  const writes = [];
  const { view } = setup(context, {
    hub: async (input) => writes.push(input),
    userSourcesList: async () => ({ items: [{ id: 'new-oidc', name: 'Company sign-in', enabled: true }] }),
  }, { userSourceID: 'old-oidc', accessUnitIDs: ['finance'], version: 8 });
  await view.loadUserSources();
  view.setUserSource('new-oidc');
  await view.saveIdentity();
  assert.equal(writes[0].userSourceID, 'new-oidc');
  assert.deepEqual(writes[0].memberIDs, ['member-one', 'member-two']);
  assert.deepEqual(writes[0].accessUnitIDs, ['finance']);
  assert.deepEqual(writes[0].toolNames, ['read']);
  assert.equal(writes[0].version, 8);
  view.setUserSource(''); await view.saveIdentity();
  assert.equal(writes[1].userSourceID, '');
});

test('status changes retain disabled identity while choosing disabled or missing identities cannot write', async (context) => {
  const writes = [];
  const { view } = setup(context, {
    hub: async (input) => writes.push(input),
    userSourcesList: async () => ({ items: [{ id: 'disabled-oidc', name: 'Disabled company', enabled: false }] }),
  }, { userSourceID: 'old-oidc' });
  await view.loadUserSources();
  await view.changeStatus();
  assert.equal(writes[0].userSourceID, 'old-oidc');
  view.setUserSource('disabled-oidc'); await view.saveIdentity();
  view.setUserSource('missing-oidc'); await view.saveIdentity();
  assert.equal(writes.length, 1);
  assert.match(view.state.userSourcesError, /Choose an enabled user source/);
  view.archive(); flush(); view.setUserSource(''); await view.saveIdentity();
  assert.equal(writes.length, 1);
});

test('identity list failure permits explicit ORCA fallback and failed saves keep the selected identity', async (context) => {
  const writes = [];
  const { view } = setup(context, {
    hub: async (input) => { writes.push(input); throw new Error('Save failed'); },
    userSourcesList: async () => { throw new Error('List unavailable'); },
  }, { userSourceID: 'old-oidc' });
  await view.loadUserSources();
  assert.equal(view.state.userSourcesError, 'List unavailable');
  view.setUserSource(''); await view.saveIdentity();
  assert.equal(writes[0].userSourceID, '');
  assert.equal(view.state.userSourceID, '');
  assert.equal(view.state.userSourcesError, 'Save failed');
});
