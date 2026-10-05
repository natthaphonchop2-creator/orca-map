// AI workspaces (workspace UX proposal §3.5, U5): the rules behind the short
// create form, the one-click "ให้ทุกคนในบริษัทใช้" and the tabs edited in place.
// No Svelte and no requests here: the components pass the calls in, so every
// rule is tested on its own.
import type { HubInput, OrcaConnection, OrcaHub, OrcaHubSource, OrcaMember, OrcaUnit, UnitInput } from '../services/orca';
import { connectionReady } from './activation';
import { gatewaySources } from './gateway-sources';
import { toolAlwaysApproved, toolChangesData } from './program-tools';

type Translate = (th: string, en: string) => string;
type ToolLike = { name: string; definition?: unknown };
type ProgramLike = Pick<OrcaConnection, 'toolNames' | 'tools' | 'reviewedReadOnly'>;

// ---------------------------------------------------------------------------
// What AI can do: reading or changing data (critique 1)
// ---------------------------------------------------------------------------

// Whether a tool only reads is program-tools' toolChangesData(), the one copy
// of the backend's approval rule.

/** The tools a program allows today, in the program's order (a tool must be reviewed and listed). */
export function allowedTools<T extends ToolLike>(connection: { toolNames: string[]; tools: T[] } | undefined): T[] {
	if (!connection) return [];
	return connection.toolNames.flatMap((name) => {
		const tool = connection.tools.find((item) => item.name === name);
		return tool ? [tool] : [];
	});
}

/**
 * Whether these tools of a program may change data. A program reviewed as
 * read-only is the manager's attestation, so none of its tools is ever held
 * (orcaHoldsWrites); a tool the program no longer lists counts as a change.
 */
export function sourceChangesData(connection: ProgramLike | undefined, toolNames: readonly string[]): boolean {
	if (!toolNames.length) return false;
	if (!connection) return true;
	if (connection.reviewedReadOnly) return false;
	return toolNames.some((name) => {
		const tool = connection.tools.find((item) => item.name === name);
		return !tool || toolChangesData(tool as ToolLike);
	});
}

/**
 * The tools among toolNames that ORCA holds for an admin every time,
 * whatever the workspace's mode and the program's review ("ต้องอนุมัติทุกครั้ง";
 * design §14l: LINE's sends and changes; the backend's orcaHoldsWrites).
 */
export function alwaysHeldToolNames(connection: Pick<OrcaConnection, 'tools'> | undefined, toolNames: readonly string[]): string[] {
	if (!connection) return [];
	return toolNames.filter((name) => {
		const tool = connection.tools.find((item) => item.name === name);
		return !!tool && toolAlwaysApproved(tool as ToolLike);
	});
}

type SourceLike = { connection: (ProgramLike & { name?: string }) | undefined; toolNames: readonly string[] };

/**
 * ภาพรวม's line on changes, or undefined when nothing here changes data. In a
 * workspace set to "ทำได้เลย", the programs whose chosen tools ORCA holds every
 * time are named, since the server holds those whatever the mode (Codex
 * release review deploy41).
 */
export function changesNote(sources: readonly SourceLike[], writeMode: string | undefined, t: Translate): string | undefined {
	const held = sources.map((source) => ({ source, names: alwaysHeldToolNames(source.connection, source.toolNames) }));
	const programs = [...new Set(held.filter((item) => item.names.length).map((item) => item.source.connection?.name ?? '').filter(Boolean))];
	const others = held.some(({ source, names }) => sourceChangesData(source.connection, source.toolNames.filter((name) => !names.includes(name))));
	if (!others && !held.some((item) => item.names.length)) return undefined;
	if (writeMode === 'approval') return t('เมื่อ AI จะสร้างหรือแก้ข้อมูล ต้องรอผู้ดูแลอนุมัติก่อน', 'When AI would create or change data, an admin approves first.');
	if (!programs.length) return t('AI สร้างหรือแก้ข้อมูลได้ทันที ไม่ต้องรออนุมัติ', 'AI creates or changes data right away, without approval.');
	const names = programs.join(', ');
	return others
		? t(`AI สร้างหรือแก้ข้อมูลได้ทันที แต่งานที่ต้องอนุมัติทุกครั้งใน ${names} ยังรอผู้ดูแลอนุมัติก่อน`, `AI creates or changes data right away, but actions in ${names} that always need approval still wait for an admin.`)
		: t(`งานที่ต้องอนุมัติทุกครั้งใน ${names} รอผู้ดูแลอนุมัติก่อนเสมอ`, `Actions in ${names} that always need approval wait for an admin first.`);
}

/**
 * The hint under "สร้าง / แก้ไข / ลบ" in the sheet that narrows a program: approval
 * is whether this workspace holds changes (true, false, or unknown), heldNames
 * the change tools ORCA holds every time, which wait whatever the workspace.
 */
