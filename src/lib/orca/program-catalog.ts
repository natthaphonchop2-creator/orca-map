// เพิ่มโปรแกรม: the picker's chips and cards, the stepper held in the address,
// the finish step's next action, a program's status and the draft kept in
// sessionStorage (workspace UX proposal §3.4). Presentation only: the backend
// decides what may be connected and by whom.
import type { OrcaConnection, OrcaConnectionHealth, OrcaHub } from '../services/orca';
import { connectionReady } from './activation';
import { filterCatalog, type CatalogSource, type CatalogTool } from './catalog';
import { catalogCategories } from './catalog-data';

// ---------------------------------------------------------------------------
// Step 1: chips, cards and the recommended four
// ---------------------------------------------------------------------------

/** The picker's chips; each covers some of the catalog's categories. */
export const PROGRAM_CHIPS = [
	{ id: 'all', th: 'ทั้งหมด', en: 'All', categories: [] as string[] },
	{ id: 'accounting', th: 'บัญชี', en: 'Accounting', categories: ['accounting'] },
	{ id: 'documents', th: 'เอกสาร', en: 'Documents', categories: ['productivity', 'design-content', 'data-analytics', 'research-knowledge'] },
	{ id: 'chat', th: 'แชทและลูกค้า', en: 'Chat and customers', categories: ['communication', 'social-media'] },
	{ id: 'sales', th: 'งานขาย', en: 'Sales', categories: ['crm-sales', 'ecommerce', 'marketing'] },
	{ id: 'finance', th: 'การเงิน', en: 'Finance', categories: ['finance'] }
] as const;
export type ProgramChip = (typeof PROGRAM_CHIPS)[number]['id'];

/** The chip a program belongs to, or its catalog category when no chip covers it. */
export function programCategory(source: Pick<CatalogTool, 'categoryId'>): { th: string; en: string } {
	const chip = PROGRAM_CHIPS.find((item) => item.id !== 'all' && (item.categories as readonly string[]).includes(source.categoryId));
	if (chip) return { th: chip.th, en: chip.en };
	const category = catalogCategories.find((item) => item.id === source.categoryId);
	return category ? { th: category.th, en: category.en } : { th: '', en: '' };
}

export type ProgramCardState = 'available' | 'connected' | 'soon';
type CardConnection = Pick<OrcaConnection, 'id' | 'mcpID'> & { archivedAt?: string; deletedAt?: string };

/**
 * One chip at most. "เชื่อมแล้ว" opens the program; "เร็วๆ นี้" is greyed and
 * cannot be clicked. A customer sees a program that still needs the ORCA
 * team's setup or review as เร็วๆ นี้; the ORCA team can open it to set it up.
 */
export function programCard(
	source: Pick<CatalogTool, 'id' | 'guideOnly' | 'setupStatus' | 'setupCanConfigure'>,
	context: { connections: readonly CardConnection[]; operator: boolean }
): { state: ProgramCardState; connectionID?: string } {
	const connection = context.connections.find((item) => item.mcpID === source.id && !item.archivedAt && !item.deletedAt);
	if (connection) return { state: 'connected', connectionID: connection.id };
	if (source.guideOnly) return { state: 'soon' };
	if (source.setupStatus === 'admin_setup_required' && !(context.operator && source.setupCanConfigure === true)) return { state: 'soon' };
	if (source.setupStatus === 'review_required' && !context.operator) return { state: 'soon' };
	return { state: 'available' };
}

const LINE_API = 'default-orca-api-line-messaging';

/** The name people know a program by (the catalog keeps its own for logos). */
export function programDisplayName(source: Pick<CatalogTool, 'id' | 'name'>): string {
	return source.id === LINE_API ? 'LINE Official Account' : source.name;
}

