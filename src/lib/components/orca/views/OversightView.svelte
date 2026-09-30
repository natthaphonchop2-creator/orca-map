<script lang="ts">
	import { page } from '$app/state';
	import { appsFilter } from '$lib/orca/connected-ai-apps';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import { untrack } from 'svelte';
	import Approvals from '../Approvals.svelte';
	import Audit from '../Audit.svelte';
	import ConnectedAIApps from '../ConnectedAIApps.svelte';

	// ตรวจสอบ: รออนุมัติ · ประวัติการใช้งาน · ประวัติการตั้งค่า · แอป AI ที่เชื่อมอยู่.
	// Each tab keeps its view id; the two histories keep their workspace filter.
	// Members see only their own requests or activity, without the tab bar.
	let {
		data,
		activeData,
		view,
		hubID = '',
		pendingApprovals = 0,
		onapprovalschanged
	}: {
		data: OrcaBootstrap;
		/** The company's data without archived and removed records. */
		activeData: OrcaBootstrap;
		view: 'approvals' | 'executions' | 'audit' | 'secrets';
		hubID?: string;
		pendingApprovals?: number;
		onapprovalschanged?: () => void;
	} = $props();
	// The workspace chosen in a history's own filter goes with the tab links, so
	// switching between the two histories keeps it (Codex release review 64).
	let chosenHub = $state(untrack(() => hubID));
	$effect(() => {
		chosenHub = hubID;
	});
	const hub = $derived(chosenHub ? `&hub=${encodeURIComponent(chosenHub)}` : '');
	// แอป AI ที่เชื่อมอยู่ keeps its chips in the address: &filter=stale|noexpiry&holder=<id>.
	const appsFilterValue = $derived(appsFilter(page.url.searchParams.get('filter')));
	const appsHolder = $derived(page.url.searchParams.get('holder') ?? '');
	const tabs = $derived([
		{ id: 'approvals', label: term('waitingApproval', t), href: '/app?view=approvals', count: pendingApprovals },
		{ id: 'executions', label: term('usageHistory', t), href: `/app?view=executions${hub}` },
		{ id: 'audit', label: term('settingsHistory', t), href: `/app?view=audit${hub}` },
		{ id: 'secrets', label: term('connectedAIApps', t), href: '/app?view=secrets' }
	]);
	// On a phone the tab bar scrolls sideways: keep the open tab in view once
	// the fonts have set its width. Only the bar scrolls, never the page.
	let tabBar: HTMLElement | undefined = $state();
	$effect(() => {
		void view;
		const bar = tabBar;
		if (!bar || bar.scrollWidth <= bar.clientWidth) return;
		const reveal = () => {
			const chosen = bar.querySelector<HTMLElement>('a.chosen');
			if (!chosen) return;
			const left = chosen.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft;
			if (left < bar.scrollLeft || left + chosen.offsetWidth > bar.scrollLeft + bar.clientWidth)
				bar.scrollLeft = Math.min(left - 16, bar.scrollWidth - bar.clientWidth);
		};
		void (document.fonts?.ready ?? Promise.resolve()).then(reveal);
	});
</script>

{#if data.canManage}
	<nav class="oversight-tabs" aria-label={term('oversight', t)} bind:this={tabBar}>
		{#each tabs as tab (tab.id)}
			<a
				href={localeHref(tab.href)}
				class:chosen={view === tab.id}
				aria-current={view === tab.id ? 'page' : undefined}
				aria-label={tab.count ? t(`${tab.label} ${tab.count} รายการ`, `${tab.label}, ${tab.count}`) : undefined}
				>{tab.label}{#if tab.count}<span class="oversight-count" aria-hidden="true">{tab.count > 99 ? '99+' : tab.count}</span>{/if}</a
			>
		{/each}
	</nav>
{/if}
{#if view === 'approvals'}<Approvals {data} onchanged={onapprovalschanged} />
{:else if view === 'executions'}<Audit {data} {hubID} mode="executions" showModeTabs={!data.canManage} onhubchange={(id) => (chosenHub = id)} />
{:else if view === 'audit'}<Audit {data} {hubID} mode="administration" showModeTabs={!data.canManage} onhubchange={(id) => (chosenHub = id)} />
{:else if view === 'secrets'}<ConnectedAIApps data={activeData} filter={appsFilterValue} holder={appsHolder} />
{/if}

<style>
	.oversight-tabs {
		display: flex;
		gap: 28px;
		margin: 0 0 28px;
		overflow-x: auto;
		box-shadow: inset 0 -1px 0 var(--orca-line);
		scrollbar-width: none;
	}
	.oversight-tabs a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 46px;
		border-bottom: 2px solid transparent;
		color: var(--orca-muted);
		font-size: 15px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.oversight-tabs a:hover {
		color: var(--orca-ink);
	}
	.oversight-tabs a.chosen {
		border-bottom-color: var(--orca-tab-indicator, var(--orca-ink));
		color: var(--orca-ink);
		font-weight: 600;
	}
	.oversight-count {
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--orca-ink);
		color: var(--orca-on-ink);
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 720px) {
		.oversight-tabs {
			gap: 20px;
		}
	}
</style>
