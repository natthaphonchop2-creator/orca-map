<script lang="ts">
	import { FileText, Search } from '@lucide/svelte';
	import { TEMPLATE_ARTICLES_MAX, itemExcerpt } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import type { LibraryItem } from '$lib/services/orca-library';

	// The articles a ready-made prompt reads every time it is used: a search
	// over the published articles, the chosen ones first.
	let {
		id,
		articles,
		selected = $bindable([]),
		disabled = false
	}: { id: string; articles: LibraryItem[]; selected?: string[]; disabled?: boolean } = $props();
	let query = $state('');
	const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
	const list = $derived(
		[...articles]
			.sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || a.title.localeCompare(b.title, 'th'))
			.filter((item) => {
				const words = fold(query).split(/\s+/).filter(Boolean);
				const text = fold(`${item.title} ${item.summary}`);
				return words.every((word) => text.includes(word));
			})
	);
	function toggle(articleID: string, checked: boolean) {
		selected = checked ? [...new Set([...selected, articleID])] : selected.filter((item) => item !== articleID);
	}
</script>

<div class="ap">
	<div class="ap-head">
		<span class="ap-label" id={`${id}-label`}>{t('เรื่องที่ AI อ่านประกอบ', 'Articles AI reads with it')}<small>{t('ไม่บังคับ', 'Optional')}</small></span>
		{#if selected.length}<span class="ap-count">{t(`เลือกแล้ว ${selected.length} เรื่อง`, `${selected.length} chosen`)}</span>{/if}
	</div>
	{#if articles.length}
		<label class="ap-search">
			<Search size={15} aria-hidden="true" />
			<input {id} type="search" bind:value={query} {disabled} placeholder={t('ค้นหาชื่อเรื่อง', 'Search titles')} aria-describedby={`${id}-label`} />
		</label>
		<ul class="ap-list" aria-labelledby={`${id}-label`}>
			{#each list as item (item.id)}
				<li>
					<label class:on={selected.includes(item.id)}>
						<input
							type="checkbox"
							checked={selected.includes(item.id)}
							disabled={disabled || (!selected.includes(item.id) && selected.length >= TEMPLATE_ARTICLES_MAX)}
							onchange={(event) => toggle(item.id, event.currentTarget.checked)}
						/>
						<span class="ap-ic" aria-hidden="true"><FileText size={14} /></span>
						<span class="ap-t"><b>{item.title}</b>{#if itemExcerpt(item, 70)}<small>{itemExcerpt(item, 70)}</small>{/if}</span>
					</label>
				</li>
			{:else}
				<li class="ap-none">{t('ไม่พบเรื่องที่ค้นหา', 'No matching articles')}</li>
			{/each}
		</ul>
	{:else}
		<p class="ap-none">{t('ยังไม่มีความรู้ที่เผยแพร่แล้ว บันทึกคำสั่งนี้ไปก่อน แล้วเพิ่มเรื่องประกอบทีหลังได้', 'No published articles yet. Save this prompt now and add articles later.')}</p>
	{/if}
</div>

<style>
	/* orca-type-remap v1 */
	.ap {
		display: grid;
		gap: 8px;
	}
	.ap-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.ap-label {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.ap-label small,
	.ap-count {
		color: var(--orca-muted);
		font-size: 12.5px;
		font-weight: 400;
	}
	.ap-search {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-subtle);
	}
	.ap-search:focus-within {
		border-color: var(--orca-focus);
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.ap-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.ap-search input:focus-visible {
		outline: 0;
	}
	.ap-list {
		max-height: 232px;
		margin: 0;
		padding: 4px;
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		list-style: none;
	}
	.ap-list label {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--orca-radius-sm);
		cursor: pointer;
	}
	.ap-list label:hover {
		background: var(--orca-hover);
	}
	.ap-list label.on {
		background: var(--orca-surface);
	}
	.ap-list input {
		width: 18px;
		height: 18px;
		accent-color: var(--orca-control);
	}
	.ap-ic {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.ap-t {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ap-t b {
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.4;
	}
	.ap-t small {
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 12px;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.ap-none {
		margin: 0;
		padding: 10px;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
</style>
