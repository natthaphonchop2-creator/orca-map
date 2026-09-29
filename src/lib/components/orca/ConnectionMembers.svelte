<script lang="ts">
	import { Info, RefreshCw, Users } from '@lucide/svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		OrcaService,
		displayDate,
		memberName,
		orcaError,
		type OrcaBootstrap,
		type OrcaConnectionMember,
		type OrcaConnectionMembers
	} from '$lib/services/orca';
	import { onDestroy } from 'svelte';
	import StatusPill, { type StatusTone } from './ui/StatusPill.svelte';

	// Program detail › คนที่เชื่อมบัญชีแล้ว (managers only): the people in
	// workspaces that use this program, and whether each one signed in to it
	// with their own account. Saved records only; nobody's keys are read.
	let { data, connectionID }: { data: OrcaBootstrap; connectionID: string } = $props();
	let response = $state<OrcaConnectionMembers>();
	let loading = $state(false);
	let error = $state('');
	let requestNumber = 0;
	let abort: AbortController | undefined;
	let alive = true;
	const connection = $derived(data.connections.find((item) => item.id === connectionID));
	const signedIn = $derived(response ? response.items.filter((row) => rowState(row).tone === 'ok').length : 0);

	async function refresh(id = connectionID) {
		abort?.abort();
		const request = ++requestNumber;
		error = '';
		if (!data.canManage || !id) {
			response = undefined;
			loading = false;
			return;
		}
		const controller = new AbortController();
		abort = controller;
		loading = true;
		try {
			const result = await OrcaService.connectionMembers(id, controller.signal);
			if (alive && request === requestNumber && result.connectionID === id) response = result;
		} catch (cause) {
			if (alive && request === requestNumber && !controller.signal.aborted) error = orcaError(cause);
		} finally {
			if (alive && request === requestNumber) loading = false;
		}
	}

	$effect(() => {
		if (data.canManage && connectionID) void refresh(connectionID);
		else {
			requestNumber++;
			abort?.abort();
			response = undefined;
			loading = false;
		}
	});
	onDestroy(() => {
		alive = false;
		requestNumber++;
		abort?.abort();
	});

	/** One chip per person: signed in with their own account, or not yet. */
	function rowState(row: OrcaConnectionMember): { th: string; en: string; tone: StatusTone } {
		if (response?.oauthSupported === false) {
			if (row.configured === true) return { th: 'ตั้งค่าบัญชีแล้ว', en: 'Account set up', tone: 'ok' };
			if (row.configured === false) return { th: 'ยังไม่ได้ตั้งค่าบัญชี', en: 'Not set up yet', tone: 'warn' };
			return { th: 'ยังยืนยันไม่ได้', en: 'Not verified', tone: 'neutral' };
		}
		if (row.oauthTokenPresent === true) return { th: 'เชื่อมบัญชีแล้ว', en: 'Signed in', tone: 'ok' };
		if (row.oauthTokenPresent === false) return { th: 'ยังไม่ได้เชื่อมบัญชี', en: 'Not signed in yet', tone: 'warn' };
		return { th: 'ยังยืนยันไม่ได้', en: 'Not verified', tone: 'neutral' };
	}
	function hubState(row: OrcaConnectionMember, id: string) {
		return row.activeHubIDs.includes(id) ? '' : row.pausedHubIDs.includes(id) ? t(' (ระงับ)', ' (paused)') : t(' (ฉบับร่าง)', ' (draft)');
	}
</script>

