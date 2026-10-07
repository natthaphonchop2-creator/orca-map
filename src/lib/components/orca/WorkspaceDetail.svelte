<script lang="ts">
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { gatewayMemberIDs, gatewaySources } from '$lib/orca/gateway-sources';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { editorWorkspace, saveHubPatch, savedToast, withoutSavedParams } from '$lib/orca/workspace-edit';
	import type { OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import { hubWriteService, workspaceWriteError } from '$lib/services/orca-workspaces';
	import { ArrowUpRight, Info, LoaderCircle, Play } from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import LifecycleActions from './LifecycleActions.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';
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
	// A tab's unsaved changes live in that tab: moving to another tab, leaving
	// the workspace or closing the page asks first (Codex release review 63).
	let dirty = $state(false);
	const ondirty = (value: boolean) => (dirty = value);
	// The tabs edit the workspace as it was when they opened. A newer version
	// (someone else saved, then this page refreshed) replaces them only while
	// nothing is unsaved; otherwise they keep the typed changes, saved later on
	// top of the newest version (Codex release review 64). After their own
	// save they start from what it returned (tabChanged).
	let editorHub = $state(untrack(() => hub));
	const changedElsewhere = $derived(hub.version > editorHub.version && dirty);
	// The editing tabs follow the version they edit: archived elsewhere while
	// ตั้งค่า has unsaved text, the tab stays until that text is saved or
	// cancelled (Codex release review 65).
	const tabsEditable = $derived(data.canManage && !(editorHub.status === 'archived' || editorHub.status === 'deleted'));
	const aliases: Record<string, string> = { tools: 'programs', access: 'people' };
	const requested = $derived(aliases[page.url.searchParams.get('tab') ?? ''] ?? page.url.searchParams.get('tab') ?? 'overview');
	const tabs = $derived([
		{ id: 'overview', label: t('ภาพรวม', 'Overview') },
		{ id: 'programs', label: t('โปรแกรม', 'Programs'), count: gatewaySources(hub).length },
		{ id: 'people', label: t('คน', 'People'), count: gatewayMemberIDs(hub).length },
		...(tabsEditable ? [{ id: 'settings', label: t('ตั้งค่า', 'Settings') }] : [])
	]);
	const activeTab = $derived(tabs.some((tab) => tab.id === requested) ? requested : 'overview');
	const created = $derived(page.url.searchParams.get('created') === '1');
	// &add=<program>: from เพิ่มโปรแกรม's "เพิ่มลงพื้นที่ทำงาน…", turned on in โปรแกรม, waiting for บันทึก,
	// once. After a tab's save it was saved, or
	// turned off by the person, so a remount never turns it on again (Codex
	// release review 65); a new address with &add= brings it back.
	let addConnectionID = $state(untrack(() => page.url.searchParams.get('add') ?? ''));
	$effect(() => {
		addConnectionID = page.url.searchParams.get('add') ?? '';
	});
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

	// The newest workspace a tab's save returned, while the page's copy is
	// older (its refresh failed, or has not answered yet).
	let savedHub = $state<OrcaHub | undefined>();
	$effect(() => {
		const latest = savedHub && savedHub.id === hub.id && savedHub.version > hub.version ? savedHub : hub;
		const unsaved = dirty;
		untrack(() => {
			const next = editorWorkspace(editorHub, latest, unsaved);
			if (next !== editorHub) editorHub = next;
		});
	});
	/**
	 * After a tab's own save: the tabs start again at once from the workspace
	 * the save returned, on its new version, whether or not the page's refresh
	 * then brings it. Undoing the saved change is then a change to save again,
	 * and the refresh's copy of the same version, or an older one, changes
	 * nothing typed since (Codex release review 70). `shown`: the tab that
	 * saved is still open. A save that comes back after the person moved to
	 * another tab (ตั้งค่า's pause or activate, or "ออกโดยไม่บันทึก" during a
	 * save) never replaces what the tab open now has unsaved: its workspace
	 * waits until that is saved or cancelled (Codex review 71).
	 */
	async function tabChanged(saved?: OrcaHub, shown = true) {
		clearAdd();
		if (saved) {
			if (saved.id === hub.id && saved.version > (savedHub?.id === saved.id ? savedHub.version : -1)) savedHub = saved;
			if (shown) editorHub = editorWorkspace(editorHub, saved, false);
		}
		await onchanged();
	}
	function clearAdd() {
		if (!addConnectionID) return;
		addConnectionID = '';
		const url = new URL(page.url.href);
		url.searchParams.delete('add');
		try {
			replaceState(url.pathname + url.search + url.hash, page.state);
		} catch {
			// Before the router starts: the address keeps it, the page does not.
		}
	}
	let leaveOpen = $state(false);
	let leaveTo: URL | undefined;
	let leaving = false;
	beforeNavigate((navigation) => {
		if (leaving || !dirty) return;
		navigation.cancel();
		if (navigation.type === 'leave') return;
		leaveTo = navigation.to?.url;
		leaveOpen = true;
	});
	async function leave() {
		leaveOpen = false;
		dirty = false;
		const target = leaveTo;
		leaveTo = undefined;
		if (!target) return;
		leaving = true;
		try {
			await goto(target.pathname + target.search + target.hash);
		} finally {
			leaving = false;
		}
	}

	function tabHref(tab: string) {
		return localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}${tab === 'overview' ? '' : `&tab=${tab}`}`);
	}
	onMount(() => {
		const addedID = page.url.searchParams.get('added');
		const added = addedID === null ? undefined : (data.connections.find((item) => item.id === addedID)?.name ?? '');
		const message = savedToast(hub, { created, added }, t);
		if (message && data.canManage) showToast(message);
		// Shown once: a reload of this page must not say it again.
		const clean = withoutSavedParams(page.url);
		try {
			if (clean) replaceState(clean, page.state);
		} catch {
			// Before the router starts (never after the company data loads): the flag stays.
		}
	});
	async function activate() {
		if (activating || !canEdit || dirty) return;
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
	subtitle={hub.description || t('ใช้โปรแกรมเหล่านี้ผ่าน AI ตามที่ตั้งไว้', 'These programs, through AI, as set here.')}
>
	{#snippet action()}
		{#if canEdit && hub.status !== 'active'}
			<button type="button" class="k-button" class:primary={activeTab === 'overview'} disabled={activating || dirty} title={dirty ? t('บันทึกหรือยกเลิกสิ่งที่แก้ไว้ก่อน', 'Save or cancel your changes first.') : undefined} onclick={activate}>{#if activating}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{:else}<Play size={16} aria-hidden="true" />{/if}{t('เปิดใช้งาน', 'Activate')}</button>
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

{#if changedElsewhere}<div class="hub-note" role="status"><Info size={18} aria-hidden="true" /><p>{archived
	? t('มีคนจัดเก็บพื้นที่นี้ระหว่างที่คุณแก้อยู่ สิ่งที่คุณพิมพ์ยังอยู่ให้คัดลอกไว้ กดยกเลิกเพื่อดูฉบับล่าสุด', 'Someone archived this workspace while you were editing. What you typed is still here to copy; cancel to see the newest version.')
	: t('มีคนแก้พื้นที่นี้ระหว่างที่คุณแก้อยู่ สิ่งที่คุณแก้ยังอยู่ กดบันทึกแล้วจะลงบนฉบับล่าสุด หรือยกเลิกเพื่อดูฉบับล่าสุด', 'Someone changed this workspace while you were editing. Your changes are still here: save them on top of the newest version, or cancel to see it.')}</p></div>{/if}

{#key `${editorHub.id}:${editorHub.version}`}
	{#if activeTab === 'programs'}<WorkspaceProgramsTab {data} hub={editorHub} canEdit={tabsEditable} onchanged={tabChanged} {ondirty} {addConnectionID} />
	{:else if activeTab === 'people'}<WorkspacePeopleTab {data} hub={editorHub} canEdit={tabsEditable} onchanged={tabChanged} {ondirty} />
	{:else if activeTab === 'settings'}<WorkspaceSettingsView {data} hub={editorHub} onchanged={tabChanged} {ondirty} />
	{:else}<WorkspaceOverviewTab {data} {hub} {created} {tabHref} />{/if}
{/key}

<ConfirmDialog
	bind:open={leaveOpen}
	title={t('ออกโดยไม่บันทึก?', 'Leave without saving?')}
	message={t('สิ่งที่แก้ไว้ในแท็บนี้จะหายไป', 'What you changed in this tab will be lost.')}
	confirmLabel={t('ออกโดยไม่บันทึก', 'Leave without saving')}
	cancelLabel={t('แก้ต่อ', 'Keep editing')}
	tone="danger"
	onconfirm={leave}
	oncancel={() => (leaveTo = undefined)}
/>

<style>
	/* orca-type-remap v1 */
	.hub-alert,
	.hub-archived,
	.hub-note {
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
	.hub-archived > :global(svg),
	.hub-note > :global(svg) {
		color: var(--orca-text-2);
	}
	.hub-alert p,
	.hub-archived p,
	.hub-note p {
		flex: 1 1 280px;
		margin: 0;
		font-size: 13.5px;
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
		font-size: 14px;
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
		font-size: 11.5px;
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
		font-size: 13.5px;
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
