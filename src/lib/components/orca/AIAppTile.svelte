<script lang="ts">
	import { KeyRound, Sparkles } from '@lucide/svelte';
	import type { AppKind } from '$lib/orca/connected-ai-apps';

	// The one tile before an AI app's name (แอป AI ที่เชื่อมอยู่, its confirm
	// dialog, and เชื่อม AI ของฉัน's "AI ที่คุณเชื่อมไว้"): Claude and ChatGPT as a
	// letter in the app's own colour,
	// a key or any other app as an icon on the quiet fill. Decorative only: the
	// name always sits next to it.
	let { kind, size = 32 }: { kind: AppKind; size?: number } = $props();
	const icon = $derived(Math.round(size / 2));
</script>

<span class="ai-app-tile kind-{kind}" style:--ai-tile-size="{size}px" aria-hidden="true"
	>{#if kind === 'claude'}C{:else if kind === 'chatgpt'}G{:else if kind === 'key'}<KeyRound size={icon} />{:else}<Sparkles size={icon} />{/if}</span
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
	/* The apps' own colours are the only literals here: each is shaded from the
	   brand colour so its white letter (--orca-on-deny: white on a solid fill in
	   both themes) reads at 4.5:1 or better. */
	.ai-app-tile.kind-claude {
		background: #b85a3b;
		box-shadow: none;
		color: var(--orca-on-deny);
	}
	.ai-app-tile.kind-chatgpt {
		background: #0e8467;
		box-shadow: none;
		color: var(--orca-on-deny);
	}
</style>
