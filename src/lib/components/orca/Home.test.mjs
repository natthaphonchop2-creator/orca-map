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

const th = (thai) => thai;
const base = { ...home, ...activation, ...gateway, ...inApp, ...copy, term: glossary.term, t: th, localeHref: (path) => path, orcaLocale: { value: 'th' } };
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
	assert.match(html, /href="\/app\?view=members&amp;tab=invitations"/);
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
	assert.match(html, /<button type="button" class="k-button small">[\s\S]*?คัดลอกคำถามนี้/);
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

test('Home decides from the viewer\'s own data and never claims "ระบบพร้อมใช้งาน" by default', async () => {
	const source = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /ระบบพร้อมใช้งาน/);
	assert.match(source, /askedAI\(events, data\.currentUserID\)/, 'only my own tool calls finish step 4');
	assert.match(source, /OrcaU6Service\.myAIApps\(\)/, 'B1 decides step 3');
	assert.match(source, /setAIConnection\(/, 'and feeds the pinned button');
	assert.match(source, /homeFlagKey\(flag, currentCompany\(\), data\.currentUserID\)/, 'the dismissal is per viewer and company');
	assert.match(source, /\{#if mode === 'status' && manager\}/, 'managers only get the create buttons');
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
	assert.match(html, /เปิดใน Chrome หรือ Safari/);
	assert.match(html, /<a class="o-button" href="https:\/\/orca\.example\.test\/login\?rd=%2Fapp&amp;openExternalBrowser=1">/);
	assert.match(html, /class="o-button outline"[^>]*>[\s\S]*?คัดลอกลิงก์/);
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 [FB_IAB/FB4A;FBAV/470.0.0.0;]', href } }).body;
	assert.match(text(html), /Facebook เปิดหน้านี้ในเบราว์เซอร์ของแอป/);
	assert.match(text(html), /แตะ ⋯ มุมขวาบน/);
	assert.doesNotMatch(html, /openExternalBrowser/);
	html = render(Notice, { props: { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/126.0 Safari/537.36', href } }).body;
	assert.equal(text(html).trim(), '');
});
