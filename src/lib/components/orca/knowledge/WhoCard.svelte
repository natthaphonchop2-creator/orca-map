<script lang="ts">
	import { Briefcase, User, Users } from '@lucide/svelte';
	import { audiencePeople } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import type { OrcaHub, OrcaMember } from '$lib/services/orca';
	import type { LibraryDepartment, LibraryItem } from '$lib/services/orca-library';

	// "ใครใช้ได้" beside an item (proposal §3.6 screen 4): to its owner, whose
	// AI can use it and through what; to anyone else, only that its owner
	// chooses. A live audience ("ทุกคน (อัปเดตอัตโนมัติ)") follows the workspace.
	let {
		hub,
		item,
		members,
		departments,
		currentUserID
	}: {
		hub: Pick<OrcaHub, 'status'>;
		item: LibraryItem;
		/** The workspace's members, as the library lists them. */
		members: OrcaMember[];
		departments: LibraryDepartment[];
		currentUserID: string;
	} = $props();
	const live = $derived(item.audienceMode === 'everyone_live');
	const people = $derived([...audiencePeople(item, departments, members.map((member) => member.id))]);
	const ordered = $derived([item.ownerID, ...people.filter((id) => id !== item.ownerID)]);

	function personName(id: string) {
		if (id === currentUserID) return t('คุณ', 'You');
		const member = members.find((entry) => entry.id === id);
		return member ? member.displayName || member.email : t('สมาชิกพื้นที่ทำงาน', 'Workspace member');
	}
	function initial(id: string) {
		const member = members.find((entry) => entry.id === id);
		const name = member ? member.displayName || member.email : personName(id);
		return [...name.trim()].find((c) => /[\p{L}\p{N}]/u.test(c))?.toLocaleUpperCase() ?? '•';
	}
	function departmentName(id: string) {
		return departments.find((entry) => entry.unitID === id)?.name || t('แผนก', 'Department');
	}
</script>

<section class="kd-card who">
	<h2>{t('ใครใช้ได้', 'Who can use it')}</h2>
	{#if !item.canEdit}
		<p class="kd-hint">{item.kind === 'file' ? t('เจ้าของไฟล์เป็นคนเลือกว่าใครใช้ได้', 'Its owner chooses who can use it') : t('ผู้เขียนเป็นคนเลือกว่าใครใช้ได้', 'Its author chooses who can use it')}</p>
	{:else}
		<div class="live" class:off={item.status !== 'published' || hub.status !== 'active'}>
			<div class="avs" aria-hidden="true">
				{#each ordered.slice(0, 4) as id (id)}<span class:me={id === currentUserID}>{initial(id)}</span>{/each}
				{#if ordered.length > 4}<span class="more-n">+{ordered.length - 4}</span>{/if}
			</div>
			<p>
				{#if item.status === 'published' && hub.status !== 'active'}{t(`AI ของ ${people.length} คนจะใช้ได้เมื่อเปิดใช้งานพื้นที่ทำงานนี้`, `${people.length} people’s AI can use it once this workspace is active`)}
				{:else if item.status === 'published'}{t('AI ของ', 'The AI of')} <b>{t(`${people.length} คน`, `${people.length} people`)}</b>{t('ใช้ได้ตอนนี้', ' can use it now')}
				{:else if item.status === 'draft'}{t(`ฉบับร่าง เห็นแค่คุณ เผยแพร่แล้ว AI ของ ${people.length} คนจะใช้ได้`, `A draft only you see. Once published, ${people.length} people’s AI can use it`)}
				{:else}{t('จัดเก็บแล้ว AI ไม่ใช้เรื่องนี้', 'Archived. AI does not use it')}{/if}
			</p>
		</div>
		{#if live}
			<ul class="kd-who">
				<li><Users size={14} aria-hidden="true" />{t('ทุกคนในพื้นที่ทำงานนี้', 'Everyone in this workspace')}<small>{t('อัปเดตอัตโนมัติ', 'Updates itself')}</small></li>
			</ul>
		{:else if item.unitIDs.length || item.memberIDs.length}
			<ul class="kd-who">
				{#each item.unitIDs as id (id)}<li><Briefcase size={14} aria-hidden="true" />{departmentName(id)}<small>{t(`${departments.find((entry) => entry.unitID === id)?.memberIDs.length ?? 0} คน`, `${departments.find((entry) => entry.unitID === id)?.memberIDs.length ?? 0} people`)}</small></li>{/each}
				{#each item.memberIDs as id (id)}<li><User size={14} aria-hidden="true" />{personName(id)}</li>{/each}
			</ul>
		{:else}
			<p class="kd-hint">{t('เฉพาะคุณ', 'Only you')}</p>
		{/if}
	{/if}
</section>

<style>
	.kd-card {
		padding: 20px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.kd-card h2 {
		margin: 0 0 10px;
		font-size: 15px;
		font-weight: 700;
	}
	.kd-hint {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.kd-who {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.kd-who li {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--orca-text-2);
		font-size: 14px;
	}
	.kd-who :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.kd-who small {
		margin-left: auto;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.live {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
		padding: 12px 14px;
		border: 1px solid var(--orca-ok-line);
		border-radius: 10px;
		background: var(--orca-ok-bg);
	}
	.live.off {
		border-color: var(--orca-line);
		background: var(--orca-surface-2);
	}
	.live p {
		margin: 0;
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.45;
	}
	.avs {
		display: flex;
		flex: none;
		padding-left: 8px;
	}
	.avs span {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		margin-left: -8px;
		border: 2px solid var(--orca-surface);
		border-radius: 50%;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 11px;
		font-weight: 700;
	}
	.avs span.me {
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.avs span.more-n {
		background: var(--orca-ok);
		color: var(--orca-on-ink);
		font-size: 10.5px;
	}
	@media (max-width: 720px) {
		.kd-card {
			padding: 18px 16px;
		}
	}
</style>
