<script lang="ts">
	import { Globe } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';

	// The small mark on every page of the platform area (PageHeader's eyebrow):
	// these settings are the ORCA team's and apply to every company.
</script>

<span class="platform-tag"><Globe size={13} strokeWidth={2.2} aria-hidden="true" />{term('platform', t)}</span>
<span class="platform-scope">{t('ใช้กับทุกบริษัทบน ORCA ลูกค้าไม่เห็นหน้านี้', 'Applies to every company on ORCA. Customers never see this page.')}</span>

<style>
	.platform-tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px 2px 8px;
		border-radius: 999px;
		/* Ink in light (the mockup); citron in dark, where a white badge would glare. */
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.6;
		white-space: nowrap;
	}
	.platform-scope {
		color: var(--orca-muted);
		font-size: 13px;
	}
</style>
