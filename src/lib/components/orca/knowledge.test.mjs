import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// คลังความรู้ (workspace UX U8): what each role sees, in Thai.
const k = await importTypeScript(new URL('../../orca/knowledge.ts', import.meta.url));
const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const th = (thai) => thai;
const term = (key, t) => t(...glossary[key]);
const noop = () => {};

const files = [
	'KnowledgeLibrary.svelte',
	'LibraryEditor.svelte',
	'knowledge/KnowledgeList.svelte',
	'knowledge/KnowledgeDetail.svelte',
	'knowledge/KnowledgeRail.svelte',
	'knowledge/AudienceCard.svelte',
	'knowledge/TemplateBody.svelte',
	'knowledge/ArticlePicker.svelte',
	'knowledge/ScopeChip.svelte'
];

test('every knowledge component compiles without warnings, and none keeps the old words', async () => {
	for (const file of files) {
		const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
		for (const generate of ['client', 'server']) assert.deepEqual(compile(source, { filename: file, generate }).warnings, [], `${file} (${generate})`);
		assert.doesNotMatch(source, /Orca Cloud|MCP URL|ลิงก์เชื่อม AI|แม่แบบ|ชื่อตัวแปร|<select/, file);
		assert.doesNotMatch(source, /#fff\b|#ffffff|#151823/i, `${file} uses tokens only`);
	}
	const page = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(page, /LibraryDepartments|library\.css/, 'departments are edited in ทีม; the page no longer uses library.css');
});

const PageHeader = (await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), {})).Component;
const StatusPill = (await serverComponent(new URL('./ui/StatusPill.svelte', import.meta.url), {})).Component;
const hub = (id, extra = {}) => ({ id, name: id === 'sales' ? 'ฝ่ายขาย' : id, description: '', connectionID: 'c', toolNames: ['t'], memberIDs: ['me', 'x'], accessUnitIDs: ['dept'], unitIDs: [], dailyLimit: 100, status: 'active', version: 2, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0, ...extra });
const item = (id, extra = {}) => ({ id, kind: 'knowledge', title: `เรื่อง ${id}`, summary: 'สรุป', content: 'เนื้อหา', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [], status: 'published', version: 1, hubID: 'sales', ownerID: 'me', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z', canEdit: true, ...extra });
const members = [
	{ id: 'me', displayName: 'วิภา ตัวอย่าง', email: 'me@example.invalid', role: 'owner' },
	{ id: 'x', displayName: 'ธนา ทดสอบ', email: 'x@example.invalid', role: 'admin' },
	{ id: 'y', displayName: 'มาลี สมมุติ', email: 'y@example.invalid', role: 'employee' }
];
const departments = [{ unitID: 'dept', name: 'ฝ่ายขาย', memberIDs: ['y'], version: 1 }];

async function list(props) {
	const scopes = [];
	const rails = [];
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeList.svelte', import.meta.url), {
		...k, term, t: th, localeHref: (value) => value, PageHeader, StatusPill,
		ScopeChip: (_renderer, input) => scopes.push(input),
		KnowledgeRail: (_renderer, input) => rails.push(input)
	});
	assert.deepEqual(warnings, []);
	const html = render(Component, {
		props: { hub: hub('sales'), choices: [hub('sales')], items: [], departments, members, currentUserID: 'me', now: Date.parse('2026-09-28T10:00:00Z'), onchoose: noop, oncreate: noop, onopen: noop, onreload: noop, ...props }
	}).body;
	return { html, scopes, rails };
}

