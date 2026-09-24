<script lang="ts">
  import { gatewayHasMember } from '$lib/orca/gateway-sources';
	import { beforeNavigate, goto } from '$app/navigation';
	import { getHttpStatusCode } from '$lib/errors';
	import { connectionReady } from '$lib/orca/activation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import {
		displayDate,
		orcaError,
		memberName,
		type OrcaBootstrap,
		type OrcaMember
	} from '$lib/services/orca';
	import {
		OrcaLibraryService,
		type LibraryDepartment,
		type LibraryItem,
		type LibraryKind,
		type LibraryStatus,
		type RenderedTemplate
	} from '$lib/services/orca-library';
	import LibraryDepartments from './LibraryDepartments.svelte';
	import LibraryEditor from './LibraryEditor.svelte';
	import './library.css';
	import {
		Archive,
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Check,
		ChevronRight,
		FileText,
		Folder,
		Info,
		LockKeyhole,
		Pencil,
		Plug,
		Plus,
		RefreshCw,
		Search,
		ShieldCheck,
		Sparkles,
		Users
	} from '@lucide/svelte';
	import { untrack } from 'svelte';

	let {
		data,
		hubID,
		initialKind,
		initialCreate = false,
		onchanged
	}: {
		data: OrcaBootstrap;
		hubID: string;
		initialKind?: LibraryKind;
		initialCreate?: boolean;
		onchanged: () => Promise<void>;
	} = $props();
	let section = $state<LibraryKind | 'departments'>('knowledge');
	let items = $state<LibraryItem[]>([]);
	let members = $state<OrcaMember[]>([]);
	let departments = $state<LibraryDepartment[]>([]);
	let loading = $state(false);
	let loadedHub = $state('');
	let requestNumber = 0;
	let error = $state('');
	let notice = $state('');
	let query = $state('');
	let status = $state<'current' | LibraryStatus>('current');
	let selected = $state<LibraryItem>();
	let editing = $state(false);
	let createKind = $state<LibraryKind>('knowledge');
	let saving = $state(false);
	let confirmArchive = $state(false);
	let inputs = $state<Record<string, string>>({});
	let rendered = $state<RenderedTemplate>();
	let renderError = $state('');
	let rendering = $state(false);
	let hasUnsavedEdits = $state(false);
	let navigationBlocked = $state(false);
	const hubs = $derived(data.hubs.filter((hub) => gatewayHasMember(hub, data.currentUserID)));
	const hub = $derived(hubs.find((item) => item.id === hubID));
	const managedHub = $derived(
		data.canManage ? data.hubs.find((item) => item.id === hubID) : undefined
	);
	const managedHubs = $derived(
		data.canManage ? data.hubs.filter((item) => !gatewayHasMember(item, data.currentUserID)) : []
	);
	const readyConnections = $derived(data.connections.filter(connectionReady));
	const createWorkspaceHref = $derived(
		localeHref(
			`/app?view=new${readyConnections.length === 1 ? `&connection=${encodeURIComponent(readyConnections[0].id)}` : ''}`
		)
	);
	const availableItems = $derived(
		items.filter(
			(item) =>
				item.kind === section &&
				(status === 'current' ? item.status !== 'archived' : item.status === status)
		)
	);
	const filtered = $derived(
		availableItems.filter((item) =>
			`${item.title} ${item.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
		)
	);
	const knowledgeCount = $derived(
		items.filter((item) => item.kind === 'knowledge' && item.status !== 'archived').length
	);
	const templateCount = $derived(
		items.filter((item) => item.kind === 'template' && item.status !== 'archived').length
	);
	const effectiveHubID = $derived(hub?.id ?? '');
	let contextHubID = '';
	const consumedEntries = new Set<string>();
	$effect(() => {
		const id = effectiveHubID;
		const snapshot = data;
		untrack(() => {
			if (id !== contextHubID) {
				contextHubID = id;
				requestNumber += 1;
				loadedHub = '';
				items = [];
				members = [];
				departments = [];
				selected = undefined;
				editing = false;
				rendered = undefined;
				error = '';
				notice = '';
				loading = false;
			}
			if (id && snapshot && !editing && !hasUnsavedEdits) void load(id);
		});
	});
	$effect(() => {
		const id = effectiveHubID;
		const kind = initialKind;
		const createRequested = initialCreate;
		if (!id || !kind || loadedHub !== id || loading || error) return;
		untrack(() => {
			const entry = `${id}:${kind}:${createRequested}`;
			if (consumedEntries.has(entry)) return;
			consumedEntries.add(entry);
			// An entry link is an initial intent, never a reason to replace work in progress.
			if (editing || hasUnsavedEdits || saving || rendering) return;
			changeSection(kind, false);
			if (createRequested) create(kind);
		});
	});
	beforeNavigate((navigation) => {
		if (hasUnsavedEdits || saving || rendering) {
			navigation.cancel();
			navigationBlocked = true;
		}
	});
	async function load(id = effectiveHubID) {
		if (!id || !hubs.some((item) => item.id === id)) return;
		const request = ++requestNumber;
		loading = true;
		error = '';
		try {
			const result = await OrcaLibraryService.load(id);
			if (request !== requestNumber || id !== effectiveHubID) return;
			items = result.items;
			members = result.members;
			departments = result.departments;
			loadedHub = id;
			if (selected) {
				const updated = result.items.find((item) => item.id === selected?.id);
				if (!updated) {
					selected = undefined;
					editing = false;
					rendered = undefined;
				} else if (!editing) {
					if (updated.version !== selected.version) {
						inputs = {};
						renderError = '';
					}
					selected = updated;
					rendered = undefined;
				}
			}
		} catch (cause) {
			if (request !== requestNumber) return;
			if ([403, 404].includes(getHttpStatusCode(cause) ?? 0)) {
				items = [];
				members = [];
				departments = [];
				selected = undefined;
				editing = false;
				rendered = undefined;
				loadedHub = '';
			}
			error = orcaError(cause);
		} finally {
			if (request === requestNumber) loading = false;
		}
	}
	function changeSection(next: LibraryKind | 'departments', refresh = true) {
		const refreshDepartments = refresh && section === 'departments' && next !== 'departments';
		section = next;
		selected = undefined;
		rendered = undefined;
		inputs = {};
		error = '';
		notice = '';
		query = '';
		status = 'current';
		if (refreshDepartments) void load();
	}
	function open(item: LibraryItem) {
		selected = item;
		editing = false;
		inputs = {};
		rendered = undefined;
		renderError = '';
		confirmArchive = false;
		notice = '';
	}
	function create(kind: LibraryKind) {
		if (!hub || loadedHub !== hub.id || loading || saving || rendering) return;
		createKind = kind;
		selected = undefined;
		editing = true;
		notice = '';
	}
	function workspaceLibraryHref(id: string) {
		return localeHref(
			`/app?view=knowledge&hub=${encodeURIComponent(id)}${initialKind ? `&kind=${initialKind}${initialCreate ? '&create=1' : ''}` : ''}`
		);
	}
	function saved(item: LibraryItem) {
		if (item.hubID !== effectiveHubID) return;
		items = [...items.filter((known) => known.id !== item.id), item];
		selected = item;
		editing = false;
		section = item.kind;
		status = item.status === 'archived' ? 'archived' : 'current';
		notice =
			item.status === 'archived'
				? t('บันทึกแล้ว รายการนี้ยังคงอยู่ในสถานะจัดเก็บแล้ว', 'Saved. This item remains archived.')
				: item.status === 'published'
					? hub?.status === 'active'
						? t(
								'เผยแพร่แล้ว ผู้ที่มีสิทธิ์สามารถใช้รายการนี้ผ่านแอป AI ได้',
								'Published. People with access can now use it through their AI app.'
							)
						: t(
								'เผยแพร่แล้ว กรุณาเปิดใช้งานพื้นที่ทำงาน AI นี้เพื่อให้ AI ใช้รายการนี้ได้',
								'Published. Activate this AI workspace to make the item available to AI.'
							)
					: t(
							'บันทึกฉบับร่างแล้ว เนื้อหานี้แสดงเฉพาะคุณ',
							'Draft saved. Only you can see this content.'
						);
	}
	function denied() {
		editing = false;
		selected = undefined;
		rendered = undefined;
		items = [];
		loadedHub = '';
		void load();
	}
	function ownerName(id: string) {
		return id === data.currentUserID
			? t('คุณ', 'You')
			: members.find((member) => member.id === id)
				? memberName(members.find((member) => member.id === id)!)
				: t('สมาชิกพื้นที่ทำงาน', 'Workspace member');
	}
	function departmentName(id: string) {
		return (
			departments.find((department) => department.unitID === id)?.name ||
			data.units.find((unit) => unit.id === id)?.name ||
			t('แผนกที่ได้รับสิทธิ์', 'Shared department')
		);
	}
	function statusName(value: LibraryStatus) {
		return value === 'published'
			? t('เผยแพร่แล้ว', 'Published')
			: value === 'draft'
				? t('ฉบับร่าง', 'Draft')
				: t('จัดเก็บแล้ว', 'Archived');
	}
	async function archive() {
		if (!selected?.canEdit || saving || !hub) return;
		saving = true;
		error = '';
		const requestHubID = hub.id;
		try {
			const item = selected;
			const saved = await OrcaLibraryService.save(
				hub.id,
				{
					kind: item.kind,
					title: item.title,
					summary: item.summary,
					content: item.content,
					parameters: item.parameters,
					knowledgeIDs: item.knowledgeIDs,
					memberIDs: item.memberIDs,
					unitIDs: item.unitIDs,
					status: 'archived',
					version: item.version
				},
				item.id
			);
			if (requestHubID !== effectiveHubID) return;
			items = items.map((known) => (known.id === saved.id ? saved : known));
			selected = undefined;
			confirmArchive = false;
			notice = t(
				'จัดเก็บแล้ว AI จะไม่สามารถใช้รายการนี้ได้อีก',
				'Archived. AI can no longer use this item.'
			);
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			saving = false;
		}
	}
	async function render(event: SubmitEvent) {
		event.preventDefault();
		if (!selected || !hub || rendering) return;
		const id = selected.id;
		rendering = true;
		renderError = '';
		rendered = undefined;
		try {
			const result = await OrcaLibraryService.render(hub.id, id, inputs);
			if (selected?.id === id) rendered = result;
		} catch (cause) {
			if (selected?.id === id) renderError = orcaError(cause);
			if ([403, 404].includes(getHttpStatusCode(cause) ?? 0)) await load();
		} finally {
			rendering = false;
		}
	}
</script>

<div class="business-library">
	<header class="library-intro">
		<h1>{t('คลังความรู้', 'Knowledge')}{t(' (Orca Cloud)', ' (Orca Cloud)')}</h1>
		<p class="k-subtitle">
			{t(
				'จัดเก็บคู่มือ เอกสาร และแม่แบบขององค์กรตามแผนก กำหนดผู้ที่เข้าถึงได้ และให้ AI ตอบจากข้อมูลที่องค์กรกำหนด',
				'Store your organization’s manuals, documents and templates by department, choose who can access them, and let AI answer from approved information.'
			)}
		</p>
	</header>
	<div class="library-navigation">
		<div class="library-tabs" aria-label={t('หมวดของคลังความรู้', 'Knowledge sections')}>
			<button
				class:active={section === 'knowledge'}
				aria-pressed={section === 'knowledge'}
				disabled={editing || hasUnsavedEdits || saving || rendering}
				onclick={() => changeSection('knowledge')}
				><BookOpen size={16} />{t('บทความความรู้', 'Knowledge articles')}{#if loadedHub}<span
						>{knowledgeCount}</span
					>{/if}</button
			><button
				class:active={section === 'template'}
				aria-pressed={section === 'template'}
				disabled={editing || hasUnsavedEdits || saving || rendering}
				onclick={() => changeSection('template')}
				><FileText size={16} />{t('แม่แบบ', 'Templates')}{#if loadedHub}<span>{templateCount}</span
					>{/if}</button
			>{#if data.canManage}<button
					class:active={section === 'departments'}
					aria-pressed={section === 'departments'}
					disabled={editing || hasUnsavedEdits || saving || rendering}
					onclick={() => changeSection('departments')}
					><Users size={16} />{t('แผนก', 'Departments')}</button
				>{/if}
		</div>
		{#if section !== 'departments'}<div class="library-hub-select">
				<label for="knowledge-workspace">{t('พื้นที่ทำงาน AI', 'AI workspace')}</label><select
					id="knowledge-workspace"
					value={hub?.id ?? ''}
					disabled={editing || saving || rendering}
					onchange={(event) =>
						goto(
							localeHref(
								`/app?view=knowledge${event.currentTarget.value ? `&hub=${encodeURIComponent(event.currentTarget.value)}` : ''}`
							)
						)}
					><option value="">{t('เลือกพื้นที่ทำงาน AI', 'Select an AI workspace')}</option
					>{#each hubs as item}<option value={item.id}>{item.name}</option>{/each}</select
				>
			</div>{/if}
	</div>
	{#if navigationBlocked}<div class="library-alert" role="alert">
			<Info size={16} />
			<p>
				{t(
					'มีการแก้ไขที่ยังไม่ได้บันทึก กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนออกจากหน้านี้',
					'You have unsaved changes. Save or discard them before leaving this page.'
				)}
			</p>
		</div>{/if}
	{#if section === 'departments' && data.canManage}<LibraryDepartments
			{data}
			{onchanged}
			ondirty={(dirty) => {
				hasUnsavedEdits = dirty;
				if (!dirty) navigationBlocked = false;
			}}
		/>
	{:else if !hub}<section class="library-workspace-picker">
			<header class="library-panel-head">
			<span class="library-symbol" aria-hidden="true"><Folder size={18} /></span>
			<div class="library-panel-copy">
			<h2>
				{managedHub
					? t('ตรวจสอบสมาชิกของพื้นที่ทำงานนี้', 'Review this workspace’s members')
					: hubID
						? t('ไม่พบพื้นที่ทำงานที่คุณเข้าถึงได้', 'This workspace is not available to you')
						: hubs.length
							? t('เลือกพื้นที่ทำงาน AI', 'Select an AI workspace')
							: !data.canManage
								? t(
										'คุณยังไม่ได้เป็นสมาชิกของพื้นที่ทำงาน AI',
										'You are not a member of an AI workspace yet'
									)
								: managedHubs.length
									? t(
											'ตรวจสอบสมาชิกของพื้นที่ทำงานที่มีอยู่',
											'Review the members of an existing workspace'
										)
									: !readyConnections.length
										? t('เชื่อมต่อระบบก่อนใช้คลังความรู้', 'Connect a system before using Knowledge')
										: t(
												'สร้างพื้นที่ทำงาน AI สำหรับคลังความรู้',
												'Create an AI workspace for your knowledge'
											)}
			</h2>
			<p>
				{managedHub
					? t(
							'คุณมีสิทธิ์จัดการพื้นที่ทำงานนี้ แต่ยังไม่ได้เป็นสมาชิก กรุณาเปิดการตั้งค่าพื้นที่ทำงานและเพิ่มบัญชีของคุณในรายชื่อสมาชิกก่อนเพิ่มบทความความรู้',
							'You can manage this workspace but are not a member. Open its settings and add your account to the member list before adding knowledge.'
						)
					: hubs.length
						? t(
								'บทความความรู้และแม่แบบจัดเก็บแยกตามพื้นที่ทำงาน AI เลือกพื้นที่ทำงานที่คุณเป็นสมาชิกเพื่อดำเนินการต่อ',
								'Knowledge articles and templates are stored per AI workspace. Select a workspace you belong to.'
							)
						: !data.canManage
							? t(
									'กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มคุณเป็นสมาชิกของพื้นที่ทำงาน จากนั้นจึงจะเพิ่มและใช้บทความความรู้ร่วมกับทีมได้',
									'Contact your administrator to be added to a workspace. You can then add and use knowledge with your team.'
								)
							: managedHubs.length
								? t(
										'องค์กรมีพื้นที่ทำงาน AI อยู่แล้ว เลือกพื้นที่ทำงานและเพิ่มบัญชีของคุณในรายชื่อสมาชิก เพื่อจัดเก็บความรู้ร่วมกับทีม',
										'Your organization already has AI workspaces. Select one and add your account to its member list to manage knowledge with that team.'
									)
								: !readyConnections.length
									? t(
											'เพิ่มระบบที่องค์กรใช้และตั้งค่าการเชื่อมต่อ จากนั้นสร้างพื้นที่ทำงาน AI เพื่อกำหนดสมาชิกและจัดเก็บความรู้',
											'Add a system your organization uses and set up the connection. Then create an AI workspace to assign members and store knowledge.'
										)
									: readyConnections.length === 1
										? t(
												`สร้างพื้นที่ทำงาน AI ที่ใช้ ${readyConnections[0].name} แล้วเลือกเครื่องมือที่อนุญาตและสมาชิก หากต้องการเพิ่มบทความความรู้ ให้เพิ่มบัญชีของคุณเป็นสมาชิกด้วย`,
												`Create an AI workspace that uses ${readyConnections[0].name}, then choose its allowed tools and members. Add your own account if you want to add knowledge.`
											)
										: t(
												'มีระบบที่เชื่อมต่อแล้ว สร้างพื้นที่ทำงาน AI แล้วเลือกระบบ เครื่องมือที่อนุญาต และสมาชิก ก่อนเพิ่มบทความความรู้',
												'You have connected systems. Create an AI workspace and choose its systems, allowed tools and members before adding knowledge.'
											)}
			</p>
			</div>
			{#if managedHub || (!hubs.length && !managedHubs.length && data.canManage)}<div
					class="library-panel-actions"
				>
					{#if managedHub}<a
							class="k-button primary small"
							href={localeHref(`/app?view=new&edit=${encodeURIComponent(managedHub.id)}`)}
							><Users size={16} />{t('ตรวจสอบสมาชิก', 'Review members')}</a
						>{:else if readyConnections.length}<a class="k-button primary small" href={createWorkspaceHref}
							><Plus size={16} />{t('สร้างพื้นที่ทำงาน AI', 'Create an AI workspace')}</a
						>{:else}{#if data.connections.length}<a
								class="k-button small"
								href={localeHref('/app?view=servers')}
								>{t('ดูระบบที่เชื่อมต่อ', 'View connected systems')}</a
							>{/if}<a class="k-button primary small" href={localeHref('/app?view=catalog')}
							><Plug size={16} />{t('เพิ่มระบบ', 'Add a system')}</a
						>{/if}
				</div>{/if}
			</header>
			{#if hubs.length}<div class="library-workspace-grid">
					{#each hubs as item}<a href={workspaceLibraryHref(item.id)}
							><span class="library-row-icon" aria-hidden="true"><Folder size={16} /></span><span
								><strong>{item.name}</strong><small
									>{item.description ||
										t(
											'บทความความรู้และแม่แบบของพื้นที่ทำงานนี้',
											'Knowledge articles and templates in this workspace'
										)}</small
								></span
							><ChevronRight size={16} /></a
						>{/each}
				</div>{:else if !managedHub && managedHubs.length}<div class="library-workspace-grid">
					{#each managedHubs as item}<a
							href={localeHref(`/app?view=new&edit=${encodeURIComponent(item.id)}`)}
							><span class="library-row-icon" aria-hidden="true"><Users size={16} /></span><span
								><strong>{item.name}</strong><small
									>{t('ตรวจสอบสมาชิก', 'Review members')}</small
								></span
							><ChevronRight size={16} /></a
						>{/each}
				</div>{/if}
		</section>
	{:else if editing}<LibraryEditor
			hubID={hub.id}
			kind={selected?.kind ?? createKind}
			existing={selected}
			{items}
			{members}
			{departments}
			currentUserID={data.currentUserID}
			{departmentName}
			onsaved={saved}
			onclose={() => (editing = false)}
			ondenied={denied}
			ondirty={(dirty) => {
				hasUnsavedEdits = dirty;
				if (!dirty) navigationBlocked = false;
			}}
		/>
	{:else}
		{#if notice}<p class="library-notice" role="status"><Check size={16} />{notice}</p>{/if}
		{#if error}<div class="library-alert" role="alert">
				<Info size={16} />
				<div>
					<p>{error}</p>
					<button class="k-button small" disabled={loading} onclick={() => load()}
						><RefreshCw size={16} />{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button
					>
				</div>
			</div>{/if}
		{#if loading && loadedHub !== hub.id}<p class="library-loading" role="status">
				{t(
					'กำลังโหลดคลังความรู้ของพื้นที่ทำงานนี้…',
					'Loading this workspace’s knowledge…'
				)}
			</p>
		{:else if loadedHub === hub.id}
			{#if selected}<section class="library-detail">
					<button
						class="library-back"
						disabled={saving || rendering}
						onclick={() => {
							selected = undefined;
							rendered = undefined;
						}}><ArrowLeft size={16} />{t('กลับไปที่คลังความรู้', 'Back to Knowledge')}</button
					>
					<div class="library-detail-heading">
						<div>
							<h2>{selected.title}</h2>
							<div class="library-item-meta">
								<span class="library-status" class:published={selected.status === 'published'}
									>{statusName(selected.status)}</span
								><span>{t('ผู้เขียน', 'Author')} {ownerName(selected.ownerID)}</span>
							</div>
							{#if selected.summary}<p>{selected.summary}</p>{/if}
						</div>
						{#if selected.canEdit}<div class="library-actions">
								<button
									class="k-button"
									disabled={saving || rendering}
									onclick={() => (editing = true)}><Pencil size={16} />{t('แก้ไข', 'Edit')}</button
								>{#if selected.status !== 'archived'}<button
										class="library-icon-button"
										disabled={saving || rendering}
										aria-label={t('จัดเก็บ', 'Archive')}
										title={t('จัดเก็บ', 'Archive')}
										onclick={() => (confirmArchive = true)}><Archive size={16} /></button
									>{/if}
							</div>{/if}
					</div>
					{#if confirmArchive}<div class="library-alert" role="alert">
							<Info size={16} />
							<div>
								<p>
									{t(
										'ต้องการจัดเก็บรายการนี้หรือไม่ AI จะไม่สามารถใช้รายการนี้ได้ รวมถึงแม่แบบที่อ้างอิงบทความนี้',
										'Archive this item? AI will no longer be able to use it, including templates that reference it.'
									)}
								</p>
								<div class="library-actions">
									<button
										class="k-button small"
										disabled={saving}
										onclick={() => (confirmArchive = false)}>{t('ยกเลิก', 'Cancel')}</button
									><button class="k-button small primary" disabled={saving} onclick={archive}
										>{saving ? t('กำลังบันทึก…', 'Saving…') : t('จัดเก็บ', 'Archive')}</button
									>
								</div>
							</div>
						</div>{/if}
					<div class="library-reader">
						<p class="library-reader-label">
							{selected.kind === 'knowledge'
								? t('เนื้อหาบทความ', 'Article content')
								: t('คำแนะนำในแม่แบบ', 'Template instructions')}
						</p>
						<div class="library-prose">{selected.content}</div>
					</div>
					{#if selected.kind === 'template' && selected.knowledgeIDs.length}<div
							class="library-reference-list"
						>
							<h3>{t('บทความความรู้ที่แม่แบบอ้างอิง', 'Referenced knowledge articles')}</h3>
							{#each selected.knowledgeIDs as id}<span
									><BookOpen size={16} />{items.find((item) => item.id === id)?.title ??
										t('บทความความรู้ที่ไม่พร้อมใช้งาน', 'Unavailable knowledge article')}</span
								>{/each}
						</div>{/if}
					{#if selected.kind === 'template' && selected.status === 'published'}<section
							class="library-template-use"
						>
							<div class="library-section-heading">
								<div>
									<h3>
										<Sparkles size={18} />{t('ดูตัวอย่างแม่แบบ', 'Preview this template')}
									</h3>
									<p>
										{t(
											'กรอกข้อมูลเพื่อดูคำแนะนำและบทความความรู้ที่ ORCA จะส่งให้ AI',
											'Enter the inputs to see the instructions and knowledge ORCA will provide to AI.'
										)}
									</p>
								</div>
							</div>
							<form onsubmit={render}>
								<div class="library-template-inputs">
									{#each selected.parameters as parameter}<div class="library-field">
											<label for={`template-input-${parameter.name}`}
												>{parameter.label || parameter.name}
												{#if !parameter.required}<span>{t('(ไม่บังคับ)', '(optional)')}</span
													>{/if}</label
											><input
												id={`template-input-${parameter.name}`}
												value={inputs[parameter.name] ?? ''}
												required={parameter.required}
												maxlength="4000"
												disabled={rendering}
												oninput={(event) => {
													inputs = { ...inputs, [parameter.name]: event.currentTarget.value };
													rendered = undefined;
												}}
											/>
										</div>{/each}
								</div>
								{#if !selected.parameters.length}<p class="library-hint">
										{t(
											'แม่แบบนี้ไม่ต้องกรอกข้อมูลเพิ่มเติม',
											'This template does not require any inputs.'
										)}
									</p>{/if}<button type="submit" class="k-button primary" disabled={rendering}
									><FileText size={16} />{rendering
										? t('กำลังจัดเตรียม…', 'Preparing…')
										: t('ดูตัวอย่าง', 'Preview')}</button
								>
							</form>
							{#if renderError}<div class="library-alert" role="alert">
									<Info size={16} />
									<p>{renderError}</p>
								</div>{/if}{#if rendered}<div class="library-rendered" aria-live="polite">
									<p class="library-notice">
										<Check size={16} />{t('ตัวอย่างพร้อมแล้ว', 'Preview ready')}
									</p>
									<div class="library-prose">{rendered.content}</div>
									{#each rendered.knowledge as knowledge}<details>
											<summary><BookOpen size={16} />{knowledge.title}</summary>
											<div class="library-prose">{knowledge.content}</div>
										</details>{/each}
								</div>{/if}
							<p class="library-note">
								<Info size={16} />{t(
									'ORCA ตรวจสอบสิทธิ์และเตรียมข้อมูลประกอบให้ AI ส่วนรูปแบบผลลัพธ์สุดท้ายขึ้นอยู่กับแอป AI ที่ใช้งาน',
									'ORCA checks access and prepares the context for AI. The final output format depends on the AI app in use.'
								)}
							</p>
						</section>{/if}
					<footer class="library-detail-footer">
						<span
							><ShieldCheck size={14} />{selected.status === 'draft'
								? t('ฉบับร่างนี้แสดงเฉพาะผู้เขียน', 'This draft is visible only to its author')
								: t(
										'การเข้าถึงเป็นไปตามสิทธิ์ของรายการนี้และพื้นที่ทำงาน',
										'Access follows the permissions of this item and its workspace'
									)}</span
						><span>{t('แก้ไขล่าสุด', 'Last updated')} {displayDate(selected.updatedAt)}</span>
					</footer>
				</section>
			{:else}<div class="library-toolbar">
					<div class="library-search">
						<Search size={16} aria-hidden="true" /><input
							aria-label={t('ค้นหาในคลังความรู้', 'Search knowledge')}
							bind:value={query}
							placeholder={t('ค้นหาชื่อเรื่องหรือคำอธิบาย…', 'Search titles or descriptions…')}
							maxlength="200"
						/>
					</div>
					<select aria-label={t('สถานะเนื้อหา', 'Content status')} bind:value={status}
						><option value="current">{t('รายการที่ใช้งานอยู่', 'Current items')}</option><option
							value="published">{t('เผยแพร่แล้ว', 'Published')}</option
						><option value="draft">{t('ฉบับร่าง', 'Drafts')}</option><option value="archived"
							>{t('จัดเก็บแล้ว', 'Archived')}</option
						></select
					><button
						class="k-button primary"
						onclick={() => create(section === 'template' ? 'template' : 'knowledge')}
						><Plus size={16} />{section === 'template'
							? t('สร้างแม่แบบ', 'Create template')
							: t('เพิ่มบทความความรู้', 'Add article')}</button
					>
				</div>
				{#if filtered.length}<div class="library-card-grid">
						{#each filtered as item}<button class="library-card" onclick={() => open(item)}
								><span class="library-card-icon" aria-hidden="true"
									>{#if item.kind === 'knowledge'}<BookOpen size={16} />{:else}<FileText
											size={16}
										/>{/if}</span
								><span class="library-card-copy"
									><strong>{item.title}</strong><small
										>{item.summary ||
											(item.kind === 'knowledge'
												? t('บทความอ้างอิงสำหรับทีม', 'Reference article for your team')
												: t(
														'คำแนะนำและรูปแบบผลลัพธ์สำหรับงานขององค์กร',
														'Instructions and output format for your organization’s work'
													))}</small
									></span
								><span class="library-card-owner"
									>{item.canEdit
										? t('เขียนโดยคุณ', 'Created by you')
										: ownerName(item.ownerID)}</span
								><span class="library-status" class:published={item.status === 'published'}
									>{statusName(item.status)}</span
								><ChevronRight class="library-card-arrow" size={16} aria-hidden="true" /></button
							>{/each}
					</div>
				{:else}<section class="library-empty">
						<span class="library-symbol" aria-hidden="true"
							>{#if section === 'template'}<FileText size={28} />{:else}<BookOpen
									size={28}
								/>{/if}</span
						>
						<h2>
							{query || status !== 'current'
								? t('ไม่พบรายการที่ตรงกับตัวกรอง', 'No matching items')
								: section === 'template'
									? t('ยังไม่มีแม่แบบ', 'No templates yet')
									: t('ยังไม่มีบทความความรู้', 'No knowledge articles yet')}
						</h2>
						<p>
							{query || status !== 'current'
								? t(
										'เปลี่ยนคำค้นหาหรือสถานะเพื่อดูรายการอื่น',
										'Change the search or status to see other items.'
									)
								: section === 'template'
									? t(
											'สร้างแม่แบบเพื่อกำหนดขั้นตอนและรูปแบบผลลัพธ์ แล้วอ้างอิงบทความความรู้ให้ AI ใช้ประกอบ',
											'Create a template to define the steps and output format, and reference knowledge articles for AI to use.'
										)
									: t(
											'เพิ่มคู่มือ ระเบียบ หรือข้อมูลบริการเป็นบทความ และกำหนดสมาชิกหรือแผนกที่เข้าถึงได้',
											'Add manuals, procedures or service information as articles, and choose the members or departments who can access each one.'
										)}
						</p>
						{#if !query && status === 'current'}<button
								class="k-button primary small"
								onclick={() => create(section === 'template' ? 'template' : 'knowledge')}
								><Plus size={16} />{section === 'template'
									? t('สร้างแม่แบบ', 'Create template')
									: t('เพิ่มบทความความรู้', 'Add article')}</button
							>{:else}<button
								class="k-button small"
								onclick={() => {
									query = '';
									status = 'current';
								}}>{t('ล้างตัวกรอง', 'Clear filters')}</button
							>{/if}
					</section>{/if}
				<div class="library-mcp-note">
					<span class="library-symbol" aria-hidden="true"><LockKeyhole size={18} /></span>
					<div>
						<h3>
							{t('ใช้คลังความรู้ผ่านแอป AI', 'Use knowledge from your AI app')}
						</h3>
						<p>
							{t(
								'เผยแพร่เนื้อหา แล้วเพิ่มลิงก์เชื่อม AI (MCP URL) ของพื้นที่ทำงานนี้ในแอป AI ของคุณ AI จะเห็นเฉพาะบทความความรู้และแม่แบบที่คุณมีสิทธิ์ใช้',
								'Publish content, then add this workspace’s AI connection link (MCP URL) to your AI app. AI can see only the knowledge articles and templates you are allowed to use.'
							)}
						</p>
					</div>
					<a class="k-button small" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}
						>{t('ดูวิธีเชื่อมต่อ', 'View connection setup')}<ArrowRight size={16} /></a
					>
				</div>
			{/if}
		{/if}
	{/if}
</div>
