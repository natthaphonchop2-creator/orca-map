<script lang="ts">
	import { Check, CircleAlert, LoaderCircle, X } from '@lucide/svelte';
	import { catalogSource, type CatalogTool } from '$lib/orca/catalog';
	import { currentCompany } from '$lib/orca/company';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		clearDraft,
		draftKey,
		programCancelHref,
		programCategory,
		programDisplayName,
		programStepHref,
		readDraft,
		uniqueProgramName,
		writeDraft,
		type ProgramStep
	} from '$lib/orca/program-catalog';
	import {
		initialPreset,
		initialSelection,
		programSaveInput,
		readOnlyAvailable,
		saveProblem,
		savedSelection,
		selectableUnder,
		type AccessPreset
	} from '$lib/orca/program-tools';
	import { orcaError, type OrcaBootstrap, type OrcaCandidate, type OrcaConnection } from '$lib/services/orca';
	import { ProgramService, type ProgramTool } from '$lib/services/orca-u4';
	import { onDestroy, onMount, untrack } from 'svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import Stepper from '../ui/Stepper.svelte';
	import ProgramAccount from './ProgramAccount.svelte';
	import ProgramDone from './ProgramDone.svelte';
	import ProgramLogo from './ProgramLogo.svelte';
	import ProgramPicker from './ProgramPicker.svelte';
	import ProgramRequestSheet from './ProgramRequestSheet.svelte';
	import ProgramToolsEditor from './ProgramToolsEditor.svelte';

	// เพิ่มโปรแกรม in four steps: 1 เลือกโปรแกรม · 2 เชื่อมบัญชี · 3 เลือกสิ่งที่ AI
	// ทำได้ · 4 เสร็จ. On the page (`page`) the step and the program live in the
	// address, so a reload or an OAuth popup never loses the place; ticked tools
	// live in sessionStorage. Inside a sheet (`sheet`, the workspace form) the
	// same steps run in place and finish by handing back the saved program.
	let {
		data,
		mode = 'page',
		step: pageStep = 'choose',
		sourceID: pageSource = '',
		connectionID = '',
		returnTo = '',
		address = '/app?view=add-program',
		navigate,
		initialSourceID = '',
		onchanged,
		oncompleted,
		onbusychange
	}: {
		/** The company's data (archived records included). */
		data: OrcaBootstrap;
		mode?: 'page' | 'sheet';
		step?: ProgramStep;
		sourceID?: string;
		connectionID?: string;
		returnTo?: string | null;
		/** The page's address (path and search), for the step links. */
		address?: string;
		navigate?: (href: string) => Promise<void> | void;
		initialSourceID?: string;
		onchanged: () => Promise<void>;
		oncompleted?: (connection: OrcaConnection) => Promise<void> | void;
		onbusychange?: (busy: boolean) => void;
	} = $props();

	let sheetStep = $state<ProgramStep>(untrack(() => (initialSourceID ? 'connect' : 'choose')));
	let sheetSource = $state(untrack(() => initialSourceID));
	const step = $derived(mode === 'page' ? pageStep : sheetStep);
	const sourceID = $derived(mode === 'page' ? pageSource : sheetSource);

	let sources = $state.raw<OrcaCandidate[]>([]);
	let catalogLoading = $state(true);
	let catalogError = $state('');
	let tools = $state.raw<ProgramTool[]>([]);
	let toolsFor = $state('');
	let discovering = $state(false);
	let discoverError = $state('');
	let selected = $state<string[]>([]);
	let preset = $state<AccessPreset>('read');
	let name = $state('');
	let note = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let saved = $state<OrcaConnection>();
	let requestOpen = $state(false);
	let alive = true;
	let discovery = 0;

	const operator = $derived(data.platformOperator === true);
	const source = $derived.by<CatalogTool | undefined>(() => {
		const found = sources.find((item) => item.id === sourceID);
		return found ? catalogSource(found) : undefined;
	});
	const programName = $derived(source ? programDisplayName(source) : '');
	const storage = () => {
		try {
			return window.sessionStorage;
		} catch {
			return undefined;
		}
	};
	const key = $derived(draftKey(currentCompany()));
	const done = $derived(
		connectionID ? (data.connections.find((item) => item.id === connectionID) ?? (saved?.id === connectionID ? saved : undefined)) : undefined
	);
	const steps = $derived([
		{ id: 'choose', label: t('เลือกโปรแกรม', 'Choose a program') },
		{ id: 'connect', label: t('เชื่อมบัญชี', 'Connect the account') },
		{ id: 'tools', label: t('เลือกสิ่งที่ AI ทำได้', 'Choose what AI can do') },
		...(mode === 'page' ? [{ id: 'done', label: t('เสร็จ', 'Done') }] : [])
	]);

	$effect(() => {
		const busy = discovering || saving;
		untrack(() => onbusychange?.(busy));
	});

	async function loadCatalog(refresh = false) {
		catalogLoading = true;
		catalogError = '';
		try {
			const result = await ProgramService.candidates(refresh);
			if (alive) sources = result;
		} catch (cause) {
			if (alive) catalogError = orcaError(cause);
		} finally {
			if (alive) catalogLoading = false;
		}
	}
	onMount(() => {
		void loadCatalog();
	});
	onDestroy(() => {
		alive = false;
		discovery++;
	});

	function href(next: ProgramStep, changes: { source?: string | null; connection?: string | null } = {}) {
		return localeHref(programStepHref(address, next, changes));
	}
	async function go(next: ProgramStep, changes: { source?: string | null; connection?: string | null } = {}) {
		if (mode === 'sheet') {
			if (changes.source !== undefined) sheetSource = changes.source ?? '';
			if (next === 'choose') sheetSource = '';
			sheetStep = next;
			return;
		}
		await navigate?.(href(next, changes));
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
	}

	/** The selection when step 3 opens: this tab's draft for the program, or the read-only start. */
	function applySelection(id: string, found: ProgramTool[]) {
		const draft = readDraft(storage(), key, id);
		const base = uniqueProgramName(
			source ? programDisplayName(source) : id,
			data.connections.filter((item) => !item.archivedAt && !item.deletedAt).map((item) => item.name)
		);
		if (draft) {
			const nextPreset: AccessPreset = draft.preset === 'read' && readOnlyAvailable(found) ? 'read' : 'write';
			preset = nextPreset;
			selected = savedSelection(found, draft.toolNames).filter((tool) => selectableUnder(nextPreset, found.find((item) => item.name === tool)!));
			name = draft.name || base;
			note = draft.note;
		} else {
			preset = initialPreset(found);
			selected = initialSelection(found);
			name = base;
			note = '';
		}
	}

	async function discover(id: string): Promise<boolean> {
		const request = ++discovery;
		discovering = true;
		discoverError = '';
		try {
			const found = await ProgramService.discover(id);
			if (!alive || request !== discovery) return false;
			if (!found.length) {
				discoverError = t(
					`ยังไม่พบสิ่งที่ AI ทำได้ใน ${programName || id} ตรวจว่าบัญชีนี้ใช้งานได้ แล้วลองอีกครั้ง`,
					`${programName || id} offers nothing for AI yet. Check the account works, then try again.`
				);
				return false;
			}
			tools = found;
			toolsFor = id;
			applySelection(id, found);
			return true;
		} catch (cause) {
			if (alive && request === discovery) discoverError = orcaError(cause);
			return false;
		} finally {
			if (alive && request === discovery) discovering = false;
		}
	}

	// Step 2 succeeded: see what AI can do, then move on.
	async function accountReady(id: string) {
		if (id !== sourceID) return;
		if (await discover(id)) await go('tools');
	}

	// Step 3 opened by address (a reload): load the tools again.
	$effect(() => {
		// After the catalog, so the name the team sees starts from the program's name.
		if (step !== 'tools' || !sourceID || !source) return;
		const id = sourceID;
		untrack(() => {
			if (toolsFor !== id && !discovering && !discoverError) void discover(id);
		});
	});

	// Ticked tools, the preset, name and note survive a reload or the OAuth popup.
	$effect(() => {
		if (step !== 'tools' || toolsFor !== sourceID || !sourceID) return;
		const draft = { sourceID, toolNames: [...selected], preset, name, note };
		untrack(() => writeDraft(storage(), key, draft));
	});

	async function save() {
		if (saving || toolsFor !== sourceID) return;
		const problem = saveProblem({ name, selected });
		if (problem) {
			saveError =
				problem === 'name'
					? t('ตั้งชื่อที่ทีมเห็นก่อน', 'Give it a name your team sees.')
					: problem === 'tools'
						? t('ติ๊กอย่างน้อย 1 อย่าง', 'Tick at least one item.')
						: t('เลือกได้สูงสุด 100 อย่าง', 'Choose at most 100 items.');
			return;
		}
		saving = true;
		saveError = '';
		try {
			// Saving again after going back (the browser's Back from step 4) changes the same program, never adds a second one.
			const again = saved && saved.mcpID === sourceID ? saved : undefined;
			const result = await ProgramService.save(programSaveInput({ name, note, mcpID: sourceID, selected, tools, existing: again }), again?.id);
			if (!alive) return;
			clearDraft(storage(), key);
			saved = result;
			await onchanged();
			if (mode === 'sheet') await oncompleted?.(result);
			else await go('done', { connection: result.id });
		} catch (cause) {
			if (alive) saveError = orcaError(cause);
		} finally {
			if (alive) saving = false;
		}
	}

	function pick(id: string, existing?: string) {
		if (existing && mode === 'sheet') {
			const connection = data.connections.find((item) => item.id === existing);
			if (connection) void oncompleted?.(connection);
			return;
		}
		discoverError = '';
		saveError = '';
		void go('connect', { source: id });
	}
	function change() {
		discovery++;
		discovering = false;
		discoverError = '';
		void go('choose', { source: null });
	}
