import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

// Knowledge library v2 (C4 §14m S7): the logic behind the file screens, in
// Thai. The server decides everything again; these say it in plain words.
const k = await importTypeScript(new URL('./knowledge.ts', import.meta.url));
const th = (thai) => thai;
const en = (_thai, english) => english;
const MB = 1024 * 1024;

const hidden = (extra = {}) => ({ notesSlides: 0, hiddenSlides: 0, hiddenSheets: 0, hiddenText: 0, comments: 0, trackedChanges: 0, ...extra });
const version = (n, state, extra = {}) => ({
	version: n, state, fileName: 'ราคา.xlsx', bytes: 2048, createdAt: '2026-09-28T03:00:00Z',
	options: { includeHidden: false, includeComments: false, includeNotes: false }, stats: { chars: 10, hidden: hidden() }, ...extra
});
const file = (extra = {}) => ({ origin: 'upload', fileName: 'ราคา.xlsx', ext: 'xlsx', mime: 'x', bytes: 2048, allowDownload: true, ...extra });
const item = (id, extra = {}) => ({
	id, kind: 'file', title: id, summary: '', content: '', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [], status: 'draft', version: 1,
	hubID: 'h', ownerID: 'me', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', canEdit: true, ...extra
});
const usage = (extra = {}) => ({ bytes: 100 * MB, bytesLimit: 1024 * MB, chars: 1_500_000, charsLimit: 10_000_000, uploadsToday: 3, uploadsLimit: 50, items: 20, itemsLimit: 1000, ...extra });

test('the server\'s file table, before anything is sent: type by the name, then the size', () => {
	for (const name of ['คู่มือ.docx', 'ราคา.XLSX', 'deck.pptx', 'list.csv', 'note.txt', 'readme.md', 'guide.markdown', 'C:\\Users\\a\\ราคา.xlsx'])
		assert.deepEqual(k.classifyFile(name, 10).ok, true, name);
	for (const [name, reason] of [
		['ใบสั่งซื้อ.docm', 'macro'], ['book.xlsm', 'macro'], ['deck.pptm', 'macro'], ['t.dotm', 'macro'], ['t.xltm', 'macro'], ['t.potm', 'macro'], ['t.ppsm', 'macro'],
		['old.doc', 'encrypted_or_legacy'], ['old.xls', 'encrypted_or_legacy'], ['old.ppt', 'encrypted_or_legacy'], ['b.xlsb', 'encrypted_or_legacy'], ['r.rtf', 'encrypted_or_legacy'],
		['scan.pdf', 'pdf_later'], ['photo.png', 'unsupported'], ['noextension', 'unsupported'], ['.docx', 'unsupported'], ['archive.zip', 'unsupported']
	])
		assert.deepEqual(k.classifyFile(name, 10), { ok: false, reason }, name);
	assert.deepEqual(k.classifyFile('empty.txt', 0), { ok: false, reason: 'empty' });
	assert.deepEqual(k.classifyFile('big.docx', 20 * MB + 1), { ok: false, reason: 'too_large' });
	assert.equal(k.classifyFile('limit.docx', 20 * MB).ok, true, '20 MB exactly is allowed');
	// A macro file stays refused at any size: its type is checked first.
	assert.deepEqual(k.classifyFile('big.docm', 21 * MB), { ok: false, reason: 'macro' });
	assert.equal(k.FILE_ACCEPT, '.docx,.xlsx,.pptx,.csv,.txt,.md,.markdown');
});

test('a refused file says why in Thai, never with the server\'s own hint', () => {
	assert.match(k.refusalText('macro', th), /มีมาโคร ORCA จึงไม่รับ บันทึกเป็น \.docx \.xlsx หรือ \.pptx/);
	assert.match(k.refusalText('encrypted_or_legacy', th), /ไฟล์ Office รุ่นเก่า/);
	assert.match(k.refusalText('pdf_later', th), /PDF/);
	assert.match(k.refusalText('unsupported', th), /Word, Excel, PowerPoint, CSV, TXT หรือ MD/);
	assert.equal(k.refusalText('too_large', th), 'ไฟล์ใหญ่เกิน 20 MB');
	assert.equal(k.refusalText('empty', th), 'ไฟล์นี้ว่างเปล่า');
	assert.match(k.refusalText('invalid_name', th), /เปลี่ยนชื่อ/);
	assert.match(k.refusalText(undefined, th), /ORCA รับไฟล์นี้ไม่ได้/);
	for (const reason of ['macro', 'encrypted_or_legacy', 'pdf_later', 'unsupported', 'too_large', 'empty', 'invalid_name', 'quota', 'invalid', undefined]) {
		assert.doesNotMatch(k.refusalText(reason, th), /กรุณา/, `${reason}: the workspace's copy never says กรุณา`);
		assert.doesNotMatch(k.refusalText(reason, en), /[฀-๿]/, `${reason}: English is English`);
	}
	// The code of a 202's file, or of a refused request's "reason: hint".
	assert.equal(k.refusalCode('macro'), 'macro');
	assert.equal(k.refusalCode('macro: กรุณาบันทึกเป็น .docx/.xlsx/.pptx\n'), 'macro');
	assert.equal(k.refusalCode('too_large: ไฟล์หนึ่งไฟล์ต้องไม่เกิน 20 MB'), 'too_large');
	assert.equal(k.refusalCode('library_quota: the company\'s library quota is used up'), undefined, 'a whole-request refusal is not a file\'s reason');
	assert.equal(k.refusalCode('<b>macro</b>'), undefined);
	assert.equal(k.refusalCode(undefined), undefined);
});

