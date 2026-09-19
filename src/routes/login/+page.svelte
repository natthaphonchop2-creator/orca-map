<script lang="ts">
	import Brand from '$lib/components/orca/Brand.svelte';
	import PublicFooter from '$lib/components/orca/PublicFooter.svelte';
	import '$lib/components/orca/forms.css';
	import '$lib/components/orca/orca.css';
	import { initializeLocale, localeHref, orcaLocale, t } from '$lib/orca/locale.svelte';
	import type { PageProps } from './$types';
	import { ArrowRight } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let { data }: PageProps = $props();
	onMount(initializeLocale);
	function signIn(namespace: string | undefined, id: string) {
		const destination = new URL('/oauth2/start', window.location.origin);
		destination.searchParams.set('rd', localeHref(data.rd));
		destination.searchParams.set('obot-auth-provider', `${namespace ?? 'default'}/${id}`);
		window.location.assign(destination.pathname + destination.search);
	}
</script>

<svelte:head><title>{t('เข้าสู่ระบบ · ORCA', 'Sign in · ORCA')}</title></svelte:head>
<div class="orca" lang={orcaLocale.value}>
	<header class="o-simple-header o-wrap">
		<a href={localeHref('/')} aria-label={t('หน้าหลัก ORCA', 'ORCA home')}><Brand /></a
		>
	</header>
	<main class="o-auth o-wrap">
		<section class="o-auth-story">
			<Brand dark />
			<h1>
				{t('เชื่อม AI กับข้อมูล', 'Your team’s space.')}<br />{t(
					'ให้ทีมทำงานร่วมกัน',
					'Your business rhythm.'
				)}
			</h1>
			<p>
				{t(
					'จัดการระบบที่เชื่อมต่อ กำหนดสิทธิ์ และให้ทีมใช้ AI กับข้อมูลที่จำเป็นต่องาน',
					'Manage connected systems, set access, and let your team use AI with the data they need.'
				)}
			</p>
		</section>
		<section class="o-auth-form">
			<h2>{t('ยินดีต้อนรับกลับ', 'Welcome back')}</h2>
			<p>
				{t(
					'เลือกวิธีเข้าสู่ระบบที่องค์กรของคุณจัดเตรียมไว้',
					'Choose the sign-in method configured by your organization.'
				)}
			</p>
			{#if data.unavailable}<div class="o-alert" role="alert">
					{t(
						'โหลดตัวเลือกการเข้าสู่ระบบไม่สำเร็จ กรุณารีเฟรชหน้านี้',
						'Sign-in methods could not be loaded. Please reload this page.'
					)}
				</div>{/if}
			<div class="o-auth-provider">
				{#each data.authProviders as provider (provider.id)}<button
						class="o-button"
						onclick={() => signIn(provider.namespace, provider.id)}
						>{provider.name.toLowerCase() === 'local'
							? t('เข้าสู่ระบบด้วยอีเมล', 'Sign in with email')
							: `${t('เข้าสู่ระบบด้วย', 'Continue with')} ${provider.name}`}
						<ArrowRight size={19} /></button
					>{/each}{#if !data.unavailable && data.authProviders.length === 0}<p class="o-alert">
						{t(
							'องค์กรยังไม่ได้ตั้งค่าวิธีเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลองค์กร',
							'Sign-in is not configured yet. Contact your installation administrator.'
						)}
					</p>{/if}
			</div>

		</section>
	</main>
	<PublicFooter />
</div>
