import { doGet, doPost, doPut } from './http';
import type { OrcaMember } from './orca';

export type LibraryKind = 'knowledge' | 'template';
export type LibraryStatus = 'draft' | 'published' | 'archived';
export interface LibraryParameter {
	name: string;
	label: string;
	required: boolean;
}
export interface LibraryInput {
	kind: LibraryKind;
	title: string;
	summary: string;
	content: string;
	parameters: LibraryParameter[];
	knowledgeIDs: string[];
	memberIDs: string[];
	unitIDs: string[];
	status: LibraryStatus;
	version: number;
}
export interface LibraryItem extends LibraryInput {
	id: string;
	hubID: string;
	ownerID: string;
	createdAt: string;
	updatedAt: string;
	canEdit: boolean;
}
export interface LibraryDepartment {
	unitID: string;
	memberIDs: string[];
	version: number;
	name?: string;
}
export interface LibraryData {
	items: LibraryItem[];
	departments: LibraryDepartment[];
	members: OrcaMember[];
}
export interface RenderedTemplate {
	templateID: string;
	title: string;
	version: number;
	content: string;
	knowledge: Pick<LibraryItem, 'id' | 'title' | 'summary' | 'content' | 'version'>[];
}

const options = { dontLogErrors: true };
const part = encodeURIComponent;
const base = (hubID: string) => `/orca/hubs/${part(hubID)}/library`;
const normalizeItem = (item: LibraryItem): LibraryItem => ({
	...item,
	parameters: item.parameters ?? [],
	knowledgeIDs: item.knowledgeIDs ?? [],
	memberIDs: item.memberIDs ?? [],
	unitIDs: item.unitIDs ?? []
});

export const OrcaLibraryService = {
	async load(hubID: string): Promise<LibraryData> {
		const result = (await doGet(base(hubID), options)) as LibraryData;
		return {
			items: (result.items ?? []).map(normalizeItem),
			departments: (result.departments ?? []).map((item) => ({
				...item,
				memberIDs: item.memberIDs ?? []
			})),
			members: result.members ?? []
		};
	},
	async save(hubID: string, input: LibraryInput, id?: string): Promise<LibraryItem> {
		return normalizeItem(
			(await (id
				? doPut(`${base(hubID)}/items/${part(id)}`, input, options)
				: doPost(`${base(hubID)}/items`, input, options))) as LibraryItem
		);
	},
	async render(
		hubID: string,
		id: string,
		inputs: Record<string, string>
	): Promise<RenderedTemplate> {
		const result = (await doPost(
			`${base(hubID)}/templates/${part(id)}/render`,
			{ inputs },
			options
		)) as RenderedTemplate;
		return { ...result, knowledge: result.knowledge ?? [] };
	},
	async departments(): Promise<LibraryDepartment[]> {
		const result = (await doGet('/orca/library/departments', options)) as {
			items: LibraryDepartment[] | null;
		};
		return (result.items ?? []).map((item) => ({ ...item, memberIDs: item.memberIDs ?? [] }));
	},
	saveDepartment: (unitID: string, memberIDs: string[], version: number) =>
		doPut(
			`/orca/library/departments/${part(unitID)}`,
			{ memberIDs, version },
			options
		) as Promise<LibraryDepartment>
};
