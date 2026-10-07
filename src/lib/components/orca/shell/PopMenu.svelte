<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { menuMove } from '$lib/orca/menu-keys';
	import { t } from '$lib/orca/locale.svelte';

	// A top-bar menu (W0.1): the button and the menu anchored under it, not a
	// modal. `menu`: rows are role="menuitem"; arrows, Home and End move between
	// them and skip greyed ones; Esc closes and returns focus to the button; Tab
	// closes. `panel`: controls inside (theme, language) keep Tab; Esc closes.
	// `sheet`: on a phone it opens as a bottom sheet with its title, a modal
	// <dialog> (W0.1 round 1): Tab stays inside, the page behind is inert, and
	// closing returns focus to the button. Esc closes an open menu wherever
	// focus is, so one opened with the pointer closes too.
	let {
		id,
		label,
		buttonClass = '',
		buttonLabel,
		kind = 'menu',
		align = 'right',
		sheet = '',
		open = $bindable(false),
		button,
		children
	}: {
		id: string;
		/** The menu's accessible name. */
		label: string;
		buttonClass?: string;
		/** The button's accessible name when its content is not words. */
		buttonLabel?: string;
		kind?: 'menu' | 'panel';
		align?: 'left' | 'right';
		/** The phone sheet's title; empty keeps a dropdown on a phone too. */
		sheet?: string;
		open?: boolean;
		button: Snippet;
		children: Snippet<[() => void]>;
	} = $props();
	let trigger: HTMLButtonElement | undefined = $state();
	let menu: HTMLDivElement | undefined = $state();
	let sheetDialog: HTMLDialogElement | undefined = $state();
	const uid = $props.id();
	// A phone: the width the sheet's CSS uses.
	let phone = $state(false);
	$effect(() => {
		if (!sheet || typeof window === 'undefined' || !window.matchMedia) return;
		const query = window.matchMedia('(max-width: 720px)');
		phone = query.matches;
		const onchange = () => (phone = query.matches);
		query.addEventListener('change', onchange);
		return () => query.removeEventListener('change', onchange);
	});
	const modal = $derived(!!sheet && phone);
	$effect(() => {
		const element = sheetDialog;
		if (!element || !open || element.open) return;
		element.showModal();
		void focusRow('first');
	});

	function rows(): HTMLElement[] {
		return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter((row) => row.getClientRects().length > 0);
	}
	async function focusRow(which: 'first' | 'last') {
		await tick();
		const list = rows();
		const disabled = list.map((row) => row.getAttribute('aria-disabled') === 'true');
		const index = menuMove(disabled, -1, which === 'first' ? 'ArrowDown' : 'ArrowUp');
		if (index >= 0) list[index].focus();
		else menu?.querySelector<HTMLElement>('button, a, [tabindex]')?.focus();
	}
	// The sheet's Tab trap: the rows take no Tab stop of their own (arrows move
	// between them), so Tab goes between the close button and the menu.
	let closeButton: HTMLButtonElement | undefined = $state();
	function onSheetKey(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		event.preventDefault();
		if (document.activeElement === closeButton) void focusRow('first');
		else closeButton?.focus();
	}
	// Where focus was when the menu opened: the button, or (opened with the
	// pointer, where a click does not move focus) the control the person was on,
	// such as a rail item. Closing returns there, so it is the only layer that closes.
	let opener: HTMLElement | null = null;
	function remember() {
		const active = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
		opener = active && active !== document.body ? active : null;
	}
	export function close(refocus = false) {
		if (!open) return;
		// The modal sheet first, so the button behind is no longer inert.
		if (sheetDialog?.open) sheetDialog.close();
		open = false;
		if (!refocus) return;
		const back = opener?.isConnected && !menu?.contains(opener) && !sheetDialog?.contains(opener) ? opener : trigger;
		back?.focus();
	}
	function toggle(event: MouseEvent) {
		if (open) close();
		else {
			remember();
			open = true;
			// A keyboard "click" (Enter or Space) lands on the first row.
			if (event.detail === 0) void focusRow('first');
		}
	}
	function onButtonKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) remember();
			open = true;
			void focusRow(event.key === 'ArrowDown' ? 'first' : 'last');
		}
	}
	function onMenuKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close(true);
			return;
		}
		if (kind !== 'menu') return;
		if (event.key === 'Tab') {
			// The modal sheet keeps Tab inside (its dialog's trap); a dropdown closes.
			if (!modal) close();
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const list = rows();
		const current = list.indexOf(document.activeElement as HTMLElement);
		const next = menuMove(list.map((row) => row.getAttribute('aria-disabled') === 'true'), current, event.key);
		if (next >= 0) list[next].focus();
	}
	$effect(() => {
		if (!open) return;
		const outside = (event: Event) => {
			const target = event.target as Node | null;
			if (target && (menu?.contains(target) || trigger?.contains(target) || sheetDialog?.contains(target))) return;
			close();
		};
		// Esc with focus anywhere (a menu opened with the pointer keeps focus on
		// the page): the open menu is the top layer, so it closes first.
		const escape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			event.preventDefault();
			close(true);
		};
		document.addEventListener('pointerdown', outside);
		document.addEventListener('focusin', outside);
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('focusin', outside);
			document.removeEventListener('keydown', escape);
		};
	});
