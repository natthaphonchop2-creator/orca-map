import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// U4: เพิ่มโปรแกรม (the four steps), โปรแกรมที่เชื่อม and program detail.
const tools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
const catalogHelpers = await importTypeScript(new URL('../../orca/program-catalog.ts', import.meta.url));
const catalog = await importTypeScript(new URL('../../orca/catalog.ts', import.meta.url));
const glossary = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const navigation = await importTypeScript(new URL('../../orca/navigation.ts', import.meta.url));
const gatewaySources = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const presentation = await importTypeScript(new URL('../../orca/connection-presentation.ts', import.meta.url));
const health = await importTypeScript(new URL('../../orca/connection-health.ts', import.meta.url));
const activation = await importTypeScript(new URL('../../orca/activation.ts', import.meta.url));
const contract = await importTypeScript(new URL('./ui/page-contract.ts', import.meta.url));

const th = (thai) => thai;
const keep = await importTypeScript(new URL('../../orca/keep-together.ts', import.meta.url));
const base = { ...keep, t: th, localeHref: (href) => href, orcaLocale: { value: 'th' }, ...glossary, ...navigation, ...tools, ...catalogHelpers, ...catalog, ...gatewaySources, ...presentation, ...health, ...activation };
const text = (html) => html.replace(/<!--[^>]*-->/g, '').replace(/\s+/g, ' ');
// A child component that records its props (and renders its children, if any).
const spy = (calls, name) => (renderer, props) => {
	calls.push({ name, props });
	props?.children?.(renderer);
};

const tool = (name, title, annotations) => ({ name, description: `${title} (desc)`, inputSchema: {}, definition: { name, annotations: annotations && { title, ...annotations } } });
const flowTools = [
	tool('list_invoices', 'ดูรายการใบแจ้งหนี้', { readOnlyHint: true }),
	tool('get_invoice', 'ดูใบแจ้งหนี้ทีละใบ', { readOnlyHint: true }),
	tool('create_invoice', 'สร้างใบแจ้งหนี้', { readOnlyHint: false }),
	{ name: 'email_invoice', description: 'ส่งอีเมลใบแจ้งหนี้', inputSchema: {}, definition: { name: 'email_invoice' } }
];

test('every U4 component compiles without warnings', async () => {
	const files = [
		...(await readdir(new URL('./programs/', import.meta.url))).filter((name) => name.endsWith('.svelte')).map((name) => `programs/${name}`),
		'ConnectionCenter.svelte', 'ConnectionSettings.svelte', 'ConnectionMembers.svelte', 'views/AddProgramView.svelte'
	];
	assert.ok(files.length >= 13, files.join());
	for (const file of files) {
		const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
		assert.deepEqual(compile(source, { filename: file, generate: 'client' }).warnings.map((warning) => warning.code), [], file);
	}
});

test('step titles keep the page contract (at most 4 words, one short line)', () => {
	for (const title of ['คุณใช้โปรแกรมอะไรในบริษัท?', 'เชื่อมบัญชี', 'เลือกสิ่งที่ AI ทำได้', 'โปรแกรมที่เชื่อม', 'Choose a program', 'Connect your account', 'What AI can do']) {
		assert.ok(contract.titleWithinContract(title), title);
	}
	assert.ok(contract.subtitleWithinContract('เลือกว่า AI ของทีมทำอะไรใน LINE OA (Messaging API) ได้บ้าง เปลี่ยนภายหลังได้เสมอ'));
});

