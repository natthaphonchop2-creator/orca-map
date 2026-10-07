<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { Check, Copy, Info } from '@lucide/svelte';
	import { aiConnectionLine } from '$lib/orca/ai-connection';
	import { aiConnection, setAIConnection } from '$lib/orca/ai-connection.svelte';
	import type { AIApp } from '$lib/orca/client-config';
	import { companyPinned, currentCompany } from '$lib/orca/company';
	import { companyStop } from '$lib/orca/company-stop';
	import {
		AI_APP_KEY,
		aiConnectionFrom,
		appName,
		connectAccess,
		connectedSession,
		connectorName,
		createPoller,
		examplePrompts,
		isChatApp,
		liveKeys,
		liveSessions,
		relativeWhen,
		rememberedApp,
		revokedKey,
		usableProgramNames,
		validConnectLink,
		withoutRevoked
	} from '$lib/orca/connect-ai';
	import { term } from '$lib/orca/glossary';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import { OrcaService, type OrcaBootstrap } from '$lib/services/orca';
	import { MyAIAppsService, aiAppsRevoked, aiAppsUnavailable, type MyAIApps, type MyAIKey } from '$lib/services/orca-ai-apps';
	import InAppBrowserNotice from '../InAppBrowserNotice.svelte';
	import AccessStrip from '../connect-ai/AccessStrip.svelte';
	import AIAppPicker from '../connect-ai/AIAppPicker.svelte';
	import AppSteps from '../connect-ai/AppSteps.svelte';
	import ConnectResult from '../connect-ai/ConnectResult.svelte';
	import ConnectStep from '../connect-ai/ConnectStep.svelte';
	import ConnectedAIList from '../connect-ai/ConnectedAIList.svelte';
	import ConsentDrawing from '../connect-ai/ConsentDrawing.svelte';
	import DeveloperKeys from '../connect-ai/DeveloperKeys.svelte';
	import ProgramSignIns from '../connect-ai/ProgramSignIns.svelte';
	import CopyField from '../ui/CopyField.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import PageTabs from '../ui/PageTabs.svelte';
	import { myAITabs } from './MyAIFrame.svelte';
	import SupportContact from '../ui/SupportContact.svelte';
	import { copyFeedback, copyText } from '../ui/copy';

	// view=connect-ai, AI ของฉัน (W0; was "เชื่อม AI ของฉัน", proposal §3.1):
	// who the AI will reach, five steps from choosing the app to a live check
	// (B1, polled while waiting), then the person's connected AI apps, their
	// program sign-ins and, collapsed, keys for developers.
	let { data, onchanged }: { data: OrcaBootstrap; onchanged?: () => void | Promise<void> } = $props();

	const access = $derived(connectAccess(data));
	const ready = $derived(access.usable.length > 0);
	const endpoint = $derived(data.unifiedConnectURL?.trim() ?? '');
	const linkOK = $derived(validConnectLink(endpoint));
	const host = $derived(linkOK ? new URL(endpoint).host : '');
	// Named when this person has several companies, so each connection says which.
	const companyName = $derived(companyPinned() ? data.organization.displayName : '');
	const connector = $derived(connectorName(companyName));
	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	const lang = $derived(orcaLocale.value);

	function storage() {
		try {
			return typeof window === 'undefined' ? undefined : window.localStorage;
		} catch {
			return undefined;
		}
	}
	let app = $state<AIApp>(rememberedApp(storage()));
	const name = $derived(appName(app, t));
	function choose(next: AIApp) {
		app = next;
		try {
			storage()?.setItem(AI_APP_KEY, next);
		} catch {
			// A per-viewer convenience only.
		}
	}
	let linkCopied = $state(false);

	// ---------- B1: the person's AI apps, polled while step 5 waits ----------
	let apps = $state<MyAIApps>();
	let appsState = $state<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
	let legacyKeys = $state<MyAIKey[]>([]);
	let checkedAt = $state(Date.now());
	// A developer tool's new sign-in counts from a little before the page opened,
	// so a server clock a few minutes behind this device does not hide it.
	const newSince = Date.now() - 5 * 60_000;
	const session = $derived(connectedSession(apps, app, checkedAt, newSince));
	const waiting = $derived(ready && linkOK && appsState !== 'unavailable' && !session);
	let generation = 0;
	let destroyed = false;
	// Disconnected here: gone from the list and the pin at once, and never back
	// from a read that started before, or when the next read fails (Codex
	// release review 67).
	const revoked = new Set<string>();
	function disconnected(item?: { kind: 'session' | 'key'; id: string | number }) {
		if (item) {
			revoked.add(revokedKey(item.kind, item.id));
			// The pin's own read, if one is on its way, says nothing about now.
			aiAppsRevoked();
			if (apps) {
				apps = withoutRevoked(apps, revoked);
				setAIConnection(aiConnectionFrom(apps, checkedAt, t));
			}
			if (item.kind === 'key') legacyKeys = legacyKeys.filter((key) => key.id !== item.id);
		}
		return refreshApps();
	}

	async function load(): Promise<'continue' | 'stop'> {
		const request = ++generation;
		try {
			const result = withoutRevoked(await MyAIAppsService.list(), revoked);
			if (request === generation && !destroyed) {
				apps = result;
				appsState = 'ready';
				checkedAt = Date.now();
				setAIConnection(aiConnectionFrom(result, checkedAt, t));
				if (anchorPending) void tick().then(() => requestAnimationFrame(revealAccounts));
			}
		} catch (cause) {
			if (request === generation && !destroyed) {
				// No B1 on this server yet (or no access here): a static hint, a
				// neutral pin, and the company-wide keys the old way.
				if (aiAppsUnavailable(cause)) {
					appsState = 'unavailable';
					setAIConnection({ state: 'unknown' });
					void loadLegacyKeys();
					return 'stop';
				}
				if (appsState === 'loading') appsState = 'error';
			}
		}
		return !destroyed && waiting ? 'continue' : 'stop';
	}
	async function loadLegacyKeys() {
		try {
			const keys = await OrcaService.orcaKeys();
			if (!destroyed)
				legacyKeys = keys
					.filter((key) => !revoked.has(revokedKey('key', key.id)))
					.map((key) => ({ id: key.id, name: key.name, hubID: '', createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, expiresAt: key.expiresAt }));
		} catch {
			// The list stays empty; creating a key still works.
		}
	}
	let poller: ReturnType<typeof createPoller> | undefined;
	function refreshApps() {
		if (appsState === 'unavailable') return loadLegacyKeys();
		return poller?.poke();
	}

	// An old link or a redirect to "#accounts" (บัญชีโปรแกรมของคุณ): the section renders after the
	// company's data, so the browser's own jump to it happened too early. Go there once it is on the
	// page, and once more after B1 answers (the list above it changes height), unless the person moved.
	let anchorPending = false;
	function revealAccounts() {
		if (!anchorPending || typeof document === 'undefined') return;
		const target = document.getElementById('accounts');
		if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
	}
	function stopRevealing() {
		anchorPending = false;
	}

	onMount(() => {
		anchorPending = window.location.hash === '#accounts';
		if (anchorPending) {
			requestAnimationFrame(revealAccounts);
			for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const) window.addEventListener(type, stopRevealing, { once: true, passive: true });
		}
		// Never again once the company is suspended or closed (company-stop).
		poller = createPoller(load, { interval: 4000, visible: () => document.visibilityState !== 'hidden', until: companyStop.pageSignal() });
		void poller.poke();
		// Hidden: no requests. Shown again (back from Claude's tab): check at once.
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') poller?.pause();
			else if (untrack(() => waiting)) void poller?.poke();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			destroyed = true;
			for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const) window.removeEventListener(type, stopRevealing);
			document.removeEventListener('visibilitychange', onVisibility);
			poller?.stop();
		};
	});
	// Waiting again (another app chosen, or a sign-in disconnected): resume.
	$effect(() => {
		if (waiting && poller && !poller.waiting) untrack(() => void poller?.poke());
	});

	const sessions = $derived(liveSessions(apps, checkedAt));
	const keys = $derived(appsState === 'unavailable' ? legacyKeys : liveKeys(apps, checkedAt));
	const prompts = $derived(examplePrompts(usableProgramNames(access.usable, data.connections), t));
	// A failed first check is not "waiting": it says so and offers a retry (Codex release review 63).
	const result = $derived(session ? 'connected' : !ready ? 'idle' : appsState === 'unavailable' ? 'unknown' : appsState === 'error' ? 'error' : 'waiting');
	function stepState(step: number): 'done' | 'current' | 'upcoming' {
		if (session) return 'done';
		if (!ready) return 'upcoming';
		if (step === 1) return 'done';
		if (step === 2) return linkCopied ? 'done' : 'current';
		return step === 3 && linkCopied ? 'current' : 'upcoming';
	}

	// ---------- Copying the connector's name ----------
	let nameCopied = $state(false);
	const nameFeedback = copyFeedback((on) => (nameCopied = on));
	async function copyName() {
		if (await copyText(connector, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document)) nameFeedback.copied();
	}
	$effect(() => () => {
		nameFeedback.dispose();
	});
