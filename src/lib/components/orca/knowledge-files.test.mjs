import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// คลังความรู้ v2, phase 1a (C4 §14m S7): what each role sees of files, in
// Thai, and that a company without library v2 sees today's page.
const k = await importTypeScript(new URL('../../orca/knowledge.ts', import.meta.url));
const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const th = (thai) => thai;
const term = (key, t) => t(...glossary[key]);
/** The server-rendered markup without Svelte's scoping classes and hydration comments. */
const clean = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s?svelte-[a-z0-9]+/g, '').replace(/ class=""/g, '');
const show = (Component, props) => clean(render(Component, { props }).body);
const noop = () => {};
const ON = { files: true, audienceModes: true };
const OFF = { files: false, audienceModes: true };

const NEW_FILES = [
	'knowledge/FileDropZone.svelte',
	'knowledge/FileDetail.svelte',
	'knowledge/FilePreview.svelte',
	'knowledge/UsageCard.svelte',
	'knowledge/TakeoverCard.svelte',
	'knowledge/WhoCard.svelte',
	'ui/Switch.svelte'
];

test('every new file component compiles without warnings, uses tokens only, and keeps the old words out', async () => {
	for (const file of NEW_FILES) {
		const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
		for (const generate of ['client', 'server']) assert.deepEqual(compile(source, { filename: file, generate }).warnings, [], `${file} (${generate})`);
		assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} uses tokens only`);
		assert.doesNotMatch(source, /<select|Orca Cloud|MCP URL|แม่แบบ|กรุณา|\{@html/, file);
	}
});

const hub = (id, extra = {}) => ({ id, name: 'ฝ่ายขาย', description: '', connectionID: 'c', toolNames: ['t'], memberIDs: ['me', 'x'], accessUnitIDs: ['dept'], unitIDs: [], dailyLimit: 100, status: 'active', version: 2, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0, ...extra });
const members = [
	{ id: 'me', displayName: 'วิภา ตัวอย่าง', email: 'me@example.invalid', role: 'owner' },
	{ id: 'x', displayName: 'ธนา ทดสอบ', email: 'x@example.invalid', role: 'admin' },
	{ id: 'y', displayName: 'มาลี สมมุติ', email: 'y@example.invalid', role: 'employee' }
];
const departments = [{ unitID: 'dept', name: 'ฝ่ายขาย', memberIDs: ['y'], version: 1 }];
const hiddenParts = (extra = {}) => ({ notesSlides: 0, hiddenSlides: 0, hiddenSheets: 0, hiddenText: 0, comments: 0, trackedChanges: 0, ...extra });
const version = (n, state, extra = {}) => ({
	version: n, state, fileName: 'ราคาสินค้า.xlsx', bytes: 348_000, createdAt: '2026-09-27T03:00:00Z',
	options: { includeHidden: false, includeComments: false, includeNotes: false }, stats: { chars: 61_420, sheets: 3, rows: 1240, hidden: hiddenParts() }, ...extra
});
const options = (extra = {}) => ({ includeHidden: false, includeComments: false, includeNotes: false, allowDownload: true, reviewBeforeUpdate: false, ...extra });
const fileInfo = (extra = {}) => ({ origin: 'upload', fileName: 'ราคาสินค้า.xlsx', ext: 'xlsx', mime: 'x', bytes: 348_000, allowDownload: true, ...extra });
const fileItem = (id, extra = {}) => ({
	id, kind: 'file', title: 'ราคาสินค้า 2569', summary: '', content: '', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [], status: 'published', version: 3,
	hubID: 'sales', ownerID: 'me', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z', canEdit: true, audienceMode: 'list',
	file: fileInfo({ published: version(2, 'ready'), options: options() }), ...extra
});
const article = (id, extra = {}) => ({ id, kind: 'knowledge', title: `เรื่อง ${id}`, summary: 'สรุป', content: 'เนื้อหา', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [], status: 'published', version: 1, hubID: 'sales', ownerID: 'me', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z', canEdit: true, ...extra });

const PageHeader = (await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), {})).Component;
const StatusPill = (await serverComponent(new URL('./ui/StatusPill.svelte', import.meta.url), {})).Component;
const Switch = (await serverComponent(new URL('./ui/Switch.svelte', import.meta.url), {})).Component;
const WhoCard = (await serverComponent(new URL('./knowledge/WhoCard.svelte', import.meta.url), { ...k, t: th })).Component;

async function list(props) {
	const rails = [];
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeList.svelte', import.meta.url), {
		...k, term, t: th, localeHref: (value) => value, PageHeader, StatusPill, ScopeChip: noop,
		KnowledgeRail: (_renderer, input) => rails.push(input)
	});
	assert.deepEqual(warnings, []);
	const html = show(Component, { hub: hub('sales'), choices: [hub('sales')], items: [], departments, members, currentUserID: 'me', now: Date.parse('2026-09-28T10:00:00Z'), onchoose: noop, oncreate: noop, onopen: noop, onreload: noop, ...props });
	return { html, rails };
}
const zone = (renderer) => renderer.push('<file-zone></file-zone>');

test('with library v2 the library has three kinds; the file tab has its drop zone, quota and file rows', async () => {
	const items = [
		article('a'),
		fileItem('ready'),
		fileItem('reading', { status: 'draft', title: 'คู่มือพนักงาน', file: fileInfo({ ext: 'docx', fileName: 'คู่มือ.docx', pending: version(1, 'extracting'), options: options() }) }),
		fileItem('failed', { status: 'draft', title: 'สัญญาเช่า', file: fileInfo({ ext: 'docx', pending: version(1, 'unsupported', { errorClass: 'encrypted_or_legacy' }), options: options() }) }),
		fileItem('theirs', { ownerID: 'y', canEdit: false, title: 'รายชื่อตัวแทน', file: fileInfo({ ext: 'csv', published: version(1, 'ready') }) })
	];
	const usage = { bytes: 1, bytesLimit: 2, chars: 1, charsLimit: 2, uploadsToday: 1, uploadsLimit: 50, items: 5, itemsLimit: 1000 };
	const { html, rails } = await list({ items, kind: 'file', features: ON, fileZone: zone, usage });
	assert.match(html, /บทความ(?:<!--[^>]*-->)*<span class="c[^"]*">1<\/span>/, 'articles are บทความ beside ไฟล์');
	assert.match(html, /ไฟล์(?:<!--[^>]*-->)*<span class="c[^"]*">4<\/span>/);
	assert.match(html, /คำสั่งสำเร็จรูป(?:<!--[^>]*-->)*<span class="c[^"]*">0<\/span>/);
	assert.match(html, /<file-zone><\/file-zone>/);
	assert.match(html, /k-button primary kn-add[^>]*>[\s\S]*?เพิ่มไฟล์/);
	assert.match(html, /<b>ราคาสินค้า 2569<\/b><small class="kl-fm[^"]*">Excel · 340 KB<\/small>/);
	assert.match(html, /กำลังอ่าน/);
	assert.match(html, /อ่านไม่ได้: ตั้งรหัสผ่านไว้ หรือเป็น Office รุ่นเก่า/, 'a failed file says why in the list');
	assert.match(html, /ตั้งโดยเจ้าของ/, 'someone else\'s file has its owner\'s audience');
	assert.equal(rails[0].files, true);
	assert.equal(rails[0].usage, usage);
	assert.equal(rails[0].item?.id, 'ready', 'ask about a file the AI can read');
	// The status pills: the failed one with a solid deny dot, the reading one hollow.
	// Status colours only as dots: a neutral pill with a red dot (Codex S7 second confirmation #5).
	assert.match(html, /<span class="kl-s[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill neutral"[^>]*><span class="orca-pill-dot tone-deny"/);
	assert.doesNotMatch(html, /class="kl-s draft[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill neutral"[^>]*><span class="orca-pill-dot tone-deny"/, 'a failed draft is not drawn as a draft');
	assert.doesNotMatch(html, /orca-pill deny/);
	// A read draft says it is ready for the AI once published.
	const drafted = await list({ items: [fileItem('d', { status: 'draft', title: 'แนะนำบริษัท' })], kind: 'file', features: ON, fileZone: zone, usage });
	assert.match(drafted.html, /<small class="kl-fn muted">อ่านเสร็จแล้ว พร้อมให้ AI ใช้เมื่อเผยแพร่<\/small>/);
});

test('without library v2 the library is today\'s: no file kind, no drop zone, "ความรู้"', async () => {
	const { html } = await list({ items: [article('a')], features: OFF, fileZone: zone });
	assert.match(html, /ความรู้(?:<!--[^>]*-->)*<span class="c[^"]*">1<\/span>/);
	assert.doesNotMatch(html, /บทความ|>ไฟล์<|file-zone|เพิ่มไฟล์/);
	assert.match(html, /เพิ่มความรู้/);
	// An older server (no features at all) is the same.
	assert.doesNotMatch((await list({ items: [article('a')], fileZone: zone })).html, /file-zone|>ไฟล์</);
});

test('after the flag went off, files left behind stay listed, without uploads', async () => {
	const { html, rails } = await list({ items: [article('a'), fileItem('f')], kind: 'file', features: OFF, fileZone: zone });
	assert.match(html, /ไฟล์(?:<!--[^>]*-->)*<span class="c[^"]*">1<\/span>/);
	assert.doesNotMatch(html, /file-zone|เพิ่มไฟล์/, 'no upload while it is off');
	assert.match(html, /คลังความรู้แบบไฟล์ของบริษัทปิดอยู่ ไฟล์ที่มีอยู่ยังเปิดดู ดาวน์โหลด และลบได้/);
	assert.match(html, /<b>ราคาสินค้า 2569<\/b>/);
	assert.equal(rails[0].item?.kind, 'knowledge', 'the AI searches articles only: the card asks about one');
});

test('the drop zone: the rules, one button, and each file\'s state or reason', async () => {
	const { warnings, Component } = await serverComponent(new URL('./knowledge/FileDropZone.svelte', import.meta.url), { ...k, t: th });
	assert.deepEqual(warnings, []);
	const idle = show(Component, { onfiles: noop });
	assert.match(idle, /ลากไฟล์มาวางที่นี่/);
	assert.match(idle, /Word, Excel, PowerPoint, CSV, TXT หรือ MD/);
	assert.match(idle, /ไฟล์ละไม่เกิน 20 MB · ครั้งละไม่เกิน 10 ไฟล์/);
	assert.match(idle, /ไฟล์ใหม่เป็นฉบับร่าง เห็นแค่คุณ จนกว่าจะกดเผยแพร่/);
	assert.match(idle, /<input[^>]*type="file"[^>]*multiple/);
	assert.match(idle, /accept="\.docx,\.xlsx,\.pptx,\.csv,\.txt,\.md,\.markdown"/);
	assert.equal(idle.match(/<button/g)?.length, 1, 'one button: เลือกไฟล์');
	const rows = [
		{ key: 'a', name: 'ราคา.xlsx', size: 182_000, state: 'sending', progress: 0.64 },
		{ key: 'b', name: 'ใบสั่งซื้อ.docm', size: 64_000, state: 'refused', progress: 0, reason: 'macro', message: k.refusalText('macro', th) },
		{ key: 'c', name: 'ลูกค้า.csv', size: 41_000, state: 'waiting', progress: 0 }
	];
	const busy = show(Component, { rows, busy: true, onfiles: noop, oncancel: noop, onclear: noop });
	assert.match(busy, /กำลังอัปโหลด 2 ไฟล์/);
	assert.match(busy, /กำลังส่ง 64%/);
	assert.match(busy, /style="width: 64%;?"/);
	assert.match(busy, /ไฟล์นี้มีมาโคร ORCA จึงไม่รับ/);
	assert.match(busy, /รอส่ง/);
	assert.match(busy, />ยกเลิก</);
	assert.doesNotMatch(busy, />ปิด</);
	assert.match(busy, /<button type="button" class="k-button fz-pick"[^>]*disabled/, 'no second upload while one is on its way');
	const done = show(Component, { rows: [{ key: 'a', name: 'ราคา.xlsx', size: 1, state: 'saved', progress: 1, itemID: 'orl-1' }, { key: 'b', name: 'ข.csv', size: 1, state: 'failed', progress: 0 }], problem: 'มีการอัปโหลดอื่นอยู่ ลองอีกครั้งในอีกสักครู่', onfiles: noop, onclear: noop, onretry: noop, onopen: noop });
	assert.match(done, /อัปโหลดแล้ว 1 จาก 2 ไฟล์/);
	assert.match(done, /role="alert"[^>]*>[\s\S]*?มีการอัปโหลดอื่นอยู่[\s\S]*?ลองอีกครั้ง/);
	assert.match(done, /<button type="button" class="fz-name link">ราคา\.xlsx<\/button>/, 'a saved file opens');
	assert.match(done, />ปิด</);
});

async function fileDetail(props) {
	const previews = [];
	const takeovers = [];
	const dialogs = [];
	const rails = [];
	const { warnings, Component } = await serverComponent(new URL('./knowledge/FileDetail.svelte', import.meta.url), {
		...k, term, t: th, onDestroy: noop, getHttpStatusCode: noop, isAbortError: () => false, parseErrorContent: noop, orcaError: () => '',
		OrcaLibraryService: { downloadHref: (hub, item, which) => `/api/orca/hubs/${hub}/library/files/${item}/download?version=${which}` },
		StatusPill, Switch, WhoCard,
		ConfirmDialog: (_renderer, input) => dialogs.push(input),
		FilePreview: (renderer, input) => {
			previews.push(input);
			renderer.push('<file-preview></file-preview>');
		},
		KnowledgeRail: (_renderer, input) => rails.push(input),
		TakeoverCard: (renderer, input) => {
			takeovers.push(input);
			renderer.push('<takeover-card></takeover-card>');
		}
	});
	assert.deepEqual(warnings, []);
	const html = show(Component, { hub: hub('sales'), members, departments, currentUserID: 'me', features: ON, now: Date.parse('2026-09-28T10:00:00Z'), onback: noop, onedit: noop, onchanged: noop, onarchived: noop, ondeleted: noop, ondenied: noop, ...props });
	return { html, previews, takeovers, dialogs, rails };
}

test('a file\'s owner sees what the AI sees, its hidden parts with switches, and every action', async () => {
	const item = fileItem('f', { audienceMode: 'everyone_live', file: fileInfo({ published: version(2, 'ready', { stats: { chars: 61_420, sheets: 3, rows: 1240, hidden: hiddenParts({ hiddenSheets: 1, comments: 4, trackedChanges: 2 }) } }), options: options() }) });
	const { html, previews, dialogs, rails, takeovers } = await fileDetail({ item });
	assert.match(html, /<h1[^>]*>ราคาสินค้า 2569<\/h1>/);
	assert.match(html, /AI ใช้ได้/);
	assert.match(html, /ไฟล์ Excel/);
	assert.equal(previews.length, 1);
	assert.deepEqual([previews[0].which, previews[0].version.version, previews[0].itemID, previews[0].hubID], ['published', 2, 'f', 'sales']);
	assert.match(html, /ไฟล์นี้มีแผ่นงานที่ซ่อนไว้ 1 แผ่น ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด/);
	assert.match(html, /ไฟล์นี้มีความคิดเห็น 4 รายการ ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด/);
	assert.match(html, /การแก้ไขที่ติดตามไว้ 2 จุด/);
	assert.match(html, /role="switch"[^>]*aria-checked="false"[^>]*aria-labelledby="[^"]+"/);
	assert.match(html, /ให้ AI เห็นส่วนที่ซ่อนไว้/);
	assert.match(html, /ให้ AI เห็นความคิดเห็น/);
	assert.doesNotMatch(html, /ให้ AI เห็นโน้ตผู้บรรยาย/, 'no notes in a workbook: no switch for them');
	assert.match(html, /เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ AI ใช้ฉบับเดิมจนกว่าจะอ่านเสร็จ/);
	assert.match(html, /ห้ามดาวน์โหลดต้นฉบับ/);
	assert.match(html, /กันได้แค่ไฟล์ต้นฉบับ คนที่เห็นเนื้อหาผ่าน AI ยังคัดลอกข้อความได้/);
	assert.match(html, /ต้องตรวจก่อนอัปเดต/);
	// The download is a plain same-origin link: no new tab, nothing automatic.
	assert.match(html, /<a class="k-button" href="\/api\/orca\/hubs\/sales\/library\/files\/f\/download\?version=published" download="">/);
	assert.doesNotMatch(html, /target="_blank"/);
	assert.match(html, /อัปโหลดฉบับใหม่/);
	assert.match(html, /อ่านไฟล์ใหม่<\/button>/);
	assert.match(html, />จัดเก็บ</);
	assert.match(html, />ลบ</);
	assert.match(html, /Excel · 340 KB · ฉบับที่ 2/);
	assert.match(html, /3 แผ่นงาน · 1,240 แถว · 61,420 ตัวอักษร/);
	// "ใครใช้ได้" for a live audience.
	assert.match(html, /ทุกคนในพื้นที่ทำงานนี้(?:<!--[^>]*-->)*<small>อัปเดตอัตโนมัติ<\/small>/);
	assert.match(html, /AI ของ <b>3 คน<\/b>ใช้ได้ตอนนี้/);
	const remove = dialogs.find((dialog) => dialog.confirmLabel === 'ลบไฟล์');
	assert.match(remove.title, /ลบ “ราคาสินค้า 2569”\?/);
	assert.match(remove.message, /AI ของทุกคนจะหยุดเห็นไฟล์นี้ทันที[\s\S]*ย้อนกลับไม่ได้/);
	assert.equal(remove.confirmLabel, 'ลบไฟล์');
	assert.equal(rails[0].ask, true);
	assert.equal(takeovers.length, 0, 'one\'s own file needs no takeover');
});

test('the switches say what the version that serves still holds while the new one is read', async () => {
	const item = fileItem('d', {
		status: 'draft',
		file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { stats: { chars: 1, slides: 18, hidden: hiddenParts({ notesSlides: 12 }) } }), pending: version(2, 'queued', { options: { includeHidden: false, includeComments: false, includeNotes: true } }), options: options({ includeNotes: true }) })
	});
	const { html } = await fileDetail({ item });
	// A draft serves no one: nothing about what "the AI keeps using".
	assert.match(html, /กำลังอ่านฉบับใหม่ \(ฉบับที่ 2\) ด้านล่างยังเป็นฉบับเดิมจนกว่าจะอ่านเสร็จ/);
	assert.match(html, /เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ตามที่เลือก/);
	assert.doesNotMatch(html, /AI ใช้ฉบับเดิม/);
	assert.match(html, /ไฟล์นี้มีโน้ตผู้บรรยาย 12 สไลด์ ORCA กำลังอ่านใหม่ให้ AI เห็น/);
	assert.match(html, /role="switch"[^>]*aria-checked="true"/);
	assert.match(html, /ตั้งค่าและเผยแพร่/, 'a read draft is set up and published from the editor');
	assert.doesNotMatch(html, /อ่านไฟล์ใหม่<\/button>/, 'a version is on its way: no second reading');
	// Published, the AI keeps the version that serves until the new one is read.
	const published = await fileDetail({ item: { ...item, status: 'published' } });
	assert.match(published.html, /กำลังอ่านฉบับใหม่ \(ฉบับที่ 2\) AI ใช้ฉบับเดิมจนกว่าจะอ่านเสร็จ/);
	assert.match(published.html, /เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ AI ใช้ฉบับเดิมจนกว่าจะอ่านเสร็จ/);
	const failedDraft = await fileDetail({ item: { ...item, file: { ...item.file, pending: version(2, 'failed', { errorClass: 'timeout' }) } } });
	assert.match(failedDraft.html, /ฉบับใหม่ \(ฉบับที่ 2\) อ่านไม่ได้: อ่านนานเกินเวลาที่กำหนด ลองกด อ่านไฟล์ใหม่ ไฟล์นี้ยังเป็นฉบับเดิม/);
});

test('a file still being read, or that did not read, says so and what to do', async () => {
	const reading = await fileDetail({ item: fileItem('r', { status: 'draft', file: fileInfo({ ext: 'docx', pending: version(1, 'extracting'), options: options() }) }) });
	assert.match(reading.html, /กำลังอ่านไฟล์/);
	assert.match(reading.html, /หน้านี้อัปเดตเอง/);
	assert.equal(reading.previews.length, 0, 'nothing to show the AI yet');
	assert.match(reading.html, />(?:<!--[^>]*-->)*แก้ไข</, 'a draft not yet read is edited, published later');
	assert.doesNotMatch(reading.html, /ตั้งค่าและเผยแพร่/);
	const failed = await fileDetail({ item: fileItem('x', { status: 'draft', file: fileInfo({ ext: 'docx', pending: version(1, 'unsupported', { errorClass: 'encrypted_or_legacy' }), options: options() }) }) });
	assert.match(failed.html, /อ่านไฟล์นี้ไม่ได้/);
	assert.match(failed.html, /ไฟล์นี้ตั้งรหัสผ่านไว้ หรือเป็นไฟล์ Office รุ่นเก่า/);
	assert.doesNotMatch(failed.html, /อ่านไฟล์ใหม่<\/button>/, 'reading it again can\'t help');
	assert.equal(failed.html.match(/อัปโหลดฉบับใหม่/g)?.length, 1, 'one way to upload a new version');
	assert.match(failed.html, /<span class="kd-status(?! draft)[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill neutral"[^>]*><span class="orca-pill-dot tone-deny"/, 'a solid red dot on a neutral pill');
	const transient = await fileDetail({ item: fileItem('t', { status: 'draft', file: fileInfo({ ext: 'docx', pending: version(1, 'failed', { errorClass: 'timeout' }), options: options() }) }) });
	assert.match(transient.html, /อ่านนานเกินเวลาที่กำหนด/);
	assert.match(transient.html, /อ่านไฟล์ใหม่<\/button>/, 'a time-out may pass');
});

test('a newer version held for review: both versions, and "ใช้ฉบับใหม่"', async () => {
	const item = fileItem('p', { file: fileInfo({ ext: 'docx', published: version(1, 'ready'), pending: version(2, 'ready'), options: options({ reviewBeforeUpdate: true }) }) });
	const { html, previews } = await fileDetail({ item });
	assert.match(html, /ฉบับใหม่ \(ฉบับที่ 2\) อ่านเสร็จแล้ว รอคุณตรวจก่อนให้ AI ใช้/);
	assert.match(html, />ดูฉบับใหม่</);
	assert.match(html, />ใช้ฉบับใหม่</);
	assert.match(html, /role="tab" aria-selected="true"[^>]*>ฉบับที่ใช้อยู่ · ฉบับที่ 1</);
	assert.match(html, /role="tab" aria-selected="false"[^>]*>ฉบับใหม่ · ฉบับที่ 2</);
	assert.deepEqual([previews[0].which, previews[0].version.version], ['published', 1], 'the version in use first');
	assert.match(html, /role="switch"[^>]*aria-checked="true"/, 'ต้องตรวจก่อนอัปเดต is on');
});

test('someone else\'s file: what the AI sees, the download only if allowed, and no owner tools', async () => {
	const theirs = (allow) => fileItem('o', { ownerID: 'y', canEdit: false, audienceMode: undefined, file: fileInfo({ ext: 'csv', allowDownload: allow, published: version(1, 'ready', { stats: { chars: 1, rows: 412, encoding: 'windows-874', hidden: hiddenParts({ comments: 3 }) } }) }) });
	const allowed = await fileDetail({ item: theirs(true) });
	assert.match(allowed.html, /download\?version=published" download/);
	assert.equal(allowed.previews.length, 1);
	assert.doesNotMatch(allowed.html, /role="switch"|อัปโหลดฉบับใหม่|อ่านไฟล์ใหม่|>ลบ<|>จัดเก็บ<|ตั้งค่าไฟล์|ส่วนที่ซ่อนอยู่|Windows-874/, 'the owner\'s alone');
	assert.match(allowed.html, /เจ้าของไฟล์เป็นคนเลือกว่าใครใช้ได้/);
	assert.match(allowed.html, /เจ้าของ มาลี สมมุติ/);
	const refused = await fileDetail({ item: theirs(false) });
	assert.doesNotMatch(refused.html, /download\?version/);
	assert.match(refused.html, /เจ้าของไฟล์ไม่เปิดให้ดาวน์โหลดต้นฉบับ/);
});

test('a manager may take over a file whose owner left; nobody else is offered it', async () => {
	const departed = fileItem('c', { ownerID: 'gone', canEdit: false, audienceMode: undefined });
	const manager = await fileDetail({ item: departed, canManage: true });
	assert.equal(manager.takeovers.length, 1);
	assert.equal(manager.takeovers[0].item.id, 'c');
	assert.equal((await fileDetail({ item: departed, canManage: false })).takeovers.length, 0, 'an employee is not');
	assert.equal((await fileDetail({ item: { ...departed, ownerID: 'x' }, canManage: true })).takeovers.length, 0, 'the owner is still here');
	assert.equal((await fileDetail({ item: departed, canManage: true, features: OFF })).takeovers.length, 0, 'the route needs library v2');
});

test('after the flag went off, the owner still sees, downloads, archives and deletes a file, nothing else', async () => {
	const item = fileItem('f', { audienceMode: 'everyone_live', file: fileInfo({ published: version(2, 'ready', { stats: { chars: 1, hidden: hiddenParts({ comments: 4 }) } }), options: options() }) });
	const { html, previews, rails } = await fileDetail({ item, features: OFF });
	assert.equal(previews.length, 1);
	assert.match(html, /download\?version=published/);
	assert.match(html, />จัดเก็บ</);
	assert.match(html, />ลบ</);
	assert.doesNotMatch(html, /role="switch"|อัปโหลดฉบับใหม่|อ่านไฟล์ใหม่|ตั้งค่าไฟล์|ส่วนที่ซ่อนอยู่ในไฟล์/, 'what needs library v2 is not offered');
	// The AI uses no file while it is off: never "AI ใช้ได้", and nothing to ask it.
	assert.doesNotMatch(html, /AI ใช้ได้|ใช้ได้ตอนนี้/);
	assert.match(html, /<span class="orca-pill neutral[^"]*"[^>]*>(?:<[^>]+>)*เผยแพร่แล้ว/);
	assert.match(html, /คลังความรู้แบบไฟล์ปิดอยู่ เปิดอีกครั้งแล้ว AI ของ 3 คนจะใช้ได้/);
	assert.equal(rails[0].ask, false);
});

test('after the flag went off, the file list says เผยแพร่แล้ว, not AI ใช้ได้, and the legend says why', async () => {
	const items = [article('a'), fileItem('f'), fileItem('p', { title: 'นโยบาย', file: fileInfo({ ext: 'docx', published: version(1, 'ready'), pending: version(2, 'ready'), options: options({ reviewBeforeUpdate: true }) }) })];
	const { html, rails } = await list({ items, kind: 'file', features: OFF, fileZone: zone });
	assert.match(html, /<i class="dt plain"[^>]*><\/i>เผยแพร่แล้ว <b>2<\/b>/, 'the strip counts published files, with a grey dot');
	assert.match(html, /aria-pressed="false"[^>]*>เผยแพร่แล้ว<\/button>/, 'the chip too');
	assert.doesNotMatch(html, /AI ใช้ได้/);
	assert.doesNotMatch(html, /ฉบับใหม่รอคุณกดใช้/, 'nothing to put in use while it is off');
	assert.equal(rails[0].paused, 'files');
	// With the flag the same rows are "AI ใช้ได้".
	const on = await list({ items, kind: 'file', features: ON, fileZone: zone });
	assert.match(on.html, /AI ใช้ได้/);
	assert.match(on.html, /ฉบับใหม่รอคุณกดใช้/);
	assert.equal(on.rails[0].paused, undefined);
});

test('an owner who left is not called a workspace member; the takeover card names the kind', async () => {
	const departed = fileItem('c', { ownerID: 'gone', canEdit: false, audienceMode: undefined });
	const { html } = await fileDetail({ item: departed, canManage: true });
	assert.match(html, /เจ้าของ ไม่อยู่ในพื้นที่ทำงานนี้แล้ว/);
	assert.doesNotMatch(html, /สมาชิกพื้นที่ทำงาน/);
	const dialogs = [];
	const { warnings, Component } = await serverComponent(new URL('./knowledge/TakeoverCard.svelte', import.meta.url), { ...k, t: th, orcaError: () => '', getHttpStatusCode: noop, parseErrorContent: noop, OrcaLibraryService: {}, ConfirmDialog: (_renderer, input) => dialogs.push(input) });
	assert.deepEqual(warnings, []);
	const card = show(Component, { hubID: 'sales', item: departed, ontaken: noop, ondenied: noop });
	assert.match(card, /เจ้าของไฟล์นี้ไม่อยู่แล้ว/);
	assert.match(card, /ไม่มีใครแก้ไขไฟล์นี้ได้ จนกว่าเจ้าของบริษัทหรือผู้ดูแลจะรับช่วงดูแล/);
	assert.match(dialogs[0].message, /^คุณจะเป็นเจ้าของไฟล์นี้ แก้ไข เผยแพร่ และลบได้/);
	assert.match(show(Component, { hubID: 'sales', item: article('a', { ownerID: 'gone', canEdit: false }), ontaken: noop, ondenied: noop }), /เจ้าของเรื่องนี้ไม่อยู่แล้ว/);
});

test('"ใครใช้ได้" of an article: live, a list, or its author\'s choice', async () => {
	const who = (item) => show(WhoCard, { hub: hub('sales'), item, members, departments, currentUserID: 'me' });
	const live = who(article('a', { audienceMode: 'everyone_live' }));
	assert.match(live, /ทุกคนในพื้นที่ทำงานนี้(?:<!--[^>]*-->)*<small>อัปเดตอัตโนมัติ<\/small>/);
	assert.match(live, /AI ของ <b>3 คน<\/b>ใช้ได้ตอนนี้/);
	assert.doesNotMatch(live, /เฉพาะคุณ/);
	const listed = who(article('b', { unitIDs: ['dept'], memberIDs: ['x'] }));
	assert.match(listed, /ฝ่ายขาย(?:<!--[^>]*-->)*<small>1 คน<\/small>/);
	assert.match(listed, /ธนา ทดสอบ/);
	assert.match(who(article('c')), /เฉพาะคุณ/);
	assert.match(who(article('d', { canEdit: false, ownerID: 'y' })), /ผู้เขียนเป็นคนเลือกว่าใครใช้ได้/);
});

test('"ทุกคน (อัปเดตอัตโนมัติ)" sits first beside today\'s choices, with library v2 or on a live item', async () => {
	const { warnings, Component } = await serverComponent(new URL('./knowledge/AudienceCard.svelte', import.meta.url), { ...k, t: th, untrack: (fn) => fn(), memberRole: () => 'พนักงาน', PersonPicker: noop });
	assert.deepEqual(warnings, []);
	const everyone = k.workspaceEveryone(hub('sales'), departments, members.map((m) => m.id), 'me');
	const props = { kind: 'file', everyone, departments, members, me: 'me', unitIDs: [], memberIDs: [] };
	const offered = show(Component, { ...props, live: true, mode: 'everyone_live' });
	const titles = [...offered.matchAll(/<span class="opt-b[^"]*"><b>([^<]+)<\/b>/g)].map((match) => match[1]);
	assert.deepEqual(titles, ['ทุกคน (อัปเดตอัตโนมัติ)', 'ทุกคนในพื้นที่ทำงานนี้', 'เฉพาะแผนก', 'เฉพาะบางคน', 'เฉพาะฉัน']);
	assert.match(offered, /รวมคนที่เข้ามาในพื้นที่นี้ทีหลังด้วย/);
	assert.match(offered, /AI ของ <b[^>]*>3 คน<\/b>จะใช้ไฟล์นี้ได้/, 'everyone in the workspace now');
	assert.match(offered, /เลือกว่า AI ของใครจะตอบจากไฟล์นี้ได้/);
	assert.doesNotMatch(show(Component, { ...props, kind: 'knowledge', mode: 'everyone' }), /อัปเดตอัตโนมัติ/, 'without library v2: today\'s four choices');
	assert.match(show(Component, { ...props, kind: 'knowledge', live: true, mode: 'everyone' }), /เลือกว่า AI ของใครจะตอบจากบทความนี้ได้[\s\S]*จะใช้บทความนี้ได้/, 'with library v2 an article is บทความ');
	assert.match(show(Component, { ...props, kind: 'knowledge', mode: 'everyone' }), /เลือกว่า AI ของใครจะตอบจากความรู้นี้ได้[\s\S]*จะใช้ความรู้นี้ได้/, 'without it, today\'s words');
	assert.match(show(Component, { ...props, kind: 'knowledge', mode: 'everyone_live' }), /ทุกคน \(อัปเดตอัตโนมัติ\)/, 'a live item keeps showing its choice');
});

test('a file is edited in the editor: its title, its file, who can use it; published once read', async () => {
	const cards = [];
	const { warnings, Component } = await serverComponent(new URL('./LibraryEditor.svelte', import.meta.url), {
		...k, t: th, untrack: (fn) => fn(), onDestroy: noop, parseErrorContent: noop, orcaError: noop, OrcaLibraryService: {},
		AudienceCard: (renderer, input) => {
			cards.push(input);
			input.actions?.(renderer);
		},
		TemplateBody: noop, ArticlePicker: noop, ConfirmDialog: noop, FormErrorSummary: noop
	});
	assert.deepEqual(warnings, []);
	const props = { hub: hub('sales'), items: [], members, departments, currentUserID: 'me', onsaved: noop, onclose: noop, ondenied: noop, ondirty: noop, features: ON };
	const fresh = fileItem('f', { status: 'draft', version: 1, file: fileInfo({ ext: 'pptx', fileName: 'แนะนำบริษัท.pptx', bytes: 4.2 * 1024 * 1024, published: version(1, 'ready', { stats: { chars: 9840, slides: 18, hidden: hiddenParts() } }), options: options() }) });
	const html = show(Component, { ...props, kind: 'file', existing: fresh });
	assert.match(html, /<h1[^>]*>แก้ไขไฟล์<\/h1>/);
	assert.match(html, /<b>แนะนำบริษัท\.pptx<\/b>/);
	assert.match(html, /PowerPoint · 4\.2 MB · พร้อมใช้ · 18 สไลด์ · 9,840 ตัวอักษร/);
	assert.doesNotMatch(html, /<textarea id="kn-content"|40,000 ตัวอักษร/, 'a file has no text of its own to type');
	assert.equal(cards.at(-1).mode, 'everyone_live', 'a file just uploaded starts like a new article: everyone, live');
	assert.equal(cards.at(-1).live, true);
	assert.match(html, /<button type="button" class="k-button primary ed-publish"(?![^>]*disabled)/, 'a read file can be published');
	const saved = show(Component, { ...props, kind: 'file', existing: { ...fresh, version: 2 } });
	assert.ok(saved);
	assert.equal(cards.at(-1).mode, 'me', 'once saved, its own choice');
	const reading = show(Component, { ...props, kind: 'file', existing: fileItem('r', { status: 'draft', file: fileInfo({ pending: version(1, 'extracting'), options: options() }) }) });
	assert.match(reading, /ORCA กำลังอ่านไฟล์นี้ บันทึกร่างได้เลย และเผยแพร่ได้เมื่ออ่านเสร็จ/);
	assert.match(reading, /<button type="button" class="k-button primary ed-publish"[^>]*disabled/, 'not published before it is read');
	// A new article with library v2 reaches everyone, live; without it, today's choice.
	show(Component, { ...props, kind: 'knowledge' });
	assert.equal(cards.at(-1).mode, 'everyone_live');
	show(Component, { ...props, kind: 'knowledge', features: OFF });
	assert.equal(cards.at(-1).mode, 'everyone');
	assert.equal(cards.at(-1).live, false);
	// Beside ไฟล์ an article is บทความ; without library v2 it stays ความรู้.
	assert.match(show(Component, { ...props, kind: 'knowledge' }), /<h1[^>]*>เพิ่มบทความ<\/h1>/);
	assert.match(show(Component, { ...props, kind: 'knowledge', existing: article('a') }), /<h1[^>]*>แก้ไขบทความ<\/h1>/);
	assert.match(show(Component, { ...props, kind: 'knowledge', features: OFF }), /<h1[^>]*>เพิ่มความรู้<\/h1>/);
	// The mode goes only to a server that knows it.
	const editor = await readFile(new URL('./LibraryEditor.svelte', import.meta.url), 'utf8');
	assert.match(editor, /if \(features\.audienceModes\) input\.audienceMode = audienceWireMode\(mode\);/);
	assert.match(editor, /content: fileItem \? '' : stored\.content/);
});

test('an article\'s detail: a manager takes over a departed author\'s item, with library v2 only', async () => {
	const takeovers = [];
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeDetail.svelte', import.meta.url), {
		...k, term, t: th, tick: async () => {}, StatusPill, ConfirmDialog: noop, WhoCard,
		orcaError: () => '', OrcaLibraryService: {}, getHttpStatusCode: noop, parseErrorContent: noop, KnowledgeRail: noop,
		TakeoverCard: (renderer, input) => {
			takeovers.push(input);
			renderer.push('<takeover-card></takeover-card>');
		}
	});
	assert.deepEqual(warnings, []);
	const departed = article('a', { ownerID: 'gone', canEdit: false });
	const props = { hub: hub('sales'), items: [departed], members, departments, currentUserID: 'me', onback: noop, onedit: noop, onarchived: noop, ondenied: noop };
	assert.match(show(Component, { ...props, item: departed, canManage: true, features: ON, onchanged: noop }), /<takeover-card>/);
	assert.doesNotMatch(show(Component, { ...props, item: departed, canManage: true, features: OFF, onchanged: noop }), /<takeover-card>/);
	assert.doesNotMatch(show(Component, { ...props, item: departed, canManage: false, features: ON, onchanged: noop }), /<takeover-card>/);
	// Archiving keeps a live audience live: the mode goes with the save.
	const detail = await readFile(new URL('./knowledge/KnowledgeDetail.svelte', import.meta.url), 'utf8');
	assert.match(detail, /OrcaLibraryService\.save\(hub\.id, libraryInput\(item, \{ status: 'archived' \}, features\), item\.id\)/);
});

test('the page shows files only with library v2, sends uploads in batches, and asks again while its files are read', async () => {
	const page = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.match(page, /const features = \$derived\(libraryFeatures\(data\)\);/);
	assert.match(page, /fileZone=\{features\.files \? fileZone : undefined\}/, 'no drop zone without library v2');
	assert.match(page, /if \(!hub \|\| uploading \|\| !features\.files\) return;/, 'nothing is sent without it');
	assert.match(page, /for \(const batch of uploadBatches\(sizes\)\)/);
	assert.match(page, /if \(disposed \|\| !hub \|\| !features\.files \|\| !readingFileIDs\(items\)\.length \|\| pollRound > 60\)/, 'it stops asking once nothing is read, or once the page is gone');
	assert.match(page, /onDestroy\(\(\) => \{\s*disposed = true;\s*requestNumber \+= 1;\s*readingRequest \+= 1;\s*stopPolling\(\);\s*cancelUpload\(\);/, 'leaving stops both, and no answer that comes back after it asks again');
	assert.match(page, /if \(request !== requestNumber \|\| disposed\) return;/);
	assert.match(page, /if \(leaving \|\| !\(dirty \|\| uploading \|\| replacing\)\) return;/, 'leaving mid-upload, or mid new version, asks first');
	assert.match(page, /onuploading=\{\(busy\) => \(replacing = busy\)\}/);
	// A background ask that fails keeps what is shown and asks again; with unsaved text only the reading comes in.
	assert.match(page, /if \(quiet && !denied\) \{\s*schedulePoll\(\);\s*return;\s*\}/);
	assert.match(page, /if \(dirty\) void refreshReading\(id\);\s*else void load\(id, true\);/);
	assert.match(page, /items = withReading\(items, result\.items, editing\);/);
	// What an answer leaves out stays: a save's file block, a takeover's text.
	assert.match(page, /const \{ item, reload \} = settleAnswer\(answer, items\.find\(\(known\) => known\.id === answer\.id\)\);\s*if \(reload\) void load\(hub\.id\);/);
	assert.equal(page.match(/const item = settled\(answer\);\s*if \(!item\) return;/g)?.length, 3, 'saved, archived and changed');
	// A batch sent in full whose answer did not come is not sent again: the list is asked.
	assert.match(page, /const failure = uploadFailure\(\{ sent, aborted, network: cause instanceof TypeError, status: problem\.status, message: problem\.message \}\);/);
	assert.match(page, /if \(failure\.outcome === 'unknown'\) \{\s*for \(const key of batchKeys\) setRow\(key, \{ state: 'unknown', progress: 1 \}\);/);
	// Every item save that sends an item it has goes through libraryInput or the editor.
	const detail = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	assert.match(detail, /libraryInput\(item, \{ status: 'archived' \}, features\)/);
});

test('a history record says what the AI received, which file version, and why a file did not read', async () => {
	const audit = await importTypeScript(new URL('../../orca/audit-details.ts', import.meta.url));
	const { warnings, Component } = await serverComponent(new URL('./AuditDetails.svelte', import.meta.url), { ...audit, t: th, orcaLocale: { value: 'th' }, displayDate: (value) => value });
	assert.deepEqual(warnings, []);
	const searched = show(Component, {
		event: {
			id: 'e1', action: 'library.call', toolName: 'search_knowledge', hubID: 'sales', outcome: 'success',
			libraryRefs: [
				{ itemID: 'orl-1', kind: 'file', title: 'ราคาสินค้า 2569', version: 2 },
				{ itemID: 'orl-2', kind: 'article', title: '', version: 1 },
				{ itemID: 'orl-3', kind: 'file', title: 'ข้อมูลที่ผิดรูป', version: 0 }
			]
		}
	});
	assert.match(searched, /<h3 id="audit-refs-e1">AI ได้เห็น<\/h3>/);
	assert.match(searched, /<span class="audit-ref-title">ราคาสินค้า 2569<\/span> <small>ไฟล์ · ฉบับที่ 2<\/small>/);
	assert.match(searched, /<span class="audit-ref-title">รายการที่คุณเปิดไม่ได้<\/span> <small>บทความ · ฉบับที่ 1<\/small>/, 'a title the viewer may not read stays hidden');
	assert.doesNotMatch(searched, /ข้อมูลที่ผิดรูป/, 'a malformed reference is dropped');
	assert.match(searched, /ORCA บันทึกรายการและฉบับที่ส่งให้ AI แต่ไม่เก็บข้อความนั้น/);
	const failed = show(Component, { event: { id: 'e2', action: 'library.file.failed', hubID: 'sales', resourceID: 'orl-1', outcome: 'error', errorCategory: 'file_encrypted', version: 3 } });
	assert.doesNotMatch(failed, /AI ได้เห็น/);
	assert.match(failed, /<dt>สาเหตุ<\/dt> <dd>ไฟล์ตั้งรหัสผ่านไว้ หรือเป็นไฟล์ Office รุ่นเก่า<\/dd>/);
	assert.match(failed, /<dt>ฉบับของไฟล์<\/dt> <dd>ฉบับที่ 3<\/dd>/);
});

test('every knowledge library v2 event the server records has a Thai name in the histories', async () => {
	const source = await readFile(new URL('./Audit.svelte', import.meta.url), 'utf8');
	const actions = ['library.file.upload', 'library.file.replace', 'library.file.ready', 'library.file.partial', 'library.file.failed', 'library.file.publish', 'library.file.options', 'library.file.reextract', 'library.file.download', 'library.audience.live', 'library.audience.list', 'library.delete', 'library.purged', 'library.takeover', 'library.v2', 'platform.company.library_v2'];
	for (const action of actions) assert.match(source, new RegExp(`"${action.replaceAll('.', '\\.')}": t\\("[^"]+"`), action);
	// The switch's events say which way it went.
	assert.match(source, /event\.action === "library\.v2"\)\s*return event\.version === 1 \? t\("ทีม ORCA เปิดคลังความรู้แบบไฟล์"/);
	assert.match(source, /event\.action === "platform\.company\.library_v2"\)\s*return event\.version === 1 \? t\("เปิดคลังความรู้แบบไฟล์ให้บริษัทลูกค้า"/);
	// The history keeps no title: a knowledge item is named by its kind, its code only in the title attribute.
	assert.match(source, /startsWith\("library\.file\."\)\)\s*return \{ label: t\("ไฟล์ในคลังความรู้", "A file in Knowledge"\), id \};/);
	assert.match(source, /startsWith\("library\."\)\)\s*return \{ label: t\("รายการในคลังความรู้", "A Knowledge item"\), id \};/);
	const details = await readFile(new URL('./AuditDetails.svelte', import.meta.url), 'utf8');
	for (const category of ['file_too_large', 'file_unsupported', 'file_hostile', 'file_encrypted', 'extract_timeout', 'extract_memory', 'extract_failed', 'storage_error']) assert.match(details, new RegExp(`${category}: t\\("`), category);
});

