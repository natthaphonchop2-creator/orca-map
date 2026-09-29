<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ArrowRight, Check, Copy, Info, UserPlus } from '@lucide/svelte';
	import { parseErrorContent } from '$lib/errors';
	import { keepCompany } from '$lib/orca/company';
	import { accessFix, accessRequestText, namesText, type ConnectAccess } from '$lib/orca/connect-ai';
	import { lineExternalURL } from '$lib/orca/in-app-browser';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { HubConflictError, hubConflictMessage, joinPatch, saveHubPatch } from '$lib/orca/workspace-edit';
	import { orcaError, type OrcaBootstrap } from '$lib/services/orca';
	import { hubWriteService } from '$lib/services/orca-workspaces';
	import { copyFeedback, copyText } from '../ui/copy';
	import { showToast } from '../ui/toast-store.svelte';

	// The line above the steps: which workspaces the person's AI will reach
	// through the company link. With none, the one thing that fixes it: a
	// manager adds themselves or creates the first workspace, and an employee
	// copies a request for their admin (generic: they cannot see who the admins are).
	let { data, access, onchanged }: { data: OrcaBootstrap; access: ConnectAccess; onchanged?: () => void | Promise<void> } = $props();
	const uid = $props.id();
	const fix = $derived(accessFix(data, access));
	const ownNames = $derived(namesText(access.ownSignIn.map((hub) => hub.name), t));
	// One workspace: its overview, where its own link is; several: the list.
	const ownHref = $derived(
		access.ownSignIn.length === 1 ? localeHref(`/app?view=hub&hub=${encodeURIComponent(access.ownSignIn[0].id)}&tab=overview`) : localeHref('/app?view=workspaces')
	);
	const shown = $derived(access.usable.slice(0, access.usable.length > 4 ? 3 : 4));
	const more = $derived(access.usable.length - shown.length);
	let chosen = $state('');
	// The chooser always names a real workspace, the first until one is picked.
	$effect.pre(() => {
		if (!access.joinable.some((hub) => hub.id === chosen)) chosen = access.joinable[0]?.id ?? '';
	});
	const target = $derived(access.joinable.find((hub) => hub.id === chosen) ?? access.joinable[0]);
	let busy = $state(false);
	let error = $state('');
	let stale = $state(false);

	async function addMe() {
		const hub = target;
		if (!hub || busy || !data.currentUserID) return;
		busy = true;
		error = '';
		stale = false;
		try {
			// From a fresh copy with its version, so nothing another admin just changed is overwritten (critique 2).
			const saved = await saveHubPatch(hub.id, (fresh) => joinPatch(fresh, data.currentUserID), hubWriteService);
			showToast(t(`เพิ่มคุณเข้า ${saved.name} แล้ว`, `You were added to ${saved.name}`));
			await onchanged?.();
		} catch (cause) {
			const status = parseErrorContent(cause).status;
			if (cause instanceof HubConflictError || status === 409) {
				stale = true;
				error = hubConflictMessage(t);
			} else if (status === 400 || status === 422) {
				error = t('ยังเพิ่มไม่ได้ เพราะพื้นที่ทำงานนี้ต้องแก้ไขก่อน เปิดพื้นที่ทำงานเพื่อดูว่าต้องแก้อะไร', 'This workspace needs fixing before you can join it. Open it to see what to fix.');
			} else error = orcaError(cause);
		} finally {
			busy = false;
		}
	}

	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	const requestURL = $derived.by(() => {
		const origin = typeof window === 'undefined' ? 'https://orca.invalid' : window.location.origin;
		const url = new URL('/app?view=workspaces', origin);
		keepCompany(url);
		return lineExternalURL(url.href);
	});
	const request = $derived(accessRequestText({ name: me?.displayName ?? '', email: me?.email ?? '', company: data.organization.displayName, url: requestURL }, t));
	let copied = $state(false);
	let copyFailed = $state(false);
	const feedback = copyFeedback((on) => (copied = on));
	onDestroy(() => feedback.dispose());
	async function copyRequest() {
		copyFailed = false;
		const ok = await copyText(request, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) feedback.copied();
		else copyFailed = true;
	}
</script>

