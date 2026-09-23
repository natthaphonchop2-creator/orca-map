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
    { id: "preferences", label: t("ภาษาและบัญชี", "Preferences") },
    { id: "ai", label: t("เชื่อม AI", "Connect AI") },
    { id: "additional", label: t("เพิ่มเติม", "Additional features") },
    ...(data.canReviewPilotRequests
      ? [{ id: "owner", label: t("สำหรับเจ้าของระบบ", "Owner") }]
      : []),
  ]);
</script>

<div class="connection-heading">
  <div>
    <h1>{t("ตั้งค่า", "Settings")}</h1>
    <p>
      {t(
        "เลือกภาษาและจัดการการตั้งค่าบัญชีของคุณ",
        "Manage your language and account preferences.",
      )}
    </p>
  </div>
</div>
<nav
  class="connection-detail-tabs"
  aria-label={t("หมวดการตั้งค่า", "Settings sections")}
>
  {#each tabs as tab}<a
      href={localeHref(`/app?view=settings&section=${tab.id}`)}
      class:chosen={section === tab.id}
      aria-current={section === tab.id ? "page" : undefined}>{tab.label}</a
    >{/each}
</nav>
{#if section === "preferences"}<section class="connection-detail-panel">
    <div class="connection-section-heading">
      <div>
        <h2><Globe size={20} />{t("ภาษาที่แสดง", "Display language")}</h2>
        <p>
          {t(
            "เลือกภาษาไทยหรือภาษาอังกฤษสำหรับ ORCA",
            "Choose Thai or English for ORCA.",
          )}
        </p>
      </div>
      <LocaleSwitch />
    </div>
  </section>
{:else if section === "ai"}<OrcaMCPAccess {data} />
{:else if section === "additional"}<section class="connection-detail-panel">
    <div class="connection-section-heading">
      <div>
        <h2>
          <BookOpen size={20} />{t(
            "ความรู้และเทมเพลต",
            "Knowledge & templates",
          )}
        </h2>
        <p>
          {t(
            "จัดการความรู้และเทมเพลตสำหรับ MCP Gateways ที่คุณมีสิทธิ์",
            "Manage knowledge and templates for MCP Gateways you can access.",
          )}
        </p>
      </div>
      <a class="k-button" href={localeHref("/app?view=knowledge")}
        >{t("เปิดคลังความรู้", "Open knowledge library")}<ArrowRight
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
<a class="connection-help-link" href={localeHref("/app?view=help")}
  >{t(
    "คู่มือการเชื่อมต่อและการใช้งาน",
    "Connection and setup guide",
  )}<ArrowRight size={16} /></a
>
