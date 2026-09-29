<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from '@lucide/svelte';

	// One option of a key choice (never a native <select>): a radio in a
	// large tile, with an optional mark (logo or icon) and one line of detail.
	let {
		name,
		value,
		selected = $bindable(''),
		title,
		description = '',
		badge = '',
		disabled = false,
		mark,
		onselect
	}: {
		name: string;
		value: string;
		selected?: string;
		title: string;
		description?: string;
		badge?: string;
		disabled?: boolean;
		mark?: Snippet;
		onselect?: (value: string) => void;
	} = $props();
	const checked = $derived(selected === value);
</script>

<label class="orca-choice" class:checked class:disabled>
	<input
		class="orca-choice-input"
		type="radio"
		{name}
		{value}
		{checked}
		{disabled}
		onchange={() => {
			selected = value;
			onselect?.(value);
		}}
	/>
	{#if mark}<span class="orca-choice-mark">{@render mark()}</span>{/if}
	<span class="orca-choice-copy">
		<span class="orca-choice-title">{title}{#if badge}<span class="orca-choice-badge">{badge}</span>{/if}</span>
		{#if description}<span class="orca-choice-description">{description}</span>{/if}
	</span>
	<span class="orca-choice-radio" aria-hidden="true">{#if checked}<Check size={13} strokeWidth={3} />{/if}</span>
</label>

<style>
	.orca-choice {
		position: relative;
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		cursor: pointer;
		transition: border-color 0.15s var(--orca-ease), box-shadow 0.15s var(--orca-ease);
	}
	.orca-choice:hover:not(.disabled) {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.orca-choice.checked {
		border-color: var(--orca-chosen);
		box-shadow: 0 0 0 1px var(--orca-chosen);
	}
	.orca-choice.disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.orca-choice:has(.orca-choice-input:focus-visible) {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.orca-choice-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.orca-choice-mark {
		display: grid;
		flex: none;
		place-items: center;
	}
	.orca-choice-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.orca-choice-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 16px;
		font-weight: 600;
		line-height: 1.4;
	}
	.orca-choice-badge {
		padding: 1px 8px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 11.5px;
		font-weight: 600;
	}
	.orca-choice-description {
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.orca-choice-radio {
		display: grid;
		flex: none;
		place-items: center;
		align-self: flex-start;
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
		color: var(--orca-on-ink);
	}
	.orca-choice.checked .orca-choice-radio {
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
	}
</style>
