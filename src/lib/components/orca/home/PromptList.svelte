<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Copy } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { firstPrompt } from '$lib/orca/home-setup';
	import { t } from '$lib/orca/locale.svelte';
	import type { OrcaConnection } from '$lib/services/orca';
	import { copyFeedback, copyText } from '../ui/copy';

	// A first question to try, one per program, each with its own copy button.
	let {
		programs,
		iconName = (connection: OrcaConnection) => connection.name
	}: { programs: OrcaConnection[]; iconName?: (connection: OrcaConnection) => string } = $props();
	const shown = $derived(programs.slice(0, 3));
	let copiedID = $state('');
	let failedID = $state('');
	const feedback = copyFeedback((copied) => {
		if (!copied) copiedID = '';
	});
	onDestroy(() => feedback.dispose());
	async function copy(connection: OrcaConnection) {
		failedID = '';
		const ok = await copyText(firstPrompt(connection, t), typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) {
			copiedID = connection.id;
			feedback.copied();
		} else failedID = connection.id;
	}
</script>

<ul class="home-prompts">
	{#each shown as connection (connection.id)}
		<li>
			<span class="home-prompt-logo"><CatalogIcon name={iconName(connection)} size={22} /></span>
			<q class="home-prompt-text">{firstPrompt(connection, t)}</q>
			<button type="button" class="k-button small" onclick={() => copy(connection)}>
				{#if copiedID === connection.id}<Check size={15} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={15} aria-hidden="true" />{t('คัดลอกคำถามนี้', 'Copy this question')}{/if}
			</button>
			{#if failedID === connection.id}<p class="home-prompt-failed" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}
		</li>
	{/each}
</ul>
<span class="home-prompt-announce" role="status" aria-live="polite">{copiedID ? t('คัดลอกแล้ว', 'Copied') : ''}</span>

<style>
	.home-prompts {
		display: grid;
		gap: 8px;
		margin: 18px 0 0;
		padding: 0;
		list-style: none;
	}
	.home-prompts li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	.home-prompt-logo {
		display: grid;
		flex: none;
		place-items: center;
	}
	.home-prompt-text {
		flex: 1 1 180px;
		min-width: 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 500;
		quotes: '“' '”';
		user-select: all;
	}
	.home-prompts :global(.k-button) {
		flex: none;
	}
	.home-prompt-failed {
		flex-basis: 100%;
		margin: 0;
		color: var(--orca-deny);
		font-size: 12.5px;
	}
	.home-prompt-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
