import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// เชื่อม AI ของฉัน (U3): the page and its parts, rendered on the server with
// their children stubbed, so each test reads what one part decides.
const ai = await importTypeScript(new URL('../../orca/connect-ai.ts', import.meta.url));
const { term } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const { aiConnectionLine } = await importTypeScript(new URL('../../orca/ai-connection.ts', import.meta.url));
const { copyFeedback, copyText } = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));
const inApp = await importTypeScript(new URL('../../orca/in-app-browser.ts', import.meta.url));
const workspaceEdit = await importTypeScript(new URL('../../orca/workspace-edit.ts', import.meta.url));
const support = await importTypeScript(new URL('../../orca/support.ts', import.meta.url));
const en = (_th, english) => english;
const { Component: SupportContact } = await serverComponent(new URL('./ui/SupportContact.svelte', import.meta.url), { t: en, ...support });
const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const url = (name) => new URL(`./connect-ai/${name}.svelte`, import.meta.url);
const NOW = Date.parse('2026-09-28T10:30:00+07:00');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

const connection = (id, name) => ({ id, name, mcpID: `src-${id}`, enabled: true, reviewedReadOnly: true, toolNames: ['read'], tools: [{ name: 'read' }], version: 1 });
const hub = (id, name, members, extra = {}) => ({
	id, name, status: 'active', connectionID: 'flow', toolNames: ['read'], sources: [{ connectionID: 'flow', toolNames: ['read'] }],
	memberIDs: members, unitIDs: [], dailyLimit: 100, version: 2, connectURL: `https://orca.example.test/mcp/${id}`, ...extra
});
const data = (extra = {}) => ({
	organization: { displayName: 'Example Co.', timezone: 'Asia/Bangkok', version: 1 },
	currentUserID: 'me', canManage: true,
	members: [{ id: 'me', displayName: 'Mali', email: 'mali@example.invalid', role: 'owner' }],
	units: [], connections: [connection('flow', 'FlowAccount')],
	hubs: [hub('sales', 'Sales', ['me']), hub('acc', 'Accounts', ['someone'])],
	unifiedConnectURL: 'https://orca.example.test/api/orca/mcp',
	...extra
});
const stub = (mounted, name, body = '') => (renderer, props) => {
	mounted.push({ name, props });
	renderer.push(`<div data-child="${name}">${body}</div>`);
};
const common = { t: en, term, localeHref: (href) => href, orcaLocale: { value: 'en' }, untrack: (fn) => fn(), onMount: () => {}, onDestroy: () => {}, copyFeedback, copyText, ...ai, ...inApp, ...workspaceEdit };

/** The shipped shared store (ai-connection.svelte.ts), compiled with its runes; a fresh copy per call. */
let storeCopies = 0;
async function sharedStore() {
	const require = createRequire(import.meta.url);
	const source = stripTypeScriptTypes(await readFile(new URL('../../orca/ai-connection.svelte.ts', import.meta.url), 'utf8')).replace(/^import[^;]+;$/gm, '');
	const code = compileModule(source, { filename: `ai-connection-${++storeCopies}.svelte.js`, generate: 'client' }).js.code.replaceAll(
		'svelte/internal/client',
		pathToFileURL(require.resolve('svelte/internal/client')).href
	);
	return import('data:text/javascript;base64,' + Buffer.from(`${code}\n// copy ${storeCopies}`).toString('base64'));
}

async function page(props) {
	const mounted = [];
	const file = new URL('./views/ConnectAIView.svelte', import.meta.url);
	const { warnings, Component } = await serverComponent(file, {
		...common,
		aiConnectionLine,
		aiConnection: { state: 'none' },
		setAIConnection: () => {},
		companyPinned: () => true,
		currentCompany: () => 'default',
		parseErrorContent: () => ({ status: 500 }),
		MyAIAppsService: {},
		OrcaService: {},
		aiAppsUnavailable: () => false,
		PageHeader: (renderer, p) => renderer.push(`<h1>${p.title}</h1><span data-status="${p.status.tone}">${p.status.label}</span>`),
		ConnectStep: (renderer, p) => {
			mounted.push({ name: 'ConnectStep', props: p });
			renderer.push(`<li data-step="${p.number}" data-state="${p.state}"><h2>${p.title}</h2>`);
			p.lead?.(renderer);
			p.children(renderer);
			renderer.push('</li>');
		},
		SupportContact,
		...Object.fromEntries(['AccessStrip', 'AIAppPicker', 'AppSteps', 'ConnectResult', 'ConnectedAIList', 'ConsentDrawing', 'DeveloperKeys', 'ProgramSignIns', 'CopyField'].map((name) => [name, stub(mounted, name)]))
	});
	const html = render(Component, { props }).body;
	const find = (name) => mounted.filter((item) => item.name === name).map((item) => item.props);
	return { warnings, html, find };
}

