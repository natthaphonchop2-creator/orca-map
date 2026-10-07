<script lang="ts">
	import { Check, CircleAlert, LoaderCircle, X } from '@lucide/svelte';
	import { catalogSource, type CatalogTool } from '$lib/orca/catalog';
	import { policyStep } from '$lib/orca/company-account';
	import { keepTogether } from '$lib/orca/keep-together';
	import { currentCompany } from '$lib/orca/company';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		clearDraft,
		draftKey,
		programCancelHref,
		programCategory,
		programConnectedHref,
		programDisplayName,
		programReturnHref,
		programStepHref,
		readDraft,
		rememberSavedProgram,
		savedProgramFor,
		savedProgramKey,
		uniqueProgramName,
		writeDraft,
		type ProgramStep
	} from '$lib/orca/program-catalog';
	import {
		autoReviewSelection,
		initialPreset,
		initialSelection,
		presetFor,
		programSaveInput,
		readOnlyAvailable,
		saveProblem,
		savedSelection,
		selectableUnder,
		type AccessPreset
	} from '$lib/orca/program-tools';
	import { OrcaService, orcaError, type OrcaBootstrap, type OrcaCandidate, type OrcaCompanyAccountPolicy, type OrcaConnection } from '$lib/services/orca';
	import { ProgramService, programSaveConflict, programSaveError, type ProgramTool } from '$lib/services/orca-programs';
	import { onDestroy, onMount, untrack } from 'svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import { showToast } from '../ui/toast-store.svelte';
	import CompanyAccountConnect from './CompanyAccountConnect.svelte';
	import ProgramAccount from './ProgramAccount.svelte';
	import ProgramLogo from './ProgramLogo.svelte';
	import ProgramPicker from './ProgramPicker.svelte';
	import ProgramRequestSheet from './ProgramRequestSheet.svelte';
	import ProgramToolsEditor from './ProgramToolsEditor.svelte';

	// เชื่อมโปรแกรม (W0): the catalog dialog picks the program; this page
	// connects it. No stepper and no "done" page. On the page (`page`) the
	// program and its place live in the address, so a reload or an OAuth popup
	// never loses it; ticked tools live in sessionStorage. The connect step
	// holds one choice, whose account AI uses: each person's own (the manager
	// connects theirs now), or บัญชีกลาง, one company account connected once
	// (company accounts design §7), which is then in the address (`account`).
	// Once the account works, the program is saved read-only (the default the
	// owner chose) and the page goes back where it came from; สิ่งที่ AI ทำได้
	// is the program page's tab. Only when nothing is read-only does the page
	// ask what AI may do first. Inside a sheet (`sheet`, the workspace form) the
	// choice of tools stays in place and hands back the saved program.
	let {
		data,
		mode = 'page',
		step: pageStep = 'choose',
		sourceID: pageSource = '',
		programAccountID: pageAccount = '',
		connectionID = '',
		returnTo = '',
		address = '/app?view=add-program',
		navigate,
		initialSourceID = '',
		startCompany = false,
		onchanged,
		oncompleted,
		onbusychange
	}: {
		/** The company's data (archived records included). */
		data: OrcaBootstrap;
		mode?: 'page' | 'sheet';
		step?: ProgramStep;
		sourceID?: string;
		/** The company account steps 3 and 4 use, or "" for each person's own. */
		programAccountID?: string;
		connectionID?: string;
		returnTo?: string | null;
		/** The page's address (path and search), for the step links. */
		address?: string;
		navigate?: (href: string) => Promise<void> | void;
		initialSourceID?: string;
		/** สร้าง › บัญชีกลาง (&as=company): start on บัญชีกลาง where the program allows it. */
		startCompany?: boolean;
		onchanged: () => Promise<void>;
		oncompleted?: (connection: OrcaConnection) => Promise<void> | void;
		onbusychange?: (busy: boolean) => void;
	} = $props();

	let sheetStep = $state<ProgramStep>(untrack(() => (initialSourceID ? 'connect' : 'choose')));
	let sheetSource = $state(untrack(() => initialSourceID));
	let sheetAccount = $state('');
	const step = $derived(mode === 'page' ? pageStep : sheetStep);
	const sourceID = $derived(mode === 'page' ? pageSource : sheetSource);
	const companyAccount = $derived(mode === 'page' ? pageAccount : sheetAccount);
	// Step 2's choice: each person's own account, or บัญชีกลาง.
	let accountMode = $state<'personal' | 'company'>(untrack(() => (pageAccount || startCompany ? 'company' : 'personal')));
	let policy = $state.raw<OrcaCompanyAccountPolicy>();
	let policyFor = $state('');
	const companyAllowed = $derived(policyFor === sourceID && policyStep(policy) !== 'personal-only' && policyStep(policy) !== 'unknown');

	let sources = $state.raw<OrcaCandidate[]>([]);
	let catalogLoading = $state(true);
	let catalogError = $state('');
	let tools = $state.raw<ProgramTool[]>([]);
	let toolsFor = $state('');
	// The company account the tools were read on, or "" for the manager's own.
	let toolsAccount = $state('');
	// The provider address each company account signed in as (CA1b O15): a
	// display hint for the manager's summary before saving, never compared.
	let accountHints = $state.raw<Record<string, string>>({});
	const toolsAccountHint = $derived(toolsAccount ? (accountHints[toolsAccount] ?? '') : '');
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
	const savedKey = $derived(savedProgramKey(currentCompany()));
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

	type StepChanges = { source?: string | null; connection?: string | null; account?: string | null };
	function href(next: ProgramStep, changes: StepChanges = {}) {
		return localeHref(programStepHref(address, next, changes));
	}
	async function go(next: ProgramStep, changes: StepChanges = {}) {
		if (mode === 'sheet') {
			if (changes.source !== undefined) {
				sheetSource = changes.source ?? '';
				if (changes.account === undefined) sheetAccount = '';
			}
			if (changes.account !== undefined) sheetAccount = changes.account ?? '';
			if (next === 'choose') {
				sheetSource = '';
				sheetAccount = '';
			}
			sheetStep = next;
			return;
		}
		await navigate?.(href(next, changes));
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
	}

	/**
	 * The selection when step 3 opens: this tab's draft for the program, else
	 * the program this tab already saved from it (Back from step 4 after a
	 * reload: its saved name, note and ticks, Codex release review 66; when the
	 * program no longer offers any of its ticks, nothing is ticked, to review,
	 * Codex release review 67), else the read-only start.
	 */
	function applySelection(id: string, found: ProgramTool[]) {
		const draft = readDraft(storage(), key, id);
		const already = draft ? undefined : savedProgramFor(storage(), savedKey, id, data.connections);
		const resumed = already ? savedSelection(found, already.toolNames ?? []) : [];
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
		} else if (already) {
			selected = resumed;
			preset = presetFor(selected, found);
			name = already.name || base;
			note = already.scopeNote ?? '';
		} else {
			preset = initialPreset(found);
			selected = initialSelection(found);
			name = base;
			note = '';
		}
	}

	// A company account opened by address (a reload): its address from the
	// managers' list, when the flow has none yet.
	async function readAccountHint(account: string) {
		try {
			const found = (await OrcaService.programAccounts()).find((item) => item.id === account);
			if (alive && found?.accountHint && !(account in accountHints)) accountHints = { ...accountHints, [account]: found.accountHint };
		} catch {
			// Only a hint: the summary goes without it.
		}
	}

	async function discover(id: string, account = companyAccount): Promise<boolean> {
		const request = ++discovery;
		if (account && !(account in accountHints)) void readAccountHint(account);
		discovering = true;
		discoverError = '';
		// What was read before belongs to the earlier reading: a new one, on whichever
		// account, starts clean, so nothing saves on tools read elsewhere (independent W0
		// review). saveError stays: a conflict's notice (rebase) must survive the re-read it
		// starts; the connect step's ready paths clear it themselves.
		tools = [];
		toolsFor = '';
		toolsAccount = '';
		try {
			const found = account ? await ProgramService.discover(id, account) : await ProgramService.discover(id);
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
			toolsAccount = account;
			applySelection(id, found);
			return true;
		} catch (cause) {
			if (alive && request === discovery) discoverError = orcaError(cause);
			return false;
		} finally {
			if (alive && request === discovery) discovering = false;
		}
	}

	/**
	 * The account the connect step last said works ('' for the person's own, or the
	 * company account's id); undefined before any. ลองอีกครั้ง saves only when the
	 * tools were read on exactly this one.
	 */
	let readyAccount = $state<string | undefined>();
	/** The page saves at once when the start is the read-only default (W0); otherwise it asks. */
	const savesAtOnce = () =>
		mode === 'page' && preset === 'read' && autoReviewSelection(tools, selected).length > 0 && !saveProblem({ name, selected });
	// The account works: see what AI can do, then save read-only (or ask, with nothing read-only).
	async function accountReady(id: string) {
		if (id !== sourceID) return;
		readyAccount = '';
		saveError = '';
		if (!(await discover(id, '')) || id !== sourceID) return;
		if (savesAtOnce()) await save(true);
		else await go('tools', { account: null });
	}
	// With บัญชีกลาง: the company account is connected; see what AI can do on it.
	async function companyAccountReady(id: string, accountID: string, accountHint = '') {
		if (id !== sourceID || !accountID) return;
		if (accountHint) accountHints = { ...accountHints, [accountID]: accountHint };
		readyAccount = accountID;
		saveError = '';
		if (!(await discover(id, accountID)) || id !== sourceID) return;
		if (savesAtOnce()) await save(true);
		else await go('tools', { account: accountID });
	}

	// The program's company account policy, for step 2's choice.
	$effect(() => {
		if (step !== 'connect' || !sourceID || operator) return;
		const id = sourceID;
		untrack(() => {
			if (policyFor === id) return;
			policy = undefined;
			OrcaService.programAccountPolicy(id)
				.catch(() => undefined)
				.then((found) => {
					if (!alive || sourceID !== id) return;
					policy = found;
					policyFor = id;
					// สร้าง › บัญชีกลาง on a program that allows each person's own account
					// only: the step shows that account, so the choice follows it, and a
					// failed save's ลองอีกครั้ง saves on it (Codex W0.1 round 2, NOTE 1).
					if (accountMode === 'company' && policyStep(found) === 'personal-only') {
						accountMode = 'personal';
						accountChanged();
					}
				});
		});
	});

	// Step 3 opened by address (a reload): load the tools again.
	$effect(() => {
		// After the catalog, so the name the team sees starts from the program's name.
		if (step !== 'tools' || !sourceID || !source) return;
		const id = sourceID;
		const account = companyAccount;
		untrack(() => {
			if ((toolsFor !== id || toolsAccount !== account) && !discovering && !discoverError) void discover(id, account);
		});
	});

	// Step 1 starts a new program: the one saved before is no longer the one to update.
	$effect(() => {
		if (step !== 'choose') return;
		const memo = savedKey;
		untrack(() => {
			clearDraft(storage(), memo);
			saved = undefined;
		});
	});

	// Ticked tools, the preset, name and note survive a reload or the OAuth popup.
	$effect(() => {
		if (step !== 'tools' || toolsFor !== sourceID || toolsAccount !== companyAccount || !sourceID) return;
		const draft = { sourceID, toolNames: [...selected], preset, name, note };
		untrack(() => writeDraft(storage(), key, draft));
	});

	/** `atOnce`: the read-only save right after connecting, before the address names a company account. */
	async function save(atOnce = false) {
		if (saving || toolsFor !== sourceID || (!atOnce && toolsAccount !== companyAccount)) return;
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
		// Saving again after going back (the browser's Back from step 4, even
		// after a reload) changes the same program, never adds a second one, on
		// the version this tab saved (savedProgramFor, Codex release review 65).
		// This page's own record of the same program is at least as new as the
		// stored one (a storage write can fail, Codex release review 66).
		const remembered = savedProgramFor(storage(), savedKey, sourceID, data.connections);
		const again = saved && saved.mcpID === sourceID && (!remembered || remembered.id === saved.id) ? saved : remembered;
		const input = programSaveInput({ name, note, mcpID: sourceID, selected, tools, existing: again });
		// The company account the tools were read on; going back to each
		// person's own account after saving with one says so too.
		if (toolsAccount || again?.programAccountID) input.programAccountID = toolsAccount;
		try {
			const result = await ProgramService.save(input, again?.id);
			if (!alive) return;
			clearDraft(storage(), key);
			rememberSavedProgram(storage(), savedKey, sourceID, result.id, Date.now(), result.version);
			saved = result;
			await onchanged();
			if (mode === 'sheet') await oncompleted?.(result);
			else {
				showToast(t(`เชื่อม ${programName || result.name} แล้ว`, `${programName || result.name} connected`));
				await navigate?.(localeHref(programReturnHref(returnTo, result.id)));
			}
		} catch (cause) {
			if (!alive) return;
			saveError = programSaveError(cause);
			if (again && programSaveConflict(cause)) await rebase(again.id, again.version);
		} finally {
			if (alive) saving = false;
		}
	}
	/** Someone else saved the program after this tab did: show theirs, to check and save again. */
	async function rebase(id: string, refused: number) {
		await onchanged();
		const latest = data.connections.find((item) => item.id === id);
		if (!alive || !latest) return;
		// The refresh failed, or brought nothing newer than the refused save:
		// nothing is taken, and what the page shows stays (Codex release review 68).
		if (latest.version <= refused) {
			saveError = t(
				'มีคนแก้โปรแกรมนี้หลังจากคุณบันทึก แต่ยังโหลดฉบับล่าสุดไม่ได้ ลองบันทึกอีกครั้งเพื่อโหลดใหม่',
				"Someone changed this program after you saved it, but the newest version couldn't be loaded. Save again to load it."
			);
			return;
		}
		rememberSavedProgram(storage(), savedKey, sourceID, latest.id, Date.now(), latest.version);
		saved = latest;
		// Someone also changed whose account AI uses: the tools on screen were
		// read on the other one. Nothing saves until they are read again, and
		// the flow moves to the newest program's account first, whatever the
		// reading does, so Try again and a reload read that account too; the
		// step-3 reading then starts from the newest program, not this tab's
		// draft (Codex release review deploy44 rounds 1 and 2, MAJOR).
		const latestAccount = latest.programAccountID ?? '';
		if (latestAccount !== toolsAccount) {
			clearDraft(storage(), key);
			// The account changes under the page: the same reset as choosing it (accountChanged), then the notice.
			accountMode = latestAccount ? 'company' : 'personal';
			accountChanged();
			saveError = latestAccount
				? t(
						'มีคนเปลี่ยนโปรแกรมนี้ให้ใช้บัญชีกลางอีกบัญชีหลังจากคุณบันทึก หน้านี้แสดงฉบับล่าสุดแล้ว ตรวจแล้วบันทึกอีกครั้ง หรือกลับไปเลือกบัญชีใหม่',
						'Someone set this program to another company account after you saved it. This shows the newest version now: check it and save again, or go back and choose the account.'
					)
				: t(
						'มีคนเปลี่ยนโปรแกรมนี้ให้แต่ละคนใช้บัญชีของตัวเองหลังจากคุณบันทึก หน้านี้แสดงฉบับล่าสุดแล้ว ตรวจแล้วบันทึกอีกครั้ง หรือกลับไปเลือกบัญชีใหม่',
						"Someone set this program to each person's own account after you saved it. This shows the newest version now: check it and save again, or go back and choose the account."
					);
			await go('tools', { account: latestAccount || null });
			return;
		}
		selected = savedSelection(tools, latest.toolNames);
		preset = presetFor(selected, tools);
		// Its name and note too: saving again never puts back ones this page
		// never showed (Codex release review 67).
		name = latest.name;
		note = latest.scopeNote ?? '';
		saveError = t(
			'มีคนแก้โปรแกรมนี้หลังจากคุณบันทึก หน้านี้แสดงฉบับล่าสุดแล้ว ตรวจแล้วบันทึกอีกครั้ง',
			'Someone changed this program after you saved it. This shows the newest version now: check it, then save again.'
		);
	}

	/**
	 * Whose account AI uses changed in the connect step: what was read (and a
	 * failed save's retry) belonged to the other one, so it goes (Codex W0
	 * review 2, MAJOR 1).
	 */
	function accountChanged() {
		discovery++;
		discovering = false;
		discoverError = '';
		saveError = '';
		toolsFor = '';
		toolsAccount = '';
		readyAccount = undefined;
	}
	/**
	 * ลองอีกครั้ง after the save right after connecting failed or was refused.
	 * Only on the account chosen now; and when what would be saved is no longer
	 * the pure read-only start (a newer program with writes, after a conflict),
	 * the person reviews what AI may do first instead (Codex W0 review 2, NOTE).
	 */
	async function retry() {
		if (saving || discovering || toolsFor !== sourceID) return;
		if ((accountMode === 'company') !== !!toolsAccount || (readyAccount !== undefined && readyAccount !== toolsAccount)) {
			accountChanged();
			return;
		}
		if (!savesAtOnce()) {
			saveError = '';
			await go('tools', { account: toolsAccount || null });
			return;
		}
		await save(true);
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
					{#if connected}<span class="ap-pill ok"><Check size={12} strokeWidth={3} aria-hidden="true" />{toolsAccount ? t('เชื่อมด้วยบัญชีกลางแล้ว', 'Connected with the company account') : t('เชื่อมด้วยบัญชีของคุณแล้ว', 'Connected with your account')}</span>
						{#if toolsAccountHint}<span class="ap-strip-account">{t('บัญชีที่เชื่อม', 'Connected account')}: {toolsAccountHint}</span>{/if}
					{:else if category.th}<span>{t(category.th, category.en)}</span>{/if}
				</div>
			</div>
			<button type="button" class="k-button ap-change" disabled={saving || discovering} onclick={change}>{t('เปลี่ยน', 'Change')}</button>
		</div>
	{/if}
{/snippet}

{#snippet kept(text: string)}{#each keepTogether(text, ['ตัวเอง', 'ครั้งเดียว', 'เข้าใช้เอง', 'รหัสหรือคีย์']) as part, index (index)}{#if part.keep}<span class="ap-keep">{part.text}</span>{:else}{part.text}{/if}{/each}{/snippet}

<div class="ap" class:sheet={mode === 'sheet'}>
	{#if mode === 'page'}
		<div class="ap-top">
			<a class="k-button quiet ap-cancel" href={localeHref(programCancelHref(returnTo))} onclick={() => clearDraft(storage(), key)}><X size={16} aria-hidden="true" />{t('ยกเลิก', 'Cancel')}</a>
		</div>
	{/if}

	{#if step === 'choose'}
		<ProgramPicker
			{data}
			{sources}
			loading={catalogLoading}
			error={catalogError}
			onretry={() => loadCatalog(true)}
			hrefFor={mode === 'page' ? (id) => href('connect', { source: id }) : undefined}
			connectedHref={mode === 'page' ? (id) => localeHref(programConnectedHref(id, returnTo)) : undefined}
			onpick={mode === 'sheet' ? pick : undefined}
		/>
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
				title={t(`เชื่อม ${programName}`, `Connect ${programName}`)}
				subtitle={t('AI เริ่มจากดูข้อมูลอย่างเดียว เปลี่ยนได้ที่หน้าของโปรแกรม', 'AI starts read-only. Change it on the program’s page.')}
			/>
		{/if}
		{@render strip(false)}
		{#if companyAllowed}
			<fieldset class="ap-mode" disabled={discovering || saving}>
				<legend>{t('AI ใช้บัญชีของใคร', 'Whose account AI uses')}</legend>
				<label class="ap-mode-option" class:on={accountMode === 'personal'}>
					<input type="radio" name="ap-mode" value="personal" bind:group={accountMode} onchange={accountChanged} />
					<span><strong>{t('บัญชีของแต่ละคน', "Each person's own")}</strong><small>{@render kept(t(`แต่ละคนลงชื่อเข้าใช้ ${programName} ด้วยบัญชีของตัวเอง ตอนนี้เชื่อมบัญชีของคุณก่อน`, `Each person signs in to ${programName} with their own account. Connect yours now.`))}</small></span>
				</label>
				<label class="ap-mode-option" class:on={accountMode === 'company'}>
					<input type="radio" name="ap-mode" value="company" bind:group={accountMode} onchange={accountChanged} />
					<span><strong>{t('บัญชีกลาง', 'Company account')}</strong><small>{@render kept(t(`ทุกคนใช้ ${programName} บัญชีเดียว ผู้ดูแลเชื่อมครั้งเดียว สมาชิกไม่ต้องลงชื่อเข้าใช้และไม่เห็นรหัสหรือคีย์`, `Everyone uses one ${programName} account: a manager connects it once, and members never sign in or see the key.`))}</small></span>
				</label>
			</fieldset>
		{/if}
		{#if discoverError}<p class="ap-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{discoverError}</p>{/if}
		<!-- The save right after connecting (บันทึกอัตโนมัติ) was refused or failed: say so, with a retry (Codex W0 review 1). -->
		{#if saveError && !discovering && toolsFor === sourceID}<div class="ap-error ap-save-error" role="alert">
				<CircleAlert size={16} aria-hidden="true" />
				<span>{saveError}</span>
				<button type="button" class="k-button small" disabled={saving} onclick={retry}>{t('ลองอีกครั้ง', 'Try again')}</button>
			</div>{/if}
		{#key sourceID}
			{#if accountMode === 'company' && companyAllowed}
				<CompanyAccountConnect
					{sourceID}
					{programName}
					current={companyAccount}
					pending={discovering ? t(`กำลังดูว่า AI ทำอะไรได้บ้างใน ${programName}…`, `Seeing what AI can do in ${programName}…`) : ''}
					onready={(accountID, accountHint) => companyAccountReady(sourceID, accountID, accountHint)}
				/>
			{:else}
				<ProgramAccount
					{sourceID}
					{programName}
					endpointHost={source.endpointHost}
					{operator}
					pending={discovering ? t(`กำลังดูว่า AI ทำอะไรได้บ้างใน ${programName}…`, `Seeing what AI can do in ${programName}…`) : ''}
					onready={accountReady}
					onrequest={() => (requestOpen = true)}
				/>
			{/if}
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
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.ap {
		max-width: 1080px;
		min-width: 0;
		color: var(--orca-ink);
	}
	/* ยกเลิก sits at the right, above the page's header. */
	.ap-top {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 8px;
	}
	.ap-cancel {
		flex: none;
		margin-inline-start: auto;
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
		font-size: 14px;
		font-weight: 700;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ap-strip-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-top: 3px;
		color: var(--orca-muted);
		font-size: 12px;
	}
	.ap-strip-account {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ap-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		font-size: 11.5px;
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
		font-size: 13.5px;
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
		font-size: 13.5px;
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
		font-size: 13.5px;
	}
	.ap-save-error {
		align-items: center;
		flex-wrap: wrap;
	}
	.ap-save-error span {
		flex: 1 1 200px;
		min-width: 0;
	}
	.ap-back {
		margin-top: 20px;
	}
	/* Step 2's choice of whose account AI uses: two options side by side, stacked on a phone. */
	.ap-mode {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin: 0 0 20px;
		padding: 0;
		border: 0;
	}
	.ap-mode legend {
		margin-bottom: 10px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.ap-mode-option {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		cursor: pointer;
	}
	.ap-mode-option.on {
		border-color: var(--orca-ink);
	}
	.ap-mode-option input {
		margin-top: 3px;
	}
	/* The text beside the radio; never the kept phrases inside it. */
	.ap-mode-option > span {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.ap-mode-option strong {
		font-size: 13.5px;
	}
	.ap-mode-option small {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.45;
	}
	/* A short Thai phrase stays on one line (keepTogether). */
	.ap-keep {
		white-space: nowrap;
	}
	@media (max-width: 720px) {
		.ap-strip {
			margin-bottom: 24px;
			padding: 12px;
		}
		/* A long name such as "LINE OA (Messaging API)" wraps on a phone instead of losing its end. */
		.ap-strip-name {
			white-space: normal;
			overflow-wrap: anywhere;
		}
		.ap-mode {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
