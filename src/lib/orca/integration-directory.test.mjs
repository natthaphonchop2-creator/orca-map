import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { integrationReferences, integrationGuideSources } = await importTypeScript(new URL('./integration-directory.ts', import.meta.url));
const { catalogDirectory, filterCatalog, catalogSource } = await importTypeScript(new URL('./catalog.ts', import.meta.url));

test('directory guides never create executable MCP candidates or mutate the supplied candidate list', () => {
  const candidates = [{ id: 'custom', name: 'Company server', authMethods: ['oauth'] }];
  const snapshot = structuredClone(candidates);
  const merged = catalogDirectory(candidates);
  assert.deepEqual(candidates, snapshot);
  assert.deepEqual(merged.filter((row) => !row.guideOnly), candidates);
  assert.equal(new Set(merged.map((row) => row.id)).size, merged.length);
  assert.equal(merged.some((row) => row.id === 'default-orca-oracle-ords'), false, 'remote records must be supplied by the backend');
  assert.ok(integrationGuideSources().every((row) => row.guideOnly && row.id.startsWith('guide-')));
});

test('MCP and API references remain distinct and searchable by work and common brand aliases', () => {
  const rows = catalogDirectory([]);
  assert.deepEqual(filterCatalog(rows, 'LINE').filter((row) => row.name.startsWith('LINE')).map((row) => row.protocol).sort(), ['API', 'MCP']);
  assert.equal(filterCatalog(rows, 'IG', 'social-media').some((row) => row.name === 'Instagram API'), true);
  assert.equal(filterCatalog(rows, 'Shopee', 'ecommerce').some((row) => row.protocol === 'API'), true);
  assert.equal(filterCatalog(rows, 'Shopee', 'communication').length, 0);
  assert.equal(filterCatalog(rows, 'TikTok', 'ecommerce').some((row) => row.name === 'TikTok Shop API'), true);
  const oracle = catalogSource({ id: 'default-orca-oracle-ords', name: 'Oracle ORDS MCP', authMethods: ['oauth'] });
  assert.equal(oracle.guideOnly, false);
  assert.ok(oracle.reference.requirements.length > 0);
});

test('each reference has bilingual setup scope, an official documentation link and a bundled logo', async () => {
  assert.equal(new Set(integrationReferences.map((row) => row.id)).size, integrationReferences.length);
  for (const row of integrationReferences) {
    assert.ok(row.requirements.length >= 2, row.name);
    assert.ok(row.description.every(Boolean) && row.scope.every(Boolean), row.name);
    assert.ok(row.docs.length > 0, row.name);
    for (const doc of row.docs) {
      const url = new URL(doc.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username + url.password, '');
    }
    await access(new URL(`../../../static${row.icon}`, import.meta.url));
  }
});
