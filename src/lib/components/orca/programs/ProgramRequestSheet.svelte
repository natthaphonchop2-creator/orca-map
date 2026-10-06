<script lang="ts">
	import { CircleCheck } from '@lucide/svelte';
	import { teamSizeFor } from '$lib/orca/program-catalog';
	import { orcaLocale, t } from '$lib/orca/locale.svelte';
	import { OrcaService, orcaError, type OrcaBootstrap } from '$lib/services/orca';
	import { untrack } from 'svelte';
	import Sheet from '../ui/Sheet.svelte';

	// "ไม่พบโปรแกรมที่ใช้? แจ้งทีม ORCA": the existing pilot-request inbox
	// (POST /orca/pilot-requests), with the person and company filled in.
	// Inside the workspace form's sheet it renders in place (`inline`), so a
	// sheet never opens on top of a sheet.
	let {
		open = $bindable(false),
		data,
		program = '',
		inline = false
	}: { open?: boolean; data: OrcaBootstrap; program?: string; inline?: boolean } = $props();

	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	let name = $state('');
	let work = $state('');
	let email = $state('');
	let consent = $state(false);
	let sending = $state(false);
	let error = $state('');
	let reference = $state('');
	let attempt: { key: string; body: string } | undefined;

	$effect(() => {
		if (!open) return;
		// Each opening starts from the page's search; a data refresh keeps what was typed.
		untrack(() => {
			name = program;
			work = '';
			email = me?.email ?? '';
			consent = false;
			error = '';
			reference = '';
			attempt = undefined;
		});
	});

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		if (!name.trim()) return void (error = t('บอกชื่อโปรแกรมที่อยากเชื่อม', 'Name the program you want to connect.'));
		if (!email.trim()) return void (error = t('กรอกอีเมลที่ให้ทีม ORCA ติดต่อกลับ', 'Enter an email the ORCA team can reply to.'));
		if (!consent) return void (error = t('ติ๊กยินยอมให้ทีม ORCA ติดต่อกลับก่อน', 'Agree to be contacted first.'));
		const useCase = [
			t(`โปรแกรมที่อยากเชื่อม: ${name.trim()}`, `Program to connect: ${name.trim()}`),
			work.trim() ? t(`งานที่อยากให้ AI ช่วย: ${work.trim()}`, `What AI should help with: ${work.trim()}`) : '',
			t('ส่งจากหน้าเชื่อมโปรแกรม', 'Sent from Connect a program')
		]
			.filter(Boolean)
			.join('\n');
		const input = {
			name: (me?.displayName || email).trim().slice(0, 120),
			email: email.trim(),
			organization: (data.organization.displayName || '-').slice(0, 160),
			teamSize: teamSizeFor(data.members.filter((member) => !member.status || member.status === 'active').length),
			useCase: useCase.slice(0, 3000),
			locale: orcaLocale.value === 'en' ? ('en' as const) : ('th' as const),
			consent: true,
			website: ''
		};
		// A retry of the same request keeps its key, so the inbox never gets it twice.
		const body = JSON.stringify({ ...input, locale: '' });
		if (!attempt || attempt.body !== body) attempt = { key: crypto.randomUUID(), body };
		sending = true;
		error = '';
		try {
			const result = await OrcaService.requestPilot(input, attempt.key);
			reference = result.reference;
			attempt = undefined;
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			sending = false;
		}
	}
</script>

