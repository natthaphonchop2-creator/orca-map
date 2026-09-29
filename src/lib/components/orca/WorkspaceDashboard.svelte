<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { CircleCheck, CircleHelp, Plus } from '@lucide/svelte';
	import { currentCompany } from '$lib/orca/company';
	import { aiConnection } from '$lib/orca/ai-connection.svelte';
	import { sourceAccountState, sourcePresentationNames } from '$lib/orca/connection-presentation';
	import { term } from '$lib/orca/glossary';
	import {
		AUDIT_WINDOW,
		accessRequestText,
		accountStateFrom,
		activeMembers,
		askablePrograms,
		askedAI,
		attentionCounts,
		employeeChecklist,
		firstName,
		homeBadge,
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
	import { OrcaService, type OrcaAuditEvent, type OrcaBootstrap, type OrcaConnection } from '$lib/services/orca';
	import { OrcaLibraryService } from '$lib/services/orca-library';
	import { refreshAIConnection } from '$lib/services/orca-ai-apps';
	import EmployeeSetup from './home/EmployeeSetup.svelte';
	import HomeStatus from './home/HomeStatus.svelte';
	import OwnerSetup from './home/OwnerSetup.svelte';
	import PageHeader from './ui/PageHeader.svelte';

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
	const company = $derived(data.organization.displayName || 'ORCA');
	const iconName = (connection: OrcaConnection) => sourceNames[connection.mcpID] || connection.name;
	// The same store the pinned "เชื่อม AI ของฉัน" button reads (B1).
	const ai = $derived(aiChecked ? aiConnection.state : 'unknown');
	const aiApp = $derived(ai === 'connected' ? (aiConnection.app ?? '') : '');
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
	const mode = $derived(homeMode(list, noWorkspace, loaded));
	const invite = $derived({ done: invitesSent || activeMembers(data.members).length > 1, skipped: flags['skip-invite'] });
	const knowledge = $derived({ done: knowledgePublished, skipped: flags['skip-knowledge'] });
	const attention = $derived(attentionCounts(data).total + staleApps);
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
					? t(`ตั้งค่า ORCA ให้ ${company} · 4 ขั้นตอน ประมาณ 10 นาที`, `Set up ORCA for ${company} · 4 steps, about 10 minutes`)
					: t(`ใช้ AI กับข้อมูลของ ${company} · 3 ขั้นตอน ประมาณ 7 นาที`, `Use AI with ${company}'s data · 3 steps, about 7 minutes`)
				: manager
					? t(`โปรแกรม พื้นที่ทำงาน AI และการใช้งานของ ${company}`, `Programs, AI workspaces and use at ${company}`)
					: t(`พื้นที่ทำงาน AI และโปรแกรมที่คุณใช้ได้ใน ${company}`, `The AI workspaces and programs you can use at ${company}`),
		status: homeBadge(mode, manager, attention, t)
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
	async function loadAIApps() {
		// A fresh read for Home; an older server without B1 leaves it unknown, and
		// connecting AI is then proven by the first question.
		await refreshAIConnection();
		if (alive) aiChecked = true;
	}
	async function loadOptional() {
		try {
			const items = await OrcaService.invitations();
			if (alive) invitesSent = items.length > 0;
		} catch {
			/* Optional: a failed read leaves the invite step open. */
		}
		// "มี N แอป AI ที่ไม่ได้ใช้เกิน 30 วัน" → ตรวจสอบ, filtered (proposal §3.6).
		void OrcaService.secrets()
			.then((inventory) => {
				if (alive) staleApps = staleAIApps(inventory, Date.now());
			})
			.catch(() => {
				/* Optional: no alert rather than a wrong one. */
			});
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
	onDestroy(() => {
		alive = false;
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
		{#if manager}{t('ติดตรงไหน', 'Stuck?')} <a href={localeHref('/home?to=start')}>{t('ขอให้ทีม ORCA ช่วยตั้งค่า', 'Ask the ORCA team to help you set up')}</a>
		{:else}{t('ติดตรงไหน', 'Stuck?')} <a href={localeHref('/app?view=help')}>{t('ดูคำถามที่พบบ่อย', 'Read the common questions')}</a>{/if}
	</p>
{:else if mode === 'loading'}
	<p class="home-loading" role="status" aria-live="polite">{t('กำลังตรวจสถานะการตั้งค่า…', 'Checking your setup…')}</p>
{:else}
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
	<HomeStatus {data} {events} {eventsError} onretry={loadActivity} {iconName} {staleApps} />
{/if}

<style>
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
		font-size: 14px;
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
		font-size: 14px;
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
		font-size: 15px;
		font-weight: 700;
	}
	.home-done .home-done-copy p {
		margin: 2px 0 0;
		color: var(--orca-text-2);
		font-size: 14px;
	}
	.home-done a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
