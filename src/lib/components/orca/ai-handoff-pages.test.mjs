// W1-B4 (C4 design §14h): the sign-in page in AI mode, the hand-off page
// /login/ai (rendered, and its script run with stand-in answers), the
// LINE/Facebook notice in AI mode and the audit label.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const handoff = await importTypeScript(new URL('../../orca/ai-handoff.ts', import.meta.url));
const google = await importTypeScript(new URL('../../orca/google-signin.ts', import.meta.url));
const inApp = await importTypeScript(new URL('../../orca/in-app-browser.ts', import.meta.url));
const copy = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));
const require = createRequire(import.meta.url);
const internal = pathToFileURL(require.resolve('svelte/internal/client')).href;

const files = {
	login: new URL('../../../routes/login/+page.svelte', import.meta.url),
	handoff: new URL('../../../routes/login/ai/+page.svelte', import.meta.url),
	notice: new URL('./InAppBrowserNotice.svelte', import.meta.url),
	audit: new URL('./Audit.svelte', import.meta.url)
};
const CODE = 'Syn7hetic-hand_off-code-0123456789abcdefghi';
const th = (thai) => thai;
// localeHref adds the page's language, which is what AI mode must never do to its rd.
const localeHref = (path) => `${path}${path.includes('?') ? '&' : '?'}lang=th`;
const local = { id: 'local-auth-provider', name: 'Local', namespace: 'default' };
const text = (html) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

async function loginPage(url, data) {
	const notices = [];
	const { warnings, Component } = await serverComponent(files.login, {
		...google,
		...handoff,
		page: { url: new URL(url, 'https://workspace.example.test') },
		LOCAL_AUTH_MIN_PASSWORD_LENGTH: 12,
		InAppBrowserNotice: (_renderer, props) => notices.push(props),
		initializeLocale: () => {},
		localeHref,
		orcaLocale: { value: 'th' },
		t: th,
		onMount: () => {}
	});
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { data: { authProviders: [local], unavailable: false, google: true, signedIn: false, ...data } } }).body;
	return { html, notices };
}

test('AI-mode sign-in: the note, the fixed rd for the password and for Google, and the backup page', async () => {
	const { html, notices } = await loginPage('/login?ai=1&lang=th', { rd: '/login/ai?signed=1', ai: true });
	assert.match(text(html), /เข้าสู่ระบบ เพื่อให้แอป AI ของคุณเชื่อมกับ ORCA/);
	// The rd is the constant, never passed through localeHref (Codex review 57, MAJOR 2).
	assert.match(html, /<input type="hidden" name="rd" value="\/login\/ai\?signed=1"\/?>/);
	const googleHref = html.match(/<a class="o-button outline o-google" href="([^"]+)"/)[1].replaceAll('&amp;', '&');
	const start = new URL(googleHref, 'https://workspace.example.test');
	assert.equal(start.pathname, '/oauth2/start');
	assert.equal(start.searchParams.get('rd'), '/login/ai?signed=1');
	assert.equal(start.searchParams.get('via'), 'google');
	assert.match(html, /<a href="\/orca\/oauth\/fallback" data-sveltekit-reload="">ใช้หน้าเข้าสู่ระบบสำรอง<\/a>/);
	// The LINE/Facebook notice stays, in its AI-mode words.
	assert.deepEqual(notices.map((props) => props.aiSignIn), [true]);
	// The rest of the page is the usual one: the Google button, the password form, the website links.
	assert.match(html, /<form method="POST" action="\/oauth2\/start">/);
	assert.match(html, /href="\/home\?to=start&amp;lang=th"/);
});

test('an ordinary sign-in keeps its own return and shows nothing of AI mode', async () => {
	const { html, notices } = await loginPage('/login?rd=%2Fapp', { rd: '/app?view=members', ai: false });
	assert.match(html, /<input type="hidden" name="rd" value="\/app\?view=members&amp;lang=th"\/?>/);
	assert.doesNotMatch(html, /แอป AI|\/orca\/oauth\/fallback|o-login-ai/);
	assert.deepEqual(notices.map((props) => props.aiSignIn), [false]);
});

