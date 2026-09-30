<script lang="ts">
	import { workspaceToolingReady } from '$lib/orca/activation';
	import { aiConnectionLine } from '$lib/orca/ai-connection';
	import { aiConnectionFrom } from '$lib/orca/connect-ai';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { companyPinned, currentCompany } from '$lib/orca/company';
	import { gatewayHasMember, gatewaySources } from '$lib/orca/gateway-sources';
	import { lineShareURL } from '$lib/orca/invitations';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { aiReachesWorkspace, connectAILink, programSummary, programSummaryLabel, samplePrompt, sourceChangesData, workspaceInviteMessage } from '$lib/orca/workspace-edit';
	import { sourceAccountState } from '$lib/orca/connection-presentation';
	import { accountStateFrom, type AccountState } from '$lib/orca/home-setup';
	import { personalAccountReader, personalSetup, personalSources } from '$lib/orca/personal-connections';
	import { OrcaService, type OrcaBootstrap, type OrcaHub } from '$lib/services/orca';
	import { MyAIAppsService } from '$lib/services/orca-ai-apps';
	import { ArrowRight, BookOpen, Check, CircleCheck, Copy, MessageCircle, Play, ShieldCheck, Sparkles, UserPlus } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';
	import GatewayClientSetup from '../GatewayClientSetup.svelte';
	import { copyFeedback, copyText } from '../ui/copy';
	import CopyField from '../ui/CopyField.svelte';
	import StatusPill from '../ui/StatusPill.svelte';

	// ภาพรวม: the programs, today's use, and a short "สิ่งที่ทำต่อได้" (it
	// replaces the old readiness guide). Right after creation it offers the
	// invite message; anyone here without an AI connected gets one banner.
	let {
		data,
		hub,
		created = false,
		tabHref
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		created?: boolean;
		tabHref: (tab: string) => string;
	} = $props();
	const archived = $derived(hub.status === 'archived' || hub.status === 'deleted');
	const active = $derived(hub.status === 'active');
	// Its own sign-in (SSO): the company link and เชื่อม AI ของฉัน don't bring it; its own link does.
	const sso = $derived(!!hub.userSourceID);
	const isMember = $derived(gatewayHasMember(hub, data.currentUserID));
	const sources = $derived(
		gatewaySources(hub).map((source) => {
			const connection = data.connections.find((item) => item.id === source.connectionID);
			return { ...source, connection, ready: workspaceToolingReady({ ...hub, sources: [source] }, connection) };
		})
	);
	const changesData = $derived(sources.some((source) => sourceChangesData(source.connection, source.toolNames)));
	const programNames = $derived(sources.map((source) => source.connection?.name ?? '').filter(Boolean));
	const used = $derived(hub.usedToday ?? 0);
	const percent = $derived(Math.min(100, Math.round((used / Math.max(hub.dailyLimit, 1)) * 100)));
	const company = $derived(data.organization.displayName || 'ORCA');
	let origin = $state('');
	const message = $derived(
		workspaceInviteMessage({ company, workspace: hub.name, programs: programNames, link: connectAILink(origin || 'https://orca.invalid', currentCompany()) }, t)
	);
	const prompt = $derived(programNames.length ? samplePrompt(programNames[0], t) : '');
	// Whether the viewer's AI reaches this workspace (B1); unknown until it answers.
	let ai = $state<'unknown' | 'none' | 'connected'>('unknown');
	/** Not here, but through another workspace's own link: "Claude เชื่อมเฉพาะ ฝ่ายขาย" (B3 follow-up). */
	let elsewhere = $state('');
	let copied = $state<'' | 'invite' | 'prompt'>('');
	let copyFailed = $state(false);
	const feedback = copyFeedback((value) => {
		if (!value) copied = '';
	});
	onDestroy(() => feedback.dispose());

	// An employee's own sign-in to each program here, as on Home and เชื่อม AI ของฉัน:
	// "พร้อมใช้" alone would hide the step they still have to do.
	let accounts = $state<Record<string, AccountState>>({});
	const reader = personalAccountReader(
		async (sourceID, signal) => personalSetup(await OrcaService.sourceSetup(sourceID, signal), sourceID),
		(event) => {
			accounts[event.sourceID] = event.status === 'ready' ? accountStateFrom(sourceAccountState(event.value)) : event.status === 'error' ? 'unknown' : 'checking';
		}
	);
	onDestroy(() => reader.dispose());
	const signInNeeded = (sourceID: string | undefined) => !!sourceID && accounts[sourceID] === 'needed';
	// Right after creating it, the green panel carries the invite; the rows below don't repeat it.
	const invitePanel = $derived(created && data.canManage && !archived && active && !sso);
	const aiBanner = $derived(isMember && active && !sso && ai === 'none' && !invitePanel);

	onMount(() => {
		origin = window.location.origin;
		if (isMember && active && !archived && !data.canManage)
			reader.replace(
				personalSources(data)
					.filter((source) => source.canReadSetup && source.hubs.some((item) => item.id === hub.id))
					.map((source) => source.sourceID)
			);
		const controller = new AbortController();
		if (isMember && !archived && !sso)
			void MyAIAppsService.list(controller.signal)
				.then((apps) => {
					ai = aiReachesWorkspace(apps, hub.id) ? 'connected' : 'none';
					// Said as it is, never "not connected" (B3 follow-up).
					const status = aiConnectionFrom(apps, Date.now(), t);
					elsewhere = ai === 'none' && status.only?.length ? aiConnectionLine(status, t) : '';
				})
				.catch(() => {
					// Unknown: no banner rather than a wrong one.
				});
		return () => controller.abort();
	});

	async function copy(kind: 'invite' | 'prompt') {
		copyFailed = false;
		const ok = await copyText(kind === 'invite' ? message : prompt, navigator.clipboard, document);
		if (ok) {
			copied = kind;
			feedback.copied();
		} else copyFailed = true;
	}