test('the page follows the mockup: access strip, five steps, then the person’s apps, programs and keys', async () => {
	const { warnings, html, find } = await page({ data: data() });
	assert.deepEqual(warnings, []);
	assert.match(html, /<h1>Connect my AI<\/h1>/);
	assert.match(html, /data-status="neutral">Not connected/);
	assert.deepEqual(find('ConnectStep').map((step) => [step.number, step.state]), [[1, 'done'], [2, 'current'], [3, 'upcoming'], [4, 'upcoming'], [5, 'upcoming']]);
	assert.doesNotMatch(html, /\binert\b/);
	assert.deepEqual(find('AccessStrip')[0].access.usable.map((item) => item.id), ['sales']);
	const copy = find('CopyField')[0];
	assert.equal(copy.value, 'https://orca.example.test/api/orca/mcp', 'always the company link');
	assert.equal(copy.buttonLabel, 'Copy ORCA link');
	assert.match(html, /If you added a workspace’s own link before, remove it and use this one instead\./);
	assert.match(html, /Name to type in Claude[\s\S]*ORCA · Example Co\./, 'the connector name carries the company when the person has several');
	assert.equal(find('AppSteps')[0].connector, 'ORCA · Example Co.');
	assert.equal(find('ConsentDrawing')[0].host, 'orca.example.test');
	assert.equal(find('ConsentDrawing')[0].email, 'mali@example.invalid');
	assert.equal(find('ConnectResult')[0].status, 'waiting');
	assert.equal(find('ConnectResult')[0].prompts[1], 'Summarize the latest in FlowAccount');
	const keys = find('DeveloperKeys')[0];
	assert.deepEqual(keys.hubs.map((item) => item.id), ['sales'], 'a key for one workspace only among those the person can use');
	assert.equal(keys.canManage, true);
	// The help line ends with the ORCA team's LINE and email ($lib/orca/support).
	assert.match(plain(html), /Stuck on a step\? See the Help page or message the ORCA team on LINE @147njpwd \(opens in a new tab\) · email natthaphon\.chop@gmail\.com/);
	assert.match(html, /<a href="https:\/\/line\.me\/R\/ti\/p\/@147njpwd" target="_blank" rel="noopener noreferrer"/);
	assert.match(html, /<a href="mailto:natthaphon\.chop@gmail\.com"/);
	assert.equal(find('ProgramSignIns').length, 1);
	assert.equal(find('ConnectedAIList')[0].legacy, false);
	assert.doesNotMatch(html, /MCP|OAuth|Bearer/, 'no jargon outside the developer parts');
	for (const retired of ['view=api-keys', 'view=accounts', 'tab=connect']) assert.doesNotMatch(html, new RegExp(retired));
});

