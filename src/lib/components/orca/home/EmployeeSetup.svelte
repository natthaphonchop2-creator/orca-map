<script lang="ts">
	import { ArrowRight, Check, Copy, KeyRound } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { term } from '$lib/orca/glossary';
	import { firstPrompt, type AccountState, type AIState, type Checklist, type EmployeeStepID, type ProgramAccount } from '$lib/orca/home-setup';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaConnection } from '$lib/services/orca';
	import StatusPill, { type StatusTone } from '../ui/StatusPill.svelte';
	import { copyFeedback, copyText } from '../ui/copy';
	import PromptList from './PromptList.svelte';
	import SetupCard from './SetupCard.svelte';
	import SetupStep from './SetupStep.svelte';

	// Home in setup mode for an employee: 1 เชื่อม AI ของฉัน → 2 sign in to each
	// program of their workspaces → 3 ask. Without a workspace, they first ask
	// an admin for access (generic copy: employees never see admins' names).
	let {
		list,
		ai,
		aiApp = '',
		aiOnly = '',
		accounts,
		programs,
		noWorkspace = false,
		requestText = '',
		historyFailed = false,
		onretry,
		iconName = (connection: OrcaConnection) => connection.name
	}: {
		list: Checklist<EmployeeStepID>;
		ai: AIState;
		aiApp?: string;
		/** `limited`: where the viewer's AI reaches, e.g. "เฉพาะ ฝ่ายขาย" (B3 follow-up). */
		aiOnly?: string;
		accounts: ProgramAccount[];
		/** The programs of the viewer's usable workspaces, for the first question. */
		programs: OrcaConnection[];
		noWorkspace?: boolean;
		requestText?: string;
		historyFailed?: boolean;
		onretry?: () => void;
		iconName?: (connection: OrcaConnection) => string;
	} = $props();

	const step = (id: EmployeeStepID) => list.steps.find((item) => item.id === id)!;
	// Without a workspace nothing is "next" yet: the request comes first.
	const stateOf = (id: EmployeeStepID) => (noWorkspace && step(id).state === 'current' ? 'todo' : step(id).state);
	const merged = $derived(ai === 'unknown' && list.current === 'ai' && !noWorkspace);
	const signedIn = $derived(accounts.filter((account) => account.state === 'signed-in').length);
	const accountPill = (state: AccountState): { label: string; tone: StatusTone } =>
		state === 'signed-in' ? { label: t('ลงชื่อเข้าใช้แล้ว', 'Signed in'), tone: 'ok' }
			: state === 'needed' ? { label: t('ยังไม่ได้ลงชื่อเข้าใช้', 'Not signed in'), tone: 'warn' }
			: state === 'waiting' ? { label: t('รอผู้ดูแลเปิดใช้', 'Waiting for an admin'), tone: 'neutral' }
			: state === 'checking' ? { label: t('กำลังตรวจ…', 'Checking…'), tone: 'neutral' }
			: { label: t('ตรวจไม่ได้', "Couldn't check"), tone: 'neutral' };

	let copied = $state(false);
	let copyFailed = $state(false);
	const feedback = copyFeedback((value) => (copied = value));
	onDestroy(() => feedback.dispose());
	async function copyRequest() {
		copyFailed = false;
		const ok = await copyText(requestText, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) feedback.copied();
		else copyFailed = true;
	}
</script>

<SetupCard
	title={t('ขั้นตอนที่ต้องทำ', 'Steps to finish')}
	subtitle={noWorkspace
		? t('เริ่มจากขอสิทธิ์ใช้ข้อมูลบริษัทจากผู้ดูแล', 'Start by asking an admin for access to company data')
		: t('ทำตามลำดับ เสร็จแล้วคุณถามข้อมูลบริษัทผ่าน AI ได้ทันที', 'Follow them in order. Then you can ask AI about company data.')}
	steps={list.steps.map((item) => ({ state: stateOf(item.id) }))}
	doneCount={list.doneCount}
	remainingMinutes={list.remainingMinutes}
