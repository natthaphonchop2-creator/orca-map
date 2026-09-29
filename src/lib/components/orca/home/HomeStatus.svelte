<script lang="ts">
	import { Activity, ArrowRight, BookOpen, Boxes, CircleAlert, CircleCheck, Grid2x2Plus, Users } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { workspaceToolingReady } from '$lib/orca/activation';
	import { gatewayConnections, gatewayMemberIDs, gatewayToolCount } from '$lib/orca/gateway-sources';
	import { term } from '$lib/orca/glossary';
	import { connectedAppsHref } from '$lib/orca/connected-ai-apps';
	import { activeMembers, attentionCounts } from '$lib/orca/home-setup';
	import { STALE_DAYS } from '$lib/orca/secrets';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import { programEventOutcome, programStatus, programStatusCopy, type ProgramStatus } from '$lib/orca/program-catalog';
	import { eventToolLabel } from '$lib/orca/program-tools';
	import { displayDate, memberName, type OrcaAuditEvent, type OrcaBootstrap, type OrcaConnection, type OrcaConnectionHealth, type OrcaHub } from '$lib/services/orca';
	import StatusPill, { type StatusTone } from '../ui/StatusPill.svelte';

	// Home once setup is done: the company at a glance (the dashboard as it was,
	// on the page contract). Managers see the company; employees their own part.
	let {
		data,
		events,
		eventsError = false,
		onretry,
		iconName = (connection: OrcaConnection) => connection.name,
		staleApps = 0,
		health
	}: {
		data: OrcaBootstrap;
		/** The last week's tool calls per program (managers), so a tool that changed at the provider shows here too. */
		health?: Map<string, OrcaConnectionHealth>;
		/** AI apps and keys unused for 30 days (managers; ตรวจสอบ's stale filter). */
		staleApps?: number;
		/** The latest tool calls (newest first); undefined while loading. */
		events?: OrcaAuditEvent[];
		eventsError?: boolean;
		onretry?: () => void;
		iconName?: (connection: OrcaConnection) => string;
	} = $props();

	const manager = $derived(data.canManage);
	const counts = $derived(attentionCounts(data));
	// The same status as โปรแกรมที่เชื่อม and the program's page (programStatus).
	const statuses = $derived(new Map(data.connections.map((connection) => [connection.id, programStatus(connection, health?.get(connection.id))])));
	const countOf = (status: ProgramStatus) => [...statuses.values()].filter((value) => value === status).length;
	const ready = $derived(countOf('ready'));
	const paused = $derived(countOf('paused'));
	const setupNeeded = $derived(countOf('setup'));
	const review = $derived(countOf('review'));
	const blockedSpaces = $derived(counts.blocked);
	const activeSpaces = $derived(data.hubs.filter((hub) => hub.status === 'active').length);
	const today = $derived(data.hubs.reduce((sum, hub) => sum + Math.max(0, hub.usedToday || 0), 0));
	const spaces = $derived([...data.hubs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
	const programs = $derived([...data.connections].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
	const recent = $derived((events ?? []).slice(0, 6));

	const stats = $derived(
		manager
			? [
					{ label: term('programs', t), value: data.connections.length, detail: t(`พร้อมใช้ ${ready} โปรแกรม`, `${ready} ready`), icon: Grid2x2Plus, href: '/app?view=servers' },
					{ label: term('workspaces', t), value: data.hubs.length, detail: t(`เปิดใช้ ${activeSpaces} แห่ง`, `${activeSpaces} active`), icon: Boxes, href: '/app?view=workspaces' },
					{ label: term('team', t), value: activeMembers(data.members).length, detail: t('คนที่ใช้งานอยู่', 'Active people'), icon: Users, href: '/app?view=members' },
					{ label: t('ใช้งานวันนี้', 'Used today'), value: today, detail: t('ครั้ง จากทุกพื้นที่ทำงาน', 'times, all workspaces'), icon: Activity, href: '/app?view=executions' }
				]
			: [
					{ label: t('พื้นที่ทำงานของคุณ', 'Your workspaces'), value: data.hubs.length, detail: t(`เปิดใช้ ${activeSpaces} แห่ง`, `${activeSpaces} active`), icon: Boxes, href: '/app?view=workspaces' },
					{ label: t('โปรแกรมที่ใช้ได้', 'Programs you can use'), value: data.connections.length, detail: t(`พร้อมใช้ ${ready} โปรแกรม`, `${ready} ready`), icon: Grid2x2Plus, href: '/app?view=connect-ai#accounts' },
					{ label: t('ใช้งานวันนี้', 'Used today'), value: today, detail: t('ครั้ง ในพื้นที่ทำงานของคุณ', 'times, your workspaces'), icon: Activity, href: '/app?view=executions' }
				]
	);

	// The same words as ตรวจสอบ › ประวัติการใช้งาน and the program's ประวัติ: "admitted" is received, never waiting.
	function outcome(value: string | undefined): { label: string; tone: StatusTone } {
		const result = programEventOutcome(value);
		return { label: t(result.th, result.en), tone: result.tone };
	}
	function spaceStatus(hub: OrcaHub): { label: string; tone: StatusTone } {
		if (hub.status === 'active')
			return workspaceToolingReady(hub, data.connections) ? { label: t('เปิดใช้', 'Active'), tone: 'ok' } : { label: t('ยังใช้ไม่ได้', 'Not usable'), tone: 'warn' };
		if (hub.status === 'draft') return { label: t('ฉบับร่าง', 'Draft'), tone: 'neutral' };
		return { label: t('หยุดชั่วคราว', 'Paused'), tone: 'warn' };
	}
	function programChip(connection: OrcaConnection): { label: string; tone: StatusTone } {
		const copy = programStatusCopy(statuses.get(connection.id) ?? 'ready');
		return { label: t(copy.th, copy.en), tone: copy.tone };
	}
	const usage = (hub: OrcaHub) => (hub.dailyLimit > 0 ? Math.min(100, Math.round(((hub.usedToday || 0) / hub.dailyLimit) * 100)) : 0);
	// The program's own title for the tool, as on ตรวจสอบ and the program's page.
	const toolLabel = (event: OrcaAuditEvent) =>
		event.toolName ? eventToolLabel(data.connections, event.connectionID, event.toolName, orcaLocale.value === 'en' ? 'en' : 'th') : t('เรียกใช้โปรแกรม', 'Program call');
	const hubName = (id: string) => data.hubs.find((hub) => hub.id === id)?.name || '';
	const whoName = (id: string) => {
		const member = data.members.find((item) => item.id === id);
		return member ? memberName(member) : t('สมาชิก', 'Member');
	};
</script>

<section class="home-stats" class:three={stats.length === 3} aria-label={t('สรุป', 'Summary')}>
	{#each stats as stat (stat.href + stat.label)}
		<a class="home-stat" href={localeHref(stat.href)}>
			<span class="home-stat-label">{stat.label}<stat.icon size={16} aria-hidden="true" /></span>
			<strong>{stat.value.toLocaleString()}</strong>
			<small>{stat.detail}</small>
		</a>
	{/each}
</section>

<div class="home-grid">
	<div class="home-col">
		<section class="home-card" aria-labelledby="home-spaces-title">
			<header class="home-card-head">
				<div>
					<h2 id="home-spaces-title">{manager ? term('workspaces', t) : t('พื้นที่ทำงานของคุณ', 'Your workspaces')}</h2>
					<p>{t('ใครใช้โปรแกรมไหนได้ และ AI ทำอะไรได้บ้าง', 'Who can use which program, and what AI can do')}</p>
				</div>
				<a class="k-button small" href={localeHref('/app?view=workspaces')}>{t('ดูทั้งหมด', 'View all')}</a>
			</header>
			<div class="home-rows">
				{#each spaces as hub (hub.id)}
					{@const status = spaceStatus(hub)}
					{@const linked = gatewayConnections(hub, data.connections)}
					<a class="home-space" href={localeHref('/app?view=hub&hub=' + encodeURIComponent(hub.id))}>
						<span class="home-space-main">
							<strong title={hub.name}>{hub.name}</strong>
							<span class="home-space-meta">
								{#if linked.length}<span class="home-logos" aria-hidden="true">{#each linked.slice(0, 4) as connection (connection.id)}<CatalogIcon name={iconName(connection)} size={18} />{/each}</span>{/if}
								{t(`${linked.length} โปรแกรม · AI ทำได้ ${gatewayToolCount(hub)} อย่าง · ${gatewayMemberIDs(hub).length} คน`, `${linked.length} programs · AI can do ${gatewayToolCount(hub)} things · ${gatewayMemberIDs(hub).length} people`)}
							</span>
						</span>
						<span class="home-usage" title={t('ใช้วันนี้เทียบกับที่จำกัดต่อวัน', 'Used today against the daily limit')}>
							<small>{t(`วันนี้ ${hub.usedToday || 0} / ${hub.dailyLimit || '—'}`, `Today ${hub.usedToday || 0} / ${hub.dailyLimit || '—'}`)}</small>
							<span class="home-bar" aria-hidden="true"><i style:width={`${usage(hub)}%`}></i></span>
						</span>
						<StatusPill label={status.label} tone={status.tone} />
						<ArrowRight class="home-row-arrow" size={16} aria-hidden="true" />
					</a>
				{:else}
					<p class="home-empty">{manager ? t('ยังไม่มีพื้นที่ทำงาน AI', 'No AI workspaces yet') : t('ขอให้ผู้ดูแลบริษัทเพิ่มคุณในพื้นที่ทำงาน AI', 'Ask a company admin to add you to an AI workspace')}</p>
				{/each}
			</div>
		</section>

		<section class="home-card" aria-labelledby="home-activity-title">
			<header class="home-card-head">
				<div>
					<h2 id="home-activity-title">{t('การใช้งานล่าสุด', 'Recent use')}</h2>
					<p>{manager ? t('สิ่งที่ AI ของทีมทำผ่าน ORCA ล่าสุด', "What your team's AI did through ORCA") : t('สิ่งที่ AI ของคุณทำผ่าน ORCA ล่าสุด', 'What your AI did through ORCA')}</p>
				</div>
				<a class="k-button small" href={localeHref('/app?view=executions')}>{term('usageHistory', t)}</a>
			</header>
			{#if eventsError}
				<p class="home-empty" role="alert">{t('โหลดประวัติการใช้งานไม่สำเร็จ', 'Activity could not be loaded.')} <button type="button" class="k-link-button" onclick={onretry}>{t('ลองอีกครั้ง', 'Try again')}</button></p>
			{:else if !events}
				<p class="home-empty" role="status">{t('กำลังโหลดประวัติการใช้งาน…', 'Loading activity…')}</p>
			{:else if recent.length === 0}
				<p class="home-empty">{t('ยังไม่มีการใช้งาน ประวัติจะขึ้นเมื่อ AI ใช้ข้อมูลผ่าน ORCA', 'Nothing yet. Activity shows up when AI uses data through ORCA.')}</p>
			{:else}
				<table class="home-activity">
					<thead>
						<tr>
							<th scope="col">{t('สิ่งที่ AI ทำ', 'What AI did')}</th>
							{#if manager}<th scope="col">{t('คน', 'Person')}</th>{/if}
							<th scope="col">{t('ผล', 'Result')}</th>
							<th scope="col">{t('เวลา', 'Time')}</th>
						</tr>
					</thead>
					<tbody>
						{#each recent as event (event.id)}
							{@const result = outcome(event.outcome)}
							<tr>
								<td><strong title={event.toolName}>{toolLabel(event)}</strong>{#if hubName(event.hubID)}<small>{hubName(event.hubID)}</small>{/if}</td>
								<!-- An employee's history is only their own: no person column. -->
								{#if manager}<td class="home-activity-who" data-label={t('คน', 'Person')}>{whoName(event.userID)}</td>{/if}
								<td class="home-activity-result"><StatusPill label={result.label} tone={result.tone} /></td>
								<td class="home-activity-time"><time datetime={event.createdAt}>{displayDate(event.createdAt)}</time></td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	</div>

	<aside class="home-col" aria-label={t('สถานะ', 'Status')}>
		{#if manager}
			<section class="home-card" aria-labelledby="home-attention-title">
				<header class="home-card-head"><h2 id="home-attention-title">{t('ต้องดูแล', 'Needs attention')}</h2></header>
				<div class="home-rows">
					{#if setupNeeded > 0}
						<a class="home-alert" href={localeHref('/app?view=servers&status=needs-review')}>
							<CircleAlert size={17} aria-hidden="true" />
							<span><strong>{t(`โปรแกรมรอเลือกสิ่งที่ AI ทำได้ ${setupNeeded} โปรแกรม`, `${setupNeeded} ${setupNeeded === 1 ? 'program needs' : 'programs need'} you to choose what AI can do`)}</strong><small>{t('เลือกก่อน ทีมถึงจะใช้ได้', 'Choose it before your team can use them')}</small></span>
							<ArrowRight size={15} aria-hidden="true" />
						</a>
					{/if}
					{#if review > 0}
						<a class="home-alert" href={localeHref('/app?view=servers&status=needs-review')}>
							<CircleAlert size={17} aria-hidden="true" />
							<span><strong>{t(`โปรแกรมที่ต้องตรวจใหม่ ${review} โปรแกรม`, `${review} ${review === 1 ? 'program needs' : 'programs need'} a new review`)}</strong><small>{t('บางอย่างในโปรแกรมเปลี่ยนไป ตรวจใหม่ก่อน AI จึงใช้สิ่งนั้นได้', 'Something in it changed. Review it again so AI can use it.')}</small></span>
							<ArrowRight size={15} aria-hidden="true" />
						</a>
					{/if}
					{#if blockedSpaces > 0}
						<a class="home-alert" href={localeHref('/app?view=workspaces')}>
							<CircleAlert size={17} aria-hidden="true" />
							<span><strong>{t(`พื้นที่ทำงานที่ยังใช้ไม่ได้ ${blockedSpaces} แห่ง`, `${blockedSpaces} workspaces are not usable`)}</strong><small>{t('มีโปรแกรมที่หยุดชั่วคราว หรือยังไม่ได้เลือกสิ่งที่ AI ทำได้', 'A program is paused or not reviewed yet')}</small></span>
							<ArrowRight size={15} aria-hidden="true" />
						</a>
					{/if}
					{#if paused > 0}
						<a class="home-alert quiet" href={localeHref('/app?view=servers')}>
							<CircleAlert size={17} aria-hidden="true" />
							<span><strong>{t(`โปรแกรมที่หยุดชั่วคราว ${paused} โปรแกรม`, `${paused} programs are paused`)}</strong><small>{t('ทีมใช้ไม่ได้จนกว่าจะเปิดอีกครั้ง', "Your team can't use them until they're resumed")}</small></span>
							<ArrowRight size={15} aria-hidden="true" />
						</a>
					{/if}
					{#if staleApps > 0}
						<a class="home-alert quiet" href={localeHref(connectedAppsHref('stale'))}>
							<CircleAlert size={17} aria-hidden="true" />
							<span><strong>{t(`มี ${staleApps} แอป AI ที่ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `${staleApps} AI apps unused for ${STALE_DAYS}+ days`)}</strong><small>{t('ตัดการเชื่อมต่อถ้าไม่ได้ใช้แล้ว', 'Disconnect the ones no longer used')}</small></span>
							<ArrowRight size={15} aria-hidden="true" />
						</a>
					{/if}
					{#if setupNeeded + review + blockedSpaces + paused + staleApps === 0}
						<p class="home-clear"><CircleCheck size={17} aria-hidden="true" />{t('ไม่มีเรื่องที่ต้องดูแล', 'Nothing needs attention')}</p>
					{/if}
				</div>
			</section>
		{/if}

		<section class="home-card" aria-labelledby="home-programs-title">
			<header class="home-card-head">
				<h2 id="home-programs-title">{manager ? term('programs', t) : t('โปรแกรมที่ใช้ได้', 'Programs you can use')}</h2>
				<a class="k-button small" href={localeHref(manager ? '/app?view=servers' : '/app?view=connect-ai#accounts')}>{t('ดูทั้งหมด', 'View all')}</a>
			</header>
			<div class="home-rows">
				{#each programs as connection (connection.id)}
					{@const status = programChip(connection)}
					<a class="home-program" href={localeHref(manager ? '/app?view=servers&connection=' + encodeURIComponent(connection.id) : '/app?view=connect-ai#accounts')}>
						<CatalogIcon name={iconName(connection)} size={32} />
						<span class="home-program-copy"><strong title={connection.name}>{connection.name}</strong><small>{t(`AI ทำได้ ${connection.toolNames.length} อย่าง`, `AI can do ${connection.toolNames.length} ${connection.toolNames.length === 1 ? 'thing' : 'things'}`)}</small></span>
						<StatusPill label={status.label} tone={status.tone} />
					</a>
				{:else}
					<p class="home-empty">{manager ? t('ยังไม่มีโปรแกรมที่เชื่อม', 'No programs connected yet') : t('ยังไม่มีโปรแกรมที่คุณใช้ได้', 'No programs you can use yet')}</p>
				{/each}
			</div>
		</section>

		<a class="home-card home-knowledge" href={localeHref('/app?view=knowledge')}>
			<span class="home-knowledge-icon" aria-hidden="true"><BookOpen size={18} /></span>
			<span><strong>{term('knowledge', t)}</strong><small>{t('เก็บคู่มือและข้อมูลของบริษัท ให้ AI ตอบได้ถูกต้อง', 'Keep company guides and facts, so AI answers correctly')}</small></span>
			<ArrowRight size={16} aria-hidden="true" />
		</a>
	</aside>
</div>

<style>
	.home-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
		margin-bottom: 20px;
	}
	.home-stats.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.home-stat {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		text-decoration: none;
		transition: border-color 0.15s var(--orca-ease);
	}
	.home-stat:hover {
		text-decoration: none;
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.home-stat-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
	}
	.home-stat strong {
		font-size: 28px;
		font-weight: 700;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
	.home-stat small {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
		align-items: start;
		gap: 20px;
	}
	.home-col {
		display: grid;
		gap: 20px;
		min-width: 0;
	}
	.home-card {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.home-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px 14px;
	}
	.home-card .home-card-head h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 16px;
		font-weight: 700;
		line-height: 1.4;
	}
	.home-card-head p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.home-card-head :global(.k-button) {
		flex: none;
	}
	.home-rows {
		border-top: 1px solid var(--orca-line-soft);
	}
	.home-empty,
	.home-clear {
		margin: 0;
		padding: 18px 20px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.home-clear {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--orca-ok);
		font-weight: 500;
	}
	.home-space,
	.home-program,
	.home-alert {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 20px;
		color: var(--orca-ink);
		text-decoration: none;
		transition: background-color 0.15s var(--orca-ease);
	}
	.home-space + .home-space,
	.home-program + .home-program,
	.home-alert + .home-alert {
		border-top: 1px solid var(--orca-line-soft);
	}
	.home-space:hover,
	.home-program:hover,
	.home-alert:hover {
		text-decoration: none;
		background: var(--orca-hover);
	}
	.home-space-main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.home-space-main strong,
	.home-program-copy strong {
		overflow: hidden;
		font-size: 15px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.home-space-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-logos {
		display: inline-flex;
		gap: 4px;
	}
	.home-usage {
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 6px;
		width: 120px;
	}
	.home-usage small {
		color: var(--orca-muted);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.home-bar {
		height: 4px;
		overflow: hidden;
		border-radius: 99px;
		background: var(--orca-line);
	}
	.home-bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--orca-ink);
	}
	.home-space :global(.home-row-arrow) {
		flex: none;
		color: var(--orca-subtle);
	}
	.home-program-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.home-program-copy small,
	.home-alert small {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-alert {
		align-items: flex-start;
		color: var(--orca-warn);
	}
	.home-alert span {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.home-alert strong {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
	}
	.home-alert.quiet {
		color: var(--orca-muted);
	}
	.home-alert :global(svg:last-child) {
		align-self: center;
		color: var(--orca-subtle);
	}
	.home-activity {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	.home-activity th {
		padding: 10px 20px;
		border-top: 1px solid var(--orca-line-soft);
		border-bottom: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 12.5px;
		font-weight: 600;
		text-align: left;
	}
	.home-activity td {
		padding: 12px 20px;
		border-bottom: 1px solid var(--orca-line-soft);
		color: var(--orca-ink);
		vertical-align: middle;
	}
	.home-activity tr:last-child td {
		border-bottom: 0;
	}
	.home-activity td strong,
	.home-activity td small {
		display: block;
	}
	.home-activity td strong {
		font-weight: 600;
	}
	.home-activity td small {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.home-activity time {
		color: var(--orca-muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.home-knowledge {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 20px;
		color: var(--orca-ink);
		text-decoration: none;
	}
	.home-knowledge:hover {
		text-decoration: none;
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.home-knowledge > span:nth-child(2) {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.home-knowledge strong {
		font-size: 15px;
		font-weight: 600;
	}
	.home-knowledge small {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-knowledge-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
	}
	@media (max-width: 1100px) {
		.home-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.home-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* Tables become cards (the page contract). */
	@media (max-width: 720px) {
		.home-stats,
		.home-stats.three {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.home-stat {
			padding: 14px 16px;
		}
		.home-stat strong {
			font-size: 24px;
		}
		.home-card-head,
		.home-space,
		.home-program,
		.home-alert {
			padding-inline: 16px;
		}
		.home-space {
			flex-wrap: wrap;
			gap: 8px 12px;
		}
		.home-space-main {
			flex-basis: 100%;
		}
		.home-usage {
			flex: 1;
		}
		.home-space :global(.home-row-arrow) {
			display: none;
		}
		.home-activity thead {
			display: none;
		}
		.home-activity,
		.home-activity tbody,
		.home-activity tr,
		.home-activity td {
			display: block;
		}
		.home-activity tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 6px 12px;
			padding: 12px 16px;
			border-top: 1px solid var(--orca-line-soft);
		}
		.home-activity td {
			padding: 0;
			border: 0;
		}
		.home-activity td:first-child {
			grid-column: 1 / -1;
		}
		.home-activity td[data-label]::before {
			content: attr(data-label) ' · ';
			color: var(--orca-muted);
			font-size: 12.5px;
		}
		.home-activity .home-activity-who {
			grid-column: 1 / -1;
		}
	}
</style>
