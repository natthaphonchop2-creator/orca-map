<script lang="ts">
	import ToolIcon, { type ToolName } from './ToolIcon.svelte';
	import { localeHref, t } from './locale.svelte';
	import { reveal } from './motion';
	import { ArrowUpRight, Plug, Cable, BookOpen, ShieldCheck, Workflow } from '@lucide/svelte';

	const instanceId = $props.id();
	const headingId = `${instanceId}-tools-heading`;
	const noteId = `${instanceId}-tools-note`;
	type Tool = { name: ToolName; label: string; purpose: string };
	const groups = $derived([
		{
			id: 'mcp',
			label: 'MCP',
			icon: Plug,
			title: t('ให้ AI เรียกใช้เครื่องมือผ่านมาตรฐานเดียว', 'A common language for AI tools'),
			description: t(
				'เชื่อมกับ MCP server ของผู้ให้บริการ เพื่อให้ AI ใช้เครื่องมือที่องค์กรอนุญาต',
				'Connect to provider MCP servers so AI can use the tools your organization allows.'
			),
			tools: [
				{
					name: 'slack',
					label: 'Slack MCP',
					purpose: t('ข้อความและงานของทีม', 'Team conversations')
				},
				{
					name: 'microsoft',
					label: 'Microsoft Learn',
					purpose: t('เอกสารสาธารณะของ Microsoft', 'Public Microsoft documentation')
				},
				{
					name: 'aws',
					label: 'AWS Knowledge',
					purpose: t('เอกสารสาธารณะของ AWS', 'Public AWS documentation')
				},
				{
					name: 'peak',
					label: 'PEAK MCP',
					purpose: t('เอกสารบัญชีตามสิทธิ์', 'Permitted accounting documents')
				}
			] satisfies Tool[]
		},
		{
			id: 'api',
			label: 'API',
			icon: Cable,
			title: t('เชื่อมข้อมูลและขั้นตอนงานกับระบบธุรกิจ', 'Connect business data and workflows'),
			description: t(
				'ใช้ API ที่แต่ละโปรแกรมเปิดให้ เพื่อเชื่อมข้อมูลและออกแบบงานให้ตรงกับธุรกิจของคุณ',
				'Use each product’s APIs to connect data and shape workflows around your business.'
			),
			tools: [
				{
					name: 'google-drive',
					label: 'Google Drive API',
					purpose: t('ไฟล์และเอกสาร', 'Files & documents')
				},
				{
					name: 'google-docs',
					label: 'Google Docs API',
					purpose: t('เนื้อหาและคู่มือ', 'Content & manuals')
				},
				{
					name: 'google-sheets',
					label: 'Google Sheets API',
					purpose: t('ตารางและรายงาน', 'Spreadsheets & reports')
				},
				{
					name: 'microsoft',
					label: 'Microsoft Graph',
					purpose: t('งานใน Microsoft 365', 'Microsoft 365 data')
				},
				{
					name: 'line',
					label: 'LINE Messaging API',
					purpose: t('ข้อความผ่าน LINE OA', 'LINE OA messages')
				},
				{
					name: 'peak',
					label: 'PEAK Open API',
					purpose: t('ข้อมูลและเอกสารบัญชี', 'Accounting data')
				},
				{
					name: 'flowaccount',
					label: 'FlowAccount OpenAPI',
					purpose: t('เอกสารและการเงิน', 'Documents & finance')
				},
				{
					name: 'oracle',
					label: 'Oracle Hospitality',
					purpose: t('ข้อมูลโรงแรมผ่าน OHIP', 'Hotel data via OHIP')
				},
				{
					name: 'sap',
					label: 'SAP APIs',
					purpose: t('ข้อมูลธุรกิจและ ERP', 'Business & ERP data')
				},
				{
					name: 'salesforce',
					label: 'Salesforce REST API',
					purpose: t('ข้อมูลลูกค้าและงานขาย', 'CRM & sales data')
				},
				{
					name: 'aws',
					label: 'AWS APIs',
					purpose: t('บริการคลาวด์ตามสิทธิ์', 'Authorized cloud services')
				},
				{
					name: 'api',
					label: t('API อื่น ๆ', 'Other APIs'),
					purpose: t('ระบบเฉพาะของบริษัท', 'Your internal systems')
				}
			] satisfies Tool[]
		}
	]);
</script>

