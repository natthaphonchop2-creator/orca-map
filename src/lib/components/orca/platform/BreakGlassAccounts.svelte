<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Info, KeyRound, LoaderCircle, Plus, ShieldAlert } from '@lucide/svelte';
	import { LOCAL_AUTH_MIN_PASSWORD_LENGTH } from '$lib/constants';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import { OrcaService, displayDate, memberName, memberRole, orcaError, type OrcaBootstrap, type OrcaBreakGlassLogin } from '$lib/services/orca';
	import { passwordAccounts, passwordListCurrent, type PasswordAccountRow, type PasswordAccountState } from '$lib/services/orca-platform';
	import PageHeader from '../ui/PageHeader.svelte';
	import Sheet from '../ui/Sheet.svelte';
	import StatusPill, { type StatusTone } from '../ui/StatusPill.svelte';
	import { showToast } from '../ui/toast-store.svelte';

	// แพลตฟอร์ม ORCA › บัญชีฉุกเฉิน: email-and-password accounts of the ORCA
	// team's own company, for when Google sign-in can't be used. Only the ORCA
	// team sees or changes them (the page, and the server); a customer company
	// never chooses anyone's password, since one person may be in several.
	// The server lists exactly these accounts, each with its account's role and
	// status in the ORCA team's company (backend B6); the page shows them as sent.
	let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
	const allowed = $derived(data.canManage && data.platformOperator === true);
	let accounts = $state<OrcaBreakGlassLogin[]>([]);
	let loaded = $state(false);
	let available = $state(false);
	let availabilityError = $state('');
	let loading = $state(false);
	let sheetOpen = $state(false);
	let resetting = $state<PasswordAccountRow>();
	let email = $state('');
	let password = $state('');
	let saving = $state(false);
	let formError = $state('');
	const rows = $derived(passwordAccounts(accounts, data.members, data.currentUserID));
	const current = $derived(passwordListCurrent(accounts));
	/** Resetting your own password signs this page out too. */
	const resettingSelf = $derived(!!resetting?.self);

	const stateLabel = (state: PasswordAccountState) =>
		({
			active: t('ใช้งานอยู่', 'Active'),
			// No account yet: before the first sign-in, or after the account was deleted.
			waiting: t('รอเข้าสู่ระบบ', 'Waiting for sign-in'),
			suspended: t('ถูกระงับ', 'Suspended'),
			removed: t('นำออกแล้ว', 'Removed')
		})[state];
	const stateTone = (state: PasswordAccountState): StatusTone =>
		(({ active: 'ok', waiting: 'warn', suspended: 'deny', removed: 'neutral' }) as const)[state];
	/** Who chose the password now in use. */
	const originLabel = (origin: OrcaBreakGlassLogin['passwordOrigin']) =>
		origin === 'admin' ? t('ทีม ORCA ตั้งให้', 'Set by the ORCA team') : origin === 'self' ? t('เจ้าของบัญชีตั้งเอง', 'Chosen by its owner') : '';

	async function refresh() {
		if (!allowed) return;
		loading = true;
		availabilityError = '';
		try {
			accounts = await OrcaService.localUsers();
			available = true;
		} catch (cause) {
			available = false;
			availabilityError = orcaError(cause);
		} finally {
			loading = false;
			loaded = true;
		}
	}
	onMount(() => void refresh());
	onDestroy(() => {
		password = '';
	});

	function start(row?: PasswordAccountRow) {
		if (!allowed || !available || (row && !row.canReset)) return;
		resetting = row;
		email = row?.account.email ?? '';
		password = '';
		formError = '';
		sheetOpen = true;
	}
	function closed() {
		password = '';
		formError = '';
	}
	async function save() {
		if (saving || !allowed) return;
		const address = email.trim().toLowerCase();
		if (!resetting && !address) {
			formError = t('กรอกอีเมล', 'Enter the email.');
			return;
		}
		if (password.length < LOCAL_AUTH_MIN_PASSWORD_LENGTH) {
			formError = t(`รหัสผ่านต้องยาวอย่างน้อย ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} ตัวอักษร`, `The password needs at least ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} characters.`);
			return;
		}
		saving = true;
		formError = '';
		try {
			if (resetting) await OrcaService.resetLocalPassword(resetting.account.id, password);
			else await OrcaService.createLocalUser(address, password);
			const reset = !!resetting;
			password = '';
			sheetOpen = false;
			showToast(
				reset
					? t('เปลี่ยนรหัสผ่านแล้ว บัญชีนี้ต้องเข้าสู่ระบบใหม่บนทุกอุปกรณ์', 'Password changed. This account must sign in again on every device.')
					: t('สร้างบัญชีแล้ว ส่งอีเมลและรหัสผ่านให้เจ้าของบัญชีเองทางช่องทางที่ปลอดภัย', 'Account created. Send the email and password to its owner yourself, through a safe channel.'),
				{ tone: 'ok' }
			);
			await refresh();
			await onchanged();
		} catch (cause) {
			formError = orcaError(cause);
		} finally {
			saving = false;
			password = '';
		}
	}
