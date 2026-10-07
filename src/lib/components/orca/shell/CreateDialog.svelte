<script lang="ts">
	import { Book, Bot, ChevronRight, Workflow, Zap } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { createOptions, type CreateOptionID } from '$lib/orca/workspace-nav';
	import Modal from '../ui/Modal.svelte';

	// สร้าง ▾ (W0): the one way in to make something. Each row has the same plain
	// line icon as its menu item, a title and one line, separated by hairlines.
	// Rows follow the role (workspace-nav's createOptions); Workflow is greyed.
	let { open = $bindable(false), canManage, skills }: { open?: boolean; canManage: boolean; skills: boolean } = $props();
	const options = $derived(createOptions({ canManage, skills }));
	const copy: Record<CreateOptionID, { title: () => string; line: () => string; icon: typeof Zap }> = {
		skill: { title: () => 'Skill', line: () => t('งานที่ AI ทำซ้ำได้ เช่น สรุปยอดขาย', 'Work AI can repeat, such as a sales summary'), icon: Zap },
		workflow: { title: () => 'Workflow', line: () => t('งานที่เริ่มเองตามเวลาหรือเหตุการณ์', 'Work that starts by itself on a schedule or an event'), icon: Workflow },
		'connect-ai': { title: () => t('เชื่อม AI', 'Connect AI'), line: () => t('ใช้ ORCA ใน ChatGPT หรือ Claude', 'Use ORCA in ChatGPT or Claude'), icon: Bot },
		knowledge: { title: () => t('เพิ่มความรู้', 'Add knowledge'), line: () => t('ไฟล์หรือข้อความที่ AI ใช้ตอบ', 'Files or text AI answers from'), icon: Book }
	};
</script>

<Modal bind:open title={term('create', t)}>
	<ul class="create-options">
		{#each options as option (option.id)}
			{@const row = copy[option.id]}
			<li>
				{#if option.disabled}
					<div class="create-option off" aria-disabled="true">
						<row.icon size={18} strokeWidth={1.75} aria-hidden="true" />
						<span class="create-copy"><strong>{row.title()}</strong><small>{row.line()}</small></span>
						<span class="create-later">{term('soon', t)}</span>
					</div>
				{:else}
					<a class="create-option" href={localeHref(option.href)} data-create={option.id} onclick={() => (open = false)}>
						<row.icon size={18} strokeWidth={1.75} aria-hidden="true" />
						<span class="create-copy"><strong>{row.title()}</strong><small>{row.line()}</small></span>
						<ChevronRight size={16} class="create-chevron" aria-hidden="true" />
					</a>
				{/if}
			</li>
		{/each}
	</ul>
</Modal>

<style>
	/* orca-type-remap v1 */
	.create-options {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.create-options li + li {
		border-top: 1px solid var(--orca-line);
	}
	.create-option {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 4px;
		color: var(--orca-ink);
		text-decoration: none;
	}
	a.create-option:hover {
		background: var(--orca-hover);
		text-decoration: none;
	}
	.create-option > :global(svg:first-child) {
		flex: none;
		color: var(--orca-subtle);
	}
	.create-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.create-copy strong {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.45;
	}
	.create-copy small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.create-option :global(.create-chevron) {
		flex: none;
		color: var(--orca-subtle);
	}
	.create-option.off {
		cursor: default;
	}
	.create-option.off strong,
	.create-option.off small {
		color: var(--orca-subtle);
	}
	.create-later {
		flex: none;
		color: var(--orca-subtle);
		font-size: 12.5px;
		white-space: nowrap;
	}
</style>