<section class="orca-tools" aria-labelledby={headingId} aria-describedby={noteId} use:reveal>
	<div class="orca-tools-inner">
		<div class="orca-tools-intro o-reveal" use:reveal>
			<h2 id={headingId}>
				{t('เชื่อมความรู้และเครื่องมือ', 'Your knowledge and tools,')}<br />{t(
					'เข้ากับ AI ของทีม',
					'connected to AI.'
				)}
			</h2>
			<p>
				{t(
					'เริ่มจากโปรแกรมที่ธุรกิจใช้ เชื่อมผ่าน MCP หรือ API เพื่อให้ความรู้และขั้นตอนงานของบริษัทอยู่ในจังหวะเดียวกัน',
					'Start with the apps your business uses. MCP and API connections bring company knowledge and workflows together.'
				)}
			</p>
		</div>

		{#each groups as group (group.id)}
			<section class="connection-group" aria-labelledby={`${instanceId}-${group.id}`}>
				<header class="connection-group-heading">
					<span class="connection-kind" class:api={group.id === 'api'}
						><group.icon size={19} aria-hidden="true" />{group.label}</span
					>
					<div>
						<h3 id={`${instanceId}-${group.id}`}>{group.title}</h3>
						<p>{group.description}</p>
					</div>
				</header>
				<ul
					class="orca-tools-list"
					aria-label={t(`ตัวอย่างช่องทาง ${group.label}`, `${group.label} connection examples`)}
				>
					{#each group.tools as tool, index (tool.name)}
						<li class="orca-tools-item o-reveal" use:reveal={{ delay: (index % 6) * 55 }}>
							<a
								class="orca-tools-link"
								href={localeHref('/start')}
								aria-label={t(
									`ปรึกษาการเชื่อมต่อ ${tool.label}`,
									`Discuss connecting ${tool.label}`
								)}
							>
								<span class="orca-tools-image"><ToolIcon name={tool.name} decorative /></span>
								<span class="orca-tools-name">
									{tool.label}
								</span>
								<small class="tool-purpose">{tool.purpose}</small>
							</a>
						</li>
					{/each}
					{#if group.id === 'mcp'}
						<li class="orca-tools-item registry-item o-reveal" use:reveal={{ delay: 220 }}>
							<a
								class="orca-tools-link orca-tools-more"
								href="https://registry.modelcontextprotocol.io/"
								target="_blank"
								rel="noreferrer"
							>
								<span>{t('และอีกกว่า', 'Explore more than')}</span>
								<strong>12,000</strong>
								<span>MCP servers <ArrowUpRight size={14} aria-hidden="true" /></span>
								<small>{t('ใน MCP Registry', 'in the MCP Registry')}</small>
								<small>{t('ตรวจนับ 8 ก.ย. 2026', 'Counted 8 Sep 2026')}</small>
							</a>
						</li>
					{/if}
				</ul>
			</section>
		{/each}

		<div
			class="company-context"
			role="group"
			aria-label={t('จากความรู้สู่การทำงาน', 'From knowledge to work')}
		>
			<div>
				<BookOpen size={21} aria-hidden="true" /><span
					>{t('รวมความรู้ของบริษัท', 'Connect company knowledge')}</span
				>
			</div>
			<span class="context-arrow" aria-hidden="true">→</span>
			<div>
				<ShieldCheck size={21} aria-hidden="true" /><span
					>{t('ให้ AI ใช้ตามสิทธิ์', 'Give AI permitted context')}</span
				>
			</div>
			<span class="context-arrow" aria-hidden="true">→</span>
			<div>
				<Workflow size={21} aria-hidden="true" /><span
					>{t('ช่วยทีมทำงานตามขั้นตอน', 'Support your team’s workflows')}</span
				>
			</div>
		</div>

		<div class="orca-tools-footer o-reveal" use:reveal={{ delay: 100 }}>
			<p id={noteId}>
				{t(
					'โปรแกรมหนึ่งอาจรองรับทั้ง MCP และ API ทีม ORCA ตรวจสอบช่องทางและสิทธิ์ก่อนเปิดใช้ จำนวนใน MCP Registry เป็นข้อมูลคลังสาธารณะ ไม่ใช่จำนวนระบบที่ ORCA ทดสอบแล้ว',
					'One product may support both MCP and APIs. ORCA reviews connection requirements and permissions before activation. The public registry count does not represent ORCA-tested integrations.'
				)}
			</p>
			<a class="orca-tools-discuss" href={localeHref('/start')}>
				{t('ปรึกษาการเชื่อมต่อระบบ', 'Discuss your team’s tools')}<ArrowUpRight
					size={17}
					aria-hidden="true"
				/>
			</a>
		</div>
	</div>
</section>

<style>
	.orca-tools {
		position: relative;
		isolation: isolate;
		background: #fbfbfd;
		color: #151823;
		padding-block: clamp(42px, 5vw, 66px) 18px;
	}
	.orca-tools::before,
	.orca-tools::after {
		content: '';
		position: absolute;
		z-index: -1;
		pointer-events: none;
	}
	.orca-tools::before {
		inset: 0;
		background:
			radial-gradient(ellipse 36% 48% at 5% 9%, rgb(214 244 121 / 12%), transparent),
			radial-gradient(ellipse 38% 60% at 96% 66%, rgb(132 101 229 / 5%), transparent);
	}
	.orca-tools::after {
		inset: 0 12% auto;
		height: 1px;
		background: linear-gradient(90deg, transparent, #dce7c6 35%, #e6e0f2 70%, transparent);
	}
	.orca-tools-inner {
		width: min(1180px, calc(100% - 80px));
		margin-inline: auto;
	}
	.orca-tools-intro {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 20px 50px;
		margin-bottom: 26px;
	}
	.orca-tools-intro h2 {
		flex-shrink: 0;
		margin: 0;
		font-size: clamp(22px, 2.1vw, 28px);
		font-weight: 650;
		line-height: 1.55;
		letter-spacing: -0.015em;
		text-wrap: balance;
	}
	.orca-tools-intro p {
		max-width: 46ch;
		margin: 0;
		color: #596276;
		font-size: 14px;
		line-height: 1.85;
		text-wrap: pretty;
	}
	.orca-tools-list {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.connection-group {
		padding-block: 26px 30px;
		border-top: 1px solid #dce0e8;
	}
	.connection-group-heading {
		display: flex;
		gap: 18px;
		align-items: flex-start;
		margin-bottom: 22px;
	}
	.connection-kind {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		padding: 11px 14px;
		border: 1px solid #d3dfb8;
		border-radius: 10px;
		background: #f1f5e9;
		color: #425b25;
		font-size: 14px;
		font-weight: 700;
	}
	.connection-kind.api {
		background: #f1edf8;
		color: #67508b;
		border-color: #ded4ee;
	}
	.connection-group h3 {
		margin: 0 0 5px;
		font-size: 19px;
		font-weight: 650;
		line-height: 1.5;
	}
	.connection-group-heading p {
		margin: 0;
		color: #596276;
		font-size: 14px;
		line-height: 1.75;
	}
	.registry-item {
		grid-column: span 2;
	}
	.tool-purpose {
		color: #647087;
		font-size: 11px;
		line-height: 1.5;
	}
	.company-context {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 24px;
		padding: 24px;
		border-radius: 14px;
		background: #1a2025;
		color: #f5f6fa;
	}
	.company-context > div {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		line-height: 1.6;
	}
	.company-context :global(svg) {
		flex-shrink: 0;
		color: #d5f478;
	}
	.context-arrow {
		color: #d5f478;
	}
	.orca-tools-item {
		min-width: 0;
	}
	.orca-tools-link {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		min-height: 124px;
		height: 100%;
		padding: 17px 9px 15px;
		border: 1px solid #dce0e8;
		border-radius: 12px;
		background: #fff;
		color: #151823;
		text-align: center;
		text-decoration: none;
		transition:
			border-color 180ms ease-out,
			box-shadow 220ms ease-out,
			transform 220ms cubic-bezier(0.2, 0.7, 0.25, 1);
	}
	.orca-tools-link::before,
	.orca-tools-link::after {
		content: '';
		position: absolute;
		z-index: -1;
		pointer-events: none;
	}
	.orca-tools-link::before {
		inset: 0;
		background:
			radial-gradient(ellipse at 20% 0%, rgb(214 244 121 / 16%), transparent 68%),
			radial-gradient(ellipse at 100% 100%, rgb(132 101 229 / 5%), transparent 68%);
		opacity: 0;
		transition: opacity 220ms ease-out;
	}
	.orca-tools-link::after {
		inset: 0 12% auto;
		height: 1px;
		background: linear-gradient(90deg, transparent, #dbe8bf, #e5dff5, transparent);
		opacity: 0;
		transition: opacity 220ms ease-out;
	}
	.orca-tools-link:hover,
	.orca-tools-link:focus-visible {
		border-color: #8b9c6a;
		box-shadow:
			0 7px 16px rgb(21 24 35 / 7%),
			0 1px 3px rgb(21 24 35 / 4%);
	}
	.orca-tools-link:is(:hover, :focus-visible)::before,
	.orca-tools-link:is(:hover, :focus-visible)::after {
		opacity: 1;
	}
	.orca-tools-link:focus-visible,
	.orca-tools-discuss:focus-visible {
		outline: 3px solid #8465e5;
		outline-offset: 4px;
	}
	.orca-tools-image {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 54px;
	}
	.orca-tools-name {
		font-size: 12px;
		font-weight: 600;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.orca-tools-more {
		gap: 2px;
		border-color: #d3dfb8;
		background: #f1f5e9;
		color: #425b25;
	}
	.orca-tools-more > span {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		line-height: 1.5;
	}
	.orca-tools-more strong {
		font-size: clamp(25px, 2.3vw, 32px);
		line-height: 1.25;
		letter-spacing: -0.035em;
	}
	.orca-tools-more small {
		font-size: 10px;
		line-height: 1.5;
		color: #59674a;
	}
	.orca-tools-footer {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px 38px;
		margin-top: 22px;
	}
	.orca-tools-footer p {
		max-width: 75ch;
		margin: 0;
		color: #596276;
		font-size: 12px;
		line-height: 1.85;
		text-wrap: pretty;
	}
	.orca-tools-discuss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		flex-shrink: 0;
		min-height: 36px;
		padding: 5px 0;
		color: #253313;
		font-size: 12px;
		font-weight: 650;
		text-decoration: underline;
		text-decoration-color: #a8bc77;
		text-underline-offset: 5px;
	}
	.orca-tools-discuss:hover {
		text-decoration-color: #253313;
	}
	@media (prefers-reduced-motion: no-preference) {
		.orca-tools:global([data-orca-motion='entered'])::before {
			animation: orca-tools-light-arrive 1500ms ease-out both;
		}
		.orca-tools-image,
		.orca-tools-discuss :global(svg),
		.orca-tools-more :global(svg) {
			transition: transform 220ms cubic-bezier(0.2, 0.7, 0.25, 1);
		}
		.orca-tools-link:is(:hover, :focus-visible) .orca-tools-image {
			transform: translateY(-2px) scale(1.045);
		}
		.orca-tools-discuss:is(:hover, :focus-visible) :global(svg),
		.orca-tools-more:is(:hover, :focus-visible) :global(svg) {
			transform: translate(2px, -2px);
		}
	}
	@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
		.orca-tools-link:hover {
			transform: translateY(-3px);
		}
	}
	@keyframes orca-tools-light-arrive {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (max-width: 1100px) {
		.orca-tools-list {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.orca-tools-link {
			min-height: 114px;
		}
	}
	@media (max-width: 900px) {
		.company-context {
			gap: 14px;
		}
		.orca-tools-inner {
			width: calc(100% - 48px);
		}
		.orca-tools-intro {
			flex-direction: column;
			gap: 8px;
			margin-bottom: 22px;
		}
		.orca-tools-intro p {
			max-width: 60ch;
		}
		.orca-tools-footer {
			flex-direction: column;
			gap: 9px;
		}
	}
	@media (max-width: 580px) {
		.connection-group-heading {
			flex-direction: column;
			gap: 12px;
		}
		.company-context {
			align-items: flex-start;
			flex-direction: column;
			gap: 12px;
			padding: 22px;
		}
		.context-arrow {
			transform: rotate(90deg);
			margin-left: 3px;
		}
		.orca-tools-inner {
			width: calc(100% - 40px);
		}
		.orca-tools-list {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 10px;
		}
		.orca-tools-link {
			min-height: 112px;
			gap: 11px;
			padding-block: 14px;
		}
		.orca-tools-intro h2 {
			font-size: 22px;
		}
		.orca-tools-name {
			font-size: 11px;
		}
		.orca-tools-more {
			gap: 2px;
		}
	}
	@media (max-width: 360px) {
		.orca-tools-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orca-tools-link,
		.orca-tools-link::before,
		.orca-tools-link::after {
			transition: none;
		}
	}
</style>
