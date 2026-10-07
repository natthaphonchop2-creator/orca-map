// The first run (W0 onboarding): two screens for a new company's Owner or
// Admin, in place of today's first-run checklist. 1: which work they look
// after (chips) and their title; 2: the programs suggested for that work.
// Skippable. The answer stays in this browser only and is used only to
// suggest programs; nothing is sent to the server.

export type OnboardingRole = 'owner' | 'finance' | 'service' | 'online' | 'marketing' | 'hr' | 'purchasing' | 'it' | 'other';

/** The chips, in the mockup's order. */
export const ONBOARDING_ROLES: readonly { id: OnboardingRole; th: string; en: string }[] = [
	{ id: 'owner', th: 'เจ้าของกิจการ', en: 'Business owner' },
	{ id: 'finance', th: 'บัญชีและการเงิน', en: 'Accounting and finance' },
	{ id: 'service', th: 'ขายและบริการลูกค้า', en: 'Sales and customer service' },
	{ id: 'online', th: 'ขายออนไลน์', en: 'Online selling' },
	{ id: 'marketing', th: 'การตลาด', en: 'Marketing' },
	{ id: 'hr', th: 'บุคคล', en: 'People' },
	{ id: 'purchasing', th: 'จัดซื้อและสต็อก', en: 'Purchasing and stock' },
	{ id: 'it', th: 'ไอที', en: 'IT' },
	{ id: 'other', th: 'อื่น ๆ', en: 'Other' }
];

/** A program the suggestions name, matched against the catalog by its own name. */
type Suggestion = { key: string; matches: (name: string, id: string) => boolean };
const program = (key: string, pattern: RegExp, id?: string): Suggestion => ({ key, matches: (name, sourceID) => (id !== undefined && sourceID === id) || pattern.test(name) });
const PROGRAMS: Record<string, Suggestion> = {
	flowaccount: program('flowaccount', /^FlowAccount\b/i),
	peak: program('peak', /^PEAK\b/),
	gmail: program('gmail', /^Gmail\b/i),
	drive: program('drive', /^Google Drive\b/i),
	sheets: program('sheets', /^Google Sheets\b/i),
	line: program('line', /^LINE\b/, 'default-orca-api-line-messaging'),
	shopee: program('shopee', /^Shopee\b/i),
	lazada: program('lazada', /^Lazada\b/i),
	facebook: program('facebook', /^Facebook\b/i),
	canva: program('canva', /^Canva\b/i)
};
/** The suggestions by role (ia.md §4); every other role gets the general set. */
const BY_ROLE: Partial<Record<OnboardingRole, string[]>> = {
	finance: ['flowaccount', 'peak', 'gmail', 'drive', 'sheets', 'line'],
	online: ['shopee', 'lazada', 'line', 'facebook'],
	marketing: ['canva', 'facebook', 'line', 'drive']
};
const GENERAL = ['gmail', 'drive', 'sheets', 'line'];

/** The programs to suggest, in order, at most six: each chosen role's, then the general set. */
export function suggestedPrograms(roles: readonly OnboardingRole[]): string[] {
	const keys: string[] = [];
	const add = (list: readonly string[]) => {
		for (const key of list) if (!keys.includes(key)) keys.push(key);
	};
	for (const role of roles) if (BY_ROLE[role]) add(BY_ROLE[role]!);
	add(GENERAL);
	return keys.slice(0, 6);
}

/** The catalog's programs for the suggestions, in their order; one the catalog lacks is left out. */
export function pickSuggested<T extends { id: string; name: string; guideOnly?: boolean }>(sources: readonly T[], roles: readonly OnboardingRole[]): T[] {
	const picked: T[] = [];
	for (const key of suggestedPrograms(roles)) {
		const match = PROGRAMS[key];
		const found =
			sources.find((source) => !source.guideOnly && match.matches(source.name, source.id) && !picked.includes(source)) ??
			sources.find((source) => match.matches(source.name, source.id) && !picked.includes(source));
		if (found) picked.push(found);
	}
	return picked;
}

/** The line under screen 2's heading: the first chosen role that has its own suggestions. */
export function suggestionFor(roles: readonly OnboardingRole[]): OnboardingRole | undefined {
	return roles.find((role) => BY_ROLE[role]);
}

// ---------------------------------------------------------------------------
// Memory: browser storage only, per company and account, guarded.
// ---------------------------------------------------------------------------

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export const onboardingKey = (company: string, user: string) => `orca.w0.onboarding.${company}.${user}`;
export const rolesKey = (company: string, user: string) => `orca.w0.roles.${company}.${user}`;

/** Finished or skipped in this page, when storage is unavailable. */
const finishedHere = new Set<string>();

export function onboardingDone(storage: () => StorageLike | undefined, key: string): boolean {
	if (finishedHere.has(key)) return true;
	try {
		return storage()?.getItem(key) === 'done';
	} catch {
		return false;
	}
}

export function finishOnboarding(storage: () => StorageLike | undefined, key: string): void {
	finishedHere.add(key);
	try {
		storage()?.setItem(key, 'done');
	} catch {
		// Remembered for this page only.
	}
}

export type OnboardingAnswer = { roles: OnboardingRole[]; title: string };

export function readAnswer(storage: () => StorageLike | undefined, key: string): OnboardingAnswer {
	try {
		const value = JSON.parse(storage()?.getItem(key) ?? 'null') as Partial<OnboardingAnswer> | null;
		const known = new Set(ONBOARDING_ROLES.map((role) => role.id));
		return {
			roles: Array.isArray(value?.roles) ? value.roles.filter((role): role is OnboardingRole => known.has(role as OnboardingRole)) : [],
			title: typeof value?.title === 'string' ? value.title.slice(0, 80) : ''
		};
	} catch {
		return { roles: [], title: '' };
	}
}

export function saveAnswer(storage: () => StorageLike | undefined, key: string, answer: OnboardingAnswer): void {
	try {
		storage()?.setItem(key, JSON.stringify({ roles: answer.roles, title: answer.title.trim().slice(0, 80) }));
	} catch {
		// The suggestions then follow this page's choice only.
	}
}

/**
 * Whether หน้าหลัก opens on the onboarding: an Owner or Admin of a company
 * with no program yet (where the first-run checklist used to start), who has
 * not finished or skipped it. `view=welcome` opens it whenever they ask.
 */
export function showsOnboarding(input: {
	view: string;
	canManage: boolean;
	platform: boolean;
	connections: readonly { archivedAt?: string; deletedAt?: string }[];
	done: boolean;
}): boolean {
	if (!input.canManage || input.platform) return false;
	if (input.view === 'welcome') return true;
	return input.view === 'dashboard' && !input.done && !input.connections.some((connection) => !connection.archivedAt && !connection.deletedAt);
}
