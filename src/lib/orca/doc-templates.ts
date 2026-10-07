// เทมเพลตเอกสาร (knowledge library v2 phase 2a): the logic behind the
// template review, the publish gate, เอกสารที่สร้าง and the file page, free of
// Svelte so it is tested. It only guides the screen: the server checks every
// right, the spec and the publish gate again.
import type {
	DocGridSheet,
	DocScanReport,
	DocSpec,
	DocSpecField,
	DocSpecTable,
	DocTemplate,
	DocTemplateVersion,
	DocUncovered,
	DocumentLocation,
	GeneratedDocument,
	GeneratedReport
} from '../services/orca-doc-templates';
import { stoppedFromRefusal } from './platform-console';

type Translate = (th: string, en: string) => string;

/** Both company switches: library v2 and document templates (the server's own rule). */
export function docTemplatesOn(data: { features?: { libraryV2?: boolean; docTemplates?: boolean } }): boolean {
	return data.features?.libraryV2 === true && data.features?.docTemplates === true;
}

// ── The upload ──────────────────────────────────────────────────────

/** The server's cap on a template (OrcaUploadMaxFileBytes). */
export const TEMPLATE_MAX_BYTES = 20 * 1024 * 1024;
export type TemplateFileRefusal = 'macro' | 'legacy' | 'not_xlsx' | 'too_large' | 'empty';

/** Only .xlsx, checked by its name as the server does, before anything is sent. */
export function classifyTemplate(name: string, size: number): { ok: true } | { ok: false; reason: TemplateFileRefusal } {
	const ext = name.trim().toLowerCase().split('.').pop() ?? '';
	if (!name.includes('.')) return { ok: false, reason: 'not_xlsx' };
	if (['xlsm', 'xltm', 'xlam'].includes(ext)) return { ok: false, reason: 'macro' };
	if (['xls', 'xlsb', 'xlt'].includes(ext)) return { ok: false, reason: 'legacy' };
	if (ext !== 'xlsx') return { ok: false, reason: 'not_xlsx' };
	if (size <= 0) return { ok: false, reason: 'empty' };
	if (size > TEMPLATE_MAX_BYTES) return { ok: false, reason: 'too_large' };
	return { ok: true };
}

export function templateFileText(reason: TemplateFileRefusal, t: Translate): string {
	switch (reason) {
		case 'macro':
			return t('ไฟล์มีมาโคร ORCA ไม่รับ บันทึกเป็น .xlsx ใน Excel ก่อน', 'The file has macros. Save it as .xlsx in Excel first.');
		case 'legacy':
			return t('ไฟล์ Excel แบบเก่า บันทึกเป็น .xlsx ใน Excel ก่อน', 'An old Excel format. Save it as .xlsx in Excel first.');
		case 'too_large':
			return t('ไฟล์ใหญ่เกิน 20 MB', 'The file is over 20 MB');
		case 'empty':
			return t('ไฟล์ว่าง', 'The file is empty');
		default:
			return t('เทมเพลตเอกสารต้องเป็นไฟล์ .xlsx', 'A document template must be an .xlsx file');
	}
}

// ── States and refusals ─────────────────────────────────────────────

export function versionStateText(state: DocTemplateVersion['state'], t: Translate): string {
	switch (state) {
		case 'scanning':
			return t('กำลังตรวจไฟล์', 'Checking the file');
		case 'scanned':
			return t('รอตรวจทาน', 'Waiting for review');
		case 'refused':
			return t('ใช้ไม่ได้', 'Can’t be used');
		case 'confirmed':
			return t('ยืนยันแล้ว ยังไม่เผยแพร่', 'Confirmed, not published');
		case 'published':
			return t('เผยแพร่แล้ว', 'Published');
		default:
			return t('ฉบับเก่า', 'Older version');
	}
}

