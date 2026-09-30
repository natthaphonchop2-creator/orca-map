// The ORCA team's platform area (workspace UX W1, U2): the helpers behind its
// pages, the pages' own logic, and that no customer ever reaches any of it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped components' reactive scripts.
import { effect_root, flush } from 'svelte/internal/client';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const u2 = await importTypeScript(new URL('../../services/orca-platform.ts', import.meta.url));
const navigation = await importTypeScript(new URL('../../orca/navigation.ts', import.meta.url));
const contract = await importTypeScript(new URL('./ui/page-contract.ts', import.meta.url));
const require = createRequire(import.meta.url);
const internal = pathToFileURL(require.resolve('svelte/internal/client')).href;

/** A component's script as a function of its props and imports, run reactively. */
async function scriptHarness(url, deps, expose) {
	const source = await readFile(url, 'utf8');
	const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
		.replace(/^\s*import[\s\S]*?;$/gm, '')
		.replace('$props()', '$state(testProps)');
	const code = compileModule(`export function harness(testProps, deps) { const { ${deps.join(', ')} } = deps; ${script}; return { ${expose} }; }`, {
		filename: `${url.pathname.split('/').pop()}.harness.svelte.js`,
		generate: 'client'
	}).js.code.replaceAll('svelte/internal/client', internal);
	return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).harness;
}

