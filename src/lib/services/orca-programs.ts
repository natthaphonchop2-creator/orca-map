// Programs (U4): เพิ่มโปรแกรม and โปรแกรมที่เชื่อม. The calls and types the new
// add-program flow, the programs list and program detail need on top of
// OrcaService. Nothing here grants access: the server checks every call.
import { parseErrorContent } from '$lib/errors';
import { orcaPath } from '$lib/orca/company';
import { t } from '$lib/orca/locale.svelte';
import { programSaveMessage } from '$lib/orca/program-tools';
import { doPost } from './http';
import { OrcaService, orcaError, type ConnectionInput, type OrcaCandidate, type OrcaConnection, type OrcaTool } from './orca';

/**
 * A tool as the server returns it from discovery or a saved connection. The
 * full MCP definition (with `annotations`) is what decides whether a tool may
 * sit in "ดูข้อมูล" (critique 1); OrcaTool leaves it out.
 */
export type ProgramTool = OrcaTool & { definition?: unknown };

/** A saved connection whose tools carry their definitions. */
export type ProgramConnection = Omit<OrcaConnection, 'tools'> & { tools: ProgramTool[] };

/** A connection save. The note is optional since B3: an empty one is stored as "". */
export type ProgramSaveInput = ConnectionInput;

const options = { dontLogErrors: true };
// The catalog is fetched once per company and shared by the picker, the list,
// the detail and the account step (it used to be fetched three times a page).
const CATALOG_TTL_MS = 60_000;
let catalog: { path: string; at: number; request: Promise<OrcaCandidate[]> } | undefined;

export const ProgramService = {
	/** The company's program catalog; `refresh` skips the page's copy. */
	candidates(refresh = false): Promise<OrcaCandidate[]> {
		const path = orcaPath('/candidates');
		const now = Date.now();
		if (!refresh && catalog && catalog.path === path && now - catalog.at < CATALOG_TTL_MS) return catalog.request;
		const request = OrcaService.candidates();
		catalog = { path, at: now, request };
		request.catch(() => {
			// A failed load is never reused.
			if (catalog?.request === request) catalog = undefined;
		});
		return request;
	},
	/** The tools a program offers to the signed-in account, or to the company account given, with their definitions. */
	async discover(mcpID: string, programAccountID?: string): Promise<ProgramTool[]> {
		const response = (await doPost(orcaPath('/discover'), { mcpID, ...(programAccountID ? { programAccountID } : {}) }, options)) as { tools: ProgramTool[] | null };
		return response.tools ?? [];
	},
	/** Creates a connection, or saves one when `id` is given (with its `version`). */
	save: (input: ProgramSaveInput, id?: string) => OrcaService.connection(input, id) as Promise<ProgramConnection>
};

/** A save refused because someone else saved the program since (its version moved on). */
export function programSaveConflict(cause: unknown): boolean {
	return parseErrorContent(cause).status === 409;
}

/** A refused program save in plain words: the server's own rules in Thai, else the general message. */
export function programSaveError(cause: unknown): string {
	const parsed = parseErrorContent(cause);
	return (parsed.status === 400 || parsed.status === 422 ? programSaveMessage(parsed.message, t) : undefined) ?? orcaError(cause);
}
