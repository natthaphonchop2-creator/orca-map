<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { rememberFocus, trapTab } from './focus-trap';

	// A modal confirmation (never a panel under a list): focus moves to Cancel,
	// stays inside, Esc cancels, and focus goes back where it was.
	let {
		open = $bindable(false),
		title,
		message = '',
		confirmLabel,
		cancelLabel,
		tone = 'default',
		busy = false,
		icon: Icon,
		children,
		onconfirm,
		oncancel
	}: {
		open?: boolean;
		title: string;
		message?: string;
		confirmLabel: string;
		cancelLabel?: string;
		tone?: 'default' | 'danger';
		busy?: boolean;
		icon?: LucideIcon;
		children?: Snippet;
		onconfirm: () => void | Promise<void>;
		oncancel?: () => void;
	} = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	let cancelButton: HTMLButtonElement | undefined = $state();
	let restore: (() => void) | undefined;
	const uid = $props.id();
	const titleID = `orca-confirm-${uid}`;

	$effect(() => {
		const element = dialog;
		if (!element) return;
		if (open && !element.open) {
			restore = rememberFocus();
			element.showModal();
			void tick().then(() => cancelButton?.focus());
		} else if (!open && element.open) {
			element.close();
		}
	});
	function cancel() {
		if (busy) return;
		open = false;
		oncancel?.();
	}
	function closed() {
		open = false;
		const back = restore;
		restore = undefined;
		back?.();
	}
</script>

<dialog
	bind:this={dialog}
	class="orca-confirm"
	class:danger={tone === 'danger'}
	aria-labelledby={titleID}
	oncancel={(event) => {
		event.preventDefault();
		cancel();
	}}
	onclose={closed}
	onkeydown={(event) => trapTab(event, dialog)}
	onclick={(event) => {
		if (event.target === dialog) cancel();
	}}
>
	<div class="orca-confirm-body">
		{#if Icon}<span class="orca-confirm-icon" aria-hidden="true"><Icon size={20} /></span>{/if}
		<h2 id={titleID}>{title}</h2>
		{#if message}<p>{message}</p>{/if}
		{#if children}{@render children()}{/if}
		<div class="orca-confirm-actions">
			<button type="button" class="k-button" bind:this={cancelButton} disabled={busy} onclick={cancel}>{cancelLabel ?? t('ยกเลิก', 'Cancel')}</button>
			<button type="button" class="k-button {tone === 'danger' ? 'danger-solid' : 'primary'}" disabled={busy} aria-busy={busy} onclick={() => onconfirm()}>{confirmLabel}</button>
		</div>
	</div>
</dialog>

<style>
	.orca-confirm {
		width: min(520px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		margin: auto;
		padding: 0;
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
		color: var(--orca-ink);
		box-shadow: var(--orca-dialog-shadow);
	}
	.orca-confirm::backdrop {
		background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
	}
	.orca-confirm-body {
		padding: 28px 28px 24px;
	}
	.orca-confirm-icon {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		margin-bottom: 18px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.orca-confirm.danger .orca-confirm-icon {
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.orca-confirm h2 {
		margin: 0;
		font-size: 19px;
		line-height: 1.4;
		font-weight: 700;
	}
	.orca-confirm p {
		margin: 8px 0 0;
		color: var(--orca-muted);
		font-size: 14.5px;
		line-height: 1.6;
	}
	.orca-confirm-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 24px;
	}
	.orca-confirm-actions :global(.k-button) {
		min-height: 42px;
		padding: 0 18px;
		font-weight: 600;
	}
</style>
