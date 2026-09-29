<script lang="ts">
	import { tick } from 'svelte';
	import { Plus, X } from '@lucide/svelte';
	import {
		LIBRARY_CONTENT_MAX,
		TEMPLATE_FIELDS_MAX,
		cleanFieldLabel,
		fieldLabelTaken,
		fieldsInUse,
		insertText,
		nextFieldName,
		removeFieldTokens,
		renameFieldTokens,
		tokenRuns
	} from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import type { LibraryParameter } from '$lib/services/orca-library';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';

	// "อยากให้ AI ทำอะไร" for a ready-made prompt. [+ แทรกช่องให้กรอก] asks only
	// for a Thai label and "ต้องกรอก"; the field is named field_1, field_2… by
	// itself and shows in the text as a chip, {{ชื่อลูกค้า}}.
	let {
		id,
		text = $bindable(''),
		parameters = $bindable([]),
		disabled = false,
		invalid = false
	}: { id: string; text?: string; parameters?: LibraryParameter[]; disabled?: boolean; invalid?: boolean } = $props();
	let area: HTMLTextAreaElement | undefined = $state();
	let labelInput: HTMLInputElement | undefined = $state();
	let dialogOpen = $state(false);
	let editing = $state<LibraryParameter>();
	let label = $state('');
	let required = $state(true);
	let labelError = $state('');
	let selection = { start: 0, end: 0 };
	const runs = $derived(tokenRuns(text, parameters));
	const used = $derived(fieldsInUse(text, parameters));

	function openDialog(field?: LibraryParameter) {
		selection = { start: area?.selectionStart ?? text.length, end: area?.selectionEnd ?? text.length };
		editing = field;
		label = field?.label ?? '';
		required = field?.required ?? true;
		labelError = '';
		dialogOpen = true;
		// After the dialog has moved focus to its own Cancel button.
		setTimeout(() => labelInput?.focus(), 30);
	}
	async function confirm() {
		const clean = cleanFieldLabel(label);
		labelError = !clean
			? t('ใส่ชื่อช่อง เช่น ชื่อลูกค้า', 'Name the field, e.g. Customer name')
			: fieldLabelTaken(parameters, clean, editing?.name)
				? t('มีช่องชื่อนี้แล้ว ใช้ชื่ออื่น', 'A field has this name already')
				: '';
		if (labelError) {
			labelInput?.focus();
			return;
		}
		if (editing) {
			const before = editing;
			parameters = parameters.map((item) => (item.name === before.name ? { ...item, label: clean, required } : item));
			text = renameFieldTokens(text, before.label, clean);
			dialogOpen = false;
			return;
		}
		const name = nextFieldName(parameters);
		parameters = [...parameters, { name, label: clean, required }];
		const next = insertText(text, selection.start, selection.end, `{{${clean}}}`);
		text = next.text;
		dialogOpen = false;
		await tick();
		setTimeout(() => {
			area?.focus();
			area?.setSelectionRange(next.caret, next.caret);
		}, 30);
	}
	function remove(field: LibraryParameter) {
		parameters = parameters.filter((item) => item.name !== field.name);
		text = removeFieldTokens(text, field.label);
		area?.focus();
	}
</script>

