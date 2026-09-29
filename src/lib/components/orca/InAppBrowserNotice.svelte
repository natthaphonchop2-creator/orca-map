<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Check, Copy, ExternalLink, Globe } from '@lucide/svelte';
	import { inAppBrowser, lineExternalURL, shareableURL, type InAppBrowser } from '$lib/orca/in-app-browser';
	import { t } from '$lib/orca/locale.svelte';
	import { copyFeedback, copyText } from './ui/copy';

	// Google refuses to sign anyone in inside LINE's and Facebook's in-app
	// browsers (workspace UX critique 13). On /login and /invite this asks the
	// person to open the same page in Chrome or Safari. The page's own flow
	// stays exactly as it is below it.
	let { userAgent, href }: { /** For tests; the browser's own by default. */ userAgent?: string; href?: string } = $props();
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
	const app = $derived(browser === 'line' ? 'LINE' : 'Facebook');
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
	<section class="o-inapp" aria-labelledby="o-inapp-title">
		<h3 id="o-inapp-title"><Globe size={18} aria-hidden="true" />{t('เปิดใน Chrome หรือ Safari', 'Open in Chrome or Safari')}</h3>
		<p>{t(`${app} เปิดหน้านี้ในเบราว์เซอร์ของแอป ซึ่ง Google ไม่ให้เข้าสู่ระบบ`, `${app} opened this page in its own browser, where Google won't sign you in.`)}</p>
		{#if browser === 'line'}
			<a class="o-button" href={lineExternalURL(here)}>{t('เปิดใน Chrome หรือ Safari', 'Open in Chrome or Safari')}<ExternalLink size={16} aria-hidden="true" /></a>
		{:else}
			<p class="o-inapp-step">{t('แตะ ⋯ มุมขวาบน แล้วเลือก “เปิดในเบราว์เซอร์” หรือคัดลอกลิงก์ไปวางเอง', 'Tap ⋯ at the top right and choose “Open in browser”, or copy the link and paste it yourself.')}</p>
		{/if}
		<button type="button" class="o-button" class:outline={browser === 'line'} onclick={copy}>
			{#if copied}<Check size={16} aria-hidden="true" />{t('คัดลอกลิงก์แล้ว', 'Link copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกลิงก์', 'Copy the link')}{/if}
		</button>
		<span class="o-inapp-announce" role="status" aria-live="polite">{copied ? t('คัดลอกลิงก์แล้ว', 'Link copied') : ''}</span>
		{#if failed}<p class="o-inapp-failed" role="alert">{t('คัดลอกไม่ได้ กดค้างที่ลิงก์นี้แล้วคัดลอก:', 'Copy failed. Press and hold this link to copy it:')} <span class="o-inapp-url">{here}</span></p>{/if}
	</section>
{/if}

<style>
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
	.o-inapp h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--login-text, var(--orca-ink));
		font-size: 16px;
		font-weight: 700;
		line-height: 1.4;
	}
	.o-inapp p {
		margin: 0;
		color: var(--login-muted, var(--orca-muted));
		font-size: 14px;
		line-height: 1.6;
	}
	.o-inapp .o-inapp-step {
		color: var(--login-text-2, var(--orca-ink));
	}
	.o-inapp :global(.o-button) {
		gap: 8px;
		margin: 0;
	}
	.o-inapp .o-inapp-failed {
		color: var(--login-deny, var(--orca-deny));
		font-size: 13px;
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
