<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';
	import type { AILapse } from '$lib/orca/home-setup';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaHub } from '$lib/services/orca';

	// Home after setup, when only the viewer's own AI lapsed (home-setup's
	// aiLapsed). One line and the way back, instead of the whole setup
	// checklist again. Why (`lapse`, aiLapse):
	// - `limited`: it still reaches some workspaces through their own links
	//   (`only`: "เฉพาะ ฝ่ายขาย"), never the company's link (B3 follow-up)
	// - `unreached`: a live sign-in reaches none of the viewer's workspaces now,
	//   which have their own sign-in (`own`): nothing expired (Codex review 72)
	// - `disconnected`: the viewer did it themselves on this page
	// - `expired`: no sign-in is left
	let {
		lapse = 'expired',
		only = '',
		own = []
	}: { lapse?: AILapse; only?: string; own?: readonly Pick<OrcaHub, 'id' | 'name'>[] } = $props();
	const message = $derived(
		lapse === 'limited'
			? t(`AI ของคุณใช้ได้${only}`, `Your AI reaches ${only}`)
			: lapse === 'unreached'
				? t('AI ที่เชื่อมไว้ยังใช้พื้นที่ทำงานของคุณไม่ได้', "The AI you connected can't use your workspaces yet")
				: lapse === 'disconnected'
					? t('คุณตัดการเชื่อม AI แล้ว', 'You disconnected your AI')
					: t('การเชื่อม AI ของคุณหมดอายุแล้ว', 'Your AI connection has expired')
	);
	// One workspace with its own sign-in: its link is on its overview; several: เชื่อม AI ของฉัน lists them.
	const ownOne = $derived(lapse === 'unreached' && own.length === 1 ? own[0] : undefined);
	const action = $derived(
		lapse === 'limited'
			? { href: localeHref('/app?view=connect-ai'), label: t('ใช้ลิงก์ของบริษัท', 'Use the company link') }
			: ownOne
				? { href: localeHref(`/app?view=hub&hub=${encodeURIComponent(ownOne.id)}&tab=overview`), label: t(`ใช้ลิงก์ของ ${ownOne.name}`, `Use ${ownOne.name}'s link`) }
				: lapse === 'unreached'
					? { href: localeHref('/app?view=connect-ai'), label: t('ดูลิงก์ที่ต้องใช้', 'See which link to use') }
					: { href: localeHref('/app?view=connect-ai'), label: t('เชื่อมใหม่', 'Reconnect') }
	);
</script>

<section class="home-reconnect" aria-label={t('การเชื่อม AI ของคุณ', 'Your AI connection')}>
	<CircleAlert size={18} aria-hidden="true" />
	<p>{message}</p>
	<a class="k-button small" href={action.href}>{action.label}</a>
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
	/* A long workspace name ("ใช้ลิงก์ของ …") wraps inside the button on a phone instead of overflowing (Codex review 73). */
	.home-reconnect .k-button {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 100%;
		padding-block: 6px;
		white-space: normal;
		overflow-wrap: anywhere;
		text-align: center;
	}
</style>
