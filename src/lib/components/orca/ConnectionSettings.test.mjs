import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';

const { gatewayUsesConnection, gatewayToolCount, gatewayMemberIDs } = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const { toolPresentation } = await importTypeScript(new URL('../../orca/tool-presentation.ts', import.meta.url));

const require = createRequire(import.meta.url);
const source = await readFile(new URL('./ConnectionSettings.svelte', import.meta.url), 'utf8');
const code = compile(source, { filename: 'ConnectionSettings.svelte', generate: 'server' }).js.code
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export default function ConnectionSettings', 'function ConnectionSettings');
const module = `import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
  export function component(deps) {
    const { page, LifecycleActions, Connections, ConnectionMembers, SourceSetup, CatalogIcon, connectionReady,
      sourcePresentationNames, localeHref, t, OrcaService, displayDate, orcaError, statusLabels,
      gatewayUsesConnection, gatewayToolCount, gatewayMemberIDs, toolPresentation, orcaLocale,
      ArrowLeft, ArrowRight, Check, Folder, Info, Plus, ShieldCheck, onDestroy, onMount } = deps;
    ${code}
    return ConnectionSettings;
  }`;
const { component } = await import('data:text/javascript;base64,' + Buffer.from(module).toString('base64'));

const connection = { id: 'server-one', mcpID: 'upstream-one', name: 'Team source', description: '', tools: [{ name: 'search' }], toolNames: ['search'], enabled: true, reviewedTools: true };
function screen(tab, canManage = true, props = {}) {
  const calls = [];
  const noop = () => {};
  const children = Object.fromEntries(['Connections', 'SourceSetup', 'ConnectionMembers'].map((name) => [name, (_renderer, input) => { calls.push({ name, input }); }]));
  const view = component({
    page: { url: new URL(`https://orca.invalid/app?view=servers&tab=${tab}`) },
    ...children, LifecycleActions: noop, CatalogIcon: noop, connectionReady: () => true, sourcePresentationNames: () => ({}),
    gatewayUsesConnection, gatewayToolCount, gatewayMemberIDs, toolPresentation, orcaLocale: { value: 'en' },
    localeHref: (value) => value, t: (_th, en) => en, OrcaService: {}, displayDate: () => '',
    orcaError: () => '', statusLabels: {}, ArrowLeft: noop, ArrowRight: noop, Check: noop,
    Folder: noop, Info: noop, Plus: noop, ShieldCheck: noop, onDestroy: noop, onMount: noop,
  });
  const result = render(view, { props: { data: { canManage, connections: [connection], hubs: [] }, initialConnectionID: connection.id, onchanged: async () => {}, ...props } });
  return { calls, html: result.body };
}

test('existing Account renders only personal source setup without a policy save or discovery callback', () => {
  const { calls } = screen('account');
  assert.deepEqual(calls.map((call) => call.name), ['SourceSetup']);
  assert.equal(calls[0].input.sourceID, connection.mcpID);
  assert.equal(calls[0].input.canCreate, true);
  assert.equal(calls[0].input.onready, undefined);
  assert.equal(calls[0].input.onchanged, undefined);
});

test('manager Tools renders policy mode directly while new source retains the setup flow', () => {
  const tools = screen('tools').calls;
  assert.deepEqual(tools.map((call) => call.name), ['Connections']);
  assert.equal(tools[0].input.mode, 'policy');
  assert.equal(tools[0].input.initialConnectionID, connection.id);
  const source = screen('account', true, { initialConnectionID: '', initialSourceID: 'new-source' }).calls;
  assert.deepEqual(source.map((call) => call.name), ['Connections']);
  assert.equal(source[0].input.initialSourceID, 'new-source');
  assert.equal(source[0].input.mode, undefined);
});

test('nonmanagers cannot mount account controls or policy editor through detail tabs', () => {
  assert.deepEqual(screen('account', false).calls, []);
  const tools = screen('tools', false);
  assert.deepEqual(tools.calls, []);
  assert.match(tools.html, /search/);
});

test('server detail includes a secondary-source Gateway and counts tools from every source', () => {
  const hub = {
    id: 'multi-source', name: 'Shared team', status: 'active', memberIDs: ['member'],
    connectionID: 'other-server', toolNames: ['other'],
    sources: [
      { connectionID: 'other-server', toolNames: ['other', 'lookup'] },
      { connectionID: connection.id, toolNames: ['search'] },
    ],
  };
  const result = screen('workspaces', false, { data: { canManage: false, connections: [connection], hubs: [hub, { ...hub, id: 'deleted', name: 'Removed team', status: 'deleted' }] } });
  assert.deepEqual(result.calls, []);
  assert.match(result.html, /view=hub&amp;hub=multi-source/);
  assert.match(result.html, /Shared team/);
  assert.match(result.html, /3\s+tools/);
  assert.doesNotMatch(result.html, /Removed team|view=new/);
});


test('archived Server cannot mount OAuth or policy editor through direct tab URLs', () => {
  const archived = { ...connection, enabled: false, archivedAt: '2026-09-19T00:00:00Z' };
  for (const tab of ['account', 'tools', 'overview']) {
    const result = screen(tab, true, { data: { canManage: true, connections: [archived], hubs: [] } });
    assert.deepEqual(result.calls, []);
    assert.match(result.html, /Archived server details/);
    assert.doesNotMatch(result.html, /tab=account|tab=tools|view=new/);
  }
});


test('closing a new Server editor cannot expose archived Servers through its legacy list', () => {
  const archived = { ...connection, id: 'archived', enabled: false, archivedAt: '2026-09-19T00:00:00Z' };
  const result = screen('account', true, { initialConnectionID: '', initialSourceID: 'new-source', data: { canManage: true, connections: [connection, archived], hubs: [{ id: 'archived-hub', status: 'archived' }] } });
  const editor = result.calls.find((call) => call.name === 'Connections');
  assert.deepEqual(editor.input.data.connections.map((item) => item.id), [connection.id]);
  assert.deepEqual(editor.input.data.hubs, []);
});
