<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { CircleCheck, CircleHelp, Plus } from '@lucide/svelte';
	import { currentCompany } from '$lib/orca/company';
	import { onlyWorkspacesText } from '$lib/orca/ai-connection';
	import { aiConnection } from '$lib/orca/ai-connection.svelte';
	import { connectAccess } from '$lib/orca/connect-ai';
	import { sourceAccountState, sourcePresentationNames } from '$lib/orca/connection-presentation';
	import { term } from '$lib/orca/glossary';
	import {
		AUDIT_WINDOW,
		accessRequestText,
		aiLapse,
		aiLapsed,
		accountStateFrom,
		activeMembers,
		askablePrograms,
		askedAI,
		attentionCounts,
		employeeChecklist,
		firstName,
		homeBadge,
		homeAIApp,
		homeAIState,
		homeFlagKey,
		homeMode,
		isToolCall,
		ownerChecklist,
		readHomeFlag,
		staleAIApps,
		usableWorkspaces,
		workspacesLink,
		writeHomeFlag,
		type AccountState,
		type Done,
		type HomeFlag,
		type ProgramAccount
	} from '$lib/orca/home-setup';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { TEAM_INVITE_HREF } from '$lib/orca/navigation';
	import { personalAccountReader, personalSetup, personalSources } from '$lib/orca/personal-connections';
	import { OrcaService, type OrcaAuditEvent, type OrcaBootstrap, type OrcaConnection, type OrcaConnectionHealth } from '$lib/services/orca';
	import { healthByConnection } from '$lib/orca/connection-health';
	import { programStatus } from '$lib/orca/program-catalog';
	import { OrcaLibraryService } from '$lib/services/orca-library';
	import { refreshAIConnection } from '$lib/services/orca-ai-apps';
	import AIReconnectBanner from './home/AIReconnectBanner.svelte';
	import EmployeeSetup from './home/EmployeeSetup.svelte';
	import HomeStatus from './home/HomeStatus.svelte';
	import OwnerSetup from './home/OwnerSetup.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import SupportContact from './ui/SupportContact.svelte';

	// หน้าหลัก. While setup is unfinished: one setup panel (proposal §4, the
	// approved home-first-run mockup). Afterwards: "ตั้งค่าเสร็จแล้ว", which the
	// viewer can hide, and the company at a glance.
	let { data }: { data: OrcaBootstrap } = $props();
	let alive = true;

	// ---- What the page reads beyond the bootstrap ----
	/** The viewer's latest tool calls; undefined while loading. */
	let events = $state<OrcaAuditEvent[]>();
	/** The history filled the audit window: an older call of mine may be missing from it. */
	let eventsTruncated = $state(false);
	let eventsError = $state(false);
	/** B1 answered (or failed): the pin's store then says connected, none or unknown. */
	let aiChecked = $state(false);
	let sourceNames = $state<Record<string, string>>({});
	let invitesSent = $state(false);
	let knowledgePublished = $state(false);
	let accountStates = $state<Record<string, AccountState>>({});
	/** Managers: AI apps unused for 30 days (ตรวจสอบ); 0 until read, or when it cannot be. */
	let staleApps = $state(0);
	/** A tool that changed at the provider: Home says ต้องตรวจใหม่ like the program list (managers). */
	let health = $state.raw<Map<string, OrcaConnectionHealth>>();
	/** Both reads above answered: only then can Home say nothing needs attention (Codex release review 67). */
	let checks = $state<'loading' | 'done' | 'failed'>('loading');

	// ---- Per-viewer memory (browser storage, a convenience only) ----
	const storage = () => (typeof window === 'undefined' ? undefined : window.localStorage);
	const flagKey = (flag: HomeFlag) => homeFlagKey(flag, currentCompany(), data.currentUserID);
	let flags = $state<Record<HomeFlag, boolean>>({ 'setup-dismissed': false, 'skip-invite': false, 'skip-knowledge': false });
	function setFlag(flag: HomeFlag) {
		flags[flag] = true;
		writeHomeFlag(storage, flagKey(flag));
	}

	// ---- The checklist ----
	const manager = $derived(data.canManage);
	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	/** The workspaces of mine the company's link reaches, and the ones with their own sign-in. */
	const access = $derived(connectAccess(data));
	const company = $derived(data.organization.displayName || 'ORCA');
	const iconName = (connection: OrcaConnection) => sourceNames[connection.mcpID] || connection.name;
	// The same store the pinned "เชื่อม AI ของฉัน" button reads (B1). After my
	// own disconnect on this page, an earlier question no longer counts (Codex
	// release review 70).
	const ai = $derived(homeAIState(aiConnection, aiChecked, access));
	// The app shown to reach my workspaces, never the company link's for ones with their own sign-in (Codex reviews 72 and 73).
	const aiApp = $derived(homeAIApp(aiConnection, ai, access));
	// Connected only through workspaces' own links: where it reaches, never company-wide (B3 follow-up).
	const aiOnly = $derived(ai === 'limited' ? onlyWorkspacesText(aiConnection.only ?? [], t) : '');
	const asked = $derived<Done>(eventsError || !events ? undefined : askedAI(events, data.currentUserID, eventsTruncated));
	const owner = $derived(ownerChecklist(data, ai, asked));
	const sources = $derived(manager ? [] : personalSources(data));
	const accounts = $derived<ProgramAccount[]>(
		sources.map((source) => ({
			id: source.sourceID,
			name: source.connections[0].name,
			icon: iconName(source.connections[0]),
			state: accountStates[source.sourceID] ?? (source.canReadSetup ? 'checking' : 'waiting')
		}))
	);
	const employee = $derived(employeeChecklist(ai, accounts.map((account) => account.state), asked));
	const list = $derived(manager ? owner : employee);
	const noWorkspace = $derived(!manager && usableWorkspaces(data).length === 0);
	const loaded = $derived((events !== undefined || eventsError) && aiChecked && accounts.every((account) => account.state !== 'checking'));
	// Setup was done and only my AI sign-in expired or was disconnected: stay in status mode, with a banner.
	const lapsed = $derived(aiLapsed(list, ai));
	const mode = $derived(homeMode(list, noWorkspace, loaded, lapsed));
	const invite = $derived({ done: invitesSent || activeMembers(data.members).length > 1, skipped: flags['skip-invite'] });
	const knowledge = $derived({ done: knowledgePublished, skipped: flags['skip-knowledge'] });
	// Plus a program that changed at the provider since its last review (HomeStatus's "ต้องตรวจใหม่").
	const changedPrograms = $derived(
		data.connections.filter((connection) => programStatus(connection) === 'ready' && programStatus(connection, health?.get(connection.id)) === 'review').length
	);
	const attention = $derived(attentionCounts(data).total + staleApps + changedPrograms);
	const requestText = $derived(
		accessRequestText(
			{ name: me?.displayName ?? '', email: me?.email ?? '', company, link: typeof window === 'undefined' ? '' : workspacesLink(window.location.origin, currentCompany()) },
			t
		)
	);
	const welcome = $derived(firstName(me?.displayName) ? t(`ยินดีต้อนรับ ${firstName(me?.displayName)}`, `Welcome, ${firstName(me?.displayName)}`) : t('ยินดีต้อนรับ', 'Welcome'));
	const header = $derived({
		title: mode === 'setup' ? welcome : term('home', t),
		subtitle:
			mode === 'setup'
				? manager
					? t('4 ขั้นตอน ประมาณ 10 นาที', '4 steps, about 10 minutes')
					: t('3 ขั้นตอน ประมาณ 7 นาที', '3 steps, about 7 minutes')
				: company,
		status: homeBadge(mode, manager, attention, t, lapsed)
	});

	// ---- Loading ----
	async function loadActivity() {
		eventsError = false;
		events = undefined;
		try {
			const result = await OrcaService.audit();
			if (!alive) return;
			eventsTruncated = result.length >= AUDIT_WINDOW;
			events = result.filter(isToolCall).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		} catch {
			if (alive) eventsError = true;
		}
	}
	// Back on Home from Claude or ChatGPT with setup still open: check again, so
	// the first question or a new sign-in ticks its step by itself, as the page
	// promises. What is shown stays until the new answer (Codex release review 63).
	let lastRecheck = 0;
	async function recheck() {
		if (!alive || mode !== 'setup' || document.visibilityState === 'hidden') return;
		if (Date.now() - lastRecheck < 10_000) return;
		lastRecheck = Date.now();
		try {
			const result = await OrcaService.audit();
			if (!alive) return;
			eventsTruncated = result.length >= AUDIT_WINDOW;
			events = result.filter(isToolCall).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			eventsError = false;
		} catch {
			/* Keeps what it has; the retry on the card still works. */
		}
		await refreshAIConnection();
	}
	async function loadAIApps() {
		// A fresh read for Home; an older server without B1 leaves it unknown, and
		// connecting AI is then proven by the first question.
		await refreshAIConnection();
		if (alive) aiChecked = true;
	}
	// "มี N แอป AI ที่ไม่ได้ใช้เกิน 30 วัน" → ตรวจสอบ, filtered (proposal §3.6), and
	// the programs that changed at the provider. A failed read shows no alert
	// rather than a wrong one, and holds back "nothing needs attention".
	let checksLoad = 0;
	async function loadChecks() {
		const current = ++checksLoad;
		checks = 'loading';
		const results = await Promise.allSettled([
			OrcaService.secrets().then((inventory) => {
				if (alive && current === checksLoad) staleApps = staleAIApps(inventory, Date.now());
			}),
			OrcaService.connectionHealth().then((result) => {
				if (alive && current === checksLoad) health = healthByConnection(result.items);
			})
		]);
		if (alive && current === checksLoad) checks = results.every((result) => result.status === 'fulfilled') ? 'done' : 'failed';
	}
	async function loadOptional() {
		try {
			const items = await OrcaService.invitations();
			if (alive) invitesSent = items.length > 0;
		} catch {
			/* Optional: a failed read leaves the invite step open. */
		}
		void loadChecks();
		const hubs = usableWorkspaces(data).slice(0, 3);
		const libraries = await Promise.allSettled(hubs.map((hub) => OrcaLibraryService.load(hub.id)));
		if (alive)
			knowledgePublished = libraries.some(
				(result) => result.status === 'fulfilled' && result.value.items.some((item) => item.kind === 'knowledge' && item.status === 'published')
			);
	}
	// An employee's own sign-in to each program (as on เชื่อม AI ของฉัน › บัญชีโปรแกรมของคุณ).
	const reader = personalAccountReader(
		async (sourceID, signal) => personalSetup(await OrcaService.sourceSetup(sourceID, signal), sourceID),
		(event) => {
			accountStates[event.sourceID] =
				event.status === 'ready' ? accountStateFrom(sourceAccountState(event.value)) : event.status === 'error' ? 'unknown' : 'checking';
		}
	);

	onMount(() => {
		for (const flag of Object.keys(flags) as HomeFlag[]) flags[flag] = readHomeFlag(storage, flagKey(flag));
		void loadActivity();
		void loadAIApps();
		lastRecheck = Date.now();
		const onReturn = () => void recheck();
		document.addEventListener('visibilitychange', onReturn);
		window.addEventListener('focus', onReturn);
		stopRechecks = () => {
			document.removeEventListener('visibilitychange', onReturn);
			window.removeEventListener('focus', onReturn);
		};
		if (untrack(() => data.canManage)) {
			void loadOptional();
			// The catalog's names pick the right logos; managers only.
			void OrcaService.candidates()
				.then((items) => {
					if (alive) sourceNames = sourcePresentationNames(items);
				})
				.catch(() => {
					/* Logos fall back to the program's own name. */
				});
		} else {
			reader.replace(untrack(() => sources).filter((source) => source.canReadSetup).map((source) => source.sourceID));
		}
	});
	let stopRechecks = () => {};
	onDestroy(() => {
		alive = false;
		stopRechecks();
		reader.dispose();
	});
