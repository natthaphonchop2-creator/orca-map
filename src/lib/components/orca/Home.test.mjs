import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// หน้าหลัก (W0, the calm workspace): ต้องดูแล, the overview tiles and ล่าสุด,
// Help and the in-app-browser notice, rendered on the server with their real
// rules. The first-run checklist (U6) is gone: its steps are ต้องดูแล rows.
const home = await importTypeScript(new URL('../../orca/home-setup.ts', import.meta.url));
const attention = await importTypeScript(new URL('../../orca/home-attention.ts', import.meta.url));
const activation = await importTypeScript(new URL('../../orca/activation.ts', import.meta.url));
const gateway = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const glossary = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const inApp = await importTypeScript(new URL('../../orca/in-app-browser.ts', import.meta.url));
const copy = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));
const navigation = await importTypeScript(new URL('../../orca/navigation.ts', import.meta.url));
const connectedApps = await importTypeScript(new URL('../../orca/connected-ai-apps.ts', import.meta.url));
const secrets = await importTypeScript(new URL('../../orca/secrets.ts', import.meta.url));
const connectAI = await importTypeScript(new URL('../../orca/connect-ai.ts', import.meta.url));
const aiConnection = await importTypeScript(new URL('../../orca/ai-connection.ts', import.meta.url));
const support = await importTypeScript(new URL('../../orca/support.ts', import.meta.url));
const programTools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
const programCatalog = await importTypeScript(new URL('../../orca/program-catalog.ts', import.meta.url));

const th = (thai) => thai;
const base = { ...home, ...attention, ...activation, ...gateway, ...inApp, ...copy, ...support, TEAM_INVITE_HREF: navigation.TEAM_INVITE_HREF, connectedAppsHref: connectedApps.connectedAppsHref, STALE_DAYS: secrets.STALE_DAYS, term: glossary.term, t: th, localeHref: (path) => path, orcaLocale: { value: 'th' } };
const component = async (path, deps) => {
	const { warnings, Component } = await serverComponent(new URL(path, import.meta.url), deps);
	assert.deepEqual(warnings, [], path);
	return Component;
};
const StatusPill = await component('./ui/StatusPill.svelte', base);
const children = { ...base, StatusPill };
children.SupportContact = await component('./ui/SupportContact.svelte', base);

const tool = (name, readOnlyHint) => ({ name, inputSchema: {}, definition: { annotations: { readOnlyHint } } });
const flow = {
	id: 'conn-flow', name: 'FlowAccount', description: '', mcpID: 'default-orca-flowaccount',
	tools: [tool('list_invoices', true), tool('get_invoice', true), tool('create_quotation', false)],
	toolNames: ['list_invoices', 'get_invoice', 'create_quotation'], scopeNote: '', reviewedReadOnly: false, reviewedTools: true,
	enabled: true, version: 1, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z'
};
const workspace = {
	id: 'hub-1', name: 'ผู้ช่วยบัญชี', description: '', connectionID: 'conn-flow', toolNames: ['list_invoices'],
	sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }], memberIDs: ['me'], effectiveMemberIDs: ['me'], unitIDs: [],
	dailyLimit: 100, status: 'active', version: 1, createdAt: '2026-09-03T00:00:00Z', updatedAt: '2026-09-03T00:00:00Z', connectURL: '', usedToday: 0
};
const company = (extra = {}) => ({
	organization: { displayName: 'บริษัท ตัวอย่าง', timezone: 'Asia/Bangkok', version: 1 },
	currentUserID: 'me', canManage: true, members: [{ id: 'me', displayName: 'วิภา ตัวอย่าง', email: 'me@example.com', role: 'owner' }],
	units: [], connections: [], hubs: [], ...extra
});
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const rows = (input) => attention.managerAttention({ pendingApprovals: 0, staleApps: 0, iconName: (connection) => connection.name, ...input }, th);
const ids = (list) => list.map((row) => row.id);