test('"ดูต่อ" after the owner published a newer version starts that version once, then goes on in it (Codex S7 #6)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/FilePreview.svelte', '{ load, get chunks() { return chunks; }, get next() { return next; } }');
	const v = (n) => ({ version: n, state: 'ready', fileName: 'ราคา.xlsx', bytes: 1, createdAt: '', options: { includeHidden: false, includeComments: false, includeNotes: false } });
	const page = (n, cursor, next) => ({ item: { id: 'f', version: n + 10, file: { published: v(n) } }, which: 'published', version: v(n), preview: [{ text: `ฉบับ ${n} ${cursor || 'หน้าแรก'}` }], totalChars: 100, nextCursor: next });
	const calls = [];
	const answers = [page(1, '', 'c1'), 'changed', page(2, '', 'c2'), page(2, 'c2', '')];
	const items = [];
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hubID: 'sales', itemID: 'f', which: 'published', version: v(1), onitem: (item) => items.push(item) },
			{
				OrcaLibraryService: {
					file: async (...args) => {
						calls.push(args[3]);
						const answer = answers.shift();
						if (answer === 'changed') throw Object.assign(new Error('version_changed: the file changed'), { status: 409 });
						return answer;
					}
				},
				untrack: client.untrack, onDestroy: () => {}, t: (th) => th, locatorLabel: () => '', fileActionProblem: () => undefined,
				getHttpStatusCode: (error) => error.status, parseErrorContent: (error) => ({ status: error.status, message: error.message }), orcaError: (error) => error.message
			}
		);
	});
	t.after(stop);
	client.flush();
	for (let i = 0; i < 5 && view.next !== 'c1'; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.equal(view.next, 'c1', 'the first page of version 1');
	await view.load(view.next);
	for (let i = 0; i < 5 && view.next !== 'c2'; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(items.map((item) => item.version), [12], 'the page takes the server\'s item of version 2, once');
	assert.equal(view.next, 'c2');
	await view.load(view.next);
	assert.deepEqual(calls, ['', 'c1', '', 'c2'], 'version 2\'s next page is read, not started again');
	assert.deepEqual(view.chunks.map((chunk) => chunk.text), ['ฉบับ 2 หน้าแรก', 'ฉบับ 2 c2']);
	assert.equal(items.length, 1);
});

