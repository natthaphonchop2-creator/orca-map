import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// Home's first-run checklist, Help and the in-app-browser notice, rendered on
// the server with their real children and rules (workspace UX U6).
const home = await importTypeScript(new URL('../../orca/home-setup.ts', import.meta.url));
const activation = await importTypeScript(new URL('../../orca/activation.ts', import.meta.url));
const gateway = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const glossary = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const inApp = await importTypeScript(new URL('../../orca/in-app-browser.ts', import.meta.url));
const copy = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));
const navigation = await importTypeScript(new URL('../../orca/navigation.ts', import.meta.url));
const connectedApps = await importTypeScript(new URL('../../orca/connected-ai-apps.ts', import.meta.url));
const secrets = await importTypeScript(new URL('../../orca/secrets.ts', import.meta.url));

const th = (thai) => thai;
const base = { ...home, ...activation, ...gateway, ...inApp, ...copy, TEAM_INVITE_HREF: navigation.TEAM_INVITE_HREF, connectedAppsHref: connectedApps.connectedAppsHref, STALE_DAYS: secrets.STALE_DAYS, term: glossary.term, t: th, localeHref: (path) => path, orcaLocale: { value: 'th' } };
const component = async (path, deps) => {
	const { warnings, Component } = await serverComponent(new URL(path, import.meta.url), deps);
	assert.deepEqual(warnings, [], path);
	return Component;
};
const StatusPill = await component('./ui/StatusPill.svelte', base);
const children = { ...base, StatusPill };
children.SetupStep = await component('./home/SetupStep.svelte', children);
children.SetupCard = await component('./home/SetupCard.svelte', children);
children.PromptList = await component('./home/PromptList.svelte', children);
const OwnerSetup = await component('./home/OwnerSetup.svelte', children);
const EmployeeSetup = await component('./home/EmployeeSetup.svelte', children);

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
const owner = (data, ai = 'none', asked = false, extra = {}) =>
	render(OwnerSetup, { props: { data, list: home.ownerChecklist(data, ai, asked), ai, invite: { done: false, skipped: false }, knowledge: { done: false, skipped: false }, onskip: () => {}, ...extra } }).body;
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('a new company: step 1 is next and opens the add-program flow', () => {
	const html = owner(company());
	assert.match(text(html), /เสร็จ 0 จาก 4 · เหลือประมาณ 10 นาที/);
	assert.match(html, /<li class="home-step current[^"]*" aria-current="step"[\s\S]*?เชื่อมโปรแกรมแรก/);
	assert.match(html, /class="k-button primary lg" href="\/app\?view=add-program"/);
	// Later steps are shown, but their actions cannot be used yet.
	assert.match(html, /<button type="button" class="k-button home-off[^"]*" disabled[^>]*>เชื่อม AI ของฉัน<\/button>/);
	// The one name for connect-ai (critique 16), never the old ones.
	assert.doesNotMatch(html, /เชื่อม Claude หรือ ChatGPT ของคุณ|เชื่อม AI กับ ORCA/);
	assert.match(text(html), /ไม่บังคับ/);
	// "ส่งลิงก์เชิญ" opens ทีม's invite dialog, where "ทุกคน" is pre-ticked.
	assert.match(html, /href="\/app\?view=members&amp;tab=invitations&amp;invite=1"[^>]*>ส่งลิงก์เชิญ/);
	assert.match(html, /href="\/app\?view=knowledge&amp;kind=knowledge&amp;create=1"/);
	assert.match(html, /aria-label="ข้าม ชวนทีม"/);
});