{#if access.usable.length}
	<div class="ca-access ok">
		<span class="ca-icon" aria-hidden="true"><Check size={14} strokeWidth={2.6} /></span>
		<p class="ca-text">
			{t('AI ของคุณจะใช้ข้อมูลได้จาก', 'Your AI can use data from')} <b>{t(`${access.usable.length} พื้นที่ทำงาน:`, `${access.usable.length} ${access.usable.length === 1 ? 'workspace' : 'workspaces'}:`)}</b>
			<span class="ca-chips">{#each shown as hub (hub.id)}<span class="ca-chip">{hub.name}</span>{/each}{#if more > 0}<span class="ca-chip more">{t(`อีก ${more}`, `${more} more`)}</span>{/if}</span>
		</p>
		<a class="ca-link" href={localeHref('/app?view=workspaces')}>{t('ดูพื้นที่ทำงาน', 'See workspaces')}<ArrowRight size={15} aria-hidden="true" /></a>
	</div>
{:else if fix === 'own-sign-in'}
	<div class="ca-access own">
		<span class="ca-icon" aria-hidden="true"><Info size={15} /></span>
		<div class="ca-text">
			<b class="ca-title">{t('พื้นที่ทำงานของคุณต้องเชื่อมด้วยลิงก์ของพื้นที่นั้น', 'Your workspaces connect with their own link')}</b>
			<span>{t(
				`${ownNames} ใช้การเข้าสู่ระบบของบริษัทแยกต่างหาก ลิงก์ ORCA ของบริษัทจึงยังไม่มีข้อมูลให้ AI ของคุณ`,
				`${ownNames} ${access.ownSignIn.length === 1 ? 'uses its' : 'use their'} own company sign-in, so your company's ORCA link has no data for your AI yet.`
			)}</span>
			<div class="ca-actions"><a class="k-button" href={ownHref}>{access.ownSignIn.length === 1 ? t(`ดูลิงก์ของ ${access.ownSignIn[0].name}`, `See ${access.ownSignIn[0].name}'s link`) : t('ดูพื้นที่ทำงาน', 'See workspaces')}<ArrowRight size={15} aria-hidden="true" /></a></div>
		</div>
	</div>
{:else}
	<div class="ca-access none">
		<span class="ca-icon" aria-hidden="true"><Info size={15} /></span>
		<div class="ca-text">
			{#if data.canManage}
				<b class="ca-title">{t('ยังไม่มีข้อมูลให้ AI ของคุณใช้', 'There is no data for your AI yet')}</b>
				<span>{fix === 'join'
					? t('คุณยังไม่ได้อยู่ในพื้นที่ทำงาน AI ที่พร้อมใช้ เพิ่มตัวเองเข้าไป แล้วทำขั้นตอนด้านล่างต่อ', 'You are not in a ready AI workspace yet. Add yourself, then follow the steps below.')
					: fix === 'fix-workspace'
						? t('ยังไม่มีพื้นที่ทำงาน AI ที่พร้อมใช้ เปิดพื้นที่ทำงานเพื่อดูว่าต้องทำอะไรต่อ แล้วกลับมาทำขั้นตอนด้านล่าง', 'No AI workspace is ready yet. Open your workspaces to see what is left, then come back to the steps below.')
						: fix === 'add-program'
							? t('เริ่มจากเชื่อมโปรแกรมแรก เช่น FlowAccount แล้วให้ทีมใช้ จากนั้นกลับมาทำขั้นตอนด้านล่าง', 'Start by connecting your first program, such as FlowAccount, and share it with your team. Then come back to the steps below.')
							: t('สร้างพื้นที่ทำงาน AI แรก แล้วเลือกคนที่ใช้ได้ จากนั้นกลับมาทำขั้นตอนด้านล่าง', 'Create your first AI workspace and choose who can use it, then come back to the steps below.')}</span>
				{#if fix === 'join'}
					<div class="ca-actions">
						{#if access.joinable.length > 1}
							<label class="ca-visually-hidden" for="ca-join-{uid}">{t('พื้นที่ทำงานที่จะเข้าร่วม', 'Workspace to join')}</label>
							<select id="ca-join-{uid}" class="ca-select" bind:value={chosen} disabled={busy}>
								{#each access.joinable as hub (hub.id)}<option value={hub.id}>{hub.name}</option>{/each}
							</select>
						{/if}
						<button type="button" class="k-button primary" onclick={addMe} disabled={busy} aria-busy={busy}>
							<UserPlus size={16} aria-hidden="true" />{busy ? t('กำลังเพิ่ม…', 'Adding…') : access.joinable.length === 1 ? t(`เพิ่มฉันเข้า ${access.joinable[0].name}`, `Add me to ${access.joinable[0].name}`) : t('เพิ่มฉันเข้าพื้นที่ทำงานนี้', 'Add me to this workspace')}
						</button>
					</div>
					{#if error}
						<p class="ca-error" role="alert">{error}{#if stale}<button type="button" class="k-link-button" onclick={() => onchanged?.()}>{t('โหลดใหม่', 'Reload')}</button>{:else if target}<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(target.id)}&tab=overview`)}>{t('เปิดพื้นที่ทำงาน', 'Open the workspace')}</a>{/if}</p>
					{/if}
				{:else if fix === 'fix-workspace'}
					<div class="ca-actions"><a class="k-button primary" href={localeHref('/app?view=workspaces')}>{t('เปิดพื้นที่ทำงาน AI', 'Open AI workspaces')}</a></div>
				{:else if fix === 'add-program'}
					<div class="ca-actions"><a class="k-button primary" href={localeHref('/app?view=add-program')}>{t('เชื่อมโปรแกรมแรก', 'Connect your first program')}</a></div>
				{:else}
					<div class="ca-actions"><a class="k-button primary" href={localeHref('/app?view=new')}>{t('สร้างพื้นที่ทำงานแรก', 'Create the first workspace')}</a></div>
				{/if}
			{:else}
				<b class="ca-title">{t('คุณยังไม่ได้รับสิทธิ์ใช้ข้อมูลบริษัท', 'You do not have access to company data yet')}</b>
				<span>{t('ขอให้ผู้ดูแลบริษัทเพิ่มคุณเข้าพื้นที่ทำงาน AI ส่งข้อความนี้ให้ผู้ดูแลได้เลย', 'Ask a company admin to add you to an AI workspace. You can send them this message.')}</span>
				<blockquote class="ca-request">{request}</blockquote>
				<div class="ca-actions">
					<button type="button" class="k-button primary" onclick={copyRequest}>{#if copied}<Check size={16} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกข้อความขอสิทธิ์', 'Copy the request')}{/if}</button>
				</div>
				<span class="ca-visually-hidden" role="status" aria-live="polite">{copied ? t('คัดลอกแล้ว', 'Copied') : ''}</span>
				{#if copyFailed}<p class="ca-error" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}
			{/if}
		</div>
	</div>
{/if}
{#if access.ownSignIn.length && fix !== 'own-sign-in'}
	<p class="ca-own">
		<Info size={15} aria-hidden="true" />
		<span>{t(
			`${access.usable.length ? 'อีก ' : ''}${access.ownSignIn.length} พื้นที่ทำงาน (${ownNames}) ใช้การเข้าสู่ระบบของบริษัทแยกต่างหาก ต้องเชื่อมด้วยลิงก์ของพื้นที่นั้น`,
			`${access.ownSignIn.length} ${access.usable.length ? 'more ' : ''}workspace${access.ownSignIn.length === 1 ? '' : 's'} (${ownNames}) use${access.ownSignIn.length === 1 ? 's' : ''} ${access.ownSignIn.length === 1 ? 'its' : 'their'} own company sign-in. Connect ${access.ownSignIn.length === 1 ? 'it' : 'them'} with ${access.ownSignIn.length === 1 ? 'its' : 'their'} own link.`
		)}</span>
		<a href={ownHref}>{t('ดูลิงก์', 'See the link')}</a>
	</p>
{/if}

<style>
	.ca-access {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	.ca-access.ok {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
	}
	.ca-access.none {
		align-items: flex-start;
		padding: 16px 18px 18px 16px;
		border-color: var(--orca-warn-line);
		background: var(--orca-warn-bg);
	}
	.ca-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--orca-ok);
		color: var(--orca-on-ink);
	}
	.none .ca-icon {
		background: var(--orca-warn);
	}
	.ca-access.own {
		align-items: flex-start;
		padding: 16px 18px 18px 16px;
		background: var(--orca-surface-2);
	}
	.own .ca-icon {
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.ca-text {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
	}
	.ca-text b {
		font-weight: 600;
	}
	:is(.none, .own) .ca-text {
		display: grid;
		gap: 4px;
	}
	:is(.none, .own) .ca-text > span {
		color: var(--orca-text-2);
		font-size: 14px;
	}
	.ca-title {
		font-size: 15.5px;
	}
	.ca-chips {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-left: 6px;
		vertical-align: middle;
	}
	.ca-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 1px 10px;
		border: 1px solid var(--orca-ok-line);
		border-radius: 999px;
		background: var(--orca-surface);
		font-size: 13px;
		font-weight: 600;
		line-height: 1.6;
	}
	.ca-chip::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--orca-ok);
	}
	.ca-chip.more::before {
		display: none;
	}
	.ca-link {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}
	.ca-link:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.ca-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
	}
	.ca-actions .k-button {
		min-height: 40px;
		font-weight: 600;
	}
	.ca-select {
		min-width: 0;
		max-width: 100%;
		height: 40px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.ca-request {
		margin: 8px 0 0;
		padding: 10px 14px;
		border: 1px solid var(--orca-line);
		border-left-width: 3px;
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-text-2);
		font-size: 13.5px;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.ca-error {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		margin: 8px 0 0;
		color: var(--orca-deny);
		font-size: 13.5px;
	}
	.ca-error a,
	.ca-error button {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.ca-own {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 10px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.ca-own :global(svg) {
		flex: none;
		margin-top: 3px;
	}
	.ca-own a {
		flex: none;
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.ca-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@container ca (max-width: 560px) {
		.ca-access.ok {
			flex-wrap: wrap;
			align-items: flex-start;
		}
		.ca-access.ok .ca-text {
			flex-basis: calc(100% - 40px);
		}
		.ca-chips {
			margin: 4px 0 0;
		}
		.ca-link {
			margin-left: 38px;
		}
	}
</style>
