<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { term } from "$lib/orca/glossary";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    advancedFallback,
    settingsSection,
    type SignInSources,
  } from "$lib/orca/settings-sections";
  import { memberName, memberRole, type OrcaBootstrap } from "$lib/services/orca";
  import { OrcaUserSourcesService } from "$lib/services/orca-user-sources";
  import { ArrowRight, UserRound } from "@lucide/svelte";
  import { onMount } from "svelte";
  import OrganizationSettings from "./OrganizationSettings.svelte";
  import ThemeSetting from "./ThemeSetting.svelte";
  import UserSources from "./UserSources.svelte";
  import SettingsFrame from "./views/SettingsFrame.svelte";

  // ตั้งค่า: บริษัท (company name and logo), บัญชีของฉัน (theme; the language
  // is in the account menu) and ขั้นสูง (the company's own SSO, only once it
  // has a sign-in source), under SettingsFrame's tabs with ทีม and พื้นที่ทำงาน AI
  // (W0). Platform settings are in the platform area.
  let {
    data,
    activeData,
    onchanged,
  }: {
    data: OrcaBootstrap;
    /** The company's data without archived and removed records. */
    activeData?: OrcaBootstrap;
    onchanged: () => Promise<void>;
  } = $props();
  let sources = $state<SignInSources>("unknown");
  onMount(() => {
    if (!data.canManage) return;
    let alive = true;
    OrcaUserSourcesService.list()
      .then((result) => {
        if (alive) sources = result.items.length ? "some" : "none";
      })
      .catch(() => {
        if (alive) sources = "error";
      });
    return () => {
      alive = false;
    };
  });
  const requested = $derived(page.url.searchParams.get("section"));
  const canManage = $derived(data.canManage === true);
  const section = $derived(settingsSection(requested, canManage, sources));
  const currentUser = $derived(data.members.find((member) => member.id === data.currentUserID));
  $effect(() => {
    const fallback = advancedFallback(requested, canManage, sources);
    if (fallback) void goto(localeHref(fallback), { replaceState: true });
  });
</script>

<SettingsFrame {data} current={section} {sources}>
{#if section === "company" && canManage}
  <OrganizationSettings data={activeData ?? data} {onchanged} embedded />
{:else if section === "advanced" && canManage}
  <UserSources data={activeData ?? data} />
{:else}<section class="settings-panel" aria-labelledby="settings-account-title">
    <div class="settings-panel-head">
      <div>
        <h2 id="settings-account-title"><UserRound size={18} />{term("myAccount", t)}</h2>
        <p>
          {#if currentUser}{[memberName(currentUser), currentUser.email, memberRole(currentUser.role)].filter(Boolean).join(" · ")}{/if}
        </p>
        <p>{t("เปลี่ยนภาษาได้ที่เมนูบัญชี · ชื่อและอีเมลมาจากบัญชี Google ของคุณ", "Change the language in the account menu. Your name and email come from your Google account.")}</p>
      </div>
    </div>
    <ThemeSetting />
  </section>
{/if}
<a class="settings-help-link" href={localeHref("/app?view=help")}
  >{t(
    "ดูคำถามที่พบบ่อย",
    "Read the common questions",
  )}<ArrowRight size={16} /></a
>
</SettingsFrame>

<style>
	/* orca-type-remap v1 */
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
    font-size: 12.5px;
    line-height: 1.6;
  }
  .settings-help-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    color: var(--orca-ink);
    font-size: 12.5px;
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
