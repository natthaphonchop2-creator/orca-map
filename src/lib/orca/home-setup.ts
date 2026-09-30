// Home's first-run checklist (workspace UX proposal §4, build plan §4). Pure
// rules only: the page loads the data and this decides what is done, what
// comes next and what to show. Everything here guides setup; the server still
// authorizes every operation.
import { connectionReady, workspaceToolingReady } from './activation';
import { gatewayConnections, gatewayHasMember } from './gateway-sources';
import { lineExternalURL } from './in-app-browser';
import { toolChangesData } from './program-tools';
import { secretRows } from './secrets';
import { aiConnectionAppFor, aiConnectionReaches, type AIConnectionStatus } from './ai-connection';
import type { OrcaAuditEvent, OrcaBootstrap, OrcaConnection, OrcaHub, OrcaMember, OrcaSecrets } from '../services/orca';

type Translate = (th: string, en: string) => string;

// ---------------------------------------------------------------------------
// What AI can do in a program (build plan §4 rule 1)
// ---------------------------------------------------------------------------

// Whether a tool only reads is program-tools' toolChangesData(): the backend's
// approval rule, from the reviewed definition's annotations only.

/** The allowed tools of a program, split into reading and changing data. */
export function programAbilities(connection: Pick<OrcaConnection, 'toolNames' | 'tools'>) {
	let read = 0;
	let change = 0;
	for (const name of connection.toolNames) {
		const tool = connection.tools.find((item) => item.name === name);
		// A tool the program no longer lists may change data.
		if (!tool || toolChangesData(tool)) change += 1;
		else read += 1;
	}
	return { total: read + change, read, change };
}

// ---------------------------------------------------------------------------
// The viewer's own AI and use
// ---------------------------------------------------------------------------

/**
 * The viewer's AI, as the pinned "เชื่อม AI ของฉัน" button shows it (the shared
 * store, fed by B1): `unknown` while it loads or when the server cannot say.
 * `revoked`: unknown too, but the viewer disconnected one of their own AI apps
 * on this page, so an earlier question proves nothing now (homeAIState).
 * `limited`: connected only through workspaces' own links while the company's
 * link has workspaces for them: not the company-wide connection (B3 follow-up).
 */
export type AIState = AIConnectionStatus['state'] | 'revoked' | 'limited';

/** The viewer's workspaces, as connectAccess splits them: on the company's link, and with their own sign-in. */
export type HomeAccess = { usable: readonly Pick<OrcaHub, 'id'>[]; ownSignIn: readonly Pick<OrcaHub, 'id' | 'userSourceID'>[] };

/**
 * Home's AI state, from the shared store: B1's answer once Home's own read is
 * back (`checked`), else unknown. After the viewer disconnected one of their
 * own AI apps on this page (ตรวจสอบ or เชื่อม AI ของฉัน), unknown is `revoked`:
 * only a read of B1 says what is left, and history never ticks "เชื่อม AI" or
 * brings back "ตั้งค่าเสร็จแล้ว" (Codex release review 70). The old-server
 * fallback, where the first question proves the AI, stays for a page where
 * nothing was disconnected. Connected only through workspaces' own links is
 * `limited` while the company's link has workspaces for the viewer
 * (`access.usable`, connectAccess; unknown counts as some). With none (every
 * workspace of theirs has its own sign-in): connected once their AI may reach
 * a workspace they use now (`access.ownSignIn`, aiConnectionReaches: a sign-in
 * limited to it, the company's link, which may have used its SSO, or a used
 * key), else `none`, since a sign-in kept for a workspace they were taken out
 * of reaches nothing (Codex reviews 71 to 73). With no workspace at all, the
 * company's link or a used key counts, as before.
 */
export function homeAIState(store: AIConnectionStatus & { disconnected?: boolean }, checked: boolean, access?: HomeAccess): AIState {
	const state = checked ? store.state : 'unknown';
	if (state === 'connected') {
		const limited = !!store.only?.length;
		if (!access || access.usable.length) return limited ? 'limited' : 'connected';
		if (!limited && !access.ownSignIn.length) return 'connected';
		return access.ownSignIn.some((hub) => aiConnectionReaches(store, hub)) ? 'connected' : 'none';
	}
	return store.disconnected && state === 'unknown' ? 'revoked' : state;
}

