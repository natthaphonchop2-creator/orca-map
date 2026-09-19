<script lang="ts">
	import { orcaLocale, setLocale, t } from '$lib/orca/locale.svelte';
</script>

<div class="o-locale" role="group" aria-label={t('ภาษา', 'Language')}>
	<button
		class:chosen={orcaLocale.value === 'th'}
		aria-pressed={orcaLocale.value === 'th'}
		onclick={() => setLocale('th')}>TH</button
	>
	<button
		class:chosen={orcaLocale.value === 'en'}
		aria-pressed={orcaLocale.value === 'en'}
		onclick={() => setLocale('en')}>EN</button
	>
</div>
