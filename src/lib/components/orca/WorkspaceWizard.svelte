<script lang="ts">
	import ConnectionSetupDialog from '$lib/components/orca/ConnectionSetupDialog.svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { parseErrorContent } from '$lib/errors';
	import { connectionReady } from '$lib/orca/activation';
	import { unavailableGatewayTools } from '$lib/orca/gateway-tool-selection';
	import { gatewaySources } from '$lib/orca/gateway-sources';
	import { matchesToolSearch, toolPresentation } from '$lib/orca/tool-presentation';
	import { t, localeHref, orcaLocale } from '$lib/orca/locale.svelte';
	import { OrcaUserSourcesService, type OrcaUserSource } from '$lib/services/orca-user-sources';
	import {
		OrcaService,
		orcaError,
		memberName,
		type OrcaBootstrap,
		type OrcaHub,
		type OrcaConnection,
		type OrcaUnit,
		type HubInput,
		type HubStatus
	} from '$lib/services/orca';
	import {
		Check,
		ChevronRight,
		FileCheck2,
		Folder,
		Info,
		Plug,
		ShieldCheck,
		Users
	} from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';

	let {
		data,
		existing,
		initialConnectionID = '',
		initialStep,
		onsaved,
		onreload
	}: {
		data: OrcaBootstrap;
		existing?: OrcaHub;
		initialConnectionID?: string;
		initialStep?: 'tools';
		onsaved: (hub: OrcaHub) => Promise<void>;
		onreload: () => Promise<void>;
	} = $props();
	const editingID = untrack(() => existing?.id);
	const editingVersion = untrack(() => existing?.version);
	const toolsOnly = untrack(() => Boolean(existing && initialStep === 'tools'));
	// One page with numbered sections, like Arcade's gateway form. Editing only
	// the tools shows that section alone and keeps everything else as saved.
	type Section = 'name' | 'tools' | 'people' | 'ai';
	type IssueSection = 'name' | 'tools' | 'people' | 'advanced';
	const sections: Section[] = toolsOnly ? ['tools'] : ['name', 'tools', 'people', 'ai'];
	const requestedConnectionID = untrack(() => (existing ? '' : initialConnectionID));
	let initialSelection = $state(Boolean(requestedConnectionID));
	let sourceSetupOpen = $state(false);
	let name = $state(untrack(() => existing?.name ?? ''));
	let description = $state(untrack(() => existing?.description ?? ''));
	let instructions = $state(untrack(() => existing?.instructions ?? ''));
	let writeMode = $state<'direct' | 'approval'>(
		untrack(() => (existing?.writeMode === 'approval' ? 'approval' : 'direct'))
	);
	const maxSources = 20;
	type SelectedSource = { connectionID: string; toolNames: string[] };
	let sources = $state<SelectedSource[]>(
		untrack(() => {
			if (existing)
				return gatewaySources(existing).map((source) => ({
					...source,
					toolNames: [...source.toolNames]
				}));
			const requested = data.connections.find((item) => item.id === requestedConnectionID);
			return requested && connectionReady(requested)
				? [{ connectionID: requested.id, toolNames: [...requested.toolNames] }]
				: [];
		})
	);
	let memberIDs = $state<string[]>(untrack(() => [...(existing?.memberIDs ?? [])]));
	let accessUnitIDs = $state<string[]>(untrack(() => [...(existing?.accessUnitIDs ?? [])]));
	const initialUserSourceID = untrack(() => existing?.userSourceID ?? '');
	let userSourceID = $state(initialUserSourceID);
	let userSources = $state<OrcaUserSource[]>([]);
	let loadingUserSources = $state(false);
	let userSourcesError = $state('');
	let userSourcesRequest = 0;
	let userSourcesController: AbortController | undefined;
	const selectedUserSource = $derived(userSources.find((source) => source.id === userSourceID));
	const userSourceLabel = $derived(userSourceID
		? selectedUserSource ? `${selectedUserSource.name}${selectedUserSource.enabled ? '' : t(' · ปิดใช้งาน', ' · Disabled')}` : t('การเข้าสู่ระบบองค์กรเดิม', 'Previous sign-in source')
		: t('บัญชี ORCA', 'ORCA account'));
	let unitIDs = $state<string[]>(untrack(() => [...(existing?.unitIDs ?? [])]));
	let dailyLimit = $state<number | undefined>(untrack(() => existing?.dailyLimit ?? 100));
	let status = $state<HubStatus>(untrack(() => existing?.status ?? 'active'));
	let query = $state('');
	let toolQuery = $state('');
	let customToolsOpen = $state<string[]>([]);
	let error = $state('');
	// Where the error shows: in its own section, in the form (saving), or, when
	// editing tools only, as a pointer to the full editor.
	let errorSection = $state<IssueSection | 'form' | 'elsewhere'>('form');
	let advancedOpen = $state(false);
	let busy = $state(false);
	let savedHub = $state<OrcaHub>();
	let versionConflict = $state(false);
	let formElement: HTMLFormElement | undefined = $state();
	const organizationName = $derived(data.organization.displayName || 'ORCA');
	const selectedConnectionIDs = $derived(sources.map((source) => source.connectionID));
	const sourceGroups = $derived(
		sources.map((selection) => {
			const connection = data.connections.find((item) => item.id === selection.connectionID);
			const eligibleTools = connectionReady(connection)
				? (connection?.tools ?? []).filter((tool) => connection?.toolNames.includes(tool.name))
				: [];
			return {
				...selection,
				connection,
				eligibleTools,
				unavailableTools: unavailableGatewayTools(connection, selection.toolNames),
				visibleTools: eligibleTools.filter((tool) =>
					matchesToolSearch(tool, toolQuery, orcaLocale.value)
				),
				allApprovedSelected:
					eligibleTools.length > 0 &&
					eligibleTools.every((tool) => selection.toolNames.includes(tool.name)),
				selectedEligibleCount: eligibleTools.filter((tool) =>
					selection.toolNames.includes(tool.name)
				).length
			};
		})
	);
	const selectedToolCount = $derived(
		sources.reduce((count, source) => count + source.toolNames.length, 0)
	);
	const eligibleToolCount = $derived(
		sourceGroups.reduce((count, source) => count + source.eligibleTools.length, 0)
	);
	const allReadOnly = $derived(
		sourceGroups.length > 0 && sourceGroups.every((source) => source.connection?.reviewedReadOnly)
	);
	const toolAccessLabel = $derived(
		!sources.length
			? t('ยังไม่ได้เลือกระบบ', 'No systems selected')
			: allReadOnly
				? t('อ่านข้อมูลเท่านั้น', 'Read only')
				: t('เฉพาะเครื่องมือที่อนุญาต', 'Allowed tools only')
	);
	const selectionSummary = $derived(
		t(
			`${sources.length} ระบบ · เครื่องมือ ${selectedToolCount} รายการ`,
			`Systems: ${sources.length} · Tools: ${selectedToolCount}`
		)
	);
	const audienceSummary = $derived(
		t(
			`สมาชิก ${memberIDs.length} คน · ${accessUnitIDs.length} แผนก`,
			`Members: ${memberIDs.length} · Departments: ${accessUnitIDs.length}`
		)
	);
	const statusLabel = $derived(
		status === 'active'
			? t('เปิดใช้งาน', 'Active')
			: status === 'paused'
				? t('ระงับการใช้งาน', 'Paused')
				: t('ฉบับร่าง', 'Draft')
	);
	const sourceLinkChanged = $derived(!editingID && initialConnectionID !== requestedConnectionID);
	const currentMember = $derived(
		data.members.find((item) => item.id === data.currentUserID && memberActive(item.status))
	);
	const availableDepartments = $derived(
		data.units.filter((unit) => departmentActive(unit) || accessUnitIDs.includes(unit.id))
	);
	const missingDepartmentIDs = $derived(
		accessUnitIDs.filter((id) => !data.units.some((unit) => unit.id === id))
	);
	const missingMemberIDs = $derived(
		memberIDs.filter((id) => !data.members.some((member) => member.id === id))
	);
	const sourceIssue = $derived.by(() => {
		const requestedIDs = [...selectedConnectionIDs];
		if (
			initialSelection &&
			requestedConnectionID &&
			!requestedIDs.includes(requestedConnectionID)
		) {
			requestedIDs.push(requestedConnectionID);
		}
		for (const id of requestedIDs) {
			const source = data.connections.find((item) => item.id === id);
			if (!source)
				return t(
					'ไม่พบระบบที่เลือก หรือบัญชีของคุณไม่มีสิทธิ์ใช้ระบบนี้ กรุณานำระบบนั้นออกหรือเลือกระบบอีกครั้ง',
					'A selected system was not found or is not accessible to your account. Remove it or select a system again.'
				);
			if (!source.enabled || source.archivedAt || source.deletedAt)
				return t(
					`ระบบ ${source.name} ไม่ได้เปิดใช้งาน กรุณาเปิดใช้งานหรือนำออกจากพื้นที่ทำงานนี้ก่อนดำเนินการต่อ`,
					`${source.name} is not active. Activate it or remove it from this workspace to continue.`
				);
			if (!connectionReady(source))
				return t(
					`ระบบ ${source.name} ยังตรวจสอบเครื่องมือไม่ครบ กรุณาตรวจสอบเครื่องมือของระบบนี้หรือนำระบบนี้ออก`,
					`${source.name} has tools that have not been reviewed. Review its tools or remove the system.`
				);
			if (!selectedConnectionIDs.includes(id))
				return t(
					'ระบบที่ระบุพร้อมให้เลือกแล้ว กรุณาเลือกระบบด้านล่างเพื่อใช้กับพื้นที่ทำงานนี้',
					'The requested system is now available. Select it below to use it in this workspace.'
				);
		}
		return '';
	});
	const availableConnections = $derived(
		data.connections.filter(
			(item) =>
				connectionReady(item) ||
				selectedConnectionIDs.includes(item.id) ||
				(initialSelection && item.id === requestedConnectionID)
		)
	);
	const missingSources = $derived(
		sources.filter((source) => !data.connections.some((item) => item.id === source.connectionID))
	);
	const hasReadyConnection = $derived(availableConnections.some(connectionReady));
	async function sourceSetupCompleted(connection: OrcaConnection) {
		await onreload();
		await tick();
		if (!selectedConnectionIDs.includes(connection.id)) selectConnection(connection.id);
		sourceSetupOpen = false;
	}
	const visibleMembers = $derived(
		data.members.filter(
			(item) =>
				(memberIDs.includes(item.id) || memberActive(item.status)) &&
				(memberIDs.includes(item.id) ||
					`${memberName(item)} ${item.email}`.toLowerCase().includes(query.toLowerCase()))
		)
	);
	async function loadUserSources() {
		userSourcesController?.abort();
		const request = ++userSourcesRequest;
		if (!data.canManage) return;
		const controller = new AbortController();
		userSourcesController = controller;
		loadingUserSources = true;
		userSourcesError = '';
		try {
			const result = await OrcaUserSourcesService.list(controller.signal);
			if (request === userSourcesRequest && !controller.signal.aborted && data.canManage) userSources = result.items;
		} catch (cause) {
			if (request === userSourcesRequest && !controller.signal.aborted) userSourcesError = orcaError(cause);
		} finally {
			if (request === userSourcesRequest) loadingUserSources = false;
		}
	}
	onMount(() => {
		void loadUserSources();
		return () => { userSourcesRequest++; userSourcesController?.abort(); };
	});

	function selectAllApprovedTools(connectionID: string) {
		const group = sourceGroups.find((source) => source.connectionID === connectionID);
		if (busy || !group?.eligibleTools.length || group.allApprovedSelected) return;
		// Copy only today's approved inventory, preserving revoked selections for explicit removal.
		sources = sources.map((source) =>
			source.connectionID === connectionID
				? {
						...source,
						toolNames: [
							...new Set([...source.toolNames, ...group.eligibleTools.map((tool) => tool.name)])
						]
					}
				: source
		);
		error = '';
	}

	function selectConnection(id: string) {
		if (busy || toolsOnly) return;
		const selected = data.connections.find((item) => item.id === id);
		if (selectedConnectionIDs.includes(id)) {
			sources = sources.filter((source) => source.connectionID !== id);
		} else {
			if (!selected || !connectionReady(selected)) return;
			if (sources.length >= maxSources) {
				report(
					'tools',
					t(
						`พื้นที่ทำงานหนึ่งแห่งรวมได้สูงสุด ${maxSources} ระบบ กรุณานำระบบที่ไม่ใช้ออกก่อนเพิ่มระบบใหม่`,
						`A workspace can include up to ${maxSources} systems. Remove an unused system before adding another.`
					)
				);
				return;
			}
			// Checking a Server explicitly selects its current approved set, not future tools.
			sources = [...sources, { connectionID: id, toolNames: [...selected.toolNames] }];
		}
		initialSelection = false;
		toolQuery = '';
		customToolsOpen = selectedConnectionIDs.includes(id)
			? [...new Set([...customToolsOpen, id])]
			: customToolsOpen.filter((sourceID) => sourceID !== id);
		error = '';
	}
	function toggleSourceTool(connectionID: string, name: string) {
		if (
			busy ||
			!sourceGroups
				.find((source) => source.connectionID === connectionID)
				?.eligibleTools.some((tool) => tool.name === name)
		)
			return;
		sources = sources.map((source) =>
			source.connectionID === connectionID
				? { ...source, toolNames: toggle(source.toolNames, name) }
				: source
		);
		error = '';
	}
	function toggleCustomization(connectionID: string) {
		customToolsOpen = customToolsOpen.includes(connectionID)
			? customToolsOpen.filter((id) => id !== connectionID)
			: [...customToolsOpen, connectionID];
	}
	function memberActive(status?: string) {
		return !status || status === 'active';
	}
	function departmentActive(unit: OrcaUnit | undefined) {
		return !!unit && unit.kind === 'department' && !unit.archivedAt && !unit.deletedAt;
	}
	function toggleMember(id: string) {
		if (busy || toolsOnly) return;
		const member = data.members.find((item) => item.id === id);
		if (!memberIDs.includes(id) && (!member || !memberActive(member.status))) return;
		memberIDs = toggle(memberIDs, id);
		error = '';
	}
	function toggleDepartment(id: string) {
		if (busy || toolsOnly) return;
		if (!accessUnitIDs.includes(id) && !departmentActive(data.units.find((unit) => unit.id === id)))
			return;
		accessUnitIDs = toggle(accessUnitIDs, id);
		error = '';
	}
	function toggleMyMembership() {
		if (currentMember) toggleMember(currentMember.id);
	}
	function toggle(values: string[], id: string): string[] {
		return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
	}
	function removeUnavailableTool(connectionID: string, name: string) {
		if (
			busy ||
			!sourceGroups
				.find((source) => source.connectionID === connectionID)
				?.unavailableTools.includes(name)
		)
			return;
		sources = sources.map((source) =>
			source.connectionID === connectionID
				? {
						...source,
						toolNames: source.toolNames.filter((tool) => tool !== name)
					}
				: source
		);
		error = '';
	}
	function sectionIssue(section: IssueSection): string {
		if (section === 'name')
			return name.trim() ? '' : t('กรุณาตั้งชื่อพื้นที่ทำงาน AI', 'Enter a name for the AI workspace.');
		if (section === 'people') {
			if (userSourceID && userSourceID !== initialUserSourceID && !selectedUserSource?.enabled)
				return t('กรุณาเลือกการเข้าสู่ระบบองค์กรที่เปิดใช้งาน หรือใช้บัญชี ORCA', 'Choose an active sign-in source or use an ORCA account.');
			if (!memberIDs.length && !accessUnitIDs.length)
				return t(
					'กรุณาเลือกสมาชิกหรือแผนกอย่างน้อย 1 รายการ',
					'Select at least one member or department.'
				);
			if (
				memberIDs.some(
					(id) => !data.members.some((member) => member.id === id && memberActive(member.status))
				)
			)
				return t(
					'กรุณานำสมาชิกที่ถูกระงับหรือไม่พบในองค์กรออกก่อนบันทึก',
					'Remove suspended or unavailable members before saving.'
				);
			if (accessUnitIDs.some((id) => !departmentActive(data.units.find((unit) => unit.id === id))))
				return t(
					'กรุณานำแผนกที่จัดเก็บแล้วหรือไม่พบออกก่อนบันทึก',
					'Remove archived or unavailable departments before saving.'
				);
			return '';
		}
		if (section === 'tools') {
			if (sourceIssue) return sourceIssue;
			if (sources.length > maxSources)
				return t(
					`พื้นที่ทำงานหนึ่งแห่งรวมได้สูงสุด ${maxSources} ระบบ`,
					`A workspace can include up to ${maxSources} systems.`
				);
			if (!sources.length || sourceGroups.some((source) => !connectionReady(source.connection)))
				return t(
					'กรุณาเลือกระบบที่เปิดใช้งานและตรวจสอบเครื่องมือแล้วอย่างน้อย 1 ระบบ',
					'Select at least one active system with reviewed tools.'
				);
			if (sourceGroups.some((source) => source.unavailableTools.length))
				return t(
					'กรุณานำเครื่องมือที่ระบบไม่อนุญาตแล้วออกจากพื้นที่ทำงานนี้ก่อนบันทึก',
					'Remove tools that a system no longer allows before saving.'
				);
			if (sources.some((source) => !source.toolNames.length))
				return t(
					'กรุณาเลือกเครื่องมืออย่างน้อย 1 รายการจากแต่ละระบบ หรือนำระบบที่ไม่ใช้ออกจากพื้นที่ทำงานนี้',
					'Select at least one tool from each system, or remove unused systems from this workspace.'
				);
			return '';
		}
		return !Number.isInteger(dailyLimit) || (dailyLimit ?? 0) < 1 || (dailyLimit ?? 0) > 1000000
			? t(
					'กรุณากำหนดเพดานการใช้งานต่อวันเป็นจำนวนเต็มตั้งแต่ 1 ถึง 1,000,000 ครั้ง',
					'Set a whole-number daily limit between 1 and 1,000,000 calls.'
				)
			: '';
	}
	// Checked in page order, so the first problem reported is the first one on the page.
	function firstIssue(): { section: IssueSection; message: string } | undefined {
		for (const section of ['name', 'tools', 'people', 'advanced'] as IssueSection[]) {
			const message = sectionIssue(section);
			if (message) return { section, message };
		}
		return undefined;
	}
	function report(section: IssueSection | 'form' | 'elsewhere', message: string) {
		errorSection = section;
		error = message;
	}
	async function showError() {
		await tick();
		const box = formElement?.querySelector<HTMLElement>('[data-setup-error]');
		box?.scrollIntoView({ block: 'center' });
		box?.focus({ preventScroll: true });
	}
	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
	async function save() {
		if (busy) return;
		if (savedHub) {
			await openSavedHub();
			return;
		}
		if (versionConflict) {
			report('form', conflictMessage());
			await showError();
			return;
		}
		const issue = firstIssue();
		if (issue) {
			// Editing tools only shows one section; a problem elsewhere points to the full editor.
			report(toolsOnly && issue.section !== 'tools' ? 'elsewhere' : issue.section, issue.message);
			if (issue.section === 'advanced') advancedOpen = true;
			await showError();
			return;
		}
		busy = true;
		error = '';
		const input: HubInput = {
			name: name.trim(),
			description: description.trim(),
			sources: sources.map((source) => ({
				...source,
				toolNames: [...source.toolNames]
			})),
			connectionID: sources[0]?.connectionID ?? '',
			toolNames: [...(sources[0]?.toolNames ?? [])],
			memberIDs: [...memberIDs],
			accessUnitIDs: [...accessUnitIDs],
			userSourceID,
			unitIDs: [...unitIDs],
			dailyLimit: dailyLimit!,
			status,
			// Tools-only editing leaves guidance and the write mode out, so the server keeps them.
			...(toolsOnly ? {} : { instructions: instructions.trim(), writeMode }),
			...(editingID ? { version: editingVersion } : {})
		};
		try {
			savedHub = await OrcaService.hub(input, editingID);
		} catch (cause) {
			versionConflict = parseErrorContent(cause).status === 409;
			report('form', versionConflict ? conflictMessage() : orcaError(cause));
			await showError();
		} finally {
			busy = false;
		}
		if (savedHub) await openSavedHub();
	}
	function conflictMessage() {
		return t(
			'พื้นที่ทำงานนี้มีการแก้ไขจากที่อื่นแล้ว ข้อมูลที่คุณกรอกยังอยู่ แต่บันทึกทับฉบับล่าสุดไม่ได้ กรุณายกเลิกและเปิดหน้าแก้ไขอีกครั้งเพื่อตรวจสอบสิทธิ์ล่าสุด',
			'This workspace was changed elsewhere. Your entries are preserved but cannot overwrite the newer version. Cancel and reopen the editor to review the latest access.'
		);
	}
	async function openSavedHub() {
		if (!savedHub || busy) return;
		busy = true;
		error = '';
		try {
			await onsaved(savedHub);
		} catch {
			report(
				'form',
				t(
					'บันทึกพื้นที่ทำงาน AI แล้ว แต่เปิดหน้าถัดไปไม่สำเร็จ กรุณากด “เปิดพื้นที่ทำงานที่บันทึกแล้ว” เพื่อลองอีกครั้ง',
					'The AI workspace is saved, but its page could not be opened. Select “Open saved workspace” to try again.'
				)
			);
			await showError();
		} finally {
			busy = false;
		}
	}
