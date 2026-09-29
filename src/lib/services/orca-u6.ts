// Workspace UX U6 (Home, Help, the company gate and the sign-in pages): the
// API calls and shared types this area adds. Kept apart from orca.ts so the
// areas built side by side merge cleanly.
import { orcaPath } from '$lib/orca/company';
import { doGet } from './http';
import type { OrcaTool } from './orca';

/** An AI app the person signed in to ORCA with (backend B1). Metadata only. */
export interface OrcaMyAISession {
	id: string;
	/** The name the AI app registered with. */
	app: string;
	/** A display hint from the app's registered redirect host or name. */
	client: 'claude' | 'chatgpt' | 'other';
	createdAt: string;
	lastRefreshedAt: string;
	expiresAt: string;
}

/** One of the person's own ORCA keys (backend B1). Never carries the key itself. */
export interface OrcaMyAIKey {
	id: number;
	name: string;
	/** "" reaches every workspace the person may use. */
	hubID: string;
	createdAt: string;
	lastUsedAt?: string;
	expiresAt?: string;
}

/** GET …/me/ai-apps: the caller's own AI sign-ins and keys in the open company. */
export interface OrcaMyAIApps {
	sessions: OrcaMyAISession[];
	keys: OrcaMyAIKey[];
}

/** MCP tool annotations, as the provider sent them. */
export interface OrcaToolAnnotations {
	title?: string;
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
	idempotentHint?: boolean;
	openWorldHint?: boolean;
}

/** A program's tool as the API returns it: the provider's definition carries the annotations. */
export type OrcaAnnotatedTool = OrcaTool & {
	definition?: { annotations?: OrcaToolAnnotations | null } | null;
	annotations?: OrcaToolAnnotations | null;
};

const options = { dontLogErrors: true };

export const OrcaU6Service = {
	async myAIApps(): Promise<OrcaMyAIApps> {
		const result = (await doGet(orcaPath('/me/ai-apps'), options)) as Partial<OrcaMyAIApps> | null;
		return { sessions: result?.sessions ?? [], keys: result?.keys ?? [] };
	}
};
