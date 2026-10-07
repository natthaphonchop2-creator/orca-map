<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Archive,
		BookOpen,
		Briefcase,
		ChevronDown,
		FileSpreadsheet,
		FileText,
		Files,
		Info,
		LockKeyhole,
		Plus,
		Presentation,
		RefreshCw,
		Search,
		Upload,
		User,
		Users,
		Zap
	} from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import {
		LIBRARY_PAGE,
		askItem,
		audienceChip,
		factLine,
		fileRowState,
		fileTypeLabel,
		filterLibrary,
		formatBytes,
		itemExcerpt,
		libraryCounts,
		readingLabel,
		relativeTime,
		type LibraryFeatures,
		type LibraryFilter
	} from '$lib/orca/knowledge';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaHub, OrcaMember } from '$lib/services/orca';
	import type { LibraryDepartment, LibraryItem, LibraryKind, LibraryUsage } from '$lib/services/orca-library';
	import PageHeader from '../ui/PageHeader.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import KnowledgeRail from './KnowledgeRail.svelte';
	import ScopeChip from './ScopeChip.svelte';

	// คลังความรู้, the library's home (proposal §3.6 screen 1): the workspace,
	// its counts, articles or ready-made prompts, and a side to try it in AI.
	// With knowledge library v2 a third kind, ไฟล์, has its drop zone and quota.
	let {
		hub,
		choices,
		items,
		departments,
		members,
		currentUserID,
		canManage = false,
		kind = $bindable('knowledge'),
		filter = $bindable('all'),
		query = $bindable(''),
		loaded = true,
		error = '',
		connected = false,
		app = '',
		now = Date.now(),
		features = { files: false, audienceModes: false },
		fileZone,
		usage,
		documentsHref = '',
		onchoose,
		oncreate,
		onopen,
		onreload
	}: {
		hub: OrcaHub;
		choices: OrcaHub[];
		items: LibraryItem[];
		departments: LibraryDepartment[];
		/** The workspace's members, as the library lists them. */
		members: OrcaMember[];
		currentUserID: string;
		canManage?: boolean;
		kind?: LibraryKind;
		filter?: LibraryFilter;
		query?: string;
		loaded?: boolean;
		error?: string;
		connected?: boolean;
		app?: string;
		now?: number;
		features?: LibraryFeatures;
		/** The drop zone and its upload panel, above the file list. */
		fileZone?: Snippet;
		/** The company's file quota, beside the file list. */
		usage?: LibraryUsage;
		/** เอกสาร (document templates), while the company has them. */
		documentsHref?: string;
		onchoose: (hubID: string) => void;
		oncreate: (kind: LibraryKind, title?: string) => void;
		onopen: (item: LibraryItem) => void;
		onreload: () => void;
	} = $props();
	let expanded = $state(false);
	const counts = $derived(libraryCounts(items, kind));
	const knowledgeCount = $derived(libraryCounts(items, 'knowledge').current);
	const templateCount = $derived(libraryCounts(items, 'template').current);
	const fileCount = $derived(libraryCounts(items, 'file').current);
	// Uploads need library v2; files already there stay listed after it is turned off (a rollback).
	const files = $derived(features.files);
	// The AI uses nothing here now, so a published item is "เผยแพร่แล้ว", not "AI ใช้ได้": the file list
	// after a rollback (file Knowledge off), or any list of a workspace not active yet (Codex S7 second confirmation #4).
	const filesOff = $derived(kind === 'file' && !features.files);
	// A workspace not active yet, on library v2's pages (today's page keeps its words: it is the release's floor).
	const idle = $derived(features.files && hub.status !== 'active');
	const paused = $derived(filesOff || idle);
	const fileTab = $derived(features.files || items.some((item) => item.kind === 'file'));
	const rows = $derived(filterLibrary(items, kind, filter, query));
	const shown = $derived(expanded ? rows : rows.slice(0, LIBRARY_PAGE));
	const hidden = $derived(rows.length - shown.length);
	const someoneElse = $derived(shown.some((item) => !item.canEdit));
	// Counts only once the library answered: a failed load shows no zeros.
	const counted = $derived(loaded && !(error && !items.length));
	// Without library v2 the AI searches articles only: the card asks about one.
	const ask = $derived(askItem(items, undefined, kind === 'file' && !features.files ? 'knowledge' : kind));
	const workspaceMemberIDs = $derived(members.map((member) => member.id));
	const filters = $derived<{ id: LibraryFilter; label: string }[]>([
		{ id: 'all', label: t('ทั้งหมด', 'All') },
		{ id: 'published', label: paused ? t('เผยแพร่แล้ว', 'Published') : t('AI ใช้ได้', 'AI can use') },
		{ id: 'draft', label: t('ฉบับร่าง', 'Drafts') },
		{ id: 'archived', label: t('จัดเก็บแล้ว', 'Archived') }
	]);
	const addLabel = $derived(
		kind === 'file'
			? t('เพิ่มไฟล์', 'Add files')
			: kind === 'template'
				? t('เพิ่มคำสั่งสำเร็จรูป', 'Add a ready-made prompt')
				: files
					? t('เพิ่มบทความ', 'Add an article')
					: t('เพิ่มความรู้', 'Add knowledge')
	);
	const starters = $derived(
		kind === 'knowledge'
			? [t('นโยบายคืนสินค้า', 'Return policy'), t('ขั้นตอนออกใบกำกับภาษี', 'Issuing a tax invoice'), t('สวัสดิการพนักงาน', 'Employee benefits')]
			: [t('สรุปยอดขายประจำวัน', 'Daily sales summary'), t('ร่างอีเมลติดตามลูกค้า', 'Customer follow-up email'), t('ตอบคำถามลูกค้าจากนโยบาย', 'Answer customers from our policies')]
	);
	$effect(() => {
		// A new tab, chip or search starts from the first rows again.
		void kind;
		void filter;
		void query;
		expanded = false;
	});
	function personName(id: string) {
		if (id === currentUserID) return t('คุณ', 'You');
		const member = members.find((item) => item.id === id);
		return member ? member.displayName || member.email : t('สมาชิกพื้นที่ทำงาน', 'Workspace member');
	}
	function departmentName(id: string) {
		return departments.find((item) => item.unitID === id)?.name || t('แผนก', 'Department');
	}
	function initial(id: string) {
		const name = id === currentUserID ? (members.find((item) => item.id === id)?.displayName ?? '') : personName(id);
		return [...name.trim()].find((c) => /[\p{L}\p{N}]/u.test(c))?.toLocaleUpperCase() ?? '•';
	}
	function chip(item: LibraryItem) {
		return audienceChip(item, { departments, workspaceMemberIDs, personName, departmentName }, t);
	}