test('a signed-in visitor back from a refused Google sign-in returns to the hand-off page, not the rd', async () => {
	const { html } = await loginPage('/login?rd=%2Flogin%2Fai%3Fsigned%3D1&error=google_member', { rd: '/login/ai?signed=1', ai: true, signedIn: true });
	assert.match(html, /<a class="o-link" href="\/login\/ai">กลับไปหน้าเดิม<\/a>/);
});

// ---------------------------------------------------------------------------
// /login/ai, rendered
// ---------------------------------------------------------------------------

async function handoffPage(data) {
	const { warnings, Component } = await serverComponent(files.handoff, {
		...handoff,
		page: { url: new URL('https://workspace.example.test/login/ai'), state: {} },
		initializeLocale: () => {},
		localeHref,
		orcaLocale: { value: 'th' },
		t: th,
		onMount: () => {},
		reloadForAccount: () => false,
		replaceState: () => {}
	});
	assert.deepEqual(warnings, []);
	return render(Component, { props: { data: { expired: false, signed: false, signedIn: true, account: '41', email: 'member@example.test', ...data } } }).body;
}

test('signed in: continue as this account is the one primary action, with another account and cancel beside it', async () => {
	const html = await handoffPage({});
	assert.match(text(html), /แอป AI ขอเชื่อมกับ ORCA/);
	assert.match(html, /<h1 id="ai-handoff-title" tabindex="-1">เชื่อมแอป AI ด้วยบัญชีนี้<\/h1>/);
	assert.match(text(html), /เข้าสู่ระบบอยู่ในชื่อ member@example\.test/);
	assert.equal((html.match(/class="o-button"/g) ?? []).length, 1, 'one primary');
	assert.match(html, /<button type="button" class="o-button"[^>]*><span class="o-handoff-label">ดำเนินการต่อในชื่อ member@example\.test<\/span>/);
	assert.match(html, /<a class="o-button outline" href="\/oauth2\/sign_out\?rd=%2Flogin%3Fai%3D1" data-sveltekit-reload="">ใช้บัญชีอื่น<\/a>/);
	assert.match(html, /<button type="button" class="o-handoff-cancel"[^>]*>ยกเลิก<\/button>/);
	assert.match(html, /href="\/orca\/oauth\/fallback" data-sveltekit-reload=""/);
	// The page never shows a company, an AI app's name or a state: it has none.
	assert.doesNotMatch(html, /state=|client_id|บริษัท ตัวอย่าง/);
	// The page is dark like /login: it wears the sign-in page's classes.
	assert.match(html, /<div class="orca o-auth-page o-login o-login-handoff"/);
});

