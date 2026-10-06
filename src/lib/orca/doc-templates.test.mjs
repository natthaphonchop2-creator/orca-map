import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

// เทมเพลตเอกสาร (kv2 phase 2a P5): the review, the publish gate, เอกสารที่สร้าง
// and the file page. The server decides everything again; these guide the screen.
const d = await importTypeScript(new URL('./doc-templates.ts', import.meta.url));
const th = (thai) => thai;
const MB = 1024 * 1024;
const S = 'Daily sheet';

const proposal = () => ({
	specVersion: 2, format: 'xlsx', dateSystem: 1900,
	fields: [
		{ key: 'report_date', label: 'วันที่รายงาน', type: 'date', required: true, target: { mode: 'cell', sheet: S, cell: 'C2' } },
		{ key: 'check_in', label: 'Check in', type: 'integer', required: true, target: { mode: 'labelled', sheet: S, cell: 'G6', label: 'Check in', sep: ' : ' } }
	],
	tables: [{ key: 'nationality', orientation: 'rows', sheet: S, owns: 'M6:O10', firstRow: 6, maxRows: 5, overflow: 'report', columns: [] }],
	kept: [{ range: `${S}!F12:K12`, why: 'formula' }],
	cells: { static: [], clear: [] }
});
const uncovered = () => [
	{ cell: `${S}!B2`, kind: 'text', premarked: 'static' },
	{ cell: `${S}!J5`, kind: 'text', premarked: 'static' },
	{ cell: `${S}!D30`, kind: 'number' },
	{ cell: `${S}!E30`, kind: 'date' },
	{ cell: `${S}!G9`, kind: 'labelled' }
];
const version = (extra = {}) => ({
	version: 1, state: 'scanned', originalName: 'Daily Briefing Sheet.xlsx', bytes: 48213, sha256: 'a'.repeat(64), createdAt: '2026-10-05T01:00:00Z',
	report: { version: 1, proposal: proposal(), facts: { sheets: [S], uncovered: uncovered() }, grid: [], outside: [], warnings: [] },
	...extra
});
const template = { whenToUse: 'ทุกเช้าหลังปิด Night Audit', expectedSources: ['Manager Flash'] };

test('only an .xlsx is sent, by its name and size, as the server checks', () => {
	assert.deepEqual(d.classifyTemplate('Daily Briefing Sheet.xlsx', 48213), { ok: true });
	assert.deepEqual(d.classifyTemplate('DAILY.XLSX ', 10), { ok: true });
	for (const [name, reason] of [['a.xlsm', 'macro'], ['a.xltm', 'macro'], ['a.xls', 'legacy'], ['a.xlsb', 'legacy'], ['a.csv', 'not_xlsx'], ['a.docx', 'not_xlsx'], ['xlsx', 'not_xlsx']])
		assert.deepEqual(d.classifyTemplate(name, 10), { ok: false, reason }, name);
	assert.deepEqual(d.classifyTemplate('a.xlsx', 0), { ok: false, reason: 'empty' });
	assert.deepEqual(d.classifyTemplate('a.xlsx', 20 * MB + 1), { ok: false, reason: 'too_large' });
	assert.deepEqual(d.classifyTemplate('a.xlsx', 20 * MB), { ok: true });
	assert.match(d.templateFileText('macro', th), /มาโคร/);
});

test('document templates need both company switches', () => {
	assert.equal(d.docTemplatesOn({ features: { libraryV2: true, docTemplates: true } }), true);
	assert.equal(d.docTemplatesOn({ features: { libraryV2: false, docTemplates: true } }), false);
	assert.equal(d.docTemplatesOn({ features: { libraryV2: true } }), false);
	assert.equal(d.docTemplatesOn({}), false);
});

test('a refusal is said in plain Thai, never the parser\'s words', () => {
	assert.match(d.refusalText('banned_function', th), /WEBSERVICE/);
	assert.match(d.refusalText('scan_timeout', th), /ไม่ทันเวลา/);
	assert.match(d.refusalText('external_relationship', th), /ลิงก์/);
	const unknown = d.refusalText('zip: not a valid zip file at offset 12', th);
	assert.doesNotMatch(unknown, /zip|offset/);
	assert.equal(d.versionStateText('scanned', th), 'รอตรวจทาน');
});

