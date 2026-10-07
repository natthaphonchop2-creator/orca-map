<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { currentCompany } from '$lib/orca/company';
	import { onlyWorkspacesText } from '$lib/orca/ai-connection';
	import { aiConnection } from '$lib/orca/ai-connection.svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { connectAccess } from '$lib/orca/connect-ai';
	import { sourceAccountState, sourcePresentationNames } from '$lib/orca/connection-presentation';
	import { term } from '$lib/orca/glossary';
	import { aiAttention, employeeAttention, managerAttention, type AttentionRow } from '$lib/orca/home-attention';
	import {
		AUDIT_WINDOW,
		accessRequestText,
		aiLapse,
		accountStateFrom,
		askedAI,
		firstName,
		homeAIApp,
		homeAIState,
		isToolCall,
		staleAIApps,
		usableWorkspaces,
		workspacesLink,
		type AccountState,
		type Done,
		type ProgramAccount
	} from '$lib/orca/home-setup';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { personalAccountReader, personalSetup, personalSources } from '$lib/orca/personal-connections';
	import { OrcaService, type OrcaAuditEvent, type OrcaBootstrap, type OrcaConnection, type OrcaConnectionHealth, type OrcaProgramAccount } from '$lib/services/orca';
	import { healthByConnection } from '$lib/orca/connection-health';
	import { refreshAIConnection } from '$lib/services/orca-ai-apps';
	import { SkillsService, type OrcaSkill } from '$lib/services/orca-skills';
	import { skillsEnabled } from '$lib/orca/workspace-nav';
	import AIReconnectBanner from './home/AIReconnectBanner.svelte';
	import HomeStatus from './home/HomeStatus.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import { copyFeedback, copyText } from './ui/copy';

	// หน้าหลัก (W0, the calm workspace): a greeting with today's use, ต้องดูแล
	// only when something needs someone, four overview tiles and the latest six
	// items. The first-run checklist is gone: what it asked for shows as rows
	// here, and a new company's owner first sees the onboarding (+page).
	let { data, pendingApprovals = 0 }: { data: OrcaBootstrap; pendingApprovals?: number } = $props();
	let alive = true;

	// ---- What the page reads beyond the bootstrap ----
	/** The viewer's latest tool calls; undefined while loading. */
	let events = $state<OrcaAuditEvent[]>();
	/** The history filled the audit window: an older call of mine may be missing from it. */
	let eventsTruncated = $state(false);
	let eventsError = $state(false);
	/** B1 answered (or failed): the shared store then says connected, none or unknown. */
	let aiChecked = $state(false);
	let sourceNames = $state<Record<string, string>>({});
	let accountStates = $state<Record<string, AccountState>>({});
	/** Managers: AI apps unused for 30 days; 0 until read, or when it cannot be. */
	let staleApps = $state(0);
	/** A tool that changed at the provider: ต้องตรวจใหม่, as on the program list (managers). */
	let health = $state.raw<Map<string, OrcaConnectionHealth>>();
	/** The company accounts (บัญชีกลาง), for ต้องเชื่อมใหม่ (managers); undefined until read. */
	let programAccounts = $state.raw<OrcaProgramAccount[]>();
	/** The unused-app and changed-program reads (managers). */
	let checks = $state<'loading' | 'done' | 'failed'>('loading');
	/** Skills' tile, only with the company's skills feature (W0); the list is a stub until its backend ships. */
	let skills = $state<{ count: number }>();
	let skillItems = $state.raw<OrcaSkill[]>([]);
	/** Skills ที่ใช้บ่อย: the three published ones used most. */
	const topSkills = $derived(
		skillItems
			.filter((item) => item.status === 'published')
			.sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
			.slice(0, 3)
	);

	const manager = $derived(data.canManage);
	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	/** The workspaces of mine the company's link reaches, and the ones with their own sign-in. */
	const access = $derived(connectAccess(data));
	const company = $derived(data.organization.displayName || 'ORCA');
	const iconName = (connection: OrcaConnection) => sourceNames[connection.mcpID] || connection.name;
	// The same store as AI ของฉัน (B1). After my own disconnect, an earlier question no longer counts.
	const ai = $derived(homeAIState(aiConnection, aiChecked, access));
	// The app the tile names, never one limited to another workspace (Codex reviews 72 and 73).
	const aiApp = $derived(homeAIApp(aiConnection, ai, access));
	const aiOnly = $derived(ai === 'limited' ? onlyWorkspacesText(aiConnection.only ?? [], t) : '');
	const asked = $derived<Done>(eventsError || !events ? undefined : askedAI(events, data.currentUserID, eventsTruncated));
	const aiRow = $derived(aiAttention(ai, aiChecked, asked));
	const sources = $derived(manager ? [] : personalSources(data));
	const accounts = $derived<ProgramAccount[]>(
		sources.map((source) => ({
			id: source.sourceID,
			name: source.connections[0].name,
			icon: iconName(source.connections[0]),
			state: accountStates[source.sourceID] ?? (source.canReadSetup ? 'checking' : 'waiting')
		}))
	);
	const noWorkspace = $derived(!manager && usableWorkspaces(data).length === 0);
	const requestText = $derived(
		accessRequestText(
			{ name: me?.displayName ?? '', email: me?.email ?? '', company, link: typeof window === 'undefined' ? '' : workspacesLink(window.location.origin, currentCompany()) },
			t
		)
	);
	const rows = $derived<AttentionRow[]>(
		manager
			? managerAttention({ data, pendingApprovals, accounts: programAccounts, health, staleApps, iconName }, t)
			: employeeAttention({ accounts, noWorkspace, requestText }, t)
	);
	const attentionCount = $derived(rows.length + (aiRow ? 1 : 0) + (manager && checks === 'failed' ? 1 : 0));
	const today = $derived(data.hubs.reduce((sum, hub) => sum + Math.max(0, hub.usedToday || 0), 0));
	const name = $derived(firstName(me?.displayName));
	const header = $derived({
		title: name ? t(`สวัสดี คุณ${name}`, `Hello, ${name}`) : term('home', t),
		subtitle: manager
			? t(`วันนี้ AI ใช้ข้อมูลบริษัท ${today.toLocaleString()} ครั้ง`, `AI used company data ${today.toLocaleString()} times today`)
			: t(`วันนี้ AI ใช้ข้อมูลในพื้นที่ทำงานของคุณ ${today.toLocaleString()} ครั้ง`, `AI used your workspaces' data ${today.toLocaleString()} times today`)
	});

	// ---- Copying the access request (employees with no workspace) ----
	let copied = $state('');
	const feedback = copyFeedback((on) => {
		if (!on) copied = '';
	});
	async function copyRow(row: AttentionRow) {
		if (!row.action.copy) return;
		if (await copyText(row.action.copy, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document)) {
			copied = row.id;
			feedback.copied();
		}
	}

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
	// Back on Home from Claude or ChatGPT while AI is not connected yet: check
	// again, so the row goes by itself. What is shown stays until the new answer.
	let lastRecheck = 0;
	async function recheck() {
		if (!alive || !aiRow || document.visibilityState === 'hidden') return;
		if (Date.now() - lastRecheck < 10_000) return;
		lastRecheck = Date.now();
		try {
			const result = await OrcaService.audit();
			if (!alive) return;
			eventsTruncated = result.length >= AUDIT_WINDOW;
			events = result.filter(isToolCall).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			eventsError = false;
		} catch {
			/* Keeps what it has; the retry on the list still works. */
		}
		await refreshAIConnection();
	}
	async function loadAIApps() {
		// A fresh read for Home; an older server without B1 leaves it unknown.
		await refreshAIConnection();
		if (alive) aiChecked = true;
	}
	// The unused AI apps and the programs that changed at the provider. A failed
	// read shows no alert rather than a wrong one, and says so with a retry.
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
	async function loadProgramAccounts() {
		try {
			const items = await OrcaService.programAccounts();
			if (alive) programAccounts = items;
		} catch {
			/* Optional: without the list no program is said to need reconnecting. */
		}
	}
	// An employee's own sign-in to each program (as on AI ของฉัน › บัญชีโปรแกรมของคุณ).
	const reader = personalAccountReader(
		async (sourceID, signal) => personalSetup(await OrcaService.sourceSetup(sourceID, signal), sourceID),
		(event) => {
			accountStates[event.sourceID] =
				event.status === 'ready' ? accountStateFrom(sourceAccountState(event.value)) : event.status === 'error' ? 'unknown' : 'checking';
		}
	);

	onMount(() => {
		if (skillsEnabled(untrack(() => data)))
			void SkillsService.list()
				.then((items) => {
					if (!alive) return;
					skills = { count: items.filter((item) => item.status === 'published').length };
					skillItems = items;
				})
				.catch(() => {
					if (alive) skills = { count: 0 };
				});
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
			void loadChecks();
			void loadProgramAccounts();
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
		feedback.dispose();
	});
