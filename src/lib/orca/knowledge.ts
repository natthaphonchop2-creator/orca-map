// คลังความรู้ (workspace UX U8, the interim UI of proposal §3.6): the logic
// behind KnowledgeLibrary and LibraryEditor, free of Svelte so it is tested.
// Everything here only guides the screen. The server still decides who may
// read, write and publish each item.
import type { OrcaHub } from '../services/orca';
import type {
	LibraryDepartment,
	LibraryItem,
	LibraryKind,
	LibraryParameter,
	LibraryStatus
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

// ── Who can use an item ─────────────────────────────────────────────

export type AudienceShape = Pick<LibraryItem, 'ownerID' | 'memberIDs' | 'unitIDs'>;
export type AudienceSelection = Pick<LibraryItem, 'memberIDs' | 'unitIDs'>;

const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

/** The people whose AI can read a published item: its author, the people chosen and the chosen departments' workspace members. */
export function audiencePeople(item: AudienceShape, departments: readonly LibraryDepartment[]): Set<string> {
	const people = new Set<string>([item.ownerID, ...item.memberIDs]);
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

export type AudienceMode = 'everyone' | 'departments' | 'people' | 'me' | 'mixed';

function sameSet(a: readonly string[], b: readonly string[]) {
	const left = new Set(a);
	const right = new Set(b);
	return left.size === right.size && [...left].every((value) => right.has(value));
}

/** The editor's choice for a saved audience; `mixed` is an older mix of departments and people. */
export function audienceMode(item: AudienceSelection, everyone: AudienceSelection): AudienceMode {
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
			const text = fold(`${item.title} ${item.summary}`);
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
	},
	t: Translate
): ArticleMismatch[] {
	const audience = audiencePeople(template, context.departments);
	const result: ArticleMismatch[] = [];
	for (const article of articles) {
		if (!article.canEdit) {
			if (audience.size > 1) result.push({ articleID: article.id, title: article.title, unknown: true });
			continue;
		}
		const readers = audiencePeople(article, context.departments);
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

/** The item the "ลองถาม AI" card asks about: the one open, else the newest published one of the kind shown (articles by default). */
export function askItem(items: readonly LibraryItem[], open?: LibraryItem, kind: LibraryKind = 'knowledge'): LibraryItem | undefined {
	if (open && open.status === 'published') return open;
	return filterLibrary(items, kind, 'published', '')[0] ?? filterLibrary(items, 'knowledge', 'published', '')[0];
}

export function askPrompt(item: Pick<LibraryItem, 'kind' | 'title'>, t: Translate): string {
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