</script>

<div class="ca">
	<PageHeader
		title={term('myAI', t)}
		subtitle={t('ใช้ ORCA ใน ChatGPT หรือ Claude', 'Use ORCA in ChatGPT or Claude.')}
		status={aiConnection.state === 'unknown' ? undefined : { label: aiConnectionLine(aiConnection, t), tone: aiConnection.state === 'connected' && !aiConnection.only?.length ? 'ok' : 'neutral' }}
	/>
	<!-- W0: Owners and Admins also see every AI app of the company (ทั้งบริษัท, was ตรวจสอบ › แอป AI ที่เชื่อมอยู่). -->
	{#if data.canManage}<PageTabs tabs={myAITabs(t)} current="connect-ai" label={term('myAI', t)} />{/if}

	<!-- LINE or Facebook's own browser, where Google refuses sign-in (critique 13): the shared notice. -->
	<InAppBrowserNotice level={2} variant="workspace" />

	<div class="ca-strip"><AccessStrip {data} {access} {onchanged} /></div>

	<ol class="ca-steps" class:dim={!ready} inert={!ready} aria-label={t('ขั้นตอนเชื่อม AI', 'Steps to connect your AI')}>
		<ConnectStep number={1} state={stepState(1)} id="ca-step-1" title={t('เลือก AI ที่คุณใช้', 'Choose the AI you use')}>
			{#snippet lead()}{t(`เลือก ${name} แล้ว เปลี่ยนได้ทุกเมื่อ`, `${name} chosen. Change it any time.`)}{/snippet}
			<AIAppPicker {app} onselect={choose} />
		</ConnectStep>

		<ConnectStep number={2} state={stepState(2)} id="ca-step-2" title={t('คัดลอกลิงก์ ORCA ของบริษัท', "Copy your company's ORCA link")}>
			{#snippet lead()}{t('ทุกคนในบริษัทใช้ลิงก์เดียวกันนี้ AI จะเห็นเฉพาะข้อมูลที่คุณได้รับสิทธิ์', 'Everyone uses this same link. Your AI sees only what you are allowed to see.')}{/snippet}
			{#if linkOK}
				<div class="ca-panel">
					<div class="ca-copy">
						<CopyField value={endpoint} label={t(`ลิงก์ ORCA ของ${data.organization.displayName}`, `${data.organization.displayName}'s ORCA link`)} buttonLabel={t('คัดลอกลิงก์ ORCA', 'Copy ORCA link')} oncopied={() => (linkCopied = true)} />
					</div>
					{#if isChatApp(app)}
						<div class="ca-namerow">
							<span class="ca-namelabel">{t(`ชื่อที่ต้องพิมพ์ใน ${name}`, `Name to type in ${name}`)}</span>
							<span class="ca-chip"><span>{connector}</span><button type="button" onclick={copyName} aria-label={t(`คัดลอกชื่อ ${connector}`, `Copy the name ${connector}`)}>{#if nameCopied}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอกชื่อ', 'Copy name')}{/if}</button></span>
						</div>
					{/if}
				</div>
				<p class="ca-tip"><Info size={15} aria-hidden="true" />{t('ถ้าเคยเพิ่มลิงก์ของพื้นที่ทำงานไว้ ให้ลบออกแล้วใช้ลิงก์นี้แทน', 'If you added a workspace’s own link before, remove it and use this one instead.')}</p>
			{:else}
				<p class="ca-missing">{t('ยังไม่มีลิงก์ ORCA ของบริษัท โหลดหน้านี้ใหม่ หรือแจ้งผู้ดูแลบริษัท', "Your company's ORCA link is not available. Reload this page or tell a company admin.")}</p>
			{/if}
		</ConnectStep>

		<ConnectStep number={3} state={stepState(3)} id="ca-step-3" title={isChatApp(app) ? t(`วางใน ${name}`, `Paste it into ${name}`) : t(`ตั้งค่าใน ${name}`, `Set up ${name}`)}>
			{#snippet lead()}{isChatApp(app)
					? t(`ทำในหน้าตั้งค่าของ ${name} ไม่ถึง 1 นาที`, `In ${name}'s settings, under a minute.`)
					: t('ใช้ลิงก์จากขั้นที่ 2 คำสั่งด้านล่างใส่ลิงก์ไว้ให้แล้ว', 'Uses the link from step 2; the commands below already include it.')}{/snippet}
			{#if linkOK}<AppSteps {app} {endpoint} {connector} {companyName} />{/if}
		</ConnectStep>

		<ConnectStep number={4} state={stepState(4)} id="ca-step-4" title={t('เข้าสู่ระบบแล้วกดอนุญาต', 'Sign in and allow')}>
			{#snippet lead()}{#if app === 'claude'}{t('กด', 'Choose')} <b>Connect</b> {t('แล้วหน้าต่าง ORCA จะเด้งขึ้นมา', 'and the ORCA window opens')}{:else if app === 'chatgpt'}{t('กด', 'Choose')} <b>Create</b> {t('แล้วหน้าต่าง ORCA จะเด้งขึ้นมา', 'and the ORCA window opens')}{:else}{t('หน้าต่าง ORCA จะเปิดในเบราว์เซอร์เมื่อเริ่มเชื่อมต่อ', 'The ORCA window opens in your browser when it connects')}{/if}{/snippet}
			<ConsentDrawing app={name} host={host || 'orca'} name={me?.displayName ?? ''} email={me?.email ?? ''} />
		</ConnectStep>

		<ConnectStep number={5} state={stepState(5)} id="ca-step-5" title={t('ตรวจผล', 'Check it worked')}>
			{#snippet lead()}{#if result === 'unknown'}{t('หน้านี้ยังตรวจให้อัตโนมัติไม่ได้ ลองถามดูเอง', 'This page cannot check for you yet. Ask it yourself.')}{:else}{t('กดอนุญาตแล้ว หน้านี้จะขึ้นว่า', 'Once you allow, this page shows')} <b>{t('เชื่อมแล้ว', 'connected')}</b> {t('เอง', 'by itself')}{/if}{/snippet}
			<ConnectResult app={name} status={result} when={session ? relativeWhen(session.createdAt, checkedAt, t, lang) : ''} {prompts} onretry={() => void poller?.poke()} />
		</ConnectStep>
	</ol>

	<div class="ca-sep"></div>

	<div class="ca-more">
		<ConnectedAIList {sessions} {keys} hubs={data.hubs} now={checkedAt} legacy={appsState === 'unavailable'} onchanged={disconnected} />
		<ProgramSignIns {data} onshown={() => requestAnimationFrame(revealAccounts)} />
		{#if ready}<DeveloperKeys
			hubs={access.usable}
			{endpoint}
			{app}
			canManage={data.canManage}
			identity={JSON.stringify([currentCompany(), data.currentUserID, endpoint])}
			{companyName}
			oncreated={refreshApps}
		/>{/if}
	</div>

	<!-- The ORCA team's LINE and email come from $lib/orca/support (SupportContact). -->
	<p class="ca-help">
		{t('ติดขั้นไหน?', 'Stuck on a step?')}
		<a href={localeHref('/app?view=help')}>{t('ดูคำตอบในหน้าช่วยเหลือ', 'See the Help page')}</a>{#if data.canManage}{t(' หรือ', ' or ')}{:else}{t(' ถามผู้ดูแลบริษัท หรือ', ', ask a company admin, or ')}{/if}<SupportContact midSentence />
	</p>
</div>

<style>
	/* orca-type-remap v1 */
	.ca {
		container: ca / inline-size;
		max-width: 1040px;
	}
	.ca :global(.orca-page-header) {
		margin-bottom: 22px;
	}
	.ca-strip {
		margin-bottom: 36px;
	}
	.ca-steps {
		margin: 0;
		padding: 0;
		list-style: none;
		transition: opacity 0.2s var(--orca-ease);
	}
	/* No workspace yet: the steps stay visible, so the person sees what comes next. */
	.ca-steps.dim {
		opacity: 0.45;
		filter: grayscale(0.6);
	}
	.ca-panel {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.ca-copy {
		padding: 18px;
	}
	.ca-copy :global(.orca-copy.large .orca-copy-button) {
		min-height: 52px;
		padding: 0 22px;
		font-size: 14px;
	}
	.ca-copy :global(.orca-copy-label) {
		color: var(--orca-subtle);
		font-size: 11.5px;
		font-weight: 600;
	}
	.ca-copy :global(.orca-copy-value code) {
		color: var(--orca-text-2);
		font-size: 12px;
		line-height: 1.5;
	}
	.ca-namerow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 13px 18px;
		border-top: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		font-size: 13.5px;
	}
	.ca-namelabel {
		color: var(--orca-muted);
	}
	.ca-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		padding: 3px 4px 3px 12px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-weight: 600;
	}
	.ca-chip > span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ca-chip button {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		margin-left: 4px;
		padding: 3px 8px 3px 10px;
		border: 0;
		border-left: 1px solid var(--orca-line);
		border-radius: 0 var(--orca-radius-sm) var(--orca-radius-sm) 0;
		background: transparent;
		color: var(--orca-muted);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.ca-chip button:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.ca-tip {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.ca-tip :global(svg) {
		flex: none;
	}
	.ca-missing {
		margin: 0;
		padding: 14px 16px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.ca-sep {
		height: 1px;
		margin: 40px 0 28px;
		background: var(--orca-line);
	}
	.ca-more {
		display: grid;
		gap: 14px;
	}
	.ca-more > :global(*) {
		min-width: 0;
	}
	/* One sentence that wraps as text, so "หรือ" and the commas stay with their words. */
	.ca-help {
		margin: 22px 0 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.7;
	}
	.ca-help a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
	}
	@container ca (max-width: 560px) {
		.ca-strip {
			margin-bottom: 28px;
		}
		.ca-copy {
			padding: 16px;
		}
		.ca-copy :global(.orca-copy.large .orca-copy-button) {
			width: 100%;
		}
		.ca-namerow {
			padding: 12px 16px;
		}
		.ca-sep {
			margin: 32px 0 24px;
		}
	}
</style>
