<script lang="ts">
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import { ArrowUpRight, Check } from '@lucide/svelte';

	const offers = $derived([
		{
			id: 'training',
			title: t('อบรม AI สำหรับองค์กร', 'AI training for your team'),
			description: t(
				'ให้ทีมเลือกใช้ AI เป็น และนำไปใช้กับงานของตัวเองได้',
				'Help your team choose the right AI tools and use them in their everyday work.'
			),
			image: 'training-v1',
			alt: t(
				'เพื่อนร่วมงานเรียนรู้การใช้ AI และเอกสารร่วมกันในห้องประชุม',
				'Colleagues learning to work with AI and documents in an office workshop'
			),
			items: [
				t(
					'หลักสูตรตามบทบาทและพื้นฐานของทีม',
					'A curriculum tailored to your team’s roles and experience'
				),
				t('เวิร์กช็อปจากโจทย์งานขององค์กร', 'Hands-on workshops built around your business tasks'),
				t(
					'แนวทางตรวจคำตอบและดูแลข้อมูล',
					'Practical guidance on checking answers and handling data'
				)
			],
			cta: t('สนใจอบรม AI', 'Enquire about AI training')
		},
		{
			id: 'implementation',
			title: t('วางระบบ AI สำหรับธุรกิจ', 'AI implementation for business'),
			description: t(
				'เชื่อม AI กับข้อมูลและเครื่องมือ พร้อมปรับขั้นตอนงานให้ทำงานร่วมกัน',
				'Connect AI to your data and tools, and redesign workflows so they work together.'
			),
			image: 'implementation-v1',
			alt: t(
				'ทีมงานวิเคราะห์ขั้นตอนธุรกิจจากกระดานวางแผนและข้อมูลในคอมพิวเตอร์',
				'A team mapping a business workflow with a whiteboard and laptop'
			),
			items: [
				t(
					'วิเคราะห์งานเดิมและออกแบบขั้นตอนใหม่',
					'Review existing work and design the new workflow'
				),
				t(
					'เชื่อมข้อมูล เครื่องมือ และกำหนดสิทธิ์',
					'Connect data and tools with the right access controls'
				),
				t('วางคลังความรู้ LLM Wiki และ RAG', 'Build an LLM Wiki and RAG knowledge system'),
				t('ทดสอบ ส่งมอบ และสอนทีมดูแลต่อ', 'Test, hand over and train your team to manage it')
			],
			cta: t('สนใจวางระบบ AI', 'Enquire about implementation')
		}
	]);
</script>

<section
	id="our-services"
	class="service-offers o-wrap"
	aria-label={t('บริการของทีม ORCA', 'ORCA team services')}
	tabindex="-1"
>
	{#each offers as offer, index (offer.id)}
		<article
			id={offer.id}
			class="service-offer o-reveal"
			use:reveal={{ delay: index * 90 }}
			aria-labelledby={`${offer.id}-title`}
		>
			<div class="offer-photo">
				<img
					src={`/orca/services/${offer.image}-1536.jpg`}
					srcset={`/orca/services/${offer.image}-768.jpg 768w, /orca/services/${offer.image}-1536.jpg 1536w`}
					sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1336px) calc((100vw - 144px) / 2), 596px"
					width="1536"
					height="1024"
					alt={offer.alt}
					loading="eager"
					decoding="async"
				/>
			</div>
			<h2 id={`${offer.id}-title`}>{offer.title}</h2>
			<p>{offer.description}</p>
			{#if offer.id === 'implementation'}
				<a class="knowledge-service-link" href={localeHref('/#knowledge')}
					>{t('ดูวิธีใช้คลังความรู้กับ AI', 'See how AI uses company knowledge')}<ArrowUpRight
						size={17}
						aria-hidden="true"
					/></a
				>
			{/if}
			<ul role="list">
				{#each offer.items as item}<li>
						<span class="offer-check" aria-hidden="true"><Check size={17} strokeWidth={2.2} /></span
						><span>{item}</span>
					</li>{/each}
			</ul>
			<a class="offer-contact" href={localeHref(`/start?service=${offer.id}`)}
				>{offer.cta}<ArrowUpRight size={21} aria-hidden="true" /></a
			>
		</article>
	{/each}
</section>

<style>
	.knowledge-service-link {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 8px;
		margin-top: 12px;
		min-height: 44px;
		font-size: 15px;
		font-weight: 650;
		color: #526f2a;
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	.service-offers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 52px;
		padding-block: 64px 92px;
		scroll-margin-top: 110px;
	}
	.service-offer {
		display: flex;
		flex-direction: column;
		min-width: 0;
		scroll-margin-top: 110px;
	}
	.offer-photo {
		overflow: hidden;
		border-radius: 16px;
		background: #e8ebed;
		aspect-ratio: 3 / 2;
	}
	.offer-photo img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.service-offer h2 {
		margin-top: 26px;
		font-size: clamp(25px, 2.5vw, 33px);
		font-weight: 700;
		line-height: 1.45;
		letter-spacing: -0.025em;
	}
	.service-offer p {
		margin-top: 10px;
		color: #596276;
		font-size: 18px;
		line-height: 1.85;
		min-height: 67px;
	}
	.service-offer ul {
		list-style: none;
		padding: 0;
		margin: 22px 0 26px;
	}
	.service-offer li {
		display: flex;
		align-items: flex-start;
		gap: 13px;
		min-height: 62px;
		padding-block: 17px;
		border-bottom: 1px solid #dce0e8;
		font-size: 16px;
		line-height: 1.7;
	}
	.service-offer li:last-child {
		border-bottom: 0;
	}
	.offer-check {
		flex: 0 0 26px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--o-citron);
		color: #273216;
	}
	.offer-contact {
		display: inline-flex;
		align-items: center;
		gap: 14px;
		align-self: flex-start;
		margin-top: auto;
		border-bottom: 2px solid var(--o-citron);
		min-height: 48px;
		padding: 5px 0 9px;
		font-size: 18px;
		font-weight: 650;
	}
	.offer-contact :global(svg) {
		transition: transform 180ms ease;
	}
	.offer-contact:hover :global(svg) {
		transform: translate(2px, -2px);
	}
	@media (max-width: 960px) {
		.service-offers {
			gap: 30px;
		}
		.service-offer p {
			font-size: 17px;
		}
	}
	@media (max-width: 760px) {
		.service-offers {
			grid-template-columns: minmax(0, 1fr);
			gap: 58px;
			padding-block: 38px 58px;
		}
		.service-offer h2 {
			font-size: clamp(25px, 5.8vw, 32px);
			margin-top: 22px;
		}
		.service-offer p {
			min-height: 0;
		}
		.service-offer ul {
			margin-block: 18px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.offer-contact :global(svg) {
			transition: none;
		}
	}
</style>
