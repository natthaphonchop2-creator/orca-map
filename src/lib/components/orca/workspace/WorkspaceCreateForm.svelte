<script lang="ts">
	import { connectionReady } from '$lib/orca/activation';
	import { currentCompany } from '$lib/orca/company';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		DEFAULT_DAILY_LIMIT,
		FORM_FIELDS,
		allowedTools,
		audienceCount,
		formChangesData,
		formSummaryParts,
		newHubInput,
		saveFormDraft,
		takeFormDraft,
		workspaceFormErrors,
		type WorkspaceForm
	} from '$lib/orca/workspace-edit';
	import { OrcaLibraryService, type LibraryDepartment } from '$lib/services/orca-library';
	import { OrcaService, type OrcaBootstrap, type OrcaHub } from '$lib/services/orca';
	import { workspaceWriteError } from '$lib/services/orca-workspaces';
	import { ChevronDown, Info, LoaderCircle, Plus, Users } from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import FormErrorSummary from '../ui/FormErrorSummary.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import AudiencePicker from './AudiencePicker.svelte';
	import FormSection from './FormSection.svelte';
	import ProgramToggleCard from './ProgramToggleCard.svelte';
	import ToolNarrowSheet from './ToolNarrowSheet.svelte';
	import WriteModeChoice from './WriteModeChoice.svelte';

	// view=new: the short create form (proposal §3.5 screen 2, mockup
	// workspace-new). One page: name, programs, who can use it, what happens
	// when AI would change data; the rest waits under "ตั้งค่าเพิ่มเติม".
	let {
		data,
		initialConnectionID = '',
		onsaved
	}: {
		/** The company's live records (no archived ones). */
		data: OrcaBootstrap;
		/** ?connection=: turned on whatever the number of programs. */
		initialConnectionID?: string;
		onsaved: (hub: OrcaHub) => Promise<void>;
	} = $props();

	function sessionStore() {
		try {
			return typeof window === 'undefined' ? undefined : window.sessionStorage;
		} catch {
			return undefined;
		}
	}
	const allowedNames = (id: string) => allowedTools(data.connections.find((item) => item.id === id)).map((tool) => tool.name);
	// A form left to add a program comes back as it was, with that program on.
	const start = untrack((): WorkspaceForm => {
		const restored = takeFormDraft(sessionStore(), currentCompany());
		const form: WorkspaceForm = restored ?? {
			name: '',
			description: '',
			instructions: '',
			dailyLimit: DEFAULT_DAILY_LIMIT,
			writeMode: 'approval',
			programs: {},
			memberIDs: data.members.some((member) => member.id === data.currentUserID) ? [data.currentUserID] : [],
			accessUnitIDs: []
		};
		const requested = data.connections.find((item) => item.id === initialConnectionID);
		if (requested && connectionReady(requested) && !form.programs[requested.id]) form.programs = { ...form.programs, [requested.id]: allowedNames(requested.id) };
		return form;
	});
	let name = $state(start.name);
	let description = $state(start.description);
	let instructions = $state(start.instructions);
	let dailyLimit = $state<number | undefined>(start.dailyLimit);
	let writeMode = $state<'approval' | 'direct'>(start.writeMode);
	let programs = $state<Record<string, string[]>>(start.programs);
	let memberIDs = $state<string[]>(start.memberIDs);
	let accessUnitIDs = $state<string[]>(start.accessUnitIDs);
	let moreOpen = $state(Boolean(start.description || start.instructions || start.dailyLimit !== DEFAULT_DAILY_LIMIT));
	let departments = $state<LibraryDepartment[]>([]);
	let narrowID = $state('');
	let narrowOpen = $state(false);
	let attempt = $state<'active' | 'draft'>();
	let focusKey = $state(0);
	let busy = $state<'active' | 'draft'>();
	let serverError = $state('');

	const form = $derived<WorkspaceForm>({ name, description, instructions, dailyLimit, writeMode, programs, memberIDs, accessUnitIDs });
	const readyPrograms = $derived(data.connections.filter((item) => connectionReady(item) || programs[item.id]));
	const errors = $derived(attempt ? workspaceFormErrors(form, data, attempt, t) : {});
	const errorList = $derived([
		...Object.entries(errors).map(([field, message]) => ({ field, message })),
		...(serverError ? [{ message: serverError }] : [])
	]);
	const changesData = $derived(formChangesData(programs, data.connections));
	const counts = $derived(Object.fromEntries(departments.map((item) => [item.unitID, item.memberIDs.length])));
	const people = $derived(audienceCount(memberIDs, accessUnitIDs, departments));
	const summary = $derived(formSummaryParts(form, data.connections, people, t));
	const selectedNames = $derived(
		Object.keys(programs)
			.map((id) => data.connections.find((item) => item.id === id)?.name)
			.filter((value): value is string => !!value)
	);
	const narrowConnection = $derived(data.connections.find((item) => item.id === narrowID));

	onMount(() => {
		let cancelled = false;
		// Department sizes for the chips and the footer; the form works without them.
		if (data.canManage)
			void OrcaLibraryService.departments()
				.then((items) => {
					if (!cancelled) departments = items;
				})
				.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	function edited() {
		serverError = '';
	}
	function toggleProgram(id: string) {
		if (busy) return;
		if (programs[id]) {
			const next = { ...programs };
			delete next[id];
			programs = next;
		} else programs = { ...programs, [id]: allowedNames(id) };
		edited();
	}
	function adjust(id: string) {
		narrowID = id;
		narrowOpen = true;
	}
	function keepDraft() {
		saveFormDraft(sessionStore(), currentCompany(), $state.snapshot(form) as WorkspaceForm);
	}
	async function submit(mode: 'active' | 'draft') {
		if (busy) return;
		attempt = mode;
		serverError = '';
		const found = workspaceFormErrors(form, data, mode, t);
		if (Object.keys(found).length) {
			if (found[FORM_FIELDS.limit] || found[FORM_FIELDS.description] || found[FORM_FIELDS.instructions]) moreOpen = true;
			focusKey += 1;
			return;
		}
		busy = mode;
		let saved: OrcaHub | undefined;
		try {
			saved = await OrcaService.hub(newHubInput($state.snapshot(form) as WorkspaceForm, mode));
		} catch (cause) {
			serverError = workspaceWriteError(cause);
			focusKey += 1;
		} finally {
			busy = undefined;
		}
		if (saved) {
			try {
				await onsaved(saved);
			} catch {
				serverError = t('สร้างแล้ว แต่เปิดหน้าพื้นที่ทำงานไม่สำเร็จ ดูได้ที่รายการพื้นที่ทำงาน AI', 'Created, but its page did not open. Find it under AI workspaces.');
			}
		}
	}
</script>

<PageHeader
	back={{ href: localeHref('/app?view=workspaces'), label: t('พื้นที่ทำงาน AI', 'AI workspaces') }}
	title={t('สร้างพื้นที่ทำงาน AI', 'New AI workspace')}
	subtitle={t('เลือกโปรแกรมและคนที่ใช้ได้ Claude หรือ ChatGPT ของทุกคนจะเห็นพื้นที่นี้เอง', "Choose programs and people. Everyone's Claude or ChatGPT will see it by itself.")}
/>

<form
	class="ws-form"
	novalidate
	onsubmit={(event) => {
		event.preventDefault();
		void submit('active');
	}}
>
	<FormErrorSummary errors={errorList} {focusKey} />

	<div class="ws-sections">
		<FormSection id="ws-name-title" title={t('ชื่อพื้นที่ทำงาน', 'Workspace name')} hint={t('ทีมและ AI จะเห็นชื่อนี้ ตั้งให้เข้าใจง่าย', 'Your team and AI see this name. Keep it plain.')}>
			<div class="ws-field ws-name">
				<input
					id={FORM_FIELDS.name}
					class="ws-input"
					class:invalid={!!errors[FORM_FIELDS.name]}
					bind:value={name}
					maxlength="120"
					autocomplete="off"
					placeholder={t('เช่น ฝ่ายบัญชี', 'e.g. Accounting')}
					aria-labelledby="ws-name-title"
					aria-invalid={errors[FORM_FIELDS.name] ? 'true' : undefined}
					aria-describedby={errors[FORM_FIELDS.name] ? `${FORM_FIELDS.name}-error` : undefined}
					oninput={edited}
				/>
				{#if errors[FORM_FIELDS.name]}<p class="ws-error" id={`${FORM_FIELDS.name}-error`}>{errors[FORM_FIELDS.name]}</p>{/if}
			</div>
		</FormSection>

		<FormSection id="ws-programs-title" title={t('โปรแกรมที่ใช้ได้', 'Programs')} hint={t('AI ในพื้นที่นี้ใช้ได้เฉพาะโปรแกรมที่เปิดไว้', 'AI here uses only the programs turned on.')}>
			<div class="ws-programs" id={FORM_FIELDS.programs} tabindex="-1" role="group" aria-labelledby="ws-programs-title" aria-describedby={errors[FORM_FIELDS.programs] ? `${FORM_FIELDS.programs}-error` : undefined}>
				{#each readyPrograms as connection (connection.id)}
					<ProgramToggleCard
						{connection}
						on={!!programs[connection.id]}
						toolNames={programs[connection.id] ?? []}
						problem={connectionReady(connection) ? '' : t('ยังใช้ไม่ได้ ปิดโปรแกรมนี้', "Can't be used yet. Turn it off.")}
						disabled={!!busy}
						ontoggle={() => toggleProgram(connection.id)}
						onadjust={connectionReady(connection) ? () => adjust(connection.id) : undefined}
					/>
				{/each}
				<a class="ws-add-program" href={localeHref('/app?view=add-program&return=new')} onclick={keepDraft}>
					<span class="ws-add-plus" aria-hidden="true"><Plus size={16} strokeWidth={2.2} /></span>
					<b>{t('เชื่อมโปรแกรมใหม่', 'Connect a new program')}</b>
					<span>{t('เชื่อมเสร็จแล้วจะเปิดใช้ที่นี่ให้เลย', "Once connected, it's turned on here.")}</span>
				</a>
			</div>
			{#if errors[FORM_FIELDS.programs]}<p class="ws-error" id={`${FORM_FIELDS.programs}-error`}>{errors[FORM_FIELDS.programs]}</p>{/if}
			{#if selectedNames.length}<p class="ws-info"><Info size={15} aria-hidden="true" />{t(`แต่ละคนต้องมีบัญชี ${selectedNames.join(' และ ')} ของตัวเอง และเข้าสู่ระบบเองเมื่อเริ่มใช้`, `Each person needs their own ${selectedNames.join(' and ')} account and signs in when they start.`)}</p>{/if}
		</FormSection>

		<FormSection id="ws-people-title" title={t('ใครใช้ได้', 'Who can use it')} hint={t('เฉพาะคนที่เลือกจะเห็นพื้นที่นี้ใน AI ของตัวเอง', 'Only the people chosen see it in their own AI.')}>
			<AudiencePicker
				id={FORM_FIELDS.people}
				members={data.members}
				units={data.units}
				currentUserID={data.currentUserID}
				bind:memberIDs
				bind:accessUnitIDs
				departmentCounts={departments.length ? counts : undefined}
				invalid={!!errors[FORM_FIELDS.people]}
				describedBy={errors[FORM_FIELDS.people] ? `${FORM_FIELDS.people}-error` : undefined}
				disabled={!!busy}
				onchange={edited}
			/>
			{#if errors[FORM_FIELDS.people]}<p class="ws-error" id={`${FORM_FIELDS.people}-error`}>{errors[FORM_FIELDS.people]}</p>{/if}
		</FormSection>

		<FormSection id="ws-write-title" quiet={!changesData} title={t('เมื่อ AI จะสร้างหรือแก้ข้อมูล', 'When AI would create or change data')} hint={t('เลือกว่าต้องรอคุณอนุมัติก่อนหรือไม่', 'Choose whether it waits for your approval.')}>
			<WriteModeChoice
				bind:value={writeMode}
				quiet={!changesData}
				noteTitle={Object.keys(programs).length ? t('ไม่มีผล เพราะเลือกอ่านอย่างเดียว', 'No effect: everything chosen only reads') : t('ยังไม่มีผล', 'No effect yet')}
				note={t('จะใช้เมื่อเปิดโปรแกรมที่ AI แก้ข้อมูลได้', 'It applies once a program that can change data is on.')}
				disabled={!!busy}
			/>
		</FormSection>

		<FormSection id="ws-more-title" title={t('ตั้งค่าเพิ่มเติม', 'More settings')} note={t('(ใส่ทีหลังได้)', '(optional)')} hint={t('ไม่ใส่ก็สร้างได้ แก้ภายหลังในแท็บ “ตั้งค่า”', 'Skip it now; change it later under “Settings”.')}>
			<button type="button" class="ws-disclosure" aria-expanded={moreOpen} aria-controls="ws-more" onclick={() => (moreOpen = !moreOpen)}>
				<span class="ws-disclosure-items">
					<span>{t('คำอธิบาย', 'Description')}</span><span>{t('คำแนะนำสำหรับ AI', 'Guidance for AI')}</span><span>{t('จำกัดการใช้ต่อวัน', 'Daily limit')}</span>
				</span>
				<span class="ws-disclosure-open">{moreOpen ? t('ซ่อน', 'Hide') : t('แสดง', 'Show')}<ChevronDown size={16} aria-hidden="true" /></span>
			</button>
			<div class="ws-more" id="ws-more" hidden={!moreOpen}>
				<div class="ws-field">
					<label for={FORM_FIELDS.description}>{t('คำอธิบาย', 'Description')}</label>
					<textarea id={FORM_FIELDS.description} class="ws-input" rows="2" maxlength="4000" bind:value={description} placeholder={t('เช่น ดูใบแจ้งหนี้และเอกสารของฝ่ายบัญชี', 'e.g. Invoices and documents for accounting')} oninput={edited}></textarea>
					{#if errors[FORM_FIELDS.description]}<p class="ws-error">{errors[FORM_FIELDS.description]}</p>{/if}
				</div>
				<div class="ws-field">
					<label for={FORM_FIELDS.instructions}>{t('คำแนะนำสำหรับ AI', 'Guidance for AI')}</label>
					<textarea id={FORM_FIELDS.instructions} class="ws-input" rows="3" maxlength="4000" bind:value={instructions} placeholder={t('เช่น ตอบเป็นภาษาไทย อ้างเลขที่เอกสารทุกครั้ง', 'e.g. Reply in Thai and cite document numbers.')} aria-describedby="ws-instructions-hint" oninput={edited}></textarea>
					<p class="ws-hint" id="ws-instructions-hint">{t('ส่งให้ AI ทุกครั้งที่ใช้พื้นที่นี้ ไม่เพิ่มสิทธิ์ใด ๆ', 'Sent to AI each time; it never adds access.')}</p>
					{#if errors[FORM_FIELDS.instructions]}<p class="ws-error">{errors[FORM_FIELDS.instructions]}</p>{/if}
				</div>
				<div class="ws-field ws-limit">
					<label for={FORM_FIELDS.limit}>{t('จำกัดการใช้ต่อวัน', 'Daily limit')}</label>
					<div class="ws-limit-row">
						<input id={FORM_FIELDS.limit} class="ws-input" class:invalid={!!errors[FORM_FIELDS.limit]} type="number" min="1" max="1000000" step="1" inputmode="numeric" bind:value={dailyLimit} aria-describedby="ws-limit-hint" aria-invalid={errors[FORM_FIELDS.limit] ? 'true' : undefined} oninput={edited} />
						<span>{t('ครั้งต่อวัน', 'uses a day')}</span>
					</div>
					<p class="ws-hint" id="ws-limit-hint">{t('ทุกคนในพื้นที่นี้ใช้ร่วมกัน เริ่มนับใหม่ทุกวันตามเวลาประเทศไทย', 'Shared by everyone here; resets daily, Bangkok time.')}</p>
					{#if errors[FORM_FIELDS.limit]}<p class="ws-error">{errors[FORM_FIELDS.limit]}</p>{/if}
				</div>
			</div>
		</FormSection>
	</div>

	<div class="ws-bar">
		<span class="ws-bar-icon" aria-hidden="true"><Users size={18} /></span>
		<!-- Not a live region: the name is typed into it one key at a time. -->
		<div class="ws-bar-copy">
			<b>{#each summary as part, index (index)}{#if index}<span class="ws-dot" aria-hidden="true">·</span>{/if}{part}{/each}</b>
			<span>{t('ใครเชื่อม AI กับ ORCA ไว้แล้ว จะเห็นพื้นที่นี้ทันทีหลังสร้าง', 'Anyone already connected to ORCA sees it right after it is created.')}</span>
		</div>
		<div class="ws-bar-actions">
			<button type="button" class="ws-draft" disabled={!!busy} onclick={() => submit('draft')}>{#if busy === 'draft'}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{t('บันทึกเป็นฉบับร่าง', 'Save as draft')}</button>
			<button type="submit" class="ws-create" disabled={!!busy}>{#if busy === 'active'}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{busy === 'active' ? t('กำลังสร้าง…', 'Creating…') : t('สร้างพื้นที่ทำงาน', 'Create workspace')}</button>
		</div>
	</div>
</form>

<ToolNarrowSheet bind:open={narrowOpen} connection={narrowConnection} selected={programs[narrowID] ?? []} onapply={(tools) => { programs = { ...programs, [narrowID]: tools }; edited(); }} />

<style>
	.ws-form {
		max-width: 1056px;
		margin-top: -12px;
	}
	.ws-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.ws-field + .ws-field {
		margin-top: 18px;
	}
	.ws-field label {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
	}
	.ws-name {
		max-width: 440px;
	}
	.ws-input {
		width: 100%;
		padding: 11px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-size: 15px;
		line-height: 1.5;
	}
	.ws-name .ws-input {
		padding: 12px 14px;
	}
	.ws-input:hover {
		border-color: var(--orca-field-line-hover, var(--orca-line-hover, var(--orca-field-line)));
	}
	.ws-input:focus {
		border-color: var(--orca-focus);
		outline: none;
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.ws-input.invalid {
		border-color: var(--orca-deny);
	}
	textarea.ws-input {
		resize: vertical;
	}
	.ws-error {
		margin: 6px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
		line-height: 1.5;
	}
	.ws-hint {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ws-programs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		border-radius: var(--orca-radius-lg);
	}
	.ws-programs:focus {
		outline: none;
	}
	.ws-programs:focus-visible {
		outline: 2px solid var(--orca-focus);
		outline-offset: 4px;
	}
	.ws-add-program {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 124px;
		padding: 16px;
		border: 1.5px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		text-align: center;
		text-decoration: none;
	}
	.ws-add-program:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
		background: var(--orca-hover);
	}
	.ws-add-plus {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--orca-line);
		border-radius: 50%;
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	.ws-add-program b {
		font-size: 14.5px;
	}
	.ws-add-program span:last-child {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.4;
	}
	.ws-info {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ws-info :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.ws-disclosure {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 14px 12px 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ws-disclosure:hover {
		border-color: var(--orca-line-strong);
	}
	.ws-disclosure-items {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ws-disclosure-items span {
		padding: 3px 10px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font-size: 12.5px;
		font-weight: 500;
	}
	.ws-disclosure-open {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		color: var(--orca-text-2);
		font-size: 13.5px;
		font-weight: 600;
		white-space: nowrap;
	}
	.ws-disclosure[aria-expanded='true'] .ws-disclosure-open :global(svg) {
		transform: rotate(180deg);
	}
	.ws-more {
		margin-top: 18px;
	}
	.ws-limit-row {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.ws-limit-row .ws-input {
		width: 160px;
	}
	/* The sticky summary: what will be made, and the one primary action. */
	.ws-bar {
		position: sticky;
		bottom: 16px;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 12px;
		padding: 12px 12px 12px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
		box-shadow: var(--orca-popover-shadow);
	}
	.ws-bar-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.ws-bar-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ws-bar-copy b {
		color: var(--orca-ink);
		font-size: 15px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.ws-dot {
		margin: 0 6px;
		color: var(--orca-muted);
		font-weight: 400;
	}
	.ws-bar-copy > span {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.4;
	}
	.ws-bar-actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}
	.ws-draft,
	.ws-create {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border-radius: var(--orca-radius);
		font: inherit;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.ws-draft {
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.ws-draft:hover:not(:disabled) {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.ws-create {
		min-height: 50px;
		padding: 0 22px;
		border: 1px solid transparent;
		background: var(--orca-citron);
		color: var(--orca-on-citron);
		font-size: 15px;
	}
	.ws-create:hover:not(:disabled) {
		background: var(--orca-citron-hover);
	}
	.ws-draft:disabled,
	.ws-create:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	@media (max-width: 1100px) {
		.ws-programs {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 720px) {
		.ws-form {
			margin-top: -8px;
		}
		.ws-name {
			max-width: none;
		}
		.ws-programs {
			grid-template-columns: minmax(0, 1fr);
		}
		.ws-add-program {
			min-height: 96px;
		}
		.ws-bar {
			flex-wrap: wrap;
			bottom: 8px;
			padding: 12px;
		}
		.ws-bar-icon {
			display: none;
		}
		.ws-bar-copy {
			flex: 1 1 100%;
		}
		.ws-bar-copy > span {
			display: none;
		}
		.ws-bar-actions {
			flex: 1 1 100%;
			flex-direction: row-reverse;
			margin-left: 0;
		}
		.ws-create {
			flex: 1;
		}
	}
</style>
