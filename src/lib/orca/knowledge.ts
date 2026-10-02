// คลังความรู้ (workspace UX U8, the interim UI of proposal §3.6): the logic
// behind KnowledgeLibrary and LibraryEditor, free of Svelte so it is tested.
// Everything here only guides the screen. The server still decides who may
// read, write and publish each item.
import type { OrcaBootstrap, OrcaHub } from '../services/orca';
import type {
	LibraryAudienceMode,
	LibraryDepartment,
	LibraryFileInfo,
	LibraryFileVersion,
	LibraryInput,
	LibraryItem,
	LibraryKind,
	LibraryLocator,
	LibraryParameter,
	LibraryReadParts,
	LibraryStatus,
	LibraryUsage
} from '../services/orca-library';
import { gatewayHasMember } from './gateway-sources';

type Translate = (th: string, en: string) => string;

/** The backend's limit on an item's content (orca_library.go orcaMaxContent). */
export const LIBRARY_CONTENT_MAX = 40000;
export const LIBRARY_TITLE_MAX = 160;
export const LIBRARY_SUMMARY_MAX = 500;
export const TEMPLATE_FIELDS_MAX = 20;
export const TEMPLATE_ARTICLES_MAX = 20;
/** Rows shown before "ดูอีก N เรื่อง". */
export const LIBRARY_PAGE = 7;

// ── Which workspace the library opens ───────────────────────────────

/** Workspaces whose library can be opened (the server refuses the others). */
const OPEN_STATUSES = ['active', 'draft', 'paused'];

export type LibraryScope =
	/** The library of `hub`; `choices` are every workspace the viewer belongs to. */
	| { kind: 'hub'; hub: OrcaHub; choices: OrcaHub[] }
	/**
	 * A manager who is not in the workspace (or in any): "เพิ่มฉันเลย". `mine`:
	 * the workspaces they are in, to switch to instead (a link to someone else's).
	 */
	| { kind: 'join'; hubs: OrcaHub[]; mine?: OrcaHub[] }
	/** A manager in a company with no AI workspace yet. */
	| { kind: 'create' }
	/** An employee in no workspace: generic copy asking an admin. */
	| { kind: 'request' }
	/** The workspace in the address is gone, or not the viewer's. */
	| { kind: 'missing' };

/** Active workspaces first, then by name. */
export function sortHubs(hubs: readonly OrcaHub[]): OrcaHub[] {
	return [...hubs].sort(
		(a, b) =>
			Number(b.status === 'active') - Number(a.status === 'active') ||
			a.name.localeCompare(b.name, 'th')
	);
}

export function libraryScope(input: {
	hubs: readonly OrcaHub[];
	currentUserID: string;
	canManage: boolean;
	requestedID?: string;
	rememberedID?: string;
}): LibraryScope {
	const open = input.hubs.filter((hub) => OPEN_STATUSES.includes(hub.status));
	const mine = sortHubs(open.filter((hub) => gatewayHasMember(hub, input.currentUserID)));
	if (!input.canManage && !mine.length) return { kind: 'request' };
	if (input.requestedID) {
		const hub = mine.find((item) => item.id === input.requestedID);
		if (hub) return { kind: 'hub', hub, choices: mine };
		const other = open.find((item) => item.id === input.requestedID);
		if (other && input.canManage) return mine.length ? { kind: 'join', hubs: [other], mine } : { kind: 'join', hubs: [other] };
		return { kind: 'missing' };
	}
	if (mine.length)
		return { kind: 'hub', hub: mine.find((hub) => hub.id === input.rememberedID) ?? mine[0], choices: mine };
	return open.length ? { kind: 'join', hubs: sortHubs(open) } : { kind: 'create' };
}

// ── What this company's library offers ─────────────────────────────

export type LibraryFeatures = {
	/** Knowledge library v2 is on for the company: uploads, file screens and the live audience. */
	files: boolean;
	/**
	 * The server knows `audienceMode` (its bootstrap has `features`). Saves
	 * send it only then: an older server refuses unknown fields, and a newer
	 * one refuses to replace a live audience with a list it was not sent.
	 */
	audienceModes: boolean;
};

/** A line of facts joined by " · ", leaving out the empty ones. */
export function factLine(parts: readonly (string | false | undefined | null)[]): string {
	return parts.filter((part): part is string => !!part).join(' · ');
}

export function libraryFeatures(data: Pick<OrcaBootstrap, 'features'>): LibraryFeatures {
	return { files: data.features?.libraryV2 === true, audienceModes: !!data.features && typeof data.features === 'object' };
}

// ── Who can use an item ─────────────────────────────────────────────

export type AudienceShape = Pick<LibraryItem, 'ownerID' | 'memberIDs' | 'unitIDs'> & { audienceMode?: LibraryAudienceMode };
export type AudienceSelection = Pick<LibraryItem, 'memberIDs' | 'unitIDs'> & { audienceMode?: LibraryAudienceMode };

const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

/**
 * The people whose AI can read a published item: its author, the people
 * chosen and the chosen departments' workspace members; for a live audience
 * ("ทุกคน (อัปเดตอัตโนมัติ)") everyone in the workspace now.
 */
export function audiencePeople(item: AudienceShape, departments: readonly LibraryDepartment[], workspaceMemberIDs: readonly string[] = []): Set<string> {
	const people = new Set<string>([item.ownerID, ...item.memberIDs]);
	if (item.audienceMode === 'everyone_live') for (const id of workspaceMemberIDs) people.add(id);
	for (const id of item.unitIDs)
		for (const member of departments.find((department) => department.unitID === id)?.memberIDs ?? [])
			people.add(member);
	people.delete('');
	return people;
}

/**
 * "ทุกคนในพื้นที่ทำงานนี้": the workspace's department grants (live) plus its
 * direct members (a snapshot), without the author. Only departments and
 * people the library knows are kept, as the server refuses the others.
 */
export function workspaceEveryone(
	hub: Pick<OrcaHub, 'memberIDs' | 'accessUnitIDs'>,
	departments: readonly LibraryDepartment[],
	memberIDs: readonly string[],
	me: string
): AudienceSelection {
	const known = new Set(departments.map((department) => department.unitID));
	const people = new Set(memberIDs);
	return {
		unitIDs: unique((hub.accessUnitIDs ?? []).filter((id) => known.has(id))),
		memberIDs: unique((hub.memberIDs ?? []).filter((id) => id !== me && people.has(id)))
	};
}

/**
 * The editor's audience choices. `everyone_live` is "ทุกคน (อัปเดตอัตโนมัติ)";
 * `everyone` is today's "ทุกคนในพื้นที่ทำงานนี้": live departments plus the
 * workspace's people as they are now.
 */
export type AudienceMode = 'everyone_live' | 'everyone' | 'departments' | 'people' | 'me' | 'mixed';

function sameSet(a: readonly string[], b: readonly string[]) {
	const left = new Set(a);
	const right = new Set(b);
	return left.size === right.size && [...left].every((value) => right.has(value));
}

/** The editor's choice for a saved audience; `mixed` is an older mix of departments and people. */
export function audienceMode(item: AudienceSelection, everyone: AudienceSelection): AudienceMode {
	if (item.audienceMode === 'everyone_live') return 'everyone_live';
	if (!item.memberIDs.length && !item.unitIDs.length) return 'me';
	if (sameSet(item.unitIDs, everyone.unitIDs) && sameSet(item.memberIDs, everyone.memberIDs)) return 'everyone';
	if (item.unitIDs.length && !item.memberIDs.length) return 'departments';
	if (item.memberIDs.length && !item.unitIDs.length) return 'people';
	return 'mixed';
}

/** What a mode sends: departments and people are kept apart, so a switch never drops a choice made earlier. */
export function audienceFor(
	mode: AudienceMode,
	choice: { unitIDs: readonly string[]; memberIDs: readonly string[] },
	everyone: AudienceSelection
): AudienceSelection {
	// Live: nobody is listed; the server follows the workspace.
	if (mode === 'everyone_live') return { unitIDs: [], memberIDs: [] };
	if (mode === 'everyone') return { unitIDs: [...everyone.unitIDs], memberIDs: [...everyone.memberIDs] };
	if (mode === 'departments') return { unitIDs: unique(choice.unitIDs), memberIDs: [] };
	if (mode === 'people') return { unitIDs: [], memberIDs: unique(choice.memberIDs) };
	if (mode === 'mixed') return { unitIDs: unique(choice.unitIDs), memberIDs: unique(choice.memberIDs) };
	return { unitIDs: [], memberIDs: [] };
}

export type AudienceChip = { kind: 'everyone' | 'me' | 'departments' | 'people'; label: string };

/**
 * The row's "ใครใช้ได้" chip. Only for items the viewer can edit: the server
 * sends other people's items without their audience (critique 8).
 */
export function audienceChip(
	item: AudienceShape,
	context: {
		departments: readonly LibraryDepartment[];
		/** Everyone in the workspace now (the library's member list). */
		workspaceMemberIDs: readonly string[];
		personName: (id: string) => string;
		departmentName: (id: string) => string;
	},
	t: Translate
): AudienceChip {
	if (item.audienceMode === 'everyone_live') return { kind: 'everyone', label: t('ทุกคน', 'Everyone') };
	if (!item.memberIDs.length && !item.unitIDs.length) return { kind: 'me', label: t('เฉพาะฉัน', 'Only me') };
	const people = audiencePeople(item, context.departments);
	if (context.workspaceMemberIDs.length > 1 && context.workspaceMemberIDs.every((id) => people.has(id)))
		return { kind: 'everyone', label: t('ทุกคน', 'Everyone') };
	const labels = [...item.unitIDs.map(context.departmentName), ...item.memberIDs.map(context.personName)];
	return {
		kind: item.unitIDs.length ? 'departments' : 'people',
		label: labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]
	};
}

