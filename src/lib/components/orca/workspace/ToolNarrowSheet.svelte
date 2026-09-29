<script lang="ts">
	import { orcaLocale, t } from '$lib/orca/locale.svelte';
	import { toolCopy, toolUnspecified } from '$lib/orca/program-tools';
	import { allowedTools, readOnlyToolNames } from '$lib/orca/workspace-edit';
	import type { OrcaConnection } from '$lib/services/orca';
	import type { ProgramTool } from '$lib/services/orca-programs';
	import { Eye, Info, Pencil } from '@lucide/svelte';
	import Sheet from '../ui/Sheet.svelte';

	// [ปรับ] on a program: narrow what AI can do in it for this workspace only.
	// Grouped by the approval rule (critique 1): "ดูข้อมูล" is only what the
	// program says reads, everything else is "สร้าง / แก้ไข / ลบ".
	let {
		open = $bindable(false),
		connection,
		selected,
		approval,
		onapply
	}: {
		open?: boolean;
		connection: OrcaConnection | undefined;
		selected: string[];
		/** Whether a change action chosen here waits for an admin: true, false, or unknown. */
		approval?: boolean;
		onapply: (toolNames: string[]) => void;
	} = $props();
	let chosen = $state<string[]>([]);
	// A fresh copy each time the sheet opens; tools the program dropped fall away.
	$effect(() => {
		if (open) chosen = selected.filter((name) => connection?.toolNames.includes(name));
	});
	const tools = $derived(allowedTools(connection) as ProgramTool[]);
	const readNames = $derived(readOnlyToolNames(connection));
	const readTools = $derived(tools.filter((tool) => readNames.includes(tool.name)));
	const changeTools = $derived(tools.filter((tool) => !readNames.includes(tool.name)));
	const unstated = $derived(!connection?.reviewedReadOnly && changeTools.some((tool) => toolUnspecified(tool)));
	const name = $derived(connection?.name ?? '');
	const changeHint = $derived(
		approval === true
			? t('รอผู้ดูแลอนุมัติก่อน ORCA จึงทำจริง', 'Waits for an admin to approve before ORCA runs it.')
			: approval === false
				? t('พื้นที่นี้ตั้งให้ทำได้ทันที ไม่ต้องรออนุมัติ เปลี่ยนได้ในแท็บ “ตั้งค่า”', 'This workspace runs changes at once, without approval. Change it under “Settings”.')
				: t('ถ้าพื้นที่นี้ตั้งให้ผู้ดูแลอนุมัติก่อน จะรออนุมัติก่อนทำจริง', 'Waits for approval when this workspace asks for it.')
	);

	function toggle(tool: string) {
		chosen = chosen.includes(tool) ? chosen.filter((item) => item !== tool) : [...chosen, tool];
	}
	function setGroup(names: string[], on: boolean) {
		chosen = on ? [...new Set([...chosen, ...names])] : chosen.filter((item) => !names.includes(item));
	}
	function apply() {
		if (!chosen.length) return;
		// Keep the program's order.
		onapply(tools.map((tool) => tool.name).filter((tool) => chosen.includes(tool)));
		open = false;
	}
</script>

