import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const k = await importTypeScript(new URL('./knowledge.ts', import.meta.url));
const th = (thai) => thai;
const en = (_thai, english) => english;

const hub = (id, extra = {}) => ({
	id, name: id, description: '', connectionID: 'c', toolNames: ['t'], memberIDs: [], unitIDs: [], dailyLimit: 100,
	status: 'active', version: 3, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0, ...extra
});
const item = (id, extra = {}) => ({
	id, kind: 'knowledge', title: id, summary: '', content: 'x', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [],
	status: 'published', version: 1, hubID: 'h', ownerID: 'me', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', canEdit: true, ...extra
});
const departments = [
	{ unitID: 'sales', name: 'ฝ่ายขาย', memberIDs: ['me', 'a', 'b'], version: 1 },
	{ unitID: 'acc', name: 'ฝ่ายบัญชี', memberIDs: ['c'], version: 1 }
];

test('the library opens the only workspace, the remembered one, or the first active one', () => {
	const sales = hub('ผู้ช่วยฝ่ายขาย', { memberIDs: ['me'] });
	const accounts = hub('บัญชี', { memberIDs: ['me'] });
	const draft = hub('ก ร่าง', { memberIDs: ['me'], status: 'draft' });
	const other = hub('อื่น', { memberIDs: ['x'] });
	const one = k.libraryScope({ hubs: [sales, other], currentUserID: 'me', canManage: true });
	assert.equal(one.kind, 'hub');
	assert.equal(one.hub.id, sales.id);
	assert.deepEqual(one.choices.map((h) => h.id), [sales.id], 'a workspace the viewer is not in is no choice');
	const several = k.libraryScope({ hubs: [draft, sales, accounts], currentUserID: 'me', canManage: false });
	assert.deepEqual(several.choices.map((h) => h.id), ['บัญชี', 'ผู้ช่วยฝ่ายขาย', 'ก ร่าง'], 'active workspaces first, then by name');
	assert.equal(several.hub.id, 'บัญชี');
	assert.equal(k.libraryScope({ hubs: [draft, sales, accounts], currentUserID: 'me', canManage: false, rememberedID: sales.id }).hub.id, sales.id);
	assert.equal(k.libraryScope({ hubs: [sales, accounts], currentUserID: 'me', canManage: false, rememberedID: 'gone' }).hub.id, 'บัญชี');
	// Membership through a department counts (the server resolves it).
	assert.equal(k.libraryScope({ hubs: [hub('d', { memberIDs: [], effectiveMemberIDs: ['me'] })], currentUserID: 'me', canManage: false }).kind, 'hub');
	// Archived workspaces never open.
	assert.equal(k.libraryScope({ hubs: [hub('old', { memberIDs: ['me'], status: 'archived' })], currentUserID: 'me', canManage: false }).kind, 'request');
});

test('prerequisites: create, join (managers only), request (employees) and missing', () => {
	assert.deepEqual(k.libraryScope({ hubs: [], currentUserID: 'me', canManage: true }), { kind: 'create' });
	assert.deepEqual(k.libraryScope({ hubs: [], currentUserID: 'me', canManage: false }), { kind: 'request' });
	const a = hub('a', { memberIDs: ['x'] });
	const b = hub('b', { memberIDs: ['x'], status: 'paused' });
	const join = k.libraryScope({ hubs: [b, a], currentUserID: 'me', canManage: true });
	assert.equal(join.kind, 'join');
	assert.deepEqual(join.hubs.map((h) => h.id), ['a', 'b']);
	assert.deepEqual(k.libraryScope({ hubs: [b, a], currentUserID: 'me', canManage: false }), { kind: 'request' }, 'an employee never gets "add me"');
	const mine = hub('mine', { memberIDs: ['me'] });
	const requested = k.libraryScope({ hubs: [mine, a], currentUserID: 'me', canManage: true, requestedID: 'a' });
	assert.equal(requested.kind, 'join');
	assert.deepEqual(requested.hubs.map((h) => h.id), ['a'], 'the requested workspace, not every workspace');
	assert.deepEqual(requested.mine.map((h) => h.id), ['mine'], 'with the workspaces they are in, to switch to instead');
	assert.equal(k.libraryScope({ hubs: [a], currentUserID: 'me', canManage: true, requestedID: 'a' }).mine, undefined);
	// "&create=1" is used once: a reload opens the list, not an empty form.
	assert.equal(k.withoutCreateIntent(new URL('https://orca.invalid/app?view=knowledge&hub=h&kind=knowledge&create=1&lang=th')), '/app?view=knowledge&hub=h&kind=knowledge&lang=th');
	assert.equal(k.withoutCreateIntent(new URL('https://orca.invalid/app?view=knowledge&kind=knowledge')), undefined);
	assert.deepEqual(k.libraryScope({ hubs: [mine, a], currentUserID: 'me', canManage: false, requestedID: 'a' }), { kind: 'missing' });
	assert.deepEqual(k.libraryScope({ hubs: [mine], currentUserID: 'me', canManage: true, requestedID: 'nope' }), { kind: 'missing' });
	assert.equal(k.libraryScope({ hubs: [mine], currentUserID: 'me', canManage: true, requestedID: 'mine' }).hub.id, 'mine');
});

