// "เชื่อม AI ของฉัน" (view=connect-ai): the rules behind the page, kept free of
// Svelte so they are tested on their own. Proposal §3.1, critique 5, 10, 11, 13.
import type { OrcaBootstrap, OrcaHub } from '../services/orca';
import type { MyAIApps, MyAIKey, MyAISession } from '../services/orca-ai-apps';
import type { AIConnectionStatus, AIOnlyWorkspace } from './ai-connection';
import type { AIApp, ClientNames, GatewayClient } from './client-config';
import { connectionReady, workspaceToolingReady } from './activation';
import { AI_APPS, clientNames, gatewayClientCommands, gatewayClientConfig, gatewayInstallLink } from './client-config';
import { gatewayClientInstructions } from './client-instructions';
import { gatewayConnections, gatewayHasMember } from './gateway-sources';

type Translate = (th: string, en: string) => string;

// ---------- Who can use what ----------

export interface ConnectAccess {
	/** Active, ready workspaces the company link reaches for this person. */
	usable: OrcaHub[];
	/** Workspaces with their own sign-in (userSourceID): the company link skips them (critique 11). */
	ownSignIn: OrcaHub[];
	/** A manager's ready workspaces without them, for "เพิ่มฉันเข้าพื้นที่ทำงาน". */
	joinable: OrcaHub[];
}

const byName = (a: OrcaHub, b: OrcaHub) => a.name.localeCompare(b.name, 'th');

/** The same membership and readiness rule the company link applies; the server still decides. */
export function connectAccess(data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'currentUserID' | 'canManage'>): ConnectAccess {
	const ready = data.hubs.filter((hub) => hub.status === 'active' && workspaceToolingReady(hub, data.connections)).sort(byName);
	const me = data.currentUserID;
	const mine = me ? ready.filter((hub) => gatewayHasMember(hub, me)) : [];
	return {
		usable: mine.filter((hub) => !hub.userSourceID),
		ownSignIn: mine.filter((hub) => !!hub.userSourceID),
		joinable: data.canManage && me ? ready.filter((hub) => !hub.userSourceID && !gatewayHasMember(hub, me)) : []
	};
}

/**
 * With no workspace the company link reaches, the one thing that fixes it:
 * - join: a manager adds themselves to a ready workspace
 * - own-sign-in: their workspaces use their own sign-in, so their own link
 * - fix-workspace: a manager's workspaces exist but none is ready yet
 * - add-program: a manager has no program ready to put in a workspace
 * - create-workspace: a manager has programs but no workspace
 * - request: an employee asks a company admin (generic, critique 8)
 */
export type AccessFix = 'join' | 'own-sign-in' | 'fix-workspace' | 'add-program' | 'create-workspace' | 'request';
export function accessFix(data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'canManage'>, access: ConnectAccess): AccessFix | null {
	if (access.usable.length) return null;
	if (data.canManage && access.joinable.length) return 'join';
	if (access.ownSignIn.length) return 'own-sign-in';
	if (!data.canManage) return 'request';
	if (data.hubs.some((hub) => hub.status !== 'archived' && hub.status !== 'deleted')) return 'fix-workspace';
	if (!data.connections.some(connectionReady)) return 'add-program';
	return 'create-workspace';
}

/** "ฝ่ายบัญชี", "ฝ่ายบัญชี และ ฝ่ายขาย", "ฝ่ายบัญชี, ฝ่ายขาย และอีก 2" */
export function namesText(names: string[], t: Translate): string {
	const list = names.map((name) => name.trim()).filter(Boolean);
	if (list.length <= 2) return list.join(t(' และ ', ' and '));
	return t(`${list.slice(0, 2).join(', ')} และอีก ${list.length - 2}`, `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`);
}

/** Program names in the workspaces this person can use, for the example prompts. */
export function usableProgramNames(hubs: OrcaHub[], connections: OrcaBootstrap['connections']): string[] {
	return [...new Set(hubs.flatMap((hub) => gatewayConnections(hub, connections).map((item) => item.name.trim()).filter(Boolean)))];
}

