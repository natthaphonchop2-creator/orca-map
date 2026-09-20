import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const code = stripTypeScriptTypes(await readFile(new URL('../services/orca-user-sources.ts', import.meta.url), 'utf8'))
  .replace(/^import[^;]+;/gm, '').replace('export const OrcaUserSourcesService', 'const OrcaUserSourcesService');
const { service } = await import('data:text/javascript;base64,' + Buffer.from(`export function service(doGet, doPost, doPut, doDelete) { ${code}; return OrcaUserSourcesService; }`).toString('base64'));
const source = { id: 'source/one', name: 'Company identity', issuerURL: 'https://id.example.test', clientID: 'public-client', secretConfigured: true, enabled: false, version: 2, bindings: [{ memberID: 'member', subject: 'sub' }], createdAt: '', updatedAt: '' };

test('identity readback whitelists fields and cannot keep returned secret values', async () => {
  const client = service(async () => ({ items: [{ ...source, clientSecret: 'not-for-readback', refreshToken: 'not-for-readback' }], callbackURL: 'https://orca.example.test/orca/oauth/callback' }));
  const result = await client.list();
  assert.deepEqual(result.items, [source]);
  assert.equal(JSON.stringify(result).includes('not-for-readback'), false);
});

test('identity service uses versioned API writes and does not invent a secret when omitted', async () => {
  const calls = [];
  const request = (method) => async (path, input, options) => { calls.push({ method, path, input, options }); return source; };
  const client = service(request('GET'), request('POST'), request('PUT'), request('DELETE'));
  const input = { name: source.name, issuerURL: source.issuerURL, clientID: source.clientID, enabled: false, version: 2, bindings: source.bindings };
  await client.save(input, source.id);
  await client.remove(source.id, source.version);
  assert.equal(calls[0].path, '/orca/user-sources/source%2Fone');
  assert.deepEqual(calls[0].input, input);
  assert.equal('clientSecret' in calls[0].input, false);
  assert.equal(calls[0].options.dontLogErrors, true);
  assert.equal(calls[1].path, '/orca/user-sources/source%2Fone?version=2');
});

test('identity discovery passes only the issuer to its dedicated endpoint', async () => {
  const calls = [];
  const client = service(undefined, async (...args) => { calls.push(args); return {}; });
  await client.discover(source.issuerURL);
  assert.deepEqual(calls, [['/orca/user-sources/discover', { issuerURL: source.issuerURL }, { dontLogErrors: true }]]);
});
