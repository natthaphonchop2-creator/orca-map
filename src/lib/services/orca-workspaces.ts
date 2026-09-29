// AI workspaces: the calls the create form, the one-click "ให้ทุกคนในบริษัทใช้",
// the in-place tab editors, "เพิ่มฉันเข้าพื้นที่ทำงาน" (เชื่อม AI ของฉัน) and
// "เพิ่มฉันเลย" (คลังความรู้) add to OrcaService. Every workspace write goes
// through saveHubPatch() with hubWriteService: a fresh GET, the full body with
// its version, and a 409 as "มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่" (critique 2).
import { parseErrorContent } from '$lib/errors';
import { orcaPath } from '$lib/orca/company';
import { t } from '$lib/orca/locale.svelte';
import { HubConflictError, hubConflictMessage, hubRuleMessage, type HubWriteService } from '$lib/orca/workspace-edit';
import { doGet } from './http';
import { OrcaService, orcaError, type OrcaHub } from './orca';

const options = { dontLogErrors: true };
const part = encodeURIComponent;

export const OrcaWorkspaceService = {
	/** The workspace as saved now: every write starts from it (critique 2). */
	hub: (id: string) => doGet(orcaPath(`/hubs/${part(id)}`), options) as Promise<OrcaHub>
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
