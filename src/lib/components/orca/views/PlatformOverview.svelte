<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowRight, Building2, Grid2x2Plus, Inbox, KeyRound, LogIn, Shield, TriangleAlert } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { platformHref, type PlatformSection } from '$lib/orca/navigation';
	import { OrcaService, orcaError, type OrcaCandidate, type OrcaGoogleSignIn, type OrcaPlatformCompany, type PilotRequest } from '$lib/services/orca';
	import { catalogSummary, googleClientSaved, platformCounts } from '$lib/services/orca-platform';
	import { PlatformUsageService } from '$lib/services/orca-platform-usage';
	import { usageNumber, type OrcaPlatformUsage } from '$lib/orca/platform-usage';
	import PlatformUsage from '../platform/PlatformUsage.svelte';
	import PageHeader from '../ui/PageHeader.svelte';

	// ภาพรวมแพลตฟอร์ม: counts from the lists the platform already has (the
	// customer companies, the pilot requests and the Google sign-in setting),
	// then what is waiting for the ORCA team, then the AI usage numbers (B5,
	// their own call and their own error), then every section.
	let { canReviewPilotRequests = false }: { canReviewPilotRequests?: boolean } = $props();
	let companies = $state<OrcaPlatformCompany[]>();
	let pilots = $state<PilotRequest[]>();
	let google = $state<OrcaGoogleSignIn>();
	// คลังโปรแกรม's "รอทีม ORCA" (an app to set up, a provider review): the same heading here counts them too.
	let catalog = $state<OrcaCandidate[]>();
	let companiesError = $state('');
	let pilotsError = $state('');
	let googleError = $state('');
	// The catalog only adds a to-do, but an unknown one is not "nothing waiting" (Codex release review 65).
	let catalogFailed = $state(false);
	let usage = $state<OrcaPlatformUsage>();
	let usageError = $state('');
	const counts = $derived(platformCounts(companies ?? [], pilots ?? []));
	const catalogWaiting = $derived(catalog ? catalogSummary(catalog).attention.length : 0);
	// The catalog too: its to-do may still come (Codex release review 66).
	const loading = $derived((!companies && !companiesError) || (canReviewPilotRequests && !pilots && !pilotsError) || (!google && !googleError) || (!catalog && !catalogFailed));

	// A failed reload drops the numbers it had: the tiles never show old
	// numbers beside "โหลดไม่สำเร็จ" (Codex release review 60). Only the
	// newest load's answer counts: an older one that lands later (the usage
	// retry, then the overview's own retry) is dropped (Codex release review 61).
	let usageLoad = 0;
	async function loadUsage() {
		const current = ++usageLoad;
		usageError = '';
		await PlatformUsageService.usage().then(
			(result) => {
				if (current === usageLoad) usage = result;
			},
			(cause) => {
				if (current !== usageLoad) return;
				usage = undefined;
				usageError = orcaError(cause);
			}
		);
	}

	async function load() {
		companiesError = pilotsError = googleError = '';
		catalogFailed = false;
		await Promise.all([
			loadUsage(),
			OrcaService.platformCompanies().then((items) => (companies = items), (cause) => (companiesError = orcaError(cause))),
			canReviewPilotRequests
				? OrcaService.listPilotRequests().then((response) => (pilots = response.items ?? []), (cause) => (pilotsError = orcaError(cause)))
				: Promise.resolve(),
			OrcaService.googleSignIn().then((setting) => (google = setting), (cause) => (googleError = orcaError(cause))),
			OrcaService.candidates().then(
				(items) => (catalog = items),
				() => {
					// The catalog page shows its own error; here it only holds back the all-clear.
					catalogFailed = true;
				}
			)
		]);
	}
	onMount(() => void load());

	type Tile = { label: string; value: string; detail: string; href: PlatformSection };
	const tiles = $derived<Tile[]>([
		{
			label: term('customerCompanies', t),
			value: companies ? usageNumber(counts.customers) : '—',
			detail: companiesError ? t('โหลดไม่สำเร็จ', "Couldn't load") : t(`มีเจ้าของแล้ว ${counts.owned}`, `${counts.owned} with an owner`),
			href: 'companies'
		},
		{
			label: t('คนที่ใช้งานได้', 'People who can use ORCA'),
			value: companies ? usageNumber(counts.customerSeats) : '—',
			detail: companiesError ? t('โหลดไม่สำเร็จ', "Couldn't load") : t('รวมทุกบริษัทลูกค้า', 'Across customer companies'),
			href: 'companies'
		},
		...(canReviewPilotRequests
			? [
					{
						label: t('คำขอทดลองใช้ใหม่', 'New pilot requests'),
						value: pilots ? usageNumber(counts.pilots.received) : '—',
						detail: pilotsError ? t('โหลดไม่สำเร็จ', "Couldn't load") : t(`ยังไม่ปิด ${counts.pilots.open} จาก ${counts.pilots.total}`, `${counts.pilots.open} of ${counts.pilots.total} still open`),
						href: 'pilots' as PlatformSection
					}
				]
			: []),
		{
			label: term('googleSignIn', t),
			value: google ? (google.enabled ? t('เปิดอยู่', 'On') : t('ปิดอยู่', 'Off')) : '—',
			detail: googleError
				? t('โหลดไม่สำเร็จ', "Couldn't load")
				: google?.enabled
					? t('ทุกบริษัทใช้ได้', 'Every company can use it')
					: googleClientSaved(google)
						? t('ลูกค้าเข้าสู่ระบบด้วย Google ไม่ได้', "Customers can't sign in with Google")
						: t('ยังตั้งค่า Google Cloud ไม่ครบ', 'Google Cloud setup is incomplete'),
			href: 'signin'
		}
	]);

	// Only the parts there are: "ลิงก์หมดอายุ 1", "ยังไม่ได้เชิญ 2", or both.
	const ownerTodoDetail = $derived(
		[
			counts.ownerTodo.expired ? t(`ลิงก์หมดอายุ ${counts.ownerTodo.expired}`, `${counts.ownerTodo.expired} link expired`) : '',
			counts.ownerTodo.notInvited ? t(`ยังไม่ได้เชิญ ${counts.ownerTodo.notInvited}`, `${counts.ownerTodo.notInvited} not invited`) : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	// "Nothing waiting" says only what is true: a suspended or closed company may still have no owner.
	const clearText = $derived(
		!counts.customers
			? t('ไม่มีงานค้าง ยังไม่มีบริษัทลูกค้า และปุ่ม Google เปิดอยู่', 'Nothing waiting. There are no customer companies yet, and Google sign-in is on.')
			: counts.stoppedWithoutOwner
			? t(
					`ไม่มีงานค้าง บริษัทที่ใช้งานอยู่มีเจ้าของครบและปุ่ม Google เปิดอยู่ ส่วนบริษัทที่ระงับหรือปิดไว้ ${counts.stoppedWithoutOwner} บริษัทยังไม่มีเจ้าของ`,
					`Nothing waiting. Every active company has an owner and Google sign-in is on. (${counts.stoppedWithoutOwner} suspended or closed ${counts.stoppedWithoutOwner === 1 ? 'company has' : 'companies have'} no owner.)`
				)
			: t('ไม่มีงานค้าง ทุกบริษัทมีเจ้าของและปุ่ม Google เปิดอยู่', 'Nothing waiting. Every company has an owner and Google sign-in is on.')
	);

	type Todo = { tone: 'warn' | 'deny'; icon: typeof Building2; title: string; detail: string; action: string; href: PlatformSection };
	const todos = $derived<Todo[]>([
		...(google && !google.enabled
			? [{ tone: 'deny' as const, icon: TriangleAlert, title: t('การเข้าสู่ระบบด้วย Google ปิดอยู่', 'Sign in with Google is off'), detail: t('ลูกค้าจะเข้าสู่ระบบและรับคำเชิญไม่ได้', "Customers can't sign in or accept invitations"), action: t('เปิดการเข้าสู่ระบบ', 'Turn it on'), href: 'signin' as PlatformSection }]
			: []),
		// The heading, its breakdown and the waiting item all count one set: the
		// companies that get the invite button (counts.ownerTodo). A suspended
		// one is never offered a link (Codex PC1 polish review 1).
		...(counts.needOwner
			? [{ tone: 'warn' as const, icon: Building2, title: t(`${counts.needOwner} บริษัทยังไม่มีเจ้าของ`, `${counts.needOwner} ${counts.needOwner === 1 ? 'company has' : 'companies have'} no owner`), detail: ownerTodoDetail, action: t('ส่งลิงก์เชิญ', 'Send a link'), href: 'companies' as PlatformSection }]
			: []),
		...(counts.ownerTodo.waiting
			? [{ tone: 'warn' as const, icon: Building2, title: t(`${counts.ownerTodo.waiting} บริษัทรอเจ้าของตอบรับ`, `${counts.ownerTodo.waiting} waiting for the owner`), detail: t('ส่งลิงก์ใหม่ได้ถ้าเจ้าของหาลิงก์ไม่เจอ', "Send a new link if the owner can't find theirs"), action: t('ดูบริษัท', 'View companies'), href: 'companies' as PlatformSection }]
			: []),
		...(catalogWaiting
			? [{ tone: 'warn' as const, icon: Grid2x2Plus, title: t(`${catalogWaiting} โปรแกรมในคลังรอทีม ORCA`, `${catalogWaiting} catalog ${catalogWaiting === 1 ? 'program waits' : 'programs wait'} for the ORCA team`), detail: t('ตั้งค่าแอปหรือยืนยันกับผู้ให้บริการ ลูกค้าจึงเชื่อมได้', 'Set up an app or confirm with the provider so customers can connect'), action: t('ดูคลังโปรแกรม', 'View the catalog'), href: 'catalog' as PlatformSection }]
			: []),
		...(canReviewPilotRequests && counts.pilots.received
			? [{ tone: 'warn' as const, icon: Inbox, title: t(`${counts.pilots.received} คำขอทดลองใช้ใหม่`, `${counts.pilots.received} new pilot ${counts.pilots.received === 1 ? 'request' : 'requests'}`), detail: t('ยังไม่มีใครติดต่อกลับ', 'Nobody has replied yet'), action: t('ดูคำขอ', 'View requests'), href: 'pilots' as PlatformSection }]
			: [])
	]);

	const sections = $derived([
		{ id: 'companies' as PlatformSection, label: term('customerCompanies', t), icon: Building2 },
		...(canReviewPilotRequests
			? [{ id: 'pilots' as PlatformSection, label: term('pilotRequests', t), icon: Inbox }]
			: []),
		{ id: 'signin' as PlatformSection, label: term('googleSignIn', t), icon: LogIn },
		{ id: 'oauth-apps' as PlatformSection, label: term('programOAuthApps', t), icon: KeyRound },
		{ id: 'catalog' as PlatformSection, label: term('programCatalog', t), icon: Grid2x2Plus },
		{ id: 'breakglass' as PlatformSection, label: term('breakGlass', t), icon: Shield }
	]);
</script>

<PageHeader title={term('platformOverview', t)} subtitle={t('ตั้งค่าของทุกบริษัท และงานที่รอทีม ORCA', 'Settings for every company, and what waits for the ORCA team.')} />

<ul class="overview-tiles" aria-busy={loading}>
	{#each tiles as tile (tile.label)}
		<li>
			<a href={localeHref(platformHref(tile.href))}>
				<span class="overview-tile-label">{tile.label}</span>
				<strong class="overview-tile-value">{tile.value}</strong>
				<span class="overview-tile-detail">{tile.detail}</span>
			</a>
		</li>
	{/each}
</ul>

<section class="overview-block" aria-labelledby="overview-todo-title">
	<h2 id="overview-todo-title">{t('รอทีม ORCA', 'Waiting for the ORCA team')}</h2>
	{#if loading}
		<p class="overview-quiet" role="status">{t('กำลังโหลด…', 'Loading…')}</p>
	{:else if todos.length}
		<ul class="overview-todos">
			{#each todos as todo (todo.title)}
				<li class="tone-{todo.tone}">
					<span class="overview-todo-icon" aria-hidden="true"><todo.icon size={16} strokeWidth={1.75} /></span>
					<span class="overview-todo-copy"><strong>{todo.title}</strong><small>{todo.detail}</small></span>
					<a class="k-button small" href={localeHref(platformHref(todo.href))}>{todo.action}<ArrowRight size={14} aria-hidden="true" /></a>
				</li>
			{/each}
		</ul>
	{:else if !(companiesError || pilotsError || googleError || catalogFailed)}
		<!-- Only when every read answered: a failed one proves nothing (Codex release review 64). -->
		<p class="overview-clear"><span class="overview-clear-dot" aria-hidden="true"></span>{clearText}</p>
	{/if}
	{#if companiesError || pilotsError || googleError || catalogFailed}
		<p class="overview-error" role="alert">{t('โหลดข้อมูลบางส่วนไม่สำเร็จ', "Some of this couldn't load.")} <button type="button" class="k-link-button" onclick={load}>{t('ลองอีกครั้ง', 'Try again')}</button></p>
	{/if}
</section>

<PlatformUsage {usage} error={usageError} onretry={loadUsage} />

<section class="overview-block" aria-labelledby="overview-sections-title">
	<h2 id="overview-sections-title">{t('ส่วนของแพลตฟอร์ม', 'Platform sections')}</h2>
	<ul class="platform-sections">
		{#each sections as section (section.id)}
			<li>
				<a href={localeHref(platformHref(section.id))}>
					<span class="platform-section-icon" aria-hidden="true"><section.icon size={18} /></span>
					<span class="platform-section-copy"><strong>{section.label}</strong></span>
					<ArrowRight size={16} aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	/* orca-type-remap v1 */
	.overview-tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
		gap: 14px;
		margin: 0 0 28px;
		padding: 0;
		list-style: none;
	}
	.overview-tiles a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		height: 100%;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		text-decoration: none;
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
		transition: border-color 0.15s var(--orca-ease);
	}
	.overview-tiles a:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.overview-tile-label {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
	}
	.overview-tile-value {
		font-size: 24px;
		font-weight: 700;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.overview-tile-detail {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.overview-block {
		margin-bottom: 28px;
	}
	.overview-block h2 {
		margin: 0 0 12px;
		font-size: 15px;
		font-weight: 650;
	}
	.overview-todos {
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		list-style: none;
	}
	.overview-todos li {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px;
	}
	.overview-todos li + li {
		border-top: 1px solid var(--orca-line-soft);
	}
	/* W0: a plain 16px line icon in --subtle, never a tinted tile. */
	.overview-todo-icon {
		display: inline-flex;
		flex: none;
		color: var(--orca-subtle);
	}
	.overview-todo-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.overview-todo-copy strong {
		font-size: 13.5px;
		font-weight: 600;
	}
	.overview-todo-copy small {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.overview-todos .k-button {
		flex: none;
		gap: 6px;
		text-decoration: none;
		white-space: nowrap;
	}
	.overview-quiet,
	.overview-clear {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 14px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	/* One text line in ink with a green dot, never a green box. */
	.overview-clear {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-text-2);
	}
	.overview-clear-dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-ok);
	}
	.overview-error {
		margin: 10px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
	}
	.platform-sections {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.platform-sections a {
		display: flex;
		align-items: center;
		gap: 14px;
		height: 100%;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		text-decoration: none;
		transition: border-color 0.15s var(--orca-ease);
	}
	.platform-sections a:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.platform-section-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.platform-section-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.platform-section-copy strong {
		font-size: 14px;
		font-weight: 600;
	}
	@media (max-width: 720px) {
		.overview-tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.overview-tiles a {
			padding: 14px;
		}
		.overview-tile-value {
			font-size: 20px;
		}
		.overview-todos li {
			flex-wrap: wrap;
			padding: 14px;
		}
		.overview-todo-copy {
			flex-basis: calc(100% - 48px);
		}
		.overview-todos .k-button {
			margin-left: 48px;
		}
	}
</style>