</script>

{#snippet sectionHead(id: Section, title: string, description: string, count = '', optional = false)}
	<header class="setup-section-head">
		{#if sections.length > 1}<span class="setup-section-number" aria-hidden="true"
				>{sections.indexOf(id) + 1}</span
			>{/if}
		<div class="setup-section-copy">
			<h2 id={`setup-${id}-title`}>
				{title}{#if optional}{' '}<span class="setup-optional">{t('(ไม่บังคับ)', '(optional)')}</span>{/if}
			</h2>
			<p class="setup-section-description">{description}</p>
		</div>
		{#if count}<span class="setup-count">{count}</span>{/if}
	</header>
{/snippet}

{#snippet sectionError(section: IssueSection)}
	{#if error && errorSection === section}<div
			class="k-banner error setup-section-error"
			role="alert"
			data-setup-error
			tabindex="-1"
		>
			<Info size={16} aria-hidden="true" />
			<p>{error}</p>
		</div>{/if}
{/snippet}

{#snippet sourceTools(group: (typeof sourceGroups)[number])}
	<fieldset class="setup-source-tools">
		<legend
			><Plug size={16} aria-hidden="true" />{group.connection?.name ||
				t('ระบบที่ไม่พร้อมใช้งาน', 'Unavailable system')}</legend
		>
		{#if group.connection?.scopeNote}<p class="setup-scope-note">
				{group.connection.scopeNote}
			</p>{/if}
		<div class="setup-tool-preset">
			<p class="setup-tool-selection" role="status">
				{group.allApprovedSelected
					? t(
							`เลือกเครื่องมือที่อนุญาตครบทั้ง ${group.selectedEligibleCount} รายการแล้ว`,
							`All ${group.selectedEligibleCount} allowed tools selected`
						)
					: t(
							`เลือกแล้ว ${group.selectedEligibleCount} จาก ${group.eligibleTools.length} รายการ`,
							`${group.selectedEligibleCount} of ${group.eligibleTools.length} tools selected`
						)}
			</p>
			{#if !group.allApprovedSelected}<button
					type="button"
					class="k-button small setup-use-approved"
					disabled={!group.eligibleTools.length}
					onclick={() => selectAllApprovedTools(group.connectionID)}
				>
					<Check size={16} aria-hidden="true" />{t(
						`เลือกเครื่องมือที่อนุญาตทั้งหมด (${group.eligibleTools.length} รายการ)`,
						`Select all allowed tools (${group.eligibleTools.length})`
					)}
				</button>{/if}
		</div>
		{#if group.unavailableTools.length}<div class="setup-revoked-tools" role="status">
				<h3>
					{t('เครื่องมือที่ระบบไม่อนุญาตแล้ว', 'Tools no longer allowed by this system')}
				</h3>
				<p>
					{t(
						'เครื่องมือเหล่านี้ยังอยู่ในการตั้งค่าของพื้นที่ทำงานนี้ กรุณานำออกก่อนบันทึก',
						'These tools remain in this workspace’s settings. Remove them before saving.'
					)}
				</p>
				{#each group.unavailableTools as tool (tool)}<div class="setup-revoked-tool">
						<strong
							>{toolPresentation({ name: tool }, orcaLocale.value).label}<code
								class="setup-tool-identifier">{tool}</code
							></strong
						>
						<button
							type="button"
							class="k-button small"
							onclick={() => removeUnavailableTool(group.connectionID, tool)}
							>{t('นำออกจากพื้นที่ทำงาน', 'Remove from workspace')}</button
						>
					</div>{/each}
			</div>{/if}
		<div class="setup-custom-tools">
			<button
				type="button"
				class="setup-custom-toggle"
				aria-expanded={customToolsOpen.includes(group.connectionID) || Boolean(toolQuery.trim())}
				aria-controls={`gateway-tools-${group.connectionID}`}
				onclick={() => toggleCustomization(group.connectionID)}
				>{t('ปรับเครื่องมือสำหรับพื้นที่ทำงานนี้', 'Customize tools for this workspace')}</button
			>
			{#if customToolsOpen.includes(group.connectionID) || toolQuery.trim()}<div
					id={`gateway-tools-${group.connectionID}`}
					class="setup-custom-body"
				>
					<p class="setup-help">
						{t(
							'การเลือกนี้มีผลกับพื้นที่ทำงานนี้เท่านั้น พื้นที่ทำงานอื่นยังคงใช้สิทธิ์เดิม',
							'These choices apply only to this workspace. Other workspaces keep their current access.'
						)}
					</p>
					<div class="setup-choices setup-choices-single">
						{#each group.visibleTools as tool (tool.name)}
							{@const presentation = toolPresentation(tool, orcaLocale.value)}
							<label class="setup-choice" class:selected={group.toolNames.includes(tool.name)}>
								<input
									type="checkbox"
									checked={group.toolNames.includes(tool.name)}
									onchange={() => toggleSourceTool(group.connectionID, tool.name)}
								/>
								<span class="setup-choice-copy">
									<strong>{presentation.label}</strong><code class="setup-tool-identifier"
										>{presentation.identifier}</code
									>
									<p>
										{presentation.description ||
											t(
												'ระบบไม่ได้ระบุคำอธิบายของเครื่องมือนี้',
												'No description provided by the system'
											)}
									</p>
								</span>
							</label>
						{:else}<p class="setup-empty-choice">
								{t('ไม่พบเครื่องมือที่ตรงกับคำค้น', 'No tools match your search.')}
							</p>{/each}
					</div>
				</div>{/if}
		</div>
	</fieldset>
{/snippet}

<div class="workspace-setup">
	<div class="k-breadcrumb">
		<a href={localeHref('/app?view=workspaces')}>{t('พื้นที่ทำงาน AI', 'AI workspaces')}</a><span
			>/</span
		><span
			>{existing
				? t('แก้ไขพื้นที่ทำงาน AI', 'Edit AI workspace')
				: t('สร้างพื้นที่ทำงาน AI', 'Create AI workspace')}</span
		>
	</div>
	<div class="k-intro">
		<h1>
			{toolsOnly
				? t('แก้ไขเครื่องมือของพื้นที่ทำงาน', 'Edit workspace tools')
				: existing
					? t('แก้ไขพื้นที่ทำงาน AI', 'Edit AI workspace')
					: t('สร้างพื้นที่ทำงาน AI', 'Create AI workspace')}
		</h1>
		<p class="k-subtitle">
			{toolsOnly
				? t(
						'ปรับเครื่องมือของระบบที่เลือกไว้ สมาชิก แผนก และการตั้งค่าอื่นยังคงใช้ค่าปัจจุบัน',
						'Adjust the tools of the selected systems. Members, departments and other settings keep their current values.'
					)
				: t(
						'ตั้งค่าทั้งหมดในหน้าเดียว: ตั้งชื่อ เลือกระบบและเครื่องมือ กำหนดผู้ใช้งาน แล้วบอกวิธีทำงานให้ AI',
						'Everything on one page: name it, pick systems and tools, choose who can use it, then guide how AI works.'
					)}
		</p>
	</div>

	<div class="setup-layout">
		<form class="setup-main" bind:this={formElement} onsubmit={handleSubmit} novalidate>
			{#if sourceLinkChanged}<div class="k-banner" role="status">
					<Info size={16} aria-hidden="true" />
					<p>
						{t(
							'ลิงก์ของหน้านี้เปลี่ยนแล้ว แต่ข้อมูลที่กรอกไว้ยังอยู่ เพิ่มหรือนำระบบออกได้ในส่วนระบบและเครื่องมือ',
							'The page link changed, and your current entries are preserved. Add or remove systems in the Systems and tools section.'
						)}
					</p>
				</div>{/if}
			<fieldset disabled={busy || !!savedHub} class="setup-fields">
				{#if !toolsOnly}
					<section class="setup-section" aria-labelledby="setup-name-title">
						{@render sectionHead(
							'name',
							t('ตั้งชื่อพื้นที่ทำงาน', 'Name the workspace'),
							t(
								'พื้นที่ทำงานนี้อยู่ในองค์กรปัจจุบันของคุณ ตั้งชื่อที่สมาชิกในทีมเข้าใจได้ทันที',
								'This workspace belongs to your current organization. Use a name your team will recognize.'
							)
						)}
						{@render sectionError('name')}
						<div class="setup-organization">
							<span class="setup-organization-label">{t('องค์กรปัจจุบัน', 'Current organization')}</span
							><strong>{organizationName}</strong>
						</div>
						<div class="k-field">
							<label for="hub-name">{t('ชื่อพื้นที่ทำงาน', 'Workspace name')}</label><input
								id="hub-name"
								bind:value={name}
								oninput={() => (error = '')}
								maxlength="100"
								placeholder={t('เช่น ฝ่ายบริการลูกค้า', 'For example, Customer service')}
								required
							/>
						</div>
						<div class="k-field">
							<label for="hub-description"
								>{t('คำอธิบาย', 'Description')}
								<span class="setup-optional">{t('(ไม่บังคับ)', '(optional)')}</span></label
							><textarea
								id="hub-description"
								bind:value={description}
								maxlength="500"
								rows="2"
								placeholder={t(
									'เช่น ใช้ค้นหาเอกสารและติดตามงานของทีม',
									'For example, search documents and track team tasks'
								)}
							></textarea>
						</div>
					</section>
				{/if}

				<section class="setup-section" aria-labelledby="setup-tools-title">
					{@render sectionHead(
						'tools',
						t('เลือกระบบและเครื่องมือ', 'Select systems and tools'),
						toolsOnly
							? t(
									'ปรับเครื่องมือของระบบที่เลือกไว้ โดยสมาชิกและการตั้งค่าอื่นยังคงเดิม',
									'Adjust the tools for the selected systems. Members and other settings stay the same.'
								)
							: t(
									'เลือกได้หลายระบบ เครื่องมือที่องค์กรอนุญาตไว้จะถูกเลือกให้โดยอัตโนมัติ และปรับเฉพาะสำหรับพื้นที่ทำงานนี้ได้',
									'Select one or more systems. Each starts with the tools your organization has allowed, which you can adjust for this workspace.'
								),
						selectionSummary
					)}
					{@render sectionError('tools')}
					{#if sourceIssue && !(error && errorSection === 'tools' && error === sourceIssue)}<div
							class="k-banner setup-section-error"
							role="status"
						>
							<Info size={16} aria-hidden="true" />
							<div>
								<p>{sourceIssue}</p>
								<a class="k-link-button" href={localeHref('/app?view=servers')}
									>{t('ตรวจสอบระบบ', 'Review systems')}</a
								>
							</div>
						</div>{/if}
					<p class="setup-help">
						{t(
							'พื้นที่ทำงานนี้ใช้เฉพาะเครื่องมือที่เลือกในครั้งนี้ หากระบบมีเครื่องมือใหม่ภายหลัง ต้องเลือกเพิ่มให้พื้นที่ทำงานนี้เอง',
							'This workspace includes only the tools selected now. Tools added to a system later must be added to this workspace explicitly.'
						)}
					</p>
					{#if eligibleToolCount > 5}<div class="k-field setup-tool-search">
							<label for="tool-search"
								>{t('ค้นหาเครื่องมือในทุกระบบ', 'Search tools across systems')}</label
							>
							<input
								id="tool-search"
								type="search"
								bind:value={toolQuery}
								placeholder={t('ชื่อหรือคำอธิบายเครื่องมือ', 'Tool name or description')}
							/>
						</div>{/if}

					{#if toolsOnly}
						{#each sourceGroups as group (group.connectionID)}{@render sourceTools(group)}{/each}
					{:else}
						<fieldset class="setup-source-selection">
							<legend>{t('ระบบที่เชื่อมต่อ', 'Connected systems')}</legend>
							<p class="setup-help">
								{t(
									'เลือกระบบ แล้วปรับเครื่องมือของแต่ละระบบได้ด้านล่าง',
									'Select a system, then customize its tools directly below it.'
								)}
							</p>
							<p class="setup-count-line">
								{t(
									`เลือกแล้ว ${sources.length} จาก ${maxSources} ระบบ`,
									`${sources.length} of ${maxSources} systems selected`
								)}
							</p>
							{#if !hasReadyConnection}
								<div class="setup-prerequisite">
									<span class="setup-prerequisite-icon" aria-hidden="true"><Plug size={28} /></span>
									<h3>
										{t('ยังไม่มีระบบที่พร้อมใช้งาน', 'No systems are ready yet')}
									</h3>
									<p>
										{t(
											'เชื่อมต่อระบบที่ทีมต้องใช้ แล้วตรวจสอบและเปิดใช้งานเครื่องมือ ระบบที่พร้อมใช้งานจะแสดงให้เลือกในหน้านี้',
											'Connect a system your team uses, then review and enable its tools. Ready systems will appear here for selection.'
										)}
									</p>
									<button type="button" class="k-button primary" onclick={() => sourceSetupOpen = true}
										><Plug size={16} aria-hidden="true" />{t('เชื่อมต่อระบบ', 'Connect a system')}<ChevronRight
											size={16}
											aria-hidden="true"
									/></button
									>
								</div>
							{/if}
							{#if hasReadyConnection}<button type="button" class="k-button setup-connect-more" onclick={() => sourceSetupOpen = true}>
								<Plug size={16} aria-hidden="true" />{t('เชื่อมต่อระบบเพิ่ม', 'Connect another system')}
							</button>{/if}
							{#if availableConnections.length}
								<div class="setup-choices setup-choices-single">
									{#each availableConnections as source (source.id)}
										{@const group = sourceGroups.find((item) => item.connectionID === source.id)}
										<div class="setup-app-card" class:selected={!!group}>
											<label
												class="setup-choice"
												class:selected={selectedConnectionIDs.includes(source.id)}
											>
												<input
													type="checkbox"
													name="connection"
													value={source.id}
													checked={selectedConnectionIDs.includes(source.id)}
													disabled={!selectedConnectionIDs.includes(source.id) &&
														(!connectionReady(source) || sources.length >= maxSources)}
													onchange={() => selectConnection(source.id)}
												/>
												<span class="setup-logo"><CatalogIcon name={source.name} size={20} /></span><span class="setup-choice-copy"
													><strong>{source.name}</strong>
													<p>{source.description || source.scopeNote}</p></span
												><span class="k-badge" class:active={connectionReady(source)}
													>{source.archivedAt || source.deletedAt
														? t('จัดเก็บแล้ว', 'Archived')
														: !source.enabled
															? t('ปิดใช้งาน', 'Disabled')
															: connectionReady(source)
																? t('ตรวจสอบเครื่องมือแล้ว', 'Tools reviewed')
																: t('รอตรวจสอบ', 'Needs review')}</span
												>
											</label>
											{#if group}{@render sourceTools(group)}{/if}
										</div>
									{/each}
								</div>
							{/if}
							{#each missingSources as source (source.connectionID)}
								<div class="setup-revoked-tool">
									<span
										>{t('ไม่พบระบบที่เคยเลือก', 'Selected system is unavailable')}
										<code>{source.connectionID}</code></span
									>
									<button
										type="button"
										class="k-button small"
										onclick={() => selectConnection(source.connectionID)}
										>{t('นำระบบออก', 'Remove system')}</button
									>
								</div>
							{/each}
						</fieldset>
					{/if}
					<p class="setup-help setup-help-after">
						{t(
							'ข้อมูลที่เข้าถึงได้เป็นไปตามบัญชีและสิทธิ์ของผู้ใช้ในแต่ละระบบที่เชื่อมต่อ',
							'Accessible data follows each user’s account and permissions in every connected system.'
						)}
					</p>
				</section>

				{#if !toolsOnly}
					<section class="setup-section" aria-labelledby="setup-people-title">
						{@render sectionHead(
							'people',
							t('กำหนดผู้ใช้งาน', 'Choose who can use it'),
							t(
								'เลือกวิธีเข้าสู่ระบบ จากนั้นให้สิทธิ์แก่แผนก สมาชิกรายบุคคล หรือทั้งสองแบบ',
								'Choose the sign-in method, then grant access to departments, individual members or both.'
							),
							audienceSummary
						)}
						{@render sectionError('people')}
						<div class="k-field setup-identity">
							<label for="hub-user-source">{t('วิธีเข้าสู่ระบบของสมาชิก', 'Member sign-in method')}</label>
							<select id="hub-user-source" bind:value={userSourceID} onchange={() => (error = '')}>
								<option value="">{t('บัญชี ORCA', 'ORCA account')}</option>
								{#if userSourceID && !selectedUserSource}<option value={userSourceID} disabled>{t('การเข้าสู่ระบบองค์กรเดิม', 'Previous sign-in source')}</option>{/if}
								{#each userSources.filter((source) => source.enabled || source.id === userSourceID) as source (source.id)}
									<option value={source.id} disabled={!source.enabled}>{source.name}{source.enabled ? '' : t(' · ปิดใช้งาน', ' · Disabled')}</option>
								{/each}
							</select>
							<div class="setup-identity-actions">
								<a href={localeHref('/app?view=user-sources')}>{t('จัดการการเข้าสู่ระบบองค์กร', 'Manage sign-in sources')}</a>
								{#if loadingUserSources}<span role="status">{t('กำลังโหลด…', 'Loading…')}</span>{/if}
							</div>
							{#if userSourcesError}<div class="k-banner error" role="alert"><div>{userSourcesError}<button type="button" class="k-link-button" disabled={loadingUserSources} onclick={loadUserSources}>{t('โหลดการเข้าสู่ระบบองค์กรอีกครั้ง', 'Reload sign-in sources')}</button></div></div>{/if}
						</div>
						<fieldset class="setup-audience-group">
							<legend>{t('แผนก', 'Departments')}</legend>
							<p class="setup-help">
								{t(
									'สมาชิกในแผนกที่เลือกจะได้รับสิทธิ์โดยอัตโนมัติ และสิทธิ์จะสิ้นสุดเมื่อย้ายออกจากแผนกหรือถูกระงับ แผนกที่ยังไม่มีสมาชิกสามารถเลือกไว้ก่อนได้',
									'Active department members receive access automatically. Leaving the department or being suspended ends that access. You can also select departments that are currently empty.'
								)}
							</p>
							<div class="setup-choices">
								{#each availableDepartments as unit (unit.id)}
									<label class="setup-choice" class:selected={accessUnitIDs.includes(unit.id)}
										><input
											type="checkbox"
											checked={accessUnitIDs.includes(unit.id)}
											disabled={!accessUnitIDs.includes(unit.id) && !departmentActive(unit)}
											onchange={() => toggleDepartment(unit.id)}
										/><span class="setup-choice-copy"
											><strong>{unit.name}</strong>
											<p>
												{departmentActive(unit)
													? t('สิทธิ์เป็นไปตามสมาชิกในแผนก', 'Access follows department membership')
													: t(
															'แผนกนี้ไม่พร้อมใช้งาน กรุณานำออกก่อนบันทึก',
															'This department is unavailable. Remove it before saving.'
														)}
											</p></span
										></label
									>
								{:else}<p class="setup-empty-choice">
										{t(
											'ยังไม่มีแผนก เลือกสมาชิกรายบุคคลด้านล่างได้',
											'No departments yet. You can select individual members below.'
										)}
									</p>{/each}
							</div>
							{#each missingDepartmentIDs as id (id)}<div class="setup-revoked-tool">
									<span
										>{t('ไม่พบแผนกที่เคยเลือก', 'Selected department is unavailable')}
										<code>{id}</code></span
									><button type="button" class="k-button small" onclick={() => toggleDepartment(id)}
										>{t('นำแผนกออก', 'Remove department')}</button
									>
								</div>{/each}
						</fieldset>
						<fieldset class="setup-audience-group">
							<legend class="sr-only">{t('สมาชิกรายบุคคล', 'Individual members')}</legend>
							<div class="setup-group-head">
								<h3>{t('สมาชิกรายบุคคล', 'Individual members')}</h3>
								<span class="setup-count"
									>{t(`เลือกแล้ว ${memberIDs.length} คน`, `${memberIDs.length} selected`)}</span
								>
							</div>
							{#if currentMember}<div class="setup-my-membership">
									<div>
										<strong
											>{t('ใช้พื้นที่ทำงานนี้ด้วยบัญชีของคุณ', 'Use this workspace yourself')}</strong
										>
										<p>
											{t(
												'เพิ่มตัวเองเป็นสมาชิกเพื่อจัดการความรู้และเชื่อมแอป AI กับพื้นที่ทำงานนี้',
												'Add yourself as a member to manage knowledge and connect your AI app to this workspace.'
											)}
										</p>
									</div>
									<button
										type="button"
										class="k-button small"
										aria-pressed={memberIDs.includes(currentMember.id)}
										onclick={toggleMyMembership}
									>
										{#if memberIDs.includes(currentMember.id)}<Check size={16} aria-hidden="true" />{:else}<Users
												size={16}
												aria-hidden="true"
											/>{/if}
										{memberIDs.includes(currentMember.id)
											? t('นำตัวเองออกจากสมาชิก', 'Remove me as a member')
											: t('เพิ่มตัวเองเป็นสมาชิก', 'Add me as a member')}
									</button>
								</div>{/if}
							<div class="k-field setup-search-field">
								<label for="member-search"
									>{t('ค้นหาสมาชิก', 'Search members')}</label
								><input
									id="member-search"
									type="search"
									bind:value={query}
									placeholder={t('ชื่อหรืออีเมล', 'Name or email')}
								/>
							</div>
							<div class="setup-choices">
								{#each visibleMembers as member (member.id)}
									<label class="setup-choice" class:selected={memberIDs.includes(member.id)}
										><input
											type="checkbox"
											checked={memberIDs.includes(member.id)}
											disabled={!memberIDs.includes(member.id) && !memberActive(member.status)}
											onchange={() => toggleMember(member.id)}
										/><span class="setup-choice-copy"
											><strong
												>{memberName(member)}{member.id === data.currentUserID
													? t(' (คุณ)', ' (you)')
													: ''}</strong
											>
											<p>{member.email}</p>
											{#if !memberActive(member.status)}<span class="k-badge"
													>{t(
														'สมาชิกถูกระงับหรือนำออกแล้ว กรุณานำออกก่อนบันทึก',
														'Suspended or removed. Remove before saving.'
													)}</span
												>{/if}</span
										></label
									>
								{:else}<p class="setup-empty-choice">
										{t('ไม่พบสมาชิกที่ตรงกับคำค้น', 'No members match your search.')}
									</p>{/each}
							</div>
							<p class="setup-help setup-help-after">
								{t(
									'เจ้าของระบบและผู้ดูแลระบบต้องได้รับสิทธิ์ในฐานะสมาชิกรายบุคคลหรือผ่านแผนกที่เลือกเช่นกัน จึงจะใช้พื้นที่ทำงานนี้ได้ การเปลี่ยนแปลงสิทธิ์มีผลเมื่อสมาชิกเรียกใช้งานครั้งถัดไป',
									'Owners and admins also need access as an individual member or through a selected department to use this workspace. Access changes apply from each member’s next call.'
								)}
							</p>
							{#each missingMemberIDs as id (id)}
								<div class="setup-revoked-tool">
									<span
										>{t('ไม่พบสมาชิกที่เคยเลือก', 'Selected member is unavailable')}
										<code>{id}</code></span
									><button type="button" class="k-button small" onclick={() => toggleMember(id)}
										>{t('นำสมาชิกออก', 'Remove member')}</button
									>
								</div>
							{/each}
						</fieldset>
					</section>

					<section class="setup-section" aria-labelledby="setup-ai-title">
						{@render sectionHead(
							'ai',
							t('บอกวิธีทำงานให้ AI', 'Guide how AI works here'),
							t(
								'เลือกว่างานที่แก้ไขข้อมูลต้องรอผู้ดูแลอนุมัติหรือไม่ และเขียนคำแนะนำที่แอป AI จะได้รับเมื่อเชื่อมต่อ',
								'Choose whether actions that change data wait for a manager, and write guidance AI apps receive when they connect.'
							),
							'',
							true
						)}
						<fieldset class="setup-audience-group">
							<legend>{t('การแก้ไขข้อมูลในระบบ', 'Changes to your systems')}</legend>
							<p class="setup-help">
								{t(
									'งานที่อาจแก้ไขข้อมูล เช่น สร้างใบเสนอราคาหรือส่งอีเมล ส่วนการอ่านข้อมูลทำได้ทันทีเสมอ',
									'Actions that may change data, such as creating a quotation or sending an email. Reading data always runs at once.'
								)}
							</p>
							<div class="setup-choices">
								<label class="setup-choice" class:selected={writeMode === 'direct'}
									><input type="radio" name="write-mode" value="direct" bind:group={writeMode} /><span
										class="setup-choice-copy"
										><strong>{t('ทำงานทันที', 'Run at once')}</strong>
										<p>{t('แอป AI ใช้เครื่องมือที่อนุญาตได้เลย', 'AI apps use the allowed tools right away.')}</p></span
									></label
								>
								<label class="setup-choice" class:selected={writeMode === 'approval'}
									><input type="radio" name="write-mode" value="approval" bind:group={writeMode} /><span
										class="setup-choice-copy"
										><strong>{t('ผู้ดูแลอนุมัติก่อน', 'A manager approves first')}</strong>
										<p>
											{t(
												'งานที่แก้ไขข้อมูลจะรอในกล่องอนุมัติ แล้ว ORCA จึงทำด้วยบัญชีของผู้ขอ',
												'Actions that change data wait in Approvals, then ORCA runs them with the requester’s account.'
											)}
										</p></span
									></label
								>
							</div>
							{#if writeMode === 'approval' && allReadOnly}<p class="setup-help setup-help-after">
									{t(
										'ทุกระบบที่เลือกถูกตรวจว่าอ่านอย่างเดียว จึงยังไม่มีงานที่ต้องอนุมัติ',
										'Every selected system is reviewed as read-only, so nothing needs approval yet.'
									)}
								</p>{/if}
						</fieldset>
						<div class="k-field setup-guidance">
							<label for="hub-guidance"
								>{t('คำแนะนำสำหรับ AI', 'Guidance for AI')}
								<span class="setup-optional">{t('(ไม่บังคับ)', '(optional)')}</span></label
							><textarea
								id="hub-guidance"
								bind:value={instructions}
								maxlength="4000"
								rows="4"
								placeholder={t(
									'เช่น ตอบเป็นภาษาไทย อ้างเลขที่เอกสารทุกครั้ง และสรุปยอดเป็นบาท',
									'For example: reply in Thai, cite document numbers, and total amounts in baht.'
								)}
							></textarea><span class="setup-field-help"
								>{t(
									'ส่งให้แอป AI ทุกครั้งที่เชื่อมต่อ ใช้บอกวิธีทำงาน ข้อความนี้ไม่เพิ่มสิทธิ์ใด ๆ',
									'Sent to AI apps each time they connect, to explain how to work. It never adds permissions.'
								)} · {instructions.length.toLocaleString('th-TH')}/4,000</span
							>
						</div>
					</section>

					<details class="setup-advanced" bind:open={advancedOpen}>
						<summary
							>{t('ตั้งค่าขั้นสูง', 'Advanced settings')}<span
								>{t(
									`เพดาน ${(dailyLimit ?? 0).toLocaleString('th-TH')} ครั้งต่อวัน · ${statusLabel}`,
									`${(dailyLimit ?? 0).toLocaleString('en-US')} calls a day · ${statusLabel}`
								)}</span
							></summary
						>
						<div class="setup-advanced-body">
							{@render sectionError('advanced')}
							<div class="setup-limit-grid">
								<div class="k-field">
									<label for="daily-limit">{t('เพดานการใช้งานต่อวัน', 'Daily limit')}</label><input
										id="daily-limit"
										type="number"
										min="1"
										max="1000000"
										step="1"
										bind:value={dailyLimit}
										oninput={() => (error = '')}
										required
									/><span class="setup-field-help"
										>{t(
											'สมาชิกทุกคนในพื้นที่ทำงานใช้ร่วมกัน · เริ่มนับใหม่ทุกเที่ยงคืนตามเวลาประเทศไทย',
											'Shared by all workspace members · resets at midnight Bangkok time'
										)}</span
									>
								</div>
								<div class="k-field setup-status-field">
									<label for="hub-status">{t('สถานะหลังบันทึก', 'Status after saving')}</label><select
										id="hub-status"
										bind:value={status}
										><option value="active"
											>{t(
												'เปิดใช้งาน (สมาชิกเชื่อมแอป AI ได้ทันที)',
												'Active (members can connect their AI apps)'
											)}</option
										><option value="draft"
											>{t(
												'ฉบับร่าง (ยังเข้าถึงข้อมูลไม่ได้)',
												'Draft (data is not accessible yet)'
											)}</option
										>{#if existing}<option value="paused">{t('ระงับการใช้งาน', 'Paused')}</option
											>{/if}</select
									>
								</div>
							</div>
						</div>
					</details>
				{/if}
			</fieldset>
			{#if error && (errorSection === 'form' || errorSection === 'elsewhere')}<div
					class="k-banner error setup-form-error"
					role="alert"
					data-setup-error
					tabindex="-1"
				>
					<Info size={16} aria-hidden="true" />
					<div>
						{error}
						<div class="k-actions">
							{#if versionConflict && editingID}
								<a
									class="k-link-button"
									href={localeHref(`/app?view=hub&hub=${encodeURIComponent(editingID)}`)}
									>{t('ยกเลิกและกลับไปที่พื้นที่ทำงาน', 'Cancel and return to the workspace')}</a
								>
							{:else if errorSection === 'elsewhere' && editingID}
								<a
									class="k-link-button"
									href={localeHref(`/app?view=new&edit=${encodeURIComponent(editingID)}`)}
									>{t('เปิดหน้าแก้ไขทั้งหมด', 'Open the full editor')}</a
								>
							{:else if !savedHub}
								<button type="button" class="k-link-button" disabled={busy} onclick={onreload}
									>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button
								>
							{/if}
						</div>
					</div>
				</div>{/if}
			<div class="setup-actions">
				<a
					class="k-button"
					href={localeHref(
						existing
							? `/app?view=hub&hub=${encodeURIComponent(existing.id)}${toolsOnly ? '&tab=tools' : ''}`
							: '/app?view=workspaces'
					)}>{t('ยกเลิก', 'Cancel')}</a
				>
				<p class="setup-actions-summary">
					{toolsOnly ? selectionSummary : `${selectionSummary} · ${audienceSummary}`}
				</p>
				<button type="submit" class="k-button primary" disabled={busy}
					>{busy
						? t('กำลังบันทึก…', 'Saving…')
						: savedHub
							? t('เปิดพื้นที่ทำงานที่บันทึกแล้ว', 'Open saved workspace')
							: existing
								? t('บันทึกการเปลี่ยนแปลง', 'Save changes')
								: status === 'active'
									? t('สร้างและเปิดใช้งาน', 'Create and activate')
									: t('บันทึกฉบับร่าง', 'Save draft')}
					<Check size={16} aria-hidden="true" /></button
				>
			</div>
		</form>
		<aside class="setup-summary" aria-label={t('สรุปพื้นที่ทำงาน', 'Workspace summary')}>
			<div class="setup-summary-header">
				<span class="setup-summary-icon" aria-hidden="true"><Folder size={18} /></span>
				<h2>{t('สรุปพื้นที่ทำงาน AI', 'AI workspace summary')}</h2>
			</div>
			<div class="setup-summary-identity">
				<p class="setup-summary-name">
					{name.trim() || t('พื้นที่ทำงาน AI ใหม่', 'New AI workspace')}
				</p>
				<p class="setup-summary-description">{organizationName}</p>
				{#if description.trim()}<p class="setup-summary-description">
						{description.trim()}
					</p>{/if}
			</div>
			<dl>
				<div class="setup-summary-row">
					<span class="setup-summary-tile" aria-hidden="true"><Plug size={16} /></span>
					<dt>{t('ระบบ:', 'Systems:')}</dt>
					<dd>
						{sourceGroups
							.map(
								(source) =>
									source.connection?.name || t('ระบบที่ไม่พร้อมใช้งาน', 'Unavailable system')
							)
							.join(', ') || t('ยังไม่ได้เลือก', 'Not selected')}
					</dd>
				</div>
				<div class="setup-summary-row">
					<span class="setup-summary-tile" aria-hidden="true"><Folder size={16} /></span>
					<dt>{t('เครื่องมือ:', 'Tools:')}</dt>
					<dd>
						{selectedToolCount
							? t(`${selectedToolCount} รายการ`, `${selectedToolCount} selected`)
							: t('ยังไม่ได้เลือก', 'Not selected')}
					</dd>
				</div>
				<div class="setup-summary-row">
					<span class="setup-summary-tile" aria-hidden="true"><FileCheck2 size={16} /></span>
					<dt>{t('สิทธิ์:', 'Access:')}</dt>
					<dd>{toolAccessLabel}</dd>
				</div>
				<div class="setup-summary-row">
					<span class="setup-summary-tile" aria-hidden="true"><Users size={16} /></span>
					<dt>{t('สมาชิกและแผนก:', 'Members and departments:')}</dt>
					<dd>
						{memberIDs.length || accessUnitIDs.length
							? audienceSummary
							: t('เลือกในส่วนกำหนดผู้ใช้งาน', 'Choose in the people section')}
					</dd>
				</div>
				<div class="setup-summary-row">
					<span class="setup-summary-tile" aria-hidden="true"><ShieldCheck size={16} /></span>
					<dt>{t('การแก้ไขข้อมูล:', 'Changes to data:')}</dt>
					<dd>
						{writeMode === 'approval'
							? t('ผู้ดูแลอนุมัติก่อน', 'A manager approves first')
							: t('ทำงานทันที', 'Run at once')}
					</dd>
				</div>
			</dl>
			<p class="setup-summary-note">
				{t(
					'แอป AI เข้าถึงข้อมูลผ่านพื้นที่ทำงานนี้ตามสิทธิ์ของสมาชิกแต่ละคน',
					'AI apps access data through this workspace according to each member’s own permissions.'
				)}
			</p>
		</aside>
	</div>
</div>

{#if sourceSetupOpen}
	<ConnectionSetupDialog {data} onclose={() => sourceSetupOpen = false} oncompleted={sourceSetupCompleted} />
{/if}

<style>
	.workspace-setup {
		--setup-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		--setup-mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		--setup-warn-line: color-mix(in srgb, var(--orca-warn) 22%, var(--orca-warn-bg));
		min-width: 0;
		color: var(--orca-ink);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* ---------- Layout ---------- */
	.setup-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		align-items: start;
		gap: 20px;
	}
	.setup-main,
	.setup-summary {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}

	/* ---------- Form body ---------- */
	.setup-main > .k-banner {
		margin: 16px 20px 0;
	}
	.setup-fields {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	/* ---------- Numbered sections ---------- */
	.setup-section {
		min-width: 0;
		padding: 24px 24px 28px;
	}
	.setup-section + .setup-section {
		border-top: 1px solid var(--orca-line);
	}
	.setup-section-head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 18px;
	}
	.setup-section-number {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		margin-top: 1px;
		border-radius: 50%;
		background: var(--orca-ink);
		color: #fff;
		font-size: 13px;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.setup-section-copy {
		flex: 1 1 auto;
		min-width: 0;
	}
	.setup-section-copy h2 {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.setup-section-description {
		max-width: 72ch;
		margin-top: 4px;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.65;
	}
	.setup-section-head > .setup-count {
		flex: none;
		margin-top: 4px;
	}
	.workspace-setup .setup-section-error {
		margin: 0 0 16px;
	}
	.setup-guidance {
		margin-top: 20px;
	}
	.setup-guidance textarea {
		min-height: 104px;
		resize: vertical;
	}
	/* ---------- Advanced settings ---------- */
	.setup-advanced {
		border-top: 1px solid var(--orca-line);
	}
	.setup-advanced > summary {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 16px 24px;
		font-size: 14.5px;
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}
	.setup-advanced > summary::-webkit-details-marker {
		display: none;
	}
	.setup-advanced > summary::before {
		content: '';
		flex: none;
		width: 16px;
		height: 16px;
		background-color: var(--orca-subtle);
		-webkit-mask: var(--setup-chevron) center / 16px 16px no-repeat;
		mask: var(--setup-chevron) center / 16px 16px no-repeat;
		transform: rotate(-90deg);
		transition: transform 0.15s;
	}
	.setup-advanced[open] > summary::before {
		transform: none;
	}
	.setup-advanced > summary:hover {
		background: var(--orca-surface-2);
	}
	.setup-advanced > summary span {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 400;
	}
	.setup-advanced-body {
		padding: 0 24px 24px;
	}
	.setup-help {
		margin: 4px 0 12px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.65;
	}
	.setup-help-after {
		margin: 12px 0 0;
	}
	.setup-group-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 12px;
		margin-bottom: 4px;
	}
	.setup-group-head h3 {
		margin: 0;
	}
	.setup-count {
		display: inline-flex;
		align-items: center;
		padding: 1px 8px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
		line-height: 1.6;
		white-space: nowrap;
	}
	.setup-count-line {
		margin-bottom: 12px;
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
	.setup-field-help {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.55;
	}
	.setup-optional {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 400;
	}

	/* ---------- Step 1 ---------- */
	.setup-organization {
		display: grid;
		gap: 6px;
		margin-bottom: 16px;
	}
	.setup-organization-label {
		font-size: 13.5px;
		font-weight: 600;
	}
	/* The organization is fixed, so it reads as a read-only field. */
	.setup-organization strong {
		display: flex;
		align-items: center;
		min-height: 36px;
		padding: 0 11px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		font-size: 14px;
		font-weight: 500;
	}

	/* ---------- Step 2 ---------- */
	.setup-identity {
		margin-bottom: 24px;
	}
	.setup-identity select {
		max-width: 480px;
	}
	.setup-identity-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		font-size: 13px;
	}
	.setup-identity-actions a {
		color: var(--orca-ink);
		font-weight: 500;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}
	.setup-identity-actions span {
		color: var(--orca-muted);
	}
	.setup-identity .k-banner {
		margin: 8px 0 0;
	}
	.setup-audience-group {
		min-width: 0;
		margin: 0 0 24px;
		padding: 0;
		border: 0;
	}
	.setup-audience-group:last-child {
		margin-bottom: 0;
	}
	.setup-audience-group > legend {
		margin: 0 0 2px;
		padding: 0;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.setup-my-membership {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
		margin: 8px 0 16px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
	}
	.setup-my-membership strong {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
	}
	.setup-my-membership p {
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.setup-my-membership .k-button {
		flex-shrink: 0;
	}
	.setup-search-field {
		margin-bottom: 12px;
	}
	.setup-search-field input,
	.setup-tool-search input {
		max-width: 420px;
	}

	/* ---------- Choice cards ---------- */
	.setup-choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 8px;
	}
	.setup-choices-single {
		grid-template-columns: minmax(0, 1fr);
	}
	.setup-choice {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-width: 0;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		cursor: pointer;
		transition:
			border-color 0.12s,
			background-color 0.12s;
	}
	.setup-choice:hover {
		border-color: var(--orca-line-strong);
	}
	.setup-choice.selected {
		border-color: var(--orca-ink);
		background: var(--orca-citron-soft);
	}
	.setup-choice:has(input:disabled) {
		background: var(--orca-surface-2);
		cursor: not-allowed;
	}
	.setup-choice input {
		flex: none;
		margin: 2px 0 0;
	}
	.setup-choice-copy {
		flex: 1;
		min-width: 0;
	}
	.setup-choice-copy strong {
		display: block;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.setup-choice-copy p {
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.setup-choice-copy .k-badge {
		margin-top: 6px;
		white-space: normal;
	}
	.setup-empty-choice {
		grid-column: 1 / -1;
		padding: 14px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius);
		color: var(--orca-muted);
		font-size: 13.5px;
		text-align: center;
	}
	.setup-revoked-tool {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 12px;
		font-size: 13px;
	}
	.setup-audience-group > .setup-revoked-tool,
	.setup-source-selection > .setup-revoked-tool {
		margin-top: 8px;
		padding: 8px 12px;
		border: 1px solid var(--setup-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
	}
	.setup-revoked-tool code {
		color: var(--orca-nav);
		font-family: var(--setup-mono);
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	/* ---------- Step 3 ---------- */
	.setup-tool-search {
		margin: 4px 0 16px;
	}
	.setup-source-selection {
		min-width: 0;
		margin: 16px 0 0;
		padding: 0;
		border: 0;
	}
	.setup-source-selection > legend {
		margin: 0 0 2px;
		padding: 0;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.setup-connect-more {
		margin-bottom: 12px;
	}
	.setup-app-card {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.setup-app-card.selected {
		border-color: var(--orca-ink);
	}
	.setup-app-card > .setup-choice {
		align-items: center;
		border: 0;
		border-radius: 0;
	}
	.setup-app-card > .setup-choice .k-badge {
		flex: none;
	}
	.setup-logo {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		overflow: hidden;
	}
	.setup-prerequisite {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		padding: 32px 24px;
		border: 1px dashed var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		text-align: center;
	}
	.setup-prerequisite-icon {
		display: inline-flex;
		color: var(--orca-subtle);
	}
	.setup-prerequisite h3 {
		margin: 4px 0 0;
		font-size: 15px;
	}
	.setup-prerequisite > p {
		max-width: 46ch;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.65;
	}
	.setup-prerequisite .k-button {
		margin-top: 8px;
	}

	/* Tools of one system: a card of its own when editing tools only, a section inside the system card otherwise. */
	.setup-source-tools {
		min-width: 0;
		margin: 0 0 16px;
		padding: 14px 16px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
	}
	.setup-source-tools > legend {
		float: left;
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		margin: 0 0 10px;
		padding: 0;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.setup-source-tools > legend + * {
		clear: both;
	}
	.setup-source-tools > legend :global(svg) {
		flex-shrink: 0;
		color: var(--orca-subtle);
	}
	.setup-app-card .setup-source-tools {
		margin: 0;
		border: 0;
		border-top: 1px solid var(--orca-line);
		border-radius: 0;
	}
	/* Inside a system card the card header already names the system. */
	.setup-app-card .setup-source-tools > legend {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.setup-scope-note {
		margin-bottom: 12px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.65;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.setup-tool-preset {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 16px;
	}
	.setup-tool-selection {
		font-size: 13.5px;
		font-weight: 500;
	}
	.workspace-setup .setup-use-approved {
		max-width: 100%;
		white-space: normal;
		text-align: start;
	}
	.setup-use-approved :global(svg) {
		flex-shrink: 0;
	}
	.setup-revoked-tools {
		margin-top: 12px;
		padding: 12px 14px;
		border: 1px solid var(--setup-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
	}
	.setup-revoked-tools h3 {
		margin: 0;
		font-size: 14px;
	}
	.setup-revoked-tools p {
		margin: 2px 0 4px;
		color: var(--orca-nav);
		font-size: 13px;
		line-height: 1.6;
	}
	.setup-revoked-tools .setup-revoked-tool {
		padding-top: 8px;
	}
	.setup-revoked-tool strong {
		min-width: 0;
		font-size: 13.5px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.setup-custom-tools {
		margin-top: 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
	}
	.setup-custom-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		min-height: 40px;
		padding: 8px 12px 8px 14px;
		border: 0;
		border-radius: var(--orca-radius);
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: start;
		cursor: pointer;
	}
	.setup-custom-toggle::after {
		content: '';
		flex: none;
		width: 16px;
		height: 16px;
		background-color: var(--orca-subtle);
		-webkit-mask: var(--setup-chevron) center / 16px 16px no-repeat;
		mask: var(--setup-chevron) center / 16px 16px no-repeat;
		transition: transform 0.15s;
	}
	.setup-custom-toggle:hover {
		background: var(--orca-surface-2);
	}
	.setup-custom-toggle:focus-visible {
		outline-offset: -2px;
	}
	.setup-custom-toggle[aria-expanded='true'] {
		border-bottom: 1px solid var(--orca-line);
		border-radius: var(--orca-radius) var(--orca-radius) 0 0;
	}
	.setup-custom-toggle[aria-expanded='true']::after {
		transform: rotate(180deg);
	}
	.setup-custom-body {
		padding: 12px 14px 14px;
	}
	.setup-tool-identifier {
		display: block;
		margin-top: 2px;
		color: var(--orca-subtle);
		font-family: var(--setup-mono);
		font-size: 12px;
		font-weight: 400;
		overflow-wrap: anywhere;
	}

	/* ---------- Step 4 ---------- */
	.setup-limit-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: 16px;
	}
	.setup-limit-grid input {
		max-width: 240px;
	}
	.setup-status-field select {
		max-width: 480px;
	}
	/* ---------- Footer ---------- */
	.setup-main > .setup-form-error {
		margin: 0 24px 16px;
	}
	/* The create button stays in reach while the page scrolls, like Arcade's footer. */
	.setup-actions {
		position: sticky;
		bottom: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 24px;
		border-top: 1px solid var(--orca-line);
		border-radius: 0 0 var(--orca-radius-lg) var(--orca-radius-lg);
		background: var(--orca-surface);
		box-shadow: 0 -6px 16px -12px rgba(21, 24, 35, 0.35);
	}
	.setup-actions .k-button {
		flex: none;
		min-width: 96px;
	}
	.setup-actions-summary {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 13px;
		text-align: end;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ---------- Summary ---------- */
	.setup-summary {
		position: sticky;
		top: calc(var(--k-header, 56px) + 24px);
		overflow: hidden;
	}
	.setup-summary-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px 18px 10px;
	}
	.setup-summary-header h2 {
		margin: 0;
	}
	.setup-summary-icon {
		display: inline-flex;
		color: var(--orca-subtle);
	}
	.setup-summary-identity {
		padding: 0 18px 14px;
	}
	.setup-summary-name {
		font-size: 15px;
		font-weight: 600;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.setup-summary-description {
		margin-top: 2px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.setup-summary dl {
		margin: 0;
		border-top: 1px solid var(--orca-line);
	}
	.setup-summary-row {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		align-items: center;
		gap: 0 12px;
		padding: 10px 18px;
	}
	.setup-summary-row + .setup-summary-row {
		border-top: 1px solid #eff0f2;
	}
	.setup-summary-tile {
		grid-row: span 2;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: var(--orca-radius);
		background: var(--orca-secondary);
		color: var(--orca-nav);
	}
	.setup-summary dt {
		min-width: 0;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.setup-summary dd {
		min-width: 0;
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.setup-summary-note {
		padding: 12px 18px 14px;
		border-top: 1px solid var(--orca-line);
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.6;
	}

	/* ---------- Responsive ---------- */
	@media (max-width: 1200px) {
		.setup-layout {
			grid-template-columns: minmax(0, 1fr) 260px;
			gap: 16px;
		}
	}
	@media (max-width: 1050px) {
		.setup-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.setup-summary {
			position: static;
		}
		.setup-summary dl {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.setup-summary-row + .setup-summary-row {
			border-top: 0;
		}
		.setup-summary dl > .setup-summary-row:nth-child(n + 3) {
			border-top: 1px solid #eff0f2;
		}
	}
	@media (max-width: 760px) {
		.setup-main > .k-banner {
			margin: 12px 16px 0;
		}
		.setup-section {
			padding: 20px 16px 24px;
		}
		/* Each section repeats its own count below, so phones keep the title beside its number. */
		.setup-section-head > .setup-count {
			display: none;
		}
		.setup-advanced > summary {
			padding: 14px 16px;
		}
		.setup-advanced-body {
			padding: 0 16px 20px;
		}
		.setup-main > .setup-form-error {
			margin: 0 16px 12px;
		}
		.setup-actions {
			padding: 12px 16px;
		}
		.setup-actions-summary {
			display: none;
		}
		.setup-actions .k-button.primary {
			flex: 1;
		}
		.setup-choices,
		.setup-limit-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.setup-source-tools {
			padding-inline: 14px;
		}
		/* The status badge moves under the system's name instead of squeezing it. */
		.setup-app-card > .setup-choice {
			display: grid;
			grid-template-columns: auto auto minmax(0, 1fr);
			row-gap: 6px;
		}
		.setup-app-card > .setup-choice .k-badge {
			grid-column: 3;
			justify-self: start;
		}
		.setup-my-membership {
			flex-direction: column;
			align-items: stretch;
		}
		.setup-prerequisite {
			padding: 24px 16px;
		}
		.setup-prerequisite .k-button {
			width: 100%;
		}
		.setup-summary dl {
			grid-template-columns: minmax(0, 1fr);
		}
		.setup-summary dl > .setup-summary-row:nth-child(n + 2) {
			border-top: 1px solid #eff0f2;
		}
	}
</style>
