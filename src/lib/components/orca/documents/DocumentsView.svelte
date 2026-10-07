<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		classifyTemplate,
		docTemplatesOn,
		expiryText,
		liveDocuments,
		reportLine,
		templateFileText,
		versionStateText,
		workingVersion
	} from '$lib/orca/doc-templates';
	import { saveBlob } from '$lib/download';
	import { term } from '$lib/orca/glossary';
	import { BookOpen, Download, FileSpreadsheet, Files, Upload, Zap } from '@lucide/svelte';
	import { getHttpStatusCode } from '$lib/errors';
	import { ORCA_SUPPORT_LINE_ID } from '$lib/orca/support';
	import { formatBytes, libraryScope } from '$lib/orca/knowledge';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { displayDate, memberName, orcaError, type OrcaBootstrap } from '$lib/services/orca';
	import { OrcaDocTemplateService, type DocTemplate, type GeneratedDocument } from '$lib/services/orca-doc-templates';
	import { untrack } from 'svelte';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import DocTemplateReview from './DocTemplateReview.svelte';

	// view=documents (kv2 phase 2a P5): เทมเพลตเอกสาร, the company forms AI
	// fills, and เอกสารที่สร้าง, the files it made. A manager adds and sets up
	// templates; everyone sees the files they made; a manager also sees
	// everyone's, without names or contents, and opens one only through the
	// audited ตรวจเอกสาร. The server checks every right again.
	let { data, hubID, templateID }: { data: OrcaBootstrap; hubID: string; templateID: string } = $props();

	const on = $derived(docTemplatesOn(data));
	const scope = $derived(libraryScope({ hubs: data.hubs, currentUserID: data.currentUserID, canManage: data.canManage, requestedID: hubID || undefined }));
	const hub = $derived(scope.kind === 'hub' ? scope.hub : undefined);

	let tab = $state<'templates' | 'files'>('templates');
	let templates = $state<DocTemplate[]>([]);
	let mine = $state<GeneratedDocument[]>([]);
	let everyone = $state<GeneratedDocument[]>([]);
	let loaded = $state('');
	let error = $state('');
	let uploading = $state(false);
	let uploadError = $state('');
	let removing = $state<GeneratedDocument>();
	let removeBusy = $state(false);
	const now = Date.now();
	let request = 0;

	async function load(id: string) {
		const number = ++request;
		error = '';
		try {
			const [list, files, managed] = await Promise.all([
				OrcaDocTemplateService.list(id),
				OrcaDocTemplateService.documents(id),
				data.canManage ? OrcaDocTemplateService.managed(id).catch(() => [] as GeneratedDocument[]) : Promise.resolve([] as GeneratedDocument[])
			]);
			if (number !== request) return;
			templates = list;
			mine = liveDocuments(files, Date.now());
			everyone = liveDocuments(managed, Date.now());
			loaded = id;
		} catch (cause) {
			if (number === request) error = orcaError(cause);
		}
	}
	$effect(() => {
		const id = hub?.id;
		if (id && on) untrack(() => void load(id));
	});

	// The other tabs of คลังความรู้, on its own page (the entry link's kind).
	const knowledgeHref = (kind: 'knowledge' | 'file' | 'template') =>
		localeHref(`/app?view=knowledge&hub=${encodeURIComponent(hub?.id ?? '')}&kind=${kind}`);
	// W0: status is ink text with a dot, never a pill.
	const stateDot = (state: string) => (state === 'published' ? 'ok' : state === 'refused' ? 'bad' : state === 'confirmed' ? 'plain' : 'ring');
	const hrefFor = (template?: string) =>
		localeHref(`/app?view=documents&hub=${encodeURIComponent(hub?.id ?? '')}${template ? `&template=${encodeURIComponent(template)}` : ''}`);

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !hub || uploading) return;
		const check = classifyTemplate(file.name, file.size);
		if (!check.ok) {
			uploadError = templateFileText(check.reason, t);
			return;
		}
		uploading = true;
		uploadError = '';
		try {
			const template = await OrcaDocTemplateService.upload(hub.id, file);
			await goto(hrefFor(template.id));
		} catch (cause) {
			uploadError = orcaError(cause);
		} finally {
			uploading = false;
		}
	}

	async function removeDocument() {
		if (!removing || removeBusy) return;
		removeBusy = true;
		try {
			await OrcaDocTemplateService.removeDocument(removing.id);
			mine = mine.filter((doc) => doc.id !== removing!.id);
			showToast(t('ลบไฟล์แล้ว', 'File deleted'));
		} catch (cause) {
			showToast(orcaError(cause), { tone: 'error' });
		} finally {
			removeBusy = false;
			removing = undefined;
		}
	}

	const person = (id?: string) => {
		const member = data.members.find((m) => m.id === id);
		return member ? memberName(member) : t('คนที่ออกไปแล้ว', 'Someone who left');
	};

	// A file, after a click, through the request layer like every other request
	// (as the library's originals, Codex PC1 review 2 MAJOR 2): a suspended or
	// closed company's 423 stops the page there, which opens the suspended
	// page; a plain link's answer never reached the page.
	let fetching = $state('');
	async function save(doc: GeneratedDocument, inspect: boolean) {
		if (fetching || !hub) return;
		fetching = doc.id;
		try {
			const file = inspect ? await OrcaDocTemplateService.inspect(hub.id, doc.id) : await OrcaDocTemplateService.download(doc.id);
			saveBlob(file.blob, file.fileName);
		} catch (cause) {
			if (getHttpStatusCode(cause) === 423) return;
			showToast(orcaError(cause), { tone: 'error' });
		} finally {
			fetching = '';
		}
	}
