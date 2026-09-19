<script lang="ts">
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import { ArrowUpRight, ChevronRight } from '@lucide/svelte';
</script>

<section class="orca-hero" aria-labelledby="hero-title" use:reveal>
	<div class="orca-hero-atmosphere" aria-hidden="true"></div>
	<div class="orca-hero-lightline" aria-hidden="true"></div>
	<svg
		class="orca-hero-grid"
		viewBox="0 0 1440 360"
		fill="none"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<path
			d="M0 46H1440M0 83H1440M0 130H1440M0 190H1440M0 266H1440M0 359H1440M600 0L-120 360M640 0L160 360M680 0L440 360M720 0V360M760 0L1000 360M800 0L1280 360M840 0L1560 360"
		/>
	</svg>
	<div class="orca-hero-content">
		<a class="orca-hero-announcement o-reveal" href="#pilot" use:reveal={{ delay: 40 }}>
			<span class="orca-hero-status" aria-hidden="true"></span>
			<span>{t('เปิดรับองค์กรทดลองใช้', 'Welcoming pilot teams')}</span>
			<span class="orca-hero-announcement-action">
				{t('รายละเอียด', 'Details')}<ChevronRight size={14} />
			</span>
		</a>
		<h1 id="hero-title" class="o-reveal" use:reveal={{ delay: 100 }}>
			{t('AI ที่เข้าใจธุรกิจของคุณ', 'AI that knows your business.')}<br />
			<span>{t('พร้อมช่วยทีมทำงาน', 'Ready to help your team.')}</span>
		</h1>
		<p class="orca-hero-description o-reveal" use:reveal={{ delay: 190 }}>
			{t(
				'เชื่อมความรู้ เอกสาร และเครื่องมือของบริษัท ให้ AI ที่ทีมใช้ค้นหาข้อมูลและช่วยเตรียมงาน',
				'Connect company knowledge, documents and tools so the AI your team uses can find information and help prepare work.'
			)}{' '}<br class="orca-hero-desktop-break" />{t(
				'ด้วยสิทธิ์ที่คุณกำหนด และขั้นตอนการทำงานที่เหมาะกับธุรกิจของคุณ',
				'With access you control and workflows shaped around your business.'
			)}
		</p>
		<div class="orca-hero-actions o-reveal" use:reveal={{ delay: 280 }}>
			<a class="orca-hero-primary" href={localeHref('/start')}>
				{t('ขอทดลองใช้ ORCA', 'Start with ORCA')}<ArrowUpRight size={19} />
			</a>
			<a class="orca-hero-secondary" href="#how">
				{t('ดูการทำงานของ ORCA', 'See how ORCA works')}<ChevronRight size={18} />
			</a>
		</div>
	</div>
</section>