test('step 2 shows who, what and the approval rule before the one click for everyone', () => {
	const html = owner(company({ connections: [flow] }));
	const plain = text(html);
	assert.match(plain, /เสร็จ 1 จาก 4 · เหลือประมาณ 6 นาที/);
	assert.match(plain, /FlowAccount เชื่อมแล้ว · AI ทำได้ 3 อย่าง/);
	assert.match(plain, /ทุกคนในบริษัท · ตอนนี้ 1 คน/);
	assert.match(plain, /3 อย่างใน FlowAccount/);
	assert.match(plain, /ดูข้อมูล 2 อย่าง · สร้างหรือแก้ 1 อย่าง/);
	assert.match(plain, /ต้องให้ผู้ดูแลอนุมัติก่อน/);
	assert.match(html, /class="k-button primary lg" href="\/app\?view=new&amp;everyone=1&amp;connection=conn-flow"/);
	assert.match(html, /href="\/app\?view=new&amp;connection=conn-flow"/);
	// Exactly one primary action on the screen.
	assert.equal(html.match(/k-button primary/g).length, 1);

	// A read-only program says AI cannot change data.
	const readOnly = { ...flow, tools: flow.tools.slice(0, 2), toolNames: ['list_invoices', 'get_invoice'] };
	assert.match(text(owner(company({ connections: [readOnly] }))), /AI แก้ข้อมูลไม่ได้/);
	// A ready workspace I'm not in: add myself instead of making another.
	const theirs = { ...workspace, memberIDs: ['other'], effectiveMemberIDs: ['other'] };
	assert.match(owner(company({ connections: [flow], hubs: [theirs] })), /href="\/app\?view=hub&amp;hub=hub-1&amp;tab=people"/);
});

test('steps 3 and 4: connect my AI, then a copyable first question per program', () => {
	const data = company({ connections: [flow], hubs: [workspace] });
	let html = owner(data, 'none', false);
	assert.match(html, /<li class="home-step current[^"]*"[\s\S]*?เชื่อม AI ของฉัน/);
	assert.match(html, /class="k-button primary lg" href="\/app\?view=connect-ai"/);
	html = owner(data, 'connected', false, { aiApp: 'Claude' });
	assert.match(text(html), /Claude เชื่อมแล้ว/);
	assert.match(text(html), /“?สรุปใบแจ้งหนี้ที่ค้างชำระจาก FlowAccount/);
	assert.match(html, /คัดลอกคำถามนี้/);
	// Without B1 the two steps open together, and step 3 says how it finishes.
	html = owner(data, 'unknown', false);
	assert.match(text(html), /ขั้นนี้จะขึ้นว่าเสร็จเมื่อคุณถามครั้งแรก/);
	// One copy button per program, each named by its program for screen readers.
	assert.match(html, /<button type="button" class="k-button small" aria-label="คัดลอกคำถามนี้: FlowAccount">[\s\S]*?คัดลอกคำถามนี้/);
	// History that could not be read offers a retry, not a false "done".
	html = owner(data, 'connected', undefined, { historyFailed: true });
	assert.match(text(html), /ตรวจไม่ได้ว่าคุณถามแล้วหรือยัง/);
});

test('employee: connect my AI, a sign-in row per program, then ask; or ask an admin for access', () => {
	const list = home.employeeChecklist('none', ['signed-in', 'needed'], false);
	let html = render(EmployeeSetup, { props: {
		list, ai: 'none', programs: [flow],
		accounts: [{ id: 'default-orca-flowaccount', name: 'FlowAccount', icon: 'FlowAccount', state: 'signed-in' }, { id: 'drive', name: 'Google Drive', icon: 'Google Drive', state: 'needed' }]
	} }).body;
	const plain = text(html);
	assert.match(plain, /เสร็จ 0 จาก 3/);
	assert.match(plain, /ลงชื่อเข้าใช้บัญชีโปรแกรมของคุณ/);
	assert.match(plain, /FlowAccount ลงชื่อเข้าใช้แล้ว/);
	assert.match(plain, /Google Drive ยังไม่ได้ลงชื่อเข้าใช้/);
	assert.match(html, /href="\/app\?view=connect-ai#accounts"/);
	assert.match(plain, /ไม่มีบัญชีของตัวเอง\? ขอให้ผู้ดูแลเพิ่มผู้ใช้ให้คุณในโปรแกรมนั้น/);

	html = render(EmployeeSetup, { props: { list, ai: 'none', programs: [], accounts: [], noWorkspace: true, requestText: 'รบกวนเพิ่มฉัน https://a.test/app?openExternalBrowser=1' } }).body;
	assert.match(text(html), /ขอสิทธิ์จากผู้ดูแล/);
	assert.match(html, /คัดลอกข้อความขอสิทธิ์/);
	assert.match(html, /openExternalBrowser=1/);
	assert.doesNotMatch(html, /aria-current="step"/, 'nothing is "next" until an admin adds them');
});

