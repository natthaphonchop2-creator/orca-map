<script lang="ts">
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';

	// A program's logo on a tile. `name` is the catalog's own name (the logo key),
	// not the name shown to people.
	let { name, size = 40, muted = false }: { name: string; size?: number; muted?: boolean } = $props();
	const icon = $derived(Math.round(size * 0.62));
</script>

<span class="program-logo" class:muted style={`--program-logo-size: ${size}px`} aria-hidden="true"><CatalogIcon {name} size={icon} /></span>

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
	.program-logo.muted {
		filter: grayscale(1);
		opacity: 0.45;
	}
</style>
