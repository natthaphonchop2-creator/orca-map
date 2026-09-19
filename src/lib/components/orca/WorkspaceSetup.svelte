<script lang="ts">
	import { connectionReady, workspaceToolingReady } from '$lib/orca/activation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import { Check, ChevronDown } from '@lucide/svelte';

	let { data }: { data: OrcaBootstrap } = $props();
	const readyConnections = $derived(data.connections.filter(connectionReady));
	const createWorkspaceHref = $derived(
		`/app?view=new${readyConnections.length === 1 ? `&connection=${encodeURIComponent(readyConnections[0].id)}` : ''}`
	);
	const hasOtherMember = $derived(data.members.some((member) => member.id !== data.currentUserID));
	const usableHubs = $derived(
		data.hubs.filter((hub) => {
			const source = readyConnections.find((connection) => connection.id === hub.connectionID);
			return hub.status === 'active' && workspaceToolingReady(hub, source);
		})
	);
	const steps = $derived([
		{
			title: t('ตั้งค่า Server', 'Configure server'),
			description: t('เลือกเครื่องมือที่ทีมใช้ได้', 'Review the tools your team can use'),
			done: readyConnections.length > 0,
			href: '/app?view=servers'
		},
		{
			title: t('สร้างพื้นที่ทำงาน', 'Create a workspace'),
			description: t('จัดเครื่องมือให้พร้อมเริ่มงาน', 'Bring your tools together'),
			done: usableHubs.length > 0,
			href: createWorkspaceHref
		},
		{
			title: t('กำหนดสมาชิก', 'Assign members'),
			description: hasOtherMember
				? t('เพิ่มสมาชิกในพื้นที่ทำงาน', 'Add people to your workspace')
				: t('เตรียมบัญชีให้ทีมเข้าสู่ระบบ', 'Set up sign-in accounts for your team'),
			done: usableHubs.some((hub) =>
				data.members.some(
					(member) => member.id !== data.currentUserID && hub.memberIDs.includes(member.id)
				)
			),
			href: hasOtherMember
				? usableHubs[0]
					? `/app?view=new&edit=${encodeURIComponent(usableHubs[0].id)}`
					: createWorkspaceHref
				: '/app?view=members'
		}
	]);
	const nextStep = $derived(steps.findIndex((step) => !step.done));
</script>

{#if data.canManage}
	<details class="workspace-setup">
		<summary>
			<span class="setup-heading">
				<strong>{t('เริ่มต้นกับ ORCA', 'Get started with ORCA')}</strong>
				<span
					>{steps.filter((step) => step.done).length} / {steps.length}
					{t('รายการตั้งค่า', 'setup items complete')}</span
				>
			</span>
			<ChevronDown size={19} class="setup-chevron" aria-hidden="true" />
		</summary>
		<ol>
			{#each steps as step, index}
				<li>
					<a href={localeHref(step.href)} class:next={index === nextStep}>
						<span class="step-marker" class:done={step.done} aria-hidden="true">
							{#if step.done}<Check size={17} />{:else}{index + 1}{/if}
						</span>
						<span class="step-copy">
							<strong>{step.title}</strong>
							<small>{step.description}</small>
							{#if step.done}<span class="sr-only">{t('ตั้งค่าแล้ว', 'Configured')}</span>{/if}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</details>
{/if}

<style>
	.workspace-setup {
		margin-bottom: 24px;
		background: white;
		border: 1px solid #dfe3ed;
		border-radius: 12px;
		color: var(--o-ink);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 64px;
		padding: 18px 22px;
		border-radius: 12px;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: #f8faf5;
	}
	summary:focus-visible,
	a:focus-visible {
		outline: 3px solid #739831;
		outline-offset: 3px;
	}
	.setup-heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 6px 16px;
	}
	.setup-heading strong {
		font-size: 16px;
		font-weight: 690;
	}
	.setup-heading > span {
		color: #717b90;
		font-size: 12px;
	}
	summary :global(.setup-chevron) {
		flex-shrink: 0;
		color: #647087;
	}
	details[open] summary :global(.setup-chevron) {
		transform: rotate(180deg);
	}
	ol {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		list-style: none;
		margin: 0 22px;
		padding: 22px 0;
		border-top: 1px solid #e5e9ef;
		gap: 20px;
	}
	li {
		min-width: 0;
	}
	li a {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 44px;
		border-radius: 6px;
		color: inherit;
		text-decoration: none;
	}
	a:hover .step-copy strong {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.step-marker {
		display: grid;
		place-items: center;
		flex: 0 0 33px;
		height: 33px;
		border: 1px solid #dbe0e9;
		border-radius: 50%;
		background: #f5f6f9;
		color: #707a8e;
		font-size: 13px;
		font-weight: 650;
	}
	.next .step-marker {
		border-color: var(--o-citron);
		background: var(--o-citron);
		color: var(--o-ink);
	}
	.step-marker.done {
		background: #f0f6df;
		border-color: #d6e6b2;
		color: #527530;
	}
	.step-copy {
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.step-copy strong {
		font-size: 13px;
		line-height: 1.5;
		font-weight: 650;
	}
	.step-copy small {
		font-size: 12px;
		line-height: 1.55;
		color: #717b90;
	}
	.sr-only {
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
	@media (max-width: 900px) {
		ol {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 640px) {
		summary {
			padding: 16px;
		}
		ol {
			margin: 0 16px;
			padding: 18px 0;
		}
	}
</style>
