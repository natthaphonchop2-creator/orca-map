// The state line under the pinned "เชื่อม AI ของฉัน" button. Until the
// person's own AI sign-ins can be read (backend B1), it says "ยังไม่ได้เชื่อม";
// the connect page will set it from B1 through ai-connection.svelte.ts.

export type AIConnectionState = 'unknown' | 'none' | 'connected';
export type AIConnectionStatus = { state: AIConnectionState; /** e.g. "Claude" */ app?: string };

export function aiConnectionLine(status: AIConnectionStatus | undefined, t: (th: string, en: string) => string): string {
	if (status?.state === 'connected') {
		const app = status.app?.trim();
		return app ? t(`${app} เชื่อมแล้ว`, `${app} connected`) : t('เชื่อมแล้ว', 'Connected');
	}
	return t('ยังไม่ได้เชื่อม', 'Not connected');
}
