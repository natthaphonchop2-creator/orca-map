import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const tools = await importTypeScript(new URL('./program-tools.ts', import.meta.url));
const {
	MAX_PROGRAM_TOOLS, toolChangesData, toolUnspecified, groupTools, capSelection, readOnlyAvailable, initialPreset,
	presetSelection, initialSelection, savedSelection, selectableUnder, toggleTool, toggleGroup, groupChecked,
	presetFor, selectionReadOnly, saveProblem, programSaveInput, accessSummary, toolCopy, toolHintText
} = tools;

const tool = (name, annotations, extra = {}) => ({
	name,
	description: `${name} description`,
	inputSchema: { type: 'object' },
	...(annotations === undefined ? { definition: { name } } : { definition: { name, annotations } }),
	...extra
});
const read = (name) => tool(name, { readOnlyHint: true });
const list = [
	read('list_invoices'),
	read('get_invoice'),
	tool('create_invoice', { readOnlyHint: false }),
	tool('void_invoice', { readOnlyHint: true, destructiveHint: true }),
	tool('email_invoice', undefined),
	tool('sync', {})
];

test('only a tool annotated readOnlyHint:true and not destructive only reads (the backend approval rule)', () => {
	assert.equal(toolChangesData(read('a')), false);
	assert.equal(toolChangesData(tool('b', { readOnlyHint: true, destructiveHint: false })), false);
	assert.equal(toolChangesData(tool('c', { readOnlyHint: true, destructiveHint: null })), false);
	// Everything else changes data: destructive, false, missing hints, no annotations, no definition.
	assert.equal(toolChangesData(tool('d', { readOnlyHint: true, destructiveHint: true })), true);
	assert.equal(toolChangesData(tool('e', { readOnlyHint: false })), true);
	assert.equal(toolChangesData(tool('f', {})), true);
	assert.equal(toolChangesData(tool('g', undefined)), true);
	assert.equal(toolChangesData({ name: 'h' }), true);
	// A hint of another type does not decode on the server, which then counts a write.
	assert.equal(toolChangesData(tool('i', { readOnlyHint: 'true' })), true);
	assert.equal(toolChangesData(tool('j', { readOnlyHint: true, destructiveHint: 'no' })), true);
	assert.equal(toolChangesData({ name: 'k', definition: { annotations: [] } }), true);
	assert.equal(toolChangesData({ name: 'k2', definition: { annotations: null } }), true);
	// Only the reviewed definition counts, as on the server: hints on the tool itself are ignored.
	assert.equal(toolChangesData({ name: 'k3', inputSchema: {}, annotations: { readOnlyHint: true } }), true);
	// A definition sent as JSON text is read the same way; broken JSON is a write.
	assert.equal(toolChangesData({ name: 'l', definition: JSON.stringify({ annotations: { readOnlyHint: true } }) }), false);
	assert.equal(toolChangesData({ name: 'm', definition: '{broken' }), true);
});

test('tools group into ดูข้อมูล and สร้าง / แก้ไข / ลบ; unannotated ones are tagged ผู้ให้บริการไม่ได้ระบุ', () => {
	const groups = groupTools([...list, read('list_invoices')]);
	assert.deepEqual(groups.read.map((item) => item.name), ['list_invoices', 'get_invoice']);
	assert.deepEqual(groups.change.map((item) => item.name), ['create_invoice', 'void_invoice', 'email_invoice', 'sync']);
	assert.deepEqual(groups.unspecified, ['email_invoice', 'sync']);
	assert.equal(toolUnspecified(tool('x', { readOnlyHint: false })), false);
	assert.equal(toolUnspecified(tool('y', { title: 'Only a title' })), true);
	assert.equal(toolUnspecified(tool('z', undefined)), true, 'no annotations at all');
	assert.equal(toolUnspecified({ name: 'w' }), true, 'no definition at all');
	assert.equal(toolUnspecified(tool('v', { readOnlyHint: true, destructiveHint: true })), false);
});

