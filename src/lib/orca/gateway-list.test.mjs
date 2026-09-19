import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
const { filterGateways } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(await readFile(new URL('./gateway-list.ts', import.meta.url), 'utf8'))).toString('base64'));
const gateways = ['active', 'paused', 'draft', 'archived', 'deleted'].map((status) => ({ id: status, name: `${status} gateway`, description: 'Finance team', connectionID: 'server', status }));
const connections = [{ id: 'server', name: 'Google Drive' }];
test('main Gateway list excludes archives and deletion tombstones', () => {
  assert.deepEqual(filterGateways(gateways, connections, '', '').map((hub) => hub.id), ['active', 'paused', 'draft']);
});
test('only explicit Archived view includes archived Gateways and deleted stays invisible', () => {
  assert.deepEqual(filterGateways(gateways, connections, '', 'archived').map((hub) => hub.id), ['archived']);
  assert.deepEqual(filterGateways(gateways, connections, '', 'deleted'), []);
});
test('Gateway search respects archive/status filters and source names', () => {
  assert.deepEqual(filterGateways(gateways, connections, 'drive', 'paused').map((hub) => hub.id), ['paused']);
  assert.deepEqual(filterGateways(gateways, connections, 'archived', ''), []);
  assert.deepEqual(filterGateways(gateways, connections, 'finance', 'archived').map((hub) => hub.id), ['archived']);
});