</script>

{#if created && data.canManage && !archived}
	{#if active && sso}
		<section class="ov-created" aria-labelledby="ov-created-title">
			<span class="ov-created-icon" aria-hidden="true"><CircleCheck size={20} /></span>
			<div class="ov-created-copy">
				<h2 id="ov-created-title">{t('ส่งลิงก์ของพื้นที่นี้ให้ทีม', "Send your team this workspace's link")}</h2>
				<p>{t('พื้นที่นี้ใช้ SSO ของบริษัท จึงไม่อยู่ในลิงก์ ORCA ของบริษัท ลิงก์ของพื้นที่นี้อยู่ด้านล่าง', "It uses company SSO, so it isn't on your company's ORCA link. Its own link is below.")}</p>
			</div>
		</section>
	{:else if active}
		<section class="ov-created" aria-labelledby="ov-created-title">
			<span class="ov-created-icon" aria-hidden="true"><CircleCheck size={20} /></span>
			<div class="ov-created-copy">
				<h2 id="ov-created-title">{t('ส่งให้ทีมเริ่มใช้', 'Tell your team')}</h2>
				<p>{t('ส่งข้อความนี้ทาง LINE หรืออีเมล ใครเชื่อม Claude หรือ ChatGPT กับ ORCA ไว้แล้วไม่ต้องทำอะไรเพิ่ม พื้นที่นี้จะขึ้นให้เอง', 'Send this by LINE or email. Anyone who connected Claude or ChatGPT to ORCA has nothing more to do; the workspace appears by itself.')}</p>
				<blockquote class="ov-message">{message}</blockquote>
				<div class="ov-created-actions">
					<button type="button" class="ov-primary" onclick={() => copy('invite')}>{#if copied === 'invite'}<Check size={16} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกข้อความเชิญ', 'Copy the invite message')}{/if}</button>
					<a class="k-button" href={lineShareURL(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />{t('ส่งทาง LINE', 'Send by LINE')}</a>
				</div>
				{#if copyFailed}<p class="ov-copy-failed" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความด้านบนแล้วคัดลอกเอง', 'Copy failed. Select the message above and copy it yourself.')}</p>{/if}
			</div>
		</section>
	{:else}
		<section class="ov-created quiet" aria-labelledby="ov-created-title">
			<span class="ov-created-icon" aria-hidden="true"><CircleCheck size={20} /></span>
			<div class="ov-created-copy">
				<h2 id="ov-created-title">{t('บันทึกเป็นฉบับร่างแล้ว', 'Saved as a draft')}</h2>
				<p>{t('ทีมยังไม่เห็นพื้นที่นี้ กด เปิดใช้งาน เมื่อพร้อม', "Your team doesn't see it yet. Choose Activate when it's ready.")}</p>
			</div>
		</section>
	{/if}
{/if}

{#if aiBanner}
	<div class="ov-banner" role="status">
		<Sparkles size={18} aria-hidden="true" />
		<div>
			{#if elsewhere}
				<strong>{t('AI ของคุณยังใช้พื้นที่นี้ไม่ได้', "Your AI can't use this workspace yet")}</strong>
				<p>{t(`${elsewhere} ใช้ลิงก์ ORCA ของบริษัท แล้วพื้นที่นี้จะขึ้นใน AI ของคุณเอง`, `${elsewhere}. Use the company's ORCA link and this workspace appears in your AI.`)}</p>
			{:else}
				<strong>{t('คุณยังไม่ได้เชื่อม Claude หรือ ChatGPT กับ ORCA', "You haven't connected Claude or ChatGPT to ORCA")}</strong>
				<p>{t('เชื่อมครั้งเดียว แล้วพื้นที่นี้จะขึ้นใน AI ของคุณเอง', 'Connect once and this workspace appears in your AI.')}</p>
			{/if}
		</div>
		<a class="k-button" href={localeHref('/app?view=connect-ai')}>{t('เชื่อม AI ของฉัน', 'Connect my AI')}</a>
	</div>
{/if}

<div class="ov-grid">
	<section class="ov-card" aria-labelledby="ov-programs-title">
		<header class="ov-card-head">
			<h2 id="ov-programs-title">{t('โปรแกรมในพื้นที่นี้', 'Programs here')} <span class="ov-count">{sources.length}</span></h2>
			<a class="ov-link" href={tabHref('programs')}>{data.canManage && !archived ? t('จัดการ', 'Manage') : t('ดูทั้งหมด', 'See all')}<ArrowRight size={14} aria-hidden="true" /></a>
		</header>
		{#if sources.length}
			<ul class="ov-rows">
				{#each sources as source (source.connectionID)}
					<li>
						<span class="ov-logo" aria-hidden="true"><CatalogIcon name={source.connection?.name ?? ''} size={22} /></span>
						<div class="ov-row-copy">
							<strong>{source.connection?.name ?? t('โปรแกรมที่ถูกลบ', 'Removed program')}</strong>
							<span>{programSummaryLabel(programSummary(source.connection, source.toolNames), t)}</span>
						</div>
						{#if source.ready && signInNeeded(source.connection?.mcpID)}
							<a class="ov-signin" href={localeHref('/app?view=connect-ai#accounts')}>{t('ลงชื่อเข้าใช้ก่อน', 'Sign in first')}</a>
						{:else}
							<StatusPill label={source.ready ? t('พร้อมใช้', 'Ready') : t('ต้องตรวจสอบ', 'Needs a look')} tone={source.ready ? 'ok' : 'warn'} />
						{/if}
					</li>
				{/each}
			</ul>
		{:else}<p class="ov-empty">{t('ยังไม่ได้เปิดโปรแกรมในพื้นที่นี้', 'No programs are on here yet.')}</p>{/if}
		{#if changesData}<p class="ov-card-foot"><ShieldCheck size={15} aria-hidden="true" />{hub.writeMode === 'approval' ? t('เมื่อ AI จะสร้างหรือแก้ข้อมูล ต้องรอผู้ดูแลอนุมัติก่อน', 'When AI would create or change data, an admin approves first.') : t('AI สร้างหรือแก้ข้อมูลได้ทันที ไม่ต้องรออนุมัติ', 'AI creates or changes data right away, without approval.')}</p>{/if}
	</section>

	<section class="ov-card" aria-labelledby="ov-usage-title">
		<header class="ov-card-head">
			<h2 id="ov-usage-title">{t('การใช้งานวันนี้', 'Used today')}</h2>
			<a class="ov-link" href={localeHref(`/app?view=executions&hub=${encodeURIComponent(hub.id)}`)}>{t('ประวัติการใช้งาน', 'Activity')}<ArrowRight size={14} aria-hidden="true" /></a>
		</header>
		<div class="ov-usage">
			<p class="ov-usage-value"><b>{used.toLocaleString('th-TH')}</b> / {hub.dailyLimit.toLocaleString('th-TH')} <span>{t('ครั้ง', 'uses')}</span></p>
			<div class="ov-meter" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={hub.dailyLimit} aria-label={t('การใช้งานวันนี้เทียบกับที่จำกัดไว้', 'Used today against the daily limit')}>
				<span style={`width:${percent}%`} class:high={percent >= 80}></span>
			</div>
			<p class="ov-usage-note">
				{percent >= 100
					? t('ถึงที่จำกัดไว้แล้ว ใช้ได้อีกครั้งพรุ่งนี้ตามเวลาประเทศไทย', 'The limit is reached; it resets tomorrow, Bangkok time.')
					: percent >= 80
						? t('ใกล้ถึงที่จำกัดไว้แล้ว เพิ่มได้ในแท็บ “ตั้งค่า”', 'Close to the limit; raise it under “Settings”.')
						: t('ทุกคนในพื้นที่นี้ใช้ร่วมกัน เริ่มนับใหม่ทุกวัน', 'Shared by everyone here; resets daily.')}
			</p>
		</div>
	</section>
</div>

{#if !archived}
	<section class="ov-card ov-next" aria-labelledby="ov-next-title">
		<header class="ov-card-head"><h2 id="ov-next-title">{t('สิ่งที่ทำต่อได้', 'What to do next')}</h2></header>
		<ul class="ov-steps">
			{#if !active}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><Play size={17} /></span>
					<div class="ov-step-copy"><strong>{hub.status === 'paused' ? t('หยุดชั่วคราวอยู่', 'Paused') : t('ยังเป็นฉบับร่าง', 'Still a draft')}</strong><span>{data.canManage ? t('ทีมจะเห็นพื้นที่นี้ใน AI หลังกด เปิดใช้งาน ด้านบน', 'Your team sees it in their AI after you choose Activate above.') : t('ผู้ดูแลบริษัทยังไม่ได้เปิดให้ใช้', "A company admin hasn't turned it on yet.")}</span></div>
				</li>
			{/if}
			{#if data.canManage && !isMember}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><UserPlus size={17} /></span>
					<div class="ov-step-copy"><strong>{t('เพิ่มตัวเองในพื้นที่นี้', 'Add yourself here')}</strong><span>{t('คุณจัดการพื้นที่นี้ได้ แต่ AI ของคุณจะยังไม่เห็น', 'You manage it, but your own AI does not see it yet.')}</span></div>
					<a class="k-button small" href={tabHref('people')}>{t('ไปที่แท็บคน', 'Open People')}</a>
				</li>
			{/if}
			{#if isMember && sso}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><Sparkles size={17} /></span>
					<div class="ov-step-copy"><strong>{t('เพิ่มลิงก์ของพื้นที่นี้ใน AI ของคุณ', "Add this workspace's link to your AI")}</strong><span>{t('พื้นที่นี้ใช้ SSO ของบริษัท ลิงก์และขั้นตอนอยู่ด้านล่าง', 'It uses company SSO; the link and steps are below.')}</span></div>
				</li>
			{:else if isMember && !aiBanner}
				<li class:done={ai === 'connected'}>
					<span class="ov-step-icon" aria-hidden="true">{#if ai === 'connected'}<Check size={17} />{:else}<Sparkles size={17} />{/if}</span>
					<div class="ov-step-copy"><strong>{t('เชื่อม AI ของฉัน', 'Connect my AI')}</strong><span>{ai === 'connected' ? t('เชื่อมแล้ว พื้นที่นี้ขึ้นใน AI ของคุณเอง', 'Connected; this workspace shows up in your AI.') : t('ทำครั้งเดียว ใช้ได้กับทุกพื้นที่ที่คุณอยู่', 'Once, for every workspace you are in.')}</span></div>
					{#if ai !== 'connected'}<a class="k-button small" href={localeHref('/app?view=connect-ai')}>{t('เชื่อม', 'Connect')}</a>{/if}
				</li>
			{/if}
			{#if data.canManage && active && !sso && !invitePanel}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><MessageCircle size={17} /></span>
					<div class="ov-step-copy"><strong>{t('ชวนทีมเข้ามาใช้', 'Invite your team')}</strong><span>{t('ส่งข้อความทาง LINE หรืออีเมล พาไปที่ “เชื่อม AI ของฉัน”', 'Send a message by LINE or email that opens “Connect my AI”.')}</span></div>
					<button type="button" class="k-button small" onclick={() => copy('invite')}>{copied === 'invite' ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกข้อความเชิญ', 'Copy invite')}</button>
				</li>
			{/if}
			{#if isMember && active && prompt}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><Copy size={17} /></span>
					<div class="ov-step-copy"><strong>{t('ลองถาม AI', 'Try asking AI')}</strong><span>“{prompt}”</span></div>
					<button type="button" class="k-button small" onclick={() => copy('prompt')}>{copied === 'prompt' ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกคำถาม', 'Copy question')}</button>
				</li>
			{/if}
			{#if isMember}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><BookOpen size={17} /></span>
					<div class="ov-step-copy"><strong>{t('เพิ่มความรู้ให้ AI', 'Add knowledge for AI')}</strong><span>{t('บทความและคำสั่งสำเร็จรูปที่ AI ในพื้นที่นี้ใช้ได้', 'Articles and ready-made prompts AI can use here.')}</span></div>
					<a class="k-button small" href={localeHref(`/app?view=knowledge&hub=${encodeURIComponent(hub.id)}`)}>{t('เปิดคลังความรู้', 'Open Knowledge')}</a>
				</li>
			{/if}
			{#if !isMember && !data.canManage}
				<li>
					<span class="ov-step-icon" aria-hidden="true"><UserPlus size={17} /></span>
					<div class="ov-step-copy"><strong>{t('ขอให้ผู้ดูแลบริษัทเพิ่มคุณ', 'Ask a company admin to add you')}</strong><span>{t('แล้วพื้นที่นี้จะขึ้นใน AI ของคุณเอง', 'Then it appears in your AI.')}</span></div>
				</li>
			{/if}
		</ul>
		{#if copyFailed && !created}<p class="ov-copy-failed" role="alert">{t('คัดลอกไม่ได้ ลองอีกครั้ง', 'Copy failed. Try again.')}</p>{/if}
	</section>
{/if}

{#if hub.userSourceID && !archived}
	<section id="connect-ai" class="ov-card ov-sso" aria-labelledby="ov-sso-title">
		<header class="ov-card-head"><h2 id="ov-sso-title">{t('พื้นที่นี้ใช้ SSO ของบริษัท', 'This workspace uses company SSO')}</h2></header>
		<div class="ov-sso-body">
			<p>{t('ลิงก์ ORCA ของบริษัทไม่รวมพื้นที่นี้ ให้ทีมเพิ่มลิงก์นี้ใน Claude หรือ ChatGPT แทน แล้วเข้าสู่ระบบด้วย SSO ของบริษัท', "Your company's ORCA link doesn't include it. Add this link in Claude or ChatGPT instead and sign in with company SSO.")}</p>
			<CopyField value={hub.connectURL} label={t('ลิงก์ของพื้นที่นี้', "This workspace's link")} buttonLabel={t('คัดลอกลิงก์', 'Copy link')} size="small" />
			<p class="ov-sso-steps">{t('ขั้นตอนเพิ่มลิงก์ใน Claude หรือ ChatGPT ดูได้ที่', 'For the steps in Claude or ChatGPT, see')} <a class="k-link-button" href={localeHref('/app?view=connect-ai')}>{t('เชื่อม AI ของฉัน', 'Connect my AI')}</a></p>
			<details class="ov-dev">
				<summary>{t('สำหรับนักพัฒนา', 'For developers')}</summary>
				<GatewayClientSetup endpoint={hub.connectURL} ready={isMember && active} oauth={true} companyName={companyPinned() ? company : ''} />
			</details>
		</div>
	</section>
{/if}

<style>
	.ov-created {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		margin-bottom: 20px;
		padding: 18px 20px;
		border: 1px solid var(--orca-ok-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-ok-bg);
	}
	.ov-created.quiet {
		border-color: var(--orca-line);
		background: var(--orca-surface-2);
	}
	.ov-created-icon {
		display: grid;
		flex: none;
		place-items: center;
		color: var(--orca-ok);
	}
	.ov-created.quiet .ov-created-icon {
		color: var(--orca-text-2);
	}
	.ov-created-copy {
		flex: 1;
		min-width: 0;
	}
	.ov-created h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 16px;
		font-weight: 700;
		line-height: 1.4;
	}
	.ov-created p {
		margin: 4px 0 0;
		color: var(--orca-text-2);
		font-size: 14px;
		line-height: 1.55;
	}
	.ov-message {
		margin: 12px 0 0;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-size: 13.5px;
		line-height: 1.6;
		white-space: pre-line;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.ov-created-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.ov-primary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 42px;
		padding: 0 18px;
		border: 1px solid transparent;
		border-radius: var(--orca-radius);
		background: var(--orca-citron);
		color: var(--orca-on-citron);
		font: inherit;
		font-size: 14.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.ov-primary:hover {
		background: var(--orca-citron-hover);
	}
	.ov-created-actions .k-button {
		min-height: 42px;
	}
	.ov-copy-failed {
		margin: 8px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
	}
	.ov-banner {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 20px;
		padding: 14px 16px;
		border: 1px solid var(--orca-citron-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
	}
	.ov-banner > :global(svg) {
		flex: none;
		color: var(--orca-ink);
	}
	.ov-banner > div {
		flex: 1;
		min-width: 0;
	}
	.ov-banner strong {
		display: block;
		font-size: 14.5px;
		line-height: 1.45;
	}
	.ov-banner p {
		margin: 2px 0 0;
		color: var(--orca-text-2);
		font-size: 13.5px;
		line-height: 1.5;
	}
	.ov-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	.ov-card {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.ov-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 18px 12px;
	}
	.ov-card-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--orca-ink);
		font-size: 15.5px;
		font-weight: 700;
		line-height: 1.4;
	}
	.ov-count {
		padding: 0 8px;
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.6;
	}
	.ov-link {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 4px;
		color: var(--orca-text-2);
		font-size: 13.5px;
		font-weight: 600;
		text-decoration: none;
	}
	.ov-link:hover {
		color: var(--orca-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.ov-rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ov-rows li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.ov-logo {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--orca-line);
		border-radius: 9px;
		background: var(--orca-logo-tile);
	}
	.ov-signin {
		flex: none;
		padding: 3px 10px;
		border: 1px solid var(--orca-warn-line);
		border-radius: 999px;
		background: var(--orca-warn-bg);
		color: var(--orca-warn);
		font-size: 12.5px;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}
	.ov-signin:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.ov-row-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.ov-row-copy strong {
		color: var(--orca-ink);
		font-size: 14.5px;
		font-weight: 600;
	}
	.ov-row-copy span {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.ov-card-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 12px 18px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ov-card-foot :global(svg) {
		flex: none;
		color: var(--orca-text-2);
	}
	.ov-empty {
		margin: 0;
		padding: 4px 18px 18px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.ov-usage {
		padding: 0 18px 18px;
	}
	.ov-usage-value {
		margin: 0;
		color: var(--orca-muted);
		font-size: 15px;
	}
	.ov-usage-value b {
		color: var(--orca-ink);
		font-size: 26px;
		font-weight: 700;
	}
	.ov-usage-value span {
		font-size: 13px;
	}
	.ov-meter {
		height: 6px;
		margin: 10px 0 0;
		overflow: hidden;
		border-radius: 999px;
		background: var(--orca-secondary);
	}
	.ov-meter span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--orca-ink);
	}
	.ov-meter span.high {
		background: var(--orca-warn);
	}
	.ov-usage-note {
		margin: 10px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ov-next {
		margin-top: 16px;
	}
	.ov-steps {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ov-steps li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.ov-step-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.ov-steps li.done .ov-step-icon {
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.ov-step-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.ov-step-copy strong {
		color: var(--orca-ink);
		font-size: 14.5px;
		font-weight: 600;
	}
	.ov-step-copy span {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ov-steps .k-button {
		flex: none;
	}
	.ov-next .ov-copy-failed {
		padding: 0 18px 14px;
	}
	.ov-sso {
		margin-top: 16px;
		padding-bottom: 18px;
		scroll-margin-top: 90px;
	}
	.ov-sso-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 0 18px;
	}
	.ov-sso-body > p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.ov-sso-steps .k-link-button {
		font-size: 13.5px;
	}
	.ov-dev summary {
		color: var(--orca-text-2);
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.ov-dev[open] summary {
		margin-bottom: 12px;
	}
	@media (max-width: 900px) {
		.ov-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 720px) {
		.ov-banner {
			flex-wrap: wrap;
		}
		.ov-banner .k-button {
			width: 100%;
		}
		.ov-steps li {
			flex-wrap: wrap;
			align-items: flex-start;
		}
		.ov-step-copy {
			flex-basis: calc(100% - 44px);
		}
		.ov-steps .k-button {
			margin-left: 44px;
		}
	}
</style>
