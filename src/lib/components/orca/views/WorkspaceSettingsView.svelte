<script lang="ts">
	import { goto } from '$app/navigation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { HubConflictError, MAX_DAILY_LIMIT, changedFields, limitValid, saveHubPatch, sourceChangesData } from '$lib/orca/workspace-edit';
	import { gatewaySources } from '$lib/orca/gateway-sources';
	import type { HubInput, OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import { hubWriteService, workspaceWriteError } from '$lib/services/orca-workspaces';
	import { OrcaUserSourcesService, type OrcaUserSource } from '$lib/services/orca-user-sources';
	import { Pause, Play } from '@lucide/svelte';
	import { onDestroy, onMount, untrack } from 'svelte';
	import LifecycleActions from '../LifecycleActions.svelte';
	import ChoiceTile from '../ui/ChoiceTile.svelte';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import FormErrorSummary from '../ui/FormErrorSummary.svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import FormSection from '../workspace/FormSection.svelte';
	import SaveBar from '../workspace/SaveBar.svelte';
	import WriteModeChoice from '../workspace/WriteModeChoice.svelte';

	// view=hub&tab=settings: the workspace's own settings, edited in place with
	// one บันทึก (only the fields changed are sent, on top of the workspace as
	// saved now), then pause, archive or delete. The sign-in choice shows only
	// when the company has its own sign-in (plan §2 Q5).
	let {
		data,
		hub,
		onchanged,
		ondirty
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		onchanged: () => Promise<void>;
		/** Unsaved changes here, so the workspace asks before they are lost. */
		ondirty?: (dirty: boolean) => void;
	} = $props();
	type Fields = { name: string; description: string; instructions: string; writeMode: 'approval' | 'direct'; dailyLimit: number | undefined; userSourceID: string };
	const savedFields = (): Fields => ({
		name: hub.name,
		description: hub.description ?? '',
		instructions: hub.instructions ?? '',
		writeMode: hub.writeMode === 'approval' ? 'approval' : 'direct',
		dailyLimit: hub.dailyLimit,
		userSourceID: hub.userSourceID ?? ''
	});
	let fields = $state<Fields>(untrack(savedFields));
	let attempted = $state(false);
	let focusKey = $state(0);
	let busy = $state(false);
	let error = $state('');
	let conflict = $state(false);
	let statusBusy = $state(false);
	let statusError = $state('');
	let pauseOpen = $state(false);
	let userSources = $state<OrcaUserSource[]>([]);

	const before = $derived(savedFields());
	const trimmed = $derived({ ...fields, name: fields.name.trim(), description: fields.description.trim(), instructions: fields.instructions.trim() });
	const patch = $derived(changedFields({ ...before, name: before.name.trim(), description: before.description.trim(), instructions: before.instructions.trim() }, trimmed));
	const dirty = $derived(Object.keys(patch).length > 0);
	$effect(() => ondirty?.(dirty || busy));
	onDestroy(() => ondirty?.(false));
	// Pause, activate, archive and delete reload the workspace, which would
	// drop what is typed here: save or cancel first (Codex release review 63).
	const lifecycleHint = $derived(dirty ? t('บันทึกหรือยกเลิกสิ่งที่แก้ไว้ก่อน', 'Save or cancel your changes first.') : '');
	const changesData = $derived(gatewaySources(hub).some((source) => sourceChangesData(data.connections.find((item) => item.id === source.connectionID), source.toolNames)));
	const signInChoices = $derived(userSources.filter((source) => source.enabled || source.id === hub.userSourceID));
	const showSignIn = $derived(signInChoices.length > 0 || !!hub.userSourceID);
	const errors = $derived(
		attempted
			? {
					'ws-settings-name': !trimmed.name ? t('ตั้งชื่อพื้นที่ทำงาน', 'Name the workspace.') : [...trimmed.name].length > 120 ? t('ชื่อยาวได้ไม่เกิน 120 ตัวอักษร', 'At most 120 characters.') : '',
					'ws-settings-limit': limitValid(fields.dailyLimit) ? '' : t('จำกัดการใช้ต่อวันต้องเป็นเลข 1 ถึง 1,000,000', 'The daily limit must be 1 to 1,000,000.'),
					'ws-settings-description': trimmed.description.length > 4000 ? t('คำอธิบายยาวได้ไม่เกิน 4,000 ตัวอักษร', 'At most 4,000 characters.') : '',
					'ws-settings-instructions': trimmed.instructions.length > 4000 ? t('คำแนะนำยาวได้ไม่เกิน 4,000 ตัวอักษร', 'At most 4,000 characters.') : '',
					'ws-settings-signin': fields.userSourceID && fields.userSourceID !== hub.userSourceID && !userSources.find((source) => source.id === fields.userSourceID)?.enabled ? t('เลือกวิธีเข้าสู่ระบบที่เปิดใช้อยู่', 'Choose a sign-in that is on.') : ''
				}
			: {}
	);
	const hasErrors = $derived(Object.values(errors).some(Boolean));

	onMount(() => {
		const controller = new AbortController();
		if (data.canManage)
			void OrcaUserSourcesService.list(controller.signal)
				.then((result) => (userSources = result.items))
				.catch(() => {});
		return () => controller.abort();
	});

	function edited() {
		error = '';
		conflict = false;
	}
	function cancel() {
		fields = savedFields();
		attempted = false;
		edited();
	}
	async function save() {
		if (busy || !dirty) return;
		attempted = true;
		if (Object.values(errors).some(Boolean)) {
			focusKey += 1;
			return;
		}
		busy = true;
		error = '';
		const pending = $state.snapshot(patch) as Partial<Fields>;
		try {
			await saveHubPatch(hub.id, () => pending as Partial<HubInput>, hubWriteService);
			showToast(t('บันทึกการตั้งค่าแล้ว', 'Settings saved'));
			attempted = false;
			await onchanged();
		} catch (cause) {
			conflict = cause instanceof HubConflictError;
			error = workspaceWriteError(cause);
		} finally {
			busy = false;
		}
	}
	async function reload() {
		cancel();
		await onchanged();
	}
	// While pause or activate runs, the fields wait: its reload replaces this
	// tab, so nothing typed meanwhile could be kept (Codex release review 65).
	async function setStatus(status: 'active' | 'paused') {
		if (statusBusy || dirty) return;
		statusBusy = true;
		statusError = '';
		try {
			await saveHubPatch(hub.id, () => ({ status }), hubWriteService);
			pauseOpen = false;
			showToast(status === 'active' ? t('เปิดใช้งานแล้ว', 'Activated') : t('หยุดชั่วคราวแล้ว', 'Paused'));
			await onchanged();
		} catch (cause) {
			statusError = workspaceWriteError(cause);
			pauseOpen = false;
		} finally {
			statusBusy = false;
		}
	}
	async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
		await onchanged();
		if (action === 'delete') await goto(localeHref('/app?view=workspaces'));
	}
