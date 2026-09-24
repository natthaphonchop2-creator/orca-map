<script lang="ts">
  import { toolPresentation } from "$lib/orca/tool-presentation";
  import { orcaLocale } from "$lib/orca/locale.svelte";
  import { gatewayUsesConnection } from "$lib/orca/gateway-sources";
	import SourceSetup from '$lib/components/orca/SourceSetup.svelte';
	import { connectionReady } from '$lib/orca/activation';
	import { catalogSourceDisplayName, filterCatalog } from '$lib/orca/catalog';
	import { t, localeHref } from '$lib/orca/locale.svelte';
	import {
		OrcaService,
		orcaError,
		statusLabels,
		type OrcaBootstrap,
		type OrcaCandidate,
		type OrcaConnection,
		type OrcaTool
	} from '$lib/services/orca';
	import {
		Check,
		ArrowUpRight,
		ChevronLeft,
		Info,
		Folder,
		LoaderCircle,
		Pause,
		Pencil,
		Play,
		Plug,
		Plus
	} from '@lucide/svelte';
	import { onMount, onDestroy, tick, untrack } from 'svelte';

	let {
		data,
		onchanged,
		initialSourceID = '',
		initialConnectionID = '',
		initiallyAddSource = false,
		mode = 'setup',
		embedded = false,
		oncompleted,
		onbusychange
	}: {
		data: OrcaBootstrap;
		onchanged: () => Promise<void>;
		initialSourceID?: string;
		initialConnectionID?: string;
		initiallyAddSource?: boolean;
		mode?: 'setup' | 'policy';
		embedded?: boolean;
		oncompleted?: (connection: OrcaConnection) => Promise<void>;
		onbusychange?: (busy: boolean) => void;
	} = $props();
	const addSourceFlow = $derived(initiallyAddSource && !initialConnectionID);
	let alive = true;
	let initialSelectionApplied = false;
	let discoveryGeneration = 0;
	let candidates = $state<OrcaCandidate[]>([]);
	let tools = $state<OrcaTool[]>([]);
	let editing = $state<OrcaConnection>();
	let formOpen = $state(untrack(() => addSourceFlow && data.canManage));
	let step = $state<1 | 2 | 3>(1);
	let creatingSource = $state(false);
	let sourceReady = $state(false);
	let setupBusy = $state(false);
	let suggestedName = $state('');
	let loading = $state(untrack(() => addSourceFlow && data.canManage));
	let discovering = $state(false);
	let saving = $state(false);
	let error = $state('');
	let success = $state('');
	let savedConnection = $state<OrcaConnection>();
	let dataAtSave = $state.raw<OrcaBootstrap>();
	let mcpID = $state('');
	let discoveredID = $state('');
	let name = $state('');
	let description = $state('');
	let scopeNote = $state('');
	let enabled = $state(true);
	let toolNames = $state<string[]>([]);
	let reviewedTools = $state(false);
	let readOnly = $state(false);
	let query = $state('');
	let title: HTMLHeadingElement | undefined = $state();
	let changingConnection = $state('');
	const busy = $derived(discovering || saving);
	const policyMode = $derived(mode === 'policy');
	$effect(() => {
		const operationBusy = loading || discovering || saving || setupBusy;
		untrack(() => onbusychange?.(operationBusy));
	});
	const toolsReviewed = $derived(
		!!mcpID && discoveredID === mcpID && toolNames.length > 0 && reviewedTools
	);
	const savedSource = $derived(
		savedConnection
			? data === dataAtSave
				? savedConnection
				: data.connections.find((item) => item.id === savedConnection?.id)
			: undefined
	);
	const visibleConnections = $derived(
		data.connections.filter((item) =>
			`${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())
		)
	);
	const selectableCandidates = $derived<OrcaCandidate[]>(
		filterCatalog(
			editing && !candidates.some((item) => item.id === editing?.mcpID)
				? [
						{
							id: editing.mcpID,
							name: editing.name,
							description: t('ระบบที่บันทึกไว้', 'Saved system')
						},
						...candidates
					]
				: candidates,
			'',
			'all',
			mcpID
		)
	);

	const selectedSource = $derived(selectableCandidates.find((item) => item.id === mcpID));
	const sourceLabel = $derived(selectedSource ? catalogSourceDisplayName(selectedSource) : '');

	async function loadCandidates() {
		if (!data.canManage) return;
		loading = true;
		error = '';
		try {
			candidates = await OrcaService.candidates();
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			loading = false;
		}
	}
	async function applyInitialSelection() {
		if (!alive || !data.canManage || error || initialSelectionApplied) return;
		if (initialConnectionID) {
			const connection = data.connections.find((item) => item.id === initialConnectionID);
			if (connection) await openForm(connection);
			else {
				error = t(
					'ไม่พบระบบนี้ หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง',
					'This system was not found, or your account does not have access to it.'
				);
				return;
			}
		} else if (initialSourceID) {
			const source = candidates.find((item) => item.id === initialSourceID);
			if (!source) {
				error = t(
					'ไม่พบระบบนี้ในคลังระบบแล้ว กรุณาเลือกระบบอีกครั้ง',
					'This system is no longer in the system catalog. Choose a system again.'
				);
				return;
			}
			await openForm();
			mcpID = source.id;
			sourceChanged();
		} else if (initiallyAddSource) await openForm();
		initialSelectionApplied = true;
	}
	onMount(() => {
		void (async () => {
			if (!policyMode) await loadCandidates();
			await applyInitialSelection();
		})();
	});
	onDestroy(() => {
		alive = false;
		discoveryGeneration++;
	});
	async function openForm(connection?: OrcaConnection) {
		discoveryGeneration++;
		discovering = false;
		editing = connection;
		formOpen = true;
		error = '';
		success = '';
		savedConnection = undefined;
		mcpID = connection?.mcpID ?? '';
		discoveredID = '';
		name = connection?.name ?? '';
		description = connection?.description ?? '';
		scopeNote = connection?.scopeNote ?? '';
		enabled = connection?.enabled ?? true;
		readOnly = connection?.reviewedReadOnly ?? false;
		tools = [];
		toolNames = [...(connection?.toolNames ?? [])];
		reviewedTools = false;
		step = policyMode && connection ? 2 : 1;
		creatingSource = false;
		sourceReady = false;
		setupBusy = false;
		suggestedName = '';
		await tick();
		title?.focus({ preventScroll: true });
		if (!embedded) window.scrollTo({ top: 0, behavior: 'instant' });
		if (policyMode && connection) await discover(connection.mcpID);
	}
	function sourceChanged() {
		if (editing && mcpID !== editing.mcpID) {
			mcpID = editing.mcpID;
			return;
		}
		discoveryGeneration++;
		discovering = false;
		step = 1;
		creatingSource = false;
		sourceReady = false;
		setupBusy = false;
		error = '';
		tools = [];
		toolNames = [];
		discoveredID = '';
		reviewedTools = false;
		readOnly = false;
		const candidate = candidates.find((item) => item.id === mcpID);
		const nextName = candidate ? catalogSourceDisplayName(candidate) : '';
		if (!name.trim() || name === suggestedName) name = nextName;
		suggestedName = nextName;
	}
	function closeForm() {
		discoveryGeneration++;
		discovering = false;
		formOpen = false;
		error = '';
	}
	function sourceStateChanged(state: { sourceID: string; ready: boolean; busy: boolean }) {
		if (!alive || !data.canManage || !formOpen || state.sourceID !== mcpID) return;
		setupBusy = state.busy;
		if (sourceReady && !state.ready) {
			discoveryGeneration++;
			discovering = false;
			discoveredID = '';
			reviewedTools = false;
			step = 1;
		}
		sourceReady = state.ready;
	}
	async function sourceAccountReady(id: string) {
		if (!alive || !data.canManage || !formOpen || id !== mcpID) return;
		await discover(id);
	}
	async function discover(id = mcpID) {
		if (!alive || !data.canManage || !formOpen || !id || id !== mcpID || busy) return;
		const generation = ++discoveryGeneration;
		const ownedRequest = () =>
			alive && formOpen && id === mcpID && generation === discoveryGeneration;
		const current = () => ownedRequest() && data.canManage;
		discovering = true;
		error = '';
		reviewedTools = false;
		try {
			const discoveredTools = await OrcaService.discover(id);
			if (!current()) return;
			tools = discoveredTools;
			discoveredID = id;
			toolNames = toolNames.filter((name) => tools.some((tool) => tool.name === name));
			if (tools.length) step = 2;
			else
				error = t(
					'ยังไม่พบเครื่องมือจากระบบนี้ กรุณาตรวจสอบการเชื่อมต่อและบัญชีที่ใช้กับระบบ',
					'No tools were found in this system. Check the connection and the account used for it.'
				);
		} catch (cause) {
			if (!current()) return;
			discoveredID = '';
			tools = [];
			error = orcaError(cause);
		} finally {
			if (ownedRequest()) discovering = false;
		}
	}
	async function save() {
		if (busy || !data.canManage || !formOpen || step !== 3) return;
		if (
			!name.trim() ||
			!scopeNote.trim() ||
			!toolNames.length ||
			discoveredID !== mcpID ||
			!reviewedTools
		) {
			error = t(
				'กรุณาระบุชื่อและขอบเขตข้อมูล แล้วตรวจสอบและยืนยันเครื่องมือที่อนุญาต',
				'Enter a name and data scope, then review and confirm the allowed tools.'
			);
			return;
		}
		saving = true;
		error = '';
		try {
			dataAtSave = data;
			if (!embedded || !savedConnection) savedConnection = await OrcaService.connection(
				{
					name: name.trim(),
					description: description.trim(),
					mcpID,
					toolNames,
					scopeNote: scopeNote.trim(),
					reviewedTools: true,
					reviewedReadOnly: readOnly,
					enabled,
					...(editing ? { version: editing.version } : {})
				},
				editing?.id
			);
			if (embedded) {
				await onchanged();
				if (alive && savedConnection) await oncompleted?.(savedConnection);
				return;
			}
			formOpen = false;
			query = '';
			success = t('บันทึกระบบแล้ว', 'System saved.');
			await onchanged();
			await tick();
			if (!embedded) window.scrollTo({ top: 0, behavior: 'instant' });
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			saving = false;
		}
	}
	async function toggleEnabled(connection: OrcaConnection) {
		if (changingConnection) return;
		changingConnection = connection.id;
		error = '';
		success = '';
		savedConnection = undefined;
		try {
			await OrcaService.connection(
				{
					name: connection.name,
					description: connection.description,
					mcpID: connection.mcpID,
					toolNames: connection.toolNames,
					scopeNote: connection.scopeNote,
					reviewedTools: connection.reviewedTools ?? false,
					reviewedReadOnly: connection.reviewedReadOnly,
					enabled: !connection.enabled,
					version: connection.version
				},
				connection.id
			);
			await onchanged();
			success = connection.enabled
				? t(
						'ระงับการใช้งานระบบแล้ว พื้นที่ทำงาน AI ทั้งหมดที่ใช้ระบบนี้จะเข้าถึงข้อมูลไม่ได้',
						'System paused. AI workspaces that use it can no longer access its data.'
					)
				: t('เปิดใช้งานระบบอีกครั้งแล้ว', 'System resumed.');
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			changingConnection = '';
		}
	}
</script>

{#snippet workspaceSteps(connection: OrcaConnection)}
	{@const workspaces = data.hubs.filter((hub) => gatewayUsesConnection(hub, connection.id))}
	<div class="connection-workspaces">
		<div class="connection-next-title">
			<Folder size={18} aria-hidden="true" />
			<h3>
				{workspaces.length
					? t('พื้นที่ทำงาน AI ที่ใช้ระบบนี้', 'AI workspaces using this system')
					: t('นำระบบนี้ไปใช้กับทีม', 'Use this system with your team')}
			</h3>
		</div>
		{#if workspaces.length}
			<p class="k-small k-muted">
				{t(
					'เลือกพื้นที่ทำงาน AI เพื่อดูเครื่องมือ สมาชิก และลิงก์เชื่อม AI',
					'Open an AI workspace to review its tools, members, and AI connection link.'
				)}
			</p>
			<div class="connection-workspace-links">
				{#each workspaces as workspace (workspace.id)}
					<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(workspace.id)}`)}>
						<span>{workspace.name}</span>
						<span class="k-badge" class:active={workspace.status === 'active'}
							>{statusLabels[workspace.status]}</span
						>
						<ArrowUpRight size={16} aria-hidden="true" />
					</a>
				{/each}
			</div>
		{:else if data.canManage}
			<p class="k-small k-muted">
				{t(
					'สร้างพื้นที่ทำงาน AI แล้วเลือกเครื่องมือจากรายการที่ระบบนี้อนุญาต พร้อมกำหนดสมาชิก',
					'Create an AI workspace, then choose tools from this system’s allowed tools and assign its members.'
				)}
			</p>
		{/if}
		{#if data.canManage && connectionReady(connection)}
			<a
				class="k-button small"
				href={localeHref(`/app?view=new&connection=${encodeURIComponent(connection.id)}`)}
			>
				<Plus size={16} aria-hidden="true" />{workspaces.length
					? t('สร้างพื้นที่ทำงาน AI เพิ่ม', 'Create another AI workspace')
					: t('สร้างพื้นที่ทำงาน AI ด้วยระบบนี้', 'Create an AI workspace with this system')}
			</a>
		{:else if data.canManage}
			<p class="connection-unavailable">
				<Info size={16} aria-hidden="true" />{!connection.enabled
					? t(
							'เปิดใช้งานระบบนี้อีกครั้งก่อนสร้างพื้นที่ทำงาน AI ระหว่างที่ระบบถูกระงับ พื้นที่ทำงานเดิมจะเข้าถึงข้อมูลจากระบบนี้ไม่ได้',
							'Resume this system before creating an AI workspace. Existing workspaces cannot access its data while it is paused.'
						)
					: t(
							'ตรวจสอบและบันทึกเครื่องมือที่อนุญาตก่อนสร้างพื้นที่ทำงาน AI',
							'Review and save this system’s allowed tools before creating an AI workspace.'
						)}
			</p>
		{/if}
	</div>
{/snippet}

{#if !embedded}
<div class="k-breadcrumb">
	<a href={localeHref('/app?view=servers')}>{t('ระบบที่เชื่อมต่อ', 'Connected systems')}</a><span>/</span><span
		>{t('ตั้งค่าระบบ', 'System setup')}</span
	>{#if formOpen}<span>/</span><span
			>{editing ? t('แก้ไข', 'Edit') : t('เพิ่มระบบ', 'Add a system')}</span
		>{/if}
</div>
<div class="k-intro">
	<div class="k-heading-row">
		<h1 bind:this={title} tabindex="-1">
			{formOpen
				? editing
					? t('ตรวจสอบและแก้ไขระบบ', 'Review and edit system')
					: t('เพิ่มระบบ', 'Add a system')
				: t('ระบบที่เชื่อมต่อ', 'Connected systems')}
		</h1>
		{#if !formOpen && data.canManage}<a
				class="k-button primary"
				href={localeHref('/app?view=servers&add=source')}><Plus size={16} aria-hidden="true" /> {t('เพิ่มระบบ', 'Add a system')}</a
			>{/if}
	</div>
	<p class="k-subtitle">
		{t(
			'ตั้งค่าระบบที่เชื่อมต่อและกำหนดเครื่องมือที่องค์กรอนุญาต',
			'Set up connected systems and the tools your organization allows.'
		)}
	</p>
</div>
{/if}
{#if error}<div class="k-banner error connection-banner" role="alert">
		<Info size={16} aria-hidden="true" />
		<div>
			{error}
			<div class="k-actions">
				<button
					class="k-link-button"
					disabled={busy || loading}
							onclick={async () => {
							await onchanged();
							if (!policyMode) await loadCandidates();
						await applyInitialSelection();
						if (editing) {
							const latest = data.connections.find((item) => item.id === editing?.id);
							if (latest) await openForm(latest);
						}
					}}>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button
				>
			</div>
		</div>
	</div>{/if}
{#if success}<div class="k-banner success connection-banner" role="status"><Check size={16} aria-hidden="true" />{success}</div>{/if}
{#if !embedded && !formOpen && savedSource && data.canManage}
	<section
		class="k-panel connection-saved"
		aria-label={t('ขั้นตอนถัดไปหลังบันทึกระบบ', 'Next steps after saving the system')}
	>
		<header class="connection-saved-head">
			<h2>{savedSource.name}</h2>
			<span class="k-badge">{t('ขั้นตอนถัดไป', 'Next step')}</span>
		</header>
		{#if policyMode}<button class="k-button" onclick={() => openForm(savedSource)}>
			{t('ตรวจสอบและแก้ไขเครื่องมืออีกครั้ง', 'Review and edit tools again')}
		</button>{/if}
		{@render workspaceSteps(savedSource)}
	</section>
{/if}

{#if embedded && savedConnection}
  <div class="k-banner success connection-banner" role="status"><Check size={16} aria-hidden="true" />{t('บันทึกระบบแล้ว', 'System saved.')}</div>
  {#if !saving}<button class="k-button primary" onclick={save}>{t('ดำเนินการต่อด้วยระบบนี้', 'Continue with this system')}</button>{/if}
{:else if formOpen && data.canManage}
	<ol class="connection-progress" aria-label={t('ขั้นตอนตั้งค่าระบบ', 'System setup steps')}>
		{#each policyMode ? [t('เลือกเครื่องมือ', 'Choose tools'), t('บันทึก', 'Save')] : [t('เชื่อมบัญชี', 'Connect account'), t('เลือกเครื่องมือ', 'Choose tools'), t('บันทึก', 'Save')] as label, index (index)}
			{@const stepNumber = index + (policyMode ? 2 : 1)}
			<li
				class:current={step === stepNumber}
				class:complete={step > stepNumber}
				aria-current={step === stepNumber ? 'step' : undefined}
			>
				<span class="step-number"
					>{#if step > stepNumber}<Check size={14} aria-hidden="true" />{:else}{index + 1}{/if}</span
				>
				<span>{label}</span>
			</li>
		{/each}
	</ol>
	{#if !policyMode}
	<section
		class="k-panel connection-account"
		hidden={step !== 1}
		aria-label={t('เชื่อมบัญชี', 'Connect account')}
	>
		{#if !embedded || !initialSourceID}
		<h2>{t('เลือกระบบ แล้วเชื่อมบัญชีของคุณ', 'Choose a system and connect your account')}</h2>
		<p class="k-small k-muted step-description">
			{t(
				'เมื่อตรวจสอบการเชื่อมต่อแล้ว ORCA จะแสดงรายการเครื่องมือให้เลือกในขั้นตอนถัดไป',
				'After the connection check, ORCA lists the available tools for you to review.'
			)}
		</p>
		{/if}
		{#if !embedded || !initialSourceID || !selectedSource}
		<div class="k-field k-section">
			<label for="candidate">{t('ระบบที่ต้องการเชื่อมต่อ', 'System to connect')}</label>
			<select
				id="candidate"
				bind:value={mcpID}
				onchange={sourceChanged}
				disabled={busy || setupBusy || loading || !!editing}
			>
				<option value="">{t('เลือกระบบ', 'Choose a system')}</option>
				{#each selectableCandidates as candidate (candidate.id)}<option value={candidate.id}
						>{catalogSourceDisplayName(candidate)}</option
					>{/each}
			</select>
		</div>
		{/if}
		{#if editing}<p class="k-small k-muted">
				{t(
					'หากต้องการใช้ระบบอื่น ให้เพิ่มเป็นระบบใหม่',
					'To use a different system, add it as a new system.'
				)}
			</p>{/if}
		{#if loading}<p class="k-muted k-small" role="status">{t('กำลังโหลดรายชื่อระบบ…', 'Loading systems…')}</p>
		{:else if !selectableCandidates.length}<p class="k-muted k-small">
				{t(
					'ยังไม่มีระบบในคลังระบบ เพิ่มระบบด้วย MCP URL ได้ที่ “ตัวเลือกเพิ่มเติม” ด้านล่าง',
					'The system catalog is empty. Add a system with an MCP URL under More options below.'
				)}
			</p>{/if}
		{#if mcpID || creatingSource}
			<SourceSetup
				sourceID={mcpID}
				{sourceLabel}
				endpointHost={selectedSource?.endpointHost}
				managedProvider={selectedSource?.managedProvider}
				canCreate
				oncreated={async (id) => {
					await loadCandidates();
					if (!alive || !formOpen) return;
					mcpID = id;
					sourceChanged();
				}}
				onready={sourceAccountReady}
				onstatechange={sourceStateChanged}
			/>
		{/if}
		{#if discovering}<p class="discovery-status" role="status">
				<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{t(
					'กำลังตรวจสอบรายการเครื่องมือ…',
					'Checking available tools…'
				)}
			</p>
		{:else if sourceReady && (!tools.length || discoveredID !== mcpID)}
			<button type="button" class="k-button primary" onclick={() => discover()} disabled={setupBusy}
				>{t('ตรวจสอบเครื่องมืออีกครั้ง', 'Check tools again')}</button
			>
		{:else if sourceReady && tools.length && discoveredID === mcpID}
			<button type="button" class="k-button primary" onclick={() => (step = 2)} disabled={setupBusy}
				>{t('เลือกเครื่องมือ', 'Choose tools')}</button
			>
		{/if}
		<details class="connection-options">
			<summary>{t('ตัวเลือกเพิ่มเติม', 'More options')}</summary>
			<div class="k-actions">
				{#if !editing}<button
						type="button"
						class="k-button quiet"
						disabled={busy || setupBusy}
						onclick={() => {
							mcpID = '';
							sourceChanged();
							creatingSource = true;
						}}>{t('เพิ่มระบบด้วย MCP URL', 'Add a system with an MCP URL')}</button
					>{/if}
				<button
					type="button"
					class="k-link-button"
					disabled={loading || busy || setupBusy}
					onclick={loadCandidates}>{t('โหลดรายชื่อระบบอีกครั้ง', 'Reload systems')}</button
				>
			</div>
		</details>
	</section>
	{:else if discovering}
		<p class="discovery-status" role="status"><LoaderCircle size={16} class="k-spin" aria-hidden="true" />{t('กำลังโหลดรายการเครื่องมือล่าสุด…', 'Loading current tools…')}</p>
	{:else if !discoveredID || !tools.length}
		<div class="k-banner connection-banner"><Info size={16} aria-hidden="true" /><div>
			<p>{t('โหลดรายการเครื่องมือล่าสุดก่อนยืนยันสิทธิ์ หากบัญชียังไม่พร้อม ให้เชื่อมบัญชีในแท็บ “บัญชี” แล้วกลับมาตรวจสอบเครื่องมือ', 'Load the current tools before approving access. If the account needs attention, open the Account tab, then return to review the tools.')}</p>
			<div class="k-actions">
				<button class="k-button" disabled={busy} onclick={() => discover()}>{t('โหลดเครื่องมืออีกครั้ง', 'Retry loading tools')}</button>
				<a class="k-button quiet" href={localeHref(`/app?view=servers&connection=${encodeURIComponent(initialConnectionID)}&tab=account`)}>{t('จัดการบัญชี', 'Manage account')}</a>
			</div>
		</div></div>
	{/if}
	{#if step > 1}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				if (step === 3) void save();
			}}
		>
			<fieldset disabled={busy}>
				{#if step === 2}
					<section class="k-panel">
						<h2>{t('กำหนดเครื่องมือที่อนุญาตของระบบ', 'Set the system’s allowed tools')}</h2>
						<p class="k-small k-muted step-description">
							{sourceLabel} · {t(
								'เลือกเครื่องมือทั้งหมดที่องค์กรอนุญาตให้ใช้ แต่ละพื้นที่ทำงาน AI จะเลือกเครื่องมือและสมาชิกได้จากรายการนี้เท่านั้น',
								'Choose every tool your organization allows. Each AI workspace can select tools and members only from this list.'
							)}
						</p>
						<div class="k-field k-section">
                            <label for="tool-access-mode">{t('รูปแบบการใช้งาน', 'Access mode')}</label>
                            <select id="tool-access-mode" bind:value={readOnly} onchange={() => { reviewedTools = false; }}>
                                <option value={false}>{t('ใช้งานตามเครื่องมือที่อนุญาต', 'Use the allowed tools')}</option>
                                <option value={true}>{t('จำกัดเฉพาะการอ่านข้อมูล', 'Restrict to read-only tools')}</option>
                            </select>
                            <p class="k-small k-muted">{t('เครื่องมือที่อนุญาตอาจสร้าง แก้ไข หรือลบข้อมูลได้ ตามความสามารถของเครื่องมือและสิทธิ์ที่บัญชีได้รับในระบบนั้น', 'Allowed tools may create, update, or delete data within the permissions granted to the account in that system.')}</p>
                        </div>
						{#if tools.length && discoveredID === mcpID}<div class="k-check-list k-section">
								{#each tools as tool, index (tool.name)}<div
										class="k-check-row"
										class:selected={toolNames.includes(tool.name)}
									>
										<input
											id={`source-tool-${index}`}
											type="checkbox"
											checked={toolNames.includes(tool.name)}
											onchange={() => {
												toolNames = toolNames.includes(tool.name)
													? toolNames.filter((name) => name !== tool.name)
													: [...toolNames, tool.name];
												reviewedTools = false;
											}}
										/>
										<div class="k-check-copy">
											<label for={`source-tool-${index}`}><strong>{toolPresentation(tool, orcaLocale.value).label}</strong></label>
											<p>
												{tool.description ||
													t(
														'ระบบไม่ได้ระบุคำอธิบายของเครื่องมือนี้',
														'The system did not provide a description.'
													)}
											</p>
											<details>
												<summary class="schema-toggle"
													>{t(
														'ดูข้อมูลที่เครื่องมือต้องใช้ (Input schema)',
														'View input schema'
													)}</summary
												>
												<pre class="schema-code">{JSON.stringify(
														tool.inputSchema,
														null,
														2
													)}</pre>
											</details>
										</div>
									</div>{/each}
							</div>{:else}<div class="k-banner connection-banner">
								<Info size={16} aria-hidden="true" />
								<p>
									{t(
										'โหลดรายการเครื่องมือจากระบบก่อนเลือกเครื่องมือ',
										'Load the tools from the system before selecting them.'
									)}
								</p>
							</div>{/if}
						<label class="k-check-row confirm-row"
							><input
								type="checkbox"
								bind:checked={reviewedTools}
								disabled={!tools.length || !toolNames.length}
							/><span class="k-check-copy"
								><strong
									>{t(
										'ยืนยันว่าได้ตรวจสอบและอนุญาตเครื่องมือที่เลือก ภายใต้สิทธิ์ของบัญชีที่เชื่อมต่อ',
										'I have reviewed and approve the selected tools within the connected account’s permissions.'
									)}</strong
								>
								<p>
									{t(
										'ORCA อนุญาตเฉพาะเครื่องมือที่ตรวจสอบแล้ว หากรูปแบบข้อมูลของเครื่องมือเปลี่ยนแปลง ระบบจะระงับการใช้งานจนกว่าจะตรวจสอบอีกครั้ง',
										'ORCA allows only reviewed tools. If a tool’s schema changes, its use is paused until it is reviewed again.'
									)}
								</p></span
							></label
						>
					</section>
				{:else}
					<section class="k-panel">
						<h2>{t('บันทึกระบบ', 'Save the system')}</h2>
						<p class="k-small k-muted step-description">
							{t(
								'ตั้งชื่อระบบให้ชัดเจน และระบุขอบเขตข้อมูลที่ใช้',
								'Give this system a clear name and describe its data scope.'
							)}
						</p>
						<div class="k-field k-section">
							<label for="source-name">{t('ชื่อที่แสดงต่อทีม', 'Name shown to your team')}</label>
							<input
								id="source-name"
								bind:value={name}
								maxlength="100"
								required
								placeholder={t('ตัวอย่าง: เอกสารฝ่ายขาย', 'Example: Sales documents')}
							/>
						</div>
						<div class="k-field">
							<label for="source-scope"
								>{t('ขอบเขตข้อมูล', 'Data scope')}</label
							><textarea
								id="source-scope"
								bind:value={scopeNote}
								maxlength="2000"
								required
								placeholder={t(
									'ระบุบัญชีหรือชุดข้อมูลที่ใช้ และสิทธิ์การเข้าถึงที่ตั้งค่าไว้ในระบบนั้น',
									'Describe the connected account or dataset and the access restrictions configured in that system.'
								)}
							></textarea>
							<p class="k-muted k-small">
								{t(
									'ข้อความนี้ใช้เพื่ออธิบายเท่านั้น ไม่ได้กรองหรือจำกัดข้อมูล หากต้องการจำกัดไฟล์หรือโฟลเดอร์ ให้ตั้งค่าสิทธิ์ในระบบที่เชื่อมต่อ',
									'This text is descriptive only and does not filter data. To restrict files or folders, configure permissions in the connected system.'
								)}
							</p>
						</div>
						<div class="connection-review">
							<strong
								>{t(
									`เครื่องมือที่เลือก ${toolNames.length} รายการ`,
									`${toolNames.length} tools selected`
								)}</strong
							>
							<ul>
								{#each toolNames as tool (tool)}<li>{tool}</li>{/each}
							</ul>
						</div>
						<details class="connection-options">
							<summary>{t('รายละเอียดเพิ่มเติม', 'Additional details')}</summary>
							<div class="k-field k-section">
								<label for="source-description"
									>{t('คำอธิบาย (ไม่บังคับ)', 'Description (optional)')}</label
								>
								<input id="source-description" bind:value={description} maxlength="500" />
							</div>
							<label class="k-check-row option-row"
								><input type="checkbox" bind:checked={enabled} /><span class="k-check-copy"
									><strong
										>{t(
											'อนุญาตให้พื้นที่ทำงาน AI ใช้ระบบนี้',
											'Allow AI workspaces to use this system'
										)}</strong
									>
									<p>
										{t(
											'หากปิดตัวเลือกนี้ พื้นที่ทำงาน AI ทั้งหมดที่ใช้ระบบนี้จะเข้าถึงข้อมูลไม่ได้',
											'If this option is off, no AI workspace that uses this system can access its data.'
										)}
									</p></span
								></label
							>
						</details>
						{#if !enabled}<p class="k-small k-muted">
								{t(
									'ระบบนี้ถูกระงับการใช้งาน เปลี่ยนได้ที่ “รายละเอียดเพิ่มเติม”',
									'This system is paused. Change this under Additional details.'
								)}
							</p>{/if}
					</section>
				{/if}
			</fieldset>
			<div class="k-wizard-actions">
				{#if policyMode && step === 2}
					<a class="k-button" href={localeHref(`/app?view=servers&connection=${encodeURIComponent(initialConnectionID)}`)}>{t('กลับไปภาพรวม', 'Back to overview')}</a>
				{:else}<button
					class="k-button"
					type="button"
					disabled={busy}
					onclick={() => {
						step = step === 3 ? 2 : 1;
						error = '';
					}}><ChevronLeft size={16} aria-hidden="true" />{t('ย้อนกลับ', 'Back')}</button
				>{/if}
				{#if step === 2}<button
						class="k-button primary"
						type="button"
						disabled={busy || !toolsReviewed}
						onclick={() => (step = 3)}>{t('ถัดไป', 'Continue')}</button
					>
				{:else}<button
						class="k-button primary"
						type="submit"
						disabled={busy || !toolsReviewed || !name.trim() || !scopeNote.trim()}
						>{saving
							? t('กำลังบันทึก…', 'Saving…')
							: t('บันทึกระบบ', 'Save system')}</button
					>{/if}
			</div>
		</form>
	{:else if !embedded}
		<div class="k-wizard-actions">
			{#if addSourceFlow}<a class="k-link-button" style="display:inline-flex;align-items:center;gap:6px" href={localeHref('/app?view=servers')}
				><ChevronLeft size={16} aria-hidden="true" />{t('กลับไปที่ระบบที่เชื่อมต่อ', 'Back to connected systems')}</a
			>{:else}<button class="k-link-button" type="button" disabled={busy || setupBusy} onclick={closeForm}
				><ChevronLeft size={16} aria-hidden="true" />{t('กลับไปที่ระบบที่เชื่อมต่อ', 'Back to connected systems')}</button
			>{/if}
		</div>
	{/if}
{:else if !policyMode && !embedded && !addSourceFlow}
	{#if data.connections.length > 4}<div class="k-field" style="max-width:440px;margin-bottom:20px">
			<label for="connection-search">{t('ค้นหาระบบ', 'Search systems')}</label><input
				id="connection-search"
				type="search"
				bind:value={query}
				placeholder={t('ชื่อหรือคำอธิบายของระบบ', 'System name or description')}
			/>
		</div>{/if}
	{#each visibleConnections as connection (connection.id)}
		<article class="k-panel">
			<div class="k-panel-head">
				<div class="k-actions">
					<span class="k-icon"><Plug size={18} aria-hidden="true" /></span>
					<div>
						<h2>{connection.name}</h2>
						<p class="k-muted k-small">{connection.description}</p>
					</div>
				</div>
				<span class="k-badge" class:active={connection.enabled}
					>{connection.enabled ? t('เปิดใช้งาน', 'Active') : t('ระงับ', 'Paused')}</span
				>
			</div>
			<p class="k-muted" style="white-space:pre-wrap">{connection.scopeNote}</p>
			<div class="k-meta">
				<span
					>{connection.tools?.length ?? connection.toolNames?.length ?? 0}
					{t('เครื่องมือที่ตรวจสอบแล้ว', 'Reviewed tools')}</span
				><span
					>{data.hubs.filter((hub) => gatewayUsesConnection(hub, connection.id)).length}
					{t('พื้นที่ทำงาน AI', 'AI workspaces')}</span
				><span>{connection.reviewedReadOnly ? t('อ่านข้อมูลเท่านั้น', 'Read-only') : t('ตามเครื่องมือที่อนุญาต', 'Allowed tools')}</span>
			</div>
			<div class="k-actions" style="margin-top:18px">
				{#if data.canManage}<button
						class="k-button small"
						disabled={Boolean(changingConnection)}
						onclick={() => openForm(connection)}
						><Pencil size={16} aria-hidden="true" /> {t('ตรวจสอบและแก้ไข', 'Review and edit')}</button
					><button
						class="k-button small"
						disabled={Boolean(changingConnection)}
						onclick={() => toggleEnabled(connection)}
						>{#if connection.enabled}<Pause size={16} aria-hidden="true" />{:else}<Play
								size={16}
								aria-hidden="true"
							/>{/if}{changingConnection === connection.id
							? t('กำลังบันทึก…', 'Saving…')
							: connection.enabled
								? t('ระงับการใช้งาน', 'Pause')
								: t('เปิดใช้งานอีกครั้ง', 'Resume')}</button
					>{/if}<a class="k-button quiet small" href={localeHref(`/app?view=audit`)}
					>{t('ดูประวัติการใช้งาน', 'View activity')}</a
				>
			</div>
			{#if connection.id !== savedSource?.id}
				{@render workspaceSteps(connection)}
			{/if}
		</article>
	{:else}<div class="k-empty">
			<Plug size={28} aria-hidden="true" />
			<h2 class="empty-title">
				{query
					? t('ไม่พบระบบที่ค้นหา', 'No matching systems')
					: t('ยังไม่มีระบบที่เชื่อมต่อ', 'No connected systems yet')}
			</h2>
			<p>
				{query
					? t('ลองใช้คำค้นอื่น', 'Try another search term.')
					: data.canManage
						? t(
								'เพิ่มระบบ ตรวจสอบสิทธิ์ของบัญชี แล้วเลือกเครื่องมือที่อนุญาต',
								'Add a system, check the account permissions, then choose the allowed tools.'
							)
						: t(
								'ระบบที่คุณใช้ได้จะแสดงที่นี่ เมื่อคุณเป็นสมาชิกของพื้นที่ทำงาน AI',
								'Systems available to you appear here when you join an AI workspace.'
							)}
			</p>
			{#if data.canManage && !query}<a
					class="k-button primary"
					href={localeHref('/app?view=servers&add=source')}>{t('เพิ่มระบบแรก', 'Add your first system')}</a
				>{/if}
		</div>{/each}
{/if}

<style>
	/* These styles load before the shared workspace CSS (WorkspaceWizard imports this component
	   first), so every override of a shared class carries at least one extra class. */
	.connection-banner.k-banner {
		margin: 0 0 16px;
	}
	.connection-banner p {
		margin: 0;
	}
	.connection-progress {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 0 0 20px;
		padding: 0;
		list-style: none;
	}
	.connection-progress li {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--orca-muted);
		font-size: 14px;
		font-weight: 500;
	}
	.connection-progress li + li::before {
		content: '';
		width: 24px;
		height: 1px;
		margin-right: 4px;
		background: var(--orca-line-strong);
	}
	.step-number {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 50%;
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 12px;
		font-weight: 600;
		line-height: 1;
	}
	.connection-progress .current,
	.connection-progress .complete {
		color: var(--orca-ink);
	}
	.connection-progress .current {
		font-weight: 600;
	}
	.current .step-number {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: #fff;
	}
	.complete .step-number {
		border-color: transparent;
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.connection-account[hidden] {
		display: none;
	}
	.step-description {
		margin-top: 4px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.k-panel .k-section {
		margin-top: 16px;
	}
	.k-panel.connection-account :global(.source-setup) {
		margin: 20px 0 0;
		padding: 20px 0 0;
		border: 0;
		border-top: 1px solid var(--orca-line);
		border-radius: 0;
		box-shadow: none;
	}
	/* In the embedded dialog the system is preselected, so the setup is the panel's first block. */
	.k-panel.connection-account > :global(.source-setup:first-child) {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}
	.discovery-status {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-top: 16px;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.7;
	}
	.discovery-status :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
	}
	.connection-account > :global(.k-button) {
		margin-top: 16px;
	}
	.connection-options {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid var(--orca-line);
	}
	.connection-options summary {
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.connection-options summary:hover {
		color: var(--orca-ink);
	}
	.connection-options > .k-actions {
		gap: 8px;
		margin-top: 12px;
	}
	/* Allowed-tool checklist: neutral rows separated by hairlines. */
	.k-panel .k-check-list {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.k-check-list .k-check-row {
		gap: 12px;
		padding: 12px 14px;
		border: 0;
		border-radius: 0;
		background: var(--orca-surface);
		font-size: 14px;
	}
	.k-check-list .k-check-row + .k-check-row {
		border-top: 1px solid #eff0f2;
	}
	.k-check-list .k-check-row:hover,
	.k-check-list .k-check-row.selected {
		background: var(--orca-surface-2);
	}
	.k-check-list .k-check-copy strong,
	.confirm-row .k-check-copy strong,
	.option-row .k-check-copy strong {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
	}
	.k-check-list .k-check-copy p,
	.confirm-row .k-check-copy p,
	.option-row .k-check-copy p {
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.schema-toggle {
		margin-top: 6px;
		color: var(--orca-muted);
		font-size: 13px;
		cursor: pointer;
	}
	.schema-toggle:hover {
		color: var(--orca-ink);
	}
	.schema-code {
		margin: 8px 0 0;
		padding: 10px 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-sm);
		background: var(--orca-surface-2);
		color: var(--orca-nav);
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.k-check-row.confirm-row,
	.k-check-row.option-row {
		gap: 12px;
		border: 0;
		border-radius: 0;
		background: none;
		font-size: 14px;
	}
	.k-check-row.confirm-row {
		padding: 16px 0 0;
	}
	.k-check-row.option-row {
		padding: 12px 0 0;
	}
	.k-check-row.confirm-row:hover,
	.k-check-row.option-row:hover {
		background: none;
	}
	#source-scope {
		min-height: 96px;
		resize: vertical;
	}
	.connection-review {
		margin-top: 20px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		font-size: 14px;
	}
	.connection-review strong {
		font-weight: 600;
	}
	.connection-review ul {
		margin: 6px 0 0;
		padding-left: 20px;
		color: var(--orca-muted);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.k-wizard-actions {
		gap: 8px;
		margin-top: 20px;
		padding-top: 0;
	}
	.k-wizard-actions :global(.k-button) {
		min-width: 0;
	}
	.connection-saved-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
	}
	.connection-saved-head h2 {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.connection-saved > :global(.k-button) {
		margin-top: 12px;
	}
	.connection-workspaces {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--orca-line);
	}
	.connection-next-title {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--orca-ink);
	}
	.connection-next-title h3 {
		margin: 0;
	}
	.connection-next-title :global(svg) {
		flex-shrink: 0;
		color: var(--orca-subtle);
	}
	.connection-workspaces > p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.connection-workspace-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		max-width: 100%;
	}
	.connection-workspace-links a {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 100%;
		min-height: 36px;
		padding: 6px 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-size: 14px;
		text-decoration: none;
	}
	.connection-workspace-links a:hover {
		border-color: var(--orca-line-strong);
		background: var(--orca-surface-2);
	}
	.connection-workspace-links a > span:first-child {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.connection-workspace-links :global(svg) {
		flex-shrink: 0;
		color: var(--orca-subtle);
	}
	.connection-unavailable {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.7;
	}
	.connection-unavailable :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
		color: var(--orca-subtle);
	}
	.k-panel-head .k-icon {
		width: 32px;
		height: 32px;
		border-radius: var(--orca-radius);
		background: var(--orca-secondary);
		color: var(--orca-nav);
	}
	.k-panel-head h2 {
		margin: 0;
	}
	.k-empty .empty-title {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	@media (max-width: 560px) {
		.connection-progress {
			gap: 8px;
		}
		.connection-progress li {
			gap: 6px;
			font-size: 13px;
		}
		.connection-progress li + li::before {
			width: 12px;
			margin-right: 2px;
		}
		.connection-workspace-links,
		.connection-workspace-links a,
		.connection-workspaces > .k-button {
			width: 100%;
		}
		.connection-workspace-links a > span:first-child {
			flex: 1;
		}
	}
</style>