test('the quota explains which limit: today\'s uploads, the 1 GB, or the 1,000 items', () => {
	assert.equal(k.quotaLimit(undefined), 'unknown');
	assert.equal(k.quotaLimit(usage()), 'unknown');
	assert.equal(k.quotaLimit(usage({ uploadsToday: 50 })), 'uploads');
	assert.equal(k.quotaLimit(usage({ items: 1000 })), 'items');
	assert.equal(k.quotaLimit(usage({ bytes: 1024 * MB })), 'bytes');
	assert.equal(k.quotaLimit(usage({ bytes: 1000 * MB }), 30 * MB), 'bytes', 'what is about to be added counts');
	assert.equal(k.quotaText('uploads', usage(), th), 'วันนี้อัปโหลดครบ 50 ไฟล์แล้ว อัปโหลดต่อได้พรุ่งนี้');
	assert.match(k.quotaText('bytes', usage(), th), /พื้นที่ไฟล์ของบริษัทเต็มแล้ว \(1 GB\)/);
	assert.match(k.quotaText('items', usage(), th), /1,000 เรื่อง/);
	assert.equal(k.quotaText('unknown', undefined, th), 'โควตาคลังความรู้ของบริษัทเต็มแล้ว');
	assert.equal(k.refusalText('quota', th, 'uploads', usage()), 'วันนี้อัปโหลดครบ 50 ไฟล์แล้ว อัปโหลดต่อได้พรุ่งนี้');
});

test('a whole upload refused says what to do, by status and the server\'s code', () => {
	const say = (status, message, use) => k.uploadProblem({ status, message }, th, use);
	assert.match(say(0, ''), /ตรวจอินเทอร์เน็ต/);
	assert.match(say(429, 'library_uploads_busy: other uploads are in progress; try again shortly'), /มีการอัปโหลดอื่นอยู่/);
	assert.match(say(507, 'library_storage_full: the library\'s storage is nearly full'), /ที่เก็บไฟล์ของ ORCA ใกล้เต็ม/);
	assert.equal(say(409, 'library_quota: the company\'s library quota is used up', usage({ uploadsToday: 50 })), 'วันนี้อัปโหลดครบ 50 ไฟล์แล้ว อัปโหลดต่อได้พรุ่งนี้');
	assert.match(say(415, 'macro: กรุณาบันทึกเป็น .docx/.xlsx/.pptx'), /มีมาโคร/);
	assert.match(say(413, 'an upload holds at most 100 MB'), /100 MB/);
	assert.match(say(413, 'too_large: ไฟล์หนึ่งไฟล์ต้องไม่เกิน 20 MB'), /ใหญ่เกิน 20 MB/);
	assert.match(say(400, 'an upload holds at most 10 files'), /ไม่เกิน 10 ไฟล์/);
	assert.match(say(404, 'library_files_disabled'), /ยังอัปโหลดไฟล์เข้าคลังความรู้ไม่ได้/);
	assert.match(say(404, 'item not found'), /ไม่ได้อยู่ในพื้นที่นี้แล้ว/);
	assert.match(say(403, 'this account cannot access the workspace'), /ไม่ได้อยู่ในพื้นที่นี้แล้ว/);
	assert.match(say(503, 'library_maintenance'), /ปิดปรับปรุงชั่วคราว/);
	assert.match(say(503, 'library_unavailable: files are not available on this server'), /ORCA รับไฟล์ไม่สำเร็จ/);
	for (const status of [0, 400, 403, 404, 409, 413, 415, 429, 500, 503, 507]) assert.doesNotMatch(say(status, 'raw server text'), /raw server text/, 'never echoes the server');
});