</script>

{#if allowed}
	<PageHeader title={term('breakGlass', t)} subtitle={t('ใช้เมื่อเข้าสู่ระบบด้วย Google ไม่ได้', "For when Google sign-in can't be used.")}>
		{#snippet action()}{#if available}<button type="button" class="k-button primary breakglass-create" onclick={() => start()}><Plus size={16} aria-hidden="true" />{t('สร้างบัญชีรหัสผ่าน', 'Create a password account')}</button>{/if}{/snippet}
	</PageHeader>

	<p class="breakglass-note">
		<ShieldAlert size={18} aria-hidden="true" />
		<span>{t('ใช้เฉพาะกรณีฉุกเฉิน ลูกค้าไม่ใช้บัญชีแบบนี้ ทุกคนในบริษัทลูกค้าเข้าสู่ระบบด้วย Google ผ่านลิงก์เชิญ ORCA ไม่ส่งรหัสผ่านให้ใคร', "For emergencies only. Customers never use these: everyone in a customer company signs in with Google through an invitation link. ORCA never sends a password to anyone.")}</span>
	</p>

	{#if availabilityError}
		<div class="breakglass-callout" role="alert">
			<Info size={17} aria-hidden="true" />
			<div>
				<strong>{t('ตอนนี้ใช้บัญชีอีเมลและรหัสผ่านไม่ได้', 'Email-and-password accounts are unavailable right now')}</strong>
				<p>{availabilityError}</p>
			</div>
			<button type="button" class="k-link-button" disabled={loading} onclick={refresh}>{t('ลองอีกครั้ง', 'Try again')}</button>
		</div>
	{:else if !loaded}
		<p class="breakglass-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t('กำลังโหลดบัญชี…', 'Loading accounts…')}</p>
	{:else if rows.length}
		{#if !current}
			<div class="breakglass-callout" role="status">
				<Info size={17} aria-hidden="true" />
				<div>
					<strong>{t('ORCA กำลังอัปเดต', 'ORCA is updating')}</strong>
					<p>{t('รายการนี้ยังเป็นแบบเดิม ซึ่งรวมบัญชี Google ของลูกค้าด้วย ตั้งรหัสผ่านใหม่ได้เมื่ออัปเดตเสร็จ', "This list is still the old one, which includes customers' Google accounts. Password resets come back once the update is done.")}</p>
				</div>
				<button type="button" class="k-link-button" disabled={loading} onclick={refresh}>{t('โหลดใหม่', 'Reload')}</button>
			</div>
		{/if}
		<section class="breakglass-list" aria-labelledby="breakglass-list-title">
			<h2 id="breakglass-list-title" class="breakglass-sr">{t('บัญชีรหัสผ่าน', 'Password accounts')}</h2>
			<table class="breakglass-table">
				<thead>
					<tr>
						<th scope="col">{t('บัญชี', 'Account')}</th>
						<th scope="col">{t('บทบาท', 'Role')}</th>
						<th scope="col">{t('สถานะ', 'Status')}</th>
						<th scope="col">{t('รหัสผ่าน', 'Password')}</th>
						<th scope="col">{t('สร้างเมื่อ', 'Created')}</th>
						<th scope="col" class="breakglass-actions"><span class="breakglass-sr">{t('การจัดการ', 'Actions')}</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.account.id)}
						<tr>
							<td>
								<div class="breakglass-account">
									<span class="breakglass-mark" aria-hidden="true"><KeyRound size={16} /></span>
									<span>
										<strong>{row.account.email}{#if row.self}<span class="breakglass-you">{t(' (คุณ)', ' (you)')}</span>{/if}</strong>
										{#if row.member && memberName(row.member) !== row.account.email}<small>{memberName(row.member)}</small>{/if}
									</span>
								</div>
							</td>
							<td class="breakglass-role" class:none={!row.account.role}>{row.account.role ? memberRole(row.account.role) : '—'}</td>
							<td class="breakglass-state"><StatusPill label={stateLabel(row.state)} tone={stateTone(row.state)} /></td>
							<td class="breakglass-origin" class:none={!originLabel(row.account.passwordOrigin)}><span class="breakglass-card-label">{t('รหัสผ่าน', 'Password')}</span>{originLabel(row.account.passwordOrigin) || '—'}</td>
							<td class="breakglass-created"><span class="breakglass-card-label">{t('สร้างเมื่อ', 'Created')}</span>{displayDate(row.account.created)}</td>
							<td class="breakglass-actions">
								{#if row.canReset}<button type="button" class="k-button small" onclick={() => start(row)} aria-label={t(`ตั้งรหัสผ่านใหม่ให้ ${row.account.email}`, `Reset password for ${row.account.email}`)}>{t('ตั้งรหัสผ่านใหม่', 'Reset password')}</button>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{:else}
		<p class="breakglass-empty"><KeyRound size={20} aria-hidden="true" />{t('ยังไม่มีบัญชีรหัสผ่าน ทุกคนเข้าสู่ระบบด้วย Google', 'No password accounts yet. Everyone signs in with Google.')}</p>
	{/if}

	<Sheet
		bind:open={sheetOpen}
		title={resetting ? t('ตั้งรหัสผ่านใหม่', 'Set a new password') : t('สร้างบัญชีรหัสผ่าน', 'Create a password account')}
		description={resetting
			? resettingSelf
				? t('นี่คือบัญชีของคุณ หลังบันทึก คุณต้องเข้าสู่ระบบใหม่บนทุกอุปกรณ์ รวมถึงหน้านี้', 'This is your own account. After saving, you must sign in again on every device, this page included.')
				: resetting.state === 'waiting'
					? t('บัญชีนี้ยังไม่ได้เข้าสู่ระบบ ใช้รหัสผ่านใหม่นี้ตอนเข้าสู่ระบบ', "This account hasn't signed in yet. It signs in with this new password.")
					: t('บัญชีนี้ต้องเข้าสู่ระบบใหม่บนทุกอุปกรณ์', 'This account must sign in again on every device.')
			: t('บัญชีนี้เข้าบริษัทของทีม ORCA หลังเข้าสู่ระบบครั้งแรก', "This account joins the ORCA team's company after its first sign-in.")}
		busy={saving}
		onclose={closed}
	>
		<form
			id="breakglass-form"
			class="breakglass-form"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<fieldset disabled={saving}>
				{#if resetting}
					<span class="breakglass-label">{t('อีเมล', 'Email')}</span>
					<p class="breakglass-readonly">{email}</p>
				{:else}
					<label for="breakglass-email">{t('อีเมล', 'Email')}</label>
					<input id="breakglass-email" type="email" bind:value={email} required autocomplete="off" spellcheck="false" />
				{/if}
				<label for="breakglass-password">{resetting ? t('รหัสผ่านใหม่', 'New password') : t('รหัสผ่าน', 'Password')}</label>
				<input id="breakglass-password" type="password" bind:value={password} minlength={LOCAL_AUTH_MIN_PASSWORD_LENGTH} required autocomplete="new-password" aria-describedby="breakglass-password-hint" />
				<p class="breakglass-hint" id="breakglass-password-hint">{t(`อย่างน้อย ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} ตัวอักษร ORCA ไม่ส่งอีเมลหรือรหัสผ่านให้ใคร ส่งให้เจ้าของบัญชีเองทางช่องทางที่ปลอดภัย`, `At least ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} characters. ORCA sends nothing; give them to the account's owner yourself, through a safe channel.`)}</p>
				{#if formError}<p class="breakglass-error" role="alert">{formError}</p>{/if}
			</fieldset>
		</form>
		{#snippet footer()}
			<button type="button" class="k-button" disabled={saving} onclick={() => (sheetOpen = false)}>{t('ยกเลิก', 'Cancel')}</button>
			<button type="submit" form="breakglass-form" class="k-button primary" disabled={saving}>{#if saving}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{resetting ? t('บันทึกรหัสผ่าน', 'Save password') : t('สร้างบัญชี', 'Create account')}</button>
		{/snippet}
	</Sheet>
{/if}

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.breakglass-create {
		min-height: 42px;
		padding: 0 18px;
		font-weight: 600;
	}
	.breakglass-note {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 0 0 18px;
		padding: 13px 16px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-warn-bg);
		color: var(--orca-text-2);
		font-size: 13.5px;
		line-height: 1.6;
	}
	.breakglass-note :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.breakglass-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px 10px;
		padding: 14px 16px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 13.5px;
	}
	.breakglass-callout > div {
		flex: 1 1 240px;
	}
	.breakglass-callout p {
		margin: 2px 0 0;
		color: var(--orca-text-2);
	}
	.breakglass-callout :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.breakglass-loading,
	.breakglass-empty {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		padding: 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.breakglass-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.breakglass-list {
		container: breakglass / inline-size;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
	}
	.breakglass-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13.5px;
	}
	.breakglass-table th {
		padding: 11px 18px;
		border-bottom: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 12px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}
	.breakglass-table td {
		padding: 13px 18px;
		border-top: 1px solid var(--orca-line-soft);
		vertical-align: middle;
	}
	.breakglass-table tbody tr:first-child td {
		border-top: 0;
	}
	.breakglass-account {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.breakglass-account strong {
		display: block;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.breakglass-account small {
		display: block;
		color: var(--orca-muted);
		font-size: 12px;
	}
	.breakglass-mark {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.breakglass-role,
	.breakglass-origin,
	.breakglass-created {
		color: var(--orca-text-2);
		white-space: nowrap;
	}
	.breakglass-actions {
		width: 1%;
		text-align: right;
		white-space: nowrap;
	}
	.breakglass-actions .k-button {
		white-space: nowrap;
	}
	.breakglass-form fieldset {
		display: grid;
		gap: 6px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.breakglass-form label,
	.breakglass-label {
		margin-top: 10px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.breakglass-form :is(label, .breakglass-label):first-child {
		margin-top: 0;
	}
	.breakglass-readonly {
		margin: 0;
		padding: 10px 12px;
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		color: var(--orca-text-2);
		font-size: 13.5px;
		overflow-wrap: anywhere;
	}
	.breakglass-form input {
		width: 100%;
		min-height: 32px;
		padding: 9px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius-sm);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
	}
	.breakglass-hint {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.breakglass-error {
		margin: 8px 0 0;
		padding: 10px 12px;
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 13px;
	}
	/* Each account is a card when the list is narrower than the table needs (a phone, or a laptop
	   with the sidebar open), so emails never break letter by letter. */
	.breakglass-card-label {
		display: none;
	}
	.breakglass-you {
		color: var(--orca-muted);
		font-weight: 500;
	}
	@container breakglass (max-width: 760px) {
		.breakglass-table thead {
			display: none;
		}
		.breakglass-table,
		.breakglass-table tbody,
		.breakglass-table tr,
		.breakglass-table td {
			display: block;
			width: auto;
		}
		.breakglass-table tr {
			padding: 14px 16px;
			border-top: 1px solid var(--orca-line-soft);
		}
		.breakglass-table tbody tr:first-child {
			border-top: 0;
		}
		.breakglass-table td {
			padding: 3px 0 3px 44px;
			border: 0;
		}
		.breakglass-table td:first-child {
			padding-left: 0;
		}
		.breakglass-actions {
			text-align: left;
		}
		.breakglass-actions:empty,
		.breakglass-role.none,
		.breakglass-origin.none {
			display: none;
		}
		.breakglass-card-label {
			display: inline;
			margin-right: 4px;
			color: var(--orca-muted);
		}
	}
</style>
