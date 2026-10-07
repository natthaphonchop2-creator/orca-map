<script lang="ts">
	import { getCatalogPresentation } from './catalog-data';

	// A program's logo. Without a mark that stays sharp (W0: no blurred favicon,
	// never a generic icon), the program's name is shown as text instead.
	let {
		name,
		size = 44,
		decorative = true
	}: { name: string; size?: number; decorative?: boolean } = $props();

	let failedSource = $state<string>();
	const source = $derived(getCatalogPresentation(name).icon);
	const showImage = $derived(!!source && source !== failedSource);
	const dimension = $derived(Math.max(16, Math.min(Number.isFinite(size) ? size : 44, 128)));
	// The name's first word, sized to the tile ("Lazada Seller API" → "Lazada").
	const word = $derived(name.trim().split(/\s+/)[0] || name);
	const textSize = $derived(Math.max(7, Math.round((dimension / Math.max(word.length, 4)) * 1.5 * 10) / 10));
</script>

<span
	class="orca-catalog-icon"
	class:orca-catalog-icon-fallback={!showImage}
	style={`--orca-catalog-icon-size: ${dimension}px`}
	aria-hidden={decorative ? 'true' : undefined}
	role={!decorative && !showImage ? 'img' : undefined}
	aria-label={!decorative && !showImage ? name : undefined}
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
		<span class="orca-catalog-name" style={`font-size: ${textSize}px`}>{word}</span>
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
		overflow: hidden;
		border-radius: 24%;
		background: var(--orca-secondary, var(--o-surface-soft, #f0f2ed));
		color: var(--orca-ink, var(--o-ink-soft, #677065));
	}
	.orca-catalog-name {
		max-width: 100%;
		overflow: hidden;
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: 0;
		text-overflow: clip;
		white-space: nowrap;
	}
</style>