test('the library home: title, one primary action, counts, two kinds (no แผนก tab) and four status chips', async () => {
	const { html, scopes, rails } = await list({ items: [item('a'), item('b', { status: 'draft' }), item('c', { status: 'archived' }), item('t', { kind: 'template' })] });
	assert.match(html, /<h1[^>]*>คลังความรู้<\/h1>/);
	assert.match(html, /ข้อมูลที่ AI ของทีมใช้ตอบคำถาม/);
	assert.equal(html.match(/k-button primary/g)?.length, 1, 'one primary action');
	assert.match(html, /เพิ่มความรู้/);
	assert.match(html, /AI ใช้ได้ <b[^>]*>1<\/b>/);
	assert.match(html, /ฉบับร่าง <b[^>]*>1<\/b>/);
	assert.match(html, /ความรู้(?:<!--[^>]*-->)*<span class="c[^"]*">2<\/span>/);
	assert.match(html, /คำสั่งสำเร็จรูป(?:<!--[^>]*-->)*<span class="c[^"]*">1<\/span>/);
	assert.doesNotMatch(html, />แผนก</, 'departments are edited in ทีม');
	for (const chip of ['ทั้งหมด', 'AI ใช้ได้', 'ฉบับร่าง', 'จัดเก็บแล้ว']) assert.match(html, new RegExp(`class="chip[^"]*"[^>]*>${chip}<`));
	assert.equal(scopes.length, 0, 'one workspace: no scope chip');
	assert.equal(rails.length, 1);
	assert.equal(rails[0].item.id, 'a', 'try-it asks about a published article');
	const several = await list({ choices: [hub('sales'), hub('acc')] });
	assert.equal(several.scopes.length, 1, 'several workspaces: the scope chip');
});

test('audience chips show only on items the viewer can edit (critique 8)', async () => {
	const { html } = await list({
		items: [
			item('mine', { memberIDs: ['x'], unitIDs: ['dept'] }),
			item('only-me'),
			item('theirs', { ownerID: 'y', canEdit: false })
		]
	});
	assert.equal(html.match(/class="aud[ "]/g)?.length, 2);
	assert.match(html, /ทุกคน/);
	assert.match(html, /เฉพาะฉัน/);
	assert.equal(html.match(/ตั้งโดยผู้เขียน/g)?.length, 1);
	assert.match(html, /ป้าย “ใครใช้ได้” แสดงเฉพาะเรื่องที่คุณแก้ไขได้/);
	assert.match(html, /มาลี สมมุติ/, 'the author of someone else\'s item');
});

test('an empty library starts from three common guides; the rows page after seven', async () => {
	const empty = await list({});
	for (const title of ['นโยบายคืนสินค้า', 'ขั้นตอนออกใบกำกับภาษี', 'สวัสดิการพนักงาน']) assert.match(empty.html, new RegExp(title));
	assert.match(empty.html, /เริ่มจากคู่มือที่ทีมถามบ่อย/);
	const many = await list({ items: Array.from({ length: 10 }, (_, index) => item(`i${index}`)) });
	assert.equal(many.html.match(/class="kl-r/g)?.length, 7);
	assert.match(many.html, /ดูอีก 3 เรื่อง/);
});

test('a failed load shows no zero counts and no "ลองถาม AI"', async () => {
	const { html, rails } = await list({ items: [], error: 'โหลดคลังความรู้ไม่สำเร็จ ลองโหลดใหม่อีกครั้ง' });
	assert.match(html, /role="alert"/);
	assert.doesNotMatch(html, /class="kn-strip/, 'no "AI ใช้ได้ 0 · ฉบับร่าง 0" over an error');
	assert.doesNotMatch(html, /class="c[^"]*">0</, 'no zero on the tabs');
	assert.equal(rails[0].ask, false);
	assert.doesNotMatch(html, /เริ่มจากคู่มือที่ทีมถามบ่อย/, 'no starters over an error');
	const loaded = await list({ items: [item('a')] });
	assert.match(loaded.html, /class="kn-strip/);
	assert.equal(loaded.rails[0].ask, true);
});

async function detail(props) {
	const rails = [];
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeDetail.svelte', import.meta.url), {
		...k, term, t: th, tick: async () => {}, StatusPill, ConfirmDialog: noop,
		orcaError: () => '', OrcaLibraryService: {}, getHttpStatusCode: noop, parseErrorContent: noop,
		KnowledgeRail: (_renderer, input) => rails.push(input)
	});
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { hub: hub('sales'), items: [], members, departments, currentUserID: 'me', now: Date.parse('2026-09-28T10:00:00Z'), onback: noop, onedit: noop, onarchived: noop, ondenied: noop, ...props } }).body;
	return { html, rails };
}

