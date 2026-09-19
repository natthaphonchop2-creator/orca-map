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
	import { onMount, onDestroy, tick } from 'svelte';

	let {
		data,
		onchanged,
		initialSourceID = '',
		initialConnectionID = '',
		initiallyAddSource = false,
		mode = 'setup'
	}: {
		data: OrcaBootstrap;
		onchanged: () => Promise<void>;
		initialSourceID?: string;
		initialConnectionID?: string;
		initiallyAddSource?: boolean;
		mode?: 'setup' | 'policy';
	} = $props();
	let alive = true;
	let initialSelectionApplied = false;
	let discoveryGeneration = 0;
	let candidates = $state<OrcaCandidate[]>([]);
	let tools = $state<OrcaTool[]>([]);
	let editing = $state<OrcaConnection>();
	let formOpen = $state(false);
	let step = $state<1 | 2 | 3>(1);
	let creatingSource = $state(false);
	let sourceReady = $state(false);
	let setupBusy = $state(false);
	let suggestedName = $state('');
	let loading = $state(false);
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
							description: t('Server ที่บันทึกไว้', 'Saved server')
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
					'ไม่พบ Server นี้ หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง',
					'This connection was not found or is not accessible to your account.'
				);
				return;
			}
		} else if (initialSourceID) {
			const source = candidates.find((item) => item.id === initialSourceID);
			if (!source) {
				error = t(
					'ไม่พบเครื่องมือนี้ในคลังขององค์กร กรุณาเลือกเครื่องมืออีกครั้ง',
					'This source is no longer in the organization catalog. Choose a tool again.'
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
		window.scrollTo({ top: 0, behavior: 'instant' });
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
					'ยังไม่พบเครื่องมือจากระบบนี้ กรุณาตรวจสอบการเชื่อมต่อและบัญชีที่ใช้กับระบบนั้น',
					'This source has no discoverable tools yet. Check the connection and source account.'
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
				'กรุณาระบุชื่อและขอบเขตการใช้งาน แล้วตรวจสอบและยืนยันเครื่องมือที่เลือก',
				'Enter a name and data scope, then review and confirm the selected tools.'
			);
			return;
		}
		saving = true;
		error = '';
		try {
			dataAtSave = data;
			savedConnection = await OrcaService.connection(
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
			formOpen = false;
			query = '';
			success = t('บันทึก Server แล้ว', 'Server saved');
			await onchanged();
			await tick();
			window.scrollTo({ top: 0, behavior: 'instant' });
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
						'ระงับการใช้งานแล้ว ทุกพื้นที่ทำงานที่เชื่อมต่อระบบนี้จะเข้าถึงข้อมูลไม่ได้',
						'Server disabled. Every MCP Gateway using it can no longer access its data.'
					)
				: t('เปิดใช้งาน Server แล้ว', 'Server enabled');
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
			<Folder size={19} />
			<h3>
				{workspaces.length
					? t('MCP Gateways ที่ใช้ Server นี้', 'MCP Gateways using this server')
					: t('นำระบบนี้ไปใช้กับทีม', 'Use this source with your team')}
			</h3>
		</div>
		{#if workspaces.length}
			<p class="k-small k-muted">
				{t(
					'เลือก MCP Gateway เพื่อดูเครื่องมือ สมาชิก และการเชื่อมต่อกับ AI',
					'Open an MCP Gateway to review its tools, members, and AI connection.'
				)}
			</p>
			<div class="connection-workspace-links">
				{#each workspaces as workspace (workspace.id)}
					<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(workspace.id)}`)}>
						<span>{workspace.name}</span>
						<span class="k-badge" class:active={workspace.status === 'active'}
							>{statusLabels[workspace.status]}</span
						>
						<ArrowUpRight size={16} />
					</a>
				{/each}
			</div>
		{:else if data.canManage}
			<p class="k-small k-muted">
				{t(
					'สร้าง MCP Gateway แล้วเลือกเครื่องมือย่อยจากที่ Server อนุญาตและสมาชิกที่ต้องใช้',
					'Create an MCP Gateway, then choose a subset of this server’s approved tools and its members.'
				)}
			</p>
		{/if}
		{#if data.canManage && connectionReady(connection)}
			<a
				class="k-button small"
				href={localeHref(`/app?view=new&connection=${encodeURIComponent(connection.id)}`)}
			>
				<Plus size={17} />{workspaces.length
					? t('สร้าง MCP Gateway เพิ่มเติม', 'Create another MCP Gateway')
					: t('สร้าง MCP Gateway ด้วย Server นี้', 'Create an MCP Gateway with this server')}
			</a>
		{:else if data.canManage}
			<p class="connection-unavailable">
				<Info size={17} />{!connection.enabled
					? t(
							'เปิดใช้งาน Server นี้ก่อนสร้าง MCP Gateway เพิ่มเติม Gateway เดิมยังเข้าถึงข้อมูลจาก Server นี้ไม่ได้',
							'Enable this server before creating an MCP Gateway. Existing Gateways cannot access its data while it is disabled.'
						)
					: t(
							'ตรวจสอบและบันทึกรายการเครื่องมือก่อนสร้าง MCP Gateway',
							'Review and save this server’s tools before creating an MCP Gateway.'
						)}
			</p>
		{/if}
	</div>
{/snippet}

<div class="k-breadcrumb">
	<a href={localeHref('/app?view=servers')}>Servers</a><span>/</span><span
		>{t('ระบบต้นทาง', 'Source systems')}</span
	>{#if formOpen}<span>/</span><span
			>{editing ? t('แก้ไข', 'Edit') : t('เพิ่ม Server', 'Add server')}</span
		>{/if}
</div>
<div class="k-intro">
	<div class="k-heading-row">
		<h1 bind:this={title} tabindex="-1">
			{formOpen
				? editing
					? t('ตรวจสอบและแก้ไข Server', 'Review and edit server')
					: t('เพิ่ม Server', 'Add server')
				: 'Servers'}
		</h1>
		{#if !formOpen && data.canManage}<a
				class="k-button primary"
				href={localeHref('/app?view=servers&add=source')}><Plus size={19} /> {t('เพิ่ม Server', 'Add server')}</a
			>{/if}
	</div>
	<p class="k-subtitle">
		{t(
			'ตั้งค่าระบบต้นทางและขอบเขตเครื่องมือที่องค์กรอนุญาต',
			'Configure source systems and the maximum set of tools approved by your organization.'
		)}
	</p>
</div>
{#if error}<div class="k-banner error" role="alert">
		<Info size={19} />
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
{#if success}<div class="k-banner success" role="status"><Check size={19} />{success}</div>{/if}
{#if !formOpen && savedSource && data.canManage}
	<section
		class="k-panel connection-saved"
		aria-label={t('ขั้นตอนถัดไปหลังบันทึก Server', 'Next steps after saving your server')}
	>
		<p class="connection-saved-label">{t('ขั้นตอนถัดไป', 'Next step')}</p>
		<h2>{savedSource.name}</h2>
		{#if policyMode}<button class="k-button" onclick={() => openForm(savedSource)}>
			{t('ตรวจสอบและแก้ไขเครื่องมืออีกครั้ง', 'Review and edit tools again')}
		</button>{/if}
		{@render workspaceSteps(savedSource)}
	</section>
{/if}

{#if formOpen && data.canManage}
	<ol class="connection-progress" aria-label={t('ขั้นตอนตั้งค่า Server', 'Server setup steps')}>
		{#each policyMode ? [t('เลือกเครื่องมือ', 'Choose tools'), t('บันทึก', 'Save')] : [t('เชื่อมบัญชี', 'Connect account'), t('เลือกเครื่องมือ', 'Choose tools'), t('บันทึก', 'Save')] as label, index (index)}
			{@const stepNumber = index + (policyMode ? 2 : 1)}
			<li
				class:current={step === stepNumber}
				class:complete={step > stepNumber}
				aria-current={step === stepNumber ? 'step' : undefined}
			>
				<span class="step-number"
					>{#if step > stepNumber}<Check size={15} />{:else}{index + 1}{/if}</span
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
		<h2>{t('เลือกระบบ แล้วเชื่อมบัญชีของคุณ', 'Choose a system and connect your account')}</h2>
		<p class="k-small k-muted step-description">
			{t(
				'ตรวจการเชื่อมต่อแล้ว ORCA จะแสดงรายการเครื่องมือให้เลือกในขั้นถัดไป',
				'After the connection check, ORCA will show the tool list for you to review.'
			)}
		</p>
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
		{#if editing}<p class="k-small k-muted">
				{t(
					'หากต้องการเปลี่ยนระบบต้นทาง ให้เพิ่ม Server ใหม่',
					'To use a different source system, add a new server.'
				)}
			</p>{/if}
		{#if loading}<p class="k-muted k-small">{t('กำลังโหลดรายชื่อระบบ…', 'Loading systems…')}</p>
		{:else if !selectableCandidates.length}<p class="k-muted k-small">
				{t(
					'ยังไม่มีระบบในรายการ เพิ่มระบบของคุณได้ที่ “ตัวเลือกเพิ่มเติม” ด้านล่าง',
					'No systems yet. Add your system under More options below.'
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
				<LoaderCircle size={18} class="k-spin" />{t(
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
					onclick={loadCandidates}>{t('โหลดรายชื่อระบบใหม่', 'Refresh systems')}</button
				>
			</div>
		</details>
	</section>
	{:else if discovering}
		<p class="discovery-status" role="status"><LoaderCircle size={18} class="k-spin" />{t('กำลังโหลดรายการเครื่องมือล่าสุด…', 'Loading current tools…')}</p>
	{:else if !discoveredID || !tools.length}
		<div class="k-banner"><Info size={18} /><div>
			<p>{t('โหลดเครื่องมือล่าสุดก่อนยืนยันสิทธิ์ หากบัญชียังไม่พร้อม ให้เชื่อมบัญชีในแท็บ Account แล้วกลับมาตรวจเครื่องมือ', 'Load the current tools before approving access. If your source account needs attention, open Account and then return to review tools.')}</p>
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
						<h2>{t('กำหนดขอบเขตเครื่องมือของ Server', 'Set the server’s approved tools')}</h2>
						<p class="k-small k-muted step-description">
							{sourceLabel} · {t(
								'เลือกขอบเขตเครื่องมือสูงสุดที่องค์กรอนุญาต แต่ละ MCP Gateway เลือกเครื่องมือย่อยและสมาชิกได้ภายในขอบเขตนี้',
								'Choose the maximum approved tool set. Each MCP Gateway chooses a subset of these tools and its members.'
							)}
						</p>
						<div class="k-field k-section">
                            <label for="tool-access-mode">{t('รูปแบบการใช้งาน', 'Access mode')}</label>
                            <select id="tool-access-mode" bind:value={readOnly} onchange={() => { reviewedTools = false; }}>
                                <option value={false}>{t('ใช้งานตามเครื่องมือที่เลือก', 'Use selected tools')}</option>
                                <option value={true}>{t('จำกัดเฉพาะอ่านข้อมูล', 'Read-only tools')}</option>
                            </select>
                            <p class="k-small k-muted">{t('เครื่องมือที่เลือกอาจสร้าง แก้ไข หรือลบข้อมูลได้ ตามความสามารถของเครื่องมือและสิทธิ์ที่คุณอนุญาตในระบบต้นทาง', 'Selected tools may create, update, or delete data within the permissions you grant in the source system.')}</p>
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
														'ระบบที่เชื่อมต่อไม่ได้ระบุคำอธิบาย',
														'No description provided by the source'
													)}
											</p>
											<details>
												<summary class="k-small" style="margin-top:6px;color:var(--k-accent)"
													>{t(
														'ดูข้อมูลที่เครื่องมือต้องใช้ (Input schema)',
														'View input schema'
													)}</summary
												>
												<pre
													style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;margin-top:8px">{JSON.stringify(
														tool.inputSchema,
														null,
														2
													)}</pre>
											</details>
										</div>
									</div>{/each}
							</div>{:else}<div class="k-banner">
								<Info size={19} />
								<p>
									{t(
										'เลือก “โหลดรายการเครื่องมือ” จากระบบที่ต้องการใช้ก่อน',
										'Discover tools from the source before selecting them.'
									)}
								</p>
							</div>{/if}
						<label class="k-check-row" style="padding:21px 0"
							><input
								type="checkbox"
								bind:checked={reviewedTools}
								disabled={!tools.length || !toolNames.length}
							/><span class="k-check-copy"
								><strong
									>{t(
										'ยืนยันให้ใช้งานเครื่องมือที่เลือก ตามสิทธิ์ของบัญชีที่เชื่อมต่อ',
										'I reviewed and approve the selected tools within the connected account’s permissions.'
									)}</strong
								>
								<p>
									{t(
										'ORCA อนุญาตเฉพาะเครื่องมือที่ตรวจสอบแล้ว หากรูปแบบข้อมูลของเครื่องมือเปลี่ยน จะระงับการใช้จนกว่าจะตรวจสอบอีกครั้ง',
										'ORCA allows only the reviewed tools. If a tool’s schema changes, access pauses until it is reviewed again.'
									)}
								</p></span
							></label
						>
					</section>
				{:else}
					<section class="k-panel">
						<h2>{t('บันทึก Server ขององค์กร', 'Save your organization’s server')}</h2>
						<p class="k-small k-muted step-description">
							{t(
								'ตั้งชื่อ Server ให้จำง่าย และอธิบายขอบเขตข้อมูลที่ใช้',
								'Give this server a clear name and describe its data scope.'
							)}
						</p>
						<div class="k-field k-section">
							<label for="source-name">{t('ชื่อที่ทีมจะเห็น', 'Name shown to your team')}</label>
							<input
								id="source-name"
								bind:value={name}
								maxlength="100"
								required
								placeholder={t('เช่น เอกสารทีมขาย', 'For example, Sales documents')}
							/>
						</div>
						<div class="k-field">
							<label for="source-scope"
								>{t('ขอบเขตการใช้งาน', 'Data scope allowed by the source account')}</label
							><textarea
								id="source-scope"
								bind:value={scopeNote}
								maxlength="2000"
								required
								placeholder={t(
									'ระบุบัญชีหรือชุดข้อมูลที่ใช้ และสิทธิ์การเข้าถึงที่ตั้งค่าไว้ในระบบนั้น',
									'Describe the connected account or dataset and the restrictions actually configured.'
								)}
							></textarea>
							<p class="k-muted k-small">
								{t(
									'ข้อความนี้ใช้อธิบายการใช้งาน ไม่ได้กรองหรือจำกัดข้อมูล หากต้องการจำกัดไฟล์หรือโฟลเดอร์ ให้ตั้งค่าสิทธิ์ในระบบที่เชื่อมต่อ',
									'This describes permissions set in the source system. File or folder restrictions must also be configured there.'
								)}
							</p>
						</div>
						<div class="connection-review">
							<strong
								>{t(
									`เลือกไว้ ${toolNames.length} เครื่องมือ`,
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
							<label class="k-check-row" style="padding:4px 0"
								><input type="checkbox" bind:checked={enabled} /><span class="k-check-copy"
									><strong
										>{t(
											'อนุญาตให้ MCP Gateways ใช้ Server นี้',
											'Allow MCP Gateways to use this server'
										)}</strong
									>
									<p>
										{t(
											'หากปิดตัวเลือกนี้ ทุก MCP Gateway ที่ใช้ Server นี้จะเข้าถึงข้อมูลไม่ได้',
											'Disabling this server stops access from every MCP Gateway that uses it.'
										)}
									</p></span
								></label
							>
						</details>
						{#if !enabled}<p class="k-small k-muted">
								{t(
									'Server นี้ปิดใช้งานอยู่ เปลี่ยนได้ในรายละเอียดเพิ่มเติม',
									'This server is disabled. Change this under Additional details.'
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
					}}><ChevronLeft size={17} />{t('ย้อนกลับ', 'Back')}</button
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
							: t('บันทึก Server', 'Save server')}</button
					>{/if}
			</div>
		</form>
	{:else}
		<div class="k-wizard-actions">
			<button class="k-link-button" type="button" disabled={busy || setupBusy} onclick={closeForm}
				><ChevronLeft size={17} />{t('กลับไป Servers', 'Back to Servers')}</button
			>
		</div>
	{/if}
{:else if !policyMode}
	{#if data.connections.length > 4}<div class="k-field" style="max-width:440px;margin-bottom:20px">
			<label for="connection-search">{t('ค้นหาระบบ', 'Search sources')}</label><input
				id="connection-search"
				type="search"
				bind:value={query}
				placeholder={t('ชื่อหรือคำอธิบายระบบ', 'Source name or description')}
			/>
		</div>{/if}
	{#each visibleConnections as connection (connection.id)}
		<article class="k-panel">
			<div class="k-panel-head">
				<div class="k-actions">
					<span class="k-icon"><Plug size={23} /></span>
					<div>
						<h2>{connection.name}</h2>
						<p class="k-muted k-small">{connection.description}</p>
					</div>
				</div>
				<span class="k-badge" class:active={connection.enabled}
					>{connection.enabled ? t('เปิดใช้งาน', 'Available') : t('ปิดใช้งาน', 'Disabled')}</span
				>
			</div>
			<p class="k-muted" style="white-space:pre-wrap">{connection.scopeNote}</p>
			<div class="k-meta">
				<span
					>{connection.tools?.length ?? connection.toolNames?.length ?? 0}
					{t('เครื่องมือที่ตรวจสอบแล้ว', 'Reviewed tools')}</span
				><span
					>{data.hubs.filter((hub) => gatewayUsesConnection(hub, connection.id)).length}
					{'MCP Gateways'}</span
				><span>{connection.reviewedReadOnly ? t('อ่านข้อมูลเท่านั้น', 'Read only') : t('ตามเครื่องมือที่เลือก', 'Selected tools')}</span>
			</div>
			<div class="k-actions" style="margin-top:18px">
				{#if data.canManage}<button
						class="k-button small"
						disabled={Boolean(changingConnection)}
						onclick={() => openForm(connection)}
						><Pencil size={15} /> {t('ตรวจสอบและแก้ไข', 'Review and edit')}</button
					><button
						class="k-button small"
						disabled={Boolean(changingConnection)}
						onclick={() => toggleEnabled(connection)}
						>{#if connection.enabled}<Pause size={15} />{:else}<Play
								size={15}
							/>{/if}{changingConnection === connection.id
							? t('กำลังบันทึก…', 'Saving…')
							: connection.enabled
								? t('ระงับ Server', 'Disable server')
								: t('เปิดใช้งาน Server อีกครั้ง', 'Enable server')}</button
					>{/if}<a class="k-button quiet small" href={localeHref(`/app?view=audit`)}
					>{t('ดูประวัติการใช้งาน', 'View activity')}</a
				>
			</div>
			{#if connection.id !== savedSource?.id}
				{@render workspaceSteps(connection)}
			{/if}
		</article>
	{:else}<div class="k-empty">
			<Plug size={35} />
			<h2>
				{query
					? t('ไม่พบระบบที่ค้นหา', 'No matching sources')
					: t('เชื่อมต่อระบบแรกของทีม', 'Start by connecting a system your team uses')}
			</h2>
			<p>
				{query
					? t('ลองใช้คำค้นอื่น', 'Try another search term.')
					: data.canManage
						? t(
								'เชื่อมต่อแหล่งข้อมูล ตรวจสอบสิทธิ์ แล้วเลือกเครื่องมือสำหรับค้นหาและอ่านข้อมูล',
								'Set up the source, check its data scope, then select tools that read data.'
							)
						: t(
								'ระบบที่คุณใช้ได้จะแสดงที่นี่ เมื่อคุณได้รับสิทธิ์เป็นสมาชิกของพื้นที่ทำงาน',
								'Available sources appear here when you join a workspace.'
							)}
			</p>
			{#if data.canManage && !query}<a
					class="k-button primary"
					href={localeHref('/app?view=servers&add=source')}>{t('เพิ่ม Server แรก', 'Add your first server')}</a
				>{/if}
		</div>{/each}
{/if}

<style>
	.connection-progress {
		display: flex;
		list-style: none;
		padding: 0;
		margin: 0 0 24px;
		gap: 24px;
	}
	.connection-progress li {
		display: flex;
		gap: 9px;
		align-items: center;
		color: var(--k-muted);
		font-size: 14px;
	}
	.step-number {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #e9edf2;
	}
	.connection-progress .current {
		color: var(--k-ink);
		font-weight: 600;
	}
	.current .step-number {
		background: var(--k-ink, #171b28);
		color: #d7f571;
	}
	.complete .step-number {
		background: #edf5d9;
		color: #4e6826;
	}
	.connection-account[hidden] {
		display: none;
	}
	.step-description {
		margin-top: 8px;
	}
	.connection-account :global(.source-setup) {
		border: 0;
		border-top: 1px solid var(--k-line);
		border-radius: 0;
		box-shadow: none;
		padding: 22px 0 0;
		margin: 22px 0 0;
	}
	.discovery-status {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		font-size: 13px;
		margin-top: 18px;
		line-height: 1.75;
		color: var(--k-muted);
	}
	.discovery-status :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
	}
	.connection-options {
		border-top: 1px solid var(--k-line);
		margin-top: 22px;
		padding-top: 18px;
	}
	.connection-options summary {
		cursor: pointer;
		color: var(--k-muted);
		font-size: 13px;
	}
	.connection-options > .k-actions {
		margin-top: 15px;
	}
	.connection-review {
		padding: 16px 18px;
		border-radius: 10px;
		background: #f6f8f0;
		margin-top: 22px;
		font-size: 14px;
	}
	.connection-review ul {
		padding-left: 20px;
		margin: 8px 0 0;
		overflow-wrap: anywhere;
		color: var(--k-muted);
	}
	@media (max-width: 560px) {
		.connection-progress {
			gap: 12px;
			justify-content: space-between;
		}
		.connection-progress li {
			font-size: 12px;
			gap: 6px;
		}
		.step-number {
			width: 24px;
			height: 24px;
		}
	}
	.connection-saved {
		border-color: #c9dba5;
		background: linear-gradient(120deg, #fbfdf5, #fff);
	}
	.connection-saved-label {
		margin-bottom: 6px;
		color: #617832;
		font-size: 12px;
		font-weight: 600;
	}
	.connection-workspaces {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		margin-top: 20px;
		padding-top: 18px;
		border-top: 1px solid var(--k-line, #e0e4ec);
	}
	.connection-next-title {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--o-ink, #171b28);
	}
	.connection-next-title h3 {
		font-size: 15px;
		line-height: 1.6;
		font-weight: 600;
	}
	.connection-next-title :global(svg) {
		flex-shrink: 0;
		color: #72894c;
	}
	.connection-workspace-links {
		display: flex;
		flex-wrap: wrap;
		gap: 9px;
		max-width: 100%;
	}
	.connection-workspace-links a {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 100%;
		min-height: 42px;
		padding: 9px 12px;
		border: 1px solid var(--k-line, #e0e4ec);
		border-radius: 9px;
		background: #fff;
		color: var(--o-ink, #171b28);
		font-size: 13px;
		text-decoration: none;
	}
	.connection-workspace-links a:hover {
		border-color: #a3b777;
		background: #f7faef;
	}
	.connection-workspace-links a:focus-visible {
		outline: 2px solid #617832;
		outline-offset: 3px;
	}
	.connection-workspace-links a > span:first-child {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.connection-workspace-links :global(svg) {
		flex-shrink: 0;
	}
	.connection-unavailable {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		color: var(--o-muted, #687086);
		font-size: 13px;
		line-height: 1.75;
	}
	.connection-unavailable :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
	}
	@media (max-width: 560px) {
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
