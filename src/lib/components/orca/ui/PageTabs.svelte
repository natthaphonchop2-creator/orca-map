<script lang="ts">
	import { localeHref } from '$lib/orca/locale.svelte';

	// A page's tab bar under its header (W0: ตั้งค่า, ประวัติ, AI ของฉัน). Each tab
	// is a link to its own address, so a reload or a copied link opens it. On a
	// phone the bar scrolls sideways; the page never does.
	let {
		tabs,
		current,
		label
	}: {
		tabs: { id: string; label: string; href: string; count?: number }[];
		current: string;
		label: string;
	} = $props();
</script>

<nav class="orca-page-tabs" aria-label={label}>
	{#each tabs as tab (tab.id)}
		<a
			href={localeHref(tab.href)}
			class:chosen={current === tab.id}
			aria-current={current === tab.id ? 'page' : undefined}
			aria-label={tab.count ? `${tab.label} ${tab.count}` : undefined}
			>{tab.label}{#if tab.count}<span class="orca-page-tab-count" aria-hidden="true">{tab.count > 99 ? '99+' : tab.count}</span>{/if}</a
		>
	{/each}
</nav>

<style>
	.orca-page-tabs {
		display: flex;
		gap: 2px;
		margin: 0 0 24px;
		overflow-x: auto;
		box-shadow: inset 0 -1px 0 var(--orca-line);
		scrollbar-width: none;
	}
	.orca-page-tabs::-webkit-scrollbar {
		display: none;
	}
	.orca-page-tabs a {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 10px;
		border-bottom: 2px solid transparent;
		color: var(--orca-muted);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.orca-page-tabs a:hover {
		color: var(--orca-ink);
		text-decoration: none;
	}
	.orca-page-tabs a.chosen {
		border-bottom-color: var(--orca-ink);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.orca-page-tab-count {
		color: var(--orca-subtle);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
</style>
