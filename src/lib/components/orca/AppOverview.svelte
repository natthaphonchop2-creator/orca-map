<script lang="ts">
	import LifecycleActions from './LifecycleActions.svelte';
	import { gatewayConnections, gatewayToolCount, gatewayHasMember, gatewayMemberIDs } from '$lib/orca/gateway-sources';
	import { filterGateways } from '$lib/orca/gateway-list';
	import { tick } from 'svelte';
	import { connectionReady } from '$lib/orca/activation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		memberName,
		memberRole,
		statusLabels,
		type HubStatus,
		type OrcaBootstrap
	} from '$lib/services/orca';
	import {
		ArrowRight,
		BookOpen,
		ChevronRight,
		Folder,
		Plug,
		Plus,
		Search,
		Users
	} from '@lucide/svelte';

	let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
	let notice = $state('');
	let listTitle: HTMLHeadingElement;
	const currentHubs = $derived(data.hubs.filter((hub) => hub.status !== 'deleted'));
	const mainHubs = $derived(currentHubs.filter((hub) => hub.status !== 'archived'));
	const archivedHubs = $derived(currentHubs.filter((hub) => hub.status === 'archived'));
	async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
		notice = action === 'archive' ? t('จัดเก็บ Gateway แล้ว ดูได้ที่แท็บจัดเก็บแล้ว', 'Gateway archived. Find it under Archived.')
			: action === 'restore' ? t('กู้คืน Gateway แล้ว โดยยังระงับการใช้งานอยู่', 'Gateway restored in Paused status.')
			: t('ลบ Gateway แล้ว', 'Gateway deleted.');
		await onchanged();
		await tick();
		listTitle?.focus();
	}
	let query = $state('');
	let statusFilter = $state<HubStatus | ''>('');
	const filteredTotal = $derived(statusFilter === 'archived' ? archivedHubs.length : mainHubs.length);
	const currentUser = $derived(data.members.find((member) => member.id === data.currentUserID));
	const readyConnections = $derived(data.connections.filter(connectionReady));
	const createWorkspaceHref = $derived(
		`/app?view=new${readyConnections.length === 1 ? `&connection=${encodeURIComponent(readyConnections[0].id)}` : ''}`
	);
	const memberHubs = $derived(
		mainHubs.filter((hub) => gatewayHasMember(hub, data.currentUserID))
	);
	const knowledgeHref = $derived(
		`/app?view=knowledge${memberHubs.length === 1 ? `&hub=${encodeURIComponent(memberHubs[0].id)}` : ''}`
	);
	const filters = $derived([
		{ value: '' as const, label: t('ทั้งหมด', 'All') },
		{ value: 'active' as const, label: t('เปิดใช้งาน', 'Active') },
		{ value: 'draft' as const, label: t('แบบร่าง', 'Draft') },
		{ value: 'paused' as const, label: t('ระงับ', 'Paused') },
		...(data.canManage ? [{ value: 'archived' as const, label: t(`จัดเก็บแล้ว (${archivedHubs.length})`, `Archived (${archivedHubs.length})`) }] : [])
	]);
	const visibleHubs = $derived(filterGateways(data.hubs, data.connections, query, statusFilter));
	function clearFilters() {
		query = '';
		statusFilter = '';
	}
</script>

