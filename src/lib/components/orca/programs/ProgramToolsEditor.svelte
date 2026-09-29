<script lang="ts">
	import { ChevronRight, CircleAlert, Eye, Info, Lock, Pencil, ShieldCheck, Users } from '@lucide/svelte';
	import {
		MAX_PROGRAM_TOOLS,
		groupChecked,
		groupTools,
		presetSelection,
		readOnlyAvailable,
		selectableUnder,
		selectionReadOnly,
		toggleGroup,
		toggleTool,
		toolCopy,
		toolHintText,
		type AccessPreset,
		type ProgramToolLike
	} from '$lib/orca/program-tools';
	import { orcaLocale, t } from '$lib/orca/locale.svelte';

	// Step 3, เลือกสิ่งที่ AI ทำได้ (the approved mockup add-program-3), also
	// program detail's สิ่งที่ AI ทำได้ tab. Two presets, the tools grouped by the
	// backend's own rule (critique 1), name and an optional note, and one sticky
	// bar with the one primary action.
	let {
		tools,
		programName,
		mcpID,
		selected = $bindable([]),
		preset = $bindable('read'),
		name = $bindable(''),
		note = $bindable(''),
		saving = false,
		error = '',
		locked = '',
		saveLabel,
		backLabel = '',
		onback,
		onsave
	}: {
		tools: ProgramToolLike[];
		programName: string;
		mcpID: string;
		selected?: string[];
		preset?: AccessPreset;
		name?: string;
		note?: string;
		saving?: boolean;
		error?: string;
		/** Why nothing can change right now (the list stays readable). */
		locked?: string;
		saveLabel?: (count: number) => string;
		backLabel?: string;
		onback?: () => void;
		onsave: () => void;
	} = $props();

	const groups = $derived(groupTools(tools));
	const readNames = $derived(groups.read.map((tool) => tool.name));
	const changeNames = $derived(groups.change.map((tool) => tool.name));
	const canReadOnly = $derived(readOnlyAvailable(tools));
	const readOnly = $derived(selectionReadOnly(selected, tools));
	const full = $derived(selected.length >= MAX_PROGRAM_TOOLS);
	const disabled = $derived(Boolean(locked) || saving);
	const locale = $derived(orcaLocale.value === 'en' ? 'en' : 'th');

	function choose(next: AccessPreset) {
		if (disabled || (next === 'read' && !canReadOnly)) return;
		preset = next;
		selected = presetSelection(tools, next);
	}
	function toggle(name: string) {
		if (disabled) return;
		selected = toggleTool(selected, name);
	}
	function toggleAll(group: string[]) {
		if (disabled) return;
		selected = toggleGroup(selected, group);
	}
	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!disabled && selected.length) onsave();
	}
</script>