// ---------- The AI app ----------

export const CHAT_APPS = ['claude', 'chatgpt'] as const;
export const DEV_APPS = ['claude-code', 'codex', 'cursor', 'vscode', 'windsurf', 'other'] as const;
export type ChatApp = (typeof CHAT_APPS)[number];
/** The chosen app is a per-viewer convenience, under the key the old picker used. */
export const AI_APP_KEY = 'orca.aiApp';
/** Claude first, then ChatGPT (owner decision 15). */
export const DEFAULT_AI_APP: AIApp = 'claude';

export function isChatApp(app: AIApp): app is ChatApp {
	return app === 'claude' || app === 'chatgpt';
}

export function rememberedApp(storage: Pick<Storage, 'getItem'> | undefined): AIApp {
	try {
		const value = storage?.getItem(AI_APP_KEY);
		if (value && (AI_APPS as string[]).includes(value)) return value as AIApp;
	} catch {
		// Storage unavailable: the default.
	}
	return DEFAULT_AI_APP;
}

const APP_NAMES: Record<AIApp, string> = {
	claude: 'Claude',
	chatgpt: 'ChatGPT',
	'claude-code': 'Claude Code',
	codex: 'Codex',
	cursor: 'Cursor',
	vscode: 'VS Code',
	windsurf: 'Windsurf',
	other: ''
};
export function appName(app: AIApp, t: Translate): string {
	return APP_NAMES[app] || t('แอปอื่น', 'Another app');
}

/** What to type as the connector's name: the company too when this person has several. */
export function connectorName(companyName: string): string {
	return companyName.trim() ? `ORCA · ${companyName.trim()}` : 'ORCA';
}

/** A company link the setup can use: plain http(s), no credentials, query or hash. */
export function validConnectLink(endpoint: string | undefined): boolean {
	if (!endpoint?.trim()) return false;
	try {
		gatewayClientConfig(endpoint.trim(), 'codex', true);
		return true;
	} catch {
		return false;
	}
}

/**
 * Where each chat app's button goes. Claude's connectors page is a real
 * address; ChatGPT has no verified one, so it opens ChatGPT itself and the
 * written steps (Settings → Apps & Connectors → Create) say where to go.
 */
export const CONNECTOR_PAGES: Record<ChatApp, string> = {
	claude: 'https://claude.ai/settings/connectors',
	chatgpt: 'https://chatgpt.com/'
};

// ---------- The person's AI apps (B1) ----------

const later = (value: string | undefined, now: number) => {
	if (!value) return true;
	const time = Date.parse(value);
	return Number.isNaN(time) || time > now;
};
const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);

/** Sign-ins that have not expired, newest first. */
export function liveSessions(apps: MyAIApps | undefined, now: number): MyAISession[] {
	return (apps?.sessions ?? []).filter((session) => later(session.expiresAt, now)).sort(newestFirst);
}

/**
 * A sign-in through the company's link, which reaches every workspace the
 * person may use. One made through a workspace's own link names that
 * workspace (hubID, B3 follow-up) and is never counted as company-wide. A
 * server from before it sends no hubID: every sign-in then counts, as before.
 */
export function companyLinkSession(session: Pick<MyAISession, 'hubID'>): boolean {
	return !session.hubID;
}

/** Where one of the person's sign-ins reaches: "ทุกพื้นที่ทำงานของฉัน", or "เฉพาะ {workspace}". */
export function sessionScope(session: Pick<MyAISession, 'hubID' | 'hubName'>, hubs: Pick<OrcaHub, 'id' | 'name'>[], t: Translate): string {
	if (companyLinkSession(session)) return t('ทุกพื้นที่ทำงานของฉัน', 'All my workspaces');
	const name = hubs.find((hub) => hub.id === session.hubID)?.name || session.hubName?.trim();
	return name ? t(`เฉพาะ ${name}`, `Only ${name}`) : t('พื้นที่ทำงานเดียว', 'One workspace');
}

