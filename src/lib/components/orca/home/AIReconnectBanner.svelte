<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';

	// Home after setup, when only the viewer's own AI sign-in lapsed (it
	// expired, or was disconnected: home-setup's aiLapsed). One line and the
	// way back, instead of the whole setup checklist again. `disconnected`:
	// the viewer did it themselves on this page, so it did not expire.
	let { disconnected = false }: { disconnected?: boolean } = $props();
</script>

<section class="home-reconnect" aria-label={t('การเชื่อม AI ของคุณ', 'Your AI connection')}>
	<CircleAlert size={18} aria-hidden="true" />
	<p>{disconnected ? t('คุณตัดการเชื่อม AI แล้ว', 'You disconnected your AI') : t('การเชื่อม AI ของคุณหมดอายุแล้ว', 'Your AI connection has expired')}</p>
	<a class="k-button small" href={localeHref('/app?view=connect-ai')}>{t('เชื่อมใหม่', 'Reconnect')}</a>
</section>

<style>
	.home-reconnect {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		margin-bottom: 20px;
		padding: 12px 16px 12px 18px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-warn-bg);
	}
	.home-reconnect > :global(svg) {
		flex: none;
		color: var(--orca-warn);
	}
	.home-reconnect p {
		flex: 1 1 200px;
		min-width: 0;
		margin: 0;
		color: var(--orca-ink);
		font-size: 14.5px;
		font-weight: 600;
	}
	.home-reconnect .k-button {
		flex: none;
	}
</style>
