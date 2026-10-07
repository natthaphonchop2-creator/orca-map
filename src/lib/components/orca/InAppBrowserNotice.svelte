<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Check, Copy, ExternalLink, Globe } from '@lucide/svelte';
	import { inAppBrowser, inAppBrowserName, lineExternalURL, shareableURL, type InAppBrowser } from '$lib/orca/in-app-browser';
	import { t } from '$lib/orca/locale.svelte';
	import { copyFeedback, copyText } from './ui/copy';

	// Google refuses to sign anyone in inside LINE's and Facebook's in-app
	// browsers (workspace UX critique 13). On /login, /invite and เชื่อม AI ของฉัน
	// this asks the person to open the same page in Chrome or Safari. The page's
	// own flow stays exactly as it is below it, with its own primary button: the
	// notice's buttons are outlined, so the page keeps one primary action.
	let {
		userAgent,
		href,
		level = 3,
		variant = 'auth',
		aiSignIn = false
	}: {
		/** For tests; the browser's own by default. */
		userAgent?: string;
		href?: string;
		/** The heading level that fits the page's outline (2 when the notice comes before the page's own h2). */
		level?: 2 | 3;
		/** `workspace`: inside the signed-in app, with its buttons and a warning panel. */
		variant?: 'auth' | 'workspace';
		/**
		 * An AI app's sign-in (/login in AI mode, C4 design §14h). It belongs to this
		 * browser, so this page's link can't continue it in Chrome or Safari: the
		 * notice says to start again from the AI app there, and offers no link.
		 */
		aiSignIn?: boolean;
	} = $props();
	const button = $derived(variant === 'workspace' ? 'k-button' : 'o-button outline');
	// Tests pass the user agent and address; the page reads the browser's on mount.
	const fromProps = () => ({
		browser: userAgent !== undefined ? inAppBrowser(userAgent) : undefined,
		here: href !== undefined ? shareableURL(href) : ''
	});
	let browser = $state<InAppBrowser | undefined>(fromProps().browser);
	let here = $state(fromProps().here);
	onMount(() => {
		browser = inAppBrowser(userAgent ?? navigator.userAgent);
		here = shareableURL(href ?? window.location.href);
	});
	const app = $derived(browser ? inAppBrowserName(browser) : '');
	const uid = $props.id();
	let copied = $state(false);
	let failed = $state(false);
	const feedback = copyFeedback((value) => (copied = value));
	onDestroy(() => feedback.dispose());
	async function copy() {
		failed = false;
		const ok = await copyText(here, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) feedback.copied();
		else failed = true;
	}
</script>

{#if browser}
	<section class="o-inapp" class:workspace={variant === 'workspace'} aria-labelledby="o-inapp-{uid}">
		<svelte:element this={`h${level}`} id="o-inapp-{uid}" class="o-inapp-title"><Globe size={18} aria-hidden="true" />{t('เปิดใน Chrome หรือ Safari', 'Open in Chrome or Safari')}</svelte:element>
		<p>{t(`${app} เปิดหน้านี้ในเบราว์เซอร์ของแอป ซึ่ง Google ไม่ให้เข้าสู่ระบบ`, `${app} opened this page in its own browser, where Google won't sign you in.`)}</p>
		{#if aiSignIn}
			<p class="o-inapp-step">{t('ถ้าจะใช้ Google ให้เปิด Chrome หรือ Safari แล้วเริ่มเชื่อมใหม่จากแอป AI', 'To use Google, open Chrome or Safari and start connecting again from your AI app.')}</p>
		{:else if browser === 'line'}
			<a class={button} href={lineExternalURL(here)}>{t('เปิดใน Chrome หรือ Safari', 'Open in Chrome or Safari')}<ExternalLink size={16} aria-hidden="true" /></a>
		{:else}
			<p class="o-inapp-step">{t('แตะ ⋯ มุมขวาบน แล้วเลือก “เปิดในเบราว์เซอร์” หรือคัดลอกลิงก์ไปวางเอง', 'Tap ⋯ at the top right and choose “Open in browser”, or copy the link and paste it yourself.')}</p>
		{/if}
		{#if !aiSignIn}
			<button type="button" class={button} onclick={copy}>
				{#if copied}<Check size={16} aria-hidden="true" />{t('คัดลอกลิงก์แล้ว', 'Link copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกลิงก์', 'Copy the link')}{/if}
			</button>
			<span class="o-inapp-announce" role="status" aria-live="polite">{copied ? t('คัดลอกลิงก์แล้ว', 'Link copied') : ''}</span>
			{#if failed}<p class="o-inapp-failed" role="alert">{t('คัดลอกไม่ได้ กดค้างที่ลิงก์นี้แล้วคัดลอก:', 'Copy failed. Press and hold this link to copy it:')} <span class="o-inapp-url">{here}</span></p>{/if}
		{/if}
	</section>
{/if}

<style>
	/* orca-type-remap v1 */
	/* The sign-in page is dark (--login-*), the invite page light (--orca-*). */
	.o-inapp {
		display: grid;
		gap: 10px;
		margin: 18px 0 4px;
		padding: 16px;
		border: 1px solid var(--login-citron, var(--orca-line-strong));
		border-radius: 12px;
		background: var(--login-surface-2, var(--orca-surface));
	}
	/* First in its card (the invite page): space below, not above. */
	.o-inapp:first-child {
		margin: 0 0 22px;
	}
	/* Doubled class: beats the auth form's `.orca.o-auth-page .o-auth-form h2` when the notice is an h2. */
	.o-inapp .o-inapp-title.o-inapp-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--login-text, var(--orca-ink));
		font-size: 15px;
		font-weight: 700;
		line-height: 1.4;
	}
	.o-inapp p {
		margin: 0;
		color: var(--login-muted, var(--orca-muted));
		font-size: 13.5px;
		line-height: 1.6;
	}
	.o-inapp .o-inapp-step {
		color: var(--login-text-2, var(--orca-ink));
	}
	.o-inapp :global(.o-button) {
		gap: 8px;
		margin: 0;
	}
	/* Inside the workspace: a warning panel on the page's own tokens. */
	.o-inapp.workspace {
		grid-template-columns: minmax(0, 1fr);
		justify-items: start;
		margin: 0 0 24px;
		border-color: var(--orca-warn-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-warn-bg);
	}
	.o-inapp.workspace .o-inapp-title :global(svg) {
		flex: none;
		color: var(--orca-warn);
	}
	.o-inapp.workspace p {
		color: var(--orca-text-2);
	}
	.o-inapp .o-inapp-failed {
		color: var(--login-deny, var(--orca-deny));
		font-size: 12.5px;
	}
	.o-inapp-url {
		overflow-wrap: anywhere;
		user-select: all;
	}
	.o-inapp-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