/**
 * The app Home names ("Claude เชื่อมแล้ว") when its AI step is done: the
 * company link's, or, when every workspace of the viewer's has its own
 * sign-in, the one app whose sign-in is shown to reach them (aiConnectionAppFor;
 * one that may reach them names none); "" when none is or they differ (Codex
 * reviews 72 and 73).
 */
export function homeAIApp(store: AIConnectionStatus, ai: AIState, access?: HomeAccess): string {
	if (ai !== 'connected') return '';
	if (!access || access.usable.length || !access.ownSignIn.length) return store.app?.trim() ?? '';
	const apps = new Set(access.ownSignIn.filter((hub) => aiConnectionReaches(store, hub)).map((hub) => aiConnectionAppFor(store, hub)).filter(Boolean));
	return apps.size === 1 ? [...apps][0] : '';
}

/**
 * Why Home's banner shows after setup (aiLapsed): `limited` to workspaces'
 * own links; `unreached`, a live sign-in or key that reaches none of the
 * viewer's workspaces now (nothing expired: Codex review 72); `disconnected`
 * by the viewer on this page; else `expired`.
 */
export type AILapse = 'limited' | 'unreached' | 'disconnected' | 'expired';
export function aiLapse(store: AIConnectionStatus & { disconnected?: boolean }, ai: AIState): AILapse {
	if (ai === 'limited') return 'limited';
	if (ai === 'none' && store.state === 'connected') return 'unreached';
	return store.disconnected ? 'disconnected' : 'expired';
}

export function isToolCall(event: Pick<OrcaAuditEvent, 'action' | 'method'>): boolean {
	return ['tools.call', 'tools/call'].includes(event.action || event.method || '');
}

/**
 * GET /audit returns only the newest 200 events (`KhumAudit`'s limit): every
 * member's for a manager, the viewer's own for anyone else.
 */
export const AUDIT_WINDOW = 200;

/**
 * Only the viewer's own calls count: anyone else's says nothing about their AI.
 * `truncated`: the history filled the audit window, so an older call of theirs
 * may have dropped out of it. Not finding one then proves nothing (`undefined`),
 * and a busy company's owner never falls back into setup mode.
 */
export function askedAI(events: OrcaAuditEvent[], userID: string, truncated = false): Done {
	if (!userID) return false;
	if (events.some((event) => isToolCall(event) && event.userID === userID)) return true;
	return truncated ? undefined : false;
}

/** People who can use ORCA now: suspended and removed members are not counted. */
export function activeMembers<T extends Pick<OrcaMember, 'status'>>(members: T[]): T[] {
	return members.filter((member) => !member.status || member.status === 'active');
}

// ---------------------------------------------------------------------------
// Workspaces and programs the viewer can use
// ---------------------------------------------------------------------------

const live = (hub: OrcaHub) => hub.status !== 'archived' && hub.status !== 'deleted';

/** Active workspaces where the viewer is an effective member and a program is ready. */
export function usableWorkspaces(data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'currentUserID'>): OrcaHub[] {
	return data.hubs.filter(
		(hub) => hub.status === 'active' && gatewayHasMember(hub, data.currentUserID) && workspaceToolingReady(hub, data.connections)
	);
}

/** Ready workspaces the viewer is not in yet (an admin may add themselves instead of making another). */
export function workspacesWithoutMe(data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'currentUserID'>): OrcaHub[] {
	return data.hubs.filter(
		(hub) => hub.status === 'active' && !gatewayHasMember(hub, data.currentUserID) && workspaceToolingReady(hub, data.connections)
	);
}

/** The programs the viewer can ask about now, else the company's ready ones. */
export function askablePrograms(data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'currentUserID'>): OrcaConnection[] {
	const mine = new Map<string, OrcaConnection>();
	for (const hub of usableWorkspaces(data))
		for (const connection of gatewayConnections(hub, data.connections))
			if (connectionReady(connection)) mine.set(connection.id, connection);
	if (mine.size > 0) return [...mine.values()];
	return data.connections.filter(connectionReady);
}

/** The ready program the one-click "ให้ทุกคนในบริษัทใช้" starts from: the newest one no workspace uses yet. */
export function teamProgram(data: Pick<OrcaBootstrap, 'hubs' | 'connections'>): OrcaConnection | undefined {
	const ready = data.connections.filter(connectionReady).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	const used = new Set(data.hubs.filter(live).flatMap((hub) => gatewayConnections(hub, data.connections).map((item) => item.id)));
	return ready.find((connection) => !used.has(connection.id)) ?? ready[0];
}

