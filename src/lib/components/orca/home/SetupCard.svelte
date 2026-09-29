<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/orca/locale.svelte';
	import type { ChecklistStep } from '$lib/orca/home-setup';

	// The one setup panel on Home: its heading, "เสร็จ X จาก N" with a bar per
	// step, the steps (children) and the optional "ไม่บังคับ" part below.
	let {
		title,
		subtitle,
		steps,
		doneCount,
		remainingMinutes,
		intro,
		children,
		later
	}: {
		title: string;
		subtitle: string;
		steps: Pick<ChecklistStep, 'state'>[];
		doneCount: number;
		remainingMinutes: number;
		/** Above the steps, e.g. the employee's access request. */
		intro?: Snippet;
		children: Snippet;
		later?: Snippet;
	} = $props();
	const uid = $props.id();
</script>

<section class="home-setup" aria-labelledby="home-setup-{uid}">
	<header class="home-setup-head">
		<div>
			<h2 id="home-setup-{uid}">{title}</h2>
			<p>{subtitle}</p>
		</div>
		<div class="home-setup-progress">
			<span>
				<b>{t(`เสร็จ ${doneCount} จาก ${steps.length}`, `${doneCount} of ${steps.length} done`)}</b>{#if remainingMinutes > 0}{t(` · เหลือประมาณ ${remainingMinutes} นาที`, ` · about ${remainingMinutes} min left`)}{/if}
			</span>
			<span
				class="home-setup-bars"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={steps.length}
				aria-valuenow={doneCount}
				aria-label={t('ความคืบหน้าการตั้งค่า', 'Setup progress')}
				style:grid-template-columns={`repeat(${steps.length}, 40px)`}
			>
				{#each steps as step, index (index)}<span class="home-setup-bar {step.state}"></span>{/each}
			</span>
		</div>
	</header>
	{@render intro?.()}
	<ol class="home-setup-steps">
		{@render children()}
	</ol>
	{#if later}<div class="home-setup-later">{@render later()}</div>{/if}
</section>

<style>
	.home-setup {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.home-setup-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
		padding: 22px 32px 20px;
	}
	.home-setup .home-setup-head h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 17px;
		font-weight: 700;
		line-height: 1.35;
	}
	.home-setup .home-setup-head p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.home-setup-progress {
		display: flex;
		flex: none;
		align-items: center;
		gap: 14px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.home-setup-progress b {
		color: var(--orca-ink);
		font-weight: 700;
	}
	.home-setup-bars {
		display: grid;
		gap: 4px;
	}
	.home-setup-bar {
		height: 6px;
		border-radius: 99px;
		background: var(--orca-line);
	}
	.home-setup-bar.done {
		background: var(--orca-ok);
	}
	.home-setup-bar.current {
		background: var(--orca-chosen);
	}
	.home-setup-steps {
		margin: 0;
		padding: 0 0 8px;
		list-style: none;
	}
	.home-setup-later {
		padding: 20px 32px 26px;
		border-top: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
	}
	@media (max-width: 720px) {
		.home-setup-head {
			flex-direction: column;
			align-items: flex-start;
			padding: 18px 16px 16px;
		}
		.home-setup-progress {
			flex-wrap: wrap;
			gap: 8px 14px;
		}
		.home-setup-later {
			padding: 18px 16px 20px;
		}
	}
</style>
