<script lang="ts">
	import { ArrowRight, Check, ChevronRight, Search } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { catalogSource, filterCatalog } from '$lib/orca/catalog';
	import { healthByConnection } from '$lib/orca/connection-health';
	import { sourcePresentationNames } from '$lib/orca/connection-presentation';
	import { gatewayMemberIDs, gatewayUsesConnection } from '$lib/orca/gateway-sources';
	import { programsToReconnect, RECONNECT_WORD } from '$lib/orca/home-attention';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		programCard,
		programDisplayName,
		programLine,
		programStatus,
		programStatusCopy,
		recommendedPrograms
	} from '$lib/orca/program-catalog';
	import { accessSummary } from '$lib/orca/program-tools';
	import { OrcaService, type OrcaBootstrap, type OrcaCandidate, type OrcaConnection, type OrcaConnectionHealth, type OrcaProgramAccount } from '$lib/services/orca';
	import { ProgramService } from '$lib/services/orca-programs';
	import { onDestroy, onMount } from 'svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import CatalogModal from './programs/CatalogModal.svelte';
	import ProgramLogo from './programs/ProgramLogo.svelte';
	import ProgramRequestSheet from './programs/ProgramRequestSheet.svelte';

	// โปรแกรม (view=servers): one row per program with what AI can do, the
	// workspaces that use it and one status. The page only mounts it for
	// managers. A company with no program yet starts from the four recommended
	// cards, which open the connect page. W0: เชื่อมโปรแกรม opens the catalog
	// dialog, held in the address (&catalog=1) so a reload or a link opens it.
	let { data }: { data: OrcaBootstrap; onchanged?: () => Promise<void> } = $props();

	type Filter = 'all' | 'ready' | 'review' | 'paused' | 'archived';
	const fromAddress: Record<string, Filter> = { ready: 'ready', connected: 'ready', 'needs-review': 'review', review: 'review', paused: 'paused', archived: 'archived' };
	let filter = $state<Filter>(fromAddress[page.url.searchParams.get('status') ?? ''] ?? 'all');
	let query = $state('');
	let candidates = $state.raw<OrcaCandidate[]>([]);
	let health = $state.raw<Map<string, OrcaConnectionHealth>>(new Map());
	/** The company accounts, for ต้องเชื่อมใหม่ (the same read as Home); none until read. */
	let accounts = $state.raw<OrcaProgramAccount[]>();
	let alive = true;

	const live = $derived(data.connections.filter((item) => !item.deletedAt));
	const needsLook = (status: string | undefined) => status === 'review' || status === 'setup';
	const statuses = $derived(new Map(live.map((item) => [item.id, programStatus(item, health.get(item.id))])));
	const reconnect = $derived(new Set(programsToReconnect(live, accounts).map((item) => item.id)));
	// W0.1: เชื่อมแล้ว counts the cards that say เชื่อมแล้ว (ready, not waiting to sign in again).
	const connected = (id: string) => statuses.get(id) === 'ready' && !reconnect.has(id);
	const counts = $derived({
		all: live.filter((item) => !item.archivedAt).length,
		ready: live.filter((item) => connected(item.id)).length,
		// Waiting for a choice or for a new review: one chip, "ต้องจัดการ".
		review: live.filter((item) => needsLook(statuses.get(item.id))).length,
		paused: live.filter((item) => statuses.get(item.id) === 'paused').length,
		archived: live.filter((item) => item.archivedAt).length
	});
	const words = $derived(query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean));
	const rows = $derived(
		live.filter((item) => {
			const status = statuses.get(item.id);
			if (filter === 'archived' ? status !== 'archived' : status === 'archived') return false;
			if (filter === 'ready' && !connected(item.id)) return false;
			if (filter === 'review' && !needsLook(status)) return false;
			if (filter === 'paused' && status !== 'paused') return false;
			const text = `${item.name} ${item.description}`.normalize('NFKC').toLocaleLowerCase();
			return words.every((word) => text.includes(word));
		})
	);
	const logos = $derived(sourcePresentationNames(candidates));
	const recommended = $derived(recommendedPrograms(filterCatalog(candidates, '', 'all')));
	const filters = $derived(
		(
			[
				{ id: 'all', label: t('ทั้งหมด', 'All') },
				{ id: 'ready', label: t('เชื่อมแล้ว', 'Connected') },
				{ id: 'review', label: t('ต้องจัดการ', 'Needs attention') },
				{ id: 'paused', label: t('หยุดชั่วคราว', 'Paused') },
				{ id: 'archived', label: t('จัดเก็บแล้ว', 'Archived') }
			] as { id: Filter; label: string }[]
		).filter((item) => item.id === 'all' || counts[item.id] > 0 || filter === item.id)
	);
	// The people who can use a program: everyone in the workspaces that use it.
	function people(connection: OrcaConnection): number {
		const ids = new Set<string>();
		for (const hub of data.hubs)
			if (hub.status !== 'archived' && hub.status !== 'deleted' && gatewayUsesConnection(hub, connection.id)) for (const id of gatewayMemberIDs(hub)) ids.add(id);
		return ids.size;
	}

	onMount(() => {
		if (!data.canManage) return;
		void ProgramService.candidates()
			.then((result) => {
				if (alive) candidates = result;
			})
			.catch(() => {
				// Logos and the recommended cards are extras; the list works without them.
			});
		void OrcaService.programAccounts()
			.then((result) => {
				if (alive) accounts = result;
			})
			.catch(() => {
				// Without the list no program is said to need reconnecting.
			});
		void OrcaService.connectionHealth()
			.then((result) => {
				if (alive) health = healthByConnection(result.items);
			})
			.catch(() => {
				// A program that changed at the provider is still caught by its own review state.
			});
	});
	onDestroy(() => {
		alive = false;
	});
	// The catalog dialog follows the address; closing it drops &catalog (and &return).
	let catalogOpen = $state(false);
	$effect(() => {
		catalogOpen = page.url.searchParams.get('catalog') === '1';
	});
	const returnTo = $derived(page.url.searchParams.get('return') ?? '');
	const added = $derived(page.url.searchParams.get('added') ?? '');
	const startCompany = $derived(page.url.searchParams.get('as') === 'company');
	function closeCatalog() {
		const url = new URL(page.url.href);
		if (!url.searchParams.has('catalog')) return;
		url.searchParams.delete('catalog');
		url.searchParams.delete('return');
		url.searchParams.delete('added');
		url.searchParams.delete('as');
		void goto(url.pathname + url.search + url.hash, { replaceState: true, keepFocus: true, noScroll: true });
	}
	let requestOpen = $state(false);
	let requested = $state('');
	const catalogHref = $derived(localeHref('/app?view=servers&catalog=1'));
	const detail = (id: string, tab = '') =>
		localeHref(`/app?view=servers&connection=${encodeURIComponent(id)}${tab ? `&tab=${tab}` : ''}`);
