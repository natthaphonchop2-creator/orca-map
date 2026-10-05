import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';

// The real module, compiled the way Vite compiles a .svelte.ts file.
const require = createRequire(import.meta.url);
const source = stripTypeScriptTypes(await readFile(new URL('./program-connector.svelte.ts', import.meta.url), 'utf8'));
const compiled = compileModule(source, { filename: 'program-connector.svelte.js', generate: 'client' }).js.code.replaceAll(
	'svelte/internal/client',
	pathToFileURL(require.resolve('svelte/internal/client')).href
);
const { ProgramConnector, safeSignInURL, validAccountURL } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const setup = (extra = {}) => ({
	sourceID: 'src', name: 'FlowAccount', runtime: 'remote', kind: 'shared', fields: [], requiresURL: false,
	configured: false, oauthSupported: true, oauthConnected: false, oauthClientRequired: true, oauthClientConfigured: true,
	setupStatus: 'available', oauthRedirectURL: 'https://orca.example/cb', ...extra
});
function fakeBrowser() {
	const opened = [];
	const listeners = { focus: new Set(), visibility: new Set() };
	const timers = new Map();
	let next = 1;
	return {
		opened, listeners, timers,
		open(url, target) {
			const popup = { url, target, opener: 'orca', closed: false, document: { title: '', body: { textContent: '' } }, location: { replace(to) { popup.url = to; } }, close() { popup.closed = true; } };
			opened.push(popup);
			return popup;
		},
		setInterval(callback, ms) { const id = next++; timers.set(id, { callback, ms }); return id; },
		clearInterval(id) { timers.delete(id); },
		addEventListener(_type, listener) { listeners.focus.add(listener); },
		removeEventListener(_type, listener) { listeners.focus.delete(listener); },
		visible: () => true,
		onVisibility(listener) { listeners.visibility.add(listener); return () => listeners.visibility.delete(listener); }
	};
}
function connector(service = {}, extra = {}) {
	const calls = [];
	const browser = fakeBrowser();
	const ready = [];
	const record = (name, fn) => async (...args) => { calls.push([name, ...args]); return fn(...args); };
	const view = new ProgramConnector({
		service: {
			sourceSetup: record('setup', service.sourceSetup ?? (async () => setup())),
			configureSource: record('configure', service.configureSource ?? (async () => setup({ configured: true }))),
			checkSource: record('check', service.checkSource ?? (async () => ({ ready: false, oauthRequired: true }))),
			startSourceOAuth: record('oauth', service.startSourceOAuth ?? (async () => ({ oauthURL: 'https://flowaccount.example/authorize?x=1' }))),
			disconnectSourceOAuth: record('disconnect', service.disconnectSourceOAuth ?? (async () => ({ disconnected: true })))
		},
		errorText: (cause) => cause.message,
		t: (th) => th,
		programName: () => 'FlowAccount',
		browser,
		onready: async (id) => { ready.push(id); },
		...extra
	});
	return { view, calls, browser, ready };
}

test('each account state is one phase of step 2', async () => {
	const cases = [
		[setup(), 'signin'],
		[setup({ oauthConnected: true, configured: true }), 'connected'],
		[setup({ oauthClientConfigured: false }), 'unavailable'],
		[setup({ setupStatus: 'review_required' }), 'unavailable'],
		// A record with no field reads as configured; without a grant it still waits (Codex review of deploy41).
		[setup({ setupStatus: 'review_required', configured: true }), 'unavailable'],
		[setup({ setupStatus: 'review_required', configured: true, oauthConnected: true }), 'connected'],
		[setup({ setupStatus: 'review_required', oauthSupported: false, configured: true, fields: [{ key: 'TOKEN', name: 'Token', description: '', required: true, sensitive: true }] }), 'connected'],
		[setup({ oauthSupported: false, fields: [{ key: 'TOKEN', name: 'Token', description: '', required: true, sensitive: true }] }), 'fields'],
		[setup({ oauthSupported: false, configured: true, fields: [{ key: 'TOKEN', name: 'Token', description: '', required: true, sensitive: true }] }), 'connected'],
		[setup({ oauthSupported: false, oauthClientRequired: false, configured: true }), 'check']
	];
	for (const [value, phase] of cases) {
		const { view } = connector({ sourceSetup: async () => value });
		assert.equal(view.phase, 'idle');
		await view.load('src');
		assert.equal(view.phase, phase, JSON.stringify(value));
	}
	const { view } = connector({ sourceSetup: async () => { throw new Error('no setup'); } });
	await view.load('src');
	assert.equal(view.phase, 'failed');
	assert.equal(view.error, 'no setup');
});

