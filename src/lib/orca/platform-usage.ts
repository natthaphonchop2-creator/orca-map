// ภาพรวมแพลตฟอร์ม's usage numbers (C4 design §14i, W1-B5): what the page does
// with GET /api/orca/platform/usage. The ORCA team's platform area only; the
// server refuses everyone else, and the answer holds numbers and company names,
// never a person. Nothing here calls the API (services/orca-platform-usage.ts does).

/** One company's last seven days. */
export type OrcaPlatformUsageItem = {
	id: string;
	displayName: string;
	/** Active members. */
	members: number;
	/** Active members with a live AI sign-in or an unexpired key there. */
	aiConnected: number;
	/** Different people whose AI used a program there in the last seven days. */
	aiUsersLast7Days: number;
	/** AI requests to programs (admitted, succeeded or failed; never denials). */
	toolCallsLast7Days: number;
	/** The Bangkok day of the last AI request, or null when there never was one. */
	lastCallDay: string | null;
};

export type OrcaPlatformUsage = {
	generatedAt: string;
	timezone: string;
	/** Bangkok days, YYYY-MM-DD: today, and the first of the seven days (today included). */
	today: string;
	since: string;
	/** Totals count every company, the ORCA team's own included, and each person once. */
	companies: { total: number; activeLast7Days: number };
	people: { members: number; aiConnected: number };
	aiUsers: { today: number; last7Days: number };
	toolCalls: { today: number; last7Days: number };
	items: OrcaPlatformUsageItem[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const day = (value: unknown) => (typeof value === 'string' && DAY.test(value) ? value : null);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const pair = <K extends string>(value: unknown, keys: readonly [K, K]) => {
	const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return Object.fromEntries(keys.map((key) => [key, count(source[key])])) as Record<K, number>;
};

/** The server's answer, with every field in its expected shape (a missing number is 0). */
export function platformUsage(raw: unknown): OrcaPlatformUsage {
	const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const items = Array.isArray(body.items) ? body.items : [];
	return {
		generatedAt: text(body.generatedAt),
		timezone: text(body.timezone) || 'Asia/Bangkok',
		today: day(body.today) ?? '',
		since: day(body.since) ?? '',
		companies: pair(body.companies, ['total', 'activeLast7Days']),
		people: pair(body.people, ['members', 'aiConnected']),
		aiUsers: pair(body.aiUsers, ['today', 'last7Days']),
		toolCalls: pair(body.toolCalls, ['today', 'last7Days']),
		items: items
			.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string')
			.map((item) => ({
				id: item.id as string,
				displayName: text(item.displayName) || (item.id as string),
				members: count(item.members),
				aiConnected: count(item.aiConnected),
				aiUsersLast7Days: count(item.aiUsersLast7Days),
				toolCallsLast7Days: count(item.toolCallsLast7Days),
				lastCallDay: day(item.lastCallDay)
			}))
	};
}

/** The companies by last activity: the latest day first, then the most requests; never-used last. */
export function usageRows(items: readonly OrcaPlatformUsageItem[]): OrcaPlatformUsageItem[] {
	return [...items].sort((a, b) => {
		if (a.lastCallDay !== b.lastCallDay) {
			if (!a.lastCallDay) return 1;
			if (!b.lastCallDay) return -1;
			return a.lastCallDay < b.lastCallDay ? 1 : -1;
		}
		return b.toolCallsLast7Days - a.toolCallsLast7Days || b.aiUsersLast7Days - a.aiUsersLast7Days || a.displayName.localeCompare(b.displayName, 'th');
	});
}

/** Whole days from `from` to `to` (both YYYY-MM-DD), or NaN. */
function daysBetween(from: string, to: string): number {
	const parse = (value: string) => (DAY.test(value) ? Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : NaN);
	return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** "ใช้ล่าสุด": today, yesterday, n days ago within the week, else the date; "ยังไม่เคยใช้" without one. */
export function lastUsedLabel(lastCallDay: string | null, today: string, t: (th: string, en: string) => string, locale: 'th' | 'en' = 'th'): string {
	if (!lastCallDay) return t('ยังไม่เคยใช้', 'Never');
	const ago = daysBetween(lastCallDay, today);
	if (ago === 0) return t('วันนี้', 'Today');
	if (ago === 1) return t('เมื่อวาน', 'Yesterday');
	if (ago > 1 && ago < 7) return t(`${ago} วันก่อน`, `${ago} days ago`);
	const [y, m, d] = lastCallDay.split('-').map(Number);
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A count as people read it: 1,284. */
export function usageNumber(value: number): string {
	return count(value).toLocaleString('en-US');
}
