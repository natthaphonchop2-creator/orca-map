import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from 'svelte/internal/client';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// U5: the AI workspace screens (the one click, the short form, the tabs edited
// in place), rendered on the server with their real helpers.
const edit = await importTypeScript(new URL('../../orca/workspace-edit.ts', import.meta.url));
const sources = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const activation = await importTypeScript(new URL('../../orca/activation.ts', import.meta.url));
const presentation = await importTypeScript(new URL('../../orca/tool-presentation.ts', import.meta.url));
const invitations = await importTypeScript(new URL('../../orca/invitations.ts', import.meta.url));
const copy = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));
const picker = await importTypeScript(new URL('./ui/person-picker.ts', import.meta.url));
const formErrors = await importTypeScript(new URL('./ui/form-errors.ts', import.meta.url));
const programTools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
const personal = await importTypeScript(new URL('../../orca/personal-connections.ts', import.meta.url));
const connectionPresentation = await importTypeScript(new URL('../../orca/connection-presentation.ts', import.meta.url));
const homeSetup = await importTypeScript(new URL('../../orca/home-setup.ts', import.meta.url));

const th = (value) => value;
const base = {
	...edit, ...sources, ...activation, ...presentation, ...invitations, ...copy, ...picker, ...formErrors,
	toolCopy: programTools.toolCopy, toolUnspecified: programTools.toolUnspecified,
	personalAccountReader: personal.personalAccountReader, personalSetup: personal.personalSetup, personalSources: personal.personalSources,
	sourceAccountState: connectionPresentation.sourceAccountState, accountStateFrom: homeSetup.accountStateFrom,
	t: th, localeHref: (path) => path, orcaLocale: { value: 'th' }, onMount: () => {}, onDestroy: () => {}, untrack: (fn) => fn(),
	companyPinned: () => false, currentCompany: () => 'default',
	memberName: (member) => member.displayName || member.email || member.id,
	memberRole: (role) => ({ owner: 'เจ้าของบริษัท', admin: 'ผู้ดูแล', employee: 'พนักงาน' })[role] ?? 'พนักงาน'
};
const file = (name) => new URL(name, import.meta.url);
/** Server HTML without hydration comments and scoped class names, so tests read like the page. */
const clean = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/ class="svelte-[a-z0-9]+"/g, '').replace(/ svelte-[a-z0-9]+/g, '');
const htmlOf = (Component, options) => ({ body: clean(render(Component, options).body) });
async function component(name, deps = {}) {
	const { warnings, Component } = await serverComponent(file(name), { ...base, ...deps });
	assert.deepEqual(warnings, [], `${name} compiles without warnings`);
	return Component;
}
const StatusPill = await component('./ui/StatusPill.svelte');
const PageHeader = await component('./ui/PageHeader.svelte', { StatusPill });
const ProgramToggleCard = await component('./workspace/ProgramToggleCard.svelte');
const WriteModeChoice = await component('./workspace/WriteModeChoice.svelte', { StatusPill });
const FormSection = await component('./workspace/FormSection.svelte');

const read = (name) => ({ name, description: `Read ${name}`, inputSchema: {}, definition: { annotations: { readOnlyHint: true } } });
const write = (name) => ({ name, description: `Change ${name}`, inputSchema: {}, definition: { annotations: { readOnlyHint: false } } });
const flow = { id: 'conn-flow', name: 'FlowAccount', description: '', mcpID: 'flow', enabled: true, reviewedTools: true, reviewedReadOnly: false, tools: [read('list_invoices'), read('get_invoice'), write('create_quotation')], toolNames: ['list_invoices', 'get_invoice', 'create_quotation'], scopeNote: '', version: 1, createdAt: '', updatedAt: '' };
const drive = { ...flow, id: 'conn-drive', name: 'Google Drive', reviewedReadOnly: true, tools: [read('search_files'), read('read_file')], toolNames: ['search_files', 'read_file'] };
const notion = { ...flow, id: 'conn-notion', name: 'Notion', reviewedTools: false, toolNames: [] };
const members = [
	{ id: 'u-owner', displayName: 'วิภา ตัวอย่าง', email: 'owner@example.test', role: 'owner', status: 'active' },
	{ id: 'u-admin', displayName: 'ธนา ทดสอบ', email: 'admin@example.test', role: 'admin', status: 'active' },
	{ id: 'u-emp', displayName: 'มาลี สมมุติ', email: 'mali@example.test', role: 'employee', status: 'active' },
	{ id: 'u-gone', displayName: 'อดีต', email: 'gone@example.test', role: 'employee', status: 'suspended' }
];
const hub = {
	id: 'hub-one', name: 'ฝ่ายขาย', description: 'ค้นเอกสารขาย', instructions: '', writeMode: 'approval', userSourceID: '',
	connectionID: 'conn-flow', toolNames: ['list_invoices'], sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }],
	memberIDs: ['u-owner', 'u-emp'], unitIDs: [], accessUnitIDs: [], effectiveMemberIDs: ['u-owner', 'u-emp', 'u-hidden'],
	dailyLimit: 100, usedToday: 12, status: 'active', version: 4, createdAt: '', updatedAt: '', connectURL: 'https://orca.example.test/mcp/hub-one'
};
const company = (overrides = {}) => ({
	organization: { displayName: 'บริษัท ตัวอย่าง จำกัด' }, currentUserID: 'u-owner', canManage: true,
	members, units: [{ id: 'dept-acc', name: 'ฝ่ายบัญชี', kind: 'department', parentID: '', version: 1 }], connections: [flow, drive, notion], hubs: [hub], ...overrides
});
const employee = company({ currentUserID: 'u-emp', canManage: false, members: [members[2]] });