/** Why ORCA refused a template, in plain Thai; never a parser message. */
export function refusalText(reason: string | undefined, t: Translate): string {
	const code = (reason ?? '').replace(/^scan_/, '');
	const texts: Record<string, [string, string]> = {
		macro: ['ไฟล์มีมาโคร บันทึกเป็น .xlsx ใน Excel แล้วอัปโหลดใหม่', 'The file has macros. Save it as .xlsx and upload it again.'],
		encrypted_or_legacy: ['ไฟล์มีรหัสผ่านหรือเป็น Excel แบบเก่า เปิดรหัสแล้วบันทึกเป็น .xlsx', 'The file is password-protected or an old format. Remove the password and save it as .xlsx.'],
		external_relationship: ['ไฟล์ลิงก์ไปยังไฟล์หรือเว็บอื่น ลบลิงก์ภายนอกใน Excel ก่อน', 'The file links to other files or websites. Remove external links in Excel first.'],
		connections: ['ไฟล์ดึงข้อมูลจากแหล่งภายนอก ลบการเชื่อมต่อข้อมูลใน Excel ก่อน', 'The file pulls data from outside. Remove its data connections in Excel first.'],
		banned_function: ['ไฟล์มีสูตรที่ดึงข้อมูลจากภายนอก เช่น WEBSERVICE ลบสูตรนั้นก่อน', 'A formula fetches outside data (such as WEBSERVICE). Remove it first.'],
		embedded_object: ['ไฟล์มีวัตถุฝังหรือไฟล์แนบอยู่ข้างใน ลบออกก่อน', 'The file has embedded objects. Remove them first.'],
		hidden_text: ['ไฟล์มีข้อความที่ซ่อนอยู่ ลบออกก่อน', 'The file has hidden text. Remove it first.'],
		excel_table: ['ช่องที่จะกรอกอยู่ในตาราง Excel (Format as Table) แปลงเป็นช่วงปกติก่อน', 'Cells to fill are in an Excel table. Convert it to a normal range first.'],
		chart_on_formula: ['มีกราฟที่อ่านจากช่องสูตร ORCA อัปเดตกราฟให้ไม่ได้ ย้ายกราฟให้อ่านจากช่องค่าคงที่ หรือลบออกก่อน', 'A chart reads formula cells ORCA cannot refresh. Point it at plain cells or remove it first.'],
		chart_on_fill_area: ['มีกราฟที่อ่านจากช่องที่จะกรอก ย้ายกราฟหรือลบออกก่อน', 'A chart reads from cells ORCA fills. Move or remove it first.'],
		chart_unsupported: ['กราฟแบบนี้ ORCA ยังตรวจไม่ได้', 'ORCA can’t check this kind of chart yet.'],
		formula_unsupported: ['มีสูตรแบบที่ ORCA ยังรองรับไม่ได้ (เช่นตารางข้อมูลหรือสูตรอาร์เรย์แบบเก่า)', 'A formula kind ORCA can’t keep yet (such as a data table).'],
		validation_unsupported: ['มีรายการตัวเลือกที่ดึงจากสูตร ใช้รายการจากช่องในไฟล์แทน', 'A dropdown list comes from a formula. Use cells in the workbook instead.'],
		too_many_cells: ['ไฟล์มีช่องมากเกินกว่าที่ ORCA กรอกได้', 'The file has more cells than ORCA can fill.'],
		part_size: ['ไฟล์ใหญ่เกินเมื่อแตกออก', 'The file is too large once unpacked.'],
		inflated: ['ไฟล์ใหญ่เกินเมื่อแตกออก', 'The file is too large once unpacked.'],
		date_system: ['ไฟล์ใช้ระบบวันที่แบบ 1904 ORCA ยังไม่รองรับ', 'The file uses the 1904 date system.'],
		unknown_part: ['ไฟล์มีส่วนที่ ORCA ไม่รู้จัก บันทึกใหม่ใน Excel แล้วลองอีกครั้ง', 'The file has parts ORCA doesn’t know. Save it again in Excel and retry.'],
		corrupt: ['ไฟล์เสีย เปิดใน Excel แล้วบันทึกใหม่', 'The file is damaged. Open it in Excel and save it again.'],
		not_ooxml: ['ไฟล์นี้ไม่ใช่ .xlsx จริง', 'This is not a real .xlsx file.'],
		timeout: ['ตรวจไฟล์ไม่ทันเวลา ลองอัปโหลดอีกครั้ง', 'Checking the file took too long. Try again.'],
		memory: ['ไฟล์ซับซ้อนเกินกว่าที่ ORCA ตรวจได้', 'The file is too complex for ORCA to check.']
	};
	const text = texts[code];
	return text ? t(text[0], text[1]) : t('ORCA ใช้ไฟล์นี้เป็นเทมเพลตไม่ได้ ลองบันทึกใหม่ใน Excel แล้วอัปโหลดอีกครั้ง', 'ORCA can’t use this file as a template. Save it again in Excel and upload it again.');
}

