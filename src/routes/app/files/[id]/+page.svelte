<script lang="ts">
  import Brand from "$lib/components/orca/Brand.svelte";
  import PublicFooter from "$lib/components/orca/PublicFooter.svelte";
  import "$lib/components/orca/forms.css";
  import "$lib/components/orca/orca.css";
  import { parseErrorContent } from "$lib/errors";
  import { filePage, FILE_ID, expiryText, type FilePage } from "$lib/orca/doc-templates";
  import { formatBytes } from "$lib/orca/knowledge";
  import { initializeLocale, localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { OrcaDocTemplateService } from "$lib/services/orca-doc-templates";
  import { Download, LoaderCircle } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { PageProps } from "./$types";

  // The file page: ORCA asks which company and workspace the file is in
  // (only its maker gets an answer), then downloads it there. Everyone else,
  // and every expired or deleted file, gets the same "not found".
  let { data }: PageProps = $props();
  let state = $state<FilePage | "loading">("loading");
  const now = Date.now();

  onMount(async () => {
    initializeLocale();
    if (!FILE_ID.test(data.id)) {
      state = filePage(data.id, {}, OrcaDocTemplateService.downloadHref);
      return;
    }
    try {
      const location = await OrcaDocTemplateService.locate(data.id);
      state = filePage(data.id, { location }, OrcaDocTemplateService.downloadHref);
    } catch (cause) {
      state = filePage(data.id, { status: parseErrorContent(cause).status }, OrcaDocTemplateService.downloadHref);
    }
  });
</script>

<svelte:head><title>{t("เอกสารจาก ORCA", "A document from ORCA")}</title><meta name="robots" content="noindex" /></svelte:head>
<div class="orca o-auth-page" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a href={localeHref("/app")} aria-label={t("เปิด ORCA", "Open ORCA")}><Brand /></a>
  </header>
  <main class="o-auth o-wrap file-main">
    <section class="o-auth-form file-panel" aria-live="polite">
      {#if state === "loading"}
        <p class="file-loading"><LoaderCircle size={20} class="k-spin" aria-hidden="true" />{t("กำลังเปิดเอกสาร…", "Opening the document…")}</p>
      {:else if state.kind === "ready"}
        <h1 class="file-title">{state.location.name}</h1>
        <p class="file-facts">{formatBytes(state.location.bytes)} · {expiryText(state.location.expiresAt, now, t)}</p>
        <a class="o-button" href={state.href} download><Download size={16} aria-hidden="true" />{t("ดาวน์โหลด", "Download")}</a>
        <p class="file-note">{t("ตรวจตัวเลขในไฟล์ก่อนส่งต่อ ไฟล์นี้เปิดได้เฉพาะคุณ", "Check the figures before you send it on. Only you can open this file.")}</p>
      {:else if state.kind === "retry"}
        <h1 class="file-title">{t("เปิดเอกสารไม่สำเร็จ", "The document did not open")}</h1>
        <p>{t("ORCA ตอบไม่ได้ในตอนนี้ ลองอีกครั้ง", "ORCA can't answer right now. Try again.")}</p>
        <button class="o-button" onclick={() => location.reload()}>{t("ลองอีกครั้ง", "Try again")}</button>
      {:else}
        <h1 class="file-title">{t("ไม่พบเอกสารนี้", "This document isn't here")}</h1>
        <p>{t("ไฟล์อาจหมดอายุหรือถูกลบแล้ว หรือคุณไม่ใช่คนที่สร้างไฟล์นี้ ถ้าเข้าสู่ระบบผิดบัญชี ให้ออกจากระบบแล้วเข้าใหม่", "It may have expired or been deleted, or you didn't make it. If you're signed in with another account, sign out and in again.")}</p>
        <a class="o-button outline" href={localeHref("/app")}>{t("เปิด ORCA", "Open ORCA")}</a>
      {/if}
    </section>
  </main>
  <PublicFooter />
</div>

<style>
  .file-main { display: flex; justify-content: center; }
  .file-panel { align-self: center; width: min(100%, 460px); }
  .file-loading { display: flex; align-items: center; gap: 10px; }
  .file-title { margin: 0 0 6px; font-size: 22px; line-height: 1.35; overflow-wrap: anywhere; }
  .file-facts { margin: 0 0 18px; color: var(--orca-muted); font-size: 14px; }
  .file-note { margin: 14px 0 0; color: var(--orca-muted); font-size: 13.5px; line-height: 1.6; }
  a.o-button { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
</style>