test('the detail: its author sees who can use it and which supporting articles stopped working', async () => {
	const prompt = item('t', {
		kind: 'template', title: 'ตอบลูกค้า', content: 'ตอบ {{field_1}}', parameters: [{ name: 'field_1', label: 'ชื่อลูกค้า', required: true }],
		knowledgeIDs: ['a', 'old'], unitIDs: ['dept'], memberIDs: ['x']
	});
	const items = [item('a', { title: 'นโยบายคืนสินค้า' }), item('old', { title: 'เงื่อนไขเดิม', status: 'archived' }), prompt];
	const mine = await detail({ item: prompt, items });
	assert.match(mine.html, /1 เรื่องเลิกเผยแพร่แล้ว หรือคุณอ่านไม่ได้แล้ว/);
	assert.equal(mine.html.match(/ใช้ไม่ได้แล้ว/g)?.length, 1, 'only the archived article is tagged');
	assert.match(mine.html, /<mark[^>]*>ชื่อลูกค้า<\/mark>/, 'fields show by their Thai label');
	assert.doesNotMatch(mine.html.replace(/<[^>]*>/g, ''), /field_1/, 'no variable name in the visible text');
	assert.match(mine.html, /<form class="kd-preview[^"]*" novalidate/, 'required fields are checked in Thai, not by the browser');
	assert.match(mine.html, /AI ของ <b>3 คน<\/b>ใช้ได้ตอนนี้/);
	assert.match(mine.html, />แก้ไข</);
	const paused = await detail({ item: prompt, items, hub: hub('sales', { status: 'paused' }) });
	assert.match(paused.html, /AI ของ 3 คนจะใช้ได้เมื่อเปิดใช้งานพื้นที่ทำงานนี้/, 'no "now" while the workspace is off');
	const theirs = await detail({ item: { ...prompt, ownerID: 'y', canEdit: false, unitIDs: [], memberIDs: [] }, items });
	assert.doesNotMatch(theirs.html, /เลิกเผยแพร่แล้ว|>แก้ไข<|>จัดเก็บ</, 'no author tools for someone else\'s prompt');
	assert.match(theirs.html, /ผู้เขียนเป็นคนเลือกว่าใครใช้ได้/, 'no audience the server did not send (critique 8)');
});

async function page(data, props = {}) {
	const { warnings, Component } = await serverComponent(new URL('./KnowledgeLibrary.svelte', import.meta.url), {
		...k, term, t: th, localeHref: (value) => value, PageHeader, untrack: (fn) => fn(),
		beforeNavigate: noop, goto: noop, getHttpStatusCode: () => undefined, connectionReady: () => true,
		aiConnection: { state: 'none' }, currentCompany: () => 'default',
		memberName: (member) => member.displayName || member.email, orcaError: () => '', statusLabels: { active: 'เปิดใช้งาน', paused: 'ระงับ', draft: 'ฉบับร่าง' },
		OrcaLibraryService: {}, hubWriteService: {}, copyText: noop, showToast: noop,
		ChoiceTile: (renderer, input) => renderer.push(`<choice data-hub="${input.value}" data-selected="${input.selected}"></choice>`),
		KnowledgeList: (renderer) => renderer.push('<knowledge-list></knowledge-list>')
	});
	assert.deepEqual(warnings, []);
	return render(Component, { props: { data: { organization: { displayName: 'บริษัท ตัวอย่าง' }, currentUserID: 'me', canManage: true, members, units: [], connections: [], hubs: [], ...data }, hubID: '', onchanged: async () => {}, ...props } }).body;
}