/**
 * "มี N แอป AI ที่ไม่ได้ใช้เกิน 30 วัน" on Home: the same count as ตรวจสอบ's
 * ไม่ได้ใช้เกิน 30 วัน chip (secrets.ts), which the alert opens (?filter=stale).
 */
export function staleAIApps(inventory: OrcaSecrets | undefined | null, now: number): number {
	if (!inventory) return 0;
	const rows = secretRows(inventory, [], [], now, () => false);
	return [...rows.sessions, ...rows.keys].filter((row) => row.stale).length;
}

/** What Home's status view flags for a manager: programs to review, unusable workspaces, paused programs. */
export function attentionCounts(data: Pick<OrcaBootstrap, 'hubs' | 'connections'>) {
	const ready = data.connections.filter(connectionReady).length;
	const paused = data.connections.filter((connection) => !connection.enabled).length;
	const review = data.connections.length - ready - paused;
	const blocked = data.hubs.filter((hub) => hub.status === 'active' && !workspaceToolingReady(hub, data.connections)).length;
	return { ready, paused, review, blocked, total: review + blocked + paused };
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

export type StepState = 'done' | 'current' | 'todo';
/** `undefined`: not known yet (still loading, or it could not be read). */
export type Done = boolean | undefined;
export interface ChecklistStep<ID extends string = string> {
	id: ID;
	done: Done;
	state: StepState;
	minutes: number;
}
export interface Checklist<ID extends string = string> {
	steps: ChecklistStep<ID>[];
	doneCount: number;
	/** Setup mode: some required step is known not to be done. Unknown alone never nags. */
	incomplete: boolean;
	/** Every required step is done. */
	complete: boolean;
	remainingMinutes: number;
	current?: ID;
}

function checklist<ID extends string>(items: { id: ID; done: Done; minutes: number }[]): Checklist<ID> {
	const current = items.find((item) => item.done !== true)?.id;
	const steps = items.map((item) => ({
		...item,
		state: (item.done === true ? 'done' : item.id === current ? 'current' : 'todo') as StepState
	}));
	return {
		steps,
		doneCount: items.filter((item) => item.done === true).length,
		incomplete: items.some((item) => item.done === false),
		complete: items.every((item) => item.done === true),
		remainingMinutes: items.filter((item) => item.done !== true).reduce((sum, item) => sum + item.minutes, 0),
		current
	};
}

export type OwnerStepID = 'program' | 'team' | 'ai' | 'ask';

/**
 * The owner's and admin's four required steps. Until B1 answers, "เชื่อม AI
 * ของฉัน" is merged with the first question: asking proves the AI is connected.
 */
export function ownerChecklist(
	data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'currentUserID'>,
	ai: AIState,
	asked: Done
): Checklist<OwnerStepID> {
	return checklist<OwnerStepID>([
		{ id: 'program', done: data.connections.some(connectionReady), minutes: 4 },
		{ id: 'team', done: usableWorkspaces(data).length > 0, minutes: 1 },
		{ id: 'ai', done: aiDone(ai, asked), minutes: 3 },
		{ id: 'ask', done: asked, minutes: 2 }
	]);
}

/**
 * B1 decides when it answers: "none" means no AI is connected now, even if
 * this person asked something before (their sign-in expired or was
 * disconnected), and `limited` that the company's link is not connected.
 * Only while B1 is unknown does an earlier question prove it, and never after
 * the viewer's own disconnect (`revoked`): that is not known.
 */
function aiDone(ai: AIState, asked: Done): Done {
	if (ai === 'connected') return true;
	if (ai === 'none' || ai === 'limited') return false;
	if (ai === 'revoked') return undefined;
	return asked;
}

/** One program row of the employee's step 2. */
export type AccountState = 'signed-in' | 'needed' | 'waiting' | 'checking' | 'unknown';

/** A program the employee signs in to, with its logo's catalog name. */
export type ProgramAccount = { id: string; name: string; icon: string; state: AccountState };

export type EmployeeStepID = 'ai' | 'accounts' | 'ask';

/**
 * The employee's three steps; `accounts` holds one state per program in their
 * workspaces. A program whose workspace an admin has not opened yet
 * (`waiting`) is shown but never holds the step open: the employee cannot act on it.
 */
export function employeeChecklist(ai: AIState, accounts: AccountState[], asked: Done): Checklist<EmployeeStepID> {
	const usable = accounts.filter((state) => state !== 'waiting');
	const accountsDone: Done =
		usable.length === 0 ? undefined
			: usable.every((state) => state === 'signed-in') ? true
			: usable.some((state) => state === 'needed') ? false
			: undefined;
	return checklist<EmployeeStepID>([
		{ id: 'ai', done: aiDone(ai, asked), minutes: 3 },
		{ id: 'accounts', done: accountsDone, minutes: 2 },
		{ id: 'ask', done: asked, minutes: 2 }
	]);
}

export type HomeMode = 'setup' | 'status' | 'loading';

/**
 * Setup was finished before, and only the viewer's own AI sign-in lapsed: B1
 * says no AI is connected now (it expired, or was disconnected) or only
 * through workspaces' own links (`limited`), or the viewer just disconnected
 * their own and B1 has not said what is left (`revoked`),
 * yet the viewer has asked a first question and every other step is still
 * done (a ready program and an active workspace they use; an employee's
 * program sign-ins, when known). Home then stays in status mode with a
 * one-line "reconnect" banner instead of the whole checklist again.
 */
export function aiLapsed(list: Pick<Checklist, 'steps'>, ai: AIState): boolean {
	if (ai !== 'none' && ai !== 'revoked' && ai !== 'limited') return false;
	const step = (id: string) => list.steps.find((item) => item.id === id);
	if (step('ai')?.done === true || step('ask')?.done !== true) return false;
	// The owner's program and workspace steps are always known; an employee's
	// sign-ins may not be (a program an admin hasn't opened yet): unknown alone never nags.
	return list.steps.every((item) => item.id === 'ai' || item.id === 'ask' || (item.id === 'accounts' ? item.done !== false : item.done === true));
}

/**
 * What Home shows. Setup while a required step is known not to be done (or an
 * employee has no usable workspace); the status cards once everything known is
 * done, or when only the viewer's AI sign-in lapsed after setup (`lapsed`,
 * aiLapsed); a short "checking" line until then, so the checklist never flashes.
 */
export function homeMode(list: Pick<Checklist, 'incomplete'>, noWorkspace: boolean, loaded: boolean, lapsed = false): HomeMode {
	if (noWorkspace || (list.incomplete && !lapsed)) return 'setup';
	return loaded ? 'status' : 'loading';
}

/**
 * The pill beside Home's title. Never "ระบบพร้อมใช้งาน" on an unfinished
 * company: setup says so, and a manager sees what needs looking at. A lapsed
 * AI sign-in is one thing to look at, for any role: it is the viewer's own.
 */
export function homeBadge(mode: HomeMode, manager: boolean, attention: number, t: Translate, lapsed = false): { label: string; tone: 'warn' | 'ok' } | undefined {
	if (mode === 'loading') return undefined;
	if (mode === 'setup') return { label: t('ยังตั้งค่าไม่เสร็จ', 'Setup not finished'), tone: 'warn' };
	const count = (manager ? attention : 0) + (lapsed ? 1 : 0);
	if (count > 0) return { label: t(`ต้องดูแล ${count} เรื่อง`, `${count} to look at`), tone: 'warn' };
	return { label: t('พร้อมใช้งาน', 'Ready'), tone: 'ok' };
}

/** From the program's saved sign-in (sourceAccountState): signed in, or still needed. */
export function accountStateFrom(state: 'account-needed' | 'not-configured' | 'account-connected' | 'configured' | 'unverified'): AccountState {
	if (state === 'account-connected' || state === 'configured') return 'signed-in';
	if (state === 'account-needed' || state === 'not-configured') return 'needed';
	return 'unknown';
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** "วิภา" from "วิภา ตัวอย่าง"; nothing for an account with no name. */
export function firstName(displayName: string | undefined): string {
	return (displayName ?? '').trim().split(/\s+/)[0] ?? '';
}

const prompts: { match: RegExp; th: (name: string) => string; en: (name: string) => string }[] = [
	{ match: /flowaccount/, th: (n) => `สรุปใบแจ้งหนี้ที่ค้างชำระจาก ${n}`, en: (n) => `Summarize unpaid invoices from ${n}` },
	{ match: /\bpeak\b/, th: (n) => `สรุปยอดขายเดือนนี้จาก ${n}`, en: (n) => `Summarize this month's sales from ${n}` },
	{ match: /gmail/, th: (n) => `สรุปอีเมลสำคัญวันนี้จาก ${n}`, en: (n) => `Summarize today's important email in ${n}` },
	{ match: /calendar/, th: (n) => `วันนี้ฉันมีนัดอะไรบ้างใน ${n}`, en: (n) => `What meetings do I have today in ${n}?` },
	{ match: /sheets/, th: (n) => `สรุปตัวเลขในไฟล์ล่าสุดของ ${n}`, en: (n) => `Summarize the figures in my latest ${n} file` },
	{ match: /drive|onedrive/, th: (n) => `หาเอกสารล่าสุดใน ${n} แล้วสรุปให้หน่อย`, en: (n) => `Find the latest documents in ${n} and summarize them` },
	{ match: /slack/, th: (n) => `สรุปข้อความสำคัญใน ${n} วันนี้`, en: (n) => `Summarize today's important messages in ${n}` },
	{ match: /notion/, th: (n) => `หาคู่มือใน ${n} แล้วสรุปให้หน่อย`, en: (n) => `Find a guide in ${n} and summarize it` },
	{ match: /\bline\b/, th: (n) => `ดูยอดข้อความของ ${n} เดือนนี้`, en: (n) => `Show this month's message usage in ${n}` },
	{ match: /hubspot|salesforce|crm/, th: (n) => `สรุปดีลที่กำลังจะปิดเดือนนี้จาก ${n}`, en: (n) => `Summarize deals closing this month in ${n}` }
];

/** A first question to try, per program. The program is named, so AI uses it. */
export function firstPrompt(connection: Pick<OrcaConnection, 'name' | 'mcpID'>, t: Translate): string {
	const name = connection.name.trim() || connection.mcpID;
	const key = `${connection.mcpID} ${connection.name}`.toLowerCase().replace(/[-_]+/g, ' ');
	const found = prompts.find((prompt) => prompt.match.test(key));
	return found ? t(found.th(name), found.en(name)) : t(`ดูข้อมูลล่าสุดจาก ${name} แล้วสรุปให้หน่อย`, `Look at the latest data in ${name} and summarize it`);
}

/**
 * Where an admin adds people to workspaces, in this company (short: it goes
 * into a chat message). The company is always named, "default" too: an admin
 * who last used another company would otherwise open that one (Codex release
 * review 67).
 */
export function workspacesLink(origin: string, company: string): string {
	const url = new URL('/app', origin);
	url.searchParams.set('view', 'workspaces');
	url.searchParams.set('org', company || 'default');
	return url.href;
}

/** The message an employee without a workspace sends an admin. Generic: no admin names (critique 8). */
export function accessRequestText(
	input: { name: string; email: string; company: string; link: string },
	t: Translate
): string {
	const who = [input.name.trim(), input.email.trim() ? `(${input.email.trim()})` : ''].filter(Boolean).join(' ');
	const link = lineExternalURL(input.link);
	return t(
		`รบกวนเพิ่ม${who ? ` ${who}` : 'ฉัน'} เข้าพื้นที่ทำงาน AI ของ ${input.company} ใน ORCA เพื่อให้ใช้ AI กับข้อมูลบริษัทได้ ${link}`,
		`Please add ${who || 'me'} to an AI workspace of ${input.company} in ORCA, so I can use AI with company data. ${link}`
	);
}

/** The company gate's message for someone with no company: ask a manager for an invite link. */
export function inviteRequestText(email: string, t: Translate): string {
	const address = email.trim();
	return address
		? t(`รบกวนส่งลิงก์เชิญเข้า ORCA ของบริษัทให้หน่อย ใช้อีเมล ${address}`, `Could you send me an invite link to our company's ORCA? My email is ${address}.`)
		: t('รบกวนส่งลิงก์เชิญเข้า ORCA ของบริษัทให้หน่อย', "Could you send me an invite link to our company's ORCA?");
}

// ---------------------------------------------------------------------------
// Per-viewer memory (browser storage; a convenience only, never required)
// ---------------------------------------------------------------------------

export type HomeFlag = 'setup-dismissed' | 'skip-invite' | 'skip-knowledge';

/** One key per flag, company and person: another viewer or company never inherits it. */
export function homeFlagKey(flag: HomeFlag, company: string, userID: string): string {
	return `orca.home.${flag}.${company}.${userID}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Private windows and blocked site data throw: the flag then reads as unset. */
export function readHomeFlag(storage: () => StorageLike | undefined, key: string): boolean {
	try {
		return storage()?.getItem(key) === '1';
	} catch {
		return false;
	}
}

export function writeHomeFlag(storage: () => StorageLike | undefined, key: string): boolean {
	try {
		storage()?.setItem(key, '1');
		return true;
	} catch {
		return false;
	}
}
