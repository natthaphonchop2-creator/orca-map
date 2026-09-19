<script lang="ts">
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import { Armchair, ArrowUpRight, Building2, Check, Rocket } from '@lucide/svelte';

	const plans = $derived([
		{
			id: 'free',
			name: 'Free',
			icon: Armchair,
			description: t('สำหรับเริ่มต้นเชื่อม AI กับงานของคุณ', 'For getting started with AI tools'),
			price: '$0',
			period: t('/เดือน', '/month'),
			priceNote: t('ไม่ต้องใช้บัตรเครดิต', 'No credit card required'),
			platformFee: t('ค่าบริการแพลตฟอร์ม $0', '$0 platform fee'),
			cta: t('เริ่มต้นฟรี', 'Start for free'),
			features: [
				{
					label: t('2,000 ครั้ง/เดือน', '2,000 auth events / month'),
					detail: t(
						'การยืนยันสิทธิ์เชื่อมต่อ เพื่อให้ AI เชื่อมกับบัญชีผู้ใช้',
						'Connect agents to user accounts.'
					)
				},
				{
					label: t('2,000 ครั้ง/เดือน', '2,000 tool calls / month'),
					detail: t(
						'การเรียกใช้เครื่องมือ เพื่อให้ AI ลงมือทำงาน',
						'Take actions through connected tools.'
					)
				},
				{
					label: 'ORCA Cloud',
					detail: t('ใช้งานบนคลาวด์ที่ ORCA ดูแลให้ทั้งหมด', 'Fully managed by ORCA.')
				},
				{
					label: t('ชุมชนผู้ใช้งาน', 'Community support'),
					detail: t(
						'ขอความช่วยเหลือผ่าน Discord และ GitHub',
						'Get help through Discord and GitHub.'
					)
				}
			]
		},
		{
			id: 'team',
			name: 'Team',
			icon: Rocket,
			description: t('สำหรับทีมที่ต้องการขยายการใช้งาน', 'For teams ready to scale their usage'),
			price: '$25',
			period: t('/เดือน', '/month'),
			priceNote: t('+ ค่าบริการตามการใช้งาน', '+ usage'),
			platformFee: t('ค่าบริการแพลตฟอร์ม $25/เดือน', '$25/month platform fee'),
			cta: t('เริ่มต้นกับ Team', 'Start with Team'),
			features: [
				{
					label: t('$0.10 / ครั้ง', '$0.10 / auth event'),
					detail: t('การยืนยันสิทธิ์เชื่อมต่อกับบัญชีผู้ใช้', 'Connect agents to user accounts.')
				},
				{
					label: t('$0.01 / ครั้ง', '$0.01 / tool call'),
					detail: t('การเรียกใช้เครื่องมือเพื่อทำงาน', 'Take actions through connected tools.')
				},
				{
					label: 'ORCA Cloud',
					detail: t('ใช้งานบนคลาวด์ที่ ORCA ดูแลให้ทั้งหมด', 'Fully managed by ORCA.')
				},
				{
					label: t('ทีมดูแลทางอีเมล', 'Email support'),
					detail: t('ตอบกลับภายในวันทำการถัดไป', 'Response by the next business day.')
				}
			]
		},
		{
			id: 'enterprise',
			name: 'Enterprise',
			icon: Building2,
			description: t(
				'สำหรับองค์กรที่มีความต้องการเฉพาะ',
				'For organizations with tailored requirements'
			),
			price: 'Custom',
			period: '',
			priceNote: t('กำหนดราคาตามขอบเขตงาน', 'Pricing tailored to your needs'),
			platformFee: t('วางแพ็กเกจร่วมกับทีม ORCA', 'Plan your package with ORCA'),
			cta: t('คุยกับทีมขาย', 'Talk to sales'),
			features: [
				{
					label: t('แพ็กเกจใช้งานรายปี', 'Annual usage bundles'),
					detail: t(
						'รวมการยืนยันสิทธิ์เชื่อมต่อและการเรียกใช้เครื่องมือ',
						'Auth events and tool calls in one annual package.'
					)
				},
				{
					label: t('ส่วนลดตามปริมาณใช้งาน', 'Volume pricing'),
					detail: t(
						'ราคาพิเศษสำหรับการใช้งานเพิ่มเติมเมื่อขยายระบบ',
						'Discounted additional usage at scale.'
					)
				},
				{
					label: t('เลือกรูปแบบการติดตั้งได้', 'Flexible deployment'),
					detail: t(
						'ORCA Cloud, VPC หรือระบบแยกจากอินเทอร์เน็ต (air-gapped)',
						'ORCA Cloud, your VPC, or an air-gapped environment.'
					)
				},
				{
					label: t('ดูแลตลอด 24 ชั่วโมง ทุกวัน', '24/7 support'),
					detail: t('พร้อมข้อตกลงระดับบริการ (SLA)', 'Backed by a service level agreement.')
				},
				{
					label: t('ทีมดูแลเฉพาะองค์กร', 'Dedicated team'),
					detail: t(
						'วิศวกรประจำโครงการ (FDE) และผู้ดูแลบัญชี',
						'A dedicated forward-deployed engineer and account team.'
					)
				},
				{
					label: t('การจัดการสำหรับองค์กร', 'Enterprise controls'),
					detail: t(
						'SSO, สิทธิ์ตามบทบาท (RBAC), ประวัติการใช้งาน และคลังเครื่องมือส่วนตัว',
						'SSO, RBAC, audit logs and a private registry.'
					)
				}
			]
		}
	]);
