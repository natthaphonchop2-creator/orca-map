<script lang="ts">
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { getCatalogPresentation } from '$lib/orca/catalog-data';

	// A program's logo on a tile. `name` is the catalog's own name (the logo key),
	// not the name shown to people.
	let { name, size = 40, muted = false }: { name: string; size?: number; muted?: boolean } = $props();
	const icon = $derived(Math.round(size * 0.62));
	// No mark that stays sharp (W0): the program's name as text, sized to the whole tile.
	const mark = $derived(!!getCatalogPresentation(name).icon);
	const word = $derived(name.trim().split(/\s+/)[0] || name);
	const textSize = $derived(Math.max(6, Math.min(size * 0.32, Math.round(((size * 1.45) / Math.max(word.length, 3)) * 10) / 10)));
</script>

<span class="program-logo" class:muted style={`--program-logo-size: ${size}px`} aria-hidden="true"
	>{#if mark}<CatalogIcon {name} size={icon} />{:else}<span class="program-logo-name" style={`font-size: ${textSize}px`}>{word}</span>{/if}</span
>

<style>
	.program-logo {
		display: grid;
		flex: none;
		place-items: center;
		width: var(--program-logo-size);
		height: var(--program-logo-size);
		border: 1px solid var(--orca-line);
		border-radius: calc(var(--program-logo-size) * 0.27);
		/* In dark the logo itself sits on its own light plate (orca-theme.css §6); the tile stays the surface. */
		background: var(--orca-surface);
		overflow: hidden;
	}
	.program-logo-name {
		max-width: calc(100% - 4px);
		overflow: hidden;
		color: var(--orca-ink);
		font-weight: 600;
		line-height: 1.1;
		white-space: nowrap;
	}
	.program-logo.muted {
		filter: grayscale(1);
		opacity: 0.45;
	}
</style>
