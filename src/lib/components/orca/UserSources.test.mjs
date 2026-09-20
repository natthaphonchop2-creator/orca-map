import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { effect_root, flush } from 'svelte/internal/client';

const source = await readFile(new URL('./UserSources.svelte', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, '')
  .replace('$props()', '$state(testProps)');
const code = compileModule(`export function harness(testProps, OrcaUserSourcesService, onMount, onDestroy, t, orcaError, memberName, navigator) {
  ${script}
  return {
    refresh, open, close, check, save, toggle, remove, copyCallback,
    get state() { return { items, callbackURL, loading, busy, error, notice, editing, deleting, clientSecret, verifiedIssuer, name, bindings }; },
    edit(fields) { if ('name' in fields) name = fields.name; if ('issuerURL' in fields) issuerURL = fields.issuerURL; if ('clientID' in fields) clientID = fields.clientID; if ('clientSecret' in fields) clientSecret = fields.clientSecret; if ('bindings' in fields) bindings = fields.bindings; if ('enabled' in fields) enabled = fields.enabled; },
    requestDelete(value) { deleting = value; },
    setManage(value) { data = { ...data, canManage: value }; },
  };
}`, { filename: 'user-sources-test.svelte.js', generate: 'client' }).js.code
  .replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const sourceRecord = {
  id: 'identity-one', name: 'Company account', issuerURL: 'https://identity.example.test', clientID: 'client-one',
  secretConfigured: true, enabled: false, version: 3,
  bindings: [{ memberID: 'employee-one', subject: 'provider-subject' }],
};
function setup(context, service = {}, canManage = true) {
  const callbacks = [];
  const calls = [];
  let view;
  const stop = effect_root(() => {
    view = harness({ data: { canManage, members: [{ id: 'employee-one', displayName: 'Employee', status: 'active' }] } }, {
      list: async () => ({ items: [sourceRecord], callbackURL: 'https://orca.example.test/oidc/callback' }),
      save: async (payload, id) => { calls.push({ action: 'save', payload, id }); return { ...sourceRecord, ...payload, id: id || 'new-source', secretConfigured: true }; },
      remove: async (id, version) => { calls.push({ action: 'remove', id, version }); },
      discover: async (issuer) => { calls.push({ action: 'discover', issuer }); },
      ...service,
    }, () => {}, (callback) => callbacks.push(callback), (_th, en) => en, (error) => error.message, (member) => member.displayName, { clipboard: { writeText: async () => {} } });
  });
  context.after(() => { for (const callback of callbacks) callback(); stop(); });
  return { view, calls, destroy: () => callbacks.forEach((callback) => callback()) };
}
function complete(view) {
  view.edit({ name: 'Company account', issuerURL: 'https://identity.example.test', clientID: 'client-one', clientSecret: 'synthetic-secret' });
}

test('the compact user-source editor has no Svelte accessibility warnings', () => {
  const warnings = compile(source, { filename: 'UserSources.svelte', generate: 'server' }).warnings;
  assert.deepEqual(warnings.map((warning) => ({ code: warning.code, message: warning.message })), []);
});

test('members cannot load, configure, check, toggle or delete identity sources', async (context) => {
  let requests = 0;
  const { view, calls } = setup(context, { list: async () => { requests++; } }, false);
  await view.refresh(); view.open(); complete(view); await view.check(); await view.save(); await view.toggle(sourceRecord); view.requestDelete(sourceRecord); await view.remove();
  assert.equal(requests, 0); assert.equal(view.state.editing, undefined); assert.deepEqual(calls, []);
});

test('saving submits the secret once, clears it during the request and does not read it from source', async (context) => {
  let resolve;
  let submitted;
  const { view } = setup(context, { save: (input) => { submitted = input; return new Promise((done) => resolve = done); } });
  view.open(); complete(view);
  const pending = view.save();
  assert.equal(submitted.clientSecret, 'synthetic-secret');
  assert.equal(view.state.clientSecret, '');
  assert.equal(view.state.busy, true);
  resolve({ ...sourceRecord, secretConfigured: true }); await pending;
  view.open(sourceRecord);
  assert.equal(view.state.clientSecret, '');
  assert.equal(view.state.editing.id, sourceRecord.id);
});

test('failed saves clear entered secrets but preserve non-secret form fields for correction', async (context) => {
  const { view } = setup(context, { save: async () => { throw new Error('Provider unavailable'); } });
  view.open(); complete(view); await view.save();
  assert.equal(view.state.clientSecret, ''); assert.equal(view.state.name, 'Company account');
  assert.equal(view.state.editing, null); assert.equal(view.state.error, 'Provider unavailable');
});

test('editing and disabling use versioned writes and preserve explicit subject mappings without resending a secret', async (context) => {
  const { view, calls } = setup(context);
  view.open(sourceRecord); await view.save();
  assert.equal(calls[0].payload.version, 3); assert.equal('clientSecret' in calls[0].payload, false);
  assert.deepEqual(calls[0].payload.bindings, sourceRecord.bindings);
  await view.toggle({ ...sourceRecord, enabled: true });
  assert.equal(calls[1].payload.enabled, false);
  assert.equal('clientSecret' in calls[1].payload, false);
  assert.deepEqual(calls[1].payload.bindings, sourceRecord.bindings);
});

test('missing and duplicate subject mappings cannot create ambiguous account bindings', async (context) => {
  const { view, calls } = setup(context);
  view.open(); complete(view);
  for (const bindings of [
    [{ memberID: 'employee-one', subject: '' }],
    [{ memberID: '', subject: 'sub' }],
    [{ memberID: 'employee-one', subject: 'sub' }, { memberID: 'employee-two', subject: 'sub' }],
    [{ memberID: 'employee-one', subject: 'sub-a' }, { memberID: 'employee-one', subject: 'sub-b' }],
  ]) { view.edit({ bindings }); await view.save(); assert.ok(view.state.error); }
  assert.deepEqual(calls, []);
});

test('discovery sends only issuer and does not save credentials or identities', async (context) => {
  const { view, calls } = setup(context);
  view.open(); complete(view); await view.check();
  assert.deepEqual(calls, [{ action: 'discover', issuer: sourceRecord.issuerURL }]);
  assert.equal(view.state.verifiedIssuer, sourceRecord.issuerURL);
  assert.match(view.state.notice, /configuration found/);
});

test('delete requires the source version and keeps the source visible when deletion fails', async (context) => {
  const { view, calls } = setup(context);
  await view.refresh(); view.requestDelete(sourceRecord); await view.remove();
  assert.deepEqual(calls, [{ action: 'remove', id: sourceRecord.id, version: 3 }]);
  assert.deepEqual(view.state.items, []);
  const failing = setup(context, { remove: async () => { throw new Error('Gateway still uses this source'); } }).view;
  await failing.refresh(); failing.requestDelete(sourceRecord); await failing.remove();
  assert.equal(failing.state.items.length, 1); assert.match(failing.state.error, /Gateway still uses/);
});

test('closing or destroying an editor clears an unsaved secret', (context) => {
  const { view, destroy } = setup(context);
  view.open(); complete(view); view.close(); assert.equal(view.state.clientSecret, '');
  view.open(); complete(view); destroy(); assert.equal(view.state.clientSecret, '');
});

test('older refreshes cannot overwrite a newer list', async (context) => {
  const pending = [];
  const { view } = setup(context, { list: async () => new Promise((resolve) => pending.push(resolve)) });
  const first = view.refresh(); const second = view.refresh();
  pending[1]({ items: [{ ...sourceRecord, name: 'Latest' }], callbackURL: 'new' }); await second;
  pending[0]({ items: [{ ...sourceRecord, name: 'Stale' }], callbackURL: 'old' }); await first;
  flush(); assert.equal(view.state.items[0].name, 'Latest'); assert.equal(view.state.callbackURL, 'new');
});


test('an enabled source requires explicit employee mapping while a disabled draft may omit secret and mappings', async (context) => {
  const { view, calls } = setup(context);
  view.open(); view.edit({ name: 'Draft', issuerURL: sourceRecord.issuerURL, clientID: sourceRecord.clientID, enabled: false });
  await view.save();
  assert.equal(calls.length, 1); assert.equal('clientSecret' in calls[0].payload, false); assert.deepEqual(calls[0].payload.bindings, []);
  view.open(); complete(view); view.edit({ enabled: true }); await view.save();
  assert.match(view.state.error, /at least one employee/); assert.equal(calls.length, 1);
});


test('a changed client ID cannot reuse a saved secret', async (context) => {
  const { view, calls } = setup(context);
  view.open(sourceRecord); view.edit({ clientID: 'replacement-client' }); await view.save();
  assert.match(view.state.error, /new client secret/); assert.equal(calls.length, 0);
  view.edit({ clientSecret: 'replacement-secret' }); await view.save();
  assert.equal(calls[0].payload.clientID, 'replacement-client'); assert.equal(calls[0].payload.clientSecret, 'replacement-secret');
});