</script>

<PageHeader title={header.title} subtitle={header.subtitle} status={header.status}>
	{#snippet action()}
		{#if mode === 'status' && manager}
			<a class="k-button" href={localeHref('/app?view=add-program')}>{term('addProgram', t)}</a>
			<a class="k-button primary" href={localeHref('/app?view=new')}><Plus size={16} aria-hidden="true" />{term('newWorkspace', t)}</a>
		{/if}
	{/snippet}
</PageHeader>

{#if mode === 'setup'}
	<div id="setup" class="home-anchor">
		{#if manager}
			<OwnerSetup
				{data}
				list={owner}
				{ai}
				{aiApp}
				{aiOnly}
				historyFailed={eventsError}
				onretry={loadActivity}
				{invite}
				{knowledge}
				onskip={setFlag}
				{iconName}
			/>
		{:else}
			<EmployeeSetup
				list={employee}
				{ai}
				{aiApp}
				{aiOnly}
				{accounts}
				programs={askablePrograms(data)}
				{noWorkspace}
				{requestText}
				historyFailed={eventsError}
				onretry={loadActivity}
				{iconName}
			/>
		{/if}
	</div>
	<p class="home-helpline">
		<CircleHelp size={17} aria-hidden="true" />
		<!-- A manager in a company on ORCA reaches the ORCA team directly ($lib/orca/support), not through the trial-request form. -->
		{#if manager}{t('ติดตรงไหน', 'Stuck?')} <SupportContact />
		{:else}{t('ติดตรงไหน', 'Stuck?')} <a href={localeHref('/app?view=help')}>{t('ดูคำถามที่พบบ่อย', 'Read the common questions')}</a>{/if}
	</p>
{:else if mode === 'loading'}
	<p class="home-loading" role="status" aria-live="polite">{t('กำลังตรวจสถานะการตั้งค่า…', 'Checking your setup…')}</p>
{:else}
	{#if lapsed}<AIReconnectBanner lapse={aiLapse(aiConnection, ai)} only={aiOnly} own={access.ownSignIn} />{/if}
	{#if list.complete && !flags['setup-dismissed']}
		<section class="home-done" aria-labelledby="home-done-title">
			<span class="home-done-icon" aria-hidden="true"><CircleCheck size={20} /></span>
			<div class="home-done-copy">
				<h2 id="home-done-title">{t('ตั้งค่าเสร็จแล้ว', 'Setup is done')}</h2>
				<p>
					{manager ? t('ทีมของคุณถามข้อมูลบริษัทผ่าน AI ได้แล้ว', 'Your team can ask AI about company data') : t('คุณถามข้อมูลบริษัทผ่าน AI ได้แล้ว', 'You can ask AI about company data')}
					{#if manager && !invite.done && !invite.skipped}· <a href={localeHref(TEAM_INVITE_HREF)}>{t('ชวนทีม', 'Invite your team')}</a>{/if}
					{#if manager && !knowledge.done && !knowledge.skipped}· <a href={localeHref('/app?view=knowledge&kind=knowledge&create=1')}>{t('เพิ่มความรู้แรก', 'Add your first knowledge')}</a>{/if}
				</p>
			</div>
			<button type="button" class="k-button quiet small" onclick={() => setFlag('setup-dismissed')} aria-label={t('ซ่อน ตั้งค่าเสร็จแล้ว', 'Hide "Setup is done"')}>{t('ซ่อน', 'Hide')}</button>
		</section>
	{/if}
	<HomeStatus {data} {events} {eventsError} onretry={loadActivity} {iconName} {staleApps} {health} {checks} onretrychecks={() => void loadChecks()} />
{/if}

<style>
	/* orca-type-remap v1 */
	.home-anchor {
		scroll-margin-top: 80px;
	}
	.home-helpline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 18px 4px 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.home-helpline a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
	}
	.home-loading {
		margin: 0;
		padding: 28px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.home-done {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 20px;
		padding: 16px 20px;
		border: 1px solid var(--orca-ok-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-ok-bg);
	}
	.home-done-icon {
		display: grid;
		flex: none;
		place-items: center;
		color: var(--orca-ok);
	}
	.home-done-copy {
		flex: 1;
		min-width: 0;
	}
	.home-done .home-done-copy h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 700;
	}
	.home-done .home-done-copy p {
		margin: 2px 0 0;
		color: var(--orca-text-2);
		font-size: 13.5px;
	}
	.home-done a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
