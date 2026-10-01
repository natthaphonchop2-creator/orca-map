<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Archive, ArrowLeft, Download, FileUp, Info, Pencil, RotateCw, Trash2, TriangleAlert } from '@lucide/svelte';
	import { getHttpStatusCode, isAbortError, parseErrorContent } from '$lib/errors';
	import { term } from '$lib/orca/glossary';
	import {
		canReadAgain,
		canTakeOver,
		classifyFile,
		encodingNote,
		factLine,
		FILE_ACCEPT,
		failureText,
		fileActionProblem,
		fileExtent,
		fileReading,
		fileServable,
		fileTypeLabel,
		formatBytes,
		hiddenLines,
		libraryInput,
		partialText,
		readingLabel,
		refusalCode,
		refusalText,
		relativeTime,
		uploadProblem,
		versionServable,
		type LibraryFeatures
	} from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import { orcaError, type OrcaHub, type OrcaMember } from '$lib/services/orca';
	import {
		OrcaLibraryService,
		type LibraryDepartment,
		type LibraryFileOptions,
		type LibraryItem,
		type LibraryReadParts
	} from '$lib/services/orca-library';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import Switch from '../ui/Switch.svelte';
	import FilePreview from './FilePreview.svelte';
	import KnowledgeRail from './KnowledgeRail.svelte';
	import TakeoverCard from './TakeoverCard.svelte';
	import WhoCard from './WhoCard.svelte';

	// One uploaded file (knowledge library v2, C4 §14m S7): how its reading
	// went, "สิ่งที่ AI จะเห็น" page by page, its hidden parts, who can use it,
	// and for its owner the switches, a new version, reading it again,
	// download, archive and delete. A manager may take it over once its owner
	// left. Every action is the server's to allow.
	let {
		hub,
		item,
		members,
		departments,
		currentUserID,
		canManage = false,
		features,
		now = Date.now(),
		connected = false,
		app = '',
		onback,
		onedit,
		onchanged,
		onarchived,
		ondeleted,
		ondenied,
		onuploading
	}: {
		hub: OrcaHub;
		item: LibraryItem;
		/** The workspace's members, as the library lists them. */
		members: OrcaMember[];
		departments: LibraryDepartment[];
		currentUserID: string;
		canManage?: boolean;
		features: LibraryFeatures;
		now?: number;
		connected?: boolean;
		app?: string;
		onback: () => void;
		/** The editor: title, short description, who can use it, publish. */
		onedit: () => void;
		/** A file action answered with the item as it is now. */
		onchanged: (item: LibraryItem) => void;
		onarchived: (item: LibraryItem) => void;
		ondeleted: (item: LibraryItem) => void;
		ondenied: () => void;
		/** A new version is on its way (true) or done (false): the page asks before it is left. */
		onuploading?: (busy: boolean) => void;
	} = $props();

	const file = $derived(item.file);
	const owner = $derived(item.canEdit);
	// With library v2 off (after a rollback) a file is still shown, downloaded,
	// archived and deleted; what needs the flag (settings, a new version,
	// reading again, a takeover) is not offered.
	const manage = $derived(owner && features.files);
	// "AI ใช้ได้" only when the AI can: file Knowledge on and the workspace active (Codex S7 #11).
	const aiUses = $derived(features.files && hub.status === 'active');
	// A draft, or a file the AI does not use now, serves no one: its notes never
	// say what "the AI keeps using" (Codex S7 confirmation #5).
	const live = $derived(item.status === 'published' && aiUses);
	const published = $derived(file?.published);
	const pending = $derived(owner ? file?.pending : undefined);
	/** The version shown first: the published one once it serves, else the owner's newer one. */
	const current = $derived(versionServable(published) ? published : (pending ?? published));
	const reading = $derived(fileReading(current));
	const servable = $derived(fileServable(file));
	// A newer version the owner checks before it serves ("ต้องตรวจก่อนอัปเดต").
	const held = $derived(!!pending && servable && versionServable(pending));
	let which = $state<'published' | 'pending'>('published');
	const previewVersion = $derived(which === 'pending' && held ? pending : versionServable(published) ? published : undefined);
	const options = $derived<LibraryFileOptions | undefined>(manage ? file?.options : undefined);
	// The parts hidden in the version shown, against what the owner chose now.
	// Only while the owner can switch them: after a rollback the AI uses no file at all.
	// A newer version held for review serves no one yet: its tab says what the AI will see (Codex S7 third confirmation #3).
	const previewLive = $derived(live && !(which === 'pending' && held));
	const lines = $derived(manage ? hiddenLines(previewVersion ?? current, t, options, previewLive) : []);
	const encoding = $derived(owner ? encodingNote((previewVersion ?? current)?.stats, t) : undefined);
	const offered = $derived.by(() => {
		const parts = new Set(lines.map((line) => line.option).filter(Boolean));
		const on = (key: keyof LibraryReadParts) => parts.has(key) || options?.[key] === true;
		return { includeNotes: on('includeNotes'), includeHidden: on('includeHidden'), includeComments: on('includeComments') };
	});
	const downloadable = $derived(!!file && (owner || (file.allowDownload && servable)));
	// The owner takes the version shown (the published one, or a first one still pending); readers the published one.
	const downloadWhich = $derived<'published' | 'pending'>(owner && !published && pending ? 'pending' : 'published');
	const takeover = $derived(canTakeOver(item, { files: features.files, canManage, me: currentUserID, workspaceMembers: members }));
	const typeLabel = $derived(fileTypeLabel(file?.ext ?? '', t));
	const failedCard = $derived(!servable && reading === 'failed');
	const switches = $derived(!!options && (offered.includeNotes || offered.includeHidden || offered.includeComments));
	const fileFacts = $derived(factLine([typeLabel, formatBytes(file?.bytes ?? 0), current && t(`ฉบับที่ ${current.version}`, `Version ${current.version}`)]));
	// Someone the workspace no longer lists is not "สมาชิกพื้นที่ทำงาน": the owner left (the takeover card says what to do).
	const ownerName = $derived.by(() => {
		const member = members.find((entry) => entry.id === item.ownerID);
		return member ? member.displayName || member.email : t('ไม่อยู่ในพื้นที่ทำงานนี้แล้ว', 'No longer in this workspace');
	});
	let leaveOpen = $state(false);
	/** Back to the list, asking first while a new version is on its way (Codex S7 #7). */
	function back() {
		if (busy === 'replace') leaveOpen = true;
		else onback();
	}

	let busy = $state<'' | 'reextract' | 'publish' | 'options' | 'archive' | 'delete' | 'replace'>('');
	let actionError = $state('');
	let deleteOpen = $state(false);
	let archiveOpen = $state(false);
	let replaceInput: HTMLInputElement | undefined = $state();
	let replaceProgress = $state(0);
	let replaceName = $state('');
	let replaceAbort: AbortController | undefined;
	// Gone (the page moved on): an action's late answer changes nothing of the
	// page now, not even the screen (Codex S7 second confirmation #2).
	let gone = false;
	const tell = {
		changed: (next: LibraryItem) => !gone && onchanged(next),
		archived: (next: LibraryItem) => !gone && onarchived(next),
		deleted: (next: LibraryItem) => !gone && ondeleted(next),
		denied: () => !gone && ondenied()
	};
	onDestroy(() => {
		gone = true;
		replaceAbort?.abort();
		onuploading?.(false);
	});

	function denied(cause: unknown) {
		const code = getHttpStatusCode(cause);
		if (code === 403 || code === 404) {
			tell.denied();
			return true;
		}
		return false;
	}
	function problem(cause: unknown) {
		return fileActionProblem(parseErrorContent(cause), t) ?? orcaError(cause);
	}
	async function readAgain() {
		if (busy) return;
		busy = 'reextract';
		actionError = '';
		try {
			tell.changed(await OrcaLibraryService.reextract(hub.id, item.id));
		} catch (cause) {
			if (!denied(cause)) actionError = problem(cause);
		} finally {
			busy = '';
		}
	}
	async function publishPending() {
		if (busy) return;
		busy = 'publish';
		actionError = '';
		try {
			const next = await OrcaLibraryService.publishPending(hub.id, item.id);
			which = 'published';
			tell.changed(next);
		} catch (cause) {
			if (!denied(cause)) actionError = problem(cause);
		} finally {
			busy = '';
		}
	}
	async function setOption(key: keyof LibraryFileOptions, value: boolean) {
		if (busy || !options) return;
		busy = 'options';
		actionError = '';
		try {
			tell.changed(await OrcaLibraryService.setOptions(hub.id, item.id, { ...options, [key]: value }));
		} catch (cause) {
			if (!denied(cause)) actionError = problem(cause);
		} finally {
			busy = '';
		}
	}
	async function replace(list: FileList | null) {
		const chosen = list?.[0];
		if (!chosen || busy) return;
		actionError = '';
		const verdict = classifyFile(chosen.name, chosen.size);
		if (!verdict.ok) {
			actionError = refusalText(verdict.reason, t);
			return;
		}
		busy = 'replace';
		replaceName = chosen.name;
		replaceProgress = 0;
		replaceAbort = new AbortController();
		onuploading?.(true);
		// Once the whole file is sent the server may store it, answer or not (Codex S7 #5).
		let sent = false;
		try {
			const result = await OrcaLibraryService.replace(hub.id, item.id, chosen, {
				signal: replaceAbort.signal,
				onsent: () => (sent = true),
				onprogress: (loaded, total) => {
					if (total > 0 && loaded >= total) sent = true;
					replaceProgress = total > 0 ? Math.min(1, loaded / total) : 0;
				}
			});
			const answer = result.files[0];
			if (answer?.item) tell.changed(answer.item);
			else actionError = refusalText(refusalCode(answer?.error), t);
		} catch (cause) {
			const aborted = isAbortError(cause);
			const status = aborted ? 0 : (getHttpStatusCode(cause) ?? parseErrorContent(cause).status);
			if (sent && (aborted || cause instanceof TypeError || status >= 500)) {
				actionError = t('ส่งฉบับใหม่ครบแล้วแต่ไม่ได้รับคำตอบ ORCA อาจบันทึกไว้แล้ว ดูสถานะของไฟล์ก่อนส่งซ้ำ', 'The new version was sent but no answer came back. ORCA may have saved it: check the file before sending it again.');
				void refresh();
			} else if (aborted) actionError = t('ยกเลิกการอัปโหลดแล้ว', 'The upload was cancelled');
			else if (!denied(cause)) actionError = uploadProblem(parseErrorContent(cause), t);
		} finally {
			busy = '';
			replaceAbort = undefined;
			onuploading?.(false);
		}
	}
	/** The file as the server has it now (after an answer that did not come). */
	async function refresh() {
		try {
			tell.changed((await OrcaLibraryService.file(hub.id, item.id)).item);
		} catch (cause) {
			denied(cause);
		}
	}
	async function archive() {
		if (busy || !owner) return;
		busy = 'archive';
		actionError = '';
		try {
			const saved = await OrcaLibraryService.save(hub.id, libraryInput(item, { status: 'archived' }, features), item.id);
			archiveOpen = false;
			tell.archived(saved);
		} catch (cause) {
			archiveOpen = false;
			if (!denied(cause)) actionError = getHttpStatusCode(cause) === 409 ? t('มีคนแก้ไฟล์นี้พร้อมกัน โหลดใหม่แล้วลองอีกครั้ง', 'Someone changed this file at the same time. Reload and try again.') : problem(cause);
		} finally {
			busy = '';
		}
	}
	async function remove() {
		if (busy || !owner) return;
		busy = 'delete';
		actionError = '';
		try {
			await OrcaLibraryService.remove(hub.id, item.id);
			deleteOpen = false;
			tell.deleted(item);
		} catch (cause) {
			deleteOpen = false;
			if (!denied(cause)) actionError = problem(cause);
		} finally {
			busy = '';
		}
	}
