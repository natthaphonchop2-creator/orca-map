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
	assert.equal(toolPresentation({ name: 'orca_template_use' }).label, 'เตรียมเทมเพลตพร้อมความรู้');
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
