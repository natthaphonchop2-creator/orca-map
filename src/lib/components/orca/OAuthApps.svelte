<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ArrowRight, Check, CircleAlert, Copy, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, X } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { catalogSetupHref } from "$lib/orca/catalog";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { oauthApps, type ManagedOAuthApp, type OAuthAppProvider } from "$lib/orca/oauth-apps";
  import { OrcaService, type OrcaBootstrap, type OrcaCandidate } from "$lib/services/orca";

  let { data }: { data: OrcaBootstrap } = $props();
  let candidates = $state<OrcaCandidate[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let error = $state("");
  let notice = $state("");
  let editing = $state<OAuthAppProvider>();
  let redirectURL = $state("");
  let clientID = $state("");
  let clientSecret = $state("");
  let busy = $state(false);
  let formError = $state("");
  let copied = $state("");
  let alive = true;
  let request = 0;
  const apps = $derived(oauthApps(candidates));

  const providerName = (provider: OAuthAppProvider) => (provider === "google" ? "Google" : "Microsoft");
  const providerLogo = (provider: OAuthAppProvider) => (provider === "google" ? "/orca/tools/google.svg" : "/orca/tools/microsoft.svg");
  // Fixed official consoles; never derived from catalog data.
  const providerConsole = (provider: OAuthAppProvider) =>
    provider === "google" ? "https://console.cloud.google.com/auth/clients" : "https://entra.microsoft.com/";
  function providerSteps(provider: OAuthAppProvider) {
    return provider === "google"
      ? [
          t("เปิด Google Auth Platform ในโครงการ Google Cloud ของ ORCA ตั้งชื่อแอปเป็น ORCA ในส่วน Branding และเลือก External ในส่วน Audience", "Open Google Auth Platform in ORCA's Google Cloud project, name the app ORCA under Branding, and choose External under Audience."),
          t("เปิดใช้ Drive, Gmail, Calendar, Docs, Sheets และ Search Console API แล้วเพิ่มสิทธิ์ด้านล่างในส่วน Data Access", "Enable the Drive, Gmail, Calendar, Docs, Sheets and Search Console APIs, then add the scopes below under Data Access."),
          t("สร้าง OAuth client ชนิด Web application และใส่ Callback URL ด้านล่างในช่อง Authorized redirect URIs", "Create a Web application OAuth client and add the callback URL below to its authorized redirect URIs."),
          t("คัดลอก Client ID และ Client secret มาวางด้านล่าง ระหว่างที่แอปยังอยู่ในโหมด Testing ให้เพิ่มบัญชีที่จะใช้งานในส่วน Audience (ไม่เกิน 100 บัญชี)", "Paste the Client ID and Client secret below. While the app is in Testing, add the accounts that will use it under Audience (up to 100)."),
        ]
      : [
          t("เปิด Microsoft Entra → App registrations → New registration ตั้งชื่อ ORCA และเลือกบัญชีขององค์กรใดก็ได้และบัญชี Microsoft ส่วนตัว", "Open Microsoft Entra → App registrations → New registration, name it ORCA, and allow accounts in any organization plus personal Microsoft accounts."),
          t("เพิ่ม Callback URL ด้านล่างเป็น Redirect URI ชนิด Web", "Add the callback URL below as a Web redirect URI."),
          t("ใน API permissions เพิ่มสิทธิ์ Microsoft Graph แบบ Delegated ตามรายการด้านล่าง (Excel ต้องใช้ Files.ReadWrite แม้ ORCA จะอ่านอย่างเดียว)", "Under API permissions, add the Microsoft Graph delegated permissions below (Excel needs Files.ReadWrite even though ORCA only reads)."),
          t("ใน Certificates & secrets สร้าง Client secret ใหม่ แล้วคัดลอก Application (client) ID และค่า Value ของ secret มาวางด้านล่าง", "Under Certificates & secrets, create a client secret, then paste the Application (client) ID and the secret's Value below."),
        ];
  }

  async function refresh() {
    const current = ++request;
    loading = true;
    error = "";
    try {
      const next = await OrcaService.candidates();
      if (!alive || current !== request) return;
      candidates = next;
      loaded = true;
    } catch {
      if (alive && current === request) error = t("โหลดสถานะแอปไม่สำเร็จ กรุณาลองอีกครั้ง", "The app status could not be loaded. Try again.");
    } finally {
      if (alive && current === request) loading = false;
    }
  }
  onMount(() => { if (data.canManage) void refresh(); });
  onDestroy(() => { alive = false; });

  function closeSetup() {
    editing = undefined;
    clientID = "";
    clientSecret = "";
    formError = "";
  }

  async function openSetup(app: ManagedOAuthApp) {
    if (!app.setupSourceID || !app.canConfigure) return;
    closeSetup();
    notice = "";
    redirectURL = "";
    editing = app.provider;
    try {
      const setup = await OrcaService.sourceSetup(app.setupSourceID);
      if (alive && editing === app.provider) redirectURL = setup.oauthRedirectURL;
    } catch {
      if (alive && editing === app.provider) formError = t("โหลด Callback URL ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่", "The callback URL could not be loaded. Close this form and open it again.");
    }
  }

  async function save(event: SubmitEvent, app: ManagedOAuthApp) {
    event.preventDefault();
    if (busy || !app.setupSourceID || !app.canConfigure || !redirectURL) return;
    const id = clientID.trim();
    const secret = clientSecret.trim();
    if (!id || !secret) {
      formError = t("กรอก Client ID และ Client secret ให้ครบ", "Enter both the Client ID and the Client secret.");
      return;
    }
    // The secret never stays in page state once it is on its way.
    clientSecret = "";
    busy = true;
    formError = "";
    try {
      const response = await OrcaService.configureSourceOAuthClient(app.setupSourceID, id, secret);
      if (!response.oauthClientConfigured) throw new Error("not configured");
      if (!alive) return;
      closeSetup();
      notice = t(`ตั้งค่าแอป ${providerName(app.provider)} แล้ว สมาชิกเชื่อมบัญชีของตัวเองได้ทันที`, `The ${providerName(app.provider)} app is set up. Members can connect their own accounts now.`);
      await refresh();
    } catch {
      if (alive) formError = t("บันทึกแอปไม่สำเร็จ ตรวจสอบว่าคุณเป็นเจ้าของระบบ ORCA และค่าที่วางถูกต้อง แล้วลองอีกครั้ง", "The app could not be saved. Check that you are the ORCA installation owner and that the values are correct, then try again.");
    } finally {
      if (alive) busy = false;
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => { if (copied === key) copied = ""; }, 2000);
    } catch {
      copied = "";
    }
  }
