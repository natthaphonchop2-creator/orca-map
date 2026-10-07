<script lang="ts">
	import { Upload, X } from '@lucide/svelte';
	import { FILE_ACCEPT, formatBytes, uploadRowText, uploadSummary, type UploadRow } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';

	// "เพิ่มไฟล์" (knowledge library v2, C4 §14m S7): drop several files here
	// or choose them. The page sends them and fills `rows`; this shows each
	// file's progress or, in Thai, why it was not taken.
	let {
		rows = [],
		busy = false,
		problem = '',
		disabled = false,
		onfiles,
		oncancel,
		onclear,
		onretry,
		onopen
	}: {
		rows?: UploadRow[];
		/** An upload is on its way. */
		busy?: boolean;
		/** Why the last upload stopped, for the whole panel. */
		problem?: string;
		disabled?: boolean;
		onfiles: (files: File[]) => void;
		oncancel?: () => void;
		onclear?: () => void;
		/** Sends the files that did not go again (shown with a problem). */
		onretry?: () => void;
		/** Opens a file that was saved. */
		onopen?: (itemID: string) => void;
	} = $props();
	let input: HTMLInputElement | undefined = $state();
	let depth = $state(0);
	const over = $derived(depth > 0 && !disabled && !busy);
	const uid = $props.id();
	const retryable = $derived(!busy && rows.some((row) => row.state === 'failed'));

	/** Opens the file picker (the page header's "เพิ่มไฟล์" calls it). */
	export function pick() {
		if (!disabled && !busy) input?.click();
	}
	function chosen(list: FileList | null | undefined) {
		const files = list ? [...list] : [];
		if (files.length && !disabled && !busy) onfiles(files);
	}
	const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
	function enter(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		depth += 1;
	}
	function overZone(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = disabled || busy ? 'none' : 'copy';
	}
	function leave(event: DragEvent) {
		if (!hasFiles(event)) return;
		depth = Math.max(0, depth - 1);
	}
	function drop(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		depth = 0;
		chosen(event.dataTransfer?.files);
	}
</script>