test('"everyone in this workspace" is its live department grants plus its direct members, without the author', () => {
	const everyone = k.workspaceEveryone({ memberIDs: ['me', 'x', 'y', 'gone'], accessUnitIDs: ['sales', 'archived-dept'] }, departments, ['me', 'x', 'y', 'a', 'b'], 'me');
	assert.deepEqual(everyone, { unitIDs: ['sales'], memberIDs: ['x', 'y'] });
	assert.deepEqual(k.workspaceEveryone({ memberIDs: ['me'] }, departments, ['me'], 'me'), { unitIDs: [], memberIDs: [] });
	assert.deepEqual([...k.audiencePeople({ ownerID: 'me', ...everyone }, departments)].sort(), ['a', 'b', 'me', 'x', 'y']);
});

test('the editor reads a saved audience back as one of the four choices, or an older mix', () => {
	const everyone = { unitIDs: ['sales'], memberIDs: ['x'] };
	assert.equal(k.audienceMode({ unitIDs: [], memberIDs: [] }, everyone), 'me');
	assert.equal(k.audienceMode({ unitIDs: ['sales'], memberIDs: ['x'] }, everyone), 'everyone');
	assert.equal(k.audienceMode({ unitIDs: ['sales'], memberIDs: [] }, everyone), 'departments');
	assert.equal(k.audienceMode({ unitIDs: [], memberIDs: ['x', 'y'] }, everyone), 'people');
	assert.equal(k.audienceMode({ unitIDs: ['acc'], memberIDs: ['x'] }, everyone), 'mixed');
	const choice = { unitIDs: ['acc', 'acc'], memberIDs: ['y'] };
	assert.deepEqual(k.audienceFor('everyone', choice, everyone), everyone);
	assert.deepEqual(k.audienceFor('departments', choice, everyone), { unitIDs: ['acc'], memberIDs: [] });
	assert.deepEqual(k.audienceFor('people', choice, everyone), { unitIDs: [], memberIDs: ['y'] });
	assert.deepEqual(k.audienceFor('mixed', choice, everyone), { unitIDs: ['acc'], memberIDs: ['y'] });
	assert.deepEqual(k.audienceFor('me', choice, everyone), { unitIDs: [], memberIDs: [] });
});

test('a row\'s audience chip: ทุกคน, เฉพาะฉัน, a department +N or a person +N', () => {
	const context = { departments, workspaceMemberIDs: ['me', 'a', 'b', 'x'], personName: (id) => ({ x: 'ธนา', y: 'ศิริ' })[id] ?? id, departmentName: (id) => departments.find((d) => d.unitID === id)?.name ?? id };
	assert.deepEqual(k.audienceChip(item('1'), context, th), { kind: 'me', label: 'เฉพาะฉัน' });
	assert.deepEqual(k.audienceChip(item('2', { unitIDs: ['sales'], memberIDs: ['x'] }), context, th), { kind: 'everyone', label: 'ทุกคน' });
	assert.deepEqual(k.audienceChip(item('3', { unitIDs: ['sales', 'acc'] }), context, th), { kind: 'departments', label: 'ฝ่ายขาย +1' });
	assert.deepEqual(k.audienceChip(item('4', { unitIDs: ['sales'] }), context, th), { kind: 'departments', label: 'ฝ่ายขาย' });
	assert.deepEqual(k.audienceChip(item('5', { memberIDs: ['x', 'y'] }), context, en), { kind: 'people', label: 'ธนา +1' });
	assert.equal(k.audienceChip(item('6', { memberIDs: ['x'] }), { ...context, workspaceMemberIDs: ['me'] }, th).kind, 'people', 'a workspace of one is not "everyone"');
});

