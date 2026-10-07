<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import { orcaTheme } from '$lib/orca/theme.svelte';
	import { SunMoon } from '@lucide/svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';

	// "Follow the device" says what the device shows right now; it changes live
	// (for example at sunset), so it is announced politely.
	const device = $derived(
		orcaTheme.preference !== 'system'
			? ''
			: orcaTheme.systemDark
				? t('ตอนนี้อุปกรณ์ใช้โหมดมืด', 'Your device is using dark mode right now.')
				: t('ตอนนี้อุปกรณ์ใช้โหมดสว่าง', 'Your device is using light mode right now.')
	);
</script>

<!-- A row of the General settings panel, below the display language. -->
<div class="theme-setting">
	<div class="theme-setting-copy">
		<h2><SunMoon size={18} />{t('ธีม', 'Theme')}</h2>
		<p>
			{t(
				'เลือกโหมดสว่าง มืด หรือให้ ORCA ปรับตามการตั้งค่าของอุปกรณ์ · จำไว้ในเบราว์เซอร์นี้',
				'Choose light or dark, or follow your device. Remembered in this browser.'
			)}
		</p>
		<p class="theme-setting-device" aria-live="polite">{device}</p>
	</div>
	<div class="theme-setting-control"><ThemeSwitch /></div>
</div>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	/* The spacing of SettingsCenter's .settings-panel-head, whose styles are scoped there. */
	.theme-setting {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
		padding: 16px 18px;
		border-top: 1px solid var(--orca-line);
	}
	.theme-setting-copy {
		flex: 1 1 320px;
		min-width: 0;
	}
	.theme-setting h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
	}
	.theme-setting h2 :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.theme-setting p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 12px;
		line-height: 1.6;
	}
	/* Present (for the live region) but takes no room until there is something to say. */
	.theme-setting .theme-setting-device:empty {
		margin: 0;
	}
	@media (max-width: 480px) {
		.theme-setting-control {
			flex: 1 1 100%;
		}
		.theme-setting-control :global(.o-theme) {
			display: flex;
		}
		.theme-setting-control :global(.o-theme button) {
			flex: 1 1 0;
		}
	}
</style>
