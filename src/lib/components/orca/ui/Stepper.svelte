<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { stepLabelClass, stepperFit, stepperFixedWidth, stepStates, type StepInput } from './stepper';

	// Steps held in the address: `hrefFor(id)` builds each step's link (usually
	// stepHref(page.url, id)). Done steps and the current one open; upcoming
	// steps are plain text.
	// Labels never wrap. While the stepper is wide enough for every label on one
	// line (stepperFit: a container query on its own width) they all show and the
	// connectors take up the rest; below that only the current step keeps its
	// label, and the other labels fold away but stay readable to screen readers
	// (the circle's tooltip names them too).
	let {
		steps,
		current,
		done,
		hrefFor,
		label
	}: {
		steps: StepInput[];
		current: string;
		done?: readonly string[];
		hrefFor?: (id: string) => string;
		label?: string;
	} = $props();
	const items = $derived(stepStates(steps, current, done));
	const fit = $derived(stepperFit(steps));
	// The folded row's sizes (stepperCompactWidth, computed in the CSS on the stepper's own width).
	const fixed = $derived(stepperFixedWidth(steps.length));
	const gaps = $derived(Math.max(0, steps.length - 1));
</script>

<nav class="orca-stepper" aria-label={label ?? t('ขั้นตอน', 'Steps')}>
	<ol class="orca-stepper-list {fit}" style:--orca-stepper-fixed="{fixed}px" style:--orca-stepper-gaps={gaps}>
		{#each items as step, index (step.id)}
			<li class="orca-step {step.state}">
				{#if hrefFor && step.state !== 'upcoming'}<a href={hrefFor(step.id)} aria-current={step.state === 'current' ? 'step' : undefined}
						><span class="orca-step-number" aria-hidden="true" title={step.label}>{#if step.state === 'done'}<Check size={14} strokeWidth={2.6} />{:else}{step.number}{/if}</span><span class="orca-step-label {stepLabelClass(step.state)}">{step.label}</span>{#if step.state === 'done'}<span class="orca-visually-hidden">{t(' (เสร็จแล้ว)', ' (done)')}</span>{/if}</a
					>{:else}<span class="orca-step-body" aria-current={step.state === 'current' ? 'step' : undefined}
						><span class="orca-step-number" aria-hidden="true" title={step.label}>{#if step.state === 'done'}<Check size={14} strokeWidth={2.6} />{:else}{step.number}{/if}</span><span class="orca-step-label {stepLabelClass(step.state)}">{step.label}</span>{#if step.state === 'done'}<span class="orca-visually-hidden">{t(' (เสร็จแล้ว)', ' (done)')}</span>{/if}</span
					>{/if}
				{#if index < items.length - 1}<span class="orca-step-bar" aria-hidden="true"></span>{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	/* orca-type-remap v1 */
	/* The stepper's own width decides (see stepper.ts), wherever it is placed. */
	.orca-stepper {
		container: orca-stepper / inline-size;
		min-width: 0;
	}
	/* One row: each step's circle and label (max-content, never wrapped), then a
	   connector that stretches from its shortest up to 96px. --orca-stepper-folded
	   (0 or 1) is set by the container queries below. */
	.orca-stepper-list {
		--orca-stepper-folded: 0;
		/* A folded connector: 28px, or shorter (down to 12px) where 28px ones would
		   leave the current label under 64px, e.g. six steps on a 320px phone. */
		--orca-stepper-link: clamp(12px, (100cqi - var(--orca-stepper-fixed) - 64px) / max(1, var(--orca-stepper-gaps)), 28px);
		/* The folded row without the current label: circles, connectors, one gap. */
		--orca-stepper-compact: calc(var(--orca-stepper-fixed) + var(--orca-stepper-gaps) * var(--orca-stepper-link));
		display: grid;
		grid-auto-columns: max-content minmax(calc(36px + (var(--orca-stepper-link) - 36px) * var(--orca-stepper-folded)), 96px);
		grid-auto-flow: column;
		align-items: center;
		justify-content: start;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13.5px;
		line-height: 1.5;
	}
	.orca-step {
		display: flex;
		grid-column: span 2;
		align-items: center;
		min-width: 0;
		color: var(--orca-muted);
	}
	.orca-step:last-child {
		grid-column: span 1;
	}
	/* The connector sits in its own column of the row. */
	@supports (grid-template-columns: subgrid) {
		.orca-step {
			display: grid;
			grid-template-columns: subgrid;
		}
	}
	/* Never squeezed under its circle (without subgrid the connector beside it
	   is what gives way). */
	.orca-step a,
	.orca-step-body {
		display: inline-flex;
		flex: none;
		align-items: center;
		min-width: 0;
		border-radius: 999px;
		color: inherit;
		text-decoration: none;
	}
	.orca-step a:hover .orca-step-label {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.orca-step-number {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
		font-size: 12.5px;
		font-weight: 700;
		line-height: 1;
	}
	.orca-step.done .orca-step-number {
		border-color: var(--orca-ok);
		background: var(--orca-ok);
		color: var(--orca-on-ink);
	}
	.orca-step.current {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.orca-step.current .orca-step-number {
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
	}
	/* One line always. A folded label is clipped to nothing but stays in the page;
	   the current one keeps its place and, on the narrowest screens, ends in "…"
	   rather than pushing the row wider than the stepper. */
	.orca-step-label {
		overflow: clip visible;
		min-width: 0;
		max-width: max(0px, calc(100cqi - var(--orca-stepper-compact) - 100cqi * var(--orca-stepper-folded)));
		margin-inline-start: calc(8px * (1 - var(--orca-stepper-folded)));
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.orca-step-label.keep {
		max-width: max(0px, calc(100cqi - var(--orca-stepper-compact)));
		margin-inline-start: 8px;
	}
	.orca-step-bar {
		flex: 1 1 16px;
		min-width: calc(12px - 8px * var(--orca-stepper-folded));
		height: 1.5px;
		/* 10px clear of the circles and labels; folded, 2/7 of the connector (8px of 28px). */
		margin-inline: calc(10px + (var(--orca-stepper-link) * 2 / 7 - 10px) * var(--orca-stepper-folded));
		background: var(--orca-line-strong);
	}
	.orca-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* Narrower than every label on one line (stepperFit's class): fold the labels.
	   fit-none: the labels are wider than any stepper, so they are always folded. */
	.fit-none {
		--orca-stepper-folded: 1;
	}
	@container orca-stepper (width < 280px) { .fit-280 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 320px) { .fit-320 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 360px) { .fit-360 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 400px) { .fit-400 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 440px) { .fit-440 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 480px) { .fit-480 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 520px) { .fit-520 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 560px) { .fit-560 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 600px) { .fit-600 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 640px) { .fit-640 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 680px) { .fit-680 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 720px) { .fit-720 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 760px) { .fit-760 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 800px) { .fit-800 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 840px) { .fit-840 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 880px) { .fit-880 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 920px) { .fit-920 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 960px) { .fit-960 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 1000px) { .fit-1000 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 1040px) { .fit-1040 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 1080px) { .fit-1080 { --orca-stepper-folded: 1; } }
	@container orca-stepper (width < 1120px) { .fit-1120 { --orca-stepper-folded: 1; } }
</style>
