// W1-B4 (C4 design §14h): an AI app's ORCA sign-in on this workspace's login.
// The module's addresses and checks, the return path's one exception, and the
// two route loaders, with the failed-sign-in round trips that must keep AI mode.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const handoff = await importTypeScript(new URL('./ai-handoff.ts', import.meta.url));
const { safeReturnPath } = await importTypeScript(new URL('./navigation.ts', import.meta.url));
const { googleSignInReason } = await importTypeScript(new URL('./google-signin.ts', import.meta.url));
const { ORCA_ACCOUNT_HEADER } = await importTypeScript(new URL('../services/writes.ts', import.meta.url));

// Synthetic 43-character codes in the backend's format (orcaRandom: base64url of 32 bytes).
const CODE = 'Syn7hetic-hand_off-code-0123456789abcdefghi';
assert.equal(CODE.length, 43);

const redirect = (status, location) => ({ status, location });
async function loader(path, deps) {
	const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'))
		.replace(/^import[^;]+;\s*/gm, '')
		.replaceAll('export const ', 'const ');
	return new Function(...Object.keys(deps), `${source};return load;`)(...Object.values(deps));
}
const run = (load, url, profile) => load({ url: new URL(url, 'https://workspace.example.test'), parent: async () => ({ profile }), fetch: () => {} });
const member = { id: '41', email: 'member@example.test', loaded: true, unauthorized: false };
const signedOut = { unauthorized: true };

test('the return path admits the hand-off page with signed=1 and a language only', () => {
	for (const [value, expected] of [
		['/login/ai', '/login/ai'],
		['/login/ai?signed=1', '/login/ai?signed=1'],
		['/login/ai?lang=th', '/login/ai?lang=th'],
		['/login/ai?lang=en', '/login/ai?lang=en'],
		['/login/ai?signed=1&lang=th', '/login/ai?signed=1&lang=th'],
		['/login/ai?lang=en&signed=1', '/login/ai?lang=en&signed=1']
	])
		assert.equal(safeReturnPath(value), expected, value);
	for (const value of [
		'/login',
		'/login?ai=1',
		'/login/local',
		'/login/ai/x',
		'/login/aix',
		'/login/ai?next=//evil.example',
		'/login/ai?signed=1&next=%2F%2Fevil.example',
		'/login/ai?signed=1&signed=1',
		'/login/ai?lang=th&lang=en',
		'/login/ai?signed=2',
		'/login/ai?signed',
		'/login/ai?lang=fr',
		'/login/ai?error=expired',
		'/login/ai#top',
		'/login%2Fai',
		'//login/ai',
		'https://evil.example/login/ai'
	])
		assert.equal(safeReturnPath(value), '/app', value);
	// Everything else keeps the old rule.
	assert.equal(safeReturnPath('/app?view=members'), '/app?view=members');
});

test('a code is exactly the backend\'s format, and the page goes only to the constant redemption path', () => {
	assert.equal(handoff.validHandoffCode(CODE), true);
	for (const bad of [CODE.slice(1), CODE + 'x', CODE.slice(0, 42) + '+', CODE.slice(0, 42) + '/', CODE.slice(0, 42) + '=', CODE.slice(0, 42) + '%', ` ${CODE.slice(1)}`, '', null, undefined, 43, { code: CODE }, `https://evil.example/${CODE}`.slice(0, 43)])
		assert.equal(handoff.validHandoffCode(bad), false, String(bad));
	assert.equal(handoff.handoffRedeemHref(CODE), `/orca/oauth/handoff?code=${CODE}`);
	assert.equal(handoff.handoffRedeemHref('../../evil'), undefined);
	assert.equal(handoff.AI_HANDOFF_REDEEM_PATH, '/orca/oauth/handoff');
	assert.equal(handoff.AI_HANDOFF_MINT_PATH, '/api/orca/ai-sign-in/handoff');
	assert.equal(handoff.AI_HANDOFF_FALLBACK, '/orca/oauth/fallback');
	assert.equal(handoff.AI_HANDOFF_RETURN, '/login/ai?signed=1');
	assert.equal(handoff.AI_LOGIN, '/login?ai=1');
	// "ใช้บัญชีอื่น": sign out here and sign in again in AI mode.
	assert.equal(handoff.AI_SWITCH_ACCOUNT, '/oauth2/sign_out?rd=%2Flogin%3Fai%3D1');
});

