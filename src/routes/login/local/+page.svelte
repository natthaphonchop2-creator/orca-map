<script lang="ts">
	import { page } from '$app/state';
	import Brand from '$lib/components/orca/Brand.svelte';
	import PublicFooter from '$lib/components/orca/PublicFooter.svelte';
	import '$lib/components/orca/forms.css';
	import '$lib/components/orca/orca.css';
	import { LOCAL_AUTH_MIN_PASSWORD_LENGTH } from '$lib/constants';
	import {
		initializeLocale,
		localeHref,
		orcaLocale,
		safeReturnPath,
		t
	} from '$lib/orca/locale.svelte';
	import { ArrowRight } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let revealed = $state(false);
	const rd = $derived(localeHref(safeReturnPath(page.url.searchParams.get('rd'))));
	const error = $derived(page.url.searchParams.has('error'));
	onMount(initializeLocale);
</script>

<svelte:head
	><title>{t('เข้าสู่ระบบด้วยอีเมล · ORCA', 'Sign in with email · ORCA')}</title></svelte:head
>
<div class="orca" lang={orcaLocale.value}>
	<header class="o-simple-header o-wrap">
		<a href={localeHref('/')} aria-label={t('หน้าหลัก ORCA', 'ORCA home')}><Brand /></a
		>
	</header>
	<main class="o-auth o-wrap">
		<section class="o-auth-story">
			<Brand dark />
			<h1>
				{t('พร้อมเริ่มงานกับ AI', 'Ready for work.')}<br />{t(
					'ในพื้นที่ทำงานของทีม',
					'In your rhythm.'
				)}
			</h1>
			<p>
				{t(
					'เข้าสู่พื้นที่ทำงานด้วยบัญชีที่ผู้ดูแลองค์กรจัดเตรียมให้ ผู้ใช้แต่ละคนมีสิทธิ์เข้าถึงข้อมูลและคีย์เชื่อมต่อของตัวเอง',
					'Use the account prepared by your administrator. Data permissions and connection keys belong to each individual user.'
				)}
			</p>
		</section>
		<section class="o-auth-form">
			<h2>{t('เข้าสู่ระบบด้วยอีเมล', 'Sign in with email')}</h2>
			<p>
				{t(
					'กรอกอีเมลและรหัสผ่านที่ได้รับจากผู้ดูแลองค์กร',
					'Use the organization account supplied by your administrator.'
				)}
			</p>
			<form method="POST" action="/oauth2/start">
				{#if error}<div class="o-alert" role="alert">
						{t(
							'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจอีเมลและรหัสผ่านแล้วลองอีกครั้ง',
							'Sign-in failed. Please check your email and password, then try again.'
						)}
					</div>{/if}
				<input type="hidden" name="rd" value={rd} />
				<label class="o-field" for="local-auth-email"
					>{t('อีเมล', 'Email')}<input
						id="local-auth-email"
						type="email"
						name="email"
						autocomplete="username"
						required
					/></label
				>
				<div class="o-field">
					<div class="o-password-label">
						<label for="local-auth-password">{t('รหัสผ่าน', 'Password')}</label><button
							type="button"
							aria-pressed={revealed}
							onclick={() => (revealed = !revealed)}
							>{revealed ? t('ซ่อนรหัสผ่าน', 'Hide') : t('แสดงรหัสผ่าน', 'Show')}</button
						>
					</div>
					<input
						id="local-auth-password"
						type={revealed ? 'text' : 'password'}
						name="password"
						autocomplete="current-password"
						minlength={LOCAL_AUTH_MIN_PASSWORD_LENGTH}
						required
					/>
				</div>
				<button class="o-button" type="submit"
					>{t('เข้าสู่ระบบ', 'Sign in')} <ArrowRight size={19} /></button
				>
			</form>

		</section>
	</main>
	<PublicFooter />
</div>
