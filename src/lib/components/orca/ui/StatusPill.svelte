<script module lang="ts">
	export type StatusTone = 'neutral' | 'ok' | 'warn' | 'deny' | 'citron' | 'ink';
</script>

<script lang="ts">
	// `dotTone`: a neutral pill whose dot alone carries the state's colour (status colours only as dots).
	let { label, tone = 'neutral', dot = false, dotTone, title }: { label: string; tone?: StatusTone; dot?: boolean; dotTone?: 'ok' | 'warn' | 'deny'; title?: string } = $props();
</script>

<span class="orca-pill {tone}" {title}>{#if dot}<span class="orca-pill-dot {dotTone ? `tone-${dotTone}` : ''}" aria-hidden="true"></span>{/if}{label}</span>

<style>
	.orca-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		flex: none;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.5;
		white-space: nowrap;
	}
	.orca-pill.ok {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.orca-pill.warn {
		border-color: var(--orca-warn-line);
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
	}
	.orca-pill.deny {
		border-color: var(--orca-deny-line);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.orca-pill.citron {
		border-color: var(--orca-citron-line);
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
	}
	.orca-pill.ink {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.orca-pill-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	/* A neutral state ("ยังไม่ได้เชื่อม") has a quiet dot, as on the pinned button. */
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
