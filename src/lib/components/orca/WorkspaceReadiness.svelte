<script lang="ts">
	import { gatewaySources, gatewayToolCount, gatewayHasMember } from '$lib/orca/gateway-sources';
	import { connectionReady, workspaceToolingReady } from '$lib/orca/activation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { orcaError, type OrcaBootstrap, type OrcaHub } from '$lib/services/orca';
	import { OrcaLibraryService } from '$lib/services/orca-library';
	import { ArrowRight, Check, RefreshCw } from '@lucide/svelte';

	let {
		data,
		hub
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		keyState: 'loading' | 'error' | 'ready' | 'empty';
	} = $props();
	let counts = $state<{ knowledge: number; template: number }>();
	let libraryError = $state('');
	let revision = $state(0);
	const isMember = $derived(gatewayHasMember(hub, data.currentUserID));
	const connection = $derived(data.connections.find((item) => gatewaySources(hub).some((source) => source.connectionID === item.id) && !connectionReady(item)) ?? data.connections.find((item) => item.id === hub.connectionID));
	const toolingReady = $derived(workspaceToolingReady(hub, data.connections));
	const active = $derived(hub.status === 'active' && toolingReady);
	const editHref = $derived(`/app?view=new&edit=${encodeURIComponent(hub.id)}`);
	const libraryHref = $derived(`/app?view=knowledge&hub=${encodeURIComponent(hub.id)}`);
	const sourceHref = $derived(
		connection
			? `/app?view=servers&connection=${encodeURIComponent(connection.id)}`
			: '/app?view=servers'
	);

	$effect(() => {
		const selectedHub = hub;
		const currentData = data;
		const requestedRevision = revision;
		void requestedRevision;
		let cancelled = false;
		counts = undefined;
		libraryError = '';
		if (gatewayHasMember(selectedHub, currentData.currentUserID)) {
			void OrcaLibraryService.load(selectedHub.id)
				.then((result) => {
					if (cancelled) return;
					const published = result.items.filter((item) => item.status === 'published');
					counts = {
						knowledge: published.filter((item) => item.kind === 'knowledge').length,
						template: published.filter((item) => item.kind === 'template').length
					};
				})
				.catch((cause) => {
					if (!cancelled) libraryError = orcaError(cause);
				});
		}
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="workspace-readiness" aria-labelledby="readiness-title">
	<header class="readiness-head">
		<div>
			<h2 id="readiness-title">
				{t('ความพร้อมของพื้นที่ทำงาน', 'Workspace readiness')}
			</h2>
			<p>
				{t('เตรียมพื้นที่ทำงาน AI ให้พร้อมใช้งาน', 'Prepare the AI workspace for use')}
			</p>
		</div>
		<span class="access-badge" class:ready={isMember && active}>
			{#if isMember && active}<Check size={14} aria-hidden="true" />{/if}
			{!isMember
				? t('คุณยังไม่เป็นสมาชิก', 'You are not a member')
				: !active
					? t('ยังไม่เปิดให้ AI ใช้งาน', 'AI access is not active')
					: t('คุณมีสิทธิ์ใช้พื้นที่ทำงานนี้', 'You have access to this workspace')}
		</span>
	</header>
	<ol class="readiness-grid">
		<li>
			<span class="step-number">1</span>
			<div class="step-title"><h3>{t('ระบบและสิทธิ์ของคุณ', 'Your systems and access')}</h3></div>
			<p>
				{!isMember
					? t(
							'ผู้ดูแลระบบต้องเพิ่มคุณหรือแผนกของคุณก่อน จึงจะใช้พื้นที่ทำงานนี้ได้',
							'An administrator must add you or your department before you can use this workspace.'
						)
					: !toolingReady
						? t(
								'ตรวจสอบระบบและเครื่องมือที่เลือกไว้ก่อนเปิดให้ AI เข้าถึง',
								'Review the selected systems and tools before enabling AI access.'
							)
						: hub.status !== 'active'
							? t(
									'พื้นที่ทำงานนี้ยังไม่เปิดใช้งาน คุณเตรียมบทความความรู้และแม่แบบไว้ก่อนได้',
									'This workspace is not active. You can still prepare knowledge articles and templates.'
								)
							: t(
									`คุณได้รับสิทธิ์ใช้เครื่องมือ ${gatewayToolCount(hub)} รายการใน ORCA แล้ว กรุณาตรวจสอบบัญชีที่ใช้กับแต่ละระบบ`,
									`You have access to ${gatewayToolCount(hub)} tools in ORCA. Review the account you use for each system.`
								)}
			</p>
			{#if data.canManage && (!isMember || hub.status !== 'active' || !toolingReady)}
				<a class="k-button small" href={localeHref(!connectionReady(connection) ? sourceHref : editHref)}>
					{!connectionReady(connection)
						? t('ตรวจสอบระบบ', 'Review system')
						: !isMember
							? t('เพิ่มตัวเองเป็นสมาชิก', 'Add yourself as a member')
							: t('ตรวจสอบการตั้งค่าพื้นที่ทำงาน', 'Review workspace settings')}<ArrowRight
						size={16}
						aria-hidden="true"
					/></a
				>
			{:else if !isMember || !active}<span class="step-note"
					>{t('ติดต่อผู้ดูแลระบบ', 'Contact your administrator')}</span
				>
			{:else}<span class="step-note success"
					><Check size={14} aria-hidden="true" />{t(
						'กำหนดเครื่องมือและสมาชิกแล้ว',
						'Tools and members are configured'
					)}</span
				>{/if}
		</li>
		<li>
			<span class="step-number">2</span>
			<div class="step-title">
				<h3>{t('เพิ่มบทความความรู้', 'Add knowledge articles')}</h3>
				<span class="step-optional">{t('ไม่บังคับ', 'Optional')}</span>
			</div>
			<p>
				{t(
					'จัดเก็บคู่มือ นโยบาย และขั้นตอนการทำงาน แล้วกำหนดสมาชิกหรือแผนกที่อ่านแต่ละบทความได้',
					'Store manuals, policies and procedures, then choose which members or departments can read each article.'
				)}
			</p>
			{#if isMember && counts}
				<span class="step-note"
					>{t(
						`บทความความรู้ที่เผยแพร่และคุณอ่านได้ ${counts.knowledge} รายการ`,
						`Published knowledge articles available to you: ${counts.knowledge}`
					)}</span
				>
				<a class="k-button small" href={localeHref(`${libraryHref}&kind=knowledge&create=1`)}
					>{t('เพิ่มบทความความรู้', 'Add knowledge article')}<ArrowRight size={16} aria-hidden="true" /></a
				>
			{:else}<span class="step-note"
					>{!isMember
						? t('ต้องเป็นสมาชิกของพื้นที่ทำงานนี้', 'Workspace membership required')
						: libraryError
							? t('ตรวจสอบคลังความรู้ไม่สำเร็จ', 'Unable to check the knowledge library')
							: t('กำลังตรวจสอบคลังความรู้…', 'Checking the knowledge library…')}</span
				>{/if}
		</li>
		<li>
			<span class="step-number">3</span>
			<div class="step-title">
				<h3>{t('สร้างแม่แบบงานของทีม', 'Create team templates')}</h3>
				<span class="step-optional">{t('ไม่บังคับ', 'Optional')}</span>
			</div>
			<p>
				{t(
					'สร้างแม่แบบรายงานหรือคำตอบ พร้อมช่องข้อมูลและบทความความรู้ที่เกี่ยวข้อง',
					'Create report or response templates with input fields and related knowledge articles.'
				)}
			</p>
			{#if isMember && counts}
				<span class="step-note"
					>{t(
						`แม่แบบที่เผยแพร่และคุณใช้ได้ ${counts.template} รายการ`,
						`Published templates available to you: ${counts.template}`
					)}</span
				>
				<a class="k-button small" href={localeHref(`${libraryHref}&kind=template&create=1`)}
					>{t('สร้างแม่แบบ', 'Create template')}<ArrowRight size={16} aria-hidden="true" /></a
				>
			{:else}<span class="step-note"
					>{!isMember
						? t('ต้องเป็นสมาชิกของพื้นที่ทำงานนี้', 'Workspace membership required')
						: libraryError
							? t('ตรวจสอบคลังความรู้ไม่สำเร็จ', 'Unable to check the knowledge library')
							: t('กำลังตรวจสอบคลังความรู้…', 'Checking the knowledge library…')}</span
				>{/if}
		</li>
		<li>
			<span class="step-number">4</span>
			<div class="step-title"><h3>{t('เชื่อมพื้นที่ทำงานนี้กับแอป AI', 'Connect this workspace to your AI app')}</h3></div>
			<p>{!isMember || !active
                ? t('เชื่อมแอป AI ด้วยบัญชี ORCA ได้เมื่อพื้นที่ทำงานเปิดใช้งานและคุณได้รับสิทธิ์แล้ว', 'Once the workspace is active and you have access, connect your AI app with your ORCA account.')
                : t('เพิ่มลิงก์เชื่อม AI ในแอป AI จากนั้นเข้าสู่ระบบด้วยบัญชี ORCA เพื่อยืนยันตัวตน', 'Add the AI connection link to your AI app, then sign in with your ORCA account to verify your identity.')}</p>
            {#if isMember && active}<a class="k-button small" href="#connect-ai">{t('เชื่อมแอป AI', 'Connect an AI app')}<ArrowRight size={16} aria-hidden="true" /></a>{/if}
		</li>
	</ol>
	{#if libraryError}<div class="readiness-error" role="alert">
			<span>{libraryError}</span><button type="button" class="k-button small" onclick={() => (revision += 1)}
				><RefreshCw size={16} aria-hidden="true" />{t(
					'ตรวจสอบคลังความรู้อีกครั้ง',
					'Check the knowledge library again'
				)}</button
			>
		</div>{/if}
	<footer>
		{t(
			'บทความความรู้และแม่แบบช่วยให้ AI เข้าใจบริบทการทำงานของทีม คุณเชื่อมเครื่องมือก่อน แล้วเพิ่มเนื้อหาภายหลังได้',
			'Knowledge articles and templates give AI your team’s context. You can connect tools first and add this content later.'
		)}
	</footer>
</section>

<style>
	/* Rendered inside the workspace setup-guide panel, so it has no outer border of its own. */
	.workspace-readiness {
		min-width: 0;
		color: var(--orca-ink);
	}
	.readiness-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px 16px;
		padding: 16px 18px 14px;
	}
	.readiness-head h2 {
		margin: 0;
	}
	.readiness-head p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	.access-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		padding: 1px 8px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
		line-height: 1.6;
	}
	.access-badge.ready {
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.readiness-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--orca-line);
	}
	li {
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		grid-auto-rows: min-content;
		align-content: start;
		column-gap: 12px;
		min-width: 0;
		padding: 14px 18px 16px;
	}
	li + li {
		border-left: 1px solid var(--orca-line);
	}
	li > :not(.step-number) {
		grid-column: 2;
	}
	.step-number {
		grid-row: 1 / span 2;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--orca-line-strong);
		border-radius: 50%;
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 600;
		line-height: 1;
	}
	.step-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 8px;
		min-height: 24px;
	}
	h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
	}
	.step-optional {
		padding: 0 6px;
		border-radius: var(--orca-radius-sm);
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
		line-height: 1.6;
	}
	li p {
		margin: 4px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	li .k-button {
		justify-self: start;
		margin-top: 12px;
	}
	.step-note {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.6;
	}
	.step-note.success {
		color: var(--orca-ok);
		font-weight: 500;
	}
	.readiness-error {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 12px 18px;
		border-top: 1px solid var(--orca-line);
		color: var(--orca-deny);
		font-size: 13px;
		line-height: 1.6;
	}
	footer {
		padding: 12px 18px 14px;
		border-top: 1px solid var(--orca-line);
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.6;
	}
	@media (max-width: 1200px) {
		.readiness-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		li:nth-child(3) {
			border-left: 0;
		}
		li:nth-child(n + 3) {
			border-top: 1px solid var(--orca-line);
		}
	}
	@media (max-width: 620px) {
		.readiness-head {
			flex-direction: column;
			gap: 8px;
			padding-inline: 14px;
		}
		.readiness-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		li {
			padding-inline: 14px;
		}
		li + li {
			border-left: 0;
			border-top: 1px solid var(--orca-line);
		}
		.readiness-error,
		footer {
			padding-inline: 14px;
		}
	}
</style>
