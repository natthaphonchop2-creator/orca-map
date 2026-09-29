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
const base = { t: th, localeHref: (href) => href, orcaLocale: { value: 'th' }, ...glossary, ...navigation, ...tools, ...catalogHelpers, ...catalog, ...gatewaySources, ...presentation, ...health, ...activation };
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
	assert.ok(contract.subtitleWithinContract('เลือกว่า AI ของทีมทำอะไรใน LINE Official Account ได้บ้าง เปลี่ยนภายหลังได้เสมอ'));
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
	assert.match(customer, /LINE Official Account/);
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

test('the programs list: one row per program with what AI can do, workspaces and one status; empty shows the four cards', async () => {
	const calls = [];
	const deps = { ...base, page: { url: new URL('https://orca.invalid/app?view=servers') }, PageHeader: spy(calls, 'PageHeader'), StatusPill: (renderer, props) => renderer.push(`<span data-pill="${props.tone}">${props.label}</span>`), ProgramService: { candidates: async () => [] }, OrcaService: {} };
	const { warnings, Component } = await serverComponent(new URL('./ConnectionCenter.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const data = {
		canManage: true, platformOperator: false,
		connections: [connection('c-read', 's1'), connection('c-write', 's2', { reviewedReadOnly: false, toolNames: ['list_invoices', 'create_invoice'] }), connection('c-paused', 's3', { enabled: false }), connection('c-new', 's4', { reviewedTools: false, reviewedReadOnly: false, toolNames: [] })],
		hubs: [{ id: 'h', name: 'H', status: 'active', connectionID: 'c-read', toolNames: ['list_invoices'], sources: [{ connectionID: 'c-read', toolNames: ['list_invoices'] }] }]
	};
	const html = text(render(Component, { props: { data } }).body);
	assert.match(html, /c-read.*1 อย่าง.*อ่านอย่างเดียว.*1 พื้นที่.*data-pill="ok">พร้อมใช้/);
	assert.match(html, /c-write.*2 อย่าง.*อ่านและแก้ไข.*ยังไม่ได้ใช้/);
	assert.match(html, /c-paused.*data-pill="neutral">ระงับ/);
	assert.match(html, /c-new.*ยังไม่ได้เลือก.*data-pill="warn">ต้องตรวจใหม่/);
	assert.equal(calls[0].props.title, 'โปรแกรมที่เชื่อม');
	const empty = render(Component, { props: { data: { ...data, connections: [], hubs: [] } } }).body;
	assert.match(empty, /ยังไม่มีโปรแกรมที่เชื่อม/);
	assert.match(empty, /href="\/app\?view=add-program"/);
	assert.doesNotMatch(empty, /ดูที่จัดเก็บแล้ว/);
	// Only archived programs left: start again from the cards, with a way to the archived ones (not an empty filter).
	const archivedOnly = text(render(Component, { props: { data: { ...data, connections: [connection('c-old', 's1', { archivedAt: 'x' })], hubs: [] } } }).body);
	assert.match(archivedOnly, /ยังไม่มีโปรแกรมที่เชื่อม/);
	assert.match(archivedOnly, /ดูที่จัดเก็บแล้ว \(1\)/);
	assert.doesNotMatch(archivedOnly, /ไม่พบโปรแกรมที่ตรงกับตัวกรอง/);
});

test('step 4 names the per-person account and gives one next action', async () => {
	const calls = [];
	const { warnings, Component } = await serverComponent(new URL('./programs/ProgramDone.svelte', import.meta.url), { ...base, ProgramLogo: spy(calls, 'ProgramLogo') });
	assert.deepEqual(warnings, []);
	const props = { connection: connection('c1', 's'), programName: 'FlowAccount', logoName: 'FlowAccount', people: 7 };
	const everyone = text(render(Component, { props: { ...props, hubs: [] } }).body);
	assert.match(everyone, /เชื่อม FlowAccount แล้ว/);
	assert.match(everyone, /AI ทำได้ 1 อย่าง · อ่านอย่างเดียว/);
	assert.match(everyone, /แต่ละคนต้องมีบัญชี FlowAccount ของตัวเอง/);
	assert.match(everyone, /href="\/app\?view=new&amp;everyone=1&amp;connection=c1"[^>]*>.*ให้ทุกคนในบริษัทใช้/);
	assert.match(everyone, /ทุกคน 7 คน · อ่านอย่างเดียว/);
	const workspace = text(render(Component, { props: { ...props, hubs: [{ id: 'h', name: 'Sales', status: 'active' }] } }).body);
	assert.match(workspace, /เพิ่มลงพื้นที่ทำงาน…/);
	assert.doesNotMatch(workspace, /everyone=1/);
	const back = text(render(Component, { props: { ...props, hubs: [], returnTo: 'new', anotherHref: '/app?view=add-program&return=new&step=choose' } }).body);
	assert.match(back, /href="\/app\?view=new&amp;connection=c1"[^>]*>กลับไปสร้างพื้นที่ทำงาน/);
	// The quiet links: another program (keeping the way back to the form) and the programs list.
	assert.match(back, /href="\/app\?view=add-program&amp;return=new&amp;step=choose"[^>]*>เชื่อมโปรแกรมอื่น/);
	assert.match(back, /href="\/app\?view=servers"[^>]*>ดูโปรแกรมที่เชื่อม/);
	assert.equal((back.match(/class="k-button primary/g) ?? []).length, 1, 'one primary action');
});

test('the page keeps its place: step links while adding, none once saved; a connected card honours the way back', async () => {
	const calls = [];
	const deps = {
		...base, untrack: (fn) => fn(), currentCompany: () => 'default', ProgramService: { candidates: async () => [] }, orcaError: () => '',
		Stepper: spy(calls, 'Stepper'), ProgramPicker: spy(calls, 'ProgramPicker'), ProgramDone: spy(calls, 'ProgramDone')
	};
	const { warnings, Component } = await serverComponent(new URL('./programs/AddProgramFlow.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const data = { connections: [connection('c1', 's1')], hubs: [], members: [], platformOperator: false };
	const props = { data, onchanged: async () => {}, navigate() {}, address: '/app?view=add-program&return=new' };
	// render() is lazy: reading the body is what renders.
	assert.match(render(Component, { props: { ...props, step: 'choose', returnTo: 'new' } }).body, /href="\/app\?view=new"/, 'ยกเลิก goes back to the create form');
	const picker = calls.find((call) => call.name === 'ProgramPicker').props;
	assert.equal(picker.connectedHref('c1'), '/app?view=new&connection=c1', 'back to the create form, not the program page');
	assert.equal(typeof calls.find((call) => call.name === 'Stepper').props.hrefFor, 'function');
	calls.length = 0;
	assert.doesNotMatch(render(Component, { props: { ...props, step: 'done', sourceID: 's1', connectionID: 'c1', returnTo: 'new', address: '/app?view=add-program&return=new&source=s1&step=done&connection=c1' } }).body, /ap-cancel/, 'nothing to cancel once saved');
	assert.equal(calls.find((call) => call.name === 'Stepper').props.hrefFor, undefined, 'a saved program is not reopened as a new one');
	const done = calls.find((call) => call.name === 'ProgramDone').props;
	assert.equal(done.connection.id, 'c1');
	assert.equal(done.anotherHref, '/app?view=add-program&return=new&step=choose');
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
