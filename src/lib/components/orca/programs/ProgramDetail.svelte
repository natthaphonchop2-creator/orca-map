<script lang="ts">
	import { ArrowRight, Folder, Info, Pause, Play, Plus } from '@lucide/svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { connectionReady } from '$lib/orca/activation';
	import { catalogSource } from '$lib/orca/catalog';
	import { gatewayMemberIDs, gatewaySources, gatewayUsesConnection } from '$lib/orca/gateway-sources';
	import { programSummary, programSummaryLabel } from '$lib/orca/workspace-edit';
	import { term } from '$lib/orca/glossary';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import { programDisplayName, programEventOutcome, programLine, programStatus, programStatusCopy, toolChangedSinceReview, type ProgramStatus } from '$lib/orca/program-catalog';
	import { accessSummary, toolCopy, type ProgramToolLike } from '$lib/orca/program-tools';
	import {
		OrcaService,
		displayDate,
		orcaError,
		statusLabels,
		type OrcaAuditEvent,
		type OrcaBootstrap,
		type OrcaCandidate,
		type OrcaConnectionHealth
	} from '$lib/services/orca';
	import { ProgramService } from '$lib/services/orca-programs';
	import { onDestroy, onMount } from 'svelte';
	import ConnectionMembers from '../ConnectionMembers.svelte';
	import LifecycleActions from '../LifecycleActions.svelte';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import CompanyAccountCard from './CompanyAccountCard.svelte';
	import ProgramAccount from './ProgramAccount.svelte';
	import ProgramLogo from './ProgramLogo.svelte';
	import ProgramToolsTab from './ProgramToolsTab.svelte';

	// A program (view=servers&connection=ID&tab=…): ภาพรวม with the account folded
	// in · สิ่งที่ AI ทำได้ (the step-3 editor in place) · คนที่เชื่อมบัญชีแล้ว
	// (managers) · พื้นที่ทำงาน · ประวัติ.
	let { data, connectionID, onchanged }: { data: OrcaBootstrap; connectionID: string; onchanged: () => Promise<void> } = $props();

	const connection = $derived(data.connections.find((item) => item.id === connectionID && !item.deletedAt));
	let candidates = $state.raw<OrcaCandidate[]>([]);
	let events = $state.raw<OrcaAuditEvent[]>([]);
	let activityLoading = $state(false);
	let activityError = $state('');
	let pauseOpen = $state(false);
	let pausing = $state(false);
	let pauseError = $state('');
	let alive = true;
	let activityRequest = 0;

	const source = $derived(candidates.find((item) => item.id === connection?.mcpID));
	const presented = $derived(source ? catalogSource(source) : undefined);
	const programName = $derived(presented ? programDisplayName(presented) : (connection?.name ?? ''));
	const logoName = $derived(presented?.name || connection?.name || '');
	const archived = $derived(Boolean(connection?.archivedAt));
	// สิ่งที่ AI ทำได้'s unsaved changes live in that tab: another tab, another
	// page or closing the page asks first, and archive and delete wait for a
	// save or "คืนค่าเดิม" (Codex release review 70, as WorkspaceDetail).
	let dirty = $state(false);
	let leaveOpen = $state(false);
	let leaveTo: URL | undefined;
	let leaving = false;
	beforeNavigate((navigation) => {
		if (leaving || !dirty) return;
		navigation.cancel();
		if (navigation.type === 'leave') return;
		leaveTo = navigation.to?.url;
		leaveOpen = true;
	});
	async function leave() {
		leaveOpen = false;
		dirty = false;
		const target = leaveTo;
		leaveTo = undefined;
		if (!target) return;
		leaving = true;
		try {
			await goto(target.pathname + target.search + target.hash);
		} finally {
			leaving = false;
		}
	}
	const workspaces = $derived(data.hubs.filter((hub) => gatewayUsesConnection(hub, connectionID) && hub.status !== 'deleted'));
	const liveWorkspaces = $derived(workspaces.filter((hub) => hub.status !== 'archived'));
	let health = $state<OrcaConnectionHealth>();
	const status = $derived<ProgramStatus>(connection ? programStatus(connection, health) : 'review');
	/** A tool changed at the program since it was last reviewed: AI can't use it until someone checks again. */
	const changedAtProgram = $derived(Boolean(connection && !archived && connection.enabled && toolChangedSinceReview(connection, health)));
	const summary = $derived(connection ? accessSummary(connection) : undefined);
	const allowed = $derived(connection ? (connection.tools as ProgramToolLike[]).filter((tool) => connection.toolNames.includes(tool.name)) : []);
	const statusCopy = $derived(programStatusCopy(status));
	const tabs = $derived([
		{ id: 'overview', label: t('ภาพรวม', 'Overview') },
		// Archived elsewhere while it has unsaved changes: the tab stays with them until saved or undone.
		...(!archived || dirty ? [{ id: 'tools', label: term('whatAICanDo', t) }] : []),
		// A company account (บัญชีกลาง) is everyone's: nobody signs in themselves (company accounts §7).
		...(!archived && data.canManage && !connection?.programAccountID ? [{ id: 'members', label: t('คนที่เชื่อมบัญชีแล้ว', 'People signed in') }] : []),
		{ id: 'workspaces', label: t('พื้นที่ทำงาน', 'Workspaces'), count: liveWorkspaces.length },
		{ id: 'activity', label: t('ประวัติ', 'History') }
	]);
	const requested = $derived(page.url.searchParams.get('tab') === 'account' ? 'overview' : page.url.searchParams.get('tab') || 'overview');
	const tab = $derived(tabs.some((item) => item.id === requested) ? requested : 'overview');
	const href = (next: string) => localeHref(`/app?view=servers&connection=${encodeURIComponent(connectionID)}&tab=${next}`);

	onMount(() => {
		if (!data.canManage) return;
		void ProgramService.candidates()
			.then((result) => {
				if (alive) candidates = result;
			})
			.catch(() => {
				// The logo and the catalog's name are extras.
			});
		void OrcaService.connectionHealth()
			.then((result) => {
				if (alive) health = result.items.find((item) => item.connectionID === connectionID);
			})
			.catch(() => {
				// Advisory: the chip then follows the program's own review state.
			});
	});
	onDestroy(() => {
		alive = false;
		activityRequest++;
	});

	async function loadActivity() {
		const request = ++activityRequest;
		activityLoading = true;
		activityError = '';
		try {
			const result = await OrcaService.audit();
			if (alive && request === activityRequest)
				events = result.filter((event) => event.connectionID === connectionID || event.resourceID === connectionID);
		} catch (cause) {
			if (alive && request === activityRequest) activityError = orcaError(cause);
		} finally {
			if (alive && request === activityRequest) activityLoading = false;
		}
	}
	$effect(() => {
		if (tab === 'activity' && connectionID) void loadActivity();
	});

	async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
		await onchanged();
		if (action === 'delete') await goto(localeHref('/app?view=servers'));
	}
	// Pausing keeps the reviewed list as it is (the note is sent unchanged), so it works even when the program is down.
	async function setEnabled(enabled: boolean) {
		if (!connection || pausing) return;
		pausing = true;
		pauseError = '';
		try {
			await ProgramService.save(
				{
					name: connection.name,
					description: connection.description,
					mcpID: connection.mcpID,
					toolNames: connection.toolNames,
					scopeNote: connection.scopeNote,
					reviewedTools: connection.reviewedTools ?? false,
					reviewedReadOnly: connection.reviewedReadOnly,
					enabled,
					version: connection.version
				},
				connection.id
			);
			pauseOpen = false;
			showToast(enabled ? t(`เปิดใช้ ${connection.name} อีกครั้งแล้ว`, `${connection.name} resumed`) : t(`หยุด ${connection.name} ชั่วคราวแล้ว`, `${connection.name} paused`));
			await onchanged();
		} catch (cause) {
			pauseError = orcaError(cause);
			if (enabled) showToast(pauseError, { tone: 'error' });
		} finally {
			pausing = false;
		}
	}
	function eventLabel(event: OrcaAuditEvent) {
		const tool = allowed.find((item) => item.name === event.toolName) ?? connection?.tools.find((item) => item.name === event.toolName);
		if (tool) return toolCopy(tool as ProgramToolLike, orcaLocale.value === 'en' ? 'en' : 'th').label;
		if (event.action === 'connection.update') return t('แก้สิ่งที่ AI ทำได้', 'Changed what AI can do');
		if (event.action === 'connection.create') return t('เชื่อมโปรแกรม', 'Connected the program');
		if (event.action === 'connection.archive') return t('จัดเก็บโปรแกรม', 'Archived the program');
		if (event.action === 'connection.restore') return t('กู้คืนโปรแกรม', 'Restored the program');
		return event.toolName || event.action || t('การใช้งาน', 'Activity');
	}
	const person = (id: string) => {
		const member = data.members.find((item) => item.id === id);
		return member ? member.displayName || member.email : '';
	};
