<script lang="ts">
	import { connectionReady } from '$lib/orca/activation';
	import { unavailableGatewayTools } from '$lib/orca/gateway-tool-selection';
	import { t, localeHref } from '$lib/orca/locale.svelte';
	import {
		OrcaService,
		orcaError,
		memberName,
		unitLabels,
		type OrcaBootstrap,
		type OrcaHub,
		type HubInput,
		type HubStatus
	} from '$lib/services/orca';
	import {
		Check,
		ChevronLeft,
		ChevronRight,
		FileCheck2,
		Folder,
		Info,
		Plug,
		Users
	} from '@lucide/svelte';
	import { tick, untrack } from 'svelte';

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
	const flowSteps = toolsOnly ? [2, 4] : [1, 2, 3, 4];
	const requestedConnectionID = untrack(() => (existing ? '' : initialConnectionID));
	let initialSelection = $state(Boolean(requestedConnectionID));
	let step = $state(toolsOnly ? 2 : 1);
	let name = $state(untrack(() => existing?.name ?? ''));
	let description = $state(untrack(() => existing?.description ?? ''));
	let connectionID = $state(
		untrack(() => {
			if (existing) return existing.connectionID;
			const requested = data.connections.find((item) => item.id === requestedConnectionID);
			return requested && connectionReady(requested) ? requested.id : '';
		})
	);
	let toolNames = $state<string[]>(untrack(() => [...(existing?.toolNames ?? [])]));
	let memberIDs = $state<string[]>(untrack(() => [...(existing?.memberIDs ?? [])]));
	let unitIDs = $state<string[]>(untrack(() => [...(existing?.unitIDs ?? [])]));
	let dailyLimit = $state<number | undefined>(untrack(() => existing?.dailyLimit ?? 100));
	let status = $state<HubStatus>(untrack(() => existing?.status ?? 'active'));
	let query = $state('');
	let toolQuery = $state('');
	let customToolsOpen = $state(false);
	let error = $state('');
	let busy = $state(false);
	let reviewed = $state(false);
	let title: HTMLHeadingElement | undefined = $state();
	let stepList: HTMLOListElement | undefined = $state();
	const steps = $derived([
		t('ข้อมูล Gateway', 'Gateway'),
		t('เครื่องมือ', 'Tools'),
		t('สมาชิก', 'Members'),
		t('ตรวจสอบ', 'Review')
	]);
	const stepTitles = $derived([
		t('เริ่มจากงานที่ทีมต้องใช้', 'Start with your team’s work'),
		t('กำหนดเครื่องมือที่ใช้ได้', 'Choose the tools your team can use'),
		t('ให้สิทธิ์กับคนในทีม', 'Give the right people access'),
		t('ตรวจสอบก่อนบันทึก', 'Review your Gateway')
	]);
	const stepDescriptions = $derived([
		t(
			'ตั้งชื่อให้ทีมเข้าใจ แล้วเลือกหนึ่งระบบสำหรับ Gateway นี้',
			'Give your Gateway a clear name and choose one connected source.'
		),
		toolsOnly ? t(
			'เลือกเครื่องมือที่ทีมต้องใช้ โดยคงจำนวนครั้งต่อวันและการตั้งค่าอื่นไว้',
			'Select the tools your team needs. The daily limit and other settings stay the same.'
		) : t(
			'ใช้ชุดเครื่องมือที่องค์กรอนุญาตไว้ได้ทันที หรือเลือกเฉพาะรายการให้ Gateway นี้',
			'Use the organization’s approved tool set, or choose a smaller set for this Gateway.'
		),
		t(
			'เฉพาะสมาชิกที่เลือกเท่านั้นจึงจะใช้เครื่องมือใน Gateway นี้ได้',
			'Only the people you select can use this Gateway’s tools.'
		),
		toolsOnly ? t(
			'ตรวจสอบรายการเครื่องมือก่อนบันทึก สมาชิก หน่วยงาน และสถานะจะคงเดิม',
			'Review the selected tools before saving. Members, departments and status stay the same.'
		) : t(
			'ตรวจระบบ เครื่องมือ และสมาชิกให้ครบ แล้วเลือกว่าจะเปิดใช้งานหรือเก็บเป็นฉบับร่าง',
			'Check the source, tools and members, then activate the Gateway or save it as a draft.'
		)
	]);
	const connection = $derived(data.connections.find((item) => item.id === connectionID));
	const unavailableTools = $derived(unavailableGatewayTools(connection, toolNames));
	const toolAccessLabel = $derived(
		!connection
			? t('ยังไม่ได้เลือกระบบ', 'No source selected')
			: connection.reviewedReadOnly
				? t('อ่านข้อมูลเท่านั้น', 'Read only')
				: connection.reviewedTools
					? t('เครื่องมือที่เลือก', 'Selected tools')
					: t('รอตรวจเครื่องมือ', 'Needs tool review')
	);
	const sourceLinkChanged = $derived(!editingID && initialConnectionID !== requestedConnectionID);
	const currentMember = $derived(data.members.find((item) => item.id === data.currentUserID));
	const sourceIssue = $derived.by(() => {
		const requested = connectionID || (initialSelection ? requestedConnectionID : '');
		if (!requested) return '';
		const source = data.connections.find((item) => item.id === requested);
		if (!source)
			return t(
				'ไม่พบระบบที่เลือก หรือบัญชีของคุณไม่มีสิทธิ์ใช้ระบบนี้ กรุณาเลือกระบบอีกครั้ง',
				'The selected source was not found or is not accessible to your account. Choose a source again.'
			);
		if (!source.enabled)
			return t(
				'ระบบที่เลือกถูกปิดใช้งาน เปิดใช้งานที่หน้าระบบที่เชื่อมต่อ หรือเลือกระบบอื่นก่อนดำเนินการต่อ',
				'The selected source is disabled. Enable it in Servers or choose another source to continue.'
			);
		if (!connectionReady(source))
			return t(
				'ระบบที่เลือกยังไม่มีรายการเครื่องมือที่ตรวจสอบครบแล้ว กรุณาตรวจสอบการเชื่อมต่อก่อน หรือเลือกระบบอื่น',
				'The selected source does not have a complete set of reviewed tools. Review the connection or choose another source.'
			);
		if (!connectionID)
			return t(
				'ระบบที่ระบุพร้อมให้เลือกแล้ว กรุณาเลือกระบบด้านล่างเพื่อใช้กับ Gateway นี้',
				'The requested source is now available. Select it below to use it in this Gateway.'
			);
		return '';
	});
	const availableConnections = $derived(
		data.connections.filter(
			(item) =>
				connectionReady(item) ||
				item.id === connectionID ||
				(initialSelection && item.id === requestedConnectionID)
		)
	);
	const hasReadyConnection = $derived(availableConnections.some(connectionReady));
	const visibleMembers = $derived(
		data.members.filter((item) =>
			`${memberName(item)} ${item.email}`.toLowerCase().includes(query.toLowerCase())
		)
	);
	const eligibleTools = $derived(
		connectionReady(connection)
			? (connection?.tools ?? []).filter((item) => connection?.toolNames.includes(item.name))
			: []
	);
	const allApprovedSelected = $derived(
		eligibleTools.length > 0 && eligibleTools.every((tool) => toolNames.includes(tool.name))
	);
	const selectedEligibleCount = $derived(
		eligibleTools.filter((tool) => toolNames.includes(tool.name)).length
	);
	const visibleTools = $derived(
		eligibleTools.filter((item) =>
			`${item.name} ${item.description ?? ''}`.toLowerCase().includes(toolQuery.toLowerCase())
		)
	);

	function selectAllApprovedTools() {
		if (busy || sourceIssue || !eligibleTools.length || allApprovedSelected) return;
		// Keep revoked selections visible until explicitly removed; copy today's allowlist only.
		toolNames = [...new Set([...toolNames, ...eligibleTools.map((tool) => tool.name)])];
		reviewed = false;
		error = '';
	}

	function selectConnection(id: string) {
		if (toolsOnly) return;
		const selected = data.connections.find((item) => item.id === id);
		if (!selected || !connectionReady(selected)) return;
		initialSelection = false;
		if (connectionID !== id) {
			connectionID = id;
			toolNames = [];
			toolQuery = '';
			customToolsOpen = false;
			reviewed = false;
		}
		error = '';
	}
	function toggleMyMembership() {
		if (toolsOnly) return;
		if (currentMember) memberIDs = toggle(memberIDs, currentMember.id);
	}
	function toggle(values: string[], id: string): string[] {
		reviewed = false;
		return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
	}
	function removeUnavailableTool(name: string) {
		if (busy || !unavailableTools.includes(name)) return;
		toolNames = toolNames.filter((tool) => tool !== name);
		reviewed = false;
		error = '';
	}
	function validation(at: number): string {
		if (at >= 1 && sourceIssue) return sourceIssue;
		if (at >= 1 && (!name.trim() || !connection || !connectionReady(connection)))
			return t(
				'กรุณาตั้งชื่อ Gateway และเลือกระบบที่เปิดใช้งานพร้อมเครื่องมือที่ตรวจสอบแล้ว',
				'Enter a Gateway name and select an enabled source with reviewed tools.'
			);
		if (at >= 2 && unavailableTools.length)
			return t(
				'นำเครื่องมือที่ Server ไม่อนุญาตแล้วออกจาก Gateway ก่อนดำเนินการต่อ',
				'Remove tools that this server no longer allows before continuing.'
			);
		if (at >= 2 && !toolNames.length)
			return t(
				'กรุณาเลือกเครื่องมือที่ทีมจะใช้อย่างน้อย 1 รายการ',
				'Select at least one tool from this source.'
			);
		if (
			at >= 2 &&
			(!Number.isInteger(dailyLimit) || (dailyLimit ?? 0) < 1 || (dailyLimit ?? 0) > 1000000)
		)
			return t(
				'กรุณาระบุจำนวนครั้งที่ใช้งานได้ต่อวันเป็นจำนวนเต็ม ตั้งแต่ 1 ถึง 1,000,000 ครั้ง',
				'Set a whole-number daily limit between 1 and 1,000,000 calls.'
			);
		if (
			at >= 3 &&
			(!memberIDs.length || memberIDs.some((id) => !data.members.some((item) => item.id === id)))
		)
			return t(
				'กรุณาเลือกสมาชิกที่มีบัญชีในองค์กรอย่างน้อย 1 คน',
				'Select at least one person with an organization account.'
			);
		return '';
	}
	async function move(next: number) {
		if (busy || !flowSteps.includes(next)) return;
		error = next > step ? validation(step) : '';
		if (error) return;
		step = next;
		query = '';
		toolQuery = '';
		await tick();
		stepList?.querySelector('[aria-current="step"]')?.scrollIntoView({
			block: 'nearest',
			inline: 'center',
			behavior: 'instant'
		});
		title?.focus({ preventScroll: true });
		window.scrollTo({ top: 0, behavior: 'instant' });
	}
	async function save() {
		if (busy) return;
		error = validation(3);
		if (error || !reviewed) {
			error ||= t(
				'กรุณายืนยันว่าได้ตรวจสอบข้อมูลและสิทธิ์แล้วก่อนบันทึก',
				'Confirm the access review before saving.'
			);
			return;
		}
		busy = true;
		const input: HubInput = {
			name: name.trim(),
			description: description.trim(),
			connectionID,
			toolNames,
			memberIDs,
			unitIDs,
			dailyLimit: dailyLimit!,
			status,
			...(editingID ? { version: editingVersion } : {})
		};
		try {
			const hub = await OrcaService.hub(input, editingID);
			await onsaved(hub);
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			busy = false;
		}
	}