</script>

<PageHeader title={term('programs', t)} subtitle={t('โปรแกรมที่ AI ของทีมใช้ได้', 'The programs your team’s AI can use.')}>
	{#snippet action()}
		{#if data.canManage}<a class="k-button" href={catalogHref}>{term('addProgram', t)}</a>{/if}
	{/snippet}
</PageHeader>

{#if !live.length || (!counts.all && filter === 'all' && !words.length)}
	<!-- Nothing in use (archived ones aside): start from the recommended programs. -->
	<section class="programs-start" aria-labelledby="programs-start-title">
		<h2 id="programs-start-title">{t('ยังไม่มีโปรแกรมที่เชื่อม', 'No programs connected yet')}</h2>
		<p>{t('เริ่มจากโปรแกรมที่ธุรกิจไทยใช้กันมาก เชื่อมได้ในไม่กี่นาที', 'Start with a program Thai businesses use most. It takes a few minutes.')}</p>
		{#if recommended.length}
			<div class="programs-start-grid">
				{#each recommended as source (source.id)}
					{@const card = programCard(source, { connections: data.connections, operator: data.platformOperator === true })}
					{@const line = programLine(source)}
					{#if card.state === 'soon'}
						<div class="programs-start-card soon" aria-disabled="true">
							<ProgramLogo name={source.name} size={44} muted />
							<strong>{programDisplayName(source)}</strong>
							<span>{t(line[0], line[1])}</span>
							<em>{t('เร็วๆ นี้', 'Coming soon')}</em>
						</div>
					{:else}
						<a class="programs-start-card" href={localeHref(`/app?view=add-program&source=${encodeURIComponent(source.id)}&step=connect`)}>
							<ProgramLogo name={source.name} size={44} />
							<strong>{programDisplayName(source)}</strong>
							<span>{t(line[0], line[1])}</span>
							<em class="go" aria-hidden="true"><ArrowRight size={15} /></em>
						</a>
					{/if}
				{/each}
			</div>
		{/if}
		<div class="programs-start-links">
			<a class="programs-start-all" href={catalogHref}>{t('ดูโปรแกรมทั้งหมด', 'See every program')}<ChevronRight size={15} aria-hidden="true" /></a>
			{#if counts.archived}<button type="button" class="k-link-button" onclick={() => (filter = 'archived')}>{t(`ดูที่จัดเก็บแล้ว (${counts.archived})`, `See archived (${counts.archived})`)}</button>{/if}
		</div>
	</section>
{:else}
	<div class="programs-toolbar">
		<label class="programs-search">
			<Search size={16} aria-hidden="true" />
			<input type="search" bind:value={query} placeholder={t('ค้นหาโปรแกรม', 'Search programs')} aria-label={t('ค้นหาโปรแกรม', 'Search programs')} />
		</label>
		<!-- W0: one filter as a dropdown ("ทั้งหมด n ▾"), never a row of black chips. -->
		<label class="programs-filter">
			<span class="sr-only">{t('กรองตามสถานะ', 'Filter by status')}</span>
			<select bind:value={filter}>
				{#each filters as item (item.id)}<option value={item.id}>{item.label} {counts[item.id]}</option>{/each}
			</select>
		</label>
	</div>

	{#if rows.length}
		<ul class="programs-grid" aria-label={term('programs', t)}>
			{#each rows as connection (connection.id)}
				{@const summary = accessSummary(connection)}
				{@const status = statuses.get(connection.id) ?? 'ready'}
				{@const copy = programStatusCopy(status)}
				{@const source = candidates.find((item) => item.id === connection.mcpID)}
				<li class="programs-card">
					<div class="programs-card-top">
						<ProgramLogo name={logos[connection.mcpID] || connection.name} size={40} />
						<span class="programs-card-name">
							<a href={detail(connection.id)} title={connection.description || (source ? t(...programLine(catalogSource(source))) : connection.scopeNote || '')}>{connection.name}</a>
							<small>{connection.programAccountID ? t('บัญชีกลาง', 'Company account') : t('บัญชีของแต่ละคน', "Each person's own account")}</small>
						</span>
					</div>
					<div class="programs-card-foot">
						{#if reconnect.has(connection.id)}<span class="programs-state warn"><i aria-hidden="true"></i>{t(RECONNECT_WORD.th, RECONNECT_WORD.en)}</span>
						{:else if status === 'ready'}<span class="programs-state ok"><Check size={14} strokeWidth={2.25} aria-hidden="true" />{t(copy.th, copy.en)}</span>
						{:else}<span class="programs-state {copy.tone}"><i aria-hidden="true"></i>{t(copy.th, copy.en)}</span>{/if}
						<!-- Nothing chosen yet: the state says it; the right side stays empty (W0 visual review). -->
						{#if summary.count && summary.reviewed}<span class="programs-meta"
								>{t(`AI ทำได้ ${summary.count} อย่าง · ${people(connection)} คน`, `AI can do ${summary.count} · ${people(connection)} people`)}</span
							>{/if}
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="programs-empty">
			<p>{t('ไม่พบโปรแกรมที่ตรงกับตัวกรอง', 'No programs match.')}</p>
			<button type="button" class="k-button small" onclick={() => { filter = 'all'; query = ''; }}>{t('ล้างตัวกรอง', 'Clear filters')}</button>
		</div>
	{/if}
{/if}

{#if data.canManage}
	<CatalogModal
		{data}
		bind:open={catalogOpen}
		{returnTo}
		{added}
		{startCompany}
		onclose={closeCatalog}
		onrequest={(query) => {
			requested = query;
			requestOpen = true;
		}}
	/>
	<ProgramRequestSheet bind:open={requestOpen} {data} program={requested} />
{/if}

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.programs-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 12px;
		margin-bottom: 16px;
	}
	.programs-search {
		position: relative;
		display: block;
		flex: 1 1 240px;
		max-width: 360px;
		color: var(--orca-subtle);
	}
	.programs-search :global(svg) {
		position: absolute;
		top: 50%;
		left: 11px;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.programs-search input {
		width: 100%;
		height: 32px;
		padding: 0 12px 0 34px;
		border: 1px solid var(--orca-field-line, var(--orca-line-strong));
		border-radius: var(--orca-radius-sm);
		background: var(--orca-field, var(--orca-surface));
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
	}
	.programs-filter select {
		height: 32px;
		padding: 0 30px 0 12px;
		border: 1px solid var(--orca-field-line, var(--orca-line-strong));
		border-radius: var(--orca-radius-sm);
		background-color: var(--orca-field, var(--orca-surface));
		color: var(--orca-ink);
		font: inherit;
		font-size: 13px;
	}
	/* W0.1: as many 280 px cards as fit: 4 across at 1440 with the rail, 3 when pinned, 1 on a phone. */
	.programs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.programs-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
		padding: 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.programs-card:hover {
		border-color: var(--orca-line-strong);
	}
	.programs-card-top {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.programs-card-name {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.programs-card-name a {
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The whole card opens the program. */
	.programs-card-name a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.programs-card:has(a:focus-visible) {
		outline: 2px solid var(--orca-focus, var(--orca-ink));
		outline-offset: 2px;
	}
	.programs-card-name a:focus-visible {
		outline: 0;
	}
	.programs-card-name small,
	.programs-meta {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.programs-card-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px 8px;
		margin-top: auto;
		padding-top: 12px;
		border-top: 1px solid var(--orca-line);
	}
	.programs-meta {
		text-align: right;
	}
	/* A state is text with a dot (or a check when connected), never a filled pill. */
	.programs-state {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--orca-ink);
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
	.programs-state i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-muted);
	}
	.programs-state.warn i {
		background: var(--orca-warn);
	}
	.programs-state.deny i {
		background: var(--orca-deny);
	}
	.programs-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 36px 20px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		color: var(--orca-muted);
	}
	.programs-empty p {
		margin: 0;
	}
	.programs-start {
		padding: 28px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
	}
	.programs-start h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}
	.programs-start > p {
		margin: 6px 0 20px;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.programs-start-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}
	.programs-start-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 180px;
		padding: 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		text-decoration: none;
		transition: border-color 0.15s var(--orca-ease), box-shadow 0.15s var(--orca-ease);
	}
	.programs-start-card strong {
		margin-top: 14px;
		font-size: 14px;
		font-weight: 700;
	}
	.programs-start-card span {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.programs-start-card em {
		margin-top: auto;
		padding-top: 12px;
		color: var(--orca-muted);
		font-size: 12px;
		font-style: normal;
	}
	.programs-start-card .go {
		display: grid;
		place-items: center;
		align-self: flex-end;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid var(--orca-line);
		border-radius: 50%;
		color: var(--orca-ink);
	}
	.programs-start-card:not(.soon):hover {
		border-color: var(--orca-line-strong);
		box-shadow: var(--orca-popover-shadow);
	}
	.programs-start-card:not(.soon):hover .go {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.programs-start-card.soon {
		border-color: var(--orca-line-soft);
		background: var(--orca-surface-2);
	}
	.programs-start-card.soon strong,
	.programs-start-card.soon span {
		color: var(--orca-subtle);
	}
	.programs-start-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 24px;
		margin-top: 20px;
	}
	.programs-start-links .k-link-button {
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.programs-start-all {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 4px;
	}
	@media (max-width: 1100px) {
		.programs-start-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 720px) {
		.programs-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.programs-search {
			max-width: none;
		}
		.programs-start {
			padding: 20px;
		}
		.programs-start-grid {
			gap: 10px;
		}
		.programs-start-card {
			min-height: 0;
			padding: 16px;
		}
	}
</style>
