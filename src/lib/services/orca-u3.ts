// U3 "เชื่อม AI ของฉัน": the person's own AI apps (backend B1) and the one
// hub read the "add me" button needs. Kept apart from orca.ts so the areas of
// the workspace redesign merge cleanly; fold into OrcaService later.
import { parseErrorContent } from '$lib/errors';
import { orcaPath } from '$lib/orca/company';
import { setAIConnection } from '$lib/orca/ai-connection.svelte';
import { aiConnectionFrom } from '$lib/orca/connect-ai';
import { t } from '$lib/orca/locale.svelte';
import { doGet, doPost } from './http';
import type { OrcaHub } from './orca';

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
		doPost(orcaPath(`/me/ai-apps/keys/${part(String(id))}/revoke`), {}, options) as Promise<{ revoked: boolean }>,
	/** A fresh copy of one workspace, so a save starts from its latest version (critique 2). */
	hub: (id: string) => doGet(orcaPath(`/hubs/${part(id)}`), options) as Promise<OrcaHub>
};

/** The server has no B1 routes yet, or not for this company: fall back to static hints. */
export function aiAppsUnavailable(error: unknown): boolean {
	return parseErrorContent(error).status === 404;
}

let checked = false;
/**
 * One read when the workspace opens, so the pinned "เชื่อม AI ของฉัน" button
 * shows the right state on every page. The connect page keeps it current after.
 */
export async function checkAIConnectionOnce() {
	if (checked) return;
	checked = true;
	try {
		setAIConnection(aiConnectionFrom(await MyAIAppsService.list(), Date.now(), t));
	} catch {
		// Unknown stays "ยังไม่ได้เชื่อม"; the connect page explains.
	}
}
