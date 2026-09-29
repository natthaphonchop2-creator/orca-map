<script lang="ts">
	import { Check, ChevronDown } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { statusLabels, type OrcaHub } from '$lib/services/orca';

	// "พื้นที่ทำงาน: ฝ่ายขาย ▾": which workspace's library is open, for someone
	// in more than one. Esc or a click outside closes the list.
	let {
		hub,
		choices,
		disabled = false,
		onchoose
	}: { hub: OrcaHub; choices: OrcaHub[]; disabled?: boolean; onchoose: (id: string) => void } = $props();
	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();
	const uid = $props.id();
	const menuID = `kn-scope-${uid}`;
	const initial = (name: string) => [...name.trim()].find((c) => /[\p{L}\p{N}]/u.test(c))?.toLocaleUpperCase() ?? '?';
	function choose(id: string) {
		open = false;
		if (id !== hub.id) onchoose(id);
	}
</script>

<svelte:window
	onclick={(event) => {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}}
	onkeydown={(event) => {
		if (open && event.key === 'Escape') {
			open = false;
			root?.querySelector<HTMLButtonElement>('.kn-scope')?.focus();
		}
	}}
/>

<div
	class="kn-scope-wrap"
	bind:this={root}
	onfocusout={(event) => {
		// Tabbing out of the list closes it, as Esc and a click outside do.
		if (open && !root?.contains(event.relatedTarget as Node | null)) open = false;
	}}
>
	<button
		type="button"
		class="kn-scope"
		aria-expanded={open}
		aria-controls={menuID}
		{disabled}
		onclick={() => (open = !open)}
	>
		<span class="ws" aria-hidden="true">{initial(hub.name)}</span>{t('พื้นที่ทำงาน:', 'Workspace:')}
		<b>{hub.name}</b><ChevronDown size={14} aria-hidden="true" />
	</button>
	{#if open}
		<ul class="kn-scope-menu" id={menuID}>
			{#each choices as choice (choice.id)}
				<li>
					<button type="button" aria-current={choice.id === hub.id ? 'true' : undefined} onclick={() => choose(choice.id)}>
						<span class="ws" aria-hidden="true">{initial(choice.name)}</span>
						<span class="name">{choice.name}{#if choice.status !== 'active'}<small>{statusLabels[choice.status]}</small>{/if}</span>
						{#if choice.id === hub.id}<Check size={15} aria-hidden="true" />{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.kn-scope-wrap {
		position: relative;
		flex: none;
	}
	.kn-scope {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 5px 11px 5px 5px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 14px;
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
		cursor: pointer;
		transition: border-color 0.15s var(--orca-ease);
	}
	.kn-scope:hover:not(:disabled) {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.kn-scope b {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.kn-scope :global(svg) {
		color: var(--orca-subtle);
	}
	.ws {
		display: grid;
		flex: none;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--orca-ink);
		color: var(--orca-on-ink);
		font-size: 11px;
		font-weight: 700;
	}
	.kn-scope-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 30;
		min-width: 260px;
		max-width: min(360px, calc(100vw - 32px));
		margin: 0;
		padding: 6px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-popover);
		box-shadow: var(--orca-popover-shadow);
		list-style: none;
	}
	.kn-scope-menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: var(--orca-radius);
		background: transparent;
		color: var(--orca-ink);
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}
	.kn-scope-menu button:hover {
		background: var(--orca-hover);
	}
	.kn-scope-menu .ws {
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.kn-scope-menu [aria-current='true'] {
		font-weight: 600;
	}
	.kn-scope-menu [aria-current='true'] .ws {
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.name {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.name small {
		color: var(--orca-muted);
		font-size: 12px;
		font-weight: 400;
	}
</style>
