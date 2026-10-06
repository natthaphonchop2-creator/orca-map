<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import {
		ConnectFlows,
		acceptanceHolds,
		acknowledgedRevision,
		companyAccountStatus,
		defaultAccountLabel,
		needsAcknowledgement,
		policyStep,
		programAccountsFor
	} from '$lib/orca/company-account';
	import { t } from '$lib/orca/locale.svelte';
	import { safeSignInURL } from '$lib/orca/program-connector.svelte';
	import { OrcaService, orcaError, type OrcaCompanyAccountPolicy, type OrcaProgramAccount, type OrcaProgramAccountStage } from '$lib/services/orca';
	import { parseErrorContent } from '$lib/errors';
	import { programSaveError } from '$lib/services/orca-programs';

	// เพิ่มโปรแกรม step 2 with บัญชีกลาง (company accounts design §7): a manager
	// picks one of the company's accounts for this program, or makes one, and
	// connects it once; then `onready` takes the flow on to what AI can do, on
	// that account. Nothing is bound yet: the program's save names the account,
	// and the server checks the account and its policy again then. The program
	// page's CompanyAccountCard does the same for a program already saved.
	let {
		sourceID,
		programName,
		current = '',
		pending = '',
		initial,
		onready
	}: {
		sourceID: string;
		programName: string;
		/** The account the flow already uses (Back, a reload): chosen first when it is this program's. */
		current?: string;
		/** Shown while the flow looks at what AI can do on the account. */
		pending?: string;
		/** The first read, for a page that already has it (and for tests). */
		initial?: { accounts: OrcaProgramAccount[]; policy?: OrcaCompanyAccountPolicy };
		onready: (programAccountID: string) => Promise<void> | void;
	} = $props();

	const first = untrack(() => initial);
	let accounts = $state.raw<OrcaProgramAccount[]>(first?.accounts ?? []);
	let policy = $state.raw<OrcaCompanyAccountPolicy | undefined>(first?.policy);
	let loaded = $state(Boolean(first));
	let loadError = $state('');
	let error = $state('');
	let busy = $state('');
	let choice = $state(untrack(() => firstChoice(first?.accounts ?? [])));
	let label = $state(untrack(() => defaultAccountLabel(programName, t)));
	// The policy revision the manager ticked "accept" for (Codex CA1 review 2, finding 7).
	let acceptedRevision = $state(0);
	let stage = $state.raw<OrcaProgramAccountStage>();
	let stageAccount = $state('');
	let values = $state<Record<string, string>>({});
	let accountURL = $state('');
	let signInURL = $state('');
	let waiting = $state(false);
	let detailsSaved = $state(false);
	let alive = true;
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	// Each connect flow: cancelling or starting another ends the one before,
	// and an ended flow hands nothing on (Codex CA1 review 2, finding 5).
	const flows = new ConnectFlows();
	let stageFlow = 0;

	const forProgram = $derived(programAccountsFor(sourceID, accounts));
	const step = $derived(policyStep(policy));
	const accepted = $derived(acceptanceHolds(policy, acceptedRevision));
	const chosen = $derived(forProgram.find((item) => item.id === choice));
	const needsAck = $derived(step === 'acknowledge' && (choice === 'new' || needsAcknowledgement(policy, chosen)));

	onMount(() => {
		if (!first) void load();
	});
	onDestroy(() => {
		alive = false;
		flows.end();
		clearTimeout(pollTimer);
	});

	/** The account the flow uses already when it is this program's, else its first ready one, else a new one. */
	function firstChoice(list: readonly OrcaProgramAccount[]) {
		const mine = programAccountsFor(sourceID, list);
		return (mine.find((item) => item.id === current) ?? mine.find((item) => item.status === 'ready'))?.id ?? 'new';
	}

	async function load() {
		loadError = '';
		try {
			const [list, found] = await Promise.all([OrcaService.programAccounts(), OrcaService.programAccountPolicy(sourceID).catch(() => undefined)]);
			if (!alive) return;
			accounts = list;
			policy = found;
			if (choice === 'new') choice = firstChoice(list);
			loaded = true;
		} catch (cause) {
			if (alive) loadError = orcaError(cause);
		}
	}

	async function run(action: string, work: () => Promise<void>) {
		if (busy) return;
		busy = action;
		error = '';
		try {
			await work();
		} catch (cause) {
			if (alive) error = programSaveError(cause);
		} finally {
			if (alive) busy = '';
		}
	}

	/** Ends the connect flow on screen: its poll stops, and nothing it started hands anything on later. */
	function endFlow() {
		flows.end();
		waiting = false;
		detailsSaved = false;
		clearTimeout(pollTimer);
	}

	/** Uses a ready account as it is, or connects the chosen or a new one first. */
	function next() {
		const revision = acknowledgedRevision(policy, accepted);
		return run('setup', async () => {
			let use = chosen;
			if (!use) {
				use = await OrcaService.createProgramAccount(sourceID, label.trim(), revision);
				if (!alive) return;
				accounts = [...accounts, use];
				choice = use.id;
			}
			if (use.status === 'ready' && !needsAcknowledgement(policy, use)) await onready(use.id);
			else await startConnecting(use.id, needsAcknowledgement(policy, use) ? revision : 0);
		});
	}

	/** Starts a connect flow on the account's next generation; `revision` is the policy revision the manager accepted, or 0. */
	async function startConnecting(id: string, revision = 0) {
		endFlow();
		const mine = flows.start();
		const staged = await OrcaService.stageProgramAccount(id, revision || undefined);
		if (!flows.live(mine) || !alive) return;
		stageFlow = mine;
		stage = staged;
		stageAccount = id;
		values = Object.fromEntries(staged.fields.map((field) => [field.key, '']));
		accountURL = '';
		signInURL = '';
	}

	function cancelConnecting() {
		endFlow();
		stage = undefined;
	}

	function saveDetails() {
		if (!stage) return;
		const current = stage;
		const mine = stageFlow;
		return run('configure', async () => {
			let connected: OrcaProgramAccount;
			try {
				connected = await OrcaService.configureProgramAccount(stageAccount, current.generation, values, accountURL.trim() || undefined);
			} catch (cause) {
				// Details saved, and the program asks for its sign-in next (Codex CA1 review 2, finding 9).
				const refused = parseErrorContent(cause);
				if (flows.live(mine) && current.oauthSupported && refused.status === 409 && /sign in/i.test(refused.message)) {
					values = {};
					detailsSaved = true;
					return;
				}
				throw cause;
			}
			values = {};
			await connectedNow(connected, mine);
		});
	}

	function signIn() {
		if (!stage) return;
		const current = stage;
		let popup: Window | null = null;
		try {
			popup = window.open('about:blank', '_blank');
			if (popup) popup.opener = null;
		} catch {
			popup = null;
		}
		const mine = stageFlow;
		return run('oauth', async () => {
			const result = await OrcaService.startProgramAccountOAuth(stageAccount, current.generation);
			if (!flows.live(mine)) {
				popup?.close();
				return;
			}
			const url = safeSignInURL(result.oauthURL);
			if (!url) {
				popup?.close();
				error = t('ลิงก์ลงชื่อเข้าใช้ที่ได้รับไม่ถูกต้อง แจ้งทีม ORCA', 'The sign-in link is not valid. Tell the ORCA team.');
				return;
			}
			signInURL = url;
			if (popup && !popup.closed) popup.location.replace(url);
			waiting = true;
			poll(mine, current.generation, Date.now() + 5 * 60_000);
		}).finally(() => {
			if (!signInURL) popup?.close();
		});
	}

	/** Waits for the sign-in's callback to make the stage the account in use, while its flow lasts. */
	function poll(mine: number, generation: number, until: number) {
		clearTimeout(pollTimer);
		const accountID = stageAccount;
		pollTimer = setTimeout(async () => {
			if (!alive || !waiting || !flows.live(mine)) return;
			try {
				const list = await OrcaService.programAccounts();
				if (!alive || !flows.live(mine)) return;
				accounts = list;
				const found = list.find((item) => item.id === accountID);
				if (found?.status === 'ready' && found.generation >= generation) {
					waiting = false;
					await run('ready', () => connectedNow(found, mine));
					return;
				}
			} catch {
				// Try again until the deadline.
			}
			if (!flows.live(mine)) return;
			if (Date.now() < until) poll(mine, generation, until);
			else waiting = false;
		}, 2000);
	}

	async function connectedNow(connected: OrcaProgramAccount, mine: number) {
		if (!flows.live(mine)) return;
		accounts = [...accounts.filter((item) => item.id !== connected.id), connected];
		stage = undefined;
		signInURL = '';
		detailsSaved = false;
		acceptedRevision = 0;
		await onready(connected.id);
	}