<div class="workspace-home">
	<header class="home-heading">
		<div>
			<h1>{t('พื้นที่ทำงาน AI', 'AI workspaces')}</h1>
			<p>
				{data.canManage
					? t(
							'จัดเครื่องมือและสมาชิก ให้ทีมใช้งานผ่าน MCP Gateway เดียวกัน',
							'Bring tools and people together, so your team can get to work.'
						)
					: t(
							'เลือก Gateway แล้วเชื่อมกับแอป AI ที่คุณใช้อยู่',
							'Choose a Gateway and connect the AI client you already use.'
						)}
			</p>
		</div>
		<div class="k-actions"><a class="home-button" href={localeHref("/app?view=settings&section=ai")}>{t("เชื่อม AI กับ ORCA", "Connect AI to ORCA")}</a>
		{#if data.canManage}<a class="home-button primary" href={localeHref(createWorkspaceHref)}
				><Plus size={19} aria-hidden="true" />{t('สร้างพื้นที่ทำงาน AI', 'New AI workspace')}</a
			>{/if}</div>
	</header>
	{#if notice}<div class="k-banner success" role="status">{notice}</div>{/if}
	<div class="home-columns">
		<section class="workspace-panel" aria-labelledby="home-workspaces-title">
			<div class="workspace-toolbar">
				<h2 id="home-workspaces-title" bind:this={listTitle} tabindex="-1">
					{statusFilter === 'archived' ? t('Gateway ที่จัดเก็บแล้ว', 'Archived Gateways') : 'MCP Gateways'}<span>{filteredTotal}</span>
				</h2>
				<label class="workspace-search"
					><Search size={17} aria-hidden="true" /><span class="sr-only"
						>{t('ค้นหา Gateway', 'Search Gateways')}</span
					><input
						type="search"
						bind:value={query}
						placeholder={t('ค้นหา Gateway', 'Search Gateways')}
					/></label
				>
				<div
					class="workspace-filters"
					role="group"
					aria-label={t('กรองตามสถานะ Gateway', 'Filter Gateways by status')}
				>
					{#each filters as filter}<button
							type="button"
							class:selected={statusFilter === filter.value}
							aria-pressed={statusFilter === filter.value}
							onclick={() => (statusFilter = filter.value)}>{filter.label}</button
						>{/each}
				</div>
			</div>
			{#if visibleHubs.length > 0}
				<div class="workspace-list">
					{#each visibleHubs as hub (hub.id)}
						{@const sources = gatewayConnections(hub, data.connections)}
						<article class="workspace-card">
						<a
							class="workspace-card-main"
							href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}
						>
							<span class="workspace-symbol"
								><Folder size={24} strokeWidth={1.65} aria-hidden="true" /></span
							>
							<div class="workspace-card-content">
								<div class="workspace-card-heading">
									<h3>{hub.name}</h3>
									<span
										class="workspace-status"
										class:active={hub.status === 'active'}
										class:paused={hub.status === 'paused'}>{statusLabels[hub.status]}</span
									>
								</div>
								{#if hub.description}<p class="workspace-description">{hub.description}</p>{/if}
								<div class="workspace-card-meta">
									<span class="workspace-source"
										><Plug size={13} aria-hidden="true" />{sources.map((source) => source.name).join(', ') ||
											t('ยังไม่ได้เลือกระบบ', 'No system selected')}</span
									><span>{gatewayToolCount(hub)} {t('เครื่องมือ', 'tools')}</span><span
										>{gatewayMemberIDs(hub).length} {t('สมาชิก', 'members')}</span
									>
								</div>
							</div>
							<ChevronRight class="workspace-open" size={18} aria-hidden="true" />
						</a>
						{#if data.canManage}<div class="workspace-card-actions">
							<LifecycleActions entity={hub} kind="gateway" archived={hub.status === 'archived'} canManage={data.canManage} compact onchanged={lifecycleChanged} onreload={onchanged} />
						</div>{/if}
						</article>
					{/each}
				</div>
			{:else if currentHubs.length > 0 || statusFilter === 'archived'}
				<div class="workspace-empty filtered">
					<Search size={38} strokeWidth={1.4} aria-hidden="true" />
					<h3>{statusFilter === 'archived' && !query ? t('ยังไม่มี Gateway ที่จัดเก็บ', 'No archived Gateways') : t('ไม่พบ Gateway', 'No matching Gateway')}</h3>
					<p>
						{t(
							'ลองค้นหาด้วยชื่ออื่น หรือเปลี่ยนตัวกรองสถานะ',
							'Try another name or a different status filter.'
						)}
					</p>
					<button type="button" class="home-button secondary" onclick={clearFilters}
						>{t('ล้างตัวกรอง', 'Clear filters')}</button
					>
				</div>
			{:else}
				<div class="workspace-empty">
					<span class="empty-folder"><Folder size={55} strokeWidth={1.3} aria-hidden="true" /></span
					>
					<h3>
						{data.canManage
							? t('สร้างพื้นที่ทำงาน AI แรกของทีม', 'Create your team’s first AI workspace')
							: t('Gateway ของคุณจะแสดงที่นี่', 'Your Gateways will appear here')}
					</h3>
					<p>
						{data.canManage
							? t(
									'รวมเครื่องมือที่ต้องใช้ แล้วเลือกสมาชิกให้เริ่มงานร่วมกันได้ในที่เดียว',
									'Bring the tools you need into one place, then add the people who will use them.'
								)
							: t(
									'เมื่อผู้ดูแลเพิ่มคุณใน Gateway คุณจะดูเครื่องมือและเชื่อมต่อแอป AI ได้จากที่นี่',
									'Once an administrator adds you to a Gateway, you can view its tools and connect your AI client here.'
								)}
					</p>
					{#if data.canManage}<div class="empty-actions">
							{#if readyConnections.length === 0}<a
									class="home-button primary"
									href={localeHref('/app?view=servers')}
									><Plug size={18} aria-hidden="true" />{t('เชื่อมระบบ', 'Connect a system')}</a
								>{/if}<a
								class="home-button"
								class:primary={readyConnections.length > 0}
								class:secondary={readyConnections.length === 0}
								href={localeHref(createWorkspaceHref)}
								><Plus size={18} aria-hidden="true" />{t(
									'สร้างพื้นที่ทำงาน AI',
									'New AI workspace'
								)}</a
							>
						</div>{/if}
				</div>
			{/if}
			{#if currentHubs.length > 0}<p class="workspace-results" role="status">
					{t(
						`แสดง ${visibleHubs.length} จาก ${filteredTotal} Gateway`,
						`Showing ${visibleHubs.length} of ${filteredTotal} Gateways`
					)}
				</p>{/if}
		</section>
		<aside class="home-side" aria-label={t('ระบบและสมาชิก', 'Systems and people')}>
			<section class="side-panel knowledge-panel">
				<div class="side-heading">
					<h2>{t('ความรู้และวิธีทำงานของทีม', 'Your team’s knowledge & templates')}</h2>
					<BookOpen size={21} aria-hidden="true" />
				</div>
				<p>
					{memberHubs.length
						? t(
								'เพิ่มคู่มือ นโยบาย หรือเทมเพลตของธุรกิจ แล้วกำหนดผู้ที่นำไปใช้กับ AI ได้ในแต่ละ Gateway',
								'Add business guides, policies or templates, then choose who can use them with AI in each Gateway.'
							)
						: data.canManage
							? t(
									'เริ่มจากเชื่อมระบบและสร้าง Gateway จากนั้นเพิ่มตัวเองเป็นสมาชิกเพื่อจัดเก็บความรู้ของทีม',
									'Connect a system and create a Gateway, then add yourself as a member to manage your team’s knowledge.'
								)
							: t(
									'เมื่อผู้ดูแลเพิ่มคุณใน Gateway คุณจะเข้าถึงความรู้และเทมเพลตที่แบ่งให้คุณหรือแผนกได้',
									'Once you join a Gateway, you can access knowledge and templates shared with you or your department.'
								)}
				</p>
				<a class="panel-link" href={localeHref(knowledgeHref)}
					>{memberHubs.length
						? t('เปิดคลังของทีม', 'Open team library')
						: t('ดูขั้นตอนเริ่มใช้งาน', 'See how to get started')}<ArrowRight
						size={16}
						aria-hidden="true"
					/></a
				>
			</section>
			<section class="side-panel">
				<div class="side-heading">
					<h2>{'Servers'}</h2>
					{#if data.connections.length > 0}<span>{data.connections.length}</span>{/if}
				</div>
				{#if data.connections.length > 0}
					<div class="source-list">
						{#each data.connections.slice(0, 4) as source (source.id)}<a
								href={localeHref(
									`/app?view=servers&connection=${encodeURIComponent(source.id)}`
								)}
								class="source-row"
								><span class="source-symbol"><Plug size={19} aria-hidden="true" /></span><span
									><strong>{source.name}</strong><small class:ready={connectionReady(source)}
										><i aria-hidden="true"></i>{!source.enabled
											? t('ปิดใช้งาน', 'Disabled')
											: connectionReady(source)
												? t('ตรวจเครื่องมือแล้ว', 'Tools reviewed')
												: t('รอตรวจเครื่องมือ', 'Needs tool review')}</small
									></span
								></a
							>{/each}
					</div>
					<a class="panel-link" href={localeHref('/app?view=servers')}
						>{t('ดู Servers ทั้งหมด', 'View all servers')}<ArrowRight size={16} aria-hidden="true" /></a
					>
				{:else}
					<div class="side-empty">
						<Plug size={40} strokeWidth={1.5} aria-hidden="true" />
						<h3>{t('ยังไม่มีระบบที่เชื่อมต่อ', 'No systems connected')}</h3>
						<p>
							{data.canManage
								? t(
										'เริ่มจากระบบที่ทีมใช้ แล้วเลือกเครื่องมือสำหรับ Gateway',
										'Start with a system your team uses and review the tools for your Gateways.'
									)
								: t(
										'ระบบที่คุณมีสิทธิ์ใช้จะแสดงที่นี่ เมื่อผู้ดูแลเพิ่มคุณใน Gateway',
										'Systems you can access will appear here when an administrator adds you to a Gateway.'
									)}
						</p>
						{#if data.canManage}<a class="panel-link" href={localeHref('/app?view=servers')}
								>{t('เพิ่มระบบ', 'Add a system')}<ArrowRight
									size={16}
									aria-hidden="true"
								/></a
							>{/if}
					</div>
				{/if}
			</section>
			<section class="side-panel members-panel">
				<h2>
					{data.canManage
						? t('สมาชิกในองค์กร', 'Organization members')
						: t('บัญชีของคุณ', 'Your account')}
				</h2>
				{#if data.canManage}<div class="member-total">
						<Users size={31} strokeWidth={1.55} aria-hidden="true" /><strong
							>{data.members.length}<span>{t('คน', 'people')}</span></strong
						>
					</div>
					<p>
						{t(
							'จัดการบัญชีของทีม และกำหนดสิทธิ์ให้เหมาะกับงานของแต่ละคน',
							'Manage your team’s accounts and give each person access to the tools they need.'
						)}
					</p>
					<a class="panel-link" href={localeHref('/app?view=members')}
						>{t('จัดการสมาชิก', 'Manage members')}<ArrowRight size={16} aria-hidden="true" /></a
					>
				{:else}<div class="own-account">
						<span class="source-symbol"><Users size={21} aria-hidden="true" /></span><span
							><strong
								>{currentUser
									? memberName(currentUser)
									: t('บัญชีที่เข้าสู่ระบบ', 'Signed-in account')}</strong
							>{#if currentUser}<small>{memberRole(currentUser.role)}</small>{/if}</span
						>
					</div>
					<p>
						{t(
							'คุณเห็นเฉพาะ Gateway ที่ได้รับสิทธิ์ หากต้องการใช้งานเพิ่ม ติดต่อผู้ดูแลของคุณ',
							'You see the Gateways you have access to. Contact your administrator if you need more access.'
						)}
					</p>
					<a class="panel-link" href={localeHref('/app?view=members')}
						>{t('ดูข้อมูลสมาชิก', 'View account details')}<ArrowRight
							size={16}
							aria-hidden="true"
						/></a
					>{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	.side-panel.knowledge-panel {
		background: linear-gradient(140deg, #f2f7e8, #fff 75%);
	}
	.knowledge-panel p {
		color: #657087;
		font-size: 13px;
		line-height: 1.8;
		margin: 13px 0 0;
	}
	.workspace-home {
		color: var(--o-ink);
		min-width: 0;
	}
	.home-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 26px;
	}
	.home-heading h1 {
		font-size: clamp(28px, 2.8vw, 39px);
		font-weight: 720;
		letter-spacing: -0.035em;
		line-height: 1.35;
	}
	.home-heading p {
		margin-top: 7px;
		color: var(--o-muted);
		font-size: 15px;
	}
	.home-button {
		display: inline-flex;
		justify-content: center;
		align-items: center;
		gap: 9px;
		min-height: 44px;
		border: 1px solid transparent;
		border-radius: 8px;
		padding: 10px 19px;
		font-size: 14px;
		line-height: 1.5;
		font-weight: 650;
		text-align: center;
		transition:
			background 0.16s,
			border-color 0.16s;
	}
	.home-heading > .k-actions {
		flex: 0 0 auto;
		margin-top: 4px;
	}
	.home-button.primary {
		background: var(--o-citron);
		color: var(--o-ink);
	}
	.home-button.primary:hover {
		background: #c9ed62;
	}
	.home-button.secondary {
		background: white;
		border-color: #d8dde8;
		color: var(--o-ink);
	}
	.home-button.secondary:hover {
		background: #f5f7fa;
		border-color: #bfc7d6;
	}
	.home-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 275px;
		align-items: start;
		gap: 18px;
	}
	.workspace-panel,
	.side-panel {
		min-width: 0;
		background: white;
		border: 1px solid #dfe3ed;
		border-radius: 10px;
	}
	.workspace-panel {
		min-height: 480px;
		display: flex;
		flex-direction: column;
		overflow: clip;
	}
	.workspace-toolbar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(180px, 215px);
		align-items: center;
		gap: 13px 20px;
		padding: 18px 20px 0;
		border-bottom: 1px solid #e4e7ef;
	}
	.workspace-toolbar h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 17px;
		line-height: 1.5;
		font-weight: 670;
	}
	.workspace-toolbar h2 > span,
	.side-heading > span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 7px;
		min-width: 23px;
		height: 23px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		color: #727c90;
		background: #f1f3f7;
	}
	.workspace-search {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 9px;
		border: 1px solid #dfe3ed;
		border-radius: 7px;
		padding: 7px 10px;
		color: #7f889a;
	}
	.workspace-search:focus-within {
		outline: 2px solid #b5cf72;
		outline-offset: 2px;
	}
	.workspace-search input {
		min-width: 0;
		width: 100%;
		padding: 0;
		background: transparent;
		border: 0;
		outline: none;
		box-shadow: none;
		color: var(--o-ink);
		font-size: 12px;
		line-height: 1.7;
	}
	.workspace-search input::placeholder {
		color: #80899c;
	}
	.workspace-search input:focus-visible {
		outline: none;
	}
	.workspace-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		grid-column: 1 / -1;
	}
	.workspace-filters button {
		min-height: 42px;
		padding: 8px 10px 11px;
		border: 0;
		border-bottom: 3px solid transparent;
		background: transparent;
		color: #758096;
		font-size: 12px;
		line-height: 1.5;
		white-space: nowrap;
	}
	.workspace-filters button.selected {
		color: var(--o-ink);
		font-weight: 660;
		border-bottom-color: var(--o-citron);
	}
	.workspace-filters button:hover {
		color: var(--o-ink);
		background: #f9fafc;
	}
	.workspace-list {
		display: grid;
		gap: 12px;
		padding: 20px;
	}
	.workspace-card-main { display: flex; gap: 14px; align-items: flex-start; padding: 18px 16px; color: inherit; text-decoration: none; }
	.workspace-card-main:focus-visible { outline: 3px solid #567cbb; outline-offset: 3px; border-radius: 8px; }
	.workspace-card-actions { display: flex; justify-content: flex-end; padding: 0 16px 12px; }
	.workspace-card {
		border: 1px solid #e2e6ee;
		border-radius: 8px;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.workspace-card:hover {
		border-color: #bacd94;
		background: #fbfdf7;
	}
	.workspace-symbol {
		flex: 0 0 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: #f1f4eb;
		color: #64774a;
	}
	.workspace-card-content {
		flex: 1;
		min-width: 0;
	}
	.workspace-card-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.workspace-card h3 {
		font-size: 15px;
		line-height: 1.5;
		font-weight: 660;
		overflow-wrap: anywhere;
	}
	.workspace-status {
		flex: 0 0 auto;
		padding: 2px 7px;
		border-radius: 5px;
		font-size: 10px;
		line-height: 1.6;
		background: #f0f2f7;
		color: #768097;
	}
	.workspace-status.active {
		color: #557531;
		background: #f0f6e6;
	}
	.workspace-status.paused {
		color: #8e6634;
		background: #fbf2e6;
	}
	.workspace-description {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-top: 5px;
		color: #778197;
		font-size: 12px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.workspace-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 5px 12px;
		margin-top: 10px;
		color: #788298;
		font-size: 11px;
		line-height: 1.65;
	}
	.workspace-source {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.workspace-card :global(.workspace-open) {
		flex: 0 0 auto;
		color: #929aad;
		margin-top: 11px;
	}
	.workspace-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 15px;
		min-height: 372px;
		padding: 38px 34px 43px;
		text-align: center;
		color: #788198;
	}
	.empty-folder {
		display: grid;
		place-items: center;
		width: 80px;
		height: 80px;
		color: #7d8596;
		margin-bottom: 2px;
	}
	.workspace-empty h3 {
		color: var(--o-ink);
		font-size: 23px;
		line-height: 1.5;
		font-weight: 680;
	}
	.workspace-empty p {
		max-width: 430px;
		color: #7a8398;
		font-size: 14px;
		line-height: 1.8;
	}
	.empty-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
		margin-top: 10px;
	}
	.workspace-empty.filtered {
		min-height: 338px;
	}
	.workspace-empty.filtered h3 {
		font-size: 20px;
	}
	.workspace-results {
		border-top: 1px solid #e8ebf2;
		color: #8890a2;
		font-size: 11px;
		padding: 10px 20px;
		margin-top: auto;
	}
	.home-side {
		display: grid;
		gap: 16px;
		min-width: 0;
	}
	.side-panel {
		padding: 20px;
	}
	.side-panel h2 {
		font-size: 17px;
		font-weight: 680;
		line-height: 1.55;
	}
	.side-heading {
		display: flex;
		gap: 8px;
		justify-content: space-between;
		align-items: center;
	}
	.side-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 24px 0 1px;
		color: #737e91;
	}
	.side-empty h3 {
		margin-top: 17px;
		font-size: 15px;
		font-weight: 650;
		color: var(--o-ink);
		line-height: 1.6;
	}
	.side-empty p,
	.members-panel > p {
		margin-top: 9px;
		font-size: 12px;
		line-height: 1.8;
		color: #7c869a;
	}
	.panel-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		line-height: 1.7;
		font-weight: 600;
		color: #527630;
		margin-top: 20px;
		border-radius: 4px;
	}
	.panel-link:hover {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.source-list {
		display: grid;
		margin-top: 13px;
	}
	.source-row {
		display: flex;
		gap: 10px;
		align-items: center;
		min-width: 0;
		padding: 12px 0;
		border-bottom: 1px solid #eef0f5;
	}
	.source-row:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.source-row > span:last-child,
	.own-account > span:last-child {
		min-width: 0;
	}
	.source-symbol {
		flex: 0 0 34px;
		height: 34px;
		display: grid;
		place-items: center;
		color: #7b8599;
		background: #f4f6f9;
		border-radius: 8px;
	}
	.source-row strong,
	.own-account strong {
		display: block;
		font-weight: 610;
		font-size: 12px;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.source-row small {
		display: flex;
		align-items: center;
		gap: 5px;
		color: #8a91a2;
		font-size: 10px;
		margin-top: 2px;
	}
	.source-row small i {
		display: block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex: 0 0 auto;
		background: #bcc1cd;
	}
	.source-row small.ready {
		color: #6d8550;
	}
	.source-row small.ready i {
		background: #91ae5b;
	}
	.member-total {
		display: flex;
		align-items: center;
		gap: 13px;
		color: #555f73;
		margin: 22px 0 13px;
	}
	.member-total strong {
		font-size: 29px;
		line-height: 1.3;
		font-weight: 660;
		color: var(--o-ink);
	}
	.member-total strong > span {
		margin-left: 7px;
		font-size: 20px;
		font-weight: 640;
	}
	.own-account {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 20px;
	}
	.own-account small {
		display: block;
		color: #8a91a2;
		font-size: 11px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 1180px) {
		.home-columns {
			grid-template-columns: minmax(0, 1fr) 245px;
			gap: 15px;
		}
		.workspace-toolbar {
			grid-template-columns: 1fr;
			gap: 11px;
		}
		.workspace-search {
			max-width: 100%;
		}
		.side-panel {
			padding: 18px;
		}
	}
	@media (max-width: 900px) {
		.home-columns {
			grid-template-columns: 1fr;
		}
		.home-side {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.workspace-toolbar {
			grid-template-columns: minmax(0, 1fr) minmax(180px, 230px);
		}
		.workspace-panel {
			min-height: 0;
		}
		.workspace-empty {
			min-height: 320px;
		}
	}
	@media (max-width: 640px) {
		.home-heading {
			flex-direction: column;
			gap: 16px;
			margin-bottom: 22px;
		}
		.home-heading h1 {
			font-size: 29px;
		}
		.home-heading p {
			font-size: 13px;
			line-height: 1.75;
		}
		.home-heading > .k-actions {
			margin-top: 0;
		}
		.workspace-toolbar {
			grid-template-columns: 1fr;
			padding: 17px 16px 0;
		}
		.workspace-toolbar h2 {
			font-size: 16px;
		}
		.workspace-search {
			padding: 9px 11px;
		}
		.workspace-search input {
			font-size: 13px;
		}
		.workspace-filters {
			gap: 2px;
			justify-content: space-between;
		}
		.workspace-filters button {
			padding-inline: 7px;
			font-size: 12px;
		}
		.workspace-list {
			padding: 14px;
		}
		.workspace-card-main {
			gap: 11px;
			padding: 15px 12px;
		}
		.workspace-symbol {
			flex-basis: 32px;
			height: 35px;
			background: transparent;
		}
		.workspace-card-heading {
			flex-direction: column;
			gap: 5px;
		}
		.workspace-card h3 {
			font-size: 14px;
		}
		.workspace-card-meta {
			gap: 4px 9px;
		}
		.workspace-card :global(.workspace-open) {
			display: none;
		}
		.workspace-empty {
			padding: 27px 21px 32px;
			min-height: 325px;
		}
		.workspace-empty h3 {
			font-size: 20px;
		}
		.workspace-empty p {
			font-size: 13px;
		}
		.empty-actions {
			flex-direction: column;
			width: 100%;
			gap: 10px;
			max-width: 260px;
		}
		.home-side {
			grid-template-columns: 1fr;
		}
		.side-panel {
			padding: 21px;
		}
		.side-empty {
			padding-top: 20px;
		}
		.side-empty p {
			max-width: 280px;
		}
		.workspace-results {
			padding-inline: 16px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.home-button,
		.workspace-card {
			transition: none;
		}
	}
</style>