</script>

<section class="orca-pricing-grid" aria-label={t('แพ็กเกจและราคา', 'Plans and pricing')}>
	{#each plans as plan, index (plan.id)}
		<article
			class="orca-price-card o-reveal"
			use:reveal={{ delay: index * 80 }}
			class:orca-price-featured={plan.id === 'team'}
			class:orca-price-enterprise={plan.id === 'enterprise'}
			data-plan={plan.id}
			aria-labelledby={`pricing-${plan.id}-name`}
		>
			{#if plan.id === 'team'}
				<p class="orca-price-recommended">
					<span aria-hidden="true"></span>{t('แพ็กเกจแนะนำ', 'Recommended')}
				</p>
			{/if}
			<header class="orca-price-header">
				<div class="orca-price-icon" aria-hidden="true">
					<plan.icon size={27} strokeWidth={1.65} />
				</div>
				<h2 id={`pricing-${plan.id}-name`}>{plan.name}</h2>
				<p class="orca-price-description">{plan.description}</p>
				<div class="orca-price-amount">
					<strong class:orca-price-custom={plan.id === 'enterprise'}>{plan.price}</strong>
					{#if plan.period}<span>{plan.period}</span>{/if}
				</div>
				<p class="orca-price-note">{plan.priceNote}</p>
				<a class="orca-price-cta" href={localeHref(`/start?plan=${plan.id}`)}>
					<span>{plan.cta}</span><ArrowUpRight size={18} aria-hidden="true" />
				</a>
				<p class="orca-price-platform">{plan.platformFee}</p>
			</header>
			<div class="orca-price-inclusions">
				<h3>{t('สิ่งที่รวมในแพ็กเกจ', 'What’s included')}</h3>
				<ul>
					{#each plan.features as feature}
						<li>
							<span class="orca-price-check" aria-hidden="true"
								><Check size={15} strokeWidth={2.4} /></span
							>
							<div>
								<strong>{feature.label}</strong>
								<p>{feature.detail}</p>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</article>
	{/each}
</section>

<style>
	.orca-pricing-grid {
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: stretch;
		gap: 24px;
		width: 100%;
		padding-top: 18px;
	}
	.orca-pricing-grid::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset: -46px 0 22%;
		pointer-events: none;
		background:
			radial-gradient(ellipse at 44% 10%, rgb(215 244 113 / 19%), transparent 53%),
			radial-gradient(ellipse at 91% 32%, rgb(132 101 229 / 8%), transparent 46%);
	}
	.orca-price-card {
		--pricing-text: var(--o-ink, #151823);
		--pricing-muted: var(--o-muted, #596276);
		--pricing-line: var(--o-line, #dce0e8);
		position: relative;
		min-width: 0;
		padding: 32px 26px;
		border: 1px solid var(--pricing-line);
		border-radius: 20px;
		background: #fff;
		color: var(--pricing-text);
		box-shadow:
			0 12px 30px -22px rgb(21 24 35 / 24%),
			inset 0 1px 0 rgb(255 255 255 / 75%);
		transition:
			border-color 0.22s ease,
			box-shadow 0.22s ease;
	}
	.orca-price-featured {
		--pricing-text: #f5f6fa;
		--pricing-muted: #bcc4d4;
		--pricing-line: #42485a;
		border-color: var(--o-ink, #151823);
		background:
			radial-gradient(ellipse at 100% 0, rgb(214 244 121 / 10%), transparent 48%),
			var(--o-ink, #151823);
		box-shadow:
			0 20px 44px -25px rgb(21 24 35 / 42%),
			inset 0 1px 0 rgb(215 244 113 / 12%);
	}
	.orca-price-enterprise {
		background: color-mix(in oklch, var(--o-violet, #8465e5) 3%, white);
		border-color: color-mix(in oklch, var(--o-violet, #8465e5) 16%, var(--o-line, #dce0e8));
	}
	.orca-price-card:focus-within {
		border-color: color-mix(in oklch, var(--o-violet, #8465e5) 38%, var(--pricing-line));
		box-shadow: 0 20px 44px -26px rgb(21 24 35 / 32%);
	}
	.orca-price-featured:focus-within {
		border-color: color-mix(in oklch, var(--o-citron, #d6f479) 46%, var(--pricing-line));
		box-shadow:
			0 24px 50px -26px rgb(21 24 35 / 46%),
			0 0 24px -14px rgb(215 244 113 / 38%);
	}
	.orca-price-recommended {
		position: absolute;
		top: -16px;
		left: 50%;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		max-width: calc(100% - 32px);
		padding: 5px 14px;
		border: 1px solid var(--o-ink, #151823);
		border-radius: 999px;
		background: var(--o-citron, #d6f479);
		color: var(--o-ink, #151823);
		font-size: 12px;
		font-weight: 750;
		line-height: 1.7;
		white-space: nowrap;
		transform: translateX(-50%);
	}
	.orca-price-recommended span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: currentColor;
	}
	.orca-price-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.orca-price-icon {
		display: grid;
		place-items: center;
		width: 58px;
		height: 58px;
		margin-bottom: 16px;
		border: 1px solid var(--pricing-line);
		border-radius: 17px;
		background: color-mix(in oklch, var(--o-citron, #d6f479) 12%, white);
	}
	.orca-price-featured .orca-price-icon {
		background: rgb(214 244 121 / 9%);
		border-color: rgb(214 244 121 / 22%);
		color: var(--o-citron, #d6f479);
	}
	.orca-price-enterprise .orca-price-icon {
		background: color-mix(in oklch, var(--o-violet, #8465e5) 6%, white);
		color: var(--o-violet, #8465e5);
	}
	.orca-price-header h2 {
		font-size: 25px;
		font-weight: 750;
		line-height: 1.4;
		letter-spacing: -0.035em;
	}
	.orca-price-description {
		min-height: 48px;
		margin-top: 8px;
		color: var(--pricing-muted);
		font-size: 14px;
		line-height: 1.7;
	}
	.orca-price-amount {
		display: flex;
		align-items: baseline;
		justify-content: center;
		flex-wrap: wrap;
		gap: 5px;
		min-height: 70px;
		margin-top: 24px;
		font-variant-numeric: lining-nums tabular-nums;
	}
	.orca-price-amount strong {
		font-size: clamp(46px, 4.2vw, 58px);
		font-weight: 720;
		line-height: 1.15;
		letter-spacing: -0.055em;
	}
	.orca-price-amount strong.orca-price-custom {
		font-size: clamp(38px, 3.5vw, 47px);
		letter-spacing: -0.045em;
	}
	.orca-price-amount > span {
		color: var(--pricing-muted);
		font-size: 14px;
	}
	.orca-price-note {
		min-height: 25px;
		color: var(--pricing-muted);
		font-size: 13px;
		line-height: 1.8;
	}
	.orca-price-featured .orca-price-note {
		color: var(--o-citron, #d6f479);
	}
	.orca-price-cta {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		width: 100%;
		min-height: 48px;
		margin-top: 24px;
		padding: 12px 16px;
		border: 1px solid var(--pricing-text);
		border-radius: 10px;
		background: transparent;
		color: var(--pricing-text);
		font-size: 14px;
		font-weight: 720;
		line-height: 1.6;
		text-decoration: none;
		transition:
			background-color 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.2s ease;
	}
	.orca-price-cta span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.orca-price-cta :global(svg) {
		flex: 0 0 auto;
		transition: transform 0.2s ease;
	}
	.orca-price-cta:hover {
		background: color-mix(in oklch, var(--o-violet, #8465e5) 7%, white);
		border-color: var(--o-violet, #8465e5);
	}
	.orca-price-featured .orca-price-cta {
		border-color: var(--o-citron, #d6f479);
		background: var(--o-citron, #d6f479);
		color: var(--o-ink, #151823);
	}
	.orca-price-featured .orca-price-cta:hover {
		border-color: #e3ffa0;
		background: #e3ffa0;
	}
	.orca-price-cta:focus-visible {
		outline: 3px solid var(--o-violet, #8465e5);
		outline-offset: 4px;
		box-shadow: 0 6px 16px -10px rgb(21 24 35 / 42%);
	}
	.orca-price-featured .orca-price-cta:focus-visible {
		outline-color: var(--o-citron, #d6f479);
	}
	@media (hover: hover) and (pointer: fine) {
		.orca-price-card:hover {
			box-shadow: 0 22px 44px -26px rgb(21 24 35 / 30%);
		}
		.orca-price-featured:hover {
			box-shadow:
				0 26px 50px -26px rgb(21 24 35 / 46%),
				0 0 24px -14px rgb(215 244 113 / 38%);
		}
		.orca-price-cta:hover {
			box-shadow: 0 6px 16px -10px rgb(21 24 35 / 42%);
		}
		.orca-price-cta:hover :global(svg),
		.orca-price-cta:focus-visible :global(svg) {
			transform: translate(2px, -2px);
		}
	}
	.orca-price-platform {
		min-height: 24px;
		margin-top: 11px;
		color: var(--pricing-muted);
		font-size: 12px;
		line-height: 1.8;
	}
	.orca-price-inclusions {
		margin-top: 27px;
		padding-top: 25px;
		border-top: 1px solid var(--pricing-line);
	}
	.orca-price-inclusions h3 {
		margin-bottom: 20px;
		font-size: 13px;
		font-weight: 750;
		line-height: 1.7;
	}
	.orca-price-inclusions ul {
		display: grid;
		gap: 22px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.orca-price-inclusions li {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr);
		align-items: start;
		gap: 10px;
	}
	.orca-price-check {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		margin-top: 2px;
		border-radius: 50%;
		background: color-mix(in oklch, var(--o-citron, #d6f479) 24%, white);
		color: #536d2e;
	}
	.orca-price-featured .orca-price-check {
		background: rgb(214 244 121 / 11%);
		color: var(--o-citron, #d6f479);
	}
	.orca-price-inclusions li strong {
		display: block;
		font-size: 14px;
		font-weight: 680;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.orca-price-inclusions li p {
		margin-top: 3px;
		color: var(--pricing-muted);
		font-size: 13px;
		line-height: 1.8;
		overflow-wrap: anywhere;
	}
	@media (max-width: 959px) {
		.orca-pricing-grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 36px;
		}
		.orca-price-card {
			padding: 32px;
		}
		.orca-price-description {
			min-height: 0;
		}
		.orca-price-amount {
			margin-top: 22px;
		}
	}
	@media (max-width: 399px) {
		.orca-price-card {
			padding: 28px 21px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orca-price-card,
		.orca-price-cta,
		.orca-price-cta :global(svg) {
			transition: none;
		}
		.orca-price-cta:hover :global(svg),
		.orca-price-cta:focus-visible :global(svg) {
			transform: none;
		}
	}
</style>