>
	{#snippet intro()}
		{#if noWorkspace}
			<div class="home-request">
				<span class="home-request-icon" aria-hidden="true"><KeyRound size={18} /></span>
				<div class="home-request-main">
					<h3>{t('ขอสิทธิ์จากผู้ดูแล', 'Ask an admin for access')}</h3>
					<p>{t('คุณยังไม่ได้อยู่ในพื้นที่ทำงาน AI ที่ใช้ได้ ส่งข้อความนี้ให้ผู้ดูแลบริษัท เพื่อขอให้เพิ่มคุณ', "You're not in a usable AI workspace yet. Send this to a company admin and ask them to add you.")}</p>
					<blockquote class="home-request-text">{requestText}</blockquote>
					<div class="home-request-acts">
						<button type="button" class="k-button primary" onclick={copyRequest}>
							{#if copied}<Check size={16} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกข้อความขอสิทธิ์', 'Copy the request')}{/if}
						</button>
						<span>{t('ผู้ดูแลเพิ่มคุณแล้ว หน้านี้จะแสดงขั้นตอนถัดไปเอง', 'Once an admin adds you, this page shows the next step.')}</span>
					</div>
					<span class="home-request-announce" role="status" aria-live="polite">{copied ? t('คัดลอกแล้ว', 'Copied') : ''}</span>
					{#if copyFailed}<p class="home-request-failed" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}
				</div>
			</div>
		{/if}
	{/snippet}

	<!-- 1 · เชื่อม AI ของฉัน -->
	{@const aiStep = step('ai')}
	<SetupStep
		n={1}
		state={stateOf('ai')}
		title={term('connectMyAI', t)}
		minutes={aiStep.minutes}
		detail={aiStep.state === 'done'
			? aiApp ? t(`${aiApp} เชื่อมแล้ว`, `${aiApp} connected`) : t('AI ของคุณเชื่อมกับ ORCA แล้ว', 'Your AI is connected to ORCA')
			: t('ใช้บัญชี Claude หรือ ChatGPT ที่คุณมีอยู่ เชื่อมครั้งเดียวแล้วถามได้ทุกวัน', 'Use the Claude or ChatGPT account you already have. Connect once, ask every day.')}
	>
		{#snippet body()}
			<div class="home-acts">
				<a class="k-button primary lg" href={localeHref('/app?view=connect-ai')}>{term('connectMyAI', t)}<ArrowRight size={16} aria-hidden="true" /></a>
				<span class="home-acts-note">{t('ใช้ลิงก์ ORCA ของบริษัท ไม่ต้องใช้คีย์', "Uses your company's ORCA link. No key needed.")}</span>
			</div>
			{#if merged}<p class="home-aside">{t('เชื่อมแล้ว ลองถามในขั้นที่ 3 ได้เลย ขั้นนี้จะขึ้นว่าเสร็จเมื่อคุณถามครั้งแรก', 'Connected? Try step 3. This step is marked done after your first question.')}</p>{:else if ai === 'revoked'}<p class="home-aside">{t('คุณเพิ่งตัดการเชื่อม AI ขั้นนี้จะขึ้นว่าเสร็จเมื่อ ORCA ตรวจเจอ AI ที่ยังเชื่อมอยู่', 'You just disconnected your AI. This step is marked done once ORCA finds an AI that is still connected.')}</p>{:else if ai === 'limited'}<p class="home-aside">{t(`AI ของคุณใช้ได้${aiOnly} ใช้ลิงก์ ORCA ของบริษัทเพื่อให้ AI ใช้ได้ทุกพื้นที่ทำงานของคุณ`, `Your AI reaches ${aiOnly}. Use the company's ORCA link so it reaches all your workspaces.`)}</p>{/if}
		{/snippet}
		{#snippet action()}
			{#if aiStep.state !== 'done'}<button type="button" class="k-button home-off" disabled>{term('connectMyAI', t)}</button>{/if}
		{/snippet}
	</SetupStep>

	<!-- 2 · ลงชื่อเข้าใช้บัญชีโปรแกรมของคุณ -->
	{@const accountsStep = step('accounts')}
	<SetupStep
		n={2}
		state={stateOf('accounts')}
		open={!noWorkspace && accounts.length > 0 && accountsStep.state !== 'done'}
		title={t('ลงชื่อเข้าใช้บัญชีโปรแกรมของคุณ', 'Sign in to your program accounts')}
		minutes={accountsStep.minutes}
		detail={accountsStep.state === 'done'
			? t(`ลงชื่อเข้าใช้ครบ ${signedIn} โปรแกรมแล้ว`, `Signed in to all ${signedIn} programs`)
			: t('AI ใช้ข้อมูลตามสิทธิ์ในบัญชีโปรแกรมของคุณเอง', 'AI uses data within what your own program account allows')}
	>
		{#snippet body()}
			<ul class="home-accounts">
				{#each accounts as account (account.id)}
					{@const pill = accountPill(account.state)}
					<li>
						<CatalogIcon name={account.icon} size={28} />
						<strong>{account.name}</strong>
						<StatusPill label={pill.label} tone={pill.tone} />
						{#if account.state === 'needed' || account.state === 'unknown'}<a class="k-button small" href={localeHref('/app?view=connect-ai#accounts')}>{t('ลงชื่อเข้าใช้', 'Sign in')}</a>{/if}
					</li>
				{/each}
			</ul>
			<p class="home-aside">{t('ไม่มีบัญชีของตัวเอง? ขอให้ผู้ดูแลเพิ่มผู้ใช้ให้คุณในโปรแกรมนั้น', "No account of your own? Ask an admin to add you as a user in that program.")}</p>
		{/snippet}
		{#snippet action()}
			{#if accountsStep.state !== 'done'}<button type="button" class="k-button home-off" disabled>{t('ลงชื่อเข้าใช้', 'Sign in')}</button>{/if}
		{/snippet}
	</SetupStep>

	<!-- 3 · ลองถาม AI ครั้งแรก -->
	{@const askStep = step('ask')}
	<SetupStep
		n={3}
		state={stateOf('ask')}
		open={merged}
		title={t('ลองถาม AI ครั้งแรก', 'Ask AI your first question')}
		minutes={askStep.minutes}
		detail={askStep.state === 'done'
			? t('คุณถาม AI ผ่าน ORCA แล้ว', 'You asked AI through ORCA')
			: programs[0] && stateOf('ask') === 'todo' && !merged
				? t(`พิมพ์ใน Claude หรือ ChatGPT เช่น “${firstPrompt(programs[0], t)}”`, `Type in Claude or ChatGPT, e.g. “${firstPrompt(programs[0], t)}”`)
				: t('พิมพ์ใน Claude หรือ ChatGPT แล้ว AI จะดึงข้อมูลจากโปรแกรมให้', 'Type it in Claude or ChatGPT, and AI fetches the data from the program.')}
	>
		{#snippet body()}
			<PromptList {programs} {iconName} />
			{#if historyFailed}
				<p class="home-aside warn" role="alert">{t('ตรวจไม่ได้ว่าคุณถามแล้วหรือยัง', "Couldn't check whether you've asked yet.")} <button type="button" class="k-link-button" onclick={onretry}>{t('ลองอีกครั้ง', 'Try again')}</button></p>
			{:else}
				<p class="home-aside">{t('ถามแล้ว ขั้นนี้จะขึ้นว่าเสร็จเอง', 'Once you ask, this step is marked done.')}</p>
			{/if}
		{/snippet}
		{#snippet action()}
			{#if askStep.state === 'done'}<a class="k-button quiet" href={localeHref('/app?view=executions')}>{term('usageHistory', t)}</a>
			{:else}<button type="button" class="k-button home-off" disabled>{t('คัดลอกคำถามนี้', 'Copy this question')}</button>{/if}
		{/snippet}
	</SetupStep>
</SetupCard>

<style>
	.home-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 18px;
	}
	.home-acts :global(.k-button.lg) {
		min-height: 50px;
		padding: 0 22px;
		font-size: 15px;
		font-weight: 600;
	}
	.home-acts-note {
		margin-left: 8px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-aside {
		margin: 14px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.home-aside.warn {
		color: var(--orca-warn);
	}
	.home-accounts {
		display: grid;
		gap: 0;
		margin: 16px 0 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		list-style: none;
	}
	.home-accounts li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 12px 14px;
		background: var(--orca-surface);
	}
	.home-accounts li + li {
		border-top: 1px solid var(--orca-line-soft);
	}
	.home-accounts strong {
		flex: 1 1 auto;
		min-width: 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
	}
	.home-request {
		display: flex;
		gap: 16px;
		margin: 0 12px 8px;
		padding: 22px 20px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 14px;
		background: var(--orca-surface);
		box-shadow: var(--orca-popover-shadow);
	}
	.home-request-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
	}
	.home-request-main {
		flex: 1;
		min-width: 0;
	}
	.home-request .home-request-main h3 {
		margin: 2px 0 0;
		color: var(--orca-ink);
		font-size: 20px;
		font-weight: 700;
		line-height: 1.4;
	}
	.home-request .home-request-main p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 15px;
	}
	.home-request-text {
		margin: 16px 0 0;
		padding: 14px 16px;
		border: 1px solid var(--orca-line);
		border-left: 3px solid var(--orca-citron);
		border-radius: 0 var(--orca-radius) var(--orca-radius) 0;
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.6;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.home-request-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		margin-top: 16px;
	}
	.home-request-acts :global(.k-button) {
		min-height: 44px;
		padding: 0 18px;
		font-weight: 600;
	}
	.home-request-acts span {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-request-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.home-request .home-request-failed {
		color: var(--orca-deny);
		font-size: 12.5px;
	}
	@media (max-width: 720px) {
		.home-acts :global(.k-button.lg) {
			flex: 1 1 100%;
			justify-content: center;
			padding-block: 10px;
			text-align: center;
		}
		.home-acts-note {
			margin-left: 0;
		}
		.home-request {
			flex-direction: column;
			margin: 0 8px 8px;
			padding: 18px 14px;
		}
	}
</style>
