<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Copy, LoaderCircle } from "@lucide/svelte";
  import { googleRedirectURI, parseDomains } from "$lib/orca/google-signin";
  import { t } from "$lib/orca/locale.svelte";
  import { OrcaService, orcaError, type OrcaBootstrap, type OrcaGoogleSignIn } from "$lib/services/orca";

  // Signing in to the workspace with Google, beside the password. Managers see
  // it; only an owner changes it, because it decides who may join.
  let { data }: { data: OrcaBootstrap } = $props();
  let setting = $state<OrcaGoogleSignIn>();
  let clientID = $state("");
  let clientSecret = $state("");
  let domains = $state("");
  let enabled = $state(false);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let copied = $state(false);
  const owner = $derived(data.canManageRoles === true);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const suggested = $derived(googleRedirectURI(origin));
  // The saved address wins; a new setup starts from this workspace's address.
  const redirectURI = $derived(setting?.redirectURI || suggested);
  const movedOrigin = $derived(!!setting?.redirectURI && setting.redirectURI !== suggested);

  function fill(next: OrcaGoogleSignIn) {
    setting = next;
    clientID = next.clientID;
    domains = next.allowedDomains.join(", ");
    enabled = next.enabled;
    clientSecret = "";
  }
  async function load() {
    error = "";
    try {
      fill(await OrcaService.googleSignIn());
    } catch (cause) {
      error = orcaError(cause);
    }
  }
  onMount(() => void load());

  async function save() {
    if (busy || !owner || !setting) return;
    busy = true;
    error = notice = "";
    try {
      const saved = await OrcaService.saveGoogleSignIn({
        clientID: clientID.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        allowedDomains: parseDomains(domains),
        redirectURI,
        enabled,
        version: setting.version,
      });
      fill(saved);
      notice = saved.enabled
        ? t("บันทึกแล้ว พนักงานในโดเมนที่อนุญาตเข้าสู่ระบบด้วย Google ได้แล้ว", "Saved. People in the allowed domains can now sign in with Google.")
        : t("บันทึกแล้ว การเข้าสู่ระบบด้วย Google ยังปิดอยู่", "Saved. Google sign-in is still off.");
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      busy = false;
      clientSecret = "";
    }
  }
  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(redirectURI);
      copied = true;
    } catch {
      error = t("คัดลอกไม่สำเร็จ กรุณาเลือกที่อยู่แล้วคัดลอกเอง", "Copy failed. Select the address and copy it yourself.");
    }
  }
</script>

