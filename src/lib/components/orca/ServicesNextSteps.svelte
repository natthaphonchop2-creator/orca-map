<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import type { ServiceInterest } from '$lib/orca/services';

	let { service }: { service: ServiceInterest } = $props();
	const steps = $derived([
		{
			title: t('เริ่มจากเป้าหมายของทีม', 'Start with your team’s goals'),
			description: t(
				'คุยถึงงานที่อยากพัฒนา ประสบการณ์ใช้ AI และระบบที่ใช้อยู่ เพื่อเข้าใจบริบทขององค์กรคุณ',
				'Explore the work you want to improve, your experience with AI and the systems you use.'
			)
		},
		{
			title:
				service === 'training'
					? t('ออกแบบการอบรมให้ตรงกับงาน', 'Design training around your work')
					: t('ออกแบบแนวทางที่เหมาะกับองค์กร', 'Shape an approach for your organization'),
			description:
				service === 'training'
					? t(
							'เลือกหัวข้อและกิจกรรมจากงานของผู้เข้าอบรม ให้ทีมเห็นวิธีนำ AI ไปใช้ต่อได้',
							'Choose topics and exercises around participants’ work, so the team can put what they learn into practice.'
						)
					: t(
							'เลือกงานที่จะเริ่ม ปรับขั้นตอนที่เกี่ยวข้อง และกำหนดบทบาทของคน ข้อมูล และ AI ให้ชัดเจน',
							'Choose where to start, rethink the relevant workflow and define the roles of people, data and AI.'
						)
		},
		{
			title: t('ตกลงขอบเขตและวิธีวัดผล', 'Agree on scope and measures of success'),
			description: t(
				'ร่วมกำหนดสิ่งส่งมอบ รูปแบบการทำงาน และเป้าหมายที่ใช้ประเมินผลก่อนเริ่มโครงการ',
				'Agree on deliverables, how we will work together and the goals for evaluating the project.'
			)
		}
	]);
</script>

<section class="service-steps" aria-labelledby="service-next-title">
	<h2 id="service-next-title">
		{t('จากการพูดคุย สู่แผนที่เหมาะกับคุณ', 'From a conversation to a plan that fits')}
	</h2>
	<ol role="list">
		{#each steps as step, index}
			<li>
				<span aria-hidden="true">0{index + 1}</span>
				<div>
					<h3>{step.title}</h3>
					<p>{step.description}</p>
				</div>
			</li>
		{/each}
	</ol>
</section>

<style>
	.service-steps {
		color: var(--o-ink);
		min-width: 0;
	}
	h2 {
		font-size: clamp(20px, 2vw, 24px);
		font-weight: 650;
		line-height: 1.6;
		letter-spacing: -0.025em;
		margin: 0 0 10px;
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
		border-bottom: 1px solid var(--o-line);
	}
	li > span {
		display: grid;
		place-items: center;
		min-height: 34px;
		border-radius: 7px;
		background: var(--o-citron);
		font-size: 12px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	h3 {
		font-size: 16px;
		font-weight: 650;
		line-height: 1.65;
		margin: 1px 0 6px;
	}
	p {
		color: var(--o-muted);
		font-size: 14px;
		line-height: 1.85;
		margin: 0;
	}
</style>
