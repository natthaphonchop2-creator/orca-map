<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import {
		ConnectFlows,
		acceptanceHolds,
		acknowledgedRevision,
		companyAccountStatus,
		connectionAccount,
		defaultAccountLabel,
		needsAcknowledgement,
		pausedReasonCopy,
		policyStep,
		programAccountsFor,
		stillBoundTo
	} from '$lib/orca/company-account';
	import { t } from '$lib/orca/locale.svelte';
	import { safeSignInURL } from '$lib/orca/program-connector.svelte';
	import {
		OrcaService,
		displayDate,
		orcaError,
		type OrcaCompanyAccountPolicy,
		type OrcaConnection,
		type OrcaMember,
		type OrcaProgramAccount,
		type OrcaProgramAccountStage
	} from '$lib/services/orca';
	import { parseErrorContent } from '$lib/errors';
	import { ProgramService, programSaveError } from '$lib/services/orca-programs';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import { showToast } from '../ui/toast-store.svelte';

	// บัญชีกลาง on a program's page, for managers (company accounts design §7):
	// whose account AI uses here, the company's one or each person's own, and
	// the company account's state with Connect again, Check and Disconnect.
	// Members never see or change it; the server checks every call. `initial`
	// is the first read, for a page that already has it (and for tests).
	let {
		connection,
		programName,
		members = [],
		initial,
		onchanged
	}: {
		connection: OrcaConnection;
		programName: string;
		members?: OrcaMember[];
		initial?: { accounts: OrcaProgramAccount[]; policy?: OrcaCompanyAccountPolicy };
		onchanged: () => Promise<void>;
	} = $props();

	const first = untrack(() => initial);
	let accounts = $state.raw<OrcaProgramAccount[]>(first?.accounts ?? []);
	let policy = $state.raw<OrcaCompanyAccountPolicy | undefined>(first?.policy);
	let loaded = $state(Boolean(first));
	let loadError = $state('');
	let error = $state('');
	let busy = $state('');
	// Setting up: which account to use ("new" makes one), its label, and the policy's acknowledgement.
	let setupOpen = $state(false);
	let choice = $state('new');
	let label = $state('');
	// The policy revision the manager ticked "accept" for: a policy that moves
	// on to another revision is never accepted by a tick made before (Codex
	// CA1 review 2, finding 7).
	let acceptedRevision = $state(0);
	// Connecting: the stage's details form, or its sign-in.
	let stage = $state.raw<OrcaProgramAccountStage>();
	let stageAccount = $state('');
	let values = $state<Record<string, string>>({});
	let accountURL = $state('');
	let signInURL = $state('');
	let waiting = $state(false);
	// A program that takes details and a sign-in: its details are saved, and its sign-in is next.
	let detailsSaved = $state(false);
	let disconnectOpen = $state(false);
	let personalOpen = $state(false);
	// What a dialog was opened for, so a page that refreshed meanwhile never
	// turns it on another account (Codex CA1 review 2, finding 6).
	let disconnectTarget = $state<{ id: string; label: string }>();
	let personalTarget = $state<{ accountID: string; version: number }>();
	let alive = true;
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	// Each connect flow: cancelling or starting another ends the one before,
	// and an ended flow binds nothing (Codex CA1 review 2, finding 5).
	const flows = new ConnectFlows();
	let stageFlow = 0;
	let flowVersion = 0;

	const account = $derived(connectionAccount(connection, accounts));
	const companyMode = $derived(Boolean(connection.programAccountID));
	const status = $derived(companyAccountStatus(account));
	const reason = $derived(account && account.status !== 'ready' ? pausedReasonCopy(account.pausedReason) : undefined);
	const forProgram = $derived(programAccountsFor(connection.mcpID, accounts));
	const step = $derived(policyStep(policy));
	const accepted = $derived(acceptanceHolds(policy, acceptedRevision));
	// The policy's warning is accepted for a new account, or for one whose acknowledged revision moved on.
	const chosen = $derived(forProgram.find((item) => item.id === choice));
	const setupNeedsAck = $derived(step === 'acknowledge' && (choice === 'new' || needsAcknowledgement(policy, chosen)));
	const accountNeedsAck = $derived(Boolean(account) && needsAcknowledgement(policy, account));
	const connectedBy = $derived.by(() => {
		const member = members.find((item) => item.id === account?.connectedBy);
		return member ? member.displayName || member.email : '';
	});

	onMount(() => {
		if (!first) void load();
	});
	onDestroy(() => {
		alive = false;
		clearTimeout(pollTimer);
	});

	async function load() {
		loadError = '';
		try {
			const [list, found] = await Promise.all([OrcaService.programAccounts(), OrcaService.programAccountPolicy(connection.mcpID).catch(() => undefined)]);
			if (!alive) return;
			accounts = list;
			policy = found;
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

	function openSetup() {
		const ready = forProgram.find((item) => item.status === 'ready');
		choice = ready?.id ?? 'new';
		label = defaultAccountLabel(programName, t);
		acceptedRevision = 0;
		setupOpen = true;
		error = '';
	}

	/** Ends the connect flow on screen: its poll stops, and nothing it started binds anything later. */
	function endFlow() {
		flows.end();
		waiting = false;
		detailsSaved = false;
		clearTimeout(pollTimer);
	}

	/** Makes the connection use a company account: binds a ready one, or connects it first. */
	function useCompanyAccount() {
		const revision = acknowledgedRevision(policy, accepted);
		return run('setup', async () => {
			let use = chosen;
			if (!use) {
				use = await OrcaService.createProgramAccount(connection.mcpID, label.trim(), revision);
				accounts = [...accounts, use];
			}
			setupOpen = false;
			if (use.status === 'ready' && !needsAcknowledgement(policy, use)) await bind(use.id, connection.version);
			else await startConnecting(use.id, needsAcknowledgement(policy, use) ? revision : 0);
		});
	}

	/** Starts a connect flow on the account's next generation; `revision` is the policy revision the manager accepted, or 0. */
	async function startConnecting(id: string, revision = 0) {
		endFlow();
		const mine = flows.start();
		flowVersion = connection.version;
		const next = await OrcaService.stageProgramAccount(id, revision || undefined);
		if (!flows.live(mine)) return;
		stageFlow = mine;
		stage = next;
		stageAccount = id;
		values = Object.fromEntries(next.fields.map((field) => [field.key, '']));
		accountURL = '';
		signInURL = '';
	}

	function connectAgain() {
		if (!account) return;
		const id = account.id;
		const revision = accountNeedsAck ? acknowledgedRevision(policy, accepted) : 0;
		return run('stage', () => startConnecting(id, revision));
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
					await run('bind', () => connectedNow(found, mine));
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
		// The connection as it was when this flow started: one changed since refuses the save.
		if (connection.programAccountID !== connected.id) await bind(connected.id, flowVersion);
		else {
			showToast(t(`เชื่อมบัญชีกลาง ${programName} แล้ว`, `${programName} company account connected`));
			await onchanged();
		}
	}

	/** Saves the connection with the account, at the version the decision was made on; the server checks its tools on that account first. */
	async function bind(programAccountID: string, version: number) {
		await ProgramService.save(
			{
				name: connection.name,
				description: connection.description,
				mcpID: connection.mcpID,
				toolNames: connection.toolNames,
				scopeNote: connection.scopeNote,
				reviewedTools: connection.reviewedTools ?? false,
				reviewedReadOnly: connection.reviewedReadOnly,
				enabled: connection.enabled,
				version,
				programAccountID
			},
			connection.id
		);
		showToast(
			programAccountID
				? t(`ทุกคนใช้บัญชีกลาง ${programName} แล้ว`, `Everyone now uses the ${programName} company account`)
				: t(`แต่ละคนใช้บัญชี ${programName} ของตัวเองแล้ว`, `Each person now uses their own ${programName} account`)
		);
		await onchanged();
	}

	function check() {
		if (!account) return;
		const id = account.id;
		return run('check', async () => {
			await OrcaService.checkProgramAccount(id);
			showToast(t(`ตรวจแล้ว บัญชีกลาง ${programName} ใช้งานได้`, `Checked: the ${programName} company account works`));
		}).finally(load);
	}

	function askDisconnect() {
		if (!account) return;
		disconnectTarget = { id: account.id, label: account.label };
		disconnectOpen = true;
	}

	function disconnect() {
		const target = disconnectTarget;
		if (!target) return;
		if (!stillBoundTo(connection, target.id)) {
			disconnectOpen = false;
			error = t('บัญชีที่ AI ใช้เปลี่ยนไปแล้วระหว่างนั้น จึงยังไม่ได้ตัดการเชื่อมต่อ ตรวจอีกครั้ง', 'The account AI uses changed meanwhile, so nothing was disconnected. Check again.');
			return;
		}
		return run('disconnect', async () => {
			const result = await OrcaService.disconnectProgramAccount(target.id);
			accounts = [...accounts.filter((item) => item.id !== target.id), result];
			disconnectOpen = false;
			showToast(t(`ตัดการเชื่อมต่อ ${target.label} แล้ว`, `${target.label} disconnected`));
		});
	}

	function askPersonal() {
		personalTarget = { accountID: connection.programAccountID ?? '', version: connection.version };
		personalOpen = true;
	}

	function usePersonal() {
		const target = personalTarget;
		if (!target) return;
		return run('personal', async () => {
			await bind('', target.version);
			personalOpen = false;
		});
	}
</script>

<section class="ca-card" aria-busy={Boolean(busy) || waiting}>
	<header class="ca-head">
		<div>
			<h2>{t('บัญชีที่ AI ใช้', 'Account AI uses')}</h2>
			<p>
				{companyMode
					? t(`ทุกคนใช้บัญชีกลาง ${programName} บัญชีเดียว ไม่ต้องลงชื่อเข้าใช้เอง`, `Everyone uses one ${programName} company account and never signs in themselves`)
					: t(`แต่ละคนใช้บัญชี ${programName} ของตัวเอง`, `Each person uses their own ${programName} account`)}
			</p>
		</div>
		{#if companyMode}<StatusPill label={t(status.th, status.en)} tone={status.tone} dot />{/if}
	</header>

	{#if loadError}
		<p class="ca-note error" role="alert">{loadError} <button type="button" class="k-button small" onclick={load}>{t('ลองอีกครั้ง', 'Try again')}</button></p>
	{:else if !loaded}
		<p class="ca-note" role="status">{t('กำลังโหลด…', 'Loading…')}</p>
	{:else if companyMode}
		<dl class="ca-list">
			<div><dt>{t('บัญชีกลาง', 'Company account')}</dt><dd>{account?.label ?? t('ไม่พบบัญชีนี้', 'Not found')}</dd></div>
			{#if account?.connectedAt}<div><dt>{t('เชื่อมโดย', 'Connected by')}</dt><dd>{[connectedBy, displayDate(account.connectedAt)].filter(Boolean).join(' · ')}</dd></div>{/if}
		</dl>
		{#if reason && !(accountNeedsAck && account?.pausedReason === 'policy_changed')}<p class="ca-note warn">{t(reason.th, reason.en)}</p>{/if}
		{#if accountNeedsAck && !stage}
			<p class="ca-note warn">{t(
				`เงื่อนไขการใช้บัญชีกลางของ ${programName} เปลี่ยน ทุกคนที่ได้รับอนุญาตจะใช้บัญชีนี้ผ่าน AI และเห็นข้อมูลชุดเดียวกัน เงื่อนไขของ ${programName} อาจไม่อนุญาตให้หลายคนใช้บัญชีเดียว บริษัทของคุณรับผิดชอบการใช้ตามเงื่อนไขนั้นเอง`,
				`${programName}'s company account terms changed. Everyone allowed uses this account through AI and sees the same data. ${programName}'s terms may not allow sharing one login; your company is responsible for following them.`
			)}</p>
			<label class="ca-check"><input type="checkbox" checked={accepted} onchange={(event) => (acceptedRevision = event.currentTarget.checked ? (policy?.revision ?? 0) : 0)} />{t('เข้าใจและยอมรับ', 'I understand and accept')}</label>
		{/if}
		<p class="ca-note">{t(`ทุกคนที่ได้รับอนุญาตจะเห็นข้อมูลชุดเดียวกันใน ${programName} ผ่าน AI ตามสิ่งที่ AI ทำได้ ทุกครั้งที่ใช้จะบันทึกว่าใครขอ`, `Everyone allowed sees the same ${programName} data through AI, within what AI can do. Each use records who asked.`)}</p>
		{#if !stage}
			<div class="ca-actions">
				{#if account}
					<button type="button" class="k-button small primary" disabled={Boolean(busy) || (accountNeedsAck && !accepted)} onclick={connectAgain}>{account.status === 'ready' ? t('เปลี่ยนบัญชีหรือคีย์', 'Replace the account or key') : t('เชื่อมใหม่', 'Connect again')}</button>
					{#if account.status === 'ready'}<button type="button" class="k-button small" disabled={Boolean(busy)} onclick={check}>{busy === 'check' ? t('กำลังตรวจ…', 'Checking…') : t('ตรวจการเชื่อมต่อ', 'Check the connection')}</button>{/if}
					{#if account.status !== 'disconnected'}<button type="button" class="k-button small" disabled={Boolean(busy)} onclick={askDisconnect}>{t('ตัดการเชื่อมต่อ', 'Disconnect')}</button>{/if}
				{/if}
				<button type="button" class="k-button small" disabled={Boolean(busy)} onclick={askPersonal}>{t('ให้แต่ละคนใช้บัญชีของตัวเอง', 'Let each person use their own')}</button>
			</div>
		{/if}
	{:else if !setupOpen && !stage}
		{#if step === 'personal-only'}
			<p class="ca-note">{t(`${programName} ให้ใช้ได้เฉพาะบัญชีของแต่ละคน`, `${programName} allows personal accounts only`)}</p>
		{:else}
			<p class="ca-note">{t(`ใช้บัญชีกลางเมื่ออยากให้ทุกคนใช้ ${programName} บัญชีเดียว ผู้ดูแลเชื่อมครั้งเดียว สมาชิกไม่ต้องลงชื่อเข้าใช้และไม่เห็นรหัสหรือคีย์`, `Use a company account when everyone should use one ${programName} account: a manager connects it once, and members never sign in or see the key.`)}</p>
			<div class="ca-actions"><button type="button" class="k-button small primary" disabled={Boolean(busy)} onclick={openSetup}>{t('ใช้บัญชีกลาง', 'Use a company account')}</button></div>
		{/if}
	{/if}

	{#if setupOpen && !stage}
		<form class="ca-form" onsubmit={(event) => { event.preventDefault(); void useCompanyAccount(); }}>
			{#if forProgram.length}
				<fieldset>
					<legend>{t('ใช้บัญชีกลางไหน', 'Which company account')}</legend>
					{#each forProgram as item (item.id)}
						{@const itemStatus = companyAccountStatus(item)}
						<label class="ca-choice"><input type="radio" name="ca-choice" value={item.id} bind:group={choice} />{item.label} <small>{t(itemStatus.th, itemStatus.en)}</small></label>
					{/each}
					<label class="ca-choice"><input type="radio" name="ca-choice" value="new" bind:group={choice} />{t('สร้างบัญชีกลางใหม่', 'A new company account')}</label>
				</fieldset>
			{/if}
			{#if choice === 'new'}
				<label class="ca-field">{t('ชื่อบัญชีกลาง', 'Name')}<input bind:value={label} maxlength="80" required /></label>
			{/if}
			{#if setupNeedsAck}
				<p class="ca-note warn">{t(
					`ทุกคนที่ได้รับอนุญาตจะใช้บัญชี ${programName} นี้ผ่าน AI และเห็นข้อมูลชุดเดียวกัน เงื่อนไขของ ${programName} อาจไม่อนุญาตให้หลายคนใช้บัญชีเดียว บริษัทของคุณรับผิดชอบการใช้ตามเงื่อนไขนั้นเอง`,
					`Everyone allowed uses this ${programName} account through AI and sees the same data. ${programName}'s terms may not allow sharing one login; your company is responsible for following them.`
				)}</p>
				<label class="ca-check"><input type="checkbox" checked={accepted} onchange={(event) => (acceptedRevision = event.currentTarget.checked ? (policy?.revision ?? 0) : 0)} />{t('เข้าใจและยอมรับ', 'I understand and accept')}</label>
			{/if}
			<div class="ca-actions">
				<button type="submit" class="k-button small primary" disabled={Boolean(busy) || (choice === 'new' && !label.trim()) || (setupNeedsAck && !accepted)}>{busy === 'setup' ? t('กำลังเตรียม…', 'Preparing…') : t('ต่อไป', 'Continue')}</button>
				<button type="button" class="k-button small" disabled={Boolean(busy)} onclick={() => (setupOpen = false)}>{t('ยกเลิก', 'Cancel')}</button>
			</div>
		</form>
	{/if}

	{#if stage}
		<div class="ca-form">
			<p class="ca-note">{t(`เชื่อม ${programName} ด้วยบัญชีที่จะให้ทุกคนใช้ บัญชีเดิมยังใช้งานได้จนกว่าบัญชีใหม่จะเชื่อมสำเร็จ`, `Connect ${programName} with the account everyone will use. The current one keeps working until the new one connects.`)}</p>
			{#if detailsSaved}
				<p class="ca-note">{t(`บันทึกข้อมูลแล้ว ลงชื่อเข้าใช้ ${programName} ต่อเพื่อเชื่อมให้เสร็จ`, `Details saved. Sign in to ${programName} to finish connecting.`)}</p>
			{:else if stage.fields.length || stage.requiresURL}
				<form onsubmit={(event) => { event.preventDefault(); void saveDetails(); }}>
					{#if stage.requiresURL}<label class="ca-field">{t('ที่อยู่ของบัญชี', 'Account address')}<input type="url" bind:value={accountURL} required autocomplete="off" /></label>{/if}
					{#each stage.fields as field (field.key)}
						<label class="ca-field">{field.name || field.key}{#if field.description}<small>{field.description}</small>{/if}<input type={field.sensitive ? 'password' : 'text'} bind:value={values[field.key]} required={field.required} autocomplete="off" /></label>
					{/each}
					<div class="ca-actions"><button type="submit" class="k-button small primary" disabled={Boolean(busy)}>{busy === 'configure' ? t('กำลังตรวจ…', 'Checking…') : t('บันทึกและตรวจ', 'Save and check')}</button></div>
				</form>
			{/if}
			{#if stage.oauthSupported && (detailsSaved || !stage.fields.some((field) => field.required))}
				<div class="ca-actions">
					<button type="button" class="k-button small primary" disabled={Boolean(busy) || waiting} onclick={signIn}>{t(`ลงชื่อเข้าใช้ ${programName}`, `Sign in to ${programName}`)}</button>
					{#if signInURL}<a class="k-button small" href={signInURL} target="_blank" rel="noopener noreferrer">{t('เปิดหน้าต่างอีกครั้ง', 'Open the window again')}</a>{/if}
				</div>
				{#if waiting}<p class="ca-note" role="status">{t(`รอให้ลงชื่อเข้าใช้ในหน้าต่าง ${programName}…`, `Waiting for the sign-in in the ${programName} window…`)}</p>{/if}
			{/if}
			<div class="ca-actions"><button type="button" class="k-button small" disabled={Boolean(busy)} onclick={cancelConnecting}>{t('ยกเลิก', 'Cancel')}</button></div>
		</div>
	{/if}

	{#if error}<p class="ca-note error" role="alert">{error}</p>{/if}
</section>

<ConfirmDialog
	bind:open={disconnectOpen}
	tone="danger"
	busy={busy === 'disconnect'}
	title={t(`ตัดการเชื่อมต่อ ${disconnectTarget?.label ?? `บัญชีกลาง ${programName}`}?`, `Disconnect ${disconnectTarget?.label ?? `the ${programName} company account`}?`)}
	message={t(
		`AI ของทุกคนจะใช้ ${programName} ไม่ได้จนกว่าผู้ดูแลจะเชื่อมใหม่ ORCA ลบการลงชื่อเข้าใช้และคีย์ของบัญชีนี้ทันที`,
		`No one's AI can use ${programName} until a manager connects it again. ORCA deletes this account's sign-in and key now.`
	)}
	confirmLabel={t('ตัดการเชื่อมต่อ', 'Disconnect')}
	onconfirm={disconnect}
/>
<ConfirmDialog
	bind:open={personalOpen}
	busy={busy === 'personal'}
	title={t('ให้แต่ละคนใช้บัญชีของตัวเอง?', 'Let each person use their own account?')}
	message={t(
		`แต่ละคนต้องมีบัญชี ${programName} ของตัวเองและลงชื่อเข้าใช้ก่อน AI จึงจะใช้ได้ บัญชีกลางยังเก็บไว้ ใช้อีกครั้งได้ภายหลัง`,
		`Each person needs their own ${programName} account and signs in before AI can use it. The company account stays for later.`
	)}
	confirmLabel={t('ให้แต่ละคนใช้บัญชีของตัวเอง', 'Use their own accounts')}
	onconfirm={usePersonal}
/>

<style>
	.ca-card {
		min-width: 0;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.ca-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px 16px;
	}
	.ca-head h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 650;
	}
	.ca-head p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.ca-list {
		display: grid;
		gap: 6px;
		margin: 14px 0 0;
	}
	.ca-list div {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.ca-list dt {
		min-width: 96px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.ca-list dd {
		margin: 0;
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.ca-note {
		margin: 12px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.ca-note.warn {
		padding: 10px 12px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
	}
	.ca-note.error {
		color: var(--orca-danger, #b42318);
	}
	.ca-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.ca-form {
		display: grid;
		gap: 4px;
		margin-top: 12px;
	}
	.ca-form fieldset {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.ca-form legend {
		margin-bottom: 6px;
		font-size: 14px;
		font-weight: 600;
	}
	.ca-field {
		display: grid;
		gap: 6px;
		margin-top: 10px;
		font-size: 14px;
		font-weight: 500;
	}
	.ca-field small {
		color: var(--orca-muted);
		font-weight: 400;
	}
	.ca-field input {
		min-height: 40px;
		padding: 8px 10px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
	}
	.ca-choice,
	.ca-check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	.ca-choice small {
		color: var(--orca-muted);
	}
	.ca-check {
		margin-top: 10px;
	}
</style>
