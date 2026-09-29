<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { focusableIn, rememberFocus, trapTab } from './focus-trap';

	// A side panel for a task that belongs to the page behind it (signing in to
	// a program, adding a program from the workspace form), so there is never
	// a modal on top of a modal. Esc and the close button close it.
	let {
		open = $bindable(false),
		title,
		description = '',
		busy = false,
		children,
		footer,
		onclose
	}: {
		open?: boolean;
		title: string;
		description?: string;
		busy?: boolean;
		children: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	} = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	let restore: (() => void) | undefined;
	const uid = $props.id();
	const titleID = `orca-sheet-${uid}`;

	$effect(() => {
		const element = dialog;
		if (!element) return;
		if (open && !element.open) {
			restore = rememberFocus();
			element.showModal();
			void tick().then(() => {
				const body = element.querySelector<HTMLElement>('.orca-sheet-body');
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
	class="orca-sheet"
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
	<div class="orca-sheet-panel">
		<header class="orca-sheet-head">
			<div>
				<h2 id={titleID}>{title}</h2>
				{#if description}<p>{description}</p>{/if}
			</div>
			<button type="button" class="orca-sheet-close" disabled={busy} onclick={close} aria-label={t('ปิด', 'Close')} title={t('ปิด', 'Close')}><X size={18} aria-hidden="true" /></button>
		</header>
		<div class="orca-sheet-body">{#if open}{@render children()}{/if}</div>
		{#if footer}<footer class="orca-sheet-foot">{@render footer()}</footer>{/if}
	</div>
</dialog>

<style>
	.orca-sheet {
		width: min(560px, 100vw);
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0 0 0 auto;
		padding: 0;
		overflow: hidden;
		border: 0;
		border-left: 1px solid var(--orca-line);
		background: var(--orca-surface);
		color: var(--orca-ink);
		box-shadow: var(--orca-dialog-shadow);
	}
	.orca-sheet::backdrop {
		background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
	}
	.orca-sheet-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.orca-sheet-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 20px 24px 16px;
		border-bottom: 1px solid var(--orca-line);
	}
	.orca-sheet-head h2 {
		margin: 0;
		font-size: 18px;
		line-height: 1.4;
		font-weight: 700;
	}
	.orca-sheet-head p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.55;
	}
	.orca-sheet-close {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: var(--orca-radius);
		background: transparent;
		color: var(--orca-muted);
		cursor: pointer;
	}
	.orca-sheet-close:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.orca-sheet-body {
		flex: 1;
		min-height: 0;
		padding: 20px 24px;
		overflow: auto;
	}
	.orca-sheet-foot {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 14px 24px;
		border-top: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
	}
</style>
