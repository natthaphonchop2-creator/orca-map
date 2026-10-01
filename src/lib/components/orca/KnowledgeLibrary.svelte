<script lang="ts">
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { getHttpStatusCode, isAbortError, parseErrorContent } from '$lib/errors';
	import { connectionReady } from '$lib/orca/activation';
	import { aiConnectionAppFor, aiConnectionReaches } from '$lib/orca/ai-connection';
	import { aiConnection } from '$lib/orca/ai-connection.svelte';
	import { currentCompany } from '$lib/orca/company';
	import { term } from '$lib/orca/glossary';
	import {
		accessRequestMessage,
		batchProgress,
		libraryFeatures,
		libraryProblem,
		libraryScope,
		quotaLimit,
		readingFileIDs,
		readingPollDelay,
		refusalCode,
		settleAnswer,
		refusalText,
		uploadBatches,
		uploadFailure,
		uploadProblem,
		uploadRows,
		withReading,
		withoutCreateIntent,
		type LibraryFilter,
		type UploadRow
	} from '$lib/orca/knowledge';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { memberName, orcaError, statusLabels, type OrcaBootstrap, type OrcaMember } from '$lib/services/orca';
	import {
		OrcaLibraryService,
		type LibraryDepartment,
		type LibraryItem,
		type LibraryKind,
		type LibraryUsage
	} from '$lib/services/orca-library';
	import { HubConflictError, hubConflictMessage, joinPatch, saveHubPatch } from '$lib/orca/workspace-edit';
	import { hubWriteService } from '$lib/services/orca-workspaces';
	import { Copy, FolderPlus, Info, SearchX, UserPlus, Users } from '@lucide/svelte';
	import { onDestroy, untrack } from 'svelte';
	import LibraryEditor from './LibraryEditor.svelte';
	import FileDetail from './knowledge/FileDetail.svelte';
	import FileDropZone from './knowledge/FileDropZone.svelte';
	import KnowledgeDetail from './knowledge/KnowledgeDetail.svelte';
	import KnowledgeList from './knowledge/KnowledgeList.svelte';
	import ChoiceTile from './ui/ChoiceTile.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import { copyText } from './ui/copy';
	import { showToast } from './ui/toast-store.svelte';

	// view=knowledge: คลังความรู้ (workspace UX U8, the interim UI of proposal
	// §3.6). Items live in an AI workspace, so the page opens the viewer's
	// workspace by itself, or says in one line what is missing. With knowledge
	// library v2 (the company's `features.libraryV2`, C4 §14m S7) it also takes
	// uploaded files: the page sends them, shows their reading, and asks again
	// while the viewer's own files are still being read.
	let {
		data,
		hubID,
		initialKind,
		initialCreate = false,
		onchanged
	}: {
		data: OrcaBootstrap;
		hubID: string;
		initialKind?: LibraryKind;
		initialCreate?: boolean;
		onchanged: () => Promise<void>;
	} = $props();

	type Screen = { name: 'list' } | { name: 'detail'; id: string } | { name: 'editor'; kind: LibraryKind; id?: string; title?: string };

	// The last workspace chosen here, per company (a convenience only).
	const rememberKey = () => `orca.knowledge.workspace.${currentCompany()}`;
	function readRemembered() {
		try {
			return typeof localStorage === 'undefined' ? '' : (localStorage.getItem(rememberKey()) ?? '');
		} catch {
			return '';
		}
	}
	function remember(id: string) {
		remembered = id;
		try {
			localStorage.setItem(rememberKey(), id);
		} catch {
			// A private window or blocked storage: the page still works.
		}
	}
	let remembered = $state(readRemembered());
	const scope = $derived(
		libraryScope({ hubs: data.hubs, currentUserID: data.currentUserID, canManage: data.canManage, requestedID: hubID || undefined, rememberedID: remembered })
	);
	const hub = $derived(scope.kind === 'hub' ? scope.hub : undefined);
	const features = $derived(libraryFeatures(data));

	let kind = $state<LibraryKind>('knowledge');
	let filter = $state<LibraryFilter>('all');
	let query = $state('');
	let items = $state<LibraryItem[]>([]);
	let members = $state<OrcaMember[]>([]);
	let departments = $state<LibraryDepartment[]>([]);
	let loadedHub = $state('');
	let error = $state('');
	let now = $state(Date.now());
	let screen = $state<Screen>({ name: 'list' });
	let dirty = $state(false);
	let requestNumber = 0;
	// The editor's quiet asks for the files' reading (refreshReading), in order.
	let readingRequest = 0;
	// Bumped whenever the list takes a fresher answer (a load's, a recheck's, a
	// save's, a file action's, a delete's or an upload's). A load or a quiet ask
	// that began before then is older than the list: a load asks again (its answer
	// would drop what came meanwhile), a quiet ask is dropped (Codex S7 sixth and
	// seventh confirmations #2).
	let freshness = 0;
	/** The list took a fresher answer: what began before is older. */
	function fresher() {
		freshness += 1;
	}
	const screenID = (value: Screen) => (value.name === 'list' ? undefined : value.id);
	const selected = $derived.by(() => {
		const id = screenID(screen);
		return id ? items.find((item) => item.id === id) : undefined;
	});
	// Through the company's link, or a sign-in limited to this workspace; not one limited to another (B3 follow-up).
	// For a workspace with its own sign-in the company's link may have used its SSO: counted, not named (Codex reviews 72 and 73).
	const connected = $derived(aiConnectionReaches(aiConnection, hub));
	// "ถามใน Claude": the app whose sign-in reaches this workspace, never another's (Codex reviews 71 and 72).
	const aiApp = $derived(aiConnectionAppFor(aiConnection, hub));

	let contextID = '';
	$effect(() => {
		const id = hub?.id ?? '';
		void data;
		untrack(() => {
			if (id !== contextID) {
				contextID = id;
				stopPolling();
				readingRequest += 1;
				cancelUpload();
				uploads = [];
				uploadNote = '';
				usage = undefined;
				// A workspace opened by itself stays open for this page: a refresh
				// that sorts another first never swaps it under a draft (Codex
				// release review 66). The saved choice is not changed.
				if (id && !hubID) remembered = id;
				requestNumber += 1;
				items = [];
				members = [];
				departments = [];
				loadedHub = '';
				error = '';
				screen = { name: 'list' };
				filter = 'all';
				query = '';
			}
			if (id && !dirty) void load(id);
		});
	});
	// An entry link (…&kind=template&create=1) is an intent, used once.
	const consumed = new Set<string>();
	$effect(() => {
		const id = hub?.id;
		const entryKind = initialKind;
		const create = initialCreate;
		if (!id || !entryKind || loadedHub !== id) return;
		untrack(() => {
			const key = `${id}:${entryKind}:${create}`;
			if (consumed.has(key) || dirty) return;
			consumed.add(key);
			// Files exist only where the company has library v2 (or had it: they stay listed).
			if (entryKind === 'file' && !features.files && !items.some((item) => item.kind === 'file')) return;
			kind = entryKind;
			if (create && entryKind !== 'file') {
				openEditor(entryKind);
				// Used once: a reload or a copied link must not open an empty form again (a duplicate).
				const clean = withoutCreateIntent(page.url);
				try {
					if (clean) replaceState(clean, page.state);
				} catch {
					// Before the router starts: the intent stays in the address.
				}
			}
		});
	});

	/**
	 * Loads the library. `quiet` is the page asking again by itself (its files
	 * being read): a failure that may pass keeps what is shown and asks again
	 * later, a little slower (Codex S7 #9).
	 */
	async function load(id = hub?.id ?? '', quiet = false) {
		if (!id || disposed) return;
		const request = ++requestNumber;
		const seen = freshness;
		if (!quiet) error = '';
		try {
			const result = await OrcaLibraryService.load(id);
			if (request !== requestNumber || disposed) return;
			// A fresher answer came meanwhile (a save, an upload…): this list is older; ask again.
			if (seen !== freshness) {
				void load(id, quiet);
				return;
			}
			// The person began typing while this was on its way: the answer never closes
			// their editor; it brings the files' reading and says what changed (Codex S7 fourth confirmation #2).
			if (applyUnderEditor(result)) return;
			error = '';
			fresher();
			items = result.items;
			members = result.members;
			departments = result.departments;
			loadedHub = id;
			now = Date.now();
			const open = screenID(screen);
			if (open && !result.items.some((item) => item.id === open)) screen = { name: 'list' };
			schedulePoll();
		} catch (cause) {
			if (request !== requestNumber || disposed) return;
			// Older than the list now: its refusal may be too; ask again (Codex S7 eighth confirmation #1).
			if (seen !== freshness) {
				void load(id, quiet);
				return;
			}
			// Access changed: nothing of this library stays on screen.
			const denied = [403, 404].includes(getHttpStatusCode(cause) ?? 0);
			if (quiet && !denied) {
				schedulePoll();
				return;
			}
			if (denied && refuseUnderEditor()) return;
			if (denied) {
				items = [];
				screen = { name: 'list' };
			}
			// Either way the page stops saying "loading" and shows the error.
			loadedHub = id;
			error = denied
				? t('เปิดคลังความรู้ของพื้นที่ทำงานนี้ไม่ได้แล้ว คุณอาจไม่ได้อยู่ในพื้นที่นี้แล้ว หรือพื้นที่นี้ถูกจัดเก็บ', 'This workspace’s knowledge no longer opens for you: you may have left it, or it was archived.')
				: t('โหลดคลังความรู้ไม่สำเร็จ ลองโหลดใหม่อีกครั้ง', 'Knowledge could not be loaded. Try again.');
		}
	}
	/**
	 * After a refused save or preview: does the library still open for me?
	 * 'open' (its items, people and departments are fresh now), 'denied'
	 * (access changed, or the open item is gone) or 'unknown' (no answer).
	 */
	async function recheck(): Promise<'open' | 'denied' | 'unknown'> {
		const id = hub?.id ?? '';
		if (!id) return 'denied';
		const request = ++requestNumber;
		const seen = freshness;
		try {
			const result = await OrcaLibraryService.load(id);
			if (request !== requestNumber || hub?.id !== id) return 'unknown';
			// A fresher list came meanwhile (a delete, a save…): this one is older; check again (Codex S7 eighth confirmation #2).
			if (seen !== freshness) return await recheck();
			const open = screenID(screen);
			if (open && !result.items.some((item) => item.id === open)) return 'denied';
			fresher();
			items = result.items;
			members = result.members;
			departments = result.departments;
			now = Date.now();
			// It may have taken the place of a load the timer started: ask again while files are read (Codex S7 eighth confirmation #3).
			schedulePoll();
			return 'open';
		} catch (cause) {
			// Taken over by a newer request, or another workspace now: this answer says nothing (Codex S7 ninth confirmation #2).
			if (request !== requestNumber || hub?.id !== id || disposed) return 'unknown';
			if (seen !== freshness) return await recheck();
			if ([403, 404].includes(getHttpStatusCode(cause) ?? 0)) return 'denied';
			// A failure that may pass: the asking goes on (it may have taken the timer's load's place; Codex S7 ninth confirmation #3).
			schedulePoll();
			return 'unknown';
		}
	}
	function show(next: Screen) {
		screen = next;
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
	}
	function openEditor(next: LibraryKind, title = '') {
		if (!hub || loadedHub !== hub.id) return;
		// Files are added by uploading them: "เพิ่มไฟล์" opens the file picker.
		if (next === 'file') {
			zone?.pick();
			return;
		}
		show({ name: 'editor', kind: next, title });
	}
	/** An answer for this workspace, with what it leaves out kept or, when that is stale, the item as it was until the library comes again. */
	function settled(answer: LibraryItem): LibraryItem | undefined {
		// An answer for another workspace (the page moved on meanwhile) changes nothing here (Codex S7 confirmation #3).
		if (!hub || (answer.hubID && answer.hubID !== hub.id)) return undefined;
		// Fresher than any load or quiet ask on its way (a reload below starts after it).
		fresher();
		const { item, reload } = settleAnswer(answer, items.find((known) => known.id === answer.id));
		if (reload) void load(hub.id);
		return item;
	}
	function saved(answer: LibraryItem, people: number) {
		const item = settled(answer);
		if (!item) return;
		items = [...items.filter((known) => known.id !== item.id), item];
		kind = item.kind;
		dirty = false;
		show({ name: 'detail', id: item.id });
		// A quiet ask dropped meanwhile leaves no timer: ask again while files are read (Codex S7 seventh confirmation #3).
		schedulePoll();
		if (item.status === 'published')
			showToast(
				hub?.status === 'active'
					? t(`เผยแพร่แล้ว — AI ของ ${people} คนใช้ได้ทันที`, `Published — ${people} people’s AI can use it now`)
					: t('เผยแพร่แล้ว — AI จะใช้ได้เมื่อเปิดใช้งานพื้นที่ทำงานนี้', 'Published — AI can use it once this workspace is active')
			);
		else showToast(t('บันทึกร่างแล้ว — เห็นแค่คุณ', 'Draft saved — only you see it'));
	}
	function archived(answer: LibraryItem) {
		const item = settled(answer);
		if (!item) return;
		items = items.map((known) => (known.id === item.id ? item : known));
		show({ name: 'list' });
		schedulePoll();
		showToast(t('จัดเก็บแล้ว — AI เลิกใช้เรื่องนี้', 'Archived — AI no longer uses it'));
	}
	/** A file action or a takeover answered with the item as it is now. */
	function changed(answer: LibraryItem) {
		const item = settled(answer);
		if (!item) return;
		items = items.some((known) => known.id === item.id) ? items.map((known) => (known.id === item.id ? item : known)) : [...items, item];
		schedulePoll();
	}
	function deleted(item: LibraryItem) {
		fresher();
		items = items.filter((known) => known.id !== item.id);
		schedulePoll();
		show({ name: 'list' });
		showToast(t('ลบแล้ว — AI ของทุกคนหยุดเห็นไฟล์นี้', 'Deleted — nobody’s AI sees it any more'));
		void refreshUsage();
	}

	// ── Files: uploads, the reading, the quota (knowledge library v2) ──
	let zone: { pick: () => void } | undefined = $state();
	let uploads = $state<UploadRow[]>([]);
	let uploading = $state(false);
	let uploadNote = $state('');
	let usage = $state<LibraryUsage>();
	let uploadAbort: AbortController | undefined;
	// The chosen files by row, so "ลองอีกครั้ง" sends the same ones (never reactive).
	let uploadFiles = new Map<string, File>();
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	let pollRound = 0;
	// The page is gone: no answer that comes back after it sets a timer again (Codex S7 #10).
	let disposed = false;
	// A file's new version on its way (FileDetail): leaving the page asks first, as an upload does.
	let replacing = $state(false);
	/** Asks again, a little slower each time, while the viewer's own files are still being read (at most ~20 minutes). */
	function schedulePoll() {
		clearTimeout(pollTimer);
		pollTimer = undefined;
		if (disposed || !hub || !features.files || !readingFileIDs(items).length || pollRound > 60) {
			if (!readingFileIDs(items).length) pollRound = 0;
			return;
		}
		const id = hub.id;
		pollTimer = setTimeout(() => {
			pollTimer = undefined;
			pollRound += 1;
			if (disposed || hub?.id !== id) return;
			// Unsaved text in the editor: only the files' reading is brought in, so a
			// file read meanwhile can be published (Codex S7 #8).
			if (dirty) void refreshReading(id);
			else void load(id, true);
		}, readingPollDelay(pollRound));
	}
	async function refreshReading(id: string) {
		const request = ++readingRequest;
		const seen = freshness;
		try {
			const result = await OrcaLibraryService.load(id);
			if (disposed || request !== readingRequest || hub?.id !== id) return;
			// Older than the list now: dropped, and the asking goes on from the list (Codex S7 seventh confirmation #3).
			if (seen !== freshness) {
				schedulePoll();
				return;
			}
			if (applyUnderEditor(result)) return;
			// The editor closed, or holds nothing unsaved now: the whole answer applies.
			void load(id, true);
			return;
		} catch (cause) {
			// Another workspace's, or an older, answer: nothing of this page's asking changes (Codex S7 second confirmation #3).
			if (disposed || request !== readingRequest || hub?.id !== id) return;
			if (seen !== freshness) {
				schedulePoll();
				return;
			}
			// Access lost: no more asking; the editor keeps its text and says so (Codex S7 third confirmation #9, C4).
			if ([403, 404].includes(getHttpStatusCode(cause) ?? 0) && refuseUnderEditor()) return;
		}
		if (!disposed && hub?.id === id) schedulePoll();
	}
	/** The editor open now, holding unsaved text: its item's ID ('' for a new one), or undefined. */
	function dirtyEditor(): string | undefined {
		return screen.name === 'editor' && dirty ? (screen.id ?? '') : undefined;
	}
	/**
	 * An answer of the library while the editor holds unsaved text: only the
	 * files' reading comes in, and the editor open now (not the one open when
	 * the answer was asked for) says when its item is no longer listed
	 * (Codex S7 fourth confirmation #4). False when no such editor is open.
	 */
	function applyUnderEditor(result: { items: LibraryItem[] }): boolean {
		const editing = dirtyEditor();
		if (editing === undefined) return false;
		fresher();
		items = withReading(items, result.items, editing);
		if (editing && !result.items.some((item) => item.id === editing)) {
			stopPolling();
			editorNote = t('เรื่องนี้ไม่อยู่ในรายการของคุณแล้ว (อาจถูกลบหรือเปลี่ยนสิทธิ์) ข้อความที่พิมพ์ยังอยู่ คัดลอกเก็บไว้ก่อนออก', 'This item is no longer in your list (it may have been deleted, or access changed). Your text is still here: copy it before you leave.');
		} else schedulePoll();
		return true;
	}
	/** A refusal of the library while the editor holds unsaved text: the editor stays and says so. False when no such editor is open. */
	function refuseUnderEditor(): boolean {
		if (dirtyEditor() === undefined) return false;
		stopPolling();
		editorNote = t('เปิดคลังความรู้ของพื้นที่ทำงานนี้ไม่ได้แล้ว ข้อความที่พิมพ์ยังอยู่ คัดลอกเก็บไว้ก่อนออก', 'This workspace’s knowledge no longer opens for you. Your text is still here: copy it before you leave.');
		return true;
	}
	// What the quiet asks under an editor learned; once the editor closes, the library comes again in full.
	let editorNote = $state('');
	$effect(() => {
		const editing = screen.name === 'editor';
		if (editing || !editorNote) return;
		untrack(() => {
			editorNote = '';
			if (hub) void load(hub.id);
		});
	});
	function stopPolling() {
		clearTimeout(pollTimer);
		pollTimer = undefined;
		pollRound = 0;
	}
	function cancelUpload() {
		uploadAbort?.abort();
	}
	onDestroy(() => {
		disposed = true;
		requestNumber += 1;
		readingRequest += 1;
		stopPolling();
		cancelUpload();
	});
	async function refreshUsage(id = hub?.id ?? '') {
		if (!id || !features.files) return;
		try {
			const next = await OrcaLibraryService.usage(id);
			if (hub?.id === id) usage = next;
		} catch {
			// The meter is a convenience: without it the server still refuses what is over the quota.
		}
	}
	$effect(() => {
		const id = hub?.id ?? '';
		if (id && kind === 'file' && features.files && loadedHub === id) untrack(() => void refreshUsage(id));
	});
	$effect(() => {
		// No library v2 and no file left (or the address asked for files without it): back to articles.
		if (kind === 'file' && !features.files && loadedHub === hub?.id && !items.some((item) => item.kind === 'file')) untrack(() => (kind = 'knowledge'));
	});
	function setRow(key: string, change: Partial<UploadRow>) {
		uploads = uploads.map((row) => (row.key === key ? { ...row, ...change } : row));
	}
	/** Sends the files chosen or dropped, in batches the server takes; each file's answer lands on its row. */
	async function upload(files: File[]) {
		if (!hub || uploading || !features.files) return;
		const id = hub.id;
		const rows = uploadRows(files, t);
		uploadFiles = new Map(rows.map((row, index) => [row.key, files[index]]));
		// The day's uploads are used up: nothing is sent.
		if (quotaLimit(usage) === 'uploads')
			for (const row of rows) if (row.state === 'waiting') Object.assign(row, { state: 'refused', reason: 'quota', message: refusalText('quota', t, 'uploads', usage) });
		uploads = rows;
		uploadNote = '';
		await send(id, rows.filter((row) => row.state === 'waiting').map((row) => row.key));
	}
	async function retryUpload() {
		if (!hub || uploading) return;
		const keys = uploads.filter((row) => row.state === 'failed').map((row) => row.key);
		for (const key of keys) setRow(key, { state: 'waiting', progress: 0 });
		uploadNote = '';
		await send(hub.id, keys);
	}
	async function send(id: string, keys: string[]) {
		if (!keys.length) return;
		uploading = true;
		const abort = new AbortController();
		uploadAbort = abort;
		let saved = 0;
		try {
			const sizes = keys.map((key) => uploadFiles.get(key)?.size ?? 0);
			for (const batch of uploadBatches(sizes)) {
				const batchKeys = batch.map((index) => keys[index]);
				const batchFiles = batchKeys.map((key) => uploadFiles.get(key)).filter((file): file is File => !!file);
				for (const key of batchKeys) setRow(key, { state: 'sending', progress: 0 });
				// Once the whole batch is sent the server may store it, answer or not (Codex S7 #5).
				let sent = false;
				try {
					const result = await OrcaLibraryService.upload(id, batchFiles, {
						signal: abort.signal,
						onsent: () => (sent = true),
						onprogress: (loaded, total) => {
							if (total > 0 && loaded >= total) sent = true;
							const shares = batchProgress(batchFiles.map((file) => file.size), loaded, total);
							batchKeys.forEach((key, index) => setRow(key, { progress: shares[index] }));
						}
					});
					// One answer per file, in the order sent.
					batchKeys.forEach((key, index) => {
						const answer = result.files[index];
						if (answer?.item) {
							saved += 1;
							setRow(key, { state: 'saved', progress: 1, itemID: answer.item.id });
							if (hub?.id === id) {
								fresher();
								items = [...items.filter((known) => known.id !== answer.item!.id), answer.item];
							}
						} else {
							const reason = refusalCode(answer?.error);
							setRow(key, { state: 'refused', reason, message: refusalText(reason, t, quotaLimit(usage), usage) });
						}
					});
				} catch (cause) {
					const aborted = isAbortError(cause);
					const problem = aborted ? { status: 0, message: '' } : parseErrorContent(cause);
					const failure = uploadFailure({ sent, aborted, network: cause instanceof TypeError, status: problem.status, message: problem.message });
					// Sent in full and not refused before storing: the files may be stored. They
					// are not sent again; the list says what is there.
					if (failure.outcome === 'unknown') {
						for (const key of batchKeys) setRow(key, { state: 'unknown', progress: 1 });
						uploadNote = t('ส่งไฟล์ครบแล้วแต่ไม่ได้รับคำตอบ ORCA อาจบันทึกไว้แล้ว ดูในรายการก่อนส่งซ้ำ', 'The files were sent but no answer came back. ORCA may have saved them: check the list before sending them again.');
					}
					if (failure.reload && hub?.id === id) void load(id);
					if (aborted) {
						for (const row of uploads) if (row.state === 'sending' || row.state === 'waiting') setRow(row.key, { state: 'cancelled', progress: 0 });
						return;
					}
					const reason = failure.reason;
					// Every file of this upload was refused for one reason; the rest wait for "ลองอีกครั้ง".
					if (failure.outcome === 'refused' && reason) {
						if (reason === 'quota') await refreshUsage(id);
						for (const key of batchKeys) setRow(key, { state: 'refused', reason, message: refusalText(reason, t, quotaLimit(usage), usage) });
						continue;
					}
					if (problem.status === 409 && /library_quota/.test(problem.message)) await refreshUsage(id);
					if (!uploadNote) uploadNote = uploadProblem(cause instanceof TypeError ? { status: 0, message: '' } : problem, t, usage);
					for (const row of uploads) if (row.state === 'sending' || row.state === 'waiting') setRow(row.key, { state: 'failed', progress: 0 });
					if ([403, 404].includes(problem.status) && !/library_files_disabled/.test(problem.message)) void recheck();
					return;
				}
			}
		} finally {
			if (uploadAbort === abort) uploadAbort = undefined;
			uploading = false;
			if (saved && hub?.id === id) {
				showToast(t(`อัปโหลดแล้ว ${saved} ไฟล์ ORCA กำลังอ่าน`, `${saved} ${saved === 1 ? 'file' : 'files'} uploaded; ORCA is reading them`));
				kind = 'file';
				void refreshUsage(id);
				schedulePoll();
			}
		}
	}
	function denied() {
		dirty = false;
		show({ name: 'list' });
		void load();
	}
	function chooseWorkspace(id: string) {
		remember(id);
		void goto(localeHref(`/app?view=knowledge&hub=${encodeURIComponent(id)}`));
	}

	// Leaving with unsaved text asks first.
	let leaveOpen = $state(false);
	let leaveTo: URL | undefined;
	let leaving = false;
	beforeNavigate((navigation) => {
		if (leaving || !(dirty || uploading || replacing)) return;
		navigation.cancel();
		if (navigation.type === 'leave') return;
		leaveTo = navigation.to?.url;
		leaveOpen = true;
	});
	async function leave() {
		leaveOpen = false;
		dirty = false;
		// Files not sent yet are not saved: the upload stops here.
		cancelUpload();
		const target = leaveTo;
		leaveTo = undefined;
		if (!target) return;
		leaving = true;
		try {
			await goto(target.pathname + target.search + target.hash);
		} finally {
			leaving = false;
		}
	}

	// ── Prerequisite states: one line and one button ──
	const readyConnections = $derived(data.connections.filter(connectionReady));
	const createHref = $derived(
		localeHref(`/app?view=new${readyConnections.length === 1 ? `&connection=${encodeURIComponent(readyConnections[0].id)}` : ''}`)
	);
	let joinChoice = $state('');
	let joining = $state(false);
	let joinError = $state('');
	let joinProblem = $state<'' | 'conflict' | 'invalid'>('');
	const joinHubs = $derived(scope.kind === 'join' ? scope.hubs : []);
	// Several workspaces: the first (active ones first) is chosen until another is.
	const joinTarget = $derived(joinHubs.some((item) => item.id === joinChoice) ? joinChoice : (joinHubs[0]?.id ?? ''));
	async function join() {
		const id = joinTarget;
		if (!id || joining || !data.canManage) return;
		joining = true;
		joinError = '';
		joinProblem = '';
		try {
			// "เพิ่มฉันเลย": a fresh read, then the whole workspace back with its version (critique 2).
			const saved = await saveHubPatch(id, (fresh) => joinPatch(fresh, data.currentUserID), hubWriteService);
			remember(id);
			await onchanged();
			showToast(t(`เพิ่มคุณในพื้นที่ทำงาน ${saved.name} แล้ว`, `You were added to ${saved.name}`));
		} catch (cause) {
			const code = cause instanceof HubConflictError ? 409 : getHttpStatusCode(cause);
			joinProblem = code === 409 || code === 404 ? 'conflict' : code === 400 ? 'invalid' : '';
			joinError = joinMessage(code, cause);
		} finally {
			joining = false;
		}
	}
	function joinMessage(code: number | undefined, cause: unknown) {
		if (code === 409) return hubConflictMessage(t);
		if (code === 404) return t('ไม่พบพื้นที่ทำงานนี้แล้ว โหลดใหม่แล้วลองอีกครั้ง', 'This workspace is gone. Reload and try again.');
		if (code === 400) return t('เพิ่มไม่ได้ เพราะพื้นที่ทำงานนี้ต้องแก้การตั้งค่าก่อน', 'Can’t add you: this workspace’s settings need fixing first.');
		return libraryProblem(parseErrorContent(cause), t) ?? orcaError(cause);
	}
	async function reloadAfterConflict() {
		joinError = '';
		joinProblem = '';
		await onchanged();
	}
	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	const requestText = $derived(
		accessRequestMessage(
			me ? (me.email && memberName(me) !== me.email ? `${memberName(me)} (${me.email})` : memberName(me)) : t('ฉัน', 'me'),
			data.organization.displayName,
			t
		)
	);
	async function copyRequest() {
		const ok = await copyText(requestText, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		showToast(
			ok ? t('คัดลอกแล้ว ส่งให้ผู้ดูแลบริษัทได้เลย', 'Copied. Send it to a company admin.') : t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.'),
			ok ? {} : { tone: 'error' }
		);
	}
</script>

<div class="kn-page">
	{#if scope.kind !== 'hub'}
		<PageHeader title={term('knowledge', t)} subtitle={t('ข้อมูลที่ AI ของทีมใช้ตอบคำถาม', 'What your team’s AI answers from')} />
		<section class="gate" class:several={scope.kind === 'join' && joinHubs.length > 1}>
			<span class="gate-ic" aria-hidden="true">
				{#if scope.kind === 'create'}<FolderPlus size={20} />{:else if scope.kind === 'join'}<UserPlus size={20} />{:else if scope.kind === 'request'}<Users size={20} />{:else}<SearchX size={20} />{/if}
			</span>
			<div class="gate-copy">
				{#if scope.kind === 'create'}
					<p class="gate-line">{t('ต้องมีพื้นที่ทำงาน AI ก่อน', 'You need an AI workspace first')}</p>
				{:else if scope.kind === 'join'}
					<p class="gate-line">
						{joinHubs.length === 1
							? t(`คุณยังไม่ได้อยู่ในพื้นที่ทำงาน ${joinHubs[0].name}`, `You’re not in ${joinHubs[0].name} yet`)
							: t('คุณยังไม่ได้อยู่ในพื้นที่ทำงาน AI ไหนเลย เลือกพื้นที่ที่จะใช้คลังความรู้', 'You’re not in any AI workspace. Choose one for your knowledge.')}
					</p>
				{:else if scope.kind === 'request'}
					<p class="gate-line">{t('คุณยังไม่มีสิทธิ์ใช้คลังความรู้ ขอให้ผู้ดูแลบริษัทเพิ่มคุณในพื้นที่ทำงาน AI', 'You can’t use Knowledge yet. Ask a company admin to add you to an AI workspace.')}</p>
				{:else}
					<p class="gate-line">{t('ไม่พบพื้นที่ทำงานนี้ หรือคุณไม่ได้อยู่ในพื้นที่นี้', 'This workspace isn’t there, or you’re not in it')}</p>
				{/if}
			</div>
			{#if scope.kind === 'join' && joinHubs.length > 1}
				<div class="gate-choices" role="radiogroup" aria-label={t('พื้นที่ทำงาน AI', 'AI workspaces')}>
					{#each joinHubs as choice (choice.id)}
						<ChoiceTile
							name="kn-join"
							value={choice.id}
							selected={joinTarget}
							onselect={(value) => (joinChoice = value)}
							title={choice.name}
							description={choice.description}
							badge={choice.status === 'active' ? '' : statusLabels[choice.status]}
							disabled={joining}
						/>
					{/each}
				</div>
			{/if}
			{#if scope.kind === 'join' && scope.mine?.length}
				<!-- Someone else's workspace: the ones they are in stay one click away. -->
				<p class="gate-switch">
					{t('หรือเปิดคลังความรู้ของพื้นที่ที่คุณอยู่:', 'Or open the knowledge of a workspace you are in:')}
					{#each scope.mine as choice, index (choice.id)}{#if index},{/if} <a href={localeHref(`/app?view=knowledge&hub=${encodeURIComponent(choice.id)}`)}>{choice.name}</a>{/each}
				</p>
			{/if}
			{#if joinError}
				<p class="gate-error" role="alert">
					<Info size={16} aria-hidden="true" /><span>{joinError}</span>
					{#if joinProblem === 'conflict'}<button type="button" class="k-button small" onclick={reloadAfterConflict}>{t('โหลดใหม่', 'Reload')}</button>
					{:else if joinProblem === 'invalid'}<a class="k-button small" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(joinTarget)}`)}>{t('เปิดพื้นที่ทำงาน', 'Open workspace')}</a>{/if}
				</p>
			{/if}
			<div class="gate-action">
				{#if scope.kind === 'create'}
					{#if data.canManage}<a class="k-button primary" href={createHref}>{t('สร้างพื้นที่ทำงาน', 'Create a workspace')}</a>{/if}
				{:else if scope.kind === 'join'}
					<button type="button" class="k-button primary" disabled={joining || !joinTarget} aria-busy={joining} onclick={join}>
						<UserPlus size={16} aria-hidden="true" />{joining ? t('กำลังเพิ่ม…', 'Adding…') : t('เพิ่มฉันเลย', 'Add me')}
					</button>
				{:else if scope.kind === 'request'}
					<button type="button" class="k-button primary" onclick={copyRequest}><Copy size={16} aria-hidden="true" />{t('คัดลอกข้อความขอสิทธิ์', 'Copy an access request')}</button>
				{:else}
					<a class="k-button primary" href={localeHref('/app?view=knowledge')}>{t('เปิดคลังความรู้', 'Open Knowledge')}</a>
				{/if}
			</div>
		</section>
	{:else if screen.name === 'editor' && loadedHub === hub!.id}
		{#if editorNote}<p class="editor-note" role="alert"><Info size={16} aria-hidden="true" /><span>{editorNote}</span></p>{/if}
		{#key `${screen.kind}:${screen.id ?? 'new'}`}
			<LibraryEditor
				hub={hub!}
				kind={screen.kind}
				{features}
				existing={selected}
				initialTitle={screen.title}
				{items}
				{members}
				{departments}
				currentUserID={data.currentUserID}
				{now}
				onsaved={saved}
				onclose={() => {
					dirty = false;
					show(selected ? { name: 'detail', id: selected.id } : { name: 'list' });
				}}
				ondenied={denied}
				onrecheck={recheck}
				ondirty={(value) => (dirty = value)}
			/>
		{/key}
	{:else if screen.name === 'detail' && selected}
		{#key selected.id}
			{#if selected.kind === 'file'}
				<FileDetail
					hub={hub!}
					item={selected}
					{members}
					{departments}
					currentUserID={data.currentUserID}
					canManage={data.canManage}
					{features}
					{now}
					{connected}
					app={aiApp}
					onback={() => show({ name: 'list' })}
					onedit={() => show({ name: 'editor', kind: 'file', id: selected!.id })}
					onchanged={changed}
					onarchived={archived}
					ondeleted={deleted}
					ondenied={denied}
					onuploading={(busy) => (replacing = busy)}
				/>
			{:else}
				<KnowledgeDetail
					hub={hub!}
					item={selected}
					{items}
					{members}
					{departments}
					currentUserID={data.currentUserID}
					canManage={data.canManage}
					{features}
					{now}
					{connected}
					app={aiApp}
					onback={() => show({ name: 'list' })}
					onedit={() => show({ name: 'editor', kind: selected!.kind, id: selected!.id })}
					onarchived={archived}
					onchanged={changed}
					ondenied={denied}
					onrecheck={recheck}
				/>
			{/if}
		{/key}
	{:else}
		<KnowledgeList
			hub={hub!}
			choices={scope.kind === 'hub' ? scope.choices : []}
			{items}
			{departments}
			{members}
			currentUserID={data.currentUserID}
			canManage={data.canManage}
			bind:kind
			bind:filter
			bind:query
			loaded={loadedHub === hub!.id}
			{error}
			{connected}
			app={aiApp}
			{now}
			{features}
			{usage}
			fileZone={features.files ? fileZone : undefined}
			onchoose={chooseWorkspace}
			oncreate={(next, title) => openEditor(next, title)}
			onopen={(item) => show({ name: 'detail', id: item.id })}
			onreload={() => load()}
		/>
	{/if}
</div>

{#snippet fileZone()}
	<FileDropZone
		bind:this={zone}
		rows={uploads}
		busy={uploading}
		problem={uploadNote}
		disabled={loadedHub !== hub?.id}
		onfiles={(files) => void upload(files)}
		oncancel={cancelUpload}
		onclear={() => {
			uploads = [];
			uploadNote = '';
		}}
		onretry={() => void retryUpload()}
		onopen={(id) => show({ name: 'detail', id })}
	/>
{/snippet}

<ConfirmDialog
	bind:open={leaveOpen}
	title={t('ออกโดยไม่บันทึก?', 'Leave without saving?')}
	message={uploading || replacing
		? t('กำลังอัปโหลดไฟล์ ถ้าออกตอนนี้ ไฟล์ที่ยังส่งไม่เสร็จจะไม่ถูกบันทึก', 'Files are uploading. If you leave now, the ones not sent yet are not saved.')
		: t('สิ่งที่แก้ไว้ในหน้านี้จะหายไป', 'What you changed here will be lost.')}
	confirmLabel={t('ออกโดยไม่บันทึก', 'Leave without saving')}
	cancelLabel={t('แก้ต่อ', 'Keep editing')}
	tone="danger"
	onconfirm={leave}
	oncancel={() => (leaveTo = undefined)}
/>

<style>
	.editor-note {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 16px;
		padding: 10px 14px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.55;
	}
	.editor-note :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--orca-deny);
	}
	.gate {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px 16px;
		padding: 20px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.gate-ic {
		display: grid;
		flex: none;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 11px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.gate-copy {
		flex: 1 1 280px;
		min-width: 0;
	}
	.gate-line {
		margin: 0;
		color: var(--orca-ink);
		font-size: 15.5px;
		font-weight: 600;
		line-height: 1.55;
	}
	.gate-action {
		flex: none;
	}
	.gate-action :global(.k-button) {
		min-height: 42px;
		padding: 0 18px;
		font-weight: 600;
	}
	.gate.several .gate-action {
		flex-basis: 100%;
		display: flex;
		justify-content: flex-end;
	}
	.gate-choices {
		display: grid;
		flex-basis: 100%;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 10px;
	}
	.gate-switch {
		order: 4;
		flex-basis: 100%;
		margin: 0;
		padding-top: 12px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.gate-switch a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.gate-error {
		order: 3;
		display: flex;
		flex-basis: 100%;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin: 0;
		padding: 10px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 14px;
	}
	.gate-error :global(svg) {
		flex: none;
		color: var(--orca-deny);
	}
	.gate-error span {
		flex: 1 1 220px;
	}
	@media (max-width: 720px) {
		.gate {
			align-items: flex-start;
			padding: 18px 16px;
		}
		.gate-action {
			flex-basis: 100%;
		}
		.gate-action :global(.k-button) {
			width: 100%;
			justify-content: center;
		}
	}
</style>
