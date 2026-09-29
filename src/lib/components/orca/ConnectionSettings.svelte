<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import { ProgramService } from '$lib/services/orca-u4';
	import AddProgramFlow from './programs/AddProgramFlow.svelte';
	import ProgramDetail from './programs/ProgramDetail.svelte';
	import SourceSetup from './SourceSetup.svelte';
	import PageHeader from './ui/PageHeader.svelte';

	// One program (view=servers&connection=ID) — or, for the pages that still
	// mount it by its old props: a program to connect (initialSourceID, now the
	// add-program flow) and the ORCA team's "add by MCP link" (initiallyAddSource,
	// platform › คลังโปรแกรม), which hands the new program to the same flow.
	let {
		data,
		onchanged,
		initialSourceID = '',
		initialConnectionID = '',
		initiallyAddSource = false
	}: {
		data: OrcaBootstrap;
		onchanged: () => Promise<void>;
		initialSourceID?: string;
		initialConnectionID?: string;
		initiallyAddSource?: boolean;
	} = $props();

	async function added(id: string) {
		await ProgramService.candidates(true);
		await goto(localeHref(`/app?view=add-program&source=${encodeURIComponent(id)}&step=connect`));
	}
</script>

{#if initialConnectionID}
	{#key initialConnectionID}<ProgramDetail {data} connectionID={initialConnectionID} {onchanged} />{/key}
{:else if initiallyAddSource}
	{#if data.platformOperator}
		<PageHeader
			title={t('คลังโปรแกรม', 'Program catalog')}
			subtitle={t('เพิ่มโปรแกรมใหม่ด้วยลิงก์ MCP แล้วพาไปเชื่อมบัญชีและเลือกสิ่งที่ AI ทำได้', 'Add a program by its MCP link, then connect it and choose what AI can do.')}
		/>
		<SourceSetup canCreate oncreated={added} />
	{/if}
{:else}
	<AddProgramFlow
		{data}
		step={initialSourceID ? 'connect' : 'choose'}
		sourceID={initialSourceID}
		address={page.url.pathname + page.url.search}
		navigate={(href) => goto(href, { keepFocus: true, noScroll: true })}
		{onchanged}
	/>
{/if}
