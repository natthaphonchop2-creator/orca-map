<script lang="ts">
	import { connectionReady } from '$lib/orca/activation';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { everyonePlan, everyoneSummary, runEveryone } from '$lib/orca/workspace-edit';
	import { OrcaLibraryService } from '$lib/services/orca-library';
	import { OrcaService, type OrcaBootstrap, type OrcaHub, type OrcaUnit } from '$lib/services/orca';
	import { hubWriteService, workspaceWriteError } from '$lib/services/orca-workspaces';
	import { Building2, CircleAlert, Eye, Info, LoaderCircle, ShieldCheck, Users } from '@lucide/svelte';
	import EmptyState from '../ui/EmptyState.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import StatusPill from '../ui/StatusPill.svelte';

	// view=new&everyone=1&connection=ID (proposal §3.5 screen 1): the first
	// workspace in one click. The summary shows before the click (critique 6):
	// who ("ทุกคน 12 คน") and whether changes wait for approval.
	let {
		data,
		connectionID,
		onsaved
	}: {
		data: OrcaBootstrap;
		connectionID: string;
		onsaved: (hub: OrcaHub) => Promise<void>;
	} = $props();
	const connection = $derived(data.connections.find((item) => item.id === connectionID));
	const ready = $derived(connectionReady(connection));
	const plan = $derived(connection && ready ? everyonePlan(data, connection) : undefined);
	const company = $derived(data.organization.displayName || 'ORCA');
	let step = $state<'' | 'department' | 'members' | 'workspace'>('');
	// A "ทุกคน" made by an attempt that then failed: the retry reuses it.
	let madeDepartment = $state<OrcaUnit>();
	let error = $state('');
	const busy = $derived(step !== '');
	const progress = $derived(
		step === 'department'
			? t('กำลังเตรียมแผนก “ทุกคน”…', 'Preparing the “ทุกคน” department…')
			: step === 'members'
				? t('กำลังเพิ่มทุกคนในบริษัท…', 'Adding everyone in the company…')
				: step === 'workspace'
					? t('กำลังสร้างพื้นที่ทำงาน…', 'Creating the workspace…')
					: ''
	);

	async function go() {
		if (!plan || busy) return;
		error = '';
		let hub: OrcaHub | undefined;
		try {
			const current = $state.snapshot(plan) as NonNullable<typeof plan>;
			const department = current.department ?? ($state.snapshot(madeDepartment) as OrcaUnit | undefined);
			hub = await runEveryone({ ...current, department }, {
				createUnit: (input) => OrcaService.unit(input),
				departments: () => OrcaLibraryService.departments(),
				saveDepartment: (unitID, memberIDs, version) => OrcaLibraryService.saveDepartment(unitID, memberIDs, version),
				createHub: (input) => OrcaService.hub(input),
				hub: hubWriteService,
				onstep: (next) => (step = next),
				ondepartment: (unit) => (madeDepartment = unit)
			});
		} catch (cause) {
			error = workspaceWriteError(cause);
		}
		if (hub) {
			try {
				await onsaved(hub);
			} catch {
				error = t('ให้ทุกคนใช้แล้ว แต่เปิดหน้าพื้นที่ทำงานไม่สำเร็จ ดูได้ที่รายการพื้นที่ทำงาน AI', 'Done, but its page did not open. Find it under AI workspaces.');
			}
		}
		step = '';
	}
</script>

<PageHeader
	back={{ href: localeHref('/app?view=workspaces'), label: t('พื้นที่ทำงาน AI', 'AI workspaces') }}
	title={t('ให้ทุกคนในบริษัทใช้', 'Let everyone use it')}
	subtitle={connection
		? t(`ทุกคนใน ${company} ใช้ ${connection.name} ผ่าน Claude หรือ ChatGPT ของตัวเอง`, `Everyone in ${company} uses ${connection.name} through their own Claude or ChatGPT.`)
		: t('ทุกคนในบริษัทใช้โปรแกรมนี้ผ่าน AI ของตัวเอง', 'Everyone in the company uses this program through their own AI.')}
/>

