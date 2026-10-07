<script lang="ts">
	import { Check, Search } from '@lucide/svelte';
	import { filterCatalog, type CatalogTool } from '$lib/orca/catalog';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { addByLinkHref } from '$lib/orca/navigation';
	import { PROGRAM_CHIPS, availableChips, pickerPrograms, programCard, programDisplayName, programLine, type ProgramChip } from '$lib/orca/program-catalog';
	import { orcaError, type OrcaBootstrap, type OrcaCandidate } from '$lib/services/orca';
	import { ProgramService } from '$lib/services/orca-programs';
	import Modal from '../ui/Modal.svelte';
	import AutoAllowedNotice from './AutoAllowedNotice.svelte';
	import ProgramLogo from './ProgramLogo.svelte';

	// เชื่อมโปรแกรม (W0): the catalog as a dialog, in place of the old step 1.
	// Search, the category tabs and a two-column grid (one on a phone) of logo,
	// name, one line and เชื่อม, or "✓ เชื่อมแล้ว" (admins see the connection
	// state in the same words everywhere). เชื่อม opens the connect page, which
	// comes back here (or to `returnTo`) once the program is saved.
	let {
		data,
		open = $bindable(false),
		returnTo = '',
		added = '',
		onrequest,
		onclose
	}: {
		data: OrcaBootstrap;
		open?: boolean;
		/** Where the connect page returns: "new" (the create form), "welcome" (onboarding), else here. */
		returnTo?: string;
		/** The program the connect page just saved (&added): what AI was allowed, with a way to change it. */
		added?: string;
		/** "ขอให้เพิ่ม": the request form, with what was searched. */
		onrequest?: (query: string) => void;
		onclose?: () => void;
	} = $props();

	let sources = $state.raw<OrcaCandidate[]>([]);
	let loading = $state(false);
	let loaded = $state(false);
	let error = $state('');
	let query = $state('');
	let chip = $state<ProgramChip>('all');
	const operator = $derived(data.platformOperator === true);
	const justAdded = $derived(added ? data.connections.find((item) => item.id === added && !item.archivedAt && !item.deletedAt) : undefined);
	const context = $derived({ connections: data.connections, operator });
	const chips = $derived(availableChips(sources));
	const listed = $derived(pickerPrograms(sources, { query, chip }, context));
	const everything = $derived(filterCatalog(sources, '', 'all').filter((source) => !source.guideOnly).length);

	async function load(refresh = false) {
		loading = true;
		error = '';
		try {
			sources = await ProgramService.candidates(refresh);
			loaded = true;
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (open && !loaded && !loading && !error) void load();
	});
	const back = $derived(returnTo === 'new' || returnTo === 'welcome' ? `&return=${returnTo}` : '');
	const connectHref = (source: CatalogTool) => localeHref(`/app?view=add-program&source=${encodeURIComponent(source.id)}&step=connect${back}`);
	const programHref = (connectionID: string) =>
		localeHref(returnTo === 'new' ? `/app?view=new&connection=${encodeURIComponent(connectionID)}` : `/app?view=servers&connection=${encodeURIComponent(connectionID)}`);
	function request() {
		const searched = query.trim();
		open = false;
		onrequest?.(searched);
	}
</script>