</script>

<a class="pd-back" href={localeHref('/app?view=servers')}>← {term('programs', t)}</a>

{#if !connection}
	<div class="pd-missing" role="alert">
		<p>{t('ไม่พบโปรแกรมนี้ อาจถูกลบไปแล้ว หรือบัญชีของคุณไม่มีสิทธิ์', 'This program was not found, or your account cannot open it.')}</p>
		<a class="k-button" href={localeHref('/app?view=servers')}>{t('ไปที่โปรแกรมที่เชื่อม', 'Go to Programs')}</a>
	</div>
{:else}
	<header class="pd-head">
		<ProgramLogo name={logoName} size={52} />
		<div class="pd-title">
			<div class="pd-title-row">
				<h1>{connection.name}</h1>
				<StatusPill label={t(statusCopy.th, statusCopy.en)} tone={statusCopy.tone} dot />
			</div>
			<p>{connection.description || (presented ? t(...programLine(presented)) : '')}</p>
		</div>
		{#if data.canManage}<div class="pd-actions"><LifecycleActions entity={connection} kind="server" {archived} canManage={data.canManage && !dirty} affectedGateways={workspaces} onchanged={lifecycleChanged} onreload={onchanged} /></div>{/if}
	</header>

	{#if changedAtProgram}<p class="pd-banner"><Info size={16} aria-hidden="true" />{t(`บางอย่างใน ${programName} เปลี่ยนไปหลังตรวจครั้งล่าสุด AI จะใช้สิ่งที่เปลี่ยนไม่ได้จนกว่าจะตรวจใหม่ที่แท็บสิ่งที่ AI ทำได้`, `Something in ${programName} changed since the last review. AI can't use it until you review it again under What AI can do.`)}</p>{/if}
	{#if archived}<p class="pd-banner"><Info size={16} aria-hidden="true" />{t('โปรแกรมนี้จัดเก็บแล้ว AI ในพื้นที่ทำงานที่ใช้โปรแกรมนี้จะใช้ไม่ได้ กู้คืนก่อนแก้ไข', "This program is archived. AI in workspaces that use it can't use it. Restore it before changing it.")}</p>{/if}

	<nav class="pd-tabs" aria-label={t('ส่วนของโปรแกรม', 'Program sections')}>
		{#each tabs as item (item.id)}
			<a href={href(item.id)} class:on={tab === item.id} aria-current={tab === item.id ? 'page' : undefined}>{item.label}{#if 'count' in item}<span>{item.count}</span>{/if}</a>
		{/each}
	</nav>

	{#if tab === 'tools' && data.canManage}
		{#key connection.id}<ProgramToolsTab {connection} {programName} {onchanged} ondirty={(value) => (dirty = value)} />{/key}
	{:else if tab === 'members' && data.canManage}
		<ConnectionMembers {data} connectionID={connection.id} />
	{:else if tab === 'workspaces'}
		<section class="pd-card">
			<header class="pd-card-head">
				<div>
					<h2>{t('พื้นที่ทำงานที่ใช้โปรแกรมนี้', 'Workspaces using this program')}</h2>
					<p>{t('คนในพื้นที่ทำงานเหล่านี้ให้ AI ใช้โปรแกรมนี้ได้ตามที่เลือกไว้', 'People in these workspaces can have AI use this program as chosen.')}</p>
				</div>
				{#if data.canManage && connectionReady(connection)}<a class="k-button primary" href={localeHref(`/app?view=new&connection=${encodeURIComponent(connection.id)}`)}><Plus size={16} aria-hidden="true" />{term('newWorkspace', t)}</a>{/if}
			</header>
			{#each workspaces as hub (hub.id)}
				<!-- What AI can do in this program there, not the workspace's total across programs. -->
				{@const here = gatewaySources(hub).find((source) => source.connectionID === connection.id)?.toolNames ?? []}
				<a class="pd-row" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}>
					<span class="pd-row-icon" aria-hidden="true"><Folder size={16} /></span>
					<span class="pd-row-copy"><strong>{hub.name}</strong><small>{programSummaryLabel(programSummary(connection, here), t)} · {t(`${gatewayMemberIDs(hub).length} คน`, `${gatewayMemberIDs(hub).length} ${gatewayMemberIDs(hub).length === 1 ? 'person' : 'people'}`)}</small></span>
					<StatusPill label={statusLabels[hub.status]} tone={hub.status === 'active' ? 'ok' : hub.status === 'paused' ? 'warn' : 'neutral'} />
					<ArrowRight size={16} aria-hidden="true" />
				</a>
			{:else}
				<p class="pd-note">{t('ยังไม่มีพื้นที่ทำงานที่ใช้โปรแกรมนี้', 'No workspace uses this program yet.')}</p>
			{/each}
		</section>
	{:else if tab === 'activity'}
		<section class="pd-card">
			<header class="pd-card-head">
				<div>
					<h2>{t('ประวัติ', 'History')}</h2>
					<p>{t('การใช้งานและการเปลี่ยนแปลงล่าสุดของโปรแกรมนี้', 'Recent use and changes of this program.')}</p>
				</div>
				<button type="button" class="k-button small" disabled={activityLoading} onclick={loadActivity}>{t('โหลดล่าสุด', 'Refresh')}</button>
			</header>
			{#if activityError}<p class="pd-note error" role="alert">{activityError}</p>
			{:else if activityLoading && !events.length}<p class="pd-note" role="status">{t('กำลังโหลด…', 'Loading…')}</p>
			{:else}
				{#each events.slice(0, 50) as event (event.id)}
					{@const result = programEventOutcome(event.outcome)}
					<div class="pd-event">
						<span class="pd-event-copy"><strong>{eventLabel(event)}</strong><small>{[person(event.userID), displayDate(event.createdAt)].filter(Boolean).join(' · ')}</small></span>
						<StatusPill label={t(result.th, result.en)} tone={result.tone} />
					</div>
				{:else}
					<p class="pd-note">{t('ยังไม่มีประวัติของโปรแกรมนี้', 'No history for this program yet.')}</p>
				{/each}
			{/if}
		</section>
	{:else}
		<div class="pd-grid">
			<section class="pd-card pd-summary">
				<header class="pd-card-head">
					<div>
						<h2>{term('whatAICanDo', t)}</h2>
						<p>{summary && summary.count && summary.reviewed
							? summary.readOnly
								? t(`AI ทำได้ ${summary.count} อย่าง · อ่านอย่างเดียว`, `AI can do ${summary.count} things · read only`)
								: t(`AI ทำได้ ${summary.count} อย่าง · อ่านและแก้ไข`, `AI can do ${summary.count} things · read and change`)
							: t('ยังไม่ได้เลือกสิ่งที่ AI ทำได้', 'Nothing chosen yet')}</p>
					</div>
					{#if data.canManage && !archived}<a class="k-button primary" href={href('tools')}>{t('แก้ไขสิ่งที่ AI ทำได้', 'Change what AI can do')}</a>{/if}
				</header>
				{#if allowed.length}
					<ul class="pd-chips">
						{#each allowed.slice(0, 8) as tool (tool.name)}<li>{toolCopy(tool, orcaLocale.value === 'en' ? 'en' : 'th').label}</li>{/each}
						{#if allowed.length > 8}<li class="more">{t(`อีก ${allowed.length - 8} อย่าง`, `${allowed.length - 8} more`)}</li>{/if}
					</ul>
				{/if}
			</section>

			{#if data.canManage && !archived}
				{#key connection.id}<CompanyAccountCard {connection} {programName} members={data.members} {onchanged} />{/key}
				{#if !connection.programAccountID}
					<section class="pd-card">
						<header class="pd-card-head"><div><h2>{t('บัญชีของคุณ', 'Your account')}</h2></div></header>
						<div class="pd-account">
							{#key connection.mcpID}<ProgramAccount sourceID={connection.mcpID} {programName} endpointHost={source?.endpointHost} variant="manage" operator={data.platformOperator === true} />{/key}
						</div>
						<p class="pd-note">{t(`แต่ละคนต้องมีบัญชี ${programName} ของตัวเอง แล้วลงชื่อเข้าใช้เมื่อเริ่มใช้กับ AI`, `Each person needs their own ${programName} account and signs in when they start using it with AI.`)}</p>
					</section>
				{/if}
			{/if}

			<section class="pd-card">
				<header class="pd-card-head"><div><h2>{t('รายละเอียด', 'Details')}</h2></div></header>
				<dl class="pd-list">
					<div>
						<dt>{t('สถานะ', 'Status')}</dt>
						<dd>
							<span>{connection.enabled ? t('เปิดใช้', 'On') : t('หยุดชั่วคราว AI ใช้โปรแกรมนี้ไม่ได้', "Paused: AI can't use it")}</span>
							{#if data.canManage && !archived}
								{#if connection.enabled}<button type="button" class="k-button small" onclick={() => (pauseOpen = true)}><Pause size={15} aria-hidden="true" />{t('หยุดชั่วคราว', 'Pause')}</button>
								{:else}<button type="button" class="k-button small" disabled={pausing} onclick={() => setEnabled(true)}><Play size={15} aria-hidden="true" />{pausing ? t('กำลังเปิด…', 'Resuming…') : t('เปิดใช้อีกครั้ง', 'Resume')}</button>{/if}
							{/if}
						</dd>
					</div>
					<div><dt>{t('พื้นที่ทำงาน', 'Workspaces')}</dt><dd><a href={href('workspaces')}>{t(`${liveWorkspaces.length} พื้นที่`, `${liveWorkspaces.length}`)}</a></dd></div>
					{#if connection.scopeNote}<div><dt>{t('หมายเหตุ', 'Note')}</dt><dd>{connection.scopeNote}</dd></div>{/if}
					<div><dt>{t('แก้ไขล่าสุด', 'Last changed')}</dt><dd>{displayDate(connection.updatedAt)}</dd></div>
				</dl>
			</section>
		</div>
	{/if}

	<ConfirmDialog
		bind:open={pauseOpen}
		title={t(`หยุด ${connection.name} ชั่วคราว?`, `Pause ${connection.name}?`)}
		message={t(
			`AI ใน ${liveWorkspaces.length} พื้นที่ทำงานที่ใช้โปรแกรมนี้จะใช้ไม่ได้จนกว่าจะเปิดใช้อีกครั้ง สิ่งที่ AI ทำได้ยังเก็บไว้เหมือนเดิม`,
			`AI in the ${liveWorkspaces.length} workspaces that use it can't use it until you resume it. What AI can do stays as it is.`
		)}
		confirmLabel={t('หยุดชั่วคราว', 'Pause')}
		busy={pausing}
		onconfirm={() => setEnabled(false)}
	>
		{#if pauseError}<p class="pd-note error" role="alert">{pauseError}</p>{/if}
	</ConfirmDialog>
{/if}

<ConfirmDialog
	bind:open={leaveOpen}
	title={t('ออกโดยไม่บันทึก?', 'Leave without saving?')}
	message={t('สิ่งที่แก้ไว้ในแท็บนี้จะหายไป', 'What you changed in this tab will be lost.')}
	confirmLabel={t('ออกโดยไม่บันทึก', 'Leave without saving')}
	cancelLabel={t('แก้ต่อ', 'Keep editing')}
	tone="danger"
	onconfirm={leave}
	oncancel={() => (leaveTo = undefined)}
/>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.pd-back {
		display: inline-block;
		margin-bottom: 12px;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		text-decoration: none;
	}
	.pd-back:hover {
		color: var(--orca-ink);
	}
	.pd-head {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}
	.pd-title {
		flex: 1;
		min-width: 0;
	}
	.pd-title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
	}
	.pd-title h1 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.pd-title p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.pd-actions {
		flex: none;
	}
	.pd-banner {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 20px;
		padding: 12px 14px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		font-size: 13.5px;
	}
	.pd-banner :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.pd-tabs {
		display: flex;
		gap: 24px;
		margin-bottom: 24px;
		overflow-x: auto;
		border-bottom: 1px solid var(--orca-line);
		scrollbar-width: thin;
	}
	.pd-tabs a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-bottom: -1px;
		padding: 10px 0 11px;
		border-top: 2px solid transparent; /* balances the underline: the label sits in the middle */
		border-bottom: 2px solid transparent;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.pd-tabs a:hover {
		color: var(--orca-ink);
	}
	.pd-tabs a.on {
		border-bottom-color: var(--orca-tab-indicator);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.pd-tabs a span {
		min-width: 22px;
		padding: 0 6px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 11.5px;
		text-align: center;
	}
	.pd-grid {
		display: grid;
		gap: 16px;
	}
	.pd-card {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.pd-card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px 16px;
		padding: 18px 20px 14px;
	}
	.pd-card-head h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
	}
	.pd-card-head p {
		margin: 3px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.pd-summary .pd-card-head p {
		color: var(--orca-text-2);
		font-weight: 600;
	}
	.pd-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
		padding: 0 20px 18px;
		list-style: none;
	}
	.pd-chips li {
		padding: 4px 12px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-surface-2);
		color: var(--orca-text-2);
		font-size: 12px;
	}
	.pd-chips li.more {
		color: var(--orca-muted);
	}
	.pd-account {
		padding: 0 20px 16px;
	}
	.pd-note {
		margin: 0;
		padding: 0 20px 18px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.pd-note.error {
		color: var(--orca-deny);
	}
	.pd-list {
		margin: 0;
	}
	.pd-list > div {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr);
		gap: 16px;
		padding: 12px 20px;
		border-top: 1px solid var(--orca-line-soft);
		font-size: 13.5px;
	}
	.pd-list dt {
		color: var(--orca-muted);
	}
	.pd-list dd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.pd-list a {
		color: var(--orca-ink);
		text-underline-offset: 3px;
	}
	.pd-row {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) auto 16px;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-ink);
		text-decoration: none;
	}
	.pd-row:hover {
		background: var(--orca-hover);
	}
	.pd-row > :global(svg) {
		color: var(--orca-subtle);
	}
	.pd-row-icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: var(--orca-radius);
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.pd-row-copy {
		min-width: 0;
	}
	.pd-row-copy strong,
	.pd-row-copy small,
	.pd-event-copy strong,
	.pd-event-copy small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pd-row-copy strong,
	.pd-event-copy strong {
		font-size: 13.5px;
		font-weight: 600;
	}
	.pd-row-copy small,
	.pd-event-copy small {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.pd-event {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 11px 20px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.pd-event-copy {
		min-width: 0;
	}
	.pd-missing {
		padding: 24px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
	}
	.pd-missing p {
		margin: 0 0 12px;
	}
	@media (max-width: 720px) {
		.pd-head {
			flex-wrap: wrap;
		}
		.pd-title h1 {
			font-size: 18px;
		}
		.pd-actions {
			width: 100%;
		}
		.pd-tabs {
			gap: 20px;
		}
		.pd-list > div {
			grid-template-columns: minmax(0, 1fr);
			gap: 2px;
		}
		.pd-row {
			grid-template-columns: 34px minmax(0, 1fr) 16px;
		}
		.pd-row :global(.orca-pill) {
			grid-column: 2;
			grid-row: 2;
			justify-self: start;
		}
	}
</style>
