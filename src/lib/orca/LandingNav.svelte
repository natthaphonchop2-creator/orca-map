<script lang="ts">
	import { page } from '$app/state';
	import Brand from '$lib/components/orca/Brand.svelte';
	import SiteSettings from '$lib/components/orca/SiteSettings.svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { ArrowUpRight, Menu, X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let { loggedIn }: { loggedIn: boolean } = $props();
	let menuOpen = $state(false);
	let menuDialog: HTMLDialogElement;
	let menuToggle: HTMLButtonElement;
	let menuCloseButton: HTMLButtonElement;
	let brandLink: HTMLAnchorElement;
	let returnFocus: HTMLElement | null = null;
	let sectionDestination: string | null = null;
	let destroying = false;
	let scrollLock: {
		overflow: string;
		overflowPriority: string;
		paddingRight: string;
		paddingRightPriority: string;
	} | null = null;

	const menuID = 'orca-nav-mobile-navigation';
	const home = $derived(page.url.pathname === '/');
	const navigation = $derived([
		{
			href: home ? '#platform' : localeHref('/#platform'),
			label: t('รู้จัก ORCA', 'Platform'),
			current: false
		},
		{
			href: home ? '#how' : localeHref('/#how'),
			label: t('การทำงาน', 'How it works'),
			current: false
		},
		{
			href: localeHref('/services'),
			label: t('บริการเสริม', 'Services'),
			current: page.url.pathname === '/services'
		},
		{
			href: localeHref('/pricing'),
			label: t('ราคา', 'Pricing'),
			current: page.url.pathname === '/pricing'
		}
	]);

	function lockBodyScroll() {
		if (scrollLock) return;
		const { style } = document.body;
		const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
		const paddingRight = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
		scrollLock = {
			overflow: style.getPropertyValue('overflow'),
			overflowPriority: style.getPropertyPriority('overflow'),
			paddingRight: style.getPropertyValue('padding-right'),
			paddingRightPriority: style.getPropertyPriority('padding-right')
		};
		style.setProperty('overflow', 'hidden');
		if (scrollbarWidth > 0)
			style.setProperty('padding-right', `${paddingRight + scrollbarWidth}px`);
	}

	function unlockBodyScroll() {
		if (!scrollLock) return;
		const { style } = document.body;
		style.setProperty('overflow', scrollLock.overflow, scrollLock.overflowPriority);
		style.setProperty('padding-right', scrollLock.paddingRight, scrollLock.paddingRightPriority);
		scrollLock = null;
	}

	function openMenu() {
		if (!menuDialog || menuDialog.open || window.matchMedia('(min-width: 901px)').matches) return;
		// Pointer activation does not focus buttons in every browser. The
		// opener is always the menu toggle, so restore that explicit target.
		returnFocus = menuToggle;
		menuDialog.showModal();
		menuOpen = true;
		lockBodyScroll();
		menuCloseButton.focus({ preventScroll: true });
	}

	function closeMenu() {
		if (menuDialog?.open) menuDialog.close();
	}
	function followSection(href: string) {
		sectionDestination = href.startsWith('#') ? href.slice(1) : null;
		closeMenu();
	}

	function menuClosed() {
		menuOpen = false;
		unlockBodyScroll();
		if (destroying) return;
		if (sectionDestination) {
			const destination = document.getElementById(sectionDestination);
			sectionDestination = null;
			returnFocus = null;
			destination?.focus({ preventScroll: true });
			return;
		}
		// The mobile toggle is hidden after a desktop resize. Restore focus to
		// the visible home link instead of leaving it in the closed dialog.
		const target =
			returnFocus?.isConnected && returnFocus.getClientRects().length > 0 ? returnFocus : brandLink;
		target?.focus({ preventScroll: true });
		returnFocus = null;
	}

	function containMenuFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const items = Array.from(
			menuDialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
		).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		const first = items[0];
		const last = items.at(-1);
		if (!first || !last) return;
		if (!menuDialog.contains(document.activeElement)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		} else if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function dismissBackdrop(event: PointerEvent) {
		if (event.target !== menuDialog) return;
		const bounds = menuDialog.getBoundingClientRect();
		if (
			event.clientX < bounds.left ||
			event.clientX > bounds.right ||
			event.clientY < bounds.top ||
			event.clientY > bounds.bottom
		)
			closeMenu();
	}

	onMount(() => {
		const desktop = window.matchMedia('(min-width: 901px)');
		const closeOnDesktop = () => {
			if (desktop.matches) closeMenu();
		};
		desktop.addEventListener('change', closeOnDesktop);
		return () => {
			destroying = true;
			desktop.removeEventListener('change', closeOnDesktop);
			closeMenu();
			unlockBodyScroll();
		};
	});
