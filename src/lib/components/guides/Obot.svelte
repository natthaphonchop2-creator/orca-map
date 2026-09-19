<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';

	export type ObotAnimation = 'enter' | 'idle' | 'arrow' | 'arrow_idle';

	/** Auto-advance to the next item in a sequence. Looping animations omit this. */
	const ADVANCE_MS: Partial<Record<ObotAnimation, number>> = {
		enter: 400,
		arrow: 2000
	};

	interface Props {
		animation?: ObotAnimation | ObotAnimation[];
		size?: number;
		class?: string;
	}

	let { animation = 'idle', size = 64, class: klass = '' }: Props = $props();

	function normalizeSequence(value: ObotAnimation | ObotAnimation[]): ObotAnimation[] {
		const sequence = Array.isArray(value) ? value : [value];
		return sequence.length > 0 ? sequence : ['idle'];
	}

	function sequencesEqual(a: ObotAnimation[], b: ObotAnimation[]): boolean {
		return a.length === b.length && a.every((name, i) => name === b[i]);
	}

	function advance() {
		if (pendingSequence !== undefined) {
			sequence = pendingSequence;
			pendingSequence = undefined;
			sequenceIndex = 0;
		} else if (sequenceIndex < sequence.length - 1) {
			sequenceIndex += 1;
		}
	}

	// Capture initial sequence once; later prop changes queue via pendingSequence.
	let sequence = $state<ObotAnimation[]>(untrack(() => normalizeSequence(animation)));
	let sequenceIndex = $state(0);
	let pendingSequence = $state<ObotAnimation[] | undefined>();

	const activeAnimation = $derived(sequence[sequenceIndex] ?? 'idle');
	const fadeIn = untrack(() => normalizeSequence(animation)[0] === 'enter');

	$effect(() => {
		const next = normalizeSequence(animation);
		if (!sequencesEqual(next, sequence)) {
			pendingSequence = next;
		} else {
			pendingSequence = undefined;
		}
	});

	$effect(() => {
		const ms = ADVANCE_MS[activeAnimation];
		if (ms === undefined) {
			// Looping animation — apply a queued sequence immediately.
			if (pendingSequence !== undefined) {
				advance();
			}
			return;
		}

		const id = setTimeout(() => {
			advance();
		}, ms);
		return () => clearTimeout(id);
	});
</script>

<div
	in:fade={{ duration: fadeIn ? 400 : 0 }}
	out:fade={{ duration: 100 }}
	class="guide-khum relative flex items-center justify-center {klass}"
	style:width="{size}px"
	style:height="{size}px"
	role="img"
	aria-label="ORCA guide"
>
	<Logo class="h-full w-full" />
	{#if activeAnimation === 'arrow' || activeAnimation === 'arrow_idle'}
		<ArrowLeft class="text-primary absolute -top-2 -left-4 size-6" aria-hidden="true" />
	{/if}
</div>