test('a new program starts read-only; with nothing that qualifies the read-only preset is off and nothing is ticked', () => {
	assert.equal(readOnlyAvailable(list), true);
	assert.equal(initialPreset(list), 'read');
	assert.deepEqual(initialSelection(list), ['list_invoices', 'get_invoice']);
	assert.deepEqual(presetSelection(list, 'write'), list.map((item) => item.name));
	const unannotated = [tool('a', undefined), tool('b', {})];
	assert.equal(readOnlyAvailable(unannotated), false);
	assert.equal(initialPreset(unannotated), 'write');
	assert.deepEqual(initialSelection(unannotated), []);
	assert.equal(selectableUnder('read', list[2]), false);
	assert.equal(selectableUnder('read', list[0]), true);
	assert.equal(selectableUnder('write', list[2]), true);
});

test('every selection is capped at 100 tools, including เลือกทั้งหมด', () => {
	const many = Array.from({ length: 130 }, (_, index) => read(`t${index}`));
	assert.equal(MAX_PROGRAM_TOOLS, 100);
	assert.equal(presetSelection(many, 'read').length, 100);
	const names = many.map((item) => item.name);
	const all = toggleGroup([], names);
	assert.equal(all.length, 100);
	assert.equal(groupChecked(all, names), false, 'a capped group is not fully ticked');
	assert.deepEqual(toggleTool(all, 't120'), all, 'no tick past the cap');
	assert.equal(toggleTool(all, 't0').length, 99, 'unticking still works');
	assert.deepEqual(capSelection(['a', 'a', '', 'b']), ['a', 'b']);
	// A fully ticked group unticks.
	assert.deepEqual(toggleGroup(['a', 'b', 'c'], ['a', 'b']), ['c']);
	assert.deepEqual(toggleGroup(['c'], ['a', 'b']), ['c', 'a', 'b']);
});

test('the preset follows the selection, and a saved one keeps only tools the program still offers', () => {
	assert.equal(presetFor(['list_invoices'], list), 'read');
	assert.equal(presetFor(['list_invoices', 'create_invoice'], list), 'write');
	assert.equal(presetFor([], list), 'read');
	assert.deepEqual(savedSelection(list, ['get_invoice', 'gone', 'create_invoice']), ['get_invoice', 'create_invoice']);
	assert.equal(selectionReadOnly(['list_invoices', 'get_invoice'], list), true);
	assert.equal(selectionReadOnly(['list_invoices', 'gone'], list), false, 'a tool that is not offered is never assumed to read');
	assert.equal(selectionReadOnly([], list), false);
});

test('the save sends reviewedTools:true, reviewedReadOnly only for reads, and the note as typed or ""', () => {
	const readOnly = programSaveInput({ name: '  FlowAccount ', note: '  ', mcpID: 'src', selected: ['list_invoices', 'gone', 'get_invoice'], tools: list });
	assert.deepEqual(readOnly, {
		name: 'FlowAccount', description: '', mcpID: 'src', toolNames: ['list_invoices', 'get_invoice'],
		scopeNote: '', reviewedTools: true, reviewedReadOnly: true, enabled: true
	});
	const withWrites = programSaveInput({ name: 'F', note: ' บัญชีฝ่ายบัญชี ', mcpID: 'src', selected: ['list_invoices', 'email_invoice'], tools: list });
	assert.equal(withWrites.reviewedTools, true);
	assert.equal(withWrites.reviewedReadOnly, false, 'an unannotated tool is never saved as read-only');
	assert.equal(withWrites.scopeNote, 'บัญชีฝ่ายบัญชี');
	const edit = programSaveInput({ name: 'F', note: '', mcpID: 'src', selected: ['get_invoice'], tools: list, existing: { description: 'd', enabled: false, version: 7 } });
	assert.equal(edit.version, 7);
	assert.equal(edit.enabled, false, 'editing keeps a paused program paused');
	assert.equal(edit.description, 'd');
	assert.equal(programSaveInput({ name: 'F', note: '', mcpID: 's', selected: Array.from({ length: 120 }, (_, index) => `t${index}`), tools: Array.from({ length: 120 }, (_, index) => read(`t${index}`)) }).toolNames.length, 100);
	assert.equal(saveProblem({ name: ' ', selected: ['a'] }), 'name');
	assert.equal(saveProblem({ name: 'x', selected: [] }), 'tools');
	assert.equal(saveProblem({ name: 'x', selected: Array.from({ length: 101 }, (_, index) => `${index}`) }), 'too-many');
	assert.equal(saveProblem({ name: 'x', selected: ['a'] }), '');
});