</script>

<div class="pm" class:open>
	<button
		bind:this={trigger}
		type="button"
		class={buttonClass}
		aria-haspopup={kind === 'menu' ? 'menu' : 'dialog'}
		aria-expanded={open}
		aria-controls={id}
		aria-label={buttonLabel}
		onclick={toggle}
		onkeydown={onButtonKey}>{@render button()}</button
	>
	{#if open && modal}
		<!-- A phone: the sheet is a modal dialog; a tap on the dimmed page closes it. -->
		<dialog
			bind:this={sheetDialog}
			class="pm-sheet"
			aria-labelledby="pm-sheet-title-{uid}"
			oncancel={(event) => {
				event.preventDefault();
				close(true);
			}}
			onclick={(event) => {
				if (event.target === sheetDialog) close(true);
			}}
			onkeydown={onSheetKey}
		>
			<div class="pm-sheet-head"><h2 id="pm-sheet-title-{uid}">{sheet}</h2><button bind:this={closeButton} type="button" class="pm-close" aria-label={t('ปิด', 'Close')} onclick={() => close(true)}><X size={18} aria-hidden="true" /></button></div>
			<div bind:this={menu} {id} class="pm-sheet-list" role={kind === 'menu' ? 'menu' : 'group'} aria-label={label} tabindex="-1" onkeydown={onMenuKey}>
				{@render children(() => close())}
			</div>
		</dialog>
	{:else if open}
		<div
			bind:this={menu}
			{id}
			class="pm-menu align-{align}"
			role={kind === 'menu' ? 'menu' : 'dialog'}
			aria-label={label}
			tabindex="-1"
			onkeydown={onMenuKey}
		>
			{@render children(() => close())}
		</div>
	{/if}
</div>

<style>
	.pm {
		position: relative;
	}
	.pm-menu {
		position: absolute;
		top: calc(100% + 6px);
		z-index: 60;
		min-width: 240px;
		max-width: calc(100vw - 24px);
		max-height: calc(100dvh - 80px);
		overflow: auto;
		padding: 4px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-popover, var(--orca-surface));
		color: var(--orca-ink);
		box-shadow: var(--orca-popover-shadow);
	}
	.pm-menu:focus-visible {
		outline: none;
	}
	.pm-menu.align-right {
		right: 0;
	}
	.pm-menu.align-left {
		left: 0;
	}
	/* The phone sheet: a modal dialog at the bottom, up to 92% of the screen. No motion. */
	.pm-sheet {
		position: fixed;
		inset: auto 0 0 0;
		width: 100%;
		max-width: none;
		max-height: 92dvh;
		margin: 0;
		padding: 4px 4px calc(8px + env(safe-area-inset-bottom));
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-bottom: 0;
		border-radius: var(--orca-radius-xl, 16px) var(--orca-radius-xl, 16px) 0 0;
		background: var(--orca-popover, var(--orca-surface));
		color: var(--orca-ink);
		box-shadow: none;
	}
	.pm-sheet::backdrop {
		background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
	}
	.pm-sheet-list:focus-visible {
		outline: none;
	}
	.pm-sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 8px 4px 14px;
	}
	.pm-sheet-head h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	.pm-close {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--orca-radius);
		background: transparent;
		color: var(--orca-muted);
	}
</style>
