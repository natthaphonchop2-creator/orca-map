<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import { term } from '$lib/orca/glossary';
	import { displayDate, orcaError } from '$lib/services/orca';
	import { OrcaService, type PilotRequest, type PilotStatus } from '$lib/services/orca';
	import { PILOT_STATUSES } from '$lib/services/orca-platform';
	import { Building2, Check, Inbox, Info, Mail, RefreshCw, UserRound, Users } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import PlatformBadge from './platform/PlatformBadge.svelte';
	import EmptyState from './ui/EmptyState.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import StatusPill, { type StatusTone } from './ui/StatusPill.svelte';

	// แพลตฟอร์ม ORCA › คำขอทดลองใช้: requests from the website's form. The ORCA
	// team records how far each one got; saving never messages the requester.
	let items = $state<PilotRequest[]>([]);
	let loading = $state(false);
	let saving = $state('');
	let error = $state('');
	let success = $state('');
	let filter = $state<PilotStatus | ''>('');
	let pendingStatus = $state<Record<string, PilotStatus>>({});
	const statuses: readonly PilotStatus[] = PILOT_STATUSES;
	const label = (status: PilotStatus) =>
		({
			received: t('รับคำขอแล้ว', 'Received'),
			contacted: t('ติดต่อแล้ว', 'Contacted'),
			qualified: t('ผ่านการประเมิน', 'Qualified'),
			closed: t('ปิดแล้ว', 'Closed')
		})[status];
	const tone = (status: PilotStatus): StatusTone =>
		(({ received: 'warn', contacted: 'neutral', qualified: 'ok', closed: 'neutral' }) as const)[status];
	const count = (status: PilotStatus | '') => (status ? items.filter((item) => item.status === status).length : items.length);
	const visible = $derived(items.filter((item) => !filter || item.status === filter));
	async function load() {
		loading = true;
		error = '';
		try {
			const response = await OrcaService.listPilotRequests();
			items = response.items ?? [];
			pendingStatus = {};
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			loading = false;
		}
	}
	onMount(load);
	async function save(item: PilotRequest) {
		if (saving) return;
		saving = item.id;
		error = '';
		success = '';
		try {
			const updated = await OrcaService.updatePilotRequest(
				item.id,
				pendingStatus[item.id] ?? item.status,
				item.version
			);
			items = items.map((row) => (row.id === item.id ? updated : row));
			pendingStatus = Object.fromEntries(Object.entries(pendingStatus).filter(([id]) => id !== item.id));
			success = t(
				'บันทึกสถานะแล้ว ORCA ไม่ได้ส่งข้อความใดถึงผู้ขอ',
				'Status saved. No message was sent to the requester.'
			);
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			saving = '';
		}
	}
	const teamSize = (value: string) => t(`${value} คน`, `${value} people`);
</script>

<PageHeader
	title={term('pilotRequests', t)}
	subtitle={t('คำขอจากหน้าเว็บไซต์ บันทึกว่าติดตามถึงไหนแล้ว ORCA ไม่ส่งข้อความถึงผู้ขอ', 'Requests from the website. Record how far each got; ORCA never messages the requester.')}