</script>

<div class="workspace-setup">
	<div class="k-breadcrumb">
		<a href={localeHref('/app?view=workspaces')}>{t('MCP Gateways', 'MCP Gateways')}</a><span>/</span><span
			>{existing
				? t('แก้ไข Gateway', 'Update Gateway')
				: t('สร้าง Gateway', 'Create Gateway')}</span
		>
	</div>
	<div class="k-intro">
		<h1 bind:this={title} tabindex="-1">
			{toolsOnly ? t('แก้ไขเครื่องมือของ Gateway', 'Edit Gateway tools') : existing
				? t('แก้ไข Gateway', 'Edit Gateway')
				: t('สร้าง Gateway', 'Create Gateway')}
		</h1>
		<p class="k-subtitle">
			{toolsOnly ? t(
				'เลือกเครื่องมือแล้วตรวจสอบก่อนบันทึก สมาชิก หน่วยงาน และการตั้งค่าอื่นใช้ค่าปัจจุบัน',
				'Select tools and review before saving. Members, units, and other settings keep their current values.'
			) : t(
				'จัดระบบ เครื่องมือ และสมาชิกให้พร้อมสำหรับงานของทีม',
				'Bring the right source, tools and people together for your team.'
			)}
		</p>
	</div>

	<div class="setup-layout">
		<div class="setup-main">
			<ol
				bind:this={stepList}
				class="setup-steps"
				style:--setup-step-count={flowSteps.length}
				aria-label={t('ขั้นตอนสร้าง Gateway', 'Gateway setup steps')}
			>
				{#each flowSteps as stepNumber, index (stepNumber)}
					<li class:current={step === stepNumber} class:complete={step > stepNumber}>
						<button
							type="button"
							disabled={busy || stepNumber > step}
							aria-current={step === stepNumber ? 'step' : undefined}
							onclick={() => move(stepNumber)}
						>
							<span class="setup-step-number"
								>{#if step > stepNumber}<Check size={18} />{:else}{index + 1}{/if}</span
							><span>{steps[stepNumber - 1]}</span>
						</button>
					</li>
				{/each}
			</ol>
			{#if sourceLinkChanged}<div class="k-banner" role="status">
					<Info size={19} />
					<p>
						{t(
							'ลิงก์เปลี่ยนแล้ว แต่ข้อมูลที่กำลังกรอกยังอยู่ เลือกระบบในขั้นตอนแรกหากต้องการเปลี่ยนระบบของ Gateway นี้',
							'The link changed, and your current entries are preserved. Choose a source in the first step if you want to change this Gateway’s source.'
						)}
					</p>
				</div>{/if}
			{#if sourceIssue}<div class="k-banner" role="status">
					<Info size={19} />
					<div>
						<p>{sourceIssue}</p>
						<a class="k-link-button" href={localeHref('/app?view=servers')}
							>{t('ตรวจสอบ Server', 'Review server')}</a
						>
					</div>
				</div>{/if}
			{#if error}<div class="k-banner error" role="alert">
					<Info size={19} />
					<div>
						{error}
						<div class="k-actions">
							<button class="k-link-button" disabled={busy} onclick={onreload}
								>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button
							>
						</div>
					</div>
				</div>{/if}
			<fieldset disabled={busy} class="setup-fields">
				<div class="k-wizard-content">
					<header class="setup-step-intro">
						<p class="setup-step-count">{t('ขั้นตอน', 'Step')} {flowSteps.indexOf(step) + 1} {t('จาก', 'of')} {flowSteps.length}</p>
						<h2>{stepTitles[step - 1]}</h2>
						<p>{stepDescriptions[step - 1]}</p>
					</header>
					{#if step === 1}
						<div class="k-grid-2">
							<div class="k-field">
								<label for="hub-name">{t('ชื่อ Gateway', 'Gateway name')}</label><input
									id="hub-name"
									bind:value={name}
									oninput={() => (reviewed = false)}
									maxlength="100"
									placeholder={t('เช่น ทีมปฏิบัติการ', 'For example, Operations team')}
									required
								/>
							</div>
							<div class="k-field">
								<label for="hub-description"
									>{t('คำอธิบายการใช้งาน', 'What is this Gateway for?')}
									<span class="k-muted k-small">{t('(ไม่บังคับ)', '(optional)')}</span></label
								><input
									id="hub-description"
									bind:value={description}
									oninput={() => (reviewed = false)}
									maxlength="500"
									placeholder={t(
										'เช่น ใช้ค้นหาเอกสารและแนวทางทำงานของทีม',
										'Help your team understand its purpose'
									)}
								/>
							</div>
						</div>
						<fieldset class="k-section setup-source-selection">
							<legend>{t('เลือกระบบที่ทีมจะใช้', 'Choose the source your team will use')}</legend>
							{#if !hasReadyConnection}
								<div class="setup-prerequisite">
									<span class="setup-prerequisite-icon"><Plug size={28} /></span>
									<h3>{t('เชื่อมระบบก่อนสร้าง Gateway', 'Connect a source to get started')}</h3>
									<p>
										{t(
											'เพิ่มระบบที่ทีมต้องใช้ แล้วตรวจสอบและเปิดใช้งานเครื่องมือ ระบบที่พร้อมจะปรากฏให้เลือกในหน้านี้',
											'Add your team’s source, review its tools and enable the connection. It will then appear here for selection.'
										)}
									</p>
									<a class="k-button primary" href={localeHref('/app?view=servers')}
										><Plug size={18} />{t('ไปเชื่อมระบบ', 'Connect a source')}<ChevronRight
											size={17}
										/></a
									>
								</div>
							{/if}
							{#if availableConnections.length}
								<div class="k-check-list">
									{#each availableConnections as source (source.id)}
										<label class="k-check-row" class:selected={source.id === connectionID}>
											<input
												type="radio"
												name="connection"
												value={source.id}
												checked={source.id === connectionID}
												disabled={!connectionReady(source)}
												onchange={() => selectConnection(source.id)}
											/>
											<span class="k-icon"><Plug size={23} /></span><span class="k-check-copy"
												><strong>{source.name}</strong>
												<p>{source.description || source.scopeNote}</p></span
											><span class="k-badge" class:active={connectionReady(source)}
												>{!source.enabled
													? t('ปิดใช้งาน', 'Disabled')
													: connectionReady(source)
														? t('ตรวจเครื่องมือแล้ว', 'Tools reviewed')
														: t('รอตรวจสอบเครื่องมือ', 'Tool review needed')}</span
											>
										</label>
									{/each}
								</div>
							{/if}
						</fieldset>
					{:else if step === 2}
						<div class="setup-source">
							<div class="k-heading-row">
								<div class="k-actions">
									<span class="k-icon"><Plug size={24} /></span>
									<div>
										<p class="k-small k-muted">{t('ระบบที่เลือก', 'Selected source')}</p>
										<strong>{connection?.name}</strong>
									</div>
								</div>
								<Check size={22} color="#36965b" />
							</div>
						</div>
						<div class="k-section">
							<h3>{t('ข้อมูลที่ระบบนี้ให้ใช้งาน', 'Available source data')}</h3>
							<p class="k-muted" style="margin-top:9px;white-space:pre-wrap">
								{connection?.scopeNote}
							</p>
							<p class="k-small k-muted" style="margin-top:8px">
								{t(
									'ขอบเขตข้อมูลขึ้นอยู่กับบัญชีและสิทธิ์ในระบบที่เชื่อมต่อ ข้อความอธิบายนี้ไม่ได้จำกัดข้อมูลให้โดยอัตโนมัติ',
									'Available data depends on the account and permissions configured in the source system.'
								)}
							</p>
						</div>
						<fieldset class="k-section">
							<legend>{t('เครื่องมือสำหรับ Gateway นี้', 'Tools for this Gateway')}</legend>
							<div class="setup-tool-preset">
								<p class="k-muted">{t('ใช้รายการที่คุณอนุญาตไว้ตอนเชื่อมแอปได้เลย สมาชิกใน Gateway นี้จะใช้เครื่องมือชุดที่เลือก', 'Reuse the tools approved when connecting the app. Members of this Gateway will use the selected set.')}</p>
								<button type="button" class="k-button primary setup-use-approved" disabled={!eligibleTools.length || allApprovedSelected} onclick={selectAllApprovedTools}>
									<Check size={18} />
									{t(`ใช้เครื่องมือที่อนุญาตไว้ทั้งหมด — ${eligibleTools.length} รายการ`, `Use all approved tools — ${eligibleTools.length} tools`)}
								</button>
								<p class="setup-tool-selection" role="status">
									{allApprovedSelected
										? t(`เลือกครบ ${selectedEligibleCount} รายการแล้ว`, `All ${selectedEligibleCount} tools selected`)
										: t(`เลือกแล้ว ${selectedEligibleCount} จาก ${eligibleTools.length} รายการ`, `${selectedEligibleCount} of ${eligibleTools.length} tools selected`)}
								</p>
							</div>
							{#if unavailableTools.length}<div class="setup-revoked-tools" role="status">
								<h3>{t('เครื่องมือที่ Server ไม่อนุญาตแล้ว', 'Tools no longer allowed by this server')}</h3>
								<p>{t('รายการเหล่านี้ยังอยู่ในการตั้งค่า Gateway และทำให้ใช้เครื่องมือไม่ได้ กรุณานำออกก่อนบันทึก', 'These tools remain in the Gateway configuration and block tool access. Remove them before saving.')}</p>
								{#each unavailableTools as tool (tool)}<div class="setup-revoked-tool"><strong>{tool}</strong><button type="button" class="k-button small" onclick={() => removeUnavailableTool(tool)}>{t('นำออกจาก Gateway', 'Remove from Gateway')}</button></div>{/each}
							</div>{/if}
							<details class="setup-custom-tools" bind:open={customToolsOpen}>
								<summary>{t('กำหนดเฉพาะ Gateway นี้', 'Customize this Gateway')}</summary>
								<p class="k-small k-muted">{t('เลือกเฉพาะเครื่องมือที่ทีมนี้ต้องใช้ โดยไม่เปลี่ยนสิทธิ์ของ Gateway อื่น', 'Choose only the tools this team needs. Other Gateways keep their existing permissions.')}</p>
							{#if eligibleTools.length > 5}<div
									class="k-field"
									style="margin-bottom:13px"
								>
									<label for="tool-search" class="k-small k-muted"
										>{t('ค้นหาเครื่องมือ', 'Search tools')}</label
									><input
										id="tool-search"
										type="search"
										bind:value={toolQuery}
										placeholder={t('ชื่อหรือคำอธิบายเครื่องมือ', 'Tool name or description')}
									/>
								</div>{/if}
							<div class="k-check-list">
								{#each visibleTools as tool (tool.name)}
									<label class="k-check-row" class:selected={toolNames.includes(tool.name)}
										><input
											type="checkbox"
											checked={toolNames.includes(tool.name)}
											onchange={() => (toolNames = toggle(toolNames, tool.name))}
										/><span class="k-icon"><FileCheck2 size={22} /></span><span class="k-check-copy"
											><strong>{tool.name}</strong>
											<p>
												{tool.description ||
													t(
														'ระบบที่เชื่อมต่อไม่ได้ระบุคำอธิบาย',
														'No description provided by the source'
													)}
											</p></span
										></label
									>
								{:else}<p class="k-muted" style="padding:18px">
										{t('ไม่พบเครื่องมือที่ตรงกับคำค้น', 'No tools match your search.')}
									</p>{/each}
							</div>
							</details>
						</fieldset>
						<div class="k-grid-2 k-section">
							<div class="k-field">
								<label for="daily-limit"
									>{t('จำนวนครั้งที่ใช้งานได้ต่อวัน', 'Daily call limit')}</label
								><input
									id="daily-limit"
									type="number"
									min="1"
									max="1000000"
									step="1"
									bind:value={dailyLimit}
									disabled={toolsOnly}
									oninput={() => (reviewed = false)}
									required
								/><span class="k-muted k-small"
									>{t(
										'สมาชิกทุกคนใน Gateway ใช้ร่วมกัน · เริ่มนับใหม่ทุกวันตามเวลาไทย',
										'Shared by all Gateway members · resets at midnight Bangkok time'
									)}</span
								>
							</div>
							<div class="k-banner" style="margin:0">
								<FileCheck2 size={21} />
								<div>
									<strong>{t('เครื่องมือที่ตรวจสอบแล้ว', 'Reviewed tools')}</strong>
									<p>
										{connection?.reviewedReadOnly
											? t(
													'Gateway นี้ใช้เฉพาะเครื่องมืออ่านข้อมูลที่ผู้ดูแลอนุญาต',
													'This Gateway uses only administrator-approved read tools.'
												)
											: t(
													'Gateway นี้ใช้เฉพาะเครื่องมือที่เลือกจากรายการที่ผู้ดูแลอนุญาต',
													'This Gateway uses only selected tools from the administrator-approved list.'
												)}
									</p>
								</div>
							</div>
						</div>
					{:else if step === 3}
						<div class="k-section-title">
							<h3>{t('สมาชิกใน Gateway', 'Gateway members')}</h3>
							<span class="k-badge accent"
								>{t('เลือกแล้ว', 'Selected')} {memberIDs.length} {t('คน', 'people')}</span
							>
						</div>
						{#if currentMember}<div class="setup-my-membership">
								<div>
									<strong
										>{t('ให้บัญชีของคุณใช้ Gateway นี้ด้วย', 'Use this Gateway yourself')}</strong
									>
									<p>
										{t(
											'เพิ่มตัวเองเพื่อจัดการความรู้และเชื่อมแอป AI ใน Gateway นี้',
											'Add yourself to manage knowledge and connect your AI app in this Gateway.'
										)}
									</p>
								</div>
								<button
									type="button"
									class="k-button small"
									aria-pressed={memberIDs.includes(currentMember.id)}
									onclick={toggleMyMembership}
								>
									{#if memberIDs.includes(currentMember.id)}<Check size={17} />{:else}<Users
											size={17}
										/>{/if}
									{memberIDs.includes(currentMember.id)
										? t('นำฉันออกจากสมาชิก', 'Remove me from members')
										: t('เพิ่มฉันเป็นสมาชิก', 'Add me as a member')}
								</button>
							</div>{/if}
						<div class="k-field" style="margin-bottom:17px">
							<label for="member-search" class="k-small k-muted"
								>{t('ค้นหาสมาชิก', 'Search people')}</label
							><input
								id="member-search"
								type="search"
								bind:value={query}
								placeholder={t('ชื่อหรืออีเมล', 'Name or email')}
							/>
						</div>
						<div class="k-check-list">
							{#each visibleMembers as member (member.id)}
								<label class="k-check-row" class:selected={memberIDs.includes(member.id)}
									><input
										type="checkbox"
										checked={memberIDs.includes(member.id)}
										onchange={() => (memberIDs = toggle(memberIDs, member.id))}
									/><span class="k-icon"><Users size={21} /></span><span class="k-check-copy"
										><strong
											>{memberName(member)}{member.id === data.currentUserID
												? t(' (คุณ)', ' (you)')
												: ''}</strong
										>
										<p>{member.email}</p></span
									></label
								>
							{:else}<p class="k-muted" style="padding:18px">
									{t('ไม่พบสมาชิกที่ตรงกับคำค้น', 'No people match your search.')}
								</p>{/each}
						</div>
						<p class="k-small k-muted" style="margin-top:13px">
							{t(
								'เจ้าขององค์กรและผู้ดูแลระบบต้องได้รับเลือกเป็นสมาชิกเช่นกัน จึงจะใช้ข้อมูลใน Gateway นี้ได้',
								'Administrators also need to be selected as members to use this Gateway’s data.'
							)}
						</p>
						{#if data.units.length}<fieldset class="k-section">
								<legend
									>{t('หน่วยงานที่เกี่ยวข้อง', 'Related units')}
									<span class="k-muted k-small">{t('(ไม่บังคับ)', '(optional)')}</span></legend
								>
								<div class="k-check-list">
									{#each data.units as unit (unit.id)}<label class="k-check-row"
											><input
												type="checkbox"
												checked={unitIDs.includes(unit.id)}
												onchange={() => (unitIDs = toggle(unitIDs, unit.id))}
											/><span class="k-check-copy"
												><strong>{unit.name}</strong>
												<p>{unitLabels[unit.kind]}</p></span
											></label
										>{/each}
								</div>
								<p class="k-small k-muted" style="margin-top:10px">
									{t(
										'หน่วยงานใช้จัดกลุ่ม Gateway เท่านั้น สิทธิ์เข้าถึงข้อมูลขึ้นอยู่กับสมาชิกที่เลือกด้านบน',
										'Units help organize Gateways. Access follows the members selected above.'
									)}
								</p>
							</fieldset>{/if}
					{:else}
						<div class="k-section-title">
							<h3>{t('สรุปการตั้งค่า', 'Gateway settings')}</h3>
							<span class="k-badge accent">{toolAccessLabel}</span>
						</div>
						<div class="k-review">
							<dl>
								<div>
									<dt>{t('Gateway', 'Gateway')}</dt>
									<dd>
										<strong>{name}</strong>{#if description}<p class="k-small k-muted">
												{description}
											</p>{/if}
									</dd>
								</div>
								<div>
									<dt>{t('ระบบและข้อมูล', 'System and data')}</dt>
									<dd>
										{connection?.name}
										<p class="k-small k-muted">{connection?.scopeNote}</p>
									</dd>
								</div>
								<div>
									<dt>{t('เครื่องมือที่ใช้ได้', 'Available tools')}</dt>
									<dd>
										<ul>
											{#each toolNames as tool (tool)}<li>{tool}</li>{/each}
										</ul>
									</dd>
								</div>
								<div>
									<dt>{t('สมาชิก', 'Members')}</dt>
									<dd>
										{data.members
											.filter((member) => memberIDs.includes(member.id))
											.map(memberName)
											.join(', ')}
									</dd>
								</div>
								<div>
									<dt>{t('จำนวนครั้งที่ใช้งานได้ต่อวัน', 'Daily limit')}</dt>
									<dd>
										{dailyLimit?.toLocaleString('th-TH')}
										{t('ครั้ง โดยสมาชิกใช้ร่วมกัน', 'calls per Gateway')}
									</dd>
								</div>
								{#if unitIDs.length}
									<div>
										<dt>{t('หน่วยงานที่เกี่ยวข้อง', 'Related units')}</dt>
										<dd>
											{data.units
												.filter((unit) => unitIDs.includes(unit.id))
												.map((unit) => unit.name)
												.join(', ')}
										</dd>
									</div>
								{/if}
							</dl>
						</div>
						<div class="k-field k-section">
							<label for="hub-status">{t('สถานะหลังบันทึก', 'After saving')}</label><select
								id="hub-status"
								bind:value={status}
								disabled={toolsOnly}
								onchange={() => (reviewed = false)}
								><option value="active"
									>{t(
										'เปิดใช้งาน — สมาชิกสร้างคีย์เพื่อเชื่อมแอป AI ได้',
										'Active — members can create connection keys'
									)}</option
								><option value="draft"
									>{t(
										'บันทึกเป็นฉบับร่าง — ยังเข้าถึงข้อมูลไม่ได้',
										'Draft — data is not accessible yet'
									)}</option
								>{#if existing}<option value="paused">{t('ระงับการใช้งาน', 'Pause access')}</option
									>{/if}</select
							>
						</div>
						<label class="k-check-row setup-confirmation"
							><input type="checkbox" bind:checked={reviewed} /><span class="k-check-copy"
								><strong
									>{t(
										'ยืนยันว่าข้อมูล เครื่องมือ และสมาชิกถูกต้อง',
										'I checked that the data, tools, and members are correct.'
									)}</strong
								>
								<p>
									{t(
										'สิทธิ์ที่แก้ไขจะมีผลเมื่อสมาชิกใช้งานครั้งถัดไป',
										'Permission changes apply to each member’s next call.'
									)}
								</p></span
							></label
						>
					{/if}
				</div>
			</fieldset>
			<div class="k-wizard-actions setup-actions">
				{#if step === flowSteps[0]}<a
						class="k-button"
						href={localeHref(
							existing ? `/app?view=hub&hub=${encodeURIComponent(existing.id)}${toolsOnly ? '&tab=tools' : ''}` : '/app?view=workspaces'
						)}>{t('ยกเลิก', 'Cancel')}</a
					>{:else}<button
						type="button"
						class="k-button"
						disabled={busy}
						onclick={() => move(flowSteps[flowSteps.indexOf(step) - 1])}><ChevronLeft size={17} /> {t('ย้อนกลับ', 'Back')}</button
					>{/if}
				{#if step < 4}<button
						type="button"
						class="k-button primary"
						disabled={busy || (step === 1 && !hasReadyConnection)}
						onclick={() => move(flowSteps[flowSteps.indexOf(step) + 1])}
						>{t('ถัดไป', 'Continue')} <ChevronRight size={17} /></button
					>{:else}<button
						type="button"
						class="k-button primary"
						disabled={busy || !reviewed}
						onclick={save}
						>{busy
							? t('กำลังบันทึก…', 'Saving…')
							: existing
								? t('บันทึกการเปลี่ยนแปลง', 'Save changes')
								: status === 'active'
									? t('สร้างและเปิดใช้งาน', 'Create and activate')
									: t('บันทึกฉบับร่าง', 'Save draft')}
						<Check size={18} /></button
					>{/if}
			</div>
		</div>
		<aside class="setup-summary" aria-label={t('สรุป Gateway', 'Gateway summary')}>
			<div class="setup-summary-header">
				<span class="setup-summary-icon"><Folder size={22} /></span>
				<h2>{t('MCP Gateway ของคุณ', 'Your Gateway')}</h2>
			</div>
			<p class="setup-summary-name">{name.trim() || t('Gateway ใหม่', 'New Gateway')}</p>
			{#if description.trim()}<p class="setup-summary-description">{description.trim()}</p>{/if}
			<dl>
				<div class="k-summary-row">
					<span class="k-icon"><Plug size={21} /></span>
					<dt>{t('ระบบ:', 'Source:')}</dt>
					<dd>{connection?.name || t('ยังไม่ได้เลือก', 'Not selected')}</dd>
				</div>
				<div class="k-summary-row">
					<span class="k-icon"><Folder size={21} /></span>
					<dt>{t('เครื่องมือ:', 'Tools:')}</dt>
					<dd>
						{toolNames.length
							? t(`${toolNames.length} เครื่องมือ`, `${toolNames.length} tools`)
							: t('ยังไม่ได้กำหนด', 'Not defined')}
					</dd>
				</div>
				<div class="k-summary-row">
					<span class="k-icon"><FileCheck2 size={21} /></span>
					<dt>{t('สิทธิ์:', 'Access:')}</dt>
					<dd>{toolAccessLabel}</dd>
				</div>
				<div class="k-summary-row">
					<span class="k-icon"><Users size={21} /></span>
					<dt>{t('สมาชิก:', 'Members:')}</dt>
					<dd>
						{memberIDs.length
							? t(`${memberIDs.length} คน`, `${memberIDs.length} people`)
							: t('เลือกในขั้นตอนสมาชิก', 'Choose in the members step')}
					</dd>
				</div>
			</dl>
			<p class="k-summary-note">
				{t(
					'แอป AI เข้าถึงข้อมูลผ่าน Gateway นี้ ตามสิทธิ์ของผู้ใช้แต่ละคน',
					'AI uses data through this Gateway according to each person’s own permissions.'
				)}
			</p>
		</aside>
	</div>
</div>

<style>
	.setup-tool-preset {
		display: grid;
		gap: 14px;
		margin-top: 12px;
		padding: 20px;
		border: 1px solid #d9e5bf;
		border-radius: 10px;
		background: #f7faef;
	}
	.setup-tool-preset > p { font-size: 14px; line-height: 1.75; }
	.workspace-setup .setup-use-approved {
		justify-self: start;
		max-width: 100%;
		min-height: 44px;
		white-space: normal;
		text-align: left;
		line-height: 1.6;
	}
	.setup-use-approved :global(svg) { flex-shrink: 0; }
	.setup-tool-selection { color: #526b29; font-weight: 600; }
	.setup-custom-tools { margin-top: 16px; border: 1px solid var(--setup-line); border-radius: 10px; padding: 0 18px; }
	.setup-custom-tools summary { padding: 16px 0; cursor: pointer; font-size: 14px; font-weight: 600; }
	.setup-custom-tools summary:focus-visible { outline: 2px solid var(--setup-ink); outline-offset: 3px; border-radius: 4px; }
	.setup-custom-tools > p { margin-bottom: 14px; line-height: 1.75; }
	.setup-custom-tools .k-check-list { padding-bottom: 16px; }
	.setup-revoked-tools { border: 1px solid #e8bf78; border-radius: 10px; background: #fff8ea; padding: 16px; margin-bottom: 16px; }
	.setup-revoked-tools h3 { font-size: 15px; margin: 0 0 8px; }
	.setup-revoked-tools p { font-size: 13px; line-height: 1.6; margin: 0 0 12px; }
	.setup-revoked-tool { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-top: 10px; }
	.setup-revoked-tool strong { overflow-wrap: anywhere; font-size: 13px; }
	.workspace-setup {
		--setup-ink: var(--o-ink, #171b28);
		--setup-muted: var(--o-muted, #687086);
		--setup-line: var(--k-line, #e0e4ec);
		min-width: 0;
		color: var(--setup-ink);
	}
	.setup-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		align-items: start;
		gap: 24px;
	}
	.setup-main,
	.setup-summary {
		min-width: 0;
		border: 1px solid var(--setup-line);
		border-radius: 14px;
		background: #fff;
	}
	.setup-steps {
		display: grid;
		grid-template-columns: repeat(var(--setup-step-count, 4), minmax(110px, 1fr));
		gap: 8px;
		max-width: 100%;
		margin: 0;
		padding: 24px 28px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
		list-style: none;
		border-bottom: 1px solid var(--setup-line);
	}
	.setup-steps button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 3px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--setup-muted);
		font: inherit;
		font-size: 14px;
		line-height: 1.5;
		text-align: left;
		white-space: nowrap;
	}
	.setup-steps button:disabled {
		opacity: 1;
		cursor: default;
	}
	.setup-steps button:not(:disabled) {
		cursor: pointer;
	}
	.setup-steps button:focus-visible {
		outline: 2px solid var(--setup-ink);
		outline-offset: 3px;
	}
	.setup-step-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--setup-line);
		border-radius: 50%;
		background: #f7f8fb;
		font-size: 14px;
		font-weight: 600;
	}
	.setup-steps .current button {
		color: var(--setup-ink);
		font-weight: 600;
	}
	.setup-steps .current .setup-step-number {
		border-color: var(--o-citron, #d4f277);
		background: var(--o-citron, #d4f277);
		color: var(--setup-ink);
	}
	.setup-steps .complete .setup-step-number {
		border-color: #d7e7b3;
		background: #f0f6e2;
		color: #526b29;
	}
	.setup-fields {
		min-width: 0;
		margin: 0;
		padding: 28px;
		border: 0;
	}
	.workspace-setup .setup-source-selection {
		margin-top: 20px;
	}
	.setup-step-intro {
		margin-bottom: 28px;
	}
	.setup-step-intro .setup-step-count {
		margin: 0 0 8px;
		color: #657d32;
		font-size: 12px;
		font-weight: 600;
	}
	.setup-step-intro h2 {
		font-size: clamp(20px, 2vw, 24px);
		line-height: 1.5;
		letter-spacing: -0.025em;
	}
	.setup-step-intro > p:last-child {
		margin-top: 8px;
		color: var(--setup-muted);
		font-size: 14px;
		line-height: 1.75;
	}
	.setup-main h3 {
		font-size: 17px;
		line-height: 1.6;
		font-weight: 600;
	}
	.setup-main > .k-banner {
		margin: 20px 28px 0;
	}
	.setup-prerequisite {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		margin-top: 8px;
		padding: 32px 24px;
		border: 1px dashed #d7dfc7;
		border-radius: 12px;
		background: #fbfcf8;
		text-align: center;
	}
	.setup-prerequisite-icon {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border: 1px solid #e4eacb;
		border-radius: 14px;
		background: #f0f5e4;
		color: #607339;
	}
	.setup-prerequisite > p {
		max-width: 43ch;
		color: var(--setup-muted);
		font-size: 14px;
		line-height: 1.8;
	}
	.setup-prerequisite .k-button {
		margin-top: 5px;
	}
	.setup-source {
		padding: 16px 18px;
		border: 1px solid var(--setup-line);
		border-radius: 10px;
		background: #fafbf8;
	}
	.setup-source strong {
		display: block;
		margin-top: 3px;
		overflow-wrap: anywhere;
	}
	.setup-my-membership {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 14px 0 20px;
		padding: 16px;
		border: 1px solid #d9e5bf;
		border-radius: 10px;
		background: #f7faef;
	}
	.setup-my-membership strong {
		font-size: 14px;
		line-height: 1.7;
	}
	.setup-my-membership p {
		margin-top: 4px;
		color: var(--setup-muted);
		font-size: 12px;
		line-height: 1.75;
	}
	.setup-my-membership .k-button {
		flex-shrink: 0;
	}
	.workspace-setup .setup-confirmation {
		margin-top: 20px;
		padding: 18px;
		border: 1px solid #d9e5bf;
		border-radius: 10px;
		background: #f7faef;
	}
	.setup-actions {
		margin-top: 0;
		padding: 20px 28px;
		border-top: 1px solid var(--setup-line);
	}
	.setup-actions .k-button {
		min-width: 110px;
		min-height: 44px;
	}
	.setup-summary {
		position: sticky;
		top: calc(var(--k-header, 72px) + 24px);
		padding: 24px;
	}
	.setup-summary-header {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.setup-summary-header h2 {
		font-size: 16px;
		line-height: 1.6;
	}
	.setup-summary-icon {
		display: inline-flex;
		color: #7b865f;
	}
	.setup-summary-name {
		margin-top: 20px;
		font-size: 22px;
		line-height: 1.6;
		font-weight: 600;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}
	.setup-summary-description {
		margin-top: 5px;
		color: var(--setup-muted);
		font-size: 13px;
		line-height: 1.75;
		overflow-wrap: anywhere;
	}
	.setup-summary dl {
		margin-top: 18px;
	}
	.setup-summary .k-summary-row {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		align-items: center;
		gap: 3px 10px;
		padding: 14px 0;
		border-bottom: 1px solid var(--setup-line);
	}
	.setup-summary .k-icon {
		grid-row: span 2;
		width: 32px;
		height: 32px;
		background: #f5f6f8;
		color: #71798a;
	}
	.setup-summary dt {
		min-width: 0;
		font-size: 12px;
		color: var(--setup-muted);
	}
	.setup-summary dd {
		font-size: 14px;
		color: var(--setup-ink);
	}
	.setup-summary .k-summary-note {
		margin-top: 18px !important;
		font-size: 12px;
		line-height: 1.8;
	}
	@media (max-width: 1200px) {
		.setup-layout {
			grid-template-columns: minmax(0, 1fr) 240px;
			gap: 20px;
		}
		.setup-summary {
			padding: 20px;
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
			grid-template-columns: 1fr 1fr;
			gap: 0 24px;
		}
	}
	@media (max-width: 680px) {
		.setup-my-membership {
			align-items: stretch;
			flex-direction: column;
		}
		.setup-steps {
			grid-template-columns: repeat(var(--setup-step-count, 4), minmax(94px, 1fr));
			padding: 18px 20px;
		}
		.setup-fields,
		.setup-actions {
			padding: 20px;
		}
		.setup-main > .k-banner {
			margin-right: 20px;
			margin-left: 20px;
		}
		.setup-prerequisite {
			padding: 24px 18px;
		}
		.setup-prerequisite .k-button {
			width: 100%;
		}
		.setup-actions {
			align-items: stretch;
			flex-wrap: wrap;
		}
		.setup-actions .k-button.primary {
			flex: 1;
		}
		.setup-summary dl {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
