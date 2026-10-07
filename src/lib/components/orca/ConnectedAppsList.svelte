<script lang="ts">
	import { Clock3, Info, Link2Off, Lock, UserRoundX } from '@lucide/svelte';
	import {
		agoLabel,
		appKind,
		appReach,
		avatarTone,
		canDisconnectAll,
		initial,
		shortDate,
		timeAgo,
		type AppGroup
	} from '$lib/orca/connected-ai-apps';
	import { term } from '$lib/orca/glossary';
	import { orcaLocale, t } from '$lib/orca/locale.svelte';
	import { canRevokeSecret, type SecretRow } from '$lib/orca/secrets';
	import AIAppTile from './AIAppTile.svelte';
	import StatusPill from './ui/StatusPill.svelte';

	// The grouped list of แอป AI ที่เชื่อมอยู่: one section per person, one row
	// per AI app sign-in or key. It only shows; the page asks before it acts.
	// It follows its own width, not the window's (the sidebar takes a share):
	// under 1000px the tag goes under the name, under 800px every group is a
	// card and every row stacks.
	let {
		groups,
		hubs,
		viewerID,
		viewerIsOwner,
		now,
		apps,
		people,
		ondisconnect,
		ondisconnectall
	}: {
		groups: AppGroup[];
		hubs: { id: string; name: string; status?: string; memberIDs?: string[]; effectiveMemberIDs?: string[] }[];
		viewerID: string;
		viewerIsOwner: boolean;
		now: number;
		apps: number;
		people: number;
		ondisconnect: (row: SecretRow, group: AppGroup) => void;
		ondisconnectall: (group: AppGroup) => void;
	} = $props();

	const locale = $derived(orcaLocale.value === 'en' ? 'en' : 'th');
	const former = () => t('ผู้ที่ไม่ได้เป็นสมาชิกแล้ว', 'Former member');
	const groupName = (group: AppGroup) => group.name || former();
	const appName = (row: SecretRow) => row.label || t('แอป AI', 'AI app');
	const roleLabel = (role: AppGroup['role']) =>
		role === 'owner' ? term('companyOwner', t) : role === 'admin' ? term('admin', t) : role === 'employee' ? term('employee', t) : '';
	function reachLabel(row: SecretRow) {
		const reach = appReach(row, hubs);
		if (reach.kind === 'all') return { lead: '', text: t('ทุกพื้นที่ทำงาน', 'Every workspace'), title: '' };
		if (reach.kind === 'none') return { lead: '', text: t('ยังไม่มีพื้นที่ทำงาน', 'No workspace yet'), title: '' };
		if (reach.kind === 'some') return { lead: '', text: t(`${reach.names.length} พื้นที่ทำงาน`, `${reach.names.length} workspaces`), title: reach.names.join(', ') };
		// A key made for a workspace that is archived or deleted reaches nothing now.
		if (!reach.name) return { lead: '', text: t('พื้นที่ทำงานที่ปิดไปแล้ว', 'A closed workspace'), title: '' };
		// Its workspace is paused, or its holder may no longer use it.
		if (reach.blocked) return { lead: '', text: t(`${reach.name} · ใช้ไม่ได้ตอนนี้`, `${reach.name} · not usable now`), title: t('พื้นที่ทำงานนี้ไม่ได้เปิดใช้งาน หรือเจ้าของแอปไม่ได้อยู่ในพื้นที่นี้แล้ว', 'This workspace is not active, or the app\'s holder is no longer in it.') };
		return { lead: reach.only ? t('เฉพาะ', 'Only') : '', text: reach.name, title: reach.name };
	}
</script>