test('signing in opens the window during the click, cuts its opener, and waits for the grant', async () => {
	const { view, calls, browser } = connector();
	await view.load('src');
	const open = browser.open;
	let requestsWhenOpened = -1;
	browser.open = (...args) => { requestsWhenOpened = calls.length; return open(...args); };
	const pending = view.signIn();
	// Reserved before any request of the click, so a popup blocker never stops it.
	assert.equal(browser.opened.length, 1);
	assert.equal(requestsWhenOpened, 1, 'only the earlier setup load');
	assert.equal(browser.opened[0].url, 'about:blank');
	assert.equal(browser.opened[0].opener, null);
	await pending;
	assert.deepEqual(calls.map((call) => call[0]), ['setup', 'configure', 'check', 'setup', 'oauth']);
	assert.equal(browser.opened[0].url, 'https://flowaccount.example/authorize?x=1');
	assert.equal(view.phase, 'waiting');
	assert.equal(view.windowOpened, true);
});

test('a sign-in link that is not https is never opened', async () => {
	const { view, browser } = connector({ startSourceOAuth: async () => ({ oauthURL: 'javascript:alert(1)' }) });
	await view.load('src');
	await view.signIn();
	assert.equal(view.oauthURL, '');
	assert.match(view.error, /ไม่ถูกต้อง/);
	assert.equal(browser.opened[0].closed, true, 'the reserved window closes');
	assert.equal(safeSignInURL('https://a.example/x'), 'https://a.example/x');
	assert.equal(safeSignInURL('http://localhost:8080/x'), 'http://localhost:8080/x');
	assert.equal(safeSignInURL('http://a.example/x'), undefined);
	assert.equal(safeSignInURL('https://user:pw@a.example/x'), undefined);
	assert.equal(validAccountURL('https://acct.example/mcp'), true);
	assert.equal(validAccountURL('https://acct.example/mcp?token=x'), false);
});

test('back from the sign-in window, the account is checked and step 2 moves on by itself', async () => {
	let connected = false;
	const { view, browser, ready } = connector({
		sourceSetup: async () => setup(connected ? { configured: true, oauthConnected: true } : {}),
		checkSource: async () => (connected ? { ready: true, oauthRequired: false } : { ready: false, oauthRequired: true })
	});
	await view.load('src');
	const stop = view.watch();
	await view.signIn();
	assert.equal(view.phase, 'waiting');
	// Nothing is granted yet: the 3-second poll leaves it waiting.
	const [poll] = [...browser.timers.values()];
	assert.equal(poll.ms, 3000);
	poll.callback();
	await new Promise((done) => setTimeout(done, 0));
	assert.equal(view.phase, 'waiting');
	connected = true;
	for (const listener of browser.listeners.focus) listener();
	await new Promise((done) => setTimeout(done, 0));
	assert.deepEqual(ready, ['src']);
	assert.equal(view.phase, 'ready');
	stop();
	assert.equal(browser.timers.size, 0);
	assert.equal(browser.listeners.focus.size, 0);
	assert.equal(browser.listeners.visibility.size, 0);
});

