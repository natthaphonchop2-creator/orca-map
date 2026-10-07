<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';
	import StatusPill, { type StatusTone } from './StatusPill.svelte';
	import { pageHeaderClaimed } from './page-header-context';

	// The page contract: an H1 of at most 4 words, one line under it, an
	// optional status pill and at most one primary action.
	let {
		title,
		subtitle = '',
		status,
		back,
		eyebrow,
		action,
		id = 'orca-page-title',
		frame = false
	}: {
		title: string;
		subtitle?: string;
		status?: { label: string; tone?: StatusTone };
		back?: { href: string; label: string };
		eyebrow?: Snippet;
		action?: Snippet;
		id?: string;
		/** The frame's own header (ตั้งค่า, ประวัติ, AI ของฉัน): always the page's H1. */
		frame?: boolean;
	} = $props();
	// Inside a frame that already shows the page's H1 (ตั้งค่า, ประวัติ, AI ของฉัน):
	// only the action and status stay, on a row of their own.
	const claimed = pageHeaderClaimed();
	const nested = $derived(!frame && claimed);
</script>

{#if nested}
	<!-- The frame's H1 names the page; this part keeps its name for screen readers (and any aria-labelledby). -->
	<h2 {id} class="orca-page-hidden">{title}</h2>
	{#if action || status}<div class="orca-page-subhead">
			{#if status}<StatusPill label={status.label} tone={status.tone ?? 'neutral'} dot />{/if}
			{#if action}<div class="orca-page-action">{@render action()}</div>{/if}
		</div>{/if}
{:else}
<header class="orca-page-header">
	{#if back}<a class="orca-page-back" href={back.href}><ChevronLeft size={16} aria-hidden="true" />{back.label}</a>{/if}
	{#if eyebrow}<div class="orca-page-eyebrow">{@render eyebrow()}</div>{/if}
	<div class="orca-page-row">
		<div class="orca-page-heading">
			<div class="orca-page-title">
				<h1 {id}>{title}</h1>
				{#if status}<StatusPill label={status.label} tone={status.tone ?? 'neutral'} dot />{/if}
			</div>
			{#if subtitle}<p class="orca-page-subtitle">{subtitle}</p>{/if}
		</div>
		{#if action}<div class="orca-page-action">{@render action()}</div>{/if}
	</div>
</header>
{/if}

<style>
	/* orca-type-remap v1 */
	.orca-page-header {
		margin: 0 0 24px;
	}
	.orca-page-back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		/* A 28px tap target, the same place on the page (WCAG 2.5.8). */
		min-height: 28px;
		margin: -3px 0 7px;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		text-decoration: none;
	}
	.orca-page-back:hover {
		color: var(--orca-ink);
	}
	.orca-page-eyebrow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.orca-page-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px 24px;
	}
	.orca-page-heading {
		flex: 1 1 320px;
		min-width: 0;
	}
	.orca-page-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
	}
	/* Under .orca-page-header so it outranks the shell's `.orca-workspace.orca-app h1` (24px). */
	.orca-page-header .orca-page-title h1 {
		margin: 0;
		font-size: 24px;
		line-height: 1.3;
		font-weight: 700;
	}
	.orca-page-subtitle {
		max-width: 680px;
		margin: 6px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.orca-page-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.orca-page-subhead {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 8px 12px;
		margin: 0 0 16px;
	}
	.orca-page-action {
		display: flex;
		flex: none;
		align-items: center;
		gap: 8px;
	}
	@media (max-width: 720px) {
		.orca-page-header .orca-page-title h1 {
			font-size: 20px;
		}
		.orca-page-action {
			width: 100%;
		}
	}
</style>
