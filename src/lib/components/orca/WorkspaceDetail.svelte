<script lang="ts">
	import { page } from '$app/state';
	import { gatewayMemberIDs, gatewaySources } from '$lib/orca/gateway-sources';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { saveHubPatch } from '$lib/orca/workspace-edit';
	import type { OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import { hubWriteService, workspaceWriteError } from '$lib/services/orca-workspaces';
	import { ArrowUpRight, Info, LoaderCircle, Play } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import LifecycleActions from './LifecycleActions.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import type { StatusTone } from './ui/StatusPill.svelte';
	import { showToast } from './ui/toast-store.svelte';
	import WorkspaceSettingsView from './views/WorkspaceSettingsView.svelte';
	import WorkspaceOverviewTab from './workspace/WorkspaceOverviewTab.svelte';
	import WorkspacePeopleTab from './workspace/WorkspacePeopleTab.svelte';
	import WorkspaceProgramsTab from './workspace/WorkspaceProgramsTab.svelte';

	// One AI workspace (proposal §3.5 screen 4): ภาพรวม · โปรแกรม · คน · ตั้งค่า,
	// each edited in place. Only Owners and Admins edit; everyone else reads.
	let { data, hub, onchanged }: { data: OrcaBootstrap; hub: OrcaHub; onchanged: () => Promise<void> } = $props();
	const archived = $derived(hub.status === 'archived' || hub.status === 'deleted');
	const canEdit = $derived(data.canManage && !archived);
	const aliases: Record<string, string> = { tools: 'programs', access: 'people' };
	const requested = $derived(aliases[page.url.searchParams.get('tab') ?? ''] ?? page.url.searchParams.get('tab') ?? 'overview');
	const tabs = $derived([
		{ id: 'overview', label: t('ภาพรวม', 'Overview') },
		{ id: 'programs', label: t('โปรแกรม', 'Programs'), count: gatewaySources(hub).length },
		{ id: 'people', label: t('คน', 'People'), count: gatewayMemberIDs(hub).length },
		...(canEdit ? [{ id: 'settings', label: t('ตั้งค่า', 'Settings') }] : [])
	]);
	const activeTab = $derived(tabs.some((tab) => tab.id === requested) ? requested : 'overview');
	const created = $derived(page.url.searchParams.get('created') === '1');
	const status = $derived<{ label: string; tone: StatusTone }>(
		hub.status === 'active'
			? { label: t('เปิดใช้งาน', 'Active'), tone: 'ok' }
			: hub.status === 'paused'
				? { label: t('หยุดชั่วคราว', 'Paused'), tone: 'warn' }
				: hub.status === 'draft'
					? { label: t('ฉบับร่าง', 'Draft'), tone: 'neutral' }
					: { label: t('จัดเก็บแล้ว', 'Archived'), tone: 'neutral' }
	);
	let activating = $state(false);
	let activateError = $state('');

	function tabHref(tab: string) {
		return localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}${tab === 'overview' ? '' : `&tab=${tab}`}`);
	}
	onMount(() => {
		if (created && data.canManage)
			showToast(
				hub.status !== 'active'
					? t('บันทึกเป็นฉบับร่างแล้ว — เปิดใช้งานเมื่อพร้อม', 'Saved as a draft. Activate it when ready.')
					: hub.userSourceID
						? t('บันทึกแล้ว — ส่งลิงก์ของพื้นที่นี้ให้ทีม', "Saved. Send your team this workspace's link.")
						: t('สร้างแล้ว — Claude/ChatGPT ที่เชื่อม ORCA ไว้จะเห็นพื้นที่นี้เอง', 'Created. Claude or ChatGPT connected to ORCA will see this workspace by itself.')
			);
	});
	async function activate() {
		if (activating || !canEdit) return;
		activating = true;
		activateError = '';
		try {
			await saveHubPatch(hub.id, () => ({ status: 'active' }), hubWriteService);
			showToast(t('เปิดใช้งานแล้ว', 'Activated'));
			await onchanged();
		} catch (cause) {
			activateError = workspaceWriteError(cause);
		} finally {
			activating = false;
		}
	}
</script>

<PageHeader
	back={{ href: localeHref('/app?view=workspaces'), label: t('พื้นที่ทำงาน AI', 'AI workspaces') }}
	title={hub.name}
	{status}
	subtitle={hub.description || t('AI ของคนที่เลือกใช้โปรแกรมเหล่านี้ได้ตามที่ตั้งไว้', 'The people chosen use these programs through their AI, as set here.')}
>
	{#snippet action()}
		{#if canEdit && hub.status !== 'active'}
			<button type="button" class="k-button" class:primary={activeTab === 'overview'} disabled={activating} onclick={activate}>{#if activating}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{:else}<Play size={16} aria-hidden="true" />{/if}{t('เปิดใช้งาน', 'Activate')}</button>
		{/if}
	{/snippet}
</PageHeader>

{#if activateError}<div class="hub-alert" role="alert"><Info size={18} aria-hidden="true" /><p>{activateError}</p></div>{/if}
{#if archived}
	<div class="hub-archived" role="status">
		<Info size={18} aria-hidden="true" />
		<p>{t('พื้นที่นี้จัดเก็บแล้ว AI ใช้ไม่ได้ กู้คืนเพื่อตรวจและเปิดใช้งานอีกครั้ง', "This workspace is archived and AI can't use it. Restore it to review and activate it again.")}</p>
		{#if data.canManage}<LifecycleActions entity={hub} kind="gateway" archived canManage={data.canManage} onchanged={() => onchanged()} onreload={onchanged} />{/if}
	</div>
{/if}

<nav class="hub-tabs" aria-label={t('ส่วนของพื้นที่ทำงาน', 'Workspace sections')}>
	<div class="hub-tab-list">
		{#each tabs as tab (tab.id)}
			<a href={tabHref(tab.id)} class:active={activeTab === tab.id} aria-current={activeTab === tab.id ? 'page' : undefined}>{tab.label}{#if tab.count !== undefined}<span class="hub-tab-count">{tab.count}</span>{/if}</a>
		{/each}
	</div>
	<a class="hub-activity" href={localeHref(`/app?view=executions&hub=${encodeURIComponent(hub.id)}`)}>{t('ประวัติการใช้งาน', 'Activity')}<ArrowUpRight size={14} aria-hidden="true" /></a>
</nav>

{#key `${hub.id}:${hub.version}`}
	{#if activeTab === 'programs'}<WorkspaceProgramsTab {data} {hub} {canEdit} {onchanged} />
	{:else if activeTab === 'people'}<WorkspacePeopleTab {data} {hub} {canEdit} {onchanged} />
	{:else if activeTab === 'settings'}<WorkspaceSettingsView {data} {hub} {onchanged} />
	{:else}<WorkspaceOverviewTab {data} {hub} {created} {tabHref} />{/if}
{/key}

<style>
	.hub-alert,
	.hub-archived {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		margin: 0 0 18px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
	}
	.hub-alert {
		border-color: var(--orca-deny-line);
		background: var(--orca-deny-bg);
	}
	.hub-alert > :global(svg) {
		color: var(--orca-deny);
	}
	.hub-archived > :global(svg) {
		color: var(--orca-text-2);
	}
	.hub-alert p,
	.hub-archived p {
		flex: 1 1 280px;
		margin: 0;
		font-size: 14px;
		line-height: 1.55;
	}
	.hub-tabs {
		display: flex;
		align-items: flex-end;
		gap: 16px;
		margin: 0 0 24px;
		border-bottom: 1px solid var(--orca-line);
	}
	.hub-tab-list {
		display: flex;
		gap: 24px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.hub-tab-list a {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		margin-bottom: -1px;
		padding: 10px 0;
		border-bottom: 2px solid transparent;
		color: var(--orca-muted);
		font-size: 15px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.hub-tab-list a:hover {
		color: var(--orca-ink);
	}
	.hub-tab-list a.active {
		border-bottom-color: var(--orca-tab-indicator);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.hub-tab-count {
		padding: 0 7px;
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.6;
	}
	.hub-activity {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		padding: 10px 0;
		color: var(--orca-muted);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.hub-activity:hover {
		color: var(--orca-ink);
	}
	@media (max-width: 720px) {
		.hub-tab-list {
			gap: 18px;
		}
		.hub-activity {
			display: none;
		}
	}
</style>
