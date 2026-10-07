<script lang="ts">
  import Brand from "$lib/components/orca/Brand.svelte";
  import PublicFooter from "$lib/components/orca/PublicFooter.svelte";
  import "$lib/components/orca/forms.css";
  import "$lib/components/orca/orca.css";
  import { saveBlob } from "$lib/download";
  import { parseErrorContent } from "$lib/errors";
  import { filePage, FILE_ID, expiryText, reportLine, reportRows, type FilePage } from "$lib/orca/doc-templates";
  import { stoppedMessage } from "$lib/orca/platform-console";
  import { formatBytes } from "$lib/orca/knowledge";
  import { initializeLocale, localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { OrcaDocTemplateService, type GeneratedDocument } from "$lib/services/orca-doc-templates";
  import { Download, LoaderCircle } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { PageProps } from "./$types";

  // The file page: ORCA asks which company and workspace the file is in
  // (only its maker gets an answer), then downloads it there. Everyone else,
  // and every expired or deleted file, gets the same "not found".
  let { data }: PageProps = $props();
  let view = $state<FilePage | "loading">("loading");
  // The stored fill report, the requester's own (Codex code review 1): every
  // cell with its source, and the rows that did not fit.
  let doc = $state<GeneratedDocument>();
  const now = Date.now();

  onMount(async () => {
    initializeLocale();
    if (!FILE_ID.test(data.id)) {
      view = filePage(data.id, {});
      return;
    }
    try {
      const location = await OrcaDocTemplateService.locate(data.id);
      view = filePage(data.id, { location });
      if (view.kind === "ready") {
        try {
          const mine = await OrcaDocTemplateService.documents(location.hubID, location.companyID);
          doc = mine.find((item) => item.id === data.id);
        } catch {
          doc = undefined;
        }
      }
    } catch (cause) {
      view = filePage(data.id, parseErrorContent(cause));
    }
  });

  // The file, after a click, through the request layer (as the library's
  // originals): a refusal reaches the page. The file's company stopped, or the
  // file is gone, turns the page; anything else asks to try again.
  let downloading = $state(false);
  let downloadError = $state("");
  async function download(ready: Extract<FilePage, { kind: "ready" }>) {
    if (downloading) return;
    downloading = true;
    downloadError = "";
    try {
      const file = await OrcaDocTemplateService.download(ready.location.id, ready.company);
      saveBlob(file.blob, file.fileName);
    } catch (cause) {
      const next = filePage(data.id, parseErrorContent(cause));
      if (next.kind === "retry") downloadError = t("ดาวน์โหลดไม่สำเร็จ ลองอีกครั้ง", "The download didn't finish. Try again.");
      else view = next;
    } finally {
      downloading = false;
    }
  }
</script>

<svelte:head><title>{t("เอกสารจาก ORCA", "A document from ORCA")}</title><meta name="robots" content="noindex" /></svelte:head>
<div class="orca o-auth-page" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a href={localeHref("/app")} aria-label={t("เปิด ORCA", "Open ORCA")}><Brand /></a>
  </header>
  <main class="o-auth o-wrap file-main">
    <section class="o-auth-form file-panel" aria-live="polite">
      {#if view === "loading"}
        <p class="file-loading"><LoaderCircle size={20} class="k-spin" aria-hidden="true" />{t("กำลังเปิดเอกสาร…", "Opening the document…")}</p>
      {:else if view.kind === "ready"}
        <h1 class="file-title">{view.location.name}</h1>
        <p class="file-facts">{formatBytes(view.location.bytes)} · {expiryText(view.location.expiresAt, now, t)}</p>
        {@const ready = view}
        <button type="button" class="o-button" disabled={downloading} onclick={() => download(ready)}><Download size={16} aria-hidden="true" />{t("ดาวน์โหลด", "Download")}</button>
        {#if downloadError}<p class="o-alert file-alert" role="alert">{downloadError}</p>{/if}
        <p class="file-note">{t("ตรวจตัวเลขในไฟล์ก่อนส่งต่อ ไฟล์นี้เปิดได้เฉพาะคุณ", "Check the figures before you send it on. Only you can open this file.")}</p>
        {#if doc?.report}
          <details class="file-report">
            <summary>{reportLine(doc.report, !!doc.reportTruncated, t)}</summary>
            <table>
              <thead><tr><th>{t("ช่อง", "Cell")}</th><th>{t("ค่า", "Value")}</th><th>{t("มาจาก", "From")}</th></tr></thead>
              <tbody>
                {#each reportRows(doc.report, t) as row, i (i)}
                  <tr><td><span class="file-what">{row.what}</span><span class="file-cell">{row.cell}</span></td><td>{row.shown}</td><td>{row.source}</td></tr>
                {/each}
              </tbody>
            </table>
            {#each doc.report.overflow ?? [] as over (over.table)}
              {#if over.given > over.written}
                <p class="file-over">{t(`ตาราง ${over.table}: ${over.given - over.written} แถวไม่พอที่ ไม่ได้อยู่ในไฟล์`, `Table ${over.table}: ${over.given - over.written} rows did not fit and are not in the file`)}</p>
              {/if}
            {/each}
          </details>
        {/if}
      {:else if view.kind === "stopped"}
        <h1 class="file-title">{t("เปิดเอกสารนี้ไม่ได้", "This document can't be opened")}</h1>
        <p class="file-stop">{stoppedMessage(view.status, t)}</p>
        <a class="o-button outline" href={localeHref("/app")}>{t("เปิด ORCA", "Open ORCA")}</a>
      {:else if view.kind === "retry"}
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
	/* orca-type-remap v1 */
  .file-main { display: flex; justify-content: center; }
  .file-panel { align-self: center; width: min(100%, 460px); }
  .file-loading { display: flex; align-items: center; gap: 10px; }
  .file-title { margin: 0 0 6px; font-size: 20px; line-height: 1.35; overflow-wrap: anywhere; }
  .file-facts { margin: 0 0 18px; color: var(--orca-muted); font-size: 13.5px; }
  .file-note { margin: 14px 0 0; color: var(--orca-muted); font-size: 13px; line-height: 1.6; }
  a.o-button, button.o-button { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
  .file-alert { margin: 12px 0 0; }
  .file-stop { margin: 0 0 18px; color: var(--orca-muted); line-height: 1.6; }
  .file-report { margin-top: 18px; font-size: 13px; }
  .file-report summary { cursor: pointer; font-weight: 600; }
  .file-report table { width: 100%; margin-top: 10px; border-collapse: collapse; }
  .file-report th, .file-report td { padding: 6px 8px; border-top: 1px solid var(--orca-line); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  .file-report th { color: var(--orca-muted); font-weight: 500; }
  .file-what { display: block; }
  .file-cell { display: block; color: var(--orca-muted); font-size: 11.5px; }
  .file-over { margin: 8px 0 0; color: var(--orca-muted); }
</style>
