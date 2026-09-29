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

const u2 = await importTypeScript(new URL('../../services/orca-u2.ts', import.meta.url));
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

test('password accounts pair with members, and reset follows the member rules', () => {
	const members = [
		{ id: 'o', email: 'Owner@Example.com', role: 'owner', status: 'active' },
		{ id: 'e', email: 'emp@example.com', role: 'employee', status: 'active' },
		{ id: 'a', email: 'admin@example.com', role: 'admin', status: 'active' },
		{ id: 'l', email: 'locked@example.com', role: 'employee', roleLocked: true, status: 'active' },
		{ id: 's', email: 'suspended@example.com', role: 'employee', status: 'suspended' },
		{ id: 'r', email: 'removed@example.com', role: 'employee', status: 'removed' }
	];
	const accounts = ['owner@example.com', 'emp@example.com', 'admin@example.com', 'locked@example.com', 'suspended@example.com', 'removed@example.com', 'new@example.com'].map((email, index) => ({ id: `local-${index}`, email, created: '' }));
	const owner = Object.fromEntries(u2.passwordAccounts(accounts, members, { canManage: true, role: 'owner' }).map((row) => [row.account.email, [row.state, row.canReset]]));
	assert.deepEqual(owner, {
		'owner@example.com': ['member', true],
		'emp@example.com': ['member', true],
		'admin@example.com': ['member', true],
		'locked@example.com': ['member', false],
		'suspended@example.com': ['suspended', false],
		'removed@example.com': ['removed', false],
		'new@example.com': ['waiting', true]
	});
	const admin = Object.fromEntries(u2.passwordAccounts(accounts, members, { canManage: true, role: 'admin' }).map((row) => [row.account.email, row.canReset]));
	assert.deepEqual([admin['emp@example.com'], admin['owner@example.com'], admin['admin@example.com'], admin['new@example.com']], [true, false, false, false], 'an admin resets employees only, and never a new account');
	assert.ok(u2.passwordAccounts(accounts, members, { canManage: false, role: 'owner' }).every((row) => !row.canReset));
	assert.deepEqual(u2.passwordAccounts(accounts, members, { canManage: true, role: 'owner' }).map((row) => row.state), ['member', 'member', 'member', 'member', 'waiting', 'suspended', 'removed'], 'active first');
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
	assert.match(page, /\{:else if view === "platform" && data\.platformOperator\}<PlatformView/);
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
		assert.match(source, /<PageHeader[\s\S]*?\{#snippet eyebrow\(\)\}<PlatformBadge \/>\{\/snippet\}/, key);
		const subtitle = source.match(/<PageHeader[\s\S]*?subtitle=\{t\((['"])(.*?)\1/);
		assert.ok(subtitle, key);
		assert.ok(contract.subtitleWithinContract(subtitle[2]), `${key}: ${subtitle[2]}`);
		assert.equal((source.match(/<PageHeader\b/g) ?? []).length, 1, `${key}: one header`);
	}
	for (const title of ['ภาพรวมแพลตฟอร์ม', 'บริษัทลูกค้า', 'คำขอทดลองใช้', 'เข้าสู่ระบบด้วย Google', 'แอป OAuth ของโปรแกรม', 'คลังโปรแกรม', 'บัญชีฉุกเฉิน']) assert.ok(contract.titleWithinContract(title), title);
	const badge = await readFile(files.badge, 'utf8');
	assert.match(badge, /ใช้กับทุกบริษัทบน ORCA ลูกค้าไม่เห็นหน้านี้/);
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
	['OrcaService', 'orcaError', 't', 'onMount', 'onDestroy', 'LOCAL_AUTH_MIN_PASSWORD_LENGTH', 'passwordAccounts', 'showToast', 'term', 'displayDate', 'memberName', 'memberRole'],
	'refresh, start, save, get state() { return { allowed, accounts, loaded, available, availabilityError, sheetOpen, resetting, email, password, formError, rows }; }, set(values) { if ("email" in values) email = values.email; if ("password" in values) password = values.password; }'
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

test('บัญชีฉุกเฉิน loads, creates and resets password accounts for the ORCA team only', async () => {
	const { view, calls, stop } = breakGlass({ canManage: true, platformOperator: true, currentUserID: 'me', members: people }, { accounts: [{ id: 'l1', email: 'emp@example.com', created: '' }, { id: 'l2', email: 'new@example.com', created: '' }] });
	try {
		await view.refresh();
		flush();
		assert.equal(view.state.available, true);
		assert.deepEqual(view.state.rows.map((row) => [row.account.email, row.state, row.canReset]), [['emp@example.com', 'member', true], ['new@example.com', 'waiting', true]]);
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
		const { view, calls, stop } = breakGlass(data, { accounts: [{ id: 'l1', email: 'emp@example.com', created: '' }] });
		try {
			await view.refresh();
			assert.equal(calls.list, 0, 'the list is never asked for');
			view.start();
			view.set({ email: 'x@example.com', password: 'long-enough-password' });
			await view.save();
			assert.deepEqual([calls.create, calls.reset, view.state.sheetOpen], [[], [], false]);
		} finally { stop(); }
	}
	const admin = breakGlass({ canManage: true, platformOperator: true, currentUserID: 'adm', members: [{ id: 'adm', email: 'adm@example.com', role: 'admin', status: 'active' }, ...people] }, { accounts: [{ id: 'l0', email: 'me@example.com', created: '' }] });
	try {
		await admin.view.refresh();
		flush();
		assert.equal(admin.view.state.rows[0].canReset, false, "an admin never resets an owner's password");
		admin.view.start(admin.view.state.rows[0]);
		assert.equal(admin.view.state.sheetOpen, false);
	} finally { admin.stop(); }
});

test('บัญชีฉุกเฉิน renders nothing for a customer and its header for the ORCA team', async () => {
	const PageHeader = (renderer, props) => { renderer.push(`<h1>${props.title}</h1>`); props.action?.(renderer); };
	const { Component } = await serverComponent(files.breakglass, { t: (_th, en) => en, term: (_key, t) => t('บัญชีฉุกเฉิน', 'Break-glass accounts'), passwordAccounts: u2.passwordAccounts, PageHeader, LOCAL_AUTH_MIN_PASSWORD_LENGTH: 12 });
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
