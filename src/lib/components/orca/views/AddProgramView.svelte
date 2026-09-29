<script lang="ts">
	import type { OrcaBootstrap } from '$lib/services/orca';
	import ConnectionSettings from '../ConnectionSettings.svelte';
	import ToolCatalog from '../ToolCatalog.svelte';

	// view=add-program (&source=…&step=connect). Until U4 builds the stepper,
	// step 1 is today's catalog and a chosen program opens today's setup.
	let {
		data,
		activeData,
		sourceID = '',
		onchanged
	}: {
		/** The company's data with its archived records (the setup filters them). */
		data: OrcaBootstrap;
		/** Without archived and removed records (the catalog). */
		activeData: OrcaBootstrap;
		sourceID?: string;
		onchanged: () => Promise<void>;
	} = $props();
</script>

{#if sourceID}
	{#key sourceID}<ConnectionSettings {data} {onchanged} initialSourceID={sourceID} />{/key}
{:else}
	<ToolCatalog data={activeData} {onchanged} />
{/if}