<section class="google-signin" aria-labelledby="google-signin-title">
  <header>
    <div>
      <h2 id="google-signin-title">{t("เข้าสู่ระบบ ORCA ด้วย Google", "Sign in to ORCA with Google")}</h2>
      <p>{t("ให้พนักงานเข้าสู่ระบบด้วยบัญชี Google Workspace ของบริษัท คู่กับอีเมลและรหัสผ่านเดิม อีเมลเดียวกันคือบัญชีเดียวกัน คนใหม่ในโดเมนที่อนุญาตจะเข้ามาเป็นสมาชิกทั่วไป", "Let staff sign in with their company Google Workspace account, beside email and password. The same email is the same account. New people in an allowed domain join as members.")}</p>
    </div>
    {#if setting}<span class="google-status" class:on={setting.enabled}>{setting.enabled ? t("เปิดใช้งาน", "On") : t("ปิดอยู่", "Off")}</span>{/if}
  </header>
  {#if error}<div class="k-banner error" role="alert">{error}</div>{/if}
  {#if notice}<p class="google-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>{/if}
  {#if !setting && !error}
    <p class="google-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</p>
  {:else if setting}
    <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy || !owner}>
        <label for="google-client-id">Client ID</label>
        <input id="google-client-id" bind:value={clientID} autocomplete="off" spellcheck="false" placeholder="1234-abc.apps.googleusercontent.com" />
        <label for="google-client-secret">{setting.secretConfigured ? t("Client secret ใหม่ (เว้นว่างเพื่อใช้ค่าเดิม)", "New client secret (leave blank to keep the saved one)") : "Client secret"}</label>
        <input id="google-client-secret" type="password" bind:value={clientSecret} autocomplete="new-password" spellcheck="false" />
        <label for="google-domains">{t("โดเมนบริษัทที่อนุญาต", "Allowed company domains")}</label>
        <input id="google-domains" bind:value={domains} autocomplete="off" spellcheck="false" placeholder="example.co.th" />
        <p class="google-help">{t("คั่นหลายโดเมนด้วยจุลภาค ต้องเป็นบัญชี Google Workspace ของโดเมนนั้น บัญชี Gmail ส่วนตัวเข้าได้เฉพาะเมื่อใส่ gmail.com", "Separate several with commas. Accounts must belong to that domain's Google Workspace; personal Gmail works only if you add gmail.com.")}</p>
        <label for="google-redirect">{t("Redirect URI สำหรับลงทะเบียนใน Google Cloud", "Redirect URI to register in Google Cloud")}</label>
        <div class="google-copy">
          <input id="google-redirect" readonly value={redirectURI} />
          <button type="button" class="k-button" onclick={copyRedirect}>{#if copied}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอก", "Copy")}{/if}</button>
        </div>
        {#if movedOrigin}<p class="google-warning" role="status">{t(`ที่อยู่ที่บันทึกไว้ต่างจากที่อยู่ของหน้านี้ (${suggested}) ตรวจว่าเป็นที่อยู่ที่ลงทะเบียนใน Google จริง`, `The saved address differs from this page's (${suggested}). Check it is the one registered with Google.`)}</p>{/if}
        <label class="google-switch"><input type="checkbox" bind:checked={enabled} />{t("เปิดการเข้าสู่ระบบด้วย Google", "Turn on Google sign-in")}</label>
      </fieldset>
      {#if owner}
        <div class="google-actions"><button type="submit" class="k-button primary" disabled={busy}>{#if busy}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{t("บันทึก", "Save")}</button></div>
      {:else}
        <p class="google-help">{t("เฉพาะเจ้าของระบบเปลี่ยนการตั้งค่านี้ได้", "Only an Owner can change this setting.")}</p>
      {/if}
    </form>
    <details class="google-steps">
      <summary>{t("ขั้นตอนการตั้งค่า", "Setup steps")}</summary>
      <ol class="k-numbered">
        <li>{t("ใน Google Cloud สร้าง OAuth client แบบ Web application และใส่ Redirect URI ด้านบนให้ตรงทุกตัวอักษร", "In Google Cloud, create a Web application OAuth client and add the redirect URI above exactly.")}</li>
        <li>{t("กรอก Client ID และ Client secret ของ client นั้น (ORCA เก็บ secret แบบเข้ารหัสและไม่แสดงอีก)", "Enter that client's ID and secret. ORCA stores the secret encrypted and never shows it again.")}</li>
        <li>{t("ใส่โดเมนอีเมลของบริษัท แล้วเปิดใช้งาน", "Add your company's email domain, then turn it on.")}</li>
        <li>{t("ลองเข้าสู่ระบบในหน้าต่างส่วนตัวด้วยบัญชีบริษัท รหัสผ่านเดิมยังใช้ได้เสมอ", "Try signing in from a private window with a company account. Passwords keep working.")}</li>
      </ol>
    </details>
  {/if}
</section>

<style>
  .google-signin { display: grid; gap: 12px; padding: 18px 20px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .google-signin header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 20px; }
  .google-signin h2 { margin: 0; font-size: 16px; font-weight: 600; }
  .google-signin header p { max-width: 72ch; margin: 4px 0 0; color: var(--orca-muted); font-size: 13.5px; line-height: 1.65; }
  .google-status { flex: none; padding: 2px 9px; border-radius: var(--orca-radius-sm); background: var(--orca-secondary); color: var(--orca-nav); font-size: 12.5px; font-weight: 500; }
  .google-status.on { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .google-signin form { display: grid; gap: 12px; }
  .google-signin fieldset { display: grid; gap: 6px; min-width: 0; margin: 0; padding: 0; border: 0; }
  .google-signin label { margin-top: 8px; font-size: 13.5px; font-weight: 600; }
  .google-signin input:not([type="checkbox"]) { width: 100%; min-height: 38px; padding: 8px 11px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .google-signin input[readonly] { background: var(--orca-surface-2); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; }
  .google-copy { display: flex; gap: 8px; }
  .google-copy .k-button { flex: none; }
  .google-switch { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-weight: 600; }
  .google-switch input { width: 16px; height: 16px; accent-color: var(--orca-ink); }
  .google-help, .google-loading { display: flex; align-items: center; gap: 8px; margin: 2px 0 0; color: var(--orca-muted); font-size: 13px; line-height: 1.6; }
  .google-warning { margin: 4px 0 0; padding: 8px 12px; border-radius: var(--orca-radius); background: var(--orca-warn-bg); color: var(--orca-warn); font-size: 13px; }
  .google-actions { display: flex; justify-content: flex-end; }
  .google-notice { display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-ok-bg); color: var(--orca-ok); font-size: 13.5px; }
  .google-steps summary { color: var(--orca-ink); font-size: 13.5px; font-weight: 500; cursor: pointer; }
  .google-steps ol { margin: 8px 0 0; font-size: 13.5px; line-height: 1.7; }
  @media (max-width: 600px) {
    .google-signin { padding: 16px; }
    .google-signin header { flex-direction: column; }
  }
</style>