/** One sign-in or key disconnected on this page, as withoutRevoked keeps it. */
export function revokedKey(kind: 'session' | 'key', id: string | number): string {
	return `${kind}:${id}`;
}

/**
 * The list without what was disconnected on this page: gone at once, and never
 * back from a read that started before the disconnect (Codex release review 67).
 */
export function withoutRevoked(apps: MyAIApps, revoked: ReadonlySet<string>): MyAIApps {
	if (!revoked.size) return apps;
	return {
		...apps,
		sessions: apps.sessions.filter((item) => !revoked.has(revokedKey('session', item.id))),
		keys: apps.keys.filter((item) => !revoked.has(revokedKey('key', item.id)))
	};
}

/** Keys that have not expired, newest first. */
export function liveKeys(apps: MyAIApps | undefined, now: number): MyAIKey[] {
	return (apps?.keys ?? []).filter((key) => later(key.expiresAt, now)).sort(newestFirst);
}

/** Claude Code names itself "Claude Code"; the server hints it as "claude" like claude.ai. */
const CLAUDE_CODE = /claude[\s_-]*code/i;

/** A sign-in's app as people know it. */
export function sessionLabel(session: Pick<MyAISession, 'app' | 'client'>, t: Translate): string {
	const name = session.app.trim();
	if (session.client === 'claude') return CLAUDE_CODE.test(name) ? 'Claude Code' : 'Claude';
	if (session.client === 'chatgpt') return 'ChatGPT';
	return name || t('แอป AI', 'AI app');
}

const DEV_NAMES: Partial<Record<AIApp, RegExp>> = {
	'claude-code': CLAUDE_CODE,
	codex: /codex/i,
	cursor: /cursor/i,
	vscode: /vs\s*code|visual studio code|vscode/i,
	windsurf: /windsurf|codeium/i
};

/**
 * Whether a sign-in is the app chosen on this page. Chat apps go by the
 * server's hint, but a Claude Code sign-in (hinted "claude" by its name) is not
 * claude.ai. Developer tools name themselves, so a new sign-in since the page
 * opened (`since`) from an unknown app also counts for them.
 */
export function sessionMatchesApp(session: MyAISession, app: AIApp, since = Infinity): boolean {
	if (app === 'claude') return session.client === 'claude' && !CLAUDE_CODE.test(session.app);
	if (app === 'chatgpt') return session.client === 'chatgpt';
	if (DEV_NAMES[app]?.test(session.app)) return true;
	return session.client === 'other' && (app === 'other' || (Date.parse(session.createdAt) || 0) >= since);
}

/**
 * The newest live sign-in of the chosen app through the company's link: step
 * 5's "เชื่อม Claude แล้ว". One through a workspace's own link does not count.
 */
export function connectedSession(apps: MyAIApps | undefined, app: AIApp, now: number, since = Infinity): MyAISession | undefined {
	return liveSessions(apps, now).find((session) => companyLinkSession(session) && sessionMatchesApp(session, app, since));
}

/**
 * The pinned button's state: a live sign-in through the company's link, or a
 * key that has been used. Sign-ins through workspaces' own links alone make
 * it connected `only` to those workspaces, never company-wide (B3 follow-up).
 */
export function aiConnectionFrom(apps: MyAIApps | undefined, now: number, t: Translate = (th) => th): AIConnectionStatus {
	const live = liveSessions(apps, now);
	const session = live.find(companyLinkSession);
	if (session) return { state: 'connected', app: sessionLabel(session, t) };
	if (liveKeys(apps, now).some((key) => !!key.lastUsedAt)) return { state: 'connected' };
	if (live.length) {
		// Each workspace with the app of its newest sign-in. Named apart, the
		// pin names no app: "เชื่อมเฉพาะ 2 พื้นที่ทำงาน" (Codex review 71).
		const only = new Map<string, AIOnlyWorkspace>();
		for (const item of live) if (!only.has(item.hubID!)) only.set(item.hubID!, { id: item.hubID!, name: item.hubName?.trim() ?? '', app: sessionLabel(item, t) });
		const apps = new Set([...only.values()].map((hub) => hub.app));
		return { state: 'connected', ...(apps.size === 1 ? { app: [...apps][0] } : {}), only: [...only.values()] };
	}
	return { state: 'none' };
}