/** The version the review works on: the draft, else the published one. */
export function workingVersion(template: Pick<DocTemplate, 'versions' | 'draftVersion' | 'publishedVersion'>): DocTemplateVersion | undefined {
	const want = template.draftVersion ?? template.publishedVersion;
	return template.versions.find((v) => v.version === want) ?? [...template.versions].sort((a, b) => b.version - a.version)[0];
}

// ── Cells and ranges ────────────────────────────────────────────────

/** "AB12" → column 28, row 12. */
export function parseCell(ref: string): { col: number; row: number } | undefined {
	const match = /^\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})$/.exec(ref.trim().toUpperCase());
	if (!match) return undefined;
	let col = 0;
	for (const c of match[1]) col = col * 26 + (c.charCodeAt(0) - 64);
	return { col, row: Number(match[2]) };
}

export function columnName(col: number): string {
	let name = '';
	for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	return name;
}

export type Area = { sheet: string; c1: number; r1: number; c2: number; r2: number };

/** "Sheet!A1:B2" (or a cell) → an area; `sheet` is used when the range names none. */
export function parseArea(range: string, sheet = ''): Area | undefined {
	const bang = range.lastIndexOf('!');
	const name = bang >= 0 ? range.slice(0, bang).replace(/^'(.*)'$/, '$1') : sheet;
	const [first, last = first] = range.slice(bang + 1).split(':');
	const a = parseCell(first);
	const b = parseCell(last);
	if (!a || !b) return undefined;
	return { sheet: name, c1: Math.min(a.col, b.col), r1: Math.min(a.row, b.row), c2: Math.max(a.col, b.col), r2: Math.max(a.row, b.row) };
}

export function areaHas(area: Area | undefined, sheet: string, col: number, row: number): boolean {
	return !!area && area.sheet === sheet && col >= area.c1 && col <= area.c2 && row >= area.r1 && row <= area.r2;
}

// ── The review (plan §3.2) ──────────────────────────────────────────

export type Disposition = 'static' | 'clear';
export interface Review {
	fields: DocSpecField[];
	tables: DocSpecTable[];
	/** Each uncovered cell ("Sheet!A1") and what the owner decided; absent is undecided. */
	decisions: Record<string, Disposition>;
	whenToUse: string;
	expectedSources: string[];
}

/**
 * The review's start: the confirmed spec if the version has one, else the
 * scan's proposal. An uncovered cell starts decided only by a disposition
 * the spec already holds, or by the scan's pre-mark (text labels, คงไว้);
 * numbers, dates and labelled values are never decided for the owner.
 */