test('ต้องดูแล for a new company: connect a program first; nothing else is claimed before it is known', () => {
	const list = rows({ data: company() });
	assert.deepEqual(ids(list), ['program']);
	assert.equal(list[0].title, 'ยังไม่ได้เชื่อมโปรแกรม');
	assert.equal(list[0].action.href, '/app?view=servers&catalog=1', 'the catalog dialog on โปรแกรม');
	// No numbered steps or time estimates anywhere in the rows.
	assert.doesNotMatch(JSON.stringify(list), /ขั้นตอน|ประมาณ \d+ นาที|เสร็จ \d+ จาก/);
});

test('ต้องดูแล: a ready program with no workspace offers the one click for everyone, or adding myself to theirs', () => {
	let list = rows({ data: company({ connections: [flow] }) });
	assert.deepEqual(ids(list), ['team']);
	assert.equal(list[0].title, 'ทีมยังใช้ FlowAccount กับ AI ไม่ได้');
	assert.equal(list[0].action.href, '/app?view=new&everyone=1&connection=conn-flow');
	// A ready workspace I'm not in: add myself instead of making another.
	const theirs = { ...workspace, memberIDs: ['other'], effectiveMemberIDs: ['other'] };
	list = rows({ data: company({ connections: [flow], hubs: [theirs] }) });
	assert.deepEqual(ids(list), ['team']);
	assert.equal(list[0].action.href, '/app?view=hub&hub=hub-1&tab=people');
	// Set up: nothing.
	assert.deepEqual(ids(rows({ data: company({ connections: [flow], hubs: [workspace] }) })), []);
});

test('ต้องดูแล for managers: approvals, company accounts to reconnect, programs to review, workspaces, paused programs and unused AI apps', () => {
	const unreviewed = { ...flow, id: 'conn-new', name: 'PEAK', mcpID: 'default-orca-peak', reviewedTools: false, reviewedReadOnly: false };
	const paused = { ...flow, id: 'conn-paused', name: 'Gmail', enabled: false };
	const shared = { ...flow, id: 'conn-shared', name: 'Google Drive', programAccountID: 'acct-1' };
	const blockedHub = { ...workspace, id: 'hub-2', sources: [{ connectionID: 'conn-new', toolNames: [] }], connectionID: 'conn-new', toolNames: [] };
	const data = company({ connections: [flow, unreviewed, paused, shared], hubs: [workspace, blockedHub] });
	const accounts = [{ id: 'acct-1', sourceID: 'drive', label: 'office', status: 'needs_reconnect', pausedReason: 'grant_revoked', generation: 1, acknowledgedRevision: 0, staged: false, createdAt: 'x', updatedAt: 'x' }];
	const changed = new Map([['conn-flow', { changed: 1, lastFailureAt: '2026-09-05T00:00:00Z' }]]);
	const list = rows({ data, pendingApprovals: 2, accounts, health: changed, staleApps: 3 });
	assert.deepEqual(ids(list), ['approvals', 'reconnect:conn-shared', 'setup', 'review', 'blocked', 'paused', 'stale']);
	const by = Object.fromEntries(list.map((row) => [row.id, row]));
	assert.equal(by.approvals.title, 'รออนุมัติ 2 รายการ');
	assert.equal(by.approvals.action.href, '/app?view=approvals');
	// The same word as the โปรแกรม tile.
	assert.equal(by['reconnect:conn-shared'].title, 'Google Drive ต้องเชื่อมใหม่');
	assert.match(by['reconnect:conn-shared'].meta, /หมดอายุหรือถูกยกเลิก/);
	assert.equal(by['reconnect:conn-shared'].action.href, '/app?view=servers&connection=conn-shared');
	assert.equal(by.setup.title, 'โปรแกรมรอเลือกสิ่งที่ AI ทำได้ 1 โปรแกรม');
	assert.equal(by.review.title, 'โปรแกรมที่ต้องตรวจใหม่ 1 โปรแกรม');
	assert.equal(by.blocked.title, 'พื้นที่ทำงานที่ยังใช้ไม่ได้ 1 แห่ง');
	assert.equal(by.paused.title, 'โปรแกรมที่หยุดชั่วคราว 1 โปรแกรม');
	assert.equal(by.stale.title, 'มี 3 แอป AI ที่ไม่ได้ใช้เกิน 30 วัน');
	assert.equal(by.stale.action.href, connectedApps.connectedAppsHref('stale'), 'the alert opens แอป AI ที่เชื่อม on its own filter');
	for (const row of list) assert.ok(row.action.label, row.id);
	// A tool changed before the last save is history, not a review.
	const cleared = new Map([['conn-flow', { changed: 2, lastFailureAt: '2026-09-01T00:00:00Z' }]]);
	assert.ok(!ids(rows({ data: company({ connections: [flow], hubs: [workspace] }), health: cleared })).includes('review'));
	// Without the company accounts list, no program is said to need reconnecting.
	assert.ok(!ids(rows({ data })).some((id) => id.startsWith('reconnect:')));
	assert.equal(attention.programsToReconnect([shared, { ...shared, id: 'gone', archivedAt: 'x' }], accounts).length, 1, 'archived programs do not count');
});