test('expired: start again from the AI app, with the backup page and no button to continue', async () => {
	const html = await handoffPage({ expired: true, signedIn: false, account: '', email: '' });
	assert.match(html, /<h1 id="ai-handoff-title" tabindex="-1">เริ่มเชื่อมใหม่จากแอป AI<\/h1>/);
	assert.match(text(html), /การเชื่อมแอป AI หมดเวลา หรือเริ่มจากเบราว์เซอร์อื่น/);
	assert.doesNotMatch(html, /class="o-button|ดำเนินการต่อในชื่อ/);
	assert.match(html, /href="\/orca\/oauth\/fallback"/);
});

// ---------------------------------------------------------------------------
// /login/ai, its script run with stand-in answers
// ---------------------------------------------------------------------------

const script = stripTypeScriptTypes((await readFile(files.handoff, 'utf8')).match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[\s\S]*?;$/gm, '')
	.replace('$props()', '$state(testProps)');
const deps = ['page', 'replaceState', 'initializeLocale', 'localeHref', 'orcaLocale', 't', 'onMount', 'tick', 'reloadForAccount', 'mintHandoff', 'shouldContinueBySelf', 'AI_LOGIN'];
const harness = (
	await import(
		'data:text/javascript;base64,' +
			Buffer.from(
				compileModule(`export function harness(testProps, deps) { const { ${deps.join(', ')} } = deps; ${script}; return { run, get state() { return { busy, problem, expired, notMember }; } }; }`, {
					filename: 'login-ai.harness.svelte.js',
					generate: 'client'
				}).js.code.replaceAll('svelte/internal/client', internal)
			).toString('base64')
	)
).harness;

function open(data, answers = [], { reload = false } = {}) {
	const calls = { mint: [], navigate: [], replaced: [], reloads: 0, focused: [] };
	globalThis.document = { getElementById: (id) => ({ focus: () => calls.focused.push(id) }) };
	let mount;
	calls.listeners = {};
	globalThis.window = {
		location: { replace: (href) => calls.navigate.push(href), reload: () => calls.reloads++ },
		sessionStorage: { getItem: () => null, setItem: () => {} },
		addEventListener: (name, fn) => (calls.listeners[name] = fn),
		removeEventListener: (name) => delete calls.listeners[name]
	};
	const view = harness(
		{ data: { expired: false, signed: false, signedIn: true, account: '41', email: 'member@example.test', ...data } },
		{
			page: { url: new URL(`https://workspace.example.test/login/ai${data.signed ? '?signed=1&lang=th' : ''}`), state: {} },
			replaceState: (url) => calls.replaced.push(String(url)),
			initializeLocale: () => {},
			localeHref,
			orcaLocale: { value: 'th' },
			t: th,
			onMount: (fn) => (mount = fn),
			tick: async () => {},
			reloadForAccount: () => {
				calls.reloads++;
				return reload;
			},
			mintHandoff: async (decision, account) => {
				calls.mint.push([decision, account]);
				return answers.shift() ?? { kind: 'retry' };
			},
			shouldContinueBySelf: handoff.shouldContinueBySelf,
			AI_LOGIN: handoff.AI_LOGIN
		}
	);
	return { view, calls, mount: () => mount?.() };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const redeem = { kind: 'redeem', href: `/orca/oauth/handoff?code=${CODE}` };

test('right after signing in the page continues once by itself, and drops signed=1 first', async () => {
	const { calls, mount } = open({ signed: true }, [redeem]);
	mount();
	await settle();
	assert.deepEqual(calls.replaced, ['https://workspace.example.test/login/ai?lang=th']);
	assert.deepEqual(calls.mint, [['continue', '41']]);
	assert.deepEqual(calls.navigate, [`/orca/oauth/handoff?code=${CODE}`]);
});

test('a plain visit, or one with the expired message, asks first', async () => {
	for (const data of [{}, { signed: true, expired: true }, { signed: true, signedIn: false }]) {
		const { calls, mount } = open(data);
		mount();
		await settle();
		assert.deepEqual(calls.mint, [], JSON.stringify(data));
	}
});

test('continue and cancel mint once each; nothing more while one is in flight or the page is leaving', async () => {
	let { view, calls } = open({}, [redeem, redeem]);
	const first = view.run('continue');
	await view.run('continue');
	await view.run('cancel');
	await first;
	assert.deepEqual(calls.mint, [['continue', '41']]);
	assert.deepEqual(calls.navigate, [redeem.href]);
	// Leaving with the code: the page stays busy, so no second code replaces it.
	assert.equal(view.state.busy, 'continue');
	await view.run('cancel');
	assert.deepEqual(calls.mint, [['continue', '41']]);
	// Back from ORCA's page out of the back-forward cache: the buttons work again.
	let mount;
	({ view, calls, mount } = open({}, [redeem]));
	const cleanup = mount();
	await view.run('continue');
	calls.listeners.pageshow({ persisted: false });
	assert.equal(view.state.busy, 'continue');
	calls.listeners.pageshow({ persisted: true });
	assert.equal(view.state.busy, '');
	cleanup();
	assert.equal(calls.listeners.pageshow, undefined);
	({ view, calls } = open({}, [redeem]));
	await view.run('cancel');
	assert.deepEqual(calls.mint, [['cancel', '41']]);
	assert.deepEqual(calls.navigate, [redeem.href]);
});

test('each refusal shows its own message, and nothing navigates without a code', async () => {
	let opened = open({}, [{ kind: 'not-member' }]);
	await opened.view.run('continue');
	assert.deepEqual([opened.view.state.notMember, opened.view.state.expired, opened.view.state.busy], [true, false, '']);
	// The pressed button is gone: focus starts again at the new title.
	assert.deepEqual(opened.calls.focused, ['ai-handoff-title']);
	opened = open({}, [{ kind: 'expired' }]);
	await opened.view.run('continue');
	assert.equal(opened.view.state.expired, true);
	assert.deepEqual(opened.calls.focused, ['ai-handoff-title']);
	opened = open({}, [{ kind: 'retry' }]);
	await opened.view.run('continue');
	assert.equal(opened.view.state.problem, 'retry');
	assert.deepEqual(opened.calls.focused, [], 'the button stays where it was');
	assert.deepEqual(opened.calls.navigate, []);
	// Signed out since the page opened: sign in again in AI mode.
	opened = open({}, [{ kind: 'signed-out' }]);
	await opened.view.run('continue');
	assert.deepEqual(opened.calls.navigate, ['/login?ai=1']);
	// Another tab's account: the page opens afresh as it, or says so when it can't.
	opened = open({}, [{ kind: 'account-changed' }], { reload: true });
	await opened.view.run('continue');
	assert.deepEqual([opened.calls.reloads, opened.view.state.problem], [1, '']);
	opened = open({}, [{ kind: 'account-changed' }], { reload: false });
	await opened.view.run('continue');
	assert.equal(opened.view.state.problem, 'account-changed');
});

test('the page goes nowhere but the code the module built, and names its account on every mint', async () => {
	const source = await readFile(files.handoff, 'utf8');
	assert.match(source, /const outcome = await mintHandoff\(decision, data\.account, \(input, init\) => fetch\(input, init\)\);/);
	assert.match(source, /if \(outcome\.kind === "redeem"\) return window\.location\.replace\(outcome\.href\);/);
	assert.equal((source.match(/window\.location\.(?:replace|assign|href)/g) ?? []).length, 2, 'the code, or back to /login?ai=1');
	assert.doesNotMatch(source, /\bsafeReturnPath\b|searchParams\.get\("(?:rd|next|url|redirect)"\)/);
});

// ---------------------------------------------------------------------------
// The LINE/Facebook notice in AI mode, and the audit label
// ---------------------------------------------------------------------------

test('in an in-app browser an AI sign-in says to start again in Chrome or Safari, with no link to copy', async () => {
	const { warnings, Component } = await serverComponent(files.notice, { ...inApp, ...copy, t: th, onMount: () => {}, onDestroy: () => {} });
	assert.deepEqual(warnings, []);
	const props = { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 Safari Line/14.9.0', href: 'https://workspace.example.test/login?ai=1' };
	let html = render(Component, { props: { ...props, aiSignIn: true } }).body;
	assert.match(text(html), /LINE เปิดหน้านี้ในเบราว์เซอร์ของแอป/);
	assert.match(text(html), /ถ้าจะใช้ Google ให้เปิด Chrome หรือ Safari แล้วเริ่มเชื่อมใหม่จากแอป AI/);
	assert.doesNotMatch(html, /openExternalBrowser|คัดลอกลิงก์/);
	// The ordinary sign-in keeps its buttons.
	html = render(Component, { props }).body;
	assert.match(html, /openExternalBrowser=1/);
	assert.match(html, /คัดลอกลิงก์/);
});

test('ตรวจสอบ names the hand-off event in plain words', async () => {
	const audit = await readFile(files.audit, 'utf8');
	assert.match(audit, /"ai\.signin\.handoff": t\("เข้าสู่ระบบเพื่อเชื่อมแอป AI", "Signed in to connect an AI app"\)/);
});

test('a signed-out visit is the page\'s own to handle: the layout never sends it elsewhere', async () => {
	const constants = await readFile(new URL('../../constants.ts', import.meta.url), 'utf8');
	assert.match(constants.match(/UNAUTHORIZED_PATHS = new Set\(\[([\s\S]*?)\]\)/)[1], /'\/login\/ai'/);
});