export function startReview(version: Pick<DocTemplateVersion, 'report' | 'spec'>, template: Pick<DocTemplate, 'whenToUse' | 'expectedSources'>): Review {
	const report = version.report;
	const spec = version.spec ?? report?.proposal;
	const decisions: Record<string, Disposition> = {};
	const statics = (spec?.cells?.static ?? []).map((range) => parseArea(range));
	const clears = (spec?.cells?.clear ?? []).map((range) => parseArea(range));
	for (const cell of report?.facts.uncovered ?? []) {
		const at = parseArea(cell.cell);
		if (!at) continue;
		if (clears.some((area) => areaHas(area, at.sheet, at.c1, at.r1))) decisions[cell.cell] = 'clear';
		else if (statics.some((area) => areaHas(area, at.sheet, at.c1, at.r1))) decisions[cell.cell] = 'static';
		else if (cell.premarked === 'static' && cell.kind === 'text') decisions[cell.cell] = 'static';
	}
	return {
		fields: structuredClone(spec?.fields ?? []),
		tables: structuredClone(spec?.tables ?? []),
		decisions,
		whenToUse: template.whenToUse ?? '',
		expectedSources: [...(template.expectedSources ?? [])]
	};
}

export function undecided(review: Pick<Review, 'decisions'>, uncovered: readonly DocUncovered[]): DocUncovered[] {
	return uncovered.filter((cell) => !review.decisions[cell.cell]);
}

/** "คงไว้ทั้งหมด": every undecided text label, never a number, a date or a labelled value. */
export function keepAllText(review: Review, uncovered: readonly DocUncovered[]): Review {
	const decisions = { ...review.decisions };
	for (const cell of uncovered) if (!decisions[cell.cell] && cell.kind === 'text') decisions[cell.cell] = 'static';
	return { ...review, decisions };
}

export function decide(review: Review, cell: string, disposition: Disposition | undefined): Review {
	const decisions = { ...review.decisions };
	if (disposition) decisions[cell] = disposition;
	else delete decisions[cell];
	return { ...review, decisions };
}

/** The spec the owner confirms: the review's fields and tables, the proposal's kept formulas, the decided cells. */
export function buildSpec(proposal: DocSpec, review: Review, uncovered: readonly DocUncovered[]): DocSpec {
	const cells = { static: [] as string[], clear: [] as string[] };
	for (const cell of uncovered) {
		const decision = review.decisions[cell.cell];
		if (decision === 'static') cells.static.push(cell.cell);
		else if (decision === 'clear') cells.clear.push(cell.cell);
	}
	return {
		specVersion: proposal.specVersion,
		format: proposal.format,
		dateSystem: proposal.dateSystem,
		fields: review.fields,
		tables: review.tables,
		kept: proposal.kept ?? [],
		cells
	};
}

/** What blocks a step, in the order the owner meets it. */
export type GateBlock = 'scanning' | 'refused' | 'undecided' | 'unconfirmed' | 'edited' | 'none';

/**
 * เผยแพร่ (plan §1.1 5): only a confirmed version whose review is the one
 * confirmed, with every uncovered cell decided. The server refuses the same
 * with uncovered_undecided.
 */
export function publishGate(version: DocTemplateVersion | undefined, review: Review | undefined, edited: boolean): { block: GateBlock; count: number } {
	if (!version || version.state === 'scanning') return { block: 'scanning', count: 0 };
	if (version.state === 'refused') return { block: 'refused', count: 0 };
	const open = review && version.report ? undecided(review, version.report.facts.uncovered).length : 0;
	if (open > 0) return { block: 'undecided', count: open };
	if (version.state === 'scanned' || !version.specSha256) return { block: 'unconfirmed', count: 0 };
	if (edited) return { block: 'edited', count: 0 };
	return { block: 'none', count: 0 };
}

