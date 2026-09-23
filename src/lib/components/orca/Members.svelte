<script lang="ts">
  import { gatewayHasMember } from '$lib/orca/gateway-sources';
	import { t, localeHref } from '$lib/orca/locale.svelte';
	import { memberName, memberRole, type OrcaBootstrap } from '$lib/services/orca';
	import { ExternalLink, Users } from '@lucide/svelte';

	let { data }: { data: OrcaBootstrap } = $props();
	let query = $state('');
	const members = $derived(
		data.members.filter((member) =>
			`${memberName(member)} ${member.email}`.toLowerCase().includes(query.toLowerCase())
		)
	);
</script>

<div class="k-breadcrumb">
	<a href={localeHref('/app?view=workspaces')}>{t('พื้นที่ทำงาน', 'Workspaces')}</a><span>/</span><span
		>{t('สมาชิก', 'Members')}</span
	>
</div>
<div class="k-intro">
	<div class="k-heading-row">
		<h1>{t('สมาชิกในองค์กร', 'People in your organization')}</h1>
		{#if data.canManage}<a class="k-button primary" href={localeHref('/app?view=members')}
				>{t('จัดการบัญชีและการเข้าสู่ระบบ', 'Manage accounts and sign-in')}
				<ExternalLink size={16} /></a
			>{/if}
	</div>
	<p class="k-subtitle">
		{t(
			'กำหนดสมาชิกในแต่ละพื้นที่ทำงาน เพื่อให้ทุกคนเข้าถึงข้อมูลที่จำเป็นต่องาน',
			'Choose members in each workspace to give them access to the data they need.'
		)}
	</p>
</div>
<div class="k-field" style="max-width:450px;margin-bottom:24px">
	<label for="directory-search">{t('ค้นหาสมาชิก', 'Search people')}</label><input
		id="directory-search"
		type="search"
		bind:value={query}
		placeholder={t('ชื่อหรืออีเมล', 'Name or email')}
	/>
</div>
{#if members.length}<div class="k-table-wrap">
		<table class="k-table">
			<thead
				><tr
					><th>{t('สมาชิก', 'Members')}</th><th>{t('บทบาทในองค์กร', 'System role')}</th><th
						>{t('พื้นที่ทำงานที่เข้าถึงได้', 'Accessible workspaces')}</th
					></tr
				></thead
			><tbody
				>{#each members as member}<tr
						><td
							><strong style="font-weight:500"
								>{memberName(member)}{member.id === data.currentUserID
									? t(' (คุณ)', ' (you)')
									: ''}</strong
							>
							<p class="k-small k-muted">{member.email}</p></td
						><td><span class="k-badge">{memberRole(member.role)}</span></td><td
							>{#each data.hubs.filter((hub) => gatewayHasMember(hub, member.id)) as hub}<a
									href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}
									style="display:block;margin-bottom:4px">{hub.name}</a
								>{:else}<span class="k-muted"
									>{t('ยังไม่มีสิทธิ์เข้าถึงพื้นที่ทำงาน', 'No workspace access yet')}</span
								>{/each}</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>{:else}<div class="k-empty">
		<Users size={33} />
		<h2>{t('ไม่พบสมาชิก', 'No people found')}</h2>
		<p>
			{query
				? t('ลองค้นหาด้วยชื่อหรืออีเมลอื่น', 'Try another name or email.')
				: t(
						'ผู้ใช้ที่มีบัญชีในองค์กรจะแสดงที่นี่',
						'Accounts that have joined the organization appear here.'
					)}
		</p>
	</div>{/if}
<p class="k-small k-muted" style="margin-top:20px">
	{t(
		'เจ้าขององค์กรและผู้ดูแลระบบมีสิทธิ์จัดการระบบ แต่ต้องได้รับเลือกเป็นสมาชิกของพื้นที่ทำงานก่อนเข้าถึงข้อมูล',
		'An administrator role manages the system. Data access requires membership in the relevant workspace.'
	)}
</p>