test('prerequisites are one line and one button, by role', async () => {
	const create = await page({});
	assert.match(create, /ต้องมีพื้นที่ทำงาน AI ก่อน/);
	assert.match(create, /href="\/app\?view=new"[^>]*>สร้างพื้นที่ทำงาน</);
	const employee = await page({ canManage: false });
	assert.match(employee, /ขอให้ผู้ดูแลบริษัทเพิ่มคุณ/);
	assert.match(employee, /คัดลอกข้อความขอสิทธิ์/);
	assert.doesNotMatch(employee, /เพิ่มฉันเลย|สร้างพื้นที่ทำงาน/);
	const employeeElsewhere = await page({ canManage: false, hubs: [hub('acc', { memberIDs: ['x'] })] });
	assert.doesNotMatch(employeeElsewhere, /เพิ่มฉันเลย/, 'an employee is never offered to add themselves');
	const join = await page({ hubs: [hub('acc', { memberIDs: ['x'] })] });
	assert.match(join, /คุณยังไม่ได้อยู่ในพื้นที่ทำงาน acc/);
	assert.match(join, /เพิ่มฉันเลย/);
	const several = await page({ hubs: [hub('b', { memberIDs: ['x'], status: 'paused' }), hub('a', { memberIDs: ['x'] })] });
	assert.deepEqual([...several.matchAll(/data-hub="([^"]+)" data-selected="([^"]*)"/g)].map((m) => [m[1], m[2]]), [['a', 'a'], ['b', 'a']], 'the first active workspace is chosen');
	const missing = await page({ hubs: [hub('sales')] }, { hubID: 'gone' });
	assert.match(missing, /ไม่พบพื้นที่ทำงานนี้/);
	const open = await page({ hubs: [hub('sales')] });
	assert.match(open, /<knowledge-list>/, 'the only workspace opens by itself');
	for (const html of [create, employee, join, missing]) assert.equal(html.match(/k-button primary/g)?.length, 1);
});

test('the audience card: four choices, what "everyone" is made of, and the live count', async () => {
	const { warnings, Component } = await serverComponent(new URL('./knowledge/AudienceCard.svelte', import.meta.url), { ...k, t: th, untrack: (fn) => fn(), memberRole: () => 'พนักงาน', PersonPicker: noop });
	assert.deepEqual(warnings, []);
	const everyone = k.workspaceEveryone(hub('sales'), departments, members.map((m) => m.id), 'me');
	const html = render(Component, { props: { kind: 'knowledge', mode: 'everyone', everyone, departments, members, me: 'me', unitIDs: [], memberIDs: [] } }).body;
	assert.match(html, /ใครใช้ได้บ้าง/);
	for (const option of ['ทุกคนในพื้นที่ทำงานนี้', 'เฉพาะแผนก', 'เฉพาะบางคน', 'เฉพาะฉัน']) assert.match(html, new RegExp(option));
	assert.doesNotMatch(html, /แผนกและบางคน/, 'the older mix shows only for an item saved that way');
	assert.match(html, /ตอนนี้คือฝ่ายขาย และอีก 1 คน/);
	assert.match(html, /อัปเดตเองเมื่อมีคนเข้าหรือออกจากฝ่าย/);
	assert.match(html, /นับเฉพาะ 1 คนนี้ คนที่เพิ่มทีหลังต้องมาเลือกเอง/, 'direct members are a snapshot');
	assert.match(html, /AI ของ <b[^>]*>3 คน<\/b>จะใช้ความรู้นี้ได้/);
	const me = render(Component, { props: { kind: 'template', mode: 'me', everyone, departments, members, me: 'me' } }).body;
	assert.match(me, /AI ของ <b[^>]*>1 คน<\/b>จะใช้คำสั่งนี้ได้/);
	const mixed = render(Component, { props: { kind: 'knowledge', mode: 'mixed', everyone, departments, members, me: 'me', unitIDs: ['dept'], memberIDs: ['x'] } }).body;
	assert.match(mixed, /แผนกและบางคน/);
});