<section class="fz" aria-labelledby={`fz-title-${uid}`}>
	<div class="fz-drop" class:over class:off={disabled} role="group" aria-labelledby={`fz-title-${uid}`} aria-describedby={`fz-rules-${uid}`} ondragenter={enter} ondragover={overZone} ondragleave={leave} ondrop={drop}>
		<p class="fz-title" id={`fz-title-${uid}`}>{over ? t('วางไฟล์เพื่ออัปโหลด', 'Drop to upload') : t('ลากไฟล์มาวางที่นี่', 'Drag files here')}</p>
		<p class="fz-rules" id={`fz-rules-${uid}`}>
			<span>{t('Word, Excel, PowerPoint, CSV, TXT หรือ MD', 'Word, Excel, PowerPoint, CSV, TXT or MD')}</span>
			<span>{t('ไฟล์ละไม่เกิน 20 MB · ครั้งละไม่เกิน 10 ไฟล์', 'Up to 20 MB a file · 10 files at a time')}</span>
		</p>
		<button type="button" class="k-button fz-pick" disabled={disabled || busy} onclick={pick}><Upload size={16} aria-hidden="true" />{t('เลือกไฟล์', 'Choose files')}</button>
		<p class="fz-note">{t('ไฟล์ใหม่เป็นฉบับร่าง เห็นแค่คุณ จนกว่าจะกดเผยแพร่', 'New files are drafts only you see until you publish them')}</p>
		<input
			bind:this={input}
			class="fz-input"
			type="file"
			multiple
			accept={FILE_ACCEPT}
			tabindex="-1"
			aria-hidden="true"
			onchange={(event) => {
				chosen(event.currentTarget.files);
				event.currentTarget.value = '';
			}}
		/>
	</div>

	{#if rows.length}
		<div class="fz-panel">
			<div class="fz-head">
				<b role="status">{uploadSummary(rows, t)}</b>
				{#if busy && oncancel}<button type="button" class="k-button small" onclick={oncancel}><X size={14} aria-hidden="true" />{t('ยกเลิก', 'Cancel')}</button>
				{:else if !busy && onclear}<button type="button" class="k-button small quiet" onclick={onclear}>{t('ปิด', 'Close')}</button>{/if}
			</div>
			{#if problem}
				<p class="fz-problem" role="alert">
					<span>{problem}</span>
					{#if retryable && onretry}<button type="button" class="k-button small" onclick={onretry}>{t('ลองอีกครั้ง', 'Try again')}</button>{/if}
				</p>
			{/if}
			<ul class="fz-rows">
				{#each rows as row (row.key)}
					<li class="fz-row {row.state}">
						<span class="fz-dot" aria-hidden="true"></span>
						<span class="fz-file">
							{#if row.state === 'saved' && row.itemID && onopen}<button type="button" class="fz-name link" onclick={() => onopen(row.itemID!)}>{row.name}</button>
							{:else}<span class="fz-name">{row.name}</span>{/if}
							<small class="fz-state">{uploadRowText(row, t)}</small>
						</span>
						<span class="fz-size">{formatBytes(row.size)}</span>
						{#if row.state === 'sending'}
							<span class="fz-bar" aria-hidden="true"><i style:width={`${Math.round(row.progress * 100)}%`}></i></span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

<style>
	/* orca-type-remap v1 */
	.fz {
		display: grid;
		gap: 12px;
		margin-bottom: 16px;
	}
	.fz-drop {
		container: fz-drop / inline-size;
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 22px 20px 18px;
		border: 1.5px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		text-align: center;
		transition:
			border-color 0.15s var(--orca-ease),
			background-color 0.15s var(--orca-ease);
	}
	.fz-drop.over {
		border-color: var(--orca-ink);
		background: var(--orca-surface-2);
	}
	.fz-drop.off {
		opacity: 0.7;
	}
	.fz-title {
		margin: 0;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 700;
	}
	.fz-rules,
	.fz-note {
		margin: 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.55;
	}
	.fz-rules {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0 6px;
	}
	.fz-rules span {
		white-space: nowrap;
	}
	.fz-rules span + span::before {
		content: '·';
		margin-right: 6px;
	}
	/* Too narrow for one line: one rule a line, no dot starting the second. */
	@container fz-drop (max-width: 600px) {
		.fz-rules {
			flex-direction: column;
			align-items: center;
		}
		.fz-rules span + span::before {
			content: none;
		}
	}
	.fz-pick {
		margin: 8px 0 4px;
		min-height: 40px !important;
		padding: 0 16px !important;
		font-weight: 600 !important;
	}
	.fz-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		opacity: 0;
	}
	.fz-panel {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.fz-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		font-size: 13.5px;
	}
	.fz-head b {
		font-weight: 600;
	}
	.fz-problem {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 0;
		padding: 10px 16px;
		border-bottom: 1px solid var(--orca-deny-line);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 13px;
		line-height: 1.55;
	}
	.fz-problem span {
		flex: 1 1 240px;
	}
	.fz-rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.fz-row {
		position: relative;
		display: grid;
		grid-template-columns: 10px minmax(0, 1fr) auto;
		align-items: start;
		column-gap: 12px;
		padding: 10px 16px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.fz-row:first-child {
		border-top: 0;
	}
	.fz-dot {
		width: 8px;
		height: 8px;
		margin-top: 7px;
		border: 1.5px solid var(--orca-subtle);
		border-radius: 50%;
	}
	.fz-row.saved .fz-dot {
		border-color: var(--orca-ok);
		background: var(--orca-ok);
	}
	.fz-row.refused .fz-dot,
	.fz-row.failed .fz-dot {
		border-color: var(--orca-deny);
		background: var(--orca-deny);
	}
	.fz-row.sending .fz-dot {
		border-color: var(--orca-ink);
	}
	.fz-file {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	.fz-name {
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fz-name.link {
		justify-self: start;
		max-width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		text-align: left;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.fz-state {
		color: var(--orca-muted);
		font-size: 12px;
		line-height: 1.5;
	}
	/* Status colours only as dots: the red dot marks it, the reason reads in ink. */
	.fz-row.refused .fz-state,
	.fz-row.failed .fz-state {
		color: var(--orca-text-2);
	}
	.fz-size {
		color: var(--orca-subtle);
		font-size: 12px;
		white-space: nowrap;
	}
	.fz-bar {
		grid-column: 2 / 4;
		height: 4px;
		margin-top: 8px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--orca-secondary);
	}
	.fz-bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--orca-ink);
		transition: width 0.2s linear;
	}
	@media (prefers-reduced-motion: reduce) {
		.fz-drop,
		.fz-bar i {
			transition: none;
		}
	}
	@media (max-width: 720px) {
		.fz-drop {
			padding: 18px 14px 16px;
		}
		.fz-pick {
			width: 100%;
			justify-content: center;
		}
	}
</style>
