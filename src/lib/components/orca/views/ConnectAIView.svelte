<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Check, Copy, Globe, Info } from '@lucide/svelte';
	import { parseErrorContent } from '$lib/errors';
	import { aiConnectionLine } from '$lib/orca/ai-connection';
	import { aiConnection, setAIConnection } from '$lib/orca/ai-connection.svelte';
	import type { AIApp } from '$lib/orca/client-config';
	import { companyPinned, currentCompany } from '$lib/orca/company';
	import {
		AI_APP_KEY,
		aiConnectionFrom,
		appName,
		connectAccess,
		connectedSession,
		connectorName,
		createPoller,
		examplePrompts,
		inAppBrowser,
		isChatApp,
		liveKeys,
		liveSessions,
		relativeWhen,
		rememberedApp,
		usableProgramNames,
		validConnectLink,
		withExternalBrowser
	} from '$lib/orca/connect-ai';
	import { term } from '$lib/orca/glossary';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import { OrcaService, type OrcaBootstrap } from '$lib/services/orca';
	import { MyAIAppsService, aiAppsUnavailable, type MyAIApps, type MyAIKey } from '$lib/services/orca-u3';
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
	import { copyFeedback, copyText } from '../ui/copy';

	// view=connect-ai, "เชื่อม AI ของฉัน" (proposal §3.1, the approved mockup):
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
	const openedAt = Date.now();
	const session = $derived(connectedSession(apps, app, checkedAt, openedAt));
	const waiting = $derived(ready && linkOK && appsState !== 'unavailable' && !session);
	let generation = 0;
	let destroyed = false;

	async function load(): Promise<'continue' | 'stop'> {
		const request = ++generation;
		try {
			const result = await MyAIAppsService.list();
			if (request === generation && !destroyed) {
				apps = result;
				appsState = 'ready';
				checkedAt = Date.now();
				setAIConnection(aiConnectionFrom(result, checkedAt, t));
			}
		} catch (cause) {
			if (request === generation && !destroyed) {
				// No B1 on this server yet (or no access here): a static hint, and
				// the company-wide keys the old way.
				if (aiAppsUnavailable(cause) || parseErrorContent(cause).status === 403) {
					appsState = 'unavailable';
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
				legacyKeys = keys.map((key) => ({ id: key.id, name: key.name, hubID: '', createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, expiresAt: key.expiresAt }));
		} catch {
			// The list stays empty; creating a key still works.
		}
	}
	let poller: ReturnType<typeof createPoller> | undefined;
	function refreshApps() {
		if (appsState === 'unavailable') return loadLegacyKeys();
		return poller?.poke();
	}

	let inApp = $state<'line' | 'facebook' | null>(null);
	let pageURL = $state('');
	onMount(() => {
		inApp = inAppBrowser(navigator.userAgent);
		pageURL = window.location.href;
		poller = createPoller(load, { interval: 4000, visible: () => document.visibilityState !== 'hidden' });
		void poller.poke();
		// Hidden: no requests. Shown again (back from Claude's tab): check at once.
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') poller?.pause();
			else if (untrack(() => waiting)) void poller?.poke();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			destroyed = true;
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
	const result = $derived(session ? 'connected' : !ready ? 'idle' : appsState === 'unavailable' ? 'unknown' : 'waiting');
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
	let pageCopied = $state(false);
	const pageFeedback = copyFeedback((on) => (pageCopied = on));
	async function copyPage() {
		if (await copyText(pageURL, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document)) pageFeedback.copied();
	}
	$effect(() => () => {
		nameFeedback.dispose();
		pageFeedback.dispose();
	});
</script>

<div class="ca">
	{#if inApp}
		<div class="ca-inapp" role="alert">
			<Globe size={18} aria-hidden="true" />
			<div>
				<b>{t('เปิดใน Chrome หรือ Safari', 'Open in Chrome or Safari')}</b>
				<span>{inApp === 'line'
					? t('Google ไม่ให้เข้าสู่ระบบในเบราว์เซอร์ของ LINE เปิดหน้านี้ในเบราว์เซอร์ของเครื่องก่อน', "Google refuses sign-in inside LINE's browser. Open this page in your phone's browser first.")
					: t('Google ไม่ให้เข้าสู่ระบบในเบราว์เซอร์ของ Facebook ให้กด ⋯ แล้วเลือก เปิดในเบราว์เซอร์', "Google refuses sign-in inside Facebook's browser. Choose ⋯, then Open in browser.")}</span>
			</div>
			{#if inApp === 'line' && pageURL}
				<a class="k-button" href={withExternalBrowser(pageURL)}>{t('เปิดในเบราว์เซอร์', 'Open in browser')}</a>
			{:else if pageURL}
				<button type="button" class="k-button" onclick={copyPage}>{#if pageCopied}<Check size={16} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกลิงก์หน้านี้', 'Copy this page’s link')}{/if}</button>
			{/if}
		</div>
	{/if}

	<PageHeader
		title={term('connectMyAI', t)}
		subtitle={t('ให้ Claude หรือ ChatGPT ใช้ข้อมูลบริษัทได้ ทำครั้งเดียว ประมาณ 3 นาที ไม่ต้องใช้คีย์', 'Let Claude or ChatGPT use company data. Once, about 3 minutes, no key needed.')}
		status={{ label: aiConnectionLine(aiConnection, t), tone: aiConnection.state === 'connected' ? 'ok' : 'neutral' }}
	/>

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
			<ConnectResult app={name} status={result} when={session ? relativeWhen(session.createdAt, checkedAt, t, lang) : ''} {prompts} />
		</ConnectStep>
	</ol>

	<div class="ca-sep"></div>

	<div class="ca-more">
		<ConnectedAIList {sessions} {keys} hubs={data.hubs} now={checkedAt} legacy={appsState === 'unavailable'} onchanged={refreshApps} />
		<ProgramSignIns {data} />
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

	<p class="ca-help">
		{t('ติดขั้นไหน?', 'Stuck on a step?')}
		<a href={localeHref('/app?view=help')}>{t('ดูคำตอบในหน้าช่วยเหลือ', 'See the Help page')}</a>
		{#if !data.canManage}{t('หรือถามผู้ดูแลบริษัท', 'or ask a company admin')}{/if}
	</p>
</div>

<style>
	.ca {
		container: ca / inline-size;
		max-width: 1040px;
	}
	.ca :global(.orca-page-header) {
		margin-bottom: 22px;
	}
	.ca-inapp {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		margin-bottom: 20px;
		padding: 14px 16px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
	}
	.ca-inapp > :global(svg) {
		flex: none;
		color: var(--orca-warn);
	}
	.ca-inapp > div {
		display: grid;
		flex: 1 1 240px;
		gap: 2px;
		font-size: 14px;
		line-height: 1.55;
	}
	.ca-inapp b {
		font-size: 15px;
		font-weight: 650;
	}
	.ca-inapp span {
		color: var(--orca-text-2);
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
		font-size: 15px;
	}
	.ca-copy :global(.orca-copy-label) {
		color: var(--orca-subtle);
		font-size: 12px;
		font-weight: 600;
	}
	.ca-copy :global(.orca-copy-value code) {
		color: var(--orca-text-2);
		font-size: 12.5px;
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
		font-size: 14px;
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
		font-size: 13px;
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
		font-size: 13px;
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
		font-size: 14px;
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
	.ca-help {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin: 22px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
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
