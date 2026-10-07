<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';

	// One part of AI ของฉัน's connect guide: a quiet marker (a check once done;
	// no numbers, W0), a title with one line under it, and its content beside.
	// `number` keeps the order for the page's own logic only.
	let {
		number,
		state,
		title,
		id,
		lead,
		children
	}: {
		number: number;
		state: 'done' | 'current' | 'upcoming';
		title: string;
		id: string;
		lead?: Snippet;
		children: Snippet;
	} = $props();
</script>

<li class="ca-step {state}" aria-labelledby={id} aria-current={state === 'current' ? 'step' : undefined}>
	<div class="ca-marker" aria-hidden="true">
		<span class="ca-number">{#if state === 'done'}<Check size={16} strokeWidth={2.6} />{/if}</span>
	</div>
	<div class="ca-label">
		<h2 {id}>{title}{#if state === 'done'}<span class="ca-hidden">{t(' (เสร็จแล้ว)', ' (done)')}</span>{/if}</h2>
		{#if lead}<p>{@render lead()}</p>{/if}
	</div>
	<div class="ca-body">{@render children()}</div>
</li>

<style>
	/* orca-type-remap v1 */
	.ca-step {
		position: relative;
		display: grid;
		grid-template-columns: 34px 262px minmax(0, 1fr);
		column-gap: 22px;
		padding-bottom: 40px;
	}
	/* The line from one number down to the next. */
	.ca-step::before {
		content: '';
		position: absolute;
		top: 42px;
		bottom: 6px;
		left: 16px;
		width: 2px;
		border-radius: 2px;
		background: var(--orca-line);
	}
	.ca-step:last-child {
		padding-bottom: 0;
	}
	.ca-step:last-child::before {
		display: none;
	}
	.ca-step.done::before {
		background: var(--orca-ok-line);
	}
	.ca-number {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 700;
		line-height: 1;
	}
	.done .ca-number {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.current .ca-number {
		border-color: var(--orca-ink);
		border-width: 2px;
	}
	.ca-label {
		min-width: 0;
		padding-top: 4px;
	}
	.ca-label h2 {
		margin: 0 0 4px;
		color: var(--orca-ink);
		font-size: 16px;
		font-weight: 650;
		line-height: 1.4;
		letter-spacing: -0.005em;
	}
	.ca-label p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.ca-label p :global(b) {
		color: var(--orca-text-2);
		font-weight: 600;
	}
	.ca-body {
		min-width: 0;
	}
	.ca-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* A narrower page (the "ca" container is the view): the title above its content. */
	@container ca (max-width: 900px) {
		.ca-step {
			grid-template-columns: 34px minmax(0, 1fr);
			column-gap: 18px;
		}
		.ca-body {
			grid-column: 2;
			margin-top: 14px;
		}
	}
	/* Phones: the content takes the full width, so the line stops at the title. */
	@container ca (max-width: 560px) {
		.ca-step {
			column-gap: 12px;
			padding-bottom: 32px;
		}
		.ca-step::before {
			display: none;
		}
		.ca-number {
			width: 30px;
			height: 30px;
			font-size: 12.5px;
		}
		.ca-label {
			padding-top: 2px;
		}
		.ca-body {
			grid-column: 1 / -1;
		}
	}
</style>