{#if !connection || !plan}
	<EmptyState
		icon={CircleAlert}
		message={connection
			? t(`${connection.name} ยังเลือกสิ่งที่ AI ทำได้ไม่เสร็จ ตั้งค่าให้เสร็จก่อน แล้วค่อยให้ทุกคนใช้`, `${connection.name} isn't finished yet. Choose what AI can do first.`)
			: t('ไม่พบโปรแกรมนี้ อาจถูกลบหรือจัดเก็บไปแล้ว', 'This program was not found. It may have been removed.')}
		actionLabel={connection ? t('ตั้งค่าโปรแกรมต่อ', 'Finish the program') : t('ไปที่โปรแกรมที่เชื่อม', 'Go to Programs')}
		href={localeHref(connection ? `/app?view=servers&connection=${encodeURIComponent(connection.id)}` : '/app?view=servers')}
	/>
{:else}
	<section class="everyone" aria-labelledby="everyone-title">
		<header class="everyone-head">
			<span class="everyone-logo" aria-hidden="true"><CatalogIcon name={plan.connection.name} size={30} /></span>
			<div class="everyone-head-copy">
				<h2 id="everyone-title">{plan.connection.name}</h2>
				<StatusPill label={everyoneSummary(plan, t)} tone={plan.changesData ? 'warn' : 'ok'} dot />
			</div>
		</header>
		<ul class="everyone-list">
			<li>
				<span class="everyone-icon" aria-hidden="true"><Building2 size={18} /></span>
				<div>
					<strong>{plan.existing ? t(`เพิ่ม ${plan.connection.name} ในพื้นที่ “${plan.name}”`, `Add ${plan.connection.name} to “${plan.name}”`) : t(`สร้างพื้นที่ทำงาน “${plan.name}”`, `Create the workspace “${plan.name}”`)}</strong>
					<p>{t('เปิดใช้ทันที แก้ชื่อหรือตั้งค่าอื่นได้ภายหลังในแท็บ “ตั้งค่า”', 'On right away; rename or change it later under “Settings”.')}</p>
				</div>
			</li>
			<li>
				<span class="everyone-icon" aria-hidden="true"><Users size={18} /></span>
				<div>
					<strong>{plan.memberIDs.includes(data.currentUserID)
						? t(`ทุกคน ${plan.memberIDs.length} คน รวมคุณ ใช้ได้ทันที`, `All ${plan.memberIDs.length} people, you included, can use it now`)
						: t(`ทุกคน ${plan.memberIDs.length} คน ใช้ได้ทันที`, `All ${plan.memberIDs.length} people can use it now`)}</strong>
					<p>{t('ทุกคนอยู่ในแผนก “ทุกคน” คนที่เชิญเข้ามาทีหลังจะอยู่ในแผนกนี้และใช้ได้เอง', 'Everyone is in the “ทุกคน” department; people invited later join it and get access.')}</p>
				</div>
			</li>
			<li>
				<span class="everyone-icon" aria-hidden="true">{#if plan.changesData}<ShieldCheck size={18} />{:else}<Eye size={18} />{/if}</span>
				<div>
					{#if plan.changesData}
						<strong>{t('AI ดูข้อมูลได้ทันที ส่วนการสร้างหรือแก้ข้อมูลต้องอนุมัติก่อน', 'AI reads right away; creating or changing data waits for approval')}</strong>
						<p>{t(`ทุกคำขอที่จะเปลี่ยนข้อมูลใน ${plan.connection.name} จะรอผู้ดูแลกดอนุมัติในหน้าตรวจสอบ`, `Every request that would change ${plan.connection.name} waits in Oversight for an admin.`)}</p>
					{:else}
						<strong>{t(`AI ทำได้ ${plan.toolNames.length} อย่าง อ่านอย่างเดียว`, `AI can do ${plan.toolNames.length} things, read only`)}</strong>
						<p>{t(`ข้อมูลใน ${plan.connection.name} ไม่เปลี่ยน AI แค่ค้นและสรุปให้`, `Nothing in ${plan.connection.name} changes; AI only looks things up.`)}</p>
					{/if}
				</div>
			</li>
		</ul>
		<p class="everyone-note"><Info size={15} aria-hidden="true" />{t(`แต่ละคนต้องมีบัญชี ${plan.connection.name} ของตัวเอง และเข้าสู่ระบบเองเมื่อเริ่มใช้`, `Each person needs their own ${plan.connection.name} account and signs in when they start.`)}</p>
		{#if error}<div class="everyone-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{error}</p></div>{/if}
		<div class="everyone-actions">
			<button type="button" class="everyone-go" disabled={busy} aria-describedby="everyone-progress" onclick={go}>{#if busy}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{t('ให้ทุกคนในบริษัทใช้', 'Let everyone use it')}</button>
			<a class="everyone-custom" href={localeHref(`/app?view=new&connection=${encodeURIComponent(plan.connection.id)}`)}>{t('ตั้งค่าเอง', 'Set it up myself')}</a>
			<span class="everyone-progress" id="everyone-progress" role="status" aria-live="polite">{progress}</span>
		</div>
	</section>
{/if}

<style>
	.everyone {
		max-width: 720px;
		padding: 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
	}
	.everyone-head {
		display: flex;
		align-items: center;
		gap: 14px;
		padding-bottom: 18px;
		border-bottom: 1px solid var(--orca-line-soft);
	}
	.everyone-logo {
		display: grid;
		flex: none;
		place-items: center;
		width: 48px;
		height: 48px;
		border: 1px solid var(--orca-line);
		border-radius: 12px;
		background: var(--orca-logo-tile);
	}
	.everyone-head-copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
	}
	.everyone-head h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 18px;
		font-weight: 700;
		line-height: 1.35;
	}
	.everyone-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin: 18px 0 0;
		padding: 0;
		list-style: none;
	}
	.everyone-list li {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.everyone-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.everyone-list strong {
		display: block;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.45;
	}
	.everyone-list p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.everyone-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 20px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.everyone-note :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.everyone-error {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 16px;
		padding: 12px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
	}
	.everyone-error :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-deny);
	}
	.everyone-error p {
		margin: 0;
		font-size: 14px;
		line-height: 1.55;
	}
	.everyone-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 18px;
		margin-top: 22px;
	}
	.everyone-go {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 50px;
		padding: 0 24px;
		border: 1px solid transparent;
		border-radius: var(--orca-radius);
		background: var(--orca-citron);
		color: var(--orca-on-citron);
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}
	.everyone-go:hover:not(:disabled) {
		background: var(--orca-citron-hover);
	}
	.everyone-go:disabled {
		cursor: progress;
		opacity: 0.7;
	}
	.everyone-custom {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.everyone-progress {
		flex-basis: 100%;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.everyone-progress:empty {
		display: none;
	}
	@media (max-width: 720px) {
		.everyone {
			padding: 18px 16px;
		}
		.everyone-go {
			flex: 1 1 100%;
		}
	}
</style>
