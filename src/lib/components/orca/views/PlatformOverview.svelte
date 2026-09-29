<script lang="ts">
	import { ArrowRight, Building2, Grid2x2Plus, Inbox, KeyRound, LogIn, Shield } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { platformHref, type PlatformSection } from '$lib/orca/navigation';
	import PageHeader from '../ui/PageHeader.svelte';

	// ภาพรวมแพลตฟอร์ม. U2 adds the counts; for now each platform section with
	// one line on what it is for.
	let { canReviewPilotRequests = false }: { canReviewPilotRequests?: boolean } = $props();
	const sections = $derived(
		[
			{ id: 'companies' as PlatformSection, label: term('customerCompanies', t), detail: t('เปิดบริษัทใหม่และส่งลิงก์ให้เจ้าของบริษัท', 'Open a company and send its owner a link'), icon: Building2 },
			...(canReviewPilotRequests
				? [{ id: 'pilots' as PlatformSection, label: term('pilotRequests', t), detail: t('คำขอทดลองใช้จากหน้าเว็บไซต์', 'Trial requests from the website'), icon: Inbox }]
				: []),
			{ id: 'signin' as PlatformSection, label: term('googleSignIn', t), detail: t('ปุ่มเข้าสู่ระบบของทุกบริษัทบน ORCA', 'The sign-in button of every company on ORCA'), icon: LogIn },
			{ id: 'oauth-apps' as PlatformSection, label: term('programOAuthApps', t), detail: t('แอปที่ให้พนักงานลงชื่อเข้าใช้โปรแกรมด้วยบัญชีตัวเอง', 'Apps that let people sign in to programs with their own account'), icon: KeyRound },
			{ id: 'catalog' as PlatformSection, label: term('programCatalog', t), detail: t('เพิ่มโปรแกรมด้วยลิงก์ MCP', 'Add a program by its MCP link'), icon: Grid2x2Plus },
			{ id: 'breakglass' as PlatformSection, label: term('breakGlass', t), detail: t('บัญชีรหัสผ่านสำหรับกรณีฉุกเฉิน', 'Password accounts for emergencies'), icon: Shield }
		]
	);
</script>

<PageHeader title={term('platformOverview', t)} subtitle={t('ตั้งค่าที่ใช้กับทุกบริษัทบน ORCA ลูกค้าไม่เห็นส่วนนี้', 'Settings shared by every company on ORCA. Customers never see this area.')} />
<ul class="platform-sections">
	{#each sections as section (section.id)}
		<li>
			<a href={localeHref(platformHref(section.id))}>
				<span class="platform-section-icon" aria-hidden="true"><section.icon size={18} /></span>
				<span class="platform-section-copy"><strong>{section.label}</strong><small>{section.detail}</small></span>
				<ArrowRight size={16} aria-hidden="true" />
			</a>
		</li>
	{/each}
</ul>

<style>
	.platform-sections {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.platform-sections a {
		display: flex;
		align-items: center;
		gap: 14px;
		height: 100%;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		text-decoration: none;
		transition: border-color 0.15s var(--orca-ease);
	}
	.platform-sections a:hover {
		border-color: var(--orca-line-hover, var(--orca-line-strong));
	}
	.platform-section-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.platform-section-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.platform-section-copy strong {
		font-size: 15px;
		font-weight: 600;
	}
	.platform-section-copy small {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
</style>
