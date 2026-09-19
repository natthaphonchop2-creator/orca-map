<script lang="ts">
 import { localeHref, t } from '$lib/orca/locale.svelte';
 let { privacyHref = '/privacy' }: { privacyHref?: string } = $props();
</script>
<footer class="o-footer"><div class="o-wrap"><span>ORCA</span><div class="o-footer-links"><a href={localeHref(privacyHref)}>{t('ความเป็นส่วนตัว','Privacy')}</a><a href="/third-party.html">{t('ข้อมูลลิขสิทธิ์ซอฟต์แวร์','Software notices')}</a></div></div></footer>
