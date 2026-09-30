// สิ่งที่ AI ทำได้ in a program: which tools only read, the two presets, the
// 100-tool cap and the save payload (workspace UX plan §4, critique 1).
//
// The read/change split follows the backend's approval rule exactly
// (orcaToolChangesData, pkg/api/handlers/orca_approvals.go): a tool only reads
// when its reviewed definition says `readOnlyHint: true` and is not
// destructive. Everything else, including a tool whose provider said nothing,
// changes data. So a read-only save can never hold a tool that writes, and
// approvals never skip one.
import type { ConnectionInput, OrcaConnection } from '../services/orca';
import { toolPresentation } from './tool-presentation';

/** The backend refuses more than 100 tools on one program. */
export const MAX_PROGRAM_TOOLS = 100;

export type ProgramToolLike = { name: string; description?: string; definition?: unknown };
export type AccessPreset = 'read' | 'write';

function object(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** The tool's full MCP definition, as an object. */
export function toolDefinition(tool: ProgramToolLike): Record<string, unknown> | undefined {
	let definition = tool.definition;
	if (typeof definition === 'string') {
		try {
			definition = JSON.parse(definition);
		} catch {
			return undefined;
		}
	}
	return object(definition);
}

/** The definition's `annotations`, or undefined when there are none (or they are not an object). */
export function toolAnnotations(tool: ProgramToolLike): Record<string, unknown> | undefined {
	return object(toolDefinition(tool)?.annotations);
}

const hint = (value: unknown) => value === undefined || value === null || typeof value === 'boolean';

/** Whether the tool may change data: true unless it is annotated read-only and not destructive. */
export function toolChangesData(tool: ProgramToolLike): boolean {
	const annotations = toolAnnotations(tool);
	if (!annotations) return true;
	// A hint of another type fails to decode on the server, which then counts the tool as a write.
	if (!hint(annotations.readOnlyHint) || !hint(annotations.destructiveHint)) return true;
	return annotations.readOnlyHint !== true || annotations.destructiveHint === true;
}

/** The provider said nothing about whether this tool changes data ("ผู้ให้บริการไม่ได้ระบุ"). */
export function toolUnspecified(tool: ProgramToolLike): boolean {
	const annotations = toolAnnotations(tool);
	const absent = (value: unknown) => value === undefined || value === null;
	return !annotations || (absent(annotations.readOnlyHint) && absent(annotations.destructiveHint));
}

/** The backend's mark for a tool it always holds for approval (OrcaApprovalMetaKey, pkg/mcp/orca_api_line.go). */
export const ALWAYS_APPROVED_META = 'orca.invalid/approval';

/**
 * "ต้องอนุมัติทุกครั้ง": the reviewed definition marks the tool as always held
 * for an admin's approval, whatever the workspace's write mode (design §14l).
 * Presentation only: the server holds it either way. It does not decide the
 * read/change split, which stays the backend's own (toolChangesData); LINE's
 * six marked writes carry no readOnlyHint, so they are changes anyway.
 */
export function toolAlwaysApproved(tool: ProgramToolLike): boolean {
	const meta = object(toolDefinition(tool)?._meta);
	return !!meta && meta[ALWAYS_APPROVED_META] === 'always';
}

export type ToolGroups<T extends ProgramToolLike> = {
	/** ดูข้อมูล: annotated read-only and not destructive. */
	read: T[];
	/** สร้าง / แก้ไข / ลบ: everything else. */
	change: T[];
	/** Names in `change` whose provider said nothing ("ผู้ให้บริการไม่ได้ระบุ"). */
	unspecified: string[];
};

export function groupTools<T extends ProgramToolLike>(tools: readonly T[]): ToolGroups<T> {
	const read: T[] = [];
	const change: T[] = [];
	const unspecified: string[] = [];
	const seen = new Set<string>();
	for (const tool of tools) {
		if (!tool?.name || seen.has(tool.name)) continue;
		seen.add(tool.name);
		if (toolChangesData(tool)) {
			change.push(tool);
			if (toolUnspecified(tool)) unspecified.push(tool.name);
		} else read.push(tool);
	}
	return { read, change, unspecified };
}

/** Unique names, in order, at most `max`. */
export function capSelection(names: readonly string[], max = MAX_PROGRAM_TOOLS): string[] {
	return [...new Set(names.filter(Boolean))].slice(0, Math.max(0, max));
}

/** The read-only preset needs at least one tool that qualifies. */
export function readOnlyAvailable(tools: readonly ProgramToolLike[]): boolean {
	return tools.some((tool) => !toolChangesData(tool));
}

/** A new program starts read-only (owner decision); with nothing read-only, nothing is ticked. */
export function initialPreset(tools: readonly ProgramToolLike[]): AccessPreset {
	return readOnlyAvailable(tools) ? 'read' : 'write';
}

/** What a preset ticks: every read tool, or every tool; at most 100. */
export function presetSelection(tools: readonly ProgramToolLike[], preset: AccessPreset): string[] {
	const groups = groupTools(tools);
	return capSelection(preset === 'read' ? groups.read.map((tool) => tool.name) : [...groups.read, ...groups.change].map((tool) => tool.name));
}

/** The first selection of a new program. */
export function initialSelection(tools: readonly ProgramToolLike[]): string[] {
	return initialPreset(tools) === 'read' ? presetSelection(tools, 'read') : [];
}

/** A saved program's selection, kept to the tools the program still offers. */
export function savedSelection(tools: readonly ProgramToolLike[], toolNames: readonly string[]): string[] {
	const offered = new Set(tools.map((tool) => tool.name));
	return capSelection(toolNames.filter((name) => offered.has(name)));
}

/** Only read tools can be ticked under the read-only preset. */
export function selectableUnder(preset: AccessPreset, tool: ProgramToolLike): boolean {
	return preset === 'write' || !toolChangesData(tool);
}

/** Ticks or unticks one tool; a new tick past the cap is refused. */
export function toggleTool(selected: readonly string[], name: string, max = MAX_PROGRAM_TOOLS): string[] {
	if (selected.includes(name)) return selected.filter((item) => item !== name);
	return selected.length >= max ? [...selected] : [...selected, name];
}

/** "เลือกทั้งหมด" for a group: unticks it when every tool is ticked, otherwise ticks it up to the cap. */
export function toggleGroup(selected: readonly string[], group: readonly string[], max = MAX_PROGRAM_TOOLS): string[] {
	if (group.length && group.every((name) => selected.includes(name))) return selected.filter((name) => !group.includes(name));
	return capSelection([...selected, ...group], max);
}

/** Whether every tool of a group is ticked. */
export function groupChecked(selected: readonly string[], group: readonly string[]): boolean {
	return group.length > 0 && group.every((name) => selected.includes(name));
}

/** The preset a selection belongs to: read-only when nothing ticked can change data. */
export function presetFor(selected: readonly string[], tools: readonly ProgramToolLike[]): AccessPreset {
	if (!selected.length) return initialPreset(tools);
	return selectionReadOnly(selected, tools) ? 'read' : 'write';
}

/** A save is read-only only when every ticked tool is offered and only reads. */
export function selectionReadOnly(selected: readonly string[], tools: readonly ProgramToolLike[]): boolean {
	return (
		selected.length > 0 &&
		selected.every((name) => {
			const tool = tools.find((item) => item.name === name);
			return !!tool && !toolChangesData(tool);
		})
	);
}

/** Why a save cannot go yet, or '' when it can. */
export function saveProblem(input: { name: string; selected: readonly string[] }): '' | 'name' | 'tools' | 'too-many' {
	if (!input.name.trim()) return 'name';
	if (!input.selected.length) return 'tools';
	if (input.selected.length > MAX_PROGRAM_TOOLS) return 'too-many';
	return '';
}

/**
 * A program save the server refused, in plain Thai when it is one of its own
 * rules; undefined leaves the general message (orcaError). B3: the server
 * refuses a save with nothing ticked, or not reviewed.
 */
export function programSaveMessage(message: string, t: (th: string, en: string) => string): string | undefined {
	const text = message.toLowerCase();
	// A server from before B3 still needs the note (it says so in one message with
	// the tools, which the form never sends empty): only while ORCA updates, as
	// the workspace deploys before the backend (Codex release review 63).
	if (text.includes('describe the actual upstream data scope'))
		return t(
			'ORCA กำลังอัปเดต ช่วงนี้ยังต้องใส่หมายเหตุ ใส่สั้น ๆ ว่า AI เห็นข้อมูลอะไร แล้วบันทึกอีกครั้ง',
			'ORCA is updating and still needs the note for now. Add a short note on what data AI sees, then save again.'
		);
	if (text.includes('review at least one selected tool')) return t('เลือกสิ่งที่ AI ทำได้อย่างน้อย 1 อย่าง', 'Choose at least one thing AI can do.');
	if (text.includes('the scope note is too long')) return t('หมายเหตุยาวเกินไป ย่อให้สั้นลงแล้วบันทึกอีกครั้ง', 'The note is too long. Shorten it and save again.');
	return undefined;
}

/**
 * The connection save. Always `reviewedTools: true` (the click on "อนุญาต N
 * อย่างนี้" is the review), plus `reviewedReadOnly` when every ticked tool only
 * reads. The note is optional: sent as typed, or "" (B3).
 */
export function programSaveInput(input: {
	name: string;
	note: string;
	mcpID: string;
	selected: readonly string[];
	tools: readonly ProgramToolLike[];
	existing?: Pick<OrcaConnection, 'description' | 'enabled' | 'version'>;
}): ConnectionInput {
	const offered = new Set(input.tools.map((tool) => tool.name));
	const toolNames = capSelection(input.selected.filter((name) => offered.has(name)));
	return {
		name: input.name.trim(),
		description: input.existing?.description ?? '',
		mcpID: input.mcpID,
		toolNames,
		scopeNote: input.note.trim(),
		reviewedTools: true,
		reviewedReadOnly: selectionReadOnly(toolNames, input.tools),
		enabled: input.existing ? input.existing.enabled : true,
		...(input.existing ? { version: input.existing.version } : {})
	};
}

/** A saved program's "AI ทำได้ 8 อย่าง · อ่านอย่างเดียว". */
export function accessSummary(connection: Pick<OrcaConnection, 'toolNames' | 'reviewedReadOnly' | 'reviewedTools' | 'tools'>) {
	const count = connection.toolNames?.length ?? 0;
	const tools = (connection.tools ?? []) as ProgramToolLike[];
	const readOnly = connection.reviewedReadOnly === true || (count > 0 && selectionReadOnly(connection.toolNames, tools));
	return { count, readOnly, reviewed: connection.reviewedReadOnly === true || connection.reviewedTools === true };
}

/** A tool's label and one-line description, the provider's title first. */
export function toolCopy(tool: ProgramToolLike, locale: 'th' | 'en' = 'th') {
	const definition = toolDefinition(tool);
	const annotations = toolAnnotations(tool);
	const title = typeof definition?.title === 'string' ? definition.title : undefined;
	const annotationTitle = typeof annotations?.title === 'string' ? annotations.title : undefined;
	const presented = toolPresentation({ name: tool.name, title, description: tool.description, annotations: { title: annotationTitle } }, locale);
	const first = presented.description.split(/\n+/)[0].trim();
	return { label: presented.label, description: first && first !== presented.label ? first : '' };
}

/** The provider's own hints, for "สำหรับนักพัฒนา". */
export function toolHintText(tool: ProgramToolLike): string {
	const annotations = toolAnnotations(tool);
	if (!annotations) return 'no annotations';
	const parts = ['readOnlyHint', 'destructiveHint']
		.filter((key) => annotations[key] !== undefined)
		.map((key) => `${key}: ${JSON.stringify(annotations[key])}`);
	return parts.join(', ') || 'no hints';
}

/**
 * An AI call's tool in words, the same on Home, ตรวจสอบ and รออนุมัติ as on
 * the program's own pages: the program's title for it (toolCopy), looked up in
 * the call's program first, then in any program that has a tool of that name.
 */
export function eventToolLabel(
	connections: readonly { id: string; tools: readonly ProgramToolLike[] }[],
	connectionID: string | undefined,
	toolName: string,
	locale: 'th' | 'en' = 'th'
): string {
	const tool =
		connections.find((connection) => connection.id === connectionID)?.tools.find((item) => item.name === toolName) ??
		connections.flatMap((connection) => connection.tools).find((item) => item.name === toolName);
	return toolCopy(tool ?? { name: toolName }, locale).label;
}
