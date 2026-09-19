<script lang="ts">
	import { goto } from '$app/navigation';
	import LifecycleActions from '$lib/components/orca/LifecycleActions.svelte';
	import { page } from '$app/state';
	import GatewayClientSetup from '$lib/components/orca/GatewayClientSetup.svelte';
	import SourceSetup from '$lib/components/orca/SourceSetup.svelte';
	import WorkspaceReadiness from '$lib/components/orca/WorkspaceReadiness.svelte';
	import { personalKeyAvailable, workspaceToolingReady } from '$lib/orca/activation';
	import { unavailableGatewayTools } from '$lib/orca/gateway-tool-selection';
	import { t, localeHref } from '$lib/orca/locale.svelte';
	import {
		OrcaService,
		displayDate,
		orcaError,
		memberName,
		statusLabels,
		type OrcaBootstrap,
		type OrcaHub,
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
		{ id: 'tools', label: t('เครื่องมือ', 'Tools'), count: hub.toolNames.length },
		{ id: 'access', label: t('สิทธิ์และสมาชิก', 'Access & members'), count: hub.memberIDs.length },
		...(!archived ? [{ id: 'connect', label: t('เชื่อมแอป AI', 'Connect AI') }] : [])
	]);
	function tabHref(tab: string) {
		return localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=${tab}`);
	}
	const visibleTools = $derived(hub.toolNames.filter((name) => {
		const tool = connection?.tools.find((item) => item.name === name);
		return `${name} ${tool?.description || ''}`.toLowerCase().includes(toolQuery.trim().toLowerCase());
	}));
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
	const connection = $derived(data.connections.find((item) => item.id === hub.connectionID));
	const unavailableTools = $derived(unavailableGatewayTools(connection, hub.toolNames));
	const toolAccessLabel = $derived(
		connection?.reviewedReadOnly
			? t('อ่านข้อมูลเท่านั้น', 'Read only')
			: connection?.reviewedTools
				? t('เครื่องมือที่เลือก', 'Selected tools')
				: t('รอตรวจเครื่องมือ', 'Needs tool review')
	);
	const isMember = $derived(hub.memberIDs.includes(data.currentUserID));
	const canConnect = $derived(
		isMember && hub.status === 'active' && workspaceToolingReady(hub, connection)
	);
	const members = $derived(data.members.filter((item) => hub.memberIDs.includes(item.id)));
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
		if (archived || !hub.memberIDs.includes(currentData.currentUserID)) {
			keyRequest += 1;
			keys = [];
			keysLoaded = false;
			loadingKeys = false;
		} else void untrack(loadKeys);
	});
	onMount(() => {
		const timer = window.setInterval(() => (now = Date.now()), 30_000);
		return () => window.clearInterval(timer);
	});
	onDestroy(() => {
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
	async function changeStatus() {
		if (saving || archived || !data.canManage) return;
		saving = true;
		error = '';
		try {
			await OrcaService.hub(
				{
					name: hub.name,
					description: hub.description,
					connectionID: hub.connectionID,
					toolNames: hub.toolNames,
					memberIDs: hub.memberIDs,
					unitIDs: hub.unitIDs,
					dailyLimit: hub.dailyLimit,
					status: hub.status === 'active' ? 'paused' : 'active',
					version: hub.version
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
			(expiryDays ?? 0) < 1 ||
			(expiryDays ?? 0) > 30
		) {
			keyError = t(
				'กรุณาตั้งชื่อคีย์และเลือกอายุการใช้งาน 1–30 วัน',
				'Enter a key name and an expiry between 1 and 30 days.'
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
{#if !connection?.enabled}<div class="k-banner" role="status">
		<Info size={19} />
		<p>
			{t(
				'การเชื่อมต่อระบบนี้ถูกปิดใช้งาน Gateway จึงยังเข้าถึงข้อมูลไม่ได้',
				'The source connection is disabled. This Gateway cannot access data yet.'
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
		<div class="k-panel-head">
			<div class="k-actions">
				<span class="k-icon"><Plug size={23} /></span>
				<div>
					<p class="k-muted k-small">{t('ระบบที่เชื่อมต่อ', 'Connected source')}</p>
					<h2>{connection?.name || t('ไม่พบการเชื่อมต่อ', 'Connection not found')}</h2>
				</div>
			</div>
			<span class="k-badge accent">{toolAccessLabel}</span>
		</div>
		<p class="k-muted" style="white-space:pre-wrap">{connection?.scopeNote}</p>
		<p class="k-small k-muted" style="margin-top:13px">
			{t(
				'ข้อมูลที่เข้าถึงได้ขึ้นอยู่กับสิทธิ์ของบัญชีที่ใช้ในระบบที่เชื่อมต่อ',
				'Data scope follows the permissions configured in the source account.'
			)}
		</p>
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
	{#if canConnect && connection}<SourceSetup sourceID={connection.mcpID} />{/if}
	<div class="k-section-title">
		<h2 id="connect-title">
			{t('เชื่อมแอป AI กับ Gateway นี้', 'Connect your AI to this Gateway')}
		</h2>
		<KeyRound size={22} color="#5143e8" />
	</div>
	<div class="k-panel">
		<GatewayClientSetup endpoint={hub.connectURL} ready={canConnect} />
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
										>{t('30 วัน', '30 days')}</option
									></select
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
										><td>{displayDate(key.expiresAt)}</td><td>{displayDate(key.lastUsedAt)}</td><td
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
</section>
{:else if activeTab === 'tools'}
<section class="k-panel gateway-tools">
  <div class="k-section-title"><h2>{t('เครื่องมือที่เลือกใน Gateway', 'Selected Gateway tools')}</h2>{#if data.canManage && !archived}<a class="k-button" href={localeHref(`/app?view=new&edit=${encodeURIComponent(hub.id)}&step=tools`)}><Pencil size={16} />{t('แก้ไขเครื่องมือ', 'Edit tools')}</a>{:else}<FileCheck2 size={20} />{/if}</div>
  {#if unavailableTools.length}<div class="k-banner" role="status"><Info size={19} /><p>{t('มีเครื่องมือที่ Server ไม่อนุญาตแล้ว ทำให้ Gateway ใช้เครื่องมือไม่ได้ ผู้ดูแลต้องนำรายการเหล่านั้นออกและบันทึกอีกครั้ง', 'Some selected tools are no longer allowed by the server, which blocks Gateway tool access. An administrator must remove those tools and save again.')}</p></div>{/if}
  <div class="k-field"><label for="gateway-tool-search">{t('ค้นหาเครื่องมือ', 'Search tools')}</label><input id="gateway-tool-search" type="search" bind:value={toolQuery} placeholder={t('ชื่อหรือคำอธิบายเครื่องมือ', 'Tool name or description')} /></div>
  <p class="k-small k-muted gateway-result-count">{t(`แสดง ${visibleTools.length} จาก ${hub.toolNames.length} เครื่องมือ`, `${visibleTools.length} of ${hub.toolNames.length} tools`)}</p>
  {#each visibleTools as name}
    {@const tool = connection?.tools.find((item) => item.name === name)}
    <details class="gateway-tool"><summary><span><strong>{name}</strong><span class="k-muted k-small">{tool?.description || t('ไม่มีคำอธิบาย', 'No description')}</span></span><span class="k-badge">{unavailableTools.includes(name) ? t('Server ไม่อนุญาตแล้ว', 'No longer allowed') : toolAccessLabel}</span></summary>
      {#if tool}<div class="gateway-schema"><p class="k-small k-muted">{t('รูปแบบข้อมูลที่เครื่องมือต้องการ', 'Tool input schema')}</p><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></div>{:else}<p class="k-small k-muted">{t('ไม่พบข้อมูลเครื่องมือล่าสุด กรุณาให้ผู้ดูแลตรวจการเชื่อมต่อ', 'Latest tool details are unavailable. Ask an administrator to review the connection.')}</p>{/if}
    </details>
  {:else}<p class="gateway-empty">{t('ไม่พบเครื่องมือตามคำค้น', 'No tools match your search.')}</p>{/each}
</section>
{:else if activeTab === 'access'}
	<section class="k-panel" style="margin-top:0">
		<div class="k-section-title">
			<h2>{t('สมาชิก', 'Members')} {hub.memberIDs.length} {t('คน', 'people')}</h2>
			<Users size={22} color="#5143e8" />
		</div>
		<div class="k-stack">
			{#each members as member}<div>
					<strong style="font-weight:500"
						>{memberName(member)}{member.id === data.currentUserID
							? t(' (คุณ)', ' (you)')
							: ''}</strong
					>
					<p class="k-small k-muted">{member.email}</p>
				</div>{/each}
		</div>
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
  .gateway-tool .k-badge { flex-shrink:0; }
  .gateway-schema { margin-top:16px; }
  .gateway-schema pre { background:#f6f7fa; border:1px solid #e2e6ed; border-radius:6px; padding:16px; max-height:320px; overflow:auto; font-size:12px; line-height:1.65; }
  .gateway-empty { padding:26px 0; color:#647087; text-align:center; }
  @media(max-width:600px) { .gateway-tabs { gap:20px; } .gateway-tool summary { align-items:flex-start; } }
</style>