export function gateText(gate: { block: GateBlock; count: number }, t: Translate): string {
	switch (gate.block) {
		case 'scanning':
			return t('ORCA กำลังตรวจไฟล์ รอสักครู่', 'ORCA is checking the file');
		case 'refused':
			return t('ไฟล์นี้ใช้เป็นเทมเพลตไม่ได้', 'This file can’t be a template');
		case 'undecided':
			return t(`ยังมี ${gate.count} ช่องที่ยังไม่ได้เลือกว่าจะคงไว้หรือล้างทุกครั้ง`, `${gate.count} cells still need คงไว้ or ล้างทุกครั้ง`);
		case 'unconfirmed':
			return t('ยืนยันการตั้งค่าก่อนเผยแพร่', 'Confirm the setup before publishing');
		case 'edited':
			return t('มีการแก้ไขที่ยังไม่ได้ยืนยัน', 'There are changes not confirmed yet');
		default:
			return '';
	}
}

// ── The grid ────────────────────────────────────────────────────────

export type CellRole = 'field' | 'table' | 'kept' | 'static' | 'clear' | 'undecided' | 'plain';

/** What each shown cell is, for the review grid's highlight. */
export function cellRoles(sheet: DocGridSheet, review: Review, kept: DocSpec['kept'], uncovered: readonly DocUncovered[]): Map<string, CellRole> {
	const roles = new Map<string, CellRole>();
	const fields = review.fields.filter((f) => f.target.sheet === sheet.name).map((f) => parseArea(f.target.cell, sheet.name));
	const tables = review.tables.filter((tb) => tb.sheet === sheet.name).map((tb) => parseArea(tb.owns, sheet.name));
	const keptAreas = kept.map((k) => parseArea(k.range)).filter((a) => a?.sheet === sheet.name);
	const open = new Map(uncovered.map((u) => [u.cell, u]));
	for (const cell of sheet.cells) {
		const at = parseCell(cell.ref);
		if (!at) continue;
		const key = `${sheet.name}!${cell.ref}`;
		let role: CellRole = 'plain';
		if (fields.some((a) => areaHas(a, sheet.name, at.col, at.row))) role = 'field';
		else if (tables.some((a) => areaHas(a, sheet.name, at.col, at.row))) role = 'table';
		else if (keptAreas.some((a) => areaHas(a, sheet.name, at.col, at.row))) role = 'kept';
		else if (open.has(key)) role = review.decisions[key] ?? 'undecided';
		roles.set(cell.ref, role);
	}
	return roles;
}

/** The grid's rows and columns, bounded so a page stays short. */
export function gridBounds(sheet: DocGridSheet, maxRows = 60, maxCols = 20): { rows: number; cols: number; cut: boolean } {
	let rows = 0;
	let cols = 0;
	for (const cell of sheet.cells) {
		const at = parseCell(cell.ref);
		if (!at) continue;
		rows = Math.max(rows, at.row);
		cols = Math.max(cols, at.col);
	}
	return { rows: Math.min(rows, maxRows), cols: Math.min(cols, maxCols), cut: rows > maxRows || cols > maxCols || !!sheet.truncated };
}

// ── Types the owner picks ───────────────────────────────────────────

export const FIELD_TYPES = ['text', 'integer', 'decimal(2)', 'percent(1)', 'money', 'date', 'bool'] as const;

export function typeText(type: string, t: Translate): string {
	if (type === 'text') return t('ข้อความ', 'Text');
	if (type === 'integer') return t('จำนวนเต็ม', 'Whole number');
	if (type.startsWith('decimal')) return t('ทศนิยม', 'Decimal');
	if (type.startsWith('percent')) return t('เปอร์เซ็นต์', 'Percent');
	if (type === 'money') return t('จำนวนเงิน', 'Money');
	if (type === 'date') return t('วันที่', 'Date');
	if (type === 'bool') return t('ใช่ / ไม่ใช่', 'Yes / no');
	if (type === 'enum') return t('ตัวเลือก', 'Choice');
	if (type === 'number') return t('ตัวเลข', 'Number');
	// Never show a raw key such as "number" to the reviewer.
	return t('ชนิดอื่น', 'Other type');
}

// ── Spec problems from the server ───────────────────────────────────

