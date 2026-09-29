<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	// An icon, one sentence and one button: nothing else.
	let {
		icon: Icon,
		message,
		actionLabel = '',
		href = '',
		onaction
	}: {
		icon?: LucideIcon;
		message: string;
		actionLabel?: string;
		href?: string;
		onaction?: () => void;
	} = $props();
</script>

<div class="orca-empty">
	{#if Icon}<span class="orca-empty-icon"><Icon size={22} aria-hidden="true" /></span>{/if}
	<p>{message}</p>
	{#if actionLabel && href}<a class="k-button primary" {href}>{actionLabel}</a>
	{:else if actionLabel && onaction}<button type="button" class="k-button primary" onclick={onaction}>{actionLabel}</button>{/if}
</div>

<style>
	.orca-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 40px 20px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		text-align: center;
	}
	.orca-empty-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.orca-empty p {
		max-width: 46ch;
		margin: 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 500;
		line-height: 1.6;
	}
</style>