test('step 3 starts read-only: change tools are off, unannotated ones are tagged, one primary "อนุญาต N อย่างนี้"', async () => {
	const { warnings, Component } = await serverComponent(new URL('./programs/ProgramToolsEditor.svelte', import.meta.url), base);
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { tools: flowTools, programName: 'FlowAccount', mcpID: 'src', selected: ['list_invoices', 'get_invoice'], preset: 'read', name: 'FlowAccount', onsave() {} } }).body;
	const plain = text(html);
	assert.match(plain, /ดูข้อมูล <em[^>]*>\(2\)/);
	assert.match(plain, /สร้าง \/ แก้ไข \/ ลบ <em[^>]*>\(2\)/);
	assert.match(plain, /ปิดอยู่/);
	assert.equal((plain.match(/class="opt-warn[^"]*">ผู้ให้บริการไม่ได้ระบุ<\/span>/g) ?? []).length, 1, 'only the unannotated tool is tagged');
	assert.match(plain, /AI จะทำได้ 2 อย่าง · อ่านอย่างเดียว/);
	assert.match(plain, /อนุญาต 2 อย่างนี้/);
	assert.equal((html.match(/class="[^"]*primary/g) ?? []).length, 1, 'one primary action');
	// Under read-only, the change tools cannot be ticked.
	const createBox = html.match(/<input[^>]*>(?=\s*(?:<!--[^>]*-->)*\s*<span class="opt-copy[^"]*">\s*(?:<!--[^>]*-->)*\s*<span class="opt-label[^"]*">สร้างใบแจ้งหนี้)/);
	assert.ok(createBox && /disabled/.test(createBox[0]), 'create_invoice is disabled');
	// "สำหรับนักพัฒนา" holds the jargon, collapsed.
	assert.match(html, /<details class="dev[^"]*">/);
	assert.doesNotMatch(html, /<details class="dev[^"]*"[^>]* open/);
});

