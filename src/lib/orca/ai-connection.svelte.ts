import type { AIConnectionStatus } from './ai-connection';

/**
 * The viewer's AI connection, shown on the pinned "เชื่อม AI ของฉัน" button.
 * B1 (GET …/me/ai-apps) feeds it later: setAIConnection({ state: 'connected', app: 'Claude' }).
 */
export const aiConnection = $state<AIConnectionStatus>({ state: 'none' });

export function setAIConnection(status: AIConnectionStatus) {
	aiConnection.state = status.state;
	aiConnection.app = status.app;
}