test('ต้องดูแล for employees: ask an admin for access, then sign in to each program of theirs', () => {
	let list = attention.employeeAttention({ accounts: [], noWorkspace: true, requestText: 'รบกวนเพิ่มฉัน https://a.test/app?openExternalBrowser=1' }, th);
	assert.deepEqual(ids(list), ['access']);
	assert.equal(list[0].action.label, 'คัดลอกข้อความขอสิทธิ์');
	assert.match(list[0].action.copy, /openExternalBrowser=1/);
	assert.match(list[0].meta, /ขอสิทธิ์จากผู้ดูแล/);
	list = attention.employeeAttention({
		accounts: [
			{ id: 'default-orca-flowaccount', name: 'FlowAccount', icon: 'FlowAccount', state: 'signed-in' },
			{ id: 'drive', name: 'Google Drive', icon: 'Google Drive', state: 'needed' },
			{ id: 'later', name: 'PEAK', icon: 'PEAK', state: 'waiting' }
		],
		noWorkspace: false,
		requestText: ''
	}, th);
	assert.deepEqual(ids(list), ['account:drive']);
	assert.equal(list[0].title, 'ลงชื่อเข้าใช้ Google Drive');
	assert.equal(list[0].action.href, '/app?view=connect-ai#accounts');
});

test('the AI row: none until B1 answers; never connected, or lapsed (expired, disconnected, limited), never claimed from history alone', () => {
	assert.equal(attention.aiAttention('none', false, false), undefined, 'not before B1 answers');
	assert.equal(attention.aiAttention('connected', true, true), undefined);
	assert.equal(attention.aiAttention('unknown', true, false), undefined, 'an older server: nothing claimed');
	assert.equal(attention.aiAttention('none', true, false), 'never');
	assert.equal(attention.aiAttention('none', true, undefined), 'lapsed');
	assert.equal(attention.aiAttention('none', true, true), 'lapsed');
	assert.equal(attention.aiAttention('limited', true, false), 'lapsed');
	// After my own disconnect, an earlier question proves nothing: the banner says I disconnected it.
	assert.equal(attention.aiAttention('revoked', true, true), 'lapsed');
	assert.equal(home.aiLapse({ state: 'unknown', disconnected: true }, 'revoked'), 'disconnected');
});