test('while file Knowledge is off a file is not edited, published or restored; "AI ใช้ได้" only in an active workspace (Codex S7 #4, #11)', async () => {
	const item = fileItem('f', { file: fileInfo({ published: version(2, 'ready'), options: options() }) });
	const off = await fileDetail({ item, features: OFF });
	assert.doesNotMatch(off.html, /แก้ไข<\/button>|ตั้งค่าและเผยแพร่|แก้ไขและนำกลับมาใช้/, 'no editor while it is off');
	const archived = await fileDetail({ item: { ...item, status: 'archived' }, features: OFF });
	assert.doesNotMatch(archived.html, /แก้ไขและนำกลับมาใช้/);
	assert.match(archived.html, />ลบ</);
	assert.match((await fileDetail({ item })).html, /แก้ไข<\/button>/, 'with it, the owner edits');
	// A workspace not active yet: published, not "AI ใช้ได้", in the file's page and an article's.
	const paused = await fileDetail({ item, hub: hub('sales', { status: 'paused' }) });
	assert.match(paused.html, /<span class="orca-pill neutral[^"]*"[^>]*>(?:<[^>]+>)*เผยแพร่แล้ว/);
	assert.doesNotMatch(paused.html, /AI ใช้ได้/);
	// Nor what "the AI keeps using" while a new version is read (Codex S7 confirmation #5).
	const reading = await fileDetail({ item: { ...item, file: fileInfo({ published: version(2, 'ready', { stats: { chars: 1, hidden: hiddenParts({ comments: 2 }) } }), pending: version(3, 'extracting'), options: options() }) }, hub: hub('sales', { status: 'paused' }) });
	assert.match(reading.html, /กำลังอ่านฉบับใหม่ \(ฉบับที่ 3\) ด้านล่างยังเป็นฉบับเดิมจนกว่าจะอ่านเสร็จ/);
	assert.match(reading.html, /เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ตามที่เลือก/);
	assert.doesNotMatch(reading.html, /AI ใช้ฉบับเดิม|AI ยังใช้ฉบับเดิม/);
	const { Component } = await serverComponent(new URL('./knowledge/KnowledgeDetail.svelte', import.meta.url), {
		...k, term, t: th, tick: async () => {}, StatusPill, ConfirmDialog: noop, WhoCard, TakeoverCard: noop,
		orcaError: () => '', OrcaLibraryService: {}, getHttpStatusCode: noop, parseErrorContent: noop, KnowledgeRail: noop
	});
	const props = { items: [], members, departments, currentUserID: 'me', onback: noop, onedit: noop, onarchived: noop, ondenied: noop, onchanged: noop, features: ON };
	assert.match(show(Component, { ...props, hub: hub('sales', { status: 'draft' }), item: article('a') }), /<span class="orca-pill neutral[^"]*"[^>]*>(?:<[^>]+>)*เผยแพร่แล้ว/);
	assert.match(show(Component, { ...props, hub: hub('sales'), item: article('a') }), /AI ใช้ได้/);
	// The editor saves no file while it is off, even opened before.
	const { Component: Editor } = await serverComponent(new URL('./LibraryEditor.svelte', import.meta.url), {
		...k, t: th, untrack: (fn) => fn(), onDestroy: noop, parseErrorContent: noop, orcaError: noop, OrcaLibraryService: {},
		AudienceCard: (renderer, input) => input.actions?.(renderer), TemplateBody: noop, ArticlePicker: noop, ConfirmDialog: noop, FormErrorSummary: noop
	});
	const editor = show(Editor, { hub: hub('sales'), items: [], members, departments, currentUserID: 'me', onsaved: noop, onclose: noop, ondenied: noop, ondirty: noop, features: OFF, kind: 'file', existing: item });
	assert.match(editor, /คลังความรู้แบบไฟล์ของบริษัทปิดอยู่ จึงบันทึกไฟล์นี้ไม่ได้ตอนนี้/);
	assert.match(editor, /<button type="button" class="k-button ed-draft"[^>]*disabled/);
	assert.match(editor, /<button type="button" class="k-button primary ed-publish"[^>]*disabled/);
	const source = await readFile(new URL('./LibraryEditor.svelte', import.meta.url), 'utf8');
	assert.match(source, /if \(saving \|\| fileOff\) return;/);
});

