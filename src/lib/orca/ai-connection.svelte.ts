import type { AIConnectionStatus } from './ai-connection';

/**
 * The viewer's AI connection: the pinned "เชื่อม AI ของฉัน" button and Home read
 * it; B1 (GET …/me/ai-apps, services/orca-ai-apps.ts) feeds it. It starts
 * "unknown", which the pin shows without a state line. `disconnected`: the
 * viewer disconnected one of their own AI apps on this page (see
 * markAIDisconnected); a later read never clears it.
 */
export const aiConnection = $state<AIConnectionStatus & { disconnected: boolean }>({ state: 'unknown', disconnected: false });

export function setAIConnection(status: AIConnectionStatus) {
	aiConnection.state = status.state;
	aiConnection.app = status.app;
	aiConnection.only = status.only;
	aiConnection.reach = status.reach;
}

/**
 * The viewer disconnected one of their own AI apps here (ตรวจสอบ or เชื่อม AI
 * ของฉัน): "connected" goes at once, everywhere that shows it, and from now on
 * only a read of B1 says what is left. An earlier question in the history
 * never proves a connection again on this page (Codex release review 70).
 */
export function markAIDisconnected() {
	aiConnection.state = 'unknown';
	aiConnection.app = undefined;
	aiConnection.only = undefined;
	aiConnection.reach = undefined;
	aiConnection.disconnected = true;
}