</script>

<section class="oauth-apps" aria-labelledby="oauth-apps-title">
  <header class="apps-heading">
    <div>
      <h1 id="oauth-apps-title">{t("แอปเชื่อมบัญชี (OAuth)", "OAuth apps")}</h1>
      <p class="k-subtitle">{t("แอปที่ให้สมาชิกกด “อนุญาต” เพื่อเชื่อมบัญชีของตัวเองกับระบบต่าง ๆ ตั้งค่าครั้งเดียวต่อผู้ให้บริการ", "Apps that let members connect their own accounts with one “Allow”. Each provider is set up once.")}</p>
    </div>
    {#if data.canManage}
      <button class="k-button apps-square" disabled={loading} onclick={refresh} aria-label={t("โหลดข้อมูลใหม่", "Refresh")} title={t("โหลดข้อมูลใหม่", "Refresh")}><RefreshCw size={16} class={loading ? "k-spin" : ""} /></button>
    {/if}
  </header>

  {#if !data.canManage}
    <div class="apps-empty"><ShieldCheck size={28} aria-hidden="true" /><h2>{t("หน้านี้สำหรับผู้ดูแลระบบเท่านั้น", "This page is available to Admins only")}</h2></div>
  {:else}
    {#if error}<div class="k-banner error" role="alert">{error}</div>{/if}
    {#if notice}<p class="apps-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>{/if}
    {#if loading && !loaded}
      <div class="apps-empty" role="status"><LoaderCircle size={24} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</div>
    {:else if loaded}
      <section class="apps-section" aria-labelledby="managed-apps-title">
        <div class="section-head">
          <h2 id="managed-apps-title">{t("ผู้ให้บริการที่ ORCA ดูแล", "Providers ORCA manages")}</h2>
          <p>{t("แอปเดียวใช้ได้กับทุกระบบของผู้ให้บริการนั้น สมาชิกแต่ละคนเชื่อมบัญชีของตัวเอง และ ORCA ขอสิทธิ์เพื่ออ่านข้อมูลเท่านั้น", "One app covers every system of that provider. Each member connects their own account, and ORCA asks only for read access.")}</p>
        </div>
        {#if apps.managed.length}
          <div class="provider-grid">
            {#each apps.managed as app (app.provider)}
              {@const readyCount = app.connectors.filter((connector) => connector.ready).length}
              <article class="provider-card" class:attention={!app.ready}>
                <header>
                  <img class="provider-logo" src={providerLogo(app.provider)} alt="" width="28" height="28" />
                  <div class="provider-name"><h3>{providerName(app.provider)}</h3><span>{t(`ใช้ร่วมกันกับ ${app.connectors.length} ระบบ`, `Shared by ${app.connectors.length} systems`)}</span></div>
                  <span class="apps-status" class:ok={app.ready} class:warn={!app.ready}>
                    {#if app.ready}<Check size={13} aria-hidden="true" />{t("พร้อมใช้", "Ready")}
                    {:else}<CircleAlert size={13} aria-hidden="true" />{readyCount ? t("ตั้งค่ายังไม่ครบ", "Partly set up") : t("ต้องตั้งค่า", "Needs setup")}{/if}
                  </span>
                </header>
                <ul class="connector-list" aria-label={t(`ระบบที่ใช้แอป ${providerName(app.provider)}`, `Systems using the ${providerName(app.provider)} app`)}>
                  {#each app.connectors as connector (connector.id)}
                    <li class:ready={connector.ready}><CatalogIcon name={connector.name} size={16} />{connector.name}<span class="visually-hidden">{connector.ready ? t("พร้อมใช้", "ready") : t("ยังไม่พร้อม", "not ready")}</span></li>
                  {/each}
                </ul>
                <footer>
                  {#if app.ready}
                    <p>{t("สมาชิกกด “อนุญาต” เพื่อเชื่อมบัญชีของตัวเองได้เลย", "Members can connect their own accounts with one “Allow”.")}</p>
                  {:else if app.canConfigure}
                    <button class="k-button primary" aria-expanded={editing === app.provider} aria-controls={`oauth-setup-${app.provider}`} onclick={() => (editing === app.provider ? closeSetup() : openSetup(app))}>{t(`ตั้งค่าแอป ${providerName(app.provider)}`, `Set up the ${providerName(app.provider)} app`)}</button>
                  {:else}
                    <p>{t("เจ้าของระบบ ORCA เป็นผู้ตั้งค่าแอปนี้", "The ORCA installation owner sets up this app.")}</p>
                  {/if}
                </footer>
              </article>
            {/each}
          </div>
          {#each apps.managed as app (app.provider)}
            {#if editing === app.provider}
              <form id={`oauth-setup-${app.provider}`} class="setup-panel" onsubmit={(event) => save(event, app)} autocomplete="off">
                <div class="panel-head">
                  <h3>{t(`ตั้งค่าแอป ${providerName(app.provider)}`, `Set up the ${providerName(app.provider)} app`)}</h3>
                  <button type="button" class="apps-icon-button" disabled={busy} onclick={closeSetup} aria-label={t("ปิด", "Close")} title={t("ปิด", "Close")}><X size={16} /></button>
                </div>
                <ol class="setup-steps">{#each providerSteps(app.provider) as step (step)}<li>{step}</li>{/each}</ol>
                <a class="k-button console-link" href={providerConsole(app.provider)} target="_blank" rel="noopener noreferrer">{app.provider === "google" ? t("เปิด Google Auth Platform", "Open Google Auth Platform") : t("เปิด Microsoft Entra", "Open Microsoft Entra")}<ExternalLink size={14} aria-hidden="true" /></a>
                <div class="setup-field">
                  <label for={`oauth-callback-${app.provider}`}>Callback URL</label>
                  <div class="field-action">
                    <input id={`oauth-callback-${app.provider}`} readonly value={redirectURL} placeholder={t("กำลังโหลด…", "Loading…")} />
                    <button type="button" class="k-button apps-square" disabled={!redirectURL} onclick={() => copy(redirectURL, "callback")} aria-label={t("คัดลอก Callback URL", "Copy callback URL")} title={t("คัดลอก Callback URL", "Copy callback URL")}>{#if copied === "callback"}<Check size={16} />{:else}<Copy size={16} />{/if}</button>
                  </div>
                </div>
                <div class="setup-field">
                  <div class="field-label-row">
                    <span id={`oauth-scopes-${app.provider}`}>{app.provider === "google" ? t("สิทธิ์ที่ต้องเพิ่ม (Scopes)", "Scopes to add") : t("สิทธิ์ Microsoft Graph แบบ Delegated", "Microsoft Graph delegated permissions")}</span>
                    <button type="button" class="k-button small" onclick={() => copy(app.scopes.join("\n"), "scopes")}>{#if copied === "scopes"}<Check size={14} />{:else}<Copy size={14} />{/if}{t("คัดลอก", "Copy")}</button>
                  </div>
                  <ul class="scope-list" aria-labelledby={`oauth-scopes-${app.provider}`}>{#each app.scopes as scope (scope)}<li><code>{scope}</code></li>{/each}</ul>
                </div>
                <div class="credential-fields">
                  <div class="setup-field">
                    <label for={`oauth-client-id-${app.provider}`}>{app.provider === "google" ? "Client ID" : "Application (client) ID"}</label>
                    <input id={`oauth-client-id-${app.provider}`} bind:value={clientID} required autocomplete="off" spellcheck="false" />
                  </div>
                  <div class="setup-field">
                    <label for={`oauth-client-secret-${app.provider}`}>Client secret</label>
                    <input id={`oauth-client-secret-${app.provider}`} type="password" bind:value={clientSecret} required autocomplete="new-password" spellcheck="false" />
                  </div>
                </div>
                <p class="apps-hint">{t("ORCA เก็บ Client secret แบบเข้ารหัสและจะไม่แสดงค่านี้อีก", "ORCA stores the client secret encrypted and never shows it again.")}</p>
                {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
                <footer class="panel-actions">
                  <button type="button" class="k-button" disabled={busy} onclick={closeSetup}>{t("ยกเลิก", "Cancel")}</button>
                  <button type="submit" class="k-button primary" disabled={busy || !redirectURL}>{#if busy}<LoaderCircle size={16} class="k-spin" />{/if}{t("บันทึก", "Save")}</button>
                </footer>
              </form>
            {/if}
          {/each}
        {:else}
          <p class="apps-muted">{t("ยังไม่มีผู้ให้บริการที่ ORCA ดูแลในระบบนี้", "No ORCA-managed provider is installed.")}</p>
        {/if}
      </section>

      <section class="apps-section" aria-labelledby="custom-apps-title">
        <div class="section-head">
          <h2 id="custom-apps-title">{t("ระบบที่ต้องใช้แอปของคุณเอง", "Systems that need your own app")}<span class="apps-count">{apps.custom.length}</span></h2>
          <p>{t("ผู้ให้บริการเหล่านี้ไม่รับการลงทะเบียนอัตโนมัติ ต้องสร้างแอป OAuth ที่ผู้ให้บริการก่อน แล้วนำ Client ID และ Client secret มาใส่ใน ORCA", "These providers do not accept automatic registration. Create an OAuth app with the provider first, then enter its Client ID and Client secret in ORCA.")}</p>
        </div>
        {#if apps.custom.length}
          <div class="app-list">
            {#each apps.custom as app (app.id)}
              <a class="app-row" href={localeHref(catalogSetupHref(app.id))}>
                <CatalogIcon name={app.name} size={28} />
                <span class="app-name"><strong>{app.name}</strong>{#if app.endpointHost}<span>{app.endpointHost}</span>{/if}</span>
                <span class="apps-status warn"><CircleAlert size={13} aria-hidden="true" />{t("ต้องตั้งค่าแอป", "Needs an app")}</span>
                <span class="row-action">{app.canConfigure ? t("ตั้งค่า", "Set up") : t("ดูวิธีตั้งค่า", "View setup")}<ArrowRight size={14} aria-hidden="true" /></span>
              </a>
            {/each}
          </div>
        {:else}
          <p class="apps-muted">{t("ไม่มีระบบที่ต้องตั้งค่าแอปเพิ่ม", "No system needs its own app.")}</p>
        {/if}
      </section>

      <aside class="ready-note">
        <Check size={16} aria-hidden="true" />
        <p>{t(`อีก ${apps.readyToSignIn} ระบบเชื่อมด้วย OAuth ได้ทันที ไม่ต้องตั้งค่าแอป`, `${apps.readyToSignIn} more systems connect with OAuth right away, with no app to set up.`)}</p>
        <a href={localeHref("/app?view=catalog")}>{t("ดูระบบทั้งหมด", "Browse systems")}<ArrowRight size={14} aria-hidden="true" /></a>
      </aside>
    {/if}
  {/if}
</section>

<style>
  .oauth-apps { display: grid; gap: 20px; min-width: 0; }
  .apps-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 24px; }
  .apps-heading h1 { margin: 0; }
  .apps-heading .k-subtitle { max-width: 680px; }
  .apps-square { width: 36px; padding: 0; flex: none; justify-content: center; }
  .apps-section { display: grid; gap: 12px; min-width: 0; }
  .section-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 600; }
  .section-head p { max-width: 760px; margin: 4px 0 0; color: var(--orca-muted); font-size: 13.5px; line-height: 1.6; }
  .apps-count { padding: 0 7px; border-radius: 999px; background: var(--orca-secondary); color: var(--orca-nav); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .provider-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 12px; }
  .provider-card { display: grid; grid-template-rows: auto 1fr auto; gap: 14px; min-width: 0; padding: 16px 18px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .provider-card.attention { border-color: color-mix(in srgb, var(--orca-warn) 28%, var(--orca-line)); }
  .provider-card > header { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .provider-logo { flex: none; width: 28px; height: 28px; object-fit: contain; }
  .provider-name { flex: 1 1 auto; min-width: 0; }
  .provider-name h3 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.35; }
  .provider-name span { color: var(--orca-muted); font-size: 13px; }
  .apps-status { display: inline-flex; align-items: center; gap: 4px; flex: none; padding: 2px 8px; border-radius: var(--orca-radius-sm); background: var(--orca-secondary); color: var(--orca-nav); font-size: 12px; font-weight: 500; white-space: nowrap; }
  .apps-status.ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .apps-status.warn { background: var(--orca-warn-bg); color: var(--orca-warn); }
  .connector-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .connector-list li { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 6px; border: 1px solid var(--orca-line); border-radius: 999px; color: var(--orca-muted); font-size: 12.5px; line-height: 1.5; }
  .connector-list li.ready { color: var(--orca-ink); }
  .connector-list li:not(.ready) { border-style: dashed; }
  .provider-card > footer { display: flex; align-items: center; min-height: 36px; padding-top: 12px; border-top: 1px solid var(--orca-line); }
  .provider-card > footer p { margin: 0; color: var(--orca-muted); font-size: 13px; line-height: 1.55; }
  .setup-panel { display: grid; gap: 16px; padding: 18px 20px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--orca-line); }
  .panel-head h3 { margin: 0; font-size: 15px; font-weight: 600; }
  .apps-icon-button { display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--orca-radius); background: transparent; color: var(--orca-subtle); cursor: pointer; }
  .apps-icon-button:hover:not(:disabled) { background: var(--orca-hover); color: var(--orca-ink); }
  .setup-steps { display: grid; gap: 8px; margin: 0; padding-left: 22px; list-style: decimal; font-size: 13.5px; line-height: 1.6; }
  .setup-steps li { display: list-item; padding-left: 2px; }
  .setup-steps li::marker { color: var(--orca-muted); font-weight: 600; }
  .console-link { justify-self: start; }
  .setup-field { display: grid; gap: 6px; min-width: 0; }
  .setup-field label, .field-label-row span { font-size: 13.5px; font-weight: 600; }
  .field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .field-label-row :global(.k-button) { flex: none; white-space: nowrap; }
  .setup-field input { width: 100%; min-width: 0; min-height: 36px; padding: 7px 11px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .setup-field input:focus-visible { outline: none; border-color: var(--orca-ink); box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1); }
  .setup-field input[readonly] { background: var(--orca-surface-2); color: var(--orca-muted); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 13px; }
  .field-action { display: flex; gap: 8px; min-width: 0; }
  .scope-list { display: grid; gap: 2px; margin: 0; padding: 10px 12px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius); background: var(--orca-surface-2); list-style: none; }
  .scope-list code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; line-height: 1.7; overflow-wrap: anywhere; }
  .credential-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; }
  .apps-hint { margin: -6px 0 0; color: var(--orca-muted); font-size: 13px; }
  .form-error { margin: 0; color: var(--orca-deny); font-size: 13.5px; }
  .panel-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--orca-line); }
  .app-list { overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .app-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 11px 18px; color: var(--orca-ink); text-decoration: none; }
  .app-row + .app-row { border-top: 1px solid #eff0f2; }
  .app-row:hover { background: var(--orca-surface-2); }
  .app-row:focus-visible { outline: 2px solid var(--orca-ink); outline-offset: -2px; }
  .app-name { min-width: 0; }
  .app-name strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.45; }
  .app-name span { display: block; overflow: hidden; color: var(--orca-muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .row-action { display: inline-flex; align-items: center; gap: 4px; color: var(--orca-nav); font-size: 13px; font-weight: 500; white-space: nowrap; }
  .ready-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 16px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface-2); color: var(--orca-ok); font-size: 13.5px; }
  .ready-note p { flex: 1 1 260px; margin: 0; color: var(--orca-ink); }
  .ready-note a { display: inline-flex; align-items: center; gap: 4px; color: var(--orca-ink); font-weight: 500; text-decoration: underline; text-underline-offset: 3px; }
  .apps-notice { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--orca-ok) 22%, transparent); border-radius: var(--orca-radius); background: var(--orca-ok-bg); color: var(--orca-ok); font-size: 13.5px; }
  .apps-muted { margin: 0; color: var(--orca-muted); font-size: 13.5px; }
  .apps-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-subtle); text-align: center; font-size: 13.5px; }
  .apps-empty h2 { margin: 4px 0 0; color: var(--orca-ink); font-size: 15px; font-weight: 600; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  @media (max-width: 600px) {
    .credential-fields { grid-template-columns: minmax(0, 1fr); }
    .setup-panel { padding: 16px; }
    .app-row { grid-template-columns: 28px minmax(0, 1fr) auto; row-gap: 6px; padding: 11px 14px; }
    .app-row .apps-status { grid-column: 2; grid-row: 2; justify-self: start; }
    .app-row .row-action { grid-column: 3; grid-row: 1 / span 2; }
  }
</style>
