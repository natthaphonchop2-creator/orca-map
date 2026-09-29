<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { ArrowRight, Info, Link2, LoaderCircle, Search, TriangleAlert } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { catalogSourceDisplayName } from '$lib/orca/catalog';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { platformHref } from '$lib/orca/navigation';
	import { OrcaService, orcaError, type OrcaBootstrap, type OrcaCandidate } from '$lib/services/orca';
	import {
		catalogState,
		catalogSummary,
		remoteEntryManifest,
		searchCatalog,
		sharedProviderApp,
		validMCPLink,
		type CatalogState,
		type RemoteAuth
	} from '$lib/services/orca-u2';
	import SourceSetup from '../SourceSetup.svelte';
	import ChoiceTile from '../ui/ChoiceTile.svelte';
	import FormErrorSummary from '../ui/FormErrorSummary.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import Sheet from '../ui/Sheet.svelte';
	import StatusPill, { type StatusTone } from '../ui/StatusPill.svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import PlatformBadge from './PlatformBadge.svelte';

	// แพลตฟอร์ม ORCA › คลังโปรแกรม: the catalog every company picks programs
	// from. Only the ORCA team adds to it (a program by its MCP link) and settles
	// what a program needs before customers can connect it: a provider's review,
	// or an app of its own. These tools used to sit inside the company's
	// "add a system" flow; the server still refuses them to anyone else.
	let { data }: { data: OrcaBootstrap } = $props();
	const operator = $derived(data.platformOperator === true);
	let candidates = $state<OrcaCandidate[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let error = $state('');
	let query = $state('');
	let alive = true;
	let request = 0;
	// The side panel: adding a program by its MCP link, or checking one program.
	let panelOpen = $state(false);
	let panelMode = $state<'add' | 'check'>('add');
	let checking = $state<{ id: string; name: string; endpointHost?: string; managedProvider?: string }>();
	let checkBusy = $state(false);
	// The add form.
	let name = $state('');
	let endpoint = $state('');
	let auth = $state<RemoteAuth>('none');
	let adding = $state(false);
	let addErrors = $state<{ field?: string; message: string }[]>([]);
	const invalid = (field: string) => addErrors.some((item) => item.field === field);
	let addAttempt = $state(0);

	const summary = $derived(catalogSummary(candidates));
	const listed = $derived(searchCatalog(candidates, query));
	const displayName = (candidate: OrcaCandidate) => catalogSourceDisplayName(candidate);
	const stateLabel = (state: CatalogState, candidate?: OrcaCandidate) =>
		({
			ready: t('พร้อมให้ลูกค้าเชื่อม', 'Ready for customers'),
			'app-setup': t('ต้องตั้งค่าแอปก่อน', 'Needs an app first'),
			review: candidate?.setupReason === 'provider_review' ? t('รอผู้ให้บริการยืนยัน', 'Waiting for provider review') : t('รอตรวจวิธีเชื่อมต่อ', 'Connection needs a check'),
			unchecked: t('ยังไม่ได้ตรวจ', 'Not checked yet')
		})[state];
	const stateTone = (state: CatalogState): StatusTone => (({ ready: 'ok', 'app-setup': 'warn', review: 'warn', unchecked: 'neutral' }) as const)[state];

	async function load() {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const next = await OrcaService.candidates();
			if (!alive || current !== request) return;
			candidates = next;
			loaded = true;
		} catch (cause) {
			if (alive && current === request) error = orcaError(cause);
		} finally {
			if (alive && current === request) loading = false;
		}
	}
	onMount(() => {
		if (operator) void load();
	});
	onDestroy(() => {
		alive = false;
	});

	function openAdd() {
		if (!operator) return;
		panelMode = 'add';
		checking = undefined;
		name = '';
		endpoint = '';
		auth = 'none';
		addErrors = [];
		panelOpen = true;
	}
	function openCheck(candidate: Pick<OrcaCandidate, 'id' | 'name' | 'endpointHost' | 'managedProvider'>) {
		if (!operator) return;
		panelMode = 'check';
		checking = { id: candidate.id, name: catalogSourceDisplayName(candidate), endpointHost: candidate.endpointHost, managedProvider: candidate.managedProvider };
		panelOpen = true;
	}
	function panelClosed() {
		// A check may have changed what a program needs.
		if (panelMode === 'check') void load();
		checking = undefined;
		checkBusy = false;
	}

	/** Adds the program to the shared catalog, then opens it to check the connection. */
	async function add() {
		if (adding || !operator) return;
		const errors: { field?: string; message: string }[] = [];
		if (!name.trim()) errors.push({ field: 'catalog-add-name', message: t('กรอกชื่อโปรแกรม', 'Enter the program name.') });
		if (!validMCPLink(endpoint)) errors.push({ field: 'catalog-add-link', message: t('ลิงก์ MCP ต้องขึ้นต้นด้วย https:// และไม่มีรหัสผ่านหรือพารามิเตอร์ต่อท้าย', 'The MCP link must start with https:// and carry no password or parameters.') });
		addErrors = errors;
		addAttempt += 1;
		if (errors.length) return;
		adding = true;
		try {
			const created = await OrcaService.createRemoteEntry(
				remoteEntryManifest(name, endpoint, auth, t('โปรแกรมที่ทีม ORCA เพิ่มด้วยลิงก์ MCP', 'Added by the ORCA team by its MCP link'))
			);
			if (!alive) return;
			const added = name.trim();
			name = '';
			endpoint = '';
			showToast(t(`เพิ่ม ${added} ในคลังแล้ว ลองเชื่อมด้วยบัญชีของคุณได้เลย`, `${added} is in the catalog. Try connecting it with your account.`), { tone: 'ok' });
			await load();
			if (!alive) return;
			panelMode = 'check';
			checking = { id: created.id, name: added };
		} catch (cause) {
			if (alive) {
				addErrors = [{ message: orcaError(cause) }];
				addAttempt += 1;
			}
		} finally {
			if (alive) adding = false;
		}
	}
