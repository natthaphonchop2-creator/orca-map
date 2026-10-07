<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { JumpTarget } from '$lib/orca/workspace-nav';
	import Modal from '../ui/Modal.svelte';

	// ไปที่… ⌘K (W0): find a page, a program or a workspace by name and go there.
	// Only places the viewer can already open are listed (the shell builds them).
	let { open = $bindable(false), targets }: { open?: boolean; targets: JumpTarget[] } = $props();
	let query = $state('');
	let list: HTMLUListElement | undefined = $state();
	const shown = $derived.by(() => {
		const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
		const found = targets.filter((target) => words.every((word) => `${target.label} ${target.group}`.toLocaleLowerCase().includes(word)));
		return found.slice(0, 40);
	});
	$effect(() => {
		if (!open) query = '';
	});
	function go(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			list?.querySelector<HTMLAnchorElement>('a')?.click();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			list?.querySelector<HTMLAnchorElement>('a')?.focus();
		}
	}
	function move(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const links = [...(list?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
		const index = links.indexOf(document.activeElement as HTMLAnchorElement);
		if (index === -1) return;
		event.preventDefault();
		const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
		next?.focus();
	}
</script>

<Modal bind:open title={term('jumpTo', t)}>
	<label class="jump-search">
		<Search size={16} aria-hidden="true" />
		<span class="sr-only">{t('ค้นหาหน้า โปรแกรม หรือพื้นที่ทำงาน', 'Search pages, programs or workspaces')}</span>
		<input type="search" bind:value={query} onkeydown={go} placeholder={t('ค้นหาหน้า โปรแกรม หรือพื้นที่ทำงาน', 'Search pages, programs or workspaces')} autocomplete="off" />
	</label>
	{#if shown.length}
		<ul class="jump-list" bind:this={list} onkeydown={move} role="presentation">
			{#each shown as target (target.id)}
				<li><a href={localeHref(target.href)} onclick={() => (open = false)}><span>{target.label}</span><small>{target.group}</small></a></li>
			{/each}
		</ul>
	{:else}
		<p class="jump-empty">{t('ไม่พบ', 'Nothing found')}</p>
	{/if}
</Modal>

<style>
	/* orca-type-remap v1 */
	.jump-search {
		position: relative;
		display: block;
		color: var(--orca-subtle);
	}
	.jump-search :global(svg) {
		position: absolute;
		top: 50%;
		left: 11px;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.jump-search input {
		width: 100%;
		height: 40px;
		padding: 0 12px 0 34px;
		border: 1px solid var(--orca-field-line, var(--orca-line-strong));
		border-radius: var(--orca-radius);
		background: var(--orca-field, var(--orca-surface));
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.jump-list {
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}
	.jump-list a {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 10px;
		border-radius: var(--orca-radius);
		color: var(--orca-ink);
		font-size: 14px;
		text-decoration: none;
	}
	.jump-list a:hover,
	.jump-list a:focus-visible {
		background: var(--orca-hover);
		text-decoration: none;
	}
	.jump-list small {
		flex: none;
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
	.jump-empty {
		margin: 16px 0 4px;
		color: var(--orca-muted);
		font-size: 14px;
	}
</style>
