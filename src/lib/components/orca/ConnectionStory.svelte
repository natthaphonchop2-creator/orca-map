<script lang="ts">
	import ToolIcon from '$lib/orca/ToolIcon.svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import Brand from './Brand.svelte';
	import {
		ArrowRight,
		Check,
		GitBranch,
		ListChecks,
		MessageSquareText,
		ShieldCheck
	} from '@lucide/svelte';
	import type { Action } from 'svelte/action';

	const aiApps = [
		{ name: 'chatgpt', label: 'ChatGPT' },
		{ name: 'claude', label: 'Claude' },
		{ name: 'gemini', label: 'Gemini' },
		{ name: 'cursor', label: 'Cursor' }
	] as const;
	const businessTools = [
		{ name: 'google-drive', label: 'Google Drive' },
		{ name: 'google-sheets', label: 'Google Sheets' },
		{ name: 'slack', label: 'Slack' },
		{ name: 'line', label: 'LINE' },
		{ name: 'peak', label: 'PEAK' },
		{ name: 'flowaccount', label: 'FlowAccount' }
	] as const;

	// One clock for the whole route; pause it when the diagram is out of view.
	const flowVisibility: Action<HTMLElement> = (node) => {
		if (!('IntersectionObserver' in window)) {
			node.dataset.flowVisible = 'true';
			return;
		}
		const observer = new IntersectionObserver(([entry]) => {
			node.dataset.flowVisible = String(entry.isIntersecting);
		});
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	};
</script>

<section
	id="connection-story"
	class="orca-connection-story o-wrap"
	aria-labelledby="connection-story-title"
