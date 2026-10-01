<script lang="ts">
	import { CircleAlert, CircleCheck, ExternalLink, KeyRound, LoaderCircle, LogIn, Plug, TriangleAlert } from '@lucide/svelte';
	import { apiConnectorSetup } from '$lib/orca/api-connector-setup';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { platformHref } from '$lib/orca/navigation';
	import { ProgramConnector, pageBrowser } from '$lib/orca/program-connector.svelte';
	import { providerGuide } from '$lib/orca/provider-guides';
	import { OrcaService, orcaError } from '$lib/services/orca';
	import { onDestroy, untrack } from 'svelte';

	// เชื่อมบัญชี: the admin signs their own account in to a program, in place.
	// `step` is add-program step 2 (success moves on by itself); `manage` is the
	// "เชื่อมด้วยบัญชีของคุณ" card on a program's ภาพรวม.
	let {
		sourceID,
		programName,
		endpointHost = '',
		variant = 'step',
		operator = false,
		pending = '',
		onready,
		onrequest
	}: {
		sourceID: string;
		programName: string;
		endpointHost?: string;
		variant?: 'step' | 'manage';
		operator?: boolean;
		/** The page's own work after the account is ready ("กำลังดูว่า AI ทำอะไรได้บ้าง…"). */
		pending?: string;
		onready?: (sourceID: string) => Promise<void> | void;
		onrequest?: () => void;
	} = $props();

	const connector = new ProgramConnector({
		service: OrcaService,
		errorText: orcaError,
		t,
		programName: () => programName,
		browser: pageBrowser(),
		onready: (id) => onready?.(id)
	});
	let values = $state<Record<string, string>>({});
	let accountURL = $state('');
	let help = $state<string>('');
	const phase = $derived(connector.phase);
	/** Unavailable because the provider's review is pending (not a missing app). */
	const waitingForReview = $derived(
		connector.setup?.setupStatus === 'review_required' &&
			!(connector.setup.oauthSupported ? connector.setup.oauthConnected : connector.setup.configured)
	);
	const busy = $derived(connector.busy || Boolean(pending));
	const guide = $derived(apiConnectorSetup(sourceID));
	const provider = $derived(providerGuide(connector.setup?.endpointHost || endpointHost));
	const usesSignIn = $derived(Boolean(connector.setup?.oauthSupported));

	$effect(() => {
		const id = sourceID;
		untrack(() => {
			values = {};
			accountURL = '';
			help = '';
			void connector.load(id);
		});
	});
	$effect(() => connector.watch());
	onDestroy(() => {
		values = {};
		connector.destroy();
	});

	async function submitFields(event: SubmitEvent) {
		event.preventDefault();
		// Keys are never kept in the page after they are sent, even when the
		// program refuses them (as SourceSetup does); a typo found before sending
		// keeps what was typed. The account's address is not a secret and stays.
		const sent = await connector.configure(values, accountURL);
		if (sent) values = {};
	}
	function fieldLabel(field: { key: string; name: string }) {
		const copy = guide?.fields[field.key];
		if (copy) return t(...copy.label);
		// A program's own key is "คีย์ของ {โปรแกรม}", never "Access token".
		if (field.name === 'Access token' || field.key.toLowerCase() === 'authorization') return t(`คีย์ของ ${programName}`, `${programName} key`);
		return field.name || field.key;
	}
	function fieldHint(field: { key: string; description: string }) {
		const copy = guide?.fields[field.key];
		if (copy) return t(...copy.hint);
		if (field.description === 'Personal upstream access token') return t('คีย์ส่วนตัวที่ออกให้คุณในโปรแกรมนี้', 'A personal key issued to you in this program.');
		return field.description;
	}
	function useAnother() {
		if (usesSignIn && connector.setup?.oauthConnected) void connector.signInAgain();
		else connector.edit(true);
	}
	const busyLabel = $derived(
		pending ||
			(connector.action === 'check' || connector.action === 'return'
				? t('กำลังตรวจบัญชี…', 'Checking the account…')
				: connector.action === 'configure'
					? t('กำลังเชื่อมต่อ…', 'Connecting…')
					: connector.action === 'disconnect'
						? t('กำลังตัดการเชื่อมต่อ…', 'Disconnecting…')
						: t('กำลังเปิดหน้าลงชื่อเข้าใช้…', 'Opening the sign-in page…'))
	);