async function detail(search) {
	const pageState = { url: new URL(`https://orca.example.test/app?view=hub&hub=hub-one${search}`) };
	return component('./WorkspaceDetail.svelte', { page: pageState, PageHeader });
}
const tabLabels = (html) => [...html.matchAll(/<a href="[^"]*"[^>]*>(ภาพรวม|โปรแกรม|คน|ตั้งค่า)/g)].map((match) => match[1]);

test('Owners and Admins get ภาพรวม · โปรแกรม · คน · ตั้งค่า; everyone else reads, and an archived workspace has no ตั้งค่า', async () => {
	let html = htmlOf(await detail(''), { props: { data: company(), hub, onchanged: async () => {} } }).body;
	assert.deepEqual(tabLabels(html), ['ภาพรวม', 'โปรแกรม', 'คน', 'ตั้งค่า']);
	assert.match(html, /aria-current="page"[^>]*>ภาพรวม/);
	assert.match(html, /เปิดใช้งาน/, 'the status pill');
	assert.doesNotMatch(html, /แก้ไขพื้นที่ทำงาน/, 'the old full edit form is gone');
	html = htmlOf(await detail('&tab=settings'), { props: { data: employee, hub, onchanged: async () => {} } }).body;
	assert.deepEqual(tabLabels(html), ['ภาพรวม', 'โปรแกรม', 'คน']);
	assert.match(html, /aria-current="page"[^>]*>ภาพรวม/, 'an employee asking for ตั้งค่า reads ภาพรวม');
	html = htmlOf(await detail(''), { props: { data: company(), hub: { ...hub, status: 'archived' }, onchanged: async () => {} } }).body;
	assert.deepEqual(tabLabels(html), ['ภาพรวม', 'โปรแกรม', 'คน']);
	assert.match(html, /จัดเก็บแล้ว AI ใช้ไม่ได้/);
});

test('old tab names open their new tabs, and a draft offers เปิดใช้งาน only to managers', async () => {
	let html = htmlOf(await detail('&tab=tools'), { props: { data: company(), hub, onchanged: async () => {} } }).body;
	assert.match(html, /aria-current="page"[^>]*>โปรแกรม/);
	html = htmlOf(await detail('&tab=access'), { props: { data: company(), hub, onchanged: async () => {} } }).body;
	assert.match(html, /aria-current="page"[^>]*>คน/);
	const draft = { ...hub, status: 'draft' };
	html = htmlOf(await detail(''), { props: { data: company(), hub: draft, onchanged: async () => {} } }).body;
	assert.match(html, /<button[^>]*class="k-button primary"[^>]*>.*เปิดใช้งาน<\/button>/s);
	html = htmlOf(await detail(''), { props: { data: employee, hub: draft, onchanged: async () => {} } }).body;
	assert.doesNotMatch(html, /<button[^>]*>.*เปิดใช้งาน/s);
});

test('a program card is a labelled switch with what AI can do, and [ปรับ] only while on and editable', () => {
	let html = htmlOf(ProgramToggleCard, { props: { connection: flow, on: true, toolNames: ['list_invoices'], ontoggle: () => {}, onadjust: () => {} } }).body;
	assert.match(html, /role="switch" aria-checked="true" aria-label="ใช้ FlowAccount ในพื้นที่นี้"/);
	assert.match(html, /อ่านอย่างเดียว · 1 จาก 3 อย่าง/);
	assert.match(html, /aria-label="ปรับสิ่งที่ AI ทำได้ใน FlowAccount"/);
	html = htmlOf(ProgramToggleCard, { props: { connection: flow, on: false, ontoggle: () => {}, onadjust: () => {} } }).body;
	assert.match(html, /aria-checked="false"/);
	assert.match(html, /อ่านและแก้ไข · 3 อย่าง/, 'off, it shows what turning it on gives');
	assert.doesNotMatch(html, /ปรับสิ่งที่ AI/);
	html = htmlOf(ProgramToggleCard, { props: { connection: drive, on: true, toolNames: ['search_files', 'read_file'] } }).body;
	// A reader (an employee) gets a plain read-only card: no switch, no faded disabled button, no "chosen" border.
	assert.match(html, /class="program-card readonly"/);
	assert.doesNotMatch(html, /role="switch"|disabled|program-switch|program-card on/);
	assert.match(html, /เปิดใช้ในพื้นที่นี้/);
	assert.match(html, /อ่านอย่างเดียว · 2 อย่าง/);
});

test('the write-mode choice defaults to approval and is greyed with a note while nothing can change data', () => {
	let html = htmlOf(WriteModeChoice, { props: { value: 'approval' } }).body;
	assert.match(html, /value="approval" checked/);
	assert.match(html, /ให้ผู้ดูแลอนุมัติก่อน[\s\S]*แนะนำ/);
	assert.doesNotMatch(html, /write-note/);
	html = htmlOf(WriteModeChoice, { props: { value: 'approval', quiet: true, noteTitle: 'ไม่มีผล เพราะเลือกอ่านอย่างเดียว', note: 'จะใช้เมื่อเปิดโปรแกรมที่ AI แก้ข้อมูลได้' } }).body;
	assert.match(html, /<b>ไม่มีผล เพราะเลือกอ่านอย่างเดียว<\/b> · จะใช้เมื่อเปิดโปรแกรมที่ AI แก้ข้อมูลได้/);
	assert.match(html, /write-options[^"]*quiet/);
});

test('the one click shows who and whether changes wait for approval before anything is sent', async () => {
	const EmptyState = await component('./ui/EmptyState.svelte');
	const OneClick = await component('./workspace/EveryoneOneClick.svelte', { PageHeader, StatusPill, EmptyState });
	let html = htmlOf(OneClick, { props: { data: company(), connectionID: 'conn-flow', onsaved: async () => {} } }).body;
	assert.match(html, /ให้ทุกคนในบริษัทใช้/);
	assert.match(html, /ทุกคน 3 คน · ต้องอนุมัติก่อน/, 'the suspended person is left out');
	assert.match(html, /สร้างพื้นที่ทำงาน “บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท”/);
	assert.match(html, /href="\/app\?view=new&amp;connection=conn-flow"[^>]*>ตั้งค่าเอง/);
	html = htmlOf(OneClick, { props: { data: company(), connectionID: 'conn-drive', onsaved: async () => {} } }).body;
	assert.match(html, /ทุกคน 3 คน · อ่านอย่างเดียว/);
	html = htmlOf(OneClick, { props: { data: company({ hubs: [{ ...hub, name: 'บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท' }] }), connectionID: 'conn-drive', onsaved: async () => {} } }).body;
	assert.match(html, /เพิ่ม Google Drive ในพื้นที่/, 'a company-wide workspace made before is reused');
	html = htmlOf(OneClick, { props: { data: company(), connectionID: 'conn-notion', onsaved: async () => {} } }).body;
	assert.doesNotMatch(html, /everyone-go/, 'a program that is not finished offers no one click');
	assert.match(html, /ตั้งค่าโปรแกรมต่อ/);
});

test('the short form turns on ?connection=, starts with "คุณ" chosen and approval first, and shows no error before a try', async () => {
	const AudiencePicker = await component('./workspace/AudiencePicker.svelte', { PersonPicker: await component('./ui/PersonPicker.svelte') });
	const Form = await component('./workspace/WorkspaceCreateForm.svelte', { PageHeader, FormSection, ProgramToggleCard, WriteModeChoice, AudiencePicker, FormErrorSummary: await component('./ui/FormErrorSummary.svelte'), OrcaLibraryService: {}, OrcaService: {} });
	let html = htmlOf(Form, { props: { data: company(), initialConnectionID: 'conn-drive', onsaved: async () => {} } }).body;
	assert.match(html, /aria-label="ใช้ Google Drive ในพื้นที่นี้"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="ใช้ Google Drive ในพื้นที่นี้"/);
	assert.match(html, /aria-checked="false" aria-label="ใช้ FlowAccount ในพื้นที่นี้"/);
	assert.doesNotMatch(html, /ใช้ Notion ในพื้นที่นี้/, 'programs not ready are not offered');
	assert.match(html, /คุณ \(วิภา ตัวอย่าง\)/);
	assert.match(html, /คุณอยู่ในพื้นที่นี้แล้ว เอาออกได้ถ้าไม่ต้องใช้เอง/);
	assert.match(html, /แต่ละคนต้องมีบัญชี Google Drive ของตัวเอง/);
	assert.match(html, /ไม่มีผล เพราะเลือกอ่านอย่างเดียว/);
	assert.match(html, /value="approval" checked/);
	assert.match(html, /บันทึกเป็นฉบับร่าง/);
	assert.match(html, /href="\/app\?view=add-program&amp;return=new"/);
	assert.match(html, /aria-pressed="false"[^>]*>ฝ่ายบัญชี/, 'department chips');
	assert.doesNotMatch(html, /orca-form-errors/);
	html = htmlOf(Form, { props: { data: company(), initialConnectionID: 'conn-flow', onsaved: async () => {} } }).body;
	assert.doesNotMatch(html, /write-note/, 'a program that can change data makes the choice count');
	assert.doesNotMatch(html, /ws-notice/, 'a ready program is simply turned on');
	// Back from เพิ่มโปรแกรม with a program that is not ready: say so, never a silent miss.
	html = htmlOf(Form, { props: { data: company(), initialConnectionID: 'conn-notion', onsaved: async () => {} } }).body;
	assert.match(html, /class="ws-notice" role="status"[\s\S]*Notion ยังเลือกสิ่งที่ AI ทำได้ไม่เสร็จ จึงยังเปิดในพื้นที่นี้ไม่ได้/);
	assert.match(html, /href="\/app\?view=servers&amp;connection=conn-notion&amp;tab=tools"[^>]*>ตั้งค่าโปรแกรมต่อ/);
	assert.doesNotMatch(html, /ใช้ Notion ในพื้นที่นี้/);
	html = htmlOf(Form, { props: { data: company(), initialConnectionID: 'conn-gone', onsaved: async () => {} } }).body;
	assert.match(html, /ไม่พบโปรแกรมที่ขอให้เปิด/);
});

test('from เพิ่มโปรแกรม step 4: the โปรแกรม tab turns the new program on for บันทึก, or says why it cannot', async () => {
	const SaveBar = await component('./workspace/SaveBar.svelte');
	const Programs = await component('./workspace/WorkspaceProgramsTab.svelte', { ProgramToggleCard, SaveBar });
	let html = htmlOf(Programs, { props: { data: company(), hub, canEdit: true, onchanged: async () => {}, addConnectionID: 'conn-drive' } }).body;
	assert.match(html, /aria-checked="true" aria-label="ใช้ Google Drive ในพื้นที่นี้"|aria-label="ใช้ Google Drive ในพื้นที่นี้"[^>]*aria-checked="true"/);
	assert.match(html, /เปิด Google Drive ไว้ให้แล้ว กด บันทึก เพื่อเพิ่มลงพื้นที่นี้/);
	// Already on: nothing to add, nothing pending.
	html = htmlOf(Programs, { props: { data: company(), hub, canEdit: true, onchanged: async () => {}, addConnectionID: 'conn-flow' } }).body;
	assert.doesNotMatch(html, /pg-notice/);
	html = htmlOf(Programs, { props: { data: company(), hub, canEdit: true, onchanged: async () => {}, addConnectionID: 'conn-notion' } }).body;
	assert.match(html, /Notion ยังเลือกสิ่งที่ AI ทำได้ไม่เสร็จ[\s\S]*tab=tools/);
	// Readers never get a pending change.
	html = htmlOf(Programs, { props: { data: employee, hub, canEdit: false, onchanged: async () => {}, addConnectionID: 'conn-drive' } }).body;
	assert.doesNotMatch(html, /pg-notice|Google Drive/);
	// A workspace that runs changes at once and only reads so far: turning on a program that can
	// change data says, before บันทึก, that approval comes on (the owner's safety default).
	const direct = { ...hub, writeMode: 'direct', sources: [{ connectionID: 'conn-drive', toolNames: ['search_files'] }], connectionID: 'conn-drive', toolNames: ['search_files'] };
	html = htmlOf(Programs, { props: { data: company(), hub: direct, canEdit: true, onchanged: async () => {}, addConnectionID: 'conn-flow' } }).body;
	assert.match(html, /pg-notice approval[\s\S]*ORCA จะตั้งให้ผู้ดูแลอนุมัติก่อนทุกครั้ง/);
	assert.match(html, /จะรอผู้ดูแลอนุมัติก่อนแก้ข้อมูล/, 'the save bar says it too');
	// Already asking for approval: nothing to announce.
	html = htmlOf(Programs, { props: { data: company(), hub: { ...direct, writeMode: 'approval' }, canEdit: true, onchanged: async () => {}, addConnectionID: 'conn-flow' } }).body;
	assert.doesNotMatch(html, /pg-notice approval/);
	const source = await readFile(file('./workspace/WorkspaceProgramsTab.svelte'), 'utf8');
	assert.match(source, /programsSavePatch\(fresh, pending, data\.connections\)/, 'the save sends approval with the first change action');
});

test('after a save the toast says สร้างแล้ว or เพิ่มแล้ว once: the flag leaves the address', async () => {
	assert.equal(edit.savedHubHref('hub 1'), '/app?view=hub&hub=hub%201&created=1');
	assert.equal(edit.savedHubHref('hub-1', 'conn flow'), '/app?view=hub&hub=hub-1&added=conn%20flow');
	const active = { status: 'active', userSourceID: '' };
	assert.match(edit.savedToast(active, { created: true }, th), /^สร้างแล้ว/);
	assert.match(edit.savedToast({ ...active, status: 'draft' }, { created: true }, th), /ฉบับร่าง/);
	assert.match(edit.savedToast({ ...active, userSourceID: 'sso' }, { created: true }, th), /ส่งลิงก์ของพื้นที่นี้/);
	assert.equal(edit.savedToast(active, { created: false, added: 'Google Drive' }, th), 'เพิ่ม Google Drive ในพื้นที่นี้แล้ว');
	assert.doesNotMatch(edit.savedToast(active, { created: true, added: '' }, th), /สร้าง/, 'added wins: nothing was created');
	assert.equal(edit.savedToast(active, { created: false }, th), '');
	assert.equal(edit.withoutSavedParams(new URL('https://orca.example.test/app?view=hub&hub=h&created=1&org=o#x')), '/app?view=hub&hub=h&org=o#x');
	assert.equal(edit.withoutSavedParams(new URL('https://orca.example.test/app?view=hub&hub=h&added=c')), '/app?view=hub&hub=h');
	assert.equal(edit.withoutSavedParams(new URL('https://orca.example.test/app?view=hub&hub=h')), undefined);
	const source = await readFile(file('./WorkspaceDetail.svelte'), 'utf8');
	assert.match(source, /import \{ beforeNavigate, goto, replaceState \} from '\$app\/navigation'/);
	assert.match(source, /if \(clean\) replaceState\(clean, page\.state\)/);
	const oneClick = await readFile(file('./workspace/EveryoneOneClick.svelte'), 'utf8');
	assert.match(oneClick, /const added = plan\.existing \? plan\.connection\.id : undefined;/);
	assert.match(oneClick, /await onsaved\(hub, added\)/);
	const route = await readFile(file('../../../routes/app/+page.svelte'), 'utf8');
	assert.match(route, /goto\(localeHref\(savedHubHref\(saved\.id, added\)\)\)/);
});

test('ภาพรวม offers the invite message after creation and one banner for connecting AI', async () => {
	const Overview = await component('./workspace/WorkspaceOverviewTab.svelte', { StatusPill, MyAIAppsService: {} });
	const tabHref = (tab) => `/app?view=hub&hub=hub-one&tab=${tab}`;
	let html = htmlOf(Overview, { props: { data: company(), hub, created: true, tabHref } }).body;
	assert.match(html, /คัดลอกข้อความเชิญ/);
	// The success screen says it once: no second invite button in "สิ่งที่ทำต่อได้".
	assert.equal((html.match(/คัดลอกข้อความเชิญ/g) ?? []).length, 1);
	assert.doesNotMatch(html, /ชวนทีมเข้ามาใช้/);
	// Later (not just created), the invite row is the way to it.
	assert.match(htmlOf(Overview, { props: { data: company(), hub, tabHref } }).body, /ชวนทีมเข้ามาใช้/);
	assert.match(html, /view=connect-ai&amp;openExternalBrowser=1/, 'the LINE message opens the phone browser');
	assert.match(html, /สิ่งที่ทำต่อได้/);
	assert.match(html, /“สรุปใบแจ้งหนี้ที่ค้างชำระจาก FlowAccount”/);
	assert.doesNotMatch(html, /id="connect-ai"/, 'no per-workspace link without its own sign-in');
	html = htmlOf(Overview, { props: { data: company(), hub: { ...hub, status: 'draft' }, created: true, tabHref } }).body;
	assert.match(html, /บันทึกเป็นฉบับร่างแล้ว/);
	assert.doesNotMatch(html, /คัดลอกข้อความเชิญ/, 'nothing to invite to before it is on');
	html = htmlOf(Overview, { props: { data: employee, hub, created: true, tabHref } }).body;
	assert.doesNotMatch(html, /คัดลอกข้อความเชิญ/, 'employees are not offered the invite');
	html = htmlOf(Overview, { props: { data: company({ currentUserID: 'u-x', canManage: false }), hub, tabHref } }).body;
	assert.match(html, /ขอให้ผู้ดูแลบริษัทเพิ่มคุณ/, 'generic copy for someone who is not in it (critique 8)');
	html = htmlOf(Overview, { props: { data: company(), hub: { ...hub, userSourceID: 'sso-1' }, created: true, tabHref } }).body;
	assert.match(html, /id="connect-ai"/, 'a workspace with its own sign-in keeps its own link');
	assert.match(html, /ส่งลิงก์ของพื้นที่นี้ให้ทีม/);
	assert.doesNotMatch(html, /คัดลอกข้อความเชิญ|ชวนทีมเข้ามาใช้/, 'the company-link invite would not bring an SSO workspace');
	assert.doesNotMatch(html, /ใช้ได้กับทุกพื้นที่ที่คุณอยู่/, 'เชื่อม AI ของฉัน does not bring it either');
	assert.match(html, /เพิ่มลิงก์ของพื้นที่นี้ใน AI ของคุณ/);
	html = htmlOf(Overview, { props: { data: company({ currentUserID: 'u-admin' }), hub, tabHref } }).body;
	assert.match(html, /เพิ่มตัวเองในพื้นที่นี้/);
});

test('คน and โปรแกรม are editable only by managers; readers see who and what, without names they may not receive', async () => {
	const People = await component('./workspace/WorkspacePeopleTab.svelte', { AudiencePicker: () => { throw new Error('no editor for readers'); }, OrcaLibraryService: {} });
	let html = htmlOf(People, { props: { data: employee, hub, canEdit: false, onchanged: async () => {} } }).body;
	assert.match(html, /คนที่ใช้ได้ตอนนี้ 3 คน/);
	assert.match(html, /มาลี สมมุติ \(คุณ\)/);
	assert.match(html, /และอีก 2 คน/);
	const Programs = await component('./workspace/WorkspaceProgramsTab.svelte', { ProgramToggleCard });
	html = htmlOf(Programs, { props: { data: employee, hub, canEdit: false, onchanged: async () => {} } }).body;
	assert.doesNotMatch(html, /Google Drive/, 'a reader sees only the programs that are on');
	assert.doesNotMatch(html, /เชื่อมโปรแกรมใหม่/);
	assert.match(html, /FlowAccount <em>\(1\)<\/em>/);
	html = htmlOf(Programs, { props: { data: company(), hub, canEdit: true, onchanged: async () => {} } }).body;
	assert.match(html, /ใช้ Google Drive ในพื้นที่นี้/);
	assert.match(html, /เชื่อมโปรแกรมใหม่/);
});

test('ตั้งค่า shows the sign-in choice only when the workspace has one or the company does', async () => {
	const Settings = await component('./views/WorkspaceSettingsView.svelte', { FormSection, WriteModeChoice, OrcaUserSourcesService: {}, goto: async () => {} });
	let html = htmlOf(Settings, { props: { data: company(), hub, onchanged: async () => {} } }).body;
	assert.match(html, /ชื่อพื้นที่ทำงาน/);
	assert.match(html, /value="100"/);
	assert.doesNotMatch(html, /วิธีเข้าสู่ระบบ/);
	assert.match(html, /หยุดชั่วคราว/);
	html = htmlOf(Settings, { props: { data: company(), hub: { ...hub, userSourceID: 'sso-1', status: 'paused' }, onchanged: async () => {} } }).body;
	assert.match(html, /วิธีเข้าสู่ระบบ/);
	assert.match(html, /เปิดใช้งาน/);
});

test('every U5 screen compiles without warnings, and the retired screens are gone', async () => {
	const dir = new URL('./workspace/', import.meta.url);
	const names = (await readdir(dir)).filter((name) => name.endsWith('.svelte')).map((name) => new URL(name, dir));
	for (const url of [...names, file('./views/WorkspaceNewView.svelte'), file('./views/WorkspaceHubView.svelte'), file('./views/WorkspaceSettingsView.svelte'), file('./WorkspaceDetail.svelte')]) {
		const source = await readFile(url, 'utf8');
		assert.deepEqual(compile(source, { filename: url.pathname.split('/').pop(), generate: 'client' }).warnings.map((w) => w.message), [], url.pathname);
		assert.doesNotMatch(source, /#fff\b|#ffffff|#151823/i, `${url.pathname} uses tokens only`);
	}
	for (const retired of ['WorkspaceWizard.svelte', 'GatewayCreated.svelte', 'WorkspaceReadiness.svelte'])
		await assert.rejects(readFile(file(`./${retired}`)), undefined, retired);
	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(page, /WorkspaceWizard|GatewayCreated|WorkspaceReadiness/);
});

test('a tab with unsaved changes asks before another tab, another page or closing the page loses them (Codex release review 63)', async (context) => {
	const source = await readFile(file('./WorkspaceDetail.svelte'), 'utf8');
	const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
		.replace(/^\s*import[^;]+;/gm, '')
		.replace('$props()', '$state(testProps)');
	const require = createRequire(import.meta.url);
	const code = compileModule(
		`export function harness(testProps, deps) {
			const { beforeNavigate, goto, replaceState, page, gatewayMemberIDs, gatewaySources, localeHref, t, editorWorkspace, saveHubPatch, savedToast, withoutSavedParams, hubWriteService, workspaceWriteError, onMount, untrack, showToast } = deps;
			${script}
			return { ondirty, leave, activate, get state() { return { dirty, leaveOpen }; } };
		}`,
		{ filename: 'workspace-detail-test.svelte.js', generate: 'client' }
	).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
	const { harness } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
	let guard;
	const gotos = [];
	const writes = [];
	let view;
	const stop = effect_root(() => {
		view = harness({ data: company(), hub: { ...hub, status: 'draft' }, onchanged: async () => {} }, {
			...base,
			beforeNavigate: (fn) => (guard = fn),
			goto: async (url) => gotos.push(url),
			replaceState: () => {},
			page: { url: new URL('https://orca.example.test/app?view=hub&hub=hub-one&tab=settings'), state: {} },
			saveHubPatch: async (...args) => writes.push(args),
			hubWriteService: {},
			workspaceWriteError: (cause) => cause.message,
			showToast: () => {}
		});
	});
	context.after(stop);
	flush();
	const navigate = (type, to) => {
		let cancelled = false;
		guard({ type, to: to ? { url: new URL(to, 'https://orca.example.test') } : null, cancel: () => (cancelled = true) });
		flush();
		return cancelled;
	};
	assert.equal(navigate('link', '/app?view=hub&hub=hub-one&tab=people'), false, 'nothing typed: tabs move freely');
	view.ondirty(true);
	flush();
	assert.equal(navigate('link', '/app?view=hub&hub=hub-one&tab=people'), true, 'another tab would drop the typed text');
	assert.equal(view.state.leaveOpen, true, 'so it asks first');
	await view.leave();
	assert.deepEqual(gotos, ['/app?view=hub&hub=hub-one&tab=people'], 'leaving anyway goes where the person clicked');
	assert.equal(view.state.dirty, false);
	view.ondirty(true);
	flush();
	assert.equal(navigate('leave'), true, 'closing or reloading the page gets the browser\'s own question');
	await view.activate();
	assert.deepEqual(writes, [], 'activating would reload the workspace and drop the typed text: not while there is some');
	view.ondirty(false);
	flush();
	await view.activate();
	assert.equal(writes.length, 1);
});

test('each tab reports its unsaved changes, and pause, activate, archive and delete wait for a save or cancel', async () => {
	const detail = await readFile(file('./WorkspaceDetail.svelte'), 'utf8');
	for (const tab of ['WorkspaceProgramsTab', 'WorkspacePeopleTab', 'WorkspaceSettingsView']) assert.match(detail, new RegExp(`<${tab} [^>]*\\{ondirty\\}`), tab);
	for (const name of ['./workspace/WorkspaceProgramsTab.svelte', './workspace/WorkspacePeopleTab.svelte', './views/WorkspaceSettingsView.svelte']) {
		const source = await readFile(file(name), 'utf8');
		assert.match(source, /\$effect\(\(\) => ondirty\?\.\((dirty|changeCount > 0) \|\| busy\)\);/, name);
		assert.match(source, /onDestroy\(\(\) => ondirty\?\.\(false\)\);/, name);
	}
	const settings = await readFile(file('./views/WorkspaceSettingsView.svelte'), 'utf8');
	assert.equal(settings.match(/disabled=\{statusBusy \|\| dirty\}/g)?.length, 2, 'pause and activate');
	assert.match(settings, /<LifecycleActions [^>]*canManage=\{data\.canManage && !dirty\}/, 'archive and delete');
	assert.match(settings, /if \(statusBusy \|\| dirty\) return;/);
	// While pause or activate runs the fields wait, so nothing typed then is lost to its reload (Codex release review 65).
	assert.doesNotMatch(settings, /disabled=\{busy\}/);
	assert.equal(settings.match(/disabled=\{busy \|\| statusBusy/g)?.length, 7);
});

test('a newer version replaces the tabs only while nothing is unsaved, or after their own save (Codex release review 64)', async () => {
	const v4 = { id: 'hub-one', version: 4 };
	const v5 = { id: 'hub-one', version: 5 };
	const other = { id: 'hub-two', version: 1 };
	assert.equal(edit.editorWorkspace(v4, v5, false, false), v5, 'nothing typed: the newest');
	assert.equal(edit.editorWorkspace(v4, v5, true, false), v4, 'typed changes stay on the version they were made on');
	assert.equal(edit.editorWorkspace(v4, v5, true, true), v5, 'after the tab\'s own save: the version it wrote');
	assert.equal(edit.editorWorkspace(v4, other, true, false), other, 'another workspace is never kept');
	const detail = await readFile(file('./WorkspaceDetail.svelte'), 'utf8');
	assert.match(detail, /\{#key `\$\{editorHub\.id\}:\$\{editorHub\.version\}`\}/);
	for (const tab of ['WorkspaceProgramsTab', 'WorkspacePeopleTab', 'WorkspaceSettingsView'])
		assert.match(detail, new RegExp(`<${tab} [^>]*hub=\\{editorHub\\}[^>]*onchanged=\\{tabChanged\\}`), tab);
	assert.match(detail, /<WorkspaceOverviewTab \{data\} \{hub\}/, 'ภาพรวม always reads the newest');
	assert.match(detail, /const next = editorWorkspace\(editorHub, latest, unsaved, adopt\);/);
	assert.match(detail, /async function tabChanged\(\) \{\s*adopt = true;\s*clearAdd\(\);\s*try \{\s*await onchanged\(\);\s*await tick\(\);\s*\} finally \{[^}]*adopt = false;/);
});

test('a failed refresh adopts nothing later, an archive elsewhere keeps a dirty ตั้งค่า, and &add= is used once (Codex release review 65)', async (context) => {
	const source = await readFile(file('./WorkspaceDetail.svelte'), 'utf8');
	const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
		.replace(/^\s*import[^;]+;/gm, '')
		.replace(/let \{ data, hub, onchanged \}\s*=\s*\$props\(\);/, '__PROPS__')
		.replace(/(?<![.\w])(data|hub|onchanged)\b/g, 'props.$1')
		.replace('__PROPS__', 'const props = testProps;');
	assert.match(script, /const props = testProps;/);
	const require = createRequire(import.meta.url);
	const code = compileModule(
		`export function harness(testProps, deps) {
			const { beforeNavigate, goto, replaceState, page, gatewayMemberIDs, gatewaySources, localeHref, t, editorWorkspace, saveHubPatch, savedToast, withoutSavedParams, hubWriteService, workspaceWriteError, onMount, untrack, tick, showToast } = deps;
			${script}
			return { ondirty, tabChanged, get state() { return { dirty, editorHub, activeTab, tabsEditable, changedElsewhere, addConnectionID, adopt }; } };
		}
		export function reactive(value) {
			const proxy = $state(value);
			return proxy;
		}`,
		{ filename: 'workspace-detail-props-test.svelte.js', generate: 'client' }
	).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
	const { harness, reactive } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
	let failRefresh = false;
	const props = reactive({ data: company(), hub, onchanged: async () => { if (failRefresh) throw new Error('refresh failed'); } });
	const replaced = [];
	let view;
	const stop = effect_root(() => {
		view = harness(props, {
			...base,
			beforeNavigate: () => {},
			goto: async () => {},
			replaceState: (url) => replaced.push(url),
			page: { url: new URL('https://orca.example.test/app?view=hub&hub=hub-one&tab=settings&add=conn-drive'), state: {} },
			saveHubPatch: async () => {},
			hubWriteService: {},
			workspaceWriteError: (cause) => cause.message,
			showToast: () => {},
			tick: async () => flush()
		});
	});
	context.after(stop);
	flush();
	assert.equal(view.state.addConnectionID, 'conn-drive');
	// A tab's save whose refresh fails: nothing is adopted later.
	failRefresh = true;
	await assert.rejects(view.tabChanged());
	assert.equal(view.state.adopt, false);
	assert.equal(view.state.addConnectionID, '', '&add= was used');
	assert.deepEqual(replaced, ['/app?view=hub&hub=hub-one&tab=settings'], 'and leaves the address');
	view.ondirty(true);
	flush();
	props.hub = { ...hub, version: 5, instructions: 'someone else' };
	flush();
	assert.equal(view.state.editorHub.version, 4, 'the typed changes keep their version');
	assert.equal(view.state.changedElsewhere, true);
	// Archived elsewhere while ตั้งค่า has unsaved text: the tab stays.
	props.hub = { ...hub, version: 6, status: 'archived' };
	flush();
	assert.equal(view.state.activeTab, 'settings');
	assert.equal(view.state.tabsEditable, true);
	assert.equal(view.state.editorHub.version, 4);
	// Cancelled: the newest version, and ตั้งค่า goes with the archive.
	view.ondirty(false);
	flush();
	assert.equal(view.state.editorHub.version, 6);
	assert.equal(view.state.activeTab, 'overview');
});

test('a department deleted since it was chosen still shows, chosen, so it can be taken off (Codex release review 66)', async () => {
	const AudiencePicker = await component('./workspace/AudiencePicker.svelte', { PersonPicker: await component('./ui/PersonPicker.svelte') });
	const html = htmlOf(AudiencePicker, {
		props: { members, units: [{ id: 'dept-acc', name: 'ฝ่ายบัญชี', kind: 'department', parentID: '', version: 1 }], currentUserID: 'u-owner', memberIDs: ['u-owner'], accessUnitIDs: ['dept-gone', 'dept-acc'], id: 'people' }
	}).body;
	assert.match(html, /aria-pressed="true"[^>]*>.*ฝ่ายบัญชี/s);
	assert.match(html, /aria-pressed="true"[^>]*>.*แผนกที่ถูกลบแล้ว.*เอาออกได้/s, 'the deleted one, chosen, with a way to take it off');
	const picker = await readFile(file('./workspace/AudiencePicker.svelte'), 'utf8');
	assert.match(picker, /if \(accessUnitIDs\.includes\(unit\.id\)\) accessUnitIDs = accessUnitIDs\.filter/, 'a click takes a chosen one off, whatever its state');
});

test('a program archived since it was turned on here is offered for removal, as a deleted one is (Codex release review 66)', async () => {
	const SaveBar = await component('./workspace/SaveBar.svelte');
	const Programs = await component('./workspace/WorkspaceProgramsTab.svelte', { ProgramToggleCard, SaveBar });
	const archivedFlow = company({ connections: [{ ...flow, archivedAt: '2026-09-29T00:00:00Z' }, drive, notion] });
	let html = htmlOf(Programs, { props: { data: archivedFlow, hub, canEdit: true, onchanged: async () => {} } }).body;
	assert.doesNotMatch(html, /ใช้ FlowAccount ในพื้นที่นี้/, 'no card for it');
	assert.match(html, /class="pg-missing">มี 1 โปรแกรมที่ถูกลบหรือจัดเก็บไปแล้วแต่ยังอยู่ในพื้นที่นี้[\s\S]*>เอาออก<\/button>/);
	html = htmlOf(Programs, { props: { data: company(), hub, canEdit: true, onchanged: async () => {} } }).body;
	assert.doesNotMatch(html, /pg-missing/, 'a live program is a card, not a removal');
});

test('the create form waits while the workspace is made and its page opens, so nothing typed then is lost (Codex release review 66)', async () => {
	const source = await readFile(file('./workspace/WorkspaceCreateForm.svelte'), 'utf8');
	const markup = source.slice(source.indexOf('</script>'));
	for (const field of ['FORM_FIELDS.name}', 'FORM_FIELDS.description}', 'FORM_FIELDS.instructions}', 'FORM_FIELDS.limit}']) {
		const at = markup.indexOf(`id={${field}`);
		assert.ok(at > 0, field);
		const tag = markup.slice(at, markup.indexOf('>', markup.indexOf('oninput={edited}', at)));
		assert.match(tag, /disabled=\{!!busy\}/, field);
	}
	const submit = source.slice(source.indexOf('async function submit('), source.indexOf('</script>'));
	assert.match(submit, /await onsaved\(saved\);[\s\S]*\} finally \{\s*busy = undefined;/, 'busy until the page opened');
	assert.match(submit, /serverError = workspaceWriteError\(cause\);\s*focusKey \+= 1;\s*busy = undefined;\s*return;/, 'a refusal frees the form at once');
});
