import type { AIConnectionStatus } from './ai-connection';

/**
 * The viewer's AI connection: the pinned "เชื่อม AI ของฉัน" button and Home read
 * it; B1 (GET …/me/ai-apps, services/orca-ai-apps.ts) feeds it. It starts
 * "unknown", which the pin shows without a state line.
 */
export const aiConnection = $state<AIConnectionStatus>({ state: 'unknown' });

export function setAIConnection(status: AIConnectionStatus) {
	aiConnection.state = status.state;
	aiConnection.app = status.app;
}
