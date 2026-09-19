<script lang="ts">
	import { getCatalogPresentation } from './catalog-data';
	import { Plug } from '@lucide/svelte';

	let {
		name,
		size = 44,
		decorative = true
	}: { name: string; size?: number; decorative?: boolean } = $props();

	let failedSource = $state<string>();
	const source = $derived(getCatalogPresentation(name).icon);
	const showImage = $derived(!!source && source !== failedSource);
	const dimension = $derived(Math.max(16, Math.min(Number.isFinite(size) ? size : 44, 128)));
</script>

<span
	class="orca-catalog-icon"
	class:orca-catalog-icon-fallback={!showImage}
	style={`--orca-catalog-icon-size: ${dimension}px`}
	aria-hidden={decorative ? 'true' : undefined}
	role={!decorative && !showImage ? 'img' : undefined}
	aria-label={!decorative && !showImage ? `${name} MCP` : undefined}
>
	{#if showImage}
		<img
			src={source}
			alt={decorative ? '' : name}
			width={dimension}
			height={dimension}
			loading="lazy"
			decoding="async"
			onerror={() => (failedSource = source)}
		/>
	{:else}
		<Plug size={Math.round(dimension * 0.57)} strokeWidth={1.7} aria-hidden="true" />
	{/if}
</span>

<style>
	.orca-catalog-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: var(--orca-catalog-icon-size);
		height: var(--orca-catalog-icon-size);
		line-height: 0;
		vertical-align: middle;
	}

	.orca-catalog-icon img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.orca-catalog-icon-fallback {
		border-radius: 24%;
		background: var(--o-surface-soft, #f0f2ed);
		color: var(--o-ink-soft, #677065);
	}
</style>
