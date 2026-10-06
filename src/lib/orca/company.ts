// Companies in the workspace (C4 design §14d, EP4b).
//
// A page acts for one company for its whole life. Switching company loads a
// new page, so no response, callback, poll or error from one company can land
// in another, and a write cut off by a switch is never replayed elsewhere.

export const DEFAULT_COMPANY = 'default';
const companyIDPattern = /^org-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One company the signed-in person may use now (GET /api/orca/companies). */
export type OrcaCompanyChoice = {
	id: string;
	displayName: string;
	role: string;
	canManage: boolean;
	/** "active", "suspended" or "closed" (platform console C6); an older server sends none. */
	status?: string;
};

/** Where a fresh page opens. `companies` is undefined when the server gave
 * no list (an older server). */
export type CompanyPlace =
	| { kind: 'company'; id: string; companies?: OrcaCompanyChoice[] }
	| { kind: 'choose'; companies: OrcaCompanyChoice[] }
	| { kind: 'none' }
	| { kind: 'error' };

export function validCompanyID(id: unknown): id is string {
	return typeof id === 'string' && (id === DEFAULT_COMPANY || companyIDPattern.test(id));
}

let pageCompany = DEFAULT_COMPANY;
let pinned = false;

/** The company this page acts for. */
export function currentCompany(): string {
	return pageCompany;
}

/** Whether this page's links carry its company: when it isn't "default", or
 * the person has more than one company, so a reload or a copied link stays
 * in the same company whatever another tab chose. */
export function companyPinned(): boolean {
	return pinned;
}

/** Fixes the page's company, once, before its first request. */
export function setPageCompany(id: string, companies: OrcaCompanyChoice[] = []) {
	if (!validCompanyID(id)) return;
	pageCompany = id;
	pinned = id !== DEFAULT_COMPANY || companies.length > 1;
}

/** An explicit company this person doesn't have, by their own list. The
 * server refuses it anyway; this only picks the page that explains it. */
export function companyDenied(place: CompanyPlace): boolean {
	return place.kind === 'company' && !!place.companies && !place.companies.some((company) => company.id === place.id);
}

/**
 * A platform address (an old bookmark, a typed or forwarded link) opened by
 * someone who isn't in the ORCA team's company: the platform isn't theirs, and
 * the link never named a company, so it opens their own Home, not the
 * "can't open this company" gate.
 */
export function platformOutsider(place: CompanyPlace): boolean {
	return place.kind === 'company' && place.id === DEFAULT_COMPANY && companyDenied(place);
}

/** Home, keeping only the language: the page then opens the person's own company. */
export function homeKeepingLanguage(url: URL): string {
	const lang = url.searchParams.get('lang');
	return lang ? `/app?lang=${encodeURIComponent(lang)}` : '/app';
}

/** An ORCA API path for the page's company: "default" keeps its legacy
 * paths, and another company's live under /orca/orgs/<id>. */
export function orcaPath(path: string, company = pageCompany): string {
	return company === DEFAULT_COMPANY ? `/orca${path}` : `/orca/orgs/${company}${path}`;
}

/**
 * Which company a fresh page opens (§14d EP4b #1). An explicit `org` wins, and
 * the server decides whether this person may use it. Otherwise the remembered
 * choice, if the person still has that company. Otherwise their only company,
 * the chooser for several, or the no-company page for none. Without the list
 * (an older server), "default", as before companies.
 */
export function chooseCompany(explicit: string | null, remembered: string | null, companies: OrcaCompanyChoice[] | undefined): CompanyPlace {
	if (validCompanyID(explicit)) return { kind: 'company', id: explicit, companies };
	if (!companies) return { kind: 'company', id: DEFAULT_COMPANY };
	if (validCompanyID(remembered) && companies.some((company) => company.id === remembered)) {
		return { kind: 'company', id: remembered, companies };
	}
	if (companies.length === 0) return { kind: 'none' };
	if (companies.length === 1) return { kind: 'company', id: companies[0].id, companies };
	return { kind: 'choose', companies };
}

/**
 * Resolves where a fresh page opens. Only an older server, whose list is
 * missing (`missingList`), opens "default" as before companies. Any other
 * failure to read the list opens nothing, so a page never falls into a
 * company the person didn't choose.
 */
export async function resolvePlace(
	listCompanies: () => Promise<OrcaCompanyChoice[]>,
	missingList: (error: unknown) => boolean,
	explicit: string | null,
	remembered: string | null
): Promise<CompanyPlace> {
	let companies: OrcaCompanyChoice[] | undefined;
	try {
		companies = await listCompanies();
	} catch (error) {
		if (!missingList(error)) return { kind: 'error' };
		companies = undefined;
	}
	return chooseCompany(explicit, remembered, companies);
}

// Only the chosen company's ID is kept, per account: never company data,
// roles or keys. Another tab's choice applies to the next page this tab
// opens without an explicit company, never to a page already open.
function rememberKey(account: string) {
	return `orca.company.${account}`;
}

export function rememberedCompany(account: string, storage: Pick<Storage, 'getItem'> | undefined = browserStorage()): string | null {
	if (!account) return null;
	try {
		const id = storage?.getItem(rememberKey(account)) ?? null;
		return validCompanyID(id) ? id : null;
	} catch {
		return null;
	}
}

export function rememberCompany(account: string, id: string, storage: Pick<Storage, 'setItem'> | undefined = browserStorage()) {
	if (!account || !validCompanyID(id)) return;
	try {
		storage?.setItem(rememberKey(account), id);
	} catch {
		/* storage is optional */
	}
}

function browserStorage(): Storage | undefined {
	try {
		return typeof window === 'undefined' ? undefined : window.localStorage;
	} catch {
		return undefined;
	}
}

/** The workspace page that opens a company. Opening it loads a new page. */
export function companyHref(id: string): string {
	return `/app?org=${id}`;
}

/**
 * Whether an address naming `org` must open afresh. A company page reloads
 * for any other company; the chooser and the no-company page have none, so
 * any company counts. A page whose company list failed never reloads by
 * itself, or it would retry forever; its button does.
 */
export function reloadForAddress(place: CompanyPlace, org: string | null): boolean {
	if (!validCompanyID(org) || place.kind === 'error') return false;
	return place.kind === 'company' ? org !== place.id : true;
}

/** Keeps a workspace link in this page's company, when links carry it. */
export function keepCompany(url: URL) {
	if (url.pathname === '/app' && pinned && !url.searchParams.has('org')) url.searchParams.set('org', pageCompany);
}

/** Whether a switch to company `to` may start now: nothing to do for this
 * page's own company, and a save still in flight must finish first. */
export function companySwitch(to: string, writesInFlight: number): 'stay' | 'wait' | 'go' {
	if (to === pageCompany) return 'stay';
	return writesInFlight > 0 ? 'wait' : 'go';
}

/** The page an accepted invitation opens: the server's return target when it
 * is a company's workspace page, otherwise the workspace as before. */
export function invitationReturnPath(target?: { returnTo?: string }): string {
	const returnTo = target?.returnTo ?? '';
	const match = /^\/app\?org=([^&#]+)$/.exec(returnTo);
	return match && validCompanyID(match[1]) ? returnTo : '/app';
}
