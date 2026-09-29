// The person's own AI apps (backend B1, GET …/me/ai-apps): the one client
// for เชื่อม AI ของฉัน, Home, a workspace's overview and the pinned
// "เชื่อม AI ของฉัน" button. Metadata only: no token ever reaches the page.
import { parseErrorContent } from '$lib/errors';
import { orcaPath } from '$lib/orca/company';
import { setAIConnection } from '$lib/orca/ai-connection.svelte';
import { aiConnectionFrom } from '$lib/orca/connect-ai';
import { t } from '$lib/orca/locale.svelte';
import { doGet, doPost } from './http';

/** Which AI app a sign-in is: a display hint the server takes from its redirect host or name. */
export type AIClient = 'claude' | 'chatgpt' | 'other';

/** One of the person's own AI app sign-ins; metadata only, never a token. */
export interface MyAISession {
	id: string;
	/** The name the AI app registered with. */
	app: string;
	client: AIClient;
	createdAt: string;
	/** The last token refresh, not the last tool call. */
	lastRefreshedAt: string;
	expiresAt: string;
}

/** One of the person's own ORCA keys; its value exists only in the response that created it. */
export interface MyAIKey {
	id: number;
	name: string;
	/** Empty for a key that reaches every workspace the person may use. */
	hubID: string;
	createdAt: string;
	lastUsedAt?: string;
	expiresAt?: string;
}

export interface MyAIApps {
	sessions: MyAISession[];
	keys: MyAIKey[];
}

const options = { dontLogErrors: true };
const part = encodeURIComponent;

export const MyAIAppsService = {
	/** GET …/me/ai-apps. A 404 means this server does not have it yet (see aiAppsUnavailable). */
	async list(signal?: AbortSignal): Promise<MyAIApps> {
		const result = (await doGet(orcaPath('/me/ai-apps'), { ...options, signal })) as Partial<MyAIApps> | null;
		return { sessions: result?.sessions ?? [], keys: result?.keys ?? [] };
	},
	revokeSession: (id: string) =>
		doPost(orcaPath(`/me/ai-apps/sessions/${part(id)}/revoke`), {}, options) as Promise<{ revoked: boolean }>,
	revokeKey: (id: number) =>
		doPost(orcaPath(`/me/ai-apps/keys/${part(String(id))}/revoke`), {}, options) as Promise<{ revoked: boolean }>
};

/**
 * The server cannot say: it has no B1 routes yet (404), or none for this
 * person in this company (403). Pages then fall back to static hints, and the
 * pinned button stays neutral instead of claiming "ยังไม่ได้เชื่อม".
 */
export function aiAppsUnavailable(error: unknown): boolean {
	const status = parseErrorContent(error).status;
	return status === 404 || status === 403;
}

let pending: Promise<void> | undefined;
/**
 * Reads B1 once more and updates the shared store (the pin, Home). Calls made
 * while one is in flight share it. Unavailable → "unknown" (a neutral pin); any
 * other failure keeps what was known.
 */
export function refreshAIConnection(): Promise<void> {
	pending ??= (async () => {
		try {
			setAIConnection(aiConnectionFrom(await MyAIAppsService.list(), Date.now(), t));
		} catch (cause) {
			if (aiAppsUnavailable(cause)) setAIConnection({ state: 'unknown' });
		} finally {
			pending = undefined;
		}
	})();
	return pending;
}

let checked = false;
/**
 * One read when the workspace opens, so the pinned "เชื่อม AI ของฉัน" button
 * shows the right state on every page. The connect page keeps it current after.
 */
export function checkAIConnectionOnce(): Promise<void> {
	if (checked) return pending ?? Promise.resolve();
	checked = true;
	return refreshAIConnection();
}