</script>

{#snippet strip(connected: boolean)}
	{#if source}
		{@const category = programCategory(source)}
		<div class="ap-strip">
			<ProgramLogo name={source.name} size={44} />
			<div class="ap-strip-copy">
				<div class="ap-strip-name">{programName}</div>
				<div class="ap-strip-meta">
					{#if connected}<span class="ap-pill ok"><Check size={12} strokeWidth={3} aria-hidden="true" />{t('เชื่อมด้วยบัญชีของคุณแล้ว', 'Connected with your account')}</span>
					{:else if category.th}<span>{t(category.th, category.en)}</span>{/if}
				</div>
			</div>
			<button type="button" class="k-button ap-change" disabled={saving || discovering} onclick={change}>{t('เปลี่ยน', 'Change')}</button>
		</div>
	{/if}
{/snippet}

<div class="ap" class:sheet={mode === 'sheet'}>
	<div class="ap-top">
		<Stepper {steps} current={step} hrefFor={mode === 'page' ? (id) => href(id as ProgramStep) : undefined} label={t('ขั้นตอนเชื่อมโปรแกรม', 'Connect a program: steps')} />
		{#if mode === 'page' && step !== 'done'}
			<a class="k-button quiet ap-cancel" href={localeHref(programCancelHref(returnTo))} onclick={() => clearDraft(storage(), key)}><X size={16} aria-hidden="true" />{t('ยกเลิก', 'Cancel')}</a>
		{/if}
	</div>

	{#if step === 'choose'}
		<ProgramPicker
			{data}
			{sources}
			loading={catalogLoading}
			error={catalogError}
			onretry={() => loadCatalog(true)}
			hrefFor={mode === 'page' ? (id) => href('connect', { source: id }) : undefined}
			onpick={mode === 'sheet' ? pick : undefined}
		/>
	{:else if step === 'done'}
		{#if done}
			{@const logoSource = sources.find((item) => item.id === done.mcpID)}
			<ProgramDone
				connection={done}
				programName={logoSource ? programDisplayName(catalogSource(logoSource)) : done.name}
				logoName={logoSource ? catalogSource(logoSource).name : done.name}
				hubs={data.hubs}
				people={data.members.filter((member) => !member.status || member.status === 'active').length}
				{returnTo}
			/>
		{:else}
			<div class="ap-problem" role="alert">
				<CircleAlert size={20} aria-hidden="true" />
				<div>
					<p>{t('ไม่พบโปรแกรมนี้ อาจถูกลบไปแล้ว', 'This program was not found. It may have been removed.')}</p>
					<a class="k-button" href={localeHref('/app?view=servers')}>{t('ไปที่โปรแกรมที่เชื่อม', 'Go to Programs')}</a>
				</div>
			</div>
		{/if}
	{:else if catalogLoading}
		<p class="ap-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t('กำลังโหลด…', 'Loading…')}</p>
	{:else if !source}
		<div class="ap-problem" role="alert">
			<CircleAlert size={20} aria-hidden="true" />
			<div>
				<p>{catalogError || t('ไม่พบโปรแกรมนี้ในรายการแล้ว เลือกโปรแกรมใหม่', 'This program is no longer listed. Choose again.')}</p>
				<button type="button" class="k-button" onclick={change}>{t('เลือกโปรแกรม', 'Choose a program')}</button>
			</div>
		</div>
	{:else if step === 'connect' && mode === 'sheet' && requestOpen}
		<ProgramRequestSheet bind:open={requestOpen} {data} program={programName} inline />
	{:else if step === 'connect'}
		{#if mode === 'page'}
			<PageHeader
				title={t('เชื่อมบัญชี', 'Connect your account')}
				subtitle={t(`เชื่อมบัญชี ${programName} ของคุณครั้งเดียว แล้ว ORCA จะพาไปเลือกสิ่งที่ AI ทำได้`, `Connect your ${programName} account once; then choose what AI can do.`)}
			/>
		{/if}
		{@render strip(false)}
		{#if discoverError}<p class="ap-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{discoverError}</p>{/if}
		{#key sourceID}
			<ProgramAccount
				{sourceID}
				{programName}
				endpointHost={source.endpointHost}
				{operator}
				pending={discovering ? t(`กำลังดูว่า AI ทำอะไรได้บ้างใน ${programName}…`, `Seeing what AI can do in ${programName}…`) : ''}
				onready={accountReady}
				onrequest={() => (requestOpen = true)}
			/>
		{/key}
		{#if mode === 'page'}<div class="ap-back"><a class="k-button quiet" href={href('choose', { source: null })}>{t('ย้อนกลับ', 'Back')}</a></div>{/if}
	{:else}
		{#if mode === 'page'}
			<PageHeader
				title={t('เลือกสิ่งที่ AI ทำได้', 'What AI can do')}
				subtitle={t(`เลือกว่า AI ของทีมทำอะไรใน ${programName} ได้บ้าง เปลี่ยนภายหลังได้เสมอ`, `Choose what your team's AI can do in ${programName}. You can change it any time.`)}
			/>
		{/if}
		{@render strip(toolsFor === sourceID)}
		{#if toolsFor === sourceID}
			<ProgramToolsEditor
				{tools}
				{programName}
				mcpID={sourceID}
				bind:selected
				bind:preset
				bind:name
				bind:note
				{saving}
				error={saveError}
				backLabel={t('ย้อนกลับ', 'Back')}
				onback={() => go('connect')}
				onsave={save}
			/>
		{:else if discovering}
			<p class="ap-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t(`กำลังดูว่า AI ทำอะไรได้บ้างใน ${programName}…`, `Seeing what AI can do in ${programName}…`)}</p>
		{:else}
			<div class="ap-problem" role="alert">
				<CircleAlert size={20} aria-hidden="true" />
				<div>
					<p>{discoverError || t(`โหลดรายการของ ${programName} ไม่สำเร็จ`, `Could not load ${programName}'s list.`)}</p>
					<div class="ap-problem-actions">
						<button type="button" class="k-button" onclick={() => discover(sourceID)}>{t('ลองอีกครั้ง', 'Try again')}</button>
						<button type="button" class="k-button quiet" onclick={() => go('connect')}>{t('กลับไปเชื่อมบัญชี', 'Back to the account')}</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

{#if mode === 'page'}<ProgramRequestSheet bind:open={requestOpen} {data} program={programName} />{/if}

<style>
	.ap {
		max-width: 1080px;
		min-width: 0;
		color: var(--orca-ink);
	}
	.ap-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
		min-height: 36px;
		margin-bottom: 36px;
	}
	.ap.sheet .ap-top {
		margin-bottom: 24px;
	}
	/* A done step's bar is green, as in the mockup. */
	.ap-top :global(.orca-step.done .orca-step-bar) {
		background: var(--orca-ok);
	}
	.ap-cancel {
		flex: none;
	}
	.ap-strip {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 32px;
		padding: 14px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	.ap-strip-copy {
		flex: 1;
		min-width: 0;
	}
	.ap-strip-name {
		overflow: hidden;
		font-size: 16px;
		font-weight: 700;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ap-strip-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 3px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.ap-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
	}
	.ap-pill.ok {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.ap-change {
		flex: none;
	}
	.ap-loading {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		padding: 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 15px;
	}
	.ap-problem {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 20px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.ap-problem p {
		margin: 0 0 12px;
		color: var(--orca-ink);
		font-size: 14.5px;
	}
	.ap-problem :global(svg) {
		flex: none;
	}
	.ap-problem-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.ap-error {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 16px;
		padding: 10px 12px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 14px;
	}
	.ap-back {
		margin-top: 20px;
	}
	@media (max-width: 720px) {
		.ap-top {
			margin-bottom: 24px;
		}
		.ap-strip {
			margin-bottom: 24px;
			padding: 12px;
		}
	}
</style>
