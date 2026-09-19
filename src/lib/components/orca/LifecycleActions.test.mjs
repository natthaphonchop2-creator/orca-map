import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { effect_root, flush } from 'svelte/internal/client';

const require = createRequire(import.meta.url);
const component = await readFile(new URL('./LifecycleActions.svelte', import.meta.url), 'utf8');
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, '').replace('$props()', '$state(testProps)');
const compiled = compileModule(`
export function harness(testProps, OrcaService, t, orcaError, parseErrorContent, tick) {
  ${script}
  const modal = { open: false, isConnected: true, showModal() { this.open = true; }, close() { this.open = false; } };
  dialog = modal;
  let focused = false;
  cancelButton = { focus() { focused = true; } };
  return { open, close, confirm, reload, modal,
    replace(value) { entity = value; },
    get state() { return { pending, completed, error, requiresReload, blockedDelete, snapshot, focused }; }
  };
}`, { filename: 'lifecycle-actions-test.svelte.js', generate: 'client' }).js.code
  .replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));
function setup(context, overrides = {}, serviceOverride = {}) {
  let view;
  const calls = [];
  const changed = [];
  let reloadCount = 0;
  const service = Object.fromEntries(['archiveHub', 'restoreHub', 'deleteHub', 'archiveConnection', 'restoreConnection', 'deleteConnection'].map((name) => [name, async (id, version) => { calls.push({ name, id, version }); }]));
  const stop = effect_root(() => {
    view = harness({ entity: { id: 'synthetic-one', name: 'Synthetic record', version: 4 }, kind: 'gateway', canManage: true,
      onchanged: async (action) => changed.push(action), onreload: async () => { reloadCount++; }, ...overrides
    }, { ...service, ...serviceOverride }, (_th, en) => en, (error) => error.message, (error) => ({ status: error.status }), async () => {});
  });
  context.after(stop);
  flush();
  return { view, calls, changed, get reloadCount() { return reloadCount; } };
}

test('archive opens a confirmation with cancel focused; cancellation does not mutate', async (context) => {
  const { view, calls } = setup(context);
  await view.open('archive');
  assert.equal(view.modal.open, true);
  assert.equal(view.state.focused, true);
  view.close();
  assert.equal(view.modal.open, false);
  assert.deepEqual(calls, []);
});

for (const [kind, suffix] of [['gateway', 'Hub'], ['server', 'Connection']]) {
  for (const action of ['archive', 'restore', 'delete']) {
    test(`${kind} ${action} sends reviewed version exactly once and refreshes`, async (context) => {
      const { view, calls, changed } = setup(context, { kind, archived: action === 'restore' });
      await view.open(action);
      await view.confirm();
      await view.confirm();
      assert.deepEqual(calls, [{ name: action + suffix, id: 'synthetic-one', version: 4 }]);
      assert.deepEqual(changed, [action]);
      assert.equal(view.modal.open, false);
    });
  }
}

test('pending request suppresses double submit and cancel', async (context) => {
  let resolve;
  let calls = 0;
  const pending = new Promise((done) => { resolve = done; });
  const { view } = setup(context, {}, { archiveHub: async () => { calls++; await pending; } });
  await view.open('archive');
  const request = view.confirm();
  await view.confirm();
  view.close();
  assert.equal(view.modal.open, true);
  assert.equal(calls, 1);
  resolve(); await request;
  assert.equal(view.modal.open, false);
});

test('server delete blocks when even an archived Gateway still references it', async (context) => {
  const { view, calls } = setup(context, { kind: 'server', affectedGateways: [{ id: 'archived-hub', name: 'Archived hub' }] });
  await view.open('delete');
  assert.equal(view.state.blockedDelete, true);
  await view.confirm();
  assert.deepEqual(calls, []);
  await view.open('archive');
  assert.equal(view.state.blockedDelete, false);
  await view.confirm();
  assert.equal(calls[0].name, 'archiveConnection');
});

test('remote version conflict blocks retry until a fresh review', async (context) => {
  let attempts = 0;
  const state = setup(context, {}, { archiveHub: async () => { attempts++; throw Object.assign(new Error('Conflict'), { status: 409 }); } });
  await state.view.open('archive');
  await state.view.confirm();
  assert.equal(state.view.state.requiresReload, true);
  await state.view.confirm();
  assert.equal(attempts, 1);
  await state.view.reload();
  assert.equal(state.reloadCount, 1);
  assert.equal(state.view.modal.open, false);
});

test('a live data replacement cannot silently change the version confirmed by user', async (context) => {
  const { view, calls } = setup(context);
  await view.open('delete');
  view.replace({ id: 'synthetic-one', name: 'Updated name', version: 5 });
  await view.confirm();
  assert.equal(view.state.requiresReload, true);
  assert.deepEqual(calls, []);
});

test('nonmanager cannot open or invoke lifecycle action', async (context) => {
  const { view, calls } = setup(context, { canManage: false });
  await view.open('delete'); await view.confirm();
  assert.equal(view.modal.open, false);
  assert.deepEqual(calls, []);
});

test('a saved action with failed refresh offers reload without repeating mutation', async (context) => {
  const { view, calls } = setup(context, { onchanged: async () => { throw new Error('Refresh failed'); } });
  await view.open('archive'); await view.confirm(); await view.confirm();
  assert.equal(calls.length, 1);
  assert.equal(view.state.completed, true);
  assert.equal(view.state.requiresReload, true);
  assert.equal(view.modal.open, true);
});

for (const file of ['LifecycleActions.svelte', 'AppOverview.svelte', 'ConnectionCenter.svelte', 'ConnectionSettings.svelte']) {
  test(`${file} compiles without warnings`, async () => {
    const input = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.deepEqual(compile(input, { filename: file, generate: 'client' }).warnings, []);
  });
}
