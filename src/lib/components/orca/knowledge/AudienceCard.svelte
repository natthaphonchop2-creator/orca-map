<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Briefcase, UserPlus } from '@lucide/svelte';
	import { audienceFor, audiencePeople, audienceWireMode, peopleList, type AudienceMode, type AudienceSelection } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import { memberRole, type OrcaMember } from '$lib/services/orca';
	import type { LibraryDepartment, LibraryKind } from '$lib/services/orca-library';
	import PersonPicker from '../ui/PersonPicker.svelte';

	// "ใครใช้ได้บ้าง" (proposal §3.6 screen 3): plain choices, and the live
	// sentence "AI ของ N คนจะใช้ความรู้นี้ได้". Departments stay live; people
	// picked by name, and a workspace's direct members, are a snapshot. With
	// knowledge library v2, "ทุกคน (อัปเดตอัตโนมัติ)" follows the workspace.
	let {
		kind,
		live = false,
		mode = $bindable('everyone'),
		unitIDs = $bindable([]),
		memberIDs = $bindable([]),
		everyone,
		departments,
		members,
		me,
		disabled = false,
		keepLive = false,
		actions
	}: {
		kind: LibraryKind;
		/** Offer "ทุกคน (อัปเดตอัตโนมัติ)" (the company has knowledge library v2). A live item shows it anyway. */
		live?: boolean;
		/** The item is saved live: it may stay live even while library v2 is off. */
		keepLive?: boolean;
		mode?: AudienceMode;
		/** The departments chosen under "เฉพาะแผนก" (kept when another choice is picked). */
		unitIDs?: string[];
		/** The people chosen under "เฉพาะบางคน". */
		memberIDs?: string[];
		/** What "ทุกคนในพื้นที่ทำงานนี้" sends now. */
		everyone: AudienceSelection;
		departments: LibraryDepartment[];
		/** The workspace's members (the library's list). */
		members: OrcaMember[];
		me: string;
		disabled?: boolean;
		actions?: Snippet;
	} = $props();
	const uid = $props.id();
	// An older item may mix departments and people; that choice shows only for it.
	const showMixed = untrack(() => mode === 'mixed');
	let showNames = $state(false);
	// Offered while library v2 is on, for an item saved live, or while it is the choice
	// made (so the choice stays visible): once library v2 goes off, a choice moved away
	// from it can't come back to it (Codex S7 thirteenth confirmation, twelfth #2).
	const showLive = $derived(live || keepLive || mode === 'everyone_live');
	const selection = $derived(audienceFor(mode, { unitIDs, memberIDs }, everyone));
	const people = $derived([...audiencePeople({ ownerID: me, ...selection, audienceMode: audienceWireMode(mode) }, departments, members.map((member) => member.id))]);
	const ordered = $derived([me, ...people.filter((id) => id !== me)]);
	const others = $derived(members.filter((member) => member.id !== me));
	const pickable = $derived(others.map((member) => ({ id: member.id, name: name(member.id), email: member.email, detail: memberRole(member.role) })));
	const everyoneDepartments = $derived(everyone.unitIDs.map((id) => departments.find((item) => item.unitID === id)).filter((item) => !!item));
	const everyoneLine = $derived(
		everyoneDepartments.length
			? t(
					`ตอนนี้คือ${everyoneDepartments.map((item) => item.name ?? '').join(', ')}${everyone.memberIDs.length ? ` และอีก ${everyone.memberIDs.length} คน` : ''}`,
					`Now ${everyoneDepartments.map((item) => item.name ?? '').join(', ')}${everyone.memberIDs.length ? ` and ${everyone.memberIDs.length} more` : ''}`
				)
			: t(`ตอนนี้มี ${members.length} คนในพื้นที่ทำงานนี้`, `${members.length} people in this workspace now`)
	);
	// With library v2 (`live`) an article is บทความ, beside ไฟล์.
	const noun = $derived(kind === 'template' ? t('คำสั่งนี้', 'this prompt') : kind === 'file' ? t('ไฟล์นี้', 'this file') : live ? t('บทความนี้', 'this article') : t('ความรู้นี้', 'this knowledge'));
	function name(id: string) {
		const member = members.find((item) => item.id === id);
		return member ? member.displayName || member.email : t('สมาชิก', 'Member');
	}
	function initial(id: string) {
		return [...name(id).trim()].find((c) => /[\p{L}\p{N}]/u.test(c))?.toLocaleUpperCase() ?? '•';
	}
	function toggleDepartment(id: string, checked: boolean) {
		unitIDs = checked ? [...new Set([...unitIDs, id])] : unitIDs.filter((item) => item !== id);
	}
	const options = $derived<{ id: AudienceMode; title: string; detail: string }[]>([
		...(showLive || live
			? [{ id: 'everyone_live' as AudienceMode, title: t('ทุกคน (อัปเดตอัตโนมัติ)', 'Everyone (updates itself)'), detail: t('รวมคนที่เข้ามาในพื้นที่นี้ทีหลังด้วย', 'People who join this workspace later included') }]
			: []),
		{ id: 'everyone', title: t('ทุกคนในพื้นที่ทำงานนี้', 'Everyone in this workspace'), detail: everyoneLine },
		{ id: 'departments', title: t('เฉพาะแผนก', 'Only departments'), detail: t('เลือกได้มากกว่า 1 แผนก', 'Choose one or more departments') },
		{ id: 'people', title: t('เฉพาะบางคน', 'Only some people'), detail: t('ค้นหาชื่อแล้วเลือกทีละคน', 'Search and choose people by name') },
		...(showMixed ? [{ id: 'mixed' as AudienceMode, title: t('แผนกและบางคน', 'Departments and people'), detail: t('ตั้งไว้ก่อนหน้านี้', 'As set before') }] : []),
		{ id: 'me', title: t('เฉพาะฉัน', 'Only me'), detail: t('AI ของคุณคนเดียวใช้ได้', 'Only your AI can use it') }
	]);