test('filters: ทั้งหมด leaves out archived items; search matches every word; newest first', () => {
	const items = [
		item('a', { title: 'นโยบายคืนสินค้า', updatedAt: '2026-09-02T00:00:00Z' }),
		item('b', { title: 'ราคาตัวแทน', status: 'draft', updatedAt: '2026-09-03T00:00:00Z' }),
		item('c', { title: 'เดิม', status: 'archived' }),
		item('d', { kind: 'template', title: 'สรุปยอดขาย' })
	];
	assert.deepEqual(k.filterLibrary(items, 'knowledge', 'all', '').map((i) => i.id), ['b', 'a']);
	assert.deepEqual(k.filterLibrary(items, 'knowledge', 'published', '').map((i) => i.id), ['a']);
	assert.deepEqual(k.filterLibrary(items, 'knowledge', 'archived', '').map((i) => i.id), ['c']);
	assert.deepEqual(k.filterLibrary(items, 'knowledge', 'all', 'คืน สินค้า').map((i) => i.id), ['a']);
	assert.deepEqual(k.filterLibrary(items, 'template', 'all', '').map((i) => i.id), ['d']);
	assert.deepEqual(k.libraryCounts(items, 'knowledge'), { published: 1, draft: 1, archived: 1, current: 2 });
	assert.equal(k.itemExcerpt({ summary: '', content: '# หัวข้อ\n- ข้อหนึ่ง' }), 'หัวข้อ ข้อหนึ่ง');
	assert.equal(k.itemExcerpt({ summary: 'ก'.repeat(100), content: '' }, 10).length, 10);
});

test('relative time in Bangkok days: minutes, hours today, yesterday, days, then a date', () => {
	const now = Date.parse('2026-09-28T10:30:00+07:00');
	const at = (iso) => k.relativeTime(iso, now, th);
	assert.equal(at('2026-09-28T10:30:00+07:00'), 'เมื่อสักครู่');
	assert.equal(at('2026-09-28T10:05:00+07:00'), '25 นาทีที่แล้ว');
	assert.equal(at('2026-09-28T08:30:00+07:00'), '2 ชั่วโมงที่แล้ว');
	assert.equal(at('2026-09-27T23:00:00+07:00'), 'เมื่อวาน');
	assert.equal(at('2026-09-26T10:30:00+07:00'), '2 วันที่แล้ว');
	assert.match(at('2026-09-10T10:30:00+07:00'), /10/);
	assert.equal(k.relativeTime('2026-09-28T08:30:00+07:00', now, en), '2 hours ago');
	assert.equal(k.relativeTime('nope', now, th), '—');
});

test('ready-made prompt fields: Thai labels in the editor, field_N names on the server', () => {
	const parameters = [{ name: 'customer', label: 'ชื่อลูกค้า', required: true }, { name: 'field_1', label: 'ช่วงวันที่', required: false }];
	const saved = 'เรียนคุณ {{customer}} ยอดของ {{field_1}} {{ไม่รู้จัก}}';
	const shown = k.contentForEditing(saved, parameters);
	assert.equal(shown, 'เรียนคุณ {{ชื่อลูกค้า}} ยอดของ {{ช่วงวันที่}} {{ไม่รู้จัก}}');
	assert.doesNotMatch(shown, /customer|field_1/, 'no English names in the editor');
	assert.deepEqual(k.contentForSaving(shown, parameters), { content: saved, unknown: ['ไม่รู้จัก'] });
	assert.deepEqual(k.contentForSaving('{{ ชื่อลูกค้า }} {{field_1}} {{}}', parameters), { content: '{{customer}} {{field_1}} {{}}', unknown: [] });
	assert.equal(k.nextFieldName(parameters), 'field_2');
	assert.equal(k.nextFieldName([]), 'field_1');
	assert.equal(k.cleanFieldLabel('  {{ชื่อ}}  ลูกค้า '), 'ชื่อ ลูกค้า');
	assert.ok(k.fieldLabelTaken(parameters, ' ชื่อลูกค้า '));
	assert.equal(k.fieldLabelTaken(parameters, 'ชื่อลูกค้า', 'customer'), false, 'renaming a field to its own name');
	const renamed = parameters.map((item) => (item.name === 'customer' ? { ...item, label: 'ลูกค้า' } : item));
	assert.equal(k.retokenFields(shown, parameters, renamed), 'เรียนคุณ {{ลูกค้า}} ยอดของ {{ช่วงวันที่}} {{ไม่รู้จัก}}');
	assert.equal(k.retokenFields('ก {{ช่วงวันที่}} ข', parameters, parameters.slice(0, 1)), 'ก  ข');
	assert.deepEqual([...k.fieldsInUse('{{ชื่อลูกค้า}}', parameters)], ['customer']);
	assert.deepEqual(k.insertText('abcd', 1, 3, 'XY'), { text: 'aXYd', caret: 3 });
	assert.deepEqual(k.insertText('ab', 9, 9, '!'), { text: 'ab!', caret: 3 });
	const runs = k.tokenRuns('ก {{ชื่อลูกค้า}} {{อื่น}}', parameters);
	assert.deepEqual(runs.map((run) => [run.text, run.field, run.known]), [['ก ', false, false], ['{{ชื่อลูกค้า}}', true, true], [' ', false, false], ['{{อื่น}}', true, false]]);
	assert.equal(runs.map((run) => run.text).join(''), 'ก {{ชื่อลูกค้า}} {{อื่น}}', 'the highlight layer keeps every character');
});

