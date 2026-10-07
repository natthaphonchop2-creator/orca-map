<script lang="ts">
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';

	// The small mark on every page of the platform area (PageHeader's eyebrow):
	// the page is the ORCA team's, and no customer ever sees it. A page whose
	// settings every company shares (Google sign-in, OAuth apps, the catalog)
	// says so too; the companies list, the pilot requests and the main
	// company's break-glass accounts do not apply to every company.
	let { everyCompany = false }: { everyCompany?: boolean } = $props();
</script>

<span class="platform-tag">{term('platform', t)}</span>
<span class="platform-scope"
	>{everyCompany
		? t('ใช้กับทุกบริษัทบน ORCA ลูกค้าไม่เห็นหน้านี้', 'Applies to every company on ORCA. Customers never see this page.')
		: t('ลูกค้าไม่เห็นหน้านี้', 'Customers never see this page.')}</span
>

<style>
	/* orca-type-remap v1 */
	/* W0: the platform's name as plain words, never a pill. */
	.platform-tag {
		color: var(--orca-ink);
		font-size: 12.5px;
		font-weight: 600;
		white-space: nowrap;
	}
	.platform-scope {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
</style>