</script>

<div class="kn">
	<div class="kn-head">
		<PageHeader title={term('knowledge', t)} subtitle={t('ข้อมูลที่ AI ของทีมใช้ตอบคำถาม', 'What your team’s AI answers from')}>
			{#snippet action()}
				{#if kind !== 'file' || files}
					<button type="button" class="k-button primary kn-add" onclick={() => oncreate(kind)} disabled={!loaded || (!!error && !items.length)}>
						{#if kind === 'file'}<Upload size={16} strokeWidth={2.3} aria-hidden="true" />{:else}<Plus size={16} strokeWidth={2.3} aria-hidden="true" />{/if}{addLabel}
					</button>
				{/if}
			{/snippet}
		</PageHeader>
		<div class="kn-ctx">
			{#if choices.length > 1}<ScopeChip {hub} {choices} onchoose={onchoose} />{/if}
			{#if documentsHref}<a class="kn-docs" href={documentsHref}>{t('เทมเพลตเอกสาร', 'Document templates')}</a>{/if}
			{#if counted}
				<p class="kn-strip">
					<span><i class="dt" class:ok={!paused} class:plain={paused} aria-hidden="true"></i>{paused ? t('เผยแพร่แล้ว', 'Published') : t('AI ใช้ได้', 'AI can use')} <b>{counts.published}</b></span>
					<i class="sep" aria-hidden="true"></i>
					<span><i class="dt draft" aria-hidden="true"></i>{t('ฉบับร่าง', 'Drafts')} <b>{counts.draft}</b></span>
				</p>
			{/if}
		</div>
	</div>

	{#if hub.status !== 'active'}
		<p class="kn-note">
			<Info size={16} aria-hidden="true" />
			<span>{t('พื้นที่ทำงานนี้ยังไม่เปิดใช้งาน AI จะใช้ความรู้ได้เมื่อเปิดใช้งาน', 'This workspace is not active. AI can use its knowledge once it is.')}</span>
			{#if canManage}<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}>{t('เปิดพื้นที่ทำงาน', 'Open workspace')}</a>{/if}
		</p>
	{/if}

	<div class="kn-grid">
		<div class="kn-main">
			<div class="kn-bar">
				<div class="seg" class:three={fileTab} role="group" aria-label={t('ประเภท', 'Type')}>
					<button type="button" aria-pressed={kind === 'knowledge'} class:on={kind === 'knowledge'} onclick={() => (kind = 'knowledge')}>
						<BookOpen size={16} aria-hidden="true" />{fileTab ? t('บทความ', 'Articles') : t('ความรู้', 'Knowledge')}{#if counted}<span class="c">{knowledgeCount}</span>{/if}
					</button>
					{#if fileTab}
						<button type="button" aria-pressed={kind === 'file'} class:on={kind === 'file'} onclick={() => (kind = 'file')}>
							<Files size={16} aria-hidden="true" />{t('ไฟล์', 'Files')}{#if counted}<span class="c">{fileCount}</span>{/if}
						</button>
					{/if}
					<button type="button" aria-pressed={kind === 'template'} class:on={kind === 'template'} onclick={() => (kind = 'template')}>
						<Zap size={16} aria-hidden="true" />{term('readyPrompt', t)}{#if counted}<span class="c">{templateCount}</span>{/if}
					</button>
				</div>
				<label class="search">
					<Search size={16} aria-hidden="true" />
					<input type="search" bind:value={query} maxlength="200" placeholder={t('ค้นหาชื่อเรื่อง', 'Search titles')} aria-label={t('ค้นหาชื่อเรื่อง', 'Search titles')} />
				</label>
			</div>

			{#if kind === 'file' && files && fileZone}{@render fileZone()}{/if}
			{#if kind === 'file' && !files}
				<p class="kn-note off">
					<Info size={16} aria-hidden="true" />
					<span>{t('ตอนนี้ AI ไม่ได้ค้นจากไฟล์ และอัปโหลดไฟล์ใหม่ไม่ได้ เพราะคลังความรู้แบบไฟล์ของบริษัทปิดอยู่ ไฟล์ที่มีอยู่ยังเปิดดู ดาวน์โหลด และลบได้', 'AI does not search files now and new files can’t be uploaded: file Knowledge is off for this company. Files already here can still be opened, downloaded and deleted.')}</span>
				</p>
			{/if}

			<div class="chips" role="group" aria-label={t('สถานะ', 'Status')}>
				{#each filters as item (item.id)}
					<button type="button" class="chip" class:on={filter === item.id} aria-pressed={filter === item.id} onclick={() => (filter = item.id)}>{item.label}</button>
				{/each}
			</div>

			{#if error}
				<div class="kn-alert" role="alert">
					<Info size={16} aria-hidden="true" />
					<p>{error}</p>
					<button type="button" class="k-button small" onclick={onreload}><RefreshCw size={15} aria-hidden="true" />{t('โหลดใหม่', 'Reload')}</button>
				</div>
			{/if}

			{#if !loaded}
				<p class="kn-loading" role="status">{t('กำลังโหลดคลังความรู้…', 'Loading knowledge…')}</p>
			{:else if error && !items.length}
				<!-- The alert above says what failed; no starter list over an error. -->
			{:else if rows.length}
				<div class="kl">
					<div class="kl-h" aria-hidden="true">
						<span></span><span>{t('เรื่อง', 'Title')}</span><span>{t('ใครใช้ได้', 'Who can use')}</span><span>{t('สถานะ', 'Status')}</span><span>{t('อัปเดตล่าสุด', 'Updated')}</span>
					</div>
					<ul>
						{#each shown as item (item.id)}
							{@const audience = item.canEdit ? chip(item) : undefined}
							{@const row = item.kind === 'file' ? fileRowState(item, t, files, hub.status === 'active') : undefined}
							<li>
								<button type="button" class="kl-r" onclick={() => onopen(item)}>
									<span class="kl-ic" class:draft={item.status === 'draft' || row?.status === 'reading'} class:archived={item.status === 'archived'} aria-hidden="true">
										{#if item.kind === 'template'}<Zap size={17} />{:else if item.kind === 'file' && ['xlsx', 'csv'].includes(item.file?.ext ?? '')}<FileSpreadsheet size={17} />{:else if item.kind === 'file' && item.file?.ext === 'pptx'}<Presentation size={17} />{:else}<FileText size={17} />{/if}
									</span>
									{#if item.kind === 'file'}
										<span class="kl-t"
											><b>{item.title}</b><small class="kl-fm">{factLine([fileTypeLabel(item.file?.ext ?? '', t), formatBytes(item.file?.bytes ?? 0), itemExcerpt(item, 60)])}</small
											>{#if row?.note}<small class="kl-fn {row.tone ?? ''}">{row.note}</small>{/if}</span
										>
									{:else}
										<span class="kl-t"><b>{item.title}</b>{#if itemExcerpt(item)}<small>{itemExcerpt(item)}</small>{/if}</span>
									{/if}
									<span class="kl-a">
										<span class="kn-sr">{t('ใครใช้ได้:', 'Who can use:')}</span>
										{#if audience}
											<span class="aud">
												{#if audience.kind === 'everyone'}<Users size={13} aria-hidden="true" />{:else if audience.kind === 'me'}<LockKeyhole size={13} aria-hidden="true" />{:else if audience.kind === 'departments'}<Briefcase size={13} aria-hidden="true" />{:else}<User size={13} aria-hidden="true" />{/if}
												{audience.label}
											</span>
										{:else}<span class="aud-none">{item.kind === 'file' ? t('ตั้งโดยเจ้าของ', 'Set by its owner') : t('ตั้งโดยผู้เขียน', 'Set by its author')}</span>{/if}
									</span>
									<!-- Status colours only as dots on library v2's pages, "AI ใช้ได้" too (Codex S7 thirteenth confirmation #4); today's page keeps its green pill. -->
									<span class="kl-s" class:draft={row ? row.status === 'reading' || row.status === 'draft' : item.status === 'draft'}>
										{#if row?.status === 'reading'}<StatusPill label={readingLabel('reading', t)} dot />
										{:else if row?.status === 'failed'}<StatusPill label={readingLabel('failed', t)} dot dotTone="deny" />
										{:else if item.status === 'published' && paused}<StatusPill label={t('เผยแพร่แล้ว', 'Published')} dot />
										{:else if item.status === 'published' && files}<StatusPill label={t('AI ใช้ได้', 'AI can use')} dot dotTone="ok" />
										{:else if item.status === 'published'}<StatusPill label={t('AI ใช้ได้', 'AI can use')} tone="ok" dot />
										{:else if item.status === 'draft'}<StatusPill label={t('ฉบับร่าง', 'Draft')} dot />
										{:else}<span class="archived-pill"><Archive size={12} aria-hidden="true" />{t('จัดเก็บแล้ว', 'Archived')}</span>{/if}
									</span>
									<span class="kl-u">
										{relativeTime(item.updatedAt, now, t)}
										<span class="by"><i class="mav" class:me={item.ownerID === currentUserID} aria-hidden="true">{initial(item.ownerID)}</i>{personName(item.ownerID)}</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>
					{#if someoneElse || hidden > 0}
						<div class="kl-f">
							{#if someoneElse}<span><Info size={15} aria-hidden="true" />{t('ป้าย “ใครใช้ได้” แสดงเฉพาะเรื่องที่คุณแก้ไขได้', 'The “Who can use” label shows only on items you can edit')}</span>{:else}<span></span>{/if}
							{#if hidden > 0}<button type="button" onclick={() => (expanded = true)}>{t(`ดูอีก ${hidden} เรื่อง`, `Show ${hidden} more`)}<ChevronDown size={14} aria-hidden="true" /></button>{/if}
						</div>
					{/if}
				</div>
			{:else if query.trim() || filter !== 'all'}
				<div class="kn-empty">
					<p>{t('ไม่พบเรื่องที่ตรงกับตัวกรอง', 'Nothing matches these filters')}</p>
					<button type="button" class="k-button" onclick={() => { query = ''; filter = 'all'; }}>{t('ล้างตัวกรอง', 'Clear filters')}</button>
				</div>
			{:else if kind === 'file'}
				<div class="kn-empty">
					<p>{t('ยังไม่มีไฟล์ในพื้นที่ทำงานนี้', 'No files in this workspace yet')}</p>
					<small>{t('ลากไฟล์ Word, Excel หรือ PowerPoint มาวางด้านบน AI จะตอบจากไฟล์ได้เมื่อคุณเผยแพร่', 'Drop Word, Excel or PowerPoint files above. AI answers from them once you publish them.')}</small>
				</div>
			{:else}
				<div class="kn-empty starter">
					<span class="kn-empty-ic" aria-hidden="true">{#if kind === 'template'}<Zap size={22} />{:else}<BookOpen size={22} />{/if}</span>
					<p>{kind === 'knowledge' ? t('เริ่มจากคู่มือที่ทีมถามบ่อย', 'Start with what your team asks most') : t('เริ่มจากงานที่ทีมสั่ง AI บ่อย', 'Start with what your team asks AI to do most')}</p>
					<ul>
						{#each starters as title (title)}
							<li><button type="button" class="k-button" onclick={() => oncreate(kind, title)}><Plus size={15} aria-hidden="true" />{title}</button></li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<KnowledgeRail item={ask} ask={counted && !idle} {connected} {app} workspace={hub} files={kind === 'file'} paused={filesOff ? 'files' : idle ? 'workspace' : undefined} usage={kind === 'file' ? usage : undefined} dots={files} />
	</div>
</div>

<style>
	/* orca-type-remap v1 */
	.kn-head {
		margin-bottom: 28px;
	}
	.kn-head :global(.orca-page-header) {
		margin-bottom: 0;
	}
	.kn-add {
		min-height: 44px !important;
		padding: 0 18px !important;
		font-size: 14px !important;
		font-weight: 600 !important;
	}
	.kn-ctx {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		margin-top: 16px;
	}
	.kn-docs {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.kn-strip {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.kn-strip span {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.kn-strip b {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.sep {
		width: 1px;
		height: 14px;
		background: var(--orca-line-strong);
	}
	.dt {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.dt.ok {
		background: var(--orca-ok);
	}
	.dt.plain {
		background: var(--orca-subtle);
	}
	.dt.draft {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--orca-subtle);
		background: transparent;
	}
	.kn-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin: -8px 0 20px;
		padding: 10px 14px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.kn-note :global(svg) {
		flex: none;
		color: var(--orca-warn);
	}
	.kn-note span {
		flex: 1 1 260px;
	}
	.kn-note.off {
		margin: 0 0 14px;
		border-color: var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-text-2);
	}
	.kn-note.off :global(svg) {
		color: var(--orca-subtle);
	}
	.kn-note a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.kn-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 272px;
		gap: 24px;
		align-items: start;
	}
	.kn-main {
		min-width: 0;
	}
	.kn-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
		margin-bottom: 16px;
	}
	.seg {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: 10px;
		background: var(--orca-secondary);
	}
	.seg button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 7px 14px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}
	.seg button:hover:not(.on) {
		color: var(--orca-ink);
	}
	.seg button.on {
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-weight: 600;
		box-shadow:
			0 1px 2px color-mix(in srgb, var(--orca-ink) 8%, transparent),
			0 0 0 1px var(--orca-line);
	}
	.c {
		padding: 0 7px;
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 11.5px;
		font-weight: 600;
		line-height: 18px;
	}
	.seg button.on .c {
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 236px;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-subtle);
	}
	.search:focus-within {
		border-color: var(--orca-focus);
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.search :global(svg) {
		flex: none;
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.search input:focus-visible {
		outline: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 0 13px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.chip:hover:not(.on) {
		border-color: var(--orca-line-strong);
	}
	.chip.on {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: var(--orca-on-ink);
		font-weight: 600;
	}
	.kl {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.kl ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.kl-h,
	.kl-r {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) 118px 100px 132px;
		align-items: center;
		column-gap: 16px;
		padding: 0 18px;
	}
	.kl-h {
		height: 38px;
		border-bottom: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-subtle);
		font-size: 12px;
		font-weight: 600;
	}
	.kl-r {
		width: 100%;
		padding-top: 14px;
		padding-bottom: 14px;
		border: 0;
		border-top: 1px solid var(--orca-line-soft);
		background: transparent;
		color: var(--orca-ink);
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.15s var(--orca-ease);
	}
	.kl li:first-child .kl-r {
		border-top: 0;
	}
	.kl-r:hover {
		background: var(--orca-hover);
	}
	.kl-r:focus-visible {
		outline-offset: -2px !important;
	}
	.kl-ic {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 9px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.kl-ic.draft {
		border: 1.5px dashed var(--orca-line-strong);
		background: var(--orca-surface);
		color: var(--orca-subtle);
	}
	.kl-ic.archived {
		color: var(--orca-subtle);
	}
	.kl-t {
		display: block;
		min-width: 0;
	}
	.kl-t b {
		display: block;
		overflow: hidden;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.kl-t small {
		display: block;
		overflow: hidden;
		margin-top: 1px;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.kl-t small.kl-fn {
		color: var(--orca-muted);
	}
	/* Status colours only as dots: the pill beside it says the state. */
	.kl-t small.kl-fn.deny,
	.kl-t small.kl-fn.warn {
		color: var(--orca-text-2);
	}
	.kl-t small.kl-fn.deny {
		white-space: normal;
	}
	.kl-a {
		min-width: 0;
	}
	.aud {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 2px 10px 2px 8px;
		overflow: hidden;
		border: 1px solid var(--orca-line-strong);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.aud :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.aud-none {
		color: var(--orca-subtle);
		font-size: 12px;
		white-space: nowrap;
	}
	.kl-s.draft :global(.orca-pill-dot) {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--orca-subtle);
		background: transparent;
	}
	.archived-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 11.5px;
		font-weight: 600;
		line-height: 1.5;
		white-space: nowrap;
	}
	.kl-u {
		display: block;
		min-width: 0;
		color: var(--orca-text-2);
		font-size: 12.5px;
		line-height: 1.45;
		white-space: nowrap;
	}
	.by {
		display: flex;
		align-items: center;
		gap: 6px;
		overflow: hidden;
		margin-top: 3px;
		color: var(--orca-subtle);
		font-size: 12px;
		text-overflow: ellipsis;
	}
	.mav {
		display: grid;
		flex: none;
		place-items: center;
		width: 18px;
		height: 18px;
		border: 1px solid var(--orca-line);
		border-radius: 50%;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 10px;
		font-style: normal;
		font-weight: 700;
	}
	.mav.me {
		border-color: transparent;
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.kl-f {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 18px;
		border-top: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.kl-f span {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.kl-f :global(svg) {
		flex: none;
	}
	.kl-f button {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 5px;
		padding: 4px 6px;
		border: 0;
		border-radius: var(--orca-radius-sm);
		background: transparent;
		color: var(--orca-ink);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.kl-f button:hover {
		background: var(--orca-hover);
	}
	.kn-alert {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
		padding: 12px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.kn-alert :global(svg) {
		color: var(--orca-deny);
	}
	.kn-alert p {
		flex: 1 1 240px;
		margin: 0;
	}
	.kn-loading {
		margin: 0;
		padding: 40px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		text-align: center;
	}
	.kn-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 40px 20px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		text-align: center;
	}
	.kn-empty p {
		margin: 0;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
	}
	.kn-empty small {
		max-width: 420px;
		margin-top: -6px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.kn-empty-ic {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.kn-empty ul {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.kn-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (max-width: 1080px) {
		.kn-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 720px) {
		.kn-add {
			width: 100%;
			justify-content: center;
		}
		.kn-bar {
			flex-direction: column;
			align-items: stretch;
		}
		.seg {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		.seg.three {
			grid-template-columns: repeat(3, auto);
		}
		.seg button {
			justify-content: center;
			padding: 7px 8px;
		}
		.seg.three button {
			gap: 6px;
			padding: 7px 4px;
			font-size: 13px;
		}
		.seg.three button :global(svg) {
			display: none;
		}
		.search {
			width: 100%;
		}
		.kl-h {
			display: none;
		}
		.kl-r {
			grid-template-columns: 34px minmax(0, 1fr) auto;
			row-gap: 8px;
			padding: 14px 16px;
		}
		.kl-ic {
			grid-column: 1;
			grid-row: 1 / span 3;
			align-self: start;
		}
		.kl-t {
			grid-column: 2 / 4;
			grid-row: 1;
		}
		.kl-t b,
		.kl-t small {
			white-space: normal;
		}
		.kl-a {
			grid-column: 2;
			grid-row: 2;
		}
		.kl-s {
			grid-column: 3;
			grid-row: 2;
			justify-self: end;
		}
		.kl-u {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 4px 10px;
			grid-column: 2 / 4;
			grid-row: 3;
		}
		.by {
			margin-top: 0;
		}
		.kl-f {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
	}
</style>
