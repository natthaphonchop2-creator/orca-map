<script lang="ts">
	import { onMount } from 'svelte';
	import { Search } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import { memberName, type OrcaBootstrap } from '$lib/services/orca';
	import { SkillsService, type OrcaSkill } from '$lib/services/orca-skills';
	import PageHeader from '../ui/PageHeader.svelte';

	// Skills (W0, view=skills): the company's ready-made work for AI. Shown only
	// with the company's `skills` feature (the page and the menu item alike);
	// the backend is not built yet, so the list comes from a stub that has none
	// and the page shows its empty state.
	let { data }: { data: OrcaBootstrap } = $props();
	let skills = $state<OrcaSkill[]>();
	let query = $state('');
	onMount(() => {
		let alive = true;
		void SkillsService.list()
			.then((items) => {
				if (alive) skills = items;
			})
			.catch(() => {
				if (alive) skills = [];
			});
		return () => {
			alive = false;
		};
	});
	const shown = $derived((skills ?? []).filter((skill) => `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
	const connection = (id: string) => data.connections.find((item) => item.id === id);
	const owner = (id: string) => {
		const member = data.members.find((item) => item.id === id);
		return member ? memberName(member) : '';
	};
	// Where a first Skill can start (Owners and Admins); making one comes with the backend.
	const starters = [
		{ name: t('สรุปยอดขายเดือนนี้', "This month's sales summary"), program: 'FlowAccount', meta: 'FlowAccount' },
		{ name: t('ค่าใช้จ่ายรายสัปดาห์', 'Weekly expenses'), program: 'PEAK', meta: 'PEAK' },
		{ name: t('ตอบลูกค้าใน LINE', 'Answer customers on LINE'), program: 'LINE OA (Messaging API)', meta: t('LINE OA · คลังความรู้', 'LINE OA · Knowledge') }
	];
</script>

<PageHeader title={term('skills', t)} subtitle={t('งานสำเร็จรูปที่ทีมเรียกใช้ใน AI', 'Ready-made work your team calls from AI.')} />

{#if skills === undefined}
	<p class="sk-status" role="status">{t('กำลังโหลด…', 'Loading…')}</p>
{:else if skills.length === 0}
	<section class="sk-empty" aria-labelledby="sk-empty-title">
		<h2 id="sk-empty-title">{t('ยังไม่มี Skill', 'No Skills yet')}</h2>
		<p>{t('สร้างครั้งเดียว ทุกคนเรียกใช้ใน ChatGPT หรือ Claude ได้', 'Make one once; everyone calls it from ChatGPT or Claude.')}</p>
	</section>
	{#if data.canManage}
		<section class="sk-starters" aria-labelledby="sk-starters-title">
			<h2 id="sk-starters-title">{t('เริ่มจากตัวอย่าง', 'Start from an example')}</h2>
			<ul class="sk-panel">
				{#each starters as starter (starter.name)}
					<li class="sk-row">
						<CatalogIcon name={starter.program} size={32} />
						<span class="sk-copy"><strong>{starter.name}</strong><small>{starter.meta}</small></span>
						<button type="button" class="k-button small" disabled title={term('soon', t)}>{t('ใช้แบบนี้', 'Use this')}</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{:else}
	<div class="sk-toolbar">
		<label class="sk-search">
			<Search size={16} aria-hidden="true" />
			<span class="sr-only">{t('ค้นหา Skill', 'Search Skills')}</span>
			<input type="search" bind:value={query} placeholder={t('ค้นหา Skill', 'Search Skills')} />
		</label>
	</div>
	<ul class="sk-grid">
		{#each shown as skill (skill.id)}
			<li class="sk-card">
				<div>
					<strong class="sk-name">{skill.name}</strong>
					<p class="sk-desc">{skill.description}</p>
				</div>
				<div class="sk-foot">
					<span class="sk-programs">
						{#each skill.connectionIDs as id (id)}{@const program = connection(id)}{#if program}<CatalogIcon name={program.name} size={22} />{/if}{/each}
						{#if skill.usesKnowledge}<span class="sk-kn">+ {term('knowledge', t)}</span>{/if}
					</span>
					<span class="sk-meta"
						>{skill.status === 'draft' ? t('ฉบับร่าง', 'Draft') : t(`ใช้ ${skill.uses ?? 0} ครั้ง`, `Used ${skill.uses ?? 0} times`)}{#if owner(skill.ownerID)}{' · '}{owner(skill.ownerID)}{/if}</span
					>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.sk-status {
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.sk-empty {
		padding: 40px 24px 28px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		text-align: center;
	}
	.sk-empty h2 {
		margin: 0;
		font-size: 15px;
	}
	.sk-empty p {
		max-width: 44ch;
		margin: 6px auto 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.sk-starters {
		margin-top: 20px;
	}
	.sk-starters h2 {
		margin: 0 0 10px;
		font-size: 15px;
	}
	.sk-panel,
	.sk-grid {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.sk-panel {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.sk-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
	}
	.sk-row + .sk-row {
		border-top: 1px solid var(--orca-line);
	}
	.sk-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.sk-copy strong {
		font-size: 13.5px;
		font-weight: 500;
	}
	.sk-copy small,
	.sk-meta,
	.sk-kn {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.sk-toolbar {
		margin-bottom: 16px;
	}
	.sk-search {
		position: relative;
		display: block;
		max-width: 360px;
		color: var(--orca-subtle);
	}
	.sk-search :global(svg) {
		position: absolute;
		top: 50%;
		left: 11px;
		transform: translateY(-50%);
	}
	.sk-search input {
		width: 100%;
		height: 32px;
		padding: 0 12px 0 34px;
		border: 1px solid var(--orca-field-line, var(--orca-line-strong));
		border-radius: var(--orca-radius-sm);
		background: var(--orca-field, var(--orca-surface));
		color: var(--orca-ink);
		font: inherit;
		font-size: 13.5px;
	}
	.sk-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 12px;
	}
	.sk-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.sk-name {
		font-size: 13.5px;
		font-weight: 600;
	}
	.sk-desc {
		display: -webkit-box;
		margin: 2px 0 0;
		overflow: hidden;
		color: var(--orca-muted);
		font-size: 12px;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.sk-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: auto;
		padding-top: 12px;
		border-top: 1px solid var(--orca-line);
	}
	.sk-programs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	@media (max-width: 720px) {
		.sk-empty {
			padding: 28px 16px 20px;
		}
		.sk-search {
			max-width: none;
		}
	}
</style>
