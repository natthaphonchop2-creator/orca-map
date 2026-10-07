<script lang="ts">
	import { tick } from 'svelte';
	import { Search } from '@lucide/svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { searchJump, type JumpGroup, type JumpTarget } from '$lib/orca/jump-targets';
	import { rememberFocus, trapTab } from '../ui/focus-trap';

	// ค้นหา… ⌘K (W0.2): one large borderless field at the top; the results grouped
	// by type under small grey headers; ↑↓ move the grey active row, ↵ opens it.
	// Focus stays in the field (a combobox); only places the viewer can already
	// open are listed (the shell builds them, jump-targets.ts matches them).
	let {
		open = $bindable(false),
		targets,
		groupLabel,
		placeholder,
		emptyHint,
		onpick
	}: {
		open?: boolean;
		targets: JumpTarget[];
		groupLabel: (group: JumpGroup) => string;
		placeholder: string;
		/** Under "ไม่พบ …": what can be found here. */
		emptyHint: string;
		/** Before a chosen row opens (a company switch may wait for a save). */
		onpick?: (target: JumpTarget, event: MouseEvent) => void;
	} = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let results: HTMLDivElement | undefined = $state();
	let query = $state('');
	let active = $state(0);
	let restore: (() => void) | undefined;
	const uid = $props.id();
	const listID = `orca-jump-list-${uid}`;
	const optionID = (index: number) => `orca-jump-${uid}-${index}`;

	const sections = $derived(searchJump(targets ?? [], query, { groupLabel }));
	const rows = $derived(sections.flatMap((section) => section.items));
	// The first row of each group, by its place in `rows`.
	const starts = $derived.by(() => {
		let index = 0;
		return sections.map((section) => {
			const start = index;
			index += section.items.length;
			return start;
		});
	});
	$effect(() => {
		void query;
		active = 0;
	});
	$effect(() => {
		const element = dialog;
		if (!element) return;
		if (open && !element.open) {
			restore = rememberFocus();
			query = '';
			active = 0;
			element.showModal();
			void tick().then(() => input?.focus());
		} else if (!open && element.open) {
			element.close();
		}
	});
	function closed() {
		open = false;
		const back = restore;
		restore = undefined;
		back?.();
	}
	function show(index: number) {
		active = index;
		void tick().then(() => results?.querySelector<HTMLElement>(`#${optionID(index)}`)?.scrollIntoView({ block: 'nearest' }));
	}
	function onkey(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!rows.length) return;
			show((active + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
		} else if (event.key === 'Home' && rows.length && event.ctrlKey) {
			event.preventDefault();
			show(0);
		} else if (event.key === 'End' && rows.length && event.ctrlKey) {
			event.preventDefault();
			show(rows.length - 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			results?.querySelector<HTMLAnchorElement>(`#${optionID(active)}`)?.click();
		}
	}
	function pick(target: JumpTarget, event: MouseEvent) {
		onpick?.(target, event);
		if (!event.defaultPrevented) open = false;
	}
</script>

<dialog
	bind:this={dialog}
	class="orca-modal orca-jump"
	aria-label={t('ค้นหา', 'Search')}
	oncancel={(event) => {
		event.preventDefault();
		open = false;
	}}
	onclose={closed}
	onkeydown={(event) => trapTab(event, dialog)}
	onclick={(event) => {
		if (event.target === dialog) open = false;
	}}
>
	<div class="jump-panel">
		<label class="jump-field">
			<Search size={18} strokeWidth={1.75} aria-hidden="true" />
			<span class="sr-only">{t('ค้นหา', 'Search')}</span>
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={rows.length > 0}
				aria-controls={listID}
				aria-activedescendant={rows.length ? optionID(active) : undefined}
				onkeydown={onkey}
				{placeholder}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				enterkeyhint="go"
			/>
		</label>
		<div class="jump-results" bind:this={results} id={listID} role="listbox" aria-label={t('ผลการค้นหา', 'Results')}>
			{#if open}
				{#each sections as section, sectionIndex (section.group)}
					<div class="jump-group" role="group" aria-labelledby="{listID}-{section.group}">
						<p class="jump-group-label" id="{listID}-{section.group}" role="presentation">{groupLabel(section.group)}</p>
						{#each section.items as target, itemIndex (target.id)}
							{@const index = starts[sectionIndex] + itemIndex}
							<a
								id={optionID(index)}
								class="jump-row"
								class:active={index === active}
								role="option"
								aria-selected={index === active}
								tabindex="-1"
								href={localeHref(target.href)}
								data-sveltekit-reload={target.reload ? '' : undefined}
								onpointermove={() => (active = index)}
								onclick={(event) => pick(target, event)}
								><span class="jump-label">{target.label}</span>{#if target.hint}<small class="jump-hint">{target.hint}</small>{/if}</a
							>
						{/each}
					</div>
				{:else}
					<div class="jump-empty" role="status">
						<p>{query.trim() ? t(`ไม่พบ “${query.trim()}”`, `Nothing found for “${query.trim()}”`) : t('ยังไม่มีอะไรให้ค้น', 'Nothing to search yet')}</p>
						<p class="jump-empty-hint">{emptyHint}</p>
					</div>
				{/each}
			{/if}
		</div>
		<footer class="jump-foot" aria-hidden="true">
			<span><b>↑</b><b>↓</b>{t('เลือก', 'Move')}</span><span><b>↵</b>{t('เปิด', 'Open')}</span><span><b>esc</b>{t('ปิด', 'Close')}</span>
		</footer>
	</div>
</dialog>

<style>
	/* orca-type-remap v1 */
	/* orca-type-remap v2 */
	.orca-jump {
		width: min(600px, calc(100vw - 32px));
		max-width: none;
		max-height: min(560px, calc(100dvh - 32px));
		margin: max(16px, 12dvh) auto auto;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl, 18px);
		background: var(--orca-popover, var(--orca-surface));
		color: var(--orca-ink);
		box-shadow: var(--orca-dialog-shadow);
	}
	.orca-jump::backdrop {
		background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
	}
	.jump-panel {
		display: flex;
		flex-direction: column;
		max-height: inherit;
	}
	.jump-field {
		display: flex;
		flex: none;
		align-items: center;
		gap: 10px;
		padding: 0 18px;
		border-bottom: 1px solid var(--orca-line);
		color: var(--orca-subtle);
	}
	.jump-field :global(svg) {
		flex: none;
	}
	.jump-field input {
		flex: 1;
		min-width: 0;
		height: 52px;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 15px;
		line-height: 1.4;
	}
	/* The field is the whole top of the dialog: no ring of its own (it beats the shell's focus ring). */
	.orca-jump .jump-field input:focus-visible {
		outline: none;
	}
	.jump-field input::placeholder {
		color: var(--orca-subtle);
		opacity: 1;
	}
	.jump-results {
		flex: 1;
		min-height: 0;
		max-height: min(400px, 56dvh);
		padding: 6px 8px 8px;
		overflow-y: auto;
		overscroll-behavior: contain;
		scroll-behavior: smooth;
		scroll-padding-block: 8px;
	}
	.jump-group + .jump-group {
		margin-top: 4px;
	}
	.jump-group-label {
		margin: 0;
		padding: 8px 10px 4px;
		color: var(--orca-subtle);
		font-size: 12px;
		line-height: 1.4;
	}
	/* Rows: 10 px corners inside the 18 px dialog's 8 px padding. */
	.jump-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 36px;
		padding: 6px 10px;
		border-radius: var(--orca-radius, 10px);
		color: var(--orca-ink);
		font-size: 13.5px;
		line-height: 1.4;
		text-decoration: none;
	}
	.jump-row:hover {
		text-decoration: none;
	}
	.jump-row.active {
		background: var(--orca-secondary);
	}
	.jump-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.jump-hint {
		flex: none;
		max-width: 45%;
		overflow: hidden;
		color: var(--orca-subtle);
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.jump-empty {
		padding: 24px 10px 20px;
		text-align: center;
	}
	.jump-empty p {
		margin: 0;
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.jump-empty .jump-empty-hint {
		margin-top: 4px;
		color: var(--orca-muted);
		font-size: 12px;
	}
	.jump-foot {
		display: flex;
		flex: none;
		gap: 16px;
		padding: 8px 18px;
		border-top: 1px solid var(--orca-line);
		color: var(--orca-subtle);
		font-size: 12px;
		line-height: 1.4;
	}
	.jump-foot span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.jump-foot b {
		font-weight: 500;
		color: var(--orca-muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: no-preference) {
		.orca-jump[open] {
			animation: orca-jump-in var(--orca-dur, 180ms) var(--orca-ease, ease-out);
		}
		.orca-jump[open]::backdrop {
			animation: orca-jump-fade var(--orca-dur, 180ms) var(--orca-ease, ease-out);
		}
		.jump-row {
			transition: background-color var(--orca-dur-fast, 150ms) var(--orca-ease, ease-out);
		}
	}
	@keyframes orca-jump-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@keyframes orca-jump-fade {
		from {
			opacity: 0;
		}
	}
	/* A phone: the same panel near the top, clear of the on-screen keyboard. No footer keys. */
	@media (max-width: 720px) {
		.orca-jump {
			width: calc(100vw - 16px);
			margin-top: 8px;
		}
		.jump-results {
			max-height: 60dvh;
		}
		.jump-row {
			min-height: 44px;
		}
		.jump-foot {
			display: none;
		}
	}
</style>
