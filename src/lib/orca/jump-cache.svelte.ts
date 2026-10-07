// What ค้นหา… may list without asking the server again (W0.2): the titles the
// knowledge library and the document templates page already loaded on this
// page, per workspace, and the customer companies the platform's pages listed.
// Names and ids only; nothing is stored in the browser.
// A company switch is a new page, so these never carry over to another company.

export type JumpTitle = { id: string; title: string; hubID: string; kind?: string };

export const jumpCache = $state<{ knowledge: JumpTitle[]; templates: JumpTitle[]; companies: { id: string; displayName: string }[] }>({ knowledge: [], templates: [], companies: [] });

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