test('fields with one label, or named like another field\'s label, save back exactly (Codex release review 63)', () => {
	// The server allows two fields with one label; the editor shows those by name.
	const twins = [{ name: 'from', label: 'Date', required: true }, { name: 'to', label: 'Date', required: true }];
	const saved = '{{from}} to {{to}}';
	const shown = k.contentForEditing(saved, twins);
	assert.equal(shown, '{{from}} to {{to}}');
	assert.deepEqual(k.contentForSaving(shown, twins), { content: saved, unknown: [] });
	assert.deepEqual([...k.fieldsInUse(shown, twins)].sort(), ['from', 'to']);
	assert.deepEqual(k.contentForSaving('{{Date}}', twins), { content: '{{Date}}', unknown: ['Date'] }, 'a shared label names no one field');
	// Renaming one of them gives each its own label back.
	const apart = [{ name: 'from', label: 'วันเริ่ม', required: true }, twins[1]];
	const retokened = k.retokenFields(shown, twins, apart);
	assert.equal(retokened, '{{วันเริ่ม}} to {{Date}}');
	assert.deepEqual(k.contentForSaving(retokened, apart), { content: saved, unknown: [] });
	// A label spelled like another field's name, and a field with no label.
	const crossed = [{ name: 'x', label: 'y', required: true }, { name: 'y', label: 'ลูกค้า', required: true }, { name: 'z', label: '', required: false }];
	const text = '{{x}} {{y}} {{z}}';
	assert.equal(k.contentForEditing(text, crossed), '{{x}} {{ลูกค้า}} {{z}}');
	assert.deepEqual(k.contentForSaving(k.contentForEditing(text, crossed), crossed), { content: text, unknown: [] });
	// Names differing only in case stay apart.
	const cased = [{ name: 'Date', label: 'วัน', required: true }, { name: 'date', label: 'วัน', required: true }];
	assert.deepEqual(k.contentForSaving(k.contentForEditing('{{Date}} {{date}}', cased), cased), { content: '{{Date}} {{date}}', unknown: [] });
	const runs = k.tokenRuns(shown, twins);
	assert.deepEqual(runs.filter((run) => run.field).map((run) => run.known), [true, true]);
	// Removing a field drops only its own tokens.
	assert.equal(k.retokenFields(shown, twins, twins.slice(1)), ' to {{Date}}');
});

test('a new field\'s chip lands at the caret even when other chips change (Codex release review 64)', () => {
	// The field named customer is labelled field_1; the new field is named field_1 too,
	// so the old chip now shows by its name and gets longer before the caret.
	const before = [{ name: 'customer', label: 'field_1', required: true }];
	const after = [...before, { name: 'field_1', label: 'Amount', required: true }];
	const text = '{{field_1}} and';
	const caret = '{{field_1}}'.length;
	const next = k.insertField(text, caret, caret, before, after, 'field_1');
	assert.equal(next.text, '{{customer}}{{Amount}} and');
	assert.equal(next.caret, '{{customer}}{{Amount}}'.length);
	assert.deepEqual(k.contentForSaving(next.text, after), { content: '{{customer}}{{field_1}} and', unknown: [] });
	// A plain insert replaces the selection, and the selection is clamped.
	assert.deepEqual(k.insertField('ab', 1, 2, [], [{ name: 'field_1', label: 'X', required: true }], 'field_1'), { text: 'a{{X}}', caret: 6 });
	assert.deepEqual(k.insertField('ab', 9, 9, [], [{ name: 'field_1', label: 'X', required: true }], 'field_1').text, 'ab{{X}}');
	// Never inside a chip: a caret in one puts the new chip after it; a selection
	// that ends in one stops before it (Codex release review 65).
	const one = [{ name: 'customer', label: 'ลูกค้า', required: true }];
	const two = [...one, { name: 'field_1', label: 'ยอด', required: true }];
	const inChip = k.insertField('ก {{ลูกค้า}} ข', 5, 5, one, two, 'field_1');
	assert.equal(inChip.text, 'ก {{ลูกค้า}}{{ยอด}} ข');
	assert.equal(inChip.caret, 'ก {{ลูกค้า}}{{ยอด}}'.length);
	assert.deepEqual(k.contentForSaving(inChip.text, two), { content: 'ก {{customer}}{{field_1}} ข', unknown: [] });
	assert.equal(k.insertField('ก {{ลูกค้า}} ข', 0, 5, one, two, 'field_1').text, '{{ยอด}}{{ลูกค้า}} ข');
});

