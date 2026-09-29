<script lang="ts">
	import { ArrowRight, BookOpen, ShieldCheck, UserPlus, Users } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { connectionReady } from '$lib/orca/activation';
	import { gatewayMemberIDs } from '$lib/orca/gateway-sources';
	import { term } from '$lib/orca/glossary';
	import {
		askablePrograms,
		firstPrompt,
		programAbilities,
		teamProgram,
		usableWorkspaces,
		workspacesWithoutMe,
		type AIState,
		type Checklist,
		type HomeFlag,
		type OwnerStepID
	} from '$lib/orca/home-setup';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap, OrcaConnection } from '$lib/services/orca';
	import StatusPill from '../ui/StatusPill.svelte';
	import PromptList from './PromptList.svelte';
	import SetupCard from './SetupCard.svelte';
	import SetupStep from './SetupStep.svelte';

	// Home in setup mode for a company owner or admin (proposal §4, the approved
	// home-first-run mockup): four required steps, then two optional ones.
	let {
		data,
		list,
		ai,
		aiApp = '',
		historyFailed = false,
		onretry,
		invite,
		knowledge,
		onskip,
		iconName = (connection: OrcaConnection) => connection.name
	}: {
		data: OrcaBootstrap;
		list: Checklist<OwnerStepID>;
		ai: AIState;
		aiApp?: string;
		historyFailed?: boolean;
		onretry?: () => void;
		invite: { done: boolean; skipped: boolean };
		knowledge: { done: boolean; skipped: boolean };
		onskip: (flag: HomeFlag) => void;
		iconName?: (connection: OrcaConnection) => string;
	} = $props();

	const step = (id: OwnerStepID) => list.steps.find((item) => item.id === id)!;
	const ready = $derived(data.connections.filter(connectionReady));
	const firstReady = $derived(ready[0]);
	// A program saved but not reviewed yet: finish it instead of adding another.
	const unreviewed = $derived(data.connections.find((connection) => connection.enabled && !connectionReady(connection)));
	const program = $derived(teamProgram(data));
	const abilities = $derived(program ? programAbilities(program) : { total: 0, read: 0, change: 0 });
	const usable = $derived(usableWorkspaces(data)[0]);
	const withoutMe = $derived(workspacesWithoutMe(data)[0]);
	const askable = $derived(askablePrograms(data));
	// Until B1 answers, connecting AI is proven by the first question: both open together.
	const merged = $derived(ai === 'unknown' && list.current === 'ai');
	const everyoneHref = $derived(program ? `/app?view=new&everyone=1&connection=${encodeURIComponent(program.id)}` : '/app?view=new');
	const chooseHref = $derived(program ? `/app?view=new&connection=${encodeURIComponent(program.id)}` : '/app?view=new');
	const readyList = $derived(ready.slice(0, 3).map((connection) => connection.name).join(', ') + (ready.length > 3 ? '…' : ''));
</script>

<SetupCard
	title={t('ขั้นตอนที่ต้องทำ', 'Steps to finish')}
	subtitle={t('ทำตามลำดับ เสร็จแล้วทีมของคุณถามข้อมูลบริษัทผ่าน AI ได้ทันที', 'Follow them in order. Then your team can ask AI about company data.')}
	steps={list.steps}
	doneCount={list.doneCount}
	remainingMinutes={list.remainingMinutes}
