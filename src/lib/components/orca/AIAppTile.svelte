<script lang="ts">
	import { KeyRound, Sparkles } from '@lucide/svelte';
	import ToolIcon from '$lib/orca/ToolIcon.svelte';
	import type { AppKind } from '$lib/orca/connected-ai-apps';

	// The one tile before an AI app's name (แอป AI ที่เชื่อมอยู่, its confirm
	// dialog, and AI ของฉัน's "AI ที่คุณเชื่อมไว้"): Claude and ChatGPT as their
	// real logo files on a plain tile (W0: real logos only, the same as AI ของฉัน's
	// cards), a key or any other app as a grey icon. Decorative only: the name
	// always sits next to it.
	let { kind, size = 32 }: { kind: AppKind; size?: number } = $props();
	const icon = $derived(Math.round(size / 2));
</script>

<span class="ai-app-tile kind-{kind}" style:--ai-tile-size="{size}px" aria-hidden="true"
	>{#if kind === 'claude' || kind === 'chatgpt'}<ToolIcon name={kind} size={Math.round(size * 0.62)} decorative />{:else if kind === 'key'}<KeyRound size={icon} />{:else}<Sparkles size={icon} />{/if}</span
>

<style>
	.ai-app-tile {
		display: grid;
		flex: none;
		place-items: center;
		width: var(--ai-tile-size);
		height: var(--ai-tile-size);
		border-radius: calc(var(--ai-tile-size) / 4);
		background: var(--orca-secondary);
		box-shadow: inset 0 0 0 1px var(--orca-line);
		color: var(--orca-text-2);
		font-size: calc(var(--ai-tile-size) * 0.42);
		font-weight: 800;
		line-height: 1;
	}
	/* A real logo sits on the plain surface with a hairline, like a program's. */
	.ai-app-tile.kind-claude,
	.ai-app-tile.kind-chatgpt {
		background: var(--orca-surface);
		box-shadow: inset 0 0 0 1px var(--orca-line);
	}
</style>
