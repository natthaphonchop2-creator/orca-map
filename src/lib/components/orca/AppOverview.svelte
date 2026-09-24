<script lang="ts">
	import LifecycleActions from './LifecycleActions.svelte';
	import { gatewayConnections, gatewayToolCount, gatewayMemberIDs } from '$lib/orca/gateway-sources';
	import { filterGateways } from '$lib/orca/gateway-list';
	import { onDestroy, onMount, tick } from 'svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { connectionReady, workspaceToolingReady } from '$lib/orca/activation';
	import { sourcePresentationNames } from '$lib/orca/connection-presentation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		OrcaService,
		statusLabels,
		type HubStatus,
		type OrcaBootstrap,
		type OrcaConnection,
		type OrcaHub
	} from '$lib/services/orca';
	import { Boxes, ChevronRight, Info, Pencil, Plug, Plus, Search, Sparkles, Unplug } from '@lucide/svelte';

	let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
	let notice = $state('');
	let listTitle: HTMLHeadingElement;
	let sourceNames = $state<Record<string, string>>({});
	let alive = true;
	const currentHubs = $derived(data.hubs.filter((hub) => hub.status !== 'deleted'));
	const mainHubs = $derived(currentHubs.filter((hub) => hub.status !== 'archived'));
	const archivedHubs = $derived(currentHubs.filter((hub) => hub.status === 'archived'));
	async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
		notice = action === 'archive' ? t('จัดเก็บพื้นที่ทำงาน AI แล้ว ดูได้ที่ตัวกรอง “จัดเก็บแล้ว”', 'AI workspace archived. It is listed under Archived.')
			: action === 'restore' ? t('กู้คืนพื้นที่ทำงาน AI แล้ว โดยมีสถานะระงับ', 'AI workspace restored with Paused status.')
			: t('ลบพื้นที่ทำงาน AI แล้ว', 'AI workspace deleted.');
		await onchanged();
		await tick();
		listTitle?.focus();
	}
	let query = $state('');
	let statusFilter = $state<HubStatus | ''>('');
	const filteredTotal = $derived(statusFilter === 'archived' ? archivedHubs.length : mainHubs.length);
	const readyConnections = $derived(data.connections.filter(connectionReady));
	const createWorkspaceHref = $derived(
		`/app?view=new${readyConnections.length === 1 ? `&connection=${encodeURIComponent(readyConnections[0].id)}` : ''}`
	);
	const filters = $derived([
		{ value: '' as const, label: t('ทั้งหมด', 'All') },
		{ value: 'active' as const, label: t('เปิดใช้งาน', 'Active') },
		{ value: 'draft' as const, label: t('ฉบับร่าง', 'Draft') },
		{ value: 'paused' as const, label: t('ระงับ', 'Paused') },
		...(data.canManage ? [{ value: 'archived' as const, label: t(`จัดเก็บแล้ว (${archivedHubs.length})`, `Archived (${archivedHubs.length})`) }] : [])
	]);
	const visibleHubs = $derived(filterGateways(data.hubs, data.connections, query, statusFilter));
	function clearFilters() {
		query = '';
		statusFilter = '';
	}
	const hubHref = (hub: OrcaHub, tab = '') =>
		localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}${tab ? `&tab=${tab}` : ''}`);
	const iconName = (connection: OrcaConnection) => sourceNames[connection.mcpID] || connection.name;
	function status(hub: OrcaHub) {
		if (hub.status === 'active' && !workspaceToolingReady(hub, data.connections))
			return { label: t('รอตรวจสอบ', 'Needs review'), tone: 'warn' };
		return {
			label: statusLabels[hub.status],
			tone: hub.status === 'active' ? 'ok' : hub.status === 'paused' ? 'warn' : 'idle'
		};
	}
	const usage = (hub: OrcaHub) =>
		hub.dailyLimit > 0 ? Math.min(100, Math.round(((hub.usedToday || 0) / hub.dailyLimit) * 100)) : 0;

	onMount(() => {
		// The system catalog is for managers only; members fall back to connection names.
		if (!data.canManage) return;
		void OrcaService.candidates()
			.then((items) => {
				if (alive) sourceNames = sourcePresentationNames(items);
			})
			.catch(() => {
				/* Logos fall back to the connection name when catalog metadata cannot be read. */
			});
	});
	onDestroy(() => {
		alive = false;
	});
</script>

<div class="spaces">
	<header class="spaces-head">
		<div>
			<h1>{t('พื้นที่ทำงาน AI', 'AI workspaces')}</h1>
			<p class="k-subtitle">
				{data.canManage
					? t(
							'รวมระบบ เครื่องมือ และสมาชิกไว้ในพื้นที่ทำงานเดียว โดยสมาชิกใช้งานผ่านลิงก์เชื่อม AI เพียงลิงก์เดียว',
							'Combine systems, tools and members in one workspace. Members connect through a single AI connection link.'
						)
					: t(
							'เลือกพื้นที่ทำงาน AI แล้วเชื่อมกับแอป AI ที่คุณใช้อยู่',
							'Select an AI workspace and connect it to the AI app you use.'
						)}
			</p>
		</div>
		<div class="spaces-actions">
			<a class="k-button" href={localeHref('/app?view=settings&section=ai')}
				><Sparkles size={16} aria-hidden="true" />{t('เชื่อม AI กับ ORCA', 'Connect AI to ORCA')}</a
			>
			{#if data.canManage}<a class="k-button primary" href={localeHref(createWorkspaceHref)}
					><Plus size={16} aria-hidden="true" />{t('สร้างพื้นที่ทำงาน AI', 'Create AI workspace')}</a
				>{/if}
		</div>
	</header>

	{#if notice}<div class="k-banner success" role="status">{notice}</div>{/if}

	<div class="spaces-toolbar">
		<label class="spaces-search"
			><Search size={16} aria-hidden="true" /><span class="sr-only">{t('ค้นหาพื้นที่ทำงาน', 'Search workspaces')}</span
			><input type="search" bind:value={query} placeholder={t('ค้นหาพื้นที่ทำงาน', 'Search workspaces')} /></label
		>
		<div class="spaces-filter" role="group" aria-label={t('กรองพื้นที่ทำงานตามสถานะ', 'Filter workspaces by status')}>
			{#each filters as filter}<button
					type="button"
					class:selected={statusFilter === filter.value}
					aria-pressed={statusFilter === filter.value}
					onclick={() => (statusFilter = filter.value)}>{filter.label}</button
				>{/each}
		</div>
	</div>

	<section class="spaces-panel" aria-labelledby="home-workspaces-title">
		<div class="spaces-panel-head">
			<span class="spaces-panel-icon" aria-hidden="true"><Boxes size={18} /></span>
			<h2 id="home-workspaces-title" bind:this={listTitle} tabindex="-1">
				{statusFilter === 'archived' ? t('พื้นที่ทำงานที่จัดเก็บแล้ว', 'Archived workspaces') : t('พื้นที่ทำงานทั้งหมด', 'All workspaces')}<span
					class="spaces-count">{filteredTotal}</span
				>
			</h2>
		</div>

		{#if visibleHubs.length > 0}
			<div class="spaces-table-wrap">
				<table class="spaces-table">
					<thead>
						<tr>
							<th scope="col">{t('ชื่อ', 'Name')}</th>
							<th scope="col">{t('ระบบ', 'Systems')}</th>
							<th scope="col" class="num">{t('เครื่องมือ', 'Tools')}</th>
							<th scope="col" class="num">{t('สมาชิก', 'Members')}</th>
							<th scope="col" class="usage-col">{t('การใช้งานวันนี้', 'Usage today')}</th>
							<th scope="col">{t('สถานะ', 'Status')}</th>
							<th scope="col" class="actions-col">{t('การจัดการ', 'Actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleHubs as hub (hub.id)}
							{@const sources = gatewayConnections(hub, data.connections)}
							{@const badge = status(hub)}
							{@const archived = hub.status === 'archived'}
							<tr>
								<td class="spaces-name">
									<a href={hubHref(hub)}>{hub.name}</a>
									{#if hub.description}<small>{hub.description}</small>{/if}
									<small class="spaces-mobile-meta"
										>{t(
											`เครื่องมือ ${gatewayToolCount(hub)} รายการ · สมาชิก ${gatewayMemberIDs(hub).length} คน`,
											`Tools: ${gatewayToolCount(hub)} · Members: ${gatewayMemberIDs(hub).length}`
										)}</small
									>
								</td>
								<td class="spaces-systems">
									{#if sources.length}
										<span class="spaces-systems-inner"><span class="spaces-logos" aria-hidden="true"
											>{#each sources.slice(0, 3) as source (source.id)}<span class="spaces-logo"
													><CatalogIcon name={iconName(source)} size={16} /></span
												>{/each}</span
										>
										<span class="spaces-system-names" title={sources.map((source) => source.name).join(', ')}
											>{sources.map((source) => source.name).join(', ')}</span
										></span
									>
									{:else}
										<span class="spaces-none"><Plug size={14} aria-hidden="true" />{t('ยังไม่ได้เลือกระบบ', 'No system selected')}</span>
									{/if}
								</td>
								<td class="num">{gatewayToolCount(hub)}</td>
								<td class="num">{gatewayMemberIDs(hub).length}</td>
								<td class="usage-col">
									<span class="spaces-usage" title={t('การใช้งานวันนี้เทียบกับเพดานการใช้งานต่อวัน', 'Usage today against the daily limit')}
										><span>{hub.usedToday || 0} / {hub.dailyLimit || '—'}</span><span class="spaces-bar" aria-hidden="true"
											><i style:width={`${usage(hub)}%`}></i></span
										></span
									>
								</td>
								<td><span class="spaces-badge {badge.tone}">{badge.label}</span></td>
								<td class="actions-col">
									<div class="spaces-row-actions">
										{#if !archived}<a
												class="k-button small"
												href={hubHref(hub, 'connect')}
												aria-label={t(`เชื่อม AI กับ ${hub.name}`, `Connect AI to ${hub.name}`)}
												><Unplug size={15} aria-hidden="true" />{t('เชื่อม AI', 'Connect')}</a
											>{/if}
										{#if data.canManage && !archived}<a
												class="spaces-icon-button"
												href={localeHref(`/app?view=new&edit=${encodeURIComponent(hub.id)}`)}
												aria-label={t(`แก้ไข ${hub.name}`, `Edit ${hub.name}`)}
												title={t('แก้ไข', 'Edit')}><Pencil size={16} aria-hidden="true" /></a
											>{/if}
										{#if data.canManage}<LifecycleActions
												entity={hub}
												kind="gateway"
												{archived}
												canManage={data.canManage}
												compact
												onchanged={lifecycleChanged}
												onreload={onchanged}
											/>{/if}
										<a
											class="spaces-icon-button spaces-open"
											href={hubHref(hub)}
											aria-label={t(`เปิด ${hub.name}`, `Open ${hub.name}`)}
											title={t('เปิด', 'Open')}><ChevronRight size={16} aria-hidden="true" /></a
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if currentHubs.length > 0 || statusFilter === 'archived'}
			<div class="spaces-empty">
				<Search size={24} aria-hidden="true" />
				<h3>{statusFilter === 'archived' && !query ? t('ยังไม่มีพื้นที่ทำงานที่จัดเก็บแล้ว', 'No archived workspaces') : t('ไม่พบพื้นที่ทำงานที่ตรงกับเงื่อนไข', 'No matching workspaces')}</h3>
				<p>{t('ค้นหาด้วยชื่ออื่น หรือเปลี่ยนตัวกรองสถานะ', 'Search for another name or change the status filter.')}</p>
				<button type="button" class="k-button small" onclick={clearFilters}>{t('ล้างตัวกรอง', 'Clear filters')}</button>
			</div>
		{:else}
			<div class="spaces-empty">
				<Boxes size={28} aria-hidden="true" />
				<h3>
					{data.canManage
						? t('ยังไม่มีพื้นที่ทำงาน AI', 'No AI workspaces yet')
						: t('คุณยังไม่มีพื้นที่ทำงาน AI', 'You do not have any AI workspaces yet')}
				</h3>
				<p>
					{data.canManage
						? t(
								'สร้างพื้นที่ทำงาน AI เพื่อรวมระบบ เครื่องมือ และสมาชิกที่ทีมต้องใช้ไว้ในที่เดียว',
								'Create an AI workspace to bring the systems, tools and members your team needs into one place.'
							)
						: t(
								'เมื่อผู้ดูแลระบบเพิ่มคุณในพื้นที่ทำงาน AI คุณจะดูเครื่องมือและเชื่อมแอป AI ได้จากหน้านี้',
								'When an administrator adds you to an AI workspace, you can view its tools and connect your AI app here.'
							)}
				</p>
				{#if data.canManage}<div class="spaces-empty-actions">
						{#if readyConnections.length === 0}<a class="k-button primary small" href={localeHref('/app?view=servers')}
								><Plug size={15} aria-hidden="true" />{t('เชื่อมต่อระบบ', 'Connect a system')}</a
							>{/if}<a
							class="k-button small"
							class:primary={readyConnections.length > 0}
							href={localeHref(createWorkspaceHref)}><Plus size={15} aria-hidden="true" />{t('สร้างพื้นที่ทำงาน AI', 'Create AI workspace')}</a
						>
					</div>{/if}
			</div>
		{/if}
		{#if currentHubs.length > 0}<p class="spaces-foot" role="status">
				{t(`แสดง ${visibleHubs.length} จาก ${filteredTotal} พื้นที่ทำงาน`, `Showing ${visibleHubs.length} of ${filteredTotal} workspaces`)}
			</p>{/if}
	</section>

	{#if !data.canManage}
		<div class="k-banner spaces-note">
			<Info size={16} aria-hidden="true" />
			<p>
				{t(
					'คุณเห็นเฉพาะพื้นที่ทำงาน AI ที่ได้รับสิทธิ์ หากต้องการสิทธิ์เพิ่มเติม กรุณาติดต่อผู้ดูแลระบบ',
					'You see only the AI workspaces you have access to. Contact your administrator if you need more access.'
				)}
			</p>
		</div>
	{/if}
</div>

<style>
	.spaces {
		min-width: 0;
		color: var(--orca-ink);
	}
	.spaces-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px 24px;
		margin-bottom: 20px;
	}
	.spaces-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		flex: none;
	}
	.spaces-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		margin: 0 0 14px;
	}
	.spaces-search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: min(320px, 100%);
		height: 36px;
		padding: 0 11px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-subtle);
	}
	.spaces-search:focus-within {
		border-color: var(--orca-ink);
		box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
	}
	.spaces-search input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.spaces-search input::placeholder {
		color: var(--orca-subtle);
	}
	.spaces-search input:focus-visible {
		outline: none;
	}
	.spaces-filter {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
	}
	.spaces-filter button {
		min-height: 30px;
		padding: 0 11px;
		border: 0;
		border-radius: var(--orca-radius-sm);
		background: transparent;
		color: var(--orca-muted);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}
	.spaces-filter button:hover {
		color: var(--orca-ink);
		background: var(--orca-hover);
	}
	.spaces-filter button.selected {
		background: var(--orca-secondary);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.spaces-panel {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.spaces-panel-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--orca-line);
	}
	.spaces-panel-icon {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		flex: none;
		border-radius: var(--orca-radius);
		background: var(--orca-secondary);
		color: var(--orca-nav);
	}
	.spaces-panel-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
	}
	.spaces-panel-head h2:focus-visible {
		outline: 2px solid var(--orca-ink);
		outline-offset: 3px;
		border-radius: 4px;
	}
	.spaces-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 22px;
		padding: 0 7px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
	}
	.spaces-table-wrap {
		overflow-x: auto;
	}
	.spaces-table {
		width: 100%;
		border-collapse: collapse;
	}
	.spaces-table th {
		height: 40px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-nav);
		font-size: 13px;
		font-weight: 500;
		text-align: start;
		white-space: nowrap;
	}
	.spaces-table td {
		padding: 12px 14px;
		border-bottom: 1px solid #eff0f2;
		font-size: 14px;
		vertical-align: middle;
	}
	.spaces-table tbody tr:last-child td {
		border-bottom: 0;
	}
	.spaces-table tbody tr:hover td {
		background: var(--orca-surface-2);
	}
	.spaces-table .num {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
	.spaces-name {
		min-width: 200px;
		max-width: 340px;
	}
	.spaces-name a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.spaces-name a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.spaces-name small {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.spaces-name small.spaces-mobile-meta {
		display: none;
	}
	.spaces-systems {
		min-width: 180px;
	}
	.spaces-systems,
	.spaces-none {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.spaces-systems-inner {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		max-width: 280px;
	}
	.spaces-logos {
		display: inline-flex;
		flex: none;
	}
	.spaces-logo {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-sm);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.spaces-logo + .spaces-logo {
		margin-left: -6px;
	}
	.spaces-system-names {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.spaces-none {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.spaces-usage {
		display: grid;
		gap: 6px;
		min-width: 96px;
		color: var(--orca-muted);
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}
	.spaces-bar {
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--orca-secondary);
		overflow: hidden;
	}
	.spaces-bar i {
		display: block;
		height: 100%;
		min-width: 2px;
		background: var(--orca-ink);
	}
	.spaces-badge {
		display: inline-flex;
		align-items: center;
		padding: 1px 8px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
	}
	.spaces-badge.ok {
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.spaces-badge.warn {
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
	}
	.actions-col {
		width: 1%;
		white-space: nowrap;
	}
	.spaces-row-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
	}
	.spaces-row-actions > :global(.k-button) {
		margin-right: 4px;
		white-space: nowrap;
	}
	.spaces-icon-button {
		display: inline-grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: var(--orca-radius);
		color: var(--orca-subtle);
	}
	.spaces-icon-button:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.spaces-empty {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 48px 24px;
		color: var(--orca-subtle);
		text-align: center;
	}
	.spaces-empty h3 {
		margin: 4px 0 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
	}
	.spaces-empty p {
		max-width: 460px;
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.spaces-empty > :global(.k-button),
	.spaces-empty-actions {
		margin-top: 8px;
	}
	.spaces-empty-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
	}
	.spaces-foot {
		margin: 0;
		padding: 10px 18px;
		border-top: 1px solid var(--orca-line);
		color: var(--orca-muted);
		font-size: 13px;
	}
	.spaces-note {
		margin-top: 16px;
	}
	.spaces-note p {
		margin: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 1180px) {
		.usage-col {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.spaces-head {
			flex-direction: column;
		}
		.spaces-actions,
		.spaces-search {
			width: 100%;
		}
		.spaces-filter {
			flex-wrap: nowrap;
			max-width: 100%;
			overflow-x: auto;
		}
		.spaces-systems-inner {
			max-width: none;
		}
		.spaces-actions > :global(.k-button) {
			flex: 1 1 auto;
		}
		/* Rows stack on phones: name and status, systems, then actions. */
		.spaces-table,
		.spaces-table tbody {
			display: block;
		}
		.spaces-table thead,
		.spaces-table .num {
			display: none;
		}
		.spaces-table tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 8px 12px;
			padding: 14px 16px;
			border-bottom: 1px solid #eff0f2;
		}
		.spaces-table tbody tr:last-child {
			border-bottom: 0;
		}
		.spaces-table td,
		.spaces-table tbody tr:hover td {
			padding: 0;
			border: 0;
			background: none;
		}
		.spaces-name {
			min-width: 0;
			max-width: none;
		}
		.spaces-name small.spaces-mobile-meta {
			display: block;
		}
		.spaces-systems {
			grid-column: 1 / -1;
			grid-row: 2;
			min-width: 0;
		}
		.spaces-table .actions-col {
			grid-column: 1 / -1;
			width: auto;
		}
		.spaces-row-actions {
			justify-content: flex-start;
		}
		.spaces-open {
			margin-left: auto;
		}
	}
</style>
