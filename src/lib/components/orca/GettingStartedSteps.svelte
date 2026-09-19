<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';

	const steps = $derived([
		{
			number: '01',
			title: t('เข้าใจงานและระบบของทีม', 'Understand your work and systems'),
			description: t(
				'คุยถึงงานที่อยากให้ AI ช่วย และระบบที่ทีมใช้อยู่ เพื่อเลือกจุดเริ่มต้นที่เหมาะกับคุณ',
				'Explore the work you want AI to help with and the systems your team uses, then choose where to start.'
			)
		},
		{
			number: '02',
			title: t('ตกลงการเชื่อมต่อและสิทธิ์', 'Agree on connections and access'),
			description: t(
				'กำหนดระบบที่จะเชื่อม ข้อมูลและเครื่องมือที่ใช้ได้ รวมถึงผู้ที่มีสิทธิ์ใช้งานร่วมกัน',
				'Agree on which systems to connect, which data and tools are in scope, and who can use them.'
			)
		},
		{
			number: '03',
			title: t('เตรียมทดลองใช้และวัดผล', 'Prepare the pilot and measure progress'),
			description: t(
				'วางขั้นตอนเริ่มใช้งานและเป้าหมายที่ชัดเจน เพื่อประเมินว่า AI ช่วยงานของทีมได้อย่างไร',
				'Plan the setup and define clear goals so your team can assess how AI helps with the work.'
			)
		}
	]);
</script>

<section
	class="getting-started"
	aria-label={t('ขั้นตอนหลังส่งคำขอ', 'What happens after your request')}
>
	<h2>{t('หลังส่งคำขอ เราจะเริ่มกันอย่างไร', 'What happens after your request?')}</h2>
	<ol role="list">
		{#each steps as step (step.number)}
			<li>
				<span class="step-number" aria-hidden="true">{step.number}</span>
				<div class="step-copy">
					<h3>{step.title}</h3>
					<p>{step.description}</p>
				</div>
			</li>
		{/each}
	</ol>
	<p class="starting-scope">
		{t(
			'เริ่มจากความสามารถที่รองรับในวันนี้ พร้อมวางแผนงานสร้างหรือแก้ไขข้อมูลร่วมกับทีมคุณสำหรับระยะถัดไป',
			'Start with the capabilities available today. Together, we can plan create or update workflows for the next phase.'
		)}
	</p>
</section>

<style>
	.getting-started {
		min-width: 0;
		color: var(--o-ink, #151823);
	}
	.getting-started h2 {
		margin: 0 0 10px;
		font-size: clamp(20px, 2vw, 24px);
		font-weight: 650;
		line-height: 1.6;
		letter-spacing: -0.025em;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: 38px minmax(0, 1fr);
		align-items: start;
		gap: 15px;
		padding-block: 22px;
		border-bottom: 1px solid var(--o-line, #d9dde6);
	}
	.step-number {
		display: grid;
		place-items: center;
		min-height: 34px;
		border-radius: 7px;
		background: var(--o-citron, #d5f478);
		font-size: 12px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
		line-height: 1;
	}
	.step-copy h3 {
		margin: 1px 0 6px;
		font-size: 16px;
		font-weight: 650;
		line-height: 1.65;
	}
	.step-copy p,
	.starting-scope {
		margin: 0;
		color: var(--o-muted, #596277);
		font-size: 14px;
		line-height: 1.85;
	}
	.getting-started .starting-scope {
		margin-top: 22px;
		padding-left: 15px;
		border-left: 3px solid var(--o-citron, #d5f478);
	}
	@media (max-width: 480px) {
		li {
			gap: 12px;
			padding-block: 20px;
		}
	}
</style>