test('หน้าหลัก: a greeting with today\'s use, ต้องดูแล only when there is something, and no setup checklist', async () => {
	const personal = await importTypeScript(new URL('../../orca/personal-connections.ts', import.meta.url));
	const PageHeader = await component('./ui/PageHeader.svelte', children);
	const Dashboard = await component('./WorkspaceDashboard.svelte', {
		...children, ...personal, PageHeader, currentCompany: () => 'default', aiConnection: { state: 'unknown' },
		connectAccess: connectAI.connectAccess, onlyWorkspacesText: aiConnection.onlyWorkspacesText
	});
	const page = (data, props = {}) => render(Dashboard, { props: { data, ...props } }).body;

	let html = page(company());
	assert.match(html, /<h1[^>]*>สวัสดี คุณวิภา<\/h1>/);
	assert.match(text(html), /วันนี้ AI ใช้ข้อมูลบริษัท 0 ครั้ง/);
	assert.match(text(html), /ต้องดูแล 1 ยังไม่ได้เชื่อมโปรแกรม/);
	assert.match(html, /href="\/app\?view=servers&amp;catalog=1"/);
	assert.doesNotMatch(text(html), /ขั้นตอน|ประมาณ \d+ นาที|ยินดีต้อนรับ|ไม่มีเรื่องที่ต้องดูแล|ตั้งค่าเสร็จแล้ว|ติดตรงไหน/);
	assert.doesNotMatch(html, /id="setup"|home-stat\b|home-bar/);
	// Set up, nothing to do: no ต้องดูแล at all, and no create buttons (สร้าง is in the top bar).
	html = page(company({ connections: [flow], hubs: [{ ...workspace, usedToday: 12 }] }));
	assert.match(text(html), /วันนี้ AI ใช้ข้อมูลบริษัท 12 ครั้ง/);
	assert.doesNotMatch(text(html), /ต้องดูแล/);
	assert.doesNotMatch(html, /view=new"|k-button primary/);
	// Approvals waiting: the first row.
	html = page(company({ connections: [flow], hubs: [workspace] }), { pendingApprovals: 3 });
	assert.match(text(html), /ต้องดูแล 1 รออนุมัติ 3 รายการ/);
	assert.match(html, /href="\/app\?view=approvals"[^>]*>ดูคำขอ<\/a>/);

	// An employee with no usable workspace asks an admin, in generic words.
	const employee = company({ canManage: false, members: [{ id: 'me', displayName: 'มาลี สมมุติ', email: 'mali@example.com', role: 'member' }] });
	html = page(employee);
	assert.match(html, /<h1[^>]*>สวัสดี คุณมาลี<\/h1>/);
	assert.match(text(html), /วันนี้ AI ใช้ข้อมูลในพื้นที่ทำงานของคุณ 0 ครั้ง/);
	assert.match(text(html), /ยังไม่มีพื้นที่ทำงาน AI ที่คุณใช้ได้/);
	assert.match(text(html), /คัดลอกข้อความขอสิทธิ์/);
	const source = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.match(source, /accessRequestText\(/, 'the request names them, their email and the company');
	assert.doesNotMatch(source, /OwnerSetup|EmployeeSetup|homeMode|invitations\(\)/);
});

test('a lapsed AI sign-in: one row of ต้องดูแล and a way back', async () => {
	const Banner = await component('./home/AIReconnectBanner.svelte', base);
	const html = render(Banner).body;
	assert.match(text(html), /การเชื่อม AI ของคุณหมดอายุแล้ว เชื่อมใหม่/);
	assert.match(html, /<a class="k-button small[^"]*" href="\/app\?view=connect-ai">เชื่อมใหม่<\/a>/);
	const english = render(await component('./home/AIReconnectBanner.svelte', { ...base, t: (_th, en) => en })).body;
	assert.match(text(english), /Your AI connection has expired Reconnect/);
	// I disconnected it myself on this page: it did not expire (Codex release review 70).
	const mine = render(Banner, { props: { lapse: 'disconnected' } }).body;
	assert.match(text(mine), /คุณตัดการเชื่อม AI แล้ว เชื่อมใหม่/);
	assert.doesNotMatch(text(mine), /หมดอายุ/);
	assert.match(mine, /href="\/app\?view=connect-ai">เชื่อมใหม่<\/a>/);
	// Home: the banner sits in ต้องดูแล, once, with the lapse from the store.
	const page = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{:else if aiRow === 'lapsed'\}\s*<AIReconnectBanner lapse=\{aiLapse\(aiConnection, ai\)\} only=\{aiOnly\} own=\{access\.ownSignIn\} \/>/);
	assert.equal(page.match(/<AIReconnectBanner/g)?.length, 1);
	assert.match(page, /const aiOnly = \$derived\(ai === 'limited' \? onlyWorkspacesText\(aiConnection\.only \?\? \[\], t\) : ''\);/);
	// Connected only through a workspace's own link: where it reaches, and the company link (B3 follow-up).
	const limited = render(Banner, { props: { lapse: 'limited', only: 'เฉพาะ ฝ่ายขาย' } }).body;
	assert.match(text(limited), /AI ของคุณใช้ได้เฉพาะ ฝ่ายขาย ใช้ลิงก์ของบริษัท/);
	assert.doesNotMatch(text(limited), /หมดอายุ|คุณตัดการเชื่อม/);
	// A live sign-in that reaches none of my workspaces (they have their own sign-in): nothing expired (Codex review 72).
	const unreached = render(Banner, { props: { lapse: 'unreached', own: [{ id: 'h sso', name: 'ฝ่ายขาย' }] } }).body;
	assert.match(text(unreached), /AI ที่เชื่อมไว้ยังใช้พื้นที่ทำงานของคุณไม่ได้ ใช้ลิงก์ของ ฝ่ายขาย/);
	assert.match(unreached, /href="\/app\?view=hub&amp;hub=h%20sso&amp;tab=overview">ใช้ลิงก์ของ ฝ่ายขาย<\/a>/, 'its link is on its overview');
	assert.doesNotMatch(text(unreached), /หมดอายุ|คุณตัดการเชื่อม|ลิงก์ของบริษัท/);
	const several = render(Banner, { props: { lapse: 'unreached', own: [{ id: 'a', name: 'ฝ่ายขาย' }, { id: 'b', name: 'บัญชี' }] } }).body;
	assert.match(text(several), /AI ที่เชื่อมไว้ยังใช้พื้นที่ทำงานของคุณไม่ได้ ดูลิงก์ที่ต้องใช้/);
	assert.match(several, /href="\/app\?view=connect-ai">ดูลิงก์ที่ต้องใช้<\/a>/);
	const unreachedEn = render(await component('./home/AIReconnectBanner.svelte', { ...base, t: (_th, en) => en }), { props: { lapse: 'unreached', own: [{ id: 'h', name: 'Sales' }] } }).body;
	assert.match(text(unreachedEn), /The AI you connected can't use your workspaces yet Use Sales's link/);
	const banner = await readFile(new URL('./home/AIReconnectBanner.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(banner, /#[0-9a-f]{3,6}\b|rgba?\(/i, 'tokens only');
	// "ใช้ลิงก์ของ {a long workspace name}" wraps inside the button on a phone, never past the row (Codex review 73).
	const button = banner.slice(banner.indexOf('.home-reconnect .k-button {'));
	assert.match(button, /^\.home-reconnect \.k-button \{[^}]*flex: 0 1 auto;[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
	assert.doesNotMatch(button.slice(0, button.indexOf('}')), /flex: none/);
});

test('back on Home while AI is not connected, it checks again by itself, without blanking what it shows (Codex release review 63)', async () => {
	const page = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	const recheck = page.slice(page.indexOf('async function recheck()'), page.indexOf('async function loadAIApps()'));
	assert.match(recheck, /if \(!alive \|\| !aiRow \|\| document\.visibilityState === 'hidden'\) return;/, 'only while the AI row shows and the page is seen');
	assert.match(recheck, /Date\.now\(\) - lastRecheck < 10_000/, 'at most every 10 seconds');
	assert.match(recheck, /await OrcaService\.audit\(\)/);
	assert.match(recheck, /await refreshAIConnection\(\)/);
	assert.doesNotMatch(recheck, /events = undefined/, 'the list stays on screen while it checks');
	assert.match(page, /document\.addEventListener\('visibilitychange', onReturn\);\s*window\.addEventListener\('focus', onReturn\);/);
	assert.match(page, /onDestroy\(\(\) => \{\s*alive = false;\s*stopRechecks\(\);/);
});

test('the overview tiles and ล่าสุด follow the role: เชื่อมแล้ว for managers, ใช้ได้ for employees', async () => {
	const HomeStatus = await component('./home/HomeStatus.svelte', {
		...children, eventToolLabel: programTools.eventToolLabel, programEventOutcome: programCatalog.programEventOutcome,
		displayDate: (value) => value, memberName: (member) => member.displayName
	});
	const titled = { ...flow, tools: flow.tools.map((item) => ({ ...item, description: 'ค้นใบกำกับตามลูกค้า', definition: { ...item.definition, annotations: { ...item.definition.annotations, title: item.name === 'create_quotation' ? 'สร้างใบเสนอราคา' : 'ดูใบกำกับภาษี' } } })) };
	const shared = { ...titled, id: 'conn-shared', name: 'Google Drive', programAccountID: 'acct-1' };
	const events = [
		{ id: 'e1', createdAt: '2026-09-28T03:00:00Z', userID: 'me', hubID: 'hub-1', connectionID: 'conn-flow', action: 'tools.call', toolName: 'list_invoices', outcome: 'success' },
		{ id: 'e2', createdAt: '2026-09-28T02:00:00Z', userID: 'u2', hubID: 'hub-1', connectionID: 'conn-flow', action: 'tools.call', toolName: 'create_quotation', outcome: 'admitted' },
		{ id: 'e3', createdAt: '2026-09-28T01:00:00Z', userID: 'u2', hubID: 'hub-1', connectionID: 'conn-flow', action: 'tools.call', toolName: 'get_invoice', outcome: 'error' }
	];
	const members = [
		{ id: 'me', displayName: 'วิภา ตัวอย่าง', email: 'me@example.com', role: 'owner' },
		{ id: 'u2', displayName: 'มาลี สมมุติ', email: 'm@example.com', role: 'member' }
	];
	const accounts = [{ id: 'acct-1', status: 'needs_reconnect' }];
	let html = render(HomeStatus, { props: { data: company({ members, connections: [titled, shared], hubs: [workspace] }), events, accounts, ai: 'connected', aiApp: 'Claude', knowledge: { count: 18, updatedAt: '2026-10-05' } } }).body;
	let plain = text(html);
	assert.match(plain, /โปรแกรม 2 เชื่อมแล้ว/);
	// The tile's footer uses the same word as the ต้องดูแล row.
	assert.match(html, /<span class="home-state warn[^"]*"><span class="home-dot[^"]*" aria-hidden="true"><\/span>ต้องเชื่อมใหม่ 1<\/span>/);
	assert.match(plain, /AI ของฉัน Claude เชื่อมแล้ว/);
	assert.match(plain, /คลังความรู้ 18 เรื่อง แก้ล่าสุด 2026-10-05/);
	assert.doesNotMatch(plain, /Skills/, 'no Skills tile without the feature');
	assert.match(html, /class="home-tiles[^"]*\bthree\b/);
	// ล่าสุด: the program's own title, who and where; a call that went through shows its time.
	assert.match(plain, /ดูใบกำกับภาษี วิภา ตัวอย่าง · ผู้ช่วยบัญชี 2026-09-28T03:00:00Z/);
	// "admitted" was received, never "waiting for approval"; only a failed call gets a word.
	assert.match(plain, /สร้างใบเสนอราคา มาลี สมมุติ · ผู้ช่วยบัญชี 2026-09-28T02:00:00Z/);
	assert.doesNotMatch(plain, /รออนุมัติ|รับคำขอแล้ว|(?<!ไม่)สำเร็จ/);
	assert.match(html, /<span class="home-state deny[^"]*">ไม่สำเร็จ<\/span>/);
	assert.doesNotMatch(plain, /List invoices|Create quotation/);
	assert.match(html, /href="\/app\?view=executions"[^>]*>ดูประวัติ/);
	assert.match(html, /href="\/app\?view=servers"/);
	// With Skills: four tiles.
	html = render(HomeStatus, { props: { data: company({ members, connections: [titled], hubs: [workspace] }), events, skills: { count: 0 } } }).body;
	assert.doesNotMatch(html, /class="home-tiles[^"]*\bthree\b/);
	assert.match(html, /href="\/app\?view=skills"/);

	// An employee: their own programs (ใช้ได้), their own history without a person, and no manager pages.
	html = render(HomeStatus, { props: { data: company({ canManage: false, connections: [titled], hubs: [workspace] }), events, accounts, ai: 'none' } }).body;
	plain = text(html);
	assert.match(plain, /โปรแกรม 1 ใช้ได้/);
	assert.doesNotMatch(plain, /เชื่อมแล้ว|ต้องเชื่อมใหม่|วิภา ตัวอย่าง|มาลี สมมุติ/);
	assert.match(plain, /AI ของฉัน ยังไม่ได้เชื่อม/);
	assert.doesNotMatch(html, /view=servers/, 'employees reach programs through AI ของฉัน');
	assert.match(html, /href="\/app\?view=connect-ai#accounts"/);
	assert.match(plain, /คลังความรู้ — เรื่อง/, 'no count before it is read');
});

test('ต้องดูแล says when a check failed, with a retry, instead of a false "nothing to do" (Codex release review 67)', async () => {
	const dashboard = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.match(dashboard, /checks = results\.every\(\(result\) => result\.status === 'fulfilled'\) \? 'done' : 'failed';/, 'either read failing is a failed check');
	assert.match(dashboard, /\{#if manager && checks === 'failed'\}[\s\S]*?ตรวจแอป AI ที่ไม่ได้ใช้และโปรแกรมที่เปลี่ยนไปไม่สำเร็จ[\s\S]*?onclick=\{\(\) => void loadChecks\(\)\}>\{t\('ลองอีกครั้ง'/);
	assert.doesNotMatch(dashboard, /ไม่มีเรื่องที่ต้องดูแล/, 'an empty ต้องดูแล is simply not shown');
});

test('Help is a short FAQ without setup steps or a sign-out button', async () => {
	const Help = await component('./views/HelpView.svelte', { ...base, PageHeader: await component('./ui/PageHeader.svelte', children) });
	let html = render(Help, { props: { data: { canManage: true, canChangeMemberStatus: true } } }).body;
	assert.match(html, /<h1[^>]*>ช่วยเหลือ<\/h1>/);
	// W0: no numbered setup steps and no second primary button; ต้องดูแล on Home holds what is left.
	assert.doesNotMatch(html, /app#setup|ขั้นตอน|k-button primary/);
	assert.equal((html.match(/<details\b/g) ?? []).length, 7);
	assert.match(html, /href="\/app\?view=members"/);
	assert.match(html, /href="\/app\?view=secrets"/);
	assert.doesNotMatch(html, /sign_out|ออกจากระบบ/);
	// "ยังติดอยู่": the ORCA team's LINE (a new tab) and email, never the trial-request form, which is for companies not on ORCA yet.
	const stillStuck = (page) => page.slice(page.indexOf('ยังติดอยู่'));
	const MarkedHelp = await component('./views/HelpView.svelte', { ...base, localeHref: (path) => `${path}#via-locale`, PageHeader: await component('./ui/PageHeader.svelte', children) });
	for (const data of [{ canManage: true, canChangeMemberStatus: true }, { canManage: false }]) {
		const answer = stillStuck(render(MarkedHelp, { props: { data } }).body);
		assert.match(answer, /<a href="https:\/\/line\.me\/R\/ti\/p\/@147njpwd" target="_blank" rel="noopener noreferrer"[^>]*>ส่งข้อความหาทีม ORCA ทาง LINE <span[^>]*>@147njpwd<\/span>/);
		assert.match(answer, /<a href="mailto:natthaphon\.chop@gmail\.com"[^>]*>อีเมล <span[^>]*>natthaphon\.chop@gmail\.com<\/span>/);
		assert.doesNotMatch(answer, /\/home\?to=start|#via-locale/, 'the contact links are not passed through localeHref');
	}
	// Without the right to suspend, the answer names only what they can do.
	html = render(Help, { props: { data: { canManage: true, canChangeMemberStatus: false } } }).body;
	assert.doesNotMatch(html, /href="\/app\?view=members"/);
	// Employees get their own answers and no manager pages.
	html = render(Help, { props: { data: { canManage: false } } }).body;
	assert.equal((html.match(/<details\b/g) ?? []).length, 6);
	assert.doesNotMatch(html, /view=approvals|view=secrets|\/home\?to=start/);
	assert.doesNotMatch(text(html), /ขั้นตอน ประมาณ/);

	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{:else if view === "help"\}<HelpView \{data\} \/>/);
	assert.doesNotMatch(page, /WorkspaceSetup|oauth2\/sign_out/);
});

test('the in-app browser notice: LINE opens outside, Facebook explains the menu, others see nothing', async () => {
	const Notice = await component('./InAppBrowserNotice.svelte', base);
	const href = 'https://orca.example.test/login?rd=%2Fapp';
	let html = render(Notice, { props: { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 Safari Line/14.9.0', href } }).body;
	assert.match(html, /<h3 id="(o-inapp-[^"]+)" class="o-inapp-title[^"]*">(?:(?!<\/h3>)[\s\S])*เปิดใน Chrome หรือ Safari/);
	assert.match(html, /<section class="o-inapp[^"]*" aria-labelledby="(o-inapp-[^"]+)">[\s\S]*id="\1"/, 'the section is named by its heading');
	assert.match(html, /<a class="o-button outline(?: svelte-[\w-]+)?" href="https:\/\/orca\.example\.test\/login\?rd=%2Fapp&amp;openExternalBrowser=1">/);
	assert.match(html, /class="o-button outline(?: svelte-[\w-]+)?"[^>]*>[\s\S]*?คัดลอกลิงก์/);
	// The page below keeps the one primary button: the notice's are outlined.
	assert.doesNotMatch(html, /class="o-button(?: svelte-[\w-]+)?"|primary/);
	// Inside the workspace (เชื่อม AI ของฉัน): the app's own buttons, still never a second primary.
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 Safari Line/14.9.0', href, level: 2, variant: 'workspace' } }).body;
	assert.match(html, /<section class="o-inapp[^"]*\bworkspace\b[^"]*"/);
	assert.match(html, /<a class="k-button(?: svelte-[\w-]+)?" href="[^"]*openExternalBrowser=1">/);
	assert.doesNotMatch(html, /o-button|primary/);
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 Safari Line/14.9.0', href, level: 2 } }).body;
	assert.match(html, /<h2 id="o-inapp-[^"]+" class="o-inapp-title[^"]*">/);
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 [FB_IAB/FB4A;FBAV/470.0.0.0;]', href } }).body;
	assert.match(text(html), /Facebook เปิดหน้านี้ในเบราว์เซอร์ของแอป/);
	assert.match(text(html), /แตะ ⋯ มุมขวาบน/);
	assert.doesNotMatch(html, /openExternalBrowser/);
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 330.0.0.0 (iPhone15,2; iOS 17_5; th_TH)', href } }).body;
	assert.match(text(html), /Instagram เปิดหน้านี้ในเบราว์เซอร์ของแอป/);
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/126.0 Safari/537.36', href } }).body;
	assert.equal(text(html).trim(), '');
});