test('AI mode is ai=1 or a return to the hand-off page; the page\'s own parameters are exact', () => {
	const mode = (query) => handoff.aiLoginMode(new URLSearchParams(query));
	for (const query of ['ai=1', 'ai=1&lang=th', 'rd=%2Flogin%2Fai%3Fsigned%3D1', 'rd=%2Flogin%2Fai&error=1', 'rd=/login/ai?signed=1&error=google_member']) assert.equal(mode(query), true, query);
	for (const query of ['', 'ai=0', 'ai=true', 'rd=%2Fapp', 'rd=%2F%2Flogin%2Fai', 'rd=https%3A%2F%2Fevil.example%2Flogin%2Fai', 'rd=%2Flogin%2Fai%2Fx']) assert.equal(mode(query), false, query);
	const params = (query) => handoff.handoffPageParams(new URLSearchParams(query));
	assert.deepEqual(params(''), { expired: false, signed: false });
	assert.deepEqual(params('signed=1'), { expired: false, signed: true });
	assert.deepEqual(params('error=expired'), { expired: true, signed: false });
	assert.deepEqual(params('signed=1&signed=1'), { expired: false, signed: false });
	assert.deepEqual(params('signed=true&error=other'), { expired: false, signed: false });
});

test('the page continues by itself once, right after signing in, and only when signed in', () => {
	const go = (page) => handoff.shouldContinueBySelf({ signed: true, signedIn: true, expired: false, tried: false, ...page });
	assert.equal(go({}), true);
	assert.equal(go({ signed: false }), false, 'a plain visit asks first');
	assert.equal(go({ signedIn: false }), false);
	assert.equal(go({ expired: true }), false);
	assert.equal(go({ tried: true }), false, 'never twice');
});

test('the mint\'s answers map to what the page says; only the code is ever read from a 200', () => {
	const out = (status, body, json) => handoff.handoffOutcome(status, body, json);
	assert.deepEqual(out(200, '', { code: CODE, expiresIn: 120 }), { kind: 'redeem', href: `/orca/oauth/handoff?code=${CODE}` });
	// A server-supplied address is ignored: the path is the page's constant.
	assert.deepEqual(out(200, '', { code: CODE, url: 'https://evil.example/', location: 'https://evil.example/' }), { kind: 'redeem', href: `/orca/oauth/handoff?code=${CODE}` });
	assert.deepEqual(out(200, '', { url: 'https://evil.example/' }), { kind: 'retry' });
	assert.deepEqual(out(200, '', { code: 'short' }), { kind: 'retry' });
	assert.deepEqual(out(200, '', null), { kind: 'retry' });
	// The server writes its refusals as plain text (http.Error adds a newline).
	assert.deepEqual(out(403, 'not_member\n'), { kind: 'not-member' });
	assert.deepEqual(out(403, 'sign in to the ORCA workspace in a browser\n'), { kind: 'retry' });
	for (const body of ['handoff_expired\n', 'handoff_unavailable\n', 'not found\n']) assert.deepEqual(out(404, body), { kind: 'expired' }, body);
	assert.deepEqual(out(412, 'orca_account_changed\n'), { kind: 'account-changed' });
	assert.deepEqual(out(412, 'something else'), { kind: 'retry' });
	assert.deepEqual(out(401, 'unauthorized'), { kind: 'signed-out' });
	for (const status of [400, 413, 415, 428, 500, 502, 503]) assert.deepEqual(out(status, 'x'), { kind: 'retry' }, String(status));
	// The company is suspended or closed: only its signed-in member gets 423,
	// and the page says so with the fixed message (platform console C6 §4.2).
	assert.deepEqual(out(423, 'orca_company_suspended\n'), { kind: 'stopped', status: 'suspended' });
	assert.deepEqual(out(423, 'orca_company_closed\n'), { kind: 'stopped', status: 'closed' });
});

test('the mint names the page\'s account, posts one decision as JSON, and asks nothing without an account', async () => {
	const calls = [];
	const answer = (status, body) => async (input, init) => {
		calls.push({ input, init });
		return { status, text: async () => body };
	};
	let outcome = await handoff.mintHandoff('continue', '41', answer(200, JSON.stringify({ code: CODE, expiresIn: 120 })));
	assert.deepEqual(outcome, { kind: 'redeem', href: `/orca/oauth/handoff?code=${CODE}` });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].input, '/api/orca/ai-sign-in/handoff');
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.credentials, 'same-origin');
	assert.equal(calls[0].init.cache, 'no-store');
	assert.equal(calls[0].init.headers[ORCA_ACCOUNT_HEADER], '41');
	assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
	assert.equal(calls[0].init.headers.Authorization, undefined, 'a browser session only, never a key');
	assert.equal(calls[0].init.body, '{"decision":"continue"}');
	outcome = await handoff.mintHandoff('cancel', '41', answer(403, 'not_member\n'));
	assert.equal(calls[1].init.body, '{"decision":"cancel"}');
	assert.deepEqual(outcome, { kind: 'not-member' });
	assert.deepEqual(await handoff.mintHandoff('continue', '', answer(200, '{}')), { kind: 'retry' });
	assert.equal(calls.length, 2, 'no account, no request');
	assert.deepEqual(await handoff.mintHandoff('continue', '41', async () => { throw new TypeError('offline'); }), { kind: 'retry' });
	assert.deepEqual(await handoff.mintHandoff('continue', '41', answer(200, '<html>')), { kind: 'retry' });
});

