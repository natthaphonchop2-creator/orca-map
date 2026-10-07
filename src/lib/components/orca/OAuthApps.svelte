<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ArrowRight, Check, CircleAlert, Copy, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { term } from "$lib/orca/glossary";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { platformHref } from "$lib/orca/navigation";
  import { oauthApps, type CustomOAuthApp, type ManagedOAuthApp, type OAuthAppProvider } from "$lib/orca/oauth-apps";
  import { oauthProviderSetup, type OAuthProviderSetup } from "$lib/orca/oauth-provider-setup";
  import { OrcaService, type OrcaBootstrap, type OrcaCandidate, type OrcaSourceSetup } from "$lib/services/orca";
  import SourceSetup from "./SourceSetup.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import Sheet from "./ui/Sheet.svelte";
  import StatusPill from "./ui/StatusPill.svelte";

  /** One app the owner is setting up, replacing or removing. */
  type AppTarget = {
    key: string;
    sourceID: string;
    name: string;
    provider?: OAuthAppProvider;
    /** A program's own app: the provider's guide, matched by its host (GitHub, Slack…), as on the program's setup page. */
    guide?: OAuthProviderSetup;
    replace: boolean;
    scopes: string[];
    scopeProfile?: OrcaSourceSetup["oauthScopeProfile"];
  };

  let { data }: { data: OrcaBootstrap } = $props();
  let candidates = $state<OrcaCandidate[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let error = $state("");
  let notice = $state("");
  let ownerCanManage = $state(false);
  let redirectURL = $state("");
  let editing = $state<AppTarget>();
  let removing = $state<AppTarget>();
  let clientID = $state("");
  let clientSecret = $state("");
  let busy = $state(false);
  let formError = $state("");
  let copied = $state("");
  // The setup form opens in a side panel; removing asks in a dialog. A program
  // with its own OAuth app opens its guided setup (SourceSetup) in the same
  // panel, so the ORCA team never leaves the platform area for it.
  let sheetOpen = $state(false);
  let checking = $state<{ id: string; name: string; endpointHost?: string }>();
  let checkBusy = $state(false);
  let removeOpen = $state(false);
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
  function vendorSteps(name: string) {
    return [
      t(`เปิดแอป OAuth ของ ${name} ที่ผู้ให้บริการ แล้วสร้าง Client secret ใหม่ หรือสร้างแอปใหม่`, `Open ${name}'s OAuth app with the provider, then create a new client secret or a new app.`),
      t("ตรวจว่า Callback URL ด้านล่างอยู่ในรายการ Redirect URI ของแอป", "Check that the callback URL below is one of the app's redirect URIs."),
      t("วาง Client ID และ Client secret ด้านล่าง", "Paste the Client ID and Client secret below."),
    ];
  }

  const providerTarget = (app: ManagedOAuthApp, replace: boolean): AppTarget => ({
    key: app.provider,
    sourceID: replace ? app.manageSourceID : (app.setupSourceID ?? app.manageSourceID),
    name: providerName(app.provider),
    provider: app.provider,
    replace,
    scopes: app.scopes,
  });
  // Slack apps keep ORCA's reviewed public-read scope set, as in the source setup page.
  const vendorTarget = (app: CustomOAuthApp): AppTarget => ({
    key: app.id,
    sourceID: app.id,
    name: app.name,
    guide: oauthProviderSetup(app.id, app.endpointHost ?? ""),
    replace: true,
    scopes: [],
    scopeProfile: app.endpointHost === "mcp.slack.com" ? "slack-public-read-v1" : undefined,
  });

  async function refresh() {
    const current = ++request;
    loading = true;
    error = "";
    try {
      const next = await OrcaService.candidates();
      if (!alive || current !== request) return;
      candidates = next;
      loaded = true;
      // Whether this viewer may manage apps, and the callback URL, are the same for every source.
      const probe = oauthApps(next).probeSourceID;
      if (probe) {
        try {
          const setup = await OrcaService.sourceSetup(probe);
          if (!alive || current !== request) return;
          ownerCanManage = setup.oauthClientCanConfigure === true;
          redirectURL = setup.oauthRedirectURL || redirectURL;
        } catch {
          if (alive && current === request) ownerCanManage = false;
        }
      }
    } catch {
      if (alive && current === request) error = t("โหลดสถานะแอปไม่สำเร็จ ลองอีกครั้ง", "The app status could not be loaded. Try again.");
    } finally {
      if (alive && current === request) loading = false;
    }
  }
  onMount(() => { if (data.canManage) void refresh(); });
  onDestroy(() => { alive = false; });

  function closeForm() {
    editing = undefined;
    clientID = "";
    clientSecret = "";
    formError = "";
  }

  async function openForm(target: AppTarget) {
    closeForm();
    checking = undefined;
    removing = undefined;
    notice = "";
    editing = target;
    sheetOpen = true;
    if (redirectURL) return;
    try {
      const setup = await OrcaService.sourceSetup(target.sourceID);
      if (alive && editing?.key === target.key) redirectURL = setup.oauthRedirectURL;
    } catch {
      if (alive && editing?.key === target.key) formError = t("โหลด Callback URL ไม่สำเร็จ ปิดแล้วเปิดใหม่", "The callback URL could not be loaded. Close this form and open it again.");
    }
  }

  /** A program's own app: its guided setup, where the ORCA team saves the app and tries it. */
  function openCheck(app: { id: string; name: string; endpointHost?: string }) {
    // Never while a save runs: its answer closes the sheet, and the guide's inputs with it (Codex release review 68).
    if (busy) return;
    closeForm();
    removing = undefined;
    notice = "";
    checking = { id: app.id, name: app.name, endpointHost: app.endpointHost };
    checkBusy = false;
    sheetOpen = true;
  }

  function sheetClosed() {
    const checked = !!checking;
    closeForm();
    checking = undefined;
    checkBusy = false;
    // Setting a program's app up there changes what the lists show.
    if (checked) void refresh();
  }

  function askRemove(target: AppTarget) {
    closeForm();
    notice = "";
    formError = "";
    removing = target;
    removeOpen = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const target = editing;
    if (busy || !target || !redirectURL) return;
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
      const response = await OrcaService.configureSourceOAuthClient(target.sourceID, id, secret, target.scopeProfile, target.replace);
      if (!response.oauthClientConfigured) throw new Error("not configured");
      if (!alive) return;
      sheetOpen = false;
      closeForm();
      notice = target.replace
        ? t(`เปลี่ยนแอป ${target.name} แล้ว ถ้าใช้ Client ID ใหม่ สมาชิกต้องเชื่อมบัญชีอีกครั้ง`, `The ${target.name} app was replaced. With a new Client ID, members connect their accounts again.`)
        : t(`ตั้งค่าแอป ${target.name} แล้ว สมาชิกเชื่อมบัญชีของตัวเองได้ทันที`, `The ${target.name} app is set up. Members can connect their own accounts now.`);
      await refresh();
    } catch {
      if (alive) formError = t("บันทึกแอปไม่สำเร็จ ตรวจว่าคุณอยู่ในทีม ORCA และค่าที่วางถูกต้อง แล้วลองอีกครั้ง", "The app could not be saved. Check that you are in the ORCA team and that the values are correct, then try again.");
    } finally {
      if (alive) busy = false;
    }
  }

  async function remove() {
    const target = removing;
    if (busy || !target) return;
    busy = true;
    formError = "";
    try {
      const response = await OrcaService.removeSourceOAuthClient(target.sourceID);
      if (response.oauthClientConfigured) throw new Error("still configured");
      if (!alive) return;
      removeOpen = false;
      removing = undefined;
      notice = t(`นำแอป ${target.name} ออกแล้ว`, `The ${target.name} app was removed.`);
      await refresh();
    } catch {
      if (alive) formError = t("นำแอปออกไม่สำเร็จ ตรวจว่าคุณอยู่ในทีม ORCA แล้วลองอีกครั้ง", "The app could not be removed. Check that you are in the ORCA team, then try again.");
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

<PageHeader title={term("programOAuthApps", t)} subtitle={t("ให้พนักงานเชื่อมบัญชีโปรแกรมของตัวเอง", "Let people connect their own program accounts.")}>
  {#snippet action()}{#if data.canManage}<button type="button" class="k-button" disabled={loading} onclick={refresh}><RefreshCw size={16} class={loading ? "k-spin" : ""} aria-hidden="true" />{t("โหลดใหม่", "Refresh")}</button>{/if}{/snippet}
</PageHeader>

<div class="oauth-apps">
  {#if !data.canManage}
    <div class="apps-empty"><ShieldCheck size={28} aria-hidden="true" /><h2>{t("หน้านี้สำหรับทีม ORCA เท่านั้น", "This page is for the ORCA team only")}</h2></div>
  {:else}
    {#if error}<div class="apps-callout deny" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{error}</span></div>{/if}
    {#if notice}<p class="apps-callout ok" role="status"><Check size={17} aria-hidden="true" /><span>{notice}</span></p>{/if}
    {#if loading && !loaded}
      <div class="apps-empty" role="status"><LoaderCircle size={24} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</div>
    {:else if loaded}
      <section class="apps-section" aria-labelledby="managed-apps-title">
        <div class="section-head">
          <h2 id="managed-apps-title">{t("ผู้ให้บริการที่ ORCA ดูแล", "Providers ORCA manages")}</h2>
          <p>{t("แอปเดียวใช้กับทุกโปรแกรมของผู้ให้บริการนั้น แต่ละคนเชื่อมบัญชีของตัวเอง และ ORCA ขอสิทธิ์อ่านข้อมูลเท่านั้น", "One app covers every program of that provider. Each person connects their own account, and ORCA asks only for read access.")}</p>
        </div>
        {#if apps.managed.length}
          <div class="provider-grid">
            {#each apps.managed as app (app.provider)}
              {@const readyCount = app.connectors.filter((connector) => connector.ready).length}
              <article class="provider-card" class:attention={!app.ready}>
                <header>
                  <span class="provider-logo" aria-hidden="true"><img src={providerLogo(app.provider)} alt="" width="26" height="26" /></span>
                  <div class="provider-name"><h3>{providerName(app.provider)}</h3><span>{t(`ใช้ร่วมกันกับ ${app.connectors.length} โปรแกรม`, `Shared by ${app.connectors.length} programs`)}</span></div>
                  <StatusPill label={app.ready ? t("พร้อมใช้", "Ready") : readyCount ? t("ตั้งค่ายังไม่ครบ", "Partly set up") : t("ต้องตั้งค่า", "Needs setup")} tone={app.ready ? "ok" : "warn"} dot />
                </header>
                <ul class="connector-list" aria-label={t(`โปรแกรมที่ใช้แอป ${providerName(app.provider)}`, `Programs using the ${providerName(app.provider)} app`)}>
                  {#each app.connectors as connector (connector.id)}
                    <li class:ready={connector.ready}><CatalogIcon name={connector.name} size={16} />{connector.name}<span class="visually-hidden">{connector.ready ? t("พร้อมใช้", "ready") : t("ยังไม่พร้อม", "not ready")}</span></li>
                  {/each}
                </ul>
                <footer>
                  {#if !app.ready && app.canConfigure}
                    <button class="k-button primary" aria-haspopup="dialog" onclick={() => openForm(providerTarget(app, false))}>{t(`ตั้งค่าแอป ${providerName(app.provider)}`, `Set up the ${providerName(app.provider)} app`)}</button>
                  {:else if app.ready}
                    <p>{t("พนักงานกด อนุญาต เพื่อเชื่อมบัญชีของตัวเองได้เลย", "People can connect their own accounts with one Allow.")}</p>
                    {#if ownerCanManage}
                      <div class="card-actions">
                        <button class="k-button small" aria-haspopup="dialog" onclick={() => openForm(providerTarget(app, true))}>{t("เปลี่ยนแอป", "Replace")}</button>
                        <button class="k-button small danger" aria-haspopup="dialog" onclick={() => askRemove(providerTarget(app, true))}>{t("นำแอปออก", "Remove")}</button>
                      </div>
                    {/if}
                  {:else}
                    <p>{t("ทีม ORCA เป็นผู้ตั้งค่าแอปนี้", "The ORCA team sets up this app.")}</p>
                  {/if}
                </footer>
              </article>
            {/each}
          </div>
        {:else}
          <p class="apps-muted">{t("ยังไม่มีผู้ให้บริการที่ ORCA ดูแล", "No ORCA-managed provider is installed.")}</p>
        {/if}
      </section>

      <section class="apps-section" aria-labelledby="custom-apps-title">
        <div class="section-head">
          <h2 id="custom-apps-title">{t("โปรแกรมที่ต้องใช้แอปของตัวเอง", "Programs that need their own app")}<span class="apps-count">{apps.custom.length}</span></h2>
          <p>{t("ผู้ให้บริการเหล่านี้ไม่รับการลงทะเบียนอัตโนมัติ สร้างแอป OAuth ที่ผู้ให้บริการก่อน แล้วนำ Client ID และ Client secret มาใส่ใน ORCA", "These providers don't accept automatic registration. Create an OAuth app with the provider first, then enter its Client ID and Client secret in ORCA.")}</p>
        </div>
        {#if apps.custom.length}
          <div class="app-list">
            {#each apps.custom as app (app.id)}
              <button type="button" class="app-row" aria-haspopup="dialog" onclick={() => openCheck(app)}>
                <CatalogIcon name={app.name} size={28} />
                <span class="app-name"><strong>{app.name}</strong>{#if app.endpointHost}<span>{app.endpointHost}</span>{/if}</span>
                <StatusPill label={t("ต้องตั้งค่าแอป", "Needs an app")} tone="warn" />
                <span class="row-action">{app.canConfigure ? t("ตั้งค่า", "Set up") : t("ดูวิธีตั้งค่า", "View setup")}<ArrowRight size={14} aria-hidden="true" /></span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="apps-muted">{t("ไม่มีโปรแกรมที่ต้องตั้งค่าแอปเพิ่ม", "No program needs its own app.")}</p>
        {/if}
      </section>

      {#if apps.configuredCustom.length}
        <section class="apps-section" aria-labelledby="configured-apps-title">
          <div class="section-head">
            <h2 id="configured-apps-title">{t("แอปของโปรแกรมอื่นที่ตั้งค่าแล้ว", "Other programs' apps you have set up")}<span class="apps-count">{apps.configuredCustom.length}</span></h2>
          </div>
          <div class="app-list">
            {#each apps.configuredCustom as app (app.id)}
              <div class="app-row">
                <CatalogIcon name={app.name} size={28} />
                <span class="app-name"><strong>{app.name}</strong>{#if app.endpointHost}<span>{app.endpointHost}</span>{/if}</span>
                <StatusPill label={t("ตั้งค่าแล้ว", "Set up")} tone="ok" />
                {#if ownerCanManage}
                  <span class="row-buttons">
                    <button class="k-button small" aria-haspopup="dialog" onclick={() => openForm(vendorTarget(app))}>{t("เปลี่ยน", "Replace")}</button>
                    <button class="k-button small danger" aria-haspopup="dialog" onclick={() => askRemove(vendorTarget(app))}>{t("นำออก", "Remove")}</button>
                  </span>
                {:else}<span></span>{/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <aside class="ready-note">
        <Check size={16} aria-hidden="true" />
        <p>{t(`อีก ${apps.readyToSignIn} โปรแกรมเชื่อมด้วย OAuth ได้ทันที ไม่ต้องตั้งค่าแอป`, `${apps.readyToSignIn} more programs connect with OAuth right away, with no app to set up.`)}</p>
        <a href={localeHref(platformHref("catalog"))}>{term("programCatalog", t)}<ArrowRight size={14} aria-hidden="true" /></a>
      </aside>
    {/if}
  {/if}
</div>

<Sheet
  bind:open={sheetOpen}
  title={editing ? (editing.replace ? t(`เปลี่ยนแอป ${editing.name}`, `Replace the ${editing.name} app`) : t(`ตั้งค่าแอป ${editing.name}`, `Set up the ${editing.name} app`)) : checking ? t(`ตั้งค่าแอปของ ${checking.name}`, `Set up ${checking.name}'s app`) : ""}
  description={checking
    ? t("วาง Client ID และ Client secret ของแอปที่สร้างไว้ แล้วลองเชื่อมด้วยบัญชีของคุณ", "Paste the app's Client ID and Client secret, then try connecting with your own account.")
    : t("ทำตามขั้นตอนที่ผู้ให้บริการ แล้ววาง Client ID และ Client secret", "Follow the steps with the provider, then paste the Client ID and Client secret.")}
  busy={busy || checkBusy}
  onclose={sheetClosed}
>
  {#if editing}
    {@const target = editing}
    <form id="oauth-setup-form" class="setup-panel" onsubmit={save} autocomplete="off">
      {#if target.replace}
        <p class="replace-note"><CircleAlert size={16} aria-hidden="true" />{t("ถ้าแค่เปลี่ยน Client secret ของแอปเดิม ทุกคนยังเชื่อมอยู่เหมือนเดิม ถ้าใช้ Client ID ใหม่ ทุกคนต้องเชื่อมบัญชีอีกครั้ง", "Rotating the secret of the same app keeps everyone connected. A new Client ID asks everyone to connect again.")}</p>
      {/if}
      <ol class="setup-steps">{#each target.provider ? providerSteps(target.provider) : target.guide ? target.guide.steps.map((step) => t(...step)) : vendorSteps(target.name) as step, index (step)}<li><span class="setup-step-number" aria-hidden="true">{index + 1}</span><span>{step}</span></li>{/each}</ol>
      {#if target.provider}
        <a class="k-button console-link" href={providerConsole(target.provider)} target="_blank" rel="noopener noreferrer">{target.provider === "google" ? t("เปิด Google Auth Platform", "Open Google Auth Platform") : t("เปิด Microsoft Entra", "Open Microsoft Entra")}<ExternalLink size={14} aria-hidden="true" /></a>
      {:else if target.guide}
        <!-- The guide's fixed official links (oauth-provider-setup.ts), never catalog data. -->
        <div class="guide-links">
          <a class="k-button console-link" href={target.guide.actionURL} target="_blank" rel="noopener noreferrer">{t(...target.guide.action)}<ExternalLink size={14} aria-hidden="true" /></a>
          <a class="guide-doc" href={target.guide.documentationURL} target="_blank" rel="noopener noreferrer">{t("คู่มือจากผู้ให้บริการ", "Provider documentation")}<ExternalLink size={13} aria-hidden="true" /></a>
        </div>
      {:else}
        <button type="button" class="k-button console-link" disabled={busy} onclick={() => openCheck({ id: target.sourceID, name: target.name })}>{t("ดูวิธีตั้งค่าแอปของโปรแกรมนี้", "View this program's app guide")}<ArrowRight size={14} aria-hidden="true" /></button>
      {/if}
      <div class="setup-field">
        <label for={`oauth-callback-${target.key}`}>Callback URL</label>
        <div class="field-action">
          <input id={`oauth-callback-${target.key}`} readonly value={redirectURL} placeholder={t("กำลังโหลด…", "Loading…")} />
          <button type="button" class="k-button apps-square" disabled={!redirectURL} onclick={() => copy(redirectURL, "callback")} aria-label={t("คัดลอก Callback URL", "Copy callback URL")} title={t("คัดลอก Callback URL", "Copy callback URL")}>{#if copied === "callback"}<Check size={16} />{:else}<Copy size={16} />{/if}</button>
        </div>
      </div>
      {#if target.scopes.length}
        <div class="setup-field">
          <div class="field-label-row">
            <span id={`oauth-scopes-${target.key}`}>{target.provider === "google" ? t("สิทธิ์ที่ต้องเพิ่ม (Scopes)", "Scopes to add") : t("สิทธิ์ Microsoft Graph แบบ Delegated", "Microsoft Graph delegated permissions")}</span>
            <button type="button" class="k-button small" onclick={() => copy(target.scopes.join("\n"), "scopes")}>{#if copied === "scopes"}<Check size={14} />{:else}<Copy size={14} />{/if}{t("คัดลอก", "Copy")}</button>
          </div>
          <ul class="scope-list" aria-labelledby={`oauth-scopes-${target.key}`}>{#each target.scopes as scope (scope)}<li><code>{scope}</code></li>{/each}</ul>
        </div>
      {/if}
      <div class="credential-fields">
        <div class="setup-field">
          <label for={`oauth-client-id-${target.key}`}>{target.provider === "microsoft" ? "Application (client) ID" : "Client ID"}</label>
          <input id={`oauth-client-id-${target.key}`} bind:value={clientID} required autocomplete="off" spellcheck="false" disabled={busy} />
        </div>
        <div class="setup-field">
          <label for={`oauth-client-secret-${target.key}`}>Client secret</label>
          <input id={`oauth-client-secret-${target.key}`} type="password" bind:value={clientSecret} required autocomplete="new-password" spellcheck="false" disabled={busy} />
        </div>
      </div>
      <p class="apps-hint">{t("ORCA เก็บ Client secret เป็นความลับและไม่แสดงค่านี้อีก", "ORCA keeps the client secret secret and never shows it again.")}</p>
      {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
    </form>
  {:else if checking}
    {#key checking.id}
      <SourceSetup operator sourceID={checking.id} sourceLabel={checking.name} endpointHost={checking.endpointHost} onstatechange={(state) => (checkBusy = state.busy)} />
    {/key}
  {/if}
  {#snippet footer()}
    {#if checking}
      <button type="button" class="k-button" disabled={checkBusy} onclick={() => (sheetOpen = false)}>{t("เสร็จแล้ว", "Done")}</button>
    {:else}
      <button type="button" class="k-button" disabled={busy} onclick={() => (sheetOpen = false)}>{t("ยกเลิก", "Cancel")}</button>
      <button type="submit" form="oauth-setup-form" class="k-button primary" disabled={busy || !redirectURL}>{#if busy}<LoaderCircle size={16} class="k-spin" />{/if}{editing?.replace ? t("เปลี่ยนแอป", "Replace app") : t("บันทึก", "Save")}</button>
    {/if}
  {/snippet}
</Sheet>

<ConfirmDialog
  bind:open={removeOpen}
  title={removing ? t(`นำแอป ${removing.name} ออกไหม`, `Remove the ${removing.name} app?`) : ""}
  message={removing?.provider
    ? t(`ทุกโปรแกรมของ ${removing.name} จะใช้งานไม่ได้ และทุกคนที่เชื่อมบัญชีไว้จะถูกตัดการเชื่อมต่อ จนกว่าจะตั้งค่าแอปใหม่`, `Every ${removing.name} program stops working and everyone's connection is removed until an app is set up again.`)
    : t("ทุกคนที่เชื่อมบัญชีผ่านแอปนี้จะถูกตัดการเชื่อมต่อ จนกว่าจะตั้งค่าแอปใหม่", "Everyone connected through this app is disconnected until an app is set up again.")}
  confirmLabel={t("นำแอปออก", "Remove app")}
  tone="danger"
  icon={Trash2}
  {busy}
  oncancel={() => { removing = undefined; formError = ""; }}
  onconfirm={remove}
>
  {#if formError && removing}<p class="form-error" role="alert">{formError}</p>{/if}
</ConfirmDialog>

<style>
	/* orca-type-remap v1 */
  .oauth-apps { display: grid; gap: 22px; min-width: 0; }
  .apps-square { width: 38px; padding: 0; flex: none; justify-content: center; }
  .apps-section { display: grid; gap: 12px; min-width: 0; }
  .section-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 650; }
  .section-head p { max-width: 760px; margin: 4px 0 0; color: var(--orca-muted); font-size: 13.5px; line-height: 1.6; }
  .apps-count { padding: 0 8px; border-radius: 999px; background: var(--orca-secondary); color: var(--orca-text-2); font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .apps-callout { display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 12px 16px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); font-size: 13.5px; line-height: 1.6; }
  .apps-callout :global(svg) { flex: none; margin-top: 2px; }
  .apps-callout.ok { border-color: var(--orca-ok-line); background: var(--orca-ok-bg); color: var(--orca-ok); }
  .apps-callout.deny { border-color: var(--orca-deny-line); background: var(--orca-deny-bg); color: var(--orca-deny); }
  .provider-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 14px; }
  .provider-card { display: grid; grid-template-rows: auto 1fr auto; gap: 14px; min-width: 0; padding: 18px 20px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent); }
  .provider-card.attention { border-color: var(--orca-warn-line); }
  .provider-card > header { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .provider-logo { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border: 1px solid var(--orca-line); border-radius: 10px; background: var(--orca-logo-tile); }
  .provider-logo img { width: 24px; height: 24px; object-fit: contain; }
  .provider-name { flex: 1 1 auto; min-width: 0; }
  .provider-name h3 { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.35; }
  .provider-name span { color: var(--orca-muted); font-size: 12.5px; }
  .connector-list { display: flex; flex-wrap: wrap; align-content: flex-start; align-items: center; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .connector-list li { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 6px; border: 1px solid var(--orca-line); border-radius: 999px; color: var(--orca-muted); font-size: 12px; line-height: 1.5; }
  .connector-list li.ready { color: var(--orca-ink); }
  .connector-list li:not(.ready) { border-style: dashed; }
  .provider-card > footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 36px; padding-top: 12px; border-top: 1px solid var(--orca-line-soft); }
  .provider-card > footer p { margin: 0; color: var(--orca-muted); font-size: 12.5px; line-height: 1.55; }
  .card-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  .setup-panel { display: grid; gap: 16px; }
  .setup-steps { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; font-size: 13.5px; line-height: 1.6; }
  .setup-steps li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; }
  .setup-step-number { display: grid; place-items: center; width: 24px; height: 24px; border: 1.5px solid var(--orca-ink); border-radius: 50%; color: var(--orca-ink); font-size: 11.5px; font-weight: 700; }
  .console-link { justify-self: start; gap: 6px; text-decoration: none; }
  .guide-links { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .guide-doc { display: inline-flex; align-items: center; gap: 5px; color: var(--orca-ink); font-size: 13px; font-weight: 600; text-decoration: underline; text-decoration-color: var(--orca-line-strong); text-underline-offset: 3px; }
  .setup-field { display: grid; gap: 6px; min-width: 0; }
  .setup-field label, .field-label-row span { font-size: 13.5px; font-weight: 600; }
  .field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .field-label-row :global(.k-button) { flex: none; white-space: nowrap; }
  .setup-field input { width: 100%; min-width: 0; min-height: 40px; padding: 8px 12px; border: 1px solid var(--orca-field-line); border-radius: var(--orca-radius); background: var(--orca-field); color: var(--orca-ink); font: inherit; font-size: 13.5px; }
  .setup-field input:focus-visible { outline: none; border-color: var(--orca-focus, var(--orca-ink)); box-shadow: 0 0 0 3px var(--orca-focus-halo, rgba(21, 24, 35, 0.1)); }
  .setup-field input[readonly] { background: var(--orca-surface-2); color: var(--orca-text-2); font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .field-action { display: flex; gap: 8px; min-width: 0; }
  .scope-list { display: grid; gap: 2px; margin: 0; padding: 10px 12px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius); background: var(--orca-surface-2); list-style: none; }
  .scope-list code { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
  .credential-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .apps-hint { margin: -6px 0 0; color: var(--orca-muted); font-size: 12.5px; }
  .form-error { margin: 0; padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny); font-size: 13px; }
  :global(.orca-confirm) .form-error { margin-top: 12px; }
  .app-list { overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .app-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 12px 18px; color: var(--orca-ink); text-decoration: none; }
  .app-row + .app-row { border-top: 1px solid var(--orca-line-soft); }
  button.app-row { width: 100%; border: 0; border-radius: 0; background: transparent; font: inherit; text-align: left; cursor: pointer; }
  button.app-row:hover { background: var(--orca-hover); }
  .app-row:focus-visible { outline: 2px solid var(--orca-focus, var(--orca-ink)); outline-offset: -2px; }
  .app-name { min-width: 0; }
  .app-name strong { display: block; font-size: 13.5px; font-weight: 600; line-height: 1.45; }
  .app-name span { display: block; overflow: hidden; color: var(--orca-muted); font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
  .row-action { display: inline-flex; align-items: center; gap: 4px; color: var(--orca-text-2); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .row-buttons { display: inline-flex; gap: 6px; }
  .ready-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 16px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface-2); color: var(--orca-ok); font-size: 13.5px; }
  .ready-note p { flex: 1 1 260px; margin: 0; color: var(--orca-ink); }
  .ready-note a { display: inline-flex; align-items: center; gap: 4px; color: var(--orca-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .apps-muted { margin: 0; color: var(--orca-muted); font-size: 13.5px; }
  .apps-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-subtle); text-align: center; font-size: 13.5px; }
  .apps-empty h2 { margin: 4px 0 0; color: var(--orca-ink); font-size: 14px; font-weight: 600; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .replace-note { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border: 1px solid var(--orca-warn-line); border-radius: var(--orca-radius); background: var(--orca-warn-bg); color: var(--orca-warn); font-size: 13px; line-height: 1.55; }
  .replace-note :global(svg) { flex: none; margin-top: 2px; }
  /* Under 720px a row stacks: name first, then its state and action. */
  @media (max-width: 720px) {
    .app-row { grid-template-columns: 28px minmax(0, 1fr); row-gap: 8px; padding: 12px 14px; }
    .app-row :global(.orca-pill), .app-row .row-action, .app-row .row-buttons { grid-column: 2; justify-self: start; }
    .app-name span { white-space: normal; overflow-wrap: anywhere; }
    .provider-card { padding: 16px; }
    .card-actions { margin-left: 0; }
  }
</style>
