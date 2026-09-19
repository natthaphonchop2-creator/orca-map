import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const navigation = stripTypeScriptTypes(await readFile(new URL('./navigation.ts', import.meta.url), 'utf8'));
const { safeReturnPath } = await import('data:text/javascript;base64,' + Buffer.from(navigation).toString('base64'));
const redirect = (status, location) => ({ status, location });
async function route(path, providers = []) {
  const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[^;]+;\s*/gm, '').replaceAll('export const ', 'const ');
  return new Function('safeReturnPath', 'redirect', 'UserService', source + ';return load;')(
    safeReturnPath, redirect, { listAuthProviders: async () => providers });
}
const legacy = await route('../../routes/login/local/+page.ts');
const page = await route('../../routes/login/+page.ts', [{ id: 'local-auth-provider', name: 'Local' }]);
const run = (load, url, profile) => load({ url: new URL(url, 'https://app.example.test'), parent: async () => ({ profile }), fetch: () => {} });

test('legacy email and failed-login entry returns to one form preserving destination and language', () => {
  assert.throws(() => run(legacy, '/login/local?rd=%2Fapp%3Fview%3Dcatalog%26lang%3Den&lang=en&error=backend-detail&password=discard'),
    (result) => {
      assert.equal(result.status, 302);
      const url = new URL(result.location, 'https://app.example.test');
      assert.equal(url.pathname, '/login');
      assert.equal(url.searchParams.get('rd'), '/app?view=catalog&lang=en');
      assert.equal(url.searchParams.get('lang'), 'en');
      assert.equal(url.searchParams.get('error'), '1');
      assert.equal(url.searchParams.has('password'), false);
      return true;
    });
});
test('legacy return cannot send a user to another host or loop through login', () => {
  for (const destination of ['//other.example', 'https://other.example', '/login/local', '/%2fother.example']) {
    assert.throws(() => run(legacy, '/login/local?rd=' + encodeURIComponent(destination)),
      (result) => result.location === '/login?rd=%2Fapp');
  }
});
test('an authenticated user bypasses the unified sign-in form to the requested page', async () => {
  await assert.rejects(() => run(page, '/login?rd=%2Fapp%3Fview%3Dcatalog', { loaded: true, unauthorized: false }),
    (result) => result.status === 302 && result.location === '/app?view=catalog');
});
test('an anonymous user remains on the unified form with configured providers', async () => {
  const result = await run(page, '/login?rd=%2Fapp%3Fview%3Dcatalog', { unauthorized: true });
  assert.equal(result.rd, '/app?view=catalog');
  assert.deepEqual(result.authProviders, [{ id: 'local-auth-provider', name: 'Local' }]);
  assert.equal(result.unavailable, false);
});
