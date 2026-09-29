<script lang="ts">
	import type { OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import WorkspaceDetail from '../WorkspaceDetail.svelte';

	// view=hub&hub=ID(&tab=overview|programs|people|settings): one AI
	// workspace, its tabs edited in place (U5). Old tabs and the old edit form
	// already redirect here (navigation.ts).
	let { data, hub, onchanged }: { data: OrcaBootstrap; hub: OrcaHub; onchanged: () => Promise<void> } = $props();
</script>

{#key hub.id}<WorkspaceDetail {data} {hub} {onchanged} />{/key}