// Short, owner-approved lines for the recommended programs (the mockup).
const shortCopy: Record<string, readonly [string, string]> = {
	FlowAccount: ['ดูใบเสนอราคา ใบแจ้งหนี้ และรายรับรายจ่าย', 'Quotations, invoices, income and expenses'],
	PEAK: ['ดูเอกสารขาย ค่าใช้จ่าย และรายงานบัญชีของบริษัท', "Sales documents, expenses and your company's accounts"],
	'Google Drive': ['ค้นหาและอ่านไฟล์เอกสารของบริษัท', "Search and read your company's files"],
	[LINE_API]: ['ดูข้อมูลบัญชี LINE OA และยอดข้อความ', "Your LINE OA's profile and message usage"]
};

// The catalog's line for a program it has no copy for (catalog-data.ts) names the
// mechanism ("…ระบบนี้ผ่าน MCP"); people see a plain line instead.
const UNKNOWN_PROGRAM_LINE = 'ดูรายละเอียดและวิธีเชื่อมต่อระบบนี้ผ่าน MCP';
const addedProgramLine = ['โปรแกรมที่ทีม ORCA เพิ่มไว้', 'A program the ORCA team added'] as const;

/** One Thai line about the program. */
export function programLine(source: Pick<CatalogTool, 'id' | 'name' | 'description' | 'descriptionTh' | 'descriptionEn'>): readonly [string, string] {
	const short = shortCopy[source.id] ?? shortCopy[source.name];
	if (short) return short;
	if (!source.descriptionTh || (source.descriptionTh === UNKNOWN_PROGRAM_LINE && !source.descriptionEn)) return addedProgramLine;
	return [source.descriptionTh, source.descriptionEn || source.description || source.descriptionTh];
}

const RECOMMENDED: ((source: CatalogTool) => boolean)[] = [
	(source) => source.name === 'FlowAccount',
	(source) => source.name === 'PEAK',
	(source) => source.name === 'Google Drive',
	(source) => source.id === LINE_API || /^LINE\b/.test(source.name)
];
const FALLBACK = ['Gmail', 'Google Sheets', 'Slack Workspace', 'Notion', 'Google Calendar'];

/** "แนะนำสำหรับธุรกิจไทย": FlowAccount, PEAK, Google Drive and LINE OA, filled up to four. */
export function recommendedPrograms(sources: readonly CatalogTool[], limit = 4): CatalogTool[] {
	const programs = sources.filter((source) => !source.guideOnly);
	const picked: CatalogTool[] = [];
	for (const match of RECOMMENDED) {
		const found = programs.find((source) => match(source) && !picked.includes(source));
		if (found) picked.push(found);
	}
	for (const name of FALLBACK) {
		if (picked.length >= limit) break;
		const found = programs.find((source) => source.name === name && !picked.includes(source));
		if (found) picked.push(found);
	}
	return picked.slice(0, limit);
}

const stateRank: Record<ProgramCardState, number> = { connected: 0, available: 0, soon: 1 };

/**
 * The picker's programs for a search and a chip: real programs only (never a
 * setup guide), the ones that can be added before the greyed เร็วๆ นี้.
 */