test('the review starts from the proposal; only text labels arrive คงไว้', () => {
	const review = d.startReview(version(), template);
	assert.deepEqual(review.decisions, { [`${S}!B2`]: 'static', [`${S}!J5`]: 'static' });
	assert.equal(review.whenToUse, template.whenToUse);
	assert.deepEqual(d.undecided(review, uncovered()).map((u) => u.cell), [`${S}!D30`, `${S}!E30`, `${S}!G9`]);
	// A number pre-marked by mistake is still not decided for the owner.
	const odd = version();
	odd.report.facts.uncovered = [{ cell: `${S}!D30`, kind: 'number', premarked: 'static' }];
	assert.deepEqual(d.startReview(odd, template).decisions, {});
	// A confirmed spec's dispositions, by range, carry over.
	const confirmed = version({ state: 'confirmed', specSha256: 'b'.repeat(64), spec: { ...proposal(), cells: { static: [`${S}!B2:J5`], clear: [`${S}!D30:E30`] } } });
	assert.deepEqual(d.startReview(confirmed, template).decisions, {
		[`${S}!B2`]: 'static', [`${S}!J5`]: 'static', [`${S}!D30`]: 'clear', [`${S}!E30`]: 'clear'
	});
});

test('"คงไว้ทั้งหมด" decides text only; numbers, dates and labelled values stay the owner\'s choice', () => {
	let review = d.startReview(version(), template);
	review = d.decide(review, `${S}!B2`, undefined);
	review = d.keepAllText(review, uncovered());
	assert.equal(review.decisions[`${S}!B2`], 'static');
	for (const cell of [`${S}!D30`, `${S}!E30`, `${S}!G9`]) assert.equal(review.decisions[cell], undefined, cell);
	review = d.decide(review, `${S}!D30`, 'clear');
	assert.equal(review.decisions[`${S}!D30`], 'clear');
});

test('the confirmed spec holds every decision and nothing undecided becomes คงไว้', () => {
	let review = d.startReview(version(), template);
	review = d.decide(review, `${S}!D30`, 'clear');
	const spec = d.buildSpec(proposal(), review, uncovered());
	assert.deepEqual(spec.cells, { static: [`${S}!B2`, `${S}!J5`], clear: [`${S}!D30`] });
	assert.deepEqual(spec.kept, proposal().kept);
	assert.equal(spec.fields.length, 2);
	assert.equal(spec.specVersion, 2);
});

test('publishing waits for the scan, every decision and a confirmed, unedited spec', () => {
	assert.equal(d.publishGate(version({ state: 'scanning' }), undefined, false).block, 'scanning');
	assert.equal(d.publishGate(version({ state: 'refused', refusalReason: 'macro' }), undefined, false).block, 'refused');
	let review = d.startReview(version(), template);
	assert.deepEqual(d.publishGate(version({ state: 'confirmed', specSha256: 'c'.repeat(64) }), review, false), { block: 'undecided', count: 3 });
	for (const cell of [`${S}!D30`, `${S}!E30`, `${S}!G9`]) review = d.decide(review, cell, 'clear');
	assert.equal(d.publishGate(version(), review, false).block, 'unconfirmed');
	assert.equal(d.publishGate(version({ state: 'confirmed', specSha256: 'c'.repeat(64) }), review, true).block, 'edited');
	assert.deepEqual(d.publishGate(version({ state: 'confirmed', specSha256: 'c'.repeat(64) }), review, false), { block: 'none', count: 0 });
	assert.match(d.gateText({ block: 'undecided', count: 3 }, th), /3 ช่อง/);
});

test('the grid marks fields, tables, kept formulas and each uncovered cell\'s choice', () => {
	const sheet = { name: S, merges: [], cells: [
		{ ref: 'C2', text: '3 October 2026', kind: 'date' }, { ref: 'N7', text: '12', kind: 'number' }, { ref: 'G12', text: '', kind: 'formula' },
		{ ref: 'B2', text: 'Daily Briefing', kind: 'text' }, { ref: 'D30', text: '99', kind: 'number' }, { ref: 'A1', text: 'x', kind: 'text' }
	] };
	let review = d.startReview(version(), template);
	let roles = d.cellRoles(sheet, review, proposal().kept, uncovered());
	assert.equal(roles.get('C2'), 'field');
	assert.equal(roles.get('N7'), 'table');
	assert.equal(roles.get('G12'), 'kept');
	assert.equal(roles.get('B2'), 'static');
	assert.equal(roles.get('D30'), 'undecided');
	assert.equal(roles.get('A1'), 'plain');
	review = d.decide(review, `${S}!D30`, 'clear');
	roles = d.cellRoles(sheet, review, proposal().kept, uncovered());
	assert.equal(roles.get('D30'), 'clear');
	assert.deepEqual(d.gridBounds(sheet), { rows: 30, cols: 14, cut: false });
	assert.equal(d.gridBounds(sheet, 20).cut, true);
});