<div class="tb">
	<div class="tb-label">
		<label for={id}>{t('อยากให้ AI ทำอะไร', 'What should AI do')}</label>
		<button type="button" class="k-button small" disabled={disabled || parameters.length >= TEMPLATE_FIELDS_MAX} onclick={() => openDialog()}>
			<Plus size={15} aria-hidden="true" />{t('แทรกช่องให้กรอก', 'Insert a field')}
		</button>
	</div>
	<div class="tb-stack" class:invalid>
		<div class="tb-mirror" aria-hidden="true">{#each runs as run, index (index)}{#if run.field}<mark class:unknown={!run.known}>{run.text}</mark>{:else}{run.text}{/if}{/each}{'​\n'}</div>
		<textarea
			{id}
			bind:this={area}
			bind:value={text}
			{disabled}
			required
			aria-invalid={invalid ? 'true' : undefined}
			aria-describedby={`${id}-hint`}
			maxlength={LIBRARY_CONTENT_MAX}
			spellcheck="false"
			placeholder={t('เช่น สรุปยอดขายของ {{ช่วงวันที่}} แยกตามลูกค้า แล้วบอก 3 เรื่องที่ควรตามต่อ', 'e.g. Summarize sales for {{date range}} by customer, then list 3 follow-ups')}
		></textarea>
	</div>
	<div class="ta-f">
		<span id={`${id}-hint`}>{t('ช่องที่ไฮไลต์ คือสิ่งที่คนใช้ต้องกรอกทุกครั้ง', 'Highlighted fields are filled in each time')}</span>
		<span>{t(`${text.length.toLocaleString('en-US')} / 40,000 ตัวอักษร`, `${text.length.toLocaleString('en-US')} / 40,000 characters`)}</span>
	</div>
	{#if parameters.length}
		<div class="tb-fields">
			<span class="tb-fields-l">{t('ช่องให้กรอก', 'Fields')}</span>
			<ul>
				{#each parameters as field (field.name)}
					<li class="tb-field" class:unused={!used.has(field.name)}>
						<button type="button" class="tb-edit" {disabled} onclick={() => openDialog(field)} aria-label={t(`แก้ช่อง ${field.label}`, `Edit field ${field.label}`)}>
							{field.label}{#if field.required}<small>{t('ต้องกรอก', 'Required')}</small>{/if}{#if !used.has(field.name)}<small>{t('ยังไม่ได้ใช้', 'Not used')}</small>{/if}
						</button>
						<button type="button" class="tb-remove" {disabled} onclick={() => remove(field)} aria-label={t(`เอาช่อง ${field.label} ออก`, `Remove field ${field.label}`)}><X size={13} aria-hidden="true" /></button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={dialogOpen}
	title={editing ? t('แก้ช่องให้กรอก', 'Edit field') : t('แทรกช่องให้กรอก', 'Insert a field')}
	message={editing ? '' : t('คนที่ใช้คำสั่งนี้จะกรอกช่องนี้ทุกครั้ง', 'People fill this in each time they use the prompt')}
	confirmLabel={editing ? t('บันทึกช่อง', 'Save field') : t('แทรกช่องนี้', 'Insert field')}
	onconfirm={confirm}
>
	<div class="tb-dialog">
		<label for={`${id}-field-label`}>{t('ชื่อช่อง', 'Field name')}</label>
		<input
			id={`${id}-field-label`}
			bind:this={labelInput}
			bind:value={label}
			maxlength="120"
			placeholder={t('เช่น ชื่อลูกค้า', 'e.g. Customer name')}
			aria-invalid={labelError ? 'true' : undefined}
			aria-describedby={labelError ? `${id}-field-error` : undefined}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					void confirm();
				}
			}}
		/>
		{#if labelError}<p class="tb-error" id={`${id}-field-error`}>{labelError}</p>{/if}
		<label class="tb-check"><input type="checkbox" bind:checked={required} />{t('ต้องกรอก', 'Required')}</label>
	</div>
</ConfirmDialog>

<style>
	.tb {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.tb-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}
	.tb-label label {
		font-size: 14px;
		font-weight: 600;
	}
	.tb-stack {
		display: grid;
		flex: 1;
		min-height: 220px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
	}
	.tb-stack:focus-within {
		border-color: var(--orca-focus);
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.tb-stack.invalid {
		border-color: var(--orca-deny);
	}
	.tb-mirror,
	.tb-stack textarea {
		grid-area: 1 / 1;
		min-height: 218px;
		margin: 0;
		padding: 12px 14px;
		border: 0;
		font-family: inherit;
		font-size: 14.5px;
		line-height: 1.8;
		letter-spacing: 0;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: normal;
		tab-size: 4;
	}
	.tb-mirror {
		color: transparent;
		pointer-events: none;
	}
	.tb-mirror mark {
		border-radius: 5px;
		background: var(--orca-citron-soft);
		box-shadow: 0 0 0 1px var(--orca-citron-line);
		color: transparent;
	}
	.tb-mirror mark.unknown {
		background: var(--orca-warn-bg);
		box-shadow: 0 0 0 1px var(--orca-warn-line);
	}
	.tb-stack textarea {
		overflow: hidden;
		resize: none;
		background: transparent;
		color: var(--orca-ink);
		outline: 0;
	}
	.tb-stack textarea:focus-visible {
		outline: 0;
	}
	.ta-f {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 16px;
		margin-top: 6px;
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
	.tb-fields {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin-top: 12px;
	}
	.tb-fields-l {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 600;
	}
	.tb-fields ul {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tb-field {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--orca-citron-line);
		border-radius: 999px;
		background: var(--orca-citron-soft);
	}
	.tb-field.unused {
		border-style: dashed;
		border-color: var(--orca-line-strong);
		background: var(--orca-surface);
	}
	.tb-edit {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px 3px 11px;
		border: 0;
		background: transparent;
		color: var(--orca-ink);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.tb-edit small {
		color: var(--orca-text-2);
		font-size: 11.5px;
		font-weight: 500;
	}
	.tb-remove {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		margin-right: 3px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--orca-muted);
		cursor: pointer;
	}
	.tb-remove:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.tb-dialog {
		display: grid;
		gap: 8px;
		margin-top: 18px;
	}
	.tb-dialog label {
		font-size: 14px;
		font-weight: 600;
	}
	.tb-dialog input:not([type]) {
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font-size: 15px;
	}
	.tb-dialog input:not([type]):focus-visible {
		border-color: var(--orca-focus);
		outline: 0;
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.tb-error {
		margin: 0 !important;
		color: var(--orca-deny) !important;
		font-size: 13px !important;
	}
	.tb-check {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		font-weight: 500 !important;
		cursor: pointer;
	}
	.tb-check input {
		width: 18px;
		height: 18px;
		accent-color: var(--orca-control);
	}
</style>
