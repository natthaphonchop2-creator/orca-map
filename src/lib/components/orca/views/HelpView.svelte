<script lang="ts">
	import { ArrowRight, ChevronDown, ExternalLink, ListChecks, Mail } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { ORCA_SUPPORT_LINE_REL, supportLinks, type SupportLink } from '$lib/orca/support';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import PageHeader from '../ui/PageHeader.svelte';

	// view=help: a short FAQ. The setup steps live in one place, Home's
	// checklist; this page points there instead of repeating them.
	// "ยังติดอยู่" gives the ORCA team's LINE and email ($lib/orca/support) to
	// everyone in a company on ORCA; the trial-request form (/home?to=start) is
	// for companies not on ORCA yet, so it is not offered here.
	let { data }: { data: Pick<OrcaBootstrap, 'canManage' | 'canChangeMemberStatus'> } = $props();
	const manager = $derived(data.canManage);
	type Link = { href: string; label: string; support?: SupportLink };
	const contact = $derived<Link[]>(supportLinks(t).map((link) => ({ href: link.href, label: link.label, support: link })));
	type Item = { q: string; a: string; links?: Link[] };
	const items = $derived<Item[]>([
		{
			q: t('เชื่อม Claude หรือ ChatGPT อย่างไร', 'How do I connect Claude or ChatGPT?'),
			a: t(
				'เปิดหน้า เชื่อม AI ของฉัน คัดลอกลิงก์ ORCA ของบริษัท วางใน Claude หรือ ChatGPT แล้วเข้าสู่ระบบด้วยบัญชีของคุณ ไม่ต้องใช้คีย์',
				"Open Connect my AI, copy your company's ORCA link, paste it into Claude or ChatGPT and sign in with your account. No key needed."
			),
			links: [{ href: '/app?view=connect-ai', label: term('connectMyAI', t) }]
		},
		{
			q: t('AI บอกว่าดึงข้อมูลจากโปรแกรมไม่ได้', "AI says it can't reach a program"),
			a: t(
				'ลงชื่อเข้าใช้บัญชีโปรแกรมของคุณอีกครั้ง ที่ เชื่อม AI ของฉัน › บัญชีโปรแกรมของคุณ',
				'Sign in to your program account again, under Connect my AI › Your program accounts.'
			),
			links: [{ href: '/app?view=connect-ai#accounts', label: t('บัญชีโปรแกรมของคุณ', 'Your program accounts') }]
		},
		{
			q: t('ไม่มีบัญชีโปรแกรมของตัวเอง', "I don't have my own program account"),
			a: t(
				'แต่ละคนใช้บัญชีของตัวเอง เช่น ผู้ใช้ FlowAccount ต่อคน ขอให้ผู้ดูแลเพิ่มผู้ใช้ให้คุณในโปรแกรมนั้น อย่าใช้รหัสผ่านร่วมกัน เพราะประวัติจะแยกคนไม่ได้',
				"Everyone uses their own account, e.g. one FlowAccount user per person. Ask an admin to add you in that program. Don't share a password: the history couldn't tell people apart."
			)
		},
		{
			q: t('AI แก้ข้อมูลในโปรแกรมได้ไหม', 'Can AI change data in a program?'),
			a: manager
				? t(
						'เริ่มต้น AI ดูข้อมูลได้อย่างเดียว ถ้าเปิดให้สร้างหรือแก้ข้อมูล ตั้งให้ผู้ดูแลอนุมัติก่อนได้ในพื้นที่ทำงาน AI',
						'AI starts read-only. If you let it create or change data, a workspace can require an admin to approve first.'
					)
				: t(
						'ทำได้เฉพาะที่บริษัทอนุญาต ถ้าต้องให้ผู้ดูแลอนุมัติก่อน คำขอของคุณจะรออยู่ที่ คำขอของฉัน',
						'Only what your company allows. If an admin must approve first, your request waits in My requests.'
					),
			links: manager
				? [
						{ href: '/app?view=workspaces', label: term('workspaces', t) },
						{ href: '/app?view=approvals', label: term('waitingApproval', t) }
					]
				: []
		},
		...(manager
			? [
					{
						q: t('มีคนลาออก ต้องทำอะไร', 'Someone left. What do I do?'),
						a: data.canChangeMemberStatus
							? t(
									'ระงับการใช้งานคนนั้นในหน้า ทีม แล้ว ORCA จะตัดการเชื่อมต่อแอป AI และคีย์ทั้งหมดของเขาในบริษัทนี้ทันที',
									'Suspend them on the Team page. ORCA then disconnects all their AI apps and keys in this company at once.'
								)
							: t(
									'ตัดการเชื่อมต่อแอป AI ของเขาที่ ตรวจสอบ › แอป AI ที่เชื่อมอยู่',
									'Disconnect their AI apps in Oversight › Connected AI apps.'
								),
						links: [
							...(data.canChangeMemberStatus ? [{ href: '/app?view=members', label: term('team', t) }] : []),
							{ href: '/app?view=secrets', label: term('connectedAIApps', t) }
						]
					}
				]
			: []),
		{
			q: t('เปิดลิงก์จาก LINE แล้วเข้าสู่ระบบไม่ได้', "A link from LINE won't let me sign in"),
			a: t(
				'LINE และ Facebook เปิดลิงก์ในเบราว์เซอร์ของแอป ซึ่ง Google ไม่ให้เข้าสู่ระบบ แตะ ⋯ แล้วเลือกเปิดใน Chrome หรือ Safari',
				"LINE and Facebook open links in their own browser, where Google won't sign you in. Tap ⋯ and open the page in Chrome or Safari."
			)
		},
		{
			q: t('ยังติดอยู่ ติดต่อใคร', 'Still stuck? Who can help?'),
			a: manager
				? t('ทีม ORCA ช่วยตั้งค่าให้ได้ ส่งคำถามมาทาง LINE หรืออีเมลได้เลย', 'The ORCA team can help you set up. Send us your question on LINE or by email.')
				: t(
						'ถามผู้ดูแลบริษัทของคุณก่อน เขาเปิดสิทธิ์และตั้งค่าโปรแกรมให้ได้ ถ้ายังติดอยู่ ส่งข้อความหาทีม ORCA ทาง LINE หรืออีเมลได้',
						'Ask your company admin first: they can give access and set up programs. Still stuck? Message the ORCA team on LINE or by email.'
					),
			links: contact
		}
	]);
