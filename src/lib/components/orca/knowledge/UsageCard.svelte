<script lang="ts">
	import { usageMeters } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import type { LibraryUsage } from '$lib/services/orca-library';

	// The company's file quota beside the file list (knowledge library v2):
	// space, the text read from files, and today's uploads.
	let { usage }: { usage: LibraryUsage } = $props();
	const meters = $derived(usageMeters(usage, t));
	const uid = $props.id();
</script>

<section class="um" aria-labelledby={`um-title-${uid}`}>
	<h2 id={`um-title-${uid}`}>{t('พื้นที่ของบริษัท', 'Your company’s quota')}</h2>
	<ul>
		{#each meters as meter (meter.key)}
			<li class:full={meter.full}>
				<span class="um-line"><span>{meter.label}</span><b>{meter.text}</b></span>
				<span class="um-bar" role="meter" aria-label={meter.label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(meter.ratio * 100)} aria-valuetext={meter.text}><i style:width={`${Math.round(meter.ratio * 100)}%`}></i></span>
				{#if meter.full}<small><i class="um-dot" aria-hidden="true"></i>{t('เต็มแล้ว', 'Full')}</small>{/if}
			</li>
		{/each}
	</ul>
	<p>{t('นับรวมทุกพื้นที่ทำงานของบริษัท', 'Counted across all of the company’s workspaces')}</p>
</section>

<style>
	.um {
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.um h2 {
		margin: 0 0 12px;
		font-size: 14px;
		font-weight: 600;
	}
	.um ul {
		display: grid;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.um li {
		display: grid;
		gap: 6px;
	}
	.um-line {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 2px 10px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.um-line b {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.um-bar {
		display: block;
		height: 4px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--orca-secondary);
	}
	.um-bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--orca-ink);
	}
	.um small {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--orca-ink);
		font-size: 12.5px;
		font-weight: 600;
	}
	.um-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-deny);
	}
	.um p {
		margin: 12px 0 0;
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
</style>
