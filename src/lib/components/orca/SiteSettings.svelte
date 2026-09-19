<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import LocaleSwitch from './LocaleSwitch.svelte';
	import { Settings, ChevronDown } from '@lucide/svelte';

	let { id, inline = false }: { id: string; inline?: boolean } = $props();
	let open = $state(false);
	let root: HTMLDivElement;
	let toggle: HTMLButtonElement;

	function dismissOutside(event: PointerEvent) {
		if (open && event.target instanceof Node && !root.contains(event.target)) open = false;
	}

	function dismissOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && open && root.contains(document.activeElement)) {
			event.preventDefault();
			open = false;
			toggle.focus();
		}
	}
</script>

<svelte:window onpointerdown={dismissOutside} onkeydown={dismissOnEscape} />

<div bind:this={root} class="site-settings" class:inline>
	<button
		bind:this={toggle}
		type="button"
		class="settings-toggle"
		aria-expanded={open}
		aria-controls={id}
		onclick={() => (open = !open)}
	>
		<Settings size={18} aria-hidden="true" />
		<span>{t('ตั้งค่า', 'Settings')}</span>
		<ChevronDown size={16} aria-hidden="true" />
	</button>
	{#if open}
		<div {id} class="settings-panel">
			<span class="settings-label">{t('ภาษา', 'Language')}</span>
			<LocaleSwitch />
		</div>
	{/if}
</div>

<style>
	.site-settings {
		position: relative;
	}
	.settings-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: #545e72;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.settings-toggle:hover,
	.settings-toggle[aria-expanded='true'] {
		background: #eef2e7;
		color: #516d29;
	}
	.settings-toggle:focus-visible {
		outline: 2px solid #516d29;
		outline-offset: 3px;
	}
	.settings-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 10px);
		min-width: 230px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 18px;
		border: 1px solid #d9deea;
		border-radius: 14px;
		background: #fff;
		box-shadow: 0 12px 32px #15182314;
	}
	.settings-label {
		color: #545e72;
		font-size: 14px;
		font-weight: 600;
	}
	.inline {
		width: 100%;
	}
	.inline .settings-toggle {
		width: 100%;
		padding-inline: 12px;
	}
	.inline .settings-toggle span {
		flex: 1;
		text-align: start;
	}
	.inline .settings-panel {
		position: static;
		margin-top: 8px;
		min-width: 0;
		box-shadow: none;
	}
</style>
