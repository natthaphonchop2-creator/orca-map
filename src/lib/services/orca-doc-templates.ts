import { orcaPath } from '$lib/orca/company';
import { baseURL, doDelete, doGet, doPost, doPut, doUpload } from './http';
import type { UploadProgress } from './orca-library';

// Document templates (knowledge library v2 phase 2a): a manager uploads a
// company .xlsx, ORCA scans it and proposes a fill spec, the manager confirms
// it and publishes it; the AI fills it over MCP. The server decides every
// right again; these only call it.

/** A version's life: scanning → scanned (or refused) → confirmed → published; superseded once a newer one is published. */
export type DocTemplateState = 'scanning' | 'scanned' | 'refused' | 'confirmed' | 'published' | 'superseded';

export interface DocSpecTarget {
	mode: 'cell' | 'name' | 'labelled' | 'placeholder';
	sheet: string;
	cell: string;
	name?: string;
	label?: string;
	sep?: string;
	missing?: string;
}
export interface DocSpecField {
	key: string;
	label: string;
	type: string;
	required: boolean;
	target: DocSpecTarget;
	description?: string;
	sourceHint?: string;
	example?: unknown;
	min?: number;
	max?: number;
	maxLength?: number;
	values?: string[];
	[extra: string]: unknown;
}
export interface DocSpecColumn {
	key: string;
	label?: string;
	col?: string;
	row?: number;
	type: string;
	required?: boolean;
	auto?: string;
	values?: string[];
	[extra: string]: unknown;
}
export interface DocSpecTable {
	key: string;
	label?: string;
	orientation: 'rows' | 'columns';
	sheet: string;
	firstRow?: number;
	maxRows?: number;
	firstCol?: string;
	maxCols?: number;
	overflow: string;
	owns: string;
	columns?: DocSpecColumn[];
	rows?: DocSpecColumn[];
	description?: string;
	sourceHint?: string;
	[extra: string]: unknown;
}
export interface DocSpec {
	specVersion: number;
	format: string;
	dateSystem: number;
	fields: DocSpecField[];
	tables: DocSpecTable[];
	kept: { range: string; why: string }[];
	cells: { static: string[]; clear: string[] };
}
export interface DocUncovered {
	cell: string;
	kind: 'text' | 'number' | 'date' | 'labelled' | 'formula';
	premarked?: 'static';
}
export interface DocGridCell {
	ref: string;
	text: string;
	kind: string;
	format?: string;
}
export interface DocGridSheet {
	name: string;
	cells: DocGridCell[];
	merges: string[];
	truncated?: boolean;
}
export interface DocScanReport {
	version: number;
	proposal: DocSpec;
	facts: { sheets: string[]; uncovered: DocUncovered[]; [extra: string]: unknown };
	grid: DocGridSheet[];
	outside: { part: string; kind: string }[];
	warnings: string[];
}
export interface DocTemplateVersion {
	version: number;
	state: DocTemplateState;
	refusalReason?: string;
	originalName: string;
	bytes: number;
	sha256: string;
	specSha256?: string;
	confirmedAt?: string;
	createdAt: string;
	report?: DocScanReport;
	spec?: DocSpec;
}
export interface DocTemplate {
	id: string;
	hubID: string;
	title: string;
	summary: string;
	status: 'draft' | 'published' | 'archived';
	ownerID: string;
	whenToUse: string;
	expectedSources: string[];
	audienceMode: 'list' | 'everyone_live';
	memberIDs: string[];
	unitIDs: string[];
	publishedVersion?: number;
	draftVersion?: number;
	version: number;
	versions: DocTemplateVersion[];
	updatedAt: string;
}
export interface DocConfirm {
	version: number;
	spec: DocSpec;
	title?: string;
	summary?: string;
	whenToUse: string;
	expectedSources: string[];
}
export interface DocPublish {
	version: number;
	audienceMode: 'list' | 'everyone_live';
	memberIDs: string[];
	unitIDs: string[];
}
/** A filled file: the requester sees its name and report; a manager neither. */
export interface GeneratedDocument {
	id: string;
	hubID: string;
	templateID: string;
	templateTitle?: string;
	templateVersion: number;
	requesterID?: string;
	name?: string;
	bytes: number;
	readyAt: string;
	expiresAt: string;
	report?: GeneratedReport;
	reportTruncated?: boolean;
}
/** The fill report as the server stores it (OrcaGenerateReport). */
export interface GeneratedReport {
	filled?: { key: string; label?: string; cell?: string; shown?: string; source?: string; sourceLabel?: string }[];
	cleared?: { key: string; cell?: string }[];
	/** Per table: rows given, rows written, the keys of those not written. */
	overflow?: { table: string; given: number; written: number; notWritten?: string[] }[];
	kept?: string[];
	keptTruncated?: boolean;
	truncated?: boolean;
	/** The full counts, taken before any list was cut. */
	totals?: { filled: number; cleared: number; overflow: number; kept: number; overflowRows?: number };
}
/** Where a file lives: the company the file page pins before it downloads. */
export interface DocumentLocation {
	id: string;
	companyID: string;
	hubID: string;
	name: string;
	bytes: number;
	expiresAt: string;
}

