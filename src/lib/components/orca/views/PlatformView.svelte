<script lang="ts">
	import type { PlatformSection } from '$lib/orca/navigation';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import GoogleSignInSettings from '../GoogleSignInSettings.svelte';
	import OAuthApps from '../OAuthApps.svelte';
	import PilotInbox from '../PilotInbox.svelte';
	import PlatformCompanies from '../PlatformCompanies.svelte';
	import BreakGlassAccounts from '../platform/BreakGlassAccounts.svelte';
	import PlatformCatalog from '../platform/PlatformCatalog.svelte';
	import PlatformOverview from './PlatformOverview.svelte';

	// view=platform&section=…: the ORCA team's area, always in the default
	// company (critique 12). Each section is one page with the platform badge
	// in its header. The page mounts this only for data.platformOperator, and
	// the check here repeats it: a customer never gets any of these screens.
	// The server refuses every platform call to anyone else in any case.
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

{#if data.platformOperator === true}
	<div class="platform-page">
		{#if section === 'companies'}<PlatformCompanies />
		{:else if section === 'pilots' && data.canReviewPilotRequests}<PilotInbox />
		{:else if section === 'signin'}<GoogleSignInSettings data={activeData} />
		{:else if section === 'oauth-apps'}<OAuthApps data={activeData} />
		{:else if section === 'catalog'}<PlatformCatalog data={activeData} />
		{:else if section === 'breakglass'}<BreakGlassAccounts {data} {onchanged} />
		{:else}<PlatformOverview canReviewPilotRequests={data.canReviewPilotRequests === true} />
		{/if}
	</div>
{/if}

<style>
	.platform-page {
		min-width: 0;
	}
</style>
