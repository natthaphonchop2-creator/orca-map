<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { Link2Off, LoaderCircle, RefreshCw, Search, Sparkles, Unplug, X } from '@lucide/svelte';
	import {
		APPS_FILTERS,
		appKind,
		connectedApps,
		connectedAppsHref,
		disconnectEach,
		offerSuspend,
		shortName,
		type AppGroup,
		type AppsFilter
	} from '$lib/orca/connected-ai-apps';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { organizationRole } from '$lib/orca/member-access';
	import { STALE_DAYS, secretRows, type SecretRow } from '$lib/orca/secrets';
	import { OrcaService, orcaError, type OrcaBootstrap, type OrcaSecrets } from '$lib/services/orca';
	import { aiAppsRevoked, refreshAIConnection } from '$lib/services/orca-ai-apps';
	import AIAppTile from './AIAppTile.svelte';
	import ConnectedAppsList from './ConnectedAppsList.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';
	import EmptyState from './ui/EmptyState.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import { showToast } from './ui/toast-store.svelte';

	// ตรวจสอบ › แอป AI ที่เชื่อมอยู่ (view=secrets): who connected Claude,
	// ChatGPT or a key to company data, grouped by person. The chips live in the
	// address (&filter=stale|noexpiry&holder=<id>); every disconnect asks first
	// in a modal. Owners and Admins only: employees are sent to เชื่อม AI ของฉัน.
	let { data, filter = 'all', holder = '' }: { data: OrcaBootstrap; filter?: AppsFilter; holder?: string } = $props();
	let inventory = $state<OrcaSecrets>();
	let loading = $state(false);
	let error = $state('');
	let query = $state('');
	let loadedAt = $state(Date.now());
	// One confirmation at a time: a single app, or everything a person has.
	let single = $state<{ row: SecretRow; group: AppGroup }>();
	let singleOpen = $state(false);
	let person = $state<{ userID: string; name: string; isViewer: boolean; member: boolean }>();
	let personOpen = $state(false);
	let busy = $state(false);
	let progress = $state({ attempted: 0, total: 0 });
	let dialogError = $state('');
	let retry = $state(false);
	// After a partial failure, "ลองอีกครั้ง" tries only what failed, even if
	// the reload that followed did not come back.
	let failedKeys = new Set<string>();
	// The filter bar: where focus goes when the app it was on is gone.
	let bar: HTMLElement | undefined = $state();
	let alive = true;
	let request = 0;

	const viewer = $derived(data.members.find((member) => member.id === data.currentUserID));
	const viewerIsOwner = $derived(organizationRole(viewer?.role ?? '') === 'owner');
	const rows = $derived(
		inventory
			? secretRows(inventory, data.members, data.hubs, loadedAt, (role) => organizationRole(role) === 'owner')
			: { sessions: [], keys: [] }
	);
	const allRows = $derived([...rows.sessions, ...rows.keys]);
	const view = $derived(connectedApps(allRows, { filter, holder, query, members: data.members, viewerID: data.currentUserID }));
	const holderName = $derived(view.holder?.name ?? '');
	const personItems = $derived(person ? allRows.filter((row) => row.userID === person!.userID) : []);
	const chips = $derived(
		APPS_FILTERS.map((id) => ({
			id,
			label: id === 'all' ? t('ทั้งหมด', 'All') : id === 'stale' ? t(`ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `Unused ${STALE_DAYS}+ days`) : t('ไม่หมดอายุ', 'Never expire'),
			count: view.counts[id],
			warn: id !== 'all'
		}))
	);

	const nameOf = (group: Pick<AppGroup, 'name'>) => group.name || t('ผู้ที่ไม่ได้เป็นสมาชิกแล้ว', 'Former member');
	const appName = (row: SecretRow) => row.label || t('แอป AI', 'AI app');
	const itemName = (row: SecretRow) => (row.kind === 'key' ? t(`คีย์ “${row.label}”`, `the key “${row.label}”`) : appName(row));

	async function refresh() {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const next = await OrcaService.secrets();
			if (!alive || current !== request) return;
			inventory = next;
			loadedAt = Date.now();
		} catch (cause) {
			if (alive && current === request) error = orcaError(cause);
		} finally {
			if (alive && current === request) loading = false;
		}
	}
	onMount(() => {
		if (data.canManage) void refresh();
	});
	onDestroy(() => {
		alive = false;
	});

	function askOne(row: SecretRow, group: AppGroup) {
		if (busy) return;
		dialogError = '';
		single = { row, group };
		singleOpen = true;
	}
	function askAll(group: AppGroup) {
		if (busy) return;
		dialogError = '';
		retry = false;
		failedKeys = new Set();
		person = { userID: group.userID, name: group.name, isViewer: group.isViewer, member: Boolean(group.role) };
		personOpen = true;
	}
	/**
	 * A disconnected app leaves the list, and with it the button focus went
	 * back to when the dialog closed: keep keyboard users near the list, on the
	 * chosen filter chip, instead of the top of the page.
	 */
	async function keepFocus() {
		await tick();
		if (!alive || typeof document === 'undefined') return;
		const active = document.activeElement;
		if (active && active !== document.body && active.isConnected) return;
		bar?.querySelector<HTMLElement>('.cx-chip.chosen')?.focus();
	}
	// The viewer's own sign-in or key: the pinned "เชื่อม AI ของฉัน" follows at
	// once, and a read of it already on its way is dropped (Codex release review 68).
	function ownRevoked() {
		aiAppsRevoked();
		void refreshAIConnection();
	}
	const disconnectRow = (row: SecretRow) =>
		row.kind === 'session' ? OrcaService.revokeSecretSession(row.id) : OrcaService.revokeSecretKey(row.keyID!);

	async function disconnectOne() {
		const chosen = single;
		if (busy || !chosen) return;
		busy = true;
		dialogError = '';
		try {
			await disconnectRow(chosen.row);
			if (chosen.group.isViewer) ownRevoked();
			if (!alive) return;
			singleOpen = false;
			showToast(
				chosen.group.isViewer
					? t(`ตัดการเชื่อมต่อ ${itemName(chosen.row)} ของคุณแล้ว`, `Disconnected your ${itemName(chosen.row)}.`)
					: t(`ตัดการเชื่อมต่อ ${itemName(chosen.row)} ของ ${shortName(nameOf(chosen.group))} แล้ว`, `Disconnected ${shortName(nameOf(chosen.group))}'s ${itemName(chosen.row)}.`)
			);
		} catch {
			if (!alive) return;
			dialogError = t(
				'ตัดการเชื่อมต่อไม่สำเร็จ รายการนี้อาจถูกตัดไปแล้ว หรือคุณไม่มีสิทธิ์ ลองอีกครั้ง',
				'It could not be disconnected. It may already be gone, or you may not have permission. Try again.'
			);
		} finally {
			if (alive) busy = false;
		}
		if (!alive) return;
		const done = !singleOpen;
		await refresh();
		if (done) await keepFocus();
	}

	async function disconnectPerson() {
		const chosen = person;
		if (busy || !chosen) return;
		const rowKey = (row: SecretRow) => `${row.kind}:${row.id}`;
		const items = retry ? personItems.filter((row) => failedKeys.has(rowKey(row))) : personItems;
		if (!items.length) {
			personOpen = false;
			return;
		}
		busy = true;
		dialogError = '';
		progress = { attempted: 0, total: items.length };
		const result = await disconnectEach(items, disconnectRow, (attempted, total) => {
			if (alive) progress = { attempted, total };
		});
		if (chosen.isViewer && result.done > 0) ownRevoked();
		if (!alive) return;
		busy = false;
		if (!result.failed.length) {
			retry = false;
			failedKeys = new Set();
			personOpen = false;
			const who = chosen.isViewer ? t('คุณ', 'Your') : shortName(nameOf(chosen));
			showToast(t(`ตัดแล้ว ${result.done} จาก ${result.total} · แอป AI ของ${who}ใช้ข้อมูลบริษัทไม่ได้แล้ว`, `Disconnected ${result.done} of ${result.total}. ${chosen.isViewer ? who : `${who}'s`} AI apps can no longer use company data.`));
		} else {
			retry = true;
			failedKeys = new Set(result.failed.map(rowKey));
			dialogError = t(
				`ตัดแล้ว ${result.done} จาก ${result.total} อีก ${result.failed.length} รายการตัดไม่สำเร็จ อาจถูกตัดไปแล้วหรือคุณไม่มีสิทธิ์ กด ลองอีกครั้ง`,
				`Disconnected ${result.done} of ${result.total}. ${result.failed.length} could not be disconnected; they may already be gone, or you may not have permission. Try again.`
			);
		}
		await refresh();
		if (!alive) return;
		// Everything that failed was already gone: nothing is left to retry.
		if (retry && !personItems.length) {
			personOpen = false;
			retry = false;
			const who = chosen.isViewer ? t('คุณ', 'Your') : shortName(nameOf(chosen));
			showToast(t(`แอป AI ของ${who}ใช้ข้อมูลบริษัทไม่ได้แล้ว`, `${chosen.isViewer ? who : `${who}'s`} AI apps can no longer use company data.`));
		}
		if (!personOpen) await keepFocus();
	}
	function closed() {
		dialogError = '';
		retry = false;
		failedKeys = new Set();
	}
	function clearSearch() {
		query = '';
	}

	const singleTitle = $derived.by(() => {
		if (!single) return '';
		const { row, group } = single;
		return group.isViewer
			? t(`ตัดการเชื่อมต่อ ${itemName(row)} ของคุณ?`, `Disconnect your ${itemName(row)}?`)
			: t(`ตัดการเชื่อมต่อ ${itemName(row)} ของ ${shortName(nameOf(group))}?`, `Disconnect ${shortName(nameOf(group))}'s ${itemName(row)}?`);
	});
	const singleMessage = $derived.by(() => {
		if (!single) return '';
		const { row, group } = single;
		const name = shortName(nameOf(group));
		if (!group.name)
			return row.kind === 'key'
				? t('แอปหรือสคริปต์ที่ใช้คีย์นี้จะดึงข้อมูลบริษัทไม่ได้ทันที', 'Apps and scripts using this key lose access to company data at once.')
				: t(`${appName(row)} นี้จะดึงข้อมูลบริษัทไม่ได้ทันที`, `This ${appName(row)} loses access to company data at once.`);
		if (row.kind === 'key')
			return group.isViewer
				? t('แอปหรือสคริปต์ที่ใช้คีย์นี้จะดึงข้อมูลบริษัทไม่ได้ทันที ถ้ายังต้องใช้ สร้างคีย์ใหม่ได้ที่ เชื่อม AI ของฉัน', 'Apps and scripts using this key lose access at once. To keep using them, make a new key in Connect my AI.')
				: t(`แอปหรือสคริปต์ที่ใช้คีย์นี้จะดึงข้อมูลบริษัทไม่ได้ทันที ถ้ายังต้องใช้ ${name}สร้างคีย์ใหม่เองได้`, `Apps and scripts using this key lose access at once. ${name} can make a new key if still needed.`);
		return group.isViewer
			? t(`${appName(row)} ของคุณจะดึงข้อมูลบริษัทไม่ได้ทันที ถ้ายังต้องใช้ เชื่อมใหม่ได้ที่ เชื่อม AI ของฉัน`, `Your ${appName(row)} loses access to company data at once. Connect it again in Connect my AI if you still need it.`)
			: t(`${appName(row)} ของ${name}จะดึงข้อมูลบริษัทไม่ได้ทันที ถ้ายังต้องใช้ ${name}เชื่อมใหม่เองได้`, `${name}'s ${appName(row)} loses access to company data at once. ${name} can connect it again if still needed.`);
	});
	const personTitle = $derived(
		person
			? person.isViewer
				? t('ตัดการเชื่อมต่อทั้งหมดของคุณ?', 'Disconnect all your apps?')
				: t(`ตัดการเชื่อมต่อทั้งหมดของ ${shortName(nameOf(person))}?`, `Disconnect all of ${shortName(nameOf(person))}'s apps?`)
			: ''
	);
	const personConfirm = $derived(
		busy
			? t(`กำลังตัด ${progress.attempted} จาก ${progress.total}…`, `Disconnecting ${progress.attempted} of ${progress.total}…`)
			: retry
				? t('ลองอีกครั้ง', 'Try again')
				: t('ตัดทั้งหมด', 'Disconnect all')
	);
	const emptyMessage = $derived.by(() => {
		if (query.trim()) return t(`ไม่พบคนที่ชื่อตรงกับ “${query.trim()}”`, `No one matches “${query.trim()}”.`);
		if (holder && !view.counts.all) return t(`${holderName || 'คนนี้'} ยังไม่ได้เชื่อมแอป AI`, `${holderName || 'This person'} has not connected an AI app.`);
		if (filter === 'stale') return t(`ไม่มีแอปที่ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `No app has gone unused for ${STALE_DAYS} days.`);
		if (filter === 'noexpiry') return t('ไม่มีคีย์ที่ไม่หมดอายุ', 'No key is set to never expire.');
		return t('ไม่มีแอปที่ตรงกับตัวกรองนี้', 'Nothing matches this filter.');
	});
</script>

<PageHeader
	title={term('connectedAIApps', t)}
	subtitle={t('ดูว่าใครเชื่อม Claude หรือ ChatGPT กับข้อมูลบริษัทไว้ ถ้ามีคนลาออกหรือทำเครื่องหาย กด ตัดการเชื่อมต่อ ได้ทันที', 'See who connected Claude or ChatGPT to company data. Disconnect at once if someone leaves.')}
/>

{#if error}<div class="k-banner error cx-error" role="alert">
		<p>{t('โหลดรายการไม่สำเร็จ', 'The list could not be loaded.')} {error}</p>
		<button type="button" class="k-button small" disabled={loading} onclick={refresh}>{t('ลองอีกครั้ง', 'Try again')}</button>
	</div>{/if}

{#if !inventory}
	{#if loading}<div class="cx-loading" role="status"><LoaderCircle size={22} class="k-spin" aria-hidden="true" />{t('กำลังโหลด…', 'Loading…')}</div>{/if}
{:else if !allRows.length}
	<EmptyState icon={Sparkles} message={t('ยังไม่มีใครเชื่อมแอป AI กับบริษัท', 'No one has connected an AI app to the company yet.')} actionLabel={t('ดูวิธีเชื่อม', 'See how to connect')} href={localeHref('/app?view=connect-ai')} />
{:else}
	<div class="cx-bar" bind:this={bar}>
		<nav class="cx-chips" aria-label={t('ตัวกรอง', 'Filters')}>
			{#each chips as chip (chip.id)}
				<a
					class="cx-chip"
					class:chosen={filter === chip.id}
					href={localeHref(connectedAppsHref(chip.id, holder))}
					aria-current={filter === chip.id ? 'true' : undefined}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					>{chip.label}<span class="cx-count" class:warn={chip.warn && chip.count > 0}>{chip.count}</span></a
				>
			{/each}
			{#if holder}<a
					class="cx-chip cx-person"
					href={localeHref(connectedAppsHref(filter))}
					aria-label={t(`เลิกดูเฉพาะ ${holderName || 'คนนี้'}`, `Stop showing only ${holderName || 'this person'}`)}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					>{t(`เฉพาะ ${holderName || 'คนนี้'}`, `Only ${holderName || 'this person'}`)}<X size={14} aria-hidden="true" /></a
				>{/if}
		</nav>
		<div class="cx-tools">
			<label class="cx-search">
				<Search size={16} aria-hidden="true" />
				<input type="search" bind:value={query} placeholder={t('ค้นหาชื่อคน', 'Search people')} aria-label={t('ค้นหาชื่อคน', 'Search people')} autocomplete="off" />
			</label>
			<button type="button" class="k-button cx-refresh" disabled={loading} onclick={refresh} aria-label={t('โหลดใหม่', 'Reload')} title={t('โหลดใหม่', 'Reload')}
				><RefreshCw size={16} class={loading ? 'k-spin' : ''} aria-hidden="true" /></button
			>
		</div>
	</div>

	{#if view.groups.length}
		<ConnectedAppsList
			groups={view.groups}
			hubs={data.hubs}
			viewerID={data.currentUserID}
			{viewerIsOwner}
			now={loadedAt}
			apps={view.apps}
			people={view.people}
			ondisconnect={askOne}
			ondisconnectall={askAll}
		/>
	{:else if query.trim()}
		<EmptyState icon={Search} message={emptyMessage} actionLabel={t('ล้างคำค้นหา', 'Clear search')} onaction={clearSearch} />
	{:else}
		<EmptyState icon={Sparkles} message={emptyMessage} actionLabel={t('ดูทั้งหมด', 'Show all')} href={localeHref(connectedAppsHref())} />
	{/if}
{/if}

<ConfirmDialog
	bind:open={singleOpen}
	tone="danger"
	icon={Unplug}
	title={singleTitle}
	message={singleMessage}
	confirmLabel={term('disconnect', t)}
	{busy}
	onconfirm={disconnectOne}
	oncancel={closed}
>
	{#if dialogError}<p class="cx-dialog-error" role="alert">{dialogError}</p>{/if}
</ConfirmDialog>

<ConfirmDialog
	bind:open={personOpen}
	tone="danger"
	icon={Link2Off}
	title={personTitle}
	message={t(`แอป AI ${personItems.length} รายการนี้จะดึงข้อมูลบริษัทไม่ได้ทันที`, `These ${personItems.length} AI apps lose access to company data at once.`)}
	confirmLabel={personConfirm}
	{busy}
	onconfirm={disconnectPerson}
	oncancel={closed}
>
	<ul class="cx-dialog-list">
		{#each personItems as row (`${row.kind}:${row.id}`)}
			<li>
				<AIAppTile kind={appKind(row)} size={24} />
				<strong>{appName(row)}</strong>
				<span>{row.kind === 'key' ? t('คีย์', 'Key') : t('เข้าสู่ระบบ', 'Sign-in')}</span>
			</li>
		{/each}
	</ul>
	{#if person && offerSuspend(data, person)}<p class="cx-dialog-note">
			{t(`ถ้า${shortName(person.name)}ลาออก ให้ระงับบัญชีในหน้า`, `If ${shortName(person.name)} is leaving, also suspend the account on`)}
			<a href={localeHref('/app?view=members')}>{term('team', t)}</a>
			{t('ด้วย ORCA จะตัดทุกอย่างของบริษัทนี้ให้', 'ORCA then disconnects everything in this company.')}
		</p>{/if}
	{#if dialogError}<p class="cx-dialog-error" role="alert">{dialogError}</p>{/if}
</ConfirmDialog>

<style>
	/* orca-type-remap v1 */
	.cx-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		margin-bottom: 16px;
	}
	.cx-error p {
		margin: 0;
	}
	.cx-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 48px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.cx-bar {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
		margin-bottom: 16px;
	}
	.cx-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
	}
	.cx-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 14px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font-size: 13.5px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.cx-chip:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
		background: var(--orca-hover);
		color: var(--orca-ink);
		text-decoration: none;
	}
	.cx-count {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 20px;
		padding: 0 7px;
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 11.5px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.cx-count.warn {
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
	}
	.cx-chip.chosen {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: var(--orca-on-ink);
		font-weight: 600;
	}
	.cx-chip.chosen .cx-count {
		background: color-mix(in srgb, var(--orca-on-ink) 18%, transparent);
		color: var(--orca-on-ink);
	}
	/* On the light chosen chip of the dark theme a tinted fill turns grey: ring the count instead. */
	:global(:root[data-orca-theme='dark']) .cx-chip.chosen .cx-count {
		background: transparent;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--orca-on-ink) 30%, transparent);
	}
	.cx-person {
		border-style: dashed;
		color: var(--orca-ink);
		font-weight: 600;
	}
	.cx-tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cx-search {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 280px;
		height: 38px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-subtle);
	}
	.cx-search:focus-within {
		border-color: var(--orca-focus);
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.cx-search input {
		width: 100%;
		min-width: 0;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
	}
	.cx-search input::placeholder {
		color: var(--orca-subtle);
	}
	.cx-tools .cx-refresh {
		width: 38px;
		min-height: 38px;
		padding: 0;
		justify-content: center;
		color: var(--orca-text-2) !important;
	}
	.cx-dialog-list {
		display: grid;
		gap: 0;
		margin: 16px 0 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		list-style: none;
	}
	.cx-dialog-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		font-size: 13.5px;
	}
	.cx-dialog-list li + li {
		border-top: 1px solid var(--orca-line-soft);
	}
	.cx-dialog-list strong {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		color: var(--orca-ink);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cx-dialog-list span:last-child {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.cx-dialog-note {
		margin: 14px 0 0 !important;
		padding: 10px 12px;
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		color: var(--orca-text-2) !important;
		font-size: 13px !important;
	}
	.cx-dialog-note a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.cx-dialog-error {
		margin: 12px 0 0 !important;
		color: var(--orca-deny) !important;
		font-size: 13px !important;
	}
	@media (max-width: 720px) {
		.cx-bar {
			align-items: stretch;
			flex-direction: column;
		}
		.cx-chips {
			gap: 6px;
		}
		.cx-chip {
			height: 34px;
			padding: 0 11px;
			gap: 6px;
			font-size: 13px;
		}
		.cx-tools {
			width: 100%;
		}
		.cx-search {
			flex: 1;
			width: auto;
		}
	}
</style>
