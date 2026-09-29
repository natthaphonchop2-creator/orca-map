<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import type { StepState } from '$lib/orca/home-setup';
	import StatusPill from '../ui/StatusPill.svelte';

	// One row of Home's checklist. The next step opens as a raised card with its
	// own content (`body`); done and later steps are one line with an action.
	let {
		n,
		state,
		title,
		detail = '',
		minutes = 0,
		open = false,
		lead,
		body,
		action
	}: {
		n: number;
		state: StepState;
		title: string;
		detail?: string;
		minutes?: number;
		/** Show `body` although this is not the next step (merged steps). */
		open?: boolean;
		/** Before the detail line, e.g. a program's logo. */
		lead?: Snippet;
		/** The open step's own content. */
		body?: Snippet;
		/** The right-hand action of a done or later step. */
		action?: Snippet;
	} = $props();
</script>

<li class="home-step {state}" aria-current={state === 'current' ? 'step' : undefined}>
	<span class="home-step-num" aria-hidden="true">{#if state === 'done'}<Check size={15} strokeWidth={2.6} />{:else}{n}{/if}</span>
	<div class="home-step-main">
		<div class="home-step-title">
			<h3><span class="home-step-sr">{t(`ขั้นตอนที่ ${n}: `, `Step ${n}: `)}</span>{title}</h3>
			{#if state === 'done'}<StatusPill label={t('เสร็จแล้ว', 'Done')} tone="ok" />
			{:else if state === 'current'}<StatusPill label={t('ขั้นตอนถัดไป', 'Next step')} tone="citron" />{/if}
			{#if state !== 'done' && minutes > 0}<span class="home-step-time">{t(`ประมาณ ${minutes} นาที`, `About ${minutes} min`)}</span>{/if}
		</div>
		{#if detail || lead}<p class="home-step-detail">{@render lead?.()}<span>{detail}</span></p>{/if}
		{#if (state === 'current' || open) && body}{@render body()}{/if}
	</div>
	{#if state !== 'current' && !open && action}<div class="home-step-action">{@render action()}</div>{/if}
</li>

<style>
	.home-step {
		display: flex;
		align-items: flex-start;
		gap: 18px;
		padding: 18px 32px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.home-step.current {
		margin: 4px 12px;
		padding: 24px 20px 22px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 14px;
		background: var(--orca-surface);
		box-shadow: var(--orca-popover-shadow);
	}
	.home-step.current + :global(.home-step) {
		border-top: 0;
	}
	.home-step-num {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
		background: var(--orca-surface);
		color: var(--orca-subtle);
		font-size: 13px;
		font-weight: 700;
	}
	.home-step.done .home-step-num {
		border-color: var(--orca-ok);
		background: var(--orca-ok);
		color: var(--orca-on-ink);
	}
	.home-step.current .home-step-num {
		margin-top: 2px;
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
	}
	.home-step-main {
		flex: 1;
		min-width: 0;
	}
	.home-step-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
	}
	.home-step .home-step-title h3 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 16px;
		font-weight: 600;
		line-height: 1.45;
	}
	.home-step.current .home-step-title h3 {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.005em;
	}
	.home-step.done .home-step-title h3 {
		color: var(--orca-text-2);
	}
	.home-step.todo .home-step-title h3,
	.home-step.todo .home-step-detail {
		color: var(--orca-subtle);
	}
	.home-step-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.home-step-time {
		color: var(--orca-subtle);
		font-size: 12px;
		font-weight: 500;
	}
	.home-step-detail {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.55;
	}
	.home-step-detail > span {
		flex: 1 1 200px;
		min-width: 0;
	}
	.home-step.current .home-step-detail {
		margin-top: 4px;
		font-size: 15px;
	}
	.home-step-action {
		display: flex;
		flex: none;
		align-self: center;
		justify-content: flex-end;
		gap: 8px;
		min-width: 152px;
		margin-left: auto;
	}
	.home-step-action :global(.k-button) {
		min-width: 152px;
		min-height: 42px;
		font-weight: 600;
	}
	/* A later step's action: shown, not yet usable (the mockup's "off" button). */
	.home-step-action :global(.k-button.home-off) {
		border-color: var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-subtle) !important;
		opacity: 0.75;
	}
	@media (max-width: 720px) {
		.home-step {
			flex-wrap: wrap;
			gap: 12px 14px;
			padding: 16px;
		}
		.home-step.current {
			margin: 4px 8px;
			padding: 18px 14px;
		}
		.home-step.current .home-step-title h3 {
			font-size: 18px;
		}
		.home-step-action {
			flex: 1 1 calc(100% - 42px);
			justify-content: stretch;
			min-width: 0;
			margin-left: 42px;
		}
		.home-step-action :global(.k-button) {
			flex: 1;
			min-width: 0;
		}
		/* On a phone a later step's unusable button is only noise: the step's own line says what comes. */
		.home-step-action:has(> :global(.home-off)) {
			display: none;
		}
	}
</style>
