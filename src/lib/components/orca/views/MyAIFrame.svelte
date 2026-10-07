<script module lang="ts">
	import { term as glossaryTerm } from '$lib/orca/glossary';
	/** AI ของฉัน's two tabs for Owners and Admins: ของฉัน (view=connect-ai) and ทั้งบริษัท (view=secrets). */
	export function myAITabs(translate: (th: string, en: string) => string) {
		return [
			{ id: 'connect-ai', label: glossaryTerm('mine', translate), href: '/app?view=connect-ai' },
			{ id: 'secrets', label: glossaryTerm('wholeCompany', translate), href: '/app?view=secrets' }
		];
	}
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { appsFilter } from '$lib/orca/connected-ai-apps';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import ConnectedAIApps from '../ConnectedAIApps.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import PageTabs from '../ui/PageTabs.svelte';
	import { claimPageHeader } from '../ui/page-header-context';

	// AI ของฉัน › ทั้งบริษัท (W0, view=secrets): every AI app and key connected to
	// the company, which used to be ตรวจสอบ › แอป AI ที่เชื่อมอยู่. Owners and
	// Admins only (the router sends anyone else to their own AI ของฉัน). Its
	// chips stay in the address: &filter=stale|noexpiry&holder=<id>.
	let { data }: { data: OrcaBootstrap } = $props();
	claimPageHeader();
	const filter = $derived(appsFilter(page.url.searchParams.get('filter')));
	const holder = $derived(page.url.searchParams.get('holder') ?? '');
</script>

<PageHeader frame title={term('myAI', t)} subtitle={t('ใช้ ORCA ใน ChatGPT หรือ Claude', 'Use ORCA in ChatGPT or Claude.')} />
<PageTabs tabs={myAITabs(t)} current="secrets" label={term('myAI', t)} />
<ConnectedAIApps {data} {filter} {holder} />
