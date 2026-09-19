<script lang="ts">
	import ToolIcon from '$lib/orca/ToolIcon.svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import Brand from './Brand.svelte';
	import {
		Activity,
		CircleCheck,
		FileText,
		FolderOpen,
		KeyRound,
		LockKeyhole,
		Pencil,
		Search,
		ShieldCheck,
		Users
	} from '@lucide/svelte';

	let { variant }: { variant: 'connections' | 'access' | 'activity' } = $props();
	const id = $props.id();
	const heading = $derived(
		variant === 'connections'
			? t('การเชื่อมต่อ', 'Connections')
			: variant === 'access'
				? t('สิทธิ์ที่กำหนดไว้ในพื้นที่ทำงาน', 'Access defined in the workspace')
				: t('เมื่อทีมเรียกใช้เครื่องมือ', 'When your team calls a tool')
	);
</script>

<figure
	class="system-preview o-reveal"
	use:reveal
	data-system-preview={variant}
	aria-labelledby={`${id}-heading`}
>
	<figcaption
		class="preview-heading"
		class:connection-heading={variant === 'connections'}
		id={`${id}-heading`}
	>
		{#if variant === 'connections'}<Brand dark />{:else if variant === 'access'}<Users
				size={19}
				aria-hidden="true"
			/>{:else}<Activity size={19} aria-hidden="true" />{/if}
		<strong>{heading}</strong>
	</figcaption>

	<div class="preview-content" class:connection-content={variant === 'connections'}>
		{#if variant === 'connections'}
			<ul
				class="connection-tools"
				role="list"
				aria-label={t('เครื่องมือสำหรับงานของทีม', 'Tools for your team’s work')}
			>
				<li>
					<div class="connection-tool-logo">
						<ToolIcon name="google-drive" size={38} decorative />
					</div>
					<div class="connection-tool-copy">
						<span>Google Drive</span>
						<strong>{t('ค้นเอกสาร', 'Find documents')}</strong>
					</div>
					<Search class="connection-task-icon" size={21} aria-hidden="true" />
				</li>
				<li>
					<div class="connection-tool-logo">
						<ToolIcon name="google-sheets" size={38} decorative />
					</div>
					<div class="connection-tool-copy">
						<span>Google Sheets</span>
						<strong>{t('อัปเดตรายการ', 'Update records')}</strong>
					</div>
					<Pencil class="connection-task-icon" size={21} aria-hidden="true" />
				</li>
				<li>
					<div class="connection-tool-logo">
						<ToolIcon name="flowaccount" size={38} decorative />
					</div>
					<div class="connection-tool-copy">
						<span>FlowAccount</span>
						<strong>{t('งานบัญชี', 'Accounting tasks')}</strong>
					</div>
					<FileText class="connection-task-icon" size={21} aria-hidden="true" />
				</li>
			</ul>
			<p class="connection-permissions">
				<ShieldCheck size={18} aria-hidden="true" />
				<span
					>{t(
						'เลือกเครื่องมือและกำหนดสิทธิ์ให้แต่ละทีม',
						'Choose the tools and access for each team'
					)}</span
				>
			</p>
		{:else if variant === 'access'}
			<div class="workspace-card">
				<FolderOpen size={25} aria-hidden="true" />
				<div>
					<span>{t('พื้นที่ทำงาน', 'Workspace')}</span><strong
						>{t('ฝ่ายบุคคล', 'People team')}</strong
					>
				</div>
			</div>
			<div class="workspace-source">
				<ToolIcon name="google-drive" size={28} decorative />
				<span>Google Drive</span>
				<small>{t('แหล่งข้อมูลของพื้นที่ทำงาน', 'Workspace data source')}</small>
			</div>

			<table class="access-table">
				<caption>{t('ใครใช้เครื่องมือใดได้บ้าง', 'Who can use each tool')}</caption>
				<thead
					><tr
						><th scope="col">{t('ผู้ใช้', 'Person')}</th><th scope="col">{t('ค้นหา', 'Search')}</th
						><th scope="col">{t('อ่านข้อมูล', 'Read')}</th></tr
					></thead
				>
				<tbody>
					<tr>
						<th scope="row"
							><span class="member-name">{t('สมาชิกในพื้นที่ทำงาน', 'Workspace member')}</span></th
						>
						<td
							><span class="permission allowed"
								><CircleCheck size={18} aria-hidden="true" />{t('ใช้ได้', 'Allowed')}</span
							></td
						>
						<td
							><span class="permission allowed"
								><CircleCheck size={18} aria-hidden="true" />{t('ใช้ได้', 'Allowed')}</span
							></td
						>
					</tr>
					<tr>
						<th scope="row"
							><span class="member-name"
								>{t('ผู้ใช้ที่ไม่ใช่สมาชิก', 'Person outside the workspace')}</span
							></th
						>
						<td
							><span class="permission denied"
								><LockKeyhole size={17} aria-hidden="true" />{t('ไม่มีสิทธิ์', 'No access')}</span
							></td
						>
						<td
							><span class="permission denied"
								><LockKeyhole size={17} aria-hidden="true" />{t('ไม่มีสิทธิ์', 'No access')}</span
							></td
						>
					</tr>
				</tbody>
			</table>

			<div class="personal-key-note">
				<KeyRound size={20} aria-hidden="true" />
				<p>
					{t(
						'สมาชิกเชื่อมแอป AI ด้วยคีย์เชื่อมต่อของตนเอง',
						'Each member connects their AI app using their own connection key.'
					)}
				</p>
			</div>
			<p class="preview-note">
				<ShieldCheck size={17} aria-hidden="true" />
				<span
					>{t(
						'เจ้าขององค์กรต้องเป็นสมาชิกของพื้นที่ทำงานด้วย จึงจะเข้าถึงข้อมูลได้',
						'Organization owners also need workspace membership to access its data.'
					)}</span
				>
			</p>
		{:else}
			<div class="activity-columns" aria-hidden="true">
				<span>{t('ผู้ใช้และเครื่องมือ', 'Person and tool')}</span><span
					>{t('ผลลัพธ์', 'Outcome')}</span
				>
			</div>
			<ol
				class="activity-list"
				aria-label={t(
					'รายละเอียดที่ตรวจสอบได้ในประวัติการใช้งาน',
					'Details available in activity records'
				)}
			>
				<li>
					<div class="activity-source"><ToolIcon name="google-drive" size={27} decorative /></div>
					<div class="activity-copy">
						<strong>{t('สมาชิกฝ่ายบุคคล', 'People team member')}</strong>
						<span>{t('ค้นหาเอกสาร', 'Find documents')}</span>
						<small>Google Drive · {t('พื้นที่ทำงานฝ่ายบุคคล', 'People workspace')}</small>
					</div>
					<span class="activity-result allowed"
						><CircleCheck size={16} aria-hidden="true" />{t('สำเร็จ', 'Succeeded')}</span
					>
				</li>
				<li>
					<div class="activity-source"><ToolIcon name="slack" size={27} decorative /></div>
					<div class="activity-copy">
						<strong>{t('สมาชิกทีมปฏิบัติการ', 'Operations team member')}</strong>
						<span>{t('ค้นหาข้อความ', 'Find messages')}</span>
						<small>Slack · {t('พื้นที่ทำงานทีมปฏิบัติการ', 'Operations workspace')}</small>
					</div>
					<span class="activity-result allowed"
						><CircleCheck size={16} aria-hidden="true" />{t('สำเร็จ', 'Succeeded')}</span
					>
				</li>
				<li>
					<div class="activity-source"><ToolIcon name="google-drive" size={27} decorative /></div>
					<div class="activity-copy">
						<strong>{t('สมาชิกฝ่ายบุคคล', 'People team member')}</strong>
						<span>{t('เครื่องมือที่ไม่ได้รับอนุญาต', 'Tool outside permitted access')}</span>
						<small>Google Drive · {t('พื้นที่ทำงานฝ่ายบุคคล', 'People workspace')}</small>
					</div>
					<span class="activity-result denied"
						><LockKeyhole size={15} aria-hidden="true" />{t('ไม่อนุญาต', 'Denied')}</span
					>
				</li>
			</ol>
			<p class="activity-explanation">
				{t(
					'เมื่อเชื่อมระบบผ่าน MCP ที่รองรับแล้ว คุณตรวจสอบผู้ใช้ เครื่องมือ และผลการใช้งานได้ตามสิทธิ์',
					'Once a system is connected through compatible MCP, review people, tools and outcomes within your access permissions.'
				)}
			</p>
			<p class="preview-note">
				<ShieldCheck size={17} aria-hidden="true" /><span
					>{t(
						'รายการที่ไม่อนุญาตจะไม่เปิดเผยชื่อเครื่องมือ',
						'Denied entries do not disclose the tool name.'
					)}</span
				>
			</p>
		{/if}
	</div>
</figure>

<style>
	.system-preview {
		box-sizing: border-box;
		container-type: inline-size;
		width: 100%;
		min-width: 0;
		margin: 0;
		border: 1px solid #dce0e8;
		border-radius: 16px;
		background: #fff;
		color: #151823;
		font-family: 'ORCA Noto Sans Thai', Tahoma, sans-serif;
		font-size: 14px;
		line-height: 1.7;
	}
	.system-preview *,
	.system-preview *::before,
	.system-preview *::after {
		box-sizing: border-box;
	}
	.system-preview p,
	.system-preview ul,
	.system-preview ol {
		margin: 0;
	}
	.system-preview :global(svg) {
		flex-shrink: 0;
	}
	.preview-heading {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 18px 22px;
		border-bottom: 1px solid #dce0e8;
		border-radius: 16px 16px 0 0;
		background: #f5f6fa;
		color: #405035;
		font-size: 13px;
	}
	.preview-heading strong {
		font-weight: 650;
		color: #303b4c;
	}
	.preview-content {
		min-width: 0;
		padding: 24px;
		background: radial-gradient(ellipse at 85% 40%, #d5f47812, transparent 65%);
	}
	.system-preview[data-system-preview='connections'] {
		box-shadow: 0 15px 42px -28px #15182340;
	}
	.connection-heading {
		justify-content: space-between;
		gap: 18px;
		padding-block: 19px;
		border-color: #282e3f;
		background: var(--o-ink, #151823);
	}
	.connection-heading strong {
		color: #e5ebd8;
		font-size: 13px;
		font-weight: 500;
	}
	.connection-heading :global(.orca-wordmark) {
		font-size: 27px;
	}
	.connection-heading :global(.orca-symbol) {
		width: 28px;
		transform: rotate(-14deg) scale(0.82);
		transform-origin: left center;
	}
	.connection-content {
		border-radius: 0 0 16px 16px;
		background: linear-gradient(145deg, #f7f9fc, #f3f6ec);
	}
	.connection-tools {
		display: grid;
		gap: 10px;
		padding: 0;
		list-style: none;
	}
	.connection-tools li {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr) 21px;
		align-items: center;
		gap: 15px;
		padding: 14px 16px;
		border: 1px solid #e0e5dd;
		border-radius: 12px;
		background: #fff;
	}
	.connection-tool-logo {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border: 1px solid #eef0f3;
		border-radius: 12px;
		background: #fcfcfe;
	}
	.connection-tool-copy {
		min-width: 0;
	}
	.connection-tool-copy span,
	.connection-tool-copy strong {
		display: block;
		overflow-wrap: anywhere;
	}
	.connection-tool-copy span {
		margin-bottom: 3px;
		color: #758095;
		font-size: 11px;
	}
	.connection-tool-copy strong {
		color: #222c3c;
		font-size: 16px;
		font-weight: 650;
		line-height: 1.5;
	}
	.connection-tools :global(.connection-task-icon) {
		color: #839366;
	}
	.connection-permissions {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-top: 16px !important;
		padding: 12px 14px;
		border-radius: 10px;
		background: #eaf0dc;
		color: #586e37;
		font-size: 11px;
		line-height: 1.7;
	}
	.preview-note {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-top: 19px !important;
		color: #61704f;
		font-size: 11px;
		line-height: 1.8;
	}
	.preview-note :global(svg) {
		margin-top: 2px;
	}
	.workspace-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 18px 20px;
		border-radius: 12px;
		background: #1e2635;
		color: var(--o-citron, #d5f478);
	}
	.workspace-card span,
	.workspace-card strong {
		display: block;
	}
	.workspace-card span {
		font-size: 11px;
		color: #bbc4d1;
	}
	.workspace-card strong {
		font-size: 18px;
		font-weight: 650;
		color: #f2f5fb;
	}
	.workspace-source {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		padding: 17px 2px;
	}
	.workspace-source > span {
		font-size: 13px;
		font-weight: 650;
	}
	.workspace-source small {
		margin-left: auto;
		font-size: 10px;
		color: #677287;
	}
	.access-table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: 12px;
	}
	.access-table caption {
		padding: 4px 0 15px;
		text-align: left;
		font-weight: 650;
		font-size: 14px;
	}
	.access-table th,
	.access-table td {
		padding: 15px 7px;
		border-block: 1px solid #e0e4ec;
		text-align: center;
		vertical-align: middle;
		overflow-wrap: anywhere;
	}
	.access-table th:first-child {
		width: 44%;
		padding-left: 0;
		text-align: left;
	}
	.access-table thead th {
		padding-block: 10px;
		font-weight: 500;
		font-size: 11px;
		color: #677287;
	}
	.access-table tbody th {
		font-weight: 550;
		color: #384357;
	}
	.permission {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		font-size: 11px;
	}
	.allowed {
		color: #4d6e28;
	}
	.denied {
		color: #715278;
	}
	.personal-key-note {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 19px;
		padding: 13px 15px;
		border-radius: 10px;
		background: #f1f4e9;
		color: #526735;
	}
	.personal-key-note p {
		font-size: 12px;
		line-height: 1.75;
	}
	.activity-columns {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 0 0 13px;
		color: #677287;
		font-size: 11px;
	}
	.activity-list {
		padding: 0;
		list-style: none;
		border-block: 1px solid #dce0e8;
	}
	.activity-list li {
		display: grid;
		grid-template-columns: 38px minmax(0, 1fr) auto;
		align-items: start;
		gap: 12px;
		padding: 21px 0;
	}
	.activity-list li + li {
		border-top: 1px solid #e5e8ef;
	}
	.activity-source {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 10px;
		background: #f3f5f8;
	}
	.activity-copy {
		min-width: 0;
	}
	.activity-copy strong,
	.activity-copy span,
	.activity-copy small {
		display: block;
		overflow-wrap: anywhere;
	}
	.activity-copy strong {
		color: #384357;
		font-size: 13px;
		font-weight: 650;
	}
	.activity-copy span {
		margin-top: 4px;
		color: #596276;
		font-size: 12px;
	}
	.activity-copy small {
		margin-top: 4px;
		color: #788295;
		font-size: 10px;
	}
	.activity-result {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 5px;
		padding-top: 3px;
		font-size: 11px;
		line-height: 1.6;
	}
	.activity-explanation {
		margin-top: 20px !important;
		color: #384357;
		font-size: 13px;
		line-height: 1.8;
	}
	@container (max-width: 430px) {
		.preview-content {
			padding: 19px;
		}
		.connection-tools li {
			gap: 12px;
			padding: 12px;
		}
		.connection-tool-copy strong {
			font-size: 15px;
		}
		.permission {
			flex-direction: column;
			gap: 5px;
		}
		.workspace-source small {
			flex-basis: 100%;
			margin-left: 36px;
		}
		.activity-list li {
			grid-template-columns: 34px minmax(0, 1fr);
			gap: 7px 10px;
		}
		.activity-source {
			width: 34px;
			height: 36px;
			grid-row: span 2;
		}
		.activity-result {
			grid-column: 2;
			justify-content: flex-start;
			padding-top: 0;
		}
		.activity-columns span:last-child {
			display: none;
		}
	}
	@container (max-width: 320px) {
		.preview-heading {
			padding: 16px;
			font-size: 12px;
		}
		.preview-content {
			padding: 16px;
		}
		.connection-tools li {
			grid-template-columns: 44px minmax(0, 1fr);
			gap: 10px;
		}
		.connection-tool-logo {
			width: 44px;
			height: 44px;
		}
		.connection-tools :global(.connection-task-icon) {
			display: none;
		}
		.connection-permissions {
			align-items: flex-start;
			padding-inline: 10px;
		}
	}

	.system-preview {
		position: relative;
		isolation: isolate;
		box-shadow:
			0 22px 50px -30px #59607960,
			0 2px 4px #252d4b05;
	}
	.preview-content {
		background:
			radial-gradient(ellipse at 0% 0%, #e6efcd66, transparent 65%),
			radial-gradient(ellipse at 100% 100%, #e5ddf43d, transparent 65%);
	}
	.connection-heading {
		background: radial-gradient(ellipse at 0% 0%, #bdde6021, transparent 75%), #151823;
	}
	@media (prefers-reduced-motion: no-preference) {
		.system-preview:global([data-orca-motion='entered']) .connection-tools li {
			animation: preview-tool-arrive 750ms ease-out 150ms both;
		}
		.system-preview:global([data-orca-motion='entered']) .connection-tools li:nth-child(2) {
			animation-delay: 300ms;
		}
		.system-preview:global([data-orca-motion='entered']) .connection-tools li:nth-child(3) {
			animation-delay: 450ms;
		}
	}
	@keyframes preview-tool-arrive {
		from {
			opacity: 0;
			transform: translateY(9px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
