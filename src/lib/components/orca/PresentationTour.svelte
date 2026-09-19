<script lang="ts">
	import ToolIcon from '$lib/orca/ToolIcon.svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import Brand from './Brand.svelte';
	import { ArrowRight, FilePlus2, ShieldCheck } from '@lucide/svelte';
</script>

<section id="how" tabindex="-1" class="m-tour-section" aria-labelledby="how-title">
	<div class="o-wrap presentation-tour">
		<header class="tour-heading o-reveal" use:reveal>
			<p class="tour-eyebrow">{t('จากคำสั่งสู่ผลลัพธ์', 'From request to result')}</p>
			<h2 id="how-title">
				{t(
					'สั่งครั้งเดียว งานเดินต่อในเครื่องมือของทีม',
					'One request. Work moves across your tools.'
				)}
			</h2>
			<p class="tour-intro">
				{t(
					'แก้ไขข้อมูล สร้างงานติดตาม และแจ้งทีม พร้อมตรวจสิทธิ์และอนุมัติก่อนลงมือ',
					'Update a record, create a follow-up and notify your team—with approval before action.'
				)}
			</p>
		</header>

		<ol
			class="tour-flow"
			role="list"
			aria-label={t(
				'จากคำสั่งใน Claude ถึงผลลัพธ์ใน Google Sheets และ Slack',
				'From a Claude request to results in Google Sheets and Slack'
			)}
		>
			<li class="tour-card tour-request o-reveal" use:reveal={{ delay: 0 }}>
				<p class="tour-stage"><span>01</span>{t('บอกงานที่ต้องการ', 'Describe the task')}</p>
				<h3 class="tour-app"><ToolIcon name="claude" size={28} decorative />Claude</h3>
				<blockquote class="tour-prompt">
					{t(
						'“อัปเดตสถานะลูกค้า A เป็น ‘ติดตามแล้ว’ เพิ่มงานติดตามให้ฝ่ายขาย แล้วแจ้งทีมใน Slack”',
						'“Mark Customer A as ‘Followed up’, add a follow-up for Sales, then notify the team in Slack.”'
					)}
				</blockquote>
				<p class="tour-request-context">
					<ToolIcon name="google-sheets" size={18} decorative />
					<span>{t('รายชื่อลูกค้า', 'Customer list')} · Google Sheets</span>
				</p>
				<span class="tour-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
			</li>

			<li class="tour-card tour-orca o-reveal" use:reveal={{ delay: 100 }}>
				<p class="tour-stage">
					<span>02</span>{t('ตรวจสิทธิ์และอนุมัติ', 'Check access and approve')}
				</p>
				<h3 class="tour-orca-brand"><Brand dark /></h3>
				<p class="tour-review-label">
					{t(
						'ตรวจสิทธิ์ของผู้สั่งงาน และขออนุมัติ',
						'Check the requester’s access and seek approval'
					)}
				</p>
				<ul class="tour-scope" role="list">
					<li>{t('แก้ไขสถานะลูกค้า A', 'Update Customer A’s status')}</li>
					<li>{t('เพิ่มงานติดตามให้ฝ่ายขาย', 'Add a follow-up for Sales')}</li>
					<li>{t('ส่งข้อความใน #sales-team', 'Post in #sales-team')}</li>
				</ul>
				<p class="tour-approval">
					<ShieldCheck size={20} aria-hidden="true" />
					<span
						>{t(
							'ดำเนินการเมื่อผู้มีสิทธิ์อนุมัติรายการนี้',
							'Proceed when an authorized person approves these actions'
						)}</span
					>
				</p>
				<span class="tour-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
			</li>

			<li class="tour-card tour-sheet o-reveal" use:reveal={{ delay: 200 }}>
				<p class="tour-stage"><span>03</span>{t('แก้ไขข้อมูลและสร้างงาน', 'Update and create')}</p>
				<h3 class="tour-app">
					<ToolIcon name="google-sheets" size={28} decorative />Google Sheets
				</h3>
				<div class="tour-sheet-document">
					<p class="tour-sheet-title">{t('รายชื่อลูกค้า', 'Customer list')}</p>
					<table>
						<caption class="tour-sr-only"
							>{t(
								'สถานะลูกค้าก่อนและหลังการอัปเดตที่อนุมัติ',
								'Customer status before and after the approved update'
							)}</caption
						>
						<colgroup><col class="tour-customer-col" /><col /><col /></colgroup>
						<thead>
							<tr
								><th scope="col">{t('ลูกค้า', 'Customer')}</th><th scope="col"
									>{t('ก่อน', 'Before')}</th
								><th scope="col">{t('หลัง', 'After')}</th></tr
							>
						</thead>
						<tbody>
							<tr class="tour-updated-row"
								><th scope="row">{t('ลูกค้า A', 'Customer A')}</th><td
									>{t('รอติดต่อ', 'To contact')}</td
								><td class="tour-new-status">{t('ติดตามแล้ว', 'Followed up')}</td></tr
							>
							<tr
								><th scope="row">{t('ลูกค้า B', 'Customer B')}</th><td
									>{t('รอตอบกลับ', 'Awaiting reply')}</td
								><td>{t('รอตอบกลับ', 'Awaiting reply')}</td></tr
							>
						</tbody>
					</table>
				</div>
				<div class="tour-new-task">
					<span class="tour-task-icon" aria-hidden="true"><FilePlus2 size={18} /></span>
					<div>
						<p class="tour-task-label">{t('งานที่เพิ่ม', 'New follow-up')}</p>
						<p class="tour-task-name">{t('ติดตามลูกค้า A', 'Follow up with Customer A')}</p>
						<p class="tour-task-owner">{t('ผู้รับผิดชอบ: ฝ่ายขาย', 'Assigned to: Sales')}</p>
					</div>
				</div>
				<span class="tour-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
			</li>

			<li class="tour-card tour-slack o-reveal" use:reveal={{ delay: 300 }}>
				<p class="tour-stage"><span>04</span>{t('แจ้งผลให้ทีม', 'Notify the team')}</p>
				<h3 class="tour-app"><ToolIcon name="slack" size={28} decorative />Slack</h3>
				<div class="tour-channel">
					<p class="tour-channel-name">#sales-team</p>
					<div class="tour-message">
						<div class="tour-message-sender"><Brand compact /><strong>ORCA</strong></div>
						<p>
							{t(
								'อัปเดตลูกค้า A เป็น “ติดตามแล้ว” และเพิ่มงานติดตามให้ฝ่ายขายเรียบร้อย',
								'Customer A is now “Followed up”. A follow-up has been added for Sales.'
							)}
						</p>
						<div class="tour-message-reference">
							<ToolIcon name="google-sheets" size={17} decorative /><span
								>{t('รายชื่อลูกค้า · ลูกค้า A', 'Customer list · Customer A')}</span
							>
						</div>
					</div>
				</div>
				<p class="tour-outcome">
					{t(
						'ทีมเห็นสิ่งที่เปลี่ยน และรู้ว่างานต่อไปคืออะไร',
						'The team sees what changed and what happens next.'
					)}
				</p>
			</li>
		</ol>
	</div>