</script>

<section class="cc" aria-busy={Boolean(busy) || waiting || Boolean(pending)}>
	{#if loadError}
		<p class="cc-note error" role="alert">{loadError} <button type="button" class="k-button small" onclick={load}>{t('ลองอีกครั้ง', 'Try again')}</button></p>
	{:else if !loaded}
		<p class="cc-note" role="status">{t('กำลังโหลด…', 'Loading…')}</p>
	{:else if step === 'personal-only'}
		<p class="cc-note">{t(`${programName} ให้ใช้ได้เฉพาะบัญชีของแต่ละคน`, `${programName} allows personal accounts only`)}</p>
	{:else if pending}
		<p class="cc-note" role="status">{pending}</p>
	{:else if !stage}
		<form class="cc-form" onsubmit={(event) => { event.preventDefault(); void next(); }}>
			{#if forProgram.length}
				<fieldset>
					<legend>{t('ใช้บัญชีกลางไหน', 'Which company account')}</legend>
					{#each forProgram as item (item.id)}
						{@const itemStatus = companyAccountStatus(item)}
						<label class="cc-choice"><input type="radio" name="cc-choice" value={item.id} bind:group={choice} />{item.label} <small>{t(itemStatus.th, itemStatus.en)}</small></label>
					{/each}
					<label class="cc-choice"><input type="radio" name="cc-choice" value="new" bind:group={choice} />{t('สร้างบัญชีกลางใหม่', 'A new company account')}</label>
				</fieldset>
			{/if}
			{#if choice === 'new'}
				<label class="cc-field">{t('ชื่อบัญชีกลาง', 'Name')}<input bind:value={label} maxlength="80" required /></label>
			{/if}
			{#if needsAck}
				<p class="cc-note warn">{t(
					`ทุกคนที่ได้รับอนุญาตจะใช้บัญชี ${programName} นี้ผ่าน AI และเห็นข้อมูลชุดเดียวกัน เงื่อนไขของ ${programName} อาจไม่อนุญาตให้หลายคนใช้บัญชีเดียว บริษัทของคุณรับผิดชอบการใช้ตามเงื่อนไขนั้นเอง`,
					`Everyone allowed uses this ${programName} account through AI and sees the same data. ${programName}'s terms may not allow sharing one login; your company is responsible for following them.`
				)}</p>
				<label class="cc-check"><input type="checkbox" checked={accepted} onchange={(event) => (acceptedRevision = event.currentTarget.checked ? (policy?.revision ?? 0) : 0)} />{t('เข้าใจและยอมรับ', 'I understand and accept')}</label>
			{/if}
			<div class="cc-actions">
				<button type="submit" class="k-button primary" disabled={Boolean(busy) || (choice === 'new' && !label.trim()) || (needsAck && !accepted)}>
					{busy === 'setup' ? t('กำลังเตรียม…', 'Preparing…') : chosen?.status === 'ready' && !needsAck ? t('ใช้บัญชีนี้', 'Use this account') : t('ต่อไป', 'Continue')}
				</button>
			</div>
		</form>
	{:else}
		<div class="cc-form">
			<p class="cc-note">{t(`เชื่อม ${programName} ด้วยบัญชีที่จะให้ทุกคนใช้`, `Connect ${programName} with the account everyone will use.`)}</p>
			{#if detailsSaved}
				<p class="cc-note">{t(`บันทึกข้อมูลแล้ว ลงชื่อเข้าใช้ ${programName} ต่อเพื่อเชื่อมให้เสร็จ`, `Details saved. Sign in to ${programName} to finish connecting.`)}</p>
			{:else if stage.fields.length || stage.requiresURL}
				<form onsubmit={(event) => { event.preventDefault(); void saveDetails(); }}>
					{#if stage.requiresURL}<label class="cc-field">{t('ที่อยู่ของบัญชี', 'Account address')}<input type="url" bind:value={accountURL} required autocomplete="off" /></label>{/if}
					{#each stage.fields as field (field.key)}
						<label class="cc-field">{field.name || field.key}{#if field.description}<small>{field.description}</small>{/if}<input type={field.sensitive ? 'password' : 'text'} bind:value={values[field.key]} required={field.required} autocomplete="off" /></label>
					{/each}
					<div class="cc-actions"><button type="submit" class="k-button primary" disabled={Boolean(busy)}>{busy === 'configure' ? t('กำลังตรวจ…', 'Checking…') : t('บันทึกและตรวจ', 'Save and check')}</button></div>
				</form>
			{/if}
			{#if stage.oauthSupported && (detailsSaved || !stage.fields.some((field) => field.required))}
				<div class="cc-actions">
					<button type="button" class="k-button primary" disabled={Boolean(busy) || waiting} onclick={signIn}>{t(`ลงชื่อเข้าใช้ ${programName}`, `Sign in to ${programName}`)}</button>
					{#if signInURL}<a class="k-button" href={signInURL} target="_blank" rel="noopener noreferrer">{t('เปิดหน้าต่างอีกครั้ง', 'Open the window again')}</a>{/if}
				</div>
				{#if waiting}<p class="cc-note" role="status">{t(`รอให้ลงชื่อเข้าใช้ในหน้าต่าง ${programName}…`, `Waiting for the sign-in in the ${programName} window…`)}</p>{/if}
			{/if}
			<div class="cc-actions"><button type="button" class="k-button quiet" disabled={Boolean(busy)} onclick={cancelConnecting}>{t('ยกเลิก', 'Cancel')}</button></div>
		</div>
	{/if}

	{#if error}<p class="cc-note error" role="alert">{error}</p>{/if}
</section>

<style>
	/* orca-type-remap v1 */
	.cc {
		min-width: 0;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.cc-note {
		margin: 0 0 4px;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.cc-note.warn {
		margin-top: 12px;
		padding: 10px 12px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
	}
	.cc-note.error {
		margin-top: 12px;
		color: var(--orca-danger, #b42318);
	}
	.cc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.cc-form {
		display: grid;
		gap: 4px;
	}
	.cc-form fieldset {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.cc-form legend {
		margin-bottom: 6px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.cc-field {
		display: grid;
		gap: 6px;
		margin-top: 10px;
		font-size: 13.5px;
		font-weight: 500;
	}
	.cc-field small {
		color: var(--orca-muted);
		font-weight: 400;
	}
	.cc-field input {
		min-height: 40px;
		padding: 8px 10px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
	}
	.cc-choice,
	.cc-check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13.5px;
	}
	.cc-choice small {
		color: var(--orca-muted);
	}
	.cc-check {
		margin-top: 10px;
	}
</style>