</script>

<PageHeader title={term('help', t)} subtitle={t('คำถามที่พบบ่อย ขั้นตอนตั้งค่าอยู่ที่หน้าหลักที่เดียว', 'Common questions. The setup steps are on Home.')} />

<section class="help-setup" aria-labelledby="help-setup-title">
	<span class="help-setup-icon" aria-hidden="true"><ListChecks size={20} /></span>
	<div class="help-setup-copy">
		<h2 id="help-setup-title">{t('ขั้นตอนตั้งค่าอยู่ที่หน้าหลัก', 'The setup steps are on Home')}</h2>
		<p>
			{manager
				? t('4 ขั้นตอน ประมาณ 10 นาที: เชื่อมโปรแกรม ให้ทีมใช้ได้ เชื่อม AI ของฉัน แล้วลองถาม', '4 steps, about 10 minutes: connect a program, let your team use it, connect your AI, then ask.')
				: t('3 ขั้นตอน ประมาณ 7 นาที: เชื่อม AI ของฉัน ลงชื่อเข้าใช้บัญชีโปรแกรม แล้วลองถาม', '3 steps, about 7 minutes: connect your AI, sign in to your programs, then ask.')}
		</p>
	</div>
	<a class="k-button primary" href={localeHref('/app#setup')}>{t('ไปที่ขั้นตอนตั้งค่า', 'Go to the setup steps')}<ArrowRight size={16} aria-hidden="true" /></a>
</section>

<section class="help-faq" aria-labelledby="help-faq-title">
	<h2 id="help-faq-title">{t('คำถามที่พบบ่อย', 'Common questions')}</h2>
	<div class="help-list">
		{#each items as item (item.q)}
			<details>
				<summary><span>{item.q}</span><ChevronDown size={18} aria-hidden="true" /></summary>
				<div class="help-answer">
					<p>{item.a}</p>
					{#if item.links?.length}
						<p class="help-links">
							{#each item.links as link (link.href)}{#if link.support?.newTab}<a href={link.href} target="_blank" rel={ORCA_SUPPORT_LINE_REL}
										>{link.label} <span class="help-handle">{link.support.handle}</span><ExternalLink size={14} aria-hidden="true" /><span class="help-hidden">{t(' (เปิดในแท็บใหม่)', ' (opens in a new tab)')}</span></a
									>{:else if link.support}<a href={link.href}>{link.label} <span class="help-handle">{link.support.handle}</span><Mail size={14} aria-hidden="true" /></a
									>{:else}<a href={localeHref(link.href)}>{link.label}<ArrowRight size={14} aria-hidden="true" /></a>{/if}{/each}
						</p>
					{/if}
				</div>
			</details>
		{/each}
	</div>
</section>

<style>
	.help-setup {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 28px;
		padding: 20px 24px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.help-setup-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
	}
	.help-setup-copy {
		flex: 1;
		min-width: 0;
	}
	.help-setup .help-setup-copy h2,
	section.help-faq h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 17px;
		font-weight: 700;
		line-height: 1.4;
	}
	.help-setup .help-setup-copy p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 14px;
	}
	.help-setup :global(.k-button) {
		flex: none;
		min-height: 44px;
		padding: 0 18px;
		font-weight: 600;
	}
	section.help-faq h2 {
		margin-bottom: 12px;
	}
	.help-list {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	details + details {
		border-top: 1px solid var(--orca-line-soft);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: var(--orca-hover);
	}
	summary :global(svg) {
		flex: none;
		color: var(--orca-subtle);
		transition: transform 0.15s var(--orca-ease);
	}
	details[open] summary :global(svg) {
		transform: rotate(180deg);
	}
	.help-answer {
		padding: 0 20px 18px;
	}
	.help-answer p {
		max-width: 72ch;
		margin: 0;
		color: var(--orca-text-2);
		font-size: 14.5px;
		line-height: 1.65;
	}
	.help-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		margin-top: 10px !important;
	}
	.help-links a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--orca-ink);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--orca-line-strong);
		text-underline-offset: 3px;
	}
	.help-handle {
		white-space: nowrap;
	}
	.help-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (max-width: 720px) {
		.help-setup {
			flex-wrap: wrap;
			padding: 18px 16px;
		}
		.help-setup :global(.k-button) {
			flex: 1 1 100%;
		}
		summary {
			padding: 14px 16px;
		}
		.help-answer {
			padding: 0 16px 16px;
		}
	}
</style>
