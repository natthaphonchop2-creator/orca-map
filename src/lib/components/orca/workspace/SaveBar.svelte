<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import { CircleAlert, LoaderCircle, RefreshCw } from '@lucide/svelte';

	// A tab's one save (proposal §3.5 screen 4, "Per-tab บันทึก"): it appears
	// with the first change and stays at the bottom of the screen until saved
	// or undone. Someone else's save in between offers a reload instead.
	let {
		summary,
		busy = false,
		error = '',
		conflict = false,
		saveLabel,
		onsave,
		oncancel,
		onreload
	}: {
		summary: string;
		busy?: boolean;
		error?: string;
		conflict?: boolean;
		saveLabel?: string;
		onsave: () => void;
		oncancel: () => void;
		onreload?: () => void;
	} = $props();
</script>

<div class="save-bar" role="region" aria-label={t('บันทึกการแก้ไข', 'Save changes')}>
	<div class="save-copy">
		{#if error}<p class="save-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>
		{:else}<p class="save-summary" aria-live="polite">{summary}</p>{/if}
	</div>
	<div class="save-actions">
		<button type="button" class="save-cancel" disabled={busy} onclick={oncancel}>{t('ยกเลิก', 'Cancel')}</button>
		{#if conflict && onreload}<button type="button" class="save-primary" disabled={busy} onclick={onreload}><RefreshCw size={16} aria-hidden="true" />{t('โหลดใหม่', 'Reload')}</button>
		{:else}<button type="button" class="save-primary" disabled={busy} onclick={onsave}>{#if busy}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{busy ? t('กำลังบันทึก…', 'Saving…') : (saveLabel ?? t('บันทึก', 'Save'))}</button>{/if}
	</div>
</div>

<style>
	/* orca-type-remap v1 */
	.save-bar {
		position: sticky;
		bottom: 16px;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 20px;
		padding: 10px 10px 10px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
		box-shadow: var(--orca-popover-shadow);
	}
	.save-copy {
		flex: 1;
		min-width: 0;
	}
	.save-summary,
	.save-error {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.save-error {
		color: var(--orca-deny);
	}
	.save-error :global(svg) {
		flex: none;
	}
	.save-actions {
		display: flex;
		flex: none;
		gap: 6px;
	}
	.save-cancel,
	.save-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 42px;
		padding: 0 16px;
		border: 1px solid transparent;
		border-radius: var(--orca-radius);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.save-cancel {
		background: transparent;
		color: var(--orca-muted);
	}
	.save-cancel:hover:not(:disabled) {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.save-primary {
		padding: 0 20px;
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.save-primary:hover:not(:disabled) {
		background: var(--orca-ink);
	}
	.save-cancel:disabled,
	.save-primary:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	@media (max-width: 720px) {
		.save-bar {
			flex-wrap: wrap;
			bottom: 8px;
			padding: 12px;
		}
		.save-copy {
			flex-basis: 100%;
		}
		.save-actions {
			flex: 1 1 100%;
			flex-direction: row-reverse;
		}
		.save-primary {
			flex: 1;
		}
	}
</style>
