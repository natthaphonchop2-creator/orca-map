<script lang="ts">
	import { goto } from '$app/navigation';
	import LifecycleActions from '$lib/components/orca/LifecycleActions.svelte';
	import { page } from '$app/state';
	import GatewayClientSetup from '$lib/components/orca/GatewayClientSetup.svelte';
	import SourceSetup from '$lib/components/orca/SourceSetup.svelte';
	import WorkspaceReadiness from '$lib/components/orca/WorkspaceReadiness.svelte';
	import { personalKeyAvailable, workspaceToolingReady } from '$lib/orca/activation';
	import { gatewaySources, gatewayToolCount, gatewayMemberIDs, gatewayHasMember } from '$lib/orca/gateway-sources';
	import { matchesToolSearch, toolPresentation } from '$lib/orca/tool-presentation';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { t, localeHref, orcaLocale } from '$lib/orca/locale.svelte';
	import { OrcaUserSourcesService, type OrcaUserSource } from '$lib/services/orca-user-sources';
	import {
		OrcaService,
		displayDate,
		orcaError,
		memberName,
		statusLabels,
		type OrcaBootstrap,
		type OrcaHub,
		type HubInput,
		type OrcaKey
	} from '$lib/services/orca';
	import {
		BookOpen,
		Check,
		Copy,
		Eye,
		EyeOff,
		FileCheck2,
		Info,
		KeyRound,
		Pause,
		Pencil,
		Play,
		Plug,
		RefreshCw,
		ShieldCheck,
		Trash2,
		Users
	} from '@lucide/svelte';
	import { onDestroy, onMount, untrack } from 'svelte';

	let {
		data,
		hub,
		onchanged
	}: { data: OrcaBootstrap; hub: OrcaHub; onchanged: () => Promise<void> } = $props();
	const selectedTab = $derived(page.url.hash === '#connect-ai' ? 'connect' : (page.url.searchParams.get('tab') || 'overview'));
	const archived = $derived(hub.status === 'archived' || hub.status === 'deleted');
	const activeTab = $derived(archived && selectedTab === 'connect' ? 'overview' : ['overview', 'tools', 'access', 'connect'].includes(selectedTab) ? selectedTab : 'overview');
	let toolQuery = $state('');
	const tabs = $derived([
		{ id: 'overview', label: t('ภาพรวม', 'Overview') },
		{ id: 'tools', label: t('เครื่องมือ', 'Tools'), count: gatewayToolCount(hub) },
		{ id: 'access', label: t('สิทธิ์และสมาชิก', 'Access & members'), count: gatewayMemberIDs(hub).length },
		...(!archived ? [{ id: 'connect', label: t('เชื่อมแอป AI', 'Connect AI') }] : [])
	]);
	function tabHref(tab: string) {
		return localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=${tab}`);
	}
	const sources = $derived(gatewaySources(hub).map((source) => {
		const connection = data.connections.find((item) => item.id === source.connectionID);
		const ready = workspaceToolingReady({ ...hub, sources: [source] }, connection);
		return { ...source, connection, ready };
	}));
	const selectedTools = $derived(sources.flatMap((source) => source.toolNames.map((name) => ({
		key: JSON.stringify([source.connectionID, name]),
		name, source,
		tool: source.connection?.tools.find((item) => item.name === name) ?? { name, inputSchema: {} }
	}))));
	const visibleTools = $derived(selectedTools.filter((item) =>
		matchesToolSearch(item.tool, toolQuery, orcaLocale.value) ||
		!!toolQuery.trim() && (item.source.connection?.name ?? '').toLocaleLowerCase().includes(toolQuery.trim().toLocaleLowerCase())
	));
	let accountSourceID = $state('');
	let keys = $state<OrcaKey[]>([]);
	let loadingKeys = $state(false);
	let keysLoaded = $state(false);
	let keyRequest = 0;
	let keyCreationGeneration = 0;
	let keyOwner = '';
	let now = $state(Date.now());
	let saving = $state(false);
	let error = $state('');
	let keyError = $state('');
	let notice = $state('');
	let keyName = $state('');
	let expiryDays = $state<number | undefined>(7);
	let newKey = $state('');
	let newKeyID = $state<number>();
	let revealKey = $state(false);
	let creating = $state(false);
	let revoking = $state<number>();
	let confirmRevoke = $state<number>();
	let userSourceID = $state(untrack(() => hub.userSourceID ?? ''));
	let userSources = $state<OrcaUserSource[]>([]);
	let loadingUserSources = $state(false);
	let userSourcesError = $state('');
	let identitySaving = $state(false);
	let identitySaved = $state(false);
	let userSourcesRequest = 0;
	let userSourcesController: AbortController | undefined;
	const selectedUserSource = $derived(userSources.find((source) => source.id === userSourceID));
	const identityChanged = $derived(userSourceID !== (hub.userSourceID ?? ''));
	const unavailableTools = $derived(selectedTools.filter((item) => !item.source.ready));
	function accessLabel(readOnly: boolean | undefined) {
		return readOnly ? t('อ่านข้อมูลเท่านั้น', 'Read only') : t('เครื่องมือที่เลือก', 'Selected tools');
	}
	const isMember = $derived(gatewayHasMember(hub, data.currentUserID));
	const canConnect = $derived(
		isMember && hub.status === 'active' && workspaceToolingReady(hub, data.connections)
	);
	const members = $derived(data.members.filter((item) => gatewayHasMember(hub, item.id)));
	const used = $derived(hub.usedToday ?? 0);
	const usagePercent = $derived(
		Math.min(100, Math.round((used / Math.max(hub.dailyLimit, 1)) * 100))
	);
	const keyState = $derived(
		keyError
			? 'error'
			: loadingKeys || !keysLoaded
				? 'loading'
				: keys.some((key) => personalKeyAvailable(key, now))
					? 'ready'
					: 'empty'
	);
	function clearCreatedKey() {
		newKey = '';
		newKeyID = undefined;
		revealKey = false;
	}

	async function loadKeys() {
		if (!isMember || archived) return;
		const request = ++keyRequest;
		loadingKeys = true;
		keyError = '';
		try {
			const result = await OrcaService.keys(hub.id);
			if (request !== keyRequest || !isMember || archived) return;
			keys = result;
			keysLoaded = true;
			now = Date.now();
		} catch (cause) {
			if (request === keyRequest) keyError = orcaError(cause);
		} finally {
			if (request === keyRequest) loadingKeys = false;
		}
	}
	$effect(() => {
		const owner = `${data.currentUserID}:${hub.id}`;
		if (owner !== keyOwner) {
			keyOwner = owner;
			keyRequest += 1;
			keyCreationGeneration += 1;
			keys = [];
			keysLoaded = false;
			clearCreatedKey();
			confirmRevoke = undefined;
		}
	});
	$effect(() => {
		const currentData = data;
		if (archived || !gatewayHasMember(hub, currentData.currentUserID)) {
			keyRequest += 1;
			keys = [];
			keysLoaded = false;
			loadingKeys = false;
		} else void untrack(loadKeys);
	});
	onMount(() => {
		void loadUserSources();
		const timer = window.setInterval(() => (now = Date.now()), 30_000);
		return () => window.clearInterval(timer);
	});
	onDestroy(() => {
		userSourcesRequest++;
		userSourcesController?.abort();
		keyRequest += 1;
		keyCreationGeneration += 1;
		clearCreatedKey();
	});
	$effect(() => {
		if (!canConnect || activeTab !== 'connect') {
			keyCreationGeneration += 1;
			clearCreatedKey();
		}
	});
	$effect(() => {
		const currentHub = hub;
		userSourceID = currentHub.userSourceID ?? '';
		identitySaved = false;
	});
	async function loadUserSources() {
		userSourcesController?.abort();
		const request = ++userSourcesRequest;
		if (!data.canManage) return;
		const controller = new AbortController();
		userSourcesController = controller;
		loadingUserSources = true;
		userSourcesError = '';
		try {
			const result = await OrcaUserSourcesService.list(controller.signal);
			if (request === userSourcesRequest && !controller.signal.aborted && data.canManage) userSources = result.items;
		} catch (cause) {
			if (request === userSourcesRequest && !controller.signal.aborted) userSourcesError = orcaError(cause);
		} finally {
			if (request === userSourcesRequest) loadingUserSources = false;
		}
	}
	function hubInput(identity = hub.userSourceID ?? ''): HubInput {
		return {
			name: hub.name, description: hub.description, connectionID: hub.connectionID,
			toolNames: hub.toolNames, sources: gatewaySources(hub), memberIDs: hub.memberIDs,
			...(hub.accessUnitIDs !== undefined ? { accessUnitIDs: hub.accessUnitIDs } : {}),
			unitIDs: hub.unitIDs, dailyLimit: hub.dailyLimit, status: hub.status,
			userSourceID: identity, version: hub.version,
		};
	}
	async function saveIdentity() {
		if (!data.canManage || archived || saving || identitySaving || !identityChanged) return;
		if (userSourceID && !selectedUserSource?.enabled) {
			userSourcesError = t('เลือก User source ที่เปิดใช้งาน หรือใช้บัญชี ORCA', 'Choose an enabled user source or use an ORCA account.');
			return;
		}
		identitySaving = true;
		identitySaved = false;
		userSourcesError = '';
		try {
			await OrcaService.hub(hubInput(userSourceID), hub.id);
			await onchanged();
			identitySaved = true;
		} catch (cause) {
			userSourcesError = orcaError(cause);
		} finally { identitySaving = false; }
	}
	async function changeStatus() {
		if (saving || identitySaving || archived || !data.canManage) return;
		saving = true;
		error = '';
		try {
			await OrcaService.hub(
				{
					...hubInput(),
					status: hub.status === 'active' ? 'paused' : 'active',
				},
				hub.id
			);
			await onchanged();
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			saving = false;
		}
	}
	async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
		clearCreatedKey();
		await onchanged();
		if (action === 'delete') await goto(localeHref('/app?view=workspaces'));
	}
	async function createKey() {
		if (creating || !canConnect) return;
		if (
			!keyName.trim() ||
			!Number.isInteger(expiryDays) ||
			(expiryDays ?? -1) < 0 ||
			(expiryDays ?? 0) > 30
		) {
			keyError = t(
				'กรุณาตั้งชื่อคีย์และเลือกอายุการใช้งาน หรือเลือกไม่หมดอายุ',
				'Enter a key name and choose an expiry or Never expires.'
			);
			return;
		}
		creating = true;
		const request = ++keyCreationGeneration;
		const creatorID = data.currentUserID;
		const createdHubID = hub.id;
		keyError = '';
		notice = '';
		clearCreatedKey();
		try {
			const created = await OrcaService.createKey(hub.id, keyName.trim(), expiryDays!);
			if (request === keyCreationGeneration && canConnect && activeTab === 'connect' && data.currentUserID === creatorID && hub.id === createdHubID) {
				newKey = created.key;
				newKeyID = created.id;
			}
			keyName = '';
			await loadKeys();
		} catch (cause) {
			keyError = orcaError(cause);
		} finally {
			creating = false;
		}
	}
	async function copy(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			notice = t(`คัดลอก${label}แล้ว`, `${label} copied`);
		} catch {
			notice = '';
			keyError = t(
				'คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง',
				'Your browser could not copy this. Select the text and copy it manually.'
			);
		}
	}
	async function revokeKey(id: number) {
		if (revoking !== undefined) return;
		revoking = id;
		keyError = '';
		notice = '';
		try {
			await OrcaService.revokeKey(hub.id, id);
			if (newKeyID === id) clearCreatedKey();
			confirmRevoke = undefined;
			await loadKeys();
			notice = t('ยกเลิกคีย์แล้ว', 'Key revoked');
		} catch (cause) {
			keyError = orcaError(cause);
		} finally {
			revoking = undefined;
		}
	}
</script>

<div class="k-breadcrumb">
	<a href={localeHref('/app?view=workspaces')}>{t('MCP Gateways', 'MCP Gateways')}</a><span>/</span><span
		>{hub.name}</span
	>
</div>
<div class="k-intro">
	<div class="k-heading-row">
		<h1>{hub.name}</h1>
		<span class="k-badge {hub.status}">{statusLabels[hub.status]}</span>
	</div>
	<p class="k-subtitle">
		{hub.description ||
			t(
				'ข้อมูลและเครื่องมือสำหรับทีมของคุณ ตามสิทธิ์ที่กำหนดไว้',
				'Data and tools your team is allowed to use.'
			)}
	</p>
	{#if isMember && !archived}<a
			class="k-button"
			style="margin-top:16px"
			href={localeHref(`/app?view=knowledge&hub=${encodeURIComponent(hub.id)}`)}
			><BookOpen size={18} />{t(
				'ความรู้และเทมเพลตของ Gateway นี้',
				'Gateway knowledge & templates'
			)}</a
		>{/if}
	{#if data.canManage}<div class="k-actions" style="margin-top:20px">
			{#if !archived}<a class="k-button" href={localeHref(`/app?view=new&edit=${encodeURIComponent(hub.id)}`)}
				><Pencil size={17} /> {t('แก้ไข Gateway', 'Update Gateway')}</a
			><button class="k-button" disabled={saving} onclick={changeStatus}
				>{#if hub.status === 'active'}<Pause size={17} />{:else}<Play size={17} />{/if}{saving
					? t('กำลังบันทึก…', 'Saving…')
					: hub.status === 'active'
						? t('ระงับการใช้งาน', 'Pause access')
						: t('เปิดใช้งาน', 'Activate')}</button
			>{/if}
			<LifecycleActions entity={hub} kind="gateway" {archived} canManage={data.canManage} onchanged={lifecycleChanged} onreload={onchanged} />
		</div>{/if}
</div>
{#if archived}<div class="k-banner" role="status"><Info size={20} /><p>{t('Gateway นี้จัดเก็บแล้ว ไม่สามารถเรียก MCP เข้าถึงความรู้ หรือสร้างคีย์ได้ กู้คืนเพื่อกลับมาตรวจสอบและเปิดใช้งานใหม่ คีย์เก่าจะใช้ไม่ได้อีก', 'This Gateway is archived. MCP calls, knowledge access and key creation are disabled. Restore it to review and activate it again. Old keys remain revoked.')}</p></div>{/if}
{#if error}<div class="k-banner error" role="alert">
		<Info size={19} />
		<div>
			{error}
			<div class="k-actions">
				<button class="k-link-button" disabled={saving} onclick={onchanged}
					>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button
				>
			</div>
		</div>
	</div>{/if}
{#if sources.some((source) => !source.ready)}<div class="k-banner" role="status">
		<Info size={19} />
		<p>
			{t(
				'บางแอปยังใช้งานไม่ได้ ตรวจบัญชีและสิทธิ์ของแอปนั้น ส่วนแอปที่พร้อมยังใช้ได้ตามสิทธิ์',
				'Some apps are unavailable. Review those accounts and permissions. Ready apps remain accessible.'
			)}
		</p>
	</div>{/if}

<nav class="gateway-tabs" aria-label={t('รายละเอียด Gateway', 'Gateway details')}>
	{#each tabs as tab}<a href={tabHref(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} class:active={activeTab === tab.id}>
		{tab.label}{#if tab.count !== undefined}<span>{tab.count}</span>{/if}
	</a>{/each}
	<a href={localeHref(`/app?view=executions&hub=${encodeURIComponent(hub.id)}`)}>{t('ประวัติการเรียก', 'Executions')}</a>
</nav>

{#if activeTab === 'overview'}

<div class="k-grid-2">
	<div class="k-panel">
		<div class="k-section-title"><h2>{t('แอปใน Gateway นี้', 'Apps in this Gateway')}</h2><span class="k-badge">{sources.length}</span></div>
		<div class="gateway-source-list">
			{#each sources as source (source.connectionID)}
				<div class="gateway-source-row">
					<CatalogIcon name={source.connection?.name || ''} size={30} />
					<div><strong>{source.connection?.name || t('ไม่พบ Server นี้', 'Server unavailable')}</strong><p class="k-small k-muted">{source.toolNames.length} {t('เครื่องมือ', 'tools')} · {accessLabel(source.connection?.reviewedReadOnly)}</p></div>
					<span class="k-badge" class:paused={!source.ready}>{source.ready ? t('พร้อมใช้', 'Ready') : t('ตรวจการตั้งค่า', 'Needs review')}</span>
				</div>
			{/each}
		</div>
		<p class="k-small k-muted" style="margin-top:13px">{t('แต่ละแอปใช้สิทธิ์ของบัญชีต้นทาง ร่วมกับเครื่องมือและสมาชิกที่กำหนดใน Gateway นี้', 'Each app follows its source account permissions and this Gateway’s selected tools and members.')}</p>
	</div>
	<div class="k-panel" style="margin-top:0">
		<div class="k-panel-head">
			<div>
				<p class="k-muted k-small">
					{t('การใช้งานของทีมวันนี้ · เวลาไทย', 'Today’s usage · Bangkok time')}
				</p>
				<h2>
					{used.toLocaleString('th-TH')} / {hub.dailyLimit.toLocaleString('th-TH')}
					{t('ครั้ง', 'calls')}
				</h2>
			</div>
			<span class="k-badge" class:paused={usagePercent >= 80}>{usagePercent}%</span>
		</div>
		<progress
			class="k-progress"
			value={used}
			max={hub.dailyLimit}
			aria-label={t('จำนวนครั้งที่ใช้งานวันนี้', 'Daily usage')}
		></progress>
		<p class="k-small k-muted" style="margin-top:13px">
			{usagePercent >= 100
				? t(
						'ทีมใช้งานครบจำนวนครั้งที่กำหนดต่อวันแล้ว สามารถใช้งานได้อีกครั้งเมื่อเริ่มวันใหม่ตามเวลาไทย',
						'The daily limit has been reached. Calls are paused until the next day.'
					)
				: usagePercent >= 80
					? t(
							'ทีมใกล้ใช้งานครบจำนวนครั้งที่กำหนดต่อวันแล้ว',
							'Usage is approaching the daily limit.'
						)
					: t(
							'สมาชิกทุกคนใน Gateway นี้ใช้จำนวนครั้งต่อวันร่วมกัน',
							'This limit is shared by everyone in the Gateway.'
						)}
		</p>
		<a
			class="k-link-button k-small"
			style="display:inline-block;margin-top:15px"
			href={localeHref(`/app?view=executions&hub=${encodeURIComponent(hub.id)}`)}
			>{t('ดูประวัติการใช้งาน', 'View activity')}</a
		>
	</div>
</div>

{#if !archived}<details class="gateway-guide"><summary>{t('ขั้นตอนเตรียม Gateway', 'Gateway setup guide')}</summary>
	<WorkspaceReadiness {data} {hub} {keyState} />
</details>{/if}
<div class="gateway-overview-actions">
	{#if !archived}<a class="k-button primary" href={tabHref('connect')}>{t('เชื่อมแอป AI', 'Connect AI')}</a>{/if}
	<a class="k-button" href={tabHref('tools')}>{t('ดูเครื่องมือที่อนุญาต', 'View allowed tools')}</a>
</div>
{:else if activeTab === 'connect'}
<section
	id="connect-ai"
	class="k-section"
	aria-labelledby="connect-title"
	style="scroll-margin-top:100px"
>
	{#if hub.userSourceID}<div class="k-panel">
		<h2 id="connect-title">{t('เชื่อมแอป AI กับ Gateway นี้', 'Connect your AI to this Gateway')}</h2>
		<GatewayClientSetup endpoint={hub.connectURL} ready={canConnect} oauth={true} />
	</div>{:else}<div class="k-panel gateway-unified-intro">
		<div><h2>{t('เชื่อม AI กับ ORCA ครั้งเดียว', 'One connection to ORCA')}</h2><p class="k-muted">{t('ใช้เครื่องมือจากทุก Gateway ที่คุณได้รับสิทธิ์ รวมถึง Gateway นี้', 'Use tools from every Gateway you can access, including this one.')}</p></div>
		<a class="k-button primary" href={localeHref('/app?view=settings&section=ai')}>{t('เชื่อม AI กับ ORCA', 'Connect AI to ORCA')}</a>
	</div>{/if}
	{#if canConnect}<div class="gateway-account-list">
		{#each sources as source (source.connectionID)}
			{#if source.connection}<details class="gateway-account" open={accountSourceID === source.connectionID} ontoggle={(event) => { if (event.currentTarget.open) accountSourceID = source.connectionID; else if (accountSourceID === source.connectionID) accountSourceID = ''; }}>
				<summary>{t('บัญชีที่ใช้กับ', 'Account for')} {source.connection.name}</summary>
				{#if accountSourceID === source.connectionID}<SourceSetup sourceID={source.connection.mcpID} />{/if}
			</details>{/if}
		{/each}
	</div>{/if}
	<details class="gateway-guide"><summary>{hub.userSourceID ? t('API key (ทางเลือก)', 'API key (optional)') : t('เชื่อมเฉพาะ Gateway นี้', 'Connect only this Gateway')}</summary>
	<div class="k-section-title">
		<h2 id={hub.userSourceID ? undefined : 'connect-title'}>
			{hub.userSourceID ? t('API key', 'API key') : t('เชื่อมแอป AI กับ Gateway นี้', 'Connect your AI to this Gateway')}
		</h2>
		<KeyRound size={22} color="#5143e8" />
	</div>
	<div class="k-panel">
		{#if !hub.userSourceID}<GatewayClientSetup endpoint={hub.connectURL} ready={canConnect} />{/if}
		{#if !isMember}<div class="k-banner">
				<ShieldCheck size={20} />
				<p>
					{t(
						'คุณมีสิทธิ์จัดการ Gateway นี้ แต่ต้องได้รับเลือกเป็นสมาชิกก่อนสร้างคีย์เพื่อเข้าถึงข้อมูล',
						'You can manage this Gateway, but you are not a member. Join it before creating a key to access data.'
					)}
				</p>
			</div>{:else if !canConnect}<div class="k-banner">
				<Pause size={20} />
				<p>
					{t(
						'Gateway นี้ยังไม่เปิดให้เชื่อมต่อ แต่คุณยังยกเลิกคีย์เดิมได้ด้านล่าง',
						'This Gateway is not open for connections. You can still revoke existing keys below.'
					)}
				</p>
			</div>{/if}
		{#if notice}<div class="k-banner success" role="status"><Check size={19} />{notice}</div>{/if}
		{#if keyError}<div class="k-banner error" role="alert">
				<Info size={19} />
				<div>
					{keyError}
					<div class="k-actions">
						<button
							class="k-link-button"
							disabled={loadingKeys || creating || revoking !== undefined}
							onclick={loadKeys}>{t('โหลดรายการคีย์อีกครั้ง', 'Reload keys')}</button
						>
					</div>
				</div>
			</div>{/if}
		{#if canConnect}
			{#if newKey}
				<div class="k-panel k-key-secret" style="margin-top:23px">
					<div class="k-section-title">
						<h3>{t('สร้างคีย์เชื่อมต่อของคุณแล้ว', 'Personal key created')}</h3>
						<Check size={20} color="#36965b" />
					</div>
					<p class="k-small k-muted">
						{t(
							'คัดลอกคีย์ไปตั้งค่าในแอป AI ของคุณ คีย์นี้แสดงให้ดูได้เฉพาะตอนสร้าง และจะไม่แสดงอีกเมื่อออกจากหน้านี้',
							'Copy it into your AI client. This key is available only once and disappears when you leave this page.'
						)}
					</p>
					<div class="k-actions" style="margin-top:15px">
						<button
							class="k-button primary"
							onclick={() => copy(newKey, t('คีย์เชื่อมต่อของคุณ', 'Personal key'))}
							><Copy size={17} /> {t('คัดลอกคีย์', 'Copy key')}</button
						><button class="k-button quiet" onclick={() => (revealKey = !revealKey)}
							>{#if revealKey}<EyeOff size={17} /> {t('ซ่อน', 'Hide')}{:else}<Eye size={17} />
								{t('แสดงคีย์', 'Reveal key')}{/if}</button
						><button
							class="k-button quiet"
							onclick={() => {
								clearCreatedKey();
								notice = '';
							}}>{t('เก็บคีย์แล้ว ปิดข้อความนี้', 'Stored safely — dismiss')}</button
						>
					</div>
					{#if revealKey}<div class="k-field" style="margin-top:16px">
							<label for="created-key">{t('คีย์เชื่อมต่อของคุณ', 'Personal key')}</label><input
								id="created-key"
								value={newKey}
								readonly
								autocomplete="off"
								spellcheck="false"
							/>
						</div>{/if}
				</div>
			{:else}
				<form
					class="k-section"
					onsubmit={(event) => {
						event.preventDefault();
						void createKey();
					}}
				>
					<fieldset disabled={creating}>
						<div class="k-grid-2">
							<div class="k-field">
								<label for="key-name">{t('ชื่อคีย์เชื่อมต่อ', 'Your key’s name')}</label><input
									id="key-name"
									bind:value={keyName}
									maxlength="100"
									placeholder={t(
										'เช่น แอป AI บนคอมพิวเตอร์ของฉัน',
										'For example, AI client on my laptop'
									)}
									required
								/>
							</div>
							<div class="k-field">
								<label for="key-expiry">{t('อายุการใช้งาน', 'Expires in')}</label><select
									id="key-expiry"
									bind:value={expiryDays}
									><option value={1}>{t('1 วัน', '1 day')}</option><option value={7}
										>{t('7 วัน', '7 days')}</option
									><option value={14}>{t('14 วัน', '14 days')}</option><option value={30}
										>{t('30 วัน', '30 days')}</option><option value={0}>{t('ไม่หมดอายุ', 'Never expires')}</option></select
								>
							</div>
						</div>
						<button
							type="submit"
							class="k-button primary"
							style="margin-top:17px"
							disabled={creating || !keyName.trim()}
							><KeyRound size={17} />{creating
								? t('กำลังสร้าง…', 'Creating…')
								: t('สร้างคีย์', 'Create personal key')}</button
						>
					</fieldset>
				</form>
			{/if}
		{/if}
		{#if isMember}<div class="k-section">
				<div class="k-section-title">
					<h3>{t('คีย์เชื่อมต่อของคุณใน Gateway นี้', 'Your keys for this Gateway')}</h3>
					<button
						class="k-button quiet small"
						disabled={loadingKeys || creating || revoking !== undefined}
						onclick={loadKeys}><RefreshCw size={14} /> {t('โหลดรายการล่าสุด', 'Reload')}</button
					>
				</div>
				{#if loadingKeys}<p class="k-muted k-small" role="status">
						{t('กำลังโหลดรายการคีย์…', 'Loading keys…')}
					</p>{:else if !keys.length}<p class="k-muted k-small">
						{t(
							'คุณยังไม่มีคีย์เชื่อมต่อสำหรับ Gateway นี้',
							'You have no personal keys for this Gateway yet.'
						)}
					</p>{:else}<div class="k-table-wrap">
						<table class="k-table">
							<thead
								><tr
									><th>{t('ชื่อคีย์', 'Key name')}</th><th>{t('หมดอายุ', 'Expires')}</th><th
										>{t('ใช้งานล่าสุด', 'Last used')}</th
									><th><span class="k-small">{t('จัดการ', 'Manage')}</span></th></tr
								></thead
							><tbody
								>{#each keys as key}<tr
										><td
											>{key.name}
											<p class="k-small k-muted">
												{t('สร้าง', 'Create')}
												{displayDate(key.createdAt)}
											</p></td
										><td>{key.expiresAt ? displayDate(key.expiresAt) : t('ไม่หมดอายุ', 'Never expires')}</td><td>{displayDate(key.lastUsedAt)}</td><td
											>{#if confirmRevoke === key.id}<div class="k-stack">
													<span class="k-small"
														>{t(
															'เมื่อยืนยัน คีย์นี้จะใช้เชื่อมต่อไม่ได้ทันที',
															'This key will stop working immediately.'
														)}</span
													>
													<div class="k-actions">
														<button
															class="k-button danger small"
															disabled={revoking !== undefined}
															onclick={() => revokeKey(key.id)}
															>{revoking === key.id
																? t('กำลังยกเลิกคีย์…', 'Revoking…')
																: t('ยืนยันยกเลิกคีย์', 'Confirm revocation')}</button
														><button
															class="k-button quiet small"
															disabled={revoking !== undefined}
															onclick={() => (confirmRevoke = undefined)}
															>{t('ยกเลิก', 'Cancel')}</button
														>
													</div>
												</div>{:else}<button
													class="k-button quiet small"
													disabled={revoking !== undefined}
													onclick={() => (confirmRevoke = key.id)}
													><Trash2 size={14} /> {t('ยกเลิกคีย์', 'Revoke')}</button
												>{/if}</td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>{/if}
			</div>{/if}
	</div>
	</details>
</section>
{:else if activeTab === 'tools'}
<section class="k-panel gateway-tools">
  <div class="k-section-title"><h2>{t('เครื่องมือที่เลือกใน Gateway', 'Selected Gateway tools')}</h2>{#if data.canManage && !archived}<a class="k-button" href={localeHref(`/app?view=new&edit=${encodeURIComponent(hub.id)}&step=tools`)}><Pencil size={16} />{t('แก้ไขเครื่องมือ', 'Edit tools')}</a>{:else}<FileCheck2 size={20} />{/if}</div>
  {#if unavailableTools.length}<div class="k-banner" role="status"><Info size={19} /><p>{t('เครื่องมือบางรายการยังใช้ไม่ได้ ตรวจ Server หรือปรับสิทธิ์ของแอปนั้นก่อนใช้งาน', 'Some selected tools are unavailable. Review that server or update its tool permissions.')}</p></div>{/if}
  <div class="k-field"><label for="gateway-tool-search">{t('ค้นหาเครื่องมือหรือแอป', 'Search tools or apps')}</label><input id="gateway-tool-search" type="search" bind:value={toolQuery} placeholder={t('ชื่อแอป งานที่ทำ หรือชื่อเครื่องมือ', 'App, action or tool name')} /></div>
  <p class="k-small k-muted gateway-result-count">{t(`แสดง ${visibleTools.length} จาก ${gatewayToolCount(hub)} เครื่องมือ`, `${visibleTools.length} of ${gatewayToolCount(hub)} tools`)}</p>
  {#each visibleTools as item (item.key)}
    {@const presentation = toolPresentation(item.tool, orcaLocale.value)}
    <details class="gateway-tool"><summary><span><span class="gateway-tool-app">{item.source.connection?.name || t('ไม่พบ Server', 'Server unavailable')}</span><strong>{presentation.label}</strong><span class="gateway-tool-description k-muted k-small">{presentation.description}</span></span><span class="gateway-tool-status"><span class="k-badge">{!item.source.ready ? t('ยังใช้ไม่ได้', 'Unavailable') : accessLabel(item.source.connection?.reviewedReadOnly)}</span><span class="gateway-tool-hint">{t('รายละเอียด', 'Details')} <span aria-hidden="true">⌄</span></span></span></summary>
      <div class="gateway-schema"><p class="k-small k-muted">{t('ชื่อสำหรับเรียกเครื่องมือ', 'Tool identifier')}</p><code>{item.name}</code><p class="k-small k-muted">{t('รูปแบบข้อมูลที่เครื่องมือต้องการ', 'Tool input schema')}</p><pre>{JSON.stringify(item.tool.inputSchema, null, 2)}</pre></div>
    </details>
  {:else}<p class="gateway-empty">{t('ไม่พบเครื่องมือตามคำค้น', 'No tools match your search.')}</p>{/each}
</section>
{:else if activeTab === 'access'}
	<section class="k-panel gateway-identity">
		<div class="k-section-title"><h2>{t('การยืนยันตัวตน', 'Authentication')}</h2>{#if data.canManage}<a href={localeHref('/app?view=user-sources')}>{t('จัดการ User sources', 'Manage user sources')}</a>{/if}</div>
		{#if data.canManage}
			<form onsubmit={(event) => { event.preventDefault(); void saveIdentity(); }}>
				<div class="gateway-identity-fields">
					<div class="k-field"><label for="gateway-user-source">User source</label>
						<select id="gateway-user-source" bind:value={userSourceID} disabled={archived || saving || identitySaving} onchange={() => identitySaved = false}>
							<option value="">{t('บัญชี ORCA / API key', 'ORCA account / API key')}</option>
							{#if userSourceID && !selectedUserSource}<option value={userSourceID} disabled>{t('User source เดิม', 'Existing user source')}</option>{/if}
							{#each userSources.filter((source) => source.enabled || source.id === userSourceID) as source (source.id)}<option value={source.id} disabled={!source.enabled}>{source.name}{source.enabled ? '' : t(' · ระงับแล้ว', ' · Disabled')}</option>{/each}
							</select>
					</div>
					<button type="submit" class="k-button primary" disabled={archived || saving || identitySaving || !identityChanged}>{identitySaving ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
				</div>
			</form>
			{#if loadingUserSources}<p role="status">{t('กำลังโหลด User sources…', 'Loading user sources…')}</p>{/if}
			{#if userSourcesError}<div class="k-banner error" role="alert"><div>{userSourcesError}<button type="button" class="k-link-button" disabled={loadingUserSources || identitySaving} onclick={loadUserSources}>{t('โหลด User sources อีกครั้ง', 'Retry user sources')}</button></div></div>{/if}
			{#if identitySaved}<div class="k-banner success" role="status"><Check size={18} />{t('บันทึกการยืนยันตัวตนแล้ว', 'Authentication saved')}</div>{/if}
		{:else}<p>{hub.userSourceID ? t('บัญชีองค์กร', 'Organization sign-in') : t('บัญชี ORCA / API key', 'ORCA account / API key')}</p>{/if}
	</section>
	<section class="k-panel" style="margin-top:0">
		<div class="k-section-title">
			<h2>{t('สมาชิก', 'Members')} {gatewayMemberIDs(hub).length} {t('คน', 'people')}</h2>
			<Users size={22} color="#5143e8" />
		</div>
		<div class="k-stack">
			{#each members as member}<div>
					<strong style="font-weight:500"
						>{memberName(member)}{member.id === data.currentUserID
							? t(' (คุณ)', ' (you)')
							: ''}</strong
					>
					<p class="k-small k-muted">{member.email} · {hub.memberIDs.includes(member.id) ? t('สมาชิกโดยตรง', 'Direct member') : t('สิทธิ์ผ่านทีม', 'Access through a team')}</p>
				</div>{/each}
		</div>
		{#if hub.accessUnitIDs?.length}<p class="k-small k-muted" style="margin-top:22px">
				{t('ทีมที่ได้รับสิทธิ์:', 'Teams granted access:')}
				{data.units.filter((unit) => hub.accessUnitIDs?.includes(unit.id)).map((unit) => unit.name).join(', ')}
			</p>{/if}
		{#if hub.unitIDs?.length}<p class="k-small k-muted" style="margin-top:22px">
				{t('หน่วยงาน:', 'Unit:')}
				{data.units
					.filter((unit) => hub.unitIDs.includes(unit.id))
					.map((unit) => unit.name)
					.join(', ')}
			</p>{/if}
	</section>
{/if}

<style>
	.gateway-identity-fields { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
	.gateway-identity-fields .k-field { flex: 1 1 260px; margin-bottom: 0; }
	.gateway-identity .k-section-title { flex-wrap: wrap; gap: 12px; }
  .gateway-source-list { display:grid; gap:16px; }
  .gateway-source-row { display:flex; align-items:center; gap:12px; }
  .gateway-source-row > div { flex:1; min-width:0; }
  .gateway-unified-intro { display:flex; flex-wrap:wrap; gap:20px; align-items:center; justify-content:space-between; }
  .gateway-unified-intro p { margin-top:8px; }
  .gateway-account-list { display:grid; gap:10px; margin:20px 0; }
  .gateway-account { border:1px solid var(--k-line); border-radius:12px; padding:16px; background:white; }
  .gateway-account summary { cursor:pointer; font-weight:600; }
  .gateway-tool-app { color:var(--k-muted); font-size:12px; }

  .gateway-tabs { display:flex; gap:24px; border-bottom:1px solid var(--k-line,#e2e6ed); overflow-x:auto; margin:24px 0; }
  .gateway-tabs a { display:flex; align-items:center; gap:7px; padding:12px 1px; white-space:nowrap; text-decoration:none; border-bottom:2px solid transparent; color:var(--k-muted,#647087); font-size:13px; font-weight:600; }
  .gateway-tabs a.active { border-color:var(--k-accent,#d7f76a); color:var(--k-ink,#171c2a); }
  .gateway-tabs a span { background:#f1f3f7; padding:1px 6px; border-radius:4px; font-size:11px; }
  .gateway-guide { margin-top:20px; border:1px solid var(--k-line,#e2e6ed); border-radius:8px; padding:14px 18px; }
  .gateway-guide summary { cursor:pointer; font-size:13px; color:var(--k-muted,#647087); font-weight:600; }
  .gateway-overview-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:20px; }
  .gateway-result-count { margin:15px 0 8px; }
  .gateway-tool { border-top:1px solid var(--k-line,#e2e6ed); padding:15px 0; }
  .gateway-tool summary { cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:18px; }
  .gateway-tool summary > span:first-child { min-width:0; display:grid; gap:5px; overflow-wrap:anywhere; }
  .gateway-tool strong { font-size:13px; font-weight:600; }
  .gateway-tool:not([open]) .gateway-tool-description { display:-webkit-box; line-clamp:2; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .gateway-tool-status { display:grid; gap:8px; justify-items:end; flex-shrink:0; }
  .gateway-tool-hint { color:var(--k-muted); font-size:12px; white-space:nowrap; }
  .gateway-tool .k-badge { flex-shrink:0; }
  .gateway-schema { margin-top:16px; }
  .gateway-schema pre { background:#f6f7fa; border:1px solid #e2e6ed; border-radius:6px; padding:16px; max-height:320px; overflow:auto; font-size:12px; line-height:1.65; }
  .gateway-empty { padding:26px 0; color:#647087; text-align:center; }
  @media(max-width:600px) { .gateway-tabs { gap:20px; } .gateway-tool summary { align-items:flex-start; } }
</style>
