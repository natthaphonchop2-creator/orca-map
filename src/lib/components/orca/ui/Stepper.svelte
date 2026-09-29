<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { stepStates, type StepInput } from './stepper';

	// Steps held in the address: `hrefFor(id)` builds each step's link (usually
	// stepHref(page.url, id)). Done steps and the current one open; upcoming
	// steps are plain text.
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
</script>

<nav class="orca-stepper" aria-label={label ?? t('ขั้นตอน', 'Steps')}>
	<ol>
		{#each items as step, index (step.id)}
			<li class="orca-step {step.state}">
				{#if hrefFor && step.state !== 'upcoming'}<a href={hrefFor(step.id)} aria-current={step.state === 'current' ? 'step' : undefined}
						><span class="orca-step-number" aria-hidden="true">{#if step.state === 'done'}<Check size={14} strokeWidth={2.6} />{:else}{step.number}{/if}</span><span class="orca-step-label">{step.label}</span>{#if step.state === 'done'}<span class="orca-visually-hidden">{t(' (เสร็จแล้ว)', ' (done)')}</span>{/if}</a
					>{:else}<span class="orca-step-body" aria-current={step.state === 'current' ? 'step' : undefined}
						><span class="orca-step-number" aria-hidden="true">{#if step.state === 'done'}<Check size={14} strokeWidth={2.6} />{:else}{step.number}{/if}</span><span class="orca-step-label">{step.label}</span></span
					>{/if}
				{#if index < items.length - 1}<span class="orca-step-bar" aria-hidden="true"></span>{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.orca-stepper ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 14px;
	}
	.orca-step {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--orca-muted);
	}
	.orca-step a,
	.orca-step-body {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: inherit;
		text-decoration: none;
	}
	.orca-step a:hover .orca-step-label {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.orca-step-number {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
		font-size: 13px;
		font-weight: 700;
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
	.orca-step-bar {
		flex: 0 0 40px;
		height: 1.5px;
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
	@media (max-width: 720px) {
		.orca-step-bar {
			flex-basis: 16px;
		}
		.orca-step:not(.current) .orca-step-label {
			display: none;
		}
	}
</style>