test('leaving a file\'s page while its new version is on its way asks first (Codex S7 #7)', async () => {
	const detail = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	assert.match(detail, /function back\(\) \{\s*if \(busy === 'replace'\) leaveOpen = true;\s*else onback\(\);\s*\}/);
	assert.match(detail, /<button type="button" class="kn-back" onclick=\{back\}>/);
	assert.match(detail, /bind:open=\{leaveOpen\}[\s\S]*?กำลังอัปโหลดฉบับใหม่ ถ้าออกก่อนส่งเสร็จ ฉบับใหม่จะไม่ถูกบันทึก/);
	assert.match(detail, /onuploading\?\.\(true\);[\s\S]*?finally \{[\s\S]*?onuploading\?\.\(false\);/, 'the page knows while it is on its way');
	// A new version sent in full whose answer did not come: the file is asked for again, not sent twice.
	assert.match(detail, /if \(sent && \(aborted \|\| cause instanceof TypeError \|\| status >= 500\)\) \{[\s\S]*?void refresh\(\);/);
	assert.match(detail, /onitem=\{\(\) => void refresh\(\)\}/, 'a preview that met a newer version reads the file again, in order');
});

/** A component's script compiled alone (its props a $state the test changes), with its imports given by name. */
async function scriptHarness(file, expose) {
	const { compileModule } = await import('svelte/compiler');
	const { createRequire, stripTypeScriptTypes } = await import('node:module');
	const { pathToFileURL } = await import('node:url');
	const require = createRequire(import.meta.url);
	const source = await readFile(new URL(file, import.meta.url), 'utf8');
	const stripped = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1]);
	const names = [...stripped.matchAll(/^\s*import\s+(?:(\w+)|\{([^}]*)\})\s+from\s+['"][^'"]+['"];?/gm)].flatMap(([, single, list]) => (single ? [single] : list.split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter((name) => name && !name.startsWith('type '))));
	const script = stripped.replace(/^\s*import[^;]+;/gm, '').replace('$props()', '$state(testProps)').replace('$props.id()', "'test'");
	const code = compileModule(`export function harness(testProps, deps) {
	const { ${[...new Set(names)].join(', ')} } = deps;
	${script}
	return ${expose};
}`, { filename: 'script-harness.svelte.js', generate: 'client' }).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
	return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).harness;
}