export function changeGroupHint(approval: boolean | undefined, changeNames: readonly string[], heldNames: readonly string[], t: Translate): string {
	const all = changeNames.length > 0 && changeNames.every((name) => heldNames.includes(name));
	if (approval === true || all) {
		return approval === false
			? t('รอผู้ดูแลอนุมัติก่อนทุกครั้ง แม้พื้นที่นี้ตั้งให้ทำได้ทันที', 'Always waits for an admin to approve, even though this workspace runs changes at once.')
			: t('รอผู้ดูแลอนุมัติก่อน ORCA จึงทำจริง', 'Waits for an admin to approve before ORCA runs it.');
	}
	if (approval === false) {
		return heldNames.length
			? t('พื้นที่นี้ตั้งให้ทำได้ทันที ยกเว้นรายการที่ “ต้องอนุมัติทุกครั้ง” เปลี่ยนได้ในแท็บ “ตั้งค่า”', 'This workspace runs changes at once, except those marked “Always needs approval”. Change it under “Settings”.')
			: t('พื้นที่นี้ตั้งให้ทำได้ทันที ไม่ต้องรออนุมัติ เปลี่ยนได้ในแท็บ “ตั้งค่า”', 'This workspace runs changes at once, without approval. Change it under “Settings”.');
	}
	return t('ถ้าพื้นที่นี้ตั้งให้ผู้ดูแลอนุมัติก่อน จะรออนุมัติก่อนทำจริง', 'Waits for approval when this workspace asks for it.');
}

/** The allowed tools that only read. All of them for a program reviewed as read-only. */
export function readOnlyToolNames(connection: ProgramLike | undefined): string[] {
	const tools = allowedTools(connection as { toolNames: string[]; tools: ToolLike[] } | undefined);
	return tools.filter((tool) => connection?.reviewedReadOnly || !toolChangesData(tool)).map((tool) => tool.name);
}

export type ProgramSummary = {
	/** read: nothing chosen can change data. */
	access: 'read' | 'write';
	count: number;
	/** The tools the program allows today. */
	total: number;
	/** Fewer than the program allows. */
	narrowed: boolean;
};

export function programSummary(connection: ProgramLike | undefined, toolNames: readonly string[]): ProgramSummary {
	const total = allowedTools(connection as { toolNames: string[]; tools: ToolLike[] } | undefined).length;
	return {
		access: sourceChangesData(connection, toolNames) ? 'write' : 'read',
		count: toolNames.length,
		total,
		narrowed: toolNames.length < total
	};
}

/** "อ่านอย่างเดียว · 6 อย่าง", "อ่านและแก้ไข · 3 จาก 5 อย่าง". */
export function programSummaryLabel(summary: ProgramSummary, t: Translate): string {
	const access = summary.access === 'read' ? t('อ่านอย่างเดียว', 'Read only') : t('อ่านและแก้ไข', 'Read and change');
	const count = summary.narrowed
		? t(`${summary.count} จาก ${summary.total} อย่าง`, `${summary.count} of ${summary.total}`)
		: t(`${summary.count} อย่าง`, `${summary.count} ${summary.count === 1 ? 'action' : 'actions'}`);
	return `${access} · ${count}`;
}

export function accessWord(access: 'read' | 'write', t: Translate): string {
	return access === 'read' ? t('อ่านอย่างเดียว', 'read only') : t('อ่านและแก้ไข', 'read and change');
}

// ---------------------------------------------------------------------------
// Every write starts from the workspace as saved now (critique 2)
// ---------------------------------------------------------------------------

/**
 * The full PUT body for a workspace: everything as `fresh` (a GET /hubs/{id}
 * made just now) holds it, with `patch` on top, and fresh's version. The server
 * replaces every field it is sent and keeps only userSourceID, instructions and
 * writeMode when they are absent, so nothing is left out by accident.
 */
export function hubInput(fresh: OrcaHub, patch: Partial<HubInput> = {}): HubInput {
	const base: HubInput = {
		name: fresh.name,
		description: fresh.description ?? '',
		connectionID: fresh.connectionID ?? '',
		toolNames: [...(fresh.toolNames ?? [])],
		sources: gatewaySources(fresh).map(copySource),
		memberIDs: [...(fresh.memberIDs ?? [])],
		unitIDs: [...(fresh.unitIDs ?? [])],
		dailyLimit: fresh.dailyLimit,
		status: fresh.status,
		...(fresh.userSourceID !== undefined && fresh.userSourceID !== null ? { userSourceID: fresh.userSourceID } : {}),
		...(fresh.instructions !== undefined && fresh.instructions !== null ? { instructions: fresh.instructions } : {}),
		...(fresh.writeMode ? { writeMode: fresh.writeMode } : {}),
		...(Array.isArray(fresh.accessUnitIDs) ? { accessUnitIDs: [...fresh.accessUnitIDs] } : {})
	} as HubInput;
	const merged = { ...base, ...patch } as HubInput;
	const sources = (merged.sources ?? []).map(copySource);
	return {
		...merged,
		sources,
		// The first program is also sent the old way, for older readers.
		connectionID: sources[0]?.connectionID ?? '',
		toolNames: [...(sources[0]?.toolNames ?? [])],
		version: fresh.version
	};
}

function copySource(source: OrcaHubSource): OrcaHubSource {
	return { connectionID: source.connectionID, toolNames: [...source.toolNames] };
}

