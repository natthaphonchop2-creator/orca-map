import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Run the actual component script with the matching runtime.
import { effect_root } from 'svelte/internal/client';
const component = await readFile(new URL('./ConnectionSetupDialog.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, '').replace('$props()', '$state(testProps)');
const require = createRequire(import.meta.url);
const compiled = compileModule(`export function harness(testProps, OrcaService, onMount, document, HTMLElement) {
  ${script}
  return { close, refresh, get activeData() { return activeData; },
    setBusy(value) { busy = value; },
    bind(dialogNode, headingNode) { dialog = dialogNode; heading = headingNode; }
  };
}`, { filename: 'dialog-test.svelte.js', generate: 'client' }).js.code
  .replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('the connection dialog uses native modal focus and prevents closing during account operations', (context) => {
  const events = [];
  class Element {
    isConnected = true;
    focus() { events.push('focus-opener'); }
  }
  let mount, view;
  const stop = effect_root(() => {
    view = harness({ data: {}, onclose: () => events.push('close-request'), oncompleted: async () => {} }, {}, (fn) => mount = fn, { activeElement: new Element() }, Element);
  });
  context.after(stop);
  view.bind({ showModal: () => events.push('showModal'), close: () => events.push('close-dialog') }, { focus: () => events.push('focus-heading') });
  const cleanup = mount();
  assert.deepEqual(events, ['showModal', 'focus-heading']);
  view.setBusy(true);
  view.close();
  assert.equal(events.length, 2);
  view.setBusy(false);
  view.close();
  cleanup();
  assert.deepEqual(events.slice(2), ['close-request', 'close-dialog', 'focus-opener']);
});

test('refreshing the modal reads current bootstrap without replacing or mutating the caller draft', async (context) => {
  const original = { canManage: true, connections: [], hubs: [{ id: 'existing-draft' }] };
  const fresh = { ...original, connections: [{ id: 'saved-connection' }] };
  let view, reads = 0;
  const stop = effect_root(() => {
    view = harness({ data: original, onclose() {}, oncompleted: async () => {} }, {
      bootstrap: async () => { reads++; return fresh; }
    }, () => {});
  });
  context.after(stop);
  assert.deepEqual(view.activeData, original);
  await view.refresh();
  assert.equal(reads, 1);
  assert.equal(view.activeData.connections[0].id, 'saved-connection');
  assert.deepEqual(original.connections, []);
  assert.equal(original.hubs[0].id, 'existing-draft');
});