</section>

<style>
	.presentation-tour {
		color: var(--o-ink, #151823);
		min-width: 0;
	}
	.tour-heading {
		max-width: 850px;
		margin: 0 auto 36px;
		text-align: center;
	}
	.tour-heading .tour-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 14px;
		color: #526b31;
		font-size: 12px;
		font-weight: 650;
		letter-spacing: 0.025em;
	}
	.tour-eyebrow::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #7b993d;
	}
	.tour-heading h2 {
		font-size: clamp(29px, 3vw, 43px);
		line-height: 1.45;
		letter-spacing: -0.035em;
		font-weight: 650;
	}
	.tour-heading .tour-intro {
		margin-top: 13px;
		color: var(--o-muted, #596276);
		font-size: 14px;
		line-height: 1.8;
	}
	.tour-flow {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tour-card {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 21px 20px;
		border: 1px solid #dce0e8;
		border-radius: 18px;
		background: #fff;
		box-shadow: 0 6px 20px #252d4b05;
	}
	.tour-stage {
		display: flex;
		align-items: baseline;
		gap: 7px;
		min-height: 20px;
		margin-bottom: 18px !important;
		color: #626c7e;
		font-size: 11px;
		font-weight: 550;
		line-height: 1.7;
	}
	.tour-stage > span {
		color: #667a43;
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
	}
	.tour-app {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 34px;
		margin-bottom: 18px !important;
		font-size: 16px;
		line-height: 1.45;
		font-weight: 650;
	}
	.tour-prompt {
		margin: 0 0 22px;
		padding: 16px;
		border-radius: 5px 15px 15px;
		background: #f1f0f7;
		color: #303548;
		font-size: 16px;
		font-weight: 500;
		line-height: 1.85;
		overflow-wrap: anywhere;
	}
	.tour-request-context {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: auto !important;
		color: #646d7c;
		font-size: 11px;
		line-height: 1.7;
	}
	.tour-orca {
		border-color: var(--o-ink, #151823);
		background: var(--o-ink, #151823);
		color: #f5f6fa;
	}
	.tour-orca .tour-stage {
		color: #c2c8d4;
	}
	.tour-orca .tour-stage > span {
		color: var(--o-citron, #d5f478);
	}
	.tour-orca-brand {
		display: flex;
		margin-bottom: 18px !important;
		line-height: 1;
	}
	.tour-review-label {
		color: #d1d6e1;
		font-size: 12px;
		line-height: 1.8;
	}
	.tour-scope {
		display: grid;
		gap: 9px;
		margin: 15px 0 21px;
		padding: 0;
		list-style: none;
		font-size: 13px;
		line-height: 1.75;
	}
	.tour-scope li {
		position: relative;
		padding-left: 14px;
	}
	.tour-scope li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 9px;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--o-citron, #d5f478);
	}
	.tour-approval {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-top: auto !important;
		padding-top: 14px;
		border-top: 1px solid #42494d;
		color: #e0edbd;
		font-size: 11px;
		line-height: 1.8;
	}
	.tour-approval :global(svg) {
		flex: 0 0 auto;
		margin-top: 1px;
		color: var(--o-citron, #d5f478);
	}
	.tour-sheet-document {
		overflow: hidden;
		border: 1px solid #dce4d8;
		border-radius: 9px;
	}
	.tour-sheet-title {
		padding: 9px 11px;
		border-bottom: 1px solid #dce4d8;
		background: #f1f5ed;
		color: #486036;
		font-size: 11px;
		font-weight: 600;
	}
	.tour-sheet table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
		font-size: 11px;
		line-height: 1.7;
	}
	.tour-customer-col {
		width: 27%;
	}
	.tour-sheet th,
	.tour-sheet td {
		padding: 11px 7px;
		text-align: left;
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	.tour-sheet thead th {
		padding-block: 7px;
		background: #fafbf9;
		color: #737c6e;
		font-size: 10px;
		font-weight: 500;
	}
	.tour-sheet tbody th {
		font-weight: 550;
	}
	.tour-sheet tbody td {
		color: #67717a;
	}
	.tour-sheet tbody tr + tr {
		border-top: 1px solid #e9ede7;
	}
	.tour-updated-row .tour-new-status {
		background: #eaf4d8;
		color: #3c562a;
		font-weight: 650;
	}
	.tour-new-task {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		margin-top: 14px;
		padding: 11px 12px;
		border: 1px solid #dce4d8;
		border-radius: 9px;
		background: #f9fbf5;
	}
	.tour-task-icon {
		display: flex;
		flex: 0 0 auto;
		margin-top: 3px;
		color: #5c773b;
	}
	.tour-task-label {
		color: #5c773b;
		font-size: 10px;
		line-height: 1.6;
	}
	.tour-task-name {
		margin-top: 3px !important;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.7;
	}
	.tour-task-owner {
		color: #6a7264;
		font-size: 10px;
		line-height: 1.7;
	}
	.tour-channel {
		overflow: hidden;
		border: 1px solid #e1dfe9;
		border-radius: 9px;
	}
	.tour-channel-name {
		padding: 9px 12px;
		border-bottom: 1px solid #e1dfe9;
		background: #f4f1f8;
		color: #5b4b67;
		font-size: 12px;
		font-weight: 650;
	}
	.tour-message {
		padding: 13px 12px;
		font-size: 13px;
		line-height: 1.85;
	}
	.tour-message-sender {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 9px;
	}
	.tour-message-sender :global(.orca-symbol) {
		width: 23px;
		height: 24px;
		gap: 2px;
	}
	.tour-message-sender :global(.orca-symbol i) {
		width: 4px;
		height: 10px;
	}
	.tour-message-sender :global(.orca-symbol i:nth-child(2)) {
		height: 21px;
	}
	.tour-message-sender :global(.orca-symbol i:nth-child(3)) {
		height: 15px;
	}
	.tour-message-sender :global(.orca-symbol i:nth-child(4)) {
		height: 7px;
	}
	.tour-message-sender strong {
		font-size: 12px;
		font-weight: 650;
	}
	.tour-message-reference {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
		padding-top: 9px;
		border-top: 1px solid #ecebf0;
		color: #6a6f7b;
		font-size: 10px;
		line-height: 1.7;
	}
	.tour-outcome {
		margin-top: 16px !important;
		color: #626b7c;
		font-size: 11px;
		line-height: 1.8;
	}
	.tour-arrow {
		position: absolute;
		display: none;
		align-items: center;
		justify-content: center;
		color: #778c52;
		pointer-events: none;
	}
	.tour-sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (min-width: 1150px) {
		.tour-flow {
			grid-template-columns: 0.95fr 0.9fr 1.2fr 0.95fr;
		}
		.tour-card {
			padding: 22px 16px;
		}
		.tour-arrow {
			display: flex;
			right: -21px;
			top: 50%;
			width: 20px;
			height: 20px;
			transform: translateY(-50%);
		}
		.tour-prompt {
			padding: 14px;
			font-size: 15px;
		}
	}
	@media (max-width: 699px) {
		.tour-heading {
			margin-bottom: 26px;
		}
		.tour-heading h2 {
			font-size: clamp(27px, 6.3vw, 36px);
			line-height: 1.5;
		}
		.tour-heading .tour-intro {
			font-size: 13px;
		}
		.tour-flow {
			grid-template-columns: minmax(0, 1fr);
			gap: 27px;
		}
		.tour-card {
			padding: 17px 18px;
			border-radius: 15px;
		}
		.tour-stage {
			margin-bottom: 11px !important;
		}
		.tour-app,
		.tour-orca-brand {
			margin-bottom: 13px !important;
		}
		.tour-prompt {
			margin-bottom: 12px;
			padding: 13px 15px;
			font-size: 15px;
			line-height: 1.8;
		}
		.tour-scope {
			gap: 6px;
			margin-block: 11px 14px;
		}
		.tour-approval {
			padding-top: 10px;
			font-size: 12px;
		}
		.tour-sheet table {
			font-size: 12px;
		}
		.tour-sheet th,
		.tour-sheet td {
			padding: 10px 8px;
		}
		.tour-sheet thead th {
			font-size: 11px;
		}
		.tour-task-label,
		.tour-task-owner {
			font-size: 11px;
		}
		.tour-task-name {
			font-size: 13px;
		}
		.tour-message {
			font-size: 14px;
		}
		.tour-message-reference {
			font-size: 11px;
		}
		.tour-outcome {
			margin-top: 12px !important;
			font-size: 12px;
		}
		.tour-arrow {
			display: flex;
			bottom: -25px;
			left: 50%;
			width: 20px;
			height: 20px;
			transform: translateX(-50%) rotate(90deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tour-flow *,
		.tour-flow *::before,
		.tour-flow *::after {
			animation: none !important;
			transition: none !important;
		}
	}

	.m-tour-section {
		position: relative;
		isolation: isolate;
	}
	.m-tour-section::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse at 5% 35%, #d9e9b045, transparent 55%),
			radial-gradient(ellipse at 95% 85%, #c7b4ea35, transparent 52%);
	}
	.tour-card {
		box-shadow:
			0 12px 32px -22px #23274255,
			inset 0 1px 0 #fff;
	}
	.tour-orca {
		background:
			radial-gradient(ellipse at 10% 0%, #b7d66824, transparent 65%),
			radial-gradient(ellipse at 100% 100%, #9575d326, transparent 60%), var(--o-ink, #151823);
		box-shadow:
			0 14px 32px -18px #495e3480,
			inset 0 1px 0 #ffffff20;
	}
	.tour-arrow {
		z-index: 1;
		color: #5c7a2c;
	}
	@media (prefers-reduced-motion: no-preference) {
		.tour-card:global([data-orca-motion='entered']) .tour-arrow :global(svg) {
			animation: tour-forward 1300ms ease-in-out 500ms 2;
		}
		.tour-sheet:global([data-orca-motion='entered']) .tour-new-task {
			animation: tour-result-arrive 800ms ease-out 450ms both;
		}
		.tour-slack:global([data-orca-motion='entered']) .tour-message {
			animation: tour-result-arrive 850ms ease-out 550ms both;
		}
	}
	@keyframes tour-forward {
		0%,
		100% {
			transform: translateX(-2px);
		}
		70% {
			transform: translateX(4px);
		}
	}
	@keyframes tour-result-arrive {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
