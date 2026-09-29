<script lang="ts">
	import { ArrowRight, Check, ChevronRight, MessageCircle, Search } from '@lucide/svelte';
	import {
		PROGRAM_CHIPS,
		availableChips,
		pickerPrograms,
		programCard,
		programCategory,
		programDisplayName,
		programLine,
		recommendedPrograms,
		type ProgramChip
	} from '$lib/orca/program-catalog';
	import { filterCatalog, type CatalogTool } from '$lib/orca/catalog';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { addByLinkHref } from '$lib/orca/navigation';
	import type { OrcaBootstrap, OrcaCandidate } from '$lib/services/orca';
	import PageHeader from '../ui/PageHeader.svelte';
	import ProgramLogo from './ProgramLogo.svelte';
	import ProgramRequestSheet from './ProgramRequestSheet.svelte';

	// Step 1, เลือกโปรแกรม (the approved mockup add-program-1): search, chips,
	// the four recommended cards and every program, one chip at most per card.
	let {
		data,
		sources,
		loading = false,
		error = '',
		onretry,
		hrefFor,
		connectedHref,
		onpick
	}: {
		data: OrcaBootstrap;
		sources: OrcaCandidate[];
		loading?: boolean;
		error?: string;
		onretry?: () => void;
		/** A program's step-2 address (the page); without it cards are buttons (a sheet). */
		hrefFor?: (sourceID: string) => string;
		/** Where a program the company already connected opens (the page); by default its program page. */
		connectedHref?: (connectionID: string) => string;
		/** A sheet's pick; a program already connected passes its connection. */
		onpick?: (sourceID: string, connectionID?: string) => void;
	} = $props();

	// In a sheet (no page links) the request form opens in place of the list.
	const inline = $derived(!hrefFor);
	let query = $state('');
	let chip = $state<ProgramChip>('all');
	let requestOpen = $state(false);
	const operator = $derived(data.platformOperator === true);
	const context = $derived({ connections: data.connections, operator });
	const chips = $derived(availableChips(sources));
	const everything = $derived(filterCatalog(sources, '', 'all').filter((source) => !source.guideOnly));
	const browsing = $derived(!query.trim() && chip === 'all');
	const recommended = $derived(browsing ? recommendedPrograms(everything) : []);
	const listed = $derived(
		pickerPrograms(sources, { query, chip }, context).filter((source) => !recommended.some((item) => item.id === source.id))
	);

	function cardHref(source: CatalogTool): string | undefined {
		const card = programCard(source, context);
		if (card.state === 'connected')
			return hrefFor ? (connectedHref?.(card.connectionID!) ?? localeHref(`/app?view=servers&connection=${encodeURIComponent(card.connectionID!)}`)) : undefined;
		if (card.state === 'available' && hrefFor) return hrefFor(source.id);
		return undefined;
	}
</script>