{#snippet option(tool: ProgramToolLike, enabled: boolean, unspecified: boolean)}
	{@const copy = toolCopy(tool, locale)}
	{@const checked = selected.includes(tool.name)}
	<label class="opt" class:off={!enabled}>
		<input
			type="checkbox"
			class="box"
			{checked}
			disabled={!enabled || disabled || (!checked && full)}
			onchange={() => toggle(tool.name)}
		/>
		<span class="opt-copy">
			<span class="opt-label">{copy.label}{#if unspecified}<span class="opt-warn">{t('ผู้ให้บริการไม่ได้ระบุ', 'Not stated by the provider')}</span>{/if}</span>
			{#if copy.description}<span class="opt-desc">{copy.description}</span>{/if}
		</span>
	</label>
{/snippet}

<form class="tools" onsubmit={submit} novalidate>
	{#if locked}<p class="tools-locked" role="status"><Info size={16} aria-hidden="true" />{locked}</p>{/if}

	<section aria-labelledby="tools-preset-title">
		<header class="tools-sec">
			<h2 id="tools-preset-title">{t('ให้ AI ทำได้แค่ไหน', 'How much AI may do')}</h2>
			<p>{t('เริ่มจากแบบที่ใกล้เคียง แล้วปรับรายการด้านล่างได้', 'Start from the closest option, then adjust the list below.')}</p>
		</header>
		<div class="presets" role="radiogroup" aria-labelledby="tools-preset-title">
			<label class="preset" class:on={preset === 'read'} class:off={!canReadOnly}>
				<input type="radio" name="tools-preset" value="read" checked={preset === 'read'} disabled={!canReadOnly || disabled} onchange={() => choose('read')} />
				<span class="preset-icon"><Eye size={18} aria-hidden="true" /></span>
				<span class="preset-body">
					<span class="preset-title">{t('อ่านข้อมูลอย่างเดียว', 'Read only')}{#if canReadOnly}<span class="preset-badge">{t('แนะนำ', 'Recommended')}</span>{/if}</span>
					<span class="preset-desc">{canReadOnly
						? t(`AI ดูข้อมูลใน ${programName} ได้ แต่สร้าง แก้ไข หรือลบอะไรไม่ได้`, `AI can look at ${programName} data but cannot create, change or delete anything.`)
						: t(`ใช้ไม่ได้: ${programName} ไม่ได้ระบุว่ารายการไหนอ่านอย่างเดียว`, `Unavailable: ${programName} does not say which items only read.`)}</span>
					{#if canReadOnly}<span class="preset-foot ok"><ShieldCheck size={15} aria-hidden="true" />{t(`เหมาะสำหรับเริ่มใช้ · ${readNames.length} อย่าง`, `A safe start · ${readNames.length} ${readNames.length === 1 ? 'item' : 'items'}`)}</span>{/if}
				</span>
				<span class="radio" aria-hidden="true"></span>
			</label>
			<label class="preset" class:on={preset === 'write'}>
				<input type="radio" name="tools-preset" value="write" checked={preset === 'write'} disabled={disabled} onchange={() => choose('write')} />
				<span class="preset-icon"><Pencil size={18} aria-hidden="true" /></span>
				<span class="preset-body">
					<span class="preset-title">{t('อ่านและแก้ไขข้อมูล', 'Read and change')}</span>
					<span class="preset-desc">{t('นอกจากดูข้อมูลแล้ว AI สร้าง แก้ไข หรือลบข้อมูลได้ด้วย', 'Besides reading, AI can create, change or delete data too.')}</span>
					<span class="preset-foot"><Users size={15} aria-hidden="true" />{t(`เหมาะเมื่อทีมคุ้นกับ AI แล้ว · ${Math.min(tools.length, MAX_PROGRAM_TOOLS)} อย่าง`, `Once your team knows AI · ${Math.min(tools.length, MAX_PROGRAM_TOOLS)} items`)}</span>
				</span>
				<span class="radio" aria-hidden="true"></span>
			</label>
		</div>
	</section>

	<section aria-labelledby="tools-list-title">
		<header class="tools-sec">
			<h2 id="tools-list-title">{t('รายการที่ AI จะทำได้', 'What AI will be able to do')}</h2>
			<p>{t('เอาเครื่องหมายออกได้ ถ้าไม่อยากให้ AI ทำงานนั้น', "Untick anything you don't want AI to do.")}</p>
		</header>
		{#if groups.read.length}
			<div class="grp">
				<div class="grp-head">
					<span class="grp-icon read"><Eye size={18} aria-hidden="true" /></span>
					<div class="grp-copy">
						<div class="grp-title">{t('ดูข้อมูล', 'View data')} <em>({groups.read.length})</em></div>
						<div class="grp-sub">{t(`AI อ่านได้อย่างเดียว ข้อมูลใน ${programName} จะไม่เปลี่ยน`, `AI only reads; nothing in ${programName} changes.`)}</div>
					</div>
					<label class="selall">
						<input type="checkbox" class="box" checked={groupChecked(selected, readNames)} disabled={disabled} onchange={() => toggleAll(readNames)} />
						{t('เลือกทั้งหมด', 'Select all')}
					</label>
				</div>
				<div class="opts">
					{#each groups.read as tool (tool.name)}{@render option(tool, true, false)}{/each}
				</div>
			</div>
		{/if}
		{#if groups.change.length}
			{@const enabled = preset === 'write'}
			<div class="grp" class:off={!enabled}>
				<div class="grp-head">
					<span class="grp-icon"><Pencil size={18} aria-hidden="true" /></span>
					<div class="grp-copy">
						<div class="grp-title">{t('สร้าง / แก้ไข / ลบ', 'Create / change / delete')} <em>({groups.change.length})</em>{#if !enabled}<span class="lockchip"><Lock size={12} aria-hidden="true" />{t('ปิดอยู่', 'Off')}</span>{/if}</div>
						<div class="grp-sub">
							{#if enabled}{t(`AI สร้าง แก้ไข หรือลบข้อมูลใน ${programName} ได้ ติ๊กเฉพาะงานที่ต้องการ`, `AI can create, change or delete data in ${programName}. Tick only what you need.`)}
							{:else}{t('ใช้ได้เมื่อเลือกแบบ “อ่านและแก้ไขข้อมูล” ด้านบน', 'Available with “Read and change” above')} · <button type="button" class="lnk" disabled={disabled} onclick={() => choose('write')}>{t('เปลี่ยนแบบ', 'Switch')}</button>{/if}
						</div>
					</div>
					<label class="selall">
						<input type="checkbox" class="box" checked={enabled && groupChecked(selected, changeNames)} disabled={!enabled || disabled} onchange={() => toggleAll(changeNames)} />
						{t('เลือกทั้งหมด', 'Select all')}
					</label>
				</div>
				<div class="opts">
					{#each groups.change as tool (tool.name)}{@render option(tool, selectableUnder(preset, tool), groups.unspecified.includes(tool.name))}{/each}
				</div>
				{#if groups.unspecified.length}
					<div class="grp-foot">
						<Info size={15} aria-hidden="true" />
						<span><b>{t('ผู้ให้บริการไม่ได้ระบุ', 'Not stated by the provider')}</b> {t(`คือ ${programName} ไม่ได้บอกว่ารายการนี้แก้ข้อมูลหรือไม่ ORCA จึงนับเป็นการแก้ไขไว้ก่อน`, `means ${programName} doesn't say whether the item changes data, so ORCA counts it as a change.`)}</span>
					</div>
				{/if}
			</div>
		{/if}
		{#if !tools.length}<p class="tools-locked">{t(`${programName} ยังไม่มีสิ่งที่ AI ทำได้ให้เลือก`, `${programName} offers nothing for AI yet.`)}</p>{/if}
		{#if full}<p class="tools-cap">{t(`เลือกได้สูงสุด ${MAX_PROGRAM_TOOLS} อย่างต่อโปรแกรม`, `Up to ${MAX_PROGRAM_TOOLS} items per program.`)}</p>{/if}
	</section>

	<section class="names" aria-labelledby="tools-names-title">
		<header class="tools-sec"><h2 id="tools-names-title">{t('ชื่อและหมายเหตุ', 'Name and note')}</h2></header>
		<div class="names-card">
			<div class="field">
				<label for="tools-name">{t('ชื่อที่ทีมเห็น', 'Name your team sees')}</label>
				<input id="tools-name" bind:value={name} maxlength="100" required disabled={disabled} />
				<p class="hint">{t(`ถ้าเชื่อมหลายบัญชี ตั้งให้ต่างกัน เช่น ${programName} ฝ่ายบัญชี`, `With several accounts, name them apart, e.g. ${programName} Accounting.`)}</p>
			</div>
			<div class="field">
				<label for="tools-note">{t('หมายเหตุ', 'Note')} <em>{t('(ไม่บังคับ)', '(optional)')}</em></label>
				<input id="tools-note" bind:value={note} maxlength="2000" disabled={disabled} placeholder={t('เช่น ใช้บัญชีของฝ่ายบัญชี', "e.g. the accounting team's account")} />
				<p class="hint">{t('เห็นเฉพาะเจ้าของบริษัทและผู้ดูแล', 'Only company owners and admins see it.')}</p>
			</div>
		</div>
	</section>

	<details class="dev">
		<summary><ChevronRight size={15} aria-hidden="true" />{t('สำหรับนักพัฒนา', 'For developers')}</summary>
		<div class="dev-body">
			<p>{t('รหัสโปรแกรม', 'Source ID')}: <code>{mcpID}</code></p>
			<ul>
				{#each tools as tool (tool.name)}<li><code>{tool.name}</code> <span>{toolHintText(tool)}</span></li>{/each}
			</ul>
		</div>
	</details>

	<div class="sbar">
		<span class="sbar-icon" class:write={!readOnly && selected.length > 0}><ShieldCheck size={18} aria-hidden="true" /></span>
		<div class="sbar-copy">
			<b>{selected.length
				? readOnly
					? t(`AI จะทำได้ ${selected.length} อย่าง · อ่านอย่างเดียว`, `AI can do ${selected.length} ${selected.length === 1 ? 'thing' : 'things'} · read only`)
					: t(`AI จะทำได้ ${selected.length} อย่าง · อ่านและแก้ไข`, `AI can do ${selected.length} ${selected.length === 1 ? 'thing' : 'things'} · read and change`)
				: t('ยังไม่ได้เลือกสิ่งที่ AI ทำได้', 'Nothing chosen yet')}</b>
			<span>{selected.length
				? readOnly
					? t(`AI ของทุกคนจะสร้าง แก้ไข หรือลบข้อมูลใน ${programName} ไม่ได้`, `No one's AI can create, change or delete ${programName} data.`)
					: t(`AI สร้าง แก้ไข หรือลบข้อมูลใน ${programName} ได้ตามที่ติ๊กไว้`, `AI can create, change or delete ${programName} data as ticked.`)
				: t('ติ๊กอย่างน้อย 1 อย่าง', 'Tick at least one item.')}</span>
		</div>
		<div class="sbar-actions">
			{#if onback}<button type="button" class="k-button quiet" disabled={saving} onclick={onback}>{backLabel || t('ย้อนกลับ', 'Back')}</button>{/if}
			<button type="submit" class="k-button primary sbar-go" disabled={disabled || !selected.length || !name.trim()}>
				{saving ? t('กำลังบันทึก…', 'Saving…') : saveLabel ? saveLabel(selected.length) : t(`อนุญาต ${selected.length} อย่างนี้`, `Allow these ${selected.length}`)}
			</button>
		</div>
		{#if error}<p class="sbar-error" role="alert"><CircleAlert size={15} aria-hidden="true" />{error}</p>{/if}
	</div>
</form>

<style>
	.tools {
		container-type: inline-size;
		min-width: 0;
	}
	.tools section + section {
		margin-top: 48px;
	}
	.tools-sec {
		margin: 0 0 16px;
	}
	.tools-sec h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		line-height: 1.3;
	}
	.tools-sec p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.tools-locked {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 20px;
		padding: 12px 14px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
		font-size: 14px;
	}
	.tools-locked :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.tools-cap {
		margin: 12px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
	}
	/* Presets */
	.presets {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.preset {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		cursor: pointer;
	}
	.preset:hover:not(.off) {
		border-color: var(--orca-line-strong);
	}
	.preset.on {
		border-color: var(--orca-chosen);
		box-shadow: 0 0 0 1px var(--orca-chosen);
	}
	.preset.off {
		border-color: var(--orca-line-soft);
		background: var(--orca-surface-2);
		cursor: not-allowed;
	}
	.preset input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.preset:has(input:focus-visible) {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.preset-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.preset.on .preset-icon {
		background: var(--orca-citron);
		color: var(--orca-on-citron);
	}
	.preset-body {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.preset-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 16px;
		font-weight: 700;
		line-height: 1.35;
	}
	.preset.off .preset-title {
		color: var(--orca-muted);
	}
	.preset-badge {
		padding: 1px 9px;
		border: 1px solid var(--orca-citron-line);
		border-radius: 999px;
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
		font-size: 12px;
		font-weight: 600;
	}
	.preset-desc {
		margin: 4px 0 12px;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.5;
	}
	.preset-foot {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
	}
	.preset-foot.ok {
		color: var(--orca-text-2);
	}
	.preset-foot.ok :global(svg) {
		color: var(--orca-ok);
	}
	.radio {
		flex: none;
		width: 18px;
		height: 18px;
		margin-top: 2px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
	}
	.preset.on .radio {
		border: 5px solid var(--orca-chosen);
	}
	/* Groups */
	.grp {
		margin-bottom: 16px;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.grp-head {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--orca-line-soft);
	}
	.grp-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: var(--orca-secondary);
		color: var(--orca-subtle);
	}
	.grp-icon.read {
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.grp:not(.off) .grp-icon:not(.read) {
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
	}
	.grp-copy {
		flex: 1;
		min-width: 0;
	}
	.grp-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.35;
	}
	.grp-title em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 500;
	}
	.grp-sub {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.grp.off .grp-title {
		color: var(--orca-muted);
	}
	.lockchip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-left: 4px;
		padding: 2px 9px 2px 7px;
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
	}
	.lnk {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-ink);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
		white-space: nowrap;
		cursor: pointer;
	}
	.selall {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 9px;
		margin-left: auto;
		padding: 7px 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.grp.off .selall {
		border-color: var(--orca-line-soft);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		cursor: not-allowed;
	}
	.opts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.opt {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 20px;
		border-top: 1px solid var(--orca-line-soft);
		cursor: pointer;
	}
	.opts .opt:nth-child(-n + 2) {
		border-top: 0;
	}
	.opts .opt:nth-child(odd) {
		border-right: 1px solid var(--orca-line-soft);
	}
	.opt.off {
		cursor: not-allowed;
	}
	.opt-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.opt-label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.opt-desc {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.opt.off .opt-label,
	.opt.off .opt-desc {
		color: var(--orca-muted);
	}
	.opt-warn {
		padding: 1px 8px;
		border: 1px solid var(--orca-warn-line);
		border-radius: 999px;
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.grp-foot {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 20px;
		border-top: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 13px;
	}
	.grp-foot :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.grp-foot b {
		color: var(--orca-text-2);
		font-weight: 600;
	}
	/* Checkboxes: ink (citron in dark) when ticked */
	.box {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 18px;
		height: 18px;
		margin: 3px 0 0;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 5px;
		background: var(--orca-field);
		appearance: none;
		cursor: inherit;
	}
	.selall .box {
		margin-top: 0;
	}
	.box:checked {
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
	}
	.box:checked::after {
		content: '';
		width: 9px;
		height: 5px;
		border-bottom: 2px solid var(--orca-on-ink);
		border-left: 2px solid var(--orca-on-ink);
		transform: rotate(-45deg) translate(1px, -1px);
	}
	.box:disabled {
		border-color: var(--orca-line);
		background: var(--orca-secondary);
	}
	.box:disabled:checked {
		opacity: 0.55;
	}
	.box:focus-visible {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	/* Name and note */
	.names-card {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
		padding: 20px 20px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.field label {
		display: block;
		margin-bottom: 6px;
		font-size: 14px;
		font-weight: 600;
	}
	.field label em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 400;
	}
	.field input {
		width: 100%;
		padding: 11px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
	}
	.field input::placeholder {
		color: var(--orca-subtle);
	}
	.hint {
		margin: 6px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
	}
	/* For developers */
	.dev {
		margin-top: 20px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.dev summary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 2px;
		cursor: pointer;
		list-style: none;
	}
	.dev summary::-webkit-details-marker {
		display: none;
	}
	.dev[open] summary :global(svg) {
		transform: rotate(90deg);
	}
	.dev-body {
		margin-top: 8px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		font-size: 13px;
	}
	.dev-body p {
		margin: 0 0 8px;
	}
	.dev-body ul {
		margin: 0;
		padding-left: 18px;
	}
	.dev-body code {
		color: var(--orca-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 12.5px;
		overflow-wrap: anywhere;
	}
	/* The sticky bar */
	.sbar {
		position: sticky;
		bottom: 16px;
		z-index: 3;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px;
		margin-top: 32px;
		padding: 12px 12px 12px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
		box-shadow: var(--orca-popover-shadow);
	}
	.sbar-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 10px;
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.sbar-icon.write {
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
	}
	.sbar-copy {
		flex: 1 1 260px;
		min-width: 0;
	}
	.sbar-copy b {
		display: block;
		font-size: 15px;
		line-height: 1.35;
	}
	.sbar-copy span {
		display: block;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.4;
	}
	.sbar-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}
	:global(.orca-workspace.orca-app) .k-button.sbar-go {
		min-height: 48px;
		padding: 0 22px;
		font-size: 15px;
		font-weight: 600;
	}
	.sbar-error {
		display: flex;
		flex-basis: 100%;
		align-items: flex-start;
		gap: 6px;
		margin: 0;
		color: var(--orca-deny);
		font-size: 13.5px;
	}
	.sbar-error :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	@container (max-width: 700px) {
		.tools section + section {
			margin-top: 36px;
		}
		.presets,
		.opts,
		.names-card {
			grid-template-columns: minmax(0, 1fr);
		}
		.opts .opt:nth-child(2) {
			border-top: 1px solid var(--orca-line-soft);
		}
		.opts .opt:nth-child(odd) {
			border-right: 0;
		}
		.grp-head {
			flex-wrap: wrap;
			padding: 14px 16px;
		}
		.grp-copy {
			flex-basis: calc(100% - 50px);
		}
		.selall {
			margin-left: 50px;
		}
		.opt {
			padding: 12px 16px;
		}
		.sbar {
			bottom: 8px;
			gap: 10px;
			padding: 12px;
		}
		.sbar-actions {
			width: 100%;
		}
		.sbar-actions .sbar-go {
			flex: 1;
		}
	}
</style>
