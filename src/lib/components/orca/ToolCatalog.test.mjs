import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from 'svelte/internal/client';

const component = await readFile(new URL('./ToolCatalog.svelte', import.meta.url), 'utf8');
const catalogCode = stripTypeScriptTypes(
  await readFile(new URL('../../orca/catalog.ts', import.meta.url), 'utf8')
).replace("'./catalog-data'", JSON.stringify(new URL('../../orca/catalog-data.ts', import.meta.url).href));
const { filterCatalog, googleDriveProvider } = await import('data:text/javascript;base64,' + Buffer.from(catalogCode).toString('base64'));
const { catalogCategories } = await import(new URL('../../orca/catalog-data.ts', import.meta.url).href);
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, '')
  .replace('$props()', '$state(testProps)');
const require = createRequire(import.meta.url);
const code = compileModule(`export function harness(testProps, OrcaService, onMount, onDestroy, filterCatalog, googleDriveProvider, catalogCategories, selectedToolInventory, orcaError) {
  ${script}
  return { load, otherDriveConnections, driveProviderLabel, get allSources() { return allSources; } };
}`, { filename: 'tool-catalog-test.svelte.js', generate: 'client' }).js.code.replaceAll(
  'svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href
);
const { harness } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('managed catalog choice keeps existing provider connections distinct and available by their saved identities', async () => {
  const managed = { id: 'default-orca-managed-google-drive', name: 'Google Drive', managedProvider: 'google-drive', endpointHost: '127.0.0.1' };
  const official = { id: 'official', name: 'Google Drive · ORCA', endpointHost: 'drivemcp.googleapis.com' };
  const legacy = { id: 'legacy', name: 'Google Drive', endpointHost: 'google-drive-mcp.obot.ai' };
  const custom = { id: 'custom', name: 'Custom files', endpointHost: '127.0.0.1' };
  const connections = [
    { id: 'official connection & source=other', mcpID: official.id, name: 'Company Drive' },
    { id: 'legacy-connection', mcpID: legacy.id, name: 'Earlier Drive' },
    { id: 'managed-connection', mcpID: managed.id, name: 'New Drive' },
    { id: 'custom-connection', mcpID: custom.id, name: 'Custom Drive' }
  ];
  const original = structuredClone(connections);
  let view;
  const stop = effect_root(() => {
    view = harness(
      { data: { canManage: true, connections } },
      { candidates: async () => [official, legacy, managed, custom] },
      () => {}, () => {}, filterCatalog, googleDriveProvider, catalogCategories, () => [], (error) => error.message
    );
  });
  try {
    await view.load();
    flush();
    assert.equal(view.allSources[0].id, managed.id);
    assert.deepEqual(view.otherDriveConnections(managed).map(({ id }) => id), [connections[0].id, connections[1].id]);
    assert.deepEqual(view.otherDriveConnections(custom), []);
    assert.equal(view.driveProviderLabel(managed), 'ORCA');
    assert.equal(view.driveProviderLabel(official), 'Google');
    assert.equal(view.driveProviderLabel(legacy), 'Obot');
    assert.equal(view.driveProviderLabel(custom), '');
    assert.deepEqual(connections, original);
  } finally {
    stop();
  }
});
