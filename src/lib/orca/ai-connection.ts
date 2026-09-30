// The state line under the pinned "เชื่อม AI ของฉัน" button, from the
// person's own AI sign-ins (backend B1) through ai-connection.svelte.ts.
// "unknown" (not read yet, or a server without B1) shows no state at all: the
// pin must never claim "ยังไม่ได้เชื่อม" when it cannot tell.

export type AIConnectionState = 'unknown' | 'none' | 'connected';
/**
 * A workspace one of the person's sign-ins is limited to (its own link);
 * `name` is "" when they cannot see it, and `app` names the AI app signed in
 * there (its newest sign-in), e.g. "ChatGPT".
 */
export type AIOnlyWorkspace = { id: string; name: string; app?: string };
/**
 * What reaches which workspace, kept beside the pin's summary (Codex review 72):
 * - `company`: the app of the newest live sign-in through the company's link, when there is one
 * - `hubs`: each workspace a live sign-in is limited to (its own link), with its newest sign-in's app
 * - `keys`: where the used keys reach, "" for every workspace of the person's
 * The server lets a sign-in into a workspace only when it used that
 * workspace's way in: an ORCA account, or its SSO (`userSourceID`, the
 * backend's orcaOAuthHubCheck). The company's link offers both, and the list
 * does not say which one each sign-in used, so reachFor counts what may reach
 * and names an app only where the list shows it (Codex review 73).
 */
export type AIReach = { company?: string; hubs: AIOnlyWorkspace[]; keys: string[] };
export type AIConnectionStatus = {
	state: AIConnectionState;
	/** e.g. "Claude" */
	app?: string;
	/**
	 * Connected only through sign-ins made with workspaces' own links (B3
	 * follow-up): the workspaces each is limited to. Never company-wide.
	 */
	only?: AIOnlyWorkspace[];
	/** Absent when only the summary above is known: the company's link then reaches every workspace, as before. */
	reach?: AIReach;
};
/** A workspace as reach needs it: `userSourceID` when it has its own sign-in (SSO). */
export type AIWorkspace = { id: string; userSourceID?: string };
type Translate = (th: string, en: string) => string;

/** "เฉพาะ ฝ่ายขาย", "เฉพาะ 2 พื้นที่ทำงาน", or "เฉพาะพื้นที่ทำงานเดียว" when its name is not known. */
export function onlyWorkspacesText(only: readonly AIOnlyWorkspace[], t: Translate): string {
	if (only.length > 1) return t(`เฉพาะ ${only.length} พื้นที่ทำงาน`, `only ${only.length} workspaces`);
	const name = only[0]?.name.trim();
	return name ? t(`เฉพาะ ${name}`, `only ${name}`) : t('เฉพาะพื้นที่ทำงานเดียว', 'one workspace only');
}

const NOT_REACHED = { reaches: false, app: '' };

/**
 * Whether the person's AI reaches `hub`, and the app to name there ("" when it
 * is not known, e.g. a key). Without `hub`, whether it reaches workspaces at
 * large. The list does not say whether a sign-in used an ORCA account or an
 * SSO, which is what the server checks, so (Codex review 73):
 * - a workspace with its own sign-in (SSO): a sign-in made with its own link
 *   used that SSO, so it reaches it and is named. One through the company's
 *   link reaches it only if that sign-in chose this SSO: counted, never named.
 * - any other workspace: the company's link (with an ORCA account) or a
 *   sign-in made with its own link. Either may be from a different way in (an
 *   SSO sign-in on the company's link, or one from before the workspace
 *   changed its sign-in), so an app is named only when they agree.
 * - then a used key for every workspace or for this one, which names no app.
 */
function reachFor(status: AIConnectionStatus | undefined, hub: AIWorkspace | undefined): { reaches: boolean; app: string } {
	if (status?.state !== 'connected') return NOT_REACHED;
	const reach = status.reach;
	if (!reach) {
		// Only the summary: the company's link (or a used key) reaches all, a limited sign-in its own.
		if (!status.only?.length) return { reaches: true, app: status.app?.trim() ?? '' };
		const own = hub ? status.only.find((item) => item.id === hub.id) : undefined;
		return own ? { reaches: true, app: own.app?.trim() ?? '' } : NOT_REACHED;
	}
	const own = hub ? reach.hubs.find((item) => item.id === hub.id) : undefined;
	const ownApp = own ? (own.app?.trim() ?? '') : undefined;
	const company = reach.company?.trim();
	if (hub?.userSourceID) {
		if (ownApp !== undefined) return { reaches: true, app: ownApp };
		if (company !== undefined) return { reaches: true, app: '' };
	} else if (ownApp !== undefined || company !== undefined) {
		const apps = new Set([ownApp, company].filter((app): app is string => app !== undefined));
		return { reaches: true, app: apps.size === 1 ? [...apps][0] : '' };
	}
	if (reach.keys.some((id) => !id || id === hub?.id)) return { reaches: true, app: '' };
	return NOT_REACHED;
}

/**
 * Whether the person's AI may reach the workspace `hub`: a sign-in limited to
 * it, the company's link, or a used key for every workspace or for this one.
 * Never a sign-in limited to another workspace (reachFor, Codex reviews 72 and 73).
 */
export function aiConnectionReaches(status: AIConnectionStatus | undefined, hub: AIWorkspace | undefined): boolean {
	return reachFor(status, hub).reaches;
}

/**
 * The AI app to name for the workspace `hub`: one whose sign-in reaches it (""
 * when none does, or the list cannot say which). A sign-in limited to another
 * workspace, or the company's link for a workspace with its own sign-in, is
 * never named (Codex reviews 71 to 73).
 */
export function aiConnectionAppFor(status: AIConnectionStatus | undefined, hub: AIWorkspace | undefined): string {
	return reachFor(status, hub).app;
}

/** The line under the pin; "" when unknown (a neutral pin). */
export function aiConnectionLine(status: AIConnectionStatus | undefined, t: Translate): string {
	if (status?.state === 'connected') {
		const app = status.app?.trim();
		// Limited to workspaces' own links: said, never "connected" as if company-wide.
		if (status.only?.length) {
			const where = onlyWorkspacesText(status.only, t);
			return app ? t(`${app} เชื่อม${where}`, `${app}: ${where}`) : t(`เชื่อม${where}`, `Connected, ${where}`);
		}
		return app ? t(`${app} เชื่อมแล้ว`, `${app} connected`) : t('เชื่อมแล้ว', 'Connected');
	}
	if (status?.state === 'none') return t('ยังไม่ได้เชื่อม', 'Not connected');
	return '';
}