>
	<div class="system-intro o-reveal" use:reveal>
		<p class="system-eyebrow">{t('เชื่อม AI เข้ากับธุรกิจ', 'Connect AI with your business')}</p>
		<h2 id="connection-story-title">
			{t('ให้ AI ที่ทีมเลือก', 'The AI your team chooses.')}<br />
			{t('ทำงานกับระบบที่ธุรกิจใช้', 'The systems your business runs on.')}
		</h2>
		<p class="system-description">
			{t(
				'จากคำสั่งของทีม สู่ข้อมูลและงานในระบบธุรกิจ โดยมี ORCA เป็นจุดประสานงาน',
				'From your team’s request to work in your business systems, with ORCA coordinating the flow.'
			)}
		</p>
		<a class="knowledge-discovery" href={localeHref('/#knowledge')}
			>{t('ใช้ AI กับคลังความรู้ของบริษัท', 'Bring your company knowledge to AI')}<ArrowRight
				size={18}
				aria-hidden="true"
			/></a
		>
	</div>

	<div class="system-map">
		<div class="system-route" use:flowVisibility>
			<section class="system-node system-clients" aria-labelledby="system-client-title">
				<div class="system-node-heading">
					<h3 id="system-client-title">{t('AI ที่ทีมเลือก', 'Your team’s AI')}</h3>
					<p>{t('ส่งคำถามหรือคำสั่งงาน', 'Ask a question or request an action')}</p>
				</div>
				<ul class="system-logo-grid ai-logos" role="list">
					{#each aiApps as app (app.name)}
						<li>
							<ToolIcon name={app.name} size={40} decorative />
							<span>{app.label}</span>
						</li>
					{/each}
				</ul>
			</section>

			<div class="system-wire">
				<small>{t('ส่งคำสั่ง', 'Request')}</small><span aria-hidden="true"><i></i></span><ArrowRight
					size={20}
					aria-hidden="true"
				/>
			</div>

			<section class="system-gateway" aria-labelledby="system-gateway-title">
				<h3 id="system-gateway-title" class="system-sr-only">
					{t('ORCA ประสานการทำงาน', 'ORCA coordinates the work')}
				</h3>
				<Brand dark />
				<ul class="system-roles" role="list">
					<li><ShieldCheck size={19} aria-hidden="true" />{t('ตรวจสิทธิ์', 'Check access')}</li>
					<li><GitBranch size={19} aria-hidden="true" />{t('ประสานงาน', 'Coordinate work')}</li>
					<li><ListChecks size={19} aria-hidden="true" />{t('บันทึกผล', 'Record activity')}</li>
				</ul>
			</section>

			<div class="system-wire system-wire-action">
				<small>{t('ลงมือทำ', 'Action')}</small><span aria-hidden="true"><i></i></span><ArrowRight
					size={20}
					aria-hidden="true"
				/>
			</div>

			<section class="system-node system-business" aria-labelledby="system-business-title">
				<div class="system-node-heading">
					<h3 id="system-business-title">{t('ระบบที่ธุรกิจใช้', 'Your business systems')}</h3>
					<p>{t('ข้อมูล เอกสาร และงานของทีม', 'Your data, documents and everyday work')}</p>
				</div>
				<ul class="system-logo-grid business-logos" role="list">
					{#each businessTools as tool (tool.name)}
						<li>
							<ToolIcon name={tool.name} size={40} decorative />
							<span>{tool.label}</span>
						</li>
					{/each}
				</ul>
			</section>
		</div>

		<div class="system-return" use:reveal>
			<div class="return-heading">
				<span class="return-heading-icon"><MessageSquareText size={21} aria-hidden="true" /></span>
				<div>
					<h3>{t('ทีมได้รับคำตอบในแอป AI เดิม', 'The answer comes back to your AI app')}</h3>
					<p>
						{t(
							'เมื่อระบบทำงานเสร็จ ORCA ส่งผลกลับให้ AI สรุปให้ทีม',
							'When the work is done, ORCA returns the result for AI to summarize.'
						)}
					</p>
				</div>
			</div>
			<ol
				class="return-route"
				role="list"
				aria-label={t('เส้นทางส่งผลกลับให้ทีม', 'How results return to your team')}
			>
				<li>
					<span class="return-node-icons"
						><ToolIcon name="google-sheets" size={25} decorative /><ToolIcon
							name="slack"
							size={25}
							decorative
						/></span
					>
					<strong>{t('ระบบส่งผลลัพธ์', 'Systems return results')}</strong>
					<span class="return-connector" aria-hidden="true"><i></i><ArrowRight size={19} /></span>
				</li>
				<li>
					<span class="return-node-icons"
						><Brand compact /><span class="return-orca-name">ORCA</span></span
					>
					<strong>{t('ORCA ส่งผลกลับ', 'ORCA passes them back')}</strong>
					<span class="return-connector" aria-hidden="true"><i></i><ArrowRight size={19} /></span>
				</li>
				<li>
					<span class="return-node-icons"
						><ToolIcon name="chatgpt" size={25} decorative /><ToolIcon
							name="claude"
							size={25}
							decorative
						/></span
					>
					<strong>{t('AI สรุปให้ทีม', 'AI summarizes for your team')}</strong>
				</li>
			</ol>
			<p class="return-outcome">
				<Check size={17} aria-hidden="true" />{t(
					'เห็นสิ่งที่ทำสำเร็จ และรายการที่ต้องดำเนินการต่อ',
					'See what is done and what needs attention next'
				)}
			</p>
		</div>
	</div>
</section>

<style>
	.knowledge-discovery {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 44px;
		margin-top: 16px;
		font-size: 16px;
		font-weight: 650;
		color: #53702b;
	}
	.orca-connection-story {
		margin-top: 64px;
		scroll-margin-top: 105px;
	}
	.system-intro {
		max-width: 820px;
		margin: 0 auto 36px;
		text-align: center;
	}
	.system-eyebrow {
		margin: 0 0 12px;
		color: #58752e;
		font-size: 13px;
		font-weight: 600;
	}
	.system-intro h2 {
		margin: 0;
		font-size: clamp(28px, 3.2vw, 42px);
		font-weight: 650;
		line-height: 1.45;
		letter-spacing: -0.035em;
	}
	.system-intro .system-description {
		max-width: 660px;
		margin: 18px auto 0;
		color: var(--o-muted, #596276);
		font-size: 15px;
		line-height: 1.85;
	}
	.system-map {
		position: relative;
		isolation: isolate;
		padding: 34px 30px 0;
		border: 1px solid var(--o-line, #dce0e8);
		border-radius: 24px;
		background:
			radial-gradient(ellipse at 50% 35%, #e4eec399, transparent 55%),
			radial-gradient(ellipse at 95% 90%, #e5ddf959, transparent 52%), #f4f6f9;
		box-shadow:
			0 24px 64px -42px #495d5b66,
			inset 0 1px 0 #fff;
	}
	.system-route {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1.02fr) 52px minmax(0, 1.12fr);
		align-items: center;
		gap: 10px;
	}
	.system-node {
		min-width: 0;
		padding: 24px 18px 18px;
		border: 1px solid #dbe0e8;
		border-radius: 20px;
		background: #fff;
		box-shadow:
			0 9px 24px -15px #41475935,
			inset 0 1px 0 #fff;
	}
	.system-node-heading {
		margin-bottom: 20px;
		text-align: center;
	}
	.system-node-heading h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 650;
		line-height: 1.55;
		letter-spacing: -0.02em;
	}
	.system-node-heading p {
		margin: 5px 0 0;
		color: var(--o-muted, #596276);
		font-size: 11px;
		line-height: 1.6;
	}
	.system-logo-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.system-logo-grid li {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 9px;
		min-width: 0;
		min-height: 100px;
		padding: 12px 5px;
		border: 1px solid #e7eaf0;
		border-radius: 12px;
		background: #fbfcfd;
		text-align: center;
	}
	.system-logo-grid li span {
		color: #333d50;
		font-size: 11px;
		font-weight: 550;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.business-logos li {
		min-height: 88px;
	}
	.system-wire {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 0;
		height: 44px;
		color: #7a9646;
	}
	.system-wire > span {
		position: relative;
		flex: 1;
		height: 6px;
		overflow: hidden;
		background: linear-gradient(#a5b77f, #a5b77f) center / 100% 2px no-repeat;
	}
	.system-wire i {
		position: absolute;
		inset: 0;
		border-radius: 5px;
		background: linear-gradient(90deg, transparent, #78993f 48%, #cae985 72%, transparent);
		opacity: 0;
		--packet-start: translateX(-100%);
		--packet-end: translateX(100%);
	}
	.system-wire :global(svg) {
		flex: 0 0 auto;
		margin-left: -3px;
	}
	.system-wire small {
		position: absolute;
		left: 50%;
		top: -2px;
		transform: translateX(-50%);
		color: #536335;
		font-size: 10px;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}
	.system-gateway {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		justify-self: center;
		gap: 23px;
		width: min(100%, 286px);
		aspect-ratio: 1;
		padding: 24px 18px;
		border: 1px solid #495640;
		border-radius: 50%;
		background:
			radial-gradient(ellipse at 25% 0%, #737f3733, transparent 65%),
			radial-gradient(ellipse at 85% 100%, #65518540, transparent 65%), var(--o-ink, #151823);
		color: #f1f4f7;
		box-shadow:
			0 22px 45px -20px #596b4970,
			0 0 0 6px #dbe8b535,
			0 0 0 12px #e2ecc81f;
	}
	.system-gateway::before {
		content: '';
		position: absolute;
		inset: -12px;
		border: 1px solid #b4c78280;
		border-radius: inherit;
		pointer-events: none;
	}
	.system-gateway::after {
		content: '';
		position: absolute;
		inset: -1px;
		border: 1px solid #cfea75;
		border-radius: inherit;
		box-shadow: 0 0 20px #b6d76340;
		opacity: 0;
		pointer-events: none;
	}
	.system-roles {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.system-roles li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		line-height: 1.5;
	}
	.system-roles :global(svg) {
		flex-shrink: 0;
		color: var(--o-citron, #d5f478);
	}
	.system-return {
		padding: 26px 0 24px;
		margin-top: 30px;
		border-top: 1px solid #d6dfcb;
	}
	.return-heading {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.return-heading-icon {
		display: grid;
		place-items: center;
		flex: 0 0 42px;
		height: 42px;
		border: 1px solid #d5dfbf;
		border-radius: 12px;
		background: #eaf2d6;
		color: #506632;
	}
	.return-heading h3 {
		margin: 0;
		font-size: 17px;
		line-height: 1.6;
	}
	.return-heading p {
		margin: 4px 0 0;
		color: #596276;
		font-size: 12px;
		line-height: 1.75;
	}
	.return-route {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 32px;
		list-style: none;
		margin: 22px 0 16px;
		padding: 0;
	}
	.return-route li {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 17px 10px;
		border: 1px solid #dce3dc;
		border-radius: 12px;
		background: #ffffffc9;
		text-align: center;
	}
	.return-route strong {
		font-size: 12px;
		line-height: 1.6;
		font-weight: 550;
		color: #37432e;
	}
	.return-node-icons {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 30px;
	}
	.return-node-icons :global(.orca-symbol) {
		width: 26px;
		height: 28px;
	}
	.return-orca-name {
		font-size: 15px;
		font-weight: 650;
	}
	.return-connector {
		position: absolute;
		display: flex;
		align-items: center;
		width: 32px;
		top: calc(50% - 10px);
		right: -33px;
		color: #617d33;
	}
	.return-connector i {
		flex: 1;
		height: 2px;
		background: #b6c993;
	}
	.return-connector :global(svg) {
		flex-shrink: 0;
	}
	.return-outcome {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		gap: 7px;
		margin: 0;
		color: #596276;
		font-size: 12px;
		line-height: 1.75;
	}
	.return-outcome :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
		color: #5d7932;
	}
	@media (prefers-reduced-motion: no-preference) {
		.system-wire i {
			animation: system-packet 4800ms linear infinite both paused;
		}
		.system-wire-action i {
			animation-name: system-action-packet;
		}
		.system-gateway::after {
			animation: system-coordinate 4800ms ease-in-out infinite both paused;
		}
		.system-route:global([data-flow-visible='true']) .system-wire i,
		.system-route:global([data-flow-visible='true']) .system-gateway::after {
			animation-play-state: running;
		}
	}
	@keyframes system-packet {
		0% {
			opacity: 0;
			transform: var(--packet-start);
		}
		5% {
			opacity: 1;
			transform: var(--packet-start);
		}
		28% {
			opacity: 1;
			transform: var(--packet-end);
		}
		32%,
		100% {
			opacity: 0;
			transform: var(--packet-end);
		}
	}
	@keyframes system-action-packet {
		0%,
		48% {
			opacity: 0;
			transform: var(--packet-start);
		}
		53% {
			opacity: 1;
			transform: var(--packet-start);
		}
		76% {
			opacity: 1;
			transform: var(--packet-end);
		}
		80%,
		100% {
			opacity: 0;
			transform: var(--packet-end);
		}
	}
	@keyframes system-coordinate {
		0%,
		27%,
		53%,
		100% {
			opacity: 0;
		}
		35%,
		43% {
			opacity: 0.65;
		}
	}
	.system-sr-only {
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
	@media (max-width: 1100px) and (min-width: 901px) {
		.system-map {
			padding: 28px 20px 0;
		}
		.system-route {
			grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1.08fr) 36px minmax(0, 1.16fr);
			gap: 7px;
		}
		.system-node {
			padding-inline: 12px;
		}
		.system-node-heading h3 {
			font-size: 18px;
		}
		.system-gateway {
			gap: 18px;
		}
		.system-roles li {
			gap: 8px;
			font-size: 12px;
		}
	}
	@media (max-width: 900px) {
		.orca-connection-story {
			margin-top: 44px;
		}
		.system-intro {
			margin-bottom: 26px;
		}
		.system-intro .system-description {
			font-size: 14px;
			margin-top: 14px;
		}
		.system-map {
			padding: 20px 18px 0;
			border-radius: 20px;
		}
		.system-route {
			display: flex;
			flex-direction: column;
			gap: 0;
			align-items: stretch;
		}
		.system-node {
			padding: 14px;
			border-radius: 14px;
		}
		.system-node-heading {
			margin-bottom: 10px;
		}
		.system-node-heading h3 {
			font-size: 18px;
		}
		.system-node-heading p {
			display: none;
		}
		.system-logo-grid {
			gap: 8px;
		}
		.ai-logos {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.business-logos {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.system-logo-grid li {
			min-height: 70px;
			gap: 6px;
			padding: 4px;
			border-radius: 9px;
		}
		.system-wire {
			flex-direction: column;
			justify-content: center;
			height: 40px;
		}
		.system-wire > span {
			width: 6px;
			height: 20px;
			flex: 0 0 auto;
			background-size: 2px 100%;
		}
		.system-wire i {
			background: linear-gradient(180deg, transparent, #78993f 48%, #cae985 72%, transparent);
			--packet-start: translateY(-100%);
			--packet-end: translateY(100%);
		}
		.system-wire :global(svg) {
			margin: -3px 0 0;
			transform: rotate(90deg);
		}
		.system-wire small {
			top: 13px;
			left: calc(50% + 16px);
			transform: none;
			font-size: 10px;
		}
		.system-gateway {
			align-self: center;
			width: 210px;
			margin-block: 12px;
			gap: 16px;
			padding: 18px;
			box-shadow:
				0 0 0 6px #dbe8b535,
				0 0 0 12px #e2ecc81f;
		}
		.system-roles {
			gap: 8px;
		}
		.system-roles li {
			font-size: 13px;
		}
		.system-return {
			margin-top: 14px;
			padding-block: 22px;
		}
		.return-heading h3 {
			font-size: 16px;
		}
		.return-heading p {
			font-size: 12px;
		}
		.return-route {
			gap: 24px;
			margin-block: 18px;
		}
		.return-route li {
			padding: 14px 6px;
		}
		.return-connector {
			width: 24px;
			right: -25px;
		}
	}
	@media (max-width: 420px) {
		.system-map {
			padding-inline: 12px;
		}
		.system-node {
			padding-inline: 10px;
		}
		.system-logo-grid {
			gap: 6px;
		}
		.system-logo-grid li {
			padding-inline: 2px;
		}
		.system-logo-grid li span {
			font-size: 10px;
		}
		.return-heading {
			align-items: flex-start;
			gap: 9px;
		}
		.return-heading-icon {
			flex-basis: 34px;
			height: 36px;
		}
		.return-heading h3 {
			font-size: 14px;
		}
		.return-route {
			gap: 18px;
		}
		.return-route li {
			padding: 12px 4px;
		}
		.return-route strong {
			font-size: 11px;
		}
		.return-connector {
			width: 18px;
			right: -19px;
		}
		.return-node-icons {
			gap: 3px;
		}
		.return-orca-name {
			font-size: 12px;
		}
	}
</style>