</script>

{#if !on}
	<PageHeader title={term('knowledge', t)} subtitle={t('ข้อมูลที่ AI ของทีมใช้ตอบคำถาม', 'What your team’s AI answers from')} />
	<p class="dc-panel">{t(`เทมเพลตเอกสารยังไม่เปิดให้บริษัทนี้ ติดต่อทีม ORCA ทาง LINE ${ORCA_SUPPORT_LINE_ID}`, `Document templates are not on for this company. Contact the ORCA team on LINE ${ORCA_SUPPORT_LINE_ID}.`)}</p>
{:else if !hub}
	<PageHeader title={term('knowledge', t)} subtitle={t('ข้อมูลที่ AI ของทีมใช้ตอบคำถาม', 'What your team’s AI answers from')} />
	<p class="dc-panel">{t('เปิดคลังความรู้เพื่อเลือกพื้นที่ทำงาน AI ก่อน', 'Open Knowledge to choose an AI workspace first.')} <a href={localeHref('/app?view=knowledge')}>{t('เปิดคลังความรู้', 'Open Knowledge')}</a></p>
{:else if templateID && data.canManage}
	{#key templateID}
		<DocTemplateReview {data} {hub} {templateID} onback={() => void goto(hrefFor())} onchanged={() => void load(hub!.id)} />
	{/key}
{:else}
	<!-- W0: เอกสาร is a tab of คลังความรู้: the same header and type tabs, its own page. -->
	<div class="dc">
		<PageHeader title={term('knowledge', t)} subtitle={t('ฟอร์มของบริษัทที่ AI กรอกให้ และไฟล์ที่ได้', 'Company forms AI fills, and the files it made')}>
			{#snippet action()}
				{#if data.canManage && tab === 'templates'}
					<label class="k-button dc-upload" aria-disabled={uploading}>
						<input type="file" accept=".xlsx" onchange={upload} disabled={uploading} /><Upload size={16} strokeWidth={2.3} aria-hidden="true" />{uploading ? t('กำลังอัปโหลด…', 'Uploading…') : t('เพิ่มเทมเพลต', 'Add a template')}
					</label>
				{/if}
			{/snippet}
		</PageHeader>

		<nav class="dc-kinds" aria-label={t('ประเภท', 'Type')}>
			<a href={knowledgeHref('knowledge')}><BookOpen size={16} aria-hidden="true" />{t('บทความ', 'Articles')}</a>
			<a href={knowledgeHref('file')}><Files size={16} aria-hidden="true" />{t('ไฟล์', 'Files')}</a>
			<a href={knowledgeHref('template')}><Zap size={16} aria-hidden="true" />{term('readyPrompt', t)}</a>
			<a class="on" href={hrefFor()} aria-current="page"><FileSpreadsheet size={16} aria-hidden="true" />{t('เอกสาร', 'Documents')}</a>
		</nav>

		<div class="dc-tabs" role="group" aria-label={t('เอกสาร', 'Documents')}>
			<button type="button" aria-pressed={tab === 'templates'} class:on={tab === 'templates'} onclick={() => (tab = 'templates')}>{t('เทมเพลต', 'Templates')}</button>
			<button type="button" aria-pressed={tab === 'files'} class:on={tab === 'files'} onclick={() => (tab = 'files')}>{t('ไฟล์ที่สร้าง', 'Made files')}</button>
		</div>

		{#if uploadError}<p class="dc-alert" role="alert">{uploadError}</p>{/if}
		{#if error}<p class="dc-alert" role="alert">{error}</p>{/if}

		{#if loaded !== hub.id && !error}
			<p class="dc-muted">{t('กำลังโหลด…', 'Loading…')}</p>
		{:else if tab === 'templates'}
			{#if templates.length}
				<ul class="dc-list">
					{#each templates as template (template.id)}
						{@const version = workingVersion(template)}
						<li>
							<div class="dc-main">
								{#if data.canManage}<a class="dc-title" href={hrefFor(template.id)}>{template.title}</a>{:else}<span class="dc-title">{template.title}</span>{/if}
								<span class="dc-sub">{template.whenToUse || (version ? version.originalName : '')}</span>
							</div>
							{#if version}<span class="dc-state"><i class="dot {stateDot(version.state)}" aria-hidden="true"></i>{versionStateText(version.state, t)}</span>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="dc-panel">
					{data.canManage
						? t('เพิ่มไฟล์ Excel ที่ทีมกรอกทุกวัน เช่น Daily Briefing แล้ว ORCA จะหาช่องที่ต้องกรอกให้ AI ทำแทน', 'Add an Excel file your team fills every day, such as a daily briefing. ORCA finds the cells for AI to fill.')
						: t('ยังไม่มีเทมเพลตเอกสารที่คุณใช้ได้', 'No document templates for you yet.')}
				</p>
			{/if}
		{:else}
			<section class="dc-block">
				<h2>{t('ของฉัน', 'Mine')}</h2>
				{#if mine.length}
					<ul class="dc-list">
						{#each mine as doc (doc.id)}
							<li>
								<div class="dc-main">
									<span class="dc-title">{doc.name}</span>
									<span class="dc-sub">{doc.templateTitle ?? ''} · {t('ฉบับ', 'v')} {doc.templateVersion} · {displayDate(doc.readyAt)} · {expiryText(doc.expiresAt, now, t)}</span>
									{#if doc.report}<span class="dc-sub">{reportLine(doc.report, !!doc.reportTruncated, t)}</span>{/if}
								</div>
								<span class="dc-actions">
									<button type="button" class="k-button small" disabled={!!fetching} onclick={() => save(doc, false)}><Download size={15} aria-hidden="true" />{t('ดาวน์โหลด', 'Download')}</button>
									<button type="button" class="k-button quiet small" onclick={() => (removing = doc)}>{t('ลบ', 'Delete')}</button>
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="dc-muted">{t('ยังไม่มีไฟล์ ไฟล์ที่ AI สร้างให้คุณจะอยู่ที่นี่ 30 วัน', 'No files yet. Files AI makes for you stay here for 30 days.')}</p>
				{/if}
			</section>
			{#if data.canManage}
				<section class="dc-block">
					<h2>{t('ของทุกคนในพื้นที่นี้', 'Everyone in this workspace')}</h2>
					<p class="dc-muted">{t('ไม่แสดงชื่อไฟล์และเนื้อหา การเปิดตรวจเอกสารทุกครั้งจะถูกบันทึก', 'Names and contents are hidden. Every inspection is recorded.')}</p>
					{#if everyone.length}
						<ul class="dc-list">
							{#each everyone as doc (doc.id)}
								<li>
									<div class="dc-main">
										<span class="dc-title">{doc.templateTitle ?? ''}</span>
										<span class="dc-sub">{person(doc.requesterID)} · {displayDate(doc.readyAt)} · {formatBytes(doc.bytes)} · {expiryText(doc.expiresAt, now, t)}</span>
									</div>
									<button type="button" class="k-button quiet small" disabled={!!fetching} onclick={() => save(doc, true)}>{t('ตรวจเอกสาร', 'Inspect')}</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="dc-muted">{t('ยังไม่มีไฟล์', 'No files yet')}</p>
					{/if}
				</section>
			{/if}
		{/if}
	</div>
{/if}

<ConfirmDialog
	open={!!removing}
	title={t('ลบไฟล์นี้?', 'Delete this file?')}
	message={t('ลิงก์ไฟล์ในแชทจะเปิดไม่ได้อีก', 'Its link in the chat stops working.')}
	confirmLabel={t('ลบ', 'Delete')}
	cancelLabel={t('ยกเลิก', 'Cancel')}
	tone="danger"
	busy={removeBusy}
	onconfirm={removeDocument}
	oncancel={() => (removing = undefined)}
	ondismiss={() => (removing = undefined)}
/>

<style>
	/* orca-type-remap v1 */
	.dc {
		display: grid;
		gap: 16px;
	}
	/* The type tabs, as คลังความรู้'s own. */
	.dc-kinds {
		display: inline-flex;
		justify-self: start;
		gap: 2px;
		padding: 3px;
		border-radius: 10px;
		background: var(--orca-secondary);
	}
	.dc-kinds a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 7px 14px;
		border-radius: 8px;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.dc-kinds a:hover:not(.on) {
		color: var(--orca-ink);
	}
	.dc-kinds a.on {
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-weight: 600;
		box-shadow:
			0 1px 2px color-mix(in srgb, var(--orca-ink) 8%, transparent),
			0 0 0 1px var(--orca-line);
	}
	/* W0: a chosen tab is underlined in ink, never a black fill. */
	.dc-tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--orca-line-soft);
	}
	.dc-tabs button {
		min-height: 34px;
		padding: 0 8px;
		border: 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		background: transparent;
		color: var(--orca-muted);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.dc-tabs button:hover:not(.on) {
		color: var(--orca-ink);
	}
	.dc-tabs button.on {
		border-bottom-color: var(--orca-ink);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.dc-block {
		display: grid;
		gap: 8px;
	}
	.dc-block h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 650;
	}
	.dc-list {
		margin: 0;
		padding: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		list-style: none;
	}
	.dc-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		padding: 12px 16px;
	}
	.dc-list li + li {
		border-top: 1px solid var(--orca-line-soft);
	}
	.dc-main {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.dc-title {
		overflow-wrap: anywhere;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
	}
	a.dc-title {
		text-decoration: none;
	}
	a.dc-title:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.dc-sub,
	.dc-muted,
	.dc-state {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.dc-state {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 7px;
		color: var(--orca-ink);
		font-weight: 500;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-subtle);
	}
	.dot.ok {
		background: var(--orca-ok);
	}
	.dot.bad {
		background: var(--orca-deny);
	}
	.dot.ring {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--orca-subtle);
		background: transparent;
	}
	.dc-actions {
		display: inline-flex;
		flex: none;
		gap: 8px;
	}
	.dc-panel {
		margin: 0;
		padding: 16px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-size: 13.5px;
		line-height: 1.6;
	}
	.dc-panel a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
	}
	.dc-alert {
		margin: 0;
		padding: 10px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.dc-upload {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.dc-upload input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	@media (max-width: 720px) {
		.dc-list li {
			flex-direction: column;
			align-items: stretch;
		}
		.dc-actions :global(.k-button),
		.dc-list li > :global(.k-button) {
			flex: 1;
			justify-content: center;
		}
		.dc-kinds {
			display: grid;
			grid-template-columns: repeat(4, auto);
			justify-self: stretch;
		}
		.dc-kinds a {
			justify-content: center;
			gap: 6px;
			padding: 7px 4px;
			font-size: 13px;
		}
		.dc-kinds a :global(svg) {
			display: none;
		}
	}
</style>
