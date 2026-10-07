// Skills (W0): the client side of a backend that is not built yet. The page
// and its menu item exist only when the company's bootstrap carries
// `features.skills`, which no server sends today. Until the endpoints exist
// this stub answers with no Skills and never touches the network.

export type OrcaSkillStatus = 'draft' | 'published';

/** One Skill: work AI can repeat, called by name from ChatGPT or Claude. */
export interface OrcaSkill {
	id: string;
	name: string;
	description: string;
	/** The programs it reads, by their connection id. */
	connectionIDs: string[];
	/** It answers from คลังความรู้ too. */
	usesKnowledge: boolean;
	status: OrcaSkillStatus;
	/** Calls in the last 30 days; absent for a draft. */
	uses?: number;
	ownerID: string;
	updatedAt: string;
}

export const SkillsService = {
	/** The company's Skills. A stub: always none, and no request is made. */
	async list(): Promise<OrcaSkill[]> {
		return [];
	}
};