function union(values: readonly string[], add: readonly string[]): string[] {
	return [...new Set([...values, ...add])];
}

/** Adds and removes people on top of whoever is in the workspace now. */
export function membersPatch(fresh: OrcaHub, change: { add?: readonly string[]; remove?: readonly string[] }): Pick<HubInput, 'memberIDs'> {
	const remove = new Set(change.remove ?? []);
	return { memberIDs: union(fresh.memberIDs ?? [], change.add ?? []).filter((id) => !remove.has(id)) };
}

/**
 * "เพิ่มฉัน" (เชื่อม AI ของฉัน, คลังความรู้): the viewer as a direct member on top
 * of whoever is in the workspace now; null (no write) when they already are one.
 */
export function joinPatch(fresh: OrcaHub, memberID: string): Pick<HubInput, 'memberIDs'> | null {
	return (fresh.memberIDs ?? []).includes(memberID) ? null : membersPatch(fresh, { add: [memberID] });
}

/** Adds and removes department grants on top of the saved ones. */
export function departmentsPatch(fresh: OrcaHub, change: { add?: readonly string[]; remove?: readonly string[] }): Pick<HubInput, 'accessUnitIDs'> {
	const remove = new Set(change.remove ?? []);
	return { accessUnitIDs: union(fresh.accessUnitIDs ?? [], change.add ?? []).filter((id) => !remove.has(id)) };
}

/**
 * Programs turned on or off, or narrowed, on top of the saved ones: `null`
 * turns a program off; a list sets what AI can do in it. Programs nobody
 * touched keep what the saved workspace has.
 */
export function programsPatch(fresh: OrcaHub, changes: Readonly<Record<string, readonly string[] | null>>): Pick<HubInput, 'sources'> {
	const saved = gatewaySources(fresh);
	const sources: OrcaHubSource[] = [];
	for (const source of saved) {
		if (!Object.hasOwn(changes, source.connectionID)) sources.push(copySource(source));
		else if (changes[source.connectionID] !== null) sources.push({ connectionID: source.connectionID, toolNames: [...changes[source.connectionID]!] });
	}
	for (const [connectionID, toolNames] of Object.entries(changes)) {
		if (toolNames !== null && !saved.some((source) => source.connectionID === connectionID)) sources.push({ connectionID, toolNames: [...toolNames] });
	}
	return { sources };
}

/** Whether any of these programs, as a workspace would hold them, can change data. */
export function sourcesChangeData(sources: readonly OrcaHubSource[], connections: readonly (ProgramLike & { id: string })[]): boolean {
	return sources.some((source) => sourceChangesData(connections.find((item) => item.id === source.connectionID), source.toolNames));
}

/**
 * The owner's safety default (plan §1): the first change action added to a
 * workspace that runs changes at once turns "ให้ผู้ดูแลอนุมัติก่อน" on, the
 * same as the create form and the one click. A workspace that already lets AI
 * change data without approval was set that way on purpose, so it stays.
 */
export function approvalTurnsOn(
	fresh: Pick<OrcaHub, 'writeMode' | 'sources' | 'connectionID' | 'toolNames'>,
	next: readonly OrcaHubSource[],
	connections: readonly (ProgramLike & { id: string })[]
): boolean {
	if (fresh.writeMode === 'approval') return false;
	return !sourcesChangeData(gatewaySources(fresh), connections) && sourcesChangeData(next, connections);
}

/** The โปรแกรม tab's save: the programs as changed, and approval when the first change action arrives. */
export function programsSavePatch(
	fresh: OrcaHub,
	changes: Readonly<Record<string, readonly string[] | null>>,
	connections: readonly (ProgramLike & { id: string })[]
): Pick<HubInput, 'sources' | 'writeMode'> {
	const patch = programsPatch(fresh, changes);
	return approvalTurnsOn(fresh, patch.sources ?? [], connections) ? { ...patch, writeMode: 'approval' } : patch;
}

/** The fields of a settings form that differ from what the page showed. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
	const patch: Partial<T> = {};
	for (const key of Object.keys(after) as (keyof T)[]) {
		if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key];
	}
	return patch;
}

export class HubConflictError extends Error {
	constructor() {
		super('workspace changed');
		this.name = 'HubConflictError';
	}
}

export type HubWriteService = {
	hub: (id: string) => Promise<OrcaHub>;
	save: (input: HubInput, id: string) => Promise<OrcaHub>;
	/** The HTTP status of a failed call. */
	status: (error: unknown) => number | undefined;
};

/**
 * One workspace write, the only one in the app: GET the workspace as saved
 * now, put `patch` on top with hubInput(), and PUT it with that version.
 * Someone else's save between the two is a 409, reported as HubConflictError
 * ("มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่"). A patch of null changes nothing: no PUT.
 */
