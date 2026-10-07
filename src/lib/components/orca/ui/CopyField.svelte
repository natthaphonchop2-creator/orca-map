<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Copy } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { copyFeedback, copyText } from './copy';

	// A big copy button with the value in small mono text beside it. The value
	// stays selectable, so a failed copy can still be done by hand.
	let {
		value,
		label = '',
		buttonLabel,
		size = 'large',
		oncopied
	}: {
		value: string;
		label?: string;
		buttonLabel?: string;
		size?: 'large' | 'small';
		oncopied?: () => void;
	} = $props();
	const uid = $props.id();
	const valueID = `orca-copy-value-${uid}`;
	let copied = $state(false);
	let failed = $state(false);
	const feedback = copyFeedback((value) => (copied = value));
	onDestroy(() => feedback.dispose());
	async function copy() {
		failed = false;
		const ok = await copyText(value, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) {
			feedback.copied();
			oncopied?.();
		} else failed = true;
	}
</script>

<div class="orca-copy {size}">
	<button type="button" class="orca-copy-button" class:copied onclick={copy} disabled={!value} aria-describedby={valueID}>
		{#if copied}<Check size={size === 'large' ? 18 : 15} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={size === 'large' ? 18 : 15} aria-hidden="true" />{buttonLabel ?? t('คัดลอก', 'Copy')}{/if}
	</button>
	<div class="orca-copy-value" id={valueID}>
		{#if label}<span class="orca-copy-label">{label}</span>{/if}
		<code>{value}</code>
	</div>
	<span class="orca-copy-announce" role="status" aria-live="polite">{copied ? t('คัดลอกแล้ว', 'Copied') : ''}</span>
	{#if failed}<p class="orca-copy-failed" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}
</div>

<style>
	/* orca-type-remap v1 */
	.orca-copy {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 18px;
		min-width: 0;
	}
	.orca-copy-button {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 36px;
		padding: 0 14px;
		border: 1px solid transparent;
		border-radius: var(--orca-radius);
		background: var(--orca-citron);
		color: var(--orca-on-citron);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.15s var(--orca-ease);
	}
	.orca-copy.large .orca-copy-button {
		min-height: 54px;
		padding: 0 26px;
		font-size: 15px;
	}
	.orca-copy.small .orca-copy-button {
		border-color: var(--orca-line);
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	.orca-copy-button:hover:not(:disabled) {
		background: var(--orca-citron-hover);
	}
	.orca-copy.small .orca-copy-button:hover:not(:disabled) {
		background: var(--orca-secondary);
	}
	.orca-copy-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.orca-copy-value {
		display: flex;
		flex: 1 1 240px;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.orca-copy-label {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.orca-copy-value code {
		overflow-wrap: anywhere;
		color: var(--orca-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12.5px;
		user-select: all;
	}
	.orca-copy-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.orca-copy-failed {
		flex-basis: 100%;
		margin: 0;
		color: var(--orca-deny);
		font-size: 12px;
	}
</style>
