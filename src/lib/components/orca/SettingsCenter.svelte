<script lang="ts">
  import { page } from "$app/state";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import type { OrcaBootstrap } from "$lib/services/orca";
  import { ArrowRight, BookOpen, Globe } from "@lucide/svelte";
  import LocaleSwitch from "./LocaleSwitch.svelte";
  import PilotInbox from "./PilotInbox.svelte";
  import OrcaMCPAccess from "./OrcaMCPAccess.svelte";
  let {
    data,
    onchanged,
  }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
  const section = $derived(
    ["ai", "additional", "owner"].includes(page.url.searchParams.get("section") || "")
      ? page.url.searchParams.get("section")
      : "preferences",
  );
  const tabs = $derived([
    { id: "preferences", label: t("ทั่วไป", "General") },
    { id: "ai", label: t("เชื่อมต่อ AI", "Connect AI") },
    { id: "additional", label: t("ความสามารถเพิ่มเติม", "Additional features") },
    ...(data.canReviewPilotRequests
      ? [{ id: "owner", label: t("คำขอทดลองใช้", "Pilot requests") }]
      : []),
  ]);
</script>

<div class="k-intro">
  <h1>{t("ตั้งค่า", "Settings")}</h1>
  <p class="k-subtitle">
    {t(
      "จัดการภาษาที่แสดง การเชื่อมต่อ AI และการตั้งค่าอื่นของบัญชีคุณ",
      "Manage your display language, AI connection and other account settings.",
    )}
  </p>
</div>
<nav
  class="settings-tabs"
  aria-label={t("หมวดการตั้งค่า", "Settings sections")}
>
  {#each tabs as tab}<a
      href={localeHref(`/app?view=settings&section=${tab.id}`)}
      class:chosen={section === tab.id}
      aria-current={section === tab.id ? "page" : undefined}>{tab.label}</a
    >{/each}
</nav>
{#if section === "preferences"}<section class="settings-panel">
    <div class="settings-panel-head">
      <div>
        <h2><Globe size={18} />{t("ภาษาที่แสดง", "Display language")}</h2>
        <p>
          {t(
            "เลือกภาษาไทยหรือภาษาอังกฤษสำหรับการแสดงผลของ ORCA",
            "Choose Thai or English as the ORCA display language.",
          )}
        </p>
      </div>
      <LocaleSwitch />
    </div>
  </section>
{:else if section === "ai"}<OrcaMCPAccess {data} />
{:else if section === "additional"}<section class="settings-panel">
    <div class="settings-panel-head">
      <div>
        <h2>
          <BookOpen size={18} />{t(
            "คลังความรู้ (Orca Cloud)",
            "Knowledge (Orca Cloud)",
          )}
        </h2>
        <p>
          {t(
            "จัดการบทความความรู้และแม่แบบในพื้นที่ทำงาน AI ที่คุณมีสิทธิ์",
            "Manage knowledge articles and templates in the AI workspaces you can access.",
          )}
        </p>
      </div>
      <a class="k-button small" href={localeHref("/app?view=knowledge")}
        >{t("เปิดคลังความรู้", "Open Knowledge")}<ArrowRight
          size={16}
        /></a
      >
    </div>
  </section>
{:else if section === "owner" && data.canReviewPilotRequests}<div
    class="settings-embedded"
  >
    <PilotInbox />
  </div>
{/if}
<a class="settings-help-link" href={localeHref("/app?view=help")}
  >{t(
    "คู่มือการเชื่อมต่อและการใช้งาน",
    "Connection and usage guide",
  )}<ArrowRight size={16} /></a
>

<style>
  .settings-tabs {
    display: flex;
    gap: 20px;
    margin: 0 0 20px;
    overflow-x: auto;
    box-shadow: inset 0 -1px 0 var(--orca-line);
    scrollbar-width: none;
  }
  .settings-tabs a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 2px;
    border-bottom: 2px solid transparent;
    color: var(--orca-muted);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }
  .settings-tabs a:hover {
    color: var(--orca-ink);
    text-decoration: none;
  }
  .settings-tabs a.chosen {
    border-bottom-color: var(--orca-ink);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .settings-panel {
    margin-bottom: 16px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .settings-panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding: 16px 18px;
  }
  .settings-panel-head > div {
    flex: 1 1 320px;
    min-width: 0;
  }
  .settings-panel-head h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .settings-panel-head h2 :global(svg) {
    flex: none;
    color: var(--orca-subtle);
  }
  .settings-panel-head p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .settings-help-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    color: var(--orca-ink);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
  }
  .settings-help-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .settings-help-link :global(svg) {
    color: var(--orca-subtle);
  }
</style>
