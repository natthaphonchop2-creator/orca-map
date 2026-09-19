<script lang="ts">
	let { dark = false, compact = false }: { dark?: boolean; compact?: boolean } = $props();
</script>

<span class="orca-brand" class:dark aria-label="ORCA ออก้า">
	<span class="orca-symbol" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
	{#if !compact}<span class="orca-wordmark">orca<span class="orca-period">.</span></span>{/if}
</span>

<style>
	.orca-brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: #151823;
		line-height: 1;
		white-space: nowrap;
	}
	.orca-brand.dark {
		color: #f8f9fb;
	}
	.orca-wordmark {
		font-family: 'ORCA Noto Sans Thai', system-ui, sans-serif;
		font-weight: 800;
		font-size: 34px;
		letter-spacing: -0.04em;
	}
	.orca-period {
		color: var(--o-citron, #d5f478);
	}
	.orca-symbol {
		display: flex;
		align-items: center;
		gap: 3px;
		height: 34px;
		width: 34px;
		transform: rotate(-14deg);
	}
	.orca-symbol i {
		width: 6px;
		height: 15px;
		background: currentColor;
		border-radius: 8px;
	}
	.orca-symbol i:nth-child(2) {
		height: 31px;
	}
	.orca-symbol i:nth-child(3) {
		height: 23px;
	}
	.orca-symbol i:nth-child(4) {
		height: 11px;
	}
</style>
