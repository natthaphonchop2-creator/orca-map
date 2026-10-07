<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { Archive, ArrowLeft, Eye, FileText, Pencil, TriangleAlert } from '@lucide/svelte';
	import { getHttpStatusCode, parseErrorContent } from '$lib/errors';
	import { term } from '$lib/orca/glossary';
	import {
		brokenReferences,
		canTakeOver,
		contentForEditing,
		libraryInput,
		libraryProblem,
		missingInput,
		relativeTime,
		tokenRuns,
		type LibraryFeatures
	} from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import { orcaError, type OrcaHub, type OrcaMember } from '$lib/services/orca';
	import { OrcaLibraryService, type LibraryDepartment, type LibraryItem, type RenderedTemplate } from '$lib/services/orca-library';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import KnowledgeRail from './KnowledgeRail.svelte';
	import TakeoverCard from './TakeoverCard.svelte';
	import WhoCard from './WhoCard.svelte';

	// One article or ready-made prompt (proposal §3.6 screen 4): its text, who
	// can use it (to its author only), a prompt to try in AI, a preview for a
	// ready-made prompt (drafts too) and, for the author, แก้ไข and จัดเก็บ.
	let {
		hub,
		item,
		items,
		members,
		departments,
		currentUserID,
		canManage = false,
		features = { files: false, audienceModes: false },
		now = Date.now(),
		connected = false,
		app = '',
		onback,
		onedit,
		onarchived,
		onchanged,
		ondenied,
		onrecheck = async () => 'unknown' as const
	}: {
		hub: OrcaHub;
		item: LibraryItem;
		items: LibraryItem[];
		members: OrcaMember[];
		departments: LibraryDepartment[];
		currentUserID: string;
		canManage?: boolean;
		features?: LibraryFeatures;
		now?: number;
		connected?: boolean;
		app?: string;
		onback: () => void;
		onedit: () => void;
		onarchived: (item: LibraryItem) => void;
		/** A manager took the item over: it is theirs now. */
		onchanged?: (item: LibraryItem) => void;
		ondenied: () => void;
		/** After a refused preview: whether the library still opens (then its lists are fresh). */
		onrecheck?: () => Promise<'open' | 'denied' | 'unknown'>;
	} = $props();
	let archiveOpen = $state(false);
	let archiving = $state(false);
	let archiveError = $state('');
	let inputs = $state<Record<string, string>>({});
	let rendered = $state<RenderedTemplate>();
	let rendering = $state(false);
	let renderError = $state('');
	let emptyField = $state('');
	const takeover = $derived(!!onchanged && canTakeOver(item, { files: features.files, canManage, me: currentUserID, workspaceMembers: members }));
	const runs = $derived(item.kind === 'template' ? tokenRuns(contentForEditing(item.content, item.parameters), item.parameters) : []);
	const canPreview = $derived(item.kind === 'template' && item.status !== 'archived');
	// Articles the prompt names that are no longer published (or readable): the
	// server then refuses it to anyone who cannot read them, the author included.
	const broken = $derived(item.canEdit ? brokenReferences(item, items) : []);

	function personName(id: string) {
		if (id === currentUserID) return t('คุณ', 'You');
		const member = members.find((entry) => entry.id === id);
		return member ? member.displayName || member.email : t('สมาชิกพื้นที่ทำงาน', 'Workspace member');
	}
	// A workspace not active yet, on library v2's pages: the AI uses nothing in it now.
	const idle = $derived(features.files && hub.status !== 'active');
	// Gone (the page moved on): a late answer changes nothing of the page now (Codex S7 second confirmation #2).
	let gone = false;
	onDestroy(() => (gone = true));
	async function archive() {
		if (archiving || !item.canEdit) return;
		archiving = true;
		archiveError = '';
		try {
			// A live audience stays live: the mode is sent whenever the server knows it.
			const saved = await OrcaLibraryService.save(hub.id, libraryInput(item, { status: 'archived' }, features), item.id);
			archiveOpen = false;
			if (!gone) onarchived(saved);
		} catch (cause) {
			const code = getHttpStatusCode(cause);
			if (code === 403 || code === 404) {
				archiveOpen = false;
				if (!gone) ondenied();
				return;
			}
			archiveError = libraryProblem(parseErrorContent(cause), t) ?? orcaError(cause);
		} finally {
			archiving = false;
		}
	}
	async function preview(event: SubmitEvent) {
		event.preventDefault();
		if (rendering) return;
		const id = item.id;
		// Required fields are checked here, so the message is plain Thai.
		const missing = missingInput(item.parameters, inputs);
		emptyField = missing?.name ?? '';
		if (missing) {
			rendered = undefined;
			renderError = t(`กรอก “${missing.label || missing.name}” ก่อน`, `Fill in “${missing.label || missing.name}” first`);
			await tick();
			document.getElementById(`kd-input-${missing.name}`)?.focus();
			return;
		}
		rendering = true;
		renderError = '';
		rendered = undefined;
		try {
			const result = await OrcaLibraryService.render(hub.id, id, inputs);
			if (item.id === id) rendered = result;
		} catch (cause) {
			if (item.id !== id) return;
			const problem = parseErrorContent(cause);
			if (problem.status === 403 || problem.status === 404) {
				// An article it reads changed, or my access did (then the page leaves).
				if ((await onrecheck()) === 'denied') {
					if (!gone) ondenied();
					return;
				}
				renderError = item.knowledgeIDs.length
					? t('ดูตัวอย่างไม่ได้ เพราะเรื่องที่ AI อ่านประกอบบางเรื่องเลิกเผยแพร่แล้ว หรือคุณอ่านไม่ได้แล้ว', 'No preview: an article AI reads with it is no longer published, or you can no longer read it.')
					: orcaError(cause);
				return;
			}
			renderError = libraryProblem(problem, t) ?? orcaError(cause);
		} finally {
			rendering = false;
		}
	}
