import { organizationRole, type OrganizationRole } from './member-access';
import { canRevokeSecret, type SecretRow } from './secrets';

// ตรวจสอบ › แอป AI ที่เชื่อมอยู่ (view=secrets): every member's AI sign-ins and
// keys, grouped by person, with the filter chips held in the address
// (&filter=stale|noexpiry&holder=<member id>). Revoking reuses the existing
// per-item endpoints; "disconnect all" loops over them.

export type AppsFilter = 'all' | 'stale' | 'noexpiry';
export const APPS_FILTERS: readonly AppsFilter[] = ['all', 'stale', 'noexpiry'];

/** The chip the address asks for; anything else is "all". */
export function appsFilter(value: string | null | undefined): AppsFilter {
	return value === 'stale' || value === 'noexpiry' ? value : 'all';
}

/** The page with its filters, for the chips and for links from other pages (Team's row menu, Home). */
export function connectedAppsHref(filter: AppsFilter = 'all', holder = ''): string {
	const params = new URLSearchParams({ view: 'secrets' });
	if (filter !== 'all') params.set('filter', filter);
	if (holder) params.set('holder', holder);
	return `/app?${params}`;
}

export type AppKind = 'claude' | 'chatgpt' | 'other' | 'key';

/** A display hint only: an AI app names itself when it signs in. */
export function appKind(row: Pick<SecretRow, 'kind' | 'label'>): AppKind {
	if (row.kind === 'key') return 'key';
	const name = row.label.toLowerCase();
	if (name.includes('claude')) return 'claude';
	if (name.includes('chatgpt') || name.includes('openai')) return 'chatgpt';
	return 'other';
}

type Person = { id: string; displayName: string; email: string; role: string | number };
type Workspace = { id: string; name: string; status?: string; memberIDs?: string[]; effectiveMemberIDs?: string[] };

export type AppReach =
	| { kind: 'all' }
	/** `only`: there are workspaces it cannot reach ("เฉพาะ {ws}"). */
	| { kind: 'one'; name?: string; only: boolean }
	| { kind: 'some'; names: string[] }
	| { kind: 'none' };

/**
 * Where an app pulls data from now. A key made for one workspace reaches only
 * it. A sign-in, or a key for every workspace, reaches the active workspaces
 * its holder may use: all of them, one ("เฉพาะ {ws}"), a few, or none yet.
 */
export function appReach(row: Pick<SecretRow, 'userID' | 'hubID' | 'hubName'>, hubs: readonly Workspace[]): AppReach {
	if (row.hubID) return { kind: 'one', name: row.hubName, only: true };
	const active = hubs.filter((hub) => !hub.status || hub.status === 'active');
	const usable = active.filter((hub) => (hub.effectiveMemberIDs ?? hub.memberIDs ?? []).includes(row.userID));
	if (!usable.length) return { kind: 'none' };
	if (usable.length === active.length && active.length > 1) return { kind: 'all' };
	if (usable.length === 1) return { kind: 'one', name: usable[0].name, only: active.length > 1 };
	return { kind: 'some', names: usable.map((hub) => hub.name) };
}

