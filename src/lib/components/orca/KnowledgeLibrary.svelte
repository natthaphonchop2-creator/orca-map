<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { getHttpStatusCode, parseErrorContent } from '$lib/errors';
	import { connectionReady } from '$lib/orca/activation';
	import { aiConnection } from '$lib/orca/ai-connection.svelte';
	import { currentCompany } from '$lib/orca/company';
	import { term } from '$lib/orca/glossary';
	import { accessRequestMessage, libraryProblem, libraryScope, type LibraryFilter } from '$lib/orca/knowledge';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { memberName, orcaError, statusLabels, type OrcaBootstrap, type OrcaMember } from '$lib/services/orca';
	import {
		OrcaLibraryService,
		type LibraryDepartment,
		type LibraryItem,
		type LibraryKind
	} from '$lib/services/orca-library';
	import { KnowledgeWorkspaceService } from '$lib/services/orca-u8';
	import { Copy, FolderPlus, Info, SearchX, UserPlus, Users } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import LibraryEditor from './LibraryEditor.svelte';
	import KnowledgeDetail from './knowledge/KnowledgeDetail.svelte';
	import KnowledgeList from './knowledge/KnowledgeList.svelte';
	import ChoiceTile from './ui/ChoiceTile.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import { copyText } from './ui/copy';
	import { showToast } from './ui/toast-store.svelte';

	// view=knowledge: คลังความรู้ (workspace UX U8, the interim UI of proposal
	// §3.6). Items live in an AI workspace, so the page opens the viewer's
	// workspace by itself, or says in one line what is missing.
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

	type Screen = { name: 'list' } | { name: 'detail'; id: string } | { name: 'editor'; kind: LibraryKind; id?: string; title?: string };

	// The last workspace chosen here, per company (a convenience only).
	const rememberKey = () => `orca.knowledge.workspace.${currentCompany()}`;
	function readRemembered() {
		try {
			return typeof localStorage === 'undefined' ? '' : (localStorage.getItem(rememberKey()) ?? '');
		} catch {
			return '';
		}
	}
	function remember(id: string) {
		remembered = id;
		try {
			localStorage.setItem(rememberKey(), id);
		} catch {
			// A private window or blocked storage: the page still works.
		}
	}
	let remembered = $state(readRemembered());
	const scope = $derived(
		libraryScope({ hubs: data.hubs, currentUserID: data.currentUserID, canManage: data.canManage, requestedID: hubID || undefined, rememberedID: remembered })
	);
	const hub = $derived(scope.kind === 'hub' ? scope.hub : undefined);

	let kind = $state<LibraryKind>('knowledge');
	let filter = $state<LibraryFilter>('all');
	let query = $state('');
	let items = $state<LibraryItem[]>([]);
	let members = $state<OrcaMember[]>([]);
	let departments = $state<LibraryDepartment[]>([]);
	let loadedHub = $state('');
	let error = $state('');
	let now = $state(Date.now());
	let screen = $state<Screen>({ name: 'list' });
	let dirty = $state(false);
	let requestNumber = 0;
	const screenID = (value: Screen) => (value.name === 'list' ? undefined : value.id);
	const selected = $derived.by(() => {
		const id = screenID(screen);
		return id ? items.find((item) => item.id === id) : undefined;
	});
	const connected = $derived(aiConnection.state === 'connected');

	let contextID = '';
	$effect(() => {
		const id = hub?.id ?? '';
		void data;
		untrack(() => {
			if (id !== contextID) {
				contextID = id;
				requestNumber += 1;
				items = [];
				members = [];
				departments = [];
				loadedHub = '';
				error = '';
				screen = { name: 'list' };
				filter = 'all';
				query = '';
			}
			if (id && !dirty) void load(id);
		});
	});
	// An entry link (…&kind=template&create=1) is an intent, used once.
	const consumed = new Set<string>();
	$effect(() => {
		const id = hub?.id;
		const entryKind = initialKind;
		const create = initialCreate;
		if (!id || !entryKind || loadedHub !== id) return;
		untrack(() => {
			const key = `${id}:${entryKind}:${create}`;
			if (consumed.has(key) || dirty) return;
			consumed.add(key);
			kind = entryKind;
			if (create) openEditor(entryKind);
		});
	});

	async function load(id = hub?.id ?? '') {
		if (!id) return;
		const request = ++requestNumber;
		error = '';
		try {
			const result = await OrcaLibraryService.load(id);
			if (request !== requestNumber) return;
			items = result.items;
			members = result.members;
			departments = result.departments;
			loadedHub = id;
			now = Date.now();
			const open = screenID(screen);
			if (open && !result.items.some((item) => item.id === open)) screen = { name: 'list' };
		} catch (cause) {
			if (request !== requestNumber) return;
			// Access changed: nothing of this library stays on screen.
			const denied = [403, 404].includes(getHttpStatusCode(cause) ?? 0);
			if (denied) {
				items = [];
				screen = { name: 'list' };
			}
			// Either way the page stops saying "loading" and shows the error.
			loadedHub = id;
			error = denied
				? t('เปิดคลังความรู้ของพื้นที่ทำงานนี้ไม่ได้แล้ว คุณอาจไม่ได้อยู่ในพื้นที่นี้แล้ว หรือพื้นที่นี้ถูกจัดเก็บ', 'This workspace’s knowledge no longer opens for you: you may have left it, or it was archived.')
				: t('โหลดคลังความรู้ไม่สำเร็จ ลองโหลดใหม่อีกครั้ง', 'Knowledge could not be loaded. Try again.');
		}
	}
	/**
	 * After a refused save or preview: does the library still open for me?
	 * 'open' (its items, people and departments are fresh now), 'denied'
	 * (access changed, or the open item is gone) or 'unknown' (no answer).
	 */
	async function recheck(): Promise<'open' | 'denied' | 'unknown'> {
		const id = hub?.id ?? '';
		if (!id) return 'denied';
		const request = ++requestNumber;
		try {
			const result = await OrcaLibraryService.load(id);
			if (request !== requestNumber || hub?.id !== id) return 'unknown';
			const open = screenID(screen);
			if (open && !result.items.some((item) => item.id === open)) return 'denied';
			items = result.items;
			members = result.members;
			departments = result.departments;
			now = Date.now();
			return 'open';
		} catch (cause) {
			return [403, 404].includes(getHttpStatusCode(cause) ?? 0) ? 'denied' : 'unknown';
		}
	}
	function show(next: Screen) {
		screen = next;
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
	}
	function openEditor(next: LibraryKind, title = '') {
		if (!hub || loadedHub !== hub.id) return;
		show({ name: 'editor', kind: next, title });
	}
	function saved(item: LibraryItem, people: number) {
		items = [...items.filter((known) => known.id !== item.id), item];
		kind = item.kind;
		dirty = false;
		show({ name: 'detail', id: item.id });
		if (item.status === 'published')
			showToast(
				hub?.status === 'active'
					? t(`เผยแพร่แล้ว — AI ของ ${people} คนใช้ได้ทันที`, `Published — ${people} people’s AI can use it now`)
					: t('เผยแพร่แล้ว — AI จะใช้ได้เมื่อเปิดใช้งานพื้นที่ทำงานนี้', 'Published — AI can use it once this workspace is active')
			);
		else showToast(t('บันทึกร่างแล้ว — เห็นแค่คุณ', 'Draft saved — only you see it'));
	}
	function archived(item: LibraryItem) {
		items = items.map((known) => (known.id === item.id ? item : known));
		show({ name: 'list' });
		showToast(t('จัดเก็บแล้ว — AI เลิกใช้เรื่องนี้', 'Archived — AI no longer uses it'));
	}
	function denied() {
		dirty = false;
		show({ name: 'list' });
		void load();
	}
	function chooseWorkspace(id: string) {
		remember(id);
		void goto(localeHref(`/app?view=knowledge&hub=${encodeURIComponent(id)}`));
	}

	// Leaving with unsaved text asks first.
	let leaveOpen = $state(false);
	let leaveTo: URL | undefined;
	let leaving = false;
	beforeNavigate((navigation) => {
		if (leaving || !dirty) return;
		navigation.cancel();
		if (navigation.type === 'leave') return;
		leaveTo = navigation.to?.url;
		leaveOpen = true;
	});
	async function leave() {
		leaveOpen = false;
		dirty = false;
		const target = leaveTo;
		leaveTo = undefined;
		if (!target) return;
		leaving = true;
		try {
			await goto(target.pathname + target.search + target.hash);
		} finally {
			leaving = false;
		}
	}

	// ── Prerequisite states: one line and one button ──
	const readyConnections = $derived(data.connections.filter(connectionReady));
	const createHref = $derived(
		localeHref(`/app?view=new${readyConnections.length === 1 ? `&connection=${encodeURIComponent(readyConnections[0].id)}` : ''}`)
	);
	let joinChoice = $state('');
	let joining = $state(false);
	let joinError = $state('');
	let joinProblem = $state<'' | 'conflict' | 'invalid'>('');
	const joinHubs = $derived(scope.kind === 'join' ? scope.hubs : []);
	// Several workspaces: the first (active ones first) is chosen until another is.
	const joinTarget = $derived(joinHubs.some((item) => item.id === joinChoice) ? joinChoice : (joinHubs[0]?.id ?? ''));
	async function join() {
		const id = joinTarget;
		if (!id || joining || !data.canManage) return;
		joining = true;
		joinError = '';
		joinProblem = '';
		try {
			const saved = await KnowledgeWorkspaceService.addMember(id, data.currentUserID);
			remember(id);
			await onchanged();
			showToast(t(`เพิ่มคุณในพื้นที่ทำงาน ${saved.name} แล้ว`, `You were added to ${saved.name}`));
		} catch (cause) {
			const code = getHttpStatusCode(cause);
			joinProblem = code === 409 || code === 404 ? 'conflict' : code === 400 ? 'invalid' : '';
			joinError = joinMessage(code, cause);
		} finally {
			joining = false;
		}
	}
	function joinMessage(code: number | undefined, cause: unknown) {
		if (code === 409) return t('มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่แล้วลองอีกครั้ง', 'Someone changed this workspace at the same time. Reload and try again.');
		if (code === 404) return t('ไม่พบพื้นที่ทำงานนี้แล้ว โหลดใหม่แล้วลองอีกครั้ง', 'This workspace is gone. Reload and try again.');
		if (code === 400) return t('เพิ่มไม่ได้ เพราะพื้นที่ทำงานนี้ต้องแก้การตั้งค่าก่อน', 'Can’t add you: this workspace’s settings need fixing first.');
		return libraryProblem(parseErrorContent(cause), t) ?? orcaError(cause);
	}
	async function reloadAfterConflict() {
		joinError = '';
		joinProblem = '';
		await onchanged();
	}
	const me = $derived(data.members.find((member) => member.id === data.currentUserID));
	const requestText = $derived(
		accessRequestMessage(
			me ? (me.email && memberName(me) !== me.email ? `${memberName(me)} (${me.email})` : memberName(me)) : t('ฉัน', 'me'),
			data.organization.displayName,
			t
		)
	);
	async function copyRequest() {
		const ok = await copyText(requestText, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		showToast(
			ok ? t('คัดลอกแล้ว ส่งให้ผู้ดูแลบริษัทได้เลย', 'Copied. Send it to a company admin.') : t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.'),
			ok ? {} : { tone: 'error' }
		);
	}
</script>

<div class="kn-page">
	{#if scope.kind !== 'hub'}
		<PageHeader title={term('knowledge', t)} subtitle={t('ข้อมูลที่ AI ของทีมใช้ตอบคำถาม', 'What your team’s AI answers from')} />
		<section class="gate" class:several={scope.kind === 'join' && joinHubs.length > 1}>
			<span class="gate-ic" aria-hidden="true">
				{#if scope.kind === 'create'}<FolderPlus size={20} />{:else if scope.kind === 'join'}<UserPlus size={20} />{:else if scope.kind === 'request'}<Users size={20} />{:else}<SearchX size={20} />{/if}
			</span>
			<div class="gate-copy">
				{#if scope.kind === 'create'}
					<p class="gate-line">{t('ต้องมีพื้นที่ทำงาน AI ก่อน', 'You need an AI workspace first')}</p>
				{:else if scope.kind === 'join'}
					<p class="gate-line">
						{joinHubs.length === 1
							? t(`คุณยังไม่ได้อยู่ในพื้นที่ทำงาน ${joinHubs[0].name}`, `You’re not in ${joinHubs[0].name} yet`)
							: t('คุณยังไม่ได้อยู่ในพื้นที่ทำงาน AI ไหนเลย เลือกพื้นที่ที่จะใช้คลังความรู้', 'You’re not in any AI workspace. Choose one for your knowledge.')}
					</p>
				{:else if scope.kind === 'request'}
					<p class="gate-line">{t('คุณยังไม่มีสิทธิ์ใช้คลังความรู้ ขอให้ผู้ดูแลบริษัทเพิ่มคุณในพื้นที่ทำงาน AI', 'You can’t use Knowledge yet. Ask a company admin to add you to an AI workspace.')}</p>
				{:else}
					<p class="gate-line">{t('ไม่พบพื้นที่ทำงานนี้ หรือคุณไม่ได้อยู่ในพื้นที่นี้', 'This workspace isn’t there, or you’re not in it')}</p>
				{/if}
			</div>
			{#if scope.kind === 'join' && joinHubs.length > 1}
				<div class="gate-choices" role="radiogroup" aria-label={t('พื้นที่ทำงาน AI', 'AI workspaces')}>
					{#each joinHubs as choice (choice.id)}
						<ChoiceTile
							name="kn-join"
							value={choice.id}
							selected={joinTarget}
							onselect={(value) => (joinChoice = value)}
							title={choice.name}
							description={choice.description}
							badge={choice.status === 'active' ? '' : statusLabels[choice.status]}
							disabled={joining}
						/>
					{/each}
				</div>
			{/if}
			{#if joinError}
				<p class="gate-error" role="alert">
					<Info size={16} aria-hidden="true" /><span>{joinError}</span>
					{#if joinProblem === 'conflict'}<button type="button" class="k-button small" onclick={reloadAfterConflict}>{t('โหลดใหม่', 'Reload')}</button>
					{:else if joinProblem === 'invalid'}<a class="k-button small" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(joinTarget)}`)}>{t('เปิดพื้นที่ทำงาน', 'Open workspace')}</a>{/if}
				</p>
			{/if}
			<div class="gate-action">
				{#if scope.kind === 'create'}
					{#if data.canManage}<a class="k-button primary" href={createHref}>{t('สร้างพื้นที่ทำงาน', 'Create a workspace')}</a>{/if}
				{:else if scope.kind === 'join'}
					<button type="button" class="k-button primary" disabled={joining || !joinTarget} aria-busy={joining} onclick={join}>
						<UserPlus size={16} aria-hidden="true" />{joining ? t('กำลังเพิ่ม…', 'Adding…') : t('เพิ่มฉันเลย', 'Add me')}
					</button>
				{:else if scope.kind === 'request'}
					<button type="button" class="k-button primary" onclick={copyRequest}><Copy size={16} aria-hidden="true" />{t('คัดลอกข้อความขอสิทธิ์', 'Copy an access request')}</button>
				{:else}
					<a class="k-button primary" href={localeHref('/app?view=knowledge')}>{t('เปิดคลังความรู้', 'Open Knowledge')}</a>
				{/if}
			</div>
		</section>
	{:else if screen.name === 'editor' && loadedHub === hub!.id}
		{#key `${screen.kind}:${screen.id ?? 'new'}`}
			<LibraryEditor
				hub={hub!}
				kind={screen.kind}
				existing={selected}
				initialTitle={screen.title}
				{items}
				{members}
				{departments}
				currentUserID={data.currentUserID}
				{now}
				onsaved={saved}
				onclose={() => {
					dirty = false;
					show(selected ? { name: 'detail', id: selected.id } : { name: 'list' });
				}}
				ondenied={denied}
				onrecheck={recheck}
				ondirty={(value) => (dirty = value)}
			/>
		{/key}
	{:else if screen.name === 'detail' && selected}
		{#key selected.id}
			<KnowledgeDetail
				hub={hub!}
				item={selected}
				{items}
				{members}
				{departments}
				currentUserID={data.currentUserID}
				{now}
				{connected}
				app={aiConnection.app ?? ''}
				onback={() => show({ name: 'list' })}
				onedit={() => show({ name: 'editor', kind: selected!.kind, id: selected!.id })}
				onarchived={archived}
				ondenied={denied}
				onrecheck={recheck}
			/>
		{/key}
	{:else}
		<KnowledgeList
			hub={hub!}
			choices={scope.kind === 'hub' ? scope.choices : []}
			{items}
			{departments}
			{members}
			currentUserID={data.currentUserID}
			canManage={data.canManage}
			bind:kind
			bind:filter
			bind:query
			loaded={loadedHub === hub!.id}
			{error}
			{connected}
			app={aiConnection.app ?? ''}
			{now}
			onchoose={chooseWorkspace}
			oncreate={(next, title) => openEditor(next, title)}
			onopen={(item) => show({ name: 'detail', id: item.id })}
			onreload={() => load()}
		/>
	{/if}
</div>

<ConfirmDialog
	bind:open={leaveOpen}
	title={t('ออกโดยไม่บันทึก?', 'Leave without saving?')}
	message={t('สิ่งที่แก้ไว้ในหน้านี้จะหายไป', 'What you changed here will be lost.')}
	confirmLabel={t('ออกโดยไม่บันทึก', 'Leave without saving')}
	cancelLabel={t('แก้ต่อ', 'Keep editing')}
	tone="danger"
	onconfirm={leave}
	oncancel={() => (leaveTo = undefined)}
/>

<style>
	.gate {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px 16px;
		padding: 20px 22px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.gate-ic {
		display: grid;
		flex: none;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 11px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.gate-copy {
		flex: 1 1 280px;
		min-width: 0;
	}
	.gate-line {
		margin: 0;
		color: var(--orca-ink);
		font-size: 15.5px;
		font-weight: 600;
		line-height: 1.55;
	}
	.gate-action {
		flex: none;
	}
	.gate-action :global(.k-button) {
		min-height: 42px;
		padding: 0 18px;
		font-weight: 600;
	}
	.gate.several .gate-action {
		flex-basis: 100%;
		display: flex;
		justify-content: flex-end;
	}
	.gate-choices {
		display: grid;
		flex-basis: 100%;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 10px;
	}
	.gate-error {
		order: 3;
		display: flex;
		flex-basis: 100%;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin: 0;
		padding: 10px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 14px;
	}
	.gate-error :global(svg) {
		flex: none;
		color: var(--orca-deny);
	}
	.gate-error span {
		flex: 1 1 220px;
	}
	@media (max-width: 720px) {
		.gate {
			align-items: flex-start;
			padding: 18px 16px;
		}
		.gate-action {
			flex-basis: 100%;
		}
		.gate-action :global(.k-button) {
			width: 100%;
			justify-content: center;
		}
	}
</style>
