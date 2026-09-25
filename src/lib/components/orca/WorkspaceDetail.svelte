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
		ArrowRight,
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
		Search,
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
		{ id: 'access', label: t('สิทธิ์และสมาชิก', 'Access and members'), count: gatewayMemberIDs(hub).length },
		...(!archived ? [{ id: 'connect', label: t('เชื่อมแอป AI', 'Connect an AI app') }] : [])
	]);
	function tabHref(tab: string) {
		return localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=${tab}`);
	}
	const sources = $derived(gatewaySources(hub).map((source) => {
		const connection = data.connections.find((item) => item.id === source.connectionID);
		const ready = workspaceToolingReady({ ...hub, sources: [source] }, connection);
		return { ...source, connection, ready };
	}));
	// Systems reviewed as read-only are never held, whatever the write mode.
	const readOnlyOnly = $derived(sources.length > 0 && sources.every((source) => source.connection?.reviewedReadOnly));
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
	let guidance = $state(untrack(() => hub.instructions ?? ''));
	let guidanceSaving = $state(false);
	let guidanceSaved = $state(false);
	let guidanceError = $state('');
	const guidanceChanged = $derived(guidance.trim() !== (hub.instructions ?? '').trim());
	const savedWriteMode = $derived(hub.writeMode === 'approval' ? 'approval' : 'direct');
	let writeMode = $state<'direct' | 'approval'>(untrack(() => (hub.writeMode === 'approval' ? 'approval' : 'direct')));
	let writeModeSaving = $state(false);
	let writeModeSaved = $state(false);
	let writeModeError = $state('');
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
		return readOnly ? t('อ่านข้อมูลเท่านั้น', 'Read only') : t('อนุญาตแล้ว', 'Allowed');
	}
	const isMember = $derived(gatewayHasMember(hub, data.currentUserID));
	const canConnect = $derived(
		isMember && hub.status === 'active' && workspaceToolingReady(hub, data.connections)
	);
	$effect(() => {
		const requestedAccount = page.url.searchParams.get('account');
		if (requestedAccount === null) return;
		accountSourceID = canConnect && activeTab === 'connect' && sources.some((source) =>
			source.connectionID === requestedAccount && source.ready
		) ? requestedAccount : '';
	});
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
			userSourcesError = t('กรุณาเลือกการเข้าสู่ระบบองค์กรที่เปิดใช้งาน หรือใช้บัญชี ORCA', 'Choose an active sign-in source or use an ORCA account.');
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
	async function saveGuidance() {
		if (!data.canManage || archived || guidanceSaving || !guidanceChanged) return;
		guidanceSaving = true;
		guidanceSaved = false;
		guidanceError = '';
		try {
			await OrcaService.hub({ ...hubInput(), instructions: guidance.trim() }, hub.id);
			await onchanged();
			guidanceSaved = true;
		} catch (cause) {
			guidanceError = orcaError(cause);
		} finally {
			guidanceSaving = false;
		}
	}
	async function saveWriteMode() {
		if (!data.canManage || archived || writeModeSaving || writeMode === savedWriteMode) return;
		writeModeSaving = true;
		writeModeSaved = false;
		writeModeError = '';
		try {
			await OrcaService.hub({ ...hubInput(), writeMode }, hub.id);
			await onchanged();
			writeModeSaved = true;
		} catch (cause) {
			writeModeError = orcaError(cause);
		} finally {
			writeModeSaving = false;
		}
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
				'กรุณาตั้งชื่อคีย์ และเลือกอายุการใช้งานของคีย์',
				'Enter a key name and select an expiry.'
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
				'คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง',
				'The text could not be copied automatically. Select and copy it manually.'
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

<div class="detail">
<div class="k-breadcrumb">
	<a href={localeHref('/app?view=workspaces')}>{t('พื้นที่ทำงาน AI', 'AI workspaces')}</a><span>/</span><span
		>{hub.name}</span
	>
</div>
<header class="detail-head">
	<div class="detail-heading">
		<div class="detail-title-row">
			<h1>{hub.name}</h1>
			<span class="k-badge {hub.status}">{statusLabels[hub.status]}</span>
		</div>
		<p class="k-subtitle">
			{hub.description ||
				t(
					'ระบบและเครื่องมือที่ทีมของคุณใช้ได้ตามสิทธิ์ที่กำหนด',
					'Systems and tools your team is allowed to use.'
				)}
		</p>
		{#if isMember && !archived}<a
				class="detail-related"
				href={localeHref(`/app?view=knowledge&hub=${encodeURIComponent(hub.id)}`)}
				><BookOpen size={16} aria-hidden="true" />{t(
					'ความรู้และแม่แบบของพื้นที่ทำงานนี้',
					'Knowledge and templates for this workspace'
				)}<ArrowRight size={14} aria-hidden="true" /></a
			>{/if}
	</div>
	{#if data.canManage}<div class="detail-actions">
			<LifecycleActions entity={hub} kind="gateway" {archived} canManage={data.canManage} compact={!archived} onchanged={lifecycleChanged} onreload={onchanged} />
			{#if !archived}<button class="k-button" disabled={saving} onclick={changeStatus}
					>{#if hub.status === 'active'}<Pause size={16} aria-hidden="true" />{:else}<Play
							size={16}
							aria-hidden="true"
						/>{/if}{saving
						? t('กำลังบันทึก…', 'Saving…')
						: hub.status === 'active'
							? t('ระงับการใช้งาน', 'Pause access')
							: t('เปิดใช้งาน', 'Activate')}</button
				><a class="k-button primary" href={localeHref(`/app?view=new&edit=${encodeURIComponent(hub.id)}`)}
					><Pencil size={16} aria-hidden="true" />{t('แก้ไขพื้นที่ทำงาน', 'Edit workspace')}</a
				>{/if}
		</div>{/if}
</header>
{#if archived}<div class="k-banner" role="status"><Info size={16} aria-hidden="true" /><p>{t('พื้นที่ทำงาน AI นี้จัดเก็บแล้ว แอป AI จะเรียกใช้เครื่องมือ เข้าถึงความรู้ หรือสร้างคีย์ไม่ได้ กู้คืนเพื่อตรวจสอบและเปิดใช้งานอีกครั้ง คีย์เดิมจะยังคงถูกยกเลิก', 'This AI workspace is archived. Tool calls, knowledge access and key creation are disabled. Restore it to review and activate it again. Previous keys remain revoked.')}</p></div>{/if}
{#if error}<div class="k-banner error" role="alert">
		<Info size={16} aria-hidden="true" />
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
		<Info size={16} aria-hidden="true" />
		<p>
			{t(
				'บางระบบยังใช้งานไม่ได้ กรุณาตรวจสอบบัญชีและสิทธิ์ของระบบนั้น ระบบที่พร้อมใช้งานยังใช้ได้ตามปกติ',
				'Some systems are unavailable. Review their accounts and permissions. Systems that are ready remain available.'
			)}
		</p>
	</div>{/if}

<nav class="gateway-tabs" aria-label={t('รายละเอียดพื้นที่ทำงาน', 'Workspace details')}>
	{#each tabs as tab}<a href={tabHref(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} class:active={activeTab === tab.id}>
		{tab.label}{#if tab.count !== undefined}<span class="gateway-tab-count">{tab.count}</span>{/if}
	</a>{/each}
	<a href={localeHref(`/app?view=executions&hub=${encodeURIComponent(hub.id)}`)}>{t('ประวัติการใช้งาน', 'Activity')}</a>
</nav>

{#if activeTab === 'overview'}

<div class="detail-grid">
	<section class="detail-card" aria-labelledby="detail-systems-title">
		<header class="detail-card-head">
			<div class="detail-card-title"><h2 id="detail-systems-title">{t('ระบบในพื้นที่ทำงานนี้', 'Systems in this workspace')}</h2><span class="detail-count">{sources.length}</span></div>
		</header>
		<ul class="detail-rows gateway-source-list">
			{#each sources as source (source.connectionID)}
				<li class="gateway-source-row">
					<span class="detail-logo"><CatalogIcon name={source.connection?.name || ''} size={20} /></span>
					<div class="detail-row-copy"><strong>{source.connection?.name || t('ไม่พบระบบนี้', 'System unavailable')}</strong><p>{t(`เครื่องมือ ${source.toolNames.length} รายการ`, `Tools: ${source.toolNames.length}`)} · {accessLabel(source.connection?.reviewedReadOnly)}</p></div>
					<span class="k-badge" class:paused={!source.ready}>{source.ready ? t('พร้อมใช้งาน', 'Ready') : t('รอตรวจสอบ', 'Needs review')}</span>
				</li>
			{/each}
		</ul>
		<p class="detail-card-foot">{t('แต่ละระบบใช้สิทธิ์ตามบัญชีของผู้ใช้ในระบบนั้น ร่วมกับเครื่องมือและสมาชิกที่กำหนดในพื้นที่ทำงานนี้', 'Each system applies the user’s own account permissions together with the tools and members set in this workspace.')}</p>
	</section>
	<section class="detail-card" aria-labelledby="detail-usage-title">
		<header class="detail-card-head">
			<h2 id="detail-usage-title">{t('การใช้งานวันนี้ · เวลาประเทศไทย', 'Today’s usage · Bangkok time')}</h2>
			<a class="k-button small" href={localeHref(`/app?view=executions&hub=${encodeURIComponent(hub.id)}`)}
				>{t('ดูประวัติการใช้งาน', 'View activity')}</a
			>
		</header>
		<div class="detail-usage">
			<div class="detail-usage-figure">
				<p class="detail-usage-value">
					{used.toLocaleString('th-TH')} / {hub.dailyLimit.toLocaleString('th-TH')}
					<span>{t('ครั้ง', 'calls')}</span>
				</p>
				<span class="k-badge" class:paused={usagePercent >= 80}>{usagePercent}%</span>
			</div>
			<progress
				class="detail-progress"
				value={used}
				max={hub.dailyLimit}
				aria-label={t('การใช้งานวันนี้เทียบกับเพดานการใช้งานต่อวัน', 'Usage today against the daily limit')}
			></progress>
			<p class="detail-usage-note">
				{usagePercent >= 100
					? t(
							'การใช้งานถึงเพดานการใช้งานต่อวันแล้ว ใช้งานได้อีกครั้งเมื่อเริ่มวันใหม่ตามเวลาประเทศไทย',
							'The daily limit has been reached. Calls resume at the start of the next day, Bangkok time.'
						)
					: usagePercent >= 80
						? t(
								'การใช้งานใกล้ถึงเพดานการใช้งานต่อวันแล้ว',
								'Usage is approaching the daily limit.'
							)
						: t(
								'สมาชิกทุกคนในพื้นที่ทำงานนี้ใช้เพดานการใช้งานต่อวันร่วมกัน',
								'All members of this workspace share the daily limit.'
							)}
			</p>
		</div>
	</section>
</div>

<section class="detail-card gateway-writes" aria-labelledby="detail-writes-title">
	<header class="detail-card-head">
		<h2 id="detail-writes-title">{t('การแก้ไขข้อมูลในระบบ', 'Changes to your systems')}</h2>
		{#if savedWriteMode === 'approval'}<span class="k-badge accent">{t('ผู้ดูแลอนุมัติก่อน', 'Approval first')}</span>{/if}
	</header>
	<div class="detail-card-body">
		<p class="detail-muted">{t('งานที่อาจแก้ไขข้อมูล เช่น สร้างใบเสนอราคาหรือส่งอีเมล จะทำทันที หรือรอผู้ดูแลอนุมัติก่อนก็ได้ ส่วนการอ่านข้อมูลทำได้ทันทีเสมอ', 'Actions that may change data, such as creating a quotation or sending an email, can run at once or wait for a manager. Reading data always runs at once.')}</p>
		{#if data.canManage}
			<form onsubmit={(event) => { event.preventDefault(); void saveWriteMode(); }}>
				<fieldset class="write-mode-options" disabled={archived || writeModeSaving}>
					<legend class="sr-only">{t('วิธีจัดการงานที่แก้ไขข้อมูล', 'How to handle actions that change data')}</legend>
					<label class="write-mode-option" class:chosen={writeMode === 'direct'}>
						<input type="radio" name="write-mode" value="direct" bind:group={writeMode} onchange={() => (writeModeSaved = false)} />
						<span><strong>{t('ทำงานทันที', 'Run at once')}</strong><small>{t('แอป AI ใช้เครื่องมือที่อนุญาตได้เลย', 'AI apps use the allowed tools right away.')}</small></span>
					</label>
					<label class="write-mode-option" class:chosen={writeMode === 'approval'}>
						<input type="radio" name="write-mode" value="approval" bind:group={writeMode} onchange={() => (writeModeSaved = false)} />
						<span><strong>{t('ผู้ดูแลอนุมัติก่อน', 'A manager approves first')}</strong><small>{t('งานที่แก้ไขข้อมูลจะรอในกล่องอนุมัติ แล้ว ORCA จึงทำด้วยบัญชีของผู้ขอ', 'Actions that change data wait in Approvals, then ORCA runs them with the requester’s account.')}</small></span>
					</label>
				</fieldset>
				{#if readOnlyOnly}<p class="write-mode-note">{t('ตอนนี้ทุกระบบในพื้นที่ทำงานนี้ถูกตรวจว่าอ่านอย่างเดียว จึงยังไม่มีงานที่ต้องอนุมัติ', 'Every system here is reviewed as read-only, so nothing needs approval yet.')}</p>{/if}
				<div class="write-mode-foot">
					<a class="k-link-button" href={localeHref('/app?view=approvals')}>{t('เปิดกล่องอนุมัติ', 'Open approvals')}</a>
					<button type="submit" class="k-button primary" disabled={archived || writeModeSaving || writeMode === savedWriteMode}>{writeModeSaving ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
				</div>
			</form>
			{#if writeModeError}<div class="k-banner error" role="alert">{writeModeError}</div>{/if}
			{#if writeModeSaved}<div class="k-banner success" role="status"><Check size={16} aria-hidden="true" />{savedWriteMode === 'approval' ? t('บันทึกแล้ว งานที่แก้ไขข้อมูลจะรอผู้ดูแลอนุมัติก่อน', 'Saved. Actions that change data now wait for a manager.') : t('บันทึกแล้ว แอป AI ทำงานที่แก้ไขข้อมูลได้ทันที', 'Saved. AI apps now run actions that change data at once.')}</div>{/if}
		{:else}
			<p class="write-mode-current">{savedWriteMode === 'approval' ? t('งานที่แก้ไขข้อมูลในพื้นที่ทำงานนี้ต้องรอผู้ดูแลอนุมัติก่อน', 'Actions that change data in this workspace wait for a manager’s approval.') : t('งานที่แก้ไขข้อมูลในพื้นที่ทำงานนี้ทำได้ทันที', 'Actions that change data in this workspace run at once.')}
				{#if savedWriteMode === 'approval'}<a href={localeHref('/app?view=approvals')}>{t('ดูคำขอของฉัน', 'See my requests')}</a>{/if}</p>
		{/if}
	</div>
</section>

<section class="detail-card gateway-guidance" aria-labelledby="detail-guidance-title">
	<header class="detail-card-head">
		<h2 id="detail-guidance-title">{t('คำแนะนำสำหรับ AI', 'Guidance for AI')}</h2>
	</header>
	<div class="detail-card-body">
		<p class="detail-muted">{t('ส่งให้แอป AI ทุกครั้งที่เชื่อมพื้นที่ทำงานนี้ ใช้บอกวิธีทำงาน เช่น ภาษาที่ตอบ รูปแบบรายงาน หรือขั้นตอนขององค์กร ข้อความนี้ไม่เพิ่มสิทธิ์ใด ๆ', 'Sent to AI apps each time they connect to this workspace. Use it for how to work, such as the reply language, report format or company steps. It never adds permissions.')}</p>
		{#if data.canManage}
			<form onsubmit={(event) => { event.preventDefault(); void saveGuidance(); }}>
				<label class="guidance-label" for="gateway-guidance">{t('ข้อความคำแนะนำ', 'Guidance text')}</label>
				<textarea id="gateway-guidance" rows="5" maxlength="4000" bind:value={guidance} disabled={archived || guidanceSaving} oninput={() => (guidanceSaved = false)}
					placeholder={t('เช่น ตอบเป็นภาษาไทย อ้างเลขที่เอกสารทุกครั้ง และสรุปยอดเป็นบาท', 'For example: reply in Thai, cite document numbers, and total amounts in baht.')}></textarea>
				<div class="guidance-foot">
					<span class="guidance-count">{guidance.length.toLocaleString('th-TH')}/4,000</span>
					<button type="submit" class="k-button primary" disabled={archived || guidanceSaving || !guidanceChanged}>{guidanceSaving ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
				</div>
			</form>
			{#if guidanceError}<div class="k-banner error" role="alert">{guidanceError}</div>{/if}
			{#if guidanceSaved}<div class="k-banner success" role="status"><Check size={16} aria-hidden="true" />{t('บันทึกคำแนะนำแล้ว แอป AI จะได้รับเมื่อเชื่อมครั้งถัดไป', 'Guidance saved. AI apps receive it the next time they connect.')}</div>{/if}
		{:else if hub.instructions}<p class="guidance-text">{hub.instructions}</p>
		{:else}<p class="detail-muted">{t('ยังไม่มีคำแนะนำ', 'No guidance yet.')}</p>{/if}
	</div>
</section>

{#if !archived}<details class="gateway-guide detail-disclosure"><summary>{t('ขั้นตอนเตรียมพื้นที่ทำงาน', 'Workspace setup guide')}</summary>
	<WorkspaceReadiness {data} {hub} {keyState} />
</details>{/if}
<div class="gateway-overview-actions">
	{#if !archived}<a class="k-button primary" href={tabHref('connect')}>{t('เชื่อมแอป AI', 'Connect an AI app')}</a>{/if}
	<a class="k-button" href={tabHref('tools')}>{t('ดูเครื่องมือที่อนุญาต', 'View allowed tools')}</a>
</div>
{:else if activeTab === 'connect'}
<section
	id="connect-ai"
	class="detail-stack"
	aria-labelledby="connect-title"
	style="scroll-margin-top:100px"
>
	<div class="detail-card">
		<header class="detail-card-head detail-card-head-ruled">
			<h2 id="connect-title">{t('เชื่อมแอป AI กับพื้นที่ทำงานนี้', 'Connect your AI app to this workspace')}</h2>
		</header>
		<div class="detail-card-body">
			<GatewayClientSetup endpoint={hub.connectURL} ready={canConnect} oauth={true} />
		</div>
	</div><div class="detail-card gateway-unified-intro">
		<div><h2>{t('เชื่อม AI กับ ORCA เพียงครั้งเดียว', 'Connect to ORCA once')}</h2><p>{t('ใช้เครื่องมือจากทุกพื้นที่ทำงาน AI ที่คุณได้รับสิทธิ์ รวมถึงพื้นที่ทำงานนี้', 'Use tools from every AI workspace you can access, including this one.')}</p></div>
		<a class="k-button" href={localeHref('/app?view=settings&section=ai')}>{t('เชื่อม AI กับ ORCA', 'Connect AI to ORCA')}</a>
	</div>
	{#if canConnect}<div class="gateway-account-list">
		{#each sources as source (source.connectionID)}
			{#if source.connection}<details class="gateway-account detail-disclosure" open={accountSourceID === source.connectionID} ontoggle={(event) => { if (event.currentTarget.open) accountSourceID = source.connectionID; else if (accountSourceID === source.connectionID) accountSourceID = ''; }}>
				<summary>{t('บัญชีของคุณในระบบ', 'Your account in')} {source.connection.name}</summary>
				{#if accountSourceID === source.connectionID}<div class="detail-disclosure-body"><SourceSetup sourceID={source.connection.mcpID} /></div>{/if}
			</details>{/if}
		{/each}
	</div>{/if}
	<details class="gateway-guide detail-disclosure"><summary>{t('คีย์ API (ไม่บังคับ)', 'API key (optional)')}</summary>
	<div class="detail-disclosure-body detail-key-panel">
		<div class="detail-subhead">
			<span class="detail-subhead-icon" aria-hidden="true"><KeyRound size={18} /></span>
			<h2>
				{t('คีย์ API', 'API key')}
			</h2>
		</div>
		<GatewayClientSetup endpoint={hub.connectURL} ready={canConnect} oauth={false} />
		{#if !isMember}<div class="k-banner">
				<ShieldCheck size={16} aria-hidden="true" />
				<p>
					{t(
						'คุณจัดการพื้นที่ทำงานนี้ได้ แต่ยังไม่เป็นสมาชิก กรุณาเพิ่มตัวเองเป็นสมาชิกก่อนสร้างคีย์',
						'You can manage this workspace but are not a member. Add yourself as a member before creating a key.'
					)}
				</p>
			</div>{:else if !canConnect}<div class="k-banner">
				<Pause size={16} aria-hidden="true" />
				<p>
					{t(
						'พื้นที่ทำงานนี้ยังไม่เปิดให้เชื่อมต่อ คุณยังยกเลิกคีย์เดิมได้ด้านล่าง',
						'This workspace is not open for connections. You can still revoke existing keys below.'
					)}
				</p>
			</div>{/if}
		{#if notice}<div class="k-banner success" role="status"><Check size={16} aria-hidden="true" />{notice}</div>{/if}
		{#if keyError}<div class="k-banner error" role="alert">
				<Info size={16} aria-hidden="true" />
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
				<div class="detail-secret">
					<div class="detail-secret-head">
						<span class="detail-secret-icon" aria-hidden="true"><Check size={16} /></span>
						<h3>{t('สร้างคีย์ส่วนตัวแล้ว', 'Personal key created')}</h3>
					</div>
					<p>
						{t(
							'คัดลอกคีย์ไปตั้งค่าในแอป AI ของคุณ คีย์นี้แสดงเพียงครั้งเดียว และจะไม่แสดงอีกเมื่อออกจากหน้านี้',
							'Copy this key into your AI app. It is shown only once and will not be displayed again after you leave this page.'
						)}
					</p>
					<div class="detail-button-row">
						<button
							class="k-button primary"
							onclick={() => copy(newKey, t('คีย์ส่วนตัว', 'Personal key'))}
							><Copy size={16} aria-hidden="true" /> {t('คัดลอกคีย์', 'Copy key')}</button
						><button class="k-button" onclick={() => (revealKey = !revealKey)}
							>{#if revealKey}<EyeOff size={16} aria-hidden="true" /> {t('ซ่อนคีย์', 'Hide key')}{:else}<Eye size={16} aria-hidden="true" />
								{t('แสดงคีย์', 'Reveal key')}{/if}</button
						><button
							class="k-button quiet"
							onclick={() => {
								clearCreatedKey();
								notice = '';
							}}>{t('บันทึกคีย์แล้ว', 'I have saved the key')}</button
						>
					</div>
					{#if revealKey}<div class="k-field detail-secret-field">
							<label for="created-key">{t('คีย์ส่วนตัวของคุณ', 'Your personal key')}</label><input
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
					class="detail-key-form"
					onsubmit={(event) => {
						event.preventDefault();
						void createKey();
					}}
				>
					<fieldset disabled={creating}>
						<div class="detail-key-fields">
							<div class="k-field">
								<label for="key-name">{t('ชื่อคีย์', 'Key name')}</label><input
									id="key-name"
									bind:value={keyName}
									maxlength="100"
									placeholder={t(
										'เช่น แอป AI บนคอมพิวเตอร์ของฉัน',
										'For example, AI app on my computer'
									)}
									required
								/>
							</div>
							<div class="k-field">
								<label for="key-expiry">{t('อายุการใช้งานคีย์', 'Key expiry')}</label><select
									id="key-expiry"
									bind:value={expiryDays}
									><option value={1}>{t('1 วัน', '1 day')}</option><option value={7}
										>{t('7 วัน', '7 days')}</option
									><option value={14}>{t('14 วัน', '14 days')}</option><option value={30}
										>{t('30 วัน', '30 days')}</option><option value={0}>{t('ไม่หมดอายุ', 'No expiry')}</option></select
								>
							</div>
						</div>
						<button
							type="submit"
							class="k-button primary"
							disabled={creating || !keyName.trim()}
							><KeyRound size={16} aria-hidden="true" />{creating
								? t('กำลังสร้าง…', 'Creating…')
								: t('สร้างคีย์ส่วนตัว', 'Create personal key')}</button
						>
					</fieldset>
				</form>
			{/if}
		{/if}
		{#if isMember}<div class="detail-keys">
				<div class="detail-keys-head">
					<h3>{t('คีย์ส่วนตัวของคุณสำหรับพื้นที่ทำงานนี้', 'Your personal keys for this workspace')}</h3>
					<button
						class="k-button quiet small"
						disabled={loadingKeys || creating || revoking !== undefined}
						onclick={loadKeys}><RefreshCw size={14} aria-hidden="true" /> {t('โหลดข้อมูลล่าสุด', 'Reload')}</button
					>
				</div>
				{#if loadingKeys}<p class="detail-muted" role="status">
						{t('กำลังโหลดรายการคีย์…', 'Loading keys…')}
					</p>{:else if !keys.length}<p class="detail-muted">
						{t(
							'ยังไม่มีคีย์ส่วนตัวสำหรับพื้นที่ทำงานนี้',
							'No personal keys for this workspace yet.'
						)}
					</p>{:else}<div class="k-table-wrap detail-table-wrap">
						<table class="k-table detail-table">
							<thead
								><tr
									><th>{t('ชื่อคีย์', 'Key name')}</th><th>{t('หมดอายุ', 'Expires')}</th><th
										>{t('ใช้งานล่าสุด', 'Last used')}</th
									><th class="detail-actions-col">{t('จัดการ', 'Manage')}</th></tr
								></thead
							><tbody
								>{#each keys as key}<tr
										><td
											><span class="detail-key-name">{key.name}</span>
											<p class="detail-key-meta">
												{t('สร้างเมื่อ', 'Created')}
												{displayDate(key.createdAt)}
											</p></td
										><td>{key.expiresAt ? displayDate(key.expiresAt) : t('ไม่หมดอายุ', 'No expiry')}</td><td>{displayDate(key.lastUsedAt)}</td><td
											class="detail-actions-col">{#if confirmRevoke === key.id}<div class="detail-revoke">
													<span
														>{t(
															'เมื่อยืนยันแล้ว คีย์นี้จะใช้งานไม่ได้ทันที',
															'This key will stop working immediately.'
														)}</span
													>
													<div class="detail-revoke-actions">
														<button
															class="k-button danger small"
															disabled={revoking !== undefined}
															onclick={() => revokeKey(key.id)}
															>{revoking === key.id
																? t('กำลังยกเลิกคีย์…', 'Revoking…')
																: t('ยืนยันการยกเลิกคีย์', 'Confirm revocation')}</button
														><button
															class="k-button quiet small"
															disabled={revoking !== undefined}
															onclick={() => (confirmRevoke = undefined)}
															>{t('กลับ', 'Back')}</button
														>
													</div>
												</div>{:else}<button
													class="k-button small detail-revoke-button"
													disabled={revoking !== undefined}
													onclick={() => (confirmRevoke = key.id)}
													><Trash2 size={14} aria-hidden="true" /> {t('ยกเลิกคีย์', 'Revoke key')}</button
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
<section class="detail-card gateway-tools" aria-labelledby="detail-tools-title">
	<header class="detail-card-head">
		<h2 id="detail-tools-title">{t('เครื่องมือที่อนุญาตในพื้นที่ทำงานนี้', 'Allowed tools in this workspace')}</h2>
		{#if data.canManage && !archived}<a class="k-button small" href={localeHref(`/app?view=new&edit=${encodeURIComponent(hub.id)}&step=tools`)}><Pencil size={16} aria-hidden="true" />{t('แก้ไขเครื่องมือ', 'Edit tools')}</a>{:else}<span class="detail-head-icon" aria-hidden="true"><FileCheck2 size={18} /></span>{/if}
	</header>
	{#if unavailableTools.length}<div class="k-banner detail-inset" role="status"><Info size={16} aria-hidden="true" /><p>{t('เครื่องมือบางรายการยังใช้งานไม่ได้ กรุณาตรวจสอบระบบนั้นหรือปรับเครื่องมือที่อนุญาต', 'Some allowed tools are unavailable. Review that system or update its allowed tools.')}</p></div>{/if}
	<div class="detail-toolbar">
		<div class="detail-search">
			<Search size={16} aria-hidden="true" />
			<label class="sr-only" for="gateway-tool-search">{t('ค้นหาเครื่องมือหรือระบบ', 'Search tools or systems')}</label><input id="gateway-tool-search" type="search" bind:value={toolQuery} placeholder={t('ชื่อระบบ การทำงาน หรือชื่อเครื่องมือ', 'System, action or tool name')} />
		</div>
		<p class="gateway-result-count">{t(`แสดง ${visibleTools.length} จาก ${gatewayToolCount(hub)} เครื่องมือ`, `Showing ${visibleTools.length} of ${gatewayToolCount(hub)} tools`)}</p>
	</div>
	<div class="gateway-tool-list">
	{#each visibleTools as item (item.key)}
		{@const presentation = toolPresentation(item.tool, orcaLocale.value)}
		<details class="gateway-tool"><summary><span class="gateway-tool-main"><strong>{presentation.label}</strong><span class="gateway-tool-description">{presentation.description}</span><span class="gateway-tool-app">{item.source.connection?.name || t('ไม่พบระบบ', 'System unavailable')}</span></span><span class="gateway-tool-status"><span class="k-badge">{!item.source.ready ? t('ใช้งานไม่ได้', 'Unavailable') : accessLabel(item.source.connection?.reviewedReadOnly)}</span><span class="gateway-tool-hint">{t('รายละเอียด', 'Details')}</span></span></summary>
			<div class="gateway-schema"><p>{t('รหัสเครื่องมือ', 'Tool identifier')}</p><code>{item.name}</code><p>{t('โครงสร้างข้อมูลที่เครื่องมือต้องการ', 'Tool input schema')}</p><pre>{JSON.stringify(item.tool.inputSchema, null, 2)}</pre></div>
		</details>
	{:else}<p class="gateway-empty">{t('ไม่พบเครื่องมือที่ตรงกับคำค้น', 'No tools match your search.')}</p>{/each}
	</div>
</section>
{:else if activeTab === 'access'}
<div class="detail-stack">
	<section class="detail-card gateway-identity" aria-labelledby="detail-identity-title">
		<header class="detail-card-head">
			<h2 id="detail-identity-title">{t('การเข้าสู่ระบบของสมาชิก', 'Member sign-in')}</h2>{#if data.canManage}<a class="k-button small" href={localeHref('/app?view=user-sources')}>{t('จัดการการเข้าสู่ระบบองค์กร', 'Manage sign-in sources')}</a>{/if}
		</header>
		<div class="detail-card-body">
		{#if data.canManage}
			<form onsubmit={(event) => { event.preventDefault(); void saveIdentity(); }}>
				<div class="gateway-identity-fields">
					<div class="k-field"><label for="gateway-user-source">{t('วิธีเข้าสู่ระบบ', 'Sign-in method')}</label>
						<select id="gateway-user-source" bind:value={userSourceID} disabled={archived || saving || identitySaving} onchange={() => identitySaved = false}>
							<option value="">{t('บัญชี ORCA', 'ORCA account')}</option>
							{#if userSourceID && !selectedUserSource}<option value={userSourceID} disabled>{t('การเข้าสู่ระบบองค์กรเดิม', 'Previous sign-in source')}</option>{/if}
							{#each userSources.filter((source) => source.enabled || source.id === userSourceID) as source (source.id)}<option value={source.id} disabled={!source.enabled}>{source.name}{source.enabled ? '' : t(' · ปิดใช้งาน', ' · Disabled')}</option>{/each}
							</select>
					</div>
					<button type="submit" class="k-button primary" disabled={archived || saving || identitySaving || !identityChanged}>{identitySaving ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
				</div>
			</form>
			{#if loadingUserSources}<p class="detail-muted" role="status">{t('กำลังโหลดการเข้าสู่ระบบองค์กร…', 'Loading sign-in sources…')}</p>{/if}
			{#if userSourcesError}<div class="k-banner error" role="alert"><div>{userSourcesError}<button type="button" class="k-link-button" disabled={loadingUserSources || identitySaving} onclick={loadUserSources}>{t('โหลดการเข้าสู่ระบบองค์กรอีกครั้ง', 'Reload sign-in sources')}</button></div></div>{/if}
			{#if identitySaved}<div class="k-banner success" role="status"><Check size={16} aria-hidden="true" />{t('บันทึกวิธีเข้าสู่ระบบแล้ว', 'Sign-in method saved')}</div>{/if}
		{:else}<p class="detail-identity-value">{hub.userSourceID ? t('การเข้าสู่ระบบองค์กร', 'Organization sign-in') : t('บัญชี ORCA', 'ORCA account')}</p>{/if}
		</div>
	</section>
	<section class="detail-card" aria-labelledby="detail-members-title">
		<header class="detail-card-head">
			<h2 id="detail-members-title">{t(`สมาชิก ${gatewayMemberIDs(hub).length} คน`, `Members (${gatewayMemberIDs(hub).length})`)}</h2>
			<span class="detail-head-icon" aria-hidden="true"><Users size={18} /></span>
		</header>
		<ul class="detail-rows">
			{#each members as member}<li class="detail-member">
					<div class="detail-row-copy">
						<strong
							>{memberName(member)}{member.id === data.currentUserID
								? t(' (คุณ)', ' (you)')
								: ''}</strong
						>
						<p>{member.email}</p>
					</div>
					<span class="k-badge">{hub.memberIDs.includes(member.id) ? t('สมาชิกโดยตรง', 'Direct member') : t('ได้รับสิทธิ์ผ่านแผนก', 'Access through a department')}</span>
				</li>{/each}
		</ul>
		{#if hub.accessUnitIDs?.length}<p class="detail-card-foot">
				{t('แผนกที่ได้รับสิทธิ์:', 'Departments with access:')}
				{data.units.filter((unit) => hub.accessUnitIDs?.includes(unit.id)).map((unit) => unit.name).join(', ')}
			</p>{/if}
		{#if hub.unitIDs?.length}<p class="detail-card-foot">
				{t('ป้ายกำกับแผนกเดิม:', 'Previous department labels:')}
				{data.units
					.filter((unit) => hub.unitIDs.includes(unit.id))
					.map((unit) => unit.name)
					.join(', ')}
			</p>{/if}
	</section>
</div>
{/if}
</div>

<style>
	/* Shared chevron for disclosure rows (lucide chevron-down). */
	.detail {
		--detail-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		min-width: 0;
		color: var(--orca-ink);
	}

	/* ---------- Page header ---------- */
	.detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px 24px;
		margin-bottom: 20px;
	}
	.detail-heading {
		flex: 1 1 320px;
		min-width: 0;
	}
	.detail-title-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 12px;
	}
	.detail-title-row h1 {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.detail-related {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
	}
	.detail-related:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.detail-related :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex: none;
	}
	.detail-actions :global(div.lifecycle-actions) {
		gap: 8px;
	}
	/* Archive and delete sit in the header as 36px outlined icon buttons, matching k-button height. */
	.detail-actions :global(.lifecycle-actions.compact .lifecycle-button) {
		width: 36px;
		height: 36px;
		border: 1px solid var(--orca-line);
		background: var(--orca-surface);
		color: var(--orca-subtle);
	}
	.detail-actions :global(.lifecycle-actions.compact .lifecycle-button:hover) {
		border-color: var(--orca-line-strong);
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.detail-actions :global(.lifecycle-actions.compact .lifecycle-button.delete-action:hover) {
		border-color: color-mix(in srgb, var(--orca-deny) 25%, var(--orca-surface));
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.detail-actions :global(.lifecycle-actions:not(.compact) .k-button) {
		min-height: 36px;
		padding: 0 14px;
		font-size: 14px;
	}

	/* ---------- Tabs ---------- */
	.gateway-tabs {
		display: flex;
		gap: 24px;
		margin: 0 0 20px;
		border-bottom: 1px solid var(--orca-line);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.gateway-tabs::-webkit-scrollbar {
		display: none;
	}
	.gateway-tabs a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		flex: none;
		min-height: 40px;
		padding: 8px 0;
		border-bottom: 2px solid transparent;
		color: var(--orca-muted);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		white-space: nowrap;
		text-decoration: none;
	}
	.gateway-tabs a:hover {
		color: var(--orca-ink);
	}
	.gateway-tabs a.active {
		border-bottom-color: var(--orca-ink);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.gateway-tabs a:focus-visible {
		outline-offset: -2px;
		border-radius: 4px;
	}
	.gateway-tab-count,
	.detail-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
		line-height: 1;
	}

	/* ---------- Cards ---------- */
	.detail-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	.detail-stack {
		display: grid;
		gap: 16px;
		min-width: 0;
	}
	.detail-card {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.detail-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 18px 12px;
	}
	.gateway-guidance {
		margin-top: 16px;
	}
	.guidance-label {
		display: block;
		margin-top: 12px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.gateway-guidance textarea {
		width: 100%;
		min-height: 120px;
		margin-top: 6px;
		padding: 10px 12px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
		line-height: 1.6;
		resize: vertical;
	}
	.gateway-guidance textarea:focus-visible {
		outline: none;
		border-color: var(--orca-ink);
		box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
	}
	.guidance-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 8px;
	}
	.guidance-count {
		color: var(--orca-subtle);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.guidance-text {
		margin: 10px 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.gateway-guidance .k-banner {
		margin-top: 10px;
	}
	.gateway-writes {
		margin-top: 16px;
	}
	.gateway-writes .detail-card-head {
		justify-content: flex-start;
	}
	.write-mode-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		min-width: 0;
		margin: 12px 0 0;
		padding: 0;
		border: 0;
	}
	.write-mode-option {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		min-width: 0;
		padding: 12px 14px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		cursor: pointer;
	}
	.write-mode-option.chosen {
		border-color: var(--orca-ink);
		box-shadow: inset 0 0 0 1px var(--orca-ink);
	}
	.write-mode-options:disabled .write-mode-option {
		cursor: default;
		opacity: 0.7;
	}
	.write-mode-option input {
		flex: none;
		width: 16px;
		height: 16px;
		margin: 3px 0 0;
		accent-color: var(--orca-ink);
	}
	.write-mode-option span {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.write-mode-option strong {
		font-size: 14px;
		font-weight: 600;
	}
	.write-mode-option small {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.write-mode-note {
		margin: 10px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.write-mode-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 12px;
	}
	.write-mode-current {
		margin: 10px 0 0;
	}
	.write-mode-current a {
		margin-left: 6px;
	}
	.gateway-writes .k-banner {
		margin-top: 10px;
	}
	@media (max-width: 640px) {
		.write-mode-options {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.detail-card-head-ruled {
		padding-bottom: 16px;
		border-bottom: 1px solid var(--orca-line);
	}
	.detail-card-head h2 {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.detail-card-head .k-button {
		flex: none;
	}
	.detail-card-title {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.detail-head-icon {
		display: inline-flex;
		flex: none;
		padding-top: 3px;
		color: var(--orca-subtle);
	}
	.detail-card-body {
		padding: 16px 18px 18px;
	}
	.detail-card-head:not(.detail-card-head-ruled) + .detail-card-body {
		padding-top: 4px;
	}
	.detail-card-foot {
		margin: 0;
		padding: 12px 18px;
		border-top: 1px solid #eff0f2;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	.detail-rows {
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--orca-line);
	}
	.detail-rows > li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
	}
	.detail-rows > li + li {
		border-top: 1px solid #eff0f2;
	}
	.detail-rows > .gateway-source-row {
		grid-template-columns: 32px minmax(0, 1fr) auto;
	}
	.detail-logo {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.detail-row-copy {
		min-width: 0;
	}
	.detail-row-copy strong {
		display: block;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.detail-row-copy p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.detail-muted {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}

	/* ---------- Usage ---------- */
	.detail-usage {
		padding: 4px 18px 18px;
	}
	.detail-usage-figure {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.detail-usage-value {
		margin: 0;
		font-size: 22px;
		font-weight: 700;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.detail-usage-value span {
		color: var(--orca-muted);
		font-size: 14px;
		font-weight: 500;
	}
	.detail-progress {
		display: block;
		width: 100%;
		height: 6px;
		margin-top: 12px;
		border: 0;
		border-radius: 999px;
		background: var(--orca-secondary);
		overflow: hidden;
		appearance: none;
	}
	.detail-progress::-webkit-progress-bar {
		border-radius: 999px;
		background: var(--orca-secondary);
	}
	.detail-progress::-webkit-progress-value {
		border-radius: 999px;
		background: var(--orca-ink);
	}
	.detail-progress::-moz-progress-bar {
		border-radius: 999px;
		background: var(--orca-ink);
	}
	.detail-usage-note {
		margin: 12px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}

	/* ---------- Disclosure panels ---------- */
	.detail-disclosure {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.detail-disclosure > summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
		padding: 12px 18px;
		border-radius: var(--orca-radius-lg);
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.45;
		list-style: none;
		cursor: pointer;
	}
	.detail-disclosure > summary::-webkit-details-marker {
		display: none;
	}
	.detail-disclosure > summary::after {
		content: '';
		flex: none;
		width: 16px;
		height: 16px;
		background-color: var(--orca-subtle);
		-webkit-mask: var(--detail-chevron) center / 16px 16px no-repeat;
		mask: var(--detail-chevron) center / 16px 16px no-repeat;
		transition: transform 0.15s;
	}
	.detail-disclosure > summary:hover {
		background: var(--orca-surface-2);
	}
	.detail-disclosure > summary:focus-visible {
		outline-offset: -2px;
	}
	.detail-disclosure[open] > summary {
		border-bottom: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg) var(--orca-radius-lg) 0 0;
	}
	.detail-disclosure[open] > summary::after {
		transform: rotate(180deg);
	}
	.detail-disclosure-body {
		padding: 16px 18px 18px;
	}
	.gateway-guide {
		margin-top: 16px;
	}
	.detail-stack > .gateway-guide {
		margin-top: 0;
	}
	.gateway-account-list {
		display: grid;
		gap: 8px;
	}
	/* SourceSetup draws its own card; inside the account panel it sits flat in the panel body. */
	.gateway-account :global(.source-setup.k-panel) {
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
	}
	.gateway-overview-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
	}

	/* ---------- Connect ---------- */
	.gateway-unified-intro {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 20px;
		padding: 16px 18px;
	}
	.gateway-unified-intro h2 {
		margin: 0;
	}
	.gateway-unified-intro p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	.detail-subhead {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.detail-subhead h2 {
		margin: 0;
		font-size: 14.5px;
	}
	.detail-subhead-icon {
		display: inline-flex;
		color: var(--orca-subtle);
	}
	.detail-key-panel .k-banner {
		margin: 16px 0 0;
	}
	.detail-secret {
		margin-top: 20px;
		padding: 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
	}
	.detail-secret-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.detail-secret-head h3 {
		margin: 0;
	}
	.detail-secret-icon {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.detail-secret > p {
		margin: 6px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	.detail-button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.detail-secret-field {
		margin-top: 16px;
	}
	.detail-secret-field input {
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 13px;
	}
	.detail-key-form {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid #eff0f2;
	}
	.detail-key-form fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.detail-key-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(160px, 220px);
		gap: 16px;
		margin-bottom: 16px;
	}
	.detail-key-fields .k-field + .k-field {
		margin-top: 0;
	}
	.detail-keys {
		margin-top: 24px;
	}
	.detail-keys-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.detail-keys-head h3 {
		margin: 0;
	}
	.detail-table-wrap {
		overflow-x: auto;
	}
	.detail-table td {
		vertical-align: middle;
	}
	.detail-table tbody tr:hover td {
		background: var(--orca-surface-2);
	}
	.detail-key-name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.detail-key-meta {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.detail-actions-col {
		width: 1%;
		white-space: nowrap;
		text-align: end;
	}
	.detail-actions-col .k-button {
		white-space: nowrap;
	}
	.detail-table th.detail-actions-col {
		text-align: end;
	}
	.detail-revoke {
		display: grid;
		justify-items: end;
		gap: 6px;
		white-space: normal;
	}
	.detail-revoke > span {
		max-width: 260px;
		color: var(--orca-deny);
		font-size: 12.5px;
		line-height: 1.5;
		text-align: end;
	}
	.detail-revoke-actions {
		display: flex;
		justify-content: flex-end;
		gap: 4px;
	}
	.detail-revoke-button:hover {
		border-color: color-mix(in srgb, var(--orca-deny) 25%, var(--orca-surface));
		background: var(--orca-deny-bg);
		color: var(--orca-deny) !important;
	}

	/* ---------- Tools ---------- */
	.detail-inset {
		margin: 0 18px 12px;
	}
	.detail-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		padding: 0 18px 14px;
	}
	.detail-search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: min(360px, 100%);
		height: 36px;
		padding: 0 11px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-subtle);
	}
	.detail-search:focus-within {
		border-color: var(--orca-ink);
		box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
	}
	.detail-search input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.detail-search input::placeholder {
		color: var(--orca-subtle);
	}
	.detail-search input:focus-visible {
		outline: none;
	}
	.gateway-result-count {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.gateway-tool-list {
		border-top: 1px solid var(--orca-line);
	}
	.gateway-tool + .gateway-tool {
		border-top: 1px solid #eff0f2;
	}
	.gateway-tool summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		padding: 12px 18px;
		list-style: none;
		cursor: pointer;
	}
	.gateway-tool summary::-webkit-details-marker {
		display: none;
	}
	.gateway-tool summary:hover {
		background: var(--orca-surface-2);
	}
	.gateway-tool summary:focus-visible {
		outline-offset: -2px;
	}
	.gateway-tool-main {
		display: grid;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.gateway-tool-main strong {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
	}
	.gateway-tool-description {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.gateway-tool:not([open]) .gateway-tool-description {
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.gateway-tool-app {
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
	.gateway-tool-status {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}
	.gateway-tool-hint {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--orca-muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.gateway-tool-hint::after {
		content: '';
		width: 16px;
		height: 16px;
		background-color: var(--orca-subtle);
		-webkit-mask: var(--detail-chevron) center / 16px 16px no-repeat;
		mask: var(--detail-chevron) center / 16px 16px no-repeat;
		transition: transform 0.15s;
	}
	.gateway-tool[open] .gateway-tool-hint::after {
		transform: rotate(180deg);
	}
	.gateway-schema {
		display: grid;
		gap: 6px;
		padding: 0 18px 16px;
	}
	.gateway-schema p {
		margin: 6px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.gateway-schema code {
		justify-self: start;
		max-width: 100%;
		padding: 2px 8px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-sm);
		background: var(--orca-surface-2);
		color: var(--orca-nav);
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.gateway-schema pre {
		max-height: 320px;
		margin: 0;
		padding: 12px 14px;
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 13px;
		line-height: 1.6;
	}
	.gateway-empty {
		margin: 0;
		padding: 32px 18px;
		color: var(--orca-muted);
		font-size: 14px;
		text-align: center;
	}

	/* ---------- Access ---------- */
	.gateway-identity-fields {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: 12px;
	}
	.gateway-identity-fields .k-field {
		flex: 1 1 260px;
		max-width: 480px;
		margin-bottom: 0;
	}
	.gateway-identity .k-banner {
		margin: 12px 0 0;
	}
	.gateway-identity .detail-muted {
		margin-top: 10px;
	}
	.detail-identity-value {
		margin: 0;
		font-size: 14px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* ---------- Responsive ---------- */
	@media (max-width: 1100px) {
		.detail-head {
			flex-direction: column;
			gap: 12px;
		}
		.detail-heading {
			flex: none;
			width: 100%;
		}
		.detail-actions {
			justify-content: flex-start;
		}
	}
	@media (max-width: 1080px) {
		.detail-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 760px) {
		/* Every tab stays visible on phones: the bar wraps instead of scrolling. */
		.gateway-tabs {
			flex-wrap: wrap;
			gap: 0 20px;
			overflow-x: visible;
		}
		.gateway-tabs a {
			min-height: 36px;
			padding: 6px 0;
		}
		.detail-actions {
			width: 100%;
		}
		.detail-related {
			min-height: 36px;
			margin-top: 2px;
		}
		.detail-actions > .k-button {
			flex: 1 1 auto;
		}
		.detail-card-head {
			padding-inline: 14px;
		}
		.detail-card-body,
		.detail-disclosure-body {
			padding: 14px;
		}
		.detail-disclosure > summary,
		.detail-rows > li,
		.gateway-tool summary,
		.detail-card-foot {
			padding-inline: 14px;
		}
		.detail-usage,
		.detail-toolbar,
		.gateway-schema {
			padding-inline: 14px;
		}
		.detail-inset {
			margin-inline: 14px;
		}
		.detail-search {
			width: 100%;
		}
		.gateway-tool summary {
			grid-template-columns: minmax(0, 1fr);
			gap: 8px;
		}
		.gateway-tool-status {
			justify-content: space-between;
		}
		.detail-key-fields {
			grid-template-columns: minmax(0, 1fr);
		}
		.gateway-identity-fields > .k-button {
			width: 100%;
		}
	}
</style>