test('cells and ranges read as Excel writes them', () => {
	assert.deepEqual(d.parseCell('AB12'), { col: 28, row: 12 });
	assert.deepEqual(d.parseCell('$C$2'), { col: 3, row: 2 });
	assert.equal(d.parseCell('C0'), undefined);
	assert.equal(d.columnName(28), 'AB');
	assert.deepEqual(d.parseArea(`'Daily sheet'!F12:K12`), { sheet: S, c1: 6, r1: 12, c2: 11, r2: 12 });
	assert.deepEqual(d.parseArea('M6:O10', S), { sheet: S, c1: 13, r1: 6, c2: 15, r2: 10 });
	assert.equal(d.areaHas(d.parseArea('M6:O10', S), 'Other', 13, 6), false);
});

test('the server\'s spec problems are shown in Thai, by field', () => {
	const problems = d.specProblems('spec_invalid uncovered_undecided(3) overlap:check_in merge_target:report_date(D2)');
	assert.deepEqual(problems, [
		{ code: 'uncovered_undecided', key: '', hint: '3' },
		{ code: 'overlap', key: 'check_in', hint: '' },
		{ code: 'merge_target', key: 'report_date', hint: 'D2' }
	]);
	assert.match(d.problemText(problems[0], th), /3 ช่อง/);
	assert.match(d.problemText(problems[1], th), /check_in/);
	assert.deepEqual(d.specProblems('version_changed'), []);
});

test('เอกสารที่สร้าง: only unexpired files, newest first, with the report in one line', () => {
	const now = Date.parse('2026-10-06T00:00:00Z');
	const doc = (id, readyAt, expiresAt) => ({ id, hubID: 'h', templateID: 't', templateVersion: 1, bytes: 1, readyAt, expiresAt });
	const list = d.liveDocuments([
		doc('a', '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z'),
		doc('b', '2026-10-05T00:00:00Z', '2026-11-04T00:00:00Z'),
		doc('c', '2026-09-01T00:00:00Z', '2026-10-05T23:59:59Z')
	], now);
	assert.deepEqual(list.map((x) => x.id), ['b', 'a']);
	assert.equal(d.expiryText('2026-10-07T00:00:00Z', now, th), 'หมดอายุพรุ่งนี้');
	assert.equal(d.expiryText('2026-10-05T00:00:00Z', now, th), 'หมดอายุแล้ว');
	assert.equal(d.expiryText('2026-11-05T00:00:00Z', now, th), 'เก็บไว้อีก 30 วัน');
	// The wire shape: given and written per table (Codex code review 1).
	assert.equal(d.reportLine({ filled: [{ key: 'a' }, { key: 'b' }], cleared: [{ key: 'c' }], overflow: [{ table: 'vip', given: 9, written: 6, notWritten: ['vip.7'] }, { table: 'groups', given: 2, written: 2 }] }, true, th),
		'กรอก 2 ช่อง · ล้าง 1 ช่อง · 3 แถวไม่พอที่ · รายงานแสดงไม่ครบ');
	// A cut report counts from its totals.
	assert.equal(d.reportLine({ filled: [{ key: 'a' }], cleared: [], overflow: [], totals: { filled: 42, cleared: 500, overflow: 0, kept: 6 }, truncated: true }, false, th),
		'กรอก 42 ช่อง · ล้าง 500 ช่อง · รายงานแสดงไม่ครบ');
	assert.equal(d.overflowRows({ overflow: [{ table: 'x', given: 2, written: 5 }] }), 0, 'never negative');
	assert.equal(d.reportLine(undefined, false, th), '');
});

