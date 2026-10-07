<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { programStep } from '$lib/orca/program-catalog';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import AddProgramFlow from '../programs/AddProgramFlow.svelte';

	// view=add-program (&source=…&step=connect|tools&account=…&return=new|welcome): the
	// connect page (W0). Choosing a program is the catalog dialog on โปรแกรม, and the
	// old step 4 is the program's page (navigation redirects both). Managers only.
	let {
		data,
		sourceID = '',
		onchanged
	}: {
		/** The company's data with its archived records. */
		data: OrcaBootstrap;
		/** Without archived and removed records (kept for the page's call; the flow filters itself). */
		activeData?: OrcaBootstrap;
		sourceID?: string;
		onchanged: () => Promise<void>;
	} = $props();

	const params = $derived(page.url.searchParams);
	const step = $derived(programStep(params));
</script>

<AddProgramFlow
	{data}
	{step}
	sourceID={step === 'choose' ? '' : sourceID}
	programAccountID={step === 'choose' ? '' : (params.get('account') ?? '')}
	connectionID={params.get('connection') ?? ''}
	returnTo={params.get('return')}
	address={page.url.pathname + page.url.search}
	navigate={(href) => goto(href, { keepFocus: true, noScroll: true })}
	startCompany={params.get('as') === 'company'}
	{onchanged}
/>
