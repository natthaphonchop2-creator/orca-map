<script lang="ts">
  import { gatewayHasMember } from '$lib/orca/gateway-sources';
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
		data.hubs.filter((hub) => hub.status === 'active' && workspaceToolingReady(hub, readyConnections))
	);
	const steps = $derived([
		{
			title: t('เชื่อมต่อระบบ', 'Connect a system'),
			description: t('เชื่อมต่อระบบและตรวจสอบเครื่องมือที่อนุญาต', 'Connect a system and review its allowed tools'),
			done: readyConnections.length > 0,
			href: '/app?view=servers'
		},
		{
			title: t('สร้างพื้นที่ทำงาน AI', 'Create an AI workspace'),
			description: t('รวมระบบและเครื่องมือที่ทีมต้องใช้ไว้ในที่เดียว', 'Bring the systems and tools your team needs into one place'),
			done: usableHubs.length > 0,
			href: createWorkspaceHref
		},
		{
			title: t('กำหนดสมาชิก', 'Assign members'),
			description: hasOtherMember
				? t('เพิ่มสมาชิกหรือแผนกในพื้นที่ทำงาน AI', 'Add members or departments to the AI workspace')
				: t('สร้างบัญชีให้สมาชิกในทีมเข้าสู่ระบบ', 'Set up sign-in accounts for your team members'),
			done: usableHubs.some((hub) =>
				data.members.some(
					(member) => member.id !== data.currentUserID && gatewayHasMember(hub, member.id)
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
				<strong>{t('เริ่มต้นใช้งาน ORCA', 'Get started with ORCA')}</strong>
				<span
					>{t(
						`ดำเนินการแล้ว ${steps.filter((step) => step.done).length} จาก ${steps.length} ขั้นตอน`,
						`${steps.filter((step) => step.done).length} of ${steps.length} setup steps complete`
					)}</span
				>
			</span>
			<ChevronDown size={16} class="setup-chevron" aria-hidden="true" />
		</summary>
		<ol>
			{#each steps as step, index}
				<li>
					<a href={localeHref(step.href)} class:next={index === nextStep}>
						<span class="step-marker" class:done={step.done} aria-hidden="true">
							{#if step.done}<Check size={14} />{:else}{index + 1}{/if}
						</span>
						<span class="step-copy">
							<strong>{step.title}</strong>
							<small>{step.description}</small>
							{#if step.done}<span class="sr-only">{t('ดำเนินการแล้ว', 'Completed')}</span>{/if}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</details>
{/if}

<style>
	.workspace-setup {
		margin-bottom: 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 56px;
		padding: 14px 18px;
		border-radius: var(--orca-radius-lg);
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: var(--orca-surface-2);
	}
	summary:focus-visible,
	a:focus-visible {
		outline-offset: -2px;
	}
	details[open] > summary {
		border-radius: var(--orca-radius-lg) var(--orca-radius-lg) 0 0;
	}
	.setup-heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 2px 12px;
	}
	.setup-heading strong {
		font-size: 16px;
		font-weight: 600;
		line-height: 1.45;
	}
	.setup-heading > span {
		color: var(--orca-muted);
		font-size: 13px;
	}
	summary :global(.setup-chevron) {
		flex-shrink: 0;
		color: var(--orca-subtle);
		transition: transform 0.15s;
	}
	details[open] summary :global(.setup-chevron) {
		transform: rotate(180deg);
	}
	ol {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--orca-line);
	}
	li {
		min-width: 0;
	}
	li + li {
		border-left: 1px solid var(--orca-line);
	}
	li a {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		height: 100%;
		min-height: 44px;
		padding: 14px 18px 16px;
		color: inherit;
		text-decoration: none;
	}
	li:first-child a {
		border-bottom-left-radius: var(--orca-radius-lg);
	}
	li:last-child a {
		border-bottom-right-radius: var(--orca-radius-lg);
	}
	li a:hover {
		background: var(--orca-surface-2);
	}
	a:hover .step-copy strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.step-marker {
		display: grid;
		place-items: center;
		flex: 0 0 24px;
		height: 24px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 50%;
		background: var(--orca-surface);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 600;
		line-height: 1;
	}
	.next .step-marker {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: #fff;
	}
	.step-marker.done {
		border-color: transparent;
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.step-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.step-copy strong {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
	}
	.step-copy small {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
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
			grid-template-columns: minmax(0, 1fr);
		}
		li + li {
			border-left: 0;
			border-top: 1px solid var(--orca-line);
		}
		li:first-child a {
			border-bottom-left-radius: 0;
		}
		li:last-child a {
			border-bottom-left-radius: var(--orca-radius-lg);
		}
	}
	@media (max-width: 640px) {
		summary,
		li a {
			padding-inline: 14px;
		}
	}
</style>