test('an editor opened with file Knowledge on saves no file once it goes off (Codex S7 confirmation #6)', async (t) => {
	const client = await import('svelte/internal/client');
	// `features` is the prop a bootstrap refresh changes while the editor is open.
	const harness = await scriptHarness('./LibraryEditor.svelte', '{ save, get fileOff() { return fileOff; }, setFeatures(value) { features = value; } }');
	const saves = [];
	const existing = fileItem('f', { status: 'draft', version: 2, memberIDs: ['x'], file: fileInfo({ published: version(1, 'ready'), options: options() }) });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hub: hub('sales'), kind: 'file', features: ON, existing, initialTitle: '', items: [], members, departments, currentUserID: 'me', now: 0, onsaved: () => {}, onclose: () => {}, ondenied: () => {}, onrecheck: async () => 'open', ondirty: () => {} },
			{
				...k, t: th, untrack: client.untrack, onDestroy: () => {}, parseErrorContent: (error) => ({ status: error.status, message: error.message }), orcaError: (error) => error.message,
				OrcaLibraryService: { save: async (...args) => { saves.push(args); return { ...existing, version: 3 }; } }
			}
		);
	});
	t.after(stop);
	client.flush();
	assert.equal(view.fileOff, false);
	await view.save('draft');
	assert.equal(saves.length, 1, 'with the flag on, the file is saved');
	view.setFeatures(OFF);
	client.flush();
	assert.equal(view.fileOff, true, 'fileOff follows the flag');
	await view.save('draft');
	await view.save('published');
	assert.equal(saves.length, 1, 'nothing is sent once it is off');
});

test('a preview that is gone changes nothing when its answer comes back (Codex S7 confirmation #3)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/FilePreview.svelte', '{ load, get chunks() { return chunks; } }');
	const v = (n) => ({ version: n, state: 'ready', fileName: 'ราคา.xlsx', bytes: 1, createdAt: '', options: { includeHidden: false, includeComments: false, includeNotes: false } });
	let answer;
	const pending = new Promise((resolve) => { answer = resolve; });
	const destroyers = [];
	const items = [];
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hubID: 'hub-a', itemID: 'f', which: 'published', version: v(1), onitem: (item) => items.push(item) },
			{ untrack: client.untrack, onDestroy: (fn) => destroyers.push(fn), OrcaLibraryService: { file: () => pending }, t: th, locatorLabel: () => '', fileActionProblem: () => undefined, getHttpStatusCode: () => undefined, parseErrorContent: (error) => error, orcaError: (error) => error.message }
		);
	});
	t.after(stop);
	client.flush();
	// The page moves to another workspace before the answer: the preview is destroyed.
	for (const destroy of destroyers) destroy();
	answer({ item: { id: 'f', hubID: 'hub-a', version: 12 }, which: 'published', version: v(2), preview: [{ text: 'ฉบับ 2' }], totalChars: 6, nextCursor: '' });
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(items, [], 'no item of workspace A reaches the page');
	assert.deepEqual(view.chunks, []);
	// And the page drops an answer for another workspace anyway.
	const page = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.match(page, /if \(!hub \|\| \(answer\.hubID && answer\.hubID !== hub\.id\)\) return undefined;/);
	assert.match(page, /if \(reload\) void load\(hub\.id\);/, 'an answer still missing what it left out: the library is asked again');
	assert.match(page, /if \(failure\.reload && hub\?\.id === id\) void load\(id\);/, 'an upload whose outcome is unknown: the list is asked');
	assert.match(page, /if \(\[403, 404\]\.includes\(getHttpStatusCode\(cause\) \?\? 0\) && refuseUnderEditor\(\)\) return;/, 'access lost under an editor: no more asking, and the editor says so');
	assert.match(page, /function refuseUnderEditor\(\): boolean \{\s*if \(dirtyEditor\(\) === undefined\) return false;\s*stopPolling\(\);\s*editorNote = t\(/);
});

test('a workspace not active yet: its lists say "เผยแพร่แล้ว", never "AI ใช้ได้", and the legend says why (Codex S7 second confirmation #4)', async () => {
	const items = [article('a'), fileItem('f')];
	const draftHub = hub('sales', { status: 'draft' });
	for (const kind of ['knowledge', 'file']) {
		const { html, rails } = await list({ hub: draftHub, choices: [draftHub], items, kind, features: ON, fileZone: zone });
		assert.doesNotMatch(html, /AI ใช้ได้/, kind);
		assert.match(html, /<i class="dt plain"[^>]*><\/i>เผยแพร่แล้ว <b>1<\/b>/, kind);
		assert.match(html, /<span class="orca-pill neutral[^"]*"[^>]*>(?:<[^>]+>)*เผยแพร่แล้ว/, kind);
		assert.equal(rails[0].paused, 'workspace', kind);
	}
	const { Component } = await serverComponent(new URL('./knowledge/KnowledgeRail.svelte', import.meta.url), { ...k, t: th, term, localeHref: (value) => value, copyFeedback: () => ({ dispose: noop, copied: noop }), copyText: noop, showToast: noop, onDestroy: noop });
	const rail = (paused) => show(Component, { item: undefined, connected: true, ask: false, files: true, paused });
	assert.match(rail('workspace'), /เผยแพร่แล้ว<\/span>AI จะใช้ได้เมื่อเปิดใช้งานพื้นที่ทำงานนี้/);
	assert.match(rail('files'), /เผยแพร่แล้ว<\/span>ตอนนี้ AI ไม่ได้ใช้ไฟล์ เพราะคลังความรู้แบบไฟล์ของบริษัทปิดอยู่/);
	assert.match(rail(undefined), /AI ใช้ได้<\/span>AI ของคนที่เลือกไว้ใช้ตอบได้ทันที/);
});

test('a file\'s page that is gone changes nothing when an action\'s answer comes back (Codex S7 second confirmation #2)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/FileDetail.svelte', '{ readAgain, archive }');
	const destroyers = [];
	const told = [];
	let refuse;
	const refused = new Promise((_resolve, reject) => { refuse = reject; });
	refused.catch(() => {});
	const item = fileItem('f', { file: fileInfo({ published: version(2, 'ready'), options: options() }) });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hub: hub('sales'), item, members, departments, currentUserID: 'me', canManage: false, features: ON, now: 0, onback: noop, onedit: noop, onchanged: () => told.push('changed'), onarchived: () => told.push('archived'), ondeleted: () => told.push('deleted'), ondenied: () => told.push('denied'), onuploading: noop },
			{ ...k, t: th, term, onDestroy: (fn) => destroyers.push(fn), getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status, message: error.message }), orcaError: (error) => error.message, OrcaLibraryService: { reextract: () => refused, save: async () => ({ ...item, status: 'archived', version: 4 }) } }
		);
	});
	t.after(stop);
	client.flush();
	const pending = view.readAgain();
	// The person goes back, and on to another item's editor, before the answer.
	for (const destroy of destroyers) destroy();
	refuse(Object.assign(new Error('not found'), { status: 404 }));
	await pending;
	await view.archive();
	assert.deepEqual(told, [], 'neither "denied" (which would close the other editor) nor any change reaches the page');
});

test('a batch sent in full whose answer is a refusal midway is unknown, asked for again, and not sent twice (Codex S7 confirmation #2, #6)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./KnowledgeLibrary.svelte', '{ upload, retryUpload, get uploads() { return uploads; }, get uploadNote() { return uploadNote; } }');
	const loads = [];
	const sends = [];
	const salesHub = hub('sales', { memberIDs: ['me'] });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ data: { hubs: [salesHub], currentUserID: 'me', canManage: true, features: { libraryV2: true }, members, units: [] }, hubID: 'sales', initialKind: 'file', initialCreate: false, onchanged: async () => {} },
			{
				...k, t: th, term, untrack: client.untrack, onDestroy: () => {}, beforeNavigate: () => {}, goto: async () => {}, replaceState: () => {},
				page: { url: new URL('https://orca.example.test/app?view=knowledge&hub=sales&kind=file'), state: {} },
				getHttpStatusCode: (error) => error.status, isAbortError: (error) => error?.name === 'AbortError', parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				aiConnection: {}, aiConnectionReaches: () => true, aiConnectionAppFor: () => 'Claude', currentCompany: () => 'default', localeHref: (value) => value,
				memberName: (member) => member.displayName, orcaError: (error) => error.message, statusLabels: {}, showToast: () => {}, connectionReady: () => true,
				OrcaLibraryService: {
					load: async (id) => { loads.push(id); return { items: [], members, departments: [] }; },
					usage: async () => ({ bytes: 0, bytesLimit: 1024 * 1024 * 1024, chars: 0, charsLimit: 10_000_000, uploadsToday: 0, uploadsLimit: 50, items: 0, itemsLimit: 1000 }),
					// The whole batch goes, the first file is stored, then the company's flag goes off: 404, no results.
					upload: async (_id, files, progress) => {
						sends.push(files.map((file) => file.name));
						progress.onsent();
						throw Object.assign(new Error('library_files_disabled: knowledge library v2 is off for this company'), { status: 404 });
					}
				}
			}
		);
	});
	t.after(stop);
	client.flush();
	for (let i = 0; i < 5 && !loads.length; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(loads, ['sales'], 'the library loads once');
	await view.upload([new File(['a'], 'ราคา.xlsx'), new File(['b'], 'ลูกค้า.csv')]);
	assert.deepEqual(view.uploads.map((row) => row.state), ['unknown', 'unknown']);
	assert.match(view.uploadNote, /ORCA อาจบันทึกไว้แล้ว ดูในรายการก่อนส่งซ้ำ/);
	assert.equal(loads.length, 2, 'the list is asked for what the server stored');
	await view.retryUpload();
	assert.equal(sends.length, 1, '"ลองอีกครั้ง" sends nothing whose outcome is unknown');
});

test('a draft\'s hidden parts say what the AI will see; a takeover that is gone tells nothing (Codex S7 second confirmation #2, #4)', async (t) => {
	const notes = (status, hubStatus = 'active') => fileItem('n', { status, file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { options: { includeHidden: false, includeComments: false, includeNotes: true }, stats: { chars: 1, slides: 18, hidden: hiddenParts({ notesSlides: 12 }) } }), options: options({ includeNotes: true }) }) });
	assert.match((await fileDetail({ item: notes('published') })).html, /AI เห็นโน้ตผู้บรรยาย 12 สไลด์/);
	const draft = (await fileDetail({ item: notes('draft') })).html;
	assert.match(draft, /AI จะเห็นโน้ตผู้บรรยาย 12 สไลด์/);
	assert.doesNotMatch(draft, /AI เห็นโน้ตผู้บรรยาย 12/, 'never what the AI sees (the switch reads "ให้ AI เห็นโน้ตผู้บรรยาย")');
	assert.match((await fileDetail({ item: notes('published'), hub: hub('sales', { status: 'paused' }) })).html, /AI จะเห็นโน้ตผู้บรรยาย 12 สไลด์/);
	// The takeover's answer after its page is gone.
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/TakeoverCard.svelte', '{ take }');
	const destroyers = [];
	const told = [];
	let answer;
	const pending = new Promise((resolve) => { answer = resolve; });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hubID: 'sales', item: article('a', { ownerID: 'gone', canEdit: false }), ontaken: () => told.push('taken'), ondenied: () => told.push('denied') },
			{ ...k, t: th, onDestroy: (fn) => destroyers.push(fn), getHttpStatusCode: (error) => error.status, parseErrorContent: (error) => error, orcaError: (error) => error.message, OrcaLibraryService: { takeover: () => pending } }
		);
	});
	t.after(stop);
	client.flush();
	const taking = view.take();
	for (const destroy of destroyers) destroy();
	answer(article('a', { version: 2 }));
	await taking;
	assert.deepEqual(told, []);
});

test('under an editor, an older reading answer that is refused never stops the newer asking (Codex S7 second confirmation #3)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./KnowledgeLibrary.svelte', '{ refreshReading, stopPolling, get pollTimer() { return pollTimer; } }');
	const reading = fileItem('r', { status: 'draft', file: fileInfo({ pending: version(1, 'extracting'), options: options() }) });
	const answers = [];
	const salesHub = hub('sales', { memberIDs: ['me'] });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ data: { hubs: [salesHub], currentUserID: 'me', canManage: true, features: { libraryV2: true }, members, units: [] }, hubID: 'sales', initialKind: 'file', initialCreate: false, onchanged: async () => {} },
			{
				...k, t: th, term, untrack: client.untrack, onDestroy: () => {}, beforeNavigate: () => {}, goto: async () => {}, replaceState: () => {},
				page: { url: new URL('https://orca.example.test/app?view=knowledge&hub=sales&kind=file'), state: {} },
				getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				aiConnection: {}, aiConnectionReaches: () => true, aiConnectionAppFor: () => 'Claude', currentCompany: () => 'default', localeHref: (value) => value,
				memberName: (member) => member.displayName, orcaError: (error) => error.message, statusLabels: {}, showToast: () => {}, connectionReady: () => true,
				OrcaLibraryService: {
					load: () => (answers.length ? answers.shift()() : Promise.resolve({ items: [reading], members, departments: [] })),
					usage: async () => ({ bytes: 0, bytesLimit: 1, chars: 0, charsLimit: 1, uploadsToday: 0, uploadsLimit: 50, items: 0, itemsLimit: 1000 })
				}
			}
		);
	});
	t.after(() => {
		view.stopPolling();
		stop();
	});
	client.flush();
	for (let i = 0; i < 5 && !view.pollTimer; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.ok(view.pollTimer, 'the page asks again while its file is read');
	let refuse;
	answers.push(() => new Promise((_resolve, reject) => { refuse = reject; }));
	const older = view.refreshReading('sales');
	await view.refreshReading('sales');
	assert.ok(view.pollTimer, 'the newer answer asks again');
	refuse(Object.assign(new Error('not found'), { status: 404 }));
	await older;
	assert.ok(view.pollTimer, 'the older refusal stops nothing');
});