test('a saved program reads "AI ทำได้ N อย่าง · อ่านอย่างเดียว" only when every allowed tool reads', () => {
	assert.deepEqual(accessSummary({ toolNames: ['list_invoices'], reviewedReadOnly: false, reviewedTools: true, tools: list }), { count: 1, readOnly: true, reviewed: true });
	assert.deepEqual(accessSummary({ toolNames: ['list_invoices', 'sync'], reviewedReadOnly: false, reviewedTools: true, tools: list }), { count: 2, readOnly: false, reviewed: true });
	assert.deepEqual(accessSummary({ toolNames: [], reviewedReadOnly: false, reviewedTools: false, tools: [] }), { count: 0, readOnly: false, reviewed: false });
});

test('a tool shows the provider title first, and one line of description', () => {
	assert.deepEqual(toolCopy(tool('list_invoices', { title: 'ดูรายการใบแจ้งหนี้', readOnlyHint: true }, { description: 'ค้นใบแจ้งหนี้\nรายละเอียดยาว' })), { label: 'ดูรายการใบแจ้งหนี้', description: 'ค้นใบแจ้งหนี้' });
	assert.deepEqual(toolCopy({ name: 'x', description: 'Search files', definition: { title: 'Search', name: 'x' } }), { label: 'Search', description: 'Search files' });
	// A short description becomes the label and is not repeated.
	assert.deepEqual(toolCopy({ name: 'find_docs', description: 'Search files' }), { label: 'Search files', description: '' });
	assert.equal(toolHintText(tool('a', { readOnlyHint: true, destructiveHint: false })), 'readOnlyHint: true, destructiveHint: false');
	assert.equal(toolHintText(tool('b', undefined)), 'no annotations');
});

test('an AI call is named by its program’s title everywhere (Home, ตรวจสอบ, รออนุมัติ), not the English id or the description', () => {
	const connections = [
		{ id: 'conn-flow', tools: [
			{ name: 'list_quotations', description: 'ค้นใบเสนอราคาตามสถานะหรือลูกค้า', definition: { name: 'list_quotations', annotations: { title: 'ดูรายการใบเสนอราคา', readOnlyHint: true } } },
			{ name: 'create_quotation', description: 'ออกใบเสนอราคาฉบับร่างให้ลูกค้า', definition: { name: 'create_quotation', annotations: { title: 'สร้างใบเสนอราคา', readOnlyHint: false } } }
		] },
		{ id: 'conn-slack', tools: [{ name: 'search_messages', description: 'Search messages in channels you can read', definition: { name: 'search_messages' } }] }
	];
	assert.equal(tools.eventToolLabel(connections, 'conn-flow', 'list_quotations'), 'ดูรายการใบเสนอราคา');
	assert.equal(tools.eventToolLabel(connections, undefined, 'create_quotation'), 'สร้างใบเสนอราคา', 'any program that has it');
	assert.equal(tools.eventToolLabel(connections, 'conn-slack', 'search_messages'), 'Search messages in channels you can read');
	assert.equal(tools.eventToolLabel([], 'gone', 'get_invoice'), tools.toolCopy({ name: 'get_invoice' }).label, 'a removed program still gets a readable name');
});