// ---------- Dates ----------

const BANGKOK = 'Asia/Bangkok';
function dayKey(time: number): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: BANGKOK, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
}

/** "3 ต.ค." (with the year when it is not this year's). */
export function shortDate(value: string | undefined, now: number, lang: 'th' | 'en' = 'th'): string {
	const time = value ? Date.parse(value) : NaN;
	if (Number.isNaN(time)) return '—';
	const sameYear = dayKey(time).slice(0, 4) === dayKey(now).slice(0, 4);
	return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', {
		timeZone: BANGKOK,
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' })
	}).format(time);
}

/** วันนี้ / เมื่อวาน / 3 ต.ค. */
export function dayLabel(value: string | undefined, now: number, t: Translate, lang: 'th' | 'en' = 'th'): string {
	const time = value ? Date.parse(value) : NaN;
	if (Number.isNaN(time)) return '—';
	if (dayKey(time) === dayKey(now)) return t('วันนี้', 'today');
	if (dayKey(time) === dayKey(now - 86_400_000)) return t('เมื่อวาน', 'yesterday');
	return shortDate(value, now, lang);
}

/** เมื่อสักครู่ / 5 นาทีที่แล้ว / 2 ชั่วโมงที่แล้ว / 3 ต.ค. */
export function relativeWhen(value: string | undefined, now: number, t: Translate, lang: 'th' | 'en' = 'th'): string {
	const time = value ? Date.parse(value) : NaN;
	if (Number.isNaN(time)) return '';
	const minutes = Math.floor((now - time) / 60_000);
	if (minutes < 2) return t('เมื่อสักครู่', 'just now');
	if (minutes < 60) return t(`${minutes} นาทีที่แล้ว`, `${minutes} min ago`);
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t(`${hours} ชั่วโมงที่แล้ว`, `${hours} h ago`);
	return shortDate(value, now, lang);
}

// ---------- Copy ----------

/** Two or three things to try once connected. */
export function examplePrompts(programs: string[], t: Translate): string[] {
	const prompts = [t('ORCA มีอะไรให้ใช้บ้าง', 'What can I use in ORCA?')];
	if (programs[0]) prompts.push(t(`สรุปข้อมูลล่าสุดใน ${programs[0]} ให้หน่อย`, `Summarize the latest in ${programs[0]}`));
	if (programs[1]) prompts.push(t(`ใน ${programs[1]} มีอะไรที่ฉันดูได้บ้าง`, `What can I see in ${programs[1]}?`));
	return prompts;
}

/** What an employee without access sends their admin. Generic: they cannot see who the admins are (critique 8). */
export function accessRequestText(
	who: { name: string; email: string; company: string; url: string },
	t: Translate
): string {
	const me = [who.name.trim(), who.email.trim()].filter(Boolean).join(' · ');
	return t(
		`รบกวนเพิ่มฉัน (${me}) เข้าพื้นที่ทำงาน AI ใน ORCA ของ ${who.company} ด้วย เพื่อให้ AI ของฉันใช้ข้อมูลบริษัทได้ เพิ่มได้ที่ ${who.url}`,
		`Please add me (${me}) to an AI workspace in ${who.company}'s ORCA, so my AI can use company data. You can add me here: ${who.url}`
	);
}

// ---------- Developer keys (critique 10) ----------

export const KEY_EXPIRY_DAYS = [1, 7, 14, 30] as const;
export const DEFAULT_KEY_DAYS = 30;
/** 0 is "ไม่หมดอายุ", offered to owners and admins only. */
export function keyExpiryOptions(canManage: boolean): number[] {
	return canManage ? [...KEY_EXPIRY_DAYS, 0] : [...KEY_EXPIRY_DAYS];
}