const options = { dontLogErrors: true };
const part = encodeURIComponent;
const base = (hubID: string) => orcaPath(`/hubs/${part(hubID)}/doc-templates`);
const item = (hubID: string, id: string) => `${base(hubID)}/${part(id)}`;
const normalize = (template: DocTemplate): DocTemplate => ({
	...template,
	expectedSources: template.expectedSources ?? [],
	memberIDs: template.memberIDs ?? [],
	unitIDs: template.unitIDs ?? [],
	versions: template.versions ?? []
});
const form = (file: File) => {
	const body = new FormData();
	body.append('files', file, file.name);
	return body;
};

export const OrcaDocTemplateService = {
	async list(hubID: string): Promise<DocTemplate[]> {
		const result = (await doGet(base(hubID), options)) as { templates: DocTemplate[] | null };
		return (result.templates ?? []).map(normalize);
	},
	async get(hubID: string, id: string): Promise<DocTemplate> {
		return normalize((await doGet(item(hubID, id), options)) as DocTemplate);
	},
	/** One .xlsx: 202 once it is stored; ORCA scans it afterwards. */
	async upload(hubID: string, file: File, progress?: UploadProgress): Promise<DocTemplate> {
		return normalize((await doUpload(base(hubID), form(file), { ...options, ...progress })) as DocTemplate);
	},
	/** A new version of the template's file: scanned again, confirmed again. */
	async replace(hubID: string, id: string, file: File, progress?: UploadProgress): Promise<DocTemplate> {
		return normalize((await doUpload(`${item(hubID, id)}/versions`, form(file), { ...options, ...progress })) as DocTemplate);
	},
	async confirm(hubID: string, id: string, input: DocConfirm): Promise<DocTemplate> {
		return normalize((await doPut(`${item(hubID, id)}/spec`, input, options)) as DocTemplate);
	},
	async publish(hubID: string, id: string, input: DocPublish): Promise<DocTemplate> {
		return normalize((await doPost(`${item(hubID, id)}/publish`, input, options)) as DocTemplate);
	},
	async unpublish(hubID: string, id: string): Promise<DocTemplate> {
		return normalize((await doPost(`${item(hubID, id)}/unpublish`, {}, options)) as DocTemplate);
	},
	/** ลองสร้างเอกสาร: the draft filled with its own example values, a file only the manager sees. */
	testFill: (hubID: string, id: string) => doPost(`${item(hubID, id)}/test-fill`, {}, options) as Promise<{ status: string; file?: { id: string; name: string } ; problems?: { key: string; code: string; hint?: string }[] }>,
	remove: (hubID: string, id: string) => doDelete(item(hubID, id), options),

	// ── Generated files ──
	/** The requester's files in a workspace; `company` pins another company (the file page). */
	async documents(hubID: string, company?: string): Promise<GeneratedDocument[]> {
		const result = (await doGet(orcaPath(`/hubs/${part(hubID)}/documents`, company), options)) as { documents: GeneratedDocument[] | null };
		return result.documents ?? [];
	},
	async managed(hubID: string): Promise<GeneratedDocument[]> {
		const result = (await doGet(orcaPath(`/hubs/${part(hubID)}/documents/managed`), options)) as { documents: GeneratedDocument[] | null };
		return result.documents ?? [];
	},
	removeDocument: (id: string) => doDelete(orcaPath(`/files/${part(id)}`), options),
	/** The file page's first question, asked without a company. */
	locate: (id: string) => doGet(`/orca/files/${part(id)}/locate`, options) as Promise<DocumentLocation>,
	/** A plain same-origin link in the pinned company; the server checks and audits it. */
	downloadHref: (id: string, company: string) => `${baseURL}${orcaPath(`/files/${part(id)}/download`, company)}`,
	/** ตรวจเอกสาร: a manager's audited open of a person's file. */
	inspectHref: (hubID: string, id: string) => `${baseURL}${orcaPath(`/hubs/${part(hubID)}/documents/${part(id)}/inspect`)}`
};