export async function saveHubPatch(id: string, patch: (fresh: OrcaHub) => Partial<HubInput> | null, service: HubWriteService): Promise<OrcaHub> {
	let fresh: OrcaHub;
	try {
		fresh = await service.hub(id);
	} catch (cause) {
		if (service.status(cause) === 409) throw new HubConflictError();
		throw cause;
	}
	const change = patch(fresh);
	if (change === null) return fresh;
	try {
		return await service.save(hubInput(fresh, change), id);
	} catch (cause) {
		if (service.status(cause) === 409) throw new HubConflictError();
		throw cause;
	}
}

export function hubConflictMessage(t: Translate): string {
	return t('มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่', 'Someone else changed this workspace at the same time. Reload.');
}

/** The server's reasons in plain words; anything else keeps the server's own message. */
export function hubRuleMessage(message: string, t: Translate): string | undefined {
	const text = message.toLowerCase();
	if (text.includes('requires a connection, reviewed tools, and members or departments'))
		return t('พื้นที่ที่เปิดใช้งานต้องมีอย่างน้อย 1 โปรแกรม และ 1 คนหรือแผนก เพิ่มในแท็บ “โปรแกรม” และ “คน” ก่อน', 'An active workspace needs at least one program and one person or department. Add them under “Programs” and “People” first.');
	if (text.includes('enabled, reviewed connection') || text.includes('restore the server'))
		return t('โปรแกรมที่เลือกปิดอยู่หรือยังตั้งค่าไม่เสร็จ ปิดโปรแกรมนั้นในพื้นที่นี้ หรือแก้ที่หน้าโปรแกรมที่เชื่อม', 'A chosen program is paused or not set up. Turn it off here, or fix it under Programs.');
	if (text.includes("reviewed allowlist") || text.includes('additional tools'))
		return t('มีบางอย่างที่โปรแกรมไม่อนุญาตแล้ว กด ปรับ ที่โปรแกรมนั้นแล้วบันทึกอีกครั้ง', 'Something is no longer allowed by its program. Choose Adjust on that program and save again.');
	if (text.includes('not an active user') || text.includes('active person'))
		return t('มีคนที่ถูกระงับหรือออกจากบริษัทแล้ว เอาคนนั้นออกก่อนบันทึก', 'Someone was suspended or left the company. Remove them before saving.');
	if (text.includes('department does not exist') || text.includes('archived department') || text.includes('access department'))
		return t('มีแผนกที่ถูกจัดเก็บหรือลบแล้ว เอาแผนกนั้นออกก่อนบันทึก', 'A department was archived or removed. Remove it before saving.');
	if (text.includes('daily limit')) return t('จำกัดการใช้ต่อวันต้องเป็นเลข 1 ถึง 1,000,000', 'The daily limit must be 1 to 1,000,000.');
	if (text.includes('up to 20')) return t('พื้นที่หนึ่งเปิดได้สูงสุด 20 โปรแกรม', 'A workspace can use up to 20 programs.');
	return undefined;
}

// ---------------------------------------------------------------------------
// The short create form
// ---------------------------------------------------------------------------

export const MAX_PROGRAMS = 20;
export const DEFAULT_DAILY_LIMIT = 100;
export const MAX_DAILY_LIMIT = 1_000_000;

export type WorkspaceForm = {
	name: string;
	description: string;
	instructions: string;
	dailyLimit: number | undefined;
	writeMode: 'approval' | 'direct';
	/** connectionID → what AI can do in it. */
	programs: Record<string, string[]>;
	memberIDs: string[];
	accessUnitIDs: string[];
};

/** Field ids, so each error in the summary jumps to its field. */
export const FORM_FIELDS = {
	name: 'workspace-name',
	programs: 'workspace-programs',
	people: 'workspace-people',
	limit: 'workspace-limit',
	description: 'workspace-description',
	instructions: 'workspace-instructions'
} as const;

export function memberActive(member: Pick<OrcaMember, 'status'> | undefined): boolean {
	return !!member && (!member.status || member.status === 'active');
}

export function departmentActive(unit: OrcaUnit | undefined): boolean {
	return !!unit && unit.kind === 'department' && !unit.archivedAt && !unit.deletedAt;
}

export function limitValid(value: number | undefined): boolean {
	return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_DAILY_LIMIT;
}

/**
 * Every problem at once (FormErrorSummary), keyed by field. A draft needs only
 * a name and a valid limit; an active workspace also needs a program with
 * something AI can do and at least one person or department.
 */