<div class="cx-apps">
	<div class="cx-list">
		<div class="cx-cols" aria-hidden="true">
			<span>{t('แอป AI', 'AI app')}</span><span>{t('ใช้ข้อมูลจาก', 'Uses data from')}</span><span
				class="cx-hint"
				title={t('แอปแบบเข้าสู่ระบบ นับจากครั้งที่แอปต่ออายุการเชื่อมต่อ', 'For a sign-in, this counts from when the app last renewed it')}
				>{t('ใช้งานล่าสุด', 'Last used')}<Info size={14} /></span
			><span>{t('หมดอายุ', 'Expires')}</span><span></span>
		</div>
		{#each groups as group (group.userID)}
			{@const tone = avatarTone(group.userID, group.role)}
			<section class="cx-group" aria-labelledby={`cx-person-${group.userID}`}>
				<header class="cx-gh">
					<span class="cx-avatar tone-{tone}" aria-hidden="true"
						>{#if group.name}{initial(group.name)}{:else}<UserRoundX size={17} />{/if}</span
					>
					<div class="cx-gn">
						<h2 id={`cx-person-${group.userID}`}>{groupName(group)}{#if group.isViewer}<i>{t(' (คุณ)', ' (you)')}</i>{/if}</h2>
						{#if group.role}<StatusPill label={roleLabel(group.role)} tone={group.role === 'owner' ? 'citron' : 'neutral'} />{/if}
						<span class="cx-gc">{t(`เชื่อม ${group.all.length} แอป`, `${group.all.length} ${group.all.length === 1 ? 'app' : 'apps'}`)}</span>
					</div>
					{#if canDisconnectAll(group, viewerID, viewerIsOwner)}<button
							type="button"
							class="k-button quiet small cx-all"
							onclick={() => ondisconnectall(group)}
							aria-label={t(`ตัดการเชื่อมต่อทั้งหมดของ ${groupName(group)}`, `Disconnect all of ${groupName(group)}'s apps`)}
							><Link2Off size={15} aria-hidden="true" />{t('ตัดการเชื่อมต่อทั้งหมด', 'Disconnect all')}</button
						>{/if}
				</header>
				<ul class="cx-rows">
					{#each group.rows as row (`${row.kind}:${row.id}`)}
						{@const kind = appKind(row)}
						{@const reach = reachLabel(row)}
						{@const last = timeAgo(row.lastActiveAt, now, row.kind === 'key')}
						<li class="cx-row">
							<div class="cx-app">
								<AIAppTile {kind} />
								<span class="cx-name"
									><strong title={appName(row)}>{appName(row)}</strong><span class="cx-tag"
										>{row.kind === 'key' ? t('คีย์', 'Key') : t('เข้าสู่ระบบ', 'Sign-in')}</span
									></span
								>
							</div>
							<div class="cx-cell cx-reach">
								<span class="cx-label">{t('ใช้ข้อมูลจาก', 'Uses data from')}</span>
								<span title={reach.title || undefined}>{#if reach.lead}<span class="cx-muted">{reach.lead}</span>{' '}{/if}{reach.text}</span>
							</div>
							<div class="cx-cell cx-last" class:warn={row.stale}>
								<span class="cx-label">{t('ใช้งานล่าสุด', 'Last used')}</span>
								<span class="cx-last-value"
									>{#if row.stale}<Clock3 size={14} aria-hidden="true" />{/if}{row.lastActiveAt ? agoLabel(last, t) : t('ยังไม่เคยใช้', 'Never used')}</span
								>
								{#if !row.lastActiveAt}<small>{t(`สร้างเมื่อ ${agoLabel(timeAgo(row.createdAt, now, false), t)}`, `Created ${agoLabel(timeAgo(row.createdAt, now, false), t).toLowerCase()}`)}</small>{/if}
							</div>
							<div class="cx-cell cx-exp">
								<span class="cx-label">{t('หมดอายุ', 'Expires')}</span>
								{#if row.neverExpires}<StatusPill label={t('ไม่หมดอายุ', 'Never expires')} tone="warn" />{:else}<span>{shortDate(row.expiresAt, locale)}</span>{/if}
							</div>
							<div class="cx-act">
								{#if canRevokeSecret(row, viewerID, viewerIsOwner)}<button
										type="button"
										class="k-button small cx-revoke"
										onclick={() => ondisconnect(row, group)}
										aria-label={t(`ตัดการเชื่อมต่อ ${appName(row)} ของ ${groupName(group)}`, `Disconnect ${groupName(group)}'s ${appName(row)}`)}
										>{term('disconnect', t)}</button
									>{:else}<span class="cx-locked" title={t('เฉพาะเจ้าของบริษัทตัดการเชื่อมต่อของเจ้าของบริษัทได้', "Only a company owner can disconnect an owner's apps")}
										><Lock size={14} aria-hidden="true" />{t('เฉพาะเจ้าของบริษัท', 'Company owner only')}</span
									>{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
	<p class="cx-foot">
		<Info size={15} aria-hidden="true" />
		<span
			><b>{t('ใช้งานล่าสุด', 'Last used')}</b>
			{t('ของแอปแบบเข้าสู่ระบบ นับจากครั้งที่แอปต่ออายุการเชื่อมต่อ จึงอาจคลาดไปเล็กน้อย', 'for a sign-in counts from when the app last renewed it, so it can be a little off.')}</span
		>
		<span class="cx-sum">{t(`${apps} แอป จาก ${people} คน`, `${apps} ${apps === 1 ? 'app' : 'apps'} from ${people} ${people === 1 ? 'person' : 'people'}`)}</span>
	</p>
</div>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.cx-apps {
		container: cx-apps / inline-size;
	}
	.cx-list {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.cx-cols,
	.cx-row {
		display: grid;
		grid-template-columns: minmax(0, 1.9fr) minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 0.95fr) 164px;
		column-gap: 20px;
		align-items: center;
	}
	.cx-cols {
		padding: 11px 20px 11px 72px;
		border-bottom: 1px solid var(--orca-line);
		background: var(--orca-surface);
		color: var(--orca-subtle);
		font-size: 12px;
		font-weight: 600;
	}
	.cx-hint {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.cx-group + .cx-group {
		border-top: 1px solid var(--orca-line);
	}
	.cx-gh {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 60px;
		padding: 12px 20px;
		background: var(--orca-surface-2);
	}
	.cx-avatar {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		font-size: 13.5px;
		font-weight: 700;
	}
	.cx-avatar.tone-citron {
		background: var(--orca-citron-soft);
		box-shadow: inset 0 0 0 1px var(--orca-citron-line);
		color: var(--orca-ink);
	}
	.cx-avatar.tone-ok {
		background: var(--orca-ok-bg);
		box-shadow: inset 0 0 0 1px var(--orca-ok-line);
		color: var(--orca-ok);
	}
	.cx-avatar.tone-quiet {
		background: var(--orca-secondary);
		box-shadow: inset 0 0 0 1px var(--orca-line);
		color: var(--orca-text-2);
	}
	.cx-avatar.tone-ink {
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.cx-gn {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		min-width: 0;
	}
	.cx-gn h2 {
		margin: 0;
		overflow-wrap: anywhere;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 650;
		line-height: 1.4;
	}
	.cx-gn h2 i {
		color: var(--orca-muted);
		font-style: normal;
		font-weight: 500;
	}
	.cx-gc {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.cx-gc::before {
		content: '·';
		margin-right: 10px;
		color: var(--orca-line-strong);
	}
	.cx-list .cx-all {
		flex: none;
		margin-right: -10px;
		color: var(--orca-text-2) !important;
		font-size: 13px;
	}
	.cx-all :global(svg) {
		color: var(--orca-muted);
	}
	.cx-list .cx-all:hover {
		color: var(--orca-deny) !important;
	}
	.cx-list .cx-all:hover :global(svg) {
		color: var(--orca-deny);
	}
	.cx-rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.cx-row {
		min-height: 62px;
		padding: 13px 20px 13px 72px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-text-2);
		font-size: 13.5px;
	}
	.cx-rows > .cx-row:first-child {
		border-top-color: var(--orca-line);
	}
	.cx-row:hover {
		background: var(--orca-hover);
	}
	.cx-app {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.cx-name {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.cx-app strong {
		max-width: 100%;
		min-width: 0;
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cx-tag {
		flex: none;
		padding: 1px 8px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-sm);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 11.5px;
		font-weight: 600;
		white-space: nowrap;
	}
	.cx-cell {
		min-width: 0;
	}
	.cx-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.cx-reach > span:last-child {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cx-muted {
		color: var(--orca-muted);
	}
	.cx-last {
		display: flex;
		flex-direction: column;
		line-height: 1.35;
	}
	.cx-last-value {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.cx-last.warn .cx-last-value {
		color: var(--orca-warn);
		font-weight: 600;
	}
	.cx-last small {
		color: var(--orca-muted);
		font-size: 11.5px;
	}
	.cx-act {
		display: flex;
		justify-content: flex-end;
	}
	.cx-list .cx-revoke {
		min-width: 124px;
		justify-content: center;
		color: var(--orca-text-2) !important;
		font-size: 13px;
	}
	.cx-list .cx-revoke:hover {
		border-color: var(--orca-deny-line);
		background: var(--orca-surface);
		color: var(--orca-deny) !important;
	}
	.cx-locked {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--orca-muted);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
	}
	.cx-foot {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 14px 0 0;
		color: var(--orca-muted);
		font-size: 12px;
		line-height: 1.55;
	}
	.cx-foot > :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.cx-foot b {
		color: var(--orca-text-2);
		font-weight: 600;
	}
	.cx-sum {
		margin-left: auto;
		white-space: nowrap;
	}
	/* Narrower: rows start at the edge and the tag goes under the name. */
	@container cx-apps (max-width: 1000px) {
		.cx-cols,
		.cx-row {
			grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.95fr) auto;
			column-gap: 14px;
			padding-left: 20px;
		}
		.cx-name {
			flex-direction: column;
			align-items: flex-start;
			gap: 3px;
		}
		.cx-list .cx-revoke {
			min-width: 0;
		}
	}
	/* Cards: every group is a card, every row stacks with its labels. */
	@container cx-apps (max-width: 800px) {
		.cx-list {
			display: grid;
			gap: 12px;
			overflow: visible;
			border: 0;
			background: transparent;
		}
		.cx-cols {
			display: none;
		}
		.cx-group {
			overflow: hidden;
			border: 1px solid var(--orca-line);
			border-radius: var(--orca-radius-lg);
			background: var(--orca-surface);
		}
		.cx-group + .cx-group {
			border-top: 1px solid var(--orca-line);
		}
		.cx-gh {
			flex-wrap: wrap;
			gap: 12px;
			padding: 14px 16px;
		}
		.cx-gn {
			flex: 1 1 0;
			gap: 4px 8px;
		}
		.cx-gn h2 {
			flex-basis: 100%;
		}
		.cx-gc::before {
			content: none;
		}
		.cx-list .cx-all {
			width: 100%;
			margin: 0;
			justify-content: center;
			border-color: var(--orca-line);
			background: var(--orca-surface);
		}
		.cx-row {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 10px 14px;
			padding: 14px 16px;
		}
		.cx-row:hover {
			background: transparent;
		}
		.cx-app {
			grid-column: 1 / -1;
		}
		.cx-name {
			flex-direction: row;
			align-items: center;
			gap: 12px;
		}
		.cx-reach {
			grid-column: 1 / -1;
		}
		.cx-label {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
			display: block;
			margin-bottom: 2px;
			color: var(--orca-subtle);
			font-size: 11.5px;
			font-weight: 600;
		}
		.cx-reach > span:last-child {
			white-space: normal;
		}
		.cx-act {
			grid-column: 1 / -1;
			justify-content: stretch;
		}
		.cx-list .cx-revoke {
			width: 100%;
			min-height: 40px;
		}
		.cx-locked {
			justify-content: center;
			width: 100%;
			padding: 8px 0 2px;
		}
		.cx-foot {
			flex-wrap: wrap;
		}
		.cx-sum {
			margin-left: 23px;
		}
	}
	/* A wide card (a tablet, or a laptop with the sidebar open): the group
	   header stays on one line and each app's details and button share a row. */
	@container cx-apps (min-width: 561px) and (max-width: 800px) {
		.cx-gh {
			flex-wrap: nowrap;
		}
		.cx-gn h2 {
			flex-basis: auto;
		}
		.cx-gc::before {
			content: '·';
		}
		.cx-list .cx-all {
			width: auto;
			margin-right: -10px;
			border-color: transparent;
			background: transparent;
		}
		.cx-row {
			grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) auto;
			align-items: start;
		}
		.cx-reach,
		.cx-act {
			grid-column: auto;
		}
		.cx-act {
			align-self: center;
		}
		.cx-list .cx-revoke {
			width: auto;
			min-height: 36px;
		}
		.cx-locked {
			width: auto;
			padding: 0 0 8px;
		}
		.cx-sum {
			margin-left: auto;
		}
	}
</style>
