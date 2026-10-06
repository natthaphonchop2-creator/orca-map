import { orcaPath } from '$lib/orca/company';
import { doDelete, doGet, doGetForResponse, doPost, doPut, doUpload } from './http';
import type { OrcaMember } from './orca';

/** An article, a ready-made prompt, or (knowledge library v2) an uploaded file. */
export type LibraryKind = 'knowledge' | 'template' | 'file';
export type LibraryStatus = 'draft' | 'published' | 'archived';
/**
 * Who a published item reaches (C4 §14m S1): "list" is its people and
 * departments, as before; "everyone_live" is everyone the workspace admits,
 * now and later ("ทุกคน (อัปเดตอัตโนมัติ)").
 */
export type LibraryAudienceMode = 'list' | 'everyone_live';
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
	/** Sent only to a server that knows it (its bootstrap has `features`): an older one refuses unknown fields. */
	audienceMode?: LibraryAudienceMode;
}
export interface LibraryItem extends LibraryInput {
	id: string;
	hubID: string;
	ownerID: string;
	createdAt: string;
	updatedAt: string;
	canEdit: boolean;
	/** A file item's file: its published version for everyone, its pending one and options for its owner. */
	file?: LibraryFileInfo;
}

// ── Files (knowledge library v2, C4 §14m S5) ────────────────────────

/**
 * A version's reading: queued and extracting are still being read; ready and
 * partial serve; failed, too_large and unsupported never do. superseded is a
 * version replaced before it served; needs_ocr comes with PDFs (phase 1b).
 */
export type LibraryFileState =
	| 'queued'
	| 'extracting'
	| 'ready'
	| 'partial'
	| 'failed'
	| 'too_large'
	| 'unsupported'
	| 'superseded'
	| 'needs_ocr';
