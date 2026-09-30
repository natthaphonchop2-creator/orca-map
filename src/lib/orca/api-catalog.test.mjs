import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';
const { catalogDirectory, catalogSource, catalogSetupHref } = await importTypeScript(new URL('./catalog.ts', import.meta.url));

test('installed API connectors replace their guide while retaining the real configuration identity', () => {
  for (const [provider, guideID, name] of [
    ['facebook-pages', 'guide-facebook-pages-api', 'Facebook Pages API'],
    ['line-messaging', 'orca-native-line-messaging', 'LINE Messaging API'],
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
    assert.match(catalogSetupHref(item.id), new RegExp(`source=${source.id}&step=connect$`));
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

test('LINE: the native connector is its own reference (no guide row), and only the backend record gets it', () => {
  const native = { id: 'default-orca-api-line-messaging', name: 'LINE Messaging API', protocol: 'API', managedProvider: 'line-messaging', authMethods: ['secrets'] };
  const directory = catalogDirectory([native]);
  assert.deepEqual(directory.filter((item) => item.name === 'LINE Messaging API').map((item) => item.id), [native.id], 'no guide-only LINE Messaging API row, installed or not');
  assert.equal(catalogDirectory([]).some((item) => item.name === 'LINE Messaging API'), false);
  const item = catalogSource(native);
  assert.equal(item.reference.id, 'orca-native-line-messaging');
  assert.equal(item.reference.guideOnly, undefined);
  assert.equal(item.categoryId, 'communication');
  assert.match(item.descriptionTh, /ส่งข้อความ/);
  assert.match(item.descriptionTh, /ผู้ดูแลอนุมัติ/);
  const copy = [...item.reference.requirements.flat(), ...item.reference.scope].join(' ');
  assert.doesNotMatch(copy, /bridge|ตัวเชื่อม HTTP MCP|does not send|ไม่ส่งข้อความ|อ่านข้อมูลเท่านั้น/);
  assert.match(copy, /LINE OA Manager/);
  assert.deepEqual(item.reference.docs.map((doc) => doc.url), ['https://developers.line.biz/en/reference/messaging-api/']);
  for (const impostor of [
    { ...native, id: 'custom-line' },
    { ...native, protocol: 'MCP' },
    { ...native, managedProvider: 'custom' }
  ]) {
    assert.equal(catalogSource(impostor).reference, undefined, JSON.stringify(impostor));
  }
});
