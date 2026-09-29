<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import { Info } from '@lucide/svelte';
	import StatusPill from '../ui/StatusPill.svelte';

	// "เมื่อ AI จะสร้างหรือแก้ข้อมูล": wait for approval (the owner's default) or
	// run at once. While nothing chosen can change data the choice is greyed with
	// a note, but it can still be set for later.
	let {
		value = $bindable('approval'),
		quiet = false,
		noteTitle = '',
		note = '',
		name = 'write-mode',
		disabled = false,
		onchange
	}: {
		value?: 'approval' | 'direct';
		/** Nothing chosen changes data: greyed, with the note above. */
		quiet?: boolean;
		noteTitle?: string;
		note?: string;
		name?: string;
		disabled?: boolean;
		onchange?: (value: 'approval' | 'direct') => void;
	} = $props();
	const options = $derived([
		{ id: 'approval' as const, title: t('ให้ฉันอนุมัติก่อน', 'I approve first'), text: t('AI ส่งคำขอมารอในหน้าตรวจสอบ ทำจริงเมื่อคุณกดอนุมัติ', 'AI sends a request to Oversight; it runs when you approve.'), recommended: true },
		{ id: 'direct' as const, title: t('ทำได้เลย', 'Run at once'), text: t('AI สร้างหรือแก้ข้อมูลได้ทันที ไม่ต้องรอใคร', 'AI creates or changes data right away.'), recommended: false }
	]);
</script>

{#if quiet && (noteTitle || note)}<p class="write-note"><Info size={15} aria-hidden="true" /><span>{#if noteTitle}<b>{noteTitle}</b>{#if note}{' · '}{/if}{/if}{note}</span></p>{/if}
<div class="write-options" class:quiet role="radiogroup" aria-label={t('เมื่อ AI จะสร้างหรือแก้ข้อมูล', 'When AI would create or change data')}>
	{#each options as option (option.id)}
		<label class="write-option" class:chosen={value === option.id}>
			<input
				type="radio"
				{name}
				value={option.id}
				checked={value === option.id}
				{disabled}
				onchange={() => {
					value = option.id;
					onchange?.(option.id);
				}}
			/>
			<span class="write-radio" aria-hidden="true"></span>
			<span class="write-copy">
				<span class="write-title">{option.title}{#if option.recommended}<StatusPill label={t('แนะนำ', 'Recommended')} tone={quiet ? 'neutral' : 'citron'} />{/if}</span>
				<span class="write-text">{option.text}</span>
			</span>
		</label>
	{/each}
</div>

<style>
	.write-note {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 12px;
		padding: 10px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 13.5px;
		line-height: 1.5;
	}
	.write-note b {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.write-note :global(svg) {
		flex: none;
		color: var(--orca-muted);
	}
	.write-options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.write-option {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-width: 0;
		padding: 16px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		cursor: pointer;
		transition: border-color 0.15s var(--orca-ease), box-shadow 0.15s var(--orca-ease);
	}
	.write-option:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.write-option.chosen {
		border-color: var(--orca-chosen);
		box-shadow: 0 0 0 1px var(--orca-chosen);
	}
	.write-option input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.write-option:has(input:focus-visible) {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.write-radio {
		flex: none;
		width: 18px;
		height: 18px;
		margin-top: 3px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
		background: var(--orca-surface);
	}
	.chosen .write-radio {
		border: 5px solid var(--orca-chosen);
	}
	.write-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.write-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 700;
		line-height: 1.4;
	}
	.write-text {
		margin-top: 3px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	/* Nothing chosen changes data: greyed, still choosable for later. */
	.quiet .write-option {
		border-color: var(--orca-line-soft);
		background: var(--orca-surface-2);
		box-shadow: none;
	}
	.quiet .write-option.chosen {
		border-color: var(--orca-line-strong);
	}
	.quiet .write-title {
		color: var(--orca-text-2);
	}
	.quiet .write-radio {
		border-color: var(--orca-line);
		background: transparent;
	}
	.quiet .chosen .write-radio {
		border-color: var(--orca-line-strong);
	}
	@media (max-width: 720px) {
		.write-options {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
