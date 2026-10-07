<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { menuMove } from '$lib/orca/menu-keys';
	import { t } from '$lib/orca/locale.svelte';

	// A top-bar menu (W0.1): the button and the menu anchored under it, not a
	// modal. `menu`: rows are role="menuitem"; arrows, Home and End move between
	// them and skip greyed ones; Esc closes and returns focus to the button; Tab
	// closes. `panel`: controls inside (theme, language) keep Tab; Esc closes.
	// `sheet`: on a phone it opens as a bottom sheet with its title.
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
	export function close(refocus = false) {
		if (!open) return;
		open = false;
		if (refocus) trigger?.focus();
	}
	function toggle(event: MouseEvent) {
		if (open) close();
		else {
			open = true;
			// A keyboard "click" (Enter or Space) lands on the first row.
			if (event.detail === 0) void focusRow('first');
		}
	}
	function onButtonKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
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
			close();
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
			if (target && (menu?.contains(target) || trigger?.contains(target))) return;
			close();
		};
		document.addEventListener('pointerdown', outside);
		document.addEventListener('focusin', outside);
		return () => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('focusin', outside);
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
	{#if open}
		{#if sheet}<button type="button" class="pm-scrim" aria-label={t('ปิด', 'Close')} tabindex="-1" onclick={() => close()}></button>{/if}
		<div
			bind:this={menu}
			{id}
			class="pm-menu align-{align}"
			class:sheet={!!sheet}
			role={kind === 'menu' ? 'menu' : 'dialog'}
			aria-label={label}
			tabindex="-1"
			onkeydown={onMenuKey}
		>
			{#if sheet}<div class="pm-sheet-head"><h2>{sheet}</h2><button type="button" class="pm-close" aria-label={t('ปิด', 'Close')} onclick={() => close(true)}><X size={18} aria-hidden="true" /></button></div>{/if}
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
	.pm-scrim,
	.pm-sheet-head {
		display: none;
	}
	@media (max-width: 720px) {
		.pm-scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 59;
			border: 0;
			background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
		}
		.pm-menu.sheet {
			position: fixed;
			top: auto;
			right: 0;
			bottom: 0;
			left: 0;
			max-width: none;
			max-height: 92dvh;
			padding: 4px 4px calc(8px + env(safe-area-inset-bottom));
			border-bottom: 0;
			border-radius: var(--orca-radius-xl, 16px) var(--orca-radius-xl, 16px) 0 0;
			box-shadow: none;
		}
		.pm-menu.sheet .pm-sheet-head {
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
	}
</style>