test('with no workspace the steps stay visible but dimmed and inert, and keys are not offered', async () => {
	const { html, find } = await page({ data: data({ canManage: false, hubs: [hub('acc', 'Accounts', ['someone'])] }) });
	assert.match(html, /<ol class="ca-steps[^"]*\bdim\b[^"]*"[^>]*\binert\b/);
	assert.deepEqual(find('ConnectStep').map((step) => step.state), ['upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
	assert.equal(find('ConnectResult')[0].status, 'idle');
	assert.equal(find('DeveloperKeys').length, 0);
	assert.match(plain(html), /See the Help page, ask a company admin, or message the ORCA team on LINE @147njpwd/);
});

test('without a usable company link nothing is fabricated', async () => {
	const { html, find } = await page({ data: data({ unifiedConnectURL: 'https://orca.example.test/mcp?key=1' }) });
	assert.equal(find('CopyField').length, 0);
	assert.equal(find('AppSteps').length, 0);
	assert.match(html, /company's ORCA link is not available/);
});

test('the pinned state is loaded once when the workspace opens, and the page can refresh the company', async () => {
	const route = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.equal(route.match(/checkAIConnectionOnce\(\)/g)?.length, 1);
	assert.match(route, /data = result;\s*void refreshApprovals\(\);\s*void checkAIConnectionOnce\(\);/);
	assert.match(route, /<ConnectAIView data=\{currentData!\} onchanged=\{refresh\} \/>/);
	const service = await readFile(new URL('../../services/orca-ai-apps.ts', import.meta.url), 'utf8');
	assert.match(service, /orcaPath\('\/me\/ai-apps'\)/);
	assert.match(service, /\/me\/ai-apps\/sessions\/\$\{part\(id\)\}\/revoke/);
	assert.match(service, /\/me\/ai-apps\/keys\/\$\{part\(String\(id\)\)\}\/revoke/);
	assert.match(service, /if \(checked\) return pending \?\? Promise\.resolve\(\);/);
	// A server without B1 (404) or without it for this person (403): a neutral pin, never "ยังไม่ได้เชื่อม".
	assert.match(service, /status === 404 \|\| status === 403/);
	assert.match(service, /if \(started === revocations && aiAppsUnavailable\(cause\)\) setAIConnection\(\{ state: 'unknown' \}\)/);
	// One B1 client: nothing else in the app reads GET …/me/ai-apps itself.
	const root = new URL('../../', import.meta.url);
	const files = (await readdir(root, { recursive: true })).filter((name) => /\.(ts|svelte)$/.test(name) && !/\.test\./.test(name));
	const readers = [];
	for (const name of files) if ((await readFile(new URL(name, root), 'utf8')).includes("'/me/ai-apps'")) readers.push(name);
	assert.deepEqual(readers, ['services/orca-ai-apps.ts']);
});

async function strip(props) {
	const { warnings, Component } = await serverComponent(url('AccessStrip'), {
		...common,
		keepCompany: (target) => target.searchParams.set('org', 'org-00000000-0000-4000-8000-000000000001'),
		parseErrorContent: () => ({ status: 500 }),
		OrcaService: {},
		MyAIAppsService: {},
		orcaError: () => 'error',
		showToast: () => {}
	});
	return { warnings, html: render(Component, { props }).body };
}

test('the access strip counts reachable workspaces and names those with their own sign-in apart', async () => {
	const value = data({ hubs: [hub('sales', 'Sales', ['me']), hub('acc', 'Accounts', ['me'], { userSourceID: 'us-1' })] });
	const { warnings, html } = await strip({ data: value, access: ai.connectAccess(value) });
	assert.deepEqual(warnings, []);
	assert.match(html, /Your AI can use data from[\s\S]*1 workspace:/);
	assert.match(html, /class="ca-chip[^"]*">Sales</);
	assert.doesNotMatch(html, /class="ca-chip[^"]*">Accounts</);
	assert.match(html, /1 more workspace \(Accounts\) uses its own company sign-in/);
	assert.match(html, /view=hub&amp;hub=acc&amp;tab=overview/);
});

test('none, manager: add yourself to a ready workspace, or create the first one', async () => {
	const value = data({ hubs: [hub('acc', 'Accounts', ['someone']), hub('sso', 'SSO', ['someone'], { userSourceID: 'us-1' })] });
	const one = await strip({ data: value, access: ai.connectAccess(value) });
	assert.match(one.html, /There is no data for your AI yet/);
	assert.match(one.html, /class="k-button primary[^"]*"[^>]*>[\s\S]*Add me to Accounts/);
	assert.doesNotMatch(one.html, /<select/);
	const two = data({ hubs: [hub('acc', 'Accounts', ['someone']), hub('ops', 'Operations', [])] });
	assert.match((await strip({ data: two, access: ai.connectAccess(two) })).html, /<select[\s\S]*Accounts[\s\S]*Operations[\s\S]*Add me to this workspace/);
	const empty = data({ hubs: [] });
	const first = await strip({ data: empty, access: ai.connectAccess(empty) });
	assert.match(first.html, /href="\/app\?view=new"[^>]*>Create the first workspace/);
	assert.equal(first.html.match(/k-button primary/g)?.length, 1, 'one primary action');
	const brandNew = data({ hubs: [], connections: [] });
	assert.match((await strip({ data: brandNew, access: ai.connectAccess(brandNew) })).html, /href="\/app\?view=add-program"[^>]*>Connect your first program/, 'a new company starts with its first program');
	const drafts = data({ hubs: [hub('d', 'Draft', ['me'], { status: 'draft' })] });
	const unfinished = (await strip({ data: drafts, access: ai.connectAccess(drafts) })).html;
	assert.match(unfinished, /No AI workspace is ready yet[\s\S]*href="\/app\?view=workspaces"[^>]*>Open AI workspaces/);
	assert.doesNotMatch(unfinished, /first workspace/, 'never "first" when one exists');
});

test('only workspaces with their own sign-in: point to their link, never "no access"', async () => {
	for (const canManage of [false, true]) {
		const value = data({ canManage, hubs: [hub('acc', 'Accounts', ['me'], { userSourceID: 'us-1' })] });
		const { warnings, html } = await strip({ data: value, access: ai.connectAccess(value) });
		assert.deepEqual(warnings, []);
		assert.match(html, /Your workspaces connect with their own link[\s\S]*Accounts uses its own company sign-in/);
		assert.match(html, /href="\/app\?view=hub&amp;hub=acc&amp;tab=overview"[^>]*>See Accounts's link/);
		assert.doesNotMatch(html, /You do not have access|Copy the request|Create the first|Add me/, canManage ? 'manager' : 'employee');
		assert.equal(html.match(/uses its own company sign-in/g)?.length, 1, 'said once, not again in the note');
	}
});

test('none, employee: a generic request to copy, whose link leaves the LINE browser', async () => {
	const value = data({ canManage: false, hubs: [], members: [{ id: 'me', displayName: 'Mali', email: 'mali@example.invalid', role: 'employee' }] });
	const { html } = await strip({ data: value, access: ai.connectAccess(value) });
	assert.match(html, /You do not have access to company data yet/);
	assert.match(html, /Ask a company admin/);
	assert.match(html, /Please add me \(Mali · mali@example\.invalid\)[\s\S]*Example Co\.[\s\S]*view=workspaces&amp;org=org-00000000-0000-4000-8000-000000000001&amp;openExternalBrowser=1/);
	assert.match(html, /Copy the request/);
	assert.doesNotMatch(html, /Add me|Create the first/);
});

async function keys(props) {
	const { warnings, Component } = await serverComponent(url('DeveloperKeys'), {
		...common,
		clientNames: () => ({ server: 'orca', keyEnv: 'ORCA_MCP_KEY', vscodeInput: 'orca-key' }),
		OrcaService: {},
		orcaError: () => 'error',
		FormErrorSummary: () => {}
	});
	return { warnings, html: render(Component, { props: { endpoint: 'https://orca.example.test/api/orca/mcp', identity: 'x', oncreated: () => {}, ...props } }).body };
}

test('developer keys: company-wide or one workspace, 30 days by default, never-expiring for managers only', async () => {
	const hubs = [hub('sales', 'Sales', ['me'])];
	const employee = await keys({ hubs, app: 'codex', canManage: false });
	assert.deepEqual(employee.warnings, []);
	assert.match(employee.html, /For developers: connect with a key[\s\S]*not needed for Claude or ChatGPT/);
	assert.match(employee.html, /<option value=""[^>]*>Every workspace I can use<\/option>[\s\S]*<option value="sales">Only Sales<\/option>/);
	assert.match(employee.html, /<option value="30"[^>]*selected[^>]*>30 days/);
	assert.doesNotMatch(employee.html, /No expiry/);
	assert.match((await keys({ hubs, app: 'codex', canManage: true })).html, /<option value="0"[^>]*>No expiry/);
	assert.match(employee.html, /Use the key with Codex[\s\S]*--bearer-token-env-var ORCA_MCP_KEY/, 'the key-mode setup of the chosen tool');
	assert.match(employee.html, /e\.g\. daily report script or n8n/);
	const chat = await keys({ hubs, app: 'claude', canManage: false });
	assert.match(chat.html, /Use the key in your app[\s\S]*Bearer &lt;your key>/);
	assert.doesNotMatch(chat.html, /orca-example-key|type="password"/);
	assert.match((await keys({ hubs: [], app: 'codex', canManage: true })).html, /You need access to a workspace before you can create a key/);
});

test('your connected AI: sign-ins show their last renewal, keys their reach, each with ตัดการเชื่อมต่อ', async () => {
	const { warnings, Component } = await serverComponent(url('ConnectedAIList'), {
		...common, OrcaService: {}, MyAIAppsService: {}, orcaError: () => 'error', showToast: () => {}, ConfirmDialog: () => {}
	});
	assert.deepEqual(warnings, []);
	const props = {
		sessions: [{ id: 's1', app: 'Claude', client: 'claude', createdAt: ago(2), lastRefreshedAt: ago(1), expiresAt: ago(-60) }],
		keys: [{ id: 7, name: 'n8n', hubID: 'sales', createdAt: ago(60 * 30), expiresAt: ago(-60 * 24 * 3) }],
		hubs: [{ id: 'sales', name: 'Sales' }], now: NOW, onchanged: () => {}
	};
	const html = render(Component, { props }).body;
	assert.match(html, /AI you connected[\s\S]*2/);
	assert.match(html, /<b[^>]*>Claude<\/b>[\s\S]*Connected 28 Sept · Last renewed today/);
	assert.match(html, /Key · n8n[\s\S]*Only Sales · Never used · Expires 1 Oct/);
	assert.equal(html.match(/aria-label="Disconnect /g)?.length, 2);
	assert.doesNotMatch(html, /Last used today<\/small>[\s\S]*Claude/, 'a sign-in never claims a last use');
	assert.equal(render(Component, { props: { ...props, sessions: [], keys: [] } }).body.includes('AI you connected'), false);
});

test('a disconnect leaves the list and the pin at once, and a read that started before it never brings it back (Codex release review 67)', async () => {
	const apps = {
		sessions: [{ id: 's1', app: 'Claude', client: 'claude', createdAt: ago(60), lastRefreshedAt: ago(5), expiresAt: ago(-60) }],
		keys: [{ id: 7, name: 'n8n', hubID: 'sales', createdAt: ago(60), lastUsedAt: ago(10), expiresAt: ago(-600) }]
	};
	const revoked = new Set([ai.revokedKey('session', 's1')]);
	const left = ai.withoutRevoked(apps, revoked);
	assert.deepEqual(left.sessions, [], 'the sign-in is gone');
	assert.equal(left.keys.length, 1, 'the key stays');
	assert.deepEqual(ai.aiConnectionFrom(left, NOW, en), { state: 'connected', reach: { hubs: [], keys: ['sales'] } }, 'the pin follows what is left (a used key, for its own workspace)');
	revoked.add(ai.revokedKey('key', 7));
	assert.deepEqual(ai.aiConnectionFrom(ai.withoutRevoked(apps, revoked), NOW, en), { state: 'none' });
	assert.equal(ai.withoutRevoked(apps, new Set()), apps, 'nothing disconnected: the same list');
	const view = await readFile(new URL('./views/ConnectAIView.svelte', import.meta.url), 'utf8');
	assert.match(view, /const result = withoutRevoked\(await MyAIAppsService\.list\(\), revoked\);/, 'every read drops what was disconnected here');
	assert.match(view, /revoked\.add\(revokedKey\(item\.kind, item\.id\)\);[\s\S]{0,120}?aiAppsRevoked\(\);\s*if \(apps\) \{\s*apps = withoutRevoked\(apps, revoked\);\s*setAIConnection\(aiConnectionFrom\(apps, checkedAt, t\)\);/);
	assert.match(view, /<ConnectedAIList [^>]*onchanged=\{disconnected\}/);
	const list = await readFile(url('ConnectedAIList'), 'utf8');
	assert.match(list, /await onchanged\(\{ kind: chosen\.kind, id: chosen\.item\.id \}\);/);
});

test('the pin\'s shared read that started before a disconnect changes nothing, and the next read starts afresh (Codex release review 68)', async () => {
	const source = stripTypeScriptTypes(await readFile(new URL('../../services/orca-ai-apps.ts', import.meta.url), 'utf8'))
		.replace(/^import[^;]+;$/gm, '')
		.replace(/^export /gm, '');
	const make = new Function('deps', `const { parseErrorContent, orcaPath, setAIConnection, markAIDisconnected, aiConnectionFrom, t, doGet, doPost } = deps;\n${source}\nreturn { refreshAIConnection, aiAppsRevoked };`);
	const reads = [];
	const states = [];
	// The real shared store, so the test sees what the pin and Home see.
	const store = await sharedStore();
	const recorded = {
		setAIConnection: (status) => {
			store.setAIConnection(status);
			states.push(store.aiConnection.state);
		},
		markAIDisconnected: () => {
			store.markAIDisconnected();
			states.push(store.aiConnection.state);
		}
	};
	const service = make({
		parseErrorContent: () => ({ status: 500 }), orcaPath: (path) => path, t: en, doPost: async () => ({}),
		...recorded, aiConnectionFrom: ai.aiConnectionFrom,
		doGet: () => new Promise((resolve) => reads.push(resolve))
	});
	store.setAIConnection({ state: 'connected', app: 'Claude' });
	assert.equal(store.aiConnection.disconnected, false);
	const live = { sessions: [{ id: 's1', app: 'Claude', client: 'claude', createdAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }], keys: [] };
	const before = service.refreshAIConnection();
	assert.equal(service.refreshAIConnection(), before, 'calls in flight share one read');
	service.aiAppsRevoked();
	assert.deepEqual(states, ['unknown'], 'a disconnect clears "connected" at once (Codex release review 69)');
	assert.equal(store.aiConnection.app, undefined);
	assert.equal(store.aiConnection.disconnected, true, 'and Home knows an earlier question proves nothing now (Codex release review 70)');
	const after = service.refreshAIConnection();
	assert.notEqual(after, before, 'after a disconnect the next read starts afresh');
	reads[0](live);
	await before;
	assert.deepEqual(states, ['unknown'], 'the read from before the disconnect changes nothing');
	reads[1]({ sessions: [], keys: [] });
	await after;
	assert.deepEqual(states, ['unknown', 'none']);
	assert.equal(store.aiConnection.disconnected, true, 'a later read never forgets the disconnect');
	// A fresh read that fails keeps "unknown", never the old "connected".
	service.aiAppsRevoked();
	const failing = make({
		parseErrorContent: () => ({ status: 500 }), orcaPath: (path) => path, t: en, doPost: async () => ({}),
		...recorded, aiConnectionFrom: ai.aiConnectionFrom,
		doGet: async () => { throw new Error('offline'); }
	});
	states.length = 0;
	failing.aiAppsRevoked();
	await failing.refreshAIConnection();
	assert.deepEqual(states, ['unknown'], 'a failed read after a disconnect leaves the pin neutral');
	const oversight = await readFile(new URL('./ConnectedAIApps.svelte', import.meta.url), 'utf8');
	assert.match(oversight, /await disconnectRow\(chosen\.row\);\s*if \(chosen\.group\.isViewer\) ownRevoked\(\);/, 'ตรวจสอบ: the viewer\'s own app updates the pin');
	assert.match(oversight, /if \(chosen\.isViewer && result\.done > 0\) ownRevoked\(\);/);
	assert.match(oversight, /function ownRevoked\(\) \{\s*aiAppsRevoked\(\);\s*void refreshAIConnection\(\);/);
});

test('the shared store: a disconnect clears the app and is remembered for the page, whatever reads come later (Codex release review 70)', async () => {
	const store = await sharedStore();
	assert.deepEqual({ ...store.aiConnection }, { state: 'unknown', disconnected: false });
	const sales = { id: 'hub-sales', name: 'ฝ่ายขาย', app: 'ChatGPT' };
	store.setAIConnection({ state: 'connected', app: 'ChatGPT', only: [sales], reach: { hubs: [sales], keys: [] } });
	const plain = (value) => JSON.parse(JSON.stringify(value));
	assert.deepEqual(plain(store.aiConnection), { state: 'connected', app: 'ChatGPT', only: [sales], reach: { hubs: [sales], keys: [] }, disconnected: false }, 'where a limited sign-in reaches is kept (B3 follow-up), and what reaches which workspace (Codex review 72)');
	store.markAIDisconnected();
	assert.deepEqual({ ...store.aiConnection }, { state: 'unknown', app: undefined, only: undefined, reach: undefined, disconnected: true });
	store.setAIConnection({ state: 'connected', app: 'Claude', reach: { company: 'Claude', hubs: [], keys: [] } });
	assert.deepEqual(plain(store.aiConnection), { state: 'connected', app: 'Claude', reach: { company: 'Claude', hubs: [], keys: [] }, disconnected: true }, 'another app still connected; the disconnect stays known');
	store.setAIConnection({ state: 'connected', app: 'Claude' });
	assert.equal(store.aiConnection.reach, undefined, 'a read without it leaves no older reach behind');
	store.setAIConnection({ state: 'unknown' });
	assert.equal(store.aiConnection.disconnected, true);
	// Every own disconnect goes through the one service call, which marks it.
	const service = await readFile(new URL('../../services/orca-ai-apps.ts', import.meta.url), 'utf8');
	assert.match(service, /export function aiAppsRevoked\(\): void \{\s*revocations \+= 1;\s*pending = undefined;\s*markAIDisconnected\(\);\s*\}/);
	const view = await readFile(new URL('./views/ConnectAIView.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(view, /markAIDisconnected/, 'the connect page disconnects through aiAppsRevoked');
});

test('เชื่อม AI ของฉัน names where each sign-in reaches, and a limited one is never the company-wide "connected" (B3 follow-up)', async () => {
	const result = await serverComponent(url('ConnectedAIList'), { ...common, term, AIAppTile: () => {}, ConfirmDialog: () => {} });
	assert.deepEqual(result.warnings, []);
	const sessions = [
		{ id: 'co', app: 'Claude', client: 'claude', hubID: '', hubName: '', createdAt: ago(60), lastRefreshedAt: ago(5), expiresAt: ago(-600) },
		{ id: 'ws', app: 'ChatGPT', client: 'chatgpt', hubID: 'sales', hubName: 'Sales', createdAt: ago(60), lastRefreshedAt: ago(5), expiresAt: ago(-600) }
	];
	const html = render(result.Component, { props: { sessions, keys: [], hubs: [{ id: 'sales', name: 'Sales team' }], now: NOW, onchanged: () => {} } }).body;
	assert.match(html, /<b[^>]*>Claude<\/b>\s*<small[^>]*>All my workspaces · Connected/);
	assert.match(html, /<b[^>]*>ChatGPT<\/b>\s*<small[^>]*>Only Sales team · Connected/);
	const view = await readFile(new URL('./views/ConnectAIView.svelte', import.meta.url), 'utf8');
	assert.match(view, /tone: aiConnection\.state === 'connected' && !aiConnection\.only\?\.length \? 'ok' : 'neutral'/);
	const shell = await readFile(new URL('./AppShell.svelte', import.meta.url), 'utf8');
	assert.match(shell, /const aiConnected = \$derived\(\(aiStatus \?\? aiConnection\)\?\.state === "connected" && !\(aiStatus \?\? aiConnection\)\?\.only\?\.length\);/);
	const library = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	// The workspace itself: one with its own sign-in is not on the company's link (Codex review 72).
	assert.match(library, /const connected = \$derived\(aiConnectionReaches\(aiConnection, hub\)\);/);
	// "ถามใน …" names the app that reaches this workspace, never one limited to another (Codex review 71).
	assert.match(library, /const aiApp = \$derived\(aiConnectionAppFor\(aiConnection, hub\)\);/);
	assert.equal(library.match(/app=\{aiApp\}/g)?.length, 3, 'the list, an article\'s detail and a file\'s detail');
	assert.doesNotMatch(library, /aiConnection\.app/);
});

test('step 5 says waiting, connected or asks for a manual check, and step 3 speaks each app’s menus', async () => {
	const result = await serverComponent(url('ConnectResult'), { ...common });
	assert.deepEqual(result.warnings, []);
	const show = (props) => render(result.Component, { props: { app: 'Claude', prompts: ['What can I use in ORCA?', 'Summarize the latest in FlowAccount'], ...props } }).body;
	assert.match(show({ status: 'waiting' }), /Waiting for Claude to connect…[\s\S]*No need to reload/);
	assert.equal(show({ status: 'waiting' }).match(/<li/g)?.length, 1);
	assert.match(show({ status: 'connected', when: 'just now' }), /Claude connected[\s\S]* · just now/);
	assert.equal(show({ status: 'connected' }).match(/<li/g)?.length, 2);
	assert.match(show({ status: 'unknown' }), /Ask Claude whether it sees ORCA/);
	// The check itself failed: never "Waiting… Checked for you" (Codex release review 63).
	const failed = show({ status: 'error', onretry: () => {} });
	assert.match(failed, /Can't check right now[\s\S]*tries again by itself, or ask Claude whether it sees ORCA/);
	assert.match(failed, /<button type="button" class="k-link-button">Try again<\/button>/);
	assert.doesNotMatch(failed, /Waiting for Claude|Checked for you/);
	const view = await readFile(new URL('./views/ConnectAIView.svelte', import.meta.url), 'utf8');
	assert.match(view, /appsState === 'unavailable' \? 'unknown' : appsState === 'error' \? 'error' : 'waiting'/);
	assert.match(view, /<ConnectResult [^>]*onretry=\{\(\) => void poller\?\.poke\(\)\}/);
	assert.doesNotMatch(show({ status: 'idle' }), /<li/);

	const steps = await serverComponent(url('AppSteps'), { ...common, localGatewayEndpoint: () => false });
	assert.deepEqual(steps.warnings, []);
	const props = { endpoint: 'https://orca.example.test/api/orca/mcp', connector: 'ORCA · Example Co.' };
	const claude = render(steps.Component, { props: { ...props, app: 'claude' } }).body;
	assert.match(claude, /<kbd[^>]*>Settings<\/kbd>[\s\S]*<kbd[^>]*>Connectors<\/kbd>[\s\S]*<kbd[^>]*>Add custom connector<\/kbd>[\s\S]*<b[^>]*>ORCA · Example Co\.<\/b>[\s\S]*Paste the link from step 2/);
	assert.match(claude, /href="https:\/\/claude\.ai\/settings\/connectors" target="_blank" rel="noopener noreferrer"/);
	assert.doesNotMatch(claude, /above|ด้านบน/, 'steps name step 2, never "above"');
	const chatgpt = render(steps.Component, { props: { ...props, app: 'chatgpt' } }).body;
	assert.match(chatgpt, /Developer mode must be on first[\s\S]*Plus, Pro and Business/);
	// No unverified deep link: ChatGPT itself, and the written steps say where to go.
	assert.match(chatgpt, /<kbd[^>]*>Settings<\/kbd>[\s\S]*<kbd[^>]*>Apps &amp; Connectors<\/kbd>[\s\S]*<kbd[^>]*>Create<\/kbd>/);
	assert.match(chatgpt, /href="https:\/\/chatgpt\.com\/" target="_blank" rel="noopener noreferrer"[^>]*>\s*Open ChatGPT/);
	assert.doesNotMatch(chatgpt, /#settings/);
	const codex = render(steps.Component, { props: { ...props, app: 'codex' } }).body;
	assert.match(codex, /codex mcp add orca --url &#39;https:\/\/orca\.example\.test\/api\/orca\/mcp&#39;|codex mcp add orca --url 'https:\/\/orca\.example\.test\/api\/orca\/mcp'/);
	assert.match(codex, /codex mcp login orca/);
	assert.match(render(steps.Component, { props: { ...props, app: 'cursor' } }).body, /href="cursor:\/\/anysphere\.cursor-deeplink/);
	assert.match(render(steps.Component, { props: { ...props, app: 'other' } }).body, /Copy setup instructions/);
});

test('the picker offers Claude first, then ChatGPT, with developer tools behind a toggle', async () => {
	const picker = await serverComponent(url('AIAppPicker'), { ...common, ChoiceTile: (renderer, p) => renderer.push(`<label data-value="${p.value}" data-selected="${p.selected}">${p.title}</label>`) });
	assert.deepEqual(picker.warnings, []);
	const html = render(picker.Component, { props: { app: 'claude', onselect: () => {} } }).body;
	assert.deepEqual([...html.matchAll(/data-value="([^"]+)"/g)].map((match) => match[1]), ['claude', 'chatgpt']);
	assert.match(html, /aria-expanded="false"[\s\S]*Developer tools[\s\S]*Claude Code, Codex, Cursor, VS Code and more/);
	const drawing = await serverComponent(url('ConsentDrawing'), { ...common, Brand: () => {} });
	assert.deepEqual(drawing.warnings, []);
	const window = render(drawing.Component, { props: { app: 'ChatGPT', host: 'orca.example.test', name: 'Mali', email: 'mali@example.invalid' } }).body;
	assert.match(window, /orca\.example\.test[\s\S]*ChatGPT wants to use company data through ORCA for you[\s\S]*Mali[\s\S]*mali@example\.invalid[\s\S]*Allow/);
	assert.match(window, /role="img" aria-label="Example of the ORCA window/);
});

test('program sign-ins and the in-app browser notice keep their promises', async () => {
	const programs = await readFile(url('ProgramSignIns'), 'utf8');
	assert.match(programs, /personalSources\(data\)/, 'the same rule as the person’s own program list');
	assert.match(programs, /<Sheet[\s\S]*<SourceSetup /, 'signing in opens the existing setup in a side panel');
	assert.match(programs, /id="accounts"/, 'old links to #accounts land here');
	assert.match(programs, /ขอให้ผู้ดูแลเพิ่มผู้ใช้ใน \$\{row\.name\}/, 'critique 5: people without their own login');
	const view = await readFile(new URL('./views/ConnectAIView.svelte', import.meta.url), 'utf8');
	// LINE and Facebook: the one shared notice (in-app-browser.ts), as on /login and /invite.
	assert.match(view, /import InAppBrowserNotice from '\.\.\/InAppBrowserNotice\.svelte'/);
	assert.match(view, /<InAppBrowserNotice level=\{2\} variant="workspace" \/>/);
	assert.doesNotMatch(view, /navigator\.userAgent|withExternalBrowser/);
	for (const source of [programs, view, ...await Promise.all(['AccessStrip', 'AIAppPicker', 'AppSteps', 'ConnectResult', 'ConnectStep', 'ConnectedAIList', 'ConsentDrawing', 'DeveloperKeys'].map((name) => readFile(url(name), 'utf8')))]) {
		assert.doesNotMatch(source, /#fff\b|#ffffff|#151823/i, 'tokens only');
		assert.doesNotMatch(source, /localStorage\.setItem\((?!.*AI_APP_KEY)/, 'only the chosen app is remembered in the browser');
	}
});

test('"AI ที่คุณเชื่อมไว้" uses the one AI app tile, not its own logo colours', async () => {
	const list = await readFile(new URL('./connect-ai/ConnectedAIList.svelte', import.meta.url), 'utf8');
	assert.match(list, /import AIAppTile from '\.\.\/AIAppTile\.svelte'/);
	assert.match(list, /<AIAppTile kind=\{session\.client\} size=\{40\} \/>/);
	assert.match(list, /<AIAppTile kind="key" size=\{40\} \/>/);
	assert.doesNotMatch(list, /ToolIcon|#[0-9a-f]{6}\b/i);
});
