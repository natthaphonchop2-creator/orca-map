<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import { departmentActive, memberActive } from '$lib/orca/workspace-edit';
	import { memberName, memberRole, type OrcaMember, type OrcaUnit } from '$lib/services/orca';
	import { Check, Plus, TriangleAlert } from '@lucide/svelte';
	import PersonPicker from '../ui/PersonPicker.svelte';

	// "ใครใช้ได้": chosen people as chips ("คุณ" first, removable with a warning),
	// a search for the others, and whole departments, whose later arrivals get
	// access by themselves.
	let {
		members,
		units,
		currentUserID,
		memberIDs = $bindable([]),
		accessUnitIDs = $bindable([]),
		departmentCounts,
		id,
		invalid = false,
		describedBy,
		disabled = false,
		onchange
	}: {
		members: OrcaMember[];
		units: OrcaUnit[];
		currentUserID: string;
		memberIDs?: string[];
		accessUnitIDs?: string[];
		/** People per department, when known (managers). */
		departmentCounts?: Record<string, number>;
		/** The field's id: the error summary jumps here. */
		id: string;
		invalid?: boolean;
		describedBy?: string;
		disabled?: boolean;
		onchange?: () => void;
	} = $props();
	const people = $derived(
		members
			.filter((member) => memberActive(member) || memberIDs.includes(member.id))
			.map((member) => ({
				id: member.id,
				name: memberName(member),
				email: member.email,
				detail: memberActive(member) ? memberRole(member.role) : t('ถูกระงับ', 'Suspended')
			}))
	);
	// A department chosen here and deleted since is no longer in the company's
	// list: it still shows, chosen, so it can be taken off (Codex release review 66).
	const gone = $derived(
		accessUnitIDs
			.filter((unitID) => !units.some((unit) => unit.id === unitID))
			.map((unitID): OrcaUnit => ({ id: unitID, name: t('แผนกที่ถูกลบแล้ว', 'Deleted department'), kind: 'department', parentID: '', version: 0, deletedAt: 'deleted' }))
	);
	const departments = $derived([
		...units.filter((unit) => departmentActive(unit) || accessUnitIDs.includes(unit.id)).filter((unit) => unit.kind === 'department'),
		...gone
	]);
	const meIn = $derived(memberIDs.includes(currentUserID));
	const canAddMe = $derived(memberActive(members.find((member) => member.id === currentUserID)));

	function toggleDepartment(unit: OrcaUnit) {
		if (disabled) return;
		if (accessUnitIDs.includes(unit.id)) accessUnitIDs = accessUnitIDs.filter((item) => item !== unit.id);
		else if (departmentActive(unit)) accessUnitIDs = [...accessUnitIDs, unit.id];
		onchange?.();
	}
	function addMe() {
		if (disabled || meIn) return;
		memberIDs = [currentUserID, ...memberIDs];
		onchange?.();
	}
</script>

<div class="audience" {id} tabindex="-1" class:invalid aria-describedby={describedBy}>
	<PersonPicker
		{people}
		bind:selected={memberIDs}
		youID={currentUserID}
		label={t('คนที่ใช้พื้นที่นี้ได้', 'People who can use this workspace')}
		placeholder={t('เพิ่มคน…', 'Add people…')}
		{disabled}
		onchange={() => onchange?.()}
	/>
	{#if canAddMe}
		{#if meIn}<p class="audience-me"><Check size={15} aria-hidden="true" />{t('คุณอยู่ในพื้นที่นี้แล้ว เอาออกได้ถ้าไม่ต้องใช้เอง', "You're in. Remove yourself if you won't use it.")}</p>
		{:else}<p class="audience-me warn"><TriangleAlert size={15} aria-hidden="true" /><span>{t('คุณจะไม่เห็นพื้นที่นี้ใน AI ของคุณเอง', "You won't see this workspace in your own AI.")}</span><button type="button" class="k-link-button" {disabled} onclick={addMe}>{t('เพิ่มตัวเองกลับ', 'Add me back')}</button></p>{/if}
	{/if}

	{#if departments.length}
		<div class="audience-departments">
			<p class="audience-label" id={`${id}-departments`}>{t('หรือให้ทั้งแผนก', 'Or a whole department')} <span>· {t('คนที่ย้ายเข้าแผนกทีหลังจะใช้ได้เอง', 'people who join it later get access too')}</span></p>
			<div class="audience-chips" role="group" aria-labelledby={`${id}-departments`}>
				{#each departments as unit (unit.id)}
					{@const chosen = accessUnitIDs.includes(unit.id)}
					<button type="button" class="audience-chip" class:chosen aria-pressed={chosen} {disabled} onclick={() => toggleDepartment(unit)}>
						{#if chosen}<Check size={15} aria-hidden="true" />{:else}<Plus size={15} aria-hidden="true" />{/if}{unit.name}
						{#if unit.deletedAt}<em>· {t('เอาออกได้', 'remove it')}</em>{:else if !departmentActive(unit)}<em>· {t('จัดเก็บแล้ว', 'archived')}</em>{:else if departmentCounts?.[unit.id] !== undefined}<em>· {t(`${departmentCounts[unit.id]} คน`, `${departmentCounts[unit.id]}`)}</em>{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* orca-type-remap v1 */
	.audience {
		min-width: 0;
		border-radius: var(--orca-radius);
	}
	.audience:focus {
		outline: none;
	}
	.audience:focus-visible {
		outline: 2px solid var(--orca-focus);
		outline-offset: 4px;
	}
	.audience.invalid :global(.orca-picker-field) {
		border-color: var(--orca-deny);
	}
	.audience-me {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 8px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.audience-me :global(svg) {
		flex: none;
		color: var(--orca-ok);
	}
	.audience-me.warn {
		color: var(--orca-warn);
	}
	.audience-me.warn :global(svg) {
		color: var(--orca-warn);
	}
	.audience-me .k-link-button {
		font-size: 12.5px;
	}
	.audience-departments {
		margin-top: 22px;
	}
	.audience-label {
		margin: 0 0 8px;
		color: var(--orca-text-2);
		font-size: 13px;
		font-weight: 600;
	}
	.audience-label span {
		color: var(--orca-muted);
		font-weight: 400;
	}
	.audience-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.audience-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 14px 7px 11px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 999px;
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.4;
		cursor: pointer;
	}
	.audience-chip:hover:not(:disabled) {
		background: var(--orca-secondary);
	}
	.audience-chip.chosen {
		border-color: var(--orca-chosen);
		box-shadow: inset 0 0 0 1px var(--orca-chosen);
	}
	.audience-chip:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.audience-chip em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 400;
	}
</style>
