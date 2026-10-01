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
	assert.match(html, /<span class="kl-s[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill deny"/);
	assert.doesNotMatch(html, /class="kl-s draft[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill deny"/, 'a failed draft is not drawn as a draft');
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
	const remove = dialogs.find((dialog) => dialog.tone === 'danger');
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
	assert.match(failed.html, /<span class="kd-status(?! draft)[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill deny"/, 'a solid deny dot');
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
	assert.equal(rails[0].paused, true);
	// With the flag the same rows are "AI ใช้ได้".
	const on = await list({ items, kind: 'file', features: ON, fileZone: zone });
	assert.match(on.html, /AI ใช้ได้/);
	assert.match(on.html, /ฉบับใหม่รอคุณกดใช้/);
	assert.equal(on.rails[0].paused, false);
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
	assert.match(page, /if \(!hub \|\| !features\.files \|\| !readingFileIDs\(items\)\.length \|\| pollRound > 60\)/, 'it stops asking once nothing is read');
	assert.match(page, /onDestroy\(\(\) => \{\s*stopPolling\(\);\s*cancelUpload\(\);/, 'leaving stops both');
	assert.match(page, /if \(leaving \|\| !\(dirty \|\| uploading\)\) return;/, 'leaving mid-upload asks first');
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