test('keys are checked before sending, and a key is never sent through a sign-in window', async () => {
	const fields = [{ key: 'Authorization', name: 'Key', description: '', required: true, sensitive: true }, { key: 'ID', name: 'ID', description: '', required: false, sensitive: false }];
	let saved = false;
	const { view, calls, browser, ready } = connector({
		sourceSetup: async () => setup({ oauthSupported: false, fields, configured: saved }),
		configureSource: async () => { saved = true; return setup({ oauthSupported: false, fields, configured: true }); },
		checkSource: async () => ({ ready: true, oauthRequired: false })
	});
	await view.load('src');
	assert.equal(await view.configure({ Authorization: ' ' }), false, 'the page keeps what was typed');
	assert.match(view.error, /Key/);
	assert.equal(calls.length, 1, 'nothing sent');
	assert.equal(await view.configure({ Authorization: 'secret-key' }), true, 'sent: the page forgets the key');
	assert.equal(browser.opened.length, 0);
	assert.deepEqual(calls[1], ['configure', 'src', { Authorization: 'secret-key' }, undefined]);
	assert.deepEqual(ready, ['src']);
	assert.equal(view.phase, 'ready');
});

test('a key the program refuses still counts as sent, so the page forgets it', async () => {
	const fields = [{ key: 'Authorization', name: 'Key', description: '', required: true, sensitive: true }];
	const { view } = connector({
		sourceSetup: async () => setup({ oauthSupported: false, fields, configured: false }),
		configureSource: async () => { throw new Error('คีย์ไม่ถูกต้อง'); }
	});
	await view.load('src');
	assert.equal(await view.configure({ Authorization: 'wrong-key' }), true);
	assert.equal(view.error, 'คีย์ไม่ถูกต้อง');
	assert.equal(view.phase, 'fields', 'the form stays open for another try');
});

test('"ใช้บัญชีอื่น" signs the old account out first; a late answer for another program is ignored', async () => {
	let signedIn = true;
	const { view, calls } = connector({
		sourceSetup: async () => setup({ configured: true, oauthConnected: signedIn }),
		disconnectSourceOAuth: async () => { signedIn = false; return { disconnected: true }; }
	});
	await view.load('src');
	assert.equal(view.phase, 'connected');
	await view.signInAgain();
	assert.deepEqual(calls.map((call) => call[0]), ['setup', 'disconnect', 'check', 'setup', 'oauth']);
	assert.equal(view.phase, 'waiting');

	let release;
	const slow = connector({ sourceSetup: (id) => (id === 'old' ? new Promise((done) => { release = () => done(setup({ sourceID: 'old', oauthConnected: true, configured: true })); }) : Promise.resolve(setup())) });
	const first = slow.view.load('old');
	await slow.view.load('new');
	release();
	await first;
	assert.equal(slow.view.sourceID, 'new');
	assert.equal(slow.view.phase, 'signin');
});

// Codex review 2 of deploy41: while the provider reviews a program, the saved
// grant is never signed out for a sign-in the review would stop.
test('a program under review keeps the saved account: no switch, no sign-in again, and an expired grant says why', async () => {
	let connected = true;
	const { view, calls } = connector({
		sourceSetup: async () => setup({ configured: true, oauthConnected: connected, setupStatus: 'review_required', setupReason: 'provider_review' }),
		checkSource: async () => ({ ready: false, oauthRequired: true }),
		disconnectSourceOAuth: async () => { connected = false; return { disconnected: true }; }
	});
	await view.load('src');
	assert.equal(view.underReview, true);
	assert.equal(view.phase, 'connected');
	await view.signInAgain();
	await view.verify();
	assert.equal(view.phase, 'connected', 'never "sign in again" while the review is pending');
	assert.match(view.error, /^บัญชี FlowAccount นี้ต้องลงชื่อเข้าใช้ใหม่ แต่ระหว่างรอการยืนยันจาก FlowAccount ยังลงชื่อเข้าใช้ใหม่ไม่ได้/);
	assert.equal(connected, true, 'the saved grant stays');
	assert.deepEqual(calls.filter((call) => call[0] === 'disconnect' || call[0] === 'oauth'), []);
	// The same program without the review asks for the new sign-in as before.
	const open = connector({
		sourceSetup: async () => setup({ configured: true, oauthConnected: true }),
		checkSource: async () => ({ ready: false, oauthRequired: true })
	});
	await open.view.load('src');
	await open.view.verify();
	assert.equal(open.view.phase, 'reconnect');
	assert.equal(open.view.error, '');
});