</script>

<div class="kd">
	<button type="button" class="kn-back" onclick={onback}><ArrowLeft size={15} aria-hidden="true" />{term('knowledge', t)} · {hub.name}</button>
	<header class="kd-head">
		<div class="kd-title">
			<h1>{item.title}</h1>
			<p class="kd-meta">
				<span class="kd-status" class:draft={item.status === 'draft'}>
					<!-- With library v2, "AI ใช้ได้" only in an active workspace, as "ใครใช้ได้" beside it says (Codex S7 #11), and its colour only as the dot (Codex S7 thirteenth confirmation #4); today's page keeps its words and its pill. -->
					{#if item.status === 'published' && idle}<StatusPill label={t('เผยแพร่แล้ว', 'Published')} dot />
					{:else if item.status === 'published' && features.files}<StatusPill label={t('AI ใช้ได้', 'AI can use')} dot dotTone="ok" />
					{:else if item.status === 'published'}<StatusPill label={t('AI ใช้ได้', 'AI can use')} tone="ok" dot />
					{:else if item.status === 'draft'}<StatusPill label={t('ฉบับร่าง', 'Draft')} dot />
					{:else}<StatusPill label={t('จัดเก็บแล้ว', 'Archived')} />{/if}
				</span>
				<span>{item.kind === 'template' ? term('readyPrompt', t) : features.files ? t('บทความ', 'Article') : t('ความรู้', 'Knowledge')}</span>
				<span>{t('ผู้เขียน', 'By')} {personName(item.ownerID)}</span>
				<span>{t('อัปเดต', 'Updated')} {relativeTime(item.updatedAt, now, t)}</span>
			</p>
		</div>
		{#if item.canEdit}
			<div class="kd-actions">
				{#if item.status !== 'archived'}<button type="button" class="k-button" onclick={() => (archiveOpen = true)}><Archive size={16} aria-hidden="true" />{t('จัดเก็บ', 'Archive')}</button>{/if}
				<button type="button" class="k-button primary" onclick={onedit}><Pencil size={16} aria-hidden="true" />{item.status === 'archived' ? t('แก้ไขและนำกลับมาใช้', 'Edit and restore') : t('แก้ไข', 'Edit')}</button>
			</div>
		{/if}
	</header>

	<div class="kd-grid">
		<div class="kd-main">
			{#if item.summary}<p class="kd-summary">{item.summary}</p>{/if}
			<section class="kd-card" aria-label={item.kind === 'template' ? t('สิ่งที่ให้ AI ทำ', 'What AI does') : t('เนื้อหา', 'Content')}>
				{#if item.kind === 'template'}
					<h2>{t('อยากให้ AI ทำอะไร', 'What AI should do')}</h2>
					<div class="prose">{#each runs as run, index (index)}{#if run.field}<mark>{run.text.replace(/^\{\{\s*|\s*\}\}$/g, '')}</mark>{:else}{run.text}{/if}{/each}</div>
				{:else}
					<div class="prose">{item.content}</div>
				{/if}
			</section>

			{#if item.kind === 'template' && item.knowledgeIDs.length}
				<section class="kd-card">
					<h2>{t('เรื่องที่ AI อ่านประกอบ', 'Articles AI reads with it')}</h2>
					{#if broken.length}
						<p class="kd-warn">
							<TriangleAlert size={15} aria-hidden="true" />
							<span>
								{t(
									`${broken.length} เรื่องเลิกเผยแพร่แล้ว หรือคุณอ่านไม่ได้แล้ว ใครอ่านเรื่องนั้นไม่ได้จะใช้คำสั่งนี้ไม่ได้ กด แก้ไข แล้วเอาออก`,
									`${broken.length} of them are no longer published or readable to you. Anyone who can’t read one can’t use this prompt. Edit it and remove them.`
								)}
							</span>
						</p>
					{/if}
					<ul class="kd-refs">
						{#each item.knowledgeIDs as id (id)}
							<li class:broken={broken.includes(id)}><FileText size={15} aria-hidden="true" />{items.find((entry) => entry.id === id)?.title ?? t('เรื่องที่ไม่พร้อมใช้แล้ว', 'An article no longer available')}{#if broken.includes(id)}<small>{t('ใช้ไม่ได้แล้ว', 'Not usable')}</small>{/if}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if canPreview}
				<section class="kd-card">
					<h2>{t('ลองดูว่า AI จะได้รับอะไร', 'Preview what AI receives')}</h2>
					<p class="kd-hint">{item.status === 'draft' ? t('ลองได้แม้ยังเป็นฉบับร่าง เห็นแค่คุณ', 'Works on drafts too. Only you see it.') : t('กรอกช่องแล้วดูข้อความที่ ORCA ส่งให้ AI', 'Fill in the fields and see what ORCA sends to AI')}</p>
					<form class="kd-preview" novalidate onsubmit={preview}>
						{#each item.parameters as field (field.name)}
							<div class="kd-field">
								<label for={`kd-input-${field.name}`}>{field.label || field.name}{#if !field.required}<small>{t('ไม่บังคับ', 'Optional')}</small>{/if}</label>
								<input
									id={`kd-input-${field.name}`}
									value={inputs[field.name] ?? ''}
									required={field.required}
									aria-invalid={emptyField === field.name ? 'true' : undefined}
									aria-describedby={emptyField === field.name ? 'kd-render-error' : undefined}
									maxlength="4000"
									disabled={rendering}
									oninput={(event) => {
										inputs = { ...inputs, [field.name]: event.currentTarget.value };
										rendered = undefined;
										if (emptyField === field.name) {
											emptyField = '';
											renderError = '';
										}
									}}
								/>
							</div>
						{/each}
						<button type="submit" class={item.canEdit ? 'k-button' : 'k-button primary'} disabled={rendering}><Eye size={16} aria-hidden="true" />{rendering ? t('กำลังเตรียม…', 'Preparing…') : t('ดูตัวอย่าง', 'Preview')}</button>
					</form>
					{#if renderError}<p class="kd-error" id="kd-render-error" role="alert">{renderError}</p>{/if}
					{#if rendered}
						<div class="kd-rendered" aria-live="polite">
							<div class="prose">{rendered.content}</div>
							{#each rendered.knowledge as article (article.id)}
								<details>
									<summary><FileText size={15} aria-hidden="true" />{article.title}</summary>
									<div class="prose">{article.content}</div>
								</details>
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		</div>

		<div class="kd-side">
			<WhoCard {hub} {item} {members} {departments} {currentUserID} />
			{#if takeover && onchanged}<TakeoverCard hubID={hub.id} {item} ontaken={onchanged} {ondenied} />{/if}
			<KnowledgeRail item={item} ask={item.status === 'published' && !idle} {connected} {app} workspace={hub} legend={false} paused={idle ? 'workspace' : undefined} />
		</div>
	</div>
</div>

<ConfirmDialog
	bind:open={archiveOpen}
	icon={Archive}
	title={t('จัดเก็บเรื่องนี้?', 'Archive this?')}
	message={item.kind === 'knowledge'
		? t('AI จะเลิกใช้เรื่องนี้ รวมถึงคำสั่งสำเร็จรูปที่อ่านเรื่องนี้ประกอบ แต่ยังเปิดดูย้อนหลังได้', 'AI stops using it, and prompts that read it stop working. You can still open it.')
		: t('AI จะเลิกใช้คำสั่งนี้ แต่ยังเปิดดูย้อนหลังได้', 'AI stops using this prompt. You can still open it.')}
	confirmLabel={archiving ? t('กำลังจัดเก็บ…', 'Archiving…') : t('จัดเก็บ', 'Archive')}
	busy={archiving}
	onconfirm={archive}
>
	{#if archiveError}<p class="kd-error" role="alert">{archiveError}</p>{/if}
</ConfirmDialog>

<style>
	/* orca-type-remap v1 */
	.kn-back {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: var(--orca-muted);
		font-size: 13px;
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
		font-size: 24px;
		font-weight: 600;
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
		font-size: 13px;
	}
	.kd-status.draft :global(.orca-pill-dot) {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--orca-subtle);
		background: transparent;
	}
	.kd-actions {
		display: flex;
		flex: none;
		gap: 10px;
	}
	.kd-actions :global(.k-button) {
		min-height: 42px;
		padding: 0 16px;
		font-weight: 600;
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
		font-size: 14px;
		line-height: 1.6;
	}
	.kd-card {
		padding: 20px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.kd-card h2 {
		margin: 0 0 10px;
		font-size: 14px;
		font-weight: 700;
	}
	.prose {
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.8;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.prose mark {
		padding: 1px 6px;
		border: 1px solid var(--orca-citron-line);
		border-radius: 6px;
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.kd-refs {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.kd-refs li {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--orca-text-2);
		font-size: 13.5px;
	}
	.kd-refs :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.kd-refs li.broken {
		color: var(--orca-muted);
	}
	.kd-refs small {
		padding: 1px 8px;
		border: 1px solid var(--orca-warn-line);
		border-radius: 999px;
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
		font-size: 11.5px;
		font-weight: 600;
	}
	.kd-hint {
		margin: -4px 0 12px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.kd-preview {
		display: grid;
		gap: 12px;
		justify-items: start;
	}
	.kd-field {
		display: grid;
		gap: 6px;
		width: 100%;
	}
	.kd-field label {
		display: flex;
		gap: 8px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.kd-field small {
		color: var(--orca-muted);
		font-weight: 400;
	}
	.kd-field input {
		min-height: 42px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.kd-error {
		margin: 12px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
	}
	.kd-field input[aria-invalid='true'] {
		border-color: var(--orca-deny);
	}
	.kd-warn {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: -4px 0 12px;
		padding: 10px 12px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
		font-size: 13px;
		line-height: 1.55;
	}
	.kd-warn :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--orca-warn);
	}
	.kd-rendered {
		display: grid;
		gap: 10px;
		margin-top: 16px;
		padding: 14px 16px;
		border: 1px solid var(--orca-ok-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
	}
	.kd-rendered summary {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		cursor: pointer;
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
			flex: 1;
			justify-content: center;
		}
		.kd-card {
			padding: 18px 16px;
		}
	}
	/* W0: every page's H1 is 24, and 20 on a phone. */
	@media (max-width: 720px) {
		.kd-title h1 {
			font-size: 20px;
		}
	}
</style>
