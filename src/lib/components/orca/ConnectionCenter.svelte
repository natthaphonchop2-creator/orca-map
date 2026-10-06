<script lang="ts">
	import { ArrowRight, ChevronRight, Plus, Search } from '@lucide/svelte';
	import { page } from '$app/state';
	import { catalogSource, filterCatalog } from '$lib/orca/catalog';
	import { healthByConnection } from '$lib/orca/connection-health';
	import { sourcePresentationNames } from '$lib/orca/connection-presentation';
	import { gatewayUsesConnection } from '$lib/orca/gateway-sources';
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
	import { OrcaService, type OrcaBootstrap, type OrcaCandidate, type OrcaConnectionHealth } from '$lib/services/orca';
	import { ProgramService } from '$lib/services/orca-programs';
	import { onDestroy, onMount } from 'svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import StatusPill from './ui/StatusPill.svelte';
	import ProgramLogo from './programs/ProgramLogo.svelte';

	// โปรแกรมที่เชื่อม (view=servers): one row per program with what AI can do,
	// the workspaces that use it and one status chip. The page only mounts it
	// for managers. A company with no program yet starts from the four
	// recommended cards, which jump straight to step 2.
	let { data }: { data: OrcaBootstrap; onchanged?: () => Promise<void> } = $props();

	type Filter = 'all' | 'review' | 'paused' | 'archived';
	const fromAddress: Record<string, Filter> = { 'needs-review': 'review', review: 'review', paused: 'paused', archived: 'archived' };
	let filter = $state<Filter>(fromAddress[page.url.searchParams.get('status') ?? ''] ?? 'all');
	let query = $state('');
	let candidates = $state.raw<OrcaCandidate[]>([]);
	let health = $state.raw<Map<string, OrcaConnectionHealth>>(new Map());
	let alive = true;

	const live = $derived(data.connections.filter((item) => !item.deletedAt));
	const needsLook = (status: string | undefined) => status === 'review' || status === 'setup';
	const statuses = $derived(new Map(live.map((item) => [item.id, programStatus(item, health.get(item.id))])));
	const counts = $derived({
		all: live.filter((item) => !item.archivedAt).length,
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
				{ id: 'review', label: t('ต้องจัดการ', 'Needs attention') },
				{ id: 'paused', label: t('หยุดชั่วคราว', 'Paused') },
				{ id: 'archived', label: t('จัดเก็บแล้ว', 'Archived') }
			] as { id: Filter; label: string }[]
		).filter((item) => item.id === 'all' || counts[item.id] > 0 || filter === item.id)
	);

	onMount(() => {
		if (!data.canManage) return;
		void ProgramService.candidates()
			.then((result) => {
				if (alive) candidates = result;
			})
			.catch(() => {
				// Logos and the recommended cards are extras; the list works without them.
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
	const detail = (id: string, tab = '') =>
		localeHref(`/app?view=servers&connection=${encodeURIComponent(id)}${tab ? `&tab=${tab}` : ''}`);
</script>

<PageHeader title={term('programs', t)} subtitle={t('โปรแกรมที่ AI ของทีมใช้ได้', 'The programs your team’s AI can use.')}>
	{#snippet action()}
		{#if data.canManage}<a class="k-button primary" href={localeHref('/app?view=add-program')}><Plus size={16} aria-hidden="true" />{term('addProgram', t)}</a>{/if}
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
			<a class="programs-start-all" href={localeHref('/app?view=add-program')}>{t('ดูโปรแกรมทั้งหมด', 'See every program')}<ChevronRight size={15} aria-hidden="true" /></a>
			{#if counts.archived}<button type="button" class="k-link-button" onclick={() => (filter = 'archived')}>{t(`ดูที่จัดเก็บแล้ว (${counts.archived})`, `See archived (${counts.archived})`)}</button>{/if}
		</div>
	</section>
{:else}
	<div class="programs-toolbar">
		<div class="programs-filters" role="group" aria-label={t('กรองตามสถานะ', 'Filter by status')}>
			{#each filters as item (item.id)}
				<button type="button" class:on={filter === item.id} aria-pressed={filter === item.id} onclick={() => (filter = item.id)}
					>{item.label}<span>{counts[item.id]}</span></button
				>
			{/each}
		</div>
		{#if live.length > 6}
			<label class="programs-search">
				<Search size={16} aria-hidden="true" />
				<input type="search" bind:value={query} placeholder={t('ค้นหาโปรแกรม', 'Search programs')} aria-label={t('ค้นหาโปรแกรม', 'Search programs')} />
			</label>
		{/if}
	</div>

	{#if rows.length}
		<div class="programs-table" role="table" aria-label={term('programs', t)}>
			<div class="programs-head" role="row">
				<span role="columnheader">{t('โปรแกรม', 'Program')}</span>
				<span role="columnheader">{term('whatAICanDo', t)}</span>
				<span role="columnheader">{t('พื้นที่ทำงาน', 'Workspaces')}</span>
				<span role="columnheader">{t('สถานะ', 'Status')}</span>
				<span aria-hidden="true"></span>
			</div>
			{#each rows as connection (connection.id)}
				{@const summary = accessSummary(connection)}
				{@const status = programStatusCopy(statuses.get(connection.id) ?? 'ready')}
				{@const workspaces = data.hubs.filter((hub) => gatewayUsesConnection(hub, connection.id) && hub.status !== 'archived' && hub.status !== 'deleted').length}
				{@const source = candidates.find((item) => item.id === connection.mcpID)}
				<div class="programs-row" role="row">
					<span class="programs-name" role="cell">
						<ProgramLogo name={logos[connection.mcpID] || connection.name} size={40} />
						<span>
							<a href={detail(connection.id)}>{connection.name}</a>
							<small>{connection.description || (source ? t(...programLine(catalogSource(source))) : connection.scopeNote || '')}</small>
						</span>
					</span>
					<span class="programs-cell" role="cell" data-label={term('whatAICanDo', t)}>
						{#if summary.count && summary.reviewed}
							<b>{t(`${summary.count} อย่าง`, `${summary.count} ${summary.count === 1 ? 'thing' : 'things'}`)}</b>
							<small>{summary.readOnly ? t('อ่านอย่างเดียว', 'Read only') : t('อ่านและแก้ไข', 'Read and change')}</small>
						{:else}<small>{t('ยังไม่ได้เลือก', 'Not chosen yet')}</small>{/if}
					</span>
					<span class="programs-cell" role="cell" data-label={t('พื้นที่ทำงาน', 'Workspaces')}>
						<a class="programs-count" href={detail(connection.id, 'workspaces')}>{workspaces
							? t(`${workspaces} พื้นที่`, `${workspaces} ${workspaces === 1 ? 'workspace' : 'workspaces'}`)
							: t('ยังไม่ได้ใช้', 'Not used yet')}</a>
					</span>
					<span class="programs-cell" role="cell" data-label={t('สถานะ', 'Status')}><StatusPill label={t(status.th, status.en)} tone={status.tone} dot /></span>
					<span class="programs-go" aria-hidden="true"><ChevronRight size={16} /></span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="programs-empty">
			<p>{t('ไม่พบโปรแกรมที่ตรงกับตัวกรอง', 'No programs match.')}</p>
			<button type="button" class="k-button small" onclick={() => { filter = 'all'; query = ''; }}>{t('ล้างตัวกรอง', 'Clear filters')}</button>
		</div>
	{/if}
{/if}

<style>
	/* orca-type-remap v1 */
	.programs-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}
	.programs-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.programs-filters button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font: inherit;
		font-size: 13.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.programs-filters button span {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.programs-filters button.on {
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
		font-weight: 600;
	}
	.programs-filters button.on span {
		color: inherit;
	}
	.programs-search {
		position: relative;
		display: block;
		width: min(320px, 100%);
		color: var(--orca-muted);
	}
	.programs-search :global(svg) {
		position: absolute;
		top: 50%;
		left: 12px;
		transform: translateY(-50%);
	}
	.programs-search input {
		width: 100%;
		padding: 9px 12px 9px 36px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
	}
	.programs-table {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.programs-head,
	.programs-row {
		display: grid;
		grid-template-columns: minmax(0, 2.2fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 20px;
		align-items: center;
		gap: 16px;
		padding: 14px 20px;
	}
	.programs-head {
		padding-block: 11px;
		border-bottom: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 12.5px;
		font-weight: 600;
	}
	.programs-row {
		position: relative;
		border-top: 1px solid var(--orca-line-soft);
		transition: background-color 0.15s var(--orca-ease);
	}
	.programs-head + .programs-row {
		border-top: 0;
	}
	.programs-row:hover {
		background: var(--orca-hover);
	}
	.programs-name {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.programs-name > span:last-child {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.programs-name a {
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The whole row opens the program. */
	.programs-name a::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.programs-name a:focus-visible {
		outline: none;
	}
	.programs-row:has(.programs-name a:focus-visible) {
		outline: 2px solid var(--orca-focus);
		outline-offset: -2px;
	}
	.programs-name small,
	.programs-cell small {
		display: block;
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.programs-cell {
		min-width: 0;
		font-size: 13.5px;
	}
	.programs-cell b {
		display: block;
		font-weight: 600;
	}
	.programs-count {
		position: relative;
		z-index: 1;
		color: var(--orca-text-2);
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
	}
	.programs-go {
		color: var(--orca-subtle);
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
		font-size: 18px;
		font-weight: 700;
	}
	.programs-start > p {
		margin: 6px 0 20px;
		color: var(--orca-muted);
		font-size: 14px;
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
		font-size: 15px;
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
		font-size: 12.5px;
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
		border-color: var(--orca-citron);
		background: var(--orca-citron);
		color: var(--orca-on-citron);
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
	/* Under 720px each row is a card. */
	@media (max-width: 720px) {
		.programs-table {
			border: 0;
			background: transparent;
		}
		.programs-head {
			display: none;
		}
		.programs-row {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			/* The cells' small labels line up across the card. */
			align-items: start;
			gap: 12px;
			margin-bottom: 12px;
			padding: 16px;
			border: 1px solid var(--orca-line);
			border-radius: var(--orca-radius-lg);
			background: var(--orca-surface);
		}
		.programs-head + .programs-row {
			border-top: 1px solid var(--orca-line);
		}
		.programs-name {
			grid-column: 1 / -1;
		}
		.programs-cell::before {
			content: attr(data-label);
			display: block;
			margin-bottom: 2px;
			color: var(--orca-muted);
			font-size: 11.5px;
		}
		.programs-go {
			position: absolute;
			top: 26px;
			right: 16px;
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
