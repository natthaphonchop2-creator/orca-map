<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { ArrowLeft, ChevronRight, Info, TriangleAlert } from '@lucide/svelte';
	import { getHttpStatusCode, parseErrorContent } from '$lib/errors';
	import {
		LIBRARY_CONTENT_MAX,
		LIBRARY_SUMMARY_MAX,
		LIBRARY_TITLE_MAX,
		audienceFor,
		audienceMode,
		audiencePeople,
		contentForEditing,
		contentForSaving,
		libraryProblem,
		libraryStale,
		mismatchMessage,
		relativeTime,
		templateMismatches,
		workspaceEveryone,
		type AudienceMode
	} from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import { orcaError, type OrcaHub, type OrcaMember } from '$lib/services/orca';
	import {
		OrcaLibraryService,
		type LibraryDepartment,
		type LibraryInput,
		type LibraryItem,
		type LibraryKind,
		type LibraryParameter,
		type LibraryStatus
	} from '$lib/services/orca-library';
	import AudienceCard from './knowledge/AudienceCard.svelte';
	import ArticlePicker from './knowledge/ArticlePicker.svelte';
	import TemplateBody from './knowledge/TemplateBody.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';
	import FormErrorSummary from './ui/FormErrorSummary.svelte';

	// Adding or editing an article or a ready-made prompt (proposal §3.6
	// screens 3 and 5): the text on the left, "ใครใช้ได้บ้าง" on the right,
	// and two buttons instead of a status list: บันทึกร่าง, เผยแพร่ให้ AI ใช้.
	let {
		hub,
		kind,
		existing,
		initialTitle = '',
		items,
		members,
		departments,
		currentUserID,
		now = Date.now(),
		onsaved,
		onclose,
		ondenied,
		onrecheck = async () => 'denied' as const,
		ondirty
	}: {
		hub: OrcaHub;
		kind: LibraryKind;
		existing?: LibraryItem;
		initialTitle?: string;
		items: LibraryItem[];
		/** The workspace's members, as the library lists them. */
		members: OrcaMember[];
		departments: LibraryDepartment[];
		currentUserID: string;
		now?: number;
		/** `people` is how many people's AI can use a published item. */
		onsaved: (item: LibraryItem, people: number) => void;
		onclose: () => void;
		ondenied: () => void;
		/** After a refused save: whether the library still opens (then its lists are fresh). */
		onrecheck?: () => Promise<'open' | 'denied' | 'unknown'>;
		ondirty: (dirty: boolean) => void;
	} = $props();

	const me = untrack(() => currentUserID);
	// The item being edited, fixed for this editor even if the list reloads.
	const itemID = untrack(() => existing?.id);
	const memberIDs = $derived(members.map((member) => member.id));
	const everyone = $derived(workspaceEveryone(hub, departments, memberIDs, me));
	const available = $derived(items.filter((item) => item.kind === 'knowledge' && item.status === 'published'));

	// The form starts from the saved item. People and departments that left
	// the workspace are dropped: the server would refuse them.
	const start = untrack(() => {
		const known = new Set(members.map((member) => member.id));
		const knownUnits = new Set(departments.map((department) => department.unitID));
		const savedMembers = (existing?.memberIDs ?? []).filter((id) => id !== me && known.has(id));
		const savedUnits = (existing?.unitIDs ?? []).filter((id) => knownUnits.has(id));
		const dropped = (existing?.memberIDs ?? []).filter((id) => id !== me).length + (existing?.unitIDs ?? []).length - savedMembers.length - savedUnits.length;
		const mode: AudienceMode = existing ? audienceMode({ memberIDs: savedMembers, unitIDs: savedUnits }, everyone) : 'everyone';
		const parameters = (existing?.parameters ?? []).map((item) => ({ ...item }));
		return {
			title: existing?.title ?? initialTitle,
			summary: existing?.summary ?? '',
			content: existing ? (kind === 'template' ? contentForEditing(existing.content, parameters) : existing.content) : '',
			parameters,
			knowledgeIDs: [...(existing?.knowledgeIDs ?? [])],
			mode,
			unitIDs: mode === 'everyone' || mode === 'me' ? [...everyone.unitIDs] : savedUnits,
			memberIDs: mode === 'everyone' || mode === 'me' ? [] : savedMembers,
			version: existing?.version ?? 0,
			dropped
		};
	});
	let title = $state(start.title);
	let summary = $state(start.summary);
	let content = $state(start.content);
	let parameters = $state<LibraryParameter[]>(start.parameters);
	let knowledgeIDs = $state(start.knowledgeIDs);
	let mode = $state<AudienceMode>(start.mode);
	let unitIDs = $state(start.unitIDs);
	let chosenMembers = $state(start.memberIDs);
	let summaryOpen = $state(!!start.summary);
	let version = $state(start.version);
	let saving = $state(false);
	let error = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let errorKey = $state(0);
	let conflict = $state(false);
	let latest = $state<LibraryItem>();
	let latestOpen = $state(false);
	let loadingLatest = $state(false);
	let discardOpen = $state(false);

	const selection = $derived(audienceFor(mode, { unitIDs, memberIDs: chosenMembers }, everyone));
	const snapshot = $derived(JSON.stringify({ title, summary, content, parameters, knowledgeIDs, selection }));
	let baseline = $state(untrack(() => snapshot));
	const dirty = $derived(snapshot !== baseline);
	$effect(() => ondirty(dirty || saving));
	onDestroy(() => ondirty(false));

	const people = $derived(audiencePeople({ ownerID: me, ...selection }, departments).size);
	const missingReferences = $derived(knowledgeIDs.filter((id) => !available.some((item) => item.id === id)));
	const chosenArticles = $derived(available.filter((item) => knowledgeIDs.includes(item.id)));
	const mismatches = $derived(
		kind === 'template' && mode !== 'me'
			? templateMismatches({ ownerID: me, ...selection }, chosenArticles, { departments, personName, departmentName }, t)
			: []
	);
	const heading = $derived(
		existing
			? kind === 'template' ? t('แก้ไขคำสั่งสำเร็จรูป', 'Edit ready-made prompt') : t('แก้ไขความรู้', 'Edit knowledge')
			: kind === 'template' ? t('เพิ่มคำสั่งสำเร็จรูป', 'Add a ready-made prompt') : t('เพิ่มความรู้', 'Add knowledge')
	);
	const saveState = $derived(
		!existing
			? t('ยังไม่ได้บันทึก', 'Not saved yet')
			: dirty
				? t('มีการแก้ไขที่ยังไม่ได้บันทึก', 'Unsaved changes')
				: existing.status === 'archived'
					? t('จัดเก็บแล้ว · บันทึกเพื่อนำกลับมาใช้', 'Archived · save to use it again')
					: t(`บันทึกล่าสุด ${relativeTime(existing.updatedAt, now, t)}`, `Saved ${relativeTime(existing.updatedAt, now, t)}`)
	);

	function personName(id: string) {
		if (id === me) return t('คุณ', 'You');
		const member = members.find((item) => item.id === id);
		return member ? member.displayName || member.email : t('สมาชิก', 'Member');
	}
	function departmentName(id: string) {
		return departments.find((item) => item.unitID === id)?.name || t('แผนก', 'Department');
	}
	function back() {
		if (saving) return;
		if (dirty) discardOpen = true;
		else onclose();
	}
	async function save(status: LibraryStatus) {
		if (saving) return;
		error = '';
		const stored = kind === 'template' ? contentForSaving(content, parameters) : { content, unknown: [] };
		const problems: Record<string, string> = {};
		if (!title.trim()) problems['kn-title'] = t('ใส่ชื่อเรื่อง', 'Add a title');
		if (!content.trim()) problems['kn-content'] = kind === 'template' ? t('บอกว่าอยากให้ AI ทำอะไร', 'Say what AI should do') : t('ใส่เนื้อหา', 'Add the content');
		if (stored.unknown.length)
			problems['kn-content'] = t(
				`ยังไม่มีช่องชื่อ ${stored.unknown.map((name) => `{{${name}}}`).join(', ')} กด แทรกช่องให้กรอก เพื่อเพิ่ม หรือลบออกจากข้อความ`,
				`There is no field named ${stored.unknown.map((name) => `{{${name}}}`).join(', ')}. Insert it as a field, or delete it from the text.`
			);
		if (status === 'published' && mode === 'departments' && !unitIDs.length) problems['kn-audience'] = t('เลือกอย่างน้อย 1 แผนก หรือเลือก เฉพาะฉัน', 'Choose at least one department, or Only me');
		if (status === 'published' && mode === 'people' && !chosenMembers.length) problems['kn-audience'] = t('เลือกอย่างน้อย 1 คน หรือเลือก เฉพาะฉัน', 'Choose at least one person, or Only me');
		if (missingReferences.length) problems['kn-articles'] = t('เอาเรื่องที่เลิกเผยแพร่แล้วออกก่อนบันทึก', 'Remove the articles that are no longer published');
		fieldErrors = problems;
		if (Object.keys(problems).length) {
			errorKey += 1;
			return;
		}
		const input: LibraryInput = {
			kind,
			title: title.trim(),
			summary: summary.trim(),
			content: stored.content,
			parameters: kind === 'template' ? parameters.map((item) => ({ ...item, label: item.label.trim() })) : [],
			knowledgeIDs: kind === 'template' ? [...knowledgeIDs] : [],
			memberIDs: selection.memberIDs,
			unitIDs: selection.unitIDs,
			status,
			version
		};
		saving = true;
		try {
			const saved = await OrcaLibraryService.save(hub.id, input, itemID);
			baseline = snapshot;
			onsaved(saved, people);
		} catch (cause) {
			const problem = parseErrorContent(cause);
			if (libraryStale(problem)) {
				// A person, a department or an article changed since the page
				// loaded, or my access did. Only lost access leaves the editor;
				// otherwise the text stays and the lists are fresh again.
				const access = await onrecheck();
				if (access === 'denied') {
					ondenied();
					return;
				}
				if (access === 'open') dropUnknown();
				error = refusal(problem, access, cause);
				return;
			}
			conflict = problem.status === 409;
			error = conflict
				? t('มีคนแก้เรื่องนี้พร้อมกัน (อาจเป็นคุณในอีกแท็บ) ข้อความที่คุณพิมพ์ยังอยู่', 'Someone saved this at the same time (maybe you, in another tab). Your text is kept.')
				: (libraryProblem(problem, t) ?? orcaError(cause));
		} finally {
			saving = false;
		}
	}
	/** What a refused save says, once the lists were checked again. */
	function refusal(problem: { status: number; message: string }, access: 'open' | 'unknown', cause: unknown) {
		if (problem.status === 400 && access === 'open')
			return t(
				'บางคนหรือแผนกที่เลือกไว้ไม่อยู่ในพื้นที่ทำงานนี้แล้ว เอาออกจากรายชื่อให้แล้ว ตรวจ “ใครใช้ได้บ้าง” แล้วบันทึกอีกครั้ง',
				'Some people or departments you chose are no longer in this workspace. They were taken off the list: check “Who can use it” and save again.'
			);
		if (problem.status === 400) return libraryProblem(problem, t) ?? orcaError(cause);
		if (kind === 'template' && knowledgeIDs.length)
			return t(
				'บันทึกไม่ได้ เพราะเรื่องที่ AI อ่านประกอบบางเรื่องเลิกเผยแพร่แล้ว หรือคุณอ่านไม่ได้แล้ว เอาออกแล้วลองอีกครั้ง',
				'Not saved: an article AI reads with it is no longer published, or you can no longer read it. Remove it and try again.'
			);
		return orcaError(cause);
	}
	/** Drops people and departments the fresh lists no longer have (the server would refuse them). */
	function dropUnknown() {
		const known = new Set(members.map((member) => member.id));
		const knownUnits = new Set(departments.map((department) => department.unitID));
		chosenMembers = chosenMembers.filter((id) => known.has(id));
		unitIDs = unitIDs.filter((id) => knownUnits.has(id));
	}
	async function reviewLatest() {
		if (!itemID || loadingLatest) return;
		loadingLatest = true;
		try {
			const result = await OrcaLibraryService.load(hub.id);
			latest = result.items.find((item) => item.id === itemID && item.canEdit);
			if (!latest) {
				ondenied();
				return;
			}
			latestOpen = true;
		} catch (cause) {
			const code = getHttpStatusCode(cause);
			if (code === 403 || code === 404) ondenied();
			else error = orcaError(cause);
		} finally {
			loadingLatest = false;
		}
	}
	function useLatest() {
		if (!latest) return;
		const next = latest;
		title = next.title;
		summary = next.summary;
		parameters = next.parameters.map((item) => ({ ...item }));
		content = kind === 'template' ? contentForEditing(next.content, parameters) : next.content;
		knowledgeIDs = [...next.knowledgeIDs];
		const known = new Set(memberIDs);
		const savedMembers = next.memberIDs.filter((id) => id !== me && known.has(id));
		const savedUnits = next.unitIDs.filter((id) => departments.some((item) => item.unitID === id));
		mode = audienceMode({ memberIDs: savedMembers, unitIDs: savedUnits }, everyone);
		unitIDs = mode === 'everyone' || mode === 'me' ? [...everyone.unitIDs] : savedUnits;
		chosenMembers = mode === 'everyone' || mode === 'me' ? [] : savedMembers;
		version = next.version;
		baseline = snapshot;
		conflict = false;
		error = '';
		latestOpen = false;
	}
	function keepMine() {
		// Keep this text and save over the newer copy next time.
		if (latest) version = latest.version;
		conflict = false;
		error = '';
		latestOpen = false;
	}