</script>

{#snippet fieldsForm()}
	<form class="acct-form" onsubmit={submitFields} novalidate>
		<fieldset disabled={busy}>
			{#if connector.requiresURL}
				<div class="acct-field">
					<label for="acct-url">{t(`ที่อยู่บัญชี ${programName}`, `${programName} account address`)}</label>
					<input id="acct-url" type="url" bind:value={accountURL} autocomplete="off" spellcheck="false" placeholder="https://" />
				</div>
			{/if}
			{#each connector.fields as field, index (field.key)}
				{@const copy = guide?.fields[field.key]}
				{@const hint = fieldHint(field)}
				<div class="acct-field">
					<div class="acct-field-head">
						<label for={`acct-field-${index}`}>{fieldLabel(field)}{#if !field.required}<em>{t(' (ไม่บังคับ)', ' (optional)')}</em>{/if}</label>
						{#if hint || copy || provider}<button type="button" class="acct-where" aria-expanded={help === field.key} aria-controls={`acct-help-${index}`} onclick={() => (help = help === field.key ? '' : field.key)}>{t('หาได้ที่ไหน?', 'Where do I find it?')}</button>{/if}
					</div>
					<input
						id={`acct-field-${index}`}
						type={field.sensitive ? 'password' : 'text'}
						value={values[field.key] ?? ''}
						oninput={(event) => (values = { ...values, [field.key]: event.currentTarget.value })}
						required={field.required}
						autocomplete={field.sensitive ? 'new-password' : 'off'}
						spellcheck="false"
						inputmode={copy?.numeric ? 'numeric' : undefined}
					/>
					{#if help === field.key}
						<div class="acct-help" id={`acct-help-${index}`}>
							{#if hint}<p>{hint}</p>{/if}
							{#if copy}<a href={copy.href} target="_blank" rel="noopener noreferrer">{t(...copy.linkLabel)}<ExternalLink size={13} aria-hidden="true" /></a>
							{:else if provider}<p>{t(provider.th, provider.en)}</p><a href={provider.href} target="_blank" rel="noopener noreferrer">{t(`คู่มือของ ${programName}`, `${programName} guide`)}<ExternalLink size={13} aria-hidden="true" /></a>{/if}
						</div>
					{/if}
				</div>
			{/each}
			<div class="acct-actions">
				<button type="submit" class="k-button primary" class:acct-lg={variant === 'step'}>{connector.action === 'configure' ? t('กำลังเชื่อมต่อ…', 'Connecting…') : t('เชื่อมต่อ', 'Connect')}</button>
				{#if connector.editing && connector.configured}<button type="button" class="k-button quiet" onclick={() => connector.edit(false)}>{t('ยกเลิก', 'Cancel')}</button>{/if}
			</div>
		</fieldset>
	</form>
{/snippet}

{#if variant === 'step'}
	<section class="acct-card" aria-live="polite" aria-busy={busy}>
		{#if connector.error && phase !== 'failed'}<p class="acct-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{connector.error}</p>{/if}
		{#if phase === 'loading' || phase === 'idle'}
			<div class="acct-state"><span class="acct-icon"><LoaderCircle size={20} class="k-spin" aria-hidden="true" /></span><div><h2>{t('กำลังโหลด…', 'Loading…')}</h2></div></div>
		{:else if phase === 'failed'}
			<div class="acct-state">
				<span class="acct-icon deny"><CircleAlert size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`โหลดข้อมูล ${programName} ไม่สำเร็จ`, `${programName} could not be loaded`)}</h2>
					<p>{connector.error}</p>
					<div class="acct-actions"><button type="button" class="k-button" onclick={() => connector.load()}>{t('ลองอีกครั้ง', 'Try again')}</button></div>
				</div>
			</div>
		{:else if phase === 'unavailable'}
			<div class="acct-state">
				<span class="acct-icon"><Plug size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`ยังเชื่อม ${programName} ไม่ได้ตอนนี้`, `${programName} can't be connected yet`)}</h2>
					{#if operator && waitingForReview}
						<!-- Waiting for the provider's review: handled in คลังโปรแกรม › รอทีม ORCA, not on the OAuth apps page. -->
						<p>{t('ต้องยืนยันข้อกำหนดการเชื่อมต่อกับผู้ให้บริการก่อน ตรวจได้ที่คลังโปรแกรม › รอทีม ORCA', "The provider's connection requirements must be confirmed first. Review it in the program catalog, under Waiting for the ORCA team.")}</p>
						<div class="acct-actions"><a class="k-button" href={localeHref(platformHref('catalog'))}>{t('ไปที่คลังโปรแกรม', 'Go to the program catalog')}</a></div>
					{:else if operator}
						<p>{t('ทีม ORCA ต้องตั้งค่าแอปของโปรแกรมนี้ที่แพลตฟอร์มก่อน', "The ORCA team must set up this program's app on the platform first.")}</p>
						<div class="acct-actions"><a class="k-button" href={localeHref(platformHref('oauth-apps'))}>{t('ไปที่แอป OAuth ของโปรแกรม', 'Go to program OAuth apps')}</a></div>
					{:else}
						<p>{t('ทีม ORCA กำลังเตรียมโปรแกรมนี้ แจ้งไว้แล้วเราจะบอกเมื่อพร้อม', "The ORCA team is preparing this program. Tell us and we'll let you know.")}</p>
						{#if onrequest}<div class="acct-actions"><button type="button" class="k-button" onclick={onrequest}>{t('แจ้งทีม ORCA', 'Tell the ORCA team')}</button></div>{/if}
					{/if}
				</div>
			</div>
		{:else if busy && phase !== 'fields'}
			<div class="acct-state"><span class="acct-icon"><LoaderCircle size={20} class="k-spin" aria-hidden="true" /></span><div><h2>{busyLabel}</h2>{#if phase === 'waiting'}<p>{t('เสร็จแล้วหน้านี้ไปต่อเอง', 'This page moves on by itself.')}</p>{/if}</div></div>
		{:else if phase === 'fields'}
			<div class="acct-state">
				<span class="acct-icon"><KeyRound size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`กรอกข้อมูลบัญชี ${programName}`, `Enter your ${programName} details`)}</h2>
					<p>{t('ORCA ใช้ข้อมูลนี้ดูว่า AI ทำอะไรได้บ้าง และเก็บเป็นความลับ', 'ORCA uses these to see what AI can do, and keeps them private.')}</p>
				</div>
			</div>
			{@render fieldsForm()}
		{:else if phase === 'signin'}
			<div class="acct-state">
				<span class="acct-icon"><LogIn size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`ลงชื่อเข้าใช้ ${programName}`, `Sign in to ${programName}`)}</h2>
					<p>{t(`ใช้บัญชี ${programName} ของคุณ เพื่อให้ ORCA ดูว่า AI ทำอะไรได้บ้าง`, `Use your ${programName} account so ORCA can see what AI can do.`)}</p>
					<div class="acct-actions"><button type="button" class="k-button primary acct-lg" onclick={() => connector.signIn()}>{t(`ลงชื่อเข้าใช้ ${programName}`, `Sign in to ${programName}`)}</button></div>
					<p class="acct-small">{t(`หน้าต่าง ${programName} จะเปิดขึ้น อนุญาตแล้วกลับมาที่หน้านี้`, `A ${programName} window opens. Allow access, then come back here.`)}</p>
				</div>
			</div>
		{:else if phase === 'waiting'}
			<div class="acct-state">
				<span class="acct-icon"><LoaderCircle size={20} class="k-spin" aria-hidden="true" /></span>
				<div>
					<h2>{connector.windowOpened ? t(`รอคุณอนุญาตในหน้าต่าง ${programName}…`, `Waiting for you to allow access in the ${programName} window…`) : t(`เปิดหน้าลงชื่อเข้าใช้ ${programName}`, `Open the ${programName} sign-in page`)}</h2>
					<p>{connector.windowOpened ? t('เสร็จแล้วหน้านี้ไปต่อเอง', 'When you finish, this page moves on by itself.') : t('หน้าต่างไม่ได้เปิดขึ้นเอง กดปุ่มด้านล่างเพื่อเปิด', "The window didn't open by itself. Use the button below.")}</p>
					<div class="acct-actions">
						<a class="k-button" class:quiet={connector.windowOpened} class:primary={!connector.windowOpened} href={connector.oauthURL} target="_blank" rel="noopener noreferrer">{connector.windowOpened ? t('เปิดหน้าต่างอีกครั้ง', 'Open the window again') : t(`เปิดหน้า ${programName}`, `Open ${programName}`)}<ExternalLink size={14} aria-hidden="true" /></a>
						<button type="button" class="k-button quiet" onclick={() => connector.disconnect()}>{t('ยกเลิก', 'Cancel')}</button>
					</div>
				</div>
			</div>
		{:else if phase === 'connected'}
			<div class="acct-state">
				<span class="acct-icon ok"><CircleCheck size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t('เชื่อมไว้แล้วด้วยบัญชีของคุณ', 'Already connected with your account')}</h2>
					<p>{t(`ORCA จะใช้บัญชี ${programName} นี้ดูว่า AI ทำอะไรได้บ้าง`, `ORCA uses this ${programName} account to see what AI can do.`)}</p>
					{#if connector.underReview}<p>{t(`ระหว่างรอการยืนยันจาก ${programName} ยังเปลี่ยนเป็นบัญชีอื่นไม่ได้`, `While ${programName}'s review is pending, you can't switch to another account.`)}</p>{/if}
					<div class="acct-actions">
						<button type="button" class="k-button primary acct-lg" onclick={() => connector.verify()}>{t('ใช้บัญชีนี้ต่อ', 'Continue with this account')}</button>
						{#if !connector.underReview}<button type="button" class="k-button quiet" onclick={useAnother}>{t('ใช้บัญชีอื่น', 'Use another account')}</button>{/if}
					</div>
				</div>
			</div>
		{:else if phase === 'reconnect'}
			<div class="acct-state">
				<span class="acct-icon warn"><TriangleAlert size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`ต้องลงชื่อเข้าใช้ ${programName} ใหม่`, `Sign in to ${programName} again`)}</h2>
					<p>{t('การลงชื่อเข้าใช้เดิมหมดอายุหรือถูกยกเลิก', 'The earlier sign-in expired or was removed.')}</p>
					<div class="acct-actions"><button type="button" class="k-button primary acct-lg" onclick={() => connector.signInAgain()}>{t('ลงชื่อเข้าใช้ใหม่', 'Sign in again')}</button></div>
				</div>
			</div>
		{:else if phase === 'ready'}
			<div class="acct-state">
				<span class="acct-icon ok"><CircleCheck size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`เชื่อม ${programName} แล้ว`, `${programName} connected`)}</h2>
					<div class="acct-actions"><button type="button" class="k-button primary acct-lg" onclick={() => onready?.(sourceID)}>{t('ดูสิ่งที่ AI ทำได้', 'See what AI can do')}</button></div>
				</div>
			</div>
		{:else}
			<div class="acct-state">
				<span class="acct-icon"><Plug size={20} aria-hidden="true" /></span>
				<div>
					<h2>{t(`เชื่อมต่อ ${programName}`, `Connect ${programName}`)}</h2>
					<p>{t(`${programName} ไม่ต้องลงชื่อเข้าใช้ กดเชื่อมต่อเพื่อดูว่า AI ทำอะไรได้บ้าง`, `${programName} needs no sign-in. Connect to see what AI can do.`)}</p>
					<div class="acct-actions"><button type="button" class="k-button primary acct-lg" onclick={() => connector.verify()}>{t('เชื่อมต่อ', 'Connect')}</button></div>
				</div>
			</div>
		{/if}
	</section>
{:else}
	<section class="acct-row" aria-live="polite" aria-busy={busy}>
		<div class="acct-row-main">
			{#if phase === 'loading' || phase === 'idle' || busy}
				<span class="acct-icon small"><LoaderCircle size={16} class="k-spin" aria-hidden="true" /></span>
				<div><strong>{phase === 'loading' ? t('กำลังโหลด…', 'Loading…') : busyLabel}</strong></div>
			{:else if phase === 'check'}
				<span class="acct-icon small ok"><CircleCheck size={16} aria-hidden="true" /></span>
				<div>
					<strong>{t('ไม่ต้องลงชื่อเข้าใช้', 'No sign-in needed')}</strong>
					<small>{t(`${programName} ไม่ใช้บัญชีของแต่ละคน`, `${programName} does not use a personal account`)}</small>
				</div>
			{:else if phase === 'connected' || phase === 'ready'}
				<span class="acct-icon small ok"><CircleCheck size={16} aria-hidden="true" /></span>
				<div>
					<strong>{connector.alreadyConnected ? t('เชื่อมด้วยบัญชีของคุณ', 'Connected with your account') : t('ไม่ต้องลงชื่อเข้าใช้', 'No sign-in needed')}</strong>
					<small>{phase === 'ready' ? t('ตรวจแล้ว ใช้งานได้', 'Checked: working') : t(`ORCA ใช้บัญชี ${programName} ของคุณดูว่า AI ทำอะไรได้`, `ORCA uses your ${programName} account to see what AI can do`)}</small>
				</div>
			{:else if phase === 'waiting'}
				<span class="acct-icon small"><LoaderCircle size={16} class="k-spin" aria-hidden="true" /></span>
				<div><strong>{t(`รอคุณอนุญาตในหน้าต่าง ${programName}…`, `Waiting for you in the ${programName} window…`)}</strong></div>
			{:else if phase === 'reconnect'}
				<span class="acct-icon small warn"><TriangleAlert size={16} aria-hidden="true" /></span>
				<div><strong>{t(`ต้องลงชื่อเข้าใช้ ${programName} ใหม่`, `Sign in to ${programName} again`)}</strong></div>
			{:else if phase === 'unavailable'}
				<span class="acct-icon small"><Plug size={16} aria-hidden="true" /></span>
				<div><strong>{t(`ยังเชื่อม ${programName} ไม่ได้ตอนนี้`, `${programName} can't be connected yet`)}</strong><small>{t('ทีม ORCA ต้องตั้งค่าโปรแกรมนี้ก่อน', 'The ORCA team must set this program up first')}</small></div>
			{:else if phase === 'failed'}
				<span class="acct-icon small deny"><CircleAlert size={16} aria-hidden="true" /></span>
				<div><strong>{t('โหลดสถานะบัญชีไม่สำเร็จ', 'Could not load your account')}</strong></div>
			{:else}
				<span class="acct-icon small warn"><LogIn size={16} aria-hidden="true" /></span>
				<div><strong>{t('ยังไม่ได้เชื่อมบัญชีของคุณ', 'Your account is not connected')}</strong><small>{t(`ลงชื่อเข้าใช้ ${programName} เพื่อให้ ORCA ตรวจสิ่งที่ AI ทำได้`, `Sign in to ${programName} so ORCA can check what AI can do`)}</small></div>
			{/if}
		</div>
		<div class="acct-row-actions">
			{#if !busy}
				{#if phase === 'connected' || phase === 'check'}
					<button type="button" class="k-button small" onclick={() => connector.verify()}>{phase === 'check' ? t('ตรวจการเชื่อมต่อ', 'Check the connection') : t('ตรวจบัญชี', 'Check the account')}</button>
					{#if connector.alreadyConnected && !connector.underReview}<button type="button" class="k-button small" onclick={useAnother}>{t('เชื่อมบัญชีใหม่', 'Connect another account')}</button>{/if}
				{:else if phase === 'ready' && connector.alreadyConnected && !connector.underReview}
					<button type="button" class="k-button small" onclick={useAnother}>{t('เชื่อมบัญชีใหม่', 'Connect another account')}</button>
				{:else if phase === 'signin'}
					<button type="button" class="k-button small" onclick={() => connector.signIn()}>{t(`ลงชื่อเข้าใช้ ${programName}`, `Sign in to ${programName}`)}</button>
				{:else if phase === 'reconnect'}
					<button type="button" class="k-button small" onclick={() => connector.signInAgain()}>{t('ลงชื่อเข้าใช้ใหม่', 'Sign in again')}</button>
				{:else if phase === 'waiting'}
					<a class="k-button small" href={connector.oauthURL} target="_blank" rel="noopener noreferrer">{t('เปิดหน้าต่างอีกครั้ง', 'Open the window again')}</a>
					<button type="button" class="k-button small quiet" onclick={() => connector.disconnect()}>{t('ยกเลิก', 'Cancel')}</button>
				{:else if phase === 'failed'}
					<button type="button" class="k-button small" onclick={() => connector.load()}>{t('ลองอีกครั้ง', 'Try again')}</button>
				{/if}
			{/if}
		</div>
		{#if connector.error && phase !== 'failed'}<p class="acct-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{connector.error}</p>{/if}
		{#if phase === 'fields'}<div class="acct-row-form">{@render fieldsForm()}</div>{/if}
	</section>
{/if}

<style>
	.acct-card {
		padding: 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
	}
	.acct-state {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}
	.acct-state > div {
		flex: 1;
		min-width: 0;
	}
	.acct-state h2 {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 700;
		line-height: 1.35;
	}
	.acct-state p {
		margin: 6px 0 0;
		color: var(--orca-muted);
		font-size: 14.5px;
		line-height: 1.55;
	}
	.acct-state .acct-small {
		margin-top: 12px;
		color: var(--orca-subtle);
		font-size: 13px;
	}
	.acct-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.acct-icon.small {
		width: 34px;
		height: 34px;
		border-radius: 9px;
	}
	.acct-icon.ok {
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.acct-icon.warn {
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
	}
	.acct-icon.deny {
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.acct-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 18px;
	}
	:global(.orca-workspace.orca-app) .k-button.acct-lg {
		min-height: 44px;
		padding: 0 20px;
		font-size: 15px;
		font-weight: 600;
	}
	.acct-error {
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
	.acct-error :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.acct-form {
		margin: 20px 0 0 60px;
		max-width: 560px;
	}
	.acct-form fieldset {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.acct-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.acct-field-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.acct-field label {
		font-size: 14px;
		font-weight: 600;
	}
	.acct-field label em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 400;
	}
	.acct-field input {
		width: 100%;
		padding: 11px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
	}
	.acct-where {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-text-2);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.acct-help {
		padding: 10px 12px;
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		color: var(--orca-text-2);
		font-size: 13px;
		line-height: 1.55;
	}
	.acct-help p {
		margin: 0 0 6px;
	}
	.acct-help a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--orca-ink);
		font-weight: 600;
		text-underline-offset: 3px;
	}
	.acct-form .acct-actions {
		margin-top: 4px;
	}
	.acct-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
	}
	.acct-row-main {
		display: flex;
		flex: 1 1 320px;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.acct-row-main strong {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
	}
	.acct-row-main small {
		display: block;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.acct-row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.acct-row .acct-error {
		flex-basis: 100%;
		margin: 0;
	}
	.acct-row-form {
		flex-basis: 100%;
	}
	.acct-row-form .acct-form {
		margin: 4px 0 0 46px;
	}
	@media (max-width: 720px) {
		.acct-card {
			padding: 18px;
		}
		.acct-state {
			gap: 12px;
		}
		.acct-icon {
			width: 38px;
			height: 38px;
		}
		.acct-form,
		.acct-row-form .acct-form {
			margin-left: 0;
		}
	}
</style>
