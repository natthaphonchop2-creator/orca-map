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
export type AIConnectionStatus = {
	state: AIConnectionState;
	/** e.g. "Claude" */
	app?: string;
	/**
	 * Connected only through sign-ins made with workspaces' own links (B3
	 * follow-up): the workspaces each is limited to. Never company-wide.
	 */
	only?: AIOnlyWorkspace[];
};
type Translate = (th: string, en: string) => string;

/** "เฉพาะ ฝ่ายขาย", "เฉพาะ 2 พื้นที่ทำงาน", or "เฉพาะพื้นที่ทำงานเดียว" when its name is not known. */
export function onlyWorkspacesText(only: readonly AIOnlyWorkspace[], t: Translate): string {
	if (only.length > 1) return t(`เฉพาะ ${only.length} พื้นที่ทำงาน`, `only ${only.length} workspaces`);
	const name = only[0]?.name.trim();
	return name ? t(`เฉพาะ ${name}`, `only ${name}`) : t('เฉพาะพื้นที่ทำงานเดียว', 'one workspace only');
}

/**
 * Whether the person's AI reaches the workspace `hubID`: connected through
 * the company's link (or a used key), or through a sign-in limited to it.
 */
export function aiConnectionReaches(status: AIConnectionStatus | undefined, hubID: string | undefined): boolean {
	if (status?.state !== 'connected') return false;
	return !status.only?.length || (!!hubID && status.only.some((hub) => hub.id === hubID));
}

/**
 * The AI app to name for the workspace `hubID`: the one that reaches it ("" when
 * none does, or it is not known). Limited sign-ins name their own workspace's
 * app, never another's (Codex review 71).
 */
export function aiConnectionAppFor(status: AIConnectionStatus | undefined, hubID: string | undefined): string {
	if (!status || !aiConnectionReaches(status, hubID)) return '';
	if (!status.only?.length) return status.app?.trim() ?? '';
	return status.only.find((hub) => hub.id === hubID)?.app?.trim() ?? '';
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