test('a held version that read in part says so on its tab, in what the AI will see (Codex S7 third confirmation #2, #3)', async () => {
	const item = fileItem('p', { file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { stats: { chars: 1, slides: 18, hidden: hiddenParts() } }), pending: version(2, 'partial', { options: { includeHidden: false, includeComments: false, includeNotes: true }, stats: { chars: 1, slides: 240, partialReason: 'slides', hidden: hiddenParts({ notesSlides: 7, trackedChanges: 2 }) } }), options: options({ reviewBeforeUpdate: true, includeNotes: true }) }) });
	const { Component } = await serverComponent(new URL('./knowledge/FileDetail.svelte', import.meta.url), {
		...k, term, t: th, onDestroy: noop, getHttpStatusCode: noop, isAbortError: () => false, parseErrorContent: noop, orcaError: () => '',
		OrcaLibraryService: { downloadHref: () => '#' }, StatusPill, Switch, WhoCard, ConfirmDialog: noop, FilePreview: noop, KnowledgeRail: noop, TakeoverCard: noop
	});
	const source = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	// The note follows the version shown (the held one too), and a held one serves no one yet.
	assert.match(source, /\{#if previewVersion\?\.state === 'partial'\}/);
	assert.match(source, /const previewLive = \$derived\(live && !\(which === 'pending' && held\)\);/);
	assert.match(source, /partialText\(previewVersion\.stats\?\.partialReason \|\| previewVersion\.errorClass, t, previewLive\)/);
	assert.ok(Component);
	assert.equal(k.partialText('slides', th, false), 'ไฟล์มีมากกว่า 200 สไลด์ AI จะเห็นเฉพาะ 200 สไลด์แรก');
	assert.equal(k.partialText('slides', th), 'ไฟล์มีมากกว่า 200 สไลด์ AI เห็นเฉพาะ 200 สไลด์แรก');
	assert.equal(k.partialText(undefined, th, false), 'AI จะเห็นเฉพาะบางส่วนของไฟล์นี้');
	const tracked = (live) => k.hiddenLines(version(1, 'ready', { stats: { chars: 1, hidden: hiddenParts({ trackedChanges: 2 }) } }), th, undefined, live).map((line) => line.text);
	assert.deepEqual(tracked(true), ['ไฟล์นี้มีการแก้ไขที่ติดตามไว้ 2 จุด AI เห็นเฉพาะข้อความฉบับปัจจุบัน']);
	assert.deepEqual(tracked(false), ['ไฟล์นี้มีการแก้ไขที่ติดตามไว้ 2 จุด AI จะเห็นเฉพาะข้อความฉบับปัจจุบัน']);
	// A paused workspace: no "ลองถาม AI" for the file.
	const rails = [];
	const { html } = await fileDetail({ item: fileItem('f'), hub: hub('sales', { status: 'paused' }) });
	assert.doesNotMatch(html, /AI ใช้ได้/);
	const paused = await (async () => {
		const { Component: Detail } = await serverComponent(new URL('./knowledge/FileDetail.svelte', import.meta.url), {
			...k, term, t: th, onDestroy: noop, getHttpStatusCode: noop, isAbortError: () => false, parseErrorContent: noop, orcaError: () => '',
			OrcaLibraryService: { downloadHref: () => '#' }, StatusPill, Switch, WhoCard, ConfirmDialog: noop, FilePreview: noop, TakeoverCard: noop,
			KnowledgeRail: (_renderer, input) => rails.push(input)
		});
		show(Detail, { hub: hub('sales', { status: 'paused' }), item: fileItem('f'), members, departments, currentUserID: 'me', features: ON, now: 0, onback: noop, onedit: noop, onchanged: noop, onarchived: noop, ondeleted: noop, ondenied: noop });
		return rails[0];
	})();
	assert.equal(paused.ask, false, 'nothing to ask an AI that uses nothing here now');
});

test('without library v2 a workspace not active keeps today\'s page; with it, no "ลองถาม AI" there', async () => {
	const draftHub = hub('sales', { status: 'draft' });
	const today = await list({ hub: draftHub, choices: [draftHub], items: [article('a')], features: OFF, fileZone: zone });
	assert.match(today.html, /AI ใช้ได้/, 'today\'s words: the release\'s floor');
	assert.equal(today.rails[0].ask, true);
	assert.equal(today.rails[0].paused, undefined);
	const v2 = await list({ hub: draftHub, choices: [draftHub], items: [article('a')], features: ON, fileZone: zone });
	assert.equal(v2.rails[0].ask, false);
	const { Component } = await serverComponent(new URL('./knowledge/KnowledgeDetail.svelte', import.meta.url), {
		...k, term, t: th, tick: async () => {}, StatusPill, ConfirmDialog: noop, WhoCard, TakeoverCard: noop,
		orcaError: () => '', OrcaLibraryService: {}, getHttpStatusCode: noop, parseErrorContent: noop, KnowledgeRail: noop
	});
	const props = { items: [], members, departments, currentUserID: 'me', onback: noop, onedit: noop, onarchived: noop, ondenied: noop, onchanged: noop, hub: draftHub, item: article('a') };
	assert.match(show(Component, { ...props, features: OFF }), /AI ใช้ได้/, 'an article\'s page without library v2: today\'s');
	assert.doesNotMatch(show(Component, { ...props, features: ON }), /AI ใช้ได้/);
});

test('an article\'s page that is gone changes nothing when its archive answer comes back', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/KnowledgeDetail.svelte', '{ archive }');
	const destroyers = [];
	const told = [];
	let answer;
	const pending = new Promise((resolve) => { answer = resolve; });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hub: hub('sales'), item: article('a'), items: [], members, departments, currentUserID: 'me', canManage: false, features: ON, now: 0, connected: false, app: '', onback: noop, onedit: noop, onarchived: () => told.push('archived'), ondenied: () => told.push('denied'), onchanged: noop, onrecheck: async () => 'open' },
			{ ...k, t: th, term, tick: async () => {}, onDestroy: (fn) => destroyers.push(fn), getHttpStatusCode: (error) => error.status, parseErrorContent: (error) => error, orcaError: (error) => error.message, OrcaLibraryService: { save: () => pending } }
		);
	});
	t.after(stop);
	client.flush();
	const archiving = view.archive();
	for (const destroy of destroyers) destroy();
	answer(article('a', { status: 'archived', version: 2 }));
	await archiving;
	assert.deepEqual(told, []);
});

test('access lost under an editor: the editor says so and keeps the text; once it closes the library comes again (Codex S7 third confirmation #9, C4)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./KnowledgeLibrary.svelte', '{ refreshReading, show, setDirty(value) { dirty = value; }, get editorNote() { return editorNote; }, get items() { return items; } }');
	const loads = [];
	const salesHub = hub('sales', { memberIDs: ['me'] });
	let refuse = false;
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ data: { hubs: [salesHub], currentUserID: 'me', canManage: true, features: { libraryV2: true }, members, units: [] }, hubID: 'sales', initialKind: undefined, initialCreate: false, onchanged: async () => {} },
			{
				...k, t: th, term, untrack: client.untrack, onDestroy: () => {}, beforeNavigate: () => {}, goto: async () => {}, replaceState: () => {},
				page: { url: new URL('https://orca.example.test/app?view=knowledge&hub=sales'), state: {} },
				getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				aiConnection: {}, aiConnectionReaches: () => true, aiConnectionAppFor: () => 'Claude', currentCompany: () => 'default', localeHref: (value) => value,
				memberName: (member) => member.displayName, orcaError: (error) => error.message, statusLabels: {}, showToast: () => {}, connectionReady: () => true,
				OrcaLibraryService: {
					load: async (id) => {
						loads.push(id);
						if (refuse) throw Object.assign(new Error('forbidden'), { status: 403 });
						return { items: [article('a')], members, departments: [] };
					},
					usage: async () => ({ bytes: 0, bytesLimit: 1, chars: 0, charsLimit: 1, uploadsToday: 0, uploadsLimit: 50, items: 0, itemsLimit: 1000 })
				}
			}
		);
	});
	t.after(stop);
	client.flush();
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.equal(view.items.length, 1, 'the library loaded');
	view.show({ name: 'editor', kind: 'knowledge', id: 'a' });
	view.setDirty(true);
	client.flush();
	refuse = true;
	await view.refreshReading('sales');
	assert.match(view.editorNote, /เปิดคลังความรู้ของพื้นที่ทำงานนี้ไม่ได้แล้ว ข้อความที่พิมพ์ยังอยู่ คัดลอกเก็บไว้ก่อนออก/);
	assert.equal(view.items.length, 1, 'the editor\'s item stays under it');
	const before = loads.length;
	view.setDirty(false);
	view.show({ name: 'list' });
	client.flush();
	for (let i = 0; i < 5 && loads.length === before; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.equal(view.editorNote, '');
	assert.equal(loads.length, before + 1, 'the library comes again in full: its refusal shows on the list');
});


/** The library page's script, alone, with a library the test answers by hand. */
async function libraryPage(t, answer) {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./KnowledgeLibrary.svelte', '{ load, refreshReading, recheck, show, saved, deleted, setDirty(value) { dirty = value; }, get screen() { return screen; }, get editorNote() { return editorNote; }, get items() { return items; }, get pollTimer() { return pollTimer; }, stopPolling }');
	const salesHub = hub('sales', { memberIDs: ['me'] });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ data: { hubs: [salesHub], currentUserID: 'me', canManage: true, features: { libraryV2: true }, members, units: [] }, hubID: 'sales', initialKind: undefined, initialCreate: false, onchanged: async () => {} },
			{
				...k, t: th, term, untrack: client.untrack, onDestroy: () => {}, beforeNavigate: () => {}, goto: async () => {}, replaceState: () => {},
				page: { url: new URL('https://orca.example.test/app?view=knowledge&hub=sales'), state: {} },
				getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				aiConnection: {}, aiConnectionReaches: () => true, aiConnectionAppFor: () => 'Claude', currentCompany: () => 'default', localeHref: (value) => value,
				memberName: (member) => member.displayName, orcaError: (error) => error.message, statusLabels: {}, showToast: () => {}, connectionReady: () => true,
				OrcaLibraryService: { load: () => answer(), usage: async () => ({ bytes: 0, bytesLimit: 1, chars: 0, charsLimit: 1, uploadsToday: 0, uploadsLimit: 50, items: 0, itemsLimit: 1000 }) }
			}
		);
	});
	t.after(() => {
		view.stopPolling();
		stop();
	});
	client.flush();
	await new Promise((resolve) => setImmediate(resolve));
	return { view, flush: client.flush };
}

test('a load asked for before the person began typing never closes their editor (Codex S7 fourth confirmation #2)', async (t) => {
	for (const outcome of ['refused', 'gone']) {
		const queue = [async () => ({ items: [article('a'), article('b')], members, departments: [] })];
		const { view, flush } = await libraryPage(t, () => queue.shift()());
		view.show({ name: 'editor', kind: 'knowledge', id: 'a' });
		flush();
		// The page asks (dirty is false), then the person types while the answer is on its way.
		let answer;
		queue.push(() => new Promise((resolve, reject) => { answer = { resolve, reject }; }));
		const loading = view.load('sales', true);
		view.setDirty(true);
		if (outcome === 'refused') answer.reject(Object.assign(new Error('forbidden'), { status: 403 }));
		else answer.resolve({ items: [article('b')], members, departments: [] });
		await loading;
		flush();
		assert.equal(view.screen.name, 'editor', `${outcome}: the editor stays`);
		assert.match(view.editorNote, outcome === 'refused' ? /เปิดคลังความรู้ของพื้นที่ทำงานนี้ไม่ได้แล้ว/ : /เรื่องนี้ไม่อยู่ในรายการของคุณแล้ว/, outcome);
		assert.ok(view.items.some((item) => item.id === 'a'), `${outcome}: the edited item stays under it`);
	}
});

test('a quiet ask started while editing one item and answered while editing another speaks of the one open now (Codex S7 fourth confirmation #4)', async (t) => {
	const queue = [async () => ({ items: [article('a'), article('b')], members, departments: [] })];
	const { view, flush } = await libraryPage(t, () => queue.shift()());
	view.show({ name: 'editor', kind: 'knowledge', id: 'a' });
	view.setDirty(true);
	flush();
	let answer;
	queue.push(() => new Promise((resolve) => { answer = resolve; }));
	const asking = view.refreshReading('sales');
	// The person moves to B's editor; the answer lists B, not A.
	view.show({ name: 'editor', kind: 'knowledge', id: 'b' });
	flush();
	answer({ items: [article('b')], members, departments: [] });
	await asking;
	assert.equal(view.editorNote, '', 'B is listed: nothing to say over B');
	assert.deepEqual(view.items.map((item) => item.id), ['b'], 'A, no longer listed and not being edited, goes');
});

