<script lang="ts">
	import { ArrowRight, ChevronDown, ExternalLink, Mail } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { ORCA_SUPPORT_LINE_REL, supportLinks, type SupportLink } from '$lib/orca/support';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import PageHeader from '../ui/PageHeader.svelte';

	// view=help: a short FAQ. What still needs doing shows on หน้าหลัก's
	// ต้องดูแล (W0), so this page has no setup steps of its own.
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

<PageHeader title={term('help', t)} subtitle={t('คำถามที่พบบ่อย', 'Common questions.')} />

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
	/* orca-type-remap v1 */
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
		font-size: 14px;
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
		font-size: 13.5px;
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
				summary {
			padding: 14px 16px;
		}
		.help-answer {
			padding: 0 16px 16px;
		}
	}
</style>
