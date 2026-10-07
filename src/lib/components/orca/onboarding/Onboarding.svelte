<script lang="ts">
	import { goto } from '$app/navigation';
	import { Check } from '@lucide/svelte';
	import { catalogSource } from '$lib/orca/catalog';
	import { currentCompany } from '$lib/orca/company';
	import { localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import {
		ONBOARDING_ROLES,
		finishOnboarding,
		onboardingKey,
		pickSuggested,
		readAnswer,
		rolesKey,
		saveAnswer,
		suggestionFor,
		type OnboardingRole
	} from '$lib/orca/onboarding';
	import { programCard, programDisplayName, programLine } from '$lib/orca/program-catalog';
	import type { OrcaBootstrap, OrcaCandidate } from '$lib/services/orca';
	import { ProgramService } from '$lib/services/orca-programs';
	import { onMount } from 'svelte';
	import Brand from '../Brand.svelte';
	import AutoAllowedNotice from '../programs/AutoAllowedNotice.svelte';
	import CatalogModal from '../programs/CatalogModal.svelte';
	import ProgramLogo from '../programs/ProgramLogo.svelte';
	import ProgramRequestSheet from '../programs/ProgramRequestSheet.svelte';
	import '../app-workspace.css';
	import '../orca-system.css';
	import '../w0.css';

	// The first run (W0): two screens without the sidebar, the ORCA logo top left
	// and the company top right, two small dots for the page. Screen 1: the
	// work they look after; screen 2: connect the programs suggested for it.
	// ข้าม and เข้าใช้ ORCA finish it; the answer stays in this browser.
	let { data, page = 1, added = '', ondone }: { data: OrcaBootstrap; page?: 1 | 2; added?: string; ondone?: () => void } = $props();

	const storage = () => {
		try {
			return typeof window === 'undefined' ? undefined : window.localStorage;
		} catch {
			return undefined;
		}
	};
	const company = currentCompany();
	const doneKey = $derived(onboardingKey(company, data.currentUserID));
	const answerKey = $derived(rolesKey(company, data.currentUserID));
	let roles = $state<OnboardingRole[]>([]);
	let title = $state('');
	let sources = $state.raw<OrcaCandidate[]>([]);
	let loading = $state(true);
	let catalogOpen = $state(false);
	let requestOpen = $state(false);
	let requested = $state('');

	const operator = $derived(data.platformOperator === true);
	const justAdded = $derived(added ? data.connections.find((item) => item.id === added) : undefined);
	const suggested = $derived(pickSuggested(sources.map((source) => catalogSource(source)), roles));
	const forRole = $derived(ONBOARDING_ROLES.find((role) => role.id === suggestionFor(roles)));

	onMount(() => {
		const answer = readAnswer(storage, answerKey);
		roles = answer.roles;
		title = answer.title;
		ProgramService.candidates()
			.then((items) => (sources = items))
			.catch(() => (sources = []))
			.finally(() => (loading = false));
	});

	function toggle(role: OnboardingRole) {
		roles = roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role];
	}
	function next() {
		saveAnswer(storage, answerKey, { roles, title });
		void goto(localeHref('/app?view=welcome&page=2'), { noScroll: false });
	}
	function finish() {
		if (page === 1) saveAnswer(storage, answerKey, { roles, title });
		finishOnboarding(storage, doneKey);
		ondone?.();
		void goto(localeHref('/app'));
	}
	const connectHref = (id: string) => localeHref(`/app?view=add-program&source=${encodeURIComponent(id)}&step=connect&return=welcome`);
</script>