<Sheet bind:open title={t(`สิ่งที่ AI ทำได้ใน ${name}`, `What AI can do in ${name}`)} description={t('ติ๊กเฉพาะงานที่อยากให้ AI ทำในพื้นที่นี้', 'Tick only what AI should do in this workspace.')}>
	<div class="narrow-presets" role="group" aria-label={t('เริ่มจากแบบที่ใกล้เคียง', 'Start from a preset')}>
		<button type="button" class="narrow-preset" aria-pressed={chosen.length > 0 && chosen.length === readNames.length && chosen.every((item) => readNames.includes(item))} disabled={!readNames.length} onclick={() => (chosen = [...readNames])}>
			<Eye size={15} aria-hidden="true" />{t(`อ่านอย่างเดียว · ${readNames.length} อย่าง`, `Read only · ${readNames.length}`)}
		</button>
		<button type="button" class="narrow-preset" aria-pressed={chosen.length === tools.length && tools.length > 0} onclick={() => (chosen = tools.map((tool) => tool.name))}>
			<Pencil size={15} aria-hidden="true" />{t(`ทุกอย่างที่โปรแกรมอนุญาต · ${tools.length} อย่าง`, `Everything allowed · ${tools.length}`)}
		</button>
	</div>
	{#if !readNames.length && tools.length}<p class="narrow-note">{unstated
			? t(`${name} ไม่ได้บอกว่ารายการไหนอ่านอย่างเดียว จึงเลือกแบบอ่านอย่างเดียวไม่ได้`, `${name} doesn't say which actions only read, so read-only can't be chosen.`)
			: t(`ทุกอย่างที่ ${name} อนุญาตสร้างหรือแก้ข้อมูลได้ จึงไม่มีแบบอ่านอย่างเดียว`, `Everything ${name} allows can create or change data, so there is no read-only choice.`)}</p>{/if}

	{#each [{ id: 'read', label: t('ดูข้อมูล', 'View data'), hint: t(`AI อ่านได้อย่างเดียว ข้อมูลใน ${name} ไม่เปลี่ยน`, `AI only reads; nothing in ${name} changes.`), items: readTools }, { id: 'change', label: t('สร้าง / แก้ไข / ลบ', 'Create / change / delete'), hint: changeHint, items: changeTools }] as group (group.id)}
		{#if group.items.length}
			{@const names = group.items.map((tool) => tool.name)}
			{@const all = names.every((item) => chosen.includes(item))}
			<div class="narrow-group" role="group" aria-labelledby={`narrow-${group.id}`}>
				<div class="narrow-head">
					<span class="narrow-icon" aria-hidden="true">{#if group.id === 'read'}<Eye size={16} />{:else}<Pencil size={16} />{/if}</span>
					<span class="narrow-title"><strong id={`narrow-${group.id}`}>{group.label} <span>({group.items.length})</span></strong><small>{group.hint}</small></span>
					<label class="narrow-all"><input type="checkbox" checked={all} onchange={() => setGroup(names, !all)} />{t('เลือกทั้งหมด', 'Select all')}</label>
				</div>
				<ul>
					{#each group.items as tool (tool.name)}
						{@const shown = toolCopy(tool, orcaLocale.value === 'en' ? 'en' : 'th')}
						<li>
							<label class="narrow-tool">
								<input type="checkbox" checked={chosen.includes(tool.name)} onchange={() => toggle(tool.name)} />
								<span>
									<strong>{shown.label}{#if group.id === 'change' && toolUnspecified(tool)}<em class="narrow-tag">{t('ผู้ให้บริการไม่ได้ระบุ', 'Not stated')}</em>{/if}</strong>
									{#if shown.description && shown.description !== shown.label}<small>{shown.description}</small>{/if}
								</span>
							</label>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/each}
	{#if unstated}<p class="narrow-footnote"><Info size={15} aria-hidden="true" /><span><b>{t('ผู้ให้บริการไม่ได้ระบุ', 'Not stated')}</b> {t(`คือ ${name} ไม่ได้บอกว่ารายการนี้แก้ข้อมูลหรือไม่ ORCA จึงนับเป็นการแก้ไขไว้ก่อน`, `means ${name} doesn't say whether it changes data, so ORCA treats it as a change.`)}</span></p>{/if}

	{#snippet footer()}
		{#if !chosen.length}<span class="narrow-empty">{t('เลือกอย่างน้อย 1 อย่าง หรือปิดโปรแกรมนี้', 'Choose at least one, or turn the program off.')}</span>{/if}
		<button type="button" class="k-button" onclick={() => (open = false)}>{t('ยกเลิก', 'Cancel')}</button>
		<button type="button" class="k-button primary" disabled={!chosen.length} onclick={apply}>{t(`ใช้ ${chosen.length} อย่างนี้`, `Use these ${chosen.length}`)}</button>
	{/snippet}
</Sheet>

<style>
	.narrow-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}
	.narrow-preset {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.narrow-preset[aria-pressed='true'] {
		border-color: var(--orca-chosen);
		box-shadow: inset 0 0 0 1px var(--orca-chosen);
	}
	.narrow-preset:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.narrow-note {
		margin: -4px 0 14px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.narrow-group {
		margin: 0 0 14px;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.narrow-head {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px 14px 12px;
		border-bottom: 1px solid var(--orca-line-soft);
	}
	.narrow-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--orca-radius);
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.narrow-title {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.narrow-title strong {
		color: var(--orca-ink);
		font-size: 14.5px;
		font-weight: 700;
	}
	.narrow-title strong span {
		color: var(--orca-muted);
		font-weight: 400;
	}
	.narrow-title small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.narrow-all {
		display: inline-flex;
		flex: none;
		margin-top: 4px;
		align-items: center;
		gap: 6px;
		color: var(--orca-text-2);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.narrow-group ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.narrow-group li + li {
		border-top: 1px solid var(--orca-line-soft);
	}
	.narrow-tool {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 14px;
		cursor: pointer;
	}
	.narrow-tool:hover {
		background: var(--orca-hover);
	}
	.narrow-tool input,
	.narrow-all input {
		flex: none;
		width: 17px;
		height: 17px;
		margin: 2px 0 0;
		accent-color: var(--orca-control);
	}
	.narrow-all input {
		margin: 0;
	}
	.narrow-tool span {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.narrow-tool strong {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.45;
	}
	.narrow-tool small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.narrow-tag {
		padding: 1px 8px;
		border: 1px solid var(--orca-warn-line);
		border-radius: 999px;
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
		font-size: 11.5px;
		font-style: normal;
		font-weight: 600;
	}
	.narrow-footnote {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.narrow-footnote :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.narrow-footnote b {
		color: var(--orca-ink);
	}
	.narrow-empty {
		margin-right: auto;
		align-self: center;
		color: var(--orca-muted);
		font-size: 13px;
	}
</style>
