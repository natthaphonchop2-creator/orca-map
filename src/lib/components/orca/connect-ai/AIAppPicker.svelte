<script lang="ts">
	import { ChevronDown, CodeXml, Puzzle, SquareCode, SquareTerminal, Wind } from '@lucide/svelte';
	import type { AIApp } from '$lib/orca/client-config';
	import { DEV_APPS, appName, isChatApp } from '$lib/orca/connect-ai';
	import { t } from '$lib/orca/locale.svelte';
	import ToolIcon from '$lib/orca/ToolIcon.svelte';
	import ChoiceTile from '../ui/ChoiceTile.svelte';

	// Step 1: Claude or ChatGPT as two large tiles; developer tools behind a
	// link, so most people never see them.
	let { app, onselect }: { app: AIApp; onselect: (app: AIApp) => void } = $props();
	const uid = $props.id();
	let devOpen = $state(false);
	// A developer tool chosen earlier opens the list it lives in.
	$effect.pre(() => {
		if (!isChatApp(app)) devOpen = true;
	});
	const devDescription = $derived<Record<(typeof DEV_APPS)[number], string>>({
		'claude-code': t('ใช้ในเทอร์มินัล', 'In the terminal'),
		codex: t('เทอร์มินัลหรือแอป', 'Terminal or app'),
		cursor: t('ติดตั้งด้วยคลิกเดียว', 'One-click install'),
		vscode: t('ติดตั้งด้วยคลิกเดียว', 'One-click install'),
		windsurf: t('เพิ่มในไฟล์ตั้งค่า', 'Add to its config file'),
		other: t('แอปอื่นที่รองรับ MCP', 'Any other MCP app')
	});
	const choose = (value: string) => onselect(value as AIApp);
</script>

<div class="ca-tiles" role="radiogroup" aria-label={t('AI ที่คุณใช้', 'The AI you use')}>
	<ChoiceTile name="ca-ai-app-{uid}" value="claude" selected={app} title="Claude" description={t('เว็บ claude.ai และแอปบนคอม/มือถือ', 'claude.ai on the web, desktop and phone')} onselect={choose}>
		{#snippet mark()}<span class="ca-logo"><ToolIcon name="claude" size={30} decorative /></span>{/snippet}
	</ChoiceTile>
	<ChoiceTile name="ca-ai-app-{uid}" value="chatgpt" selected={app} title="ChatGPT" description={t('ต้องใช้ Plus, Pro หรือ Business', 'Needs Plus, Pro or Business')} onselect={choose}>
		{#snippet mark()}<span class="ca-logo"><ToolIcon name="chatgpt" size={30} decorative /></span>{/snippet}
	</ChoiceTile>
</div>

<button type="button" class="ca-dev-toggle" aria-expanded={devOpen} aria-controls="ca-dev-tools-{uid}" onclick={() => (devOpen = !devOpen)}>
	<CodeXml size={16} aria-hidden="true" />
	<span class="ca-dev-title">{t('เครื่องมือสำหรับนักพัฒนา', 'Developer tools')}</span>
	<span class="ca-dev-list">Claude Code, Codex, Cursor, VS Code {t('และอื่น ๆ', 'and more')}</span>
	<ChevronDown size={16} aria-hidden="true" class={devOpen ? 'ca-turned' : ''} />
</button>
{#if devOpen}
	<div class="ca-dev-tiles" id="ca-dev-tools-{uid}" role="radiogroup" aria-label={t('เครื่องมือสำหรับนักพัฒนา', 'Developer tools')}>
		{#each DEV_APPS as value (value)}
			<ChoiceTile name="ca-ai-app-{uid}" {value} selected={app} title={appName(value, t)} description={devDescription[value]} onselect={choose}>
				{#snippet mark()}
					<span class="ca-logo small">
						{#if value === 'claude-code'}<ToolIcon name="claude" size={22} decorative />
						{:else if value === 'cursor'}<ToolIcon name="cursor" size={22} decorative />
						{:else if value === 'codex'}<SquareTerminal size={18} aria-hidden="true" />
						{:else if value === 'vscode'}<SquareCode size={18} aria-hidden="true" />
						{:else if value === 'windsurf'}<Wind size={18} aria-hidden="true" />
						{:else}<Puzzle size={18} aria-hidden="true" />{/if}
					</span>
				{/snippet}
			</ChoiceTile>
		{/each}
	</div>
{/if}

<style>
	/* orca-type-remap v1 */
	.ca-tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}
	.ca-tiles :global(.orca-choice) {
		padding: 18px;
	}
	.ca-tiles :global(.orca-choice-title) {
		font-size: 16px;
		line-height: 1.3;
	}
	.ca-logo {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border: 1px solid var(--orca-line);
		border-radius: 12px;
		background: var(--orca-logo-tile);
		color: var(--orca-text-2);
	}
	.ca-logo.small {
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: var(--orca-surface-2);
	}
	/* The tile is the logo's light plane already. */
	.ca-logo :global(.orca-tool-icon) {
		padding: 0 !important;
		background: transparent !important;
	}
	.ca-dev-toggle {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin-top: 14px;
		padding: 4px 6px;
		margin-left: -6px;
		border: 0;
		border-radius: var(--orca-radius-sm);
		background: transparent;
		color: var(--orca-text-2);
		font: inherit;
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
	}
	.ca-dev-toggle:hover {
		background: var(--orca-hover);
	}
	.ca-dev-title {
		font-weight: 600;
	}
	.ca-dev-list {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.ca-dev-toggle :global(svg) {
		flex: none;
		transition: transform 0.15s var(--orca-ease);
	}
	.ca-dev-toggle :global(.ca-turned) {
		transform: rotate(180deg);
	}
	.ca-dev-tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-top: 12px;
	}
	.ca-dev-tiles :global(.orca-choice) {
		gap: 10px;
		padding: 12px 12px 12px 14px;
	}
	.ca-dev-tiles :global(.orca-choice-title) {
		font-size: 13.5px;
	}
	.ca-dev-tiles :global(.orca-choice-description) {
		font-size: 12px;
	}
	.ca-dev-tiles :global(.orca-choice-radio) {
		width: 18px;
		height: 18px;
	}
	@container ca (max-width: 760px) {
		.ca-dev-tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@container ca (max-width: 460px) {
		.ca-tiles,
		.ca-dev-tiles {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
