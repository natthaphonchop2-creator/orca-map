<script lang="ts">
	import { t, localeHref } from '$lib/orca/locale.svelte';
	import { displayDate, orcaError } from '$lib/services/orca';
	import { OrcaService, type PilotRequest, type PilotStatus } from '$lib/services/orca';
	import { Check, Inbox, Info, RefreshCw } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let items = $state<PilotRequest[]>([]);
	let loading = $state(false);
	let saving = $state('');
	let error = $state('');
	let success = $state('');
	let filter = $state('');
	let pendingStatus = $state<Record<string, PilotStatus>>({});
	const statuses: PilotStatus[] = ['received', 'contacted', 'qualified', 'closed'];
	const label = (status: PilotStatus) =>
		({
			received: t('รับคำขอแล้ว', 'Received'),
			contacted: t('ติดต่อแล้ว', 'Contacted'),
			qualified: t('ผ่านการประเมิน', 'Qualified'),
			closed: t('ปิดแล้ว', 'Closed')
		})[status];
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
</script>

<div class="k-breadcrumb">
	<a href={localeHref('/app')}>{t('ภาพรวม', 'Overview')}</a><span>/</span><span
		>{t('คำขอทดลองใช้', 'Pilot requests')}</span
	>
</div>
<div class="k-intro">
	<div class="k-heading-row">
		<h1>{t('คำขอทดลองใช้', 'Pilot requests')}</h1>
		<button class="k-button" disabled={loading || Boolean(saving)} onclick={load}
			><RefreshCw size={16} />{t('โหลดข้อมูลใหม่', 'Refresh')}</button
		>
	</div>
	<p class="k-subtitle">
		{t(
			'ตรวจสอบคำขอทดลองใช้จากเว็บไซต์ ประเมินความต้องการ และบันทึกสถานะการติดตาม',
			'Review pilot requests from the website, assess each request and record its follow-up status.'
		)}
	</p>
</div>
{#if error}<div class="k-banner error" role="alert">
		<Info size={16} />
		<div>
			{error}<button class="k-link-button" disabled={loading || Boolean(saving)} onclick={load}
				>{t(
					'โหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง',
					'Reload the latest data before saving again'
				)}</button
			>
		</div>
	</div>{/if}
{#if success}<div class="k-banner success" role="status"><Check size={16} />{success}</div>{/if}
<div class="k-field pilot-filter">
	<label for="pilot-filter">{t('สถานะ', 'Status')}</label><select
		id="pilot-filter"
		bind:value={filter}
		><option value="">{t('ทุกสถานะ', 'All statuses')}</option>{#each statuses as status}<option
				value={status}>{label(status)}</option
			>{/each}</select
	>
</div>
{#if loading}<div class="k-loading" role="status">
		{t('กำลังโหลดคำขอ…', 'Loading requests…')}
	</div>{:else}{#each visible as item}<article class="k-panel pilot-item">
			<div class="k-panel-head pilot-head">
				<div>
					<h2>{item.organization}</h2>
					<p class="k-small k-muted">{item.reference} · {displayDate(item.createdAt)}</p>
				</div>
				<span class="k-badge">{label(item.status)}</span>
			</div>
			<div class="k-meta pilot-meta">
				<span>{item.name}</span><span>{item.email}</span><span
					>{t('ขนาดทีม', 'Team size')}: {item.teamSize}</span
				><span>{item.locale.toUpperCase()}</span>
			</div>
			<p class="pilot-use-case">{item.useCase}</p>
			<form
				class="pilot-form"
				onsubmit={(event) => {
					event.preventDefault();
					void save(item);
				}}
			>
				<div class="k-actions pilot-actions">
					<div class="k-field">
						<label for={`pilot-status-${item.id}`}
							>{t('สถานะการติดตาม', 'Follow-up status')}</label
						><select
							id={`pilot-status-${item.id}`}
							value={pendingStatus[item.id] ?? item.status}
							disabled={Boolean(saving)}
							onchange={(event) =>
								(pendingStatus = {
									...pendingStatus,
									[item.id]: event.currentTarget.value as PilotStatus
								})}
							>{#each statuses as status}<option value={status}>{label(status)}</option
								>{/each}</select
						>
					</div>
					<button
						class="k-button primary"
						type="submit"
						disabled={Boolean(saving) ||
							!pendingStatus[item.id] ||
							pendingStatus[item.id] === item.status}
						>{saving === item.id
							? t('กำลังบันทึก…', 'Saving…')
							: t('บันทึกสถานะ', 'Save status')}</button
					>
				</div>
			</form>
		</article>{:else}<div class="k-empty pilot-empty">
			<Inbox size={28} />
			<h2>{t('ยังไม่มีคำขอในสถานะนี้', 'No requests in this status')}</h2>
			<p>
				{t(
					'คำขอที่ส่งจากเว็บไซต์จะแสดงที่นี่ เลือกสถานะอื่นเพื่อดูคำขอเพิ่มเติม',
					'Requests submitted on the website appear here. Select another status to see more.'
				)}
			</p>
		</div>{/each}{/if}

<style>
	.pilot-filter {
		width: min(260px, 100%);
		margin-bottom: 16px;
	}
	.pilot-item + .pilot-item {
		margin-top: 16px;
	}
	.pilot-head {
		margin-bottom: 8px;
	}
	.pilot-head h2 {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.pilot-head p {
		margin: 2px 0 0;
	}
	.pilot-meta {
		margin-top: 0;
	}
	.pilot-use-case {
		margin: 14px 0 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.pilot-form {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--orca-line);
	}
	.pilot-actions {
		align-items: flex-end;
		gap: 8px 12px;
	}
	.pilot-actions .k-field {
		width: min(240px, 100%);
	}
	.pilot-empty {
		margin-top: 0;
		gap: 8px;
	}
	.pilot-empty h2 {
		margin-top: 4px;
		font-size: 15px;
	}
	.pilot-empty p {
		margin: 0;
		font-size: 13.5px;
	}
</style>
