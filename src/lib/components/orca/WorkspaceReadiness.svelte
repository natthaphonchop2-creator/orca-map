<script lang="ts">
	import { gatewaySources, gatewayToolCount } from '$lib/orca/gateway-sources';
	import { connectionReady, workspaceToolingReady } from '$lib/orca/activation';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { orcaError, type OrcaBootstrap, type OrcaHub } from '$lib/services/orca';
	import { OrcaLibraryService } from '$lib/services/orca-library';
	import {
		ArrowRight,
		BookOpen,
		Check,
		FileText,
		KeyRound,
		RefreshCw,
		ShieldCheck
	} from '@lucide/svelte';

	let {
		data,
		hub,
		keyState
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		keyState: 'loading' | 'error' | 'ready' | 'empty';
	} = $props();
	let counts = $state<{ knowledge: number; template: number }>();
	let libraryError = $state('');
	let revision = $state(0);
	const isMember = $derived(hub.memberIDs.includes(data.currentUserID));
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
		if (selectedHub.memberIDs.includes(currentData.currentUserID)) {
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
	<header>
		<div>
			<p class="eyebrow">
				{t('พื้นที่ของทีม พร้อมวิธีเริ่มงาน', 'Your team’s workspace, with a clear next step')}
			</p>
			<h2 id="readiness-title">
				{t('เตรียมพื้นที่ให้ AI ทำงานกับทีม', 'Prepare your workspace for AI')}
			</h2>
		</div>
		<span class="access-badge" class:ready={isMember && active}>
			{#if isMember && active}<Check size={15} aria-hidden="true" />{/if}
			{!isMember
				? t('รอเพิ่มคุณเป็นสมาชิก', 'Membership needed')
				: !active
					? t('ยังไม่เปิดให้ AI เรียกใช้', 'AI access is not active')
					: t('คุณมีสิทธิ์ใช้พื้นที่นี้', 'You have workspace access')}
		</span>
	</header>
	<ol class="readiness-grid">
		<li>
			<div class="step-head"><span>01</span><ShieldCheck size={20} aria-hidden="true" /></div>
			<h3>{t('ระบบและสิทธิ์ของคุณ', 'Your tools and access')}</h3>
			<p>
				{!isMember
					? t(
							'ผู้ดูแลต้องเลือกคุณเป็นสมาชิก จึงจะใช้ข้อมูลและสร้างคีย์ในพื้นที่นี้ได้',
							'An administrator must add you as a member before you can access content or create a key.'
						)
					: !toolingReady
						? t(
								'ตรวจระบบและเครื่องมือที่เลือกไว้ ก่อนเปิดให้ AI เข้าถึง',
								'Review the selected system and tools before enabling AI access.'
							)
						: hub.status !== 'active'
							? t(
									'พื้นที่ยังไม่เปิดใช้งาน คุณเตรียมความรู้และเทมเพลตไว้ก่อนได้',
									'This workspace is not active. You can still prepare knowledge and templates.'
								)
							: t(
									`กำหนดสิทธิ์ใน ORCA แล้ว ${gatewayToolCount(hub)} เครื่องมือ ตรวจบัญชีต้นทางของคุณได้ด้านล่าง`,
									`ORCA access is configured for ${gatewayToolCount(hub)} tools. Review your source account below.`
								)}
			</p>
			{#if data.canManage && (!isMember || hub.status !== 'active' || !toolingReady)}
				<a href={localeHref(!connectionReady(connection) ? sourceHref : editHref)}>
					{!connectionReady(connection)
						? t('ตรวจสอบ Server', 'Review server')
						: !isMember
							? t('เพิ่มตัวเองเป็นสมาชิก', 'Review your membership')
							: t('ตรวจการตั้งค่าพื้นที่', 'Review workspace setup')}<ArrowRight
						size={15}
						aria-hidden="true"
					/></a
				>
			{:else if !isMember || !active}<span class="step-note"
					>{t('ติดต่อผู้ดูแลพื้นที่', 'Contact your workspace administrator')}</span
				>
			{:else}<span class="step-note success"
					><Check size={15} aria-hidden="true" />{t(
						'เลือกเครื่องมือและสมาชิกแล้ว',
						'Tools and membership are configured'
					)}</span
				>{/if}
		</li>
		<li>
			<div class="step-head">
				<span>02 · {t('เพิ่มได้ตามต้องการ', 'Optional')}</span><BookOpen
					size={20}
					aria-hidden="true"
				/>
			</div>
			<h3>{t('เพิ่มความรู้ของธุรกิจ', 'Add business knowledge')}</h3>
			<p>
				{t(
					'เก็บคู่มือ นโยบาย และวิธีทำงาน แล้วเลือกคนหรือแผนกที่อ่านแต่ละหัวข้อได้',
					'Save guides, policies and procedures, then choose who can read each topic.'
				)}
			</p>
			{#if isMember && counts}
				<span class="step-note"
					>{t(
						`คุณอ่านความรู้ที่เผยแพร่ได้ ${counts.knowledge} หัวข้อ`,
						`${counts.knowledge} published topics available to you`
					)}</span
				>
				<a href={localeHref(`${libraryHref}&kind=knowledge&create=1`)}
					>{t('เพิ่มความรู้', 'Add knowledge')}<ArrowRight size={15} aria-hidden="true" /></a
				>
			{:else}<span class="step-note"
					>{!isMember
						? t('ใช้ได้เมื่อเป็นสมาชิก', 'Workspace membership required')
						: libraryError
							? t('ยังตรวจรายการไม่ได้', 'Unable to check the library')
							: t('กำลังตรวจรายการ…', 'Checking the library…')}</span
				>{/if}
		</li>
		<li>
			<div class="step-head">
				<span>03 · {t('เพิ่มได้ตามต้องการ', 'Optional')}</span><FileText
					size={20}
					aria-hidden="true"
				/>
			</div>
			<h3>{t('กำหนดรูปแบบงานของทีม', 'Define your team’s templates')}</h3>
			<p>
				{t(
					'ทำเทมเพลตรายงานหรือคำตอบ พร้อมช่องกรอกและหัวข้อความรู้ที่ต้องใช้',
					'Create report or response templates with input fields and relevant knowledge.'
				)}
			</p>
			{#if isMember && counts}
				<span class="step-note"
					>{t(
						`คุณเห็นเทมเพลตที่เผยแพร่ ${counts.template} รายการ`,
						`${counts.template} published templates visible to you`
					)}</span
				>
				<a href={localeHref(`${libraryHref}&kind=template&create=1`)}
					>{t('สร้างเทมเพลต', 'Create template')}<ArrowRight size={15} aria-hidden="true" /></a
				>
			{:else}<span class="step-note"
					>{!isMember
						? t('ใช้ได้เมื่อเป็นสมาชิก', 'Workspace membership required')
						: libraryError
							? t('ยังตรวจรายการไม่ได้', 'Unable to check the library')
							: t('กำลังตรวจรายการ…', 'Checking the library…')}</span
				>{/if}
		</li>
		<li>
			<div class="step-head"><span>04</span><KeyRound size={20} aria-hidden="true" /></div>
			<h3>{t('นำพื้นที่นี้ไปใช้กับ AI', 'Use this workspace with AI')}</h3>
			<p>
				{!isMember || !active
					? t(
							'เมื่อเปิดพื้นที่และได้รับสิทธิ์ คุณสร้างคีย์ของตัวเองไปตั้งค่าในแอป AI ได้',
							'Once the workspace is active and you have access, create a personal key for your AI client.'
						)
					: keyState === 'loading'
						? t('กำลังตรวจคีย์เชื่อมต่อของคุณ…', 'Checking your personal keys…')
						: keyState === 'error'
							? t(
									'ยังตรวจรายการคีย์ไม่ได้ โหลดรายการอีกครั้งที่ส่วนเชื่อมแอป AI',
									'Unable to check your keys. Reload the list in the AI connection section.'
								)
							: keyState === 'ready'
								? t(
										'มีคีย์ที่ยังไม่หมดอายุ นำไปตั้งค่าในแอป AI แล้วลองเรียกเครื่องมืออ่านข้อมูล',
										'An unexpired key is available. Configure your AI client, then try calling a read tool.'
									)
								: t(
										'สร้างคีย์ส่วนตัว แล้วนำ URL และคีย์ไปตั้งค่าในแอป AI ที่รองรับ',
										'Create a personal key, then configure a supported AI client with the URL and key.'
									)}
			</p>
			{#if isMember && active}<a href="#connect-ai"
					>{keyState === 'ready'
						? t('ดูขั้นตอนเชื่อม AI', 'View AI connection steps')
						: t('ตั้งค่าคีย์เชื่อม AI', 'Set up your AI key')}<ArrowRight
						size={15}
						aria-hidden="true"
					/></a
				>{/if}
		</li>
	</ol>
	{#if libraryError}<div class="readiness-error" role="alert">
			<span>{libraryError}</span><button type="button" onclick={() => (revision += 1)}
				><RefreshCw size={15} aria-hidden="true" />{t(
					'ตรวจคลังอีกครั้ง',
					'Retry library check'
				)}</button
			>
		</div>{/if}
	<footer>
		{t(
			'ความรู้และเทมเพลตช่วยให้ AI เข้าใจงานของทีม คุณเริ่มเชื่อมเครื่องมือได้ก่อน แล้วค่อยเพิ่มเนื้อหาภายหลัง',
			'Knowledge and templates give AI your team’s context. You can connect tools first and add this content later.'
		)}
	</footer>
</section>

<style>
	.workspace-readiness {
		margin: 24px 0;
		border: 1px solid #dfe5df;
		border-radius: 20px;
		background: linear-gradient(120deg, #f4f8eb, #f6f7fa 65%);
		padding: 24px;
		color: #171d2c;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
	}
	.eyebrow {
		font-size: 12px;
		color: #5a7042;
		margin: 0 0 5px;
	}
	h2 {
		font-size: 20px;
		line-height: 1.5;
		margin: 0;
	}
	.access-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 11px;
		border-radius: 20px;
		background: #e7e9ef;
		font-size: 12px;
		flex-shrink: 0;
	}
	.access-badge.ready {
		background: #e3edcd;
		color: #415c28;
	}
	.readiness-grid {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		padding: 0;
		margin: 0;
	}
	li {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 18px;
		border: 1px solid #e3e7ec;
		border-radius: 14px;
		background: #fff;
	}
	.step-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		color: #5d7048;
		margin-bottom: 16px;
		font-size: 11px;
	}
	.step-head :global(svg) {
		flex-shrink: 0;
	}
	h3 {
		font-size: 15px;
		line-height: 1.5;
		margin: 0 0 9px;
	}
	li p {
		font-size: 13px;
		color: #586378;
		line-height: 1.8;
		margin: 0 0 15px;
		flex: 1;
	}
	a,
	button {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 9px;
		color: #435e2e;
		font-weight: 650;
		font-size: 13px;
		line-height: 1.6;
		text-decoration: none;
		padding: 8px 0;
		min-height: 40px;
	}
	a :global(svg) {
		flex-shrink: 0;
	}
	a:hover {
		color: #263d15;
		text-decoration: underline;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid #708b37;
		outline-offset: 3px;
		border-radius: 4px;
	}
	.step-note {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		color: #687488;
		line-height: 1.7;
	}
	.success {
		color: #526c37;
	}
	footer {
		color: #657085;
		font-size: 12px;
		line-height: 1.8;
		margin-top: 16px;
	}
	.readiness-error {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		line-height: 1.6;
		color: #a14036;
		margin-top: 12px;
	}
	button {
		border: 0;
		background: transparent;
		cursor: pointer;
	}
	@media (max-width: 1200px) {
		.readiness-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 620px) {
		.workspace-readiness {
			padding: 16px;
		}
		header {
			flex-direction: column;
			gap: 10px;
		}
		.readiness-grid {
			grid-template-columns: 1fr;
		}
		li {
			padding: 16px;
		}
		.step-head {
			margin-bottom: 10px;
		}
		.readiness-error {
			flex-wrap: wrap;
		}
	}
</style>
