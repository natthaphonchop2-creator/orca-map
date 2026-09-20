import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';
const { catalogDirectory, catalogSource, catalogSetupHref } = await importTypeScript(new URL('./catalog.ts', import.meta.url));

test('installed API connectors replace their guide while retaining the real configuration identity', () => {
  for (const [provider, guideID, name] of [
    ['facebook-pages', 'guide-facebook-pages-api', 'Facebook Pages API'],
    ['line-messaging', 'guide-line-messaging-api', 'LINE Messaging API'],
    ['instagram', 'guide-instagram-api', 'Instagram API']
  ]) {
    const source = { id: `default-orca-api-${provider}`, name, protocol: 'API', managedProvider: provider, authMethods: ['secrets'] };
    const directory = catalogDirectory([source]);
    assert.equal(directory.some(item => item.id === guideID), false);
    const item = catalogSource(directory.find(item => item.id === source.id));
    assert.equal(item.guideOnly, false);
    assert.equal(item.protocol, 'API');
    assert.equal(item.reference.id, guideID);
    assert.deepEqual(item.authTags.map(tag => tag.id), ['secrets']);
    assert.match(catalogSetupHref(item.id), new RegExp(`source=${source.id}$`));
  }
});

test('provider names and unrecognized metadata cannot hide a setup guide or create an API connection', () => {
  const impostors = [
    { id: 'custom', name: 'Facebook Pages API', protocol: 'API', managedProvider: 'facebook-pages' },
    { id: 'default-orca-api-facebook-pages', name: 'Facebook Pages API', protocol: 'MCP', managedProvider: 'facebook-pages' },
    { id: 'default-orca-api-facebook-pages', name: 'Facebook Pages API', protocol: 'API', managedProvider: 'custom' }
  ];
  for (const source of impostors) {
    assert.equal(catalogDirectory([source]).some(item => item.id === 'guide-facebook-pages-api'), true);
    assert.equal(catalogSource(source).reference, undefined);
  }
});
