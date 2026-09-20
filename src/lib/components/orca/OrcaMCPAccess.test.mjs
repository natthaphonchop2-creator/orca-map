import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import { effect_root, flush, untrack } from 'svelte/internal/client';

const require = createRequire(import.meta.url);
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const gatewayURL = moduleURL(stripTypeScriptTypes(await readFile(new URL('../../orca/gateway-sources.ts', import.meta.url), 'utf8')));
const activationURL = moduleURL(stripTypeScriptTypes(await readFile(new URL('../../orca/activation.ts', import.meta.url), 'utf8'))
	.replace(/(['"])\.\/gateway-sources(?:\.ts)?\1/, JSON.stringify(gatewayURL)));
const { gatewaySources, gatewayToolCount, gatewayHasMember } = await import(gatewayURL);
const { workspaceToolingReady } = await import(activationURL);
const configURL = moduleURL(stripTypeScriptTypes(await readFile(new URL('../../orca/client-config.ts', import.meta.url), 'utf8')));
const { gatewayClientConfig } = await import(configURL);
const source = await readFile(new URL('./OrcaMCPAccess.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(`export function harness(testProps, OrcaService, workspaceToolingReady, gatewayClientConfig, gatewaySources, gatewayToolCount, gatewayHasMember, t, orcaError, onDestroy, untrack, navigator) {
	${script}
	return {
		loadKeys, createKey, requestRevoke, revokeKey, dismissCreatedKey, toggleReveal, copyKey,
		nameKey(value) { keyName = value; },
		expires(value) { expiryDays = value; },
		changeData(value) { data = value; },
		get data() { return data; },
		get state() { return { keys, loadingKeys, keysLoaded, keyError, notice, canCreate, creating, revoking, confirmRevoke, newKey, newKeyID, revealKey, keyName, expiryDays, endpoint, accessibleGateways, oauth }; }
	};
}`, { filename: 'orca-mcp-access-test.svelte.js', generate: 'client' }).js.code
	.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));
const endpoint = 'https://orca.example/api/orca/mcp';
const key = (id, overrides = {}) => ({ id, name: `Client ${id}`, createdAt: '2026-09-19T00:00:00Z', userId: 1, ...overrides });
const connection = (id = 'source-one') => ({ id, enabled: true, reviewedTools: true, toolNames: ['read'], tools: [{ name: 'read', inputSchema: {} }] });
const hub = (id = 'gateway-one', overrides = {}) => ({
	id, name: id, connectionID: 'source-one', toolNames: ['read'], status: 'active', memberIDs: ['member-one'], ...overrides
});
function bootstrap(overrides = {}) {
	return { organization: { displayName: 'ORCA Team', timezone: 'Asia/Bangkok', version: 1 }, currentUserID: 'member-one', canManage: true, connections: [connection()], hubs: [hub()], unifiedConnectURL: endpoint, ...overrides };
}
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
	return { promise, resolve, reject };
}
async function settle() {
	flush();
	await new Promise((resolve) => setImmediate(resolve));
	flush();
}
async function setup(context, methods = {}, data = bootstrap()) {
	const callbacks = [];
	const calls = { create: [], revoke: [], copy: [] };
	let entries = [key(11)];
	let sequence = 21;
	let view;
	const stop = effect_root(() => {
		view = harness({ data }, {
			orcaKeys: async () => [...entries],
			createOrcaKey: async (name, expiry) => {
				calls.create.push({ name, expiry });
				const created = key(++sequence, { name });
				entries.push(created);
				return { ...created, key: `synthetic-key-${created.id}`, connectURL: endpoint };
			},
			revokeOrcaKey: async (id) => { calls.revoke.push(id); entries = entries.filter((item) => item.id !== id); },
			...methods
		}, workspaceToolingReady, gatewayClientConfig, gatewaySources, gatewayToolCount, gatewayHasMember,
			(_th, en) => en, (error) => error.message, (fn) => callbacks.push(fn), untrack,
			{ clipboard: { writeText: async (text) => calls.copy.push(text) } });
	});
	let destroyed = false;
	const destroy = () => {
		if (destroyed) return;
		destroyed = true;
		callbacks.forEach((fn) => fn());
		stop();
	};
	context.after(destroy);
	await settle();
	void view.state.oauth;
	view.nameKey('My AI');
	return { view, calls, destroy };
}

test('only active, explicit-member Gateways with usable sources are eligible; admin is not membership', async (context) => {
	const data = bootstrap({ hubs: [
		hub('allowed'), hub('not-a-member', { memberIDs: ['someone-else'] }), hub('paused', { status: 'paused' }),
		hub('archived', { status: 'archived' }), hub('deleted', { status: 'deleted' }),
		hub('missing-source', { connectionID: 'gone' }), hub('revoked-tool', { toolNames: ['write'] }),
		hub('multi', { sources: [{ connectionID: 'source-one', toolNames: ['read'] }, { connectionID: 'second', toolNames: ['read'] }] })
	], connections: [connection(), connection('second')] });
	const { view, calls } = await setup(context, {}, data);
	assert.deepEqual(view.state.accessibleGateways.map((item) => item.id), ['allowed', 'multi']);
	view.changeData({ ...data, hubs: [hub('managed', { memberIDs: [] })] });
	await settle();
	assert.equal(view.state.canCreate, false);
	await view.createKey();
	assert.equal(calls.create.length, 0);
});

test('default expiry is seven days and no expiry is an explicit zero selection', async (context) => {
	const { view, calls } = await setup(context);
	assert.equal(view.state.expiryDays, 7);
	await view.createKey();
	assert.deepEqual(calls.create[0], { name: 'My AI', expiry: 7 });
	view.dismissCreatedKey();
	view.nameKey('Always available');
	view.expires(0);
	await view.createKey();
	assert.deepEqual(calls.create[1], { name: 'Always available', expiry: 0 });
	assert.equal(view.state.newKey, 'synthetic-key-23');
	assert.equal(view.state.revealKey, false);
});

test('inherited team membership permits an ORCA key and clears its secret when the team grant is removed', async (context) => {
	const inherited = hub('team', { memberIDs: ['owner'], accessUnitIDs: ['finance'], effectiveMemberIDs: ['owner', 'member-one'] });
	const { view, calls } = await setup(context, {}, bootstrap({ canManage: false, hubs: [inherited] }));
	assert.equal(view.state.canCreate, true);
	await view.createKey();
	assert.equal(calls.create.length, 1);
	view.toggleReveal();
	view.changeData({ ...view.data, hubs: [{ ...inherited, effectiveMemberIDs: ['owner'] }] });
	await settle();
	assert.equal(view.state.canCreate, false);
	assert.equal(view.state.newKey, '');
	assert.equal(view.state.revealKey, false);
	await view.createKey();
	assert.equal(calls.create.length, 1);
});

test('empty, oversized, fractional, or out-of-range key input cannot create keys', async (context) => {
	const { view, calls } = await setup(context);
	for (const value of [undefined, -1, 31, 0.5, NaN]) {
		view.expires(value);
		await view.createKey();
	}
	view.expires(7);
	for (const name of ['  ', 'x'.repeat(101)]) {
		view.nameKey(name);
		await view.createKey();
	}
	assert.equal(calls.create.length, 0);
	assert.match(view.state.keyError, /Enter a key name/);
});

test('bootstrap must supply a usable endpoint; none is fabricated and old keys remain revocable', async (context) => {
	const { view, calls } = await setup(context, {}, bootstrap({ unifiedConnectURL: undefined }));
	assert.equal(view.state.endpoint, '');
	assert.equal(view.state.canCreate, false);
	await view.createKey();
	assert.equal(calls.create.length, 0);
	view.requestRevoke(11);
	await view.revokeKey(11);
	assert.deepEqual(calls.revoke, [11]);
});

test('own keys can be loaded and revoked after losing all active Gateways; confirmation is required', async (context) => {
	const { view, calls } = await setup(context, {}, bootstrap({ hubs: [] }));
	assert.equal(view.state.canCreate, false);
	assert.equal(view.state.keys.length, 1);
	await view.revokeKey(11);
	assert.equal(calls.revoke.length, 0);
	view.requestRevoke(999);
	assert.equal(view.state.confirmRevoke, undefined);
	view.requestRevoke(11);
	await view.revokeKey(11);
	assert.deepEqual(calls.revoke, [11]);
	assert.equal(view.state.keys.length, 0);
});

for (const boundary of ['actor', 'organization', 'endpoint', 'membership', 'partial-membership', 'paused', 'source-disabled', 'dismiss', 'destroy']) {
	test(`${boundary} change clears the one-time secret and reveal state`, async (context) => {
		const { view, destroy, calls } = await setup(context, {}, bootstrap({ hubs: [hub(), hub('second')] }));
		await view.createKey();
		view.toggleReveal();
		assert.equal(view.state.revealKey, true);
		const data = view.data;
		if (boundary === 'actor') view.changeData({ ...data, currentUserID: 'another-user' });
		if (boundary === 'organization') view.changeData({ ...data, organization: { ...data.organization, displayName: 'Renamed ORCA Team', version: 2 } });
		if (boundary === 'endpoint') view.changeData({ ...data, unifiedConnectURL: 'https://other.example/api/orca/mcp' });
		if (boundary === 'membership') view.changeData({ ...data, hubs: data.hubs.map((item) => ({ ...item, memberIDs: [] })) });
		if (boundary === 'partial-membership') view.changeData({ ...data, hubs: [data.hubs[0], { ...data.hubs[1], memberIDs: [] }] });
		if (boundary === 'paused') view.changeData({ ...data, hubs: data.hubs.map((item) => ({ ...item, status: 'paused' })) });
		if (boundary === 'source-disabled') view.changeData({ ...data, connections: [{ ...data.connections[0], enabled: false }] });
		if (boundary === 'dismiss') view.dismissCreatedKey();
		if (boundary === 'destroy') destroy();
		await settle();
		assert.equal(view.state.newKey, '');
		assert.equal(view.state.newKeyID, undefined);
		assert.equal(view.state.revealKey, false);
		await view.copyKey();
		assert.deepEqual(calls.copy, []);
	});
}

for (const boundary of ['actor', 'membership', 'destroy']) {
	test(`late creation cannot restore a secret after ${boundary} changes`, async (context) => {
		const pending = deferred();
		const { view, destroy } = await setup(context, { createOrcaKey: async () => pending.promise });
		const creating = view.createKey();
		if (boundary === 'actor') view.changeData({ ...view.data, currentUserID: 'another-user' });
		if (boundary === 'membership') view.changeData({ ...view.data, hubs: [] });
		if (boundary === 'destroy') destroy();
		await settle();
		pending.resolve({ id: 22, key: 'synthetic-late-key', connectURL: endpoint });
		await creating;
		assert.equal(view.state.newKey, '');
		assert.equal(view.state.newKeyID, undefined);
	});
}

test('late key-list results from the previous member cannot replace the current member list', async (context) => {
	const pending = deferred();
	let loads = 0;
	const { view } = await setup(context, { orcaKeys: async () => ++loads === 1 ? pending.promise : [key(99)] });
	view.changeData({ ...view.data, currentUserID: 'another-user' });
	await settle();
	assert.deepEqual(view.state.keys.map((item) => item.id), [99]);
	pending.resolve([key(11)]);
	await settle();
	assert.deepEqual(view.state.keys.map((item) => item.id), [99]);
});

test('a late create failure cannot write errors into a different user session', async (context) => {
	const pending = deferred();
	const { view } = await setup(context, { createOrcaKey: async () => pending.promise });
	const creating = view.createKey();
	view.changeData({ ...view.data, currentUserID: 'another-user' });
	await settle();
	pending.reject(new Error('Previous user error'));
	await creating;
	assert.equal(view.state.keyError, '');
});

test('revoke older keys without discarding another newly created secret; failed revoke preserves it', async (context) => {
	const { view } = await setup(context);
	await view.createKey();
	view.toggleReveal();
	view.requestRevoke(11);
	await view.revokeKey(11);
	assert.equal(view.state.newKey, 'synthetic-key-22');
	assert.equal(view.state.revealKey, true);
	view.requestRevoke(22);
	await view.revokeKey(22);
	assert.equal(view.state.newKey, '');
	const failed = await setup(context, { revokeOrcaKey: async () => { throw new Error('Cannot revoke yet'); } });
	await failed.view.createKey();
	failed.view.requestRevoke(22);
	await failed.view.revokeKey(22);
	assert.equal(failed.view.state.newKey, 'synthetic-key-22');
	assert.match(failed.view.state.keyError, /Cannot revoke/);
});

test('copying a newly created key is explicit and dismissing it makes it unavailable', async (context) => {
	const { view, calls } = await setup(context);
	await view.createKey();
	assert.deepEqual(calls.copy, []);
	await view.copyKey();
	assert.deepEqual(calls.copy, ['synthetic-key-22']);
	view.dismissCreatedKey();
	await view.copyKey();
	assert.deepEqual(calls.copy, ['synthetic-key-22']);
});

test('component compiles without warnings and renders unified setup without passing secrets', async () => {
	const result = compile(source, { filename: 'OrcaMCPAccess.svelte', generate: 'server' });
	assert.deepEqual(result.warnings, []);
	const code = result.js.code.replace(/^import[\s\S]*?;\n/gm, '').replace('export default function OrcaMCPAccess', 'function OrcaMCPAccess');
	const module = `import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
		export function component(deps) {
			const { onDestroy, untrack, Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, Trash2, workspaceToolingReady, gatewayClientConfig, gatewaySources, gatewayToolCount, gatewayHasMember, localeHref, t, OrcaService, displayDate, orcaError, GatewayClientSetup } = deps;
			${code}
			return OrcaMCPAccess;
		}`;
	const { component } = await import(moduleURL(module));
	const calls = [];
	const noop = () => {};
	const Screen = component({
		onDestroy: noop, untrack, Check: noop, Copy: noop, Eye: noop, EyeOff: noop, KeyRound: noop, RefreshCw: noop, Trash2: noop,
		workspaceToolingReady, gatewayClientConfig, gatewaySources, gatewayToolCount, gatewayHasMember, localeHref: (url) => url, t: (_th, en) => en,
		OrcaService: {}, displayDate: (value) => value || '—', orcaError: (error) => error.message,
		GatewayClientSetup: (_renderer, props) => calls.push(props)
	});
	const html = render(Screen, { props: { data: bootstrap({ hubs: [hub('allowed'), hub('private', { memberIDs: ['other'] })] }) } }).body;
	assert.match(html, /Connect your AI to ORCA once/);
	assert.match(html, /Gateways available to you · 1/);
	assert.match(html, /1 sources · 1 selected tools/);
	assert.doesNotMatch(html, />private</);
	assert.match(html, /No expiry/);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].endpoint, endpoint);
	assert.equal(calls[0].scope, 'orca');
	assert.equal(calls[0].ready, true);
	assert.deepEqual(Object.keys(calls[0]).sort(), ['endpoint', 'oauth', 'ready', 'scope']);
	assert.equal(calls[0].oauth, true);
	assert.equal(calls[1].oauth, false);
	assert.equal(calls[1].endpoint, endpoint);
	const ordinaryOption = html.match(/<details([^>]*class="api-key-option[^>]*)>/);
	assert.ok(ordinaryOption);
	assert.doesNotMatch(ordinaryOption[1], /\bopen(?:\s|=|$)/);
	const oauthHTML = render(Screen, { props: { data: bootstrap({ hubs: [hub('identity-gateway', { userSourceID: 'company-sso' })] }) } }).body;
	assert.equal(calls[2].oauth, true);
	assert.equal(calls[3].oauth, false);
	const optional = oauthHTML.match(/<details([^>]*class="api-key-option[^>]*)>([\s\S]*?)<\/details>/);
	assert.ok(optional);
	assert.doesNotMatch(optional[1], /\bopen(?:\s|=|$)/);
	assert.match(optional[2], /API key.*Optional/);
	assert.match(optional[2], /Create a personal key/);
	const unavailable = render(Screen, { props: { data: bootstrap({ unifiedConnectURL: undefined }) } }).body;
	assert.match(unavailable, /ORCA MCP URL is not available yet/);
	assert.equal(calls.length, 4);
});


test('ORCA OAuth remains the default without custom IdP and access still gates readiness', async (context) => {
  const { view } = await setup(context, {}, bootstrap({ hubs: [hub('public'), hub('private', { memberIDs: ['someone-else'], userSourceID: 'idp' })] }));
  assert.equal(view.state.oauth, true);
  view.changeData({ ...view.data, hubs: [hub('allowed', { userSourceID: 'idp' })] });
  await settle(); assert.equal(view.state.oauth, true);
  view.changeData({ ...view.data, hubs: [hub('paused', { userSourceID: 'idp', status: 'paused' })] });
  await settle(); assert.equal(view.state.oauth, true);
  assert.equal(view.state.canCreate, false);
});