test('uploads go in batches the server takes: 10 files and 100 MB at most, in order', () => {
	assert.deepEqual(k.uploadBatches([]), []);
	assert.deepEqual(k.uploadBatches(Array(10).fill(1)), [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
	assert.deepEqual(k.uploadBatches(Array(11).fill(1)), [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10]]);
	assert.deepEqual(k.uploadBatches([60 * MB, 40 * MB, 1]), [[0, 1], [2]], '100 MB exactly fits');
	assert.deepEqual(k.uploadBatches([60 * MB, 41 * MB, 1]), [[0], [1, 2]]);
	// Each batch: no more than 10, never over 100 MB.
	const sizes = Array.from({ length: 37 }, (_, i) => ((i * 7) % 20) * MB + 1);
	const batches = k.uploadBatches(sizes);
	assert.deepEqual(batches.flat(), sizes.map((_, i) => i), 'every file once, in order');
	for (const batch of batches) {
		assert.ok(batch.length <= 10);
		assert.ok(batch.reduce((sum, i) => sum + sizes[i], 0) <= 100 * MB);
	}
});

test('one upload\'s progress fills its files one after another', () => {
	assert.deepEqual(k.batchProgress([100, 300], 0, 400), [0, 0]);
	assert.deepEqual(k.batchProgress([100, 300], 50, 400), [0.5, 0]);
	assert.deepEqual(k.batchProgress([100, 300], 200, 400), [1, 1 / 3]);
	assert.deepEqual(k.batchProgress([100, 300], 400, 400), [1, 1]);
	assert.deepEqual(k.batchProgress([100, 300], 900, 400), [1, 1], 'never past done');
	assert.deepEqual(k.batchProgress([100, 300], 100, 0), [0, 0], 'no total: nothing to tell yet');
});

test('the upload panel: refused files say why before sending, and each row its state', () => {
	const rows = k.uploadRows([{ name: 'ราคา.xlsx', size: 10 }, { name: 'ใบสั่งซื้อ.docm', size: 10 }, { name: 'big.pptx', size: 21 * MB }], th, 7);
	assert.deepEqual(rows.map((row) => [row.key, row.state, row.reason]), [['7-0', 'waiting', undefined], ['7-1', 'refused', 'macro'], ['7-2', 'refused', 'too_large']]);
	assert.match(rows[1].message, /มีมาโคร/);
	assert.equal(k.uploadRowText(rows[0], th), 'รอส่ง');
	assert.equal(k.uploadRowText({ ...rows[0], state: 'sending', progress: 0.456 }, th), 'กำลังส่ง 45%');
	assert.equal(k.uploadRowText({ ...rows[0], state: 'sending', progress: 1 }, th), 'กำลังบันทึก…');
	assert.equal(k.uploadRowText({ ...rows[0], state: 'saved' }, th), 'อัปโหลดแล้ว ORCA กำลังอ่าน');
	assert.equal(k.uploadRowText({ ...rows[0], state: 'failed' }, th), 'ยังไม่ได้อัปโหลด');
	assert.equal(k.uploadRowText({ ...rows[0], state: 'cancelled' }, th), 'ยกเลิกแล้ว');
	assert.equal(k.uploadSummary(rows, th), 'กำลังอัปโหลด 1 ไฟล์');
	assert.equal(k.uploadSummary([{ ...rows[0], state: 'saved' }, rows[1]], th), 'อัปโหลดแล้ว 1 จาก 2 ไฟล์');
	assert.equal(k.uploadSummary([{ ...rows[0], state: 'saved' }], th), 'อัปโหลดแล้ว 1 ไฟล์');
	assert.equal(k.uploadSummary([rows[1], rows[2]], th), 'ไม่ได้อัปโหลดไฟล์');
	assert.equal(k.uploadSummary([{ ...rows[0], state: 'saved' }, { ...rows[0], key: 'x', state: 'saved' }], en), '2 files uploaded');
});

test('a version\'s reading in Thai: กำลังอ่าน, พร้อมใช้, อ่านได้บางส่วน, อ่านไม่ได้', () => {
	const read = (state) => k.fileReading({ state });
	assert.equal(read('queued'), 'reading');
	assert.equal(read('extracting'), 'reading');
	assert.equal(read('ready'), 'ready');
	assert.equal(read('partial'), 'partial');
	for (const state of ['failed', 'too_large', 'unsupported', 'needs_ocr']) assert.equal(read(state), 'failed', state);
	assert.equal(read('superseded'), undefined);
	assert.equal(k.fileReading(undefined), undefined);
	assert.deepEqual(['reading', 'ready', 'partial', 'failed'].map((reading) => k.readingLabel(reading, th)), ['กำลังอ่าน', 'พร้อมใช้', 'อ่านได้บางส่วน', 'อ่านไม่ได้']);
	// Only a read version reaches the AI.
	assert.equal(k.versionServable({ state: 'ready' }), true);
	assert.equal(k.versionServable({ state: 'partial' }), true);
	for (const state of ['queued', 'extracting', 'failed', 'too_large', 'unsupported', 'superseded']) assert.equal(k.versionServable({ state }), false, state);
	assert.equal(k.fileServable(file({ published: version(1, 'ready') })), true);
	assert.equal(k.fileServable(file({ pending: version(1, 'ready') })), false, 'a pending version never serves');
	assert.equal(k.fileServable(undefined), false);
	assert.equal(k.shownVersion(file({ published: version(1, 'ready'), pending: version(2, 'queued') })).version, 2, 'the owner sees the newer one first');
	assert.equal(k.shownVersion(file({ published: version(1, 'ready') })).version, 1);
});

test('why a version did not read, from its reason code, and the list\'s short reason', () => {
	const why = (state, errorClass) => k.failureText({ state, errorClass }, th);
	assert.match(why('unsupported', 'encrypted_or_legacy'), /ตั้งรหัสผ่านไว้/);
	assert.match(why('unsupported', 'not_ooxml'), /เนื้อในไฟล์ไม่ตรงกับนามสกุล/);
	assert.match(why('too_large', 'entries'), /ใหญ่หรือซับซ้อนเกิน/);
	assert.equal(why('too_large', 'file_size'), 'ไฟล์ใหญ่เกิน 20 MB');
	assert.match(why('failed', 'hostile'), /อาจไม่ปลอดภัย/);
	assert.match(why('failed', 'macro'), /มีมาโคร/);
	assert.match(why('failed', 'type_mismatch'), /ไม่ตรงกับนามสกุล/);
	assert.match(why('failed', 'corrupt'), /เสียหรือบันทึกไม่ครบ/);
	assert.match(why('failed', 'encoding'), /UTF-8/);
	assert.match(why('failed', 'timeout'), /อ่านไฟล์ใหม่/);
	assert.match(why('failed', 'memory'), /หน่วยความจำ/);
	assert.match(why('failed', 'quota'), /10 ล้านตัวอักษร/);
	for (const reason of ['crash', 'protocol', 'spool', 'extractor_missing', 'extractor_busy', 'storage_error']) assert.match(why('failed', reason), /ลองกด อ่านไฟล์ใหม่/, reason);
	assert.equal(why('failed', 'something new'), 'อ่านไฟล์นี้ไม่ได้');
	assert.match(why('needs_ocr'), /ภาพสแกน/);
	assert.equal(k.failureShort({ state: 'unsupported', errorClass: 'encrypted_or_legacy' }, th), 'ตั้งรหัสผ่านไว้ หรือเป็น Office รุ่นเก่า');
	assert.equal(k.failureShort({ state: 'failed', errorClass: 'hostile' }, th), 'มีส่วนที่อาจไม่ปลอดภัย');
	assert.equal(k.failureShort({ state: 'failed', errorClass: 'crash' }, th), 'อ่านไม่สำเร็จ ลองอ่านไฟล์ใหม่');
	// The part left out of a partial file.
	assert.match(k.partialText('slides', th), /200 สไลด์/);
	assert.match(k.partialText('sheets', th), /50 แผ่นงาน/);
	assert.match(k.partialText('rows', th), /50,000 แถว/);
	assert.match(k.partialText('text_cap', th), /2 ล้านตัวอักษร/);
	assert.match(k.partialText('quota', th), /โควตา/);
	assert.match(k.partialText(undefined, th), /บางส่วน/);
});

test('"อ่านไฟล์ใหม่" is offered exactly where the server takes it', () => {
	const again = (state, errorClass) => k.canReadAgain(file({ pending: version(1, state, errorClass ? { errorClass } : {}) }));
	for (const reason of ['hostile', 'macro', 'type_mismatch', 'corrupt', 'encoding']) assert.equal(again('failed', reason), false, `${reason} can't change by reading again`);
	for (const reason of ['timeout', 'memory', 'crash', 'protocol', 'storage_error', 'extractor_missing', 'quota', undefined]) assert.equal(again('failed', reason), true, `${reason} may pass`);
	assert.equal(again('too_large'), false);
	assert.equal(again('unsupported'), false);
	assert.equal(again('queued'), false, 'still waiting');
	assert.equal(again('extracting'), false, 'still being read');
	for (const state of ['ready', 'partial', 'superseded']) assert.equal(again(state), true, `${state}: a new pending version`);
	// The pending version decides, else the published one.
	assert.equal(k.canReadAgain(file({ published: version(1, 'ready'), pending: version(2, 'extracting') })), false);
	assert.equal(k.canReadAgain(file({ published: version(1, 'ready') })), true);
	assert.equal(k.canReadAgain(undefined), false);
});

test('a file row: its reading until a version serves, then its status with the new version\'s note', () => {
	const row = (status, extra) => k.fileRowState(item('f', { status, file: file(extra) }), th);
	assert.deepEqual(row('draft', { pending: version(1, 'queued') }), { status: 'reading', note: 'ORCA กำลังอ่านข้อความในไฟล์', tone: 'muted' });
	assert.deepEqual(row('draft', { pending: version(1, 'unsupported', { errorClass: 'encrypted_or_legacy' }) }), { status: 'failed', note: 'อ่านไม่ได้: ตั้งรหัสผ่านไว้ หรือเป็น Office รุ่นเก่า', tone: 'deny' });
	assert.deepEqual(row('draft', { published: version(1, 'ready') }), { status: 'draft', note: 'อ่านเสร็จแล้ว พร้อมให้ AI ใช้เมื่อเผยแพร่', tone: 'muted' });
	assert.deepEqual(row('published', { published: version(1, 'ready') }), { status: 'published' });
	assert.equal(row('published', { published: version(1, 'partial') }).note, 'อ่านได้บางส่วน');
	assert.match(row('published', { published: version(1, 'ready'), pending: version(2, 'extracting') }).note, /กำลังอ่านฉบับใหม่ AI ใช้ฉบับเดิมไปก่อน/);
	assert.match(row('published', { published: version(1, 'ready'), pending: version(2, 'failed') }).note, /ฉบับใหม่อ่านไม่ได้/);
	assert.equal(row('published', { published: version(1, 'ready'), pending: version(2, 'ready') }).note, 'ฉบับใหม่รอคุณกดใช้');
	assert.deepEqual(row('archived', { published: version(1, 'ready') }), { status: 'archived' });
	// A draft serves no one: its notes never say what the AI keeps using.
	assert.equal(row('draft', { published: version(1, 'ready'), pending: version(2, 'extracting') }).note, 'กำลังอ่านฉบับใหม่');
	assert.equal(row('draft', { published: version(1, 'ready'), pending: version(2, 'failed') }).note, 'ฉบับใหม่อ่านไม่ได้');
	// With library v2 off (a rollback) a newer version can't be put in use: no note about one.
	const off = (status, extra) => k.fileRowState(item('f', { status, file: file(extra) }), th, false);
	assert.deepEqual(off('published', { published: version(1, 'ready'), pending: version(2, 'ready') }), { status: 'published' });
	assert.deepEqual(off('published', { published: version(1, 'ready'), pending: version(2, 'extracting') }), { status: 'published' });
	assert.equal(off('published', { published: version(1, 'partial') }).note, 'อ่านได้บางส่วน');
	assert.equal(off('draft', { pending: version(1, 'unsupported', { errorClass: 'encrypted_or_legacy' }) }).status, 'failed');
	assert.deepEqual(off('draft', { published: version(1, 'ready') }), { status: 'draft' }, 'while it is off, no promise about the AI');
	// A workspace not active yet serves no one: no "AI keeps the current one", no "ready once published" (Codex S7 confirmation #5).
	const paused = (status, extra) => k.fileRowState(item('f', { status, file: file(extra) }), th, true, false);
	assert.equal(paused('published', { published: version(1, 'ready'), pending: version(2, 'extracting') }).note, 'กำลังอ่านฉบับใหม่');
	assert.equal(paused('published', { published: version(1, 'ready'), pending: version(2, 'failed') }).note, 'ฉบับใหม่อ่านไม่ได้');
	assert.equal(paused('published', { published: version(1, 'ready'), pending: version(2, 'ready') }).note, 'ฉบับใหม่รอคุณกดใช้', 'a held version can still be put in use');
	assert.deepEqual(paused('draft', { published: version(1, 'ready') }), { status: 'draft' });
	// Only the owner's own files still being read are asked about again.
	const items = [
		item('mine', { file: file({ pending: version(1, 'extracting') }) }),
		item('theirs', { canEdit: false, file: file({ pending: version(1, 'queued') }) }),
		item('read', { file: file({ published: version(1, 'ready') }) }),
		{ ...item('article'), kind: 'knowledge' }
	];
	assert.deepEqual(k.readingFileIDs(items), ['mine']);
	assert.deepEqual([0, 1, 5, 9, 60].map(k.readingPollDelay), [3000, 5000, 13000, 20000, 20000]);
});

test('hidden parts: "ไฟล์นี้มีโน้ตผู้บรรยาย 12 สไลด์ ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด"', () => {
	const read = (options, counts) => version(1, 'ready', { options: { includeHidden: false, includeComments: false, includeNotes: false, ...options }, stats: { chars: 1, hidden: hidden(counts) } });
	const lines = k.hiddenLines(read({}, { notesSlides: 12, hiddenSlides: 2, hiddenSheets: 1, hiddenText: 3, comments: 4, trackedChanges: 5 }), th);
	assert.deepEqual(lines.map((line) => line.text), [
		'ไฟล์นี้มีโน้ตผู้บรรยาย 12 สไลด์ ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด',
		'ไฟล์นี้มีสไลด์ที่ซ่อนไว้ 2 สไลด์ ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด',
		'ไฟล์นี้มีแผ่นงานที่ซ่อนไว้ 1 แผ่น ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด',
		'ไฟล์นี้มีข้อความที่ซ่อนไว้ 3 จุด ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด',
		'ไฟล์นี้มีความคิดเห็น 4 รายการ ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด',
		'ไฟล์นี้มีการแก้ไขที่ติดตามไว้ 5 จุด AI เห็นเฉพาะข้อความฉบับปัจจุบัน'
	]);
	assert.deepEqual(lines.map((line) => line.option), ['includeNotes', 'includeHidden', 'includeHidden', 'includeHidden', 'includeComments', undefined], 'tracked changes have no switch');
	// Read with notes: the AI sees them.
	const on = k.hiddenLines(read({ includeNotes: true }, { notesSlides: 12 }), th);
	assert.deepEqual(on.map((line) => [line.text, line.included]), [['AI เห็นโน้ตผู้บรรยาย 12 สไลด์', true]]);
	// The owner turned the switch: the version that serves keeps the old choice until the new one is read.
	assert.deepEqual(k.hiddenLines(read({}, { notesSlides: 12 }), th, { includeNotes: true, includeHidden: false, includeComments: false }).map((line) => line.text), ['ไฟล์นี้มีโน้ตผู้บรรยาย 12 สไลด์ ORCA กำลังอ่านใหม่ให้ AI เห็น']);
	assert.deepEqual(k.hiddenLines(read({ includeNotes: true }, { notesSlides: 12 }), th, { includeNotes: false, includeHidden: false, includeComments: false }).map((line) => line.text), ['AI ยังเห็นโน้ตผู้บรรยาย 12 สไลด์ จนกว่าฉบับใหม่จะอ่านเสร็จ']);
	assert.deepEqual(k.hiddenLines(read({}, {}), th), [], 'nothing hidden, nothing said');
	assert.deepEqual(k.hiddenLines(undefined, th), []);
	assert.doesNotMatch(k.hiddenLines(read({}, { notesSlides: 1, comments: 2 }), en).map((line) => line.text).join(' '), /[฀-๿]/);
});

test('where a piece of text is: page, slide, sheet and rows, heading, line', () => {
	const at = (locator) => k.locatorLabel(locator, th);
	assert.equal(at({ page: 3 }), 'หน้า 3');
	assert.equal(at({ page: 3, pageEnd: 4 }), 'หน้า 3–4');
	assert.equal(at({ slide: 5 }), 'สไลด์ 5');
	assert.equal(at({ sheet: 'ราคาส่ง', rowStart: 2, rowEnd: 51 }), 'แผ่นงาน “ราคาส่ง” · แถว 2–51');
	assert.equal(at({ rowStart: 1200, rowEnd: 1249 }), 'แถว 1,200–1,249', 'a CSV has rows only');
	assert.equal(at({ heading: 'การรับประกัน', paragraph: 4 }), 'หัวข้อ “การรับประกัน” · ย่อหน้า 4');
	assert.equal(at({ page: 2, heading: 'บทนำ', paragraph: 9 }), 'หน้า 2 · หัวข้อ “บทนำ”', 'a page says where; its paragraph number does not repeat it');
	assert.equal(at({ line: 120 }), 'บรรทัด 120');
	assert.equal(at({}), '');
	assert.equal(at(undefined), '');
	assert.equal(k.locatorLabel({ sheet: 'Prices', rowStart: 2, rowEnd: 2 }, en), 'Sheet “Prices” · Rows 2');
	// What a file holds, and its size.
	assert.equal(k.fileExtent(version(1, 'ready', { stats: { sheets: 3, rows: 1240, chars: 61420, hidden: hidden() } }), th), '3 แผ่นงาน · 1,240 แถว · 61,420 ตัวอักษร');
	assert.equal(k.fileExtent(version(1, 'ready', { stats: { pages: 9, paginated: false, chars: 0, hidden: hidden() } }), th), '', 'pages only when the file records them');
	assert.equal(k.fileExtent(undefined, th), '');
	assert.deepEqual([0, 900, 1500, 2.44 * MB, 20 * MB, 1024 * MB, 1.5 * 1024 * MB].map(k.formatBytes), ['0 B', '900 B', '1 KB', '2.4 MB', '20 MB', '1 GB', '1.5 GB']);
	assert.equal(k.compactCount(2_180_000, th), '2.2 ล้าน');
	assert.equal(k.compactCount(10_000_000, en), '10 M');
	assert.equal(k.compactCount(9_999, th), '9,999');
	assert.deepEqual(['docx', 'XLSX', 'pptx', 'csv', 'md', 'markdown', 'txt', 'zip'].map((ext) => k.fileTypeLabel(ext, th)), ['Word', 'Excel', 'PowerPoint', 'CSV', 'Markdown', 'Markdown', 'ไฟล์ข้อความ', 'ไฟล์']);
	assert.equal(k.factLine(['Word', '', false, undefined, '2 KB']), 'Word · 2 KB');
});

test('the company\'s quota as three meters', () => {
	const [space, text, uploads] = k.usageMeters(usage({ uploadsToday: 50 }), th);
	assert.deepEqual([space.key, space.text, Math.round(space.ratio * 100), space.full], ['bytes', '100 MB จาก 1 GB', 10, false]);
	assert.deepEqual([text.key, text.text, text.full], ['chars', '1.5 ล้าน จาก 10 ล้าน ตัวอักษร', false]);
	assert.deepEqual([uploads.key, uploads.text, uploads.ratio, uploads.full], ['uploads', '50 จาก 50 ไฟล์', 1, true]);
	assert.equal(k.usageMeters(usage({ bytes: 2048 * MB }), th)[0].ratio, 1, 'never past full');
	assert.equal(k.usageMeters(usage({ charsLimit: 0 }), th)[1].ratio, 0);
});

test('a text file\'s Thai: converted from Windows-874, and said when ORCA is not sure', () => {
	assert.equal(k.encodingNote({ encoding: 'utf-8' }, th), undefined);
	assert.equal(k.encodingNote(undefined, th), undefined);
	assert.deepEqual(k.encodingNote({ encoding: 'windows-874' }, th), { tone: 'info', text: 'ORCA แปลงภาษาไทยจากไฟล์แบบ Windows-874 ให้แล้ว' });
	assert.equal(k.encodingNote({ encoding: 'windows-874', encodingUncertain: true }, th).tone, 'warn');
	assert.match(k.encodingNote({ encoding: 'windows-874', encodingUncertain: true }, th).text, /UTF-8/);
});

test('the file routes\' own refusals in Thai', () => {
	const say = (status, message) => k.fileActionProblem({ status, message }, th);
	assert.match(say(409, 'library_file_refused: this file cannot be read; upload a new version'), /อัปโหลดฉบับใหม่แทน/);
	assert.match(say(409, 'library_version_preparing: the new version is being prepared for search; try again in a few minutes'), /อีกไม่กี่นาที/);
	assert.match(say(409, 'version_changed: the file changed; open it again'), /เปิดใหม่อีกครั้ง/);
	assert.match(say(404, 'library_files_disabled'), /ยังใช้ไฟล์ในคลังความรู้ไม่ได้/);
	assert.match(say(503, 'library_maintenance'), /ปิดปรับปรุง/);
	assert.match(say(409, 'this item changed; reload before saving again'), /โหลดใหม่/);
	assert.equal(say(500, 'x'), undefined, 'the shared messages take the rest');
});

test('the company\'s features: files with library v2, and the audience mode only to a server that knows it', () => {
	assert.deepEqual(k.libraryFeatures({}), { files: false, audienceModes: false }, 'an older server: neither');
	assert.deepEqual(k.libraryFeatures({ features: { libraryV2: false } }), { files: false, audienceModes: true });
	assert.deepEqual(k.libraryFeatures({ features: { libraryV2: true } }), { files: true, audienceModes: true });
	assert.deepEqual(k.libraryFeatures({ features: { libraryV2: 'yes' } }), { files: false, audienceModes: true }, 'only true turns files on');
});

test('"ทุกคน (อัปเดตอัตโนมัติ)": nobody listed, everyone in the workspace now and later', () => {
	const everyone = { unitIDs: ['sales'], memberIDs: ['a'] };
	assert.equal(k.audienceMode({ memberIDs: [], unitIDs: [], audienceMode: 'everyone_live' }, everyone), 'everyone_live');
	assert.equal(k.audienceMode({ memberIDs: [], unitIDs: [], audienceMode: 'list' }, everyone), 'me');
	assert.equal(k.audienceMode({ memberIDs: ['a'], unitIDs: ['sales'] }, everyone), 'everyone', 'today\'s snapshot stays itself');
	assert.deepEqual(k.audienceFor('everyone_live', { unitIDs: ['sales'], memberIDs: ['a'] }, everyone), { unitIDs: [], memberIDs: [] });
	assert.equal(k.audienceWireMode('everyone_live'), 'everyone_live');
	for (const mode of ['everyone', 'departments', 'people', 'me', 'mixed']) assert.equal(k.audienceWireMode(mode), 'list', mode);
	const live = { ownerID: 'me', memberIDs: [], unitIDs: [], audienceMode: 'everyone_live' };
	assert.deepEqual([...k.audiencePeople(live, [], ['me', 'a', 'b', 'c'])].sort(), ['a', 'b', 'c', 'me']);
	assert.deepEqual([...k.audiencePeople({ ...live, audienceMode: 'list' }, [], ['me', 'a', 'b'])], ['me'], 'a list counts its list');
	const chip = k.audienceChip(live, { departments: [], workspaceMemberIDs: ['me'], personName: (id) => id, departmentName: (id) => id }, th);
	assert.deepEqual(chip, { kind: 'everyone', label: 'ทุกคน' }, 'even in a one-person workspace');
	// A prompt for everyone, live, reads an article for one person: who can't use it is named.
	const mismatch = k.templateMismatches(live, [{ ...item('art'), kind: 'knowledge', memberIDs: [], unitIDs: [] }], { departments: [], personName: (id) => id, departmentName: (id) => id, workspaceMemberIDs: ['me', 'a'] }, th);
	assert.equal(mismatch.length, 1);
	assert.match(mismatch[0].who, /a/);
});

test('a save sends what the item has, with the audience mode only where the server knows it', () => {
	const article = { kind: 'knowledge', title: 'ก', summary: 's', content: 'c', parameters: [], knowledgeIDs: [], memberIDs: ['a'], unitIDs: ['u'], status: 'published', version: 4, audienceMode: 'list' };
	assert.deepEqual(k.libraryInput(article, { status: 'archived' }, { audienceModes: false }), { kind: 'knowledge', title: 'ก', summary: 's', content: 'c', parameters: [], knowledgeIDs: [], memberIDs: ['a'], unitIDs: ['u'], status: 'archived', version: 4 });
	assert.equal(k.libraryInput(article, { status: 'archived' }, { audienceModes: true }).audienceMode, 'list');
	// A live item stays live when archived: an absent mode would be refused (409) on it.
	const live = k.libraryInput({ ...article, audienceMode: 'everyone_live', memberIDs: ['stale'] }, { status: 'archived' }, { audienceModes: true });
	assert.deepEqual([live.audienceMode, live.memberIDs, live.unitIDs], ['everyone_live', [], []]);
	// A file's item has no text, fields or references of its own.
	const saved = k.libraryInput({ ...article, kind: 'file', content: 'x', parameters: [{ name: 'p', label: 'P', required: true }], knowledgeIDs: ['k'] }, {}, { audienceModes: true });
	assert.deepEqual([saved.content, saved.parameters, saved.knowledgeIDs], ['', [], []]);
	const prompt = k.libraryInput({ ...article, kind: 'template', parameters: [{ name: 'p', label: 'P', required: true }], knowledgeIDs: ['k'] }, {}, { audienceModes: false });
	assert.deepEqual([prompt.parameters.length, prompt.knowledgeIDs], [1, ['k']]);
});

test('"รับช่วงดูแล" is offered to a manager, with files on, for an item whose owner left', () => {
	const members = [{ id: 'me', status: 'active' }, { id: 'present' }, { id: 'suspended', status: 'suspended' }];
	const offered = (ownerID, extra = {}) => k.canTakeOver({ ownerID, canEdit: false, ...extra.item }, { files: true, canManage: true, me: 'me', workspaceMembers: members, ...extra.context });
	assert.equal(k.ownerDeparted({ ownerID: 'gone' }, members), true);
	assert.equal(k.ownerDeparted({ ownerID: 'suspended' }, members), true, 'a suspended owner can\'t act');
	assert.equal(k.ownerDeparted({ ownerID: 'present' }, members), false);
	assert.equal(offered('gone'), true);
	assert.equal(offered('present'), false, 'the owner is still here');
	assert.equal(offered('gone', { context: { canManage: false } }), false, 'only owners and admins');
	assert.equal(offered('gone', { context: { files: false } }), false, 'the route needs library v2');
	assert.equal(offered('me', { item: { canEdit: true } }), false, 'not one\'s own');
});

test('"ลองถาม AI" asks about a file only once the AI can read it', () => {
	const files = [
		item('reading', { status: 'published', updatedAt: '2026-09-28T00:00:00Z', file: file({ pending: version(1, 'queued') }) }),
		item('ready', { status: 'published', updatedAt: '2026-09-27T00:00:00Z', file: file({ published: version(1, 'ready') }) })
	];
	assert.equal(k.askItem(files, undefined, 'file').id, 'ready');
	assert.equal(k.askItem(files, files[0], 'file').id, 'ready', 'an unread open file is not asked about');
	assert.equal(k.askPrompt({ kind: 'file', title: 'ราคา 2569' }, th), 'ช่วยสรุปไฟล์ “ราคา 2569” จากคลังความรู้ของบริษัทให้หน่อย');
	// The list's search finds a file by its name too.
	const named = item('n', { title: 'ราคา', file: file({ fileName: 'price-list-2569.xlsx' }) });
	assert.deepEqual(k.filterLibrary([named], 'file', 'all', 'price-list').map((entry) => entry.id), ['n']);
	assert.deepEqual(k.libraryCounts([named, item('p', { status: 'published' })], 'file'), { published: 1, draft: 1, archived: 0, current: 2 });
});

test('what an answer leaves out stays: a save\'s file block, a takeover\'s text (Codex S7 #2-#3)', () => {
	const file = { published: version(1, 'ready'), options: { includeHidden: false, includeComments: false, includeNotes: false, allowDownload: true, reviewBeforeUpdate: false } };
	const known = { ...item('f', { status: 'draft', file }), title: 'เดิม', version: 3 };
	// A save answers the row without its file block, one version on.
	const saved = k.keepOmitted({ ...item('f', { status: 'published' }), title: 'ใหม่', file: undefined, version: 4 }, known);
	assert.equal(saved.title, 'ใหม่');
	assert.equal(saved.status, 'published');
	assert.equal(saved.file, file, 'the file block the page had');
	assert.equal(k.itemIncomplete(saved), false);
	// A newer block in the answer wins.
	const newer = { published: version(2, 'ready') };
	assert.equal(k.keepOmitted({ ...item('f'), file: newer, version: 4 }, known).file, newer);
	// A takeover answers an article without its text, one version on.
	const article = { ...item('a'), kind: 'knowledge', content: 'นโยบายคืนสินค้า', file: undefined, version: 3 };
	const taken = k.keepOmitted({ ...article, content: '', ownerID: 'me', version: 4 }, article);
	assert.equal(taken.content, 'นโยบายคืนสินค้า');
	assert.equal(taken.ownerID, 'me');
	assert.equal(taken.version, 4);
	// Someone else changed it in between (Codex S7 confirmation #1): what the page has is stale,
	// so nothing is filled in and the page asks for the item again.
	const stale = k.keepOmitted({ ...article, content: '', ownerID: 'me', version: 6 }, article);
	assert.equal(stale.content, '');
	assert.equal(k.itemIncomplete(stale), true);
	const staleFile = k.keepOmitted({ ...item('f'), file: undefined, version: 9 }, known);
	assert.equal(staleFile.file, undefined);
	assert.equal(k.itemIncomplete(staleFile), true);
	// Another item, or none known: the answer as it is.
	assert.equal(k.keepOmitted(saved, undefined), saved);
	assert.equal(k.keepOmitted({ ...item('x'), file: undefined, version: 4 }, known).file, undefined);
	assert.equal(k.itemIncomplete({ ...article }), false);
});

test('with unsaved text in the editor, a refresh brings only the files\' reading (Codex S7 #8)', () => {
	const editing = { ...item('f', { status: 'draft', file: { pending: version(1, 'extracting') } }), title: 'ชื่อที่กำลังแก้' };
	const article = { ...item('a'), kind: 'knowledge', content: 'เดิม' };
	const gone = { ...item('g'), kind: 'knowledge', content: 'ไม่อยู่ในรายการแล้ว' };
	const fresh = [
		{ ...item('f', { status: 'draft', file: { published: version(1, 'ready') } }), title: 'ชื่อบนเซิร์ฟเวอร์', version: 9 },
		{ ...article, content: 'ใหม่' },
		item('new-file')
	];
	const next = k.withReading([editing, article, gone], fresh, 'f');
	assert.deepEqual(next.map((entry) => entry.id), ['f', 'a'], 'nothing is added under the editor; an item no longer listed goes (Codex S7 confirmation #4)');
	assert.equal(next[0].title, 'ชื่อที่กำลังแก้');
	assert.equal(next[0].version, editing.version, 'the version the editor saves against stays');
	assert.equal(next[0].file.published.state, 'ready', 'the reading came in: the file can be published');
	assert.equal(next[1], article, 'articles are left as they are');
	// The item being edited stays even when it is no longer listed: its save says what changed.
	assert.deepEqual(k.withReading([editing, article], [article], 'f').map((entry) => entry.id), ['f', 'a']);
});

test('an upload batch\'s failure: unknown once sent in full, unless refused before storing (Codex S7 #5, confirmation #2)', () => {
	const f = (extra) => k.uploadFailure({ sent: true, aborted: false, network: false, status: 500, message: '', ...extra });
	// Sent in full: a cancel, a lost connection, a server failure, or access or the flag lost midway.
	for (const [label, extra] of [['cancel', { aborted: true, status: 0 }], ['network', { network: true, status: 0 }], ['500', {}], ['504', { status: 504, message: '{"error":"backend_timeout"}' }], ['flag off midway', { status: 404, message: 'library_files_disabled: knowledge library v2 is off' }], ['access lost midway', { status: 403, message: 'forbidden' }], ['conflict', { status: 409, message: 'this item changed' }]])
		assert.deepEqual(f(extra), { outcome: 'unknown', reload: true }, label);
	// Refused before storing anything: each file's reason, a busy library, a body it does not take.
	assert.deepEqual(f({ status: 409, message: 'quota: โควตาคลังความรู้ของบริษัทเต็มแล้ว' }), { outcome: 'refused', reason: 'quota', reload: false });
	assert.deepEqual(f({ status: 415, message: 'unsupported: hint' }), { outcome: 'refused', reason: 'unsupported', reload: false });
	assert.deepEqual(f({ status: 429, message: 'library_uploads_busy: other uploads are in progress; try again shortly' }), { outcome: 'failed', reason: undefined, reload: false });
	assert.deepEqual(f({ status: 413, message: 'an upload holds at most 100 MB' }), { outcome: 'failed', reason: undefined, reload: false });
	assert.deepEqual(f({ status: 400, message: 'invalid' }), { outcome: 'failed', reason: 'invalid', reload: false });
	// Not sent in full: nothing was stored.
	const partial = (extra) => k.uploadFailure({ sent: false, aborted: false, network: false, status: 0, message: '', ...extra });
	assert.deepEqual(partial({ aborted: true }), { outcome: 'cancelled', reload: false });
	assert.deepEqual(partial({ network: true }), { outcome: 'failed', reason: undefined, reload: false });
	assert.deepEqual(partial({ status: 404, message: 'library_files_disabled: off' }), { outcome: 'failed', reason: undefined, reload: false });
});

test('a batch sent in full whose answer did not come says so, and is not counted as uploaded (Codex S7 #5)', () => {
	const row = (state, extra = {}) => ({ key: state, name: `${state}.xlsx`, size: 1, state, progress: 0, ...extra });
	assert.equal(k.uploadRowText(row('unknown'), th), 'ส่งครบแล้ว แต่ไม่ได้รับคำตอบ ดูในรายการด้านล่างก่อนส่งซ้ำ');
	assert.equal(k.uploadSummary([row('unknown'), row('cancelled')], th), 'ยังไม่รู้ผลของ 1 ไฟล์');
	assert.equal(k.uploadSummary([row('unknown'), row('saved')], th), 'อัปโหลดแล้ว 1 จาก 2 ไฟล์');
	assert.equal(k.uploadSummary([row('unknown'), row('sending')], th), 'กำลังอัปโหลด 1 ไฟล์');
});
