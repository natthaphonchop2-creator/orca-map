import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';
const { apiConnectorSetup } = await importTypeScript(new URL('./api-connector-setup.ts', import.meta.url));

test('native setup identifies the specific account credential and resource ID instead of requesting a password', () => {
  const facebook = apiConnectorSetup('default-orca-api-facebook-pages');
  assert.match(facebook.fields.Authorization.label[0], /โทเคนของเพจ Facebook/);
  assert.match(facebook.fields.Authorization.hint[0], /ไม่ใช่รหัสผ่าน Facebook/);
  assert.equal(facebook.fields.FACEBOOK_PAGE_ID.numeric, true);
  const instagram = apiConnectorSetup('default-orca-api-instagram');
  assert.match(instagram.fields.Authorization.hint[1], /Instagram User access token/);
  assert.match(instagram.fields.Authorization.hint[1], /Do not enter a Facebook Page token/);
  assert.equal(instagram.fields.INSTAGRAM_ACCOUNT_ID.numeric, true);
  const line = apiConnectorSetup('default-orca-api-line-messaging');
  assert.deepEqual(Object.keys(line.fields), ['Authorization']);
  assert.equal(line.fields.Authorization.href, 'https://developers.line.biz/console/');
  for (const guide of [facebook, instagram, line]) {
    for (const field of Object.values(guide.fields)) {
      assert.equal(new URL(field.href).protocol, 'https:');
      assert.ok(field.label[0] && field.label[1] && field.hint[0] && field.hint[1]);
    }
  }
});

test('native account help is never applied to similarly named custom sources', () => {
  for (const id of ['Facebook Pages', 'custom-default-orca-api-facebook-pages', 'default-orca-meta-social-technologies', '__proto__', 'toString']) {
    assert.equal(apiConnectorSetup(id), undefined);
  }
});

test('known native API failures explain the next action without echoing unrecognized provider text', async () => {
  const { apiConnectorError } = await importTypeScript(new URL('./api-connector-setup.ts', import.meta.url));
  assert.match(apiConnectorError('the API token is invalid or expired; replace it and test again')[0], /คัดลอกโทเคนใหม่/);
  assert.match(apiConnectorError('invalid ORCA workspace input: enter the numeric account ID, not a username or URL')[0], /เป็นตัวเลข/);
  assert.equal(apiConnectorError('unknown custom source error'), undefined);
});