test('audience mismatch: who could use the prompt but cannot read an article', () => {
	const context = { departments, personName: (id) => ({ c: 'ใจดี', b: 'บี' })[id] ?? id, departmentName: (id) => departments.find((d) => d.unitID === id)?.name ?? id };
	const template = { ownerID: 'me', unitIDs: ['sales', 'acc'], memberIDs: [] };
	const salesOnly = item('price', { title: 'ราคาสัญญา', unitIDs: ['sales'] });
	const [warning] = k.templateMismatches(template, [salesOnly], context, th);
	assert.equal(warning.who, 'ฝ่ายบัญชี');
	assert.equal(k.mismatchMessage(warning, th), 'ฝ่ายบัญชี จะใช้คำสั่งนี้ไม่ได้ เพราะอ่าน “ราคาสัญญา” ไม่ได้');
	const partial = k.templateMismatches({ ownerID: 'me', unitIDs: ['sales'], memberIDs: [] }, [item('p', { memberIDs: ['a'] })], context, th);
	assert.equal(partial[0].who, 'บี');
	assert.deepEqual(k.templateMismatches(template, [item('all', { unitIDs: ['sales', 'acc'] })], context, th), []);
	// Another author's article comes without its audience: say so, don't guess.
	const unknown = k.templateMismatches(template, [item('x', { canEdit: false, ownerID: 'a' })], context, th);
	assert.ok('unknown' in unknown[0]);
	assert.deepEqual(k.templateMismatches({ ownerID: 'me', unitIDs: [], memberIDs: [] }, [item('x', { canEdit: false })], context, th), [], 'only me: nothing to warn');
	assert.equal(k.peopleList(['ก', 'ข', 'ค', 'ง'], th), 'ก, ข และอีก 2 คน');
	assert.equal(k.peopleList(['ก', 'ข', 'ค'], th), 'ก, ข, ค');
});

test('try it in AI, and the employee\'s generic access request', () => {
	const items = [item('old', { title: 'เก่า', updatedAt: '2026-09-01T00:00:00Z' }), item('new', { title: 'ใหม่', updatedAt: '2026-09-05T00:00:00Z' }), item('draft', { status: 'draft', updatedAt: '2026-09-09T00:00:00Z' })];
	assert.equal(k.askItem(items).id, 'new');
	assert.equal(k.askItem(items, items[2]).id, 'new', 'a draft is not asked about');
	assert.equal(k.askItem(items, items[0]).id, 'old');
	assert.equal(k.askItem([]), undefined);
	const prompt = item('p', { kind: 'template', title: 'สรุปยอด' });
	assert.equal(k.askItem([...items, prompt], undefined, 'template').id, 'p', 'the prompts tab asks about a prompt');
	assert.equal(k.askItem(items, undefined, 'template').id, 'new', 'no published prompt: an article');
	assert.equal(k.askPrompt({ kind: 'knowledge', title: 'นโยบายคืนสินค้า' }, th), 'ช่วยสรุปเรื่อง “นโยบายคืนสินค้า” จากคลังความรู้ของบริษัทให้หน่อย');
	assert.match(k.askPrompt({ kind: 'template', title: 'สรุปยอด' }, th), /คำสั่งสำเร็จรูป “สรุปยอด”/);
	const message = k.accessRequestMessage('มาลี', 'บริษัท ตัวอย่าง', th);
	assert.match(message, /มาลี/);
	assert.match(message, /บริษัท ตัวอย่าง/);
	assert.doesNotMatch(message, /MCP|OAuth/);
});

