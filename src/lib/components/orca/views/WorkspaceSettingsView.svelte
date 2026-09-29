<script lang="ts">
	import type { OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import WorkspaceWizard from '../WorkspaceWizard.svelte';

	// view=hub&tab=settings (&step=tools): editing a workspace. U5 replaces the
	// full form with in-place editing on the workspace's tabs; until then this
	// mounts today's edit form, opened at the tools step when asked.
	let {
		data,
		hub,
		step = '',
		onsaved,
		onreload
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		step?: string;
		onsaved: (hub: OrcaHub) => Promise<void>;
		onreload: () => Promise<void>;
	} = $props();
</script>

{#key `${hub.id}:${step}`}<WorkspaceWizard {data} existing={hub} initialStep={step === 'tools' ? 'tools' : undefined} {onsaved} {onreload} />{/key}
