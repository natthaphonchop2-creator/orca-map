<script lang="ts">
	import PublicFooter from './orca/PublicFooter.svelte';
	import Brand from './orca/Brand.svelte';
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<svelte:head><title>ORCA | {title}</title></svelte:head>

<div class="flex min-h-screen flex-col bg-base-100 text-base-content">
	<header class="border-b border-base-300 px-6 py-5">
		<div class="mx-auto flex max-w-3xl items-center gap-3 text-xl font-semibold"><Brand /></div>
	</header>
	<main class="mx-auto w-full max-w-3xl flex-1 px-6 py-12 leading-7">
		<p class="mb-3 text-sm text-muted-content">Local development installation</p>
		<h1 class="mb-8 text-3xl font-semibold">{title}</h1>
		<div class="space-y-6">{@render children()}</div>
	</main>
	<PublicFooter />
</div>
