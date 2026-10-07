<script lang="ts">
	import { Check, ChevronRight } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { term } from '$lib/orca/glossary';
	import { programsToReconnect, RECONNECT_WORD } from '$lib/orca/home-attention';
	import { askablePrograms, type AIState } from '$lib/orca/home-setup';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import { programEventOutcome } from '$lib/orca/program-catalog';
	import { eventToolLabel } from '$lib/orca/program-tools';
	import { displayDate, memberName, type OrcaAuditEvent, type OrcaBootstrap, type OrcaConnection, type OrcaProgramAccount } from '$lib/services/orca';

	// หน้าหลัก below ต้องดูแล (W0): the overview tiles (โปรแกรม · AI ของฉัน ·
	// Skills · คลังความรู้) and ล่าสุด, the latest six calls. A call that went
	// through shows its time; only one that did not gets a word.
	let {
		data,
		events,
		eventsError = false,
		onretry,
		iconName = (connection: OrcaConnection) => connection.name,
		accounts,
		ai = 'unknown',
		aiApp = '',
		skills
	}: {
		data: OrcaBootstrap;
		/** The latest tool calls (newest first); undefined while loading. */
		events?: OrcaAuditEvent[];
		eventsError?: boolean;
		onretry?: () => void;
		iconName?: (connection: OrcaConnection) => string;
		/** The company accounts, for the โปรแกรม tile's ต้องเชื่อมใหม่ (managers). */
		accounts?: readonly OrcaProgramAccount[];
		/** The viewer's AI (homeAIState). */
		ai?: AIState;
		/** The app named on the tile (homeAIApp): "" when none is, or several differ. */
		aiApp?: string;
		/** Skills' tile, only with the company's skills feature. */
		skills?: { count: number };
	} = $props();

	const manager = $derived(data.canManage);
	const live = $derived(data.connections.filter((connection) => !connection.archivedAt && !connection.deletedAt));
	// Employees: the programs they can use, as AI ของฉัน › บัญชีโปรแกรมของคุณ lists them.
	const programs = $derived(manager ? live : askablePrograms(data));
	const reconnect = $derived(manager ? programsToReconnect(live, accounts).length : 0);
	const recent = $derived((events ?? []).slice(0, 6));
	const aiLabel = $derived(ai === 'connected' ? aiApp.trim() || t('เชื่อมแล้ว', 'Connected') : '');

	// The program's own title for the tool, as on ประวัติ and the program's page.
	const toolLabel = (event: OrcaAuditEvent) =>
		event.toolName ? eventToolLabel(data.connections, event.connectionID, event.toolName, orcaLocale.value === 'en' ? 'en' : 'th') : t('เรียกใช้โปรแกรม', 'Program call');
	const hubName = (id: string) => data.hubs.find((hub) => hub.id === id)?.name || '';
	const whoName = (id: string) => {
		const member = data.members.find((item) => item.id === id);
		return member ? memberName(member) : t('สมาชิก', 'Member');
	};
	// Today: the time only; yesterday: เมื่อวาน; older: the date (the mockup's ล่าสุด).
	function when(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return displayDate(value);
		const now = new Date();
		const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		if (date.toDateString() === now.toDateString())
			return date.toLocaleTimeString(orcaLocale.value === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit' });
		if (date.toDateString() === yesterday.toDateString()) return t('เมื่อวาน', 'Yesterday');
		return displayDate(value);
	}
	const eventProgram = (event: OrcaAuditEvent) => data.connections.find((connection) => connection.id === event.connectionID);
	// Only a call that did not go through gets a word; "admitted" was received, never waiting.
	function failure(event: OrcaAuditEvent): string {
		const result = programEventOutcome(event.outcome);
		return result.tone === 'deny' ? t(result.th, result.en) : '';
	}
</script>

<section class="home-tiles" class:three={!skills} aria-label={t('ภาพรวม', 'Overview')}>
	<a class="home-tile" href={localeHref(manager ? '/app?view=servers' : '/app?view=connect-ai#accounts')}>
		<!-- Employees have no โปรแกรม page: their tile is named for what it opens, AI ของฉัน › บัญชีโปรแกรมของคุณ. -->
		<span class="home-tile-label">{manager ? term('programs', t) : t('บัญชีโปรแกรมของคุณ', 'Your program accounts')}<ChevronRight size={14} aria-hidden="true" /></span>
		<span class="home-tile-value">{programs.length.toLocaleString()}<small>{manager ? t('เชื่อมแล้ว', 'connected') : t('ใช้ได้', 'you can use')}</small></span>
		<span class="home-tile-foot">
			<span class="home-logos" aria-hidden="true">{#each programs.slice(0, 6) as connection (connection.id)}<CatalogIcon name={iconName(connection)} size={22} />{/each}</span>
			{#if reconnect > 0}<span class="home-state warn"><span class="home-dot" aria-hidden="true"></span>{t(`${RECONNECT_WORD.th} ${reconnect}`, `${RECONNECT_WORD.en} ${reconnect}`)}</span>{/if}
		</span>
	</a>
	<a class="home-tile" href={localeHref('/app?view=connect-ai')}>
		<span class="home-tile-label">{term('myAI', t)}<ChevronRight size={14} aria-hidden="true" /></span>
		<span class="home-tile-value text">{aiLabel || (ai === 'unknown' ? '—' : t('ยังไม่ได้เชื่อม', 'Not connected'))}</span>
		<span class="home-tile-foot">
			{#if ai === 'connected'}<span class="home-state ok"><Check size={14} strokeWidth={2.25} aria-hidden="true" />{t('เชื่อมแล้ว', 'Connected')}</span>
			{:else if ai !== 'unknown'}<span class="home-meta">{t('ใช้ ORCA ใน ChatGPT หรือ Claude', 'Use ORCA in ChatGPT or Claude')}</span>{/if}
		</span>
	</a>
	{#if skills}
		<a class="home-tile" href={localeHref('/app?view=skills')}>
			<span class="home-tile-label">{term('skills', t)}<ChevronRight size={14} aria-hidden="true" /></span>
			<span class="home-tile-value">{skills.count.toLocaleString()}<small>{t('พร้อมใช้', 'ready')}</small></span>
			<span class="home-tile-foot"></span>
		</a>
	{/if}
	<a class="home-tile" href={localeHref('/app?view=knowledge')}>
		<span class="home-tile-label">{term('knowledge', t)}<ChevronRight size={14} aria-hidden="true" /></span>
		<!-- No count: one library per workspace, and a partial sum would mislead (Codex W0 review 1). -->
		<span class="home-tile-value text">{t('ดูคลังความรู้', 'Open the library')}</span>
		<span class="home-tile-foot"><span class="home-meta">{t('สิ่งที่ AI ใช้ตอบ', 'What AI answers from')}</span></span>
	</a>
</section>

<section class="home-recent" aria-labelledby="home-recent-title">
	<header class="home-recent-head">
		<h2 id="home-recent-title">{t('ล่าสุด', 'Latest')}</h2>
		<a class="home-link" href={localeHref('/app?view=executions')}>{t('ดูประวัติ', 'See history')}</a>
	</header>
	<div class="home-panel">
		{#if eventsError}
			<p class="home-empty" role="alert">{t('โหลดประวัติการใช้งานไม่สำเร็จ', 'Activity could not be loaded.')} <button type="button" class="k-link-button" onclick={onretry}>{t('ลองอีกครั้ง', 'Try again')}</button></p>
		{:else if !events}
			<p class="home-empty" role="status">{t('กำลังโหลดประวัติการใช้งาน…', 'Loading activity…')}</p>
		{:else if recent.length === 0}
			<p class="home-empty">{t('ยังไม่มีการใช้งาน ประวัติจะขึ้นเมื่อ AI ใช้ข้อมูลผ่าน ORCA', 'Nothing yet. Activity shows up when AI uses data through ORCA.')}</p>
		{:else}
			<ul class="home-events">
				{#each recent as event (event.id)}
					{@const program = eventProgram(event)}
					{@const failed = failure(event)}
					<li class="home-event">
						{#if program}<CatalogIcon name={iconName(program)} size={32} />{/if}
						<span class="home-event-copy">
							<strong title={event.toolName}>{toolLabel(event)}</strong>
							<!-- An employee's history is only their own: no person. -->
							<small>{[manager ? whoName(event.userID) : '', hubName(event.hubID)].filter(Boolean).join(' · ')}</small>
						</span>
						{#if failed}<span class="home-state deny"><span class="home-dot" aria-hidden="true"></span>{failed}</span>
						{:else}<time datetime={event.createdAt}>{when(event.createdAt)}</time>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<style>
	.home-tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 28px;
	}
	.home-tiles.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.home-tile {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		padding: 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		text-decoration: none;
	}
	.home-tile:hover {
		border-color: var(--orca-line-strong);
		text-decoration: none;
	}
	.home-tile-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
	}
	.home-tile-label :global(svg) {
		color: var(--orca-subtle);
	}
	.home-tile-value {
		font-size: 22px;
		font-weight: 600;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
	.home-tile-value.text {
		overflow: hidden;
		font-size: 18px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.home-tile-value small {
		margin-left: 6px;
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
	}
	.home-tile-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px 8px;
		min-height: 24px;
		margin-top: auto;
	}
	.home-logos {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
		overflow: hidden;
		max-height: 24px;
	}
	.home-state {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
	.home-state.ok {
		color: var(--orca-ink);
	}
	/* Status colour only as a small dot; the words stay in ink (W0). */
	.home-state.warn,
	.home-state.deny {
		color: var(--orca-ink);
	}
	.home-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-muted);
	}
	.warn .home-dot {
		background: var(--orca-warn);
	}
	.deny .home-dot {
		background: var(--orca-deny);
	}
	.home-meta {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.home-recent-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.home-recent-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.home-link {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
	}
	.home-link:hover {
		color: var(--orca-ink);
	}
	.home-panel {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.home-empty {
		margin: 0;
		padding: 18px 16px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.home-events {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.home-event {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 16px;
	}
	.home-event + .home-event {
		border-top: 1px solid var(--orca-line);
	}
	.home-event-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.home-event-copy strong {
		overflow: hidden;
		font-size: 14px;
		font-weight: 500;
		line-height: 1.45;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.home-event-copy small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.home-event time {
		flex: none;
		color: var(--orca-muted);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	@media (max-width: 1080px) {
		.home-tiles,
		.home-tiles.three {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		/* Three tiles on two columns: the last one takes the row. */
		.home-tiles.three .home-tile:last-child {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 720px) {
		.home-tile {
			padding: 14px;
		}
		.home-tile-value {
			font-size: 20px;
		}
		/* A phone shows at most four logos per tile. */
		.home-logos :global(.orca-catalog-icon:nth-child(n + 5)) {
			display: none;
		}
		.home-event {
			align-items: flex-start;
			padding: 11px 14px;
		}
	}
</style>