/** The server takes a name of up to 120 bytes: 40 Thai letters. */
export const KEY_NAME_MAX_BYTES = 120;
export function keyNameError(name: string, t: Translate): string {
	const value = name.trim();
	if (!value) return t('ตั้งชื่อคีย์ก่อน เช่น สคริปต์รายงานประจำวัน', 'Name the key first, for example daily report script');
	if (new TextEncoder().encode(value).length > KEY_NAME_MAX_BYTES)
		return t('ชื่อคีย์ยาวเกินไป ใช้ไม่เกิน 40 ตัวอักษรไทย', 'The key name is too long. Use at most 120 characters.');
	return '';
}

export function keyExpiryError(days: number, canManage: boolean, t: Translate): string {
	return keyExpiryOptions(canManage).includes(days) ? '' : t('เลือกอายุของคีย์', 'Choose how long the key lasts');
}

/** Where a key reaches: every workspace, or one. */
export function keyScope(key: Pick<MyAIKey, 'hubID'>, hubs: Pick<OrcaHub, 'id' | 'name'>[], t: Translate): string {
	if (!key.hubID) return t('ทุกพื้นที่ทำงานของฉัน', 'All my workspaces');
	const hub = hubs.find((item) => item.id === key.hubID);
	return hub ? t(`เฉพาะ ${hub.name}`, `Only ${hub.name}`) : t('พื้นที่ทำงานเดียว', 'One workspace');
}

// ---------- Setup for developer tools ----------

export interface DevSetup {
	commands: string[];
	installLink: string;
	config: string;
	configPath: string;
	docsUrl: string;
}

const CONFIG_CLIENTS: Partial<Record<AIApp, GatewayClient>> = { codex: 'codex', cursor: 'cursor', vscode: 'vscode', windsurf: 'windsurf' };
const CONFIG_PATHS: Record<GatewayClient, string> = {
	codex: '~/.codex/config.toml',
	cursor: '.cursor/mcp.json',
	vscode: '.vscode/mcp.json',
	windsurf: '~/.codeium/windsurf/mcp_config.json'
};
const DOCS: Record<GatewayClient, string> = {
	codex: 'https://developers.openai.com/codex/mcp',
	cursor: 'https://cursor.com/docs/mcp',
	vscode: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
	windsurf: 'https://docs.windsurf.com/windsurf/cascade/mcp'
};

/** A developer tool's one-click link, commands and config for the link, by sign-in (oauth) or by key. */
export function devSetup(app: AIApp, endpoint: string, oauth: boolean, names: ClientNames = clientNames()): DevSetup {
	const client = CONFIG_CLIENTS[app];
	const attempt = <T>(make: () => T, fallback: T): T => {
		try {
			return make();
		} catch {
			return fallback;
		}
	};
	return {
		commands: attempt(() => gatewayClientCommands(endpoint, app, oauth, names), []),
		installLink: attempt(() => gatewayInstallLink(endpoint, app, oauth, names), ''),
		config: client ? attempt(() => gatewayClientConfig(endpoint, client, oauth, names), '') : '',
		configPath: client ? CONFIG_PATHS[client] : '',
		docsUrl: client ? DOCS[client] : ''
	};
}

