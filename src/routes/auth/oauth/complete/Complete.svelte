<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import '$lib/components/orca/orca.css';
	import { initializeLocale, t } from '$lib/orca/locale.svelte';
	import { onMount } from 'svelte';

	type Props = {
		redirectURL: string;
	};

	let { redirectURL }: Props = $props();
	const REDIRECT_DELAY_SECONDS = 3;

	let redirecting = $state(false);
	let secondsRemaining = $state(REDIRECT_DELAY_SECONDS);

	function redirectNow() {
		if (!redirectURL) return;

		redirecting = true;
		window.location.href = redirectURL;
	}

	onMount(() => {
		initializeLocale();
		if (!redirectURL) return;

		secondsRemaining = REDIRECT_DELAY_SECONDS;

		const interval = window.setInterval(() => {
			secondsRemaining = Math.max(0, secondsRemaining - 1);
		}, 1000);
		const timeout = window.setTimeout(redirectNow, REDIRECT_DELAY_SECONDS * 1000);

		return () => {
			window.clearInterval(interval);
			window.clearTimeout(timeout);
		};
	});
</script>

<svelte:head>
	<title>{t('ยืนยันตัวตนเรียบร้อยแล้ว · ORCA', 'Authentication complete · ORCA')}</title>
</svelte:head>

<main id="main-content" class="orca oauth-page">
	<section class="oauth-card">
		<Logo class="oauth-logo h-10 w-auto" />
		<h1>
			{t('ยืนยันตัวตนเรียบร้อยแล้ว', 'Authentication complete')}
		</h1>

		<p>
			{#if !redirectURL}
				{t('คุณสามารถปิดหน้าต่างนี้ได้', 'You can now close this window.')}
			{:else if redirecting}
				{t('กำลังนำคุณกลับไป…', 'Redirecting…')}
			{:else}
				{t(
					`ORCA จะนำคุณกลับไปภายใน ${secondsRemaining} วินาที`,
					`You will be redirected in ${secondsRemaining} ${secondsRemaining === 1 ? 'second' : 'seconds'}.`
				)}
				<button class="oauth-link" type="button" onclick={redirectNow}
					>{t('ไปทันที', 'Redirect now')}</button
				>
			{/if}
		</p>
	</section>
</main>

<style>
	/* Formal confirmation card that matches the ORCA sign-in page. */
	.oauth-page {
		--orca-ink: #151823;
		--orca-surface: #ffffff;
		--orca-surface-2: #fafafa;
		--orca-line: #e5e7eb;
		--orca-muted: #5b6270;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 24px 16px;
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.6;
	}
	.oauth-card {
		display: grid;
		justify-items: center;
		gap: 8px;
		width: 100%;
		max-width: 420px;
		padding: 32px 28px;
		border: 1px solid var(--orca-line);
		border-radius: 12px;
		background: var(--orca-surface);
		text-align: center;
	}
	.oauth-card :global(.oauth-logo) {
		margin-bottom: 8px;
	}
	.oauth-card h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		line-height: 1.45;
	}
	.oauth-card p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.oauth-link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-ink);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.oauth-link:focus-visible {
		outline: 2px solid var(--orca-ink);
		outline-offset: 2px;
	}
</style>