</script>

<PageHeader title={header.title} subtitle={header.subtitle} />

<!-- W0.1: two columns from 1100 px (ต้องดูแล and ล่าสุด at the left; ภาพรวม and Skills ที่ใช้บ่อย at the right);
     on a phone ต้องดูแล → ภาพรวม → ล่าสุด → Skills ที่ใช้บ่อย. The order is grid-template-areas, per breakpoint. -->
<div class="home-layout" class:with-skills={skillsEnabled(data)} class:no-attention={attentionCount === 0}>

{#if attentionCount > 0}
	<section class="home-attention" aria-labelledby="home-attention-title">
		<h2 id="home-attention-title">{t('ต้องดูแล', 'Needs attention')} <span class="home-count">{attentionCount}</span></h2>
		<div class="home-panel">
			{#if aiRow === 'never'}
				<div class="home-row">
					<div class="home-row-copy"><strong>{t('ยังไม่ได้เชื่อม AI', 'AI is not connected yet')}</strong><small>{t('ใช้ ORCA ใน ChatGPT หรือ Claude', 'Use ORCA in ChatGPT or Claude')}</small></div>
					<a class="k-button small" href={localeHref('/app?view=connect-ai')}>{t('เชื่อม AI', 'Connect AI')}</a>
				</div>
			{:else if aiRow === 'lapsed'}
				<AIReconnectBanner lapse={aiLapse(aiConnection, ai)} only={aiOnly} own={access.ownSignIn} />
			{/if}
			{#each rows as row (row.id)}
				<div class="home-row">
					{#if row.logo}<CatalogIcon name={row.logo} size={32} />{/if}
					<div class="home-row-copy"><strong>{row.title}</strong>{#if row.meta}<small title={row.detail}>{row.meta}</small>{/if}</div>
					{#if row.action.href}<a class="k-button small" href={localeHref(row.action.href)}>{row.action.label}</a>
					{:else}<button type="button" class="k-button small" onclick={() => copyRow(row)}>{copied === row.id ? t('คัดลอกแล้ว', 'Copied') : row.action.label}</button>{/if}
				</div>
			{/each}
			{#if manager && checks === 'failed'}
				<div class="home-row" role="alert">
					<div class="home-row-copy"><strong>{t('ตรวจแอป AI ที่ไม่ได้ใช้และโปรแกรมที่เปลี่ยนไปไม่สำเร็จ', "Couldn't check for unused AI apps and changed programs.")}</strong></div>
					<button type="button" class="k-button small" onclick={() => void loadChecks()}>{t('ลองอีกครั้ง', 'Try again')}</button>
				</div>
			{/if}
		</div>
	</section>
{/if}

<HomeStatus {data} {events} {eventsError} onretry={loadActivity} {iconName} accounts={programAccounts} {ai} {aiApp} skills={skillsEnabled(data) ? (skills ?? { count: 0 }) : undefined} />

{#if skillsEnabled(data)}
	<section class="home-skills" aria-labelledby="home-skills-title">
		<header class="home-skills-head">
			<h2 id="home-skills-title">{t('Skills ที่ใช้บ่อย', 'Most used Skills')}</h2>
			<a class="home-skills-all" href={localeHref('/app?view=skills')}>{t('ดูทั้งหมด', 'See all')}</a>
		</header>
		<div class="home-panel">
			{#each topSkills as skill (skill.id)}
				<a class="home-row home-skill" href={localeHref('/app?view=skills')}>
					<div class="home-row-copy"><strong>{skill.name}</strong></div>
					<small class="home-skill-uses">{t(`${skill.uses ?? 0} ครั้ง`, `${skill.uses ?? 0} times`)}</small>
				</a>
			{:else}
				<p class="home-skill-none">{t('ยังไม่มี Skill', 'No Skills yet')}</p>
			{/each}
		</div>
	</section>
{/if}
</div>

<style>
	.home-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'attention' 'overview' 'recent' 'skills';
		align-items: start;
		gap: 28px;
	}
	/* Nothing to look at: no empty ต้องดูแล row (and its gap) above ภาพรวม. */
	.home-layout.no-attention {
		grid-template-areas: 'overview' 'recent' 'skills';
	}
	@media (min-width: 1100px) {
		.home-layout {
			grid-template-columns: minmax(0, 1fr) 360px;
			grid-template-rows: auto auto 1fr;
			grid-template-areas: 'attention overview' 'recent overview' 'recent skills';
			column-gap: 24px;
		}
		.home-layout.no-attention {
			grid-template-rows: auto 1fr;
			grid-template-areas: 'recent overview' 'recent skills';
		}
	}
	.home-attention {
		grid-area: attention;
		min-width: 0;
	}
	.home-skills {
		grid-area: skills;
		min-width: 0;
	}
	.home-skills-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.home-skills-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.home-skills-all {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
	}
	.home-skill {
		color: var(--orca-ink);
		text-decoration: none;
	}
	.home-skill:hover {
		background: var(--orca-hover);
		text-decoration: none;
	}
	.home-skill-uses {
		flex: none;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.home-skill-none {
		margin: 0;
		padding: 14px 16px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.home-attention h2 {
		margin: 0 0 10px;
		font-size: 16px;
		font-weight: 600;
	}
	.home-count {
		color: var(--orca-muted);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.home-panel {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.home-panel > :global(* + *) {
		border-top: 1px solid var(--orca-line);
	}
	.home-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
	}
	.home-row-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.home-row-copy strong {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.45;
	}
	.home-row-copy small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.home-row .k-button {
		flex: none;
	}
	/* A phone: the button drops below its text. */
	@media (max-width: 720px) {
		.home-row {
			flex-wrap: wrap;
			padding: 12px 14px;
		}
		.home-row-copy {
			flex-basis: calc(100% - 48px);
		}
		.home-row .k-button {
			margin-left: auto;
		}
	}
</style>