<div class="orca orca-app orca-workspace orca-w0 onb-page" lang={orcaLocale.value}>
	<header class="onb-top">
		<span class="onb-brand"><Brand /></span>
		<span class="onb-company">{data.organization.displayName}</span>
	</header>
	<main class="onb" class:wide={page === 2} id="orca-main">
		<div class="onb-pager" aria-label={page === 1 ? t('หน้าแรกจากสองหน้า', 'Page 1 of 2') : t('หน้าที่สองจากสองหน้า', 'Page 2 of 2')} role="img">
			<span class:on={page === 1}></span><span class:on={page === 2}></span>
		</div>
		{#if page === 1}
			<h1 id="onb-roles">{t('คุณดูแลงานด้านไหน', 'What work do you look after?')}</h1>
			<p class="onb-sub">{t('เลือกได้หลายข้อ เพื่อแนะนำโปรแกรมให้ตรงงาน', 'Choose any. We suggest programs for that work.')}</p>
			<div class="onb-chips" role="group" aria-labelledby="onb-roles">
				{#each ONBOARDING_ROLES as role (role.id)}
					<button type="button" class="onb-chip" aria-pressed={roles.includes(role.id)} onclick={() => toggle(role.id)}
						>{#if roles.includes(role.id)}<Check size={15} strokeWidth={2.25} aria-hidden="true" />{/if}{t(role.th, role.en)}</button
					>
				{/each}
			</div>
			<div class="onb-field">
				<label for="onb-title">{t('ตำแหน่ง', 'Job title')} <span>{t('ไม่บังคับ', 'Optional')}</span></label>
				<input id="onb-title" bind:value={title} maxlength="80" placeholder={t('เช่น กรรมการผู้จัดการ', 'e.g. Managing director')} autocomplete="organization-title" />
			</div>
			<div class="onb-actions">
				<button type="button" class="k-button quiet" onclick={finish}>{t('ข้าม', 'Skip')}</button>
				<button type="button" class="k-button primary lg" onclick={next}>{t('ต่อไป', 'Next')}</button>
			</div>
		{:else}
			<h1>{t('เชื่อมโปรแกรมที่ใช้', 'Connect your programs')}</h1>
			<p class="onb-sub">{forRole ? t(`แนะนำสำหรับงาน${forRole.th}`, `Suggested for ${forRole.en.toLowerCase()}`) : t('แนะนำสำหรับธุรกิจไทย', 'Suggested for Thai businesses')}</p>
			{#if loading}
				<p class="onb-status" role="status">{t('กำลังโหลดโปรแกรม…', 'Loading programs…')}</p>
			{:else}
				<ul class="onb-apps">
					{#each suggested as source (source.id)}
						{@const card = programCard(source, { connections: data.connections, operator })}
						{@const line = programLine(source)}
						<li class="onb-app">
							<ProgramLogo name={source.name} size={40} muted={card.state === 'soon'} />
							<span class="onb-app-copy"><strong>{programDisplayName(source)}</strong><small>{t(line[0], line[1])}</small></span>
							{#if card.state === 'connected'}<span class="onb-state"><Check size={14} strokeWidth={2.25} aria-hidden="true" />{t('เชื่อมแล้ว', 'Connected')}</span>
							{:else if card.state === 'soon'}<span class="onb-later">{t('เร็วๆ นี้', 'Coming soon')}</span>
							{:else}<a class="k-button small" href={connectHref(source.id)} aria-label={t(`เชื่อม ${programDisplayName(source)}`, `Connect ${programDisplayName(source)}`)}>{t('เชื่อม', 'Connect')}</a>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if justAdded}<AutoAllowedNotice connection={justAdded} />{/if}
			<div class="onb-below">
				<button type="button" class="onb-all" onclick={() => (catalogOpen = true)}>{t('ดูโปรแกรมทั้งหมด', 'See every program')}</button>
				<p class="onb-hint">{t('ใช้บัญชีของคุณเอง AI เห็นเท่าที่บัญชีนั้นเห็น', 'You use your own account: AI sees only what it can see.')}</p>
			</div>
			<div class="onb-actions">
				<a class="k-button quiet" href={localeHref('/app?view=welcome')}>{t('ย้อนกลับ', 'Back')}</a>
				<button type="button" class="k-button primary lg" onclick={finish}>{t('เข้าใช้ ORCA', 'Go to ORCA')}</button>
			</div>
		{/if}
	</main>
	<CatalogModal
		{data}
		bind:open={catalogOpen}
		returnTo="welcome"
		onrequest={(query) => {
			requested = query;
			requestOpen = true;
		}}
	/>
	<ProgramRequestSheet bind:open={requestOpen} {data} program={requested} />
</div>

<style>
	.onb-page {
		min-height: 100dvh;
		background: var(--orca-bg);
		color: var(--orca-ink);
	}
	.onb-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		height: 64px;
		padding: 0 28px;
	}
	.onb-brand {
		--orca-brand-size: 28px;
		display: inline-flex;
		color: var(--orca-ink);
	}
	.onb-company {
		min-width: 0;
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.onb {
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
		padding: 6vh 24px 96px;
	}
	.onb.wide {
		max-width: 760px;
	}
	.onb-pager {
		display: flex;
		gap: 6px;
		margin-bottom: 20px;
	}
	.onb-pager span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-line-strong);
	}
	/* Citron only on small points: the page dot. */
	.onb-pager span.on {
		background: var(--orca-citron);
		box-shadow: 0 0 0 1px var(--orca-dot-ring, rgba(21, 24, 35, 0.32));
	}
	.onb h1 {
		margin: 0;
	}
	.onb-sub {
		margin: 4px 0 24px;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.onb-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	/* Choice chips: real toggle buttons, grey and square-ish so they never read as labels. */
	.onb-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 14px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}
	.onb-chip:hover {
		background: var(--orca-hover);
	}
	.onb-chip[aria-pressed='true'] {
		border-color: var(--orca-ink);
		background: var(--orca-secondary);
		box-shadow: inset 0 0 0 1px var(--orca-ink);
		font-weight: 600;
	}
	.onb-field {
		margin-top: 24px;
	}
	.onb-field label {
		display: flex;
		justify-content: space-between;
		margin-bottom: 6px;
		font-size: 13px;
		font-weight: 500;
	}
	.onb-field label span {
		color: var(--orca-subtle);
		font-weight: 400;
	}
	.onb-field input {
		width: 100%;
		height: 40px;
		padding: 0 12px;
		border: 1px solid var(--orca-field-line, var(--orca-line-strong));
		border-radius: var(--orca-radius);
		background: var(--orca-field, var(--orca-surface));
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
	}
	.onb-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 32px;
	}
	.onb-apps {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.onb-app {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.onb-app-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.onb-app-copy strong {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.45;
	}
	.onb-app-copy small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.onb-app .k-button {
		flex: none;
	}
	.onb-state {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
	.onb-later {
		flex: none;
		color: var(--orca-subtle);
		font-size: 12.5px;
		white-space: nowrap;
	}
	.onb-status {
		margin: 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.onb-below {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		margin-top: 14px;
	}
	/* The one highlighted link: a citron underline. */
	.onb-all {
		padding: 0;
		border: 0;
		background: none;
		color: var(--orca-ink);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--orca-citron);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
		cursor: pointer;
	}
	.onb-hint {
		margin: 0;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	@media (max-width: 820px) {
		.onb-top {
			height: 56px;
			padding: 0 16px;
		}
		.onb-brand {
			--orca-brand-size: 24px;
		}
		.onb {
			padding: 16px 16px 120px;
		}
		.onb-sub {
			margin-bottom: 20px;
		}
		.onb-apps {
			grid-template-columns: minmax(0, 1fr);
		}
		.onb-app {
			padding: 12px;
		}
		/* ต่อไป / เข้าใช้ ORCA stick to the bottom at full width. */
		.onb-actions {
			position: fixed;
			right: 0;
			bottom: 0;
			left: 0;
			z-index: 5;
			margin: 0;
			padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
			border-top: 1px solid var(--orca-line);
			background: var(--orca-bg);
		}
		.onb-actions .k-button.primary {
			flex: 1;
		}
	}
	/* A narrow phone: the hint stacks under ดูโปรแกรมทั้งหมด, left-aligned (visual review fix 5). */
	@media (max-width: 480px) {
		.onb-below {
			flex-direction: column;
			align-items: flex-start;
			justify-content: flex-start;
		}
		.onb-hint {
			text-align: left;
		}
	}
</style>
