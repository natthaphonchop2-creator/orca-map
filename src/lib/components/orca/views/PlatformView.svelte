<script lang="ts">
	import { Globe } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { term } from '$lib/orca/glossary';
	import type { PlatformSection } from '$lib/orca/navigation';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import ConnectionSettings from '../ConnectionSettings.svelte';
	import GoogleSignInSettings from '../GoogleSignInSettings.svelte';
	import OAuthApps from '../OAuthApps.svelte';
	import PilotInbox from '../PilotInbox.svelte';
	import PlatformCompanies from '../PlatformCompanies.svelte';
	import TeamAccess from '../TeamAccess.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import PlatformOverview from './PlatformOverview.svelte';

	// view=platform&section=…: the ORCA team's area, always in the default
	// company. U2 replaces each section with its own page; until then each
	// mounts the component that does the job today. The page only mounts this
	// for data.platformOperator; the checks here repeat it.
	let {
		data,
		activeData,
		section,
		onchanged
	}: {
		data: OrcaBootstrap;
		activeData: OrcaBootstrap;
		section: PlatformSection;
		onchanged: () => Promise<void>;
	} = $props();
</script>

{#if data.platformOperator}
	<p class="platform-badge"><span><Globe size={13} aria-hidden="true" />{term('platform', t)}</span>{t('ใช้กับทุกบริษัทบน ORCA ลูกค้าไม่เห็นหน้านี้', 'Applies to every company on ORCA. Customers never see this page.')}</p>
	{#if section === 'companies'}<PageHeader title={term('customerCompanies', t)} subtitle={t('เปิดบริษัทให้ลูกค้า แล้วส่งลิงก์ให้เจ้าของบริษัทเข้ามาดูแลเอง', 'Open a company for a customer and send its owner a link.')} /><PlatformCompanies />
	{:else if section === 'pilots' && data.canReviewPilotRequests}<PilotInbox />
	{:else if section === 'signin'}<PageHeader title={term('googleSignIn', t)} subtitle={t('ลูกค้าทุกบริษัทเข้า ORCA และรับคำเชิญด้วยบัญชี Google ของตัวเอง ตั้งค่าครั้งเดียวที่นี่', 'Every customer signs in and accepts invitations with their own Google account. Set it up once here.')} /><GoogleSignInSettings data={activeData} />
	{:else if section === 'oauth-apps'}<OAuthApps data={activeData} />
	{:else if section === 'catalog'}{#key section}<ConnectionSettings data={activeData} {onchanged} initiallyAddSource />{/key}
	{:else if section === 'breakglass'}<div class="arcade-embedded"><TeamAccess {data} {onchanged} /></div>
	{:else}<PlatformOverview canReviewPilotRequests={data.canReviewPilotRequests === true} />
	{/if}
{/if}

<style>
	.platform-badge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin: 0 0 14px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.platform-badge span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 10px;
		border-radius: 999px;
		/* Ink in light (the mockup); citron in dark, where a white badge would glare. */
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
		font-size: 12px;
		font-weight: 600;
	}
</style>