export function workspaceFormErrors(
	form: WorkspaceForm,
	context: { connections: OrcaConnection[]; members: OrcaMember[]; units: OrcaUnit[] },
	mode: 'active' | 'draft',
	t: Translate
): Record<string, string> {
	const errors: Record<string, string> = {};
	const name = form.name.trim();
	if (!name) errors[FORM_FIELDS.name] = t('ตั้งชื่อพื้นที่ทำงาน', 'Name the workspace.');
	else if ([...name].length > 120) errors[FORM_FIELDS.name] = t('ชื่อยาวได้ไม่เกิน 120 ตัวอักษร', 'The name can be at most 120 characters.');

	const chosen = Object.entries(form.programs);
	const problems: string[] = [];
	for (const [connectionID, toolNames] of chosen) {
		const connection = context.connections.find((item) => item.id === connectionID);
		const label = connection?.name || t('โปรแกรมที่เลือก', 'A chosen program');
		if (!connectionReady(connection)) problems.push(t(`${label} ยังใช้ไม่ได้ ปิดโปรแกรมนี้ก่อน`, `${label} can't be used yet. Turn it off.`));
		else if (!toolNames.length) problems.push(t(`${label}: เลือกสิ่งที่ AI ทำได้อย่างน้อย 1 อย่าง`, `${label}: choose at least one thing AI can do.`));
		else if (toolNames.some((tool) => !connection!.toolNames.includes(tool)))
			problems.push(t(`${label}: มีบางอย่างที่โปรแกรมไม่อนุญาตแล้ว กด ปรับ แล้วเลือกใหม่`, `${label}: something is no longer allowed. Choose Adjust.`));
	}
	if (chosen.length > MAX_PROGRAMS) problems.push(t(`เปิดได้สูงสุด ${MAX_PROGRAMS} โปรแกรม`, `Up to ${MAX_PROGRAMS} programs.`));
	if (!problems.length && mode === 'active' && !chosen.length) problems.push(t('เปิดอย่างน้อย 1 โปรแกรม', 'Turn on at least one program.'));
	if (problems.length) errors[FORM_FIELDS.programs] = problems.join(' ');

	const people: string[] = [];
	if (form.memberIDs.some((id) => !memberActive(context.members.find((member) => member.id === id))))
		people.push(t('เอาคนที่ถูกระงับหรือออกไปแล้วออกก่อน', 'Remove people who are suspended or gone.'));
	if (form.accessUnitIDs.some((id) => !departmentActive(context.units.find((unit) => unit.id === id))))
		people.push(t('เอาแผนกที่ถูกจัดเก็บออกก่อน', 'Remove archived departments.'));
	if (!people.length && mode === 'active' && !form.memberIDs.length && !form.accessUnitIDs.length)
		people.push(t('เลือกคนหรือแผนกที่ใช้ได้อย่างน้อย 1', 'Choose at least one person or department.'));
	if (people.length) errors[FORM_FIELDS.people] = people.join(' ');

	if (!limitValid(form.dailyLimit)) errors[FORM_FIELDS.limit] = t('จำกัดการใช้ต่อวันต้องเป็นเลข 1 ถึง 1,000,000', 'The daily limit must be 1 to 1,000,000.');
	if (form.description.length > 4000) errors[FORM_FIELDS.description] = t('คำอธิบายยาวได้ไม่เกิน 4,000 ตัวอักษร', 'The description can be at most 4,000 characters.');
	if (form.instructions.trim().length > 4000) errors[FORM_FIELDS.instructions] = t('คำแนะนำสำหรับ AI ยาวได้ไม่เกิน 4,000 ตัวอักษร', 'Guidance for AI can be at most 4,000 characters.');
	return errors;
}

/** The POST body of a new workspace. */
export function newHubInput(form: WorkspaceForm, status: 'active' | 'draft'): HubInput {
	const sources = Object.entries(form.programs).map(([connectionID, toolNames]) => ({ connectionID, toolNames: [...toolNames] }));
	return {
		name: form.name.trim(),
		description: form.description.trim(),
		instructions: form.instructions.trim(),
		writeMode: form.writeMode,
		sources,
		connectionID: sources[0]?.connectionID ?? '',
		toolNames: [...(sources[0]?.toolNames ?? [])],
		memberIDs: [...form.memberIDs],
		accessUnitIDs: [...form.accessUnitIDs],
		unitIDs: [],
		userSourceID: '',
		dailyLimit: form.dailyLimit ?? DEFAULT_DAILY_LIMIT,
		status
	};
}

/** Who can use it: direct people plus everyone in the chosen departments, once each. */
export function audienceCount(memberIDs: readonly string[], accessUnitIDs: readonly string[], departments: readonly { unitID: string; memberIDs: string[] }[]): number {
	const people = new Set(memberIDs);
	for (const id of accessUnitIDs) for (const member of departments.find((item) => item.unitID === id)?.memberIDs ?? []) people.add(member);
	return people.size;
}

/** The sticky footer: "ฝ่ายบัญชี · FlowAccount (อ่านอย่างเดียว) · 2 คน". */
export function formSummaryParts(
	form: Pick<WorkspaceForm, 'name' | 'programs'>,
	connections: OrcaConnection[],
	people: number,
	t: Translate
): string[] {
	const programs = Object.entries(form.programs).map(([id, toolNames]) => {
		const connection = connections.find((item) => item.id === id);
		return `${connection?.name ?? id} (${accessWord(programSummary(connection, toolNames).access, t)})`;
	});
	return [
		form.name.trim() || t('พื้นที่ทำงานใหม่', 'New workspace'),
		!programs.length ? t('ยังไม่ได้เปิดโปรแกรม', 'No programs yet') : programs.length > 2 ? t(`${programs.length} โปรแกรม`, `${programs.length} programs`) : programs.join(', '),
		t(`${people} คน`, `${people} ${people === 1 ? 'person' : 'people'}`)
	];
}