</script>

{#if operator}
	<PageHeader title={term('programCatalog', t)} subtitle={t('โปรแกรมที่ทุกบริษัทเลือกเชื่อมได้ เพิ่มโปรแกรมใหม่ด้วยลิงก์ MCP', 'The programs every company can connect. Add a new one by its MCP link.')}>
		{#snippet eyebrow()}<PlatformBadge />{/snippet}
		{#snippet action()}<button type="button" class="k-button primary catalog-add" onclick={openAdd}><Link2 size={16} aria-hidden="true" />{t('เพิ่มด้วยลิงก์ MCP', 'Add by MCP link')}</button>{/snippet}
	</PageHeader>

	{#if error}<div class="catalog-callout deny" role="alert"><TriangleAlert size={17} aria-hidden="true" /><span>{error}</span><button type="button" class="k-link-button" disabled={loading} onclick={load}>{t('ลองอีกครั้ง', 'Try again')}</button></div>{/if}

	{#if !loaded && !error}
		<p class="catalog-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t('กำลังโหลดคลังโปรแกรม…', 'Loading the catalog…')}</p>
	{:else if loaded}
		<ul class="catalog-counts" aria-label={t('สรุปคลังโปรแกรม', 'Catalog summary')}>
			<li><strong>{summary.total}</strong><span>{t('โปรแกรมในคลัง', 'programs')}</span></li>
			<li class="ok"><strong>{summary.ready.length}</strong><span>{t('พร้อมให้ลูกค้าเชื่อม', 'ready for customers')}</span></li>
			<li class:warn={summary['app-setup'].length > 0}><strong>{summary['app-setup'].length}</strong><span>{t('ต้องตั้งค่าแอป', 'need an app')}</span></li>
			<li class:warn={summary.review.length > 0}><strong>{summary.review.length}</strong><span>{t('รอตรวจหรือรอยืนยัน', 'waiting for review')}</span></li>
		</ul>

		{#if summary.attention.length}
			<section class="catalog-section" aria-labelledby="catalog-attention-title">
				<h2 id="catalog-attention-title">{t('รอทีม ORCA', 'Waiting for the ORCA team')}</h2>
				<ul class="catalog-list">
					{#each summary.attention as candidate (candidate.id)}
						{@const state = catalogState(candidate)}
						<li class="catalog-row">
							<CatalogIcon name={displayName(candidate)} size={32} />
							<span class="catalog-name"><strong>{displayName(candidate)}</strong><small>{state === 'review' ? t('ต้องยืนยันข้อกำหนดกับผู้ให้บริการก่อน ลูกค้าจึงเชื่อมได้', 'Confirm the provider’s requirements before customers can connect.') : sharedProviderApp(candidate) ? t('ตั้งค่าแอปของผู้ให้บริการครั้งเดียว ใช้กับทุกโปรแกรมของผู้ให้บริการนั้น', 'Set up the provider’s app once for all its programs.') : t('ตั้งค่าแอป OAuth ของโปรแกรมนี้ก่อน ลูกค้าจึงเชื่อมได้', 'Set up this program’s OAuth app before customers can connect.')}</small></span>
							<StatusPill label={stateLabel(state, candidate)} tone={stateTone(state)} />
							{#if state === 'app-setup' && sharedProviderApp(candidate)}
								<a class="k-button small catalog-action" href={localeHref(platformHref('oauth-apps'))}>{t('ตั้งค่าแอป', 'Set up the app')}<ArrowRight size={14} aria-hidden="true" /></a>
							{:else}
								<button type="button" class="k-button small catalog-action" onclick={() => openCheck(candidate)}>{state === 'review' ? t('ตรวจสอบ', 'Review') : t('ตั้งค่าแอป', 'Set up the app')}</button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="catalog-section" aria-labelledby="catalog-all-title">
			<div class="catalog-section-head">
				<h2 id="catalog-all-title">{t('ทุกโปรแกรมในคลัง', 'Every program in the catalog')}</h2>
				<label class="catalog-search">
					<Search size={16} aria-hidden="true" />
					<span class="catalog-sr">{t('ค้นหาโปรแกรม', 'Search programs')}</span>
					<input type="search" bind:value={query} placeholder={t('ค้นหาชื่อหรือที่อยู่', 'Search name or address')} />
				</label>
			</div>
			{#if listed.length}
				<ul class="catalog-list">
					{#each listed as candidate (candidate.id)}
						{@const state = catalogState(candidate)}
						<li class="catalog-row">
							<CatalogIcon name={displayName(candidate)} size={32} />
							<span class="catalog-name">
								<strong>{displayName(candidate)}</strong>
								<small>{[candidate.endpointHost || candidate.description, candidate.protocol === 'API' ? 'API' : 'MCP', typeof candidate.toolCount === 'number' ? t(`AI ทำได้ ${candidate.toolCount} อย่าง`, `AI can do ${candidate.toolCount} things`) : ''].filter(Boolean).join(' · ')}</small>
							</span>
							<StatusPill label={stateLabel(state, candidate)} tone={stateTone(state)} />
							<button type="button" class="k-button quiet small catalog-action" onclick={() => openCheck(candidate)} aria-label={t(`ตรวจการเชื่อมต่อ ${displayName(candidate)}`, `Check ${displayName(candidate)}`)}>{t('ตรวจการเชื่อมต่อ', 'Check')}</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="catalog-empty"><Search size={18} aria-hidden="true" />{query ? t('ไม่พบโปรแกรมที่ตรงกับคำค้น', 'No program matches.') : t('คลังยังว่าง เพิ่มโปรแกรมแรกด้วยลิงก์ MCP', 'The catalog is empty. Add the first program by its MCP link.')}</p>
			{/if}
		</section>
	{/if}

	<Sheet
		bind:open={panelOpen}
		title={panelMode === 'add' ? t('เพิ่มโปรแกรมด้วยลิงก์ MCP', 'Add a program by its MCP link') : (checking?.name ?? '')}
		description={panelMode === 'add'
			? t('โปรแกรมที่เพิ่มจะอยู่ในคลังของทุกบริษัท แต่ละคนเชื่อมด้วยบัญชีของตัวเอง', 'It joins every company’s catalog. Each person connects with their own account.')
			: t('ตรวจการเชื่อมต่อด้วยบัญชีของคุณในบริษัทหลัก ลูกค้าแต่ละบริษัทเชื่อมบัญชีของตัวเอง', 'Check the connection with your own account in the main company. Each customer connects their own.')}
		busy={adding}
		onclose={panelClosed}
	>
		{#if panelMode === 'add'}
			<form
				id="catalog-add-form"
				class="catalog-form"
				novalidate
				onsubmit={(event) => {
					event.preventDefault();
					void add();
				}}
			>
				<FormErrorSummary errors={addErrors} focusKey={addAttempt} />
				<fieldset disabled={adding}>
					<label for="catalog-add-name">{t('ชื่อโปรแกรม', 'Program name')}</label>
					<input id="catalog-add-name" bind:value={name} maxlength="100" required autocomplete="off" aria-invalid={invalid('catalog-add-name')} />
					<label for="catalog-add-link">{t('ลิงก์ MCP ของโปรแกรม', "The program's MCP link")}</label>
					<input id="catalog-add-link" type="url" bind:value={endpoint} placeholder="https://service.example/mcp" required autocomplete="off" spellcheck="false" aria-invalid={invalid('catalog-add-link')} aria-describedby="catalog-add-link-help" />
					<p class="catalog-hint" id="catalog-add-link-help">{t('ขึ้นต้นด้วย https:// ไม่ต้องใส่รหัสผ่านหรือโทเคนในลิงก์', 'Starts with https://. Never put a password or token in the link.')}</p>
					<p class="catalog-legend" id="catalog-add-auth">{t('แต่ละคนเข้าสู่ระบบโปรแกรมนี้อย่างไร', 'How each person signs in to it')}</p>
					<div class="catalog-choices" role="radiogroup" aria-labelledby="catalog-add-auth">
						<ChoiceTile name="catalog-add-auth" value="none" bind:selected={auth} title={t('ไม่ใช้โทเคน', 'No token')} description={t('เข้าสู่ระบบที่หน้าของผู้ให้บริการ หรือโปรแกรมไม่ต้องยืนยันตัวตน', "They sign in on the provider's page, or none is needed.")} />
						<ChoiceTile name="catalog-add-auth" value="bearer" bind:selected={auth} title={t('โทเคนส่วนตัว', 'Personal token')} description={t('แต่ละคนวาง Access token ของตัวเอง ไม่มีโทเคนที่ใช้ร่วมกัน', 'Each person pastes their own access token. Nothing is shared.')} />
					</div>
				</fieldset>
			</form>
		{:else if checking}
			{#key checking.id}
				<SourceSetup
					sourceID={checking.id}
					sourceLabel={checking.name}
					endpointHost={checking.endpointHost}
					managedProvider={checking.managedProvider}
					onstatechange={(state) => (checkBusy = state.busy)}
				/>
			{/key}
			<p class="catalog-hint catalog-check-note"><Info size={15} aria-hidden="true" /><span>{t('แอปของ Google และ Microsoft ตั้งค่าที่', 'Google and Microsoft apps are set up on')} <a href={localeHref(platformHref('oauth-apps'))}>{term('programOAuthApps', t)}</a></span></p>
		{/if}
		{#snippet footer()}
			{#if panelMode === 'add'}
				<button type="button" class="k-button" disabled={adding} onclick={() => (panelOpen = false)}>{t('ยกเลิก', 'Cancel')}</button>
				<button type="submit" form="catalog-add-form" class="k-button primary" disabled={adding}>{#if adding}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{t('เพิ่มในคลัง', 'Add to the catalog')}</button>
			{:else}
				<button type="button" class="k-button" disabled={checkBusy} onclick={() => (panelOpen = false)}>{t('เสร็จแล้ว', 'Done')}</button>
			{/if}
		{/snippet}
	</Sheet>
{/if}

<style>
	.catalog-add {
		min-height: 42px;
		padding: 0 18px;
		font-weight: 600;
	}
	.catalog-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px 10px;
		margin: 0 0 16px;
		padding: 12px 16px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 14px;
	}
	.catalog-callout > span {
		flex: 1 1 240px;
	}
	.catalog-callout :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.catalog-loading,
	.catalog-empty {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		padding: 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 14px;
	}
	.catalog-counts {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin: 0 0 26px;
		padding: 0;
		list-style: none;
	}
	.catalog-counts li {
		display: flex;
		flex-direction: column;
		padding: 14px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.catalog-counts strong {
		font-size: 24px;
		font-weight: 700;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.catalog-counts span {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.catalog-counts li.ok strong {
		color: var(--orca-ok);
	}
	.catalog-counts li.warn strong {
		color: var(--orca-warn);
	}
	.catalog-section {
		margin-bottom: 26px;
	}
	.catalog-section h2 {
		margin: 0 0 12px;
		font-size: 16px;
		font-weight: 650;
	}
	.catalog-section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		margin-bottom: 12px;
	}
	.catalog-section-head h2 {
		margin: 0;
	}
	.catalog-search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: min(320px, 100%);
		min-height: 38px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-subtle);
	}
	.catalog-search:focus-within {
		border-color: var(--orca-focus);
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.catalog-search input {
		flex: 1;
		min-width: 0;
		height: 36px;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.catalog-search input:focus-visible {
		outline: none;
	}
	.catalog-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.catalog-list {
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		list-style: none;
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
	}
	.catalog-row {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 14px;
		padding: 12px 18px;
	}
	.catalog-row + .catalog-row {
		border-top: 1px solid var(--orca-line-soft);
	}
	.catalog-name {
		min-width: 0;
	}
	.catalog-name strong {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
	}
	.catalog-name small {
		display: block;
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 13px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.catalog-action {
		gap: 6px;
		text-decoration: none;
		white-space: nowrap;
	}
	.catalog-form fieldset {
		display: grid;
		gap: 6px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.catalog-form label {
		margin-top: 10px;
		font-size: 14px;
		font-weight: 600;
	}
	.catalog-form label:first-child {
		margin-top: 0;
	}
	.catalog-form input {
		width: 100%;
		min-height: 42px;
		padding: 9px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.catalog-form input[aria-invalid='true'] {
		border-color: var(--orca-deny);
	}
	.catalog-hint {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	.catalog-legend {
		margin: 14px 0 4px;
		font-size: 14px;
		font-weight: 600;
	}
	.catalog-choices {
		display: grid;
		gap: 10px;
	}
	.catalog-check-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.catalog-check-note a {
		color: var(--orca-ink);
		font-weight: 600;
	}
	@media (max-width: 720px) {
		.catalog-counts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.catalog-row {
			grid-template-columns: 32px minmax(0, 1fr);
			row-gap: 8px;
			padding: 12px 14px;
		}
		.catalog-row :global(.orca-pill),
		.catalog-row .catalog-action {
			grid-column: 2;
			justify-self: start;
		}
		.catalog-name small {
			white-space: normal;
		}
		.catalog-search {
			width: 100%;
		}
	}
</style>
