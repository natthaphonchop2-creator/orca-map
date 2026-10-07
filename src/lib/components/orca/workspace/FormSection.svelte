<script lang="ts">
	import type { Snippet } from 'svelte';

	// One row of the workspace form and its ตั้งค่า tab (mockup workspace-new):
	// the title and one line on the left, the control on the right. Stacks on a phone.
	let {
		title,
		note = '',
		hint = '',
		id,
		quiet = false,
		children
	}: {
		title: string;
		/** A quiet part of the title, e.g. "(ใส่ทีหลังได้)". */
		note?: string;
		hint?: string;
		/** The heading's id, for aria-labelledby. */
		id: string;
		/** The row has no effect right now (greyed title). */
		quiet?: boolean;
		children: Snippet;
	} = $props();
</script>

<section class="ws-section" aria-labelledby={id}>
	<div class="ws-section-label" class:quiet>
		<h2 {id}>{title}{#if note}{' '}<em>{note}</em>{/if}</h2>
		{#if hint}<p>{hint}</p>{/if}
	</div>
	<div class="ws-section-body">{@render children()}</div>
</section>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.ws-section {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 48px;
		padding: 28px 0;
		border-top: 1px solid var(--orca-line);
	}
	.ws-section:first-child {
		border-top: 0;
	}
	.ws-section-label h2 {
		margin: 0 0 4px;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 700;
		line-height: 1.4;
		letter-spacing: -0.005em;
	}
	.ws-section-label h2 em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 400;
	}
	.ws-section-label.quiet h2 {
		color: var(--orca-text-2);
	}
	.ws-section-label p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.ws-section-body {
		min-width: 0;
	}
	@media (max-width: 900px) {
		.ws-section {
			grid-template-columns: 200px minmax(0, 1fr);
			gap: 28px;
		}
	}
	@media (max-width: 720px) {
		.ws-section {
			grid-template-columns: minmax(0, 1fr);
			gap: 14px;
			padding: 22px 0;
		}
	}
</style>