// ---------------------------------------------------------------------------
// The loaders
// ---------------------------------------------------------------------------

const loginDeps = {
	safeReturnPath,
	googleSignInReason,
	redirect,
	UserService: { listAuthProviders: async () => [{ id: 'local-auth-provider', name: 'Local' }] },
	aiLoginMode: handoff.aiLoginMode,
	AI_HANDOFF_PAGE: handoff.AI_HANDOFF_PAGE,
	AI_HANDOFF_RETURN: handoff.AI_HANDOFF_RETURN
};
const login = await loader('../../routes/login/+page.ts', loginDeps);
const legacy = await loader('../../routes/login/local/+page.ts', { safeReturnPath, redirect });

test('AI-mode sign-in returns to the fixed hand-off address, whatever the query says', async () => {
	for (const url of ['/login?ai=1', '/login?ai=1&lang=th', '/login?ai=1&rd=%2F%2Fevil.example', '/login?ai=1&rd=%2Fapp%3Fview%3Dmembers', '/login?rd=%2Flogin%2Fai%3Fsigned%3D1%26lang%3Den']) {
		const data = await run(login, url, signedOut);
		assert.equal(data.ai, true, url);
		assert.equal(data.rd, '/login/ai?signed=1', url);
	}
	const plain = await run(login, '/login?rd=%2Fapp%3Fview%3Dmembers', signedOut);
	assert.equal(plain.ai, false);
	assert.equal(plain.rd, '/app?view=members');
});

test('a wrong password and a refused Google sign-in come back still in AI mode', async () => {
	// localauth loginFailed: /login/local?rd=<rd>&error=<message>, which the workspace folds into /login.
	const rd = encodeURIComponent('/login/ai?signed=1');
	let folded;
	assert.throws(() => run(legacy, `/login/local?rd=${rd}&error=Incorrect+email+or+password.`), (result) => {
		folded = result.location;
		return result.status === 302;
	});
	const url = new URL(folded, 'https://workspace.example.test');
	assert.equal(url.searchParams.get('rd'), '/login/ai?signed=1');
	assert.equal(url.searchParams.get('error'), '1');
	let data = await run(login, folded, signedOut);
	assert.deepEqual([data.ai, data.rd], [true, '/login/ai?signed=1']);
	// localauth googleFailed: /login?rd=<rd>&error=google_<reason>.
	data = await run(login, `/login?rd=${rd}&error=google_member`, signedOut);
	assert.deepEqual([data.ai, data.rd], [true, '/login/ai?signed=1']);
	// A signed-in visitor whose Google sign-in failed sees why, still in AI mode.
	data = await run(login, `/login?rd=${rd}&error=google_workspace`, member);
	assert.deepEqual([data.ai, data.signedIn], [true, true]);
});

test('someone already signed in goes to the hand-off page to choose, not straight on', async () => {
	for (const url of ['/login?ai=1', `/login?rd=${encodeURIComponent('/login/ai?signed=1')}`])
		await assert.rejects(() => run(login, url, member), (result) => result.status === 302 && result.location === '/login/ai', url);
});

test('/login/ai sends a signed-out person to sign in, fixes the page\'s account and never needs one for the expired message', async () => {
	const fixed = [];
	const page = await loader('../../routes/login/ai/+page.ts', {
		AI_LOGIN: handoff.AI_LOGIN,
		handoffPageParams: handoff.handoffPageParams,
		setPageAccount: (id) => fixed.push(id),
		redirect
	});
	await assert.rejects(() => run(page, '/login/ai', signedOut), (result) => result.status === 302 && result.location === '/login?ai=1');
	await assert.rejects(() => run(page, '/login/ai?signed=1&lang=en', signedOut), (result) => result.location === '/login?ai=1&lang=en');
	await assert.rejects(() => run(page, '/login/ai?lang=%2F%2Fevil', signedOut), (result) => result.location === '/login?ai=1');
	assert.deepEqual(fixed, []);
	assert.deepEqual(await run(page, '/login/ai?error=expired', signedOut), { expired: true, signed: false, signedIn: false, account: '', email: '' });
	assert.deepEqual(await run(page, '/login/ai?signed=1', member), { expired: false, signed: true, signedIn: true, account: '41', email: 'member@example.test' });
	assert.deepEqual(fixed, ['41']);
});
