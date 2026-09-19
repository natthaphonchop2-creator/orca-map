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
			closed: t('ปิดรายการ', 'Closed')
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
				'บันทึกสถานะแล้ว ไม่มีการส่งข้อความออกไป',
				'Status saved. No outgoing message was sent.'
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
		<h1>{t('คำขอทดลองใช้สำหรับองค์กร', 'Pilot request inbox')}</h1>
		<button class="k-button" disabled={loading || Boolean(saving)} onclick={load}
			><RefreshCw size={16} />{t('รีเฟรชข้อมูล', 'Refresh')}</button
		>
	</div>
	<p class="k-subtitle">
		{t(
			'เจ้าขององค์กรดูคำขอจากเว็บไซต์ ประเมินความต้องการ และบันทึกความคืบหน้าได้จากหน้านี้',
			'Website requests for the installation owner. Review needs and record follow-up status.'
		)}
	</p>
</div>
{#if error}<div class="k-banner error" role="alert">
		<Info size={18} />
		<div>
			{error}<button class="k-link-button" disabled={loading || Boolean(saving)} onclick={load}
				>{t(
					'โหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง',
					'Reload the latest data before saving again'
				)}</button
			>
		</div>
	</div>{/if}
{#if success}<div class="k-banner success" role="status"><Check size={18} />{success}</div>{/if}
<div class="k-field" style="max-width:340px;margin-bottom:22px">
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
	</div>{:else}{#each visible as item}<article class="k-panel">
			<div class="k-panel-head">
				<div>
					<p class="k-small k-muted">{item.reference} · {displayDate(item.createdAt)}</p>
					<h2>{item.organization}</h2>
				</div>
				<span class="k-badge">{label(item.status)}</span>
			</div>
			<div class="k-meta">
				<span>{item.name}</span><span>{item.email}</span><span
					>{t('จำนวนผู้ร่วมทดลองใช้', 'Team size')}: {item.teamSize}</span
				><span>{item.locale.toUpperCase()}</span>
			</div>
			<p style="margin-top:17px;white-space:pre-wrap;overflow-wrap:anywhere">{item.useCase}</p>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void save(item);
				}}
				style="margin-top:20px"
			>
				<div class="k-actions">
					<div class="k-field">
						<label for={`pilot-status-${item.id}`} class="k-small"
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
		</article>{:else}<div class="k-empty">
			<Inbox size={34} />
			<h2>{t('ยังไม่มีคำขอในสถานะนี้', 'No requests in this status')}</h2>
			<p>
				{t(
					'คำขอที่ส่งสำเร็จจากเว็บไซต์จะแสดงที่นี่ ลองเลือกสถานะอื่นเพื่อดูคำขอเพิ่มเติม',
					'Successfully submitted website requests will appear here.'
				)}
			</p>
		</div>{/each}{/if}