/** "ธนา, ศิริ" or "ธนา, ศิริ และอีก 3 คน". */
export function peopleList(names: readonly string[], t: Translate, shown = 2): string {
	if (names.length <= shown + 1) return names.join(', ');
	const rest = names.length - shown;
	return `${names.slice(0, shown).join(', ')}${t(` และอีก ${rest} คน`, ` and ${rest} more`)}`;
}

// ── The list ────────────────────────────────────────────────────────

export type LibraryFilter = 'all' | 'published' | 'draft' | 'archived';

export function libraryCounts(items: readonly LibraryItem[], kind: LibraryKind) {
	const of = (status: LibraryStatus) => items.filter((item) => item.kind === kind && item.status === status).length;
	const published = of('published');
	const draft = of('draft');
	return { published, draft, archived: of('archived'), current: published + draft };
}

function fold(value: string) {
	return value.normalize('NFKC').toLocaleLowerCase().trim();
}

/** "ทั้งหมด" is everything not archived; archived items have their own chip. Newest first. */
export function filterLibrary(
	items: readonly LibraryItem[],
	kind: LibraryKind,
	filter: LibraryFilter,
	query: string
): LibraryItem[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	return items
		.filter((item) => item.kind === kind)
		.filter((item) => (filter === 'all' ? item.status !== 'archived' : item.status === filter))
		.filter((item) => {
			const text = fold(`${item.title} ${item.summary} ${item.file?.fileName ?? ''}`);
			return words.every((word) => text.includes(word));
		})
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'th'));
}

