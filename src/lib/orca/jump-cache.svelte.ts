// What ค้นหา… lists beyond the bootstrap (W0.2): the knowledge and document
// template titles of the workspaces the viewer can use, and the customer
// companies the platform's pages listed. Names and ids only, held for this page
// (a company switch is a new page); nothing is stored in the browser.
//
// The titles come from the library and templates pages when they load, and,
// the first time ค้นหา… opens, from a quiet load of the usable workspaces
// (warmJumpCache; Codex W0.2 round 1 / visual sweep: a cold search found none).
// Access is checked again whenever the bootstrap changes (keepWorkspaces): a
// workspace the viewer can no longer use loses its titles at once.

export type JumpTitle = { id: string; title: string; hubID: string; kind?: string };

export const jumpCache = $state<{ knowledge: JumpTitle[]; templates: JumpTitle[]; companies: { id: string; displayName: string }[]; loading: boolean }>({
	knowledge: [],
	templates: [],
	companies: [],
	loading: false
});

function titles(hubID: string, items: readonly { id?: unknown; title?: unknown; kind?: unknown; status?: unknown }[] | null | undefined): JumpTitle[] {
	if (!hubID || !Array.isArray(items)) return [];
	return items
		.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && item.title.trim() && item.status !== 'archived')
		.map((item) => ({ id: item.id as string, title: (item.title as string).trim(), hubID, kind: typeof item.kind === 'string' ? item.kind : undefined }));
}

/** The library of one workspace, as it was just loaded: it replaces what was known of that workspace. */
export function rememberLibrary(hubID: string, items: Parameters<typeof titles>[1]) {
	jumpCache.knowledge = [...jumpCache.knowledge.filter((item) => item.hubID !== hubID), ...titles(hubID, items)];
}

/** The document templates of one workspace, as just loaded. */
export function rememberTemplates(hubID: string, items: Parameters<typeof titles>[1]) {
	jumpCache.templates = [...jumpCache.templates.filter((item) => item.hubID !== hubID), ...titles(hubID, items)];
}

/** The platform's customer companies, as its overview or บริษัทลูกค้า just listed them (operators only). */
export function rememberCompanies(items: readonly { id?: unknown; displayName?: unknown }[] | null | undefined) {
	if (!Array.isArray(items)) return;
	jumpCache.companies = items
		.filter((item) => item && typeof item.id === 'string' && typeof item.displayName === 'string' && item.displayName.trim())
		.map((item) => ({ id: item.id as string, displayName: (item.displayName as string).trim() }));
}

/** A workspace's load was refused (or it is gone): its titles go. */
export function forgetWorkspace(hubID: string) {
	jumpCache.knowledge = jumpCache.knowledge.filter((item) => item.hubID !== hubID);
	jumpCache.templates = jumpCache.templates.filter((item) => item.hubID !== hubID);
}

/** A workspace's template list was refused: only its templates go. */
export function forgetTemplates(hubID: string) {
	jumpCache.templates = jumpCache.templates.filter((item) => item.hubID !== hubID);
}

/** A refusal that means "this workspace is not yours to read": its titles go. */
export const REFUSED_STATUSES = [401, 403, 404, 423] as const;
export function refusedStatus(status: number | undefined): boolean {
	return !!status && (REFUSED_STATUSES as readonly number[]).includes(status);
}

let warmed: 'no' | 'loading' | 'yes' = 'no';
let attempts = 0;
let usableKey = '';
let generation = 0;

/**
 * The bootstrap changed: titles of workspaces the viewer can no longer use go
 * at once; a newly usable workspace makes the next ค้นหา… load again; a load
 * still on its way for the old set is ignored when it answers.
 */
export function keepWorkspaces(usable: readonly string[]) {
	const keep = new Set(usable);
	if (jumpCache.knowledge.some((item) => !keep.has(item.hubID))) jumpCache.knowledge = jumpCache.knowledge.filter((item) => keep.has(item.hubID));
	if (jumpCache.templates.some((item) => !keep.has(item.hubID))) jumpCache.templates = jumpCache.templates.filter((item) => keep.has(item.hubID));
	const key = [...keep].sort().join(' ');
	if (key === usableKey) return;
	const grew = [...keep].some((id) => !usableKey.split(' ').includes(id));
	usableKey = key;
	if (grew && warmed !== 'no') {
		generation += 1;
		warmed = 'no';
		attempts = 0;
		jumpCache.loading = false;
	}
}

export const WARM_HUBS = 10;

/**
 * The first ค้นหา… of the page: the titles of up to WARM_HUBS usable workspaces,
 * and their templates when the company has them. Never throws and never toasts;
 * a refused workspace is cleared; another failure leaves the load to the next
 * opening, once. Typing never waits for it (jumpCache.loading shows a quiet row).
 */
export async function warmJumpCache(input: {
	hubIDs: readonly string[];
	templates: boolean;
	loadLibrary: (hubID: string) => Promise<{ items?: Parameters<typeof titles>[1] }>;
	loadTemplates: (hubID: string) => Promise<Parameters<typeof titles>[1]>;
	status: (cause: unknown) => number | undefined;
	/** Still usable when the answer comes (the bootstrap may have changed meanwhile). */
	usable?: (hubID: string) => boolean;
}): Promise<void> {
	if (warmed !== 'no' || attempts >= 2) return;
	const hubs = [...new Set(input.hubIDs)].slice(0, WARM_HUBS);
	if (!hubs.length) {
		warmed = 'yes';
		return;
	}
	warmed = 'loading';
	attempts += 1;
	jumpCache.loading = true;
	const round = generation;
	let failed = false;
	// A refused library clears the workspace; a refused template list only its templates.
	const fail = (hubID: string, cause: unknown, templates = false) => {
		if (round !== generation) return;
		if (!refusedStatus(input.status(cause))) failed = true;
		else if (templates) forgetTemplates(hubID);
		else forgetWorkspace(hubID);
	};
	const live = (hubID: string) => round === generation && (input.usable?.(hubID) ?? true);
	await Promise.all(
		hubs.flatMap((hubID) => [
			input.loadLibrary(hubID).then(
				(answer) => {
					if (live(hubID)) rememberLibrary(hubID, answer?.items);
				},
				(cause) => fail(hubID, cause)
			),
			...(input.templates
				? [
						input.loadTemplates(hubID).then(
							(list) => {
								if (live(hubID)) rememberTemplates(hubID, list);
							},
							(cause) => fail(hubID, cause, true)
						)
					]
				: [])
		])
	);
	if (round !== generation) return;
	jumpCache.loading = false;
	warmed = failed ? 'no' : 'yes';
}

/** For tests: a fresh page. */
export function resetJumpCache() {
	jumpCache.knowledge = [];
	jumpCache.templates = [];
	jumpCache.companies = [];
	jumpCache.loading = false;
	warmed = 'no';
	attempts = 0;
	usableKey = '';
	generation += 1;
}
