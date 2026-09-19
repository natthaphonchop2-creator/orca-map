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
const { personalKeyAvailable, workspaceToolingReady } = await import(moduleURL(stripTypeScriptTypes(
	await readFile(new URL('../../orca/activation.ts', import.meta.url), 'utf8')
)));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(`
export function harness(testProps, OrcaService, personalKeyAvailable, workspaceToolingReady, t, orcaError, onMount, onDestroy, untrack) {
	const page = $state({ url: new URL('https://orca.example.test/app?tab=connect') });
	${script}
	return {
		createKey, revokeKey, clearCreatedKey, changeStatus,
		nameKey(value) { keyName = value; },
		reveal() { revealKey = true; },
		changeActor(id) { data = { ...data, currentUserID: id }; },
		changeHub(id) { hub = { ...hub, id }; },
		changeTab(tab) { page.url = new URL('https://orca.example.test/app?tab=' + tab); },
		pause() { hub = { ...hub, status: 'paused' }; },
		archive() { hub = { ...hub, status: 'archived' }; },
		remove() { hub = { ...hub, status: 'deleted' }; },
		get state() { return { newKey, newKeyID, revealKey, keyError, archived, canConnect, activeTab }; }
	};
}`, { filename: 'workspace-detail-test.svelte.js', generate: 'client' }).js.code
	.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));

function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

function setup(context, service = {}) {
	const revoked = [];
	const destroyCallbacks = [];
	let view;
	const stop = effect_root(() => {
		view = harness({
			data: {
				currentUserID: 'member-one', members: [], canManage: true,
				connections: [{ id: 'server-one', enabled: true, reviewedTools: true, toolNames: ['read'], tools: [{ name: 'read' }] }]
			},
			hub: { id: 'gateway-one', connectionID: 'server-one', status: 'active', toolNames: ['read'], memberIDs: ['member-one', 'member-two'], dailyLimit: 100 },
			onchanged: async () => {}
		}, {
			keys: async () => [],
			createKey: async () => ({ id: 22, key: 'synthetic-new-key' }),
			revokeKey: async (hubID, id) => { revoked.push({ hubID, id }); },
			...service
		}, personalKeyAvailable, workspaceToolingReady,
			(_th, en) => en, (error) => error.message, () => {},
			(callback) => destroyCallbacks.push(callback), untrack);
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
