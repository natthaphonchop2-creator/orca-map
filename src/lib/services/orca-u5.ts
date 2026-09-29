// AI workspaces (workspace UX U5): the calls the create form, the one-click
// "ให้ทุกคนในบริษัทใช้" and the in-place tab editors add to OrcaService.
import { parseErrorContent } from '$lib/errors';
import { orcaPath } from '$lib/orca/company';
import { t } from '$lib/orca/locale.svelte';
import { HubConflictError, hubConflictMessage, hubRuleMessage, type HubWriteService } from '$lib/orca/workspace-edit';
import { doGet } from './http';
import { OrcaService, orcaError, type OrcaHub, type OrcaTool } from './orca';

const options = { dontLogErrors: true };
const part = encodeURIComponent;

/**
 * A reviewed tool as the API sends it: `definition` is the complete MCP tool the
 * manager reviewed, whose `annotations` say whether it only reads (critique 1).
 */
export type OrcaReviewedTool = OrcaTool & { definition?: unknown };

/** One of the viewer's own AI app sign-ins in this company (backend B1). */
export interface OrcaMyAISession {
	id: string;
	app: string;
	client: 'claude' | 'chatgpt' | 'other';
	createdAt: string;
	lastRefreshedAt?: string;
	expiresAt?: string;
}
/** One of the viewer's own ORCA keys in this company (backend B1). */
export interface OrcaMyAIKey {
	id: number;
	name: string;
	/** "" means every workspace. */
	hubID: string;
	createdAt: string;
	lastUsedAt?: string;
	expiresAt?: string;
}
export interface OrcaMyAIApps {
	sessions: OrcaMyAISession[];
	keys: OrcaMyAIKey[];
}

export const OrcaWorkspaceService = {
	/** The workspace as saved now: every write starts from it (critique 2). */
	hub: (id: string) => doGet(orcaPath(`/hubs/${part(id)}`), options) as Promise<OrcaHub>,
	/** The viewer's own AI apps (B1): whether Claude or ChatGPT is connected. */
	async myAIApps(signal?: AbortSignal): Promise<OrcaMyAIApps> {
		const result = (await doGet(orcaPath('/me/ai-apps'), { ...options, signal })) as Partial<OrcaMyAIApps> | null;
		return { sessions: result?.sessions ?? [], keys: result?.keys ?? [] };
	}
};

/** Every workspace write goes through saveHubPatch() with this (critique 2). */
export const hubWriteService: HubWriteService = {
	hub: OrcaWorkspaceService.hub,
	save: (input, id) => OrcaService.hub(input, id),
	status: (error) => parseErrorContent(error).status
};

/** A failed workspace write in plain words: someone else's save, a rule, or the server's message. */
export function workspaceWriteError(cause: unknown): string {
	if (cause instanceof HubConflictError || parseErrorContent(cause).status === 409) return hubConflictMessage(t);
	const parsed = parseErrorContent(cause);
	if (parsed.status === 400 || parsed.status === 422) return hubRuleMessage(parsed.message, t) ?? orcaError(cause);
	return orcaError(cause);
}