export type Ago =
	| { unit: 'now' | 'today' | 'yesterday' }
	| { unit: 'minutes' | 'hours' | 'days'; count: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Bangkok has no daylight saving: its calendar day starts at 17:00 UTC. */
const BANGKOK = 7 * HOUR;
const bangkokDay = (ms: number) => Math.floor((ms + BANGKOK) / DAY);

/**
 * How long ago, for "ใช้งานล่าสุด". A key's last use is exact, so it reads
 * in minutes or hours within a day. A sign-in only records when the app last
 * renewed it (critique 17), so it reads in calendar days.
 */
export function timeAgo(value: string | undefined, now: number, precise: boolean): Ago | undefined {
	const at = value ? Date.parse(value) : NaN;
	if (Number.isNaN(at)) return undefined;
	const diff = Math.max(0, now - at);
	if (precise && diff < MINUTE) return { unit: 'now' };
	if (precise && diff < HOUR) return { unit: 'minutes', count: Math.floor(diff / MINUTE) };
	if (precise && diff < DAY) return { unit: 'hours', count: Math.floor(diff / HOUR) };
	const days = Math.max(0, bangkokDay(now) - bangkokDay(at));
	if (days === 0) return { unit: 'today' };
	if (days === 1) return { unit: 'yesterday' };
	return { unit: 'days', count: days };
}

export function agoLabel(ago: Ago | undefined, t: (th: string, en: string) => string): string {
	if (!ago) return '—';
	switch (ago.unit) {
		case 'now':
			return t('เมื่อสักครู่', 'Just now');
		case 'today':
			return t('วันนี้', 'Today');
		case 'yesterday':
			return t('เมื่อวาน', 'Yesterday');
		case 'minutes':
			return t(`${ago.count} นาทีก่อน`, `${ago.count} min ago`);
		case 'hours':
			return t(`${ago.count} ชั่วโมงก่อน`, `${ago.count} h ago`);
		case 'days':
			return t(`${ago.count} วันก่อน`, `${ago.count} days ago`);
	}
}

/** "24 ต.ค. 2569" / "24 Oct 2026", in Bangkok time. */
export function shortDate(value: string | undefined, locale: 'th' | 'en'): string {
	const at = value ? new Date(value) : undefined;
	if (!at || Number.isNaN(at.getTime())) return '—';
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(at);
}

/** The name used in sentences: "มาลี" for "มาลี สมบูรณ์", the mailbox for an e-mail. */
export function shortName(name: string): string {
	const value = name.trim();
	if (!value) return '';
	if (!/\s/.test(value) && value.includes('@')) return value.split('@')[0];
	return value.split(/\s+/)[0];
}

/** The avatar letter: the first consonant of a Thai name (not a leading vowel), or a capital. */
export function initial(name: string): string {
	const value = name.trim().replace(/^[เแโใไ]+/, '');
	const first = [...value][0] ?? '';
	return first.toLocaleUpperCase('en');
}

export type AvatarTone = 'citron' | 'ok' | 'quiet' | 'ink';
/** Owners are ink, as in the mockup; everyone else keeps one of three tones by id. */
export function avatarTone(userID: string, role: OrganizationRole | undefined): AvatarTone {
	if (role === 'owner') return 'ink';
	let hash = 0;
	for (const char of userID) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return (['citron', 'ok', 'quiet'] as const)[hash % 3];
}

export type AppGroup = {
	userID: string;
	/** Empty when the holder is no longer a member. */
	name: string;
	role?: OrganizationRole;
	isViewer: boolean;
	/** The rows the filters show. */
	rows: SecretRow[];
	/** Everything this person has connected, whatever the filters. */
	all: SecretRow[];
	stale: number;
	noExpiry: number;
};

export type AppsView = {
	counts: Record<AppsFilter, number>;
	groups: AppGroup[];
	apps: number;
	people: number;
	/** The person named by &holder=, when they are a member. */
	holder?: { id: string; name: string };
};

const sessionsFirst = (a: SecretRow, b: SecretRow) => (a.kind === b.kind ? 0 : a.kind === 'session' ? -1 : 1);

/**
 * The page's model. `holder` and `query` narrow the people; the chips count
 * within them, and the chosen chip narrows the rows. Groups needing a look
 * come first: someone no longer a member, then unused access, then keys that
 * never expire, then more apps, then by name.
 */
export function connectedApps(
	rows: readonly SecretRow[],
	options: { filter: AppsFilter; holder?: string; query?: string; members: readonly Person[]; viewerID: string }
): AppsView {
	const people = new Map(options.members.map((member) => [member.id, member]));
	const query = (options.query ?? '').trim().toLocaleLowerCase();
	const matches = (row: SecretRow) => {
		if (!query) return true;
		const person = people.get(row.userID);
		return [row.member, person?.displayName, person?.email].some((value) => value?.toLocaleLowerCase().includes(query));
	};
	const scoped = rows.filter((row) => (!options.holder || row.userID === options.holder) && matches(row));
	const counts = {
		all: scoped.length,
		stale: scoped.filter((row) => row.stale).length,
		noexpiry: scoped.filter((row) => row.neverExpires).length
	};
	const shown = scoped.filter((row) => (options.filter === 'stale' ? row.stale : options.filter === 'noexpiry' ? row.neverExpires : true));
	const byPerson = new Map<string, SecretRow[]>();
	for (const row of shown) byPerson.set(row.userID, [...(byPerson.get(row.userID) ?? []), row]);
	const groups: AppGroup[] = [...byPerson].map(([userID, list]) => {
		const person = people.get(userID);
		return {
			userID,
			name: list[0].member,
			role: person ? organizationRole(person.role) : undefined,
			isViewer: userID === options.viewerID,
			rows: [...list].sort(sessionsFirst),
			all: rows.filter((row) => row.userID === userID).sort(sessionsFirst),
			stale: list.filter((row) => row.stale).length,
			noExpiry: list.filter((row) => row.neverExpires).length
		};
	});
	groups.sort(
		(a, b) =>
			Number(Boolean(a.name)) - Number(Boolean(b.name)) ||
			b.stale - a.stale ||
			b.noExpiry - a.noExpiry ||
			b.all.length - a.all.length ||
			a.name.localeCompare(b.name, 'th')
	);
	const holderMember = options.holder ? people.get(options.holder) : undefined;
	return {
		counts,
		groups,
		apps: shown.length,
		people: groups.length,
		...(holderMember ? { holder: { id: holderMember.id, name: holderMember.displayName || holderMember.email || holderMember.id } } : {})
	};
}

/** "ตัดการเชื่อมต่อทั้งหมด": two or more apps, and the viewer may disconnect every one (never an owner's, for an admin). */
export function canDisconnectAll(group: Pick<AppGroup, 'all'>, viewerID: string, viewerIsOwner: boolean): boolean {
	return group.all.length > 1 && group.all.every((row) => canRevokeSecret(row, viewerID, viewerIsOwner));
}

/**
 * Disconnects each item in turn through its own endpoint and reports
 * "ตัดแล้ว X จาก Y". One failure never stops the rest.
 */
export async function disconnectEach<T>(
	items: readonly T[],
	disconnect: (item: T) => Promise<unknown>,
	progress?: (attempted: number, total: number) => void
): Promise<{ done: number; total: number; failed: T[] }> {
	let done = 0;
	const failed: T[] = [];
	for (const item of items) {
		try {
			await disconnect(item);
			done += 1;
		} catch {
			failed.push(item);
		}
		progress?.(done + failed.length, items.length);
	}
	return { done, total: items.length, failed };
}
