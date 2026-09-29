<script lang="ts">
	import { gatewayMemberIDs } from '$lib/orca/gateway-sources';
	import { t } from '$lib/orca/locale.svelte';
	import { HubConflictError, departmentsPatch, membersPatch, saveHubPatch } from '$lib/orca/workspace-edit';
	import { OrcaLibraryService, type LibraryDepartment } from '$lib/services/orca-library';
	import { memberName, memberRole, type OrcaBootstrap, type OrcaHub } from '$lib/services/orca';
	import { hubWriteService, workspaceWriteError } from '$lib/services/orca-workspaces';
	import { onMount, untrack } from 'svelte';
	import { personInitial } from '../ui/person-picker';
	import { showToast } from '../ui/toast-store.svelte';
	import AudiencePicker from './AudiencePicker.svelte';
	import SaveBar from './SaveBar.svelte';

	// คน: add or remove people and departments in place (one บันทึก), then the
	// people who can use the workspace now and why.
	let {
		data,
		hub,
		canEdit,
		onchanged
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		canEdit: boolean;
		onchanged: () => Promise<void>;
	} = $props();
	let memberIDs = $state<string[]>(untrack(() => [...(hub.memberIDs ?? [])]));
	let accessUnitIDs = $state<string[]>(untrack(() => [...(hub.accessUnitIDs ?? [])]));
	let departments = $state<LibraryDepartment[]>([]);
	let busy = $state(false);
	let error = $state('');
	let conflict = $state(false);

	const savedMembers = $derived(hub.memberIDs ?? []);
	const savedUnits = $derived(hub.accessUnitIDs ?? []);
	const minus = (a: readonly string[], b: readonly string[]) => a.filter((id) => !b.includes(id));
	const change = $derived({
		addMembers: minus(memberIDs, savedMembers),
		removeMembers: minus(savedMembers, memberIDs),
		addUnits: minus(accessUnitIDs, savedUnits),
		removeUnits: minus(savedUnits, accessUnitIDs)
	});
	const changeCount = $derived(change.addMembers.length + change.removeMembers.length + change.addUnits.length + change.removeUnits.length);
	const counts = $derived(Object.fromEntries(departments.map((item) => [item.unitID, item.memberIDs.length])));
	const effective = $derived(gatewayMemberIDs(hub));
	const known = $derived(effective.flatMap((id) => {
		const member = data.members.find((item) => item.id === id);
		return member ? [member] : [];
	}));
	const unnamed = $derived(effective.length - known.length);
	// Old organisation labels that grant nothing; ones that are also granted departments are not repeated.
	const legacyLabels = $derived(data.units.filter((unit) => (hub.unitIDs ?? []).includes(unit.id) && !(hub.accessUnitIDs ?? []).includes(unit.id)).map((unit) => unit.name));

	function via(id: string): string {
		if (hub.memberIDs?.includes(id)) return t('เพิ่มโดยตรง', 'Added directly');
		const unit = data.units.find((item) => (hub.accessUnitIDs ?? []).includes(item.id) && departments.find((row) => row.unitID === item.id)?.memberIDs.includes(id));
		return unit ? t(`ผ่านแผนก ${unit.name}`, `Through ${unit.name}`) : t('ผ่านแผนก', 'Through a department');
	}

	onMount(() => {
		let cancelled = false;
		if (data.canManage)
			void OrcaLibraryService.departments()
				.then((items) => {
					if (!cancelled) departments = items;
				})
				.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	function edited() {
		error = '';
		conflict = false;
	}
	function cancel() {
		memberIDs = [...savedMembers];
		accessUnitIDs = [...savedUnits];
		edited();
	}
	async function save() {
		if (busy || !changeCount) return;
		if (hub.status === 'active' && !memberIDs.length && !accessUnitIDs.length) {
			error = t('พื้นที่ที่เปิดใช้งานต้องมีคนหรือแผนกอย่างน้อย 1 หยุดชั่วคราวในแท็บ “ตั้งค่า” ก่อนถ้าจะเอาออกทั้งหมด', 'An active workspace needs at least one person or department. Pause it under “Settings” first.');
			return;
		}
		busy = true;
		error = '';
		const pending = $state.snapshot(change);
		try {
			await saveHubPatch(
				hub.id,
				(fresh) => ({
					...membersPatch(fresh, { add: pending.addMembers, remove: pending.removeMembers }),
					...departmentsPatch(fresh, { add: pending.addUnits, remove: pending.removeUnits })
				}),
				hubWriteService
			);
			showToast(t('บันทึกคนที่ใช้ได้แล้ว', 'People saved'));
			await onchanged();
		} catch (cause) {
			conflict = cause instanceof HubConflictError;
			error = workspaceWriteError(cause);
		} finally {
			busy = false;
		}
	}
	async function reload() {
		cancel();
		await onchanged();
	}
</script>

{#if canEdit}
	<section class="pp-edit" aria-labelledby="pp-edit-title">
		<h2 id="pp-edit-title">{t('ใครใช้ได้', 'Who can use it')}</h2>
		<p>{t('เฉพาะคนที่เลือกจะเห็นพื้นที่นี้ใน AI ของตัวเอง', 'Only the people chosen see it in their own AI.')}</p>
		<AudiencePicker
			id="workspace-people"
			members={data.members}
			units={data.units}
			currentUserID={data.currentUserID}
			bind:memberIDs
			bind:accessUnitIDs
			departmentCounts={departments.length ? counts : undefined}
			disabled={busy}
			onchange={edited}
		/>
	</section>
{/if}

<section class="pp-list" aria-labelledby="pp-list-title">
	<header class="pp-list-head">
		<h2 id="pp-list-title">{t(`คนที่ใช้ได้ตอนนี้ ${effective.length} คน`, `People with access now: ${effective.length}`)}</h2>
		{#if legacyLabels.length}<span class="pp-legacy">{t('ป้ายแผนกเดิม (ไม่มีผลกับสิทธิ์):', 'Old labels (no effect on access):')} {legacyLabels.join(', ')}</span>{/if}
	</header>
	{#if known.length}
		<ul>
			{#each known as member (member.id)}
				<li>
					<span class="pp-avatar" class:me={member.id === data.currentUserID} aria-hidden="true">{personInitial(memberName(member))}</span>
					<span class="pp-copy">
						<strong>{memberName(member)}{member.id === data.currentUserID ? t(' (คุณ)', ' (you)') : ''}</strong>
						<small>{memberRole(member.role)}{#if member.email}{' · '}{member.email}{/if}</small>
					</span>
					<span class="pp-via">{via(member.id)}</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if unnamed > 0}<p class="pp-more">{t(`และอีก ${unnamed} คน`, `and ${unnamed} more`)}</p>{/if}
	{#if !effective.length}<p class="pp-more">{t('ยังไม่มีใครใช้พื้นที่นี้ได้', 'Nobody can use this workspace yet.')}</p>{/if}
</section>

{#if changeCount || error}
	<SaveBar
		summary={t(`แก้คนที่ใช้ได้ ${changeCount} รายการ ยังไม่บันทึก`, `${changeCount} change(s) to people not saved`)}
		{busy}
		{error}
		{conflict}
		onsave={save}
		oncancel={cancel}
		onreload={reload}
	/>
{/if}

<style>
	.pp-edit {
		max-width: 760px;
		margin-bottom: 28px;
	}
	.pp-edit h2,
	.pp-list-head h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 17px;
		font-weight: 700;
	}
	.pp-edit > p {
		margin: 4px 0 14px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.pp-list {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.pp-list-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 6px 16px;
		padding: 16px 18px 12px;
	}
	.pp-list-head h2 {
		font-size: 15.5px;
	}
	.pp-legacy {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.pp-list ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pp-list li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 18px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.pp-avatar {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 1px solid var(--orca-line);
		border-radius: 50%;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 13px;
		font-weight: 700;
	}
	.pp-avatar.me {
		border-color: transparent;
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.pp-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.pp-copy strong {
		color: var(--orca-ink);
		font-size: 14.5px;
		font-weight: 600;
	}
	.pp-copy small {
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* A phone: "พนักงาน · email" wraps rather than cutting the email. */
	@media (max-width: 720px) {
		.pp-copy small {
			overflow: visible;
			white-space: normal;
			overflow-wrap: anywhere;
		}
	}
	.pp-via {
		flex: none;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
	}
	.pp-more {
		margin: 0;
		padding: 12px 18px 16px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	@media (max-width: 720px) {
		.pp-list li {
			flex-wrap: wrap;
		}
		.pp-via {
			margin-left: 44px;
		}
	}
</style>