>
	<!-- 1 · เชื่อมโปรแกรมแรก -->
	{@const programStep = step('program')}
	<SetupStep
		n={1}
		state={programStep.state}
		title={t('เชื่อมโปรแกรมแรก', 'Connect your first program')}
		minutes={programStep.minutes}
		detail={programStep.state === 'done'
			? ready.length > 1
				? t(`เชื่อมแล้ว ${ready.length} โปรแกรม · ${readyList}`, `${ready.length} programs connected · ${readyList}`)
				: t(`${firstReady?.name} เชื่อมแล้ว · AI ทำได้ ${firstReady?.toolNames.length ?? 0} อย่าง`, `${firstReady?.name} connected · AI can do ${firstReady?.toolNames.length ?? 0} things`)
			: unreviewed
				? t(`${unreviewed.name} เชื่อมแล้ว เหลือเลือกสิ่งที่ AI ทำได้`, `${unreviewed.name} is connected. Choose what AI can do.`)
				: t('เช่น FlowAccount หรือ PEAK เริ่มต้น AI ดูข้อมูลได้อย่างเดียว', 'Such as FlowAccount or PEAK. AI starts with read-only access.')}
	>
		{#snippet lead()}{#if programStep.state === 'done'}<span class="home-logos">{#each ready.slice(0, 3) as connection (connection.id)}<CatalogIcon name={iconName(connection)} size={22} />{/each}</span>{/if}{/snippet}
		{#snippet body()}
			<div class="home-acts">
				{#if unreviewed}
					<a class="k-button primary lg" href={localeHref(`/app?view=servers&connection=${encodeURIComponent(unreviewed.id)}`)}>{t('เลือกสิ่งที่ AI ทำได้', 'Choose what AI can do')}<ArrowRight size={16} aria-hidden="true" /></a>
				{:else}
					<a class="k-button primary lg" href={localeHref('/app?view=add-program')}>{t('เชื่อมโปรแกรมแรก', 'Connect your first program')}<ArrowRight size={16} aria-hidden="true" /></a>
				{/if}
				<span class="home-acts-note">{t('แต่ละคนใช้บัญชีโปรแกรมของตัวเอง', 'Everyone uses their own program account')}</span>
			</div>
		{/snippet}
		{#snippet action()}<a class="k-button quiet" href={localeHref('/app?view=add-program')}>{t('เพิ่มโปรแกรมอื่น', 'Add another program')}</a>{/snippet}
	</SetupStep>

	<!-- 2 · ให้ทีมใช้ได้ -->
	{@const teamStep = step('team')}
	<SetupStep
		n={2}
		state={teamStep.state}
		title={t('ให้ทีมใช้ได้', 'Let your team use it')}
		minutes={teamStep.minutes}
		detail={teamStep.state === 'done' && usable
			? t(`${usable.name} · ใช้ได้ ${gatewayMemberIDs(usable).length} คน`, `${usable.name} · ${gatewayMemberIDs(usable).length} people can use it`)
			: program
				? t(`ให้ทุกคนในบริษัทถามข้อมูล ${program.name} ผ่าน AI ได้ ตั้งครั้งเดียวใช้ได้ทั้งทีม`, `Let everyone in the company ask AI about ${program.name}. Set it once for the whole team.`)
				: t('เลือกว่าใครในบริษัทใช้ AI กับโปรแกรมที่เชื่อมได้', 'Choose who in the company can use AI with the connected program.')}
	>
		{#snippet body()}
			{#if program}
				<div class="home-facts">
					<div class="home-fact">
						<span class="home-fact-icon" aria-hidden="true"><Users size={17} /></span>
						<div>
							<small>{t('ใครใช้ได้', 'Who can use it')}</small>
							<b>{t(`ทุกคนในบริษัท · ตอนนี้ ${data.members.length} คน`, `Everyone in the company · ${data.members.length} now`)}</b>
							<span>{t(`แต่ละคนใช้บัญชี ${program.name} ของตัวเอง`, `Each person uses their own ${program.name} account`)}</span>
						</div>
					</div>
					<div class="home-fact">
						<span class="home-fact-icon logo" aria-hidden="true"><CatalogIcon name={iconName(program)} size={34} /></span>
						<div>
							<small>{term('whatAICanDo', t)}</small>
							<b>{t(`${abilities.total} อย่างใน ${program.name}`, `${abilities.total} things in ${program.name}`)}</b>
							<span>{abilities.change > 0
								? t(`ดูข้อมูล ${abilities.read} อย่าง · สร้างหรือแก้ ${abilities.change} อย่าง`, `View ${abilities.read} · create or change ${abilities.change}`)
								: t('ดูข้อมูลอย่างเดียว', 'View only')}</span>
						</div>
					</div>
					<div class="home-fact">
						<span class="home-fact-icon" aria-hidden="true"><ShieldCheck size={17} /></span>
						<div>
							<small>{t('ถ้า AI จะแก้ข้อมูล', 'If AI would change data')}</small>
							{#if abilities.change > 0}
								<b>{t('ต้องให้ผู้ดูแลอนุมัติก่อน', 'An admin approves first')}</b>
								<span>{t('AI รอจนกว่าคุณหรือผู้ดูแลกดอนุมัติ', 'AI waits until you or another admin approves')}</span>
							{:else}
								<b>{t('AI แก้ข้อมูลไม่ได้', 'AI cannot change data')}</b>
								<span>{t(`${program.name} เปิดให้ดูข้อมูลอย่างเดียว`, `${program.name} is open for viewing only`)}</span>
							{/if}
						</div>
					</div>
				</div>
			{/if}
			<div class="home-acts">
				<a class="k-button primary lg" href={localeHref(everyoneHref)}>{program ? t(`ให้ทุกคนในบริษัทใช้ ${program.name}`, `Let everyone use ${program.name}`) : t('ให้ทุกคนในบริษัทใช้', 'Let everyone use it')}<ArrowRight size={16} aria-hidden="true" /></a>
				<a class="k-button quiet lg" href={localeHref(chooseHref)}>{t('เลือกคนที่ใช้ได้เอง', 'Choose people yourself')}</a>
				<span class="home-acts-note end">{t(`เปลี่ยนภายหลังได้ที่ ${term('workspaces', t)}`, `Change it later in ${term('workspaces', t)}`)}</span>
			</div>
			{#if withoutMe}
				<p class="home-aside">
					{t(`มี "${withoutMe.name}" อยู่แล้ว แต่คุณยังไม่อยู่ในนั้น`, `"${withoutMe.name}" already exists, but you're not in it.`)}
					<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(withoutMe.id)}&tab=people`)}>{t('เพิ่มตัวคุณในพื้นที่นี้', 'Add yourself to it')}</a>
				</p>
			{/if}
		{/snippet}
		{#snippet action()}
			{#if teamStep.state === 'done' && usable}<a class="k-button quiet" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(usable.id)}`)}>{t('ดูพื้นที่ทำงาน', 'View workspace')}</a>
			{:else}<button type="button" class="k-button home-off" disabled>{t('ให้ทุกคนใช้', 'Let everyone use it')}</button>{/if}
		{/snippet}
	</SetupStep>

	<!-- 3 · เชื่อม AI ของฉัน -->
	{@const aiStep = step('ai')}
	<SetupStep
		n={3}
		state={aiStep.state}
		title={term('connectMyAI', t)}
		minutes={aiStep.minutes}
		detail={aiStep.state === 'done'
			? aiApp
				? t(`${aiApp} เชื่อมแล้ว`, `${aiApp} connected`)
				: t('AI ของคุณเชื่อมกับ ORCA แล้ว', 'Your AI is connected to ORCA')
			: t('ใช้บัญชี Claude หรือ ChatGPT ที่คุณมีอยู่ เชื่อมครั้งเดียวแล้วถามได้ทุกวัน', 'Use the Claude or ChatGPT account you already have. Connect once, ask every day.')}
	>
		{#snippet body()}
			<div class="home-acts">
				<a class="k-button primary lg" href={localeHref('/app?view=connect-ai')}>{term('connectMyAI', t)}<ArrowRight size={16} aria-hidden="true" /></a>
				<span class="home-acts-note">{t('ใช้ลิงก์ ORCA ของบริษัท ไม่ต้องใช้คีย์', "Uses your company's ORCA link. No key needed.")}</span>
			</div>
			{#if merged}<p class="home-aside">{t('เชื่อมแล้ว ลองถามในขั้นที่ 4 ได้เลย ขั้นนี้จะขึ้นว่าเสร็จเมื่อคุณถามครั้งแรก', 'Connected? Try step 4. This step is marked done after your first question.')}</p>{/if}
		{/snippet}
		{#snippet action()}
			{#if aiStep.state !== 'done'}<button type="button" class="k-button home-off" disabled>{term('connectMyAI', t)}</button>{/if}
		{/snippet}
	</SetupStep>

	<!-- 4 · ลองถาม AI ครั้งแรก -->
	{@const askStep = step('ask')}
	<SetupStep
		n={4}
		state={askStep.state}
		open={merged}
		title={t('ลองถาม AI ครั้งแรก', 'Ask AI your first question')}
		minutes={askStep.minutes}
		detail={askStep.state === 'done'
			? t('คุณถาม AI ผ่าน ORCA แล้ว', 'You asked AI through ORCA')
			: askStep.state === 'current' || merged
				? t('พิมพ์ใน Claude หรือ ChatGPT แล้ว AI จะดึงข้อมูลจากโปรแกรมให้', 'Type it in Claude or ChatGPT, and AI fetches the data from the program.')
				: askable[0]
					? t(`พิมพ์ใน Claude หรือ ChatGPT เช่น “${firstPrompt(askable[0], t)}”`, `Type in Claude or ChatGPT, e.g. “${firstPrompt(askable[0], t)}”`)
					: t('พิมพ์คำถามเกี่ยวกับข้อมูลบริษัทใน Claude หรือ ChatGPT', 'Ask Claude or ChatGPT about company data')}
	>
		{#snippet body()}
			<PromptList programs={askable} {iconName} />
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

	{#snippet later()}
		<div class="home-later-head"><b>{t('ไม่บังคับ', 'Optional')}</b><span>{t('ไม่นับรวมใน 4 ขั้นตอน ช่วยให้ทีมใช้ AI ได้เต็มที่', "Not part of the 4 steps. They help your team get more from AI.")}</span></div>
		<div class="home-later-grid">
			<div class="home-option">
				<span class="home-fact-icon quiet" aria-hidden="true"><UserPlus size={17} /></span>
				<div class="home-option-copy">
					<div class="home-option-title">
						<h3>{t('ชวนทีม', 'Invite your team')}</h3>
						{#if invite.done}<StatusPill label={t('เสร็จแล้ว', 'Done')} tone="ok" />{:else if invite.skipped}<StatusPill label={t('ข้ามแล้ว', 'Skipped')} />{:else}<StatusPill label={t('ทำภายหลังได้', 'Can wait')} /><button type="button" class="home-skip" onclick={() => onskip('skip-invite')} aria-label={t('ข้าม ชวนทีม', 'Skip inviting your team')}>{t('ข้าม', 'Skip')}</button>{/if}
					</div>
					<p>{t('แต่ละคนเข้าสู่ระบบด้วย Google ของตัวเอง', 'Each person signs in with their own Google account')}</p>
				</div>
				<div class="home-option-actions">
					<a class="k-button" href={localeHref('/app?view=members&tab=invitations')}>{t('ส่งลิงก์เชิญ', 'Send an invite link')}</a>
				</div>
			</div>
			<div class="home-option">
				<span class="home-fact-icon quiet" aria-hidden="true"><BookOpen size={17} /></span>
				<div class="home-option-copy">
					<div class="home-option-title">
						<h3>{t('เพิ่มความรู้แรก', 'Add your first knowledge')}</h3>
						{#if knowledge.done}<StatusPill label={t('เสร็จแล้ว', 'Done')} tone="ok" />{:else if knowledge.skipped}<StatusPill label={t('ข้ามแล้ว', 'Skipped')} />{:else}<StatusPill label={t('ทำภายหลังได้', 'Can wait')} /><button type="button" class="home-skip" onclick={() => onskip('skip-knowledge')} aria-label={t('ข้าม เพิ่มความรู้แรก', 'Skip adding knowledge')}>{t('ข้าม', 'Skip')}</button>{/if}
					</div>
					<p>{t('สอน AI เรื่องงานของบริษัท เช่น การออกใบเสนอราคา', 'Teach AI how your company works, e.g. how to issue a quotation')}</p>
				</div>
				<div class="home-option-actions">
					<a class="k-button" href={localeHref('/app?view=knowledge&kind=knowledge&create=1')}>{knowledge.done ? t('เขียนความรู้เพิ่ม', 'Write more') : t('เขียนความรู้แรก', 'Write the first one')}</a>
				</div>
			</div>
		</div>
	{/snippet}
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
	.home-acts :global(.k-button.lg svg) {
		width: 16px;
		height: 16px;
	}
	.home-acts-note {
		margin-left: 8px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-acts-note.end {
		margin-left: auto;
	}
	.home-aside {
		margin: 14px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.home-aside.warn {
		color: var(--orca-warn);
	}
	.home-aside a {
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
	}
	.home-facts {
		display: grid;
		grid-template-columns: 1.2fr 1fr 1fr;
		margin: 20px 0 4px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	.home-fact {
		display: flex;
		gap: 12px;
		min-width: 0;
		padding: 16px 18px;
	}
	.home-fact + .home-fact {
		border-left: 1px solid var(--orca-line);
	}
	.home-fact small {
		display: block;
		color: var(--orca-muted);
		font-size: 12px;
		line-height: 1.4;
	}
	.home-fact b {
		display: block;
		margin-top: 1px;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.4;
	}
	.home-fact span:not(.home-fact-icon) {
		display: block;
		margin-top: 3px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.home-fact-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--orca-line);
		border-radius: 10px;
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	.home-fact-icon.logo {
		overflow: hidden;
		border: 0;
		background: transparent;
	}
	.home-fact-icon.quiet {
		border-color: transparent;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.home-later-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		margin-bottom: 14px;
	}
	.home-later-head b {
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 700;
	}
	.home-later-head span {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.home-later-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.home-option {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
		padding: 16px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.home-option-copy {
		flex: 1;
		min-width: 0;
	}
	.home-option-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
	}
	.home-option .home-option-title h3 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.45;
	}
	.home-option-copy p {
		margin: 1px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.home-option-actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 4px;
	}
	.home-option-actions :global(.k-button) {
		font-weight: 600;
	}
	.home-logos {
		display: inline-flex;
		flex: none;
		gap: 4px;
	}
	.home-skip {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-muted);
		font: inherit;
		font-size: 12.5px;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.home-skip:hover {
		color: var(--orca-ink);
	}
	@media (max-width: 1100px) {
		.home-facts {
			grid-template-columns: 1fr;
		}
		.home-fact + .home-fact {
			border-top: 1px solid var(--orca-line);
			border-left: 0;
		}
		.home-later-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 720px) {
		.home-acts :global(.k-button.lg) {
			flex: 1 1 100%;
			justify-content: center;
			padding-block: 10px;
			text-align: center;
		}
		.home-acts-note,
		.home-acts-note.end {
			margin-left: 0;
		}
		.home-option {
			flex-wrap: wrap;
		}
		.home-option-actions {
			flex-basis: 100%;
			justify-content: flex-end;
		}
	}
</style>