</script>

<div class="kd fd">
	<button type="button" class="kn-back" onclick={back}><ArrowLeft size={15} aria-hidden="true" />{term('knowledge', t)} · {hub.name}</button>
	<header class="kd-head">
		<div class="kd-title">
			<h1>{item.title}</h1>
			<p class="kd-meta">
				<span class="kd-status" class:draft={servable ? item.status === 'draft' : reading !== 'failed'}>
					{#if item.status === 'archived'}<StatusPill label={t('จัดเก็บแล้ว', 'Archived')} />
					{:else if !servable && reading === 'failed'}<StatusPill label={readingLabel('failed', t)} dot dotTone="deny" />
					{:else if !servable}<StatusPill label={readingLabel('reading', t)} dot />
					{:else if item.status === 'published' && !aiUses}<StatusPill label={t('เผยแพร่แล้ว', 'Published')} dot />
					{:else if item.status === 'published'}<StatusPill label={t('AI ใช้ได้', 'AI can use')} tone="ok" dot />
					{:else}<StatusPill label={t('ฉบับร่าง', 'Draft')} dot />{/if}
				</span>
				<span>{t(`ไฟล์ ${typeLabel}`, `${typeLabel} file`)}</span>
				<span>{t('เจ้าของ', 'Owner')} {item.ownerID === currentUserID ? t('คุณ', 'You') : ownerName}</span>
				<span>{t('อัปเดต', 'Updated')} {relativeTime(item.updatedAt, now, t)}</span>
			</p>
		</div>
		{#if owner}
			<div class="kd-actions">
				{#if item.status !== 'archived'}<button type="button" class="k-button" disabled={!!busy} onclick={() => (archiveOpen = true)}><Archive size={16} aria-hidden="true" />{t('จัดเก็บ', 'Archive')}</button>{/if}
				<button type="button" class="k-button danger-outline" disabled={!!busy} onclick={() => (deleteOpen = true)}><Trash2 size={16} aria-hidden="true" />{t('ลบ', 'Delete')}</button>
				<!-- While file Knowledge is off a file is opened, downloaded, archived and deleted only (Codex S7 #4). -->
				{#if manage}<button type="button" class="k-button primary" disabled={!!busy} onclick={onedit}
					><Pencil size={16} aria-hidden="true" />{item.status === 'archived'
						? t('แก้ไขและนำกลับมาใช้', 'Edit and restore')
						: item.status === 'draft' && servable
							? t('ตั้งค่าและเผยแพร่', 'Set up and publish')
							: t('แก้ไข', 'Edit')}</button
				>{/if}
			</div>
		{/if}
	</header>

	{#if actionError}<p class="fd-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" /><span>{actionError}</span></p>{/if}

	<div class="kd-grid">
		<div class="kd-main">
			{#if item.summary}<p class="kd-summary">{item.summary}</p>{/if}

			{#if !servable && reading === 'reading'}
				<section class="fd-state" aria-live="polite">
					<h2>{t('กำลังอ่านไฟล์', 'Reading the file')}</h2>
					<p>{t('ORCA กำลังอ่านข้อความในไฟล์นี้ ใช้เวลาไม่กี่วินาทีถึงไม่กี่นาที หน้านี้อัปเดตเอง', 'ORCA is reading the text in this file. It takes seconds to minutes; this page updates itself.')}</p>
				</section>
			{:else if !servable && reading === 'failed' && current}
				<section class="fd-state failed" role="status">
					<h2><i class="fd-dot" aria-hidden="true"></i>{t('อ่านไฟล์นี้ไม่ได้', 'This file can’t be read')}</h2>
					<p>{failureText(current, t)}</p>
					{#if manage}
						<div class="fd-state-actions">
							{#if canReadAgain(file)}<button type="button" class="k-button" disabled={!!busy} onclick={readAgain}><RotateCw size={15} aria-hidden="true" />{busy === 'reextract' ? t('กำลังสั่งอ่าน…', 'Starting…') : t('อ่านไฟล์ใหม่', 'Read again')}</button>{/if}
							<button type="button" class="k-button" disabled={!!busy} onclick={() => replaceInput?.click()}><FileUp size={15} aria-hidden="true" />{t('อัปโหลดฉบับใหม่', 'Upload a new version')}</button>
						</div>
					{/if}
				</section>
			{/if}

			{#if manage && pending && servable}
				{#if fileReading(pending) === 'reading'}
					<p class="fd-note" aria-live="polite"><Info size={15} aria-hidden="true" /><span>{live
								? t(`กำลังอ่านฉบับใหม่ (ฉบับที่ ${pending.version}) AI ใช้ฉบับเดิมจนกว่าจะอ่านเสร็จ`, `Reading the new version (version ${pending.version}). The AI keeps the current one until it is read.`)
								: t(`กำลังอ่านฉบับใหม่ (ฉบับที่ ${pending.version}) ด้านล่างยังเป็นฉบับเดิมจนกว่าจะอ่านเสร็จ`, `Reading the new version (version ${pending.version}). Below is the current one until it is read.`)}</span></p>
				{:else if fileReading(pending) === 'failed'}
					<div class="fd-note warn">
						<TriangleAlert size={15} aria-hidden="true" />
						<span>{live
								? t(`ฉบับใหม่ (ฉบับที่ ${pending.version}) อ่านไม่ได้: ${failureText(pending, t)} AI ยังใช้ฉบับเดิม`, `The new version (version ${pending.version}) can’t be read: ${failureText(pending, t)} The AI keeps the current one.`)
								: t(`ฉบับใหม่ (ฉบับที่ ${pending.version}) อ่านไม่ได้: ${failureText(pending, t)} ไฟล์นี้ยังเป็นฉบับเดิม`, `The new version (version ${pending.version}) can’t be read: ${failureText(pending, t)} The file stays as it was.`)}</span>
						{#if canReadAgain(file)}<button type="button" class="k-button small" disabled={!!busy} onclick={readAgain}>{t('อ่านไฟล์ใหม่', 'Read again')}</button>{/if}
					</div>
				{:else if held}
					<div class="fd-note held">
						<Info size={15} aria-hidden="true" />
						<span>{t(`ฉบับใหม่ (ฉบับที่ ${pending.version}) อ่านเสร็จแล้ว รอคุณตรวจก่อนให้ AI ใช้`, `The new version (version ${pending.version}) is read and waits for your check before the AI uses it.`)}</span>
						{#if which !== 'pending'}<button type="button" class="k-button small" onclick={() => (which = 'pending')}>{t('ดูฉบับใหม่', 'See it')}</button>{/if}
						<button type="button" class="k-button small primary" disabled={!!busy} aria-busy={busy === 'publish'} onclick={publishPending}>{busy === 'publish' ? t('กำลังเปลี่ยน…', 'Switching…') : t('ใช้ฉบับใหม่', 'Use the new version')}</button>
					</div>
				{/if}
			{/if}

			<!-- The version shown, the held one too, before it is put in use (Codex S7 third confirmation #2). -->
			{#if previewVersion?.state === 'partial'}
				<p class="fd-note warn"><TriangleAlert size={15} aria-hidden="true" /><span>{t('อ่านได้บางส่วน:', 'Partly read:')} {partialText(previewVersion.stats?.partialReason || previewVersion.errorClass, t, previewLive)}</span></p>
			{/if}
			{#if encoding}
				<p class="fd-note" class:warn={encoding.tone === 'warn'}>{#if encoding.tone === 'warn'}<TriangleAlert size={15} aria-hidden="true" />{:else}<Info size={15} aria-hidden="true" />{/if}<span>{encoding.text}</span></p>
			{/if}

			{#if owner && (lines.length || switches)}
				<section class="fd-card" aria-labelledby={`fd-hidden-${item.id}`}>
					<h2 id={`fd-hidden-${item.id}`}>{t('ส่วนที่ซ่อนอยู่ในไฟล์', 'Hidden parts of the file')}</h2>
					{#if lines.length}
						<ul class="fd-lines">
							{#each lines as line, index (index)}<li class:on={line.included}><i aria-hidden="true"></i><span>{line.text}</span></li>{/each}
						</ul>
					{/if}
					{#if switches && options}
						<div class="fd-switches">
							{#if offered.includeNotes}<Switch checked={options.includeNotes} disabled={!!busy} label={t('ให้ AI เห็นโน้ตผู้บรรยาย', 'Let the AI see speaker notes')} onchange={(value) => setOption('includeNotes', value)} />{/if}
							{#if offered.includeHidden}<Switch checked={options.includeHidden} disabled={!!busy} label={t('ให้ AI เห็นส่วนที่ซ่อนไว้', 'Let the AI see hidden parts')} description={t('สไลด์ แผ่นงาน และข้อความที่ซ่อนไว้', 'Hidden slides, sheets and text')} onchange={(value) => setOption('includeHidden', value)} />{/if}
							{#if offered.includeComments}<Switch checked={options.includeComments} disabled={!!busy} label={t('ให้ AI เห็นความคิดเห็น', 'Let the AI see comments')} onchange={(value) => setOption('includeComments', value)} />{/if}
						</div>
						<p class="fd-hint">{live
								? t('เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ AI ใช้ฉบับเดิมจนกว่าจะอ่านเสร็จ', 'A change reads the file again; the AI keeps the current version until that is done.')
								: t('เปลี่ยนแล้ว ORCA จะอ่านไฟล์ใหม่ตามที่เลือก', 'A change reads the file again as you chose.')}</p>
					{/if}
				</section>
			{/if}

			{#if held && manage}
				<div class="fd-tabs" role="tablist" aria-label={t('ฉบับของไฟล์', 'File versions')}>
					<button type="button" role="tab" aria-selected={which === 'published'} class:on={which === 'published'} onclick={() => (which = 'published')}>{t(`ฉบับที่ใช้อยู่ · ฉบับที่ ${published?.version}`, `In use · version ${published?.version}`)}</button>
					<button type="button" role="tab" aria-selected={which === 'pending'} class:on={which === 'pending'} onclick={() => (which = 'pending')}>{t(`ฉบับใหม่ · ฉบับที่ ${pending?.version}`, `New · version ${pending?.version}`)}</button>
				</div>
			{/if}
			{#if previewVersion}
				{#key `${previewVersion.version}:${which}`}
					<FilePreview hubID={hub.id} itemID={item.id} which={which === 'pending' && held ? 'pending' : 'published'} version={previewVersion} ondenied={tell.denied} onitem={tell.changed} />
				{/key}
			{/if}
		</div>

		<div class="kd-side">
			<WhoCard {hub} {item} {members} {departments} {currentUserID} paused={!features.files} />

			<section class="fd-card" aria-labelledby={`fd-file-${item.id}`}>
				<h2 id={`fd-file-${item.id}`}>{t('ไฟล์ต้นฉบับ', 'Original file')}</h2>
				{#if file}
					<p class="fd-name">{file.fileName}</p>
					<p class="fd-meta">{fileFacts}</p>
					{#if current && fileExtent(current, t)}<p class="fd-meta">{fileExtent(current, t)}</p>{/if}
					{#if current}<p class="fd-meta">{t('อัปโหลด', 'Uploaded')} {relativeTime(current.createdAt, now, t)}</p>{/if}
				{/if}
				<div class="fd-buttons">
					{#if downloadable}
						<a class="k-button" href={OrcaLibraryService.downloadHref(hub.id, item.id, downloadWhich)} download><Download size={15} aria-hidden="true" />{t('ดาวน์โหลด', 'Download')}</a>
					{:else if file && !owner}
						<p class="fd-hint">{t('เจ้าของไฟล์ไม่เปิดให้ดาวน์โหลดต้นฉบับ', 'Its owner does not allow downloading the original')}</p>
					{/if}
					{#if manage}
						{#if busy === 'replace'}
							<div class="fd-progress" role="status">
								<span>{t(`กำลังส่ง ${replaceName} ${Math.floor(replaceProgress * 100)}%`, `Sending ${replaceName} ${Math.floor(replaceProgress * 100)}%`)}</span>
								<span class="fd-bar" aria-hidden="true"><i style:width={`${Math.round(replaceProgress * 100)}%`}></i></span>
								<button type="button" class="k-button small" onclick={() => replaceAbort?.abort()}>{t('ยกเลิก', 'Cancel')}</button>
							</div>
						{:else if !failedCard}
							<button type="button" class="k-button" disabled={!!busy} onclick={() => replaceInput?.click()}><FileUp size={15} aria-hidden="true" />{t('อัปโหลดฉบับใหม่', 'Upload a new version')}</button>
						{/if}
						{#if canReadAgain(file) && servable}<button type="button" class="k-button" disabled={!!busy} onclick={readAgain}><RotateCw size={15} aria-hidden="true" />{busy === 'reextract' ? t('กำลังสั่งอ่าน…', 'Starting…') : t('อ่านไฟล์ใหม่', 'Read again')}</button>{/if}
					{/if}
				</div>
				{#if manage}
					<input
						bind:this={replaceInput}
						class="fd-input"
						type="file"
						accept={FILE_ACCEPT}
						tabindex="-1"
						aria-hidden="true"
						onchange={(event) => {
							void replace(event.currentTarget.files);
							event.currentTarget.value = '';
						}}
					/>
				{/if}
			</section>

			{#if options}
				<section class="fd-card" aria-labelledby={`fd-settings-${item.id}`}>
					<h2 id={`fd-settings-${item.id}`}>{t('ตั้งค่าไฟล์', 'File settings')}</h2>
					<div class="fd-switches">
						<Switch checked={!options.allowDownload} disabled={!!busy} label={t('ห้ามดาวน์โหลดต้นฉบับ', 'Don’t allow downloads')} description={t('กันได้แค่ไฟล์ต้นฉบับ คนที่เห็นเนื้อหาผ่าน AI ยังคัดลอกข้อความได้', 'This stops downloads of the original only. People who see the text through AI can still copy it.')} onchange={(value) => setOption('allowDownload', !value)} />
						<Switch checked={options.reviewBeforeUpdate} disabled={!!busy} label={t('ต้องตรวจก่อนอัปเดต', 'Check before updating')} description={t('ฉบับใหม่ที่อัปโหลดจะรอให้คุณกดใช้ก่อน AI จึงจะเห็น', 'A new version waits for you to use it before the AI sees it.')} onchange={(value) => setOption('reviewBeforeUpdate', value)} />
					</div>
				</section>
			{/if}

			{#if takeover}<TakeoverCard hubID={hub.id} {item} ontaken={tell.changed} ondenied={tell.denied} />{/if}

			<KnowledgeRail item={item} ask={item.status === 'published' && servable && aiUses} {connected} {app} workspace={hub} legend={false} paused={features.files && hub.status !== 'active' ? 'workspace' : undefined} />
		</div>
	</div>
</div>

<ConfirmDialog
	bind:open={leaveOpen}
	title={t('ออกโดยไม่บันทึก?', 'Leave without saving?')}
	message={t('กำลังอัปโหลดฉบับใหม่ ถ้าออกก่อนส่งเสร็จ ฉบับใหม่จะไม่ถูกบันทึก', 'A new version is uploading. If you leave before it is sent, it is not saved.')}
	confirmLabel={t('ออกโดยไม่บันทึก', 'Leave without saving')}
	cancelLabel={t('อยู่ต่อ', 'Stay')}
	tone="danger"
	onconfirm={() => {
		leaveOpen = false;
		replaceAbort?.abort();
		onback();
	}}
/>

<ConfirmDialog
	bind:open={archiveOpen}
	icon={Archive}
	title={t('จัดเก็บไฟล์นี้?', 'Archive this file?')}
	message={t('AI จะเลิกใช้ไฟล์นี้ แต่ยังเปิดดูและนำกลับมาใช้ได้', 'AI stops using this file. You can still open it and use it again.')}
	confirmLabel={busy === 'archive' ? t('กำลังจัดเก็บ…', 'Archiving…') : t('จัดเก็บ', 'Archive')}
	busy={busy === 'archive'}
	onconfirm={archive}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	icon={Trash2}
	tone="danger"
	title={t(`ลบ “${item.title}”?`, `Delete “${item.title}”?`)}
	message={t(
		'AI ของทุกคนจะหยุดเห็นไฟล์นี้ทันที แล้ว ORCA จะลบไฟล์ต้นฉบับ ทุกฉบับ และข้อความที่อ่านได้ ย้อนกลับไม่ได้ ถ้าอยากเก็บไว้ดูภายหลัง ให้จัดเก็บแทน',
		'Everyone’s AI stops seeing this file at once, then ORCA deletes the original, every version and the text it read. This can’t be undone. To keep it for later, archive it instead.'
	)}
	confirmLabel={busy === 'delete' ? t('กำลังลบ…', 'Deleting…') : t('ลบไฟล์', 'Delete file')}
	cancelLabel={t('ไม่ลบ', 'Keep')}
	busy={busy === 'delete'}
	onconfirm={remove}
/>

<style>
	.kn-back {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: var(--orca-muted);
		font-size: 13.5px;
		cursor: pointer;
	}
	.kn-back:hover {
		color: var(--orca-ink);
	}
	.kd-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px 24px;
		margin-bottom: 24px;
	}
	.kd-title {
		flex: 1 1 320px;
		min-width: 0;
	}
	.kd-title h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 700;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}
	.kd-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 8px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.kd-status.draft :global(.orca-pill-dot) {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--orca-subtle);
		background: transparent;
	}
	.kd-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.kd-actions :global(.k-button) {
		min-height: 42px;
		padding: 0 16px;
		font-weight: 600;
	}
	.kd-actions :global(.k-button.danger-outline) {
		border-color: var(--orca-deny-line);
		color: var(--orca-deny);
	}
	.kd-actions :global(.k-button.danger-outline:hover:not(:disabled)) {
		background: var(--orca-deny-bg);
	}
	.kd-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 24px;
		align-items: start;
	}
	.kd-main,
	.kd-side {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.kd-summary {
		margin: 0;
		color: var(--orca-text-2);
		font-size: 15px;
		line-height: 1.6;
	}
	.fd-alert {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: -8px 0 18px;
		padding: 10px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.55;
	}
	.fd-alert :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--orca-deny);
	}
	.fd-state {
		padding: 18px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	/* Status colours only as dots: a failed reading is told by its words and one red dot. */
	.fd-state h2 {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.fd-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--orca-deny);
	}
	.fd-state h2,
	.fd-card h2 {
		margin: 0 0 6px;
		font-size: 15px;
		font-weight: 700;
	}
	.fd-state p {
		margin: 0;
		color: var(--orca-text-2);
		font-size: 14px;
		line-height: 1.6;
	}
	.fd-state-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.fd-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin: 0;
		padding: 10px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-text-2);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.fd-note span {
		flex: 1 1 240px;
	}
	.fd-note :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.fd-note.warn,
	.fd-note.held {
		color: var(--orca-ink);
	}
	.fd-note.warn :global(svg),
	.fd-note.held :global(svg) {
		color: var(--orca-warn);
	}
	.fd-card {
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.fd-lines {
		display: grid;
		gap: 8px;
		margin: 6px 0 14px;
		padding: 0;
		list-style: none;
	}
	.fd-lines li {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		color: var(--orca-text-2);
		font-size: 14px;
		line-height: 1.55;
	}
	.fd-lines i {
		flex: none;
		width: 7px;
		height: 7px;
		margin-top: 8px;
		border: 1.5px solid var(--orca-subtle);
		border-radius: 50%;
	}
	.fd-lines li.on i {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
	}
	.fd-switches {
		display: grid;
		gap: 14px;
	}
	.fd-hint {
		margin: 12px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.fd-name {
		margin: 4px 0 2px;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.fd-meta {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.fd-buttons {
		display: grid;
		gap: 8px;
		margin-top: 14px;
	}
	.fd-buttons :global(.k-button) {
		justify-content: center;
		text-decoration: none;
	}
	.fd-buttons .fd-hint {
		margin: 0;
	}
	.fd-progress {
		display: grid;
		gap: 6px;
		color: var(--orca-text-2);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.fd-bar {
		display: block;
		height: 4px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--orca-secondary);
	}
	.fd-bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--orca-ink);
	}
	.fd-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		opacity: 0;
	}
	.fd-tabs {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		align-self: flex-start;
		padding: 3px;
		border-radius: 10px;
		background: var(--orca-secondary);
	}
	.fd-tabs button {
		min-height: 34px;
		padding: 6px 12px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.fd-tabs button.on {
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-weight: 600;
		box-shadow:
			0 1px 2px color-mix(in srgb, var(--orca-ink) 8%, transparent),
			0 0 0 1px var(--orca-line);
	}
	@media (max-width: 1080px) {
		.kd-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 720px) {
		.kd-actions {
			width: 100%;
		}
		.kd-actions :global(.k-button) {
			flex: 1 1 auto;
			justify-content: center;
		}
		.fd-state,
		.fd-card {
			padding: 16px;
		}
	}
</style>
