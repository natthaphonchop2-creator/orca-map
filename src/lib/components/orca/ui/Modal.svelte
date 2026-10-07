<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { focusableIn, rememberFocus, trapTab } from './focus-trap';

	// A centred dialog (W0: สร้าง, the program catalog, ไปที่…). On a phone it
	// opens as a bottom sheet up to 92% of the screen. Esc, the close button and
	// a tap on the dimmed page close it. No motion.
	let {
		open = $bindable(false),
		title,
		wide = false,
		busy = false,
		children,
		footer,
		onclose
	}: {
		open?: boolean;
		title: string;
		/** The catalog: a wider, taller dialog with a scrolling body. */
		wide?: boolean;
		busy?: boolean;
		children: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	} = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	let restore: (() => void) | undefined;
	const uid = $props.id();
	const titleID = `orca-modal-${uid}`;

	$effect(() => {
		const element = dialog;
		if (!element) return;
		if (open && !element.open) {
			restore = rememberFocus();
			element.showModal();
			void tick().then(() => {
				const body = element.querySelector<HTMLElement>('.orca-modal-body');
				(body ? focusableIn(body)[0] : undefined)?.focus();
			});
		} else if (!open && element.open) {
			element.close();
		}
	});
	function close() {
		if (busy) return;
		open = false;
	}
	function closed() {
		open = false;
		onclose?.();
		const back = restore;
		restore = undefined;
		back?.();
	}
</script>

<dialog
	bind:this={dialog}
	class="orca-modal"
	class:wide
	aria-labelledby={titleID}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclose={closed}
	onkeydown={(event) => trapTab(event, dialog)}
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
>
	<div class="orca-modal-panel">
		<header class="orca-modal-head">
			<h2 id={titleID}>{title}</h2>
			<button type="button" class="orca-modal-close" disabled={busy} onclick={close} aria-label={t('ปิด', 'Close')} title={t('ปิด', 'Close')}><X size={18} aria-hidden="true" /></button>
		</header>
		<div class="orca-modal-body">{#if open}{@render children()}{/if}</div>
		{#if footer}<footer class="orca-modal-foot">{@render footer()}</footer>{/if}
	</div>
</dialog>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.orca-modal {
		width: min(560px, calc(100vw - 48px));
		max-width: none;
		max-height: calc(100dvh - 48px);
		margin: auto;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl, 18px);
		background: var(--orca-dialog, var(--orca-surface));
		color: var(--orca-ink);
		/* A hairline edge, no shadow (W0). */
		box-shadow: none;
	}
	.orca-modal.wide {
		width: min(780px, calc(100vw - 48px));
		height: min(680px, calc(100dvh - 48px));
	}
	.orca-modal::backdrop {
		background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
	}
	.orca-modal-panel {
		display: flex;
		flex-direction: column;
		max-height: inherit;
		height: 100%;
	}
	.orca-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 16px 4px 20px;
	}
	.orca-modal-head h2 {
		margin: 0;
		font-size: 16px;
		line-height: 1.4;
		font-weight: 600;
	}
	.orca-modal-close {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--orca-radius);
		background: transparent;
		color: var(--orca-muted);
		cursor: pointer;
	}
	.orca-modal-close:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.orca-modal-body {
		flex: 1;
		min-height: 0;
		padding: 8px 20px 20px;
		overflow: auto;
	}
	.orca-modal-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 20px;
		border-top: 1px solid var(--orca-line);
	}
	/* A phone: a bottom sheet, full width, up to 92% of the screen. */
	@media (max-width: 720px) {
		.orca-modal,
		.orca-modal.wide {
			width: 100vw;
			/* fit-content: a modal dialog is fixed with both insets, so auto would stretch it. */
			height: fit-content;
			max-height: 92dvh;
			margin: auto 0 0;
			border-bottom: 0;
			border-radius: var(--orca-radius-xl, 18px) var(--orca-radius-xl, 18px) 0 0;
		}
		.orca-modal.wide {
			height: 92dvh;
		}
		.orca-modal-head {
			padding: 16px 12px 4px 16px;
		}
		.orca-modal-body {
			padding: 8px 16px 16px;
		}
		.orca-modal-foot {
			padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		}
	}
</style>
