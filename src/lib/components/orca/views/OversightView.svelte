<script lang="ts">
	import { hubAsksApproval } from '$lib/orca/approvals';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import { untrack } from 'svelte';
	import Approvals from '../Approvals.svelte';
	import Audit from '../Audit.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import PageTabs from '../ui/PageTabs.svelte';
	import { claimPageHeader } from '../ui/page-header-context';

	// ประวัติ (W0): ตรวจสอบ and คำขอของฉัน in one page with three tabs, each
	// keeping its view id: รออนุมัติ (an employee's own requests) · การใช้งาน ·
	// การตั้งค่า. The two histories keep their workspace filter. แอป AI ที่เชื่อม
	// moved to AI ของฉัน › ทั้งบริษัท (view=secrets, MyAIFrame).
	let {
		data,
		view,
		hubID = '',
		pendingApprovals = 0,
		onapprovalschanged
	}: {
		data: OrcaBootstrap;
		/** The company's data without archived and removed records (kept for the page's call). */
		activeData?: OrcaBootstrap;
		view: 'approvals' | 'executions' | 'audit';
		hubID?: string;
		pendingApprovals?: number;
		onapprovalschanged?: () => void;
	} = $props();
	claimPageHeader();
	// The workspace chosen in a history's own filter goes with the tab links, so
	// switching between the two histories keeps it (Codex release review 64).
	let chosenHub = $state(untrack(() => hubID));
	$effect(() => {
		chosenHub = hubID;
	});
	const hub = $derived(chosenHub ? `&hub=${encodeURIComponent(chosenHub)}` : '');
	const manager = $derived(data.canManage);
	// An employee's requests tab: once a workspace of theirs holds writes for approval (LINE's always do), or when opened.
	const requests = $derived(manager || view === 'approvals' || data.hubs.some((item) => hubAsksApproval(item, data.connections)));
	const tabs = $derived([
		...(requests ? [{ id: 'approvals', label: manager ? term('waitingApproval', t) : term('myRequests', t), href: '/app?view=approvals', count: manager ? pendingApprovals : 0 }] : []),
		{ id: 'executions', label: term('usageTab', t), href: `/app?view=executions${hub}` },
		{ id: 'audit', label: term('settingsTab', t), href: `/app?view=audit${hub}` }
	]);
</script>

<PageHeader
	frame
	title={term('history', t)}
	subtitle={manager ? t('คำขอที่รออนุมัติ การใช้งาน และการตั้งค่าที่เปลี่ยน', 'Requests waiting, usage and changed settings.') : t('คำขอและการใช้งานของคุณ', 'Your requests and usage.')}
/>
<PageTabs {tabs} current={view} label={term('history', t)} />
{#if view === 'approvals'}<Approvals {data} onchanged={onapprovalschanged} />
{:else if view === 'executions'}<Audit {data} {hubID} mode="executions" showModeTabs={false} onhubchange={(id) => (chosenHub = id)} />
{:else if view === 'audit'}<Audit {data} {hubID} mode="administration" showModeTabs={false} onhubchange={(id) => (chosenHub = id)} />
{/if}