/** The hidden parts a version was read with. */
export interface LibraryReadParts {
	includeHidden: boolean;
	includeComments: boolean;
	includeNotes: boolean;
}
/** A file's hidden parts, counted whether they were read or not. */
export interface LibraryHiddenParts {
	notesSlides: number;
	hiddenSlides: number;
	hiddenSheets: number;
	hiddenText: number;
	comments: number;
	trackedChanges: number;
}
/** What reading a version found. It never holds text. */
export interface LibraryFileStats {
	pages?: number;
	paginated?: boolean;
	slides?: number;
	sheets?: number;
	rows?: number;
	chars: number;
	encoding?: string;
	encodingUncertain?: boolean;
	partialReason?: string;
	hidden: LibraryHiddenParts;
}
export interface LibraryFileVersion {
	version: number;
	state: LibraryFileState;
	/** Why a version is partial or did not read (a reason code, never a parser message). */
	errorClass?: string;
	fileName: string;
	bytes: number;
	options: LibraryReadParts;
	stats: LibraryFileStats;
	createdAt: string;
	readyAt?: string;
}
/** A file's settings, for its owner only. */
export interface LibraryFileOptions extends LibraryReadParts {
	allowDownload: boolean;
	reviewBeforeUpdate: boolean;
}
export interface LibraryFileInfo {
	origin: string;
	fileName: string;
	ext: string;
	mime: string;
	bytes: number;
	allowDownload: boolean;
	published?: LibraryFileVersion;
	pending?: LibraryFileVersion;
	options?: LibraryFileOptions;
}
/** Where a piece of text is in its file. */
export interface LibraryLocator {
	page?: number;
	pageEnd?: number;
	paragraph?: number;
	heading?: string;
	slide?: number;
	sheet?: string;
	rowStart?: number;
	rowEnd?: number;
	line?: number;
}
export interface LibraryPreviewChunk {
	text: string;
	locator: LibraryLocator;
}
/** A file item with one page of what the AI sees of one of its versions. */
export interface LibraryFileDetail {
	item: LibraryItem;
	which: 'published' | 'pending';
	version?: LibraryFileVersion;
	preview: LibraryPreviewChunk[];
	totalChars: number;
	nextCursor?: string;
}
/** One file of an upload: its new item, or the reason it was refused. */
export interface LibraryUploadedFile {
	fileName: string;
	item?: LibraryItem;
	error?: string;
	hint?: string;
}
export interface LibraryUploadResult {
	files: LibraryUploadedFile[];
}
/** The company's library quota, and the workspace's items. */
export interface LibraryUsage {
	bytes: number;
	bytesLimit: number;
	chars: number;
	charsLimit: number;
	uploadsToday: number;
	uploadsLimit: number;
	items: number;
	itemsLimit: number;
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
/** An upload's progress, its end of sending (after which a lost answer leaves the outcome unknown) and its cancel. */
export type UploadProgress = { onprogress?: (loaded: number, total: number) => void; onsent?: () => void; signal?: AbortSignal };
const part = encodeURIComponent;
const base = (hubID: string) => orcaPath(`/hubs/${part(hubID)}/library`);
const fileBase = (hubID: string, itemID: string) => `${base(hubID)}/files/${part(itemID)}`;
const normalizeItem = (item: LibraryItem): LibraryItem => ({
	...item,
	content: item.content ?? '',
	parameters: item.parameters ?? [],
	knowledgeIDs: item.knowledgeIDs ?? [],
	memberIDs: item.memberIDs ?? [],
	unitIDs: item.unitIDs ?? []
});
const normalizeUpload = (result: LibraryUploadResult): LibraryUploadResult => ({
	files: (result?.files ?? []).map((file) => (file.item ? { ...file, item: normalizeItem(file.item) } : file))
});
const uploadForm = (files: readonly File[]) => {
	const form = new FormData();
	for (const file of files) form.append('files', file, file.name);
	return form;
};

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
		const result = (await doGet(orcaPath('/library/departments'), options)) as {
			items: LibraryDepartment[] | null;
		};
		return (result.items ?? []).map((item) => ({ ...item, memberIDs: item.memberIDs ?? [] }));
	},
	saveDepartment: (unitID: string, memberIDs: string[], version: number) =>
		doPut(
			orcaPath(`/library/departments/${part(unitID)}`),
			{ memberIDs, version },
			options
		) as Promise<LibraryDepartment>,

	// ── Files ──
	/** 1–10 new files as drafts of the uploader: 202 once each is stored or refused, before any is read. */
	async upload(
		hubID: string,
		files: readonly File[],
		progress?: UploadProgress
	): Promise<LibraryUploadResult> {
		return normalizeUpload((await doUpload(`${base(hubID)}/files`, uploadForm(files), { ...options, ...progress })) as LibraryUploadResult);
	},
	/** A new version of the owner's file: it serves once read (and, with review, once published). */
	async replace(
		hubID: string,
		itemID: string,
		file: File,
		progress?: UploadProgress
	): Promise<LibraryUploadResult> {
		return normalizeUpload((await doUpload(`${fileBase(hubID, itemID)}/versions`, uploadForm([file]), { ...options, ...progress })) as LibraryUploadResult);
	},
	/** A file's detail and one page of what the AI sees: the published version, or the owner's pending one. */
	async file(hubID: string, itemID: string, which: 'published' | 'pending' = 'published', cursor = ''): Promise<LibraryFileDetail> {
		const query = new URLSearchParams({ version: which });
		if (cursor) query.set('cursor', cursor);
		const result = (await doGet(`${fileBase(hubID, itemID)}?${query}`, options)) as LibraryFileDetail;
		return { ...result, item: normalizeItem(result.item), preview: result.preview ?? [], totalChars: result.totalChars ?? 0 };
	},
	/** Changes only the options it names: a page holding an older read never sets back what another page changed (G3, Codex #2). */
	async setOptions(hubID: string, itemID: string, change: Partial<LibraryFileOptions>): Promise<LibraryItem> {
		return normalizeItem((await doPut(`${fileBase(hubID, itemID)}/options`, change, options)) as LibraryItem);
	},
	/** Puts the held version the owner reviewed in use, named by number: a newer one in its place answers 409 version_changed (G3, Codex #1). */
	async publishPending(hubID: string, itemID: string, version: number): Promise<LibraryItem> {
		return normalizeItem((await doPost(`${fileBase(hubID, itemID)}/publish-pending`, { version }, options)) as LibraryItem);
	},
	/** "อ่านไฟล์ใหม่": a failed version runs again; a read one gets a new pending version. */
	async reextract(hubID: string, itemID: string): Promise<LibraryItem> {
		return normalizeItem((await doPost(`${fileBase(hubID, itemID)}/reextract`, {}, options)) as LibraryItem);
	},
	/** Hidden from everyone at once; the server purges it afterwards. */
	remove: (hubID: string, itemID: string) => doDelete(`${base(hubID)}/items/${part(itemID)}`, options) as Promise<{ id: string; status: string }>,
	/** A company owner or admin takes over an item whose owner left. */
	async takeover(hubID: string, itemID: string): Promise<LibraryItem> {
		return normalizeItem((await doPost(`${base(hubID)}/items/${part(itemID)}/takeover`, {}, options)) as LibraryItem);
	},
	usage: (hubID: string) => doGet(`${base(hubID)}/usage`, options) as Promise<LibraryUsage>,
	/**
	 * Downloads an original, after a click, through the request layer like
	 * every other request: its refusals reach the page, and a suspended or
	 * closed company's 423 stops it (company-stop; Codex PC1 review 2 MAJOR 2).
	 * The server checks who may download it, and records every download. The
	 * name is the attachment's own (RFC 5987, else its ASCII form).
	 */
	async download(hubID: string, itemID: string, which: 'published' | 'pending' = 'published'): Promise<{ blob: Blob; fileName: string }> {
		const response = await doGetForResponse(`${fileBase(hubID, itemID)}/download?version=${which}`, options);
		return { blob: await response.blob(), fileName: attachmentName(response.headers.get('Content-Disposition')) };
	}
};

/** The file name a Content-Disposition names: filename*, then filename, else "download". */
export function attachmentName(disposition: string | null): string {
	const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1];
	if (encoded) {
		try {
			const name = decodeURIComponent(encoded.trim());
			if (name && !/[\\/\u0000-\u001f]/.test(name)) return name;
		} catch {
			// Not percent-encoded as it should be: the ASCII form below.
		}
	}
	const plain = /filename="([^"]*)"/i.exec(disposition ?? '')?.[1];
	return plain && !/[\\/]/.test(plain) ? plain : 'download';
}