>
	{#snippet eyebrow()}<PlatformBadge />{/snippet}
	{#snippet action()}<button type="button" class="k-button" disabled={loading || Boolean(saving)} onclick={load}
			><RefreshCw size={16} class={loading ? 'k-spin' : ''} aria-hidden="true" />{t('โหลดใหม่', 'Refresh')}</button
		>{/snippet}
</PageHeader>

{#if error}<div class="pilot-callout deny" role="alert">
		<Info size={17} aria-hidden="true" />
		<span>{error}</span>
		<button type="button" class="k-link-button" disabled={loading || Boolean(saving)} onclick={load}
			>{t('โหลดข้อมูลล่าสุด', 'Reload the latest')}</button
		>
	</div>{/if}
{#if success}<p class="pilot-callout ok" role="status"><Check size={17} aria-hidden="true" /><span>{success}</span></p>{/if}

<div class="pilot-filter" role="group" aria-label={t('กรองตามสถานะ', 'Filter by status')}>
	<button type="button" class:active={filter === ''} aria-pressed={filter === ''} onclick={() => (filter = '')}
		>{t('ทั้งหมด', 'All')}<span>{count('')}</span></button
	>
	{#each statuses as status (status)}
		<button type="button" class:active={filter === status} aria-pressed={filter === status} onclick={() => (filter = status)}
			>{label(status)}<span>{count(status)}</span></button
		>
	{/each}
</div>

{#if loading && !items.length}<p class="pilot-loading" role="status">{t('กำลังโหลดคำขอ…', 'Loading requests…')}</p>
{:else if visible.length}
	<ul class="pilot-list">
		{#each visible as item (item.id)}
			{@const chosen = pendingStatus[item.id] ?? item.status}
			<li class="pilot-item">
				<div class="pilot-head">
					<span class="pilot-mark" aria-hidden="true"><Building2 size={18} /></span>
					<div class="pilot-title">
						<h2>{item.organization}</h2>
						<p>{item.reference} · {displayDate(item.createdAt)}</p>
					</div>
					<StatusPill label={label(item.status)} tone={tone(item.status)} dot />
				</div>
				<ul class="pilot-meta" aria-label={t('ผู้ขอ', 'Requester')}>
					<li><UserRound size={15} aria-hidden="true" />{item.name}</li>
					<li><Mail size={15} aria-hidden="true" /><span class="pilot-email">{item.email}</span></li>
					<li><Users size={15} aria-hidden="true" />{teamSize(item.teamSize)}</li>
					<li>{item.locale === 'en' ? 'English' : 'ไทย'}</li>
				</ul>
				<p class="pilot-use-case">{item.useCase}</p>
				<form
					class="pilot-form"
					onsubmit={(event) => {
						event.preventDefault();
						void save(item);
					}}
				>
					<fieldset class="pilot-status" disabled={Boolean(saving)}>
						<legend>{t('สถานะการติดตาม', 'Follow-up status')}</legend>
						<div class="pilot-segments">
							{#each statuses as status (status)}
								<label class:checked={chosen === status}>
									<input
										type="radio"
										name={`pilot-status-${item.id}`}
										value={status}
										checked={chosen === status}
										onchange={() => (pendingStatus = { ...pendingStatus, [item.id]: status })}
									/>{label(status)}
								</label>
							{/each}
						</div>
					</fieldset>
					<!-- The save button shows only once the status changed: one primary action at a time. -->
					{#if pendingStatus[item.id] && pendingStatus[item.id] !== item.status}<button
							class="k-button primary"
							type="submit"
							disabled={Boolean(saving)}
							>{saving === item.id ? t('กำลังบันทึก…', 'Saving…') : t('บันทึกสถานะ', 'Save status')}</button
						>{/if}
				</form>
			</li>
		{/each}
	</ul>
{:else}
	<EmptyState icon={Inbox} message={filter ? t('ยังไม่มีคำขอในสถานะนี้', 'No requests in this status.') : t('ยังไม่มีคำขอทดลองใช้ คำขอจากหน้าเว็บไซต์จะมาที่นี่', 'No pilot requests yet. Requests from the website arrive here.')} />
{/if}

<style>
	.pilot-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px 10px;
		margin: 0 0 16px;
		padding: 12px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		font-size: 14px;
		line-height: 1.6;
	}
	.pilot-callout > span {
		flex: 1 1 240px;
	}
	.pilot-callout :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.pilot-callout.ok {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.pilot-callout.deny {
		border-color: var(--orca-deny-line);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.pilot-filter {
		display: flex;
		gap: 4px;
		margin: 0 0 18px;
		padding: 4px;
		overflow-x: auto;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		width: fit-content;
		max-width: 100%;
		scrollbar-width: none;
	}
	.pilot-filter button {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 7px;
		min-height: 34px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--orca-muted);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.pilot-filter button span {
		color: var(--orca-subtle);
		font-variant-numeric: tabular-nums;
	}
	.pilot-filter button.active {
		background: var(--orca-surface);
		color: var(--orca-ink);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 10%, transparent);
	}
	.pilot-filter button.active span {
		color: var(--orca-text-2);
	}
	.pilot-loading {
		margin: 0;
		padding: 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
	}
	.pilot-list {
		display: grid;
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pilot-item {
		padding: 20px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
	}
	.pilot-head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.pilot-mark {
		display: grid;
		flex: none;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.pilot-title {
		flex: 1;
		min-width: 0;
	}
	.pilot-title h2 {
		margin: 0;
		font-size: 16.5px;
		font-weight: 650;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.pilot-title p {
		margin: 1px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.pilot-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		margin: 14px 0 0 50px;
		padding: 0;
		color: var(--orca-text-2);
		font-size: 13.5px;
		list-style: none;
	}
	.pilot-meta li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.pilot-meta :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.pilot-email {
		overflow-wrap: anywhere;
	}
	.pilot-use-case {
		margin: 12px 0 0 50px;
		padding: 12px 14px;
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.pilot-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 16px;
		margin: 16px 0 0 50px;
		padding-top: 16px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.pilot-status {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.pilot-status legend {
		margin-bottom: 8px;
		padding: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--orca-text-2);
	}
	.pilot-segments {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pilot-segments label {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 13px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font-size: 13.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.pilot-segments label.checked {
		border-color: var(--orca-chosen);
		box-shadow: 0 0 0 1px var(--orca-chosen);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.pilot-segments label:has(input:focus-visible) {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.pilot-segments input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.pilot-status:disabled label {
		cursor: not-allowed;
		opacity: 0.6;
	}
	@media (max-width: 720px) {
		.pilot-item {
			padding: 16px;
		}
		.pilot-meta,
		.pilot-use-case,
		.pilot-form {
			margin-left: 0;
		}
		.pilot-form .k-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>