/** Anything chosen that can change data: only then does the write mode matter. */
export function formChangesData(programs: Readonly<Record<string, readonly string[]>>, connections: OrcaConnection[]): boolean {
	return Object.entries(programs).some(([id, toolNames]) => sourceChangesData(connections.find((item) => item.id === id), toolNames));
}

// A form in progress survives a trip to add a program (per tab, per company).
const DRAFT_KEY = 'orca.workspace.draft';
const DRAFT_MAX_AGE_MS = 60 * 60 * 1000;

export function draftKey(company: string): string {
	return `${DRAFT_KEY}.${company}`;
}

export function saveFormDraft(storage: Pick<Storage, 'setItem'> | undefined, company: string, form: WorkspaceForm, now = Date.now()) {
	try {
		storage?.setItem(draftKey(company), JSON.stringify({ savedAt: now, form }));
	} catch {
		// Storage may be full or blocked: the form simply starts afresh.
	}
}

/** A draft saved in the last hour, once: reading it removes it. */
export function takeFormDraft(storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined, company: string, now = Date.now()): WorkspaceForm | undefined {
	try {
		const raw = storage?.getItem(draftKey(company));
		if (!raw) return undefined;
		storage?.removeItem(draftKey(company));
		const value = JSON.parse(raw) as { savedAt?: unknown; form?: Partial<WorkspaceForm> };
		if (typeof value.savedAt !== 'number' || now - value.savedAt > DRAFT_MAX_AGE_MS || !value.form) return undefined;
		const form = value.form;
		const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []);
		const programs: Record<string, string[]> = {};
		if (form.programs && typeof form.programs === 'object')
			for (const [id, tools] of Object.entries(form.programs)) programs[id] = strings(tools);
		return {
			name: typeof form.name === 'string' ? form.name : '',
			description: typeof form.description === 'string' ? form.description : '',
			instructions: typeof form.instructions === 'string' ? form.instructions : '',
			dailyLimit: typeof form.dailyLimit === 'number' ? form.dailyLimit : DEFAULT_DAILY_LIMIT,
			writeMode: form.writeMode === 'direct' ? 'direct' : 'approval',
			programs,
			memberIDs: strings(form.memberIDs),
			accessUnitIDs: strings(form.accessUnitIDs)
		};
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// "ให้ทุกคนในบริษัทใช้": the interim "ทุกคน" department (owner decision 6)
// ---------------------------------------------------------------------------

export const EVERYONE_DEPARTMENT = 'ทุกคน';

/** The live "ทุกคน" department, when the company has one. */
export function everyoneDepartment(units: readonly OrcaUnit[]): OrcaUnit | undefined {
	return units.find((unit) => departmentActive(unit) && unit.name.trim() === EVERYONE_DEPARTMENT);
}

export function companyWideName(company: string): string {
	return `${company.trim() || 'ORCA'} · ทั้งบริษัท`;
}

export type EveryonePlan = {
	connection: OrcaConnection;
	/** Every active member of the company, the viewer included. */
	memberIDs: string[];
	toolNames: string[];
	/** Something AI can do here changes data, so it waits for approval. */
	changesData: boolean;
	name: string;
	department?: OrcaUnit;
	/** A company-wide workspace made before: the program is added to it. */
	existing?: OrcaHub;
};

export function everyonePlan(
	data: { organization: { displayName: string }; currentUserID: string; members: OrcaMember[]; units: OrcaUnit[]; hubs: OrcaHub[] },
	connection: OrcaConnection
): EveryonePlan {
	const name = companyWideName(data.organization.displayName);
	// Every active member, me included when I am one: the department refuses anyone else.
	const memberIDs = union([], data.members.filter((member) => memberActive(member)).map((member) => member.id));
	const toolNames = allowedTools(connection).map((tool) => tool.name);
	return {
		connection,
		memberIDs,
		toolNames,
		changesData: sourceChangesData(connection, toolNames),
		name,
		department: everyoneDepartment(data.units),
		existing: data.hubs.find((hub) => hub.name.trim() === name && hub.status !== 'archived' && hub.status !== 'deleted')
	};
}

/** "ทุกคน 12 คน · อ่านอย่างเดียว" or "ทุกคน 12 คน · ต้องอนุมัติก่อน" (critique 6). */
export function everyoneSummary(plan: Pick<EveryonePlan, 'memberIDs' | 'changesData'>, t: Translate): string {
	const people = t(`ทุกคน ${plan.memberIDs.length} คน`, `Everyone, ${plan.memberIDs.length} ${plan.memberIDs.length === 1 ? 'person' : 'people'}`);
	return `${people} · ${plan.changesData ? t('ต้องอนุมัติก่อน', 'approval first') : t('อ่านอย่างเดียว', 'read only')}`;
}

export type EveryoneService = {
	createUnit: (input: UnitInput) => Promise<OrcaUnit>;
	departments: () => Promise<{ unitID: string; memberIDs: string[]; version: number }[]>;
	saveDepartment: (unitID: string, memberIDs: string[], version: number) => Promise<unknown>;
	createHub: (input: HubInput) => Promise<OrcaHub>;
	hub: HubWriteService;
	/** Reports each step for the progress line. */
	onstep?: (step: 'department' | 'members' | 'workspace') => void;
	/**
	 * The "ทุกคน" department just made: a retry after a later step failed must
	 * reuse it instead of making a second one.
	 */
	ondepartment?: (unit: OrcaUnit) => void;
};

/**
 * The one click: the "ทุกคน" department (made once, then reused) with every
 * active member in it, then an active company-wide workspace that grants that
 * department this program. Anything that can change data waits for approval
 * (critique 6). A company-wide workspace made before gets the program added.
 */
async function createEveryoneDepartment(service: EveryoneService): Promise<OrcaUnit> {
	const unit = await service.createUnit({ name: EVERYONE_DEPARTMENT, kind: 'department', parentID: '' });
	service.ondepartment?.(unit);
	return unit;
}

export async function runEveryone(plan: EveryonePlan, service: EveryoneService): Promise<OrcaHub> {
	service.onstep?.('department');
	const department = plan.department ?? (await createEveryoneDepartment(service));
	service.onstep?.('members');
	for (let attempt = 0; ; attempt += 1) {
		const row = (await service.departments()).find((item) => item.unitID === department.id) ?? { unitID: department.id, memberIDs: [], version: 0 };
		const wanted = union(row.memberIDs, plan.memberIDs);
		if (wanted.length === row.memberIDs.length) break;
		try {
			await service.saveDepartment(department.id, wanted, row.version);
			break;
		} catch (cause) {
			// Someone changed the department meanwhile: read it again, once.
			if (attempt > 0 || service.hub.status(cause) !== 409) throw cause;
		}
	}
	service.onstep?.('workspace');
	if (plan.existing) {
		return saveHubPatch(
			plan.existing.id,
			(fresh) => {
				// Keep the saved order, but only what the program still allows: an
				// active workspace refuses a tool that left the program's allowlist.
				const saved = (gatewaySources(fresh).find((source) => source.connectionID === plan.connection.id)?.toolNames ?? []).filter((name) =>
					plan.toolNames.includes(name)
				);
				return {
					...programsPatch(fresh, { [plan.connection.id]: union(saved, plan.toolNames) }),
					...departmentsPatch(fresh, { add: [department.id] }),
					status: 'active',
					// Never from approval back to direct.
					...(plan.changesData || fresh.writeMode === 'approval' ? { writeMode: 'approval' as const } : {})
				};
			},
			service.hub
		);
	}
	return service.createHub({
		name: plan.name,
		description: '',
		instructions: '',
		writeMode: 'approval',
		sources: [{ connectionID: plan.connection.id, toolNames: [...plan.toolNames] }],
		connectionID: plan.connection.id,
		toolNames: [...plan.toolNames],
		memberIDs: [],
		accessUnitIDs: [department.id],
		unitIDs: [],
		userSourceID: '',
		dailyLimit: DEFAULT_DAILY_LIMIT,
		status: 'active'
	});
}

// ---------------------------------------------------------------------------
// After creation: the invite message and what to do next
// ---------------------------------------------------------------------------

/**
 * เชื่อม AI ของฉัน for someone opening a shared link; LINE opens it in the
 * phone's browser (critique 13). The company is always named, "default" too:
 * someone in several companies would otherwise open the one they used last
 * (Codex release review 68).
 */
export function connectAILink(origin: string, company: string): string {
	const url = new URL('/app', origin);
	url.searchParams.set('view', 'connect-ai');
	url.searchParams.set('org', company || 'default');
	url.searchParams.set('openExternalBrowser', '1');
	return url.toString();
}

/** A Thai message for LINE or email that brings the team to เชื่อม AI ของฉัน. */
export function workspaceInviteMessage(input: { company: string; workspace: string; programs: string[]; link: string }, t: Translate): string {
	const programs = input.programs.filter(Boolean).join(', ');
	return t(
		`${input.company} เปิดพื้นที่ทำงาน AI “${input.workspace}” ให้คุณแล้ว${programs ? ` ใช้ AI ถามข้อมูลจาก ${programs} ได้เลย` : ''}\nเปิดลิงก์นี้ แล้วกด “เชื่อม AI ของฉัน” ครั้งเดียว Claude หรือ ChatGPT ของคุณจะเห็นพื้นที่นี้เอง\n${input.link}`,
		`${input.company} opened the AI workspace “${input.workspace}” for you.${programs ? ` Ask AI about ${programs}.` : ''}\nOpen this link and choose “Connect my AI” once; your Claude or ChatGPT will see this workspace by itself.\n${input.link}`
	);
}

/** A first question to try, per program. */
export function samplePrompt(program: string, t: Translate): string {
	const name = program.toLowerCase();
	if (name.includes('flowaccount') || name.includes('peak'))
		return t(`สรุปใบแจ้งหนี้ที่ค้างชำระจาก ${program}`, `Summarize unpaid invoices in ${program}`);
	if (name.includes('drive') || name.includes('onedrive') || name.includes('notion'))
		return t(`หาเอกสารล่าสุดเรื่องลูกค้าใน ${program}`, `Find the latest customer documents in ${program}`);
	if (name.includes('slack') || /\bline\b/.test(name) || name.includes('gmail') || name.includes('outlook'))
		return t(`สรุปข้อความสำคัญเมื่อวานจาก ${program}`, `Summarize yesterday's important messages in ${program}`);
	return t(`สรุปข้อมูลล่าสุดจาก ${program}`, `Summarize the latest from ${program}`);
}

/**
 * Whether the viewer's own AI already reaches this workspace (B1 list): a
 * Claude or ChatGPT sign-in through the company link or this workspace's own
 * link, or a key for every workspace or for this one. A sign-in or key for
 * another workspace does not count (B3 follow-up). (A workspace with its own
 * sign-in is not on the company link; callers don't ask.)
 */
export function aiReachesWorkspace(apps: { sessions: readonly { hubID?: string }[]; keys: readonly { hubID?: string }[] }, hubID: string): boolean {
	const reaches = (item: { hubID?: string }) => !item.hubID || item.hubID === hubID;
	return apps.sessions.some(reaches) || apps.keys.some(reaches);
}

// ---------------------------------------------------------------------------
// Arriving with a program (?connection= on the form, &add= on โปรแกรม)
// ---------------------------------------------------------------------------

/**
 * The program an address asks to turn on: `ready` to tick, `unready` (it still
 * needs สิ่งที่ AI ทำได้, or is paused) or `missing` (removed, or not this
 * company's), so the page says why instead of silently not ticking it.
 */
export function requestedProgram(
	connections: readonly OrcaConnection[],
	id: string
): { state: 'none' } | { state: 'missing' } | { state: 'ready' | 'unready'; connection: OrcaConnection } {
	if (!id) return { state: 'none' };
	const connection = connections.find((item) => item.id === id && !item.archivedAt && !item.deletedAt);
	if (!connection) return { state: 'missing' };
	return { state: connectionReady(connection) ? 'ready' : 'unready', connection };
}

/** Where to finish a program that is not ready: its สิ่งที่ AI ทำได้ tab. */
export function finishProgramHref(connectionID: string): string {
	return `/app?view=servers&connection=${encodeURIComponent(connectionID)}&tab=tools`;
}

// ---------------------------------------------------------------------------
// After a save: the toast, shown once
// ---------------------------------------------------------------------------

/** The address flags a save leaves for the workspace page: `created=1`, or `added=<program id>`. */
export const SAVED_PARAMS = ['created', 'added'] as const;

/** The workspace page after the create form or the one click; `added` names a program added to a workspace that already existed. */
export function savedHubHref(hubID: string, added?: string): string {
	const id = encodeURIComponent(hubID);
	return added ? `/app?view=hub&hub=${id}&added=${encodeURIComponent(added)}` : `/app?view=hub&hub=${id}&created=1`;
}

/** The toast for that page: "สร้างแล้ว" for a new workspace, "เพิ่มแล้ว" when a program joined one. */
export function savedToast(
	hub: Pick<OrcaHub, 'status' | 'userSourceID'>,
	saved: { created: boolean; added?: string },
	t: Translate
): string {
	if (saved.added !== undefined)
		return saved.added
			? t(`เพิ่ม ${saved.added} ในพื้นที่นี้แล้ว`, `${saved.added} added to this workspace`)
			: t('เพิ่มโปรแกรมในพื้นที่นี้แล้ว', 'Program added to this workspace');
	if (!saved.created) return '';
	if (hub.status !== 'active') return t('บันทึกเป็นฉบับร่างแล้ว — เปิดใช้งานเมื่อพร้อม', 'Saved as a draft. Activate it when ready.');
	if (hub.userSourceID) return t('บันทึกแล้ว — ส่งลิงก์ของพื้นที่นี้ให้ทีม', "Saved. Send your team this workspace's link.");
	return t('สร้างแล้ว — Claude/ChatGPT ที่เชื่อม ORCA ไว้จะเห็นพื้นที่นี้เอง', 'Created. Claude or ChatGPT connected to ORCA will see this workspace by itself.');
}

/** The same address without the save flags, so a reload does not show the toast again; undefined when there are none. */
/**
 * The workspace a hub's editing tabs work on (Codex release review 64): the
 * newest one, except while a tab has unsaved changes. Then it keeps the
 * version those changes were made on, and a save applies only what was
 * changed on top of the newest (saveHubPatch). Never an older version of the
 * same workspace: after a tab's own save the tabs start from what the save
 * returned, and a page copy from before it (its refresh failed) never takes
 * them back (Codex release review 70).
 */
export function editorWorkspace<T extends { id: string; version: number }>(editing: T, latest: T, unsaved: boolean): T {
	if (latest.id !== editing.id) return latest;
	if (latest.version < editing.version) return editing;
	return unsaved ? editing : latest;
}

export function withoutSavedParams(url: URL): string | undefined {
	if (!SAVED_PARAMS.some((key) => url.searchParams.has(key))) return undefined;
	const next = new URL(url.href);
	for (const key of SAVED_PARAMS) next.searchParams.delete(key);
	return next.pathname + next.search + next.hash;
}