/** The line under a row's title: its short description, else the start of its content. */
export function itemExcerpt(item: Pick<LibraryItem, 'summary' | 'content'>, max = 90): string {
	const text = (item.summary || item.content).replace(/[#*_>`-]+/g, ' ').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ── Time ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const BANGKOK = 7 * 3_600_000;
const bangkokDay = (ms: number) => Math.floor((ms + BANGKOK) / DAY);

/** "2 ชั่วโมงที่แล้ว", "เมื่อวาน", "5 วันที่แล้ว", then the date (Bangkok time). */
export function relativeTime(value: string, now: number, t: Translate, locale = 'th-TH'): string {
	const then = Date.parse(value);
	if (Number.isNaN(then)) return '—';
	const minutes = Math.floor((now - then) / 60_000);
	const days = bangkokDay(now) - bangkokDay(then);
	if (minutes < 1) return t('เมื่อสักครู่', 'Just now');
	if (minutes < 60) return t(`${minutes} นาทีที่แล้ว`, `${minutes} min ago`);
	if (days <= 0) {
		const hours = Math.floor(minutes / 60);
		return t(`${hours} ชั่วโมงที่แล้ว`, hours === 1 ? '1 hour ago' : `${hours} hours ago`);
	}
	if (days === 1) return t('เมื่อวาน', 'Yesterday');
	if (days < 7) return t(`${days} วันที่แล้ว`, `${days} days ago`);
	return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(then);
}

// ── Ready-made prompts: fields shown with Thai labels ───────────────
// The server's placeholders are {{name}} with an English-style name. The
// editor shows each one as {{its Thai label}} and never asks for a name: a
// new field is called field_1, field_2… (proposal §3.6, screen 5).

const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function nextFieldName(parameters: readonly LibraryParameter[]): string {
	let number = 1;
	while (parameters.some((parameter) => parameter.name === `field_${number}`)) number += 1;
	return `field_${number}`;
}

/** A label can hold any language, but no braces, and fits the server's 120 characters. */
export function cleanFieldLabel(label: string): string {
	return label.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function fieldLabelTaken(parameters: readonly LibraryParameter[], label: string, except = ''): boolean {
	const key = fold(cleanFieldLabel(label));
	return parameters.some((parameter) => parameter.name !== except && fold(parameter.label) === key);
}

/**
 * The text each field shows as in the editor, by field name: its label, or
 * its name (unique on the server) when it has no label, or when another field
 * shows the same label or is named like it. The server allows two fields with
 * one label, so this keeps every {{…}} the editor shows tied to exactly one
 * field, and a save gives back the content it was given (Codex release review 63).
 */
export function fieldTokens(parameters: readonly LibraryParameter[]): Map<string, string> {
	const wanted = parameters.map((parameter) => cleanFieldLabel(parameter.label) || parameter.name);
	const shown = new Map<string, number>();
	for (const token of wanted) shown.set(fold(token), (shown.get(fold(token)) ?? 0) + 1);
	const tokens = new Map<string, string>();
	parameters.forEach((parameter, index) => {
		const token = wanted[index];
		const shared =
			(shown.get(fold(token)) ?? 0) > 1 || parameters.some((other) => other.name !== parameter.name && fold(other.name) === fold(token));
		tokens.set(parameter.name, shared ? parameter.name : token);
	});
	return tokens;
}

/** The field a {{…}} in the editor stands for: the text it shows as, else its name as typed. */
function fieldFor(inner: string, parameters: readonly LibraryParameter[], tokens = fieldTokens(parameters)) {
	if (!inner) return undefined;
	const exact = parameters.find((parameter) => tokens.get(parameter.name) === inner);
	if (exact) return exact;
	const folded = parameters.filter((parameter) => fold(tokens.get(parameter.name) ?? '') === fold(inner));
	if (folded.length === 1) return folded[0];
	return parameters.find((parameter) => parameter.name === inner);
}

/** The saved content as the editor shows it: {{customer}} becomes {{ชื่อลูกค้า}}. */
export function contentForEditing(content: string, parameters: readonly LibraryParameter[]): string {
	const tokens = fieldTokens(parameters);
	return content.replace(TOKEN, (match, inner: string) => {
		const token = tokens.get(inner);
		return token === undefined ? match : `{{${token}}}`;
	});
}

/** The editor's text as the server stores it. `unknown` lists {{…}} that match no field. */
export function contentForSaving(
	text: string,
	parameters: readonly LibraryParameter[]
): { content: string; unknown: string[] } {
	const unknown: string[] = [];
	const tokens = fieldTokens(parameters);
	const content = text.replace(TOKEN, (match, inner: string) => {
		if (!inner) return match;
		const field = fieldFor(inner, parameters, tokens);
		if (field) return `{{${field.name}}}`;
		if (!unknown.includes(inner)) unknown.push(inner);
		return match;
	});
	return { content, unknown };
}

/** Field names the editor's text uses. */
export function fieldsInUse(text: string, parameters: readonly LibraryParameter[]): Set<string> {
	const used = new Set<string>();
	const tokens = fieldTokens(parameters);
	for (const [, inner] of text.matchAll(TOKEN)) {
		const field = fieldFor(inner, parameters, tokens);
		if (field) used.add(field.name);
	}
	return used;
}

/**
 * The editor's text after its fields changed from `before` to `after` (one
 * renamed, added or removed): each {{…}} of a field that stays shows as that
 * field shows now, one of a removed field goes, and anything else stays as typed.
 */
export function retokenFields(text: string, before: readonly LibraryParameter[], after: readonly LibraryParameter[]): string {
	const was = fieldTokens(before);
	const now = fieldTokens(after);
	return text.replace(TOKEN, (match, inner: string) => {
		const field = fieldFor(inner, before, was);
		if (!field) return match;
		const token = now.get(field.name);
		return token === undefined ? '' : `{{${token}}}`;
	});
}

/**
 * The editor's text with a new field's chip put in place of the selection,
 * after the fields changed from `before` to `after` (the new one added):
 * the text before and after the selection is re-shown on its own, so the chip
 * lands where the caret was even when other chips change length (Codex
 * release review 64). `caret` is just after the chip.
 */
export function insertField(
	text: string,
	start: number,
	end: number,
	before: readonly LibraryParameter[],
	after: readonly LibraryParameter[],
	name: string
) {
	// Never inside a chip (the textarea lets the caret sit in one): the start
	// moves past the chip it is in, the end back before it (Codex release review 65).
	const chips = [...text.matchAll(TOKEN)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
	const inside = (position: number) => chips.find((chip) => position > chip.start && position < chip.end);
	const clampedStart = Math.max(0, Math.min(start, text.length));
	const clampedEnd = Math.max(clampedStart, Math.min(end, text.length));
	const from = inside(clampedStart)?.end ?? clampedStart;
	const to = Math.max(from, inside(clampedEnd)?.start ?? clampedEnd);
	const head = retokenFields(text.slice(0, from), before, after);
	const chip = `{{${fieldTokens(after).get(name) ?? name}}}`;
	return { text: head + chip + retokenFields(text.slice(to), before, after), caret: head.length + chip.length };
}

/** Text with `insert` put in place of the selection; `caret` is just after it. */
export function insertText(text: string, start: number, end: number, insert: string) {
	const from = Math.max(0, Math.min(start, text.length));
	const to = Math.max(from, Math.min(end, text.length));
	return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length };
}

/** The editor's text split into plain runs and field chips, for the highlight behind it. */
export function tokenRuns(text: string, parameters: readonly LibraryParameter[]) {
	const runs: { text: string; field: boolean; known: boolean }[] = [];
	const tokens = fieldTokens(parameters);
	let position = 0;
	for (const match of text.matchAll(TOKEN)) {
		const index = match.index ?? 0;
		if (index > position) runs.push({ text: text.slice(position, index), field: false, known: false });
		const inner = match[1];
		const known = !!fieldFor(inner, parameters, tokens);
		runs.push({ text: match[0], field: !!inner, known });
		position = index + match[0].length;
	}
	if (position < text.length) runs.push({ text: text.slice(position), field: false, known: false });
	return runs;
}

// ── Ready-made prompts: supporting articles ─────────────────────────

export type ArticleMismatch =
	| { articleID: string; title: string; who: string; count: number }
	| { articleID: string; title: string; unknown: true };

/**
 * People who could use the prompt but cannot read one of its articles: the
 * server then hides the prompt from them. Computed here, from what the
 * viewer can see; another author's article has no audience to compare.
 */
export function templateMismatches(
	template: AudienceShape,
	articles: readonly LibraryItem[],
	context: {
		departments: readonly LibraryDepartment[];
		personName: (id: string) => string;
		departmentName: (id: string) => string;
		/** The workspace's members now, for live audiences. */
		workspaceMemberIDs?: readonly string[];
	},
	t: Translate
): ArticleMismatch[] {
	const audience = audiencePeople(template, context.departments, context.workspaceMemberIDs);
	const result: ArticleMismatch[] = [];
	for (const article of articles) {
		if (!article.canEdit) {
			if (audience.size > 1) result.push({ articleID: article.id, title: article.title, unknown: true });
			continue;
		}
		const readers = audiencePeople(article, context.departments, context.workspaceMemberIDs);
		const missing = [...audience].filter((id) => !readers.has(id));
		if (!missing.length) continue;
		const whole = template.unitIDs.filter((id) => {
			const members = context.departments.find((department) => department.unitID === id)?.memberIDs ?? [];
			return members.length > 0 && members.every((member) => missing.includes(member));
		});
		const covered = new Set(
			whole.flatMap((id) => context.departments.find((department) => department.unitID === id)?.memberIDs ?? [])
		);
		const rest = missing.filter((id) => !covered.has(id));
		const parts = [
			...whole.map(context.departmentName),
			...(rest.length ? [peopleList(rest.map(context.personName), t)] : [])
		];
		result.push({ articleID: article.id, title: article.title, who: parts.join(t(' และ ', ' and ')), count: missing.length });
	}
	return result;
}

export function mismatchMessage(mismatch: ArticleMismatch, t: Translate): string {
	return 'unknown' in mismatch
		? t(
				`“${mismatch.title}” ตั้งสิทธิ์โดยผู้เขียน ถ้าใครอ่านเรื่องนี้ไม่ได้ AI ของเขาจะใช้คำสั่งนี้ไม่ได้`,
				`“${mismatch.title}” has its author’s access. Anyone who can’t read it can’t use this prompt.`
			)
		: t(
				`${mismatch.who} จะใช้คำสั่งนี้ไม่ได้ เพราะอ่าน “${mismatch.title}” ไม่ได้`,
				`${mismatch.who} can’t use this prompt because they can’t read “${mismatch.title}”.`
			);
}

// ── Try it in AI ────────────────────────────────────────────────────

/**
 * The item the "ลองถาม AI" card asks about: the one open, else the newest
 * published one of the kind shown (articles by default). A file counts only
 * once it has a version the AI can read.
 */
export function askItem(items: readonly LibraryItem[], open?: LibraryItem, kind: LibraryKind = 'knowledge'): LibraryItem | undefined {
	const usable = (item: LibraryItem) => item.status === 'published' && (item.kind !== 'file' || fileServable(item.file));
	if (open && usable(open)) return open;
	return filterLibrary(items, kind, 'published', '').filter(usable)[0] ?? filterLibrary(items, 'knowledge', 'published', '')[0];
}

export function askPrompt(item: Pick<LibraryItem, 'kind' | 'title'>, t: Translate): string {
	if (item.kind === 'file') return t(`ช่วยสรุปไฟล์ “${item.title}” จากคลังความรู้ของบริษัทให้หน่อย`, `Summarize the file “${item.title}” from our company knowledge`);
	return item.kind === 'template'
		? t(`ใช้คำสั่งสำเร็จรูป “${item.title}” จาก ORCA`, `Use the ORCA ready-made prompt “${item.title}”`)
		: t(`ช่วยสรุปเรื่อง “${item.title}” จากคลังความรู้ของบริษัทให้หน่อย`, `Summarize “${item.title}” from our company knowledge`);
}

/** An employee in no workspace copies this to ask an admin (generic: they cannot see who the admins are). */
export function accessRequestMessage(person: string, company: string, t: Translate): string {
	return t(
		`รบกวนเพิ่ม ${person} เข้าพื้นที่ทำงาน AI ของ ${company} ใน ORCA ให้หน่อย จะได้ใช้คลังความรู้กับทีมได้ ขอบคุณ`,
		`Please add ${person} to an AI workspace of ${company} in ORCA, so I can use the team's knowledge. Thank you.`
	);
}

// ── Refusals in plain Thai ──────────────────────────────────────────
// The server explains a refused save or preview in English
// (orca_library.go, khumInvalid). The page says what to do instead.

const PROBLEMS: readonly (readonly [RegExp, string, string])[] = [
	[/library item limit reached/, 'พื้นที่ทำงานนี้มีครบ 1,000 เรื่องแล้ว จัดเก็บเรื่องที่ไม่ใช้ก่อน แล้วลองอีกครั้ง', 'This workspace has 1,000 items. Archive some you no longer use, then try again.'],
	[/library member must be an active person/, 'บางคนที่เลือกไว้ถูกระงับหรือออกจากบริษัทแล้ว เอาออกแล้วลองอีกครั้ง', 'Someone you chose was suspended or left the company. Remove them and try again.'],
	[/library member must belong to the workspace/, 'บางคนที่เลือกไว้ไม่ได้อยู่ในพื้นที่ทำงานนี้แล้ว เอาออกแล้วลองอีกครั้ง', 'Someone you chose is no longer in this workspace. Remove them and try again.'],
	[/library department does not exist/, 'บางแผนกที่เลือกไว้ถูกจัดเก็บหรือลบแล้ว เอาออกแล้วลองอีกครั้ง', 'A department you chose was archived or removed. Remove it and try again.'],
	[/referenced knowledge exceeds response limit/, 'เรื่องที่ AI อ่านประกอบยาวรวมกันเกินที่ส่งให้ AI ได้ เลือกให้น้อยลง', 'The articles AI reads with it are too long together. Choose fewer.'],
	[/undeclared parameter/, 'ในข้อความมีช่องที่ยังไม่ได้เพิ่ม กด แทรกช่องให้กรอก หรือลบออกจากข้อความ', 'The text has a field that was never added. Insert it as a field, or delete it.'],
	[/duplicate template parameter|too many template parameters/, 'ช่องให้กรอกต้องมีชื่อไม่ซ้ำกัน และมีได้ไม่เกิน 20 ช่อง', 'Fields need different names, and there can be at most 20.'],
	[/invalid library title/, 'ชื่อเรื่องต้องมี และยาวไม่เกิน 160 ตัวอักษร', 'A title is needed, up to 160 characters.'],
	[/invalid library content/, 'เนื้อหาต้องมี และยาวไม่เกิน 40,000 ตัวอักษร', 'Content is needed, up to 40,000 characters.'],
	[/invalid library summary/, 'คำอธิบายสั้นยาวเกินไป', 'The short description is too long.'],
	[/required template input is missing/, 'กรอกช่องที่ต้องกรอกให้ครบก่อน', 'Fill in every required field first.'],
	[/template input|rendered template exceeds/, 'ข้อความที่กรอกยาวเกินไป ลองให้สั้นลง', 'What you filled in is too long. Try shorter text.']
];

/**
 * A refused library call in plain words, or undefined to fall back on the
 * shared messages (sign-in, permission, a conflicting save).
 */
export function libraryProblem(error: { status: number; message: string }, t: Translate): string | undefined {
	if (error.status === 400) {
		const known = PROBLEMS.find(([pattern]) => pattern.test(error.message));
		return known
			? t(known[1], known[2])
			: t('บันทึกไม่ได้ เพราะข้อมูลบางส่วนไม่ถูกต้อง ตรวจแล้วลองอีกครั้ง', 'This could not be saved: something in it is not valid. Check it and try again.');
	}
	if (error.status >= 500) return t('ORCA ทำรายการนี้ไม่สำเร็จ ลองอีกครั้ง', 'ORCA could not do this. Try again.');
	return undefined;
}

/** A save the server refused because a person, a department or an article changed since the page loaded. */
export function libraryStale(error: { status: number; message: string }): boolean {
	return error.status === 403 || error.status === 404 || (error.status === 400 && /library member must|library department does not/.test(error.message));
}

/** The first required field left empty, for the preview form (checked here so the message is in Thai). */
export function missingInput(parameters: readonly LibraryParameter[], inputs: Record<string, string>): LibraryParameter | undefined {
	return parameters.find((parameter) => parameter.required && !(inputs[parameter.name] ?? '').trim());
}

/** Supporting articles a prompt names that the viewer can no longer read as published. */
export function brokenReferences(template: Pick<LibraryItem, 'kind' | 'knowledgeIDs'>, items: readonly LibraryItem[]): string[] {
	if (template.kind !== 'template') return [];
	return template.knowledgeIDs.filter((id) => !items.some((item) => item.id === id && item.kind === 'knowledge' && item.status === 'published'));
}

// "เพิ่มฉันเลย" saves through workspace-edit's saveHubPatch() and joinPatch() (critique 2).

/** The address without the one-time "&create=1" intent, or undefined when it has none. */
export function withoutCreateIntent(url: URL): string | undefined {
	if (!url.searchParams.has('create')) return undefined;
	const next = new URL(url.href);
	next.searchParams.delete('create');
	return next.pathname + next.search + next.hash;
}

// ── Saving an item ──────────────────────────────────────────────────

/**
 * What a save sends for an item the page already has (archiving a file or
 * an article, or the editor's save): its own fields with `changes` on top.
 * `audienceMode` goes only to a server that knows it; a live item keeps it,
 * and a live audience lists nobody.
 */
export function libraryInput(
	item: Pick<LibraryItem, 'kind' | 'title' | 'summary' | 'content' | 'parameters' | 'knowledgeIDs' | 'memberIDs' | 'unitIDs' | 'status' | 'version' | 'audienceMode'>,
	changes: Partial<LibraryInput>,
	features: Pick<LibraryFeatures, 'audienceModes'>
): LibraryInput {
	const kind = changes.kind ?? item.kind;
	const mode = changes.audienceMode ?? item.audienceMode ?? 'list';
	const live = mode === 'everyone_live';
	const file = kind === 'file';
	const input: LibraryInput = {
		kind,
		title: changes.title ?? item.title,
		summary: changes.summary ?? item.summary,
		// A file's text lives in its versions: its item carries none.
		content: file ? '' : (changes.content ?? item.content),
		parameters: kind === 'template' ? [...(changes.parameters ?? item.parameters)] : [],
		knowledgeIDs: kind === 'template' ? [...(changes.knowledgeIDs ?? item.knowledgeIDs)] : [],
		memberIDs: live ? [] : [...(changes.memberIDs ?? item.memberIDs)],
		unitIDs: live ? [] : [...(changes.unitIDs ?? item.unitIDs)],
		status: changes.status ?? item.status,
		version: changes.version ?? item.version
	};
	if (features.audienceModes) input.audienceMode = live ? 'everyone_live' : 'list';
	return input;
}

/** The mode a choice saves as. */
export function audienceWireMode(mode: AudienceMode): LibraryAudienceMode {
	return mode === 'everyone_live' ? 'everyone_live' : 'list';
}

/** An item's owner is no longer in the workspace (or the company): a manager may take it over. */
export function ownerDeparted(item: Pick<LibraryItem, 'ownerID'>, workspaceMembers: readonly { id: string; status?: string }[]): boolean {
	return !workspaceMembers.some((member) => member.id === item.ownerID && (!member.status || member.status === 'active'));
}

/** "รับช่วงดูแล": offered to a company owner or admin, with files on, for an item someone else owns who left. The server decides. */
export function canTakeOver(
	item: Pick<LibraryItem, 'ownerID' | 'canEdit'>,
	context: { files: boolean; canManage: boolean; me: string; workspaceMembers: readonly { id: string; status?: string }[] }
): boolean {
	return context.files && context.canManage && !item.canEdit && item.ownerID !== context.me && ownerDeparted(item, context.workspaceMembers);
}

// ── Files (knowledge library v2, C4 §14m S5–S7) ─────────────────────
// The server checks everything again; these only explain, in Thai, before
// and after it answers.

/** The server's limits (gateway OrcaUploadMaxFileBytes, OrcaUploadMaxFiles, OrcaUploadMaxBytes). */
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 10;
export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
/** The types phase 1a reads (extract.Classify). */
export const FILE_EXTENSIONS = ['docx', 'xlsx', 'pptx', 'csv', 'txt', 'md', 'markdown'] as const;
/** The file picker's accept list. */
export const FILE_ACCEPT = FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const MACRO_EXTENSIONS = ['docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm', 'ppsm'];
const LEGACY_EXTENSIONS = ['doc', 'xls', 'ppt', 'dot', 'xlt', 'pot', 'pps', 'xlsb', 'rtf'];

/**
 * A file's name as the server keeps it (gateway OrcaCleanFileName): the last
 * path part, without control characters or invisible ones (orcathai's
 * IsInvisible: format characters such as an RTL override or Unicode tag
 * characters, variation selectors and the other default-ignorable code
 * points), trimmed.
 */
export function cleanFileName(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? '';
	// eslint-disable-next-line no-control-regex
	return base.replace(/[\u0000-\u001f\u007f-\u009f\ufffd]|[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '').trim();
}

/** A file name's extension, lower case, without the dot ("" when it has none), as the server's path.Ext reads it (Codex S7 sixth confirmation #4). */
export function fileExtension(name: string): string {
	const base = cleanFileName(name);
	const dot = base.lastIndexOf('.');
	return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Why a file is refused: the server's reason codes. macro, encrypted_or_legacy,
 * pdf_later and unsupported come from its type table; too_large and empty
 * from its size; invalid_name, quota and invalid only from the server.
 */
export type FileRefusal = 'macro' | 'encrypted_or_legacy' | 'pdf_later' | 'unsupported' | 'too_large' | 'empty' | 'invalid_name' | 'quota' | 'invalid';
const REFUSALS: readonly FileRefusal[] = ['macro', 'encrypted_or_legacy', 'pdf_later', 'unsupported', 'too_large', 'empty', 'invalid_name', 'quota', 'invalid'];

/** The server's own check, before anything is sent: the type by the name's extension, then the size. */
export function classifyFile(name: string, size: number): { ok: true; ext: string } | { ok: false; reason: FileRefusal } {
	if (!cleanFileName(name)) return { ok: false, reason: 'invalid_name' };
	const ext = fileExtension(name);
	if (MACRO_EXTENSIONS.includes(ext)) return { ok: false, reason: 'macro' };
	if (LEGACY_EXTENSIONS.includes(ext)) return { ok: false, reason: 'encrypted_or_legacy' };
	if (ext === 'pdf') return { ok: false, reason: 'pdf_later' };
	if (!(FILE_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, reason: 'unsupported' };
	if (size <= 0) return { ok: false, reason: 'empty' };
	if (size > FILE_MAX_BYTES) return { ok: false, reason: 'too_large' };
	return { ok: true, ext };
}

/** A refusal code the server sent (a 202's `error`, or a refused request's message "reason: hint"). */
export function refusalCode(value: string | undefined): FileRefusal | undefined {
	const code = (value ?? '').trim().split(/[:\s]/)[0] as FileRefusal;
	return REFUSALS.includes(code) ? code : undefined;
}

/** Why the company's quota refused a file, from its usage: the day's uploads, the 1 GB, or the workspace's 1,000 items. */
export type QuotaLimit = 'uploads' | 'bytes' | 'items' | 'unknown';
export function quotaLimit(usage: LibraryUsage | undefined, adding = 0): QuotaLimit {
	if (!usage) return 'unknown';
	if (usage.uploadsLimit > 0 && usage.uploadsToday >= usage.uploadsLimit) return 'uploads';
	if (usage.itemsLimit > 0 && usage.items >= usage.itemsLimit) return 'items';
	// A file has at least a byte: a full space refuses any.
	if (usage.bytesLimit > 0 && usage.bytes + Math.max(1, adding) > usage.bytesLimit) return 'bytes';
	return 'unknown';
}

export function quotaText(limit: QuotaLimit, usage: LibraryUsage | undefined, t: Translate): string {
	switch (limit) {
		case 'uploads':
			return t(`วันนี้อัปโหลดครบ ${(usage?.uploadsLimit ?? 50).toLocaleString('en-US')} ไฟล์แล้ว อัปโหลดต่อได้พรุ่งนี้`, `Today’s ${(usage?.uploadsLimit ?? 50).toLocaleString('en-US')} uploads are used. You can upload again tomorrow.`);
		case 'bytes':
			return t(`พื้นที่ไฟล์ของบริษัทเต็มแล้ว (${formatBytes(usage?.bytesLimit ?? 0)}) ลบไฟล์ที่ไม่ใช้ก่อน`, `The company’s file space is full (${formatBytes(usage?.bytesLimit ?? 0)}). Delete files you no longer use first.`);
		case 'items':
			return t('พื้นที่ทำงานนี้มีครบ 1,000 เรื่องแล้ว จัดเก็บเรื่องที่ไม่ใช้ก่อน', 'This workspace has 1,000 items. Archive some you no longer use first.');
	}
	return t('โควตาคลังความรู้ของบริษัทเต็มแล้ว', 'The company’s library quota is used up.');
}

/** One file's refusal in plain Thai. */
export function refusalText(reason: FileRefusal | undefined, t: Translate, quota: QuotaLimit = 'unknown', usage?: LibraryUsage): string {
	switch (reason) {
		case 'macro':
			return t('ไฟล์นี้มีมาโคร ORCA จึงไม่รับ บันทึกเป็น .docx .xlsx หรือ .pptx แล้วอัปโหลดใหม่', 'This file has macros, so ORCA does not take it. Save it as .docx, .xlsx or .pptx and upload it again.');
		case 'encrypted_or_legacy':
			return t('เป็นไฟล์ Office รุ่นเก่า บันทึกเป็น .docx .xlsx หรือ .pptx แล้วอัปโหลดใหม่', 'An older Office file. Save it as .docx, .xlsx or .pptx and upload it again.');
		case 'pdf_later':
			return t('ยังอัปโหลด PDF ไม่ได้ จะใช้ได้ในการอัปเดตครั้งถัดไป', 'PDFs can’t be uploaded yet. They come in a later update.');
		case 'unsupported':
			return t('ORCA อ่านไฟล์ชนิดนี้ไม่ได้ ใช้ Word, Excel, PowerPoint, CSV, TXT หรือ MD', 'ORCA can’t read this type of file. Use Word, Excel, PowerPoint, CSV, TXT or MD.');
		case 'too_large':
			return t('ไฟล์ใหญ่เกิน 20 MB', 'Larger than 20 MB');
		case 'empty':
			return t('ไฟล์นี้ว่างเปล่า', 'This file is empty');
		case 'invalid_name':
			return t('ใช้ชื่อไฟล์นี้ไม่ได้ เปลี่ยนชื่อแล้วลองอีกครั้ง', 'This file name can’t be used. Rename it and try again.');
		case 'quota':
			return quotaText(quota, usage, t);
	}
	return t('ORCA รับไฟล์นี้ไม่ได้ ลองอีกครั้ง', 'ORCA could not take this file. Try again.');
}

/** Files in upload batches the server takes: at most 10 files and 100 MB each, in the order chosen. */
export function uploadBatches(sizes: readonly number[]): number[][] {
	const batches: number[][] = [];
	let current: number[] = [];
	let bytes = 0;
	sizes.forEach((size, index) => {
		if (current.length && (current.length >= UPLOAD_MAX_FILES || bytes + size > UPLOAD_MAX_BYTES)) {
			batches.push(current);
			current = [];
			bytes = 0;
		}
		current.push(index);
		bytes += size;
	});
	if (current.length) batches.push(current);
	return batches;
}

/**
 * Each file's share of one upload's progress: the body carries the files in
 * order, so the bytes sent so far fill them one after another. `total` is the
 * whole body with its framing; 0 when the browser can't tell.
 */
export function batchProgress(sizes: readonly number[], loaded: number, total: number): number[] {
	const sum = sizes.reduce((all, size) => all + size, 0);
	const sent = total > 0 ? Math.min(1, Math.max(0, loaded / total)) * sum : 0;
	let offset = 0;
	return sizes.map((size) => {
		const share = size > 0 ? Math.min(1, Math.max(0, (sent - offset) / size)) : sent >= offset ? 1 : 0;
		offset += size;
		return share;
	});
}

/** A refused upload in plain Thai: the whole request, before any file was taken. */
export function uploadProblem(error: { status: number; message: string } | undefined, t: Translate, usage?: LibraryUsage): string {
	const status = error?.status ?? 0;
	const message = error?.message ?? '';
	const code = refusalCode(message);
	if (status === 0) return t('ส่งไฟล์ไม่ถึง ORCA ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', 'The files did not reach ORCA. Check the connection and try again.');
	if (status === 429) return t('มีการอัปโหลดอื่นอยู่ ลองอีกครั้งในอีกสักครู่', 'Other uploads are in progress. Try again in a moment.');
	if (status === 507) return t('ที่เก็บไฟล์ของ ORCA ใกล้เต็ม ตอนนี้จึงรับไฟล์ใหม่ไม่ได้ แจ้งทีม ORCA', 'ORCA’s file storage is nearly full, so it can’t take new files now. Tell the ORCA team.');
	if (status === 409 && /library_quota/.test(message)) return quotaText(quotaLimit(usage), usage, t);
	if (code) return refusalText(code, t, quotaLimit(usage), usage);
	if (status === 413) return t('อัปโหลดได้ครั้งละไม่เกิน 100 MB และไฟล์ละไม่เกิน 20 MB', 'An upload holds at most 100 MB, and a file at most 20 MB.');
	if (status === 400 && /at most \d+ files/.test(message)) return t('อัปโหลดได้ครั้งละไม่เกิน 10 ไฟล์', 'An upload holds at most 10 files.');
	if (status === 404 && /library_files_disabled/.test(message)) return t('บริษัทนี้ยังอัปโหลดไฟล์เข้าคลังความรู้ไม่ได้', 'This company can’t upload files to Knowledge yet.');
	if (status === 403 || status === 404) return t('อัปโหลดในพื้นที่ทำงานนี้ไม่ได้แล้ว คุณอาจไม่ได้อยู่ในพื้นที่นี้แล้ว', 'You can no longer upload to this workspace: you may have left it.');
	if (status === 503 && /library_maintenance/.test(message)) return t('คลังความรู้ปิดปรับปรุงชั่วคราว ลองอีกครั้งภายหลัง', 'Knowledge is closed for maintenance. Try again later.');
	if (status >= 500) return t('ORCA รับไฟล์ไม่สำเร็จ ลองอีกครั้ง', 'ORCA could not take the files. Try again.');
	return t('ORCA รับไฟล์ไม่ได้ ลองอีกครั้ง', 'ORCA could not take the files. Try again.');
}

/** A file's type in words. */
export function fileTypeLabel(ext: string, t: Translate): string {
	switch (ext.toLowerCase()) {
		case 'docx':
			return 'Word';
		case 'xlsx':
			return 'Excel';
		case 'pptx':
			return 'PowerPoint';
		case 'csv':
			return 'CSV';
		case 'md':
		case 'markdown':
			return 'Markdown';
		case 'txt':
			return t('ไฟล์ข้อความ', 'Text');
	}
	return t('ไฟล์', 'File');
}

/** "820 KB", "2.4 MB", "1 GB". */
export function formatBytes(bytes: number): string {
	const value = Math.max(0, bytes || 0);
	const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US');
	if (value < 1024) return `${value} B`;
	if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
	if (value < 1024 ** 3) return `${one(value / 1024 ** 2)} MB`;
	return `${one(value / 1024 ** 3)} GB`;
}

/** "1.2 ล้าน" in Thai, "1.2 M" in English, for the character quota. */
export function compactCount(value: number, t: Translate): string {
	if (value >= 1_000_000) {
		const millions = (Math.round((value / 1_000_000) * 10) / 10).toLocaleString('en-US');
		return t(`${millions} ล้าน`, `${millions} M`);
	}
	return value.toLocaleString('en-US');
}

/** How a version's reading went, as the screens group it. */
export type FileReading = 'reading' | 'ready' | 'partial' | 'failed';

export function fileReading(version: Pick<LibraryFileVersion, 'state'> | undefined): FileReading | undefined {
	switch (version?.state) {
		case 'queued':
		case 'extracting':
			return 'reading';
		case 'ready':
			return 'ready';
		case 'partial':
			return 'partial';
		case 'failed':
		case 'too_large':
		case 'unsupported':
		case 'needs_ocr':
			return 'failed';
	}
	return undefined;
}

/** "กำลังอ่าน", "พร้อมใช้", "อ่านได้บางส่วน", "อ่านไม่ได้". */
export function readingLabel(reading: FileReading, t: Translate): string {
	return {
		reading: t('กำลังอ่าน', 'Reading'),
		ready: t('พร้อมใช้', 'Ready'),
		partial: t('อ่านได้บางส่วน', 'Partly read'),
		failed: t('อ่านไม่ได้', 'Can’t be read')
	}[reading];
}

/** A version the AI can be given: read, in full or in part. */
export function versionServable(version: Pick<LibraryFileVersion, 'state'> | undefined): boolean {
	return version?.state === 'ready' || version?.state === 'partial';
}

/** A file whose published version the AI can read. */
export function fileServable(file: Pick<LibraryFileInfo, 'published'> | undefined): boolean {
	return versionServable(file?.published);
}

/** The version the screens show first: the owner's pending one while it is newer, else the published one. */
export function shownVersion(file: Pick<LibraryFileInfo, 'published' | 'pending'> | undefined): LibraryFileVersion | undefined {
	return file?.pending ?? file?.published;
}

/** Why part of a file is left out, from its partial reason. */
export function partialText(reason: string | undefined, t: Translate, live = true): string {
	// A version that serves no one now says what the AI will see (Codex S7 third confirmation #3).
	const [th, en] = live ? ['AI เห็น', 'the AI sees'] : ['AI จะเห็น', 'the AI will see'];
	switch (reason) {
		case 'slides':
			return t(`ไฟล์มีมากกว่า 200 สไลด์ ${th}เฉพาะ 200 สไลด์แรก`, `The file has more than 200 slides; ${en} the first 200.`);
		case 'sheets':
			return t(`ไฟล์มีมากกว่า 50 แผ่นงาน ${th}เฉพาะ 50 แผ่นแรก`, `The file has more than 50 sheets; ${en} the first 50.`);
		case 'rows':
			return t(`บางแผ่นงานมีมากกว่า 50,000 แถว ${th}เฉพาะ 50,000 แถวแรก (นับแถวหัวตารางด้วย)`, `A sheet has more than 50,000 rows; ${en} the first 50,000 (the header row counts).`);
		case 'text_cap':
			return t(`ไฟล์มีข้อความเกิน 2 ล้านตัวอักษร ${th}เฉพาะส่วนแรก`, `The file has more than 2 million characters; ${en} the first part.`);
		case 'quota':
			return t(`ข้อความของบริษัทเต็มโควตา ${th}เฉพาะส่วนแรก ลบไฟล์ที่ไม่ใช้แล้วกด อ่านไฟล์ใหม่`, `The company’s text quota is full, so ${en} the first part. Delete files you no longer use, then choose Read again.`);
	}
	return live ? t('AI เห็นเฉพาะบางส่วนของไฟล์นี้', 'The AI sees only part of this file.') : t('AI จะเห็นเฉพาะบางส่วนของไฟล์นี้', 'The AI will see only part of this file.');
}

/** Why a version did not read, from its state and reason code (never a parser message). */
export function failureText(version: Pick<LibraryFileVersion, 'state' | 'errorClass'>, t: Translate): string {
	const reason = version.errorClass ?? '';
	if (version.state === 'needs_ocr') return t('ไฟล์นี้เป็นภาพสแกน AI ยังอ่านไม่ได้', 'This file is a scan; the AI can’t read it yet.');
	if (version.state === 'too_large')
		return reason === 'file_size'
			? t('ไฟล์ใหญ่เกิน 20 MB', 'Larger than 20 MB')
			: t('ไฟล์นี้ใหญ่หรือซับซ้อนเกินกว่าที่ ORCA อ่านได้ ลองแบ่งเป็นหลายไฟล์', 'This file is too large or complex for ORCA to read. Try splitting it.');
	if (version.state === 'unsupported') {
		if (reason === 'encrypted_or_legacy') return t('ไฟล์นี้ตั้งรหัสผ่านไว้ หรือเป็นไฟล์ Office รุ่นเก่า เอารหัสผ่านออก หรือบันทึกเป็น .docx .xlsx หรือ .pptx แล้วอัปโหลดใหม่', 'This file has a password or is an older Office file. Remove the password, or save it as .docx, .xlsx or .pptx, then upload it again.');
		if (reason === 'not_ooxml') return t('เนื้อในไฟล์ไม่ตรงกับนามสกุล บันทึกใหม่จากโปรแกรมต้นทางแล้วอัปโหลดอีกครั้ง', 'What is inside doesn’t match the file’s type. Save it again from its program and upload it.');
		return t('ORCA อ่านไฟล์ชนิดนี้ไม่ได้', 'ORCA can’t read this type of file.');
	}
	switch (reason) {
		case 'hostile':
			return t('ไฟล์นี้มีส่วนที่อาจไม่ปลอดภัย ORCA จึงไม่อ่าน', 'Part of this file may be unsafe, so ORCA does not read it.');
		case 'macro':
			return t('ไฟล์นี้มีมาโคร ORCA จึงไม่อ่าน บันทึกเป็น .docx .xlsx หรือ .pptx แล้วอัปโหลดใหม่', 'This file has macros, so ORCA does not read it. Save it as .docx, .xlsx or .pptx and upload it again.');
		case 'type_mismatch':
			return t('เนื้อในไฟล์ไม่ตรงกับนามสกุล บันทึกใหม่จากโปรแกรมต้นทางแล้วอัปโหลดอีกครั้ง', 'What is inside doesn’t match the file’s type. Save it again from its program and upload it.');
		case 'corrupt':
			return t('ไฟล์นี้เสียหรือบันทึกไม่ครบ เปิดในโปรแกรมต้นทางแล้วบันทึกใหม่', 'This file is damaged or incomplete. Open it in its program and save it again.');
		case 'encoding':
			return t('อ่านภาษาในไฟล์นี้ไม่ออก บันทึกเป็น UTF-8 แล้วอัปโหลดใหม่', 'The text in this file can’t be read. Save it as UTF-8 and upload it again.');
		case 'timeout':
			return t('อ่านนานเกินเวลาที่กำหนด ลองกด อ่านไฟล์ใหม่', 'Reading took too long. Try Read again.');
		case 'memory':
			return t('ไฟล์นี้ใช้หน่วยความจำเกินที่กำหนด ลองแบ่งเป็นไฟล์เล็กลง', 'This file needs more memory than allowed. Try splitting it into smaller files.');
		case 'quota':
			return t('ข้อความของบริษัทเต็มโควตา 10 ล้านตัวอักษรแล้ว ลบไฟล์ที่ไม่ใช้ แล้วกด อ่านไฟล์ใหม่', 'The company’s 10 million character quota is full. Delete files you no longer use, then choose Read again.');
		case 'crash':
		case 'protocol':
		case 'spool':
		case 'extractor_missing':
		case 'extractor_busy':
		case 'storage_error':
			return t('ORCA อ่านไฟล์นี้ไม่สำเร็จ ลองกด อ่านไฟล์ใหม่', 'ORCA could not read this file. Try Read again.');
	}
	return t('อ่านไฟล์นี้ไม่ได้', 'This file can’t be read.');
}

/** A failure's reason in a few words, for a row of the list ("อ่านไม่ได้: …"). */
export function failureShort(version: Pick<LibraryFileVersion, 'state' | 'errorClass'>, t: Translate): string {
	const reason = version.errorClass ?? '';
	if (version.state === 'needs_ocr') return t('เป็นภาพสแกน', 'a scan');
	if (version.state === 'too_large') return reason === 'file_size' ? t('ใหญ่เกิน 20 MB', 'larger than 20 MB') : t('ใหญ่หรือซับซ้อนเกินไป', 'too large or complex');
	if (version.state === 'unsupported')
		return reason === 'encrypted_or_legacy'
			? t('ตั้งรหัสผ่านไว้ หรือเป็น Office รุ่นเก่า', 'has a password, or older Office')
			: reason === 'not_ooxml'
				? t('เนื้อในไม่ตรงกับนามสกุล', 'not what its type says')
				: t('ชนิดไฟล์ที่ ORCA อ่านไม่ได้', 'a type ORCA can’t read');
	switch (reason) {
		case 'hostile':
			return t('มีส่วนที่อาจไม่ปลอดภัย', 'part of it may be unsafe');
		case 'macro':
			return t('มีมาโคร', 'has macros');
		case 'type_mismatch':
			return t('เนื้อในไม่ตรงกับนามสกุล', 'not what its type says');
		case 'corrupt':
			return t('ไฟล์เสียหรือบันทึกไม่ครบ', 'damaged or incomplete');
		case 'encoding':
			return t('อ่านภาษาในไฟล์ไม่ออก', 'its text can’t be read');
		case 'quota':
			return t('ข้อความของบริษัทเต็มโควตา', 'the company’s text quota is full');
	}
	return t('อ่านไม่สำเร็จ ลองอ่านไฟล์ใหม่', 'reading failed; try again');
}

/** Failures reading the same file again can't change (the server's orcaFinalClasses). */
const FINAL_FAILURES = ['hostile', 'macro', 'type_mismatch', 'corrupt', 'encoding'];

/**
 * "อ่านไฟล์ใหม่", for the owner: the version a re-read starts from (the
 * pending one, else the published one) failed for a reason that may pass, or
 * was read and is read again. Too large, unsupported and hostile files need a
 * new version instead; one still being read waits.
 */
export function canReadAgain(file: Pick<LibraryFileInfo, 'published' | 'pending'> | undefined): boolean {
	const source = shownVersion(file);
	if (!source) return false;
	if (source.state === 'failed') return !FINAL_FAILURES.includes(source.errorClass ?? '');
	return source.state === 'ready' || source.state === 'partial' || source.state === 'superseded';
}

/** One line of a file's hidden parts, and the switch that decides it. */
export type HiddenLine = { part: 'notes' | 'hidden' | 'comments' | 'tracked'; option?: keyof LibraryReadParts; text: string; included: boolean };

/**
 * "ไฟล์นี้มีโน้ตผู้บรรยาย 12 สไลด์ ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด": what a
 * version holds hidden, and whether it was read with it. Tracked changes are
 * never read; they are told only.
 */
/**
 * Where the newer version with the owner's choice is (Codex S7 seventh
 * confirmation #4): being read, read and waiting for "ใช้ฉบับใหม่"
 * (ต้องตรวจก่อนอัปเดต), or not read.
 */
export type NewerStage = 'reading' | 'held' | 'failed';

export function hiddenLines(version: Pick<LibraryFileVersion, 'stats' | 'options'> | undefined, t: Translate, wanted?: LibraryReadParts, live = true, stage: NewerStage = 'reading', review = false): HiddenLine[] {
	const hidden = version?.stats?.hidden;
	if (!version || !hidden) return [];
	const read = version.options ?? { includeHidden: false, includeComments: false, includeNotes: false };
	const n = (value: number) => value.toLocaleString('en-US');
	const parts: [HiddenLine['part'], keyof LibraryReadParts, number, string, string, string][] = [
		['notes', 'includeNotes', hidden.notesSlides, 'โน้ตผู้บรรยาย', 'สไลด์', 'slides with speaker notes'],
		['hidden', 'includeHidden', hidden.hiddenSlides, 'สไลด์ที่ซ่อนไว้', 'สไลด์', 'hidden slides'],
		['hidden', 'includeHidden', hidden.hiddenSheets, 'แผ่นงานที่ซ่อนไว้', 'แผ่น', 'hidden sheets'],
		['hidden', 'includeHidden', hidden.hiddenText, 'ข้อความที่ซ่อนไว้', 'จุด', 'pieces of hidden text'],
		['comments', 'includeComments', hidden.comments, 'ความคิดเห็น', 'รายการ', 'comments']
	];
	const lines: HiddenLine[] = [];
	for (const [part, option, count, thai, unit, english] of parts) {
		if (!(count > 0)) continue;
		const included = read[option] === true;
		// The owner changed the switch: the version that serves still has the old choice until the new one is read.
		const changing = wanted !== undefined && wanted[option] !== read[option];
		lines.push({
			part,
			option,
			included,
			// A file that serves no one now (a draft, a workspace not active, file
			// Knowledge off) says what the AI will see, never what it sees (Codex S7
			// second confirmation #4).
			text: changing
				? changingText(included, live, stage, review, thai, `${n(count)} ${unit}`, `${n(count)} ${english}`, t)
				: included
					? live
						? t(`AI เห็น${thai} ${n(count)} ${unit}`, `The AI sees ${n(count)} ${english}`)
						: t(`AI จะเห็น${thai} ${n(count)} ${unit}`, `The AI will see ${n(count)} ${english}`)
					: t(`ไฟล์นี้มี${thai} ${n(count)} ${unit} ซึ่ง AI จะไม่เห็นจนกว่าคุณจะเปิด`, `This file has ${n(count)} ${english}, which the AI won’t see until you turn them on`)
		});
	}
	if (hidden.trackedChanges > 0)
		lines.push({
			part: 'tracked',
			included: false,
			text: live
				? t(`ไฟล์นี้มีการแก้ไขที่ติดตามไว้ ${n(hidden.trackedChanges)} จุด AI เห็นเฉพาะข้อความฉบับปัจจุบัน`, `This file has ${n(hidden.trackedChanges)} tracked changes; the AI sees only the current text`)
				: t(`ไฟล์นี้มีการแก้ไขที่ติดตามไว้ ${n(hidden.trackedChanges)} จุด AI จะเห็นเฉพาะข้อความฉบับปัจจุบัน`, `This file has ${n(hidden.trackedChanges)} tracked changes; the AI will see only the current text`)
		});
	return lines;
}

/**
 * A hidden part whose switch the owner turned, by where the newer version is.
 * With "ต้องตรวจก่อนอัปเดต" (`review`) a version being read still waits for
 * "ใช้ฉบับใหม่" once read (Codex S7 eighth confirmation #4).
 */
function changingText(included: boolean, live: boolean, stage: NewerStage, review: boolean, thai: string, countTh: string, countEn: string, t: Translate): string {
	if (included) {
		// It was read with the part; the newer version leaves it out.
		const subject = live ? ['AI ยังเห็น', 'The AI still sees'] : ['ฉบับนี้ยังมี', 'This version still has'];
		if (stage === 'held' || (stage === 'reading' && review)) return t(`${subject[0]}${thai} ${countTh} จนกว่าคุณจะกดใช้ฉบับใหม่`, `${subject[1]} ${countEn} until you use the new version`);
		if (stage === 'failed') return t(`${subject[0]}${thai} ${countTh} เพราะฉบับใหม่อ่านไม่ได้`, `${subject[1]} ${countEn}: the new version can’t be read`);
		return t(`${subject[0]}${thai} ${countTh} จนกว่าฉบับใหม่จะอ่านเสร็จ`, `${subject[1]} ${countEn} until the new version is read`);
	}
	// It was read without the part; the newer version takes it in.
	if (stage === 'held') return t(`ไฟล์นี้มี${thai} ${countTh} ฉบับใหม่ให้ AI เห็นแล้ว รอคุณกดใช้`, `This file has ${countEn}; the new version shows them to the AI once you use it`);
	if (stage === 'failed') return t(`ไฟล์นี้มี${thai} ${countTh} ซึ่ง AI ยังไม่เห็น เพราะฉบับใหม่อ่านไม่ได้`, `This file has ${countEn}, which the AI doesn’t see yet: the new version can’t be read`);
	if (review) return t(`ไฟล์นี้มี${thai} ${countTh} ORCA กำลังอ่านฉบับใหม่ให้ AI เห็นเมื่อคุณกดใช้`, `This file has ${countEn}; ORCA is reading a new version that shows them to the AI once you use it`);
	return t(`ไฟล์นี้มี${thai} ${countTh} ORCA กำลังอ่านใหม่ให้ AI เห็น`, `This file has ${countEn}; ORCA is reading it again so the AI sees them`);
}

/** Where a piece of text is in its file: "หน้า 3–4", "สไลด์ 5", "แผ่นงาน “ราคา” · แถว 2–51", "หัวข้อ “การรับประกัน” · ย่อหน้า 4". */
export function locatorLabel(locator: LibraryLocator | undefined, t: Translate): string {
	if (!locator) return '';
	const n = (value: number) => value.toLocaleString('en-US');
	const range = (start: number, end?: number) => (end && end !== start ? `${n(start)}–${n(end)}` : n(start));
	const parts: string[] = [];
	if (locator.slide) parts.push(t(`สไลด์ ${n(locator.slide)}`, `Slide ${n(locator.slide)}`));
	if (locator.sheet) parts.push(t(`แผ่นงาน “${locator.sheet}”`, `Sheet “${locator.sheet}”`));
	if (locator.rowStart) parts.push(t(`แถว ${range(locator.rowStart, locator.rowEnd)}`, `Rows ${range(locator.rowStart, locator.rowEnd)}`));
	if (locator.page) parts.push(t(`หน้า ${range(locator.page, locator.pageEnd)}`, `Page ${range(locator.page, locator.pageEnd)}`));
	if (locator.heading) parts.push(t(`หัวข้อ “${locator.heading}”`, `Heading “${locator.heading}”`));
	if (locator.paragraph && !locator.page) parts.push(t(`ย่อหน้า ${n(locator.paragraph)}`, `Paragraph ${n(locator.paragraph)}`));
	if (locator.line && !parts.length) parts.push(t(`บรรทัด ${n(locator.line)}`, `Line ${n(locator.line)}`));
	return parts.join(' · ');
}

/** What the file holds, in one line: "3 แผ่นงาน · 1,240 แถว", "12 สไลด์", "8 หน้า". */
export function fileExtent(version: Pick<LibraryFileVersion, 'stats'> | undefined, t: Translate): string {
	const stats = version?.stats;
	if (!stats) return '';
	const n = (value: number) => value.toLocaleString('en-US');
	const parts: string[] = [];
	if (stats.slides) parts.push(t(`${n(stats.slides)} สไลด์`, `${n(stats.slides)} slides`));
	if (stats.sheets) parts.push(t(`${n(stats.sheets)} แผ่นงาน`, `${n(stats.sheets)} sheets`));
	if (stats.rows) parts.push(t(`${n(stats.rows)} แถว`, `${n(stats.rows)} rows`));
	if (stats.pages && stats.paginated) parts.push(t(`${n(stats.pages)} หน้า`, `${n(stats.pages)} pages`));
	if (stats.chars) parts.push(t(`${n(stats.chars)} ตัวอักษร`, `${n(stats.chars)} characters`));
	return parts.join(' · ');
}

/**
 * A file row's status: while no version serves, its reading (กำลังอ่าน or
 * อ่านไม่ได้ with the reason); once one does, the item's status, with a note
 * about a newer version on its way or refused.
 */
export type FileRowState = {
	status: 'reading' | 'failed' | LibraryStatus;
	/** A line under the title: the failure, the part left out, or the new version's state. */
	note?: string;
	tone?: 'deny' | 'warn' | 'muted';
};

export function fileRowState(item: Pick<LibraryItem, 'status' | 'file'>, t: Translate, on = true, active = true): FileRowState {
	const file = item.file;
	const published = file?.published;
	const pending = file?.pending;
	if (item.status === 'archived') return { status: 'archived' };
	if (versionServable(published)) {
		const status = item.status;
		// With library v2 off (a rollback) the AI uses no file and a newer
		// version can't be put in use: nothing to say about one until it is on.
		// A draft, or a workspace not active yet, serves no one: its notes never say
		// what the AI keeps using (Codex S7 confirmation #5).
		const live = status === 'published' && active;
		if (on && pending && fileReading(pending) === 'reading')
			return { status, note: live ? t('กำลังอ่านฉบับใหม่ AI ใช้ฉบับเดิมไปก่อน', 'Reading a new version; the AI keeps the current one') : t('กำลังอ่านฉบับใหม่', 'Reading a new version'), tone: 'muted' };
		if (on && pending && fileReading(pending) === 'failed')
			return { status, note: live ? t('ฉบับใหม่อ่านไม่ได้ AI ใช้ฉบับเดิมอยู่', 'The new version can’t be read; the AI keeps the current one') : t('ฉบับใหม่อ่านไม่ได้', 'The new version can’t be read'), tone: 'warn' };
		if (on && pending && versionServable(pending)) return { status, note: t('ฉบับใหม่รอคุณกดใช้', 'A new version waits for you'), tone: 'warn' };
		if (published?.state === 'partial') return { status, note: t('อ่านได้บางส่วน', 'Partly read'), tone: 'warn' };
		// Read, and the AI gets it once its owner publishes it (in an active workspace).
		if (on && active && status === 'draft') return { status, note: t('อ่านเสร็จแล้ว พร้อมให้ AI ใช้เมื่อเผยแพร่', 'Read; ready for AI once published'), tone: 'muted' };
		return { status };
	}
	const version = shownVersion(file);
	const reading = fileReading(version);
	if (reading === 'failed' && version) return { status: 'failed', note: t(`อ่านไม่ได้: ${failureShort(version, t)}`, `Can’t be read: ${failureShort(version, t)}`), tone: 'deny' };
	return { status: 'reading', note: t('ORCA กำลังอ่านข้อความในไฟล์', 'ORCA is reading the file'), tone: 'muted' };
}

/**
 * What an answer leaves out, kept from the item the page has (Codex S7 #2–#3):
 * a save's answer has no file block, and a takeover's no text; neither
 * changes them. Only for the answer to the page's own change, one version on
 * from the item it has: after someone else's change in between what the page
 * has is stale, and the page asks for the item instead (Codex S7
 * confirmation #1).
 */
export function keepOmitted(answer: LibraryItem, known: LibraryItem | undefined): LibraryItem {
	if (!known || known.id !== answer.id || answer.version !== known.version + 1) return answer;
	return {
		...answer,
		file: answer.file ?? known.file,
		content: answer.kind !== 'file' && !answer.content ? known.content : answer.content
	};
}

/** An item still missing what its answer left out (a file's block, an article's text): the page asks for the library again. */
export function itemIncomplete(item: LibraryItem): boolean {
	return item.kind === 'file' ? !item.file : !item.content;
}

/**
 * The item a page keeps from an answer: the answer with what it left out, or,
 * when that can't be filled in (someone else's change in between), the item
 * the page had until the library comes again. Its older version makes any
 * save from it a conflict, never an overwrite of the newer text (Codex S7
 * second confirmation #1).
 */
export function settleAnswer(answer: LibraryItem, known: LibraryItem | undefined): { item: LibraryItem; reload: boolean } {
	const item = keepOmitted(answer, known);
	if (!itemIncomplete(item)) return { item, reload: false };
	return { item: known ?? item, reload: true };
}

/**
 * While an editor holds unsaved text, a refresh brings only the files' reading
 * (Codex S7 #8); items no longer listed go, except the one being edited, whose
 * save then says what changed (Codex S7 confirmation #4).
 */
export function withReading(items: readonly LibraryItem[], fresh: readonly LibraryItem[], editingID = ''): LibraryItem[] {
	const listed = new Map(fresh.map((item) => [item.id, item]));
	return items
		.filter((item) => listed.has(item.id) || item.id === editingID)
		.map((item) => {
			const now = listed.get(item.id);
			return item.kind === 'file' && now ? { ...item, file: now.file } : item;
		});
}

/**
 * What an upload batch's failure means (Codex S7 #5 and its confirmation #2).
 * The server stores the files one by one once the whole body has arrived, so
 * after a batch was sent in full only its refusals before storing anything
 * (each file's reason, a busy library, a body it does not take) say that
 * nothing was stored. Anything else (a cancel, a lost connection, a server
 * failure, access or the flag lost midway) may follow files already stored:
 * "unknown", never sent again, and the list says what is there.
 */
export type UploadFailure = { outcome: 'unknown' | 'cancelled' | 'refused' | 'failed'; reason?: FileRefusal; reload: boolean };
export function uploadFailure(failure: { sent: boolean; aborted: boolean; network: boolean; status: number; message: string }): UploadFailure {
	const reason = failure.aborted || failure.network ? undefined : refusalCode(failure.message);
	const beforeStoring = !!reason || [411, 413, 415, 429].includes(failure.status) || /library_uploads_busy/.test(failure.message);
	if (failure.sent && !beforeStoring) return { outcome: 'unknown', reload: true };
	if (failure.aborted) return { outcome: 'cancelled', reload: false };
	if (reason && reason !== 'invalid') return { outcome: 'refused', reason, reload: false };
	return { outcome: 'failed', reason, reload: false };
}

/** The owner's own files still being read: the page asks again until they are done. */
export function readingFileIDs(items: readonly LibraryItem[]): string[] {
	return items.filter((item) => item.kind === 'file' && item.canEdit && fileReading(shownVersion(item.file)) === 'reading').map((item) => item.id);
}

/** How long to wait before asking again: 3 s, then a little longer each time, at most 20 s. */
export function readingPollDelay(round: number): number {
	return Math.min(20_000, 3_000 + Math.max(0, round) * 2_000);
}

/** The company's usage as three meters: files, characters read, uploads today. */
export type UsageMeter = { key: 'bytes' | 'chars' | 'uploads'; label: string; text: string; ratio: number; full: boolean };

export function usageMeters(usage: LibraryUsage, t: Translate): UsageMeter[] {
	const ratio = (used: number, limit: number) => (limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0);
	return [
		{ key: 'bytes', label: t('พื้นที่ไฟล์', 'File space'), text: t(`${formatBytes(usage.bytes)} จาก ${formatBytes(usage.bytesLimit)}`, `${formatBytes(usage.bytes)} of ${formatBytes(usage.bytesLimit)}`), ratio: ratio(usage.bytes, usage.bytesLimit), full: usage.bytesLimit > 0 && usage.bytes >= usage.bytesLimit },
		{ key: 'chars', label: t('ข้อความที่อ่านได้', 'Text read'), text: t(`${compactCount(usage.chars, t)} จาก ${compactCount(usage.charsLimit, t)} ตัวอักษร`, `${compactCount(usage.chars, t)} of ${compactCount(usage.charsLimit, t)} characters`), ratio: ratio(usage.chars, usage.charsLimit), full: usage.charsLimit > 0 && usage.chars >= usage.charsLimit },
		{ key: 'uploads', label: t('อัปโหลดวันนี้', 'Uploads today'), text: t(`${usage.uploadsToday.toLocaleString('en-US')} จาก ${usage.uploadsLimit.toLocaleString('en-US')} ไฟล์`, `${usage.uploadsToday.toLocaleString('en-US')} of ${usage.uploadsLimit.toLocaleString('en-US')} files`), ratio: ratio(usage.uploadsToday, usage.uploadsLimit), full: usage.uploadsLimit > 0 && usage.uploadsToday >= usage.uploadsLimit }
	];
}

/** A file route's refusal in plain Thai, or undefined for the shared messages. */
export function fileActionProblem(error: { status: number; message: string }, t: Translate): string | undefined {
	const message = error.message ?? '';
	if (/library_file_refused/.test(message)) return t('อ่านไฟล์นี้ใหม่ไม่ได้ อัปโหลดฉบับใหม่แทน', 'This file can’t be read again. Upload a new version instead.');
	if (/library_version_preparing/.test(message)) return t('ฉบับใหม่กำลังเตรียมให้ค้นหาได้ ลองอีกครั้งในอีกไม่กี่นาที', 'The new version is being prepared for search. Try again in a few minutes.');
	if (/version_changed/.test(message)) return t('ไฟล์นี้เปลี่ยนแล้ว เปิดใหม่อีกครั้ง', 'This file changed. Open it again.');
	if (/library_files_disabled/.test(message)) return t('บริษัทนี้ยังใช้ไฟล์ในคลังความรู้ไม่ได้', 'This company can’t use files in Knowledge yet.');
	if (/library_maintenance/.test(message)) return t('คลังความรู้ปิดปรับปรุงชั่วคราว ลองอีกครั้งภายหลัง', 'Knowledge is closed for maintenance. Try again later.');
	if (error.status === 409) return t('ไฟล์นี้เปลี่ยนไปแล้ว หรือกำลังอ่านอยู่ โหลดใหม่แล้วลองอีกครั้ง', 'This file changed, or is being read. Reload and try again.');
	return undefined;
}

// ── The upload panel ────────────────────────────────────────────────

/** One file of the upload panel, from choosing it until the server answered. */
export type UploadRow = {
	key: string;
	name: string;
	size: number;
	/** `unknown`: sent in full, and no answer came back (a cancel or a lost connection then): the server may have stored it. */
	state: 'waiting' | 'sending' | 'saved' | 'refused' | 'failed' | 'cancelled' | 'unknown';
	/** 0–1 while sending. */
	progress: number;
	reason?: FileRefusal;
	/** The refusal in words (refused rows). */
	message?: string;
	/** The new item (saved rows). */
	itemID?: string;
};

/** The rows for files just chosen: the ones the server would refuse are refused here, in words. */
export function uploadRows(files: readonly { name: string; size: number }[], t: Translate, keyBase = Date.now()): UploadRow[] {
	return files.map((file, index) => {
		const verdict = classifyFile(file.name, file.size);
		const row: UploadRow = { key: `${keyBase}-${index}`, name: file.name, size: file.size, state: 'waiting', progress: 0 };
		if (!verdict.ok) return { ...row, state: 'refused', reason: verdict.reason, message: refusalText(verdict.reason, t) };
		return row;
	});
}

/** A row's state in words. */
export function uploadRowText(row: UploadRow, t: Translate): string {
	switch (row.state) {
		case 'waiting':
			return t('รอส่ง', 'Waiting');
		case 'sending':
			return row.progress >= 1 ? t('กำลังบันทึก…', 'Saving…') : t(`กำลังส่ง ${Math.floor(row.progress * 100)}%`, `Sending ${Math.floor(row.progress * 100)}%`);
		case 'saved':
			return t('อัปโหลดแล้ว ORCA กำลังอ่าน', 'Uploaded; ORCA is reading it');
		case 'refused':
			return row.message ?? refusalText(row.reason, t);
		case 'failed':
			return t('ยังไม่ได้อัปโหลด', 'Not uploaded');
		case 'cancelled':
			return t('ยกเลิกแล้ว', 'Cancelled');
		case 'unknown':
			return t('ส่งครบแล้ว แต่ไม่ได้รับคำตอบ ดูในรายการด้านล่างก่อนส่งซ้ำ', 'Sent, but no answer came back. Check the list below before sending it again.');
	}
}

/** The panel's heading: what is happening, or how it ended. */
export function uploadSummary(rows: readonly UploadRow[], t: Translate): string {
	const total = rows.length;
	const saved = rows.filter((row) => row.state === 'saved').length;
	const moving = rows.filter((row) => row.state === 'sending' || row.state === 'waiting').length;
	const unknown = rows.filter((row) => row.state === 'unknown').length;
	if (moving) return t(`กำลังอัปโหลด ${moving.toLocaleString('en-US')} ไฟล์`, `Uploading ${moving.toLocaleString('en-US')} ${moving === 1 ? 'file' : 'files'}`);
	if (!saved && unknown) return t(`ยังไม่รู้ผลของ ${unknown.toLocaleString('en-US')} ไฟล์`, `No answer for ${unknown.toLocaleString('en-US')} ${unknown === 1 ? 'file' : 'files'}`);
	if (!saved) return t('ไม่ได้อัปโหลดไฟล์', 'No file was uploaded');
	if (saved === total) return t(`อัปโหลดแล้ว ${saved.toLocaleString('en-US')} ไฟล์`, `${saved.toLocaleString('en-US')} ${saved === 1 ? 'file' : 'files'} uploaded`);
	return t(`อัปโหลดแล้ว ${saved.toLocaleString('en-US')} จาก ${total.toLocaleString('en-US')} ไฟล์`, `${saved.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} files uploaded`);
}

/** What the page says about how a text file's Thai was read (CSV and TXT from Thai Excel are often Windows-874). */
export function encodingNote(stats: Pick<LibraryFileVersion['stats'], 'encoding' | 'encodingUncertain'> | undefined, t: Translate): { tone: 'warn' | 'info'; text: string } | undefined {
	if (stats?.encoding !== 'windows-874') return undefined;
	return stats.encodingUncertain
		? { tone: 'warn', text: t('ORCA อ่านไฟล์นี้เป็นภาษาไทยแบบ Windows-874 แต่ไม่แน่ใจ ถ้าตัวอักษรในตัวอย่างเพี้ยน ให้บันทึกเป็น CSV UTF-8 แล้วอัปโหลดใหม่', 'ORCA read this file as Thai Windows-874, but is not sure. If the text below looks wrong, save it as CSV UTF-8 and upload it again.') }
		: { tone: 'info', text: t('ORCA แปลงภาษาไทยจากไฟล์แบบ Windows-874 ให้แล้ว', 'ORCA converted this file’s Thai from Windows-874.') };
}
