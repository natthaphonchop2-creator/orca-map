import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const navigation = stripTypeScriptTypes(await readFile(new URL('./navigation.ts', import.meta.url), 'utf8'));
const { safeReturnPath, loginHref } = await import('data:text/javascript;base64,' + Buffer.from(navigation).toString('base64'));
const googleSignIn = stripTypeScriptTypes(await readFile(new URL('./google-signin.ts', import.meta.url), 'utf8'));
const { googleSignInReason } = await import('data:text/javascript;base64,' + Buffer.from(googleSignIn).toString('base64'));
const aiHandoff = await importTypeScript(new URL('./ai-handoff.ts', import.meta.url));
const redirect = (status, location) => ({ status, location });
async function route(path, providers = []) {
  const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[^;]+;\s*/gm, '').replaceAll('export const ', 'const ');
  return new Function('safeReturnPath', 'googleSignInReason', 'redirect', 'UserService', 'aiLoginMode', 'AI_HANDOFF_PAGE', 'AI_HANDOFF_RETURN', source + ';return load;')(
    safeReturnPath, googleSignInReason, redirect, { listAuthProviders: async () => providers }, aiHandoff.aiLoginMode, aiHandoff.AI_HANDOFF_PAGE, aiHandoff.AI_HANDOFF_RETURN);
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
test('a signed-in user whose Google sign-in failed sees why before going back', async () => {
  const result = await run(page, '/login?rd=%2Finvite%2Ftoken&error=google_workspace', { loaded: true, unauthorized: false });
  assert.equal(result.signedIn, true);
  assert.equal(result.rd, '/invite/token');
  await assert.rejects(() => run(page, '/login?rd=%2Fapp&error=1', { loaded: true, unauthorized: false }),
    (redirected) => redirected.status === 302 && redirected.location === '/app', 'other errors still send a signed-in user back');
});
test('an anonymous user remains on the unified form with configured providers', async () => {
  const result = await run(page, '/login?rd=%2Fapp%3Fview%3Dcatalog', { unauthorized: true });
  assert.equal(result.rd, '/app?view=catalog');
  assert.deepEqual(result.authProviders, [{ id: 'local-auth-provider', name: 'Local' }]);
  assert.equal(result.unavailable, false);
});

test('an expired session signs in again and returns to the same view', async () => {
  const href = loginHref({ pathname: '/app', search: '?view=members&tab=invitations' });
  assert.equal(href, '/login?rd=%2Fapp%3Fview%3Dmembers%26tab%3Dinvitations');
  const back = await run(page, href, { loaded: true, unauthorized: false }).catch((result) => result);
  assert.deepEqual(back, { status: 302, location: '/app?view=members&tab=invitations' });
  // Both places that send an expired session to sign-in use the same address.
  for (const path of ['../services/http.ts', '../components/ReLoginDialog.svelte']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /window\.location\.href = loginHref\(window\.location\);/, path);
    assert.doesNotMatch(source, /login\?rd=/, path);
  }
});