export function pickerPrograms(
	sources: readonly CatalogSource[],
	filter: { query: string; chip: ProgramChip },
	context: { connections: readonly CardConnection[]; operator: boolean }
): CatalogTool[] {
	const chip = PROGRAM_CHIPS.find((item) => item.id === filter.chip) ?? PROGRAM_CHIPS[0];
	const categories = chip.categories as readonly string[];
	const found = filterCatalog([...sources], filter.query, 'all').filter(
		(source) => !source.guideOnly && (!categories.length || categories.includes(source.categoryId))
	);
	return found
		.map((source, index) => ({ source, index, rank: stateRank[programCard(source, context).state] }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((item) => item.source);
}

/** Chips with at least one program, so a chip never leads to an empty page. */
export function availableChips(sources: readonly CatalogSource[]): ProgramChip[] {
	const programs = filterCatalog([...sources], '', 'all').filter((source) => !source.guideOnly);
	return PROGRAM_CHIPS.filter(
		(chip) => chip.id === 'all' || programs.some((source) => (chip.categories as readonly string[]).includes(source.categoryId))
	).map((chip) => chip.id);
}

// ---------------------------------------------------------------------------
// The stepper, held in the address (&source=&step=)
// ---------------------------------------------------------------------------

export const PROGRAM_STEPS = ['choose', 'connect', 'tools', 'done'] as const;
export type ProgramStep = (typeof PROGRAM_STEPS)[number];

/** The step an address shows. Without a program only step 1 can open; step 4 needs the saved program. */
export function programStep(params: URLSearchParams): ProgramStep {
	const step = params.get('step');
	if (!params.get('source')) return 'choose';
	if (step === 'choose' || step === 'connect' || step === 'tools') return step;
	if (step === 'done') return params.get('connection') ? 'done' : 'connect';
	return 'connect';
}

/** The same address at another step; `source` and `connection` change only when given (null removes). */
export function programStepHref(
	address: string,
	step: ProgramStep,
	changes: { source?: string | null; connection?: string | null } = {}
): string {
	const url = new URL(address, 'https://orca.invalid');
	url.searchParams.set('view', 'add-program');
	for (const key of ['source', 'connection'] as const) {
		const value = changes[key];
		if (value === null) url.searchParams.delete(key);
		else if (value !== undefined) url.searchParams.set(key, value);
	}
	if (step === 'choose') url.searchParams.delete('source');
	if (step !== 'done') url.searchParams.delete('connection');
	url.searchParams.set('step', step);
	return url.pathname + url.search;
}

/** Where "ยกเลิก" goes: back to the create form when the person came from it, else the programs list. */
export function programCancelHref(returnTo: string | null | undefined): string {
	return returnTo === 'new' ? '/app?view=new' : '/app?view=servers';
}

/**
 * Where a "เชื่อมแล้ว" card goes: from the create form, back to it with that
 * program (nothing to connect again); otherwise the program's own page.
 */
export function programConnectedHref(connectionID: string, returnTo: string | null | undefined): string {
	const id = encodeURIComponent(connectionID);
	return returnTo === 'new' ? `/app?view=new&connection=${id}` : `/app?view=servers&connection=${id}`;
}

// ---------------------------------------------------------------------------
// Step 4: the one next action
// ---------------------------------------------------------------------------

type FinishHub = Pick<OrcaHub, 'id' | 'name' | 'status'>;
export type FinishAction =
	| { kind: 'return'; href: string }
	| { kind: 'everyone'; href: string }
	| { kind: 'workspace'; hubs: { id: string; name: string; href: string }[] };

/**
 * Came from the create form → back to it with this program; no workspace yet →
 * "ให้ทุกคนในบริษัทใช้" (U5 builds the one-click form); otherwise
 * "เพิ่มลงพื้นที่ทำงาน…" with the company's current workspaces.
 */
export function finishAction(input: { connectionID: string; returnTo?: string | null; hubs: readonly FinishHub[] }): FinishAction {
	const id = encodeURIComponent(input.connectionID);
	if (input.returnTo === 'new') return { kind: 'return', href: `/app?view=new&connection=${id}` };
	const hubs = input.hubs.filter((hub) => hub.status !== 'archived' && hub.status !== 'deleted');
	if (!hubs.length) return { kind: 'everyone', href: `/app?view=new&everyone=1&connection=${id}` };
	return {
		kind: 'workspace',
		hubs: hubs.map((hub) => ({ id: hub.id, name: hub.name, href: `/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=programs` }))
	};
}

/** The team size a request to the ORCA team names, from the company's active members. */
export function teamSizeFor(count: number): '1-5' | '6-20' | '21-50' | '51+' {
	return count <= 5 ? '1-5' : count <= 20 ? '6-20' : count <= 50 ? '21-50' : '51+';
}

// ---------------------------------------------------------------------------
// A program's status (the list's one chip)
// ---------------------------------------------------------------------------

export type ProgramStatus = 'ready' | 'review' | 'paused' | 'archived';

/** พร้อมใช้ / ต้องตรวจใหม่ / ระงับ (and จัดเก็บแล้ว). A tool that changed at the provider needs a new review. */
export function programStatus(connection: OrcaConnection, health?: Pick<OrcaConnectionHealth, 'changed'>): ProgramStatus {
	if (connection.archivedAt || connection.deletedAt) return 'archived';
	if (!connection.enabled) return 'paused';
	if (!connectionReady(connection) || (health?.changed ?? 0) > 0) return 'review';
	return 'ready';
}

/**
 * A history row's result, in the same words as ตรวจสอบ › ประวัติ (Audit.svelte).
 * "admitted" is a call ORCA received whose result is not recorded yet, never an approval.
 */
export function programEventOutcome(outcome: string | undefined): { th: string; en: string; tone: 'ok' | 'neutral' | 'deny' } {
	if (outcome === 'success') return { th: 'สำเร็จ', en: 'Succeeded', tone: 'ok' };
	if (outcome === 'admitted') return { th: 'รับคำขอแล้ว', en: 'Received', tone: 'neutral' };
	if (outcome === 'denied') return { th: 'ไม่ได้รับอนุญาต', en: 'Denied', tone: 'deny' };
	if (outcome === 'timeout') return { th: 'หมดเวลา', en: 'Timed out', tone: 'deny' };
	if (outcome === 'error') return { th: 'ไม่สำเร็จ', en: 'Failed', tone: 'deny' };
	return { th: 'ไม่ทราบผล', en: 'Unknown', tone: 'neutral' };
}

/** A name nobody else uses in this company: "FlowAccount", then "FlowAccount (2)"… */
export function uniqueProgramName(base: string, taken: readonly string[]): string {
	const names = new Set(taken.map((name) => name.trim().toLocaleLowerCase()));
	const name = base.trim();
	if (!names.has(name.toLocaleLowerCase())) return name;
	for (let index = 2; index < 100; index++) {
		const next = `${name} (${index})`;
		if (!names.has(next.toLocaleLowerCase())) return next;
	}
	return name;
}

// ---------------------------------------------------------------------------
// The draft: ticked tools survive an OAuth popup or a reload (sessionStorage)
// ---------------------------------------------------------------------------

export type ProgramDraft = {
	v: 1;
	sourceID: string;
	toolNames: string[];
	preset: 'read' | 'write';
	name: string;
	note: string;
	at: number;
};
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** One draft per company in this tab. */
export function draftKey(company: string): string {
	return `orca.addProgram.${company || 'default'}`;
}

/** The draft for this program, if it is recent and well formed. Storage may throw or be empty. */
export function readDraft(storage: DraftStorage | undefined, key: string, sourceID: string, now = Date.now()): ProgramDraft | undefined {
	try {
		const raw = storage?.getItem(key);
		if (!raw) return undefined;
		const draft = JSON.parse(raw) as Partial<ProgramDraft>;
		if (
			draft?.v !== 1 ||
			draft.sourceID !== sourceID ||
			typeof draft.at !== 'number' ||
			now - draft.at > DRAFT_TTL_MS ||
			draft.at > now + 60_000 ||
			!Array.isArray(draft.toolNames) ||
			!draft.toolNames.every((name) => typeof name === 'string') ||
			(draft.preset !== 'read' && draft.preset !== 'write') ||
			typeof draft.name !== 'string' ||
			typeof draft.note !== 'string'
		)
			return undefined;
		return {
			v: 1,
			sourceID,
			toolNames: [...new Set(draft.toolNames)].slice(0, 100),
			preset: draft.preset,
			name: draft.name.slice(0, 100),
			note: draft.note.slice(0, 4000),
			at: draft.at
		};
	} catch {
		return undefined;
	}
}

export function writeDraft(storage: DraftStorage | undefined, key: string, draft: Omit<ProgramDraft, 'v' | 'at'>, now = Date.now()): void {
	try {
		storage?.setItem(key, JSON.stringify({ v: 1, ...draft, at: now }));
	} catch {
		// A private window or full storage: the flow still works, it just forgets on reload.
	}
}

export function clearDraft(storage: DraftStorage | undefined, key: string): void {
	try {
		storage?.removeItem(key);
	} catch {
		// Nothing to forget.
	}
}