test('step 3 for LINE (C4 §14l): ten reads, six changes marked "ต้องอนุมัติทุกครั้ง", Thai names, and read-only ticks no send', async () => {
	const { lineTools, lineReadNames } = await import(new URL('../../orca/line-messaging-tools.fixture.mjs', import.meta.url).href);
	const { Component } = await serverComponent(new URL('./programs/ProgramToolsEditor.svelte', import.meta.url), base);
	const props = { tools: lineTools, programName: 'LINE OA (Messaging API)', mcpID: 'default-orca-api-line-messaging', name: 'LINE OA (Messaging API)', onsave() {} };
	const readOnly = text(render(Component, { props: { ...props, selected: tools.presetSelection(lineTools, 'read'), preset: 'read' } }).body);
	assert.match(readOnly, /ดูข้อมูล <em[^>]*>\(10\)/);
	assert.match(readOnly, /สร้าง \/ แก้ไข \/ ลบ <em[^>]*>\(6\)/);
	assert.match(readOnly, /AI จะทำได้ 10 อย่าง · อ่านอย่างเดียว/);
	assert.equal((readOnly.match(/class="opt-held[^"]*">/g) ?? []).length, 6, 'each of the six writes carries the badge');
	assert.equal((readOnly.match(/ต้องอนุมัติทุกครั้ง/g) ?? []).length, 7, 'six badges and the group note');
	assert.match(readOnly, /แม้พื้นที่ทำงานจะตั้งไว้ว่า “ทำได้เลย”/);
	assert.doesNotMatch(readOnly, /ผู้ให้บริการไม่ได้ระบุ/, 'every LINE tool states its hints');
	for (const label of ['ดูจำนวนเพื่อนและคนที่บล็อก', 'ส่งข้อความถึงลูกค้า 1 คน', 'ส่งข้อความถึงเพื่อนทุกคน (บรอดแคสต์)', 'ให้ลูกค้า 1 คนกลับไปเห็นริชเมนูหลัก']) assert.ok(readOnly.includes(label), label);
	assert.doesNotMatch(readOnly, />Send a text message to one customer</, 'the English title is not the Thai label');
	// Under read-only every send and rich menu change is off; each read is ticked.
	for (const label of ['ส่งข้อความถึงลูกค้า 1 คน', 'ส่งข้อความถึงเพื่อนทุกคน (บรอดแคสต์)', 'เปลี่ยนริชเมนูหลักของทุกคน']) {
		const box = readOnly.match(new RegExp(`<input[^>]*>(?=\\s*<span class="opt-copy[^"]*">\\s*<span class="opt-label[^"]*">${label.replace(/[()]/g, '\\$&')})`));
		assert.ok(box && /disabled/.test(box[0]) && !/checked/.test(box[0]), label);
	}
	assert.equal(lineReadNames.length, 10);
	// The read group alone, with no write offered, never shows the note.
	const readsOnly = text(render(Component, { props: { ...props, tools: lineTools.slice(0, 10), selected: lineReadNames, preset: 'read' } }).body);
	assert.doesNotMatch(readsOnly, /ต้องอนุมัติทุกครั้ง/);
	// On a phone the program strip wraps "LINE OA (Messaging API)" instead of cutting it off.
	const flow = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
	assert.match(flow, /@media \(max-width: 720px\) \{[\s\S]*?\.ap-strip-name \{\s*white-space: normal;/);
});

test('with nothing read-only the read-only preset is off, and a locked editor changes nothing', async () => {
	const { Component } = await serverComponent(new URL('./programs/ProgramToolsEditor.svelte', import.meta.url), base);
	const unannotated = [flowTools[3], { name: 'sync', description: 'Sync', inputSchema: {}, definition: { name: 'sync', annotations: {} } }];
	const html = text(render(Component, { props: { tools: unannotated, programName: 'HubSpot', mcpID: 'src', selected: [], preset: 'write', name: 'HubSpot', onsave() {} } }).body);
	assert.match(html, /ใช้ไม่ได้: HubSpot ไม่ได้ระบุว่ารายการไหนอ่านอย่างเดียว/);
	assert.match(html, /value="read"[^>]*disabled/);
	assert.match(html, /ยังไม่ได้เลือกสิ่งที่ AI ทำได้/);
	const locked = render(Component, { props: { tools: flowTools, programName: 'F', mcpID: 'src', selected: ['list_invoices'], preset: 'read', name: 'F', locked: 'ลงชื่อเข้าใช้ก่อน', onsave() {} } }).body;
	assert.match(locked, /ลงชื่อเข้าใช้ก่อน/);
	assert.equal((locked.match(/<input type="checkbox"[^>]*>/g) ?? []).every((input) => /disabled/.test(input)), true);
	assert.match(locked, /class="k-button primary sbar-go[^"]*" disabled/);
});

const sources = [
	{ id: 'default-orca-flowaccount', name: 'FlowAccount', setupStatus: 'available' },
	{ id: 'default-orca-peak', name: 'PEAK', setupStatus: 'available' },
	{ id: 'default-orca-managed-google-drive', name: 'Google Drive', managedProvider: 'google-drive', setupStatus: 'available' },
	{ id: 'default-orca-api-line-messaging', name: 'LINE Messaging API', protocol: 'API', managedProvider: 'line-messaging', setupStatus: 'available' },
	{ id: 'outlook', name: 'Microsoft Outlook', setupStatus: 'admin_setup_required', setupCanConfigure: true },
	{ id: 'stripe', name: 'Stripe', setupStatus: 'available' }
];

test('step 1: four recommended cards, เชื่อมแล้ว opens the program, เร็วๆ นี้ is not a link, operator-only catalog link', async () => {
	const calls = [];
	const { warnings, Component } = await serverComponent(new URL('./programs/ProgramPicker.svelte', import.meta.url), { ...base, PageHeader: spy(calls, 'PageHeader'), ProgramRequestSheet: spy(calls, 'ProgramRequestSheet') });
	assert.deepEqual(warnings, []);
	const data = (operator) => ({ platformOperator: operator, connections: [{ id: 'conn-drive', mcpID: 'default-orca-managed-google-drive' }], members: [], organization: {} });
	const hrefFor = (id) => `/app?view=add-program&source=${id}&step=connect`;
	const customer = render(Component, { props: { data: data(false), sources, hrefFor } }).body;
	assert.match(customer, /แนะนำสำหรับธุรกิจไทย/);
	assert.equal((customer.match(/class="pick-feat[ "]/g) ?? []).length, 4);
	assert.match(customer, /href="\/app\?view=add-program&amp;source=default-orca-flowaccount&amp;step=connect"/);
	assert.match(customer, /href="\/app\?view=servers&amp;connection=conn-drive"/);
	assert.match(customer, /LINE OA \(Messaging API\)/);
	assert.match(customer, /ดูสถิติเพื่อน ส่งข้อความ ตั้งริชเมนู ทุกการส่งรอผู้ดูแลอนุมัติ/);
	assert.doesNotMatch(customer, /source=outlook/, 'Outlook is not clickable for a customer');
	assert.match(text(customer), /Microsoft Outlook.*เร็วๆ นี้/);
	assert.match(customer, /แจ้งทีม ORCA/);
	assert.doesNotMatch(customer, /section=catalog/);
	const operator = render(Component, { props: { data: data(true), sources, hrefFor } }).body;
	assert.match(operator, /source=outlook/);
	assert.match(operator, /view=platform&amp;section=catalog/);
	assert.equal(calls.filter((call) => call.name === 'ProgramRequestSheet').length, 2);
	// In a sheet (the workspace form) cards are buttons that hand the pick back.
	const sheet = render(Component, { props: { data: data(false), sources, onpick() {} } }).body;
	assert.doesNotMatch(sheet, /href="\/app\?view=(add-program|servers)/);
	// From the create form (&return=new) a connected program goes straight back to it.
	const fromForm = render(Component, { props: { data: data(false), sources, hrefFor, connectedHref: (id) => catalogHelpers.programConnectedHref(id, 'new') } }).body;
	assert.match(fromForm, /href="\/app\?view=new&amp;connection=conn-drive"/);
	assert.doesNotMatch(fromForm, /view=servers&amp;connection=conn-drive/);
});

const connection = (id, mcpID, extra = {}) => ({
	id, mcpID, name: id, description: '', enabled: true, reviewedTools: true, reviewedReadOnly: true,
	toolNames: ['list_invoices'], tools: flowTools, scopeNote: '', version: 1, updatedAt: '', ...extra
});

test('the programs list (W0: the approved card grid): logo, name, account type, one state and what AI can do for how many people; empty shows the four cards', async () => {
	const calls = [];
	const attention = await importTypeScript(new URL('../../orca/home-attention.ts', import.meta.url));
	const deps = { ...base, ...attention, page: { url: new URL('https://orca.invalid/app?view=servers') }, PageHeader: spy(calls, 'PageHeader'), ProgramService: { candidates: async () => [] }, OrcaService: {} };
	const { warnings, Component } = await serverComponent(new URL('./ConnectionCenter.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const data = {
		canManage: true, platformOperator: false,
		connections: [connection('c-read', 's1'), connection('c-write', 's2', { reviewedReadOnly: false, toolNames: ['list_invoices', 'create_invoice'], programAccountID: 'pac-1' }), connection('c-paused', 's3', { enabled: false }), connection('c-new', 's4', { reviewedTools: false, reviewedReadOnly: false, toolNames: [] })],
		hubs: [{ id: 'h', name: 'H', status: 'active', connectionID: 'c-read', toolNames: ['list_invoices'], sources: [{ connectionID: 'c-read', toolNames: ['list_invoices'] }], memberIDs: ['a', 'b'], effectiveMemberIDs: ['a', 'b', 'c'] }]
	};
	const raw = render(Component, { props: { data } }).body;
	const html = text(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	assert.equal(raw.match(/<li class="programs-card/g)?.length, 4, 'one card per program');
	// W0: admins read the connection state as เชื่อมแล้ว (was พร้อมใช้), with a check.
	assert.match(html, /c-read บัญชีของแต่ละคน เชื่อมแล้ว AI ทำได้ 1 อย่าง · 3 คน/);
	assert.match(html, /c-write บัญชีกลาง เชื่อมแล้ว AI ทำได้ 2 อย่าง · 0 คน/);
	assert.match(html, /c-paused บัญชีของแต่ละคน หยุดชั่วคราว/);
	assert.match(html, /c-new บัญชีของแต่ละคน รอเลือกสิ่งที่ AI ทำได้ ยังไม่ได้เลือกสิ่งที่ AI ทำได้/);
	assert.match(raw, /<span class="programs-state warn[^"]*"><i[^>]*><\/i>รอเลือกสิ่งที่ AI ทำได้<\/span>/, 'a state is text with a dot');
	assert.match(raw, /<a href="\/app\?view=servers&amp;connection=c-read"/, 'the card opens the program');
	// Above the grid: search and one dropdown filter, never black chips.
	assert.match(raw, /<input type="search"/);
	assert.match(raw, /<select[\s\S]*?<option value="all"[^>]*>ทั้งหมด 4<\/option>[\s\S]*?<option value="review"[^>]*>ต้องจัดการ 1<\/option>[\s\S]*?<option value="paused"[^>]*>หยุดชั่วคราว 1<\/option>/);
	assert.doesNotMatch(raw, /programs-filters|programs-table|orca-pill/);
	const centerSource = await readFile(new URL('./ConnectionCenter.svelte', import.meta.url), 'utf8');
	// A company account that needs connecting again says so, in the same word as Home.
	assert.match(centerSource, /\{#if reconnect\.has\(connection\.id\)\}<span class="programs-state warn"><i aria-hidden="true"><\/i>\{t\(RECONNECT_WORD\.th, RECONNECT_WORD\.en\)\}/);
	assert.match(centerSource, /void OrcaService\.programAccounts\(\)/);
	assert.match(centerSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/, 'three columns');
	assert.match(centerSource.slice(centerSource.indexOf('@media (max-width: 720px)')), /\.programs-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/, 'one on a phone');
	assert.equal(calls[0].props.title, 'โปรแกรม');
	assert.equal(typeof calls[0].props.action, 'function', 'เชื่อมโปรแกรม beside the title');
	const empty = render(Component, { props: { data: { ...data, connections: [], hubs: [] } } }).body;
	assert.match(empty, /ยังไม่มีโปรแกรมที่เชื่อม/);
	// W0: ดูโปรแกรมทั้งหมด opens the catalog dialog on this page.
	assert.match(empty, /href="\/app\?view=servers&amp;catalog=1"/);
	assert.doesNotMatch(empty, /href="\/app\?view=add-program"/);
	const source = await readFile(new URL('./ConnectionCenter.svelte', import.meta.url), 'utf8');
	assert.match(source, /<a class="k-button" href=\{catalogHref\}>\{term\('addProgram', t\)\}<\/a>/, 'an outline button: สร้าง is the page\'s one primary');
	assert.match(source, /catalogOpen = page\.url\.searchParams\.get\('catalog'\) === '1';/, 'the dialog follows the address');
	assert.match(source, /\{#if data\.canManage\}\s*<CatalogModal/, 'managers only');
	assert.doesNotMatch(empty, /ดูที่จัดเก็บแล้ว/);
	// Only archived programs left: start again from the cards, with a way to the archived ones (not an empty filter).
	const archivedOnly = text(render(Component, { props: { data: { ...data, connections: [connection('c-old', 's1', { archivedAt: 'x' })], hubs: [] } } }).body);
	assert.match(archivedOnly, /ยังไม่มีโปรแกรมที่เชื่อม/);
	assert.match(archivedOnly, /ดูที่จัดเก็บแล้ว \(1\)/);
	assert.doesNotMatch(archivedOnly, /ไม่พบโปรแกรมที่ตรงกับตัวกรอง/);
});

test('W0: the catalog dialog: search, the category tabs, เชื่อม or ✓ เชื่อมแล้ว, เร็วๆ นี้ greyed, and ขอให้เพิ่ม', async () => {
	const calls = [];
	const modal = (renderer, props) => {
		calls.push(props);
		props.children?.(renderer);
		props.footer?.(renderer);
	};
	const sources = [
		{ id: 's1', name: 'FlowAccount', setupStatus: 'available' },
		{ id: 's2', name: 'PEAK', setupStatus: 'available' },
		{ id: 's3', name: 'Lazada', setupStatus: 'admin_setup_required' }
	];
	const deps = { ...base, Modal: modal, ProgramLogo: () => {}, orcaError: () => '', ProgramService: { candidates: async () => sources } };
	const { warnings, Component } = await serverComponent(new URL('./programs/CatalogModal.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const source = await readFile(new URL('./programs/CatalogModal.svelte', import.meta.url), 'utf8');
	// The dialog loads the catalog itself when it opens (ProgramService.candidates, as the old step 1 did).
	assert.match(source, /if \(open && !loaded && !loading && !error\) void load\(\);/);
	assert.match(source, /<Modal bind:open title=\{term\('addProgram', t\)\} wide \{onclose\}>/);
	const data = { connections: [{ id: 'c1', mcpID: 's1' }], hubs: [], members: [], platformOperator: false };
	const html = text(render(Component, { props: { data, open: true } }).body);
	assert.equal(calls[0].title, 'เชื่อมโปรแกรม');
	assert.match(html, /ไม่เจอโปรแกรมที่ใช้\? <button type="button" class="cat-request[^"]*">ขอให้เพิ่ม<\/button>/);
	assert.doesNotMatch(html, /เพิ่มด้วยลิงก์ MCP/, 'adding by an MCP link is the ORCA team\'s');
	const operator = text(render(Component, { props: { data: { ...data, platformOperator: true }, open: true } }).body);
	assert.match(operator, /href="\/app\?org=default&amp;view=platform&amp;section=catalog"[^>]*>เพิ่มด้วยลิงก์ MCP/);
	// The states, from the shared card rule: admins see เชื่อมแล้ว, never ใช้ได้.
	assert.doesNotMatch(source, /ใช้ได้/);
	assert.match(source, /\{#if card\.state === 'connected'\}<span class="cat-state"><Check [^>]*\/>\{t\('เชื่อมแล้ว', 'Connected'\)\}<\/span>/);
	assert.match(source, /\{:else if card\.state === 'soon'\}<span class="cat-later">\{t\('เร็วๆ นี้', 'Coming soon'\)\}<\/span>/);
	assert.match(source, /\{:else\}<a class="k-button small" href=\{connectHref\(source\)\}/);
	assert.match(source, /`\/app\?view=add-program&source=\$\{encodeURIComponent\(source\.id\)\}&step=connect\$\{back\}`/);
	assert.match(source, /const back = \$derived\(returnTo === 'new' \|\| returnTo === 'welcome' \? `&return=\$\{returnTo\}` : ''\);/);
	assert.match(source, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, 'two columns');
	assert.match(source.slice(source.indexOf('@media (max-width: 720px)')), /\.cat-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/, 'one on a phone');
});

test('W0: the connect page has no stepper and no done page; ยกเลิก goes back where the person came from', async () => {
	const calls = [];
	const deps = {
		...base, untrack: (fn) => fn(), currentCompany: () => 'default', ProgramService: { candidates: async () => [] }, orcaError: () => '',
		ProgramPicker: spy(calls, 'ProgramPicker'), PageHeader: spy(calls, 'PageHeader')
	};
	const { warnings, Component } = await serverComponent(new URL('./programs/AddProgramFlow.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const data = { connections: [connection('c1', 's1')], hubs: [], members: [], platformOperator: false };
	const props = { data, onchanged: async () => {}, navigate() {}, address: '/app?view=add-program&return=new' };
	// render() is lazy: reading the body is what renders.
	assert.match(render(Component, { props: { ...props, step: 'choose', returnTo: 'new' } }).body, /href="\/app\?view=new"/, 'ยกเลิก goes back to the create form');
	const picker = calls.find((call) => call.name === 'ProgramPicker').props;
	assert.equal(picker.connectedHref('c1'), '/app?view=new&connection=c1', 'back to the create form, not the program page');
	assert.match(render(Component, { props: { ...props, step: 'connect', sourceID: 's1', address: '/app?view=add-program&source=s1&step=connect' } }).body, /href="\/app\?view=servers&amp;catalog=1"/, 'otherwise back to the catalog');
	assert.match(render(Component, { props: { ...props, step: 'connect', sourceID: 's1', returnTo: 'welcome' } }).body, /href="\/app\?view=welcome&amp;page=2"/, 'or the onboarding');
	const flow = await readFile(new URL('./programs/AddProgramFlow.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(flow, /Stepper|ProgramDone|step === 'done'|go\('done'/);
	assert.match(flow, /await navigate\?\.\(localeHref\(programReturnHref\(returnTo, result\.id\)\)\);/);
	// The account choice stays one choice in the connect step, for programs that allow both.
	assert.match(flow, /\{#if companyAllowed\}\s*<fieldset class="ap-mode"[\s\S]*?value="personal"[\s\S]*?value="company"/);
});

test('program detail: tabs follow the role, and archived programs cannot be edited', async () => {
	const calls = [];
	const deps = {
		...base, page: { url: new URL('https://orca.invalid/app?view=servers&connection=c1&tab=tools') }, goto: async () => {},
		OrcaService: {}, ProgramService: {}, displayDate: () => '', orcaError: () => '', statusLabels: {}, showToast: () => {},
		StatusPill: () => {}, ConfirmDialog: spy(calls, 'ConfirmDialog'), LifecycleActions: spy(calls, 'LifecycleActions'),
		ProgramToolsTab: spy(calls, 'ProgramToolsTab'), ConnectionMembers: spy(calls, 'ConnectionMembers'), ProgramAccount: spy(calls, 'ProgramAccount'), ProgramLogo: () => {}
	};
	const { warnings, Component } = await serverComponent(new URL('./programs/ProgramDetail.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const data = (canManage, extra = {}) => ({ canManage, platformOperator: false, connections: [connection('c1', 's1', extra)], hubs: [], members: [] });
	const manager = render(Component, { props: { data: data(true), connectionID: 'c1', onchanged: async () => {} } }).body;
	for (const tab of ['overview', 'tools', 'members', 'workspaces', 'activity']) assert.match(manager, new RegExp(`tab=${tab}"`), tab);
	assert.deepEqual(calls.filter((call) => call.name === 'ProgramToolsTab').map((call) => call.props.connection.id), ['c1']);
	calls.length = 0;
	const member = render(Component, { props: { data: data(false), connectionID: 'c1', onchanged: async () => {} } }).body;
	assert.doesNotMatch(member, /tab=members"/);
	assert.equal(calls.filter((call) => ['ProgramToolsTab', 'LifecycleActions', 'ProgramAccount'].includes(call.name)).length, 0, 'no editing for someone who cannot manage');
	calls.length = 0;
	const archived = render(Component, { props: { data: data(true, { archivedAt: 'x' }), connectionID: 'c1', onchanged: async () => {} } }).body;
	assert.doesNotMatch(archived, /tab=(tools|members)"/);
	assert.equal(calls.filter((call) => call.name === 'ProgramToolsTab').length, 0, 'the tools editor never opens on an archived program');
	assert.match(archived, /จัดเก็บแล้ว/);
});

test('the old entry points land in the new flow: detail, the ORCA team\'s add-by-link, and a program to connect', async () => {
	const calls = [];
	const deps = { ...base, page: { url: new URL('https://orca.invalid/app?view=servers') }, goto: async () => {}, ProgramService: {}, AddProgramFlow: spy(calls, 'AddProgramFlow'), ProgramDetail: spy(calls, 'ProgramDetail'), SourceSetup: spy(calls, 'SourceSetup'), PageHeader: spy(calls, 'PageHeader') };
	const { warnings, Component } = await serverComponent(new URL('./ConnectionSettings.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const onchanged = async () => {};
	render(Component, { props: { data: { platformOperator: false }, onchanged, initialConnectionID: 'c1' } }).body;
	assert.deepEqual(calls.map((call) => [call.name, call.props.connectionID]), [['ProgramDetail', 'c1']]);
	calls.length = 0;
	render(Component, { props: { data: { platformOperator: false }, onchanged, initiallyAddSource: true } }).body;
	assert.deepEqual(calls, [], 'adding by an MCP link is the ORCA team\'s');
	render(Component, { props: { data: { platformOperator: true }, onchanged, initiallyAddSource: true } }).body;
	assert.deepEqual(calls.map((call) => call.name), ['PageHeader', 'SourceSetup']);
	assert.equal(calls[1].props.canCreate, true);
	calls.length = 0;
	render(Component, { props: { data: {}, onchanged, initialSourceID: 'src' } }).body;
	assert.deepEqual([calls[0].name, calls[0].props.step, calls[0].props.sourceID], ['AddProgramFlow', 'connect', 'src']);
});

test('the retired program pages are gone and nothing imports them', async () => {
	const root = new URL('../../../', import.meta.url);
	const files = [];
	async function walk(url) {
		for (const entry of await readdir(url, { withFileTypes: true })) {
			const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
			if (entry.isDirectory()) await walk(next);
			else if (/\.(svelte|ts|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(next);
		}
	}
	await walk(root);
	for (const file of files) {
		const source = await readFile(file, 'utf8');
		assert.doesNotMatch(source, /\/(Connections|ToolCatalog|ConnectedUsers|ConnectionSetupDialog)\.svelte['"]|orca\/(connected-users|tool-inventory)['"]/, file.pathname);
	}
});

test('the request to the ORCA team waits while it sends: its fields are disabled, since the receipt replaces the form (Codex release review 67)', async () => {
	const source = await readFile(new URL('./programs/ProgramRequestSheet.svelte', import.meta.url), 'utf8');
	const form = source.slice(source.indexOf('<form class="request-form"'), source.indexOf('</form>'));
	for (const field of ['bind:value={name}', 'bind:value={work}', 'bind:value={email}', 'bind:checked={consent}']) {
		const at = form.indexOf(field);
		assert.ok(at > 0, field);
		const tag = form.slice(form.lastIndexOf('<', at), form.indexOf('>', at));
		assert.match(tag, /disabled=\{sending\}/, field);
	}
	assert.match(form, /type="submit"[^>]*disabled=\{sending\}/);
});

test('W0 logos: Canva is its vendor SVG; a program with no sharp mark (Lazada) shows its name as text, never a generic icon', async () => {
	const data = await importTypeScript(new URL('../../orca/catalog-data.ts', import.meta.url));
	assert.equal(data.getCatalogPresentation('Canva').icon, '/orca/catalog/canva.svg');
	assert.ok(!data.getCatalogPresentation('Lazada Seller API').icon, 'no blurred favicon');
	const svg = await readFile(new URL('../../../../static/orca/catalog/canva.svg', import.meta.url), 'utf8');
	assert.match(svg, /^<svg role="img" viewBox="0 0 24 24"[^>]*><title>Canva<\/title><path fill="#00C4CC" d="/);
	assert.doesNotMatch(svg, /<script|on\w+=|href=/i, 'no active content');
	const { warnings, Component } = await serverComponent(new URL('../../orca/CatalogIcon.svelte', import.meta.url), { getCatalogPresentation: data.getCatalogPresentation });
	assert.deepEqual(warnings, []);
	const lazada = render(Component, { props: { name: 'Lazada Seller API', size: 36, decorative: false } }).body;
	assert.match(lazada, /<span class="orca-catalog-name[^"]*" style="font-size: [\d.]+px">Lazada<\/span>/);
	assert.match(lazada, /role="img" aria-label="Lazada Seller API"/);
	const canva = render(Component, { props: { name: 'Canva', size: 36 } }).body;
	assert.match(canva, /<img src="\/orca\/catalog\/canva\.svg"/);
	const icon = await readFile(new URL('../../orca/CatalogIcon.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(icon, /Plug|@lucide/);
});

test('W0 (Codex review 1): after an auto-save the catalog and the onboarding say what AI may read, with a link to change it', async () => {
	const { warnings, Component } = await serverComponent(new URL('./programs/AutoAllowedNotice.svelte', import.meta.url), base);
	assert.deepEqual(warnings, []);
	const html = text(render(Component, { props: { connection: { id: 'c 1', name: 'FlowAccount', toolNames: ['a', 'b', 'c', 'd', 'e'], reviewedReadOnly: true } } }).body);
	assert.match(html, /role="status"/);
	assert.match(html, /เชื่อม FlowAccount แล้ว · AI ดูข้อมูลได้ 5 อย่าง/);
	assert.match(html, /<a href="\/app\?view=servers&amp;connection=c%201&amp;tab=tools"[^>]*>เปลี่ยน<\/a>/);
	const catalogSource = await readFile(new URL('./programs/CatalogModal.svelte', import.meta.url), 'utf8');
	assert.match(catalogSource, /\{#if justAdded\}<AutoAllowedNotice connection=\{justAdded\} \/>\{\/if\}/);
	const onboardingSource = await readFile(new URL('./onboarding/Onboarding.svelte', import.meta.url), 'utf8');
	assert.match(onboardingSource, /\{#if justAdded\}<AutoAllowedNotice connection=\{justAdded\} \/>\{\/if\}/);
	const center = await readFile(new URL('./ConnectionCenter.svelte', import.meta.url), 'utf8');
	assert.match(center, /url\.searchParams\.delete\('added'\);/, 'closing the catalog drops it');
});

test('Codex W0 review 1: the catalog categories are pressed filter buttons, not a half-built tablist; descriptions are one line with a title', async () => {
	const source = await readFile(new URL('./programs/CatalogModal.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /role="tab|aria-selected/);
	assert.match(source, /<div class="cat-tabs" role="group"[\s\S]*?aria-pressed=\{chip === item\.id\}/);
	assert.match(source, /<small title=\{t\(line\[0\], line\[1\]\)\}>/);
	assert.match(source.slice(source.indexOf('.cat-copy small {')), /^\.cat-copy small \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
	const onboarding = await readFile(new URL('./onboarding/Onboarding.svelte', import.meta.url), 'utf8');
	assert.match(onboarding, /<small title=\{t\(line\[0\], line\[1\]\)\}>/);
	assert.match(onboarding, /t\('คุณดูแลงานด้านไหน', 'Your area of work'\)/, 'an English H1 of at most 4 words');
	// The footer's MCP-link entry stays the ORCA team's: it opens the platform's catalog, which customers cannot reach.
	assert.match(source, /\{#if operator\}<a class="cat-link" href=\{localeHref\(addByLinkHref\(\)\)\}>/);
});