test('the editor has two buttons and no status list; a prompt asks only for Thai field labels', async () => {
	const AudienceCard = (await serverComponent(new URL('./knowledge/AudienceCard.svelte', import.meta.url), { ...k, t: th, untrack: (fn) => fn(), memberRole: () => '', PersonPicker: noop })).Component;
	const TemplateBody = (await serverComponent(new URL('./knowledge/TemplateBody.svelte', import.meta.url), { ...k, t: th, tick: async () => {}, ConfirmDialog: noop })).Component;
	const ArticlePicker = (await serverComponent(new URL('./knowledge/ArticlePicker.svelte', import.meta.url), { ...k, t: th })).Component;
	const { warnings, Component } = await serverComponent(new URL('./LibraryEditor.svelte', import.meta.url), {
		...k, t: th, untrack: (fn) => fn(), onDestroy: noop, getHttpStatusCode: noop, orcaError: noop, OrcaLibraryService: {},
		AudienceCard, TemplateBody, ArticlePicker, ConfirmDialog: noop, FormErrorSummary: noop
	});
	assert.deepEqual(warnings, []);
	const props = { hub: hub('sales'), items: [item('a')], members, departments, currentUserID: 'me', onsaved: noop, onclose: noop, ondenied: noop, ondirty: noop };
	const knowledge = render(Component, { props: { ...props, kind: 'knowledge', initialTitle: 'นโยบายคืนสินค้า' } }).body;
	assert.match(knowledge, /<h1[^>]*>เพิ่มความรู้<\/h1>/);
	assert.match(knowledge, /ยังไม่ได้บันทึก/);
	assert.match(knowledge, /value="นโยบายคืนสินค้า"/, 'a starter title fills the title');
	assert.match(knowledge, /0 \/ 40,000 ตัวอักษร/);
	assert.match(knowledge, /คำอธิบายสั้น \(ช่วยให้ AI หาเจอ\)/);
	assert.match(knowledge, />บันทึกร่าง</);
	assert.match(knowledge, />เผยแพร่ให้ AI ใช้</);
	assert.doesNotMatch(knowledge, /<select|สถานะการเผยแพร่/);
	const template = render(Component, { props: { ...props, kind: 'template', existing: item('t', { kind: 'template', content: 'สรุป {{field_1}}', parameters: [{ name: 'field_1', label: 'ช่วงวันที่', required: true }] }) } }).body;
	assert.match(template, /อยากให้ AI ทำอะไร/);
	assert.match(template, /แทรกช่องให้กรอก/);
	assert.match(template, /สรุป \{\{ช่วงวันที่\}\}/, 'the field shows by its Thai label');
	assert.doesNotMatch(template, /field_1/, 'never an English variable name');
	assert.match(template, /ค้นหาชื่อเรื่อง/, 'the searchable article picker');
});

test('the side: "เชื่อม AI ของฉัน" only when my AI is not connected, and a prompt to copy', async () => {
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeRail.svelte', import.meta.url), {
		...k, term, t: th, localeHref: (value) => value, onDestroy: noop, copyFeedback: () => ({ copied: noop, dispose: noop }), copyText: noop, showToast: noop
	});
	assert.deepEqual(warnings, []);
	const article = item('a', { title: 'นโยบายคืนสินค้า' });
	const off = render(Component, { props: { item: article } }).body;
	assert.match(off, /ยังไม่ได้เชื่อม AI ของคุณ/);
	assert.match(off, /href="\/app\?view=connect-ai"[^>]*>เชื่อม AI ของฉัน/);
	assert.doesNotMatch(off, /MCP|ลิงก์/, 'no MCP-URL box any more');
	assert.match(off, /ช่วยสรุปเรื่อง “นโยบายคืนสินค้า”/);
	assert.match(off, /คัดลอกคำถาม/);
	assert.match(off, /สถานะหมายถึงอะไร/);
	const on = render(Component, { props: { item: article, connected: true, app: 'Claude', legend: false } }).body;
	assert.doesNotMatch(on, /เชื่อม AI ของฉัน|สถานะหมายถึงอะไร/);
	assert.match(on, /ถามใน Claude เพื่อเช็กว่า AI ตอบถูก/);
	assert.doesNotMatch(render(Component, { props: { item: article, ask: false, connected: true } }).body, /ลองถาม AI/);
});
