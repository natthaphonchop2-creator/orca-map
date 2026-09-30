<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { ORCA_SUPPORT_LINE_REL, supportLinks } from '$lib/orca/support';

	// The ORCA team's LINE and email inside a sentence: "… ส่งข้อความหาทีม ORCA
	// ทาง LINE <LINE ID> · อีเมล <address>". The channels come from
	// $lib/orca/support; LINE opens in a new tab, the email is a mailto: link.
	// `midSentence` (after "หรือ" / "or"): the English words start in lower case.
	let { midSentence = false }: { midSentence?: boolean } = $props();
	const links = $derived(supportLinks(t, midSentence));
</script>

<span class="orca-support"
	>{#each links as link, index (link.kind)}{#if index > 0}<span class="orca-support-sep" aria-hidden="true">{' · '}</span>{/if}{#if link.newTab}<a
				href={link.href}
				target="_blank"
				rel={ORCA_SUPPORT_LINE_REL}>{link.label} <span class="orca-support-handle">{link.handle}</span><ExternalLink size={13} aria-hidden="true" /><span class="orca-support-hidden">{t(' (เปิดในแท็บใหม่)', ' (opens in a new tab)')}</span></a
			>{:else}<a href={link.href}>{link.label} <span class="orca-support-handle">{link.handle}</span></a>{/if}{/each}</span
>

<style>
	.orca-support a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
	}
	.orca-support a:hover {
		text-decoration-color: currentColor;
	}
	/* A LINE ID or an address never breaks in the middle. */
	.orca-support-handle {
		white-space: nowrap;
	}
	/* The icon stays on the line (the base styles make an svg a block). */
	.orca-support a :global(svg) {
		display: inline-block;
		margin-inline-start: 3px;
		vertical-align: -1px;
	}
	.orca-support-sep {
		color: var(--orca-subtle);
	}
	.orca-support-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
