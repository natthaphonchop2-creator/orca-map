<script lang="ts">
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { allowedTools, programSummary, programSummaryLabel } from '$lib/orca/workspace-edit';
	import type { OrcaConnection } from '$lib/services/orca';
	import { Eye, Pencil } from '@lucide/svelte';

	// One program in a workspace (mockup workspace-new): a switch, what AI can
	// do in it ("อ่านอย่างเดียว · 6 อย่าง") and [ปรับ] to narrow that down.
	// Off, the card shows what the program allows, which is what turning it on gives.
	let {
		connection,
		on,
		toolNames = [],
		disabled = false,
		problem = '',
		ontoggle,
		onadjust
	}: {
		connection: OrcaConnection;
		on: boolean;
		/** What AI can do here while on. */
		toolNames?: string[];
		disabled?: boolean;
		/** Why the program can't be used as it is (shown instead of the state line). */
		problem?: string;
		ontoggle?: () => void;
		onadjust?: () => void;
	} = $props();
	const shown = $derived(on ? toolNames : allowedTools(connection).map((tool) => tool.name));
	const summary = $derived(programSummary(connection, shown));
</script>

<div class="program-card" class:on class:off={!on} class:problem={!!problem}>
	<button
		type="button"
		class="program-top"
		role="switch"
		aria-checked={on}
		aria-label={t(`ใช้ ${connection.name} ในพื้นที่นี้`, `Use ${connection.name} in this workspace`)}
		disabled={disabled || !ontoggle}
		onclick={() => ontoggle?.()}
	>
		<span class="program-logo" aria-hidden="true"><CatalogIcon name={connection.name} size={26} /></span>
		<span class="program-copy">
			<span class="program-name">{connection.name}</span>
			<span class="program-state" class:ok={on && !problem} class:bad={!!problem}>{problem || (on ? t('เปิดใช้ในพื้นที่นี้', 'On here') : t('ปิดอยู่', 'Off'))}</span>
		</span>
		{#if ontoggle}<span class="program-switch" class:on aria-hidden="true"></span>{/if}
	</button>
	<div class="program-bottom">
		{#if summary.access === 'read'}<Eye size={15} aria-hidden="true" />{:else}<Pencil size={15} aria-hidden="true" />{/if}
		<span class="program-summary">{programSummaryLabel(summary, t)}</span>
		{#if on && onadjust}<button type="button" class="program-adjust" {disabled} onclick={() => onadjust?.()} aria-label={t(`ปรับสิ่งที่ AI ทำได้ใน ${connection.name}`, `Adjust what AI can do in ${connection.name}`)}>{t('ปรับ', 'Adjust')}</button>{/if}
	</div>
</div>

<style>
	.program-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 124px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		transition: border-color 0.15s var(--orca-ease), box-shadow 0.15s var(--orca-ease);
	}
	.program-card.on {
		border-color: var(--orca-chosen);
		box-shadow: 0 0 0 1px var(--orca-chosen);
	}
	.program-card.off:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.program-top {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 16px 16px 14px;
		border: 0;
		border-radius: var(--orca-radius-lg) var(--orca-radius-lg) 0 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.program-top:disabled {
		cursor: default;
	}
	.program-logo {
		display: grid;
		flex: none;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 1px solid var(--orca-line);
		border-radius: 10px;
		background: var(--orca-logo-tile);
	}
	.off .program-logo {
		opacity: 0.55;
	}
	.program-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.program-name {
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 700;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.off .program-name {
		color: var(--orca-text-2);
	}
	.program-state {
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.4;
	}
	.program-state.ok {
		color: var(--orca-ok);
		font-weight: 500;
	}
	.program-state.bad {
		color: var(--orca-deny);
		font-weight: 500;
	}
	.program-switch {
		position: relative;
		flex: none;
		width: 36px;
		height: 20px;
		border-radius: 999px;
		background: var(--orca-line-strong);
		transition: background-color 0.15s var(--orca-ease);
	}
	.program-switch::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--orca-surface);
		transition: left 0.15s var(--orca-ease);
	}
	.program-switch.on {
		background: var(--orca-control);
	}
	.program-switch.on::after {
		left: 18px;
	}
	/* Dark: the off knob stays visible on the faint track. */
	:global(:root[data-orca-theme='dark']) .program-switch:not(.on)::after {
		background: var(--orca-muted);
	}
	.program-bottom {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: auto;
		padding: 11px 16px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-text-2);
		font-size: 13px;
		font-weight: 600;
		line-height: 1.4;
	}
	.program-bottom :global(svg) {
		flex: none;
		color: var(--orca-ok);
	}
	.off .program-bottom {
		color: var(--orca-subtle);
		font-weight: 500;
	}
	.off .program-bottom :global(svg) {
		color: var(--orca-subtle);
	}
	.program-summary {
		min-width: 0;
	}
	.program-adjust {
		flex: none;
		margin-left: auto;
		padding: 3px 10px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius-sm);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.program-adjust:hover:not(:disabled) {
		background: var(--orca-secondary);
	}
</style>
