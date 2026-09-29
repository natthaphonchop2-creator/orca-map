// The state line under the pinned "เชื่อม AI ของฉัน" button, from the
// person's own AI sign-ins (backend B1) through ai-connection.svelte.ts.
// "unknown" (not read yet, or a server without B1) shows no state at all: the
// pin must never claim "ยังไม่ได้เชื่อม" when it cannot tell.

export type AIConnectionState = 'unknown' | 'none' | 'connected';
export type AIConnectionStatus = { state: AIConnectionState; /** e.g. "Claude" */ app?: string };

/** The line under the pin; "" when unknown (a neutral pin). */
export function aiConnectionLine(status: AIConnectionStatus | undefined, t: (th: string, en: string) => string): string {
	if (status?.state === 'connected') {
		const app = status.app?.trim();
		return app ? t(`${app} เชื่อมแล้ว`, `${app} connected`) : t('เชื่อมแล้ว', 'Connected');
	}
	if (status?.state === 'none') return t('ยังไม่ได้เชื่อม', 'Not connected');
	return '';
}
