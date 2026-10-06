<script lang="ts">
	// An on/off switch with its label and, under it, what it does. The switch
	// itself says nothing new: the page saves the change and says so.
	let {
		checked,
		label,
		description = '',
		disabled = false,
		onchange
	}: {
		checked: boolean;
		label: string;
		description?: string;
		disabled?: boolean;
		onchange: (checked: boolean) => void;
	} = $props();
	const uid = $props.id();
</script>

<div class="orca-switch-row" class:disabled>
	<span class="orca-switch-text">
		<span class="orca-switch-label" id={`orca-switch-${uid}`}>{label}</span>
		{#if description}<small id={`orca-switch-note-${uid}`}>{description}</small>{/if}
	</span>
	<button
		type="button"
		class="orca-switch"
		class:on={checked}
		role="switch"
		aria-checked={checked}
		aria-labelledby={`orca-switch-${uid}`}
		aria-describedby={description ? `orca-switch-note-${uid}` : undefined}
		{disabled}
		onclick={() => onchange(!checked)}><span class="orca-switch-thumb" aria-hidden="true"></span></button
	>
</div>

<style>
	/* orca-type-remap v1 */
	.orca-switch-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		min-width: 0;
	}
	.orca-switch-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.orca-switch-label {
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.orca-switch-text small {
		color: var(--orca-muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.orca-switch {
		position: relative;
		flex: none;
		width: 40px;
		height: 24px;
		margin-top: 1px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: var(--orca-line-strong);
		cursor: pointer;
		transition: background-color 0.15s var(--orca-ease);
	}
	.orca-switch.on {
		background: var(--orca-control);
	}
	.orca-switch-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--orca-surface);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 20%, transparent);
		transition: left 0.15s var(--orca-ease);
	}
	.orca-switch.on .orca-switch-thumb {
		left: 19px;
	}
	/* Dark: the off knob stays visible on the faint track. */
	:global(:root[data-orca-theme='dark']) .orca-switch:not(.on) .orca-switch-thumb {
		background: var(--orca-muted);
	}
	.orca-switch:focus-visible {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.orca-switch:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.disabled .orca-switch-label {
		color: var(--orca-muted);
	}
	@media (prefers-reduced-motion: reduce) {
		.orca-switch,
		.orca-switch-thumb {
			transition: none;
		}
	}
</style>
