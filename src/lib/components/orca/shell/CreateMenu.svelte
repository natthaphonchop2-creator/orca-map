<script lang="ts">
	import { BookOpenText, Bot, BotMessageSquare, Boxes, FileText, KeyRound, Plus, ChevronDown, UserPlus, WandSparkles, Workflow } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { CreateIcon, CreateItem } from '$lib/orca/workspace-nav';
	import McpMark from './McpMark.svelte';
	import PopMenu from './PopMenu.svelte';

	// ＋ สร้าง ▾ (W0.1): the one primary button, and its menu anchored under it
	// (a bottom sheet on a phone). Rows come from workspace-nav's CREATE_GROUPS,
	// already filtered by role and feature; groups are separated by hairlines.
	// Each row: a line icon, a label and its shortcut, "C แล้ว X". Coming-soon
	// rows are greyed, skipped by the arrows and say เร็วๆ นี้.
	let { groups, open = $bindable(false) }: { groups: CreateItem[][]; open?: boolean } = $props();
	const labels: Record<CreateItem['id'], () => string> = {
		workspace: () => term('createWorkspace', t),
		program: () => term('addProgram', t),
		workflow: () => 'Workflow',
		skill: () => 'Skill',
		agent: () => term('orcaAgent', t),
		knowledge: () => term('createKnowledge', t),
		template: () => term('docTemplate', t),
		ai: () => term('connectAI', t),
		invite: () => term('inviteMember', t),
		account: () => term('companyAccount', t)
	};
	const icons: Record<Exclude<CreateIcon, 'mcp'>, typeof Boxes> = {
		workspaces: Boxes,
		workflows: Workflow,
		skills: WandSparkles,
		agent: Bot,
		knowledge: BookOpenText,
		template: FileText,
		'my-ai': BotMessageSquare,
		invite: UserPlus,
		'company-account': KeyRound
	};
</script>

<PopMenu id="orca-create-menu" label={term('create', t)} buttonClass="w1-create" sheet={term('create', t)} bind:open>
	{#snippet button()}<Plus size={16} strokeWidth={2.25} aria-hidden="true" /><span>{term('create', t)}</span><ChevronDown size={15} aria-hidden="true" />{/snippet}
	{#snippet children(close)}
		{#each groups as group, index (index)}
			<div class="cm-group" role="group">
				{#each group as item (item.id)}
					{#if item.soon}
						<div class="cm-row off" role="menuitem" aria-disabled="true" tabindex="-1" data-create={item.id}>
							{@render icon(item.icon)}<span class="cm-label">{labels[item.id]()}</span><span class="cm-hint">{term('soon', t)}</span>
						</div>
					{:else}
						<a class="cm-row" role="menuitem" tabindex="-1" href={localeHref(item.href)} data-create={item.id} aria-keyshortcuts={item.key ? `C ${item.key}` : undefined} onclick={close}>
							{@render icon(item.icon)}<span class="cm-label">{labels[item.id]()}</span>{#if item.key}<span class="cm-hint">{t(`C แล้ว ${item.key}`, `C then ${item.key}`)}</span>{/if}
						</a>
					{/if}
				{/each}
			</div>
		{/each}
	{/snippet}
</PopMenu>

{#snippet icon(name: CreateIcon)}
	{#if name === 'mcp'}<McpMark size={18} />{:else}{@const Icon = icons[name]}<Icon size={18} strokeWidth={1.75} aria-hidden="true" />{/if}
{/snippet}

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.cm-group + .cm-group {
		margin-top: 4px;
		padding-top: 4px;
		border-top: 1px solid var(--orca-line);
	}
	.cm-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 36px;
		padding: 0 10px;
		border-radius: var(--orca-radius);
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	a.cm-row:hover,
	a.cm-row:focus-visible {
		background: var(--orca-hover);
		outline: none;
		text-decoration: none;
	}
	.cm-row > :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.cm-label {
		flex: 1;
	}
	/* The shortcut: lighter than the label (review-landing 7). */
	.cm-hint {
		margin-left: 16px;
		color: var(--orca-subtle);
		font-size: 11.5px;
		font-weight: 400;
	}
	.cm-row.off {
		color: var(--orca-subtle);
		cursor: default;
	}
	@media (max-width: 720px) {
		.cm-row {
			min-height: 44px;
		}
		/* A phone has no keyboard shortcuts; เร็วๆ นี้ stays. */
		a.cm-row .cm-hint {
			display: none;
		}
	}
</style>