test('the remaining words of a workspace not active, and the takeover\'s 403 (Codex S7 fourth confirmation #5, #6, NOTE)', async (t) => {
	const { Component } = await serverComponent(new URL('./knowledge/KnowledgeRail.svelte', import.meta.url), { ...k, t: th, term, localeHref: (value) => value, copyFeedback: () => ({ dispose: noop, copied: noop }), copyText: noop, showToast: noop, onDestroy: noop });
	const card = (paused) => show(Component, { item: undefined, connected: false, ask: false, legend: false, paused });
	assert.match(card('workspace'), /เชื่อมครั้งเดียว แล้ว Claude หรือ ChatGPT จะตอบจากคลังนี้ได้เมื่อเปิดใช้งานพื้นที่ทำงานนี้/);
	assert.match(card(undefined), /เชื่อมครั้งเดียว แล้ว Claude หรือ ChatGPT จะตอบจากคลังนี้ได้</);
	// The pages pass it on library v2 only.
	const detail = await readFile(new URL('./knowledge/KnowledgeDetail.svelte', import.meta.url), 'utf8');
	assert.match(detail, /ask=\{item\.status === 'published' && !idle\}[^>]*paused=\{idle \? 'workspace' : undefined\}/);
	const file = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	assert.match(file, /paused=\{features\.files && hub\.status !== 'active' \? 'workspace' : undefined\}/);
	// Dots only: S7's red states colour the dot, never the whole pill.
	const pill = await readFile(new URL('./ui/StatusPill.svelte', import.meta.url), 'utf8');
	assert.match(pill, /\.orca-pill \.orca-pill-dot\.tone-deny \{\s*background: var\(--orca-deny\);/);
	const rail = await readFile(new URL('./knowledge/KnowledgeRail.svelte', import.meta.url), 'utf8');
	assert.match(rail, /\.dt\.deny \{\s*background: var\(--orca-deny\);/);
	assert.doesNotMatch(rail, /\.pill\.deny/);
	// The takeover's 403 names no one cause: the owner may be here, or the role changed.
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/TakeoverCard.svelte', '{ take, get error() { return error; } }');
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hubID: 'sales', item: article('a', { ownerID: 'gone', canEdit: false }), ontaken: noop, ondenied: noop },
			{ ...k, t: th, onDestroy: () => {}, getHttpStatusCode: (error) => error.status, parseErrorContent: (error) => ({ status: error.status, message: error.message }), orcaError: (error) => error.message, OrcaLibraryService: { takeover: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }); } } }
		);
	});
	t.after(stop);
	client.flush();
	await view.take();
	assert.equal(view.error, 'ยังรับช่วงไม่ได้ เจ้าของอาจยังอยู่ในพื้นที่ทำงานนี้ หรือสิทธิ์ของคุณเปลี่ยน โหลดหน้าใหม่แล้วลองอีกครั้ง');
});

test('a held version\'s tab: its lines say what the AI will see, and its partial reading shows (Codex S7 fourth confirmation NOTE)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/FileDetail.svelte', '{ setWhich(value) { which = value; }, get lines() { return lines; }, get previewVersion() { return previewVersion; }, get previewLive() { return previewLive; } }');
	const item = fileItem('p', { file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { stats: { chars: 1, slides: 18, hidden: hiddenParts() } }), pending: version(2, 'partial', { options: { includeHidden: false, includeComments: false, includeNotes: true }, stats: { chars: 1, slides: 240, partialReason: 'slides', hidden: hiddenParts({ notesSlides: 7 }) } }), options: options({ reviewBeforeUpdate: true, includeNotes: true }) }) });
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hub: hub('sales'), item, members, departments, currentUserID: 'me', canManage: false, features: ON, now: 0, onback: noop, onedit: noop, onchanged: noop, onarchived: noop, ondeleted: noop, ondenied: noop },
			{ ...k, t: th, term, onDestroy: () => {}, getHttpStatusCode: () => undefined, isAbortError: () => false, parseErrorContent: (error) => error, orcaError: (error) => error.message, OrcaLibraryService: {} }
		);
	});
	t.after(stop);
	client.flush();
	assert.equal(view.previewLive, true, 'the version in use, published: what the AI sees');
	view.setWhich('pending');
	client.flush();
	assert.equal(view.previewVersion.version, 2);
	assert.equal(view.previewLive, false);
	assert.deepEqual(view.lines.map((line) => line.text), ['AI จะเห็นโน้ตผู้บรรยาย 7 สไลด์'], 'the held version serves no one yet');
	assert.equal(view.previewVersion.state, 'partial', 'its partial note shows on its tab');
});

test('an older quiet ask never speaks over a newer load (Codex S7 fifth confirmation #2)', async (t) => {
	const queue = [async () => ({ items: [article('a')], members, departments: [] })];
	const { view, flush } = await libraryPage(t, () => queue.shift()());
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	// A quiet ask while editing A...
	view.show({ name: 'editor', kind: 'knowledge', id: 'a' });
	view.setDirty(true);
	flush();
	let old;
	queue.push(() => new Promise((resolve) => { old = resolve; }));
	const asking = view.refreshReading('sales');
	// ...then the editor closes, a load brings A and a new B, and the person edits B.
	view.setDirty(false);
	view.show({ name: 'list' });
	flush();
	queue.push(async () => ({ items: [article('a'), article('b')], members, departments: [] }));
	await view.load('sales');
	view.show({ name: 'editor', kind: 'knowledge', id: 'b' });
	view.setDirty(true);
	flush();
	// The old answer, without B, comes last.
	old({ items: [article('a')], members, departments: [] });
	await asking;
	assert.equal(view.editorNote, '', 'B is there: the newer load said so');
	assert.deepEqual(view.items.map((item) => item.id).sort(), ['a', 'b']);
});

test('the notices are shown as they say: the editor\'s above it, a partial reading on the file\'s page (Codex S7 fifth confirmation NOTE)', async () => {
	const page = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{#if editorNote\}<p class="editor-note" role="alert"><Info size=\{16\} aria-hidden="true" \/><span>\{editorNote\}<\/span><\/p>\{\/if\}\s*\{#key `\$\{screen\.kind\}:\$\{screen\.id \?\? 'new'\}`\}\s*<LibraryEditor/, 'right above the editor, while it is open');
	assert.doesNotMatch(page.slice(page.indexOf('.editor-note {'), page.indexOf('}', page.indexOf('.editor-note {'))), /display: none|visibility: hidden/);
	const partial = fileItem('p', { file: fileInfo({ published: version(2, 'partial', { stats: { chars: 1, sheets: 2, rows: 50_000, partialReason: 'rows', hidden: hiddenParts() } }), options: options() }) });
	const { html } = await fileDetail({ item: partial });
	assert.match(html, /<p class="fd-note warn">(?:<[^>]+>)*<span>อ่านได้บางส่วน: บางแผ่นงานมีมากกว่า 50,000 แถว AI เห็นเฉพาะ 50,000 แถวแรก \(นับแถวหัวตารางด้วย\)<\/span><\/p>/);
	const draft = await fileDetail({ item: { ...partial, status: 'draft' } });
	assert.match(draft.html, /อ่านได้บางส่วน: บางแผ่นงานมีมากกว่า 50,000 แถว AI จะเห็นเฉพาะ 50,000 แถวแรก/, 'a draft: what the AI will see');
});

test('a save\'s answer, an upload\'s or a recheck\'s, supersedes the quiet asks on their way (Codex S7 sixth confirmation #2)', async (t) => {
	const queue = [async () => ({ items: [article('a')], members, departments: [] })];
	const { view, flush } = await libraryPage(t, () => queue.shift()());
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	view.show({ name: 'editor', kind: 'knowledge', id: 'a' });
	view.setDirty(true);
	flush();
	let old;
	queue.push(() => new Promise((resolve) => { old = resolve; }));
	const asking = view.refreshReading('sales');
	// The editor closes, B is created (its save's answer, no load), and the person edits B.
	view.setDirty(false);
	view.saved(article('b'), 1);
	flush();
	view.show({ name: 'editor', kind: 'knowledge', id: 'b' });
	view.setDirty(true);
	flush();
	old({ items: [article('a')], members, departments: [] });
	await asking;
	assert.equal(view.editorNote, '', 'B is there: its save said so');
	assert.deepEqual(view.items.map((item) => item.id).sort(), ['a', 'b']);
	const page = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	// Every fresher list marks itself: a recheck's, a load's, an answer settled (save, archive, file action), a delete's, an upload's.
	for (const where of [/return 'denied';\s*fresher\(\);\s*items = result\.items;/, /error = '';\s*fresher\(\);\s*items = result\.items;/, /return undefined;\s*\/\/[^\n]*\n\s*fresher\(\);\s*const \{ item, reload \} = settleAnswer/, /function deleted\(item: LibraryItem\) \{\s*fresher\(\);/, /fresher\(\);\s*items = \[\.\.\.items\.filter\(\(known\) => known\.id !== answer\.item!\.id\), answer\.item\];/])
		assert.match(page, where);
});

test('the partial reading\'s note follows the version shown, outside anything that depends on the tab (Codex S7 sixth confirmation #5)', async () => {
	const source = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	// Directly after the held-version block, at the same depth: no condition on `which` around it.
	assert.match(source, /\t\t\t\{\/if\}\n\n\t\t\t<!-- The version shown, the held one too, before it is put in use \(Codex S7 third confirmation #2\)\. -->\n\t\t\t\{#if previewVersion\?\.state === 'partial'\}\n\t\t\t\t<p class="fd-note warn">/);
});

test('a newer list makes an older load ask again; a save while a quiet ask is out keeps the asking going (Codex S7 seventh confirmation #2, #3)', async (t) => {
	const reading = fileItem('r', { status: 'draft', file: fileInfo({ pending: version(1, 'extracting'), options: options() }) });
	const queue = [async () => ({ items: [reading], members, departments: [] })];
	const { view, flush } = await libraryPage(t, () => (queue.length ? queue.shift()() : Promise.resolve({ items: [reading, article('b')], members, departments: [] })));
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	// A load goes out; B is saved meanwhile; the load's older list (without B) comes back.
	let older;
	queue.push(() => new Promise((resolve) => { older = resolve; }));
	const loading = view.load('sales', true);
	view.saved(article('b'), 1);
	flush();
	older({ items: [reading], members, departments: [] });
	await loading;
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.ok(view.items.some((item) => item.id === 'b'), 'B stays: the older list was asked for again');
	assert.equal(view.screen.name, 'detail', 'B\'s page stays open');
	// A quiet ask goes out (its timer cleared); a save drops its answer; the asking goes on.
	view.stopPolling();
	let quiet;
	queue.push(() => new Promise((resolve) => { quiet = resolve; }));
	const asking = view.refreshReading('sales');
	view.saved(article('c'), 1);
	quiet({ items: [reading], members, departments: [] });
	await asking;
	assert.ok(view.pollTimer, 'a file is still being read: the page asks again');
});

test('the hidden parts of a held newer version: one story, and the hint says "จนกว่าคุณจะกดใช้ฉบับใหม่" (Codex S7 seventh confirmation #4)', async () => {
	const item = fileItem('h', { file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { stats: { chars: 1, slides: 18, hidden: hiddenParts({ notesSlides: 12 }) } }), pending: version(2, 'ready', { options: { includeHidden: false, includeComments: false, includeNotes: true } }), options: options({ reviewBeforeUpdate: true, includeNotes: true }) }) });
	const { html } = await fileDetail({ item });
	assert.match(html, /ฉบับใหม่ \(ฉบับที่ 2\) อ่านเสร็จแล้ว รอคุณตรวจก่อนให้ AI ใช้/);
	assert.match(html, /ไฟล์นี้มีโน้ตผู้บรรยาย 12 สไลด์ ฉบับใหม่ให้ AI เห็นแล้ว รอคุณกดใช้/);
	assert.doesNotMatch(html, /ORCA กำลังอ่านใหม่/, 'never "being read" beside "read and waiting"');
	assert.match(html, /เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ AI ใช้ฉบับเดิมจนกว่าคุณจะกดใช้ฉบับใหม่/);
	// The partial note's line, exactly: nothing on the tab hides its text.
	const source = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	assert.match(source, /\t\t\t\{#if previewVersion\?\.state === 'partial'\}\n\t\t\t\t<p class="fd-note warn"><TriangleAlert size=\{15\} aria-hidden="true" \/><span>\{t\('อ่านได้บางส่วน:', 'Partly read:'\)\} \{partialText\(previewVersion\.stats\?\.partialReason \|\| previewVersion\.errorClass, t, previewLive\)\}<\/span><\/p>\n\t\t\t\{\/if\}/);
});


test('every list is ordered by one freshness: an older load or recheck never takes back what came after it (Codex S7 eighth confirmation #1, #2)', async (t) => {
	const reading = (state) => fileItem('r', { status: 'draft', file: fileInfo({ pending: version(1, state), options: options() }) });
	const queue = [async () => ({ items: [reading('extracting'), article('a')], members, departments: [] })];
	const next = () => (queue.length ? queue.shift()() : Promise.resolve({ items: [reading('ready'), article('a'), article('b')], members, departments: [] }));
	const { view, flush } = await libraryPage(t, next);
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
	// 1. A load goes out; under an editor a quiet ask brings "ready"; the load's older "extracting" comes last.
	let older;
	queue.push(() => new Promise((resolve) => { older = resolve; }));
	const loading = view.load('sales', true);
	view.show({ name: 'editor', kind: 'knowledge', id: 'a' });
	view.setDirty(true);
	flush();
	queue.push(async () => ({ items: [reading('ready'), article('a')], members, departments: [] }));
	await view.refreshReading('sales');
	assert.equal(view.items.find((item) => item.id === 'r').file.pending.state, 'ready');
	older({ items: [reading('extracting'), article('a')], members, departments: [] });
	await loading;
	await settle();
	assert.equal(view.items.find((item) => item.id === 'r').file.pending.state, 'ready', 'the older list was asked for again, not applied');
	// 2. A load goes out; B is saved and edited; the load's older refusal never speaks over B.
	view.setDirty(false);
	view.show({ name: 'list' });
	flush();
	let refused;
	queue.push(() => new Promise((_resolve, reject) => { refused = reject; }));
	const loading2 = view.load('sales', true);
	view.saved(article('b'), 1);
	view.show({ name: 'editor', kind: 'knowledge', id: 'b' });
	view.setDirty(true);
	flush();
	refused(Object.assign(new Error('forbidden'), { status: 403 }));
	await loading2;
	await settle();
	assert.equal(view.editorNote, '', 'a refusal older than B\'s save is asked again, and the newer answer has B');
	// 3. A recheck goes out; R is deleted; the recheck's older list (with R) never brings R back.
	view.setDirty(false);
	view.show({ name: 'list' });
	flush();
	let rechecked;
	queue.push(() => new Promise((resolve) => { rechecked = resolve; }));
	queue.push(async () => ({ items: [article('a'), article('b')], members, departments: [] }));
	const checking = view.recheck();
	view.deleted(view.items.find((item) => item.id === 'r'));
	rechecked({ items: [reading('ready'), article('a'), article('b')], members, departments: [] });
	assert.equal(await checking, 'open');
	await settle();
	assert.equal(view.items.some((item) => item.id === 'r'), false, 'R stays deleted');
});

test('a recheck that took the place of the timer\'s load asks again while files are read (Codex S7 eighth confirmation #3)', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const reading = fileItem('r', { status: 'draft', file: fileInfo({ pending: version(1, 'extracting'), options: options() }) });
	let loads = 0;
	const answers = [];
	const { view } = await libraryPage(t, () => {
		loads += 1;
		return answers.length ? answers.shift()() : Promise.resolve({ items: [reading], members, departments: [] });
	});
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.equal(loads, 1);
	assert.ok(view.pollTimer, 'the file is read: the page will ask again');
	// The timer's load goes out, then a recheck takes its place.
	let timerLoad;
	answers.push(() => new Promise((resolve) => { timerLoad = resolve; }));
	t.mock.timers.tick(3_000);
	assert.equal(loads, 2);
	assert.equal(await view.recheck(), 'open');
	timerLoad({ items: [reading], members, departments: [] });
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
	// The asking goes on: within the next delays the page asks again.
	t.mock.timers.tick(20_000);
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.ok(loads >= 4, `the page went on asking (${loads} loads)`);
	view.stopPolling();
});

test('with "ต้องตรวจก่อนอัปเดต" a version being read still waits for "ใช้ฉบับใหม่": one story (Codex S7 eighth confirmation #4)', async () => {
	const item = fileItem('w', { file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { options: { includeHidden: false, includeComments: false, includeNotes: true }, stats: { chars: 1, slides: 18, hidden: hiddenParts({ notesSlides: 12, comments: 2 }) } }), pending: version(2, 'extracting', { options: { includeHidden: false, includeComments: true, includeNotes: false } }), options: options({ reviewBeforeUpdate: true, includeNotes: false, includeComments: true }) }) });
	const { html } = await fileDetail({ item });
	assert.match(html, /กำลังอ่านฉบับใหม่ \(ฉบับที่ 2\) AI ใช้ฉบับเดิมจนกว่าคุณจะกดใช้ฉบับใหม่/);
	assert.match(html, /AI ยังเห็นโน้ตผู้บรรยาย 12 สไลด์ จนกว่าคุณจะกดใช้ฉบับใหม่/);
	assert.match(html, /ไฟล์นี้มีความคิดเห็น 2 รายการ ORCA กำลังอ่านฉบับใหม่ให้ AI เห็นเมื่อคุณกดใช้/);
	assert.doesNotMatch(html, /จนกว่าจะอ่านเสร็จ|จนกว่าฉบับใหม่จะอ่านเสร็จ/, 'never "until it is read" while review holds it after');
	assert.equal(k.hiddenLines(version(1, 'ready', { options: { includeHidden: false, includeComments: false, includeNotes: true }, stats: { chars: 1, hidden: hiddenParts({ notesSlides: 3 }) } }), th, { includeNotes: false, includeHidden: false, includeComments: false }, true, 'reading', false)[0].text, 'AI ยังเห็นโน้ตผู้บรรยาย 3 สไลด์ จนกว่าฉบับใหม่จะอ่านเสร็จ', 'without review: until it is read');
});