</script>

<div class="st">
	{#if attempted && hasErrors}<FormErrorSummary errors={errors} {focusKey} />{/if}
	<FormSection id="ws-settings-name-title" title={t('ชื่อพื้นที่ทำงาน', 'Workspace name')} hint={t('ทีมและ AI จะเห็นชื่อนี้', 'Your team and AI see this name.')}>
		<input id="ws-settings-name" class="st-input st-name" bind:value={fields.name} maxlength="120" autocomplete="off" aria-labelledby="ws-settings-name-title" aria-invalid={errors['ws-settings-name'] ? 'true' : undefined} disabled={busy || statusBusy} oninput={edited} />
		{#if errors['ws-settings-name']}<p class="st-error">{errors['ws-settings-name']}</p>{/if}
	</FormSection>
	<FormSection id="ws-settings-description-title" title={t('คำอธิบาย', 'Description')} hint={t('บอกทีมว่าพื้นที่นี้ใช้ทำอะไร', 'Tell your team what it is for.')}>
		<textarea id="ws-settings-description" class="st-input" rows="3" maxlength="4000" bind:value={fields.description} aria-labelledby="ws-settings-description-title" placeholder={t('เช่น ดูใบแจ้งหนี้และเอกสารของฝ่ายบัญชี', 'e.g. Invoices and documents for accounting')} disabled={busy || statusBusy} oninput={edited}></textarea>
		{#if errors['ws-settings-description']}<p class="st-error">{errors['ws-settings-description']}</p>{/if}
	</FormSection>
	<FormSection id="ws-settings-write-title" quiet={!changesData} title={t('เมื่อ AI จะสร้างหรือแก้ข้อมูล', 'When AI would create or change data')} hint={t('เลือกว่าต้องรอผู้ดูแลอนุมัติก่อนหรือไม่', 'Whether it waits for an admin to approve.')}>
		<WriteModeChoice
			bind:value={fields.writeMode}
			name="settings-write-mode"
			quiet={!changesData}
			noteTitle={gatewaySources(hub).length ? t('ไม่มีผลตอนนี้ เพราะทุกโปรแกรมอ่านอย่างเดียว', 'No effect now: every program only reads') : t('ยังไม่มีผล', 'No effect yet')}
			note={t('จะใช้เมื่อเปิดโปรแกรมที่ AI แก้ข้อมูลได้', 'It applies once a program that can change data is on.')}
			disabled={busy || statusBusy}
			onchange={edited}
		/>
		<p class="st-hint"><a class="k-link-button" href={localeHref('/app?view=approvals')}>{t('ดูคำขอที่รออนุมัติ', 'See requests waiting')}</a></p>
	</FormSection>
	<FormSection id="ws-settings-instructions-title" title={t('คำแนะนำสำหรับ AI', 'Guidance for AI')} hint={t('ส่งให้ AI ทุกครั้งที่ใช้พื้นที่นี้ ไม่เพิ่มสิทธิ์ใด ๆ', 'Sent to AI each time; it never adds access.')}>
		<textarea id="ws-settings-instructions" class="st-input" rows="5" maxlength="4000" bind:value={fields.instructions} aria-labelledby="ws-settings-instructions-title" placeholder={t('เช่น ตอบเป็นภาษาไทย อ้างเลขที่เอกสารทุกครั้ง และสรุปยอดเป็นบาท', 'e.g. Reply in Thai, cite document numbers, total in baht.')} disabled={busy || statusBusy} oninput={edited}></textarea>
		<p class="st-count">{fields.instructions.length.toLocaleString('th-TH')}/4,000</p>
		{#if errors['ws-settings-instructions']}<p class="st-error">{errors['ws-settings-instructions']}</p>{/if}
	</FormSection>
	<FormSection id="ws-settings-limit-title" title={t('จำกัดการใช้ต่อวัน', 'Daily limit')} hint={t('ทุกคนในพื้นที่นี้ใช้ร่วมกัน เริ่มนับใหม่ทุกวันตามเวลาประเทศไทย', 'Shared by everyone here; resets daily, Bangkok time.')}>
		<div class="st-limit">
			<input id="ws-settings-limit" class="st-input" type="number" min="1" max={MAX_DAILY_LIMIT} step="1" inputmode="numeric" bind:value={fields.dailyLimit} aria-labelledby="ws-settings-limit-title" aria-invalid={errors['ws-settings-limit'] ? 'true' : undefined} disabled={busy || statusBusy} oninput={edited} />
			<span>{t(`ครั้งต่อวัน · วันนี้ใช้ไป ${(hub.usedToday ?? 0).toLocaleString('th-TH')} ครั้ง`, `a day · ${(hub.usedToday ?? 0).toLocaleString('en-GB')} used today`)}</span>
		</div>
		{#if errors['ws-settings-limit']}<p class="st-error">{errors['ws-settings-limit']}</p>{/if}
	</FormSection>
	{#if showSignIn}
		<FormSection id="ws-settings-signin-title" title={t('วิธีเข้าสู่ระบบ', 'Sign-in')} hint={t('พื้นที่ที่ใช้ SSO ของบริษัทจะมีลิงก์ของตัวเองในแท็บภาพรวม', 'A workspace using company SSO gets its own link on Overview.')}>
			<div class="st-choices" id="ws-settings-signin" role="radiogroup" aria-labelledby="ws-settings-signin-title">
				<ChoiceTile name="workspace-sign-in" value="" bind:selected={fields.userSourceID} title={t('บัญชี ORCA', 'ORCA account')} description={t('ใช้ลิงก์ ORCA ของบริษัทเหมือนพื้นที่อื่น', "Uses your company's ORCA link like the others.")} badge={t('แนะนำ', 'Recommended')} disabled={busy || statusBusy} onselect={edited} />
				{#each signInChoices as source (source.id)}
					<ChoiceTile name="workspace-sign-in" value={source.id} bind:selected={fields.userSourceID} title={source.name} description={source.enabled ? t('SSO ของบริษัท', 'Company SSO') : t('ปิดใช้อยู่', 'Turned off')} disabled={busy || statusBusy || (!source.enabled && source.id !== hub.userSourceID)} onselect={edited} />
				{/each}
				{#if hub.userSourceID && !signInChoices.some((source) => source.id === hub.userSourceID)}
					<ChoiceTile name="workspace-sign-in" value={hub.userSourceID} bind:selected={fields.userSourceID} title={t('SSO ของบริษัท (เดิม)', 'Company SSO (previous)')} disabled />
				{/if}
			</div>
			{#if errors['ws-settings-signin']}<p class="st-error">{errors['ws-settings-signin']}</p>{/if}
		</FormSection>
	{/if}

	<section class="st-danger" aria-labelledby="st-danger-title">
		<div class="st-danger-copy">
			<h2 id="st-danger-title">{t('หยุดหรือลบพื้นที่นี้', 'Pause or remove')}</h2>
			<p>{hub.status === 'active'
				? t('หยุดชั่วคราว: AI ของทุกคนใช้พื้นที่นี้ไม่ได้จนกว่าจะเปิดอีกครั้ง จัดเก็บหรือลบ: ย้ายออกจากรายการ', "Pause: nobody's AI can use it until it's on again. Archive or delete: take it off the list.")
				: t('เปิดใช้งานเมื่อพร้อม หรือจัดเก็บ / ลบถ้าไม่ใช้แล้ว', "Activate it when ready, or archive / delete it if it's not needed.")}</p>
			{#if statusError}<p class="st-error" role="alert">{statusError}</p>{/if}
			{#if lifecycleHint}<p class="st-hint" id="st-lifecycle-hint">{lifecycleHint}</p>{/if}
		</div>
		<div class="st-danger-actions">
			{#if hub.status === 'active'}<button type="button" class="k-button" disabled={statusBusy || dirty} aria-describedby={dirty ? 'st-lifecycle-hint' : undefined} onclick={() => (pauseOpen = true)}><Pause size={16} aria-hidden="true" />{t('หยุดชั่วคราว', 'Pause')}</button>
			{:else}<button type="button" class="k-button" disabled={statusBusy || dirty} aria-describedby={dirty ? 'st-lifecycle-hint' : undefined} onclick={() => setStatus('active')}><Play size={16} aria-hidden="true" />{t('เปิดใช้งาน', 'Activate')}</button>{/if}
			<LifecycleActions entity={hub} kind="gateway" canManage={data.canManage && !dirty} onchanged={lifecycleChanged} onreload={onchanged} />
		</div>
	</section>
</div>

{#if dirty || error}
	<SaveBar summary={t(`แก้ ${Object.keys(patch).length} อย่าง ยังไม่บันทึก`, `${Object.keys(patch).length} change(s) not saved`)} {busy} {error} {conflict} onsave={save} oncancel={cancel} onreload={reload} />
{/if}

<ConfirmDialog
	bind:open={pauseOpen}
	title={t('หยุดพื้นที่นี้ชั่วคราว?', 'Pause this workspace?')}
	message={t('AI ของทุกคนในพื้นที่นี้จะใช้ไม่ได้จนกว่าคุณจะเปิดใช้งานอีกครั้ง การตั้งค่าและคนที่ใช้ได้ยังอยู่เหมือนเดิม', "Nobody's AI can use it until you activate it again. Settings and people stay as they are.")}
	confirmLabel={t('หยุดชั่วคราว', 'Pause')}
	busy={statusBusy}
	icon={Pause}
	onconfirm={() => setStatus('paused')}
/>

<style>
	.st {
		max-width: 1056px;
		margin-top: -8px;
	}
	.st-input {
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
	.st-input:focus {
		border-color: var(--orca-focus);
		outline: none;
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.st-input[aria-invalid='true'] {
		border-color: var(--orca-deny);
	}
	textarea.st-input {
		resize: vertical;
	}
	.st-name {
		max-width: 440px;
	}
	.st-error {
		margin: 6px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
	}
	.st-hint {
		margin: 10px 0 0;
		font-size: 13.5px;
	}
	.st-count {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		text-align: right;
	}
	.st-limit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.st-limit .st-input {
		width: 160px;
	}
	.st-choices {
		display: grid;
		gap: 10px;
	}
	.st-danger {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px 24px;
		margin-top: 12px;
		padding: 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	.st-danger-copy {
		flex: 1 1 360px;
		min-width: 0;
	}
	.st-danger h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 16px;
		font-weight: 700;
	}
	.st-danger p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.st-danger-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
</style>
