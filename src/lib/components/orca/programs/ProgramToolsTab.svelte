<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { presetFor, programSaveInput, saveProblem, savedSelection, type AccessPreset } from '$lib/orca/program-tools';
	import { orcaError, type OrcaConnection } from '$lib/services/orca';
	import { ProgramService, programSaveError, type ProgramTool } from '$lib/services/orca-programs';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import ProgramToolsEditor from './ProgramToolsEditor.svelte';

	// Program detail › สิ่งที่ AI ทำได้: the step-3 editor in place. The list comes
	// fresh from the program (the admin's own account); when it can't, the saved
	// list stays readable and nothing can change until the account works again.
	let {
		connection,
		programName,
		onchanged
	}: { connection: OrcaConnection; programName: string; onchanged: () => Promise<void> } = $props();

	let tools = $state.raw<ProgramTool[]>([]);
	let loading = $state(true);
	let failed = $state('');
	let selected = $state<string[]>([]);
	let preset = $state<AccessPreset>('read');
	let name = $state(untrack(() => connection.name));
	let note = $state(untrack(() => connection.scopeNote));
	let saving = $state(false);
	let error = $state('');
	let alive = true;
	let request = 0;
	// The draft is made on the program as it was when the list loaded (Codex
	// release review 64): a save sends that version, so a newer program
	// (someone else saved, then this page refreshed) is refused, never
	// overwritten; "คืนค่าเดิม" takes the newer one. An untouched draft follows
	// a newer program by itself.
	let baseVersion = untrack(() => connection.version);
	let baseline = '';
	const draftKey = () => JSON.stringify([name, note, [...selected].sort()]);
	// What this tab's last save returned: newer than the page's copy while the
	// page's refresh has not brought it (it failed), so "คืนค่าเดิม" and later
	// saves start from it, never from the older copy (Codex release review 68, 69).
	type Saved = Pick<OrcaConnection, 'toolNames' | 'name' | 'scopeNote' | 'version'>;
	let acknowledged: Saved | undefined;
	const newest = (): Saved => (acknowledged && acknowledged.version > connection.version ? acknowledged : connection);

	function reset(list: ProgramTool[], from: Saved = newest()) {
		selected = savedSelection(list, from.toolNames);
		preset = presetFor(selected, list);
		name = from.name;
		note = from.scopeNote;
		error = '';
		baseVersion = from.version;
		baseline = draftKey();
	}
	$effect(() => {
		const version = connection.version;
		untrack(() => {
			if (version !== baseVersion && !loading && !saving && draftKey() === baseline) reset(tools);
		});
	});
	async function load() {
		const current = ++request;
		loading = true;
		failed = '';
		try {
			const found = await ProgramService.discover(connection.mcpID);
			if (!alive || current !== request) return;
			if (!found.length) throw new Error(t(`${programName} ไม่ได้ส่งรายการกลับมา`, `${programName} returned nothing.`));
			tools = found;
			reset(found);
		} catch (cause) {
			if (!alive || current !== request) return;
			failed = orcaError(cause);
			// The saved list, readable while the account is being fixed.
			tools = connection.tools as ProgramTool[];
			reset(tools);
		} finally {
			if (alive && current === request) loading = false;
		}
	}
	onMount(() => void load());
	onDestroy(() => {
		alive = false;
		request++;
	});

	async function save() {
		if (saving || failed) return;
		if (saveProblem({ name, selected })) return;
		saving = true;
		error = '';
		try {
			const result = await ProgramService.save(programSaveInput({ name, note, mcpID: connection.mcpID, selected, tools, existing: { ...connection, version: baseVersion } }), connection.id);
			if (!alive) return;
			showToast(t(`บันทึกแล้ว · AI ทำได้ ${selected.length} อย่างใน ${programName}`, `Saved · AI can do ${selected.length} things in ${programName}`));
			await onchanged();
			// The saved program, as it now is: the page's copy once its refresh
			// brought it, else what the save returned (newest), so a failed refresh
			// never shows the older program or leaves its version (Codex release review 68).
			acknowledged = result;
			if (alive) reset(tools);
		} catch (cause) {
			if (alive) error = programSaveError(cause);
		} finally {
			if (alive) saving = false;
		}
	}
</script>

{#if loading}
	<p class="tools-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t(`กำลังโหลดรายการล่าสุดจาก ${programName}…`, `Loading the latest list from ${programName}…`)}</p>
{:else}
	{#if failed}
		<div class="tools-retry">
			<button type="button" class="k-button small" onclick={load}>{t('โหลดรายการอีกครั้ง', 'Load the list again')}</button>
		</div>
	{/if}
	<ProgramToolsEditor
		{tools}
		{programName}
		mcpID={connection.mcpID}
		bind:selected
		bind:preset
		bind:name
		bind:note
		{saving}
		{error}
		locked={failed
			? t(`โหลดรายการล่าสุดจาก ${programName} ไม่ได้ ลงชื่อเข้าใช้ ${programName} ที่แท็บภาพรวม แล้วโหลดรายการอีกครั้ง`, `Couldn't load the latest list from ${programName}. Sign in to ${programName} on Overview, then load the list again.`)
			: ''}
		saveLabel={(count) => t(`บันทึก · AI ทำได้ ${count} อย่าง`, `Save · ${count} ${count === 1 ? 'thing' : 'things'}`)}
		backLabel={t('คืนค่าเดิม', 'Undo changes')}
		onback={() => reset(tools)}
		onsave={save}
	/>
{/if}

<style>
	.tools-loading {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		padding: 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
	}
	.tools-retry {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 12px;
	}
</style>