</script>

<form class="ed" onsubmit={(event) => event.preventDefault()} aria-labelledby="kn-editor-title">
	<button type="button" class="kn-back" onclick={back} disabled={saving}>
		<ArrowLeft size={15} aria-hidden="true" />{t('คลังความรู้', 'Knowledge')} · {hub.name}
	</button>
	<div class="ed-h">
		<h1 id="kn-editor-title">{heading}</h1>
		<span>{saveState}</span>
	</div>

	<FormErrorSummary errors={fieldErrors} focusKey={errorKey} />
	{#if error}
		<div class="ed-alert" role="alert">
			<TriangleAlert size={16} aria-hidden="true" />
			<p>{error}</p>
			{#if conflict}<button type="button" class="k-button small" disabled={loadingLatest} onclick={reviewLatest}>{loadingLatest ? t('กำลังโหลด…', 'Loading…') : t('ดูฉบับล่าสุด', 'See the latest copy')}</button>{/if}
		</div>
	{/if}
	{#if start.dropped > 0}
		<p class="ed-note"><Info size={15} aria-hidden="true" />{t(`เอา ${start.dropped} คนหรือแผนกที่ไม่อยู่ในพื้นที่ทำงานนี้แล้วออกจากรายชื่อให้`, `Removed ${start.dropped} people or departments no longer in this workspace`)}</p>
	{/if}

	<div class="ed-grid">
		<div class="ed-main">
			<div class="field">
				<label for="kn-title">{t('ชื่อเรื่อง', 'Title')}</label>
				<input
					id="kn-title"
					class="kn-input"
					bind:value={title}
					required
					maxlength={LIBRARY_TITLE_MAX}
					disabled={saving}
					aria-invalid={fieldErrors['kn-title'] ? 'true' : undefined}
					placeholder={kind === 'template' ? t('เช่น สรุปยอดขายประจำวัน', 'e.g. Daily sales summary') : t('เช่น การรับประกันสินค้า', 'e.g. Product warranty')}
				/>
			</div>

			{#if kind === 'knowledge'}
				<div class="field kn-grow">
					<label for="kn-content">{t('เนื้อหา', 'Content')}</label>
					<textarea
						id="kn-content"
						class="ta"
						bind:value={content}
						required
						maxlength={LIBRARY_CONTENT_MAX}
						disabled={saving}
						aria-invalid={fieldErrors['kn-content'] ? 'true' : undefined}
						placeholder={t('เช่น สินค้าทุกชิ้นรับประกัน 1 ปี นับจากวันที่ในใบกำกับภาษี…', 'e.g. Every product has a one-year warranty from the invoice date…')}
					></textarea>
					<div class="ta-f">
						<span>{t('เขียนเหมือนอธิบายให้พนักงานใหม่ฟัง AI จะตอบได้ตรงขึ้น', 'Write it as you would explain it to a new hire')}</span>
						<span>{t(`${content.length.toLocaleString('en-US')} / 40,000 ตัวอักษร`, `${content.length.toLocaleString('en-US')} / 40,000 characters`)}</span>
					</div>
				</div>
			{:else}
				<div class="field kn-grow">
					<TemplateBody id="kn-content" bind:text={content} bind:parameters disabled={saving} invalid={!!fieldErrors['kn-content']} />
				</div>
				<div class="field" id="kn-articles" tabindex="-1">
					<ArticlePicker id="kn-articles-search" articles={available} bind:selected={knowledgeIDs} disabled={saving} />
					{#if missingReferences.length}
						<p class="ed-warn">
							<TriangleAlert size={15} aria-hidden="true" />
							<span>{t(`${missingReferences.length} เรื่องที่เลือกไว้เลิกเผยแพร่แล้ว`, `${missingReferences.length} chosen articles are no longer published`)}</span>
							<button type="button" class="k-button small" onclick={() => (knowledgeIDs = knowledgeIDs.filter((id) => !missingReferences.includes(id)))}>{t('เอาออก', 'Remove')}</button>
						</p>
					{/if}
					{#each mismatches as mismatch (mismatch.articleID)}
						<p class={'unknown' in mismatch ? 'ed-note' : 'ed-warn'}>
							{#if 'unknown' in mismatch}<Info size={15} aria-hidden="true" />{:else}<TriangleAlert size={15} aria-hidden="true" />{/if}
							<span>{mismatchMessage(mismatch, t)}</span>
						</p>
					{/each}
				</div>
			{/if}

			<div class="disc-wrap">
				<button type="button" class="disc" aria-expanded={summaryOpen} aria-controls="kn-summary-panel" onclick={() => (summaryOpen = !summaryOpen)}>
					<ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />{t('คำอธิบายสั้น (ช่วยให้ AI หาเจอ)', 'Short description (helps AI find it)')}<span class="muted">{t('ไม่บังคับ', 'Optional')}</span>
				</button>
				{#if summaryOpen}
					<div id="kn-summary-panel" class="disc-panel">
						<label class="kn-sr" for="kn-summary">{t('คำอธิบายสั้น', 'Short description')}</label>
						<textarea
							id="kn-summary"
							class="kn-input short"
							rows="2"
							bind:value={summary}
							maxlength={LIBRARY_SUMMARY_MAX}
							disabled={saving}
							placeholder={t('เช่น เงื่อนไขการคืนสินค้าและระยะเวลาที่ลูกค้าขอคืนได้', 'e.g. When customers can return a product, and for how long')}
						></textarea>
					</div>
				{/if}
			</div>
		</div>

		<div class="ed-side" id="kn-audience" tabindex="-1">
		<AudienceCard
			{kind}
			bind:mode
			bind:unitIDs
			bind:memberIDs={chosenMembers}
			{everyone}
			{departments}
			{members}
			{me}
			disabled={saving}
		>
			{#snippet actions()}
				<button type="button" class="k-button ed-draft" disabled={saving || conflict} onclick={() => save('draft')}>{t('บันทึกร่าง', 'Save draft')}</button>
				<button type="button" class="k-button primary ed-publish" disabled={saving || conflict} aria-busy={saving} onclick={() => save('published')}>{saving ? t('กำลังบันทึก…', 'Saving…') : t('เผยแพร่ให้ AI ใช้', 'Publish for AI')}</button>
			{/snippet}
		</AudienceCard>
		</div>
	</div>
</form>

<ConfirmDialog
	bind:open={discardOpen}
	title={t('ออกโดยไม่บันทึก?', 'Leave without saving?')}
	message={t('สิ่งที่แก้ไว้ในหน้านี้จะหายไป', 'What you changed here will be lost.')}
	confirmLabel={t('ออกโดยไม่บันทึก', 'Leave without saving')}
	cancelLabel={t('แก้ต่อ', 'Keep editing')}
	tone="danger"
	onconfirm={() => {
		discardOpen = false;
		baseline = snapshot;
		onclose();
	}}
/>

<ConfirmDialog
	bind:open={latestOpen}
	title={t('ฉบับล่าสุดที่บันทึกไว้', 'The latest saved copy')}
	message={t('ใช้ฉบับนี้แทนข้อความของคุณ หรือเก็บข้อความของคุณแล้วบันทึกทับ', 'Use this copy instead of your text, or keep your text and save over it.')}
	confirmLabel={t('ใช้ฉบับล่าสุด', 'Use the latest copy')}
	cancelLabel={t('เก็บข้อความของฉัน', 'Keep my text')}
	onconfirm={useLatest}
	oncancel={keepMine}
>
	{#if latest}
		<div class="latest">
			<b>{latest.title}</b>
			<pre>{latest.content}</pre>
		</div>
	{/if}
</ConfirmDialog>

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
	.kn-back:hover:not(:disabled) {
		color: var(--orca-ink);
	}
	.ed-h {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin: 0 0 20px;
	}
	.ed-h h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		line-height: 1.35;
	}
	.ed-h span {
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.ed-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 392px;
		gap: 20px;
		align-items: stretch;
	}
	/* The audience card stays in view beside a long prompt. */
	.ed-side:focus {
		outline: 0;
	}
	.ed-side {
		position: sticky;
		top: 80px;
		align-self: start;
		min-width: 0;
	}
	.ed-main {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
		padding: 22px 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.field label {
		display: block;
		margin-bottom: 6px;
		font-size: 14px;
		font-weight: 600;
	}
	.field.kn-grow {
		display: flex;
		flex: 1;
		flex-direction: column;
	}
	.field:focus {
		outline: 0;
	}
	.kn-input,
	.ta {
		width: 100%;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
	}
	.kn-input {
		min-height: 46px;
		padding: 11px 12px;
		font-size: 15px;
	}
	.kn-input.short {
		min-height: 0;
		font-size: 14.5px;
		line-height: 1.6;
		resize: vertical;
	}
	.ta {
		flex: 1;
		min-height: 260px;
		max-height: 70vh;
		field-sizing: content;
		padding: 12px 14px;
		font-size: 14.5px;
		line-height: 1.8;
		resize: vertical;
	}
	.kn-input:focus-visible,
	.ta:focus-visible {
		border-color: var(--orca-focus);
		outline: 0 !important;
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.kn-input[aria-invalid='true'],
	.ta[aria-invalid='true'] {
		border-color: var(--orca-deny);
	}
	.ta-f {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 16px;
		margin-top: 6px;
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
	.disc-wrap {
		display: grid;
		gap: 10px;
	}
	.disc {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		justify-self: start;
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: var(--orca-text-2);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.disc :global(svg) {
		transition: transform 0.15s var(--orca-ease);
	}
	.disc[aria-expanded='true'] :global(svg) {
		transform: rotate(90deg);
	}
	.disc .muted {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 400;
	}
	.ed-alert,
	.ed-warn,
	.ed-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin: 0 0 16px;
		padding: 10px 14px;
		border-radius: var(--orca-radius-lg);
		font-size: 13.5px;
		line-height: 1.5;
	}
	.ed-alert {
		border: 1px solid var(--orca-deny-line);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
	}
	.ed-alert :global(svg) {
		color: var(--orca-deny);
	}
	.ed-alert p {
		flex: 1 1 240px;
		margin: 0;
	}
	.ed-warn {
		margin: 10px 0 0;
		border: 1px solid var(--orca-warn-line);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
	}
	.ed-warn :global(svg) {
		flex: none;
		color: var(--orca-warn);
	}
	.ed-note {
		border: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
	}
	.field .ed-note {
		margin: 10px 0 0;
	}
	.ed-warn span,
	.ed-note span {
		flex: 1 1 200px;
	}
	.ed-draft {
		flex: 1;
		min-height: 44px !important;
		justify-content: center;
		font-weight: 600 !important;
	}
	.ed-publish {
		flex: 1.5;
		min-height: 44px !important;
		justify-content: center;
		font-weight: 600 !important;
	}
	.latest {
		margin-top: 14px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
	}
	.latest pre {
		max-height: 220px;
		margin: 6px 0 0;
		overflow: auto;
		color: var(--orca-text-2);
		font-family: inherit;
		font-size: 13.5px;
		white-space: pre-wrap;
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
		.ed-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.ed-side {
			position: static;
		}
	}
	@media (max-width: 720px) {
		.ed-main {
			padding: 18px 16px;
		}
		.ta {
			min-height: 220px;
		}
	}
</style>
