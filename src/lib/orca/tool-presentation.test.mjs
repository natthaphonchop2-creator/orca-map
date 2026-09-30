import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = stripTypeScriptTypes(await readFile(new URL('./tool-presentation.ts', import.meta.url), 'utf8'));
const { toolPresentation, matchesToolSearch } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('known tools receive a readable label while preserving the exact identifier and description', () => {
	const input = { name: 'list_files', description: 'List files in the connected account.' };
	const result = toolPresentation(input, 'th');
	assert.equal(result.label, 'ดูรายการไฟล์');
	assert.equal(result.identifier, 'list_files');
	assert.equal(result.description, input.description);
	assert.equal(input.name, 'list_files');
	assert.equal(toolPresentation(input, 'en').label, 'List files');
	assert.equal(toolPresentation({ name: 'orca_template_use' }).label, 'เตรียมคำสั่งสำเร็จรูปพร้อมความรู้ประกอบ');
});

test('an explicit provider title wins, including the annotation title fallback', () => {
	assert.equal(toolPresentation({ name: 'get_file', title: '  ดูรายละเอียดเอกสาร  ', annotations: { title: 'Older title' } }).label, 'ดูรายละเอียดเอกสาร');
	assert.equal(toolPresentation({ name: 'get_file', title: ' ', annotations: { title: 'File properties' } }).label, 'File properties');
});

test('short provider descriptions clarify unknown tools without a made-up translation', () => {
	assert.equal(toolPresentation({ name: 'fetch_v2_contact_rows', description: 'ดูรายชื่อลูกค้าและผู้ขาย' }).label, 'ดูรายชื่อลูกค้าและผู้ขาย');
	const longDescription = 'Read this provider description before using the tool. '.repeat(5);
	assert.equal(toolPresentation({ name: 'fetch_v2_contact_rows', description: longDescription }).label, 'Fetch v2 contact rows');
	assert.equal(toolPresentation({ name: 'fetch_v2_contact_rows', description: longDescription }).description, longDescription.trim());
});

test('unknown identifiers are only formatted, without invented capability labels', () => {
	assert.equal(toolPresentation({ name: 'getHTTPInvoiceById' }).label, 'Get HTTP Invoice By Id');
	assert.equal(toolPresentation({ name: 'peak-document.get_v2' }).label, 'Peak document get v2');
	assert.equal(toolPresentation({ name: 'vendor_orca_template_use' }).label, 'Vendor orca template use');
	assert.equal(toolPresentation({ name: 'https://api.example/invoices' }).label, 'https://api.example/invoices');
	assert.equal(toolPresentation({ name: '__proto__' }).label, 'Proto');
	assert.equal(toolPresentation({ name: 'toString' }).label, 'To String');
});

test('search matches both local labels, raw names, and descriptions without changing identifiers', () => {
	const tool = { name: 'orca_knowledge_search', description: 'Published business knowledge in this department' };
	assert.equal(matchesToolSearch(tool, 'ความรู้', 'en'), true);
	assert.equal(matchesToolSearch(tool, 'Search business', 'th'), true);
	assert.equal(matchesToolSearch(tool, 'ORCA_KNOWLEDGE_SEARCH', 'th'), true);
	assert.equal(matchesToolSearch(tool, 'published department'), true);
	assert.equal(matchesToolSearch(tool, 'published accounting'), false);
	assert.equal(matchesToolSearch(tool, '   '), true);
});

test('native business API tools are named as readable tasks while keeping permission identifiers intact', () => {
  for (const [name, label] of [
    ['facebook_page_get', 'ดูข้อมูลเพจ Facebook'],
    ['facebook_page_posts', 'อ่านโพสต์ล่าสุดของเพจ Facebook'],
    ['line_bot_get', 'ดูข้อมูลบัญชี LINE OA'],
    ['line_message_quota_get', 'ดูโควตาข้อความ LINE OA'],
    ['line_message_usage_get', 'ดูยอดข้อความ LINE OA เดือนนี้'],
    ['instagram_account_get', 'ดูข้อมูลบัญชี Instagram'],
    ['instagram_media_list', 'อ่านโพสต์ล่าสุดของ Instagram']
  ]) {
    assert.equal(toolPresentation({ name }).label, label);
    assert.equal(toolPresentation({ name }).identifier, name);
  }
  assert.notEqual(toolPresentation({ name: 'custom_facebook_page_get' }).label, 'ดูข้อมูลเพจ Facebook');
});

