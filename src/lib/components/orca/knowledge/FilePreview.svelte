<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { ChevronDown, RefreshCw } from '@lucide/svelte';
	import { getHttpStatusCode, parseErrorContent } from '$lib/errors';
	import { fileActionProblem, locatorLabel } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import { orcaError } from '$lib/services/orca';
	import { OrcaLibraryService, type LibraryFileVersion, type LibraryItem, type LibraryPreviewChunk } from '$lib/services/orca-library';

	// "สิ่งที่ AI จะเห็น" (C4 §14m S5–S7): the text ORCA read from one version
	// of a file, a page at a time (about 20,000 characters), each piece with
	// where it is in the file. The text is shown as text, never as markup.
	let {
		hubID,
		itemID,
		which,
		version,
		ondenied,
		onitem
	}: {
		hubID: string;
		itemID: string;
		which: 'published' | 'pending';
		version: LibraryFileVersion;
		/** The file or the workspace is no longer this person's to read. */
		ondenied?: () => void;
		/** The file has another version now: the item as the server has it, for the page (Codex S7 #6). */
		onitem?: (item: LibraryItem) => void;
	} = $props();
	let chunks = $state<LibraryPreviewChunk[]>([]);
	let total = $state(0);
	let next = $state('');
	// The first page is asked for as soon as the panel shows.
	let loading = $state(true);
	let error = $state('');
	let request = 0;
	// Gone: an answer that comes back after it changes nothing (Codex S7 confirmation #3).
	onDestroy(() => (request += 1));
	// The version the pages shown so far come from: the next page must be of it.
	let reading = untrack(() => version.version);
	const shown = $derived(chunks.reduce((sum, chunk) => sum + [...chunk.text].length, 0));
	const key = $derived(`${hubID}:${itemID}:${which}:${version.version}:${version.state}`);
	const uid = $props.id();

	$effect(() => {
		void key;
		untrack(() => void load(''));
	});

	async function load(cursor: string) {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const page = await OrcaLibraryService.file(hubID, itemID, which, cursor);
			if (current !== request) return;
			// The version asked for is gone (another tab put it in use, or deleted it): nothing
			// of it to show; the page reads the file as it is now (Codex S7 twelfth confirmation #1).
			if (!page.version) {
				chunks = [];
				total = 0;
				next = '';
				onitem?.(page.item);
				return;
			}
			// A next page of another version means the file changed: start again from the new one.
			if (cursor && page.version.version !== reading) {
				restart();
				return;
			}
			if (!cursor) {
				reading = page.version.version;
				// The page knows another version than this one shows: it takes the server's item.
				if (page.version.version !== version.version) onitem?.(page.item);
			}
			chunks = cursor ? [...chunks, ...page.preview] : page.preview;
			total = page.totalChars;
			next = page.nextCursor ?? '';
		} catch (cause) {
			if (current !== request) return;
			const problem = parseErrorContent(cause);
			const code = getHttpStatusCode(cause) ?? problem.status;
			if (code === 403 || code === 404) {
				ondenied?.();
				return;
			}
			if (cursor && /version_changed/.test(problem.message)) {
				restart();
				return;
			}
			error = fileActionProblem(problem, t) ?? orcaError(cause);
		} finally {
			if (current === request) loading = false;
		}
	}
	function restart() {
		chunks = [];
		next = '';
		void load('');
	}
</script>

<section class="fp" aria-labelledby={`fp-title-${uid}`}>
	<div class="fp-head">
		<h2 id={`fp-title-${uid}`}>{t('สิ่งที่ AI จะเห็น', 'What the AI sees')}</h2>
		<p>
			{t('ข้อความที่ ORCA อ่านได้จากไฟล์นี้ บอกหน้า สไลด์ หรือแผ่นงานที่มา', 'The text ORCA read from this file, with the page, slide or sheet it came from')}
		</p>
	</div>
	{#if error}
		<p class="fp-error" role="alert"><span>{error}</span><button type="button" class="k-button small" onclick={() => load('')}><RefreshCw size={14} aria-hidden="true" />{t('ลองอีกครั้ง', 'Try again')}</button></p>
	{:else if loading && !chunks.length}
		<p class="fp-empty" role="status">{t('กำลังโหลดข้อความ…', 'Loading the text…')}</p>
	{:else if !chunks.length}
		<p class="fp-empty">{t('ไม่มีข้อความให้ AI อ่านในไฟล์นี้', 'There is no text for the AI in this file')}</p>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="fp-scroll" role="region" tabindex="0" aria-label={t('ข้อความที่ AI จะเห็น', 'Text the AI sees')}>
			{#each chunks as chunk, index (index)}
				{@const where = locatorLabel(chunk.locator, t)}
				<article class="fp-chunk">
					{#if where}<p class="fp-loc">{where}</p>{/if}
					<div class="fp-text">{chunk.text}</div>
				</article>
			{/each}
		</div>
		<div class="fp-foot">
			<span>{t(`แสดง ${shown.toLocaleString('en-US')} จาก ${total.toLocaleString('en-US')} ตัวอักษร`, `Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} characters`)}</span>
			{#if next}<button type="button" class="k-button small" disabled={loading} aria-busy={loading} onclick={() => load(next)}>{loading ? t('กำลังโหลด…', 'Loading…') : t('ดูต่อ', 'Show more')}<ChevronDown size={14} aria-hidden="true" /></button>{/if}
		</div>
	{/if}
</section>

<style>
	.fp {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.fp-head {
		padding: 18px 22px 12px;
	}
	.fp-head h2 {
		margin: 0 0 4px;
		font-size: 15px;
		font-weight: 700;
	}
	.fp-head p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.fp-scroll {
		max-height: min(70vh, 720px);
		overflow: auto;
		border-top: 1px solid var(--orca-line-soft);
		border-bottom: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		overscroll-behavior: contain;
	}
	.fp-scroll:focus-visible {
		outline: 2px solid var(--orca-focus);
		outline-offset: -2px;
	}
	.fp-chunk {
		padding: 14px 22px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.fp-chunk:first-child {
		border-top: 0;
	}
	.fp-loc {
		margin: 0 0 6px;
		color: var(--orca-subtle);
		font-size: 12.5px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.fp-text {
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.75;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.fp-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
		padding: 10px 22px 14px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.fp-empty {
		margin: 0;
		padding: 16px 22px 20px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.fp-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 0 22px 18px;
		padding: 10px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 13.5px;
	}
	.fp-error span {
		flex: 1 1 220px;
	}
	@media (max-width: 720px) {
		.fp-head,
		.fp-chunk,
		.fp-foot {
			padding-left: 16px;
			padding-right: 16px;
		}
	}
</style>