<section class="cm" aria-labelledby="cm-title">
	<header class="cm-head">
		<div>
			<h2 id="cm-title">{t('คนที่เชื่อมบัญชีแล้ว', 'People signed in')}{#if response}<span>{signedIn}/{response.items.length}</span>{/if}</h2>
			<p>{t('คนในพื้นที่ทำงานที่ใช้โปรแกรมนี้ แต่ละคนต้องลงชื่อเข้าใช้ด้วยบัญชีของตัวเอง', 'People in workspaces that use this program. Each signs in with their own account.')}</p>
		</div>
		{#if data.canManage}<button class="k-button small" disabled={loading} onclick={() => refresh()}><RefreshCw size={15} class={loading ? 'k-spin' : ''} aria-hidden="true" />{t('โหลดล่าสุด', 'Refresh')}</button>{/if}
	</header>

	{#if !data.canManage}
		<p class="cm-message">{t('เฉพาะเจ้าของบริษัทและผู้ดูแลเห็นรายชื่อนี้', 'Only company owners and admins can see this list.')}</p>
	{:else if loading && !response}
		<p class="cm-message" role="status">{t('กำลังโหลด…', 'Loading…')}</p>
	{:else if error}
		<p class="cm-message error" role="alert">{error}</p>
	{:else if response}
		{#if connection && (!connection.enabled || !(connection.reviewedReadOnly || connection.reviewedTools))}
			<p class="cm-notice"><Info size={16} aria-hidden="true" />{t('โปรแกรมนี้ยังใช้กับ AI ไม่ได้ แม้บางคนจะเชื่อมบัญชีไว้แล้ว', "AI can't use this program yet, even for people who signed in.")}</p>
		{/if}
		{#if response.items.length}
			<ul class="cm-list">
				{#each response.items as row (row.memberID)}
					{@const member = data.members.find((item) => item.id === row.memberID)}
					{@const chip = rowState(row)}
					<li class="cm-row">
						<span class="cm-person">
							<strong>{member ? memberName(member) : t('สมาชิก', 'Member')}</strong>
							{#if member?.email && memberName(member) !== member.email}<small>{member.email}</small>{/if}
						</span>
						<span class="cm-hubs">
							{#each row.relevantHubIDs as id, index (id)}{#if index}{', '}{/if}<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(id)}`)}>{data.hubs.find((hub) => hub.id === id)?.name || t('พื้นที่ทำงาน', 'Workspace')}</a>{hubState(row, id)}{/each}
						</span>
						<StatusPill label={t(chip.th, chip.en)} tone={chip.tone} dot />
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cm-message"><Users size={18} aria-hidden="true" />{t('ยังไม่มีใครอยู่ในพื้นที่ทำงานที่ใช้โปรแกรมนี้', 'No one is in a workspace that uses this program yet.')}</p>
		{/if}
		<p class="cm-foot">{t(`ข้อมูลจากสิ่งที่บันทึกไว้ ไม่ได้เปิดดูบัญชีของใคร · ตรวจเมื่อ ${displayDate(response.checkedAt)}`, `From saved records; no one's account was opened · checked ${displayDate(response.checkedAt)}`)}</p>
	{/if}
</section>

<style>
	.cm {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	.cm-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px 16px;
		padding: 18px 20px 14px;
	}
	.cm-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}
	.cm-head h2 span {
		padding: 0 7px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
	}
	.cm-head p {
		margin: 3px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.cm-message {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 4px 20px 20px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.cm-message.error {
		color: var(--orca-deny);
	}
	.cm-notice {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 20px 14px;
		padding: 10px 12px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		font-size: 14px;
	}
	.cm-notice :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.cm-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.cm-row {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.5fr) minmax(150px, auto);
		align-items: center;
		gap: 16px;
		padding: 12px 20px;
		border-top: 1px solid var(--orca-line-soft);
		font-size: 14px;
	}
	.cm-person {
		min-width: 0;
	}
	.cm-person strong,
	.cm-person small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cm-person strong {
		font-weight: 600;
	}
	.cm-person small {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.cm-hubs {
		min-width: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.cm-row > :global(.orca-pill) {
		justify-self: end;
	}
	.cm-hubs a {
		color: var(--orca-text-2);
		text-underline-offset: 3px;
	}
	.cm-foot {
		margin: 0;
		padding: 12px 20px;
		border-top: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	@media (max-width: 720px) {
		.cm-row {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 6px 12px;
		}
		.cm-hubs {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
