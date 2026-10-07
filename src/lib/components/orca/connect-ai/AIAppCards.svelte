<script lang="ts">
	import { Check, ChevronDown, ChevronRight, Puzzle, SquareCode, SquareTerminal, Wind } from '@lucide/svelte';
	import type { AIApp } from '$lib/orca/client-config';
	import { DEV_APPS, appName } from '$lib/orca/connect-ai';
	import { t } from '$lib/orca/locale.svelte';
	import ToolIcon from '$lib/orca/ToolIcon.svelte';

	// AI ของฉัน (W0): one card per AI app. A card opens its sheet (the link, a
	// copy button and where to paste it). Claude and ChatGPT first; developer
	// tools behind a toggle, so most people never see them.
	let { connected = [], onopen }: { connected?: readonly AIApp[]; onopen: (app: AIApp) => void } = $props();
	const uid = $props.id();
	let devOpen = $state(false);
	const lines = $derived<Record<AIApp, string>>({
		claude: t('เว็บ claude.ai และแอปบนคอม/มือถือ', 'claude.ai on the web, desktop and phone'),
		chatgpt: t('ต้องใช้ Plus, Pro หรือ Business', 'Needs Plus, Pro or Business'),
		'claude-code': t('ใช้ในเทอร์มินัล', 'In the terminal'),
		codex: t('เทอร์มินัลหรือแอป', 'Terminal or app'),
		cursor: t('ติดตั้งด้วยคลิกเดียว', 'One-click install'),
		vscode: t('ติดตั้งด้วยคลิกเดียว', 'One-click install'),
		windsurf: t('เพิ่มในไฟล์ตั้งค่า', 'Add to its config file'),
		other: t('แอปอื่นที่รองรับ MCP', 'Any other MCP app')
	});
</script>

{#snippet card(app: AIApp, small: boolean)}
	<li>
		<button type="button" class="ai-card" class:small onclick={() => onopen(app)} aria-haspopup="dialog" data-app={app}>
			<span class="ai-logo">
				{#if app === 'claude' || app === 'claude-code'}<ToolIcon name="claude" size={small ? 22 : 28} decorative />
				{:else if app === 'chatgpt'}<ToolIcon name="chatgpt" size={28} decorative />
				{:else if app === 'cursor'}<ToolIcon name="cursor" size={22} decorative />
				{:else if app === 'codex'}<SquareTerminal size={18} aria-hidden="true" />
				{:else if app === 'vscode'}<SquareCode size={18} aria-hidden="true" />
				{:else if app === 'windsurf'}<Wind size={18} aria-hidden="true" />
				{:else}<Puzzle size={18} aria-hidden="true" />{/if}
			</span>
			<span class="ai-copy"><strong>{appName(app, t)}</strong><small>{lines[app]}</small></span>
			{#if connected.includes(app)}<span class="ai-state"><Check size={14} strokeWidth={2.25} aria-hidden="true" />{t('เชื่อมแล้ว', 'Connected')}</span>
			{:else}<ChevronRight size={16} class="ai-chevron" aria-hidden="true" />{/if}
		</button>
	</li>
{/snippet}

<ul class="ai-cards">
	{@render card('claude', false)}
	{@render card('chatgpt', false)}
</ul>
<button type="button" class="ai-dev-toggle" aria-expanded={devOpen} aria-controls="ai-dev-{uid}" onclick={() => (devOpen = !devOpen)}>
	<span>{t('เครื่องมือสำหรับนักพัฒนา', 'Developer tools')}</span>
	<small>Claude Code, Codex, Cursor, VS Code {t('และอื่น ๆ', 'and more')}</small>
	<ChevronDown size={16} aria-hidden="true" class={devOpen ? 'ai-turned' : ''} />
</button>
{#if devOpen}
	<ul class="ai-cards dev" id="ai-dev-{uid}">
		{#each DEV_APPS as app (app)}{@render card(app, true)}{/each}
	</ul>
{/if}

<style>
	.ai-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ai-cards.dev {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 10px;
	}
	.ai-card {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-width: 0;
		padding: 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ai-card:hover {
		border-color: var(--orca-line-strong);
	}
	.ai-card.small {
		padding: 12px;
	}
	.ai-logo {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--orca-line);
		border-radius: 10px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
	}
	.small .ai-logo {
		width: 32px;
		height: 32px;
		border-radius: 8px;
	}
	.ai-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.ai-copy strong {
		font-size: 14px;
		font-weight: 600;
	}
	.ai-copy small {
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ai-state {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
	.ai-card :global(.ai-chevron) {
		flex: none;
		color: var(--orca-subtle);
	}
	.ai-dev-toggle {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin-top: 12px;
		padding: 4px 0;
		border: 0;
		background: none;
		color: var(--orca-text-2);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.ai-dev-toggle small {
		color: var(--orca-muted);
		font-size: 12.5px;
		font-weight: 400;
	}
	.ai-dev-toggle :global(.ai-turned) {
		transform: rotate(180deg);
	}
	@media (max-width: 720px) {
		.ai-cards,
		.ai-cards.dev {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