test('LINE v2: ORCA’s own English title reads in Thai; any other title, or a lookalike name, stays as its provider wrote it', () => {
  const own = { name: 'line_push_text', title: 'Send a text message to one customer', description: 'Send one text message to one customer. A manager must approve every send in ORCA.' };
  assert.equal(toolPresentation(own, 'th').label, 'ส่งข้อความถึงลูกค้า 1 คน');
  assert.equal(toolPresentation(own, 'en').label, 'Send a text message to one customer');
  assert.match(toolPresentation(own, 'th').description, /ตรวจชื่อผู้รับกับ LINE/);
  assert.equal(toolPresentation(own, 'en').description, own.description, 'English keeps the tool’s own description');
  assert.equal(toolPresentation(own).identifier, 'line_push_text');
  // Another server's tool under the same name but its own title keeps both its title and its description.
  const other = { name: 'line_push_text', title: 'Delete every customer', description: 'Removes customers.' };
  assert.equal(toolPresentation(other, 'th').label, 'Delete every customer');
  assert.equal(toolPresentation(other, 'th').description, 'Removes customers.');
  // ORCA's title on another identifier is not translated.
  assert.equal(toolPresentation({ name: 'vendor_line_push_text', title: 'Send a text message to one customer' }, 'th').label, 'Send a text message to one customer');
  assert.equal(toolPresentation({ name: 'line_push_text_v9' }, 'th').label, 'Line push text v9');
  // Search finds a LINE tool by its Thai words, its English title and its identifier.
  assert.equal(matchesToolSearch(own, 'บรอดแคสต์'), false);
  assert.equal(matchesToolSearch({ name: 'line_broadcast_text', title: 'Send a text message to all friends' }, 'บรอดแคสต์'), true);
  assert.equal(matchesToolSearch(own, 'manager approve', 'th'), true, 'the English description stays searchable in Thai');
  assert.equal(matchesToolSearch(own, 'ลูกค้า line_push_text', 'en'), true);
});

test('LINE v2: every new tool has a Thai label paired with its exact English title', () => {
  for (const [name, th, en] of [
    ['line_followers_get', 'ดูจำนวนเพื่อนและคนที่บล็อก', 'Get friend counts'],
    ['line_demographics_get', 'ดูเพศ อายุ และพื้นที่ของเพื่อน', 'Get friend demographics'],
    ['line_message_deliveries_get', 'ดูจำนวนข้อความที่ส่งในแต่ละวัน', 'Get messages sent on a day'],
    ['line_broadcast_stats_get', 'ดูสถิติการเปิดอ่านและคลิกของบรอดแคสต์', "Get a broadcast's opens and clicks"],
    ['line_profile_get', 'ดูชื่อ LINE ของลูกค้า', "Get a customer's LINE name"],
    ['line_richmenus_list', 'ดูริชเมนูทั้งหมด', 'List rich menus'],
    ['line_user_richmenu_get', 'ดูริชเมนูที่ลูกค้าคนหนึ่งเห็น', "Get a customer's rich menu"],
    ['line_push_text', 'ส่งข้อความถึงลูกค้า 1 คน', 'Send a text message to one customer'],
    ['line_broadcast_text', 'ส่งข้อความถึงเพื่อนทุกคน (บรอดแคสต์)', 'Send a text message to all friends'],
    ['line_default_richmenu_set', 'เปลี่ยนริชเมนูหลักของทุกคน', 'Set the default rich menu'],
    ['line_default_richmenu_clear', 'ยกเลิกริชเมนูหลักที่ตั้งผ่าน API', 'Clear the default rich menu'],
    ['line_user_richmenu_link', 'ตั้งริชเมนูให้ลูกค้า 1 คน', 'Set a rich menu for one customer'],
    ['line_user_richmenu_unlink', 'ให้ลูกค้า 1 คนกลับไปเห็นริชเมนูหลัก', "Remove one customer's own rich menu"]
  ]) {
    assert.equal(toolPresentation({ name, title: en }, 'th').label, th, name);
    assert.equal(toolPresentation({ name, title: en }, 'en').label, en, name);
    assert.equal(toolPresentation({ name }, 'th').label, th, `${name} without a title`);
    assert.match(toolPresentation({ name, title: en }, 'th').description, /[฀-๿]/, name);
  }
});
