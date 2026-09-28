<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import { THEME_PREFERENCES, type ThemePreference } from '$lib/orca/theme';
	import { orcaTheme, setThemePreference } from '$lib/orca/theme.svelte';
	import { Monitor, Moon, Sun, SunMoon } from '@lucide/svelte';

	/**
	 * Light, dark or follow the device, remembered in this browser. It works like the
	 * LocaleSwitch beside it; the root layout re-applies the theme when the choice changes.
	 * - compact: icons only; each button keeps its name in aria-label and title.
	 * - label: a visible "Theme" caption on the same row (the account menu).
	 */
	let { compact = false, label = false }: { compact?: boolean; label?: boolean } = $props();
	const icons = { light: Sun, dark: Moon, system: Monitor };
	// The owner's wording, kept in one place.
	function choiceLabel(choice: ThemePreference) {
		return choice === 'light' ? t('สว่าง', 'Light') : choice === 'dark' ? t('มืด', 'Dark') : t('ตามระบบ', 'System');
	}
</script>

{#snippet choices()}
	<div class="o-theme" class:compact role="group" aria-label={t('ธีม', 'Theme')}>
		{#each THEME_PREFERENCES as choice (choice)}
			{@const Icon = icons[choice]}
			<button
				type="button"
				class:chosen={orcaTheme.preference === choice}
				aria-pressed={orcaTheme.preference === choice}
				aria-label={compact ? choiceLabel(choice) : undefined}
				title={compact ? choiceLabel(choice) : undefined}
				onclick={() => setThemePreference(choice)}
				><Icon size={15} aria-hidden="true" />{#if !compact}<span>{choiceLabel(choice)}</span>{/if}</button
			>
		{/each}
	</div>
{/snippet}

{#if label}
	<div class="o-theme-row">
		<!-- The group carries the same name for screen readers. -->
		<span class="o-theme-caption" aria-hidden="true"><SunMoon size={17} aria-hidden="true" />{t('ธีม', 'Theme')}</span>
		{@render choices()}
	</div>
{:else}
	{@render choices()}
{/if}

<style>
	/* The same segmented look as .o-locale in orca-system.css. */
	.o-theme {
		display: inline-flex;
		flex: none;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius, 8px);
		background: var(--orca-surface);
	}
	.o-theme button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 34px;
		min-height: 26px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--orca-radius-sm, 6px);
		background: transparent;
		color: var(--orca-muted);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 0.15s var(--orca-ease, ease),
			color 0.15s var(--orca-ease, ease);
	}
	.o-theme.compact button {
		padding: 0 8px;
	}
	.o-theme button:not(.chosen):hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	/* Chosen: an inverse pill (ink in light, white in dark), like .o-locale and the website's tabs. */
	.o-theme button.chosen {
		background: var(--orca-ink);
		color: var(--orca-on-ink, #fff);
	}
	/* A row like the account menu's links: a hairline above, icon and words, the control at the end. */
	.o-theme-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 9px;
		min-height: 34px;
		margin-top: 11px;
		padding-top: 11px;
		border-top: 1px solid var(--orca-line);
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 500;
	}
	.o-theme-caption {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
		white-space: nowrap;
	}
	.o-theme-caption :global(svg) {
		flex: none;
	}
</style>