export type SpecProblem = { code: string; key: string; hint: string };

/** The server's "spec_invalid code:key(hint) …" message, split. */
export function specProblems(message: string): SpecProblem[] {
	if (!message.startsWith('spec_invalid')) return [];
	const problems: SpecProblem[] = [];
	for (const match of message.slice('spec_invalid'.length).matchAll(/\s([a-z_]+)(?::([^\s(]+))?(?:\(([^)]*)\))?/g)) {
		problems.push({ code: match[1], key: match[2] ?? '', hint: match[3] ?? '' });
	}
	return problems;
}

export function problemText(problem: SpecProblem, t: Translate): string {
	const where = problem.key ? ` (${problem.key})` : '';
	switch (problem.code) {
		case 'uncovered_undecided':
			return t(`ยังมี ${problem.hint || 'บาง'} ช่องที่ยังไม่ได้เลือก`, `${problem.hint || 'Some'} cells are undecided`);
		case 'overlap':
			return t(`ช่องซ้อนกัน${where}`, `Cells overlap${where}`);
		case 'merge_target':
			return t(`ช่องที่รวมไว้ต้องกรอกที่ช่องซ้ายบนเท่านั้น${where}`, `A merged cell is filled at its top-left only${where}`);
		case 'validation_bounds':
			return t(`ช่องนี้มีกฎตรวจข้อมูลใน Excel ตั้งชนิดและค่าต่ำสุด–สูงสุดให้ไม่หลวมกว่ากฎ${where}`, `This cell has an Excel validation rule: set a type and limits no looser than the rule${where}`);
		case 'chart_on_formula':
			return t(`มีกราฟที่อ่านจากช่องสูตร${where}`, `A chart reads formula cells${where}`);
		case 'formula_target':
			return t(`ช่องนี้มีสูตร ORCA ไม่เขียนทับ${where}`, `This cell has a formula; ORCA never writes over it${where}`);
		case 'key':
		case 'too_long':
			return t(`ตั้งชื่อช่องให้ครบและไม่ยาวเกิน${where}`, `Give every field a short name${where}`);
		case 'table':
		case 'outside_owns':
			return t(`ตารางนี้ตั้งค่าไม่ครบหรือเกินพื้นที่ของตาราง${where}`, `This table is incomplete or goes past its area${where}`);
		default:
			return t(`ตรวจการตั้งค่าอีกครั้ง${where}`, `Check the setup again${where}`);
	}
}

// ── เอกสารที่สร้าง ──────────────────────────────────────────────────

/** Ready, unexpired files, newest first: what the server lists, minus those expired since. */
export function liveDocuments(documents: readonly GeneratedDocument[], now: number): GeneratedDocument[] {
	return documents
		.filter((doc) => Date.parse(doc.expiresAt) > now)
		.sort((a, b) => Date.parse(b.readyAt) - Date.parse(a.readyAt) || a.id.localeCompare(b.id));
}

export function expiryText(expiresAt: string, now: number, t: Translate): string {
	const days = Math.ceil((Date.parse(expiresAt) - now) / 86_400_000);
	if (days <= 0) return t('หมดอายุแล้ว', 'Expired');
	if (days === 1) return t('หมดอายุพรุ่งนี้', 'Expires tomorrow');
	return t(`เก็บไว้อีก ${days} วัน`, `Kept ${days} more days`);
}

/** Rows a report's tables could not take: given minus written, per the wire shape. */
export function overflowRows(report: GeneratedReport | undefined): number {
	// The server's total, counted before any table entry was cut (Codex code review 2).
	if (typeof report?.totals?.overflowRows === 'number') return report.totals.overflowRows;
	return (report?.overflow ?? []).reduce((sum, o) => sum + Math.max(0, (o.given ?? 0) - (o.written ?? 0)), 0);
}

