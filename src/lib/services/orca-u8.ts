// คลังความรู้ (workspace UX U8): the calls the knowledge page adds. The
// library itself stays in orca-library.ts.
import { orcaPath } from '$lib/orca/company';
import { withMember } from '$lib/orca/knowledge';
import { doGet, doPut } from './http';
import type { OrcaHub } from './orca';

const options = { dontLogErrors: true };
const part = encodeURIComponent;

export const KnowledgeWorkspaceService = {
	/** One workspace as it is now (managers, and members of it). */
	hub: (id: string) => doGet(orcaPath(`/hubs/${part(id)}`), options) as Promise<OrcaHub>,
	/**
	 * "เพิ่มฉันเลย": adds the viewer as a direct member. A workspace save replaces
	 * every field, so it starts from a fresh copy and sends its version; a 409
	 * means someone else saved first (critique 2).
	 */
	async addMember(id: string, memberID: string): Promise<OrcaHub> {
		const fresh = await KnowledgeWorkspaceService.hub(id);
		if ((fresh.memberIDs ?? []).includes(memberID)) return fresh;
		return (await doPut(orcaPath(`/hubs/${part(id)}`), withMember(fresh, memberID), options)) as OrcaHub;
	}
};
