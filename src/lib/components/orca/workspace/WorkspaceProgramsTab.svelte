<script lang="ts">
	import { connectionReady } from '$lib/orca/activation';
	import { gatewaySources } from '$lib/orca/gateway-sources';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import { toolCopy } from '$lib/orca/program-tools';
	import { HubConflictError, allowedTools, approvalTurnsOn, finishProgramHref, programsPatch, programsSavePatch, readOnlyToolNames, requestedProgram, saveHubPatch, sourcesChangeData } from '$lib/orca/workspace-edit';
	import type { OrcaBootstrap, OrcaHub } from '$lib/services/orca';
	import { hubWriteService, workspaceWriteError } from '$lib/services/orca-workspaces';
	import { ChevronDown, Info, Plus, ShieldCheck } from '@lucide/svelte';
	import { onDestroy, untrack } from 'svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import ProgramToggleCard from './ProgramToggleCard.svelte';
	import SaveBar from './SaveBar.svelte';
	import ToolNarrowSheet from './ToolNarrowSheet.svelte';

	// โปรแกรม: turn programs on or off and change what AI can do in each, in
	// place. Changes wait for one บันทึก, made on top of the workspace as saved
	// now (critique 2).
	let {
		data,
		hub,
		canEdit,
		onchanged,
		ondirty,
		addConnectionID = ''
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		canEdit: boolean;
		onchanged: () => Promise<void>;
		/** Unsaved changes here, so the workspace asks before they are lost. */
		ondirty?: (dirty: boolean) => void;
		/** &add=: a program just connected (เพิ่มโปรแกรม step 4), turned on here and waiting for บันทึก. */
		addConnectionID?: string;
	} = $props();
	const adding = untrack(() => (canEdit ? requestedProgram(data.connections, addConnectionID) : { state: 'none' as const }));
	const addingName = adding.state === 'ready' || adding.state === 'unready' ? adding.connection.name : '';
	const addingOn = untrack(() => adding.state === 'ready' && !gatewaySources(hub).some((source) => source.connectionID === adding.connection.id));
	/** connectionID → tools, or null to turn it off; only what was touched. */
	let changes = $state<Record<string, string[] | null>>(
		untrack(() => (adding.state === 'ready' && addingOn ? { [adding.connection.id]: allowedTools(adding.connection).map((tool) => tool.name) } : {}))
	);
	let busy = $state(false);
	let error = $state('');
	let conflict = $state(false);
	let narrowID = $state('');
	let narrowOpen = $state(false);

	const saved = $derived(gatewaySources(hub));
	const current = $derived(programsPatch(hub, changes).sources ?? []);
	const toolsFor = (id: string) => current.find((source) => source.connectionID === id)?.toolNames;
	const dirty = $derived(Object.keys(changes).length > 0);
	$effect(() => ondirty?.(dirty || busy));
	onDestroy(() => ondirty?.(false));
	// Editors see every program ready to use plus the ones already here; others see what is on.
	const shown = $derived(
		canEdit
			? data.connections.filter((item) => !item.archivedAt && !item.deletedAt && (connectionReady(item) || saved.some((source) => source.connectionID === item.id)))
			: data.connections.filter((item) => saved.some((source) => source.connectionID === item.id))
	);
	// Still here, but deleted or archived since: offered for removal, since no
	// card shows them (Codex release review 66).
	const missing = $derived(
		saved.filter((source) => {
			const item = data.connections.find((connection) => connection.id === source.connectionID);
			return !item || !!item.archivedAt || !!item.deletedAt;
		})
	);
	const narrowConnection = $derived(data.connections.find((item) => item.id === narrowID));
	// The owner's safety default: the first change action here turns approval on (shown before บันทึก).
	const approvalOn = $derived(approvalTurnsOn(hub, current, data.connections));
	/** What a change action added now does: wait for approval unless this workspace already runs changes at once. */
	const changesWait = $derived(hub.writeMode === 'approval' || !sourcesChangeData(saved, data.connections));

	function setProgram(id: string, tools: string[] | null) {
		const before = saved.find((source) => source.connectionID === id)?.toolNames ?? null;
		const next = { ...changes };
		const same = tools === null ? before === null : before !== null && before.length === tools.length && before.every((name, index) => name === tools[index]);
		if (same) delete next[id];
		else next[id] = tools;
		changes = next;
		error = '';
		conflict = false;
	}
	function toggle(id: string) {
		if (busy) return;
		if (toolsFor(id)) setProgram(id, null);
		else setProgram(id, allowedTools(data.connections.find((item) => item.id === id)).map((tool) => tool.name));
	}
	function cancel() {
		changes = {};
		error = '';
		conflict = false;
	}
	async function save() {
		if (busy || !dirty) return;
		if (hub.status === 'active' && !current.length) {
			error = t('พื้นที่ที่เปิดใช้งานต้องมีอย่างน้อย 1 โปรแกรม หยุดชั่วคราวในแท็บ “ตั้งค่า” ก่อนถ้าจะปิดทั้งหมด', 'An active workspace needs at least one program. Pause it under “Settings” first to turn them all off.');
			return;
		}
		busy = true;
		error = '';
		const pending = $state.snapshot(changes) as Record<string, string[] | null>;
		try {
			let approval = false;
			await saveHubPatch(
				hub.id,
				(fresh) => {
					const patch = programsSavePatch(fresh, pending, data.connections);
					approval = patch.writeMode === 'approval';
					return patch;
				},
				hubWriteService
			);
			showToast(approval ? t('บันทึกโปรแกรมแล้ว · งานที่สร้างหรือแก้ข้อมูลจะรอผู้ดูแลอนุมัติก่อน', 'Programs saved · changes to data now wait for an admin to approve') : t('บันทึกโปรแกรมแล้ว', 'Programs saved'));
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

<section class="pg" aria-labelledby="pg-title">
	<header class="pg-head">
		<div>
			<h2 id="pg-title">{t('โปรแกรมที่ใช้ได้', 'Programs')}</h2>
			<p>{canEdit ? t('AI ในพื้นที่นี้ใช้ได้เฉพาะโปรแกรมที่เปิดไว้ กด ปรับ เพื่อเลือกสิ่งที่ AI ทำได้', 'AI here uses only the programs turned on. Choose Adjust to pick what AI can do.') : t('AI ในพื้นที่นี้ใช้ได้เฉพาะโปรแกรมเหล่านี้', 'AI here uses only these programs.')}</p>
		</div>
	</header>
	{#if adding.state === 'unready'}
		<p class="pg-notice" role="status"><Info size={15} aria-hidden="true" /><span>{t(`${addingName} ยังเลือกสิ่งที่ AI ทำได้ไม่เสร็จ จึงยังเปิดในพื้นที่นี้ไม่ได้`, `${addingName} isn't finished yet, so it can't be turned on here.`)} <a href={localeHref(finishProgramHref(addConnectionID))}>{t('ตั้งค่าโปรแกรมต่อ', 'Finish the program')}</a></span></p>
	{:else if addingOn && dirty}
		<p class="pg-notice ok" role="status"><Info size={15} aria-hidden="true" /><span>{t(`เปิด ${addingName} ไว้ให้แล้ว กด บันทึก เพื่อเพิ่มลงพื้นที่นี้`, `${addingName} is turned on. Choose Save to add it here.`)}</span></p>
	{/if}
	{#if approvalOn && dirty}
		<p class="pg-notice approval" role="status"><ShieldCheck size={15} aria-hidden="true" /><span>{t('AI จะสร้างหรือแก้ข้อมูลในพื้นที่นี้ได้ เมื่อกด บันทึก ORCA จะตั้งให้ผู้ดูแลอนุมัติก่อนทุกครั้ง เปลี่ยนได้ในแท็บ “ตั้งค่า”', 'AI will be able to create or change data here. When you save, ORCA makes every change wait for an admin to approve. You can change this under “Settings”.')}</span></p>
	{/if}
	{#if shown.length || canEdit}
		<div class="pg-grid">
			{#each shown as connection (connection.id)}
				<ProgramToggleCard
					{connection}
					on={!!toolsFor(connection.id)}
					toolNames={toolsFor(connection.id) ?? []}
					disabled={busy}
					problem={toolsFor(connection.id) && !connectionReady(connection) ? t('ใช้ไม่ได้ตอนนี้ ตรวจที่หน้าโปรแกรม', "Unavailable; check the program's page") : ''}
					ontoggle={canEdit ? () => toggle(connection.id) : undefined}
					onadjust={canEdit && connectionReady(connection) ? () => { narrowID = connection.id; narrowOpen = true; } : undefined}
				/>
			{/each}
			{#if canEdit}
				<a class="pg-add" href={localeHref('/app?view=add-program')}>
					<span class="pg-add-plus" aria-hidden="true"><Plus size={16} strokeWidth={2.2} /></span>
					<b>{t('เชื่อมโปรแกรมใหม่', 'Connect a new program')}</b>
					<span>{t('แล้วกลับมาเปิดใช้ที่นี่', 'Then turn it on here.')}</span>
				</a>
			{/if}
		</div>
	{:else}<p class="pg-empty">{t('ยังไม่ได้เปิดโปรแกรมในพื้นที่นี้', 'No programs are on here yet.')}</p>{/if}
	{#if missing.length && canEdit}
		{@const gone = missing.filter((source) => changes[source.connectionID] !== null)}
		{#if gone.length}<p class="pg-missing">{t(`มี ${gone.length} โปรแกรมที่ถูกลบหรือจัดเก็บไปแล้วแต่ยังอยู่ในพื้นที่นี้`, `${gone.length} removed or archived program(s) are still listed here.`)} <button type="button" class="k-link-button" disabled={busy} onclick={() => gone.forEach((source) => setProgram(source.connectionID, null))}>{t('เอาออก', 'Remove')}</button></p>{/if}
	{/if}

	{#if saved.length}
		<h3 class="pg-list-title">{t('สิ่งที่ AI ทำได้ในพื้นที่นี้', 'What AI can do here')}</h3>
		<div class="pg-lists">
			{#each saved as source (source.connectionID)}
				{@const connection = data.connections.find((item) => item.id === source.connectionID)}
				{@const reads = readOnlyToolNames(connection)}
				<details class="pg-list">
					<summary><span>{connection?.name ?? t('โปรแกรมที่ถูกลบ', 'Removed program')} <em>({source.toolNames.length})</em></span><ChevronDown size={16} aria-hidden="true" /></summary>
					<ul>
						{#each source.toolNames as name (name)}
							{@const tool = connection?.tools.find((item) => item.name === name) ?? { name, inputSchema: {} }}
							{@const label = toolCopy(tool, orcaLocale.value === 'en' ? 'en' : 'th')}
							<li>
								<span class="pg-tool"><strong>{label.label}</strong>{#if label.description && label.description !== label.label}<small>{label.description}</small>{/if}</span>
								<span class="pg-tag" class:change={!reads.includes(name)}>{reads.includes(name) ? t('ดูข้อมูล', 'View') : t('สร้าง / แก้ไข / ลบ', 'Create / change')}</span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		</div>
	{/if}
</section>

{#if dirty || error}
	<SaveBar
		summary={approvalOn
			? t(`แก้โปรแกรม ${Object.keys(changes).length} รายการ · จะรอผู้ดูแลอนุมัติก่อนแก้ข้อมูล`, `${Object.keys(changes).length} program change(s) · changes will wait for approval`)
			: t(`แก้โปรแกรม ${Object.keys(changes).length} รายการ ยังไม่บันทึก`, `${Object.keys(changes).length} program change(s) not saved`)}
		{busy}
		{error}
		{conflict}
		onsave={save}
		oncancel={cancel}
		onreload={reload}
	/>
{/if}

<ToolNarrowSheet bind:open={narrowOpen} connection={narrowConnection} selected={toolsFor(narrowID) ?? []} approval={changesWait} onapply={(tools) => setProgram(narrowID, tools)} />

<style>
	.pg-head h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 17px;
		font-weight: 700;
	}
	.pg-head p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.55;
	}
	.pg-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		margin-top: 16px;
	}
	.pg-add {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 124px;
		padding: 16px;
		border: 1.5px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		text-align: center;
		text-decoration: none;
	}
	.pg-add:hover {
		background: var(--orca-hover);
	}
	.pg-add-plus {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--orca-line);
		border-radius: 50%;
		background: var(--orca-surface);
	}
	.pg-add b {
		font-size: 14.5px;
	}
	.pg-add span:last-child {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.pg-notice {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 16px;
		padding: 10px 12px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.55;
	}
	.pg-notice.ok {
		border-color: var(--orca-line);
		background: var(--orca-surface-2);
	}
	.pg-notice :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--orca-warn);
	}
	.pg-head + .pg-notice {
		margin-top: 14px;
	}
	.pg-notice.approval :global(svg) {
		color: var(--orca-ok);
	}
	.pg-notice.approval {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
	}
	.pg-notice.ok :global(svg) {
		color: var(--orca-text-2);
	}
	.pg-notice a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.pg-empty,
	.pg-missing {
		margin: 14px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.pg-list-title {
		margin: 32px 0 10px;
		color: var(--orca-ink);
		font-size: 15.5px;
		font-weight: 700;
	}
	.pg-lists {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.pg-list {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.pg-list summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 13px 16px;
		color: var(--orca-ink);
		font-size: 14.5px;
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}
	.pg-list summary::-webkit-details-marker {
		display: none;
	}
	.pg-list summary em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 400;
	}
	.pg-list[open] summary :global(svg) {
		transform: rotate(180deg);
	}
	.pg-list ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pg-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 11px 16px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.pg-tool {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.pg-tool strong {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
	}
	.pg-tool small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.pg-tag {
		flex: none;
		padding: 2px 9px;
		border: 1px solid var(--orca-ok-line);
		border-radius: 999px;
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.pg-tag.change {
		border-color: var(--orca-line);
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	@media (max-width: 1100px) {
		.pg-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 720px) {
		.pg-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.pg-list li {
			flex-direction: column;
			align-items: flex-start;
			gap: 6px;
		}
	}
</style>