/** The fill report in one line: filled, cleared, rows that did not fit, from the full totals when cut. */
export function reportLine(report: GeneratedReport | undefined, truncated: boolean, t: Translate): string {
	if (!report) return '';
	const filled = report.totals?.filled ?? report.filled?.length ?? 0;
	const cleared = report.totals?.cleared ?? report.cleared?.length ?? 0;
	const over = overflowRows(report);
	const parts = [t(`กรอก ${filled} ช่อง`, `${filled} cells filled`)];
	if (cleared) parts.push(t(`ล้าง ${cleared} ช่อง`, `${cleared} cleared`));
	if (over) parts.push(t(`${over} แถวไม่พอที่`, `${over} rows did not fit`));
	if (truncated || report.truncated || report.keptTruncated) parts.push(t('รายงานแสดงไม่ครบ', 'report shortened'));
	return parts.join(' · ');
}

/** One row of the stored report as the requester checks it: where, what, from which report. */
export type ReportRow = { cell: string; what: string; shown: string; source: string };

/** The report's filled cells, each with its source, for the file page. */
export function reportRows(report: GeneratedReport | undefined, t: Translate): ReportRow[] {
	return (report?.filled ?? []).map((cell) => ({
		cell: cell.cell ?? '',
		what: cell.label || cell.key,
		shown: cell.shown ?? '',
		source: cell.sourceLabel || cell.source || t('ไม่ระบุ', 'not named')
	}));
}

// ── Confirming a review (Codex code review 1, finding 9) ────────────

/** What a review would confirm, as one comparable string. */
export function reviewSnapshot(proposal: DocSpec, review: Review, uncovered: readonly DocUncovered[]): string {
	return JSON.stringify([buildSpec(proposal, review, uncovered), review.whenToUse.trim(), review.expectedSources.filter(Boolean)]);
}

/**
 * Sends the review as it is now and returns, with the answer, the snapshot
 * of what was sent: an edit made while the server answers stays an
 * unconfirmed edit, never mistaken for the confirmed spec.
 */
export async function confirmReview<T>(
	proposal: DocSpec,
	review: Review,
	uncovered: readonly DocUncovered[],
	send: (payload: { spec: DocSpec; whenToUse: string; expectedSources: string[] }) => Promise<T>
): Promise<{ result: T; sent: string }> {
	const payload = JSON.parse(JSON.stringify({ spec: buildSpec(proposal, review, uncovered), whenToUse: review.whenToUse.trim(), expectedSources: review.expectedSources.filter(Boolean) }));
	const sent = reviewSnapshot(proposal, review, uncovered);
	const result = await send(payload);
	return { result, sent };
}

// ── The file page (/app/files/<id>, plan §2.4) ──────────────────────

/** A generated file's ID: 32 lowercase hex, as the server makes them. */
export const FILE_ID = /^[0-9a-f]{32}$/;

export type FilePage =
	| { kind: 'ready'; location: DocumentLocation; company: string }
	| { kind: 'stopped'; status: 'suspended' | 'closed' }
	| { kind: 'missing' }
	| { kind: 'retry' };

/**
 * What the file page shows, from locate's answer or the download's refusal.
 * The download is pinned to the company locate named, never the page's own.
 * The file's company that is suspended or closed answers its requester 423
 * (platform console C6 §4.2): the page says so with the fixed message. Any
 * other file locate does not answer for is the same "not found" whatever the
 * reason, and nothing else is tried.
 */
export function filePage(id: string, answer: { location?: DocumentLocation; status?: number; message?: string }): FilePage {
	if (!FILE_ID.test(id)) return { kind: 'missing' };
	const location = answer.location;
	if (location && location.id === id && location.companyID) return { kind: 'ready', location, company: location.companyID };
	const stopped = stoppedFromRefusal(answer.status, answer.message ?? '');
	if (stopped) return { kind: 'stopped', status: stopped };
	if (answer.status && answer.status >= 500) return { kind: 'retry' };
	return { kind: 'missing' };
}
