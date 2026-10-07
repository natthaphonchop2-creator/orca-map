<script module lang="ts">
	export type StatusTone = 'neutral' | 'ok' | 'warn' | 'deny' | 'citron' | 'ink';
</script>

<script lang="ts">
	// `dotTone`: a neutral pill whose dot alone carries the state's colour (status colours only as dots).
	// Without it the dot is the pill's own, as before.
	let { label, tone = 'neutral', dot = false, dotTone, title }: { label: string; tone?: StatusTone; dot?: boolean; dotTone?: 'ok' | 'warn' | 'deny'; title?: string } = $props();
</script>

<span class="orca-pill {tone}" {title}>{#if dot}<span class="orca-pill-dot" class:tone-ok={dotTone === 'ok'} class:tone-warn={dotTone === 'warn'} class:tone-deny={dotTone === 'deny'} aria-hidden="true"></span>{/if}{label}</span>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	/* W0: a state is text with a dot, in its colour; never a filled pill or a badge. */
	.orca-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		flex: none;
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 500;
		line-height: 1.5;
		white-space: nowrap;
	}
	.orca-pill.ok {
		color: var(--orca-ink);
	}
	.orca-pill.warn {
		color: var(--orca-warn);
	}
	.orca-pill.deny {
		color: var(--orca-deny);
	}
	.orca-pill.citron,
	.orca-pill.ink {
		color: var(--orca-ink);
	}
	.orca-pill-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.orca-pill.ok .orca-pill-dot {
		background: var(--orca-ok);
	}
	/* A neutral state ("ยังไม่ได้เชื่อม") has a quiet dot. */
	.orca-pill.neutral .orca-pill-dot {
		background: var(--orca-muted);
	}
	.orca-pill .orca-pill-dot.tone-ok {
		background: var(--orca-ok);
	}
	.orca-pill .orca-pill-dot.tone-warn {
		background: var(--orca-warn);
	}
	.orca-pill .orca-pill-dot.tone-deny {
		background: var(--orca-deny);
	}
</style>