test('a read of the file that began before a settings change never brings the older settings back (Codex S7 ninth confirmation #1)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/FileDetail.svelte', '{ refresh, setOption, setItem(next) { item = next; } }');
	const item = fileItem('f', { file: fileInfo({ published: version(2, 'ready'), options: options({ allowDownload: true }) }) });
	const puts = [];
	let read;
	let view;
	const told = [];
	const stop = client.effect_root(() => {
		view = harness(
			{ hub: hub('sales'), item, members, departments, currentUserID: 'me', canManage: false, features: ON, now: 0, onback: noop, onedit: noop, onchanged: (next) => { told.push(next); view.setItem(next); }, onarchived: noop, ondeleted: noop, ondenied: noop },
			{
				...k, t: th, term, onDestroy: () => {}, getHttpStatusCode: () => undefined, isAbortError: () => false, parseErrorContent: (error) => error, orcaError: (error) => error.message,
				OrcaLibraryService: {
					file: () => new Promise((resolve) => { read = resolve; }),
					setOptions: async (_hub, _item, value) => { puts.push(value); return { ...item, file: { ...item.file, allowDownload: value.allowDownload, options: value } }; }
				}
			}
		);
	});
	t.after(stop);
	client.flush();
	// A read goes out (allowDownload still on); the owner turns downloads off; the read's older answer comes last.
	const reading = view.refresh();
	await view.setOption('allowDownload', false);
	client.flush();
	read({ item, which: 'published', preview: [], totalChars: 0 });
	await reading;
	client.flush();
	assert.equal(told.length, 1, 'the older read is dropped');
	// The next change sends the settings as the owner left them.
	await view.setOption('reviewBeforeUpdate', true);
	assert.equal(puts.at(-1).allowDownload, false, 'downloads stay off');
	assert.equal(puts.at(-1).reviewBeforeUpdate, true);
});

test('a recheck taken over by a newer request says nothing; one that failed for a moment keeps the asking going (Codex S7 ninth confirmation #2, #3)', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const reading = fileItem('r', { status: 'draft', file: fileInfo({ pending: version(1, 'extracting'), options: options() }) });
	let loads = 0;
	const answers = [];
	const { view } = await libraryPage(t, () => {
		loads += 1;
		return answers.length ? answers.shift()() : Promise.resolve({ items: [reading], members, departments: [] });
	});
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	// A recheck goes out; a newer load answers; the recheck's older 403 comes last.
	let refuse;
	answers.push(() => new Promise((_resolve, reject) => { refuse = reject; }));
	const checking = view.recheck();
	await view.load('sales', true);
	refuse(Object.assign(new Error('forbidden'), { status: 403 }));
	assert.equal(await checking, 'unknown', 'not "denied": a newer answer took its place');
	// The timer's load goes out; a recheck takes its place and fails for a moment (503): the page asks again.
	view.stopPolling();
	await view.load('sales', true);
	let timerLoad;
	answers.push(() => new Promise((resolve) => { timerLoad = resolve; }));
	t.mock.timers.tick(3_000);
	answers.push(() => Promise.reject(Object.assign(new Error('unavailable'), { status: 503 })));
	assert.equal(await view.recheck(), 'unknown');
	timerLoad({ items: [reading], members, departments: [] });
	const before = loads;
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
	t.mock.timers.tick(20_000);
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.ok(loads > before, `the asking went on (${before} → ${loads})`);
	view.stopPolling();
});

test('a draft or a workspace not active, with review on: its banner and lines tell the same wait (Codex S7 ninth confirmation #4)', async () => {
	for (const [state, status, hubStatus] of [['queued', 'draft', 'active'], ['extracting', 'draft', 'active'], ['queued', 'published', 'paused'], ['extracting', 'published', 'paused']]) {
		const item = fileItem('w', { status, file: fileInfo({ ext: 'pptx', published: version(1, 'ready', { options: { includeHidden: false, includeComments: false, includeNotes: true }, stats: { chars: 1, slides: 18, hidden: hiddenParts({ notesSlides: 12 }) } }), pending: version(2, state, { options: { includeHidden: false, includeComments: false, includeNotes: false } }), options: options({ reviewBeforeUpdate: true, includeNotes: false }) }) });
		const { html } = await fileDetail({ item, hub: hub('sales', { status: hubStatus }) });
		const label = `${state} ${status} ${hubStatus}`;
		assert.match(html, /กำลังอ่านฉบับใหม่ \(ฉบับที่ 2\) ด้านล่างยังเป็นฉบับเดิมจนกว่าคุณจะกดใช้ฉบับใหม่/, label);
		assert.match(html, /ฉบับนี้ยังมีโน้ตผู้บรรยาย 12 สไลด์ จนกว่าคุณจะกดใช้ฉบับใหม่/, label);
		assert.doesNotMatch(html, /จนกว่าจะอ่านเสร็จ/, label);
	}
});

test('the quota meter takes the newest answer only', async () => {
	const page = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.match(page, /const request = \+\+usageRequest;\s*try \{\s*const next = await OrcaLibraryService\.usage\(id\);\s*if \(request === usageRequest && hub\?\.id === id && !disposed\) usage = next;/);
});


test('a read of the file is older than a newer item from the page too; one that nothing overtook is applied (Codex S7 tenth confirmation #1)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./knowledge/FileDetail.svelte', '{ refresh, setOption, setItem(next) { item = next; } }');
	const withDownload = (allow) => fileItem('f', { file: fileInfo({ allowDownload: allow, published: version(2, 'ready'), options: options({ allowDownload: allow }) }) });
	const puts = [];
	const reads = [];
	const told = [];
	let denied = 0;
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ hub: hub('sales'), item: withDownload(true), members, departments, currentUserID: 'me', canManage: false, features: ON, now: 0, onback: noop, onedit: noop, onchanged: (next) => { told.push(next); view.setItem(next); }, onarchived: noop, ondeleted: noop, ondenied: () => denied++ },
			{
				...k, t: th, term, onDestroy: () => {}, getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => error, orcaError: (error) => error.message,
				OrcaLibraryService: {
					file: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
					setOptions: async (_hub, _item, value) => { puts.push(value); return withDownload(value.allowDownload); }
				}
			}
		);
	});
	t.after(stop);
	client.flush();
	// 1. A read goes out; the page's own asking brings downloads off (another tab); the read's older "on" comes last.
	const first = view.refresh();
	view.setItem(withDownload(false));
	client.flush();
	reads.shift().resolve({ item: withDownload(true), which: 'published', preview: [], totalChars: 0 });
	await first;
	assert.equal(told.length, 0, 'dropped: the page had a newer item');
	await view.setOption('reviewBeforeUpdate', true);
	assert.equal(puts.at(-1).allowDownload, false, 'the next change keeps downloads off');
	// 2. Its refusal is dropped the same way.
	const second = view.refresh();
	view.setItem(withDownload(false));
	client.flush();
	reads.shift().reject(Object.assign(new Error('gone'), { status: 404 }));
	await second;
	assert.equal(denied, 0, 'an older refusal never closes the page');
	// 3. A read nothing overtook is applied, refusal or not.
	const told0 = told.length;
	const third = view.refresh();
	reads.shift().resolve({ item: withDownload(false), which: 'published', preview: [], totalChars: 0 });
	await third;
	assert.equal(told.length, told0 + 1, 'the read is passed on');
	const fourth = view.refresh();
	reads.shift().reject(Object.assign(new Error('gone'), { status: 404 }));
	await fourth;
	assert.equal(denied, 1, 'a current refusal is told');
});

test('a file action or an upload starts a fresh polling budget and asks for the quota again (Codex S7 tenth confirmation #2, #3)', async (t) => {
	const client = await import('svelte/internal/client');
	const harness = await scriptHarness('./KnowledgeLibrary.svelte', '{ changed, upload, setPollRound(value) { pollRound = value; }, get pollRound() { return pollRound; }, get pollTimer() { return pollTimer; }, stopPolling, get items() { return items; } }');
	const reading = (id) => fileItem(id, { status: 'draft', file: fileInfo({ pending: version(1, 'extracting'), options: options() }) });
	const salesHub = hub('sales', { memberIDs: ['me'] });
	let usageAsks = 0;
	let view;
	const stop = client.effect_root(() => {
		view = harness(
			{ data: { hubs: [salesHub], currentUserID: 'me', canManage: true, features: { libraryV2: true }, members, units: [] }, hubID: 'sales', initialKind: 'file', initialCreate: false, onchanged: async () => {} },
			{
				...k, t: th, term, untrack: client.untrack, onDestroy: () => {}, beforeNavigate: () => {}, goto: async () => {}, replaceState: () => {},
				page: { url: new URL('https://orca.example.test/app?view=knowledge&hub=sales&kind=file'), state: {} },
				getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				aiConnection: {}, aiConnectionReaches: () => true, aiConnectionAppFor: () => 'Claude', currentCompany: () => 'default', localeHref: (value) => value,
				memberName: (member) => member.displayName, orcaError: (error) => error.message, statusLabels: {}, showToast: () => {}, connectionReady: () => true,
				OrcaLibraryService: {
					load: async () => ({ items: [reading('old')], members, departments: [] }),
					usage: async () => { usageAsks += 1; return { bytes: 0, bytesLimit: 1024 * 1024 * 1024, chars: 0, charsLimit: 10_000_000, uploadsToday: 1, uploadsLimit: 50, items: 1, itemsLimit: 1000 }; },
					upload: async (_id, files, progress) => { progress.onsent?.(); return { files: files.map((file) => ({ fileName: file.name, item: reading(`new-${file.name}`) })) }; }
				}
			}
		);
	});
	t.after(() => {
		view.stopPolling();
		stop();
	});
	client.flush();
	for (let i = 0; i < 10 && !view.items.length; i++) await new Promise((resolve) => setImmediate(resolve));
	// The old file never finished: the budget is spent.
	view.stopPolling();
	view.setPollRound(61);
	const asked = usageAsks;
	view.changed(reading('old'));
	assert.equal(view.pollRound, 0, 'a file action starts a fresh budget');
	assert.ok(view.pollTimer, 'and the page asks again');
	await new Promise((resolve) => setImmediate(resolve));
	assert.ok(usageAsks > asked, 'the quota is asked for again');
	view.stopPolling();
	view.setPollRound(61);
	await view.upload([new File(['x'], 'ราคา.xlsx')]);
	assert.equal(view.pollRound, 0, 'an upload starts a fresh budget');
	assert.ok(view.pollTimer);
});