{#snippet chipMark(source: CatalogTool)}
	{@const card = programCard(source, context)}
	{#if card.state === 'connected'}<span class="pick-pill ok"><Check size={12} strokeWidth={3} aria-hidden="true" />{t('เชื่อมแล้ว', 'Connected')}</span>
	{:else if card.state === 'soon'}<span class="pick-pill soon">{t('เร็วๆ นี้', 'Coming soon')}</span>{/if}
{/snippet}

{#snippet featured(source: CatalogTool)}
	{@const card = programCard(source, context)}
	{@const href = cardHref(source)}
	{@const line = programLine(source)}
	{@const category = programCategory(source)}
	{#if card.state === 'soon'}
		<div class="pick-feat soon" aria-disabled="true">
			<ProgramLogo name={source.name} size={48} muted />
			{@render chipMark(source)}
			<h3>{programDisplayName(source)}</h3>
			<p>{t(line[0], line[1])}</p>
			<div class="pick-feat-foot"><span>{t(category.th, category.en)}</span></div>
		</div>
	{:else}
		{#snippet body()}
			<ProgramLogo name={source.name} size={48} />
			{@render chipMark(source)}
			<h3>{programDisplayName(source)}</h3>
			<p>{t(line[0], line[1])}</p>
			<div class="pick-feat-foot"><span>{t(category.th, category.en)}</span><span class="pick-go" aria-hidden="true"><ArrowRight size={15} /></span></div>
		{/snippet}
		{#if href}<a class="pick-feat" {href}>{@render body()}</a>
		{:else}<button type="button" class="pick-feat" onclick={() => onpick?.(source.id, card.connectionID)}>{@render body()}</button>{/if}
	{/if}
{/snippet}

{#if inline && requestOpen}
	<ProgramRequestSheet bind:open={requestOpen} {data} program={query.trim()} inline />
{:else}
<div class="pick">
<PageHeader
	title={t('คุณใช้โปรแกรมอะไรในบริษัท?', 'Choose a program')}
	subtitle={t('เลือกโปรแกรมที่อยากให้ AI ช่วยทำงาน แล้ว ORCA จะพาเชื่อมทีละขั้น', 'Pick a program your AI should work with; ORCA walks you through the rest.')}
/>

<div class="pick-search">
	<Search size={20} aria-hidden="true" />
	<input
		type="search"
		bind:value={query}
		placeholder={t('เช่น FlowAccount, PEAK, LINE', 'e.g. FlowAccount, PEAK, LINE')}
		aria-label={t('ค้นหาโปรแกรม', 'Search programs')}
		autocomplete="off"
	/>
</div>
<div class="pick-chips" role="group" aria-label={t('ประเภทโปรแกรม', 'Program type')}>
	{#each PROGRAM_CHIPS.filter((item) => chips.includes(item.id)) as item (item.id)}
		<button type="button" class:on={chip === item.id} aria-pressed={chip === item.id} onclick={() => (chip = item.id)}>{t(item.th, item.en)}</button>
	{/each}
</div>

{#if loading}
	<p class="pick-status" role="status">{t('กำลังโหลดโปรแกรม…', 'Loading programs…')}</p>
{:else if error}
	<div class="pick-status error" role="alert">
		<p>{error}</p>
		{#if onretry}<button type="button" class="k-button small" onclick={onretry}>{t('ลองอีกครั้ง', 'Try again')}</button>{/if}
	</div>
{:else}
	{#if recommended.length}
		<section aria-labelledby="pick-recommended">
			<header class="pick-sec">
				<h2 id="pick-recommended">{t('แนะนำสำหรับธุรกิจไทย', 'Recommended for Thai businesses')}</h2>
				<p>{t('โปรแกรมที่ธุรกิจไทยใช้กันมาก เริ่มจากตรงนี้ได้เลย', 'Programs Thai businesses use most. Start here.')}</p>
			</header>
			<div class="pick-feat-grid">
				{#each recommended as source (source.id)}{@render featured(source)}{/each}
			</div>
		</section>
	{/if}

	<section aria-labelledby="pick-all">
		<header class="pick-sec">
			<h2 id="pick-all">
				{browsing
					? t('โปรแกรมทั้งหมด', 'All programs')
					: query.trim()
						? t(`ผลการค้นหา (${listed.length})`, `Results (${listed.length})`)
						: t(`${PROGRAM_CHIPS.find((item) => item.id === chip)?.th} (${listed.length})`, `${PROGRAM_CHIPS.find((item) => item.id === chip)?.en} (${listed.length})`)}
			</h2>
			{#if browsing}<p>{t('เริ่มจากโปรแกรมเดียวก่อนก็ได้ แล้วค่อยเพิ่มโปรแกรมอื่นภายหลัง', 'Start with one program; add others later.')}</p>{/if}
		</header>
		{#if listed.length}
			<ul class="pick-list">
				{#each listed as source (source.id)}
					{@const card = programCard(source, context)}
					{@const href = cardHref(source)}
					{@const line = programLine(source)}
					<li>
						{#if card.state === 'soon'}
							<div class="pick-row soon" aria-disabled="true">
								<ProgramLogo name={source.name} size={40} muted />
								<span class="pick-row-copy"><b>{programDisplayName(source)}</b><span>{t(line[0], line[1])}</span></span>
								{@render chipMark(source)}
							</div>
						{:else}
							{#snippet body()}
								<ProgramLogo name={source.name} size={40} />
								<span class="pick-row-copy"><b>{programDisplayName(source)}</b><span>{t(line[0], line[1])}</span></span>
								{@render chipMark(source)}
								<ChevronRight size={16} aria-hidden="true" />
							{/snippet}
							{#if href}<a class="pick-row" {href}>{@render body()}</a>
							{:else}<button type="button" class="pick-row" onclick={() => onpick?.(source.id, card.connectionID)}>{@render body()}</button>{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="pick-status">
				{t('ไม่พบโปรแกรมนี้ในรายการ', 'No program matches.')}
				<button type="button" class="k-link-button" onclick={() => (requestOpen = true)}>{t('แจ้งทีม ORCA ให้เพิ่ม', 'Ask the ORCA team to add it')}</button>
			</p>
		{/if}
	</section>
{/if}

<footer class="pick-more">
	<MessageCircle size={17} aria-hidden="true" />
	<span>{t('ไม่พบโปรแกรมที่ใช้?', "Can't find your program?")}</span>
	<button type="button" onclick={() => (requestOpen = true)}>{t('แจ้งทีม ORCA', 'Tell the ORCA team')}</button>
</footer>
{#if operator}
	<p class="pick-operator"><a href={localeHref(addByLinkHref())}>{t('ทีม ORCA: เพิ่มโปรแกรมใหม่ที่คลังโปรแกรม', 'ORCA team: add a program in the program catalog')}</a></p>
{/if}

</div>
{/if}

{#if !inline}<ProgramRequestSheet bind:open={requestOpen} {data} program={query.trim()} />{/if}

<style>
	.pick {
		container-type: inline-size;
		min-width: 0;
	}
	.pick-search {
		position: relative;
		margin-bottom: 14px;
		color: var(--orca-muted);
	}
	.pick-search :global(svg) {
		position: absolute;
		top: 50%;
		left: 20px;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.pick-search input {
		width: 100%;
		height: 56px;
		padding: 0 20px 0 54px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-size: 17px;
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 6%, transparent);
	}
	.pick-search input::placeholder {
		color: var(--orca-subtle);
	}
	.pick-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 48px;
	}
	.pick-chips button {
		padding: 7px 16px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}
	.pick-chips button:hover {
		border-color: var(--orca-line-strong);
	}
	.pick-chips button.on {
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
		font-weight: 600;
	}
	.pick-sec {
		margin: 0 0 16px;
	}
	.pick-sec h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		line-height: 1.3;
	}
	.pick-sec p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.pick-feat-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
		margin-bottom: 48px;
	}
	.pick-feat {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 208px;
		padding: 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: border-color 0.15s var(--orca-ease), box-shadow 0.15s var(--orca-ease);
	}
	.pick-feat:not(.soon):hover {
		border-color: var(--orca-line-strong);
		box-shadow: var(--orca-popover-shadow);
	}
	.pick-feat:not(.soon):hover .pick-go {
		border-color: var(--orca-citron);
		background: var(--orca-citron);
		color: var(--orca-on-citron);
	}
	.pick-feat .pick-pill {
		position: absolute;
		top: 35px;
		right: 22px;
	}
	.pick-feat h3 {
		margin: 18px 0 4px;
		font-size: 17px;
		font-weight: 700;
		line-height: 1.35;
	}
	.pick-feat p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.55;
	}
	.pick-feat-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: auto;
		padding-top: 16px;
		color: var(--orca-subtle);
		font-size: 13px;
	}
	.pick-go {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		flex: none;
		border: 1px solid var(--orca-line);
		border-radius: 50%;
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	.pick-feat.soon {
		border-color: var(--orca-line-soft);
		background: var(--orca-surface-2);
		cursor: default;
	}
	.pick-feat.soon h3,
	.pick-feat.soon p {
		color: var(--orca-subtle);
	}
	.pick-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pick-row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		height: 100%;
		padding: 16px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: border-color 0.15s var(--orca-ease);
	}
	.pick-row:not(.soon):hover {
		border-color: var(--orca-line-strong);
	}
	.pick-row > :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.pick-row-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.pick-row-copy b {
		font-size: 15px;
		font-weight: 600;
		line-height: 1.35;
	}
	.pick-row-copy span {
		margin-top: 1px;
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 13px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* A phone: the one-line description wraps instead of losing its Thai meaning to "…". */
	@media (max-width: 720px) {
		.pick-row-copy span {
			overflow: visible;
			white-space: normal;
			overflow-wrap: anywhere;
		}
	}
	.pick-row.soon {
		border-color: var(--orca-line-soft);
		background: var(--orca-surface-2);
		cursor: default;
	}
	.pick-row.soon b {
		color: var(--orca-subtle);
		font-weight: 500;
	}
	.pick-row.soon .pick-row-copy span {
		color: var(--orca-subtle);
	}
	.pick-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.5;
		white-space: nowrap;
	}
	.pick-pill.ok {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.pick-pill.soon {
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-weight: 500;
	}
	.pick-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 0 0 24px;
		padding: 20px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		color: var(--orca-muted);
		font-size: 14px;
	}
	.pick-status p {
		margin: 0;
	}
	.pick-status.error {
		border-style: solid;
		border-color: var(--orca-deny-line);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.pick-more {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 40px;
		padding-top: 24px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-muted);
		font-size: 14px;
	}
	.pick-more button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-ink);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 4px;
		cursor: pointer;
	}
	.pick-operator {
		margin: 12px 0 0;
		text-align: center;
		font-size: 13px;
	}
	.pick-operator a {
		color: var(--orca-muted);
		text-underline-offset: 3px;
	}
	@container (max-width: 1000px) {
		.pick-feat-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@container (max-width: 640px) {
		.pick-search input {
			height: 50px;
			font-size: 16px;
		}
		.pick-chips {
			margin-bottom: 32px;
		}
		.pick-feat-grid {
			gap: 10px;
			margin-bottom: 32px;
		}
		.pick-feat {
			min-height: 0;
			padding: 16px;
		}
		.pick-feat .pick-pill {
			top: 20px;
			right: 16px;
		}
		.pick-feat h3 {
			margin-top: 12px;
			font-size: 15px;
		}
		.pick-feat p {
			font-size: 13px;
		}
		.pick-list {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
	}
</style>