{#snippet body()}
	{#if reference}
		<div class="request-done" role="status">
			<CircleCheck size={22} aria-hidden="true" />
			<div>
				<strong>{t('ส่งถึงทีม ORCA แล้ว', 'Sent to the ORCA team')}</strong>
				<p>{t(`เลขอ้างอิง ${reference} · ทีม ORCA จะติดต่อกลับทางอีเมล`, `Reference ${reference}. The ORCA team will reply by email.`)}</p>
			</div>
		</div>
		<button type="button" class="k-button" onclick={() => (open = false)}>{t('ปิด', 'Close')}</button>
	{:else}
		<!-- The fields wait while it sends: the receipt replaces the form, so typing then would be lost (Codex release review 67). -->
		<form class="request-form" onsubmit={send} novalidate>
			{#if error}<p class="request-error" role="alert">{error}</p>{/if}
			<label class="request-field">
				<span>{t('โปรแกรมที่อยากเชื่อม', 'Program to connect')}</span>
				<input bind:value={name} maxlength="120" required disabled={sending} placeholder={t('เช่น Express, SAP Business One', 'e.g. Express, SAP Business One')} />
			</label>
			<label class="request-field">
				<span>{t('อยากให้ AI ช่วยอะไร', 'What should AI help with')} <em>{t('(ไม่บังคับ)', '(optional)')}</em></span>
				<textarea bind:value={work} maxlength="1500" rows="3" disabled={sending} placeholder={t('เช่น สรุปยอดขายรายวันให้ทีมขาย', 'e.g. daily sales summaries for the sales team')}></textarea>
			</label>
			<label class="request-field">
				<span>{t('อีเมลที่ให้ติดต่อกลับ', 'Email to reply to')}</span>
				<input type="email" bind:value={email} maxlength="254" required autocomplete="email" disabled={sending} />
			</label>
			<label class="request-consent">
				<input type="checkbox" bind:checked={consent} disabled={sending} />
				<span>{t('ยินยอมให้ทีม ORCA ใช้ข้อมูลนี้ติดต่อกลับเรื่องโปรแกรมนี้', 'The ORCA team may use these details to reply about this program.')}</span>
			</label>
			<button type="submit" class="k-button primary" disabled={sending}>{sending ? t('กำลังส่ง…', 'Sending…') : t('ส่งถึงทีม ORCA', 'Send to the ORCA team')}</button>
		</form>
	{/if}
{/snippet}

{#if inline}
	{#if open}
		<section class="request-inline" aria-labelledby="request-inline-title">
			<header>
				<h2 id="request-inline-title">{t('แจ้งทีม ORCA', 'Tell the ORCA team')}</h2>
				<p>{t('บอกว่าใช้โปรแกรมอะไร ทีม ORCA จะติดต่อกลับเพื่อเพิ่มให้', "Tell us the program you use; the ORCA team will get back to you.")}</p>
			</header>
			{@render body()}
			{#if !reference}<button type="button" class="k-button quiet request-back" disabled={sending} onclick={() => (open = false)}>{t('ย้อนกลับ', 'Back')}</button>{/if}
		</section>
	{/if}
{:else}
<Sheet
	bind:open
	busy={sending}
	title={t('แจ้งทีม ORCA', 'Tell the ORCA team')}
	description={t('บอกว่าใช้โปรแกรมอะไร ทีม ORCA จะติดต่อกลับเพื่อเพิ่มให้', "Tell us the program you use; the ORCA team will get back to you.")}
>
	{@render body()}
</Sheet>
{/if}

<style>
	/* orca-type-remap v1 */
	.request-inline {
		padding: 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.request-inline header {
		margin-bottom: 16px;
	}
	.request-inline h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}
	.request-inline header p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.request-back {
		margin-top: 12px;
	}
	.request-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.request-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13.5px;
		font-weight: 600;
	}
	.request-field em {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 400;
	}
	.request-field input,
	.request-field textarea {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-weight: 400;
	}
	.request-consent {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		color: var(--orca-text-2);
		font-size: 13.5px;
		line-height: 1.5;
	}
	.request-consent input {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		flex: none;
		accent-color: var(--orca-control);
	}
	.request-form .k-button {
		align-self: flex-start;
	}
	.request-error {
		margin: 0;
		padding: 10px 12px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 13.5px;
	}
	.request-done {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 16px;
		padding: 14px 16px;
		border: 1px solid var(--orca-ok-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.request-done strong {
		display: block;
		color: var(--orca-ink);
		font-size: 14px;
	}
	.request-done p {
		margin: 2px 0 0;
		color: var(--orca-text-2);
		font-size: 13.5px;
	}
</style>