test('Home picks its mode from the viewer\'s own data: setup at once, else a short check, never a false "ready"', async () => {
	const personal = await importTypeScript(new URL('../../orca/personal-connections.ts', import.meta.url));
	const PageHeader = await component('./ui/PageHeader.svelte', children);
	const Dashboard = await component('./WorkspaceDashboard.svelte', {
		...children, ...personal, OwnerSetup, EmployeeSetup, PageHeader, currentCompany: () => 'default'
	});
	const page = (data) => render(Dashboard, { props: { data } }).body;

	// A new company: the checklist shows before anything else loads.
	let html = page(company());
	assert.match(html, /<h1[^>]*>ยินดีต้อนรับ วิภา<\/h1>/);
	assert.match(text(html), /ยังตั้งค่าไม่เสร็จ/);
	assert.match(text(html), /ตั้งค่า ORCA ให้ บริษัท ตัวอย่าง · 4 ขั้นตอน ประมาณ 10 นาที/);
	assert.match(html, /id="setup"/);
	assert.match(html, /href="\/home\?to=start"/);
	assert.doesNotMatch(html, /พร้อมใช้งาน/);

	// Steps 1 and 2 done; whether I connected AI and asked is still loading:
	// no checklist flash and no pill until it is known.
	html = page(company({ connections: [flow], hubs: [workspace] }));
	assert.match(html, /<h1[^>]*>หน้าหลัก<\/h1>/);
	assert.match(text(html), /กำลังตรวจสถานะการตั้งค่า/);
	assert.doesNotMatch(html, /id="setup"|ยังตั้งค่าไม่เสร็จ|พร้อมใช้งาน/);
	// Create buttons belong to the status view only.
	assert.doesNotMatch(html, /view=new"/);

	// An employee with no usable workspace asks an admin, in generic words.
	const employee = company({ canManage: false, members: [{ id: 'me', displayName: 'มาลี สมมุติ', email: 'mali@example.com', role: 'member' }] });
	html = page(employee);
	assert.match(text(html), /ยินดีต้อนรับ มาลี/);
	assert.match(text(html), /ใช้ AI กับข้อมูลของ บริษัท ตัวอย่าง · 3 ขั้นตอน ประมาณ 7 นาที/);
	assert.match(text(html), /ขอสิทธิ์จากผู้ดูแล/);
	assert.match(text(html), /รบกวนเพิ่ม มาลี สมมุติ \(mali@example\.com\) เข้าพื้นที่ทำงาน AI ของ บริษัท ตัวอย่าง/);
	assert.match(html, /href="\/app\?view=help"/, 'an employee is pointed at the FAQ, not at the ORCA team');
	assert.doesNotMatch(html, /\/home\?to=start/);
});

test('a lapsed AI sign-in after setup: one line and a way back on the status view, not the checklist', async () => {
	const Banner = await component('./home/AIReconnectBanner.svelte', base);
	const html = render(Banner).body;
	assert.match(text(html), /การเชื่อม AI ของคุณหมดอายุแล้ว เชื่อมใหม่/);
	assert.match(html, /<a class="k-button small[^"]*" href="\/app\?view=connect-ai">เชื่อมใหม่<\/a>/);
	const english = render(await component('./home/AIReconnectBanner.svelte', { ...base, t: (_th, en) => en })).body;
	assert.match(text(english), /Your AI connection has expired Reconnect/);
	// Home: the rule decides the mode and the pill, and the banner sits on the status view only.
	const page = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.match(page, /const lapsed = \$derived\(aiLapsed\(list, ai\)\);/);
	assert.match(page, /homeMode\(list, noWorkspace, loaded, lapsed\)/);
	assert.match(page, /homeBadge\(mode, manager, attention, t, lapsed\)/);
	const status = page.slice(page.indexOf("{:else if mode === 'loading'}"));
	assert.match(status, /\{:else\}\s*\{#if lapsed\}<AIReconnectBanner \/>\{\/if\}/);
	assert.equal(page.match(/<AIReconnectBanner/g)?.length, 1);
	const banner = await readFile(new URL('./home/AIReconnectBanner.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(banner, /#[0-9a-f]{3,6}\b|rgba?\(/i, 'tokens only');
});

test('the status view follows the role: managers see the company and its alerts, employees their own part', async () => {
	const programTools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
	const programCatalog = await importTypeScript(new URL('../../orca/program-catalog.ts', import.meta.url));
	const HomeStatus = await component('./home/HomeStatus.svelte', {
		...children, eventToolLabel: programTools.eventToolLabel, programEventOutcome: programCatalog.programEventOutcome, programStatus: programCatalog.programStatus,
		programStatusCopy: programCatalog.programStatusCopy, displayDate: (value) => value, memberName: (member) => member.displayName
	});
	const unreviewed = { ...flow, id: 'conn-new', name: 'PEAK', mcpID: 'default-orca-peak', reviewedTools: false };
	const titled = { ...flow, tools: flow.tools.map((item) => ({ ...item, description: 'ค้นใบกำกับตามลูกค้า', definition: { ...item.definition, annotations: { ...item.definition.annotations, title: item.name === 'create_quotation' ? 'สร้างใบเสนอราคา' : 'ดูใบกำกับภาษี' } } })) };
	const events = [
		{ id: 'e1', createdAt: '2026-09-28T03:00:00Z', userID: 'me', hubID: 'hub-1', connectionID: 'conn-flow', action: 'tools.call', toolName: 'list_invoices', outcome: 'success' },
		{ id: 'e2', createdAt: '2026-09-28T02:00:00Z', userID: 'me', hubID: 'hub-1', connectionID: 'conn-flow', action: 'tools.call', toolName: 'create_quotation', outcome: 'admitted' }
	];
	const members = [
		{ id: 'me', displayName: 'วิภา ตัวอย่าง', email: 'me@example.com', role: 'owner' },
		{ id: 'u2', displayName: 'มาลี สมมุติ', email: 'm@example.com', role: 'member' },
		{ id: 'u3', displayName: 'ศิริ ทดลอง', email: 's@example.com', role: 'member', status: 'suspended' }
	];
	let html = render(HomeStatus, { props: { data: company({ members, connections: [flow, unreviewed], hubs: [workspace] }), events } }).body;
	let plain = text(html);
	assert.match(plain, /ทีม 2 คนที่ใช้งานอยู่/, 'a suspended member is not counted');
	assert.match(plain, /ต้องดูแล/);
	assert.match(plain, /โปรแกรมรอเลือกสิ่งที่ AI ทำได้ 1 โปรแกรม/);
	assert.match(html, /<th scope="col"[^>]*>คน<\/th>/);
	assert.match(html, /href="\/app\?view=servers&amp;connection=conn-flow"/);
	// The same program status words as โปรแกรมที่เชื่อม.
	assert.match(plain, /PEAK.*รอเลือกสิ่งที่ AI ทำได้/);
	// An admitted call is received, never "waiting for approval" (the same words as ตรวจสอบ).
	assert.match(plain, /รับคำขอแล้ว/);
	assert.doesNotMatch(plain, /รออนุมัติ/);
	// The program's own title, not the English id.
	html = render(HomeStatus, { props: { data: company({ members, connections: [titled], hubs: [workspace] }), events } }).body;
	assert.match(text(html), /ดูใบกำกับภาษี.*สร้างใบเสนอราคา/);
	assert.doesNotMatch(text(html), /List invoices|Create quotation/);
	// A tool changed at the provider after the last save: ต้องตรวจใหม่ here too; before it, history.
	const changed = new Map([['conn-flow', { connectionID: 'conn-flow', changed: 2, lastFailureAt: '2026-09-05T00:00:00Z' }]]);
	html = render(HomeStatus, { props: { data: company({ members, connections: [flow], hubs: [workspace] }), events, health: changed } }).body;
	assert.match(text(html), /โปรแกรมที่ต้องตรวจใหม่ 1 โปรแกรม/);
	assert.match(text(html), /FlowAccount.*ต้องตรวจใหม่/);
	const cleared = new Map([['conn-flow', { connectionID: 'conn-flow', changed: 2, lastFailureAt: '2026-09-01T00:00:00Z' }]]);
	html = render(HomeStatus, { props: { data: company({ members, connections: [flow], hubs: [workspace] }), events, health: cleared } }).body;
	assert.doesNotMatch(text(html), /ต้องตรวจใหม่/);
	assert.match(text(html), /พร้อมใช้ 1 โปรแกรม/);
	html = render(HomeStatus, { props: { data: company({ members, connections: [flow, unreviewed], hubs: [workspace] }), events } }).body;

	assert.doesNotMatch(html, /view=secrets/, 'no unused-apps alert until ตรวจสอบ reports one');
	// AI apps unused for 30 days: the alert opens ตรวจสอบ on its own filter.
	html = render(HomeStatus, { props: { data: company({ members, connections: [flow], hubs: [workspace] }), events, staleApps: 3 } }).body;
	assert.match(html, /class="home-alert quiet[^"]*" href="\/app\?view=secrets&amp;filter=stale"[\s\S]*?มี 3 แอป AI ที่ไม่ได้ใช้เกิน 30 วัน/);
	assert.doesNotMatch(text(html), /ไม่มีเรื่องที่ต้องดูแล/);

	html = render(HomeStatus, { props: { data: company({ canManage: false, connections: [flow], hubs: [workspace] }), events } }).body;
	plain = text(html);
	assert.match(plain, /พื้นที่ทำงานของคุณ/);
	assert.doesNotMatch(plain, /ต้องดูแล|คนที่ใช้งานอยู่/, 'no company alerts or head count for an employee');
	assert.doesNotMatch(html, /<th scope="col"[^>]*>คน<\/th>/, 'their own history needs no person column');
	assert.doesNotMatch(html, /view=servers/, 'employees reach programs through เชื่อม AI ของฉัน');
	assert.match(html, /href="\/app\?view=connect-ai#accounts"/);
});

test('Help is a short FAQ that points at Home\'s checklist, without a sign-out button', async () => {
	const Help = await component('./views/HelpView.svelte', { ...base, PageHeader: await component('./ui/PageHeader.svelte', children) });
	let html = render(Help, { props: { data: { canManage: true, canChangeMemberStatus: true } } }).body;
	assert.match(html, /<h1[^>]*>ช่วยเหลือ<\/h1>/);
	assert.match(html, /class="k-button primary" href="\/app#setup"/);
	assert.equal((html.match(/<details\b/g) ?? []).length, 7);
	assert.match(html, /href="\/app\?view=members"/);
	assert.match(html, /href="\/app\?view=secrets"/);
	assert.doesNotMatch(html, /sign_out|ออกจากระบบ/);
	// Without the right to suspend, the answer names only what they can do.
	html = render(Help, { props: { data: { canManage: true, canChangeMemberStatus: false } } }).body;
	assert.doesNotMatch(html, /href="\/app\?view=members"/);
	// Employees get their own answers and no manager pages.
	html = render(Help, { props: { data: { canManage: false } } }).body;
	assert.equal((html.match(/<details\b/g) ?? []).length, 6);
	assert.doesNotMatch(html, /view=approvals|view=secrets|\/home\?to=start/);
	assert.match(text(html), /3 ขั้นตอน ประมาณ 7 นาที/);

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
