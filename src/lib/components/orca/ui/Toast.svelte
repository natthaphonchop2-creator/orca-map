<script lang="ts">
	import { CircleAlert, CircleCheck, Info, X } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import type { ToastItem } from './toast-queue';
	import { dismissToast, toasts } from './toast-store.svelte';

	// The one place toasts appear (mounted once by AppShell). Pages call
	// showToast("สร้างแล้ว …"); errors stay until closed, others leave by themselves.
	let { items, ondismiss }: { items?: ToastItem[]; ondismiss?: (id: number) => void } = $props();
	const shown = $derived(items ?? toasts.items);
	const close = (id: number) => (ondismiss ?? dismissToast)(id);
</script>

<div class="orca-toasts" role="status" aria-live="polite" aria-relevant="additions">
	{#each shown as item (item.id)}
		<div class="orca-toast {item.tone}">
			{#if item.tone === 'error'}<CircleAlert size={18} aria-hidden="true" />{:else if item.tone === 'info'}<Info size={18} aria-hidden="true" />{:else}<CircleCheck size={18} aria-hidden="true" />{/if}
			<p>{item.message}</p>
			<button type="button" onclick={() => close(item.id)} aria-label={t('ปิดข้อความ', 'Dismiss')} title={t('ปิด', 'Close')}><X size={16} aria-hidden="true" /></button>
		</div>
	{/each}
</div>

<style>
	/* orca-type-remap v1 */
	.orca-toasts {
		position: fixed;
		right: 24px;
		bottom: 24px;
		z-index: 60;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
		max-width: min(440px, calc(100vw - 32px));
		pointer-events: none;
	}
	.orca-toast {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 12px 12px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-popover);
		color: var(--orca-ink);
		box-shadow: var(--orca-popover-shadow);
		pointer-events: auto;
	}
	.orca-toast > :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-ok);
	}
	.orca-toast.info > :global(svg) {
		color: var(--orca-text-2);
	}
	.orca-toast.error {
		border-color: var(--orca-deny-line);
	}
	.orca-toast.error > :global(svg) {
		color: var(--orca-deny);
	}
	.orca-toast p {
		flex: 1;
		margin: 0;
		font-size: 13.5px;
		font-weight: 500;
		line-height: 1.55;
	}
	.orca-toast button {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--orca-radius-sm);
		background: transparent;
		color: var(--orca-muted);
		cursor: pointer;
	}
	.orca-toast button:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	@media (max-width: 720px) {
		.orca-toasts {
			right: 16px;
			bottom: 16px;
			left: 16px;
			align-items: stretch;
		}
	}
</style>