<style>
	.orca-hero {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		background: #151823;
		color: #f5f6fa;
		text-align: center;
		padding: 118px 24px;
	}
	.orca-hero-atmosphere,
	.orca-hero-lightline,
	.orca-hero-grid {
		position: absolute;
		z-index: -1;
		pointer-events: none;
	}
	.orca-hero-atmosphere {
		inset: 0;
		background:
			radial-gradient(ellipse 44% 55% at 50% 108%, rgb(216 243 106 / 21%), transparent),
			radial-gradient(ellipse 38% 47% at 4% 67%, rgb(132 101 229 / 11%), transparent),
			radial-gradient(ellipse 50% 30% at 82% -16%, rgb(132 101 229 / 8%), transparent);
	}
	.orca-hero-atmosphere::before,
	.orca-hero-atmosphere::after {
		content: '';
		position: absolute;
		border-radius: 50%;
		opacity: 0.8;
	}
	.orca-hero-atmosphere::before {
		inset: 10% 49% 5% -5%;
		background: radial-gradient(ellipse, rgb(132 101 229 / 22%), transparent 68%);
	}
	.orca-hero-atmosphere::after {
		inset: 35% -8% -12% 46%;
		background: radial-gradient(ellipse, rgb(214 244 121 / 19%), transparent 68%);
	}
	.orca-hero-lightline {
		bottom: 0;
		left: 15%;
		width: 70%;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent,
			rgb(214 244 121 / 22%) 28%,
			rgb(239 249 210 / 70%) 50%,
			rgb(164 145 231 / 30%) 72%,
			transparent
		);
	}
	.orca-hero-lightline::before {
		content: '';
		position: absolute;
		inset: auto -12% 0;
		height: 120px;
		background: radial-gradient(ellipse at 50% 100%, rgb(216 243 106 / 9%), transparent 66%);
	}
	.orca-hero-grid {
		bottom: 0;
		left: 0;
		width: 100%;
		height: 260px;
		stroke: #bdc6a0;
		stroke-opacity: 0.13;
		stroke-width: 1;
		mask-image: linear-gradient(transparent, #000 70%);
	}
	.orca-hero-content {
		max-width: 940px;
		margin: 0 auto;
	}
	.orca-hero-announcement {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		max-width: 100%;
		min-height: 38px;
		padding: 6px 9px 6px 14px;
		border: 1px solid #47503e;
		border-radius: 999px;
		color: #e0e6d7;
		background: rgb(216 243 106 / 4%);
		font-size: 12px;
		line-height: 1.7;
		transition:
			border-color 180ms ease-out,
			background 180ms ease-out,
			box-shadow 180ms ease-out;
	}
	.orca-hero-announcement:hover {
		border-color: var(--o-citron);
		background: rgb(216 243 106 / 8%);
		box-shadow: 0 0 24px rgb(216 243 106 / 5%);
	}
	.orca-hero-status {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--o-citron);
	}
	.orca-hero-announcement-action {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding-left: 9px;
		border-left: 1px solid #47503e;
		color: var(--o-citron);
		white-space: nowrap;
	}
	.orca-hero h1 {
		max-width: 880px;
		margin: 32px auto 0;
		font-size: clamp(44px, 5.5vw, 72px);
		font-weight: 550;
		line-height: 1.3;
		letter-spacing: -0.045em;
		text-wrap: balance;
	}
	.orca-hero h1 > span {
		color: var(--o-citron);
		text-shadow: 0 2px 28px rgb(214 244 121 / 7%);
	}
	.orca-hero-description {
		max-width: 710px;
		margin: 24px auto 0;
		color: #bbc2d0;
		font-size: 16px;
		line-height: 1.85;
		text-wrap: pretty;
	}
	.orca-hero-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 28px;
	}
	.orca-hero-actions a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 17px;
		min-height: 50px;
		padding: 12px 24px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 550;
		transition:
			background 180ms ease-out,
			border-color 180ms ease-out,
			box-shadow 180ms ease-out,
			transform 220ms cubic-bezier(0.2, 0.7, 0.25, 1);
	}
	.orca-hero-actions .orca-hero-primary {
		background: var(--o-citron);
		color: #151823;
		box-shadow: 0 5px 21px rgb(214 244 121 / 10%);
	}
	.orca-hero-primary:hover {
		background: #e0f7a5;
		box-shadow: 0 8px 28px rgb(214 244 121 / 19%);
	}
	.orca-hero-actions .orca-hero-secondary {
		border-color: #505763;
		color: #f5f6fa;
		background: rgb(21 24 35 / 30%);
	}
	.orca-hero-secondary:hover {
		background: #272d39;
		border-color: #7d8697;
		box-shadow: 0 7px 20px rgb(6 8 17 / 14%);
	}
	.orca-hero-announcement:focus-visible,
	.orca-hero-actions a:focus-visible {
		outline: 3px solid #b4a0f0;
		outline-offset: 5px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.orca-hero:global([data-orca-motion='entered']) .orca-hero-atmosphere::before {
			animation: orca-hero-violet-arrive 2600ms cubic-bezier(0.2, 0.7, 0.25, 1) both;
		}
		.orca-hero:global([data-orca-motion='entered']) .orca-hero-atmosphere::after {
			animation: orca-hero-citron-arrive 2800ms 100ms cubic-bezier(0.2, 0.7, 0.25, 1) both;
		}
		.orca-hero:global([data-orca-motion='entered']) .orca-hero-grid {
			animation: orca-hero-grid-arrive 1400ms 120ms cubic-bezier(0.2, 0.7, 0.25, 1) both;
		}
		.orca-hero:global([data-orca-motion='entered']) .orca-hero-lightline {
			animation: orca-hero-line-arrive 1800ms 180ms ease-out both;
		}
		.orca-hero-actions a :global(svg),
		.orca-hero-announcement-action :global(svg) {
			transition: transform 220ms cubic-bezier(0.2, 0.7, 0.25, 1);
		}
		.orca-hero-primary:is(:hover, :focus-visible) :global(svg) {
			transform: translate(2px, -2px);
		}
		.orca-hero-secondary:is(:hover, :focus-visible) :global(svg),
		.orca-hero-announcement:is(:hover, :focus-visible) :global(svg) {
			transform: translateX(3px);
		}
	}
	@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
		.orca-hero-actions a:hover {
			transform: translateY(-2px);
		}
	}
	@keyframes orca-hero-violet-arrive {
		from {
			opacity: 0.1;
			transform: translate(-24px, 14px) scale(0.94);
		}
		to {
			opacity: 0.8;
			transform: none;
		}
	}
	@keyframes orca-hero-citron-arrive {
		from {
			opacity: 0.08;
			transform: translate(26px, 26px) scale(0.95);
		}
		to {
			opacity: 0.8;
			transform: none;
		}
	}
	@keyframes orca-hero-grid-arrive {
		from {
			opacity: 0;
			transform: translateY(15px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@keyframes orca-hero-line-arrive {
		from {
			opacity: 0;
			transform: scaleX(0.65);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (max-width: 900px) {
		.orca-hero {
			padding-block: 92px;
		}
	}
	@media (max-width: 680px) {
		.orca-hero {
			padding: 68px 20px 72px;
		}
		.orca-hero h1 {
			font-size: clamp(31px, 8vw, 49px);
			line-height: 1.4;
			letter-spacing: -0.035em;
			margin-top: 28px;
		}
		.orca-hero-description {
			font-size: 14px;
			line-height: 1.9;
			max-width: 420px;
			margin-top: 20px;
		}
		.orca-hero-desktop-break {
			display: none;
		}
		.orca-hero-actions {
			gap: 10px;
			margin-top: 25px;
		}
		.orca-hero-actions a {
			font-size: 12px;
			padding: 11px 18px;
			gap: 9px;
			min-height: 46px;
		}
		.orca-hero-grid {
			width: 180%;
			left: -40%;
			height: 185px;
		}
	}
	@media (max-width: 360px) {
		.orca-hero {
			padding-inline: 16px;
		}
		.orca-hero-announcement {
			font-size: 11px;
			gap: 7px;
		}
		.orca-hero-actions {
			flex-direction: column;
		}
		.orca-hero-actions a {
			width: min(100%, 250px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orca-hero-announcement,
		.orca-hero-actions a {
			transition: none;
		}
	}
</style>