</script>

{#snippet departmentChoices()}
	{#if departments.length}
		<div class="al">
			{#each departments as department (department.unitID)}
				<label class="al-r check">
					<input type="checkbox" checked={unitIDs.includes(department.unitID)} {disabled} onchange={(event) => toggleDepartment(department.unitID, event.currentTarget.checked)} />
					<span><b>{department.name}</b><small>{t(`${department.memberIDs.length} คนในพื้นที่ทำงานนี้`, `${department.memberIDs.length} in this workspace`)}</small></span>
				</label>
			{/each}
		</div>
	{:else}<p class="hint">{t('บริษัทยังไม่มีแผนก ตั้งได้ที่หน้า ทีม', 'No departments yet. Set them up under Team.')}</p>{/if}
{/snippet}

{#snippet peopleChoices()}
	<div class="picker">
		<PersonPicker people={pickable} bind:selected={memberIDs} label={t('คนที่ใช้ได้', 'People who can use it')} placeholder={t('ค้นหาชื่อ…', 'Search names…')} {disabled} />
		<p class="hint">{t('นับเฉพาะคนที่เลือก คนที่เพิ่มทีหลังต้องมาเลือกเอง', 'Only these people. Anyone added later must be chosen here.')}</p>
	</div>
{/snippet}

<section class="wc" aria-labelledby={`wc-${uid}`}>
	<div class="wc-h">
		<h2 id={`wc-${uid}`}>{t('ใครใช้ได้บ้าง', 'Who can use it')}</h2>
		<p>
			{kind === 'template'
				? t('เลือกว่า AI ของใครจะใช้คำสั่งนี้ได้', 'Choose whose AI can use this prompt')
				: kind === 'file'
					? t('เลือกว่า AI ของใครจะตอบจากไฟล์นี้ได้', 'Choose whose AI can answer from this file')
					: live
						? t('เลือกว่า AI ของใครจะตอบจากบทความนี้ได้', 'Choose whose AI can answer from this article')
						: t('เลือกว่า AI ของใครจะตอบจากความรู้นี้ได้', 'Choose whose AI can answer from this')}
		</p>
	</div>
	<div class="opts" role="radiogroup" aria-labelledby={`wc-${uid}`}>
		{#each options as option (option.id)}
			<div class="opt" class:on={mode === option.id}>
				<label class="opt-l">
					<input class="kn-radio" type="radio" name={`audience-${uid}`} value={option.id} checked={mode === option.id} {disabled} onchange={() => (mode = option.id)} />
					<span class="kn-dot" aria-hidden="true"></span>
					<span class="opt-b"><b>{option.title}</b><small>{option.detail}</small></span>
				</label>
				{#if mode === option.id && option.id === 'everyone' && (everyoneDepartments.length || everyone.memberIDs.length)}
					<div class="al nested">
						{#each everyoneDepartments as department (department.unitID)}
							<div class="al-r">
								<span class="al-ic" aria-hidden="true"><Briefcase size={15} /></span>
								<span><b>{t(`${department.name} · ${department.memberIDs.length} คน`, `${department.name} · ${department.memberIDs.length} people`)}</b><small>{t('อัปเดตเองเมื่อมีคนเข้าหรือออกจากฝ่าย', 'Updates itself as people join or leave')}</small></span>
							</div>
						{/each}
						{#if everyone.memberIDs.length}
							<div class="al-r">
								<span class="al-ic" aria-hidden="true"><UserPlus size={15} /></span>
								<span><b>{peopleList(everyone.memberIDs.map(name), t)}</b><small>{t(`นับเฉพาะ ${everyone.memberIDs.length} คนนี้ คนที่เพิ่มทีหลังต้องมาเลือกเอง`, `Only these ${everyone.memberIDs.length}. Anyone added later must be chosen here.`)}</small></span>
							</div>
						{/if}
					</div>
				{:else if mode === option.id && option.id === 'departments'}
					<div class="nested">{@render departmentChoices()}</div>
				{:else if mode === option.id && option.id === 'people'}
					<div class="nested">{@render peopleChoices()}</div>
				{:else if mode === option.id && option.id === 'mixed'}
					<div class="nested">{@render departmentChoices()}{@render peopleChoices()}</div>
				{/if}
			</div>
		{/each}
	</div>
	<div class="live" aria-live="polite">
		<div class="avs" aria-hidden="true">
			{#each ordered.slice(0, 4) as id (id)}<span class:me={id === me}>{initial(id)}</span>{/each}
			{#if ordered.length > 4}<span class="more-n">+{ordered.length - 4}</span>{/if}
		</div>
		<div class="t">
			<span class="s">{t('AI ของ', 'The AI of')} <b>{t(`${people.length} คน`, `${people.length} ${people.length === 1 ? 'person' : 'people'}`)}</b>{t(`จะใช้${noun}ได้`, ` can use ${noun}`)}</span>
			<button type="button" class="names-toggle" aria-expanded={showNames} onclick={() => (showNames = !showNames)}>{showNames ? t('ซ่อนรายชื่อ', 'Hide names') : t('ดูรายชื่อ', 'See names')}</button>
		</div>
	</div>
	{#if showNames}
		<ul class="names">
			{#each ordered as id (id)}<li>{id === me ? t(`คุณ (${name(id)})`, `You (${name(id)})`) : name(id)}</li>{/each}
		</ul>
	{/if}
	{#if actions}<div class="acts">{@render actions()}</div>{/if}
</section>

<style>
	.wc {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
	}
	.wc-h {
		padding: 20px 20px 4px;
	}
	.wc-h h2 {
		margin: 0 0 3px;
		font-size: 16px;
		font-weight: 700;
	}
	.wc-h p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.opts {
		display: grid;
		gap: 4px;
		padding: 12px 12px 0;
	}
	.opt {
		border: 1px solid transparent;
		border-radius: 10px;
	}
	.opt.on {
		border-color: var(--orca-chosen);
		background: var(--orca-surface);
		box-shadow: 0 0 0 1px var(--orca-chosen);
	}
	.opt-l {
		display: flex;
		gap: 12px;
		padding: 9px 12px;
		cursor: pointer;
	}
	.opt.on .opt-l {
		padding-top: 13px;
	}
	.opt:not(.on) .opt-l:hover {
		border-radius: 10px;
		background: var(--orca-hover);
	}
	.kn-radio {
		position: absolute;
		width: 1px !important;
		height: 1px !important;
		opacity: 0;
		pointer-events: none;
	}
	.kn-dot {
		display: inline-grid;
		flex: none;
		width: 18px;
		height: 18px;
		margin-top: 3px;
		border: 1.5px solid var(--orca-line-strong);
		border-radius: 50%;
	}
	.opt.on .kn-dot {
		border: 5px solid var(--orca-chosen);
	}
	.opt-l:has(.kn-radio:focus-visible) .kn-dot {
		outline: 2px solid var(--orca-focus);
		outline-offset: 2px;
	}
	.opt-b {
		flex: 1;
		min-width: 0;
	}
	.opt-b b {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.opt-b small {
		display: block;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.nested {
		margin: 0 12px 14px 42px;
	}
	.al {
		border: 1px solid var(--orca-line);
		border-radius: 10px;
		background: var(--orca-surface-2);
	}
	.al.nested {
		margin-top: 0;
	}
	.al-r {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
	}
	.al-r + .al-r {
		border-top: 1px solid var(--orca-line-soft);
	}
	.al-r b {
		display: block;
		font-size: 13.5px;
		line-height: 1.4;
	}
	.al-r small {
		display: block;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.al-ic {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--orca-line);
		border-radius: 8px;
		background: var(--orca-surface);
		color: var(--orca-text-2);
	}
	.check {
		cursor: pointer;
	}
	.check input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--orca-control);
	}
	.picker {
		display: grid;
		gap: 8px;
	}
	.hint {
		margin: 8px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.picker .hint {
		margin: 0;
	}
	.live {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 14px 20px 0;
		padding: 12px 14px;
		border: 1px solid var(--orca-ok-line);
		border-radius: 10px;
		background: var(--orca-ok-bg);
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
		border: 2px solid var(--orca-ok-bg);
		border-radius: 50%;
		background: var(--orca-surface);
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
	.t {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		min-width: 0;
	}
	.s {
		color: var(--orca-ink);
		font-size: 14.5px;
		line-height: 1.4;
	}
	.s b {
		font-weight: 700;
	}
	.names-toggle {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--orca-ok);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.names-toggle:hover {
		text-decoration: underline;
	}
	.names {
		margin: 8px 20px 0;
		padding: 10px 14px 10px 30px;
		border: 1px solid var(--orca-line);
		border-radius: 10px;
		background: var(--orca-surface-2);
		color: var(--orca-text-2);
		font-size: 13px;
		line-height: 1.7;
	}
	.acts {
		display: flex;
		gap: 10px;
		margin-top: 16px;
		padding: 16px 20px;
		border-top: 1px solid var(--orca-line-soft);
		border-radius: 0 0 var(--orca-radius-lg) var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	/* The picker's field shows the focus ring; its inner input needs none. */
	.picker :global(.orca-picker-search input:focus-visible) {
		outline: 0;
	}
</style>
