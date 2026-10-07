<script lang="ts">
	import { tick } from 'svelte';
	import { CircleAlert } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { formErrorTitle, formErrors, type FormError } from './form-errors';

	// Every error at once, at the top of the form. Each item jumps to its field.
	// `focusKey` changes on every submit, so the summary takes focus again.
	let {
		errors,
		title,
		focusKey = 0
	}: {
		errors: Record<string, string | undefined | null | false> | FormError[] | undefined;
		title?: string;
		focusKey?: number;
	} = $props();
	const list = $derived(formErrors(errors));
	let box: HTMLDivElement | undefined = $state();
	$effect(() => {
		const key = focusKey;
		if (key && list.length) void tick().then(() => box?.focus());
	});
	function jump(event: MouseEvent, field?: string) {
		if (!field) return;
		const target = document.getElementById(field);
		if (!target) return;
		event.preventDefault();
		target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		target.focus({ preventScroll: true });
	}
</script>

{#if list.length}
	<div class="orca-form-errors" role="alert" tabindex="-1" bind:this={box}>
		<p class="orca-form-errors-title"><CircleAlert size={18} aria-hidden="true" />{title ?? formErrorTitle(list.length, t)}</p>
		<ul>
			{#each list as error, index (`${error.field ?? ''}:${index}`)}
				<li>{#if error.field}<a href={`#${error.field}`} onclick={(event) => jump(event, error.field)}>{error.message}</a>{:else}{error.message}{/if}</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	/* orca-type-remap v1 */
	.orca-form-errors {
		margin: 0 0 20px;
		padding: 14px 16px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
	}
	.orca-form-errors:focus-visible {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.orca-form-errors-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--orca-deny);
		font-size: 13.5px;
		font-weight: 700;
	}
	.orca-form-errors ul {
		margin: 8px 0 0;
		padding-left: 26px;
		font-size: 13.5px;
		line-height: 1.6;
	}
	.orca-form-errors a {
		color: var(--orca-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