<Modal bind:open title={term('addProgram', t)} wide {onclose}>
	<div class="cat-tools">
		<label class="cat-search">
			<Search size={16} aria-hidden="true" />
			<span class="sr-only">{t('ค้นหาโปรแกรม', 'Search programs')}</span>
			<input type="search" bind:value={query} placeholder={t('ค้นหาโปรแกรม', 'Search programs')} autocomplete="off" />
		</label>
		{#if chips.length > 1}
			<div class="cat-tabs" role="tablist" aria-label={t('หมวดโปรแกรม', 'Program categories')}>
				{#each PROGRAM_CHIPS.filter((item) => chips.includes(item.id)) as item (item.id)}
					<button type="button" role="tab" class:on={chip === item.id} aria-selected={chip === item.id} onclick={() => (chip = item.id)}>{t(item.th, item.en)}</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if justAdded}<AutoAllowedNotice connection={justAdded} />{/if}
	{#if loading && !loaded}
		<p class="cat-status" role="status">{t('กำลังโหลดโปรแกรม…', 'Loading programs…')}</p>
	{:else if error}
		<div class="cat-status" role="alert">
			<p>{error}</p>
			<button type="button" class="k-button small" onclick={() => load(true)}>{t('ลองอีกครั้ง', 'Try again')}</button>
		</div>
	{:else if listed.length}
		<ul class="cat-grid" aria-label={t(`โปรแกรม ${listed.length} จาก ${everything}`, `${listed.length} of ${everything} programs`)}>
			{#each listed as source (source.id)}
				{@const card = programCard(source, context)}
				{@const line = programLine(source)}
				<li class="cat-card" class:soon={card.state === 'soon'}>
					<ProgramLogo name={source.name} size={36} muted={card.state === 'soon'} />
					<span class="cat-copy">
						{#if card.state === 'connected'}<a class="cat-name" href={programHref(card.connectionID!)}>{programDisplayName(source)}</a>
						{:else}<span class="cat-name">{programDisplayName(source)}</span>{/if}
						<small>{t(line[0], line[1])}</small>
					</span>
					{#if card.state === 'connected'}<span class="cat-state"><Check size={14} strokeWidth={2.25} aria-hidden="true" />{t('เชื่อมแล้ว', 'Connected')}</span>
					{:else if card.state === 'soon'}<span class="cat-later">{t('เร็วๆ นี้', 'Coming soon')}</span>
					{:else}<a class="k-button small" href={connectHref(source)} aria-label={t(`เชื่อม ${programDisplayName(source)}`, `Connect ${programDisplayName(source)}`)}>{t('เชื่อม', 'Connect')}</a>{/if}
				</li>
			{/each}
		</ul>
	{:else if loaded}
		<p class="cat-status">{t('ไม่พบโปรแกรมนี้ในรายการ', 'No program matches.')}</p>
	{/if}
	{#snippet footer()}
		<p class="cat-foot">{t('ไม่เจอโปรแกรมที่ใช้?', "Can't find your program?")} <button type="button" class="cat-request" onclick={request}>{t('ขอให้เพิ่ม', 'Ask us to add it')}</button></p>
		{#if operator}<a class="cat-link" href={localeHref(addByLinkHref())}>{t('เพิ่มด้วยลิงก์ MCP', 'Add with an MCP link')}</a>{/if}
	{/snippet}
</Modal>

<style>
	.cat-tools {
		position: sticky;
		top: -10px;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: -10px -22px 0;
		padding: 10px 22px 0;
		background: var(--orca-dialog, var(--orca-surface));
	}
	.cat-search {
		position: relative;
		display: block;
		color: var(--orca-subtle);
	}
	.cat-search :global(svg) {
		position: absolute;
		top: 50%;
		left: 11px;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.cat-search input {
		width: 100%;
		height: 38px;
		padding: 0 12px 0 34px;
		border: 1px solid var(--orca-field-line, var(--orca-line-strong));
		border-radius: var(--orca-radius);
		background: var(--orca-field, var(--orca-surface));
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.cat-tabs {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		box-shadow: inset 0 -1px 0 var(--orca-line);
		scrollbar-width: none;
	}
	.cat-tabs::-webkit-scrollbar {
		display: none;
	}
	.cat-tabs button {
		flex: none;
		padding: 8px 10px;
		border: 0;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--orca-muted);
		font: inherit;
		font-size: 13.5px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}
	.cat-tabs button:hover {
		color: var(--orca-ink);
	}
	.cat-tabs button.on {
		border-bottom-color: var(--orca-ink);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.cat-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin: 0;
		padding: 14px 0 0;
		list-style: none;
	}
	.cat-card {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.cat-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.cat-name {
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.45;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.cat-name:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.cat-copy small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.cat-card .k-button {
		flex: none;
	}
	.cat-state {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 5px;
		color: var(--orca-ink);
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
	.cat-later {
		flex: none;
		color: var(--orca-subtle);
		font-size: 12.5px;
		white-space: nowrap;
	}
	.cat-card.soon .cat-name {
		color: var(--orca-subtle);
	}
	.cat-status {
		margin: 16px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.cat-status p {
		margin: 0 0 10px;
	}
	.cat-foot {
		margin: 0;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	/* The one highlighted link: a citron underline (W0). */
	.cat-request {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-ink);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--orca-citron);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
		cursor: pointer;
	}
	.cat-link {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
	}
	.cat-link:hover {
		color: var(--orca-ink);
	}
	@media (max-width: 720px) {
		.cat-tools {
			margin: -8px -16px 0;
			padding: 8px 16px 0;
		}
		.cat-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