const files = {
	view: new URL('./views/PlatformView.svelte', import.meta.url),
	overview: new URL('./views/PlatformOverview.svelte', import.meta.url),
	companies: new URL('./PlatformCompanies.svelte', import.meta.url),
	pilots: new URL('./PilotInbox.svelte', import.meta.url),
	google: new URL('./GoogleSignInSettings.svelte', import.meta.url),
	oauth: new URL('./OAuthApps.svelte', import.meta.url),
	catalog: new URL('./platform/PlatformCatalog.svelte', import.meta.url),
	breakglass: new URL('./platform/BreakGlassAccounts.svelte', import.meta.url),
	badge: new URL('./platform/PlatformBadge.svelte', import.meta.url),
	page: new URL('../../../routes/app/+page.svelte', import.meta.url)
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('the backend origin comes from the company link, else the API base', () => {
	assert.equal(u2.backendOrigin('https://orca-0w10.onrender.com/mcp/connect', 'https://orca-workspace.onrender.com'), 'https://orca-0w10.onrender.com');
	assert.equal(u2.backendOrigin(undefined, 'https://orca-workspace.onrender.com/api'), 'https://orca-workspace.onrender.com');
	assert.equal(u2.backendOrigin('not a url', 'https://w.example'), 'https://w.example');
	assert.equal(u2.backendOrigin('javascript:alert(1)', ''), '', 'only http(s)');
});

test('Google needs both redirect URIs, or one when the workspace and backend share an origin', () => {
	assert.deepEqual(u2.googleRedirectTargets('https://w.example/oauth2/callback', 'https://api.example'), [
		{ uri: 'https://w.example/oauth2/callback', use: 'workspace' },
		{ uri: 'https://api.example/oauth2/callback', use: 'ai-apps' }
	]);
	assert.deepEqual(u2.googleRedirectTargets('https://w.example/oauth2/callback', 'https://w.example'), [{ uri: 'https://w.example/oauth2/callback', use: 'workspace' }]);
	assert.deepEqual(u2.googleRedirectTargets('https://w.example/oauth2/callback', ''), [{ uri: 'https://w.example/oauth2/callback', use: 'workspace' }]);
});

test('a client ID reads right and a client counts as saved only with its secret', () => {
	assert.equal(u2.googleClientIDFormat(''), 'empty');
	assert.equal(u2.googleClientIDFormat(' 000000000000-example.apps.googleusercontent.com '), 'ok');
	assert.equal(u2.googleClientIDFormat('example.com'), 'unusual');
	assert.equal(u2.googleClientSaved({ clientID: 'x.apps.googleusercontent.com', secretConfigured: true }), true);
	assert.equal(u2.googleClientSaved({ clientID: 'x.apps.googleusercontent.com', secretConfigured: false }), false);
	assert.equal(u2.googleClientSaved({ clientID: ' ', secretConfigured: true }), false);
	assert.equal(u2.googleClientSaved(undefined), false);
});

test('platform counts come from the company and pilot lists, never counting the ORCA team as a customer', () => {
	const company = (id, extra = {}) => ({ id, displayName: id, createdAt: '', seats: 0, owners: 0, ownerInvitations: [], ...extra });
	const counts = u2.platformCounts(
		[
			company('default', { seats: 9, owners: 1 }),
			company('a', { seats: 5, owners: 2 }),
			company('b', { ownerInvitations: [{ id: '1', email: 'x@y', expiresAt: '', status: 'pending' }] }),
			company('c', { ownerInvitations: [{ id: '2', email: 'x@y', expiresAt: '', status: 'expired' }] }),
			company('d')
		],
		[{ status: 'received' }, { status: 'received' }, { status: 'contacted' }, { status: 'closed' }]
	);
	assert.deepEqual(
		{ customers: counts.customers, owned: counts.owned, waiting: counts.waiting, expired: counts.expired, noOwner: counts.noOwner, seats: counts.customerSeats, needOwner: counts.needOwner },
		{ customers: 4, owned: 1, waiting: 1, expired: 1, noOwner: 1, seats: 5, needOwner: 2 }
	);
	assert.deepEqual(counts.pilots, { received: 2, contacted: 1, qualified: 0, closed: 1, total: 4, open: 3 });
	assert.equal(u2.platformCounts([]).pilots.total, 0);
});

test('the catalog groups programs by what the ORCA team has to do', () => {
	const items = [
		{ id: 'a', name: 'A', setupStatus: 'available' },
		{ id: 'b', name: 'B', setupStatus: 'admin_setup_required', oauthProvider: 'microsoft' },
		{ id: 'c', name: 'C', setupStatus: 'review_required', setupReason: 'provider_review' },
		{ id: 'd', name: 'D' },
		{ id: 'e', name: 'E', setupStatus: 'admin_setup_required' }
	];
	const summary = u2.catalogSummary(items);
	assert.deepEqual(
		{ ready: summary.ready.map((x) => x.id), app: summary['app-setup'].map((x) => x.id), review: summary.review.map((x) => x.id), unchecked: summary.unchecked.map((x) => x.id), attention: summary.attention.map((x) => x.id), total: summary.total },
		{ ready: ['a'], app: ['b', 'e'], review: ['c'], unchecked: ['d'], attention: ['b', 'e', 'c'], total: 5 }
	);
	assert.equal(u2.sharedProviderApp(items[1]), true, 'Microsoft apps are set up on แอป OAuth ของโปรแกรม');
	assert.equal(u2.sharedProviderApp(items[4]), false);
	assert.deepEqual(u2.searchCatalog([{ name: 'FlowAccount', endpointHost: 'mcp.flow.example' }, { name: 'PEAK', description: 'Thai accounting' }], ' THAI ').map((x) => x.name), ['PEAK']);
	assert.equal(u2.searchCatalog(items, '').length, 5);
});

test('an MCP link is https without a password, query or fragment; the entry never carries a shared token', () => {
	assert.equal(u2.validMCPLink('https://service.example/mcp'), true);
	assert.equal(u2.validMCPLink(' http://localhost:8080/mcp '), true);
	for (const bad of ['http://service.example/mcp', 'https://user:pw@service.example/mcp', 'https://service.example/mcp?token=1', 'https://service.example/mcp#x', 'ftp://service.example', 'nope'])
		assert.equal(u2.validMCPLink(bad), false, bad);
	assert.deepEqual(u2.remoteEntryManifest(' Stock ', ' https://stock.example/mcp ', 'none', 'Added'), {
		name: 'Stock',
		shortDescription: 'Added',
		runtime: 'remote',
		serverUserType: 'singleUser',
		remoteConfig: { fixedURL: 'https://stock.example/mcp' }
	});
	const bearer = u2.remoteEntryManifest('Stock', 'https://stock.example/mcp', 'bearer', 'Added');
	assert.equal(bearer.serverUserType, 'singleUser', 'one server per person');
	assert.deepEqual(bearer.remoteConfig.headers.map((header) => [header.key, header.value, header.sensitive, header.required]), [['Authorization', '', true, true]]);
});

test('password accounts are listed exactly as the server sends them, labelled by its fields', () => {
	const members = [
		{ id: '1', email: 'ops@example.com', displayName: 'วิภา ตัวอย่าง', role: 'owner', status: 'active' },
		{ id: '4', email: 'emp@example.com', role: 'employee', status: 'active' }
	];
	// GET /local-auth/users (backend B6), oldest first: the server already left out
	// Google-only logins and anyone a customer company has.
	const accounts = [
		{ id: '12', created: '2026-09-01T00:00:00Z', email: 'ops@example.com', passwordOrigin: 'admin', userID: '1', role: 'owner', status: 'active' },
		{ id: '15', created: '2026-09-02T00:00:00Z', email: 'self@example.com', passwordOrigin: 'self', userID: '9', role: 'admin', status: 'active' },
		{ id: '13', created: '2026-09-03T00:00:00Z', email: 'waiting@example.com', passwordOrigin: 'admin' },
		{ id: '16', created: '2026-09-04T00:00:00Z', email: 'susp@example.com', passwordOrigin: 'admin', userID: '6', role: 'employee', status: 'suspended' },
		{ id: '17', created: '2026-09-05T00:00:00Z', email: 'gone@example.com', passwordOrigin: 'self', userID: '7', role: 'employee', status: 'removed' },
		// A member's email no longer decides anything: the row's own userID does.
		{ id: '18', created: '2026-09-06T00:00:00Z', email: 'EMP@example.com', passwordOrigin: 'admin', userID: '4', role: 'employee', status: 'active' }
	];
	const rows = u2.passwordAccounts(accounts, members, '1');
	assert.deepEqual(rows.map((row) => row.account.id), ['12', '15', '13', '16', '17', '18'], 'every row, in the server\'s order');
	assert.equal(rows[0].account, accounts[0], 'the row is the server\'s, as sent');
	assert.deepEqual(rows.map((row) => [row.state, row.canReset, row.self]), [
		['active', true, true],
		['active', true, false],
		['waiting', true, false],
		['suspended', false, false],
		['removed', false, false],
		['active', true, false]
	]);
	assert.equal(rows[0].member?.displayName, 'วิภา ตัวอย่าง');
	assert.equal(rows[1].member, undefined, 'a member the bootstrap does not list only has no name');
	assert.equal(rows[5].member?.id, '4');
	assert.deepEqual(u2.passwordAccounts([], members, '1'), []);
	// "(you)" needs the account's ID: a waiting login is nobody's yet, and no ID is never "you".
	assert.equal(u2.passwordAccounts([{ id: '13', created: '', email: 'ops@example.com' }], members, '1')[0].self, false);
	assert.equal(u2.passwordAccounts([accounts[0]], members, '')[0].self, false);
	assert.equal(u2.passwordAccounts([{ ...accounts[0], userID: '' }], members, '')[0].self, false);
	// Backend 1956664 (before B6), while the workspace deploys first: every Local login, no origin, account or
	// status. Nothing can be read as the ORCA team's, so no row offers a reset (Codex release review 63).
	const old = [{ id: '12', created: '', email: 'ops@example.com' }, { id: '20', created: '', email: 'customer@example.com' }];
	assert.equal(u2.passwordListCurrent(old), false);
	assert.deepEqual(u2.passwordAccounts(old, members, '1').map((row) => row.canReset), [false, false]);
	assert.equal(u2.passwordListCurrent(accounts), true);
	assert.equal(u2.passwordListCurrent([]), true);
	assert.equal(u2.passwordListCurrent([...accounts, old[1]]), false, 'one old row is enough');
});

test('a LINE message link opens in the phone browser', () => {
	assert.equal(u2.externalBrowserLink('https://orca.example/invite/tok'), 'https://orca.example/invite/tok?openExternalBrowser=1');
	assert.equal(u2.externalBrowserLink('https://orca.example/invite/tok?a=1'), 'https://orca.example/invite/tok?a=1&openExternalBrowser=1');
	assert.equal(u2.externalBrowserLink('not a link'), 'not a link');
});

// ---------------------------------------------------------------------------
// Customers never reach the platform area
// ---------------------------------------------------------------------------

const owner = { canManage: true, platformOperator: false, canReviewPilotRequests: false };
const employee = { canManage: false, platformOperator: false, canReviewPilotRequests: false };
const operator = { canManage: true, platformOperator: true, canReviewPilotRequests: true };

test('every platform section sends a customer owner, admin or employee to their own Home', () => {
	for (const section of navigation.PLATFORM_SECTIONS) {
		for (const role of [owner, employee]) {
			const route = navigation.appNavigation(new URLSearchParams(`view=platform&section=${section}`), { role });
			assert.equal(route.view, 'dashboard', `${section}`);
			assert.equal(route.redirect, '/app', section);
		}
		const route = navigation.appNavigation(new URLSearchParams(`view=platform&section=${section}`), { role: operator });
		assert.equal(route.view, 'platform', section);
		assert.equal(route.params.get('section'), section);
	}
});

test('the page mounts the platform area only for the ORCA team', async () => {
	const page = await readFile(files.page, 'utf8');
	const mounts = [...page.matchAll(/<PlatformView\b/g)];
	assert.equal(mounts.length, 1);
	assert.match(page, /\{:else if view === "platform" && data\.platformOperator\}\{#key platformReloads\}<PlatformView/);
	// The top bar's refresh reloads the platform's own lists too (they load on mount).
	assert.match(page, /function refreshFromTopBar\(\) \{\s*if \(view === "platform"\) platformReloads \+= 1;/);
	assert.match(page, /onrefresh=\{refreshFromTopBar\}/);
});

async function platformView(data, section) {
	const mounted = [];
	const child = (name) => (_renderer, props) => mounted.push({ name, props });
	const { Component, warnings } = await serverComponent(files.view, {
		GoogleSignInSettings: child('GoogleSignInSettings'),
		OAuthApps: child('OAuthApps'),
		PilotInbox: child('PilotInbox'),
		PlatformCompanies: child('PlatformCompanies'),
		BreakGlassAccounts: child('BreakGlassAccounts'),
		PlatformCatalog: child('PlatformCatalog'),
		PlatformOverview: child('PlatformOverview')
	});
	const html = render(Component, { props: { data, activeData: data, section, onchanged: async () => {} } }).body;
	return { mounted, html, warnings };
}

test('PlatformView shows nothing to anyone but the ORCA team, whatever the section', async () => {
	for (const section of navigation.PLATFORM_SECTIONS) {
		for (const data of [owner, employee, { ...owner, platformOperator: undefined }, { ...owner, platformOperator: 'yes' }]) {
			const { mounted, html } = await platformView(data, section);
			assert.deepEqual(mounted, [], `${section}`);
			assert.doesNotMatch(html, /platform-page/);
		}
	}
});

test('PlatformView mounts one page per section, the break-glass page only its own part', async () => {
	const expected = { overview: 'PlatformOverview', companies: 'PlatformCompanies', pilots: 'PilotInbox', signin: 'GoogleSignInSettings', 'oauth-apps': 'OAuthApps', catalog: 'PlatformCatalog', breakglass: 'BreakGlassAccounts' };
	for (const section of navigation.PLATFORM_SECTIONS) {
		const { mounted, warnings } = await platformView(operator, section);
		assert.deepEqual(warnings, []);
		assert.deepEqual(mounted.map((item) => item.name), [expected[section]], section);
	}
	// Pilot requests only for a reviewer; anyone else gets the overview.
	assert.deepEqual((await platformView({ ...operator, canReviewPilotRequests: false }, 'pilots')).mounted.map((item) => item.name), ['PlatformOverview']);
	const view = await readFile(files.view, 'utf8');
	assert.doesNotMatch(view, /TeamAccess|ConnectionSettings/, 'no whole company page is mounted in the platform');
});

// ---------------------------------------------------------------------------
// The page contract: every section has the badge, a short title and one line.
// ---------------------------------------------------------------------------

test('every section uses PageHeader with the platform badge, within the page contract', async () => {
	for (const key of ['overview', 'companies', 'pilots', 'google', 'oauth', 'catalog', 'breakglass']) {
		const source = await readFile(files[key], 'utf8');
		assert.match(source, /<PageHeader[\s\S]*?\{#snippet eyebrow\(\)\}<PlatformBadge( everyCompany)? \/>\{\/snippet\}/, key);
		// "ใช้กับทุกบริษัทบน ORCA" only where the page's settings are shared by every company.
		assert.equal(/<PlatformBadge everyCompany \/>/.test(source), ['google', 'oauth', 'catalog'].includes(key), `${key}: badge scope`);
		const subtitle = source.match(/<PageHeader[\s\S]*?subtitle=\{t\((['"])(.*?)\1/);
		assert.ok(subtitle, key);
		assert.ok(contract.subtitleWithinContract(subtitle[2]), `${key}: ${subtitle[2]}`);
		assert.equal((source.match(/<PageHeader\b/g) ?? []).length, 1, `${key}: one header`);
	}
	for (const title of ['ภาพรวมแพลตฟอร์ม', 'บริษัทลูกค้า', 'คำขอทดลองใช้', 'เข้าสู่ระบบด้วย Google', 'แอป OAuth ของโปรแกรม', 'คลังโปรแกรม', 'บัญชีฉุกเฉิน']) assert.ok(contract.titleWithinContract(title), title);
	const badge = await readFile(files.badge, 'utf8');
	assert.match(badge, /everyCompany\s*\?\s*t\('ใช้กับทุกบริษัทบน ORCA ลูกค้าไม่เห็นหน้านี้'[\s\S]*?: t\('ลูกค้าไม่เห็นหน้านี้'/);
	assert.doesNotMatch(badge, /#fff|#151823/i, 'labels on ink use --orca-on-ink');
});

test('the platform pages use tokens, not hard-coded label colours, and compile without warnings', async () => {
	for (const key of ['overview', 'companies', 'pilots', 'google', 'oauth', 'catalog', 'breakglass', 'view', 'badge']) {
		const source = await readFile(files[key], 'utf8');
		assert.doesNotMatch(source, /#fff\b|#ffffff|#151823/i, key);
		assert.doesNotMatch(source, /<select\b/, `${key}: key choices are tiles or segments, never a native select`);
		assert.deepEqual(compile(source, { filename: files[key].pathname.split('/').pop(), generate: 'client' }).warnings.map((warning) => `${warning.code}: ${warning.message}`), [], key);
	}
});

// ---------------------------------------------------------------------------
// บัญชีฉุกเฉิน
// ---------------------------------------------------------------------------

const breakGlassHarness = await scriptHarness(
	files.breakglass,
	['OrcaService', 'orcaError', 't', 'onMount', 'onDestroy', 'LOCAL_AUTH_MIN_PASSWORD_LENGTH', 'passwordAccounts', 'passwordListCurrent', 'showToast', 'term', 'displayDate', 'memberName', 'memberRole'],
	'refresh, start, save, stateLabel, originLabel, get state() { return { allowed, accounts, loaded, available, availabilityError, sheetOpen, resetting, resettingSelf, email, password, formError, rows }; }, set(values) { if ("email" in values) email = values.email; if ("password" in values) password = values.password; }'
);

function breakGlass(data, service = {}) {
	const calls = { list: 0, create: [], reset: [], toasts: [], changed: 0 };
	let view;
	const stop = effect_root(() => {
		view = breakGlassHarness(
			{ data, onchanged: async () => { calls.changed += 1; } },
			{
				OrcaService: {
					localUsers: async () => { calls.list += 1; return service.accounts ?? []; },
					createLocalUser: async (...args) => { calls.create.push(args); },
					resetLocalPassword: async (...args) => { calls.reset.push(args); }
				},
				orcaError: (error) => error.message,
				t: (th) => th,
				onMount: () => {},
				onDestroy: () => {},
				LOCAL_AUTH_MIN_PASSWORD_LENGTH: 12,
				passwordAccounts: u2.passwordAccounts,
				passwordListCurrent: u2.passwordListCurrent,
				showToast: (message) => calls.toasts.push(message)
			}
		);
	});
	return { view, calls, stop };
}

const people = [
	{ id: 'me', email: 'me@example.com', role: 'owner', status: 'active' },
	{ id: 'emp', email: 'emp@example.com', role: 'employee', status: 'active' }
];
const login = (id, email, extra = {}) => ({ id, email, created: '', passwordOrigin: 'admin', ...extra });

test('บัญชีฉุกเฉิน loads, creates and resets password accounts for the ORCA team only', async () => {
	const { view, calls, stop } = breakGlass({ canManage: true, platformOperator: true, currentUserID: 'me', members: people }, { accounts: [login('l1', 'emp@example.com', { userID: 'emp', role: 'employee', status: 'active' }), login('l2', 'new@example.com')] });
	try {
		await view.refresh();
		flush();
		assert.equal(view.state.available, true);
		assert.deepEqual(view.state.rows.map((row) => [row.account.email, row.state, row.canReset]), [['emp@example.com', 'active', true], ['new@example.com', 'waiting', true]]);
		view.start();
		view.set({ email: ' New.Person@Example.com ', password: 'short' });
		await view.save();
		assert.match(view.state.formError, /อย่างน้อย 12/);
		assert.deepEqual(calls.create, []);
		view.set({ password: 'long-enough-password' });
		await view.save();
		assert.deepEqual(calls.create, [['new.person@example.com', 'long-enough-password']]);
		assert.equal(view.state.password, '', 'the password never stays in the page');
		assert.equal(view.state.sheetOpen, false);
		assert.equal(calls.toasts.length, 1);
		assert.equal(calls.changed, 1);
		view.start(view.state.rows[0]);
		assert.equal(view.state.email, 'emp@example.com');
		view.set({ password: 'another-long-password' });
		await view.save();
		assert.deepEqual(calls.reset, [['l1', 'another-long-password']]);
	} finally { stop(); }
});

test('บัญชีฉุกเฉิน does nothing for anyone else, and never resets a row the rules refuse', async () => {
	for (const data of [
		{ canManage: true, platformOperator: false, currentUserID: 'me', members: people },
		{ canManage: false, platformOperator: true, currentUserID: 'me', members: people }
	]) {
		const { view, calls, stop } = breakGlass(data, { accounts: [login('l1', 'emp@example.com', { userID: 'emp', role: 'employee', status: 'active' })] });
		try {
			await view.refresh();
			assert.equal(calls.list, 0, 'the list is never asked for');
			view.start();
			view.set({ email: 'x@example.com', password: 'long-enough-password' });
			await view.save();
			assert.deepEqual([calls.create, calls.reset, view.state.sheetOpen], [[], [], false]);
		} finally { stop(); }
	}
	// A suspended or removed account keeps its row, and is never reset from it.
	const team = breakGlass({ canManage: true, platformOperator: true, currentUserID: 'me', members: people }, {
		accounts: [login('l5', 'susp@example.com', { userID: 's', role: 'employee', status: 'suspended' }), login('l6', 'gone@example.com', { userID: 'r', role: 'employee', status: 'removed', passwordOrigin: 'self' })]
	});
	try {
		await team.view.refresh();
		flush();
		assert.deepEqual(team.view.state.rows.map((row) => [row.state, row.canReset]), [['suspended', false], ['removed', false]]);
		for (const row of team.view.state.rows) {
			team.view.start(row);
			assert.equal(team.view.state.sheetOpen, false);
		}
		assert.deepEqual(team.calls.reset, []);
	} finally { team.stop(); }
});

test('บัญชีฉุกเฉิน marks your own account, and names each row by the server\'s fields', async () => {
	const { view, stop } = breakGlass({ canManage: true, platformOperator: true, currentUserID: 'me', members: people }, {
		accounts: [login('l1', 'me@example.com', { userID: 'me', role: 'owner', status: 'active' }), login('l2', 'emp@example.com', { userID: 'emp', role: 'employee', status: 'active', passwordOrigin: 'self' }), login('l3', 'new@example.com')]
	});
	try {
		await view.refresh();
		flush();
		assert.deepEqual(view.state.rows.map((row) => row.self), [true, false, false]);
		view.start(view.state.rows[0]);
		flush();
		assert.equal(view.state.resettingSelf, true, 'the sheet warns before you sign yourself out');
		view.start(view.state.rows[1]);
		flush();
		assert.equal(view.state.resettingSelf, false);
		assert.deepEqual(['active', 'waiting', 'suspended', 'removed'].map(view.stateLabel), ['ใช้งานอยู่', 'รอเข้าสู่ระบบ', 'ถูกระงับ', 'นำออกแล้ว']);
		assert.deepEqual(['admin', 'self', undefined].map(view.originLabel), ['ทีม ORCA ตั้งให้', 'เจ้าของบัญชีตั้งเอง', '']);
	} finally { stop(); }
	const source = await readFile(files.breakglass, 'utf8');
	assert.match(source, /\{#if row\.self\}<span class="breakglass-you">\{t\(' \(คุณ\)', ' \(you\)'\)\}/);
	assert.match(source, /row\.account\.role \? memberRole\(row\.account\.role\) : '—'/, 'the role is the server\'s, not a guess from the member list');
	assert.doesNotMatch(source, /normalizedEmail|\.email\.toLowerCase|canResetMemberPassword|\.sort\(/, 'no client-side matching, re-sorting or role rules left');
});

test('บัญชีฉุกเฉิน renders nothing for a customer and its header for the ORCA team', async () => {
	const PageHeader = (renderer, props) => { renderer.push(`<h1>${props.title}</h1>`); props.action?.(renderer); };
	const { Component } = await serverComponent(files.breakglass, { t: (_th, en) => en, term: (_key, t) => t('บัญชีฉุกเฉิน', 'Break-glass accounts'), passwordAccounts: u2.passwordAccounts, passwordListCurrent: u2.passwordListCurrent, PageHeader, LOCAL_AUTH_MIN_PASSWORD_LENGTH: 12 });
	const customer = render(Component, { props: { data: { canManage: true, platformOperator: false, currentUserID: 'me', members: people }, onchanged: async () => {} } }).body;
	assert.doesNotMatch(customer, /Break-glass|password|Password/);
	const team = render(Component, { props: { data: { canManage: true, platformOperator: true, currentUserID: 'me', members: people }, onchanged: async () => {} } }).body;
	assert.match(team, /<h1>Break-glass accounts<\/h1>/);
	assert.match(team, /For emergencies only/);
	assert.match(team, /Loading accounts/);
});

// ---------------------------------------------------------------------------
// คลังโปรแกรม
// ---------------------------------------------------------------------------

const catalogHarness = await scriptHarness(
	files.catalog,
	['OrcaService', 'orcaError', 't', 'onMount', 'onDestroy', 'catalogSourceDisplayName', 'catalogState', 'catalogSummary', 'remoteEntryManifest', 'searchCatalog', 'sharedProviderApp', 'validMCPLink', 'showToast'],
	'load, openAdd, openCheck, add, get state() { return { operator, candidates, panelOpen, panelMode, checking, addErrors, summary }; }, set(values) { if ("name" in values) name = values.name; if ("endpoint" in values) endpoint = values.endpoint; if ("auth" in values) auth = values.auth; }'
);

function catalog(data, candidates = []) {
	const calls = { created: [], toasts: [] };
	let view;
	const stop = effect_root(() => {
		view = catalogHarness(
			{ data },
			{
				OrcaService: {
					candidates: async () => candidates,
					createRemoteEntry: async (manifest) => { calls.created.push(manifest); return { id: 'entry-new' }; }
				},
				orcaError: (error) => error.message,
				t: (th) => th,
				onMount: () => {},
				onDestroy: () => {},
				catalogSourceDisplayName: (source) => source.name,
				...u2,
				showToast: (message) => calls.toasts.push(message)
			}
		);
	});
	return { view, calls, stop };
}

test('คลังโปรแกรม adds a program by its MCP link, then opens it to check the connection', async () => {
	const { view, calls, stop } = catalog({ platformOperator: true }, [{ id: 'c', name: 'Canva', setupStatus: 'review_required' }]);
	try {
		await view.load();
		flush();
		assert.deepEqual(view.state.summary.attention.map((x) => x.id), ['c']);
		view.openAdd();
		assert.equal(view.state.panelOpen, true);
		view.set({ name: ' ', endpoint: 'http://stock.example/mcp?token=1' });
		await view.add();
		assert.deepEqual(view.state.addErrors.map((error) => error.field), ['catalog-add-name', 'catalog-add-link'], 'every error at once');
		assert.deepEqual(calls.created, []);
		view.set({ name: ' Stock ', endpoint: 'https://stock.example/mcp', auth: 'bearer' });
		await view.add();
		assert.equal(calls.created.length, 1);
		assert.equal(calls.created[0].name, 'Stock');
		assert.equal(calls.created[0].remoteConfig.fixedURL, 'https://stock.example/mcp');
		assert.equal(calls.created[0].remoteConfig.headers[0].value, '', 'no shared token');
		assert.equal(view.state.panelMode, 'check');
		assert.deepEqual(view.state.checking, { id: 'entry-new', name: 'Stock' });
		assert.equal(calls.toasts.length, 1);
	} finally { stop(); }
});

test('คลังโปรแกรม does nothing for anyone but the ORCA team', async () => {
	const { view, calls, stop } = catalog({ platformOperator: false }, [{ id: 'a', name: 'A', setupStatus: 'available' }]);
	try {
		view.openAdd();
		view.openCheck({ id: 'a', name: 'A' });
		assert.equal(view.state.panelOpen, false);
		view.set({ name: 'Stock', endpoint: 'https://stock.example/mcp' });
		await view.add();
		assert.deepEqual(calls.created, []);
	} finally { stop(); }
	const { Component } = await serverComponent(files.catalog, { t: (_th, en) => en, ...u2 });
	assert.equal(render(Component, { props: { data: { platformOperator: false } } }).body.replace(/<!--[^>]*-->/g, '').trim(), '');
});

// ---------------------------------------------------------------------------
// คำขอทดลองใช้
// ---------------------------------------------------------------------------

test('คำขอทดลองใช้ saves a changed status only, and its save button shows only then', async () => {
	const pilotsHarness = await scriptHarness(
		files.pilots,
		['OrcaService', 'orcaError', 'displayDate', 't', 'term', 'onMount', 'PILOT_STATUSES'],
		'load, save, get state() { return { items, visible, success, error, pendingStatus }; }, pick(id, status) { pendingStatus = { ...pendingStatus, [id]: status }; }, filterBy(value) { filter = value; }'
	);
	const updates = [];
	let view;
	const stop = effect_root(() => {
		view = pilotsHarness({}, {
			OrcaService: {
				listPilotRequests: async () => ({ items: [{ id: 'p1', status: 'received', version: 1 }, { id: 'p2', status: 'closed', version: 3 }] }),
				updatePilotRequest: async (id, status, version) => { updates.push([id, status, version]); return { id, status, version: version + 1 }; }
			},
			orcaError: (error) => error.message,
			t: (th) => th,
			onMount: () => {},
			PILOT_STATUSES: u2.PILOT_STATUSES
		});
	});
	try {
		await view.load();
		flush();
		view.filterBy('closed');
		flush();
		assert.deepEqual(view.state.visible.map((x) => x.id), ['p2']);
		view.pick('p1', 'contacted');
		await view.save(view.state.items[0]);
		assert.deepEqual(updates, [['p1', 'contacted', 1]]);
		assert.equal(view.state.items[0].status, 'contacted');
		assert.deepEqual(view.state.pendingStatus, {}, 'the draft clears once saved');
		assert.match(view.state.success, /ไม่ได้ส่งข้อความ/);
	} finally { stop(); }
	const source = await readFile(files.pilots, 'utf8');
	assert.match(source, /\{#if pendingStatus\[item\.id\] && pendingStatus\[item\.id\] !== item\.status\}<button\s+class="k-button primary"/);
});

// ---------------------------------------------------------------------------
// แอป OAuth ของโปรแกรม
// ---------------------------------------------------------------------------

test('แอป OAuth ของโปรแกรม sets up a program’s own app in its side panel, never in the company area', async () => {
	const { oauthApps } = await importTypeScript(new URL('../../orca/oauth-apps.ts', import.meta.url));
	const harness = await scriptHarness(files.oauth, ['OrcaService', 't', 'onMount', 'onDestroy', 'oauthApps'], 'refresh, openCheck, openForm, sheetClosed, get state() { return { checking, editing, sheetOpen, loaded }; }');
	let loads = 0;
	let view;
	const stop = effect_root(() => {
		view = harness(
			{ data: { canManage: true, platformOperator: true } },
			{
				OrcaService: {
					candidates: async () => { loads += 1; return [{ id: 'facebook', name: 'Facebook Pages API', setupStatus: 'admin_setup_required', endpointHost: 'graph.facebook.example' }]; },
					sourceSetup: async () => ({ oauthClientCanConfigure: true, oauthRedirectURL: 'https://orca.example/oauth/callback' })
				},
				t: (th) => th,
				onMount: () => {},
				onDestroy: () => {},
				oauthApps
			}
		);
	});
	try {
		await view.refresh();
		assert.equal(loads, 1);
		view.openCheck({ id: 'facebook', name: 'Facebook Pages API', endpointHost: 'graph.facebook.example' });
		assert.deepEqual([view.state.sheetOpen, view.state.checking?.id, view.state.editing], [true, 'facebook', undefined]);
		// The provider form and the program's setup never share the panel.
		await view.openForm({ key: 'microsoft', sourceID: 'outlook', name: 'Microsoft', provider: 'microsoft', replace: false, scopes: [] });
		assert.deepEqual([view.state.checking, view.state.editing?.key], [undefined, 'microsoft']);
		view.openCheck({ id: 'facebook', name: 'Facebook Pages API' });
		assert.equal(view.state.editing, undefined);
		view.sheetClosed();
		assert.equal(view.state.checking, undefined);
		assert.equal(loads, 2, 'closing a program’s setup reloads what the lists show');
	} finally { stop(); }
	for (const key of ['oauth', 'catalog', 'google', 'companies', 'overview', 'breakglass', 'pilots']) {
		const source = await readFile(files[key], 'utf8');
		assert.doesNotMatch(source, /catalogSetupHref|view=add-program|view=servers/, `${key} keeps the ORCA team in the platform area`);
	}
	const oauth = await readFile(files.oauth, 'utf8');
	assert.match(oauth, /\{:else if checking\}[\s\S]*?<SourceSetup operator sourceID=\{checking\.id\}/);
});

test('OAuth apps: while a save runs, the guide and the credential fields wait, so its answer never closes a guide opened meanwhile (Codex release review 68)', async () => {
	const source = await readFile(new URL('./OAuthApps.svelte', import.meta.url), 'utf8');
	assert.match(source, /function openCheck\([^)]*\) \{\s*\/\/[^\n]*\n\s*if \(busy\) return;/, 'openCheck refuses during a save');
	assert.match(source, /class="k-button console-link" disabled=\{busy\} onclick=\{\(\) => openCheck/);
	for (const field of ['bind:value={clientID}', 'bind:value={clientSecret}']) {
		const at = source.indexOf(field);
		assert.ok(at > 0, field);
		assert.match(source.slice(at, source.indexOf('/>', at)), /disabled=\{busy\}/, field);
	}
});
