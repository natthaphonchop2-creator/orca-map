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
				? t('บันทึกแล้ว รายการนี้ยังเก็บอยู่ในคลัง', 'Saved. This item remains archived.')
				: item.status === 'published'
					? hub?.status === 'active'
						? t(
								'เผยแพร่แล้ว ผู้ที่ได้รับสิทธิ์เรียกใช้จาก AI ผ่าน MCP ได้',
								'Published. People with access can use it from AI through MCP.'
							)
						: t(
								'เผยแพร่เนื้อหาแล้ว เปิดใช้งานพื้นที่ทำงานเพื่อให้ AI เรียกใช้ผ่าน MCP',
								'Content published. Activate the workspace to make it available through MCP.'
							)
					: t(
							'บันทึกฉบับร่างแล้ว เฉพาะคุณที่มองเห็นเนื้อหานี้',
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
				: t('สมาชิกในพื้นที่', 'Workspace member');
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
				: t('เก็บเข้าคลัง', 'Archived');
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
				'เก็บเข้าคลังแล้ว AI จะเรียกใช้รายการนี้ไม่ได้',
				'Archived. AI can no longer retrieve this item.'
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
	<div class="k-breadcrumb">
		<a href={localeHref('/app?view=workspaces')}>{t('พื้นที่ทำงาน', 'Workspaces')}</a><ChevronRight
			size={14}
		/><span>{t('ความรู้และเทมเพลต', 'Knowledge & templates')}</span>
	</div>
	<header class="library-intro">
		<div>
			<p class="library-eyebrow">
				<BookOpen size={16} />{t(
					'ความรู้ของธุรกิจ ในมือทีมของคุณ',
					'Your business knowledge, ready for your team'
				)}
			</p>
			<h1>
				{t('ให้ AI เข้าใจ', 'Give AI your')}<br class="library-title-break" />{t(
					'วิธีทำงานของคุณ',
					' way of working'
				)}
			</h1>
			<p>
				{t(
					'รวมความรู้ที่ใช้จริง กำหนดว่าใครอ่านได้ และสร้างเทมเพลตให้ทีมทำงานตามแนวทางเดียวกัน',
					'Keep business knowledge together, choose who can read it, and build templates for a consistent way of working.'
				)}
			</p>
		</div>
	</header>
	<div class="library-navigation">
		<div class="library-tabs" aria-label={t('ประเภทเนื้อหา', 'Library sections')}>
			<button
				class:active={section === 'knowledge'}
				aria-pressed={section === 'knowledge'}
				disabled={editing || hasUnsavedEdits || saving || rendering}
				onclick={() => changeSection('knowledge')}
				><BookOpen size={17} />{t('ความรู้', 'Knowledge')}{#if loadedHub}<span
						>{knowledgeCount}</span
					>{/if}</button
			><button
				class:active={section === 'template'}
				aria-pressed={section === 'template'}
				disabled={editing || hasUnsavedEdits || saving || rendering}
				onclick={() => changeSection('template')}
				><FileText size={17} />{t('เทมเพลต', 'Templates')}{#if loadedHub}<span>{templateCount}</span
					>{/if}</button
			>{#if data.canManage}<button
					class:active={section === 'departments'}
					aria-pressed={section === 'departments'}
					disabled={editing || hasUnsavedEdits || saving || rendering}
					onclick={() => changeSection('departments')}
					><Users size={17} />{t('แผนก', 'Departments')}</button
				>{/if}
		</div>
		{#if section !== 'departments'}<div class="library-hub-select">
				<label for="knowledge-workspace">{t('พื้นที่ทำงาน', 'Workspace')}</label><select
					id="knowledge-workspace"
					value={hub?.id ?? ''}
					disabled={editing || saving || rendering}
					onchange={(event) =>
						goto(
							localeHref(
								`/app?view=knowledge${event.currentTarget.value ? `&hub=${encodeURIComponent(event.currentTarget.value)}` : ''}`
							)
						)}
					><option value="">{t('เลือกพื้นที่ทำงาน', 'Select workspace')}</option
					>{#each hubs as item}<option value={item.id}>{item.name}</option>{/each}</select
				>
			</div>{/if}
	</div>
	{#if navigationBlocked}<div class="library-alert" role="alert">
			<Info size={18} />
			<p>
				{t(
					'มีงานที่ยังไม่บันทึก กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนเปลี่ยนหน้า',
					'Please save or discard your edits before leaving this page.'
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
			<span class="library-symbol"><Folder size={27} /></span>
			<h2>
				{managedHub
					? t('ตรวจสมาชิกของพื้นที่นี้ก่อน', 'Review this workspace’s members')
					: hubID
						? t('ไม่พบพื้นที่ที่คุณเข้าถึงได้', 'This workspace is not available to you')
						: hubs.length
							? t('เลือกพื้นที่เก็บความรู้ของทีม', 'Choose a workspace for your knowledge')
							: !data.canManage
								? t('ยังไม่มีพื้นที่ที่คุณเป็นสมาชิก', 'You have not joined a workspace yet')
								: managedHubs.length
									? t('ตรวจสมาชิกในพื้นที่ที่มีอยู่', 'Review members in an existing workspace')
									: !readyConnections.length
										? t('เชื่อมระบบก่อนสร้างคลังความรู้', 'Connect a source to start your library')
										: t(
												'สร้างพื้นที่สำหรับความรู้ของทีม',
												'Create a workspace for your team’s knowledge'
											)}
			</h2>
			<p>
				{managedHub
					? t(
							'คุณดูแลพื้นที่นี้ได้ แต่ยังไม่ได้เป็นสมาชิก เปิดการตั้งค่าพื้นที่แล้วเลือกบัญชีของคุณในรายชื่อสมาชิกก่อนเพิ่มความรู้',
							'You can manage this workspace, but you are not a member. Open its settings and explicitly select your account in the member list before adding knowledge.'
						)
					: hubs.length
						? t(
								'ความรู้และเทมเพลตแยกตามพื้นที่ทำงาน เลือกพื้นที่ที่คุณเป็นสมาชิกเพื่อเริ่มต้น',
								'Knowledge and templates belong to a workspace. Select one you are a member of to get started.'
							)
						: !data.canManage
							? t(
									'ติดต่อผู้ดูแลเพื่อเพิ่มคุณในพื้นที่ของแผนก แล้วจึงเพิ่มและใช้ความรู้ร่วมกับทีมได้',
									'Ask your administrator to add you to your department’s workspace so you can contribute and use knowledge with your team.'
								)
							: managedHubs.length
								? t(
										'องค์กรมีพื้นที่ทำงานแล้ว เลือกพื้นที่ที่ต้องการและเพิ่มบัญชีของคุณในรายชื่อสมาชิก เพื่อเก็บความรู้ร่วมกับทีมในพื้นที่เดิม',
										'Your organization already has workspaces. Choose one and add your account to its member list to keep knowledge with the same team.'
									)
								: !readyConnections.length
									? t(
											'เลือกโปรแกรมที่ธุรกิจใช้และตั้งค่าการเชื่อมต่อ จากนั้นสร้างพื้นที่ทำงานเพื่อกำหนดสมาชิกและเก็บความรู้ของทีม',
											'Choose a business application and set up its connection. Then create a workspace for your team’s members and knowledge.'
										)
									: readyConnections.length === 1
										? t(
												`สร้างพื้นที่ที่ใช้ ${readyConnections[0].name} แล้วเลือกเครื่องมือและสมาชิก รวมบัญชีของคุณหากต้องการเพิ่มความรู้ด้วย`,
												`Create a workspace using ${readyConnections[0].name}, then choose its tools and members. Include your own account if you want to add knowledge.`
											)
										: t(
												'มีระบบที่เชื่อมต่อแล้ว เลือกระบบสำหรับพื้นที่นี้ จากนั้นกำหนดเครื่องมือและสมาชิกก่อนเพิ่มความรู้',
												'You have connected sources. Choose one for this workspace, then select tools and members before adding knowledge.'
											)}
			</p>
			{#if managedHub}<a
					class="k-button primary"
					href={localeHref(`/app?view=new&edit=${encodeURIComponent(managedHub.id)}`)}
					><Users size={17} />{t('ตรวจสมาชิกในพื้นที่', 'Review workspace members')}</a
				>{/if}
			{#if hubs.length}<div class="library-workspace-grid">
					{#each hubs as item}<a href={workspaceLibraryHref(item.id)}
							><Folder size={20} /><span
								><strong>{item.name}</strong><small
									>{item.description ||
										t('ความรู้และเทมเพลตของพื้นที่นี้', 'Workspace knowledge and templates')}</small
								></span
							><ArrowRight size={18} /></a
						>{/each}
				</div>{:else if !managedHub && managedHubs.length}<div class="library-workspace-grid">
					{#each managedHubs as item}<a
							href={localeHref(`/app?view=new&edit=${encodeURIComponent(item.id)}`)}
							><Users size={20} /><span
								><strong>{item.name}</strong><small
									>{t('ตรวจสมาชิกในพื้นที่', 'Review workspace members')}</small
								></span
							><ArrowRight size={18} /></a
						>{/each}
				</div>{:else if !managedHub && data.canManage && readyConnections.length}<a
					class="k-button primary"
					href={createWorkspaceHref}
					><Plus size={17} />{t('สร้างพื้นที่ทำงาน', 'Create workspace')}</a
				>{:else if !managedHub && data.canManage}<a
					class="k-button primary"
					href={localeHref('/app?view=catalog')}
					><Plug size={17} />{t('เลือกโปรแกรมที่ต้องการเชื่อม', 'Choose an application')}</a
				>{#if data.connections.length}<a class="k-button" href={localeHref('/app?view=servers')}
						>{t('ตรวจการเชื่อมต่อเดิม', 'Review existing connections')}</a
					>{/if}{/if}
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
		{#if notice}<p class="library-notice" role="status"><Check size={18} />{notice}</p>{/if}
		{#if error}<div class="library-alert" role="alert">
				<Info size={18} />
				<div>
					<p>{error}</p>
					<button class="k-button" disabled={loading} onclick={() => load()}
						><RefreshCw size={16} />{t('โหลดข้อมูลล่าสุด', 'Reload latest')}</button
					>
				</div>
			</div>{/if}
		{#if loading && loadedHub !== hub.id}<p class="library-loading" role="status">
				{t('กำลังโหลดความรู้ของพื้นที่นี้…', 'Loading this workspace’s knowledge…')}
			</p>
		{:else if loadedHub === hub.id}
			{#if selected}<section class="library-detail">
					<button
						class="library-back"
						disabled={saving || rendering}
						onclick={() => {
							selected = undefined;
							rendered = undefined;
						}}><ArrowLeft size={17} />{t('กลับไปที่คลัง', 'Back to library')}</button
					>
					<div class="library-detail-heading">
						<div>
							<div class="library-item-meta">
								<span class="library-status" class:published={selected.status === 'published'}
									>{statusName(selected.status)}</span
								><span>{t('ผู้เขียน', 'Author')} {ownerName(selected.ownerID)}</span>
							</div>
							<h2>{selected.title}</h2>
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
										aria-label={t('เก็บเข้าคลัง', 'Archive')}
										title={t('เก็บเข้าคลัง', 'Archive')}
										onclick={() => (confirmArchive = true)}><Archive size={18} /></button
									>{/if}
							</div>{/if}
					</div>
					{#if confirmArchive}<div class="library-alert" role="alert">
							<div>
								<p>
									{t(
										'เก็บรายการนี้เข้าคลังหรือไม่? AI จะเรียกใช้ไม่ได้ รวมถึงเทมเพลตที่อ้างอิงหัวข้อนี้ด้วย',
										'Archive this item? AI will no longer be able to use it, including templates that require this topic.'
									)}
								</p>
								<div class="library-actions">
									<button
										class="k-button"
										disabled={saving}
										onclick={() => (confirmArchive = false)}>{t('ยกเลิก', 'Cancel')}</button
									><button class="k-button" disabled={saving} onclick={archive}
										>{saving ? t('กำลังบันทึก…', 'Saving…') : t('เก็บเข้าคลัง', 'Archive')}</button
									>
								</div>
							</div>
						</div>{/if}
					<div class="library-reader">
						<p class="library-reader-label">
							{selected.kind === 'knowledge'
								? t('เนื้อหาความรู้', 'Knowledge content')
								: t('คำแนะนำในเทมเพลต', 'Template instructions')}
						</p>
						<div class="library-prose">{selected.content}</div>
					</div>
					{#if selected.kind === 'template' && selected.knowledgeIDs.length}<div
							class="library-reference-list"
						>
							<h3>{t('ความรู้ที่เทมเพลตใช้', 'Referenced knowledge')}</h3>
							{#each selected.knowledgeIDs as id}<span
									><BookOpen size={16} />{items.find((item) => item.id === id)?.title ??
										t('หัวข้อความรู้ที่ไม่พร้อมใช้งาน', 'Unavailable knowledge topic')}</span
								>{/each}
						</div>{/if}
					{#if selected.kind === 'template' && selected.status === 'published'}<section
							class="library-template-use"
						>
							<div class="library-section-heading">
								<div>
									<h3>
										<Sparkles size={20} />{t('เตรียมเทมเพลตสำหรับงานนี้', 'Prepare this template')}
									</h3>
									<p>
										{t(
											'กรอกข้อมูลเพื่อดูข้อความและความรู้ที่ ORCA จะส่งให้ AI',
											'Fill in the inputs to see the instructions and knowledge ORCA can provide to AI.'
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
											'เทมเพลตนี้ใช้ได้โดยไม่ต้องกรอกข้อมูลเพิ่ม',
											'This template does not require any additional inputs.'
										)}
									</p>{/if}<button type="submit" class="k-button primary" disabled={rendering}
									><FileText size={17} />{rendering
										? t('กำลังเตรียม…', 'Preparing…')
										: t('ดูเทมเพลตที่พร้อมใช้', 'Prepare template')}</button
								>
							</form>
							{#if renderError}<div class="library-alert" role="alert">
									<Info size={18} />
									<p>{renderError}</p>
								</div>{/if}{#if rendered}<div class="library-rendered" aria-live="polite">
									<p class="library-notice">
										<Check size={18} />{t('ข้อความพร้อมใช้', 'Template prepared')}
									</p>
									<div class="library-prose">{rendered.content}</div>
									{#each rendered.knowledge as knowledge}<details>
											<summary><BookOpen size={16} />{knowledge.title}</summary>
											<div class="library-prose">{knowledge.content}</div>
										</details>{/each}
								</div>{/if}
							<p class="library-note">
								<Info size={17} />{t(
									'ORCA ตรวจสิทธิ์และเตรียมบริบทให้ AI การทำตามรูปแบบผลลัพธ์ขึ้นอยู่กับแอป AI ที่ใช้งาน',
									'ORCA checks permissions and prepares context. How the output format is followed depends on your AI app.'
								)}
							</p>
						</section>{/if}
					<footer class="library-detail-footer">
						<span
							><ShieldCheck size={16} />{selected.status === 'draft'
								? t('ฉบับร่างนี้เห็นเฉพาะผู้เขียน', 'This draft is visible only to its author')
								: t(
										'เข้าถึงตามสิทธิ์ของหัวข้อและพื้นที่ทำงาน',
										'Access follows this topic and workspace permissions'
									)}</span
						><span>{t('แก้ไขล่าสุด', 'Updated')} {displayDate(selected.updatedAt)}</span>
					</footer>
				</section>
			{:else}<div class="library-toolbar">
					<div class="library-search">
						<Search size={18} /><input
							aria-label={t('ค้นหาในคลัง', 'Search library')}
							bind:value={query}
							placeholder={t('ค้นหาชื่อหรือคำอธิบาย…', 'Search titles or descriptions…')}
							maxlength="200"
						/>
					</div>
					<select aria-label={t('สถานะเนื้อหา', 'Content status')} bind:value={status}
						><option value="current">{t('รายการปัจจุบัน', 'Current items')}</option><option
							value="published">{t('เผยแพร่แล้ว', 'Published')}</option
						><option value="draft">{t('ฉบับร่าง', 'Drafts')}</option><option value="archived"
							>{t('เก็บเข้าคลัง', 'Archived')}</option
						></select
					><button
						class="k-button primary"
						onclick={() => create(section === 'template' ? 'template' : 'knowledge')}
						><Plus size={17} />{section === 'template'
							? t('สร้างเทมเพลต', 'Create template')
							: t('เพิ่มความรู้', 'Add knowledge')}</button
					>
				</div>
				{#if filtered.length}<div class="library-card-grid">
						{#each filtered as item}<button class="library-card" onclick={() => open(item)}
								><div class="library-card-top">
									<span class="library-card-icon"
										>{#if item.kind === 'knowledge'}<BookOpen size={23} />{:else}<FileText
												size={23}
											/>{/if}</span
									><span class="library-status" class:published={item.status === 'published'}
										>{statusName(item.status)}</span
									>
								</div>
								<h2>{item.title}</h2>
								<p>
									{item.summary ||
										(item.kind === 'knowledge'
											? t('ความรู้ที่ทีมใช้เป็นหลักอ้างอิง', 'Reference knowledge for your team')
											: t(
													'แนวทางและรูปแบบสำหรับงานของธุรกิจ',
													'Business instructions and output format'
												))}
								</p>
								<div class="library-card-bottom">
									<span
										>{item.canEdit
											? t('เขียนโดยคุณ', 'Created by you')
											: ownerName(item.ownerID)}</span
									><ArrowRight size={18} />
								</div></button
							>{/each}
					</div>
				{:else}<section class="library-empty">
						<span class="library-symbol"
							>{#if section === 'template'}<FileText size={28} />{:else}<BookOpen
									size={28}
								/>{/if}</span
						>
						<h2>
							{query || status !== 'current'
								? t('ไม่พบรายการที่ตรงกับตัวกรอง', 'No matching items')
								: section === 'template'
									? t('เริ่มจากงานที่ทีมทำซ้ำ', 'Start with a recurring task')
									: t('เก็บวิธีทำงานที่ทีมควรรู้', 'Capture what your team should know')}
						</h2>
						<p>
							{query || status !== 'current'
								? t('ลองเปลี่ยนคำค้นหรือสถานะเนื้อหา', 'Try a different search or status filter.')
								: section === 'template'
									? t(
											'เขียนขั้นตอนและรูปแบบคำตอบครั้งเดียว แล้วผูกกับความรู้ของธุรกิจเพื่อให้ AI เรียกใช้',
											'Write instructions and an output format once, then attach business knowledge for AI to retrieve.'
										)
									: t(
											'เพิ่มคู่มือ นโยบาย หรือข้อมูลบริการ แบ่งเป็นหัวข้อและเลือกคนหรือแผนกที่เข้าถึงได้',
											'Add procedures, policies or service information as topics, and choose the people or departments who can access each one.'
										)}
						</p>
						{#if !query && status === 'current'}<button
								class="k-button primary"
								onclick={() => create(section === 'template' ? 'template' : 'knowledge')}
								><Plus size={17} />{section === 'template'
									? t('สร้างเทมเพลตแรก', 'Create first template')
									: t('เพิ่มหัวข้อความรู้แรก', 'Add first topic')}</button
							>{:else}<button
								class="k-button"
								onclick={() => {
									query = '';
									status = 'current';
								}}>{t('ล้างตัวกรอง', 'Clear filters')}</button
							>{/if}
					</section>{/if}
				<div class="library-mcp-note">
					<span class="library-symbol"><LockKeyhole size={23} /></span>
					<div>
						<h3>
							{t(
								'ใช้ความรู้นี้จาก AI ที่คุณเชื่อมไว้',
								'Use this knowledge from your connected AI'
							)}
						</h3>
						<p>
							{t(
								'เผยแพร่เนื้อหา แล้วใช้การเชื่อมต่อ MCP และคีย์ส่วนตัวของพื้นที่นี้ AI จะค้นพบเฉพาะความรู้และเทมเพลตที่คุณได้รับสิทธิ์',
								'Publish content, then use this workspace’s MCP connection and your personal key. AI can discover only the knowledge and templates you are allowed to use.'
							)}
						</p>
					</div>
					<a class="k-button" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}
						>{t('ดูการเชื่อมต่อ', 'Connection setup')}<ArrowRight size={16} /></a
					>
				</div>
			{/if}
		{/if}
	{/if}
</div>