test('the file page downloads in the company locate named, and says "not found" for everything else', () => {
	const id = '0123456789abcdef0123456789abcdef';
	const href = (file, company) => `/api/orca/orgs/${company}/files/${file}/download`;
	const location = { id, companyID: 'org-b', hubID: 'h', name: 'Daily Briefing.xlsx', bytes: 48213, expiresAt: '2026-11-05T00:00:00Z' };
	assert.deepEqual(d.filePage(id, { location }, href), { kind: 'ready', location, href: `/api/orca/orgs/org-b/files/${id}/download` });
	// Not the requester, gone, expired, or another company's: the same answer, and nothing else is asked.
	for (const status of [404, 403, 401]) assert.deepEqual(d.filePage(id, { status }, href), { kind: 'missing' });
	assert.deepEqual(d.filePage(id, { status: 503 }, href), { kind: 'retry' });
	// A location for another file, or without a company, opens nothing.
	assert.deepEqual(d.filePage(id, { location: { ...location, id: 'f'.repeat(32) } }, href), { kind: 'missing' });
	assert.deepEqual(d.filePage(id, { location: { ...location, companyID: '' } }, href), { kind: 'missing' });
	for (const bad of ['0123', id.toUpperCase(), `${id}0`, '../x', ''])
		assert.deepEqual(d.filePage(bad, { location: { ...location, id: bad } }, href), { kind: 'missing' }, bad);
});

test('each filled cell shows where it came from, for the requester', () => {
	const rows = d.reportRows({ filled: [
		{ key: 'check_in', label: 'Check in', cell: 'Daily sheet!G6', shown: 'Check in : 47', source: 's1', sourceLabel: 'Manager Flash 4-10' },
		{ key: 'vip.name.1', cell: 'Daily sheet!C27', shown: 'คุณสมชาย', source: 's4' },
		{ key: 'x', cell: 'A1', shown: '1' }
	] }, th);
	assert.deepEqual(rows, [
		{ cell: 'Daily sheet!G6', what: 'Check in', shown: 'Check in : 47', source: 'Manager Flash 4-10' },
		{ cell: 'Daily sheet!C27', what: 'vip.name.1', shown: 'คุณสมชาย', source: 's4' },
		{ cell: 'A1', what: 'x', shown: '1', source: 'ไม่ระบุ' }
	]);
	assert.deepEqual(d.reportRows(undefined, th), []);
});

test('an edit made while confirming stays unconfirmed (Codex code review 1, finding 9)', async () => {
	let review = d.startReview(version(), template);
	for (const cell of [`${S}!D30`, `${S}!E30`, `${S}!G9`]) review = d.decide(review, cell, 'static');
	let answer;
	const shown = d.reviewSnapshot(proposal(), review, uncovered());
	const sending = d.confirmReview(proposal(), review, uncovered(), (payload) => new Promise((resolve) => (answer = () => resolve(payload))));
	// While the server answers, the owner switches a cell to ล้างทุกครั้ง.
	const edited = d.decide(review, `${S}!D30`, 'clear');
	review.decisions[`${S}!E30`] = 'clear';
	answer();
	const { result, sent } = await sending;
	assert.deepEqual(result.spec.cells.static, [`${S}!B2`, `${S}!J5`, `${S}!D30`, `${S}!E30`, `${S}!G9`], 'the payload is what the screen showed when sent');
	assert.equal(sent, shown, 'what is confirmed is what was shown when sent');
	assert.notEqual(d.reviewSnapshot(proposal(), edited, uncovered()), sent, 'the later edit is still an edit');
	assert.equal(d.publishGate(version({ state: 'confirmed', specSha256: 'c'.repeat(64) }), edited, d.reviewSnapshot(proposal(), edited, uncovered()) !== sent).block, 'edited');
});

test('a cut report counts rows from the server\'s totals (Codex code review 2)', () => {
	const cut = { filled: [], cleared: [], overflow: [{ table: 'vip', given: 9, written: 6 }], totals: { filled: 0, cleared: 0, overflow: 4, kept: 250, overflowRows: 41 }, truncated: true };
	assert.equal(d.overflowRows(cut), 41, 'not just the 3 rows of the entry left');
	assert.match(d.reportLine({ filled: [], cleared: [], keptTruncated: true }, false, th), /รายงานแสดงไม่ครบ/);
});