</script>

<header class="orca-nav-header">
	<div class="orca-nav-inner">
		<a
			bind:this={brandLink}
			class="orca-nav-brand"
			href={localeHref('/')}
			aria-label={t('ORCA หน้าหลัก', 'ORCA home')}
		>
			<Brand />
		</a>
		<nav class="orca-nav-desktop" aria-label={t('เมนูหลัก', 'Main navigation')}>
			{#each navigation as item (item.href)}
				<a class="orca-nav-link" href={item.href} aria-current={item.current ? 'page' : undefined}
					>{item.label}</a
				>
			{/each}
		</nav>
		<div class="orca-nav-actions">
			<div class="orca-nav-settings"><SiteSettings id="orca-desktop-settings" /></div>
			<a class="orca-nav-pilot" href={localeHref('/start')}>
				{t('ขอทดลองใช้', 'Request a pilot')}<ArrowUpRight size={16} aria-hidden="true" />
			</a>
			<a class="orca-nav-login" href={localeHref(loggedIn ? '/app' : '/login')}>
				{loggedIn ? t('เปิด ORCA', 'Open app') : t('เข้าสู่ระบบ', 'Sign in')}<ArrowUpRight
					size={17}
					aria-hidden="true"
				/>
			</a>
			<button
				bind:this={menuToggle}
				class="orca-nav-toggle"
				type="button"
				aria-expanded={menuOpen}
				aria-controls={menuID}
				aria-haspopup="dialog"
				aria-label={menuOpen ? t('ปิดเมนู', 'Close menu') : t('เปิดเมนู', 'Open menu')}
				onclick={openMenu}><Menu size={23} aria-hidden="true" /></button
			>
		</div>
	</div>
</header>

<dialog
	bind:this={menuDialog}
	id={menuID}
	class="orca-nav-dialog"
	aria-label={t('เมนูมือถือ ORCA', 'ORCA mobile navigation')}
	onclose={menuClosed}
	onkeydown={containMenuFocus}
	onpointerdown={dismissBackdrop}
>
	<div class="orca-nav-panel">
		<div class="orca-nav-panel-heading">
			<Brand />
			<button
				bind:this={menuCloseButton}
				class="orca-nav-close"
				type="button"
				aria-label={t('ปิดเมนู', 'Close menu')}
				onclick={closeMenu}><X size={23} aria-hidden="true" /></button
			>
		</div>
		<nav class="orca-nav-mobile-links" aria-label={t('เมนูมือถือ', 'Mobile navigation')}>
			{#each navigation as item (item.href)}
				<a
					class="orca-nav-mobile-link"
					href={item.href}
					aria-current={item.current ? 'page' : undefined}
					onclick={() => followSection(item.href)}>{item.label}</a
				>
			{/each}
		</nav>
		<div class="orca-nav-mobile-actions">
			<SiteSettings id="orca-mobile-settings" inline />
			<a class="orca-nav-mobile-pilot" href={localeHref('/start')} onclick={closeMenu}>
				{t('ขอทดลองใช้ ORCA', 'Start with ORCA')}<ArrowUpRight size={18} aria-hidden="true" />
			</a>
			<a
				class="orca-nav-mobile-login"
				href={localeHref(loggedIn ? '/app' : '/login')}
				onclick={closeMenu}
			>
				{loggedIn
					? t('เปิด ORCA', 'Open ORCA app')
					: t('เข้าสู่ระบบ ORCA', 'Sign in to ORCA')}<ArrowUpRight size={17} aria-hidden="true" />
			</a>
		</div>
	</div>
</dialog>

<style>
	.orca-nav-header {
		position: sticky;
		top: 0;
		z-index: 20;
		background: linear-gradient(180deg, #ffffff, #fbfbfd);
		border-bottom: 1px solid #e0e3eb;
		box-shadow:
			0 1px 0 rgb(255 255 255 / 80%) inset,
			0 7px 24px rgb(21 24 35 / 4%);
	}
	.orca-nav-inner {
		width: min(1180px, calc(100% - 80px));
		margin-inline: auto;
		min-height: 88px;
		display: grid;
		/* Equal side tracks keep the navigation at the viewport center, even
		   when the locale or authentication labels change the actions' width. */
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		column-gap: 24px;
	}
	.orca-nav-brand {
		grid-column: 1;
		justify-self: start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		border-radius: 8px;
	}
	.orca-nav-desktop {
		grid-column: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 22px;
	}
	.orca-nav-link {
		position: relative;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: #545e72;
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		transition: color 160ms ease;
	}
	.orca-nav-link::after {
		content: '';
		position: absolute;
		inset: auto 35% 2px;
		height: 2px;
		border-radius: 2px;
		background: #a8c763;
		opacity: 0;
		transition: opacity 160ms ease;
	}
	.orca-nav-link:hover,
	.orca-nav-link[aria-current='page'],
	.orca-nav-mobile-link[aria-current='page'],
	.orca-nav-link:focus-visible,
	.orca-nav-login:hover,
	.orca-nav-mobile-link:hover,
	.orca-nav-mobile-login:hover {
		color: #516d29;
	}
	.orca-nav-link:hover::after,
	.orca-nav-link[aria-current='page']::after,
	.orca-nav-link:focus-visible::after {
		opacity: 1;
	}
	.orca-nav-actions {
		grid-column: 3;
		justify-self: end;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.orca-nav-login {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		color: #151823;
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		transition: color 160ms ease;
	}
	.orca-nav-pilot {
		display: none;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 42px;
		padding: 10px 16px;
		border: 1px solid #151823;
		border-radius: 999px;
		background: #151823;
		color: #f5f6fa;
		font-size: 12px;
		font-weight: 550;
		white-space: nowrap;
		transition:
			background 160ms ease,
			box-shadow 160ms ease;
	}
	.orca-nav-pilot:hover {
		background: #303746;
		box-shadow: 0 3px 10px rgb(21 24 35 / 10%);
	}
	.orca-nav-toggle,
	.orca-nav-close {
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid #b9bfce;
		border-radius: 9px;
		background: #ffffff;
		color: #151823;
	}
	.orca-nav-toggle {
		display: none;
	}
	.orca-nav-close {
		display: inline-flex;
	}
	.orca-nav-dialog {
		inset: 16px 0 auto;
		width: min(520px, calc(100% - 32px));
		max-width: none;
		max-height: calc(100dvh - 32px);
		margin: 0 auto;
		padding: 0;
		border: 1px solid #dce0e8;
		border-radius: 16px;
		background: #fbfbfd;
		color: #151823;
		box-shadow: 0 18px 60px rgb(21 24 35 / 22%);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.orca-nav-dialog:not([open]) {
		display: none;
	}
	.orca-nav-dialog::backdrop {
		background: rgb(21 24 35 / 56%);
		backdrop-filter: blur(6px);
	}
	.orca-nav-panel {
		padding: 22px 24px 30px;
	}
	.orca-nav-panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.orca-nav-mobile-links {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		padding-block: 30px;
		text-align: center;
	}
	.orca-nav-mobile-link {
		padding: 12px 4px;
		font-size: 18px;
		font-weight: 550;
	}
	.orca-nav-mobile-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
	}
	.orca-nav-mobile-pilot,
	.orca-nav-mobile-login {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 44px;
		font-size: 14px;
	}
	.orca-nav-mobile-pilot {
		width: 100%;
		padding: 12px 20px;
		border-radius: 999px;
		background: var(--o-citron, #d5f478);
		color: #151823;
		font-weight: 600;
	}
	@media (min-width: 1280px) {
		.orca-nav-pilot {
			display: inline-flex;
		}
	}
	@media (max-width: 1100px) {
		.orca-nav-inner {
			width: calc(100% - 48px);
			column-gap: 16px;
		}
		.orca-nav-desktop {
			gap: 14px;
		}
		.orca-nav-link,
		.orca-nav-login {
			font-size: 13px;
		}
		.orca-nav-actions {
			gap: 12px;
		}
	}
	@media (max-width: 900px) {
		.orca-nav-settings {
			display: none;
		}
		.orca-nav-inner {
			grid-template-columns: minmax(0, 1fr) auto;
			min-height: 78px;
		}
		.orca-nav-desktop {
			display: none;
		}
		.orca-nav-actions {
			grid-column: 2;
		}
		.orca-nav-toggle {
			display: inline-flex;
		}
	}
	@media (max-width: 680px) {
		.orca-nav-inner {
			width: calc(100% - 32px);
			min-height: 76px;
			column-gap: 12px;
		}
		.orca-nav-actions {
			gap: 10px;
		}
		.orca-nav-login {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orca-nav-link,
		.orca-nav-link::after,
		.orca-nav-login,
		.orca-nav-pilot {
			transition: none;
		}
	}
</style>
