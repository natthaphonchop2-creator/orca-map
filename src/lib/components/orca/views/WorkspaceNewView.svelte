<script lang="ts">
	import type { OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import EveryoneOneClick from '../workspace/EveryoneOneClick.svelte';
	import WorkspaceCreateForm from '../workspace/WorkspaceCreateForm.svelte';

	// view=new: the short create form; with everyone=1&connection=ID, the
	// one-click "ให้ทุกคนในบริษัทใช้" for that program (proposal §3.5).
	let {
		data,
		connectionID = '',
		everyone = false,
		onsaved
	}: {
		/** The company's live records (no archived ones). */
		data: OrcaBootstrap;
		connectionID?: string;
		everyone?: boolean;
		/** `added`: the program the one click added to a company-wide workspace that already existed. */
		onsaved: (hub: OrcaHub, added?: string) => Promise<void>;
	} = $props();
</script>

{#if everyone && connectionID}<EveryoneOneClick {data} {connectionID} {onsaved} />
{:else}<WorkspaceCreateForm {data} initialConnectionID={connectionID} {onsaved} />{/if}