test('refusals read in plain Thai, and the ones that mean the lists changed', () => {
	const invalid = (message) => ({ status: 400, message: `invalid ORCA workspace input: ${message}` });
	assert.equal(k.libraryProblem(invalid('library member must belong to the workspace'), th), 'บางคนที่เลือกไว้ไม่ได้อยู่ในพื้นที่ทำงานนี้แล้ว เอาออกแล้วลองอีกครั้ง');
	assert.match(k.libraryProblem(invalid('workspace library item limit reached'), th), /1,000 เรื่อง/);
	assert.equal(k.libraryProblem(invalid('a required template input is missing'), th), 'กรอกช่องที่ต้องกรอกให้ครบก่อน');
	assert.match(k.libraryProblem(invalid('template inputs exceed size limit'), th), /ยาวเกินไป/);
	assert.match(k.libraryProblem(invalid('template contains an undeclared parameter'), th), /แทรกช่องให้กรอก/);
	assert.match(k.libraryProblem(invalid('something the page has never seen'), th), /ข้อมูลบางส่วนไม่ถูกต้อง/, 'an unknown refusal is Thai too');
	for (const message of ['library department does not exist', 'referenced knowledge exceeds response limit', 'invalid library title', 'invalid library content', 'rendered template exceeds size limit', 'nothing known'])
		assert.doesNotMatch(k.libraryProblem(invalid(message), th), /[a-z]{3,}/, `no English left: ${message}`);
	assert.equal(k.libraryProblem({ status: 503, message: 'ORCA could not complete the request; retry or contact the administrator' }, th), 'ORCA ทำรายการนี้ไม่สำเร็จ ลองอีกครั้ง');
	assert.match(k.libraryProblem(invalid('invalid library summary'), en), /short description/, 'English in English');
	for (const status of [401, 403, 404, 409, 412, 429]) assert.equal(k.libraryProblem({ status, message: 'x' }, th), undefined, `${status} keeps the shared message`);
	// Which refusals are checked against a fresh library before saying anything.
	assert.ok(k.libraryStale({ status: 403, message: 'this account cannot access the workspace' }));
	assert.ok(k.libraryStale({ status: 404, message: 'item not found' }));
	assert.ok(k.libraryStale(invalid('library member must be an active person')));
	assert.ok(k.libraryStale(invalid('library department does not exist')));
	assert.ok(!k.libraryStale(invalid('invalid library title')));
	assert.ok(!k.libraryStale(invalid('invalid or duplicate library members')));
	assert.ok(!k.libraryStale({ status: 409, message: 'this item changed; reload before saving again' }));
});

test('the preview checks required fields itself; a prompt knows which of its articles no longer work', () => {
	const parameters = [{ name: 'a', label: 'ก', required: false }, { name: 'b', label: 'ข', required: true }, { name: 'c', label: 'ค', required: true }];
	assert.equal(k.missingInput(parameters, {}).name, 'b', 'the first required field');
	assert.equal(k.missingInput(parameters, { b: '   ', c: 'x' }).name, 'b', 'blank is empty, as on the server');
	assert.equal(k.missingInput(parameters, { b: 'x', c: 'y' }), undefined, 'optional fields may stay empty');
	const items = [item('pub'), item('draft', { status: 'draft' }), item('old', { status: 'archived' }), item('prompt', { kind: 'template' })];
	assert.deepEqual(k.brokenReferences({ kind: 'template', knowledgeIDs: ['pub', 'draft', 'old', 'gone', 'prompt'] }, items), ['draft', 'old', 'gone', 'prompt']);
	assert.deepEqual(k.brokenReferences({ kind: 'template', knowledgeIDs: ['pub'] }, items), []);
	assert.deepEqual(k.brokenReferences({ kind: 'knowledge', knowledgeIDs: ['gone'] }, items), [], 'articles have no references');
});

test('"เพิ่มฉันเลย" saves through the one workspace helper, not a copy of its own', async () => {
	// Covered in workspace-edit.test.mjs: saveHubPatch + joinPatch with hubWriteService.
	const page = await readFile(new URL('../components/orca/KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.match(page, /saveHubPatch\(id, \(fresh\) => joinPatch\(fresh, data\.currentUserID\), hubWriteService\)/);
	assert.equal(k.hubInputFrom, undefined);
	assert.equal(k.withMember, undefined);
});
