<script lang="ts">
	import { ArrowRight, ChevronDown, CircleCheck, Info, Plus, UsersRound } from '@lucide/svelte';
	import { keepTogether } from '$lib/orca/keep-together';
	import { finishAction } from '$lib/orca/program-catalog';
	import { accessSummary } from '$lib/orca/program-tools';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaConnection, OrcaHub } from '$lib/services/orca';
	import ProgramLogo from './ProgramLogo.svelte';

	// Step 4, เสร็จ: what was connected, the per-person account requirement
	// (critique 5), and one primary next action.
	let {
		connection,
		programName,
		logoName,
		hubs,
		people,
		returnTo = '',
		anotherHref = '/app?view=add-program'
	}: {
		connection: OrcaConnection;
		programName: string;
		logoName: string;
		hubs: Pick<OrcaHub, 'id' | 'name' | 'status'>[];
		/** Active people in the company, for "ให้ทุกคนในบริษัทใช้". */
		people: number;
		returnTo?: string | null;
		/** "เชื่อมโปรแกรมอื่น": step 1 again, keeping where the person came from. */
		anotherHref?: string;
	} = $props();

	const summary = $derived(accessSummary(connection));
	const next = $derived(finishAction({ connectionID: connection.id, returnTo, hubs }));
	let chooser = $state(false);
	let chooserBox: HTMLDivElement | undefined = $state();
	function outside(event: MouseEvent) {
		if (chooser && chooserBox && !chooserBox.contains(event.target as Node)) chooser = false;
	}
</script>

<svelte:window onclick={outside} onkeydown={(event) => { if (event.key === 'Escape') chooser = false; }} />

<section class="done" aria-labelledby="done-title">
	<div class="done-head">
		<span class="done-mark"><ProgramLogo name={logoName} size={56} /><span class="done-ok"><CircleCheck size={22} aria-hidden="true" /></span></span>
		<div>
			<h1 id="done-title">{t(`เชื่อม ${programName} แล้ว`, `${programName} connected`)}</h1>
			<p>{summary.readOnly
				? t(`AI ทำได้ ${summary.count} อย่าง · อ่านอย่างเดียว`, `AI can do ${summary.count} ${summary.count === 1 ? 'thing' : 'things'} · read only`)
				: t(`AI ทำได้ ${summary.count} อย่าง · อ่านและแก้ไข`, `AI can do ${summary.count} ${summary.count === 1 ? 'thing' : 'things'} · read and change`)}</p>
		</div>
	</div>

	<p class="done-note"><Info size={16} aria-hidden="true" /><span>{#each keepTogether(connection.programAccountID
		? t(`ทุกคนที่ได้รับอนุญาตใช้บัญชีกลาง ${programName} ผ่าน AI ได้เลย ไม่ต้องลงชื่อเข้าใช้เอง เปลี่ยนบัญชีได้ที่หน้าโปรแกรม`, `Everyone allowed uses the ${programName} company account through AI without signing in. Change it on the program's page.`)
		: t(`แต่ละคนต้องมีบัญชี ${programName} ของตัวเอง แล้วลงชื่อเข้าใช้เมื่อเริ่มใช้กับ AI`, `Each person needs their own ${programName} account and signs in when they start using it with AI.`), ['เข้าใช้เอง', 'ตัวเอง']) as part, index (index)}{#if part.keep}<span class="done-keep">{part.text}</span>{:else}{part.text}{/if}{/each}</span></p>

	<div class="done-next">
		{#if next.kind === 'return'}
			<a class="k-button primary done-go" href={localeHref(next.href)}>{t('กลับไปสร้างพื้นที่ทำงาน', 'Back to the new workspace')}<ArrowRight size={16} aria-hidden="true" /></a>
		{:else if next.kind === 'everyone'}
			<a class="k-button primary done-go" href={localeHref(next.href)}><UsersRound size={16} aria-hidden="true" />{t('ให้ทุกคนในบริษัทใช้', 'Let everyone in the company use it')}</a>
			<p class="done-preview">{summary.readOnly
				? t(`ทุกคน ${people} คน · อ่านอย่างเดียว`, `Everyone (${people}) · read only`)
				: t(`ทุกคน ${people} คน · แก้ข้อมูลได้เมื่อผู้ดูแลอนุมัติ`, `Everyone (${people}) · changes need an admin's approval`)}</p>
		{:else}
			<div class="done-chooser" bind:this={chooserBox}>
				<button type="button" class="k-button primary done-go" aria-expanded={chooser} aria-controls="done-hubs" onclick={() => (chooser = !chooser)}><Plus size={16} aria-hidden="true" />{t('เพิ่มลงพื้นที่ทำงาน…', 'Add to a workspace…')}<ChevronDown size={16} aria-hidden="true" /></button>
				{#if chooser}
					<ul class="done-hubs" id="done-hubs">
						{#each next.hubs as hub (hub.id)}<li><a href={localeHref(hub.href)}>{hub.name}<ArrowRight size={15} aria-hidden="true" /></a></li>{/each}
					</ul>
				{/if}
			</div>
		{/if}
		<div class="done-more">
			<a class="k-button quiet" href={localeHref(anotherHref)}>{t('เชื่อมโปรแกรมอื่น', 'Connect another program')}</a>
			<a class="k-button quiet" href={localeHref('/app?view=servers')}>{t('ดูโปรแกรมที่เชื่อม', 'Go to Programs')}</a>
		</div>
	</div>
</section>

<style>
	.done {
		max-width: 760px;
		padding: 32px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-xl);
		background: var(--orca-surface);
	}
	.done-head {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.done-mark {
		position: relative;
		flex: none;
	}
	.done-ok {
		position: absolute;
		right: -8px;
		bottom: -8px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 3px solid var(--orca-surface);
		border-radius: 50%;
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.done h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 700;
		line-height: 1.3;
	}
	.done-head p {
		margin: 4px 0 0;
		color: var(--orca-text-2);
		font-size: 15px;
		font-weight: 600;
	}
	.done-note {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 24px 0 0;
		padding: 12px 14px;
		border-left: 3px solid var(--orca-citron);
		border-radius: 0 var(--orca-radius) var(--orca-radius) 0;
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.55;
	}
	/* A short Thai phrase stays on one line (keepTogether). */
	.done-keep {
		white-space: nowrap;
	}
	.done-note :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.done-next {
		margin-top: 28px;
	}
	:global(.orca-workspace.orca-app) .k-button.done-go {
		min-height: 48px;
		padding: 0 22px;
		font-size: 15px;
		font-weight: 600;
	}
	.done-preview {
		margin: 8px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.done-chooser {
		position: relative;
		display: inline-block;
	}
	.done-hubs {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 5;
		min-width: 280px;
		margin: 0;
		padding: 6px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-popover);
		box-shadow: var(--orca-popover-shadow);
		list-style: none;
	}
	.done-hubs a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border-radius: var(--orca-radius);
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
	}
	.done-hubs a:hover {
		background: var(--orca-hover);
	}
	.done-more {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 16px;
	}
	@media (max-width: 720px) {
		.done {
			padding: 20px;
		}
		.done h1 {
			font-size: 22px;
		}
		.done-chooser,
		.done-chooser .done-go,
		.done-next > .done-go {
			width: 100%;
		}
		.done-hubs {
			right: 0;
			min-width: 0;
		}
	}
</style>