/** The one line after a developer tool's setup. */
export function devAfterStep(app: AIApp, oauth: boolean, t: Translate, names: ClientNames = clientNames()): string {
	if (app === 'cursor')
		return oauth
			? t('ใน Cursor กด Install แล้วกด Connect เพื่อเข้าสู่ระบบ ORCA', 'In Cursor, choose Install, then Connect to sign in to ORCA.')
			: t(`ตั้งตัวแปร ${names.keyEnv} เป็นคีย์ของคุณ แล้วเปิด Cursor ใหม่`, `Set ${names.keyEnv} to your key, then restart Cursor.`);
	if (app === 'vscode')
		return oauth
			? t('ใน VS Code กด Install แล้วเริ่มการเชื่อมต่อ หน้าต่าง ORCA จะเปิดขึ้นมา', 'In VS Code, choose Install and start the server; the ORCA window opens.')
			: t('VS Code จะถามคีย์เมื่อเริ่มการเชื่อมต่อครั้งแรก', 'VS Code asks for the key the first time the server starts.');
	if (app === 'claude-code')
		return oauth
			? t(`จากนั้นพิมพ์ /mcp ใน Claude Code แล้วเลือก ${names.server} เพื่อเข้าสู่ระบบ`, `Then type /mcp in Claude Code and choose ${names.server} to sign in.`)
			: t(`ตั้งตัวแปร ${names.keyEnv} เป็นคีย์ของคุณก่อนรันคำสั่ง`, `Set ${names.keyEnv} to your key before running the command.`);
	if (app === 'codex')
		return oauth
			? t('คำสั่งที่สองจะเปิดหน้าต่าง ORCA ให้เข้าสู่ระบบ', 'The second command opens the ORCA window to sign in.')
			: t(`ตั้งตัวแปร ${names.keyEnv} เป็นคีย์ของคุณ ในเครื่องที่ใช้เปิด Codex`, `Set ${names.keyEnv} to your key where Codex starts.`);
	if (app === 'windsurf')
		return oauth
			? t('บันทึกไฟล์แล้วกด Refresh ในแผง MCP ของ Windsurf', 'Save the file, then choose Refresh in Windsurf’s MCP panel.')
			: t(`ตั้งตัวแปร ${names.keyEnv} เป็นคีย์ของคุณ บันทึกไฟล์แล้วกด Refresh ในแผง MCP`, `Set ${names.keyEnv} to your key, save the file and choose Refresh in the MCP panel.`);
	return '';
}

/** English setup text an AI app can follow for any other MCP client. */
export function otherAppInstructions(endpoint: string, oauth: boolean, companyName: string, names: ClientNames = clientNames()): string {
	try {
		return gatewayClientInstructions(endpoint, 'orca', oauth, companyName, names);
	} catch {
		return '';
	}
}

// "เพิ่มฉันเข้าพื้นที่ทำงาน" saves through workspace-edit's saveHubPatch() (critique 2),
// and the LINE/Facebook notice is in-app-browser.ts with InAppBrowserNotice.

// ---------- Polling step 5 ----------

export type PollStep = 'continue' | 'stop';

/**
 * Runs `run` now, then every `interval` while it answers "continue" and the
 * page is visible. A poke during a run runs once more right after it.
 */
export function createPoller(
	run: () => Promise<PollStep>,
	opts: {
		interval: number;
		visible?: () => boolean;
		schedule?: (callback: () => void, ms: number) => unknown;
		cancel?: (handle: unknown) => void;
	}
) {
	const schedule = opts.schedule ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
	const cancel = opts.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	const visible = opts.visible ?? (() => true);
	let handle: unknown;
	let running = false;
	let again = false;
	let stopped = false;
	const clear = () => {
		if (handle !== undefined) cancel(handle);
		handle = undefined;
	};
	async function tick(): Promise<void> {
		handle = undefined;
		if (stopped) return;
		if (running) {
			again = true;
			return;
		}
		if (!visible()) return;
		running = true;
		let next: PollStep = 'continue';
		try {
			next = await run();
		} catch {
			next = 'continue';
		}
		running = false;
		if (stopped) return;
		if (again) {
			again = false;
			return tick();
		}
		if (next === 'continue' && visible()) handle = schedule(() => void tick(), opts.interval);
	}
	return {
		/** Check now (page shown again, app changed), then keep the rhythm. */
		poke() {
			if (stopped) return Promise.resolve();
			clear();
			return tick();
		},
		/** The page is hidden: no requests until the next poke. */
		pause: clear,
		stop() {
			stopped = true;
			clear();
		},
		get waiting() {
			return handle !== undefined || running;
		}
	};
}
