<script lang="ts">
  import { oauthProviderSetup } from "$lib/orca/oauth-provider-setup";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { apiConnectorSetup, apiConnectorError } from "$lib/orca/api-connector-setup";
  import { catalogSourceDisplayName, catalogSourceProvider } from "$lib/orca/catalog";
  import { providerGuide } from "$lib/orca/provider-guides";
  import { t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    orcaError,
    type OrcaSourceSetup,
  } from "$lib/services/orca";
  import {
    Check,
    ExternalLink,
    Info,
    KeyRound,
    Plug,
    RefreshCw,
    Unplug,
  } from "@lucide/svelte";
  import { onDestroy, untrack } from "svelte";

  let {
    sourceID = "",
    sourceLabel = "",
    endpointHost = "",
    managedProvider,
    canCreate = false,
    oncreated,
    onready,
    onstatechange,
  }: {
    sourceID?: string;
    sourceLabel?: string;
    endpointHost?: string;
    managedProvider?: OrcaSourceSetup["managedProvider"];
    canCreate?: boolean;
    oncreated?: (id: string) => Promise<void>;
    onready?: (sourceID: string) => Promise<void>;
    onstatechange?: (state: {
      sourceID: string;
      ready: boolean;
      busy: boolean;
    }) => void;
  } = $props();
  let setup = $state<OrcaSourceSetup>();
  let name = $state("");
  let endpoint = $state("");
  let authKind = $state<"none" | "bearer">("none");
  let values = $state<Record<string, string>>({});
  let loading = $state(false);
  let action = $state<
    "" | "create" | "configure" | "check" | "return" | "oauth" | "disconnect" | "client"
  >("");
  let error = $state("");
  let notice = $state("");
  let oauthURL = $state("");
  let oauthWindowOpened = $state(false);
  let reservedSignInWindow: Window | null = null;
  let connectionReady = $state(false);
  let oauthRequired = $state(false);
  let editing = $state(false);
  let sourceEndpoint = $state("");
  let clientFormOpen = $state(false);
  let clientID = $state("");
  let clientSecret = $state("");
  const needsOAuthClient = $derived(Boolean(setup?.oauthClientRequired && !setup.oauthClientConfigured));
  const providerSetup = $derived(oauthProviderSetup(sourceID, setup?.endpointHost || endpointHost, setup ? setup.managedProvider : managedProvider));
  const providerReviewRequired = $derived(Boolean(
    (setup?.setupStatus === "review_required" && !setup.configured) ||
    (providerSetup?.vendorConfirmationRequired && needsOAuthClient)
  ));
  const appSetupRequired = $derived(needsOAuthClient || providerReviewRequired);
  const canConfigureClient = $derived(Boolean(setup?.oauthClientCanConfigure) && !providerReviewRequired);
  const slackAppURL = $derived(slackAppSetupURL());
  let generation = 0;
  let active = true;
  const fields = $derived(setup?.fields ?? []);
  const apiGuide = $derived(apiConnectorSetup(sourceID));
  const configured = $derived(Boolean(setup?.configured));
  const requiresURL = $derived(Boolean(setup?.requiresURL));
  const directSignIn = $derived(
    Boolean(setup && !requiresURL && !fields.some((field) => field.required)),
  );
  const providerHost = $derived(setup?.endpointHost || endpointHost);
  const guide = $derived(providerGuide(providerHost));
  const providerMetadata = $derived({
    endpointHost: providerHost,
    managedProvider: setup ? setup.managedProvider : managedProvider,
  });
  const providerIdentity = $derived(catalogSourceProvider(providerMetadata));
  const providerKind = $derived(providerIdentity?.provider);
  const providerName = $derived(
    catalogSourceDisplayName({
      name:
        sourceLabel.trim() ||
        setup?.name.trim() ||
        t("ระบบนี้", "this system"),
      ...providerMetadata,
    }),
  );
  const busy = $derived(loading || action !== "");
  const signInAvailable = $derived(
    Boolean(
      setup?.oauthSupported &&
      (directSignIn ||
        (!fields.length && !requiresURL) ||
        setup.oauthConnected ||
        oauthRequired ||
        oauthURL),
    ),
  );
  const primaryState = $derived(
    appSetupRequired
      ? "unavailable"
      : editing || (!configured && !directSignIn)
        ? "configure"
        : connectionReady
          ? "ready"
          : oauthURL
            ? "pending"
            : signInAvailable && setup?.oauthConnected && oauthRequired
              ? "reconnect"
              : signInAvailable && !setup?.oauthConnected
                ? "connect"
                : "check",
  );
  type RequestContext = {
    generation: number;
    sourceID: string;
    canCreate: boolean;
  };

  function requestContext(id = sourceID, manager = canCreate): RequestContext {
    return { generation: ++generation, sourceID: id, canCreate: manager };
  }
  function isCurrent(request: RequestContext) {
    return (
      active &&
      request.generation === generation &&
      request.sourceID === sourceID &&
      request.canCreate === canCreate
    );
  }
  function connectionError(cause: unknown) {
    const message = orcaError(cause);
    const translated = apiGuide ? apiConnectorError(message) : undefined;
    return translated ? t(...translated) : message;
  }
  function clearClientFields() {
    clientID = "";
    clientSecret = "";
    clientFormOpen = false;
  }
  function clearFields() {
    clearClientFields();
    values = {};
    sourceEndpoint = "";
  }
  function clearConnection() {
    connectionReady = false;
    oauthRequired = false;
    oauthURL = "";
    oauthWindowOpened = false;
    error = "";
    notice = "";
  }
  function validEndpoint(raw: string) {
    try {
      const url = new URL(raw);
      return (
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }
  function safeOAuthURL(raw: string) {
    try {
      const url = new URL(raw);
      if (
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
        !url.username &&
        !url.password
      )
        return url.href;
    } catch {
      // Invalid upstream URLs must never become clickable sign-in links.
    }
    throw new Error(
      t(
        "ลิงก์ลงชื่อเข้าใช้ที่ได้รับจากระบบไม่ถูกต้อง กรุณาติดต่อทีม ORCA",
        "The system returned an invalid sign-in link. Contact the ORCA team.",
      ),
    );
  }
  async function load(id = sourceID, manager = canCreate) {
    closeReservedWindow();
    const request = requestContext(id, manager);
    loading = true;
    action = "";
    clearConnection();
    clearFields();
    name = "";
    endpoint = "";
    authKind = "none";
    setup = undefined;
    editing = false;
    if (!id) {
      loading = false;
      return;
    }
    try {
      const response = await OrcaService.sourceSetup(id);
      if (isCurrent(request)) {
        setup = response;
        clientFormOpen = response.sourceID === request.sourceID && needsOAuthClient && canConfigureClient;
      }
    } catch (cause) {
      if (isCurrent(request)) error = connectionError(cause);
    } finally {
      if (isCurrent(request)) loading = false;
    }
  }
  $effect(() => {
    const id = sourceID;
    const manager = canCreate;
    untrack(() => {
      void load(id, manager);
    });
  });
  $effect(() => {
    const state = {
      sourceID,
      ready: Boolean(setup?.sourceID === sourceID && connectionReady),
      busy,
    };
    untrack(() => {
      if (active) onstatechange?.(state);
    });
  });
  $effect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;
    const handleReturn = () => {
      if (document.visibilityState === "visible") void checkOAuthReturn();
    };
    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);
    return () => {
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  });
  $effect(() => {
    // Embedded browser tabs may not emit focus/visibility events on OAuth
    // return. A pending sign-in also needs a retry if that event arrived
    // before the provider's grant was saved. Poll metadata, not OAuth start.
    const pendingURL = oauthURL;
    const id = sourceID;
    const manager = canCreate;
    if (
      !pendingURL ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    )
      return;
    const timer = window.setInterval(() => {
      if (
        sourceID === id &&
        canCreate === manager &&
        document.visibilityState === "visible"
      )
        void checkOAuthReturn();
    }, 3000);
    return () => window.clearInterval(timer);
  });
  onDestroy(() => {
    active = false;
    closeReservedWindow();
    generation += 1;
    onstatechange?.({ sourceID, ready: false, busy: false });
    clearFields();
    clearConnection();
    name = "";
    endpoint = "";
  });
  async function createSource() {
    if (busy || !canCreate || sourceID) return;
    if (!name.trim() || !validEndpoint(endpoint.trim())) {
      error = t(
        "กรุณากรอกชื่อระบบและ URL ที่ขึ้นต้นด้วย HTTPS โดยไม่ระบุรหัสผ่านหรือพารามิเตอร์ใน URL",
        "Enter a system name and an HTTPS URL without credentials or query parameters.",
      );
      return;
    }
    const request = requestContext();
    action = "create";
    clearConnection();
    try {
      const created = await OrcaService.createRemoteEntry({
        name: name.trim(),
        shortDescription: t("ระบบที่องค์กรเพิ่มเอง", "System added by your organization"),
        runtime: "remote",
        serverUserType: "singleUser",
        remoteConfig: {
          fixedURL: endpoint.trim(),
          ...(authKind === "bearer"
            ? {
                headers: [
                  {
                    key: "Authorization",
                    name: "Access token",
                    description: "Personal upstream access token",
                    required: true,
                    sensitive: true,
                    value: "",
                    prefix: "Bearer ",
                  },
                ],
              }
            : {}),
        },
      });
      if (!isCurrent(request)) return;
      name = "";
      endpoint = "";
      authKind = "none";
      clearFields();
      await oncreated?.(created.id);
      if (!isCurrent(request)) return;
      notice = t(
        "เพิ่มระบบแล้ว ขั้นตอนถัดไปคือตั้งค่าบัญชีเพื่อเชื่อมต่อ",
        "System added. Next, set up your account to connect.",
      );
    } catch (cause) {
      if (isCurrent(request)) error = connectionError(cause);
    } finally {
      if (isCurrent(request)) action = "";
    }
  }
  async function checkConnection(
    request: RequestContext,
    metadata?: OrcaSourceSetup,
  ) {
    const result = await OrcaService.checkSource(request.sourceID);
    if (!isCurrent(request)) return;
    const latest =
      metadata ?? (await OrcaService.sourceSetup(request.sourceID));
    if (!isCurrent(request)) return;
    setup = latest;
    oauthRequired = result.oauthRequired;
    if (result.ready && !result.oauthRequired) {
      await onready?.(request.sourceID);
      if (!isCurrent(request)) return;
      connectionReady = true;
      oauthURL = "";
      notice = "";
    } else if (!oauthRequired) {
      if (apiGuide) editing = true;
      error = t(
        "ยังเชื่อมต่อไม่ได้ กรุณาตรวจสอบการตั้งค่าบัญชีแล้วลองอีกครั้ง",
        "The connection is not ready. Check the account settings and try again.",
      );
    }
  }
  // Reserve a window during the click so asynchronous setup cannot trigger a
  // popup blocker. Provider pages never receive access to the ORCA opener.
  function reserveSignInWindow() {
    closeReservedWindow();
    if (
      typeof window === "undefined" ||
      !setup?.oauthSupported ||
      setup.oauthConnected ||
      Object.entries(values).some(
        ([key, value]) => key.toLowerCase() === "authorization" && value.trim(),
      ) ||
      fields.some(
        (field) =>
          field.key.toLowerCase() === "authorization" && field.required,
      )
    )
      return null;
    try {
      const popup = window.open("about:blank", "_blank");
      if (!popup) return null;
      reservedSignInWindow = popup;
      popup.opener = null;
      popup.document.title = t("กำลังเชื่อมต่อ · ORCA", "Connecting · ORCA");
      popup.document.body.textContent = t(
        `กำลังเชื่อมต่อ ${providerName}… หน้าอนุญาตสิทธิ์จะเปิดในหน้าต่างนี้เมื่อพร้อม`,
        `Connecting to ${providerName}… The permission page will open in this window when it is ready.`,
      );
      return popup;
    } catch {
      closeReservedWindow();
      return null;
    }
  }
  function closeReservedWindow(popup = reservedSignInWindow) {
    if (!popup || popup !== reservedSignInWindow) return;
    try {
      popup.close();
    } catch {
      /* The user may already have closed it. */
    }
    reservedSignInWindow = null;
  }
  async function connectAccount(
    request: RequestContext,
    popup: Window | null,
    usingToken = false,
  ) {
    await checkConnection(request);
    if (
      !isCurrent(request) ||
      connectionReady ||
      !oauthRequired ||
      setup?.oauthConnected
    )
      return;
    if (
      usingToken ||
      fields.some(
        (field) =>
          field.key.toLowerCase() === "authorization" && field.required,
      )
    ) {
      editing = true;
      error = t(
        "ระบบยังไม่ยอมรับโทเคนนี้ กรุณาตรวจสอบโทเคนและสิทธิ์ของบัญชี",
        "The system did not accept this token. Check the token and the account permissions.",
      );
      return;
    }
    if (!setup?.oauthSupported || appSetupRequired) return;
    const result = await OrcaService.startSourceOAuth(request.sourceID);
    if (!isCurrent(request)) return;
    if (!result.oauthURL) {
      await checkConnection(request);
      return;
    }
    oauthURL = safeOAuthURL(result.oauthURL);
    oauthRequired = true;
    if (popup && popup === reservedSignInWindow && !popup.closed) {
      try {
        popup.location.replace(oauthURL);
        reservedSignInWindow = null;
        oauthWindowOpened = true;
      } catch {
        /* Keep the validated link available when navigation is blocked. */
      }
    }
  }
  async function configure() {
    if (busy || !setup || setup.sourceID !== sourceID || appSetupRequired)
      return;
    if (requiresURL && !validEndpoint(sourceEndpoint.trim())) {
      error = t(
        "กรุณากรอก URL ของบัญชีที่ต้องการเชื่อมต่อ ซึ่งขึ้นต้นด้วย HTTPS โดยไม่ระบุรหัสผ่านหรือข้อมูลลับใน URL",
        "Enter the account’s HTTPS URL without passwords or secrets in the URL.",
      );
      return;
    }
    const popup = reserveSignInWindow();
    const usingToken = Boolean(
      Object.entries(values).some(
        ([key, value]) => key.toLowerCase() === "authorization" && value.trim(),
      ),
    );
    const request = requestContext();
    action = "configure";
    clearConnection();
    try {
      const result = await OrcaService.configureSource(
        request.sourceID,
        values,
        requiresURL ? sourceEndpoint.trim() : undefined,
      );
      if (!isCurrent(request)) return;
      setup = result;
      clearFields();
      editing = false;
      await connectAccount(request, popup, usingToken);
    } catch (cause) {
      if (isCurrent(request)) {
        error = connectionError(cause);
        if (apiGuide) editing = true;
      }
    } finally {
      closeReservedWindow(popup);
      if (isCurrent(request)) {
        action = "";
        clearFields();
      }
    }
  }
  async function verify() {
    if (
      busy ||
      !setup ||
      setup.sourceID !== sourceID ||
      (!configured && !directSignIn) ||
      editing ||
      appSetupRequired
    )
      return;
    const popup = reserveSignInWindow();
    const request = requestContext();
    action = "check";
    clearConnection();
    try {
      if (!configured) {
        const prepared = await OrcaService.configureSource(
          request.sourceID,
          {},
        );
        if (!isCurrent(request)) return;
        setup = prepared;
      }
      await connectAccount(request, popup);
    } catch (cause) {
      if (isCurrent(request)) {
        error = connectionError(cause);
        if (apiGuide) editing = true;
      }
    } finally {
      closeReservedWindow(popup);
      if (isCurrent(request)) action = "";
    }
  }
  async function checkOAuthReturn() {
    if (
      !active ||
      busy ||
      !oauthURL ||
      !setup?.oauthSupported ||
      setup.sourceID !== sourceID ||
      editing ||
      appSetupRequired
    )
      return;
    const request = requestContext();
    action = "return";
    connectionReady = false;
    error = "";
    notice = "";
    try {
      const latest = await OrcaService.sourceSetup(request.sourceID);
      if (!isCurrent(request)) return;
      setup = latest;
      if (
        !latest.oauthConnected ||
        !latest.configured ||
        !latest.oauthSupported ||
        appSetupRequired
      )
        return;
      oauthURL = "";
      oauthRequired = false;
      await checkConnection(request, latest);
    } catch (cause) {
      if (isCurrent(request)) error = connectionError(cause);
    } finally {
      if (isCurrent(request)) action = "";
    }
  }
  function slackAppSetupURL() {
    if (
      (setup?.endpointHost || endpointHost) !== 'mcp.slack.com' ||
      !setup?.oauthRedirectURL ||
      !validEndpoint(setup.oauthRedirectURL)
    )
      return '';
    const manifest = {
      display_information: { name: 'ORCA', description: 'Connect your Slack workspace to ORCA' },
      oauth_config: {
        redirect_urls: [setup.oauthRedirectURL],
        pkce_enabled: true,
        scopes: {
          user: [
            'search:read.public',
            'channels:history',
            'channels:read',
            'users:read',
            'emoji:read'
          ]
        }
      },
      settings: {
        is_mcp_enabled: true,
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false
      }
    };
    return (
      'https://api.slack.com/apps?new_app=1&manifest_json=' +
      encodeURIComponent(JSON.stringify(manifest))
    );
  }
  async function configureOAuthClient() {
    if (busy || !setup || setup.sourceID !== sourceID || !appSetupRequired || !canConfigureClient)
      return;
    if (!clientID.trim() || !clientSecret.trim()) return;
    const request = requestContext();
    const id = clientID.trim();
    const secret = clientSecret.trim();
    clearClientFields();
    action = 'client';
    error = '';
    notice = '';
    try {
      const scopeProfile = setup.endpointHost === 'mcp.slack.com' ? 'slack-public-read-v1' : undefined;
      const response = await OrcaService.configureSourceOAuthClient(request.sourceID, id, secret, scopeProfile);
      if (!isCurrent(request)) return;
      if (scopeProfile && response.oauthScopeProfile !== scopeProfile) throw new Error('scope profile not confirmed');
      setup = response;
      if (!response.oauthClientConfigured) throw new Error('not configured');
      notice = t(
        'ตั้งค่าแอปแล้ว ขั้นตอนถัดไปคือเชื่อมบัญชีเพื่ออนุญาตการเข้าถึง',
        'App configured. Next, connect your account to authorize access.'
      );
    } catch {
      if (isCurrent(request)) {
        clientFormOpen = true;
        error = t(
          'บันทึกแอปไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ผู้ดูแลระบบและโหลดสถานะล่าสุด แล้วลองอีกครั้ง',
          'The app could not be saved. Check your administrator access, reload the status, and try again.'
        );
      }
    } finally {
      if (isCurrent(request)) action = '';
    }
  }
  async function startOAuth() {
    if (
      busy ||
      !setup?.oauthSupported ||
      setup.oauthConnected ||
      setup.sourceID !== sourceID ||
      (!configured && !directSignIn) ||
      editing ||
      appSetupRequired
    )
      return;
    const popup = reserveSignInWindow();
    const request = requestContext();
    action = "oauth";
    clearConnection();
    clearFields();
    try {
      if (!configured) {
        const prepared = await OrcaService.configureSource(
          request.sourceID,
          {},
        );
        if (!isCurrent(request)) return;
        setup = prepared;
        if (
          !prepared.configured ||
          !prepared.oauthSupported ||
          appSetupRequired
        ) {
          error = t(
            `ยังเชื่อมต่อ ${providerName} ไม่ได้ กรุณาโหลดสถานะอีกครั้ง หรือติดต่อทีม ORCA`,
            `${providerName} is not ready to connect. Reload the status or contact the ORCA team.`,
          );
          return;
        }
      }
      await connectAccount(request, popup);
    } catch (cause) {
      if (isCurrent(request)) error = connectionError(cause);
    } finally {
      closeReservedWindow(popup);
      if (isCurrent(request)) action = "";
    }
  }
  async function disconnectOAuth() {
    if (
      busy ||
      !setup?.oauthSupported ||
      setup.sourceID !== sourceID ||
      (!setup.oauthConnected && !oauthURL)
    )
      return;
    const signInRequired = oauthRequired;
    const request = requestContext();
    action = "disconnect";
    clearConnection();
    clearFields();
    try {
      const result = await OrcaService.disconnectSourceOAuth(request.sourceID);
      if (!isCurrent(request)) return;
      if (!result.disconnected)
        throw new Error(
          t(
            "ยกเลิกการเชื่อมบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง",
            "The account could not be disconnected. Try again.",
          ),
        );
      if (setup) setup = { ...setup, oauthConnected: false };
      notice = t(
        `ยกเลิกการเชื่อมบัญชี ${providerName} ใน ORCA แล้ว หากต้องการเพิกถอนสิทธิ์ที่เคยอนุญาต ให้ดำเนินการในการตั้งค่าของผู้ให้บริการ`,
        `Your ${providerName} account has been disconnected from ORCA. To revoke the permission you granted, use the provider’s settings.`,
      );
    } catch (cause) {
      if (isCurrent(request)) {
        oauthRequired = signInRequired;
        error = connectionError(cause);
      }
    } finally {
      if (isCurrent(request)) action = "";
    }
  }
  function editConfiguration(value: boolean) {
    if (busy) return;
    generation += 1;
    clearConnection();
    clearFields();
    editing = value;
  }
</script>

{#snippet oauthAppHelp()}
  {#if providerSetup}
    <details class="client-provider-help">
      <summary>{t('วิธีตั้งค่าแอป', 'App setup instructions')}</summary>
      <p><strong>{t('ประเภทแอป', 'App type')}:</strong> {providerSetup.appType}</p>
      <ol>{#each providerSetup.steps as step}<li>{t(...step)}</li>{/each}</ol>
      <a href={providerSetup.documentationURL} target="_blank" rel="noopener noreferrer"
        >{t('คู่มือจากผู้ให้บริการ', 'Provider documentation')} <ExternalLink size={14} aria-hidden="true" /></a>
      {#if slackAppURL}<a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer"
        >{t('เปิดหน้าตั้งค่าแอป Slack ที่มีอยู่', 'Open existing Slack app settings')}</a>{/if}
    </details>
  {/if}
{/snippet}


<section class="k-panel source-setup">
  <div class="k-section-title">
    <div class="source-heading">
      {#if sourceID}<span class="source-logo"><CatalogIcon name={providerName} size={24} /></span>{/if}
      <h3>
        {sourceID
          ? t(`เชื่อมต่อ ${providerName}`, `Connect ${providerName}`)
          : t("เพิ่มระบบด้วย MCP URL", "Add a system with an MCP URL")}
      </h3>
    </div>
    {#if !sourceID}<Plug size={18} aria-hidden="true" />{/if}
  </div>
  {#if apiGuide && !connectionReady}
    <div class="api-onboarding">
      {#if !onready}<ol aria-label={t("ขั้นตอนเชื่อมบัญชี", "Account connection steps")}>
        <li class:current={!configured || editing}>{t("กรอกข้อมูลบัญชี", "Enter account details")}</li>
        <li class:current={configured && !editing}>{t("ทดสอบบัญชี", "Test the account")}</li>
        <li>{t("เลือกเครื่องมือที่อนุญาต", "Choose allowed tools")}</li>
      </ol>{/if}
    </div>
  {/if}
  {#if error}<div class="k-banner error source-banner" role="alert">
      <Info size={16} aria-hidden="true" />
      <p>{error}</p>
    </div>{/if}
  {#if notice && !connectionReady}<div class="k-banner success source-banner" role="status">
      <Check size={16} aria-hidden="true" />{notice}
    </div>{/if}
  {#if !sourceID && canCreate}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void createSource();
      }}
    >
      <fieldset disabled={busy}>
        <div class="k-grid-2">
          <div class="k-field">
            <label for="remote-source-name"
              >{t("ชื่อระบบ", "System name")}</label
            ><input
              id="remote-source-name"
              bind:value={name}
              maxlength="100"
              required
            />
          </div>
          <div class="k-field">
            <label for="remote-source-endpoint"
              >{t("URL ของระบบที่รองรับ Remote MCP", "Remote MCP URL")}</label
            ><input
              id="remote-source-endpoint"
              type="url"
              bind:value={endpoint}
              placeholder="https://service.example/mcp"
              required
              autocomplete="off"
            />
          </div>
        </div>
        <div class="k-field">
          <label for="remote-source-auth"
            >{t(
              "วิธียืนยันตัวตนกับระบบ",
              "Authentication method",
            )}</label
          ><select id="remote-source-auth" bind:value={authKind}
            ><option value="none">{t("ไม่ใช้โทเคน", "No access token")}</option
            ><option value="bearer"
              >{t(
                "โทเคนส่วนตัว (Access token)",
                "Personal access token",
              )}</option
            ></select
          >
        </div>
        <button
          class="k-button primary"
          style="margin-top:16px"
          disabled={busy}
          type="submit"
          >{action === "create"
            ? t("กำลังเพิ่ม…", "Adding…")
            : t("เพิ่มระบบ", "Add a system")}</button
        >
      </fieldset>
    </form>
  {:else if loading}<p class="k-muted" role="status">
      {t("กำลังโหลดการตั้งค่า…", "Loading settings…")}
    </p>
  {:else if setup}
    {#if primaryState === "ready"}
      <div class="k-banner success source-banner" role="status">
        <Check size={16} aria-hidden="true" />
        <div>
          <strong
            >{t(
              `${providerName} ผ่านการตรวจสอบการเชื่อมต่อแล้ว`,
              `${providerName} passed the connection check`,
            )}</strong
          >
          <p>
            {apiGuide ? t(...apiGuide.result) : t(
              "ขั้นตอนถัดไปคือเลือกเครื่องมือที่อนุญาต",
              "Next, choose the allowed tools.",
            )}
          </p>
        </div>
      </div>
    {:else if primaryState === 'unavailable'}
      <div class="k-banner source-banner">
        <Info size={16} aria-hidden="true" />
        <div>
          <strong
            >{t(
              providerReviewRequired ? `${providerName} รอการยืนยันจากผู้ให้บริการ` : `${providerName} ต้องตั้งค่าแอปก่อนเชื่อมต่อ`,
              providerReviewRequired ? `${providerName} needs provider review` : `${providerName} needs app setup`
            )}</strong
          >
          <p>
            {providerReviewRequired
              ? t('ผู้ดูแลระบบของ ORCA ต้องยืนยันข้อกำหนดการเชื่อมต่อกับผู้ให้บริการก่อน','An ORCA administrator must first confirm the provider’s connection requirements.')
              : canConfigureClient
              ? t(
                  'ตั้งค่าแอปของ ORCA หนึ่งครั้ง เพื่อให้สมาชิกเชื่อมบัญชีของตนได้',
                  'Set up the ORCA app once so that members can connect their accounts.'
                )
              : t(
                  'ผู้ดูแลแพลตฟอร์ม ORCA ต้องตั้งค่าแอปก่อน จึงจะเชื่อมบัญชีได้',
                  'An ORCA platform administrator must set up the app before you can connect.'
                )}
          </p>
        </div>
      </div>
      <div class="client-actions">
        {#if providerReviewRequired && providerSetup}
          <a class="k-button" href={providerSetup.actionURL} target="_blank" rel="noopener noreferrer"
            >{t(...providerSetup.action)} <ExternalLink size={16} aria-hidden="true" /></a>
        {/if}
        {#if canConfigureClient && !clientFormOpen}
          <button class="k-button primary" disabled={busy} onclick={() => (clientFormOpen = true)}
            >{t('ตั้งค่าแอป', 'Set up app')}</button
          >
        {/if}
        <button class="k-button" disabled={busy} onclick={() => load()}
          >{t('ตรวจสอบสถานะอีกครั้ง', 'Refresh status')}</button
        >
      </div>
      {#if providerReviewRequired}{@render oauthAppHelp()}{/if}
      {#if canConfigureClient && clientFormOpen}
        <form
          class="client-setup"
          onsubmit={(event) => {
            event.preventDefault();
            void configureOAuthClient();
          }}
        >
          <fieldset disabled={busy}>
            {#if providerSetup}
              <a class="k-button" href={slackAppURL || providerSetup.actionURL} target="_blank" rel="noopener noreferrer"
                >{slackAppURL ? t('สร้างแอป Slack สำหรับ ORCA', 'Create ORCA Slack app') : t(...providerSetup.action)}
                <ExternalLink size={16} aria-hidden="true" /></a>
              {@render oauthAppHelp()}
            {/if}
            {#if setup.endpointHost === 'mcp.slack.com'}
              <div class="k-field">
                <label for="source-client-permissions">{t('สิทธิ์ที่ขอจาก Slack', 'Slack permissions')}</label>
                <input id="source-client-permissions" readonly value={t('ช่องสาธารณะ · อ่านข้อมูลเท่านั้น', 'Public channels · Read-only')} />
              </div>
            {/if}
            <div class="k-field">
              <label for="source-client-callback">{t('URL สำหรับเรียกกลับ (Callback URL)', 'Callback URL')}</label>
              <input id="source-client-callback" readonly value={setup.oauthRedirectURL} />
            </div>

            <div class="k-field">
              <label for="source-client-id">{t('รหัสไคลเอนต์ (Client ID)', 'Client ID')}</label>
              <input
                id="source-client-id"
                bind:value={clientID}
                required
                maxlength="8192"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <div class="k-field">
              <label for="source-client-secret">{t('รหัสลับไคลเอนต์ (Client Secret)', 'Client Secret')}</label>
              <input
                id="source-client-secret"
                type="password"
                bind:value={clientSecret}
                required
                maxlength="8192"
                autocomplete="new-password"
                spellcheck="false"
              />
            </div>
            <div class="client-actions">
              <button class="k-button primary" type="submit">{t('บันทึกแอป', 'Save app')}</button>
              <button class="k-button" type="button" onclick={clearClientFields}
                >{t('ยกเลิก', 'Cancel')}</button
              >
            </div>
          </fieldset>
        </form>
      {/if}
    {:else if primaryState === "configure"}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void configure();
        }}
        style="margin-top:18px"
      >
        <fieldset disabled={busy}>
          {#if requiresURL}<div class="k-field">
              <label for="personal-source-url"
                >{t(
                  "URL ของบัญชีที่ต้องการเชื่อมต่อ",
                  "Account URL",
                )}</label
              ><input
                id="personal-source-url"
                type="url"
                bind:value={sourceEndpoint}
                required
                autocomplete="off"
              />
            </div>{/if}
          {#each fields as field, index (field.key)}
            {@const fieldCopy = apiGuide?.fields[field.key]}
            <div class="k-field">
              <label for={`source-value-${index}`}
                >{fieldCopy ? t(...fieldCopy.label) : field.key === "READ_ONLY" &&
                (endpointHost === "mcp.supabase.com" ||
                  setup?.name === "Supabase")
                  ? t("สิทธิ์การทำงานใน Supabase", "Supabase access mode")
                  : field.name === "Access token"
                    ? t("โทเคนการเข้าถึง (Access token)", "Access token")
                    : field.name || field.key}{field.required
                  ? " *"
                  : ""}</label
              >
              {#if field.key === "READ_ONLY" && (endpointHost === "mcp.supabase.com" || setup?.name === "Supabase")}
                <select
                  id={`source-value-${index}`}
                  value={values[field.key] ?? ""}
                  required
                  onchange={(event) =>
                    (values = {
                      ...values,
                      [field.key]: event.currentTarget.value,
                    })}
                >
                  <option value="" disabled
                    >{t(
                      "เลือกรูปแบบการใช้งาน",
                      "Choose an access mode",
                    )}</option
                  >
                  <option value="false"
                    >{t(
                      "อ่านและดำเนินการตามสิทธิ์ของบัญชี",
                      "Read and act within the account’s permissions",
                    )}</option
                  >
                  <option value="true"
                    >{t("อ่านข้อมูลเท่านั้น", "Read-only")}</option
                  >
                </select>
              {:else}<input
                  id={`source-value-${index}`}
                  type={field.sensitive ? "password" : "text"}
                  value={values[field.key] ?? ""}
                  oninput={(event) =>
                    (values = {
                      ...values,
                      [field.key]: event.currentTarget.value,
                    })}
                  required={field.required}
                  autocomplete="off"
                  spellcheck="false"
                  inputmode={fieldCopy?.numeric ? "numeric" : undefined}
                  pattern={fieldCopy?.numeric ? "[0-9]+" : undefined}
                  aria-describedby={fieldCopy || field.description ? `source-help-${index}` : undefined}
                />{/if}
            </div>{/each}
          {#if editing}<p class="k-small k-muted" style="margin-top:12px">
              {t(
                "ข้อมูลใหม่จะแทนที่การตั้งค่าเดิม",
                "These values will replace the saved settings.",
              )}
            </p>{/if}
          <div class="k-actions" style="margin-top:16px">
            <button type="submit" class="k-button primary" disabled={busy}
              ><KeyRound size={16} aria-hidden="true" />{action === "configure"
                ? t("กำลังเชื่อมต่อ…", "Connecting…")
                : apiGuide
                  ? t("บันทึกและทดสอบบัญชี", "Save and test account")
                  : t("บันทึกและเชื่อมต่อ", "Save and connect")}</button
            >{#if editing}<button
                type="button"
                class="k-button"
                onclick={() => editConfiguration(false)}
                >{t("ยกเลิก", "Cancel")}</button
              >{/if}
          </div>
        </fieldset>
      </form>
    {:else}
      {#if primaryState === "pending" || primaryState === "reconnect"}<p class="k-muted" role="status">
        {primaryState === "pending"
          ? oauthWindowOpened
            ? t(
                "อนุญาตสิทธิ์ในหน้าต่างของผู้ให้บริการให้เสร็จสิ้น แล้วกลับมาที่หน้านี้เพื่อตรวจสอบการเชื่อมต่อ",
                "Complete the sign-in in the provider’s window, then return here to check the connection.",
              )
            : t(
                "หน้าอนุญาตสิทธิ์ไม่ได้เปิดขึ้น เลือกปุ่มด้านล่างเพื่อลงชื่อเข้าใช้",
                "The sign-in page did not open. Use the button below to sign in.",
              )
          : t(
                  "บัญชีนี้ต้องลงชื่อเข้าใช้ใหม่ กรุณายกเลิกการเชื่อมบัญชีเดิมก่อน",
                  "This account must sign in again. Disconnect the current account first.",
                )}
      </p>{/if}
      <div class="k-actions" style="margin-top:16px">
        {#if busy}
          <button class="k-button primary" disabled
            ><RefreshCw size={16} aria-hidden="true" />{action === "check" || action === "return"
              ? t("กำลังตรวจสอบการเชื่อมต่อ…", "Checking connection…")
              : action === "disconnect"
                ? t("กำลังยกเลิกการเชื่อมบัญชี…", "Disconnecting account…")
                : t("กำลังเตรียมการลงชื่อเข้าใช้…", "Preparing sign-in…")}</button
          >
        {:else if primaryState === "pending"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Validated external provider URL; it must not be resolved as an app route. -->
          <a
            class="k-button primary"
            href={oauthURL}
            target="_blank"
            rel="noopener noreferrer"
            >{oauthWindowOpened
              ? t("เปิดหน้าอนุญาตสิทธิ์อีกครั้ง", "Reopen the permission page")
              : t(
                  `เปิดหน้าอนุญาตสิทธิ์ของ ${providerName}`,
                  `Open the permission page for ${providerName}`,
                )}
            <ExternalLink size={16} aria-hidden="true" /></a
          >
        {:else if primaryState === "connect"}
          <button class="k-button primary" onclick={startOAuth}
            ><KeyRound size={16} aria-hidden="true" />{t(
              `เชื่อมต่อ ${providerName}`,
              `Connect ${providerName}`,
            )}</button
          >
        {:else if primaryState === "reconnect"}
          <button class="k-button primary" onclick={disconnectOAuth}
            ><Unplug size={16} aria-hidden="true" />{t(
              "ยกเลิกการเชื่อมบัญชีเพื่อลงชื่อเข้าใช้ใหม่",
              "Disconnect the account to sign in again",
            )}</button
          >
        {:else}
          <button class="k-button primary" onclick={verify}
            ><RefreshCw size={16} aria-hidden="true" />{t(
              onready ? "ตรวจสอบและดำเนินการต่อ" : "ตรวจสอบการเชื่อมต่อบัญชี",
              onready ? "Check and continue" : "Check the account connection",
            )}</button
          >
        {/if}
      </div>
    {/if}
    {#if !editing && (configured || oauthURL || setup.oauthConnected || fields.length) && (!appSetupRequired || setup.oauthConnected || oauthURL)}
      <details style="margin-top:16px">
        <summary class="k-small k-muted manage-toggle"
          >{t("จัดการการเชื่อมต่อ", "Manage connection")}</summary
        >
        <div class="k-actions" style="margin-top:12px">
          {#if configured && !appSetupRequired && (oauthURL || connectionReady)}
            <button class="k-button" disabled={busy} onclick={verify}
              ><RefreshCw size={16} aria-hidden="true" />{oauthURL
                ? t("ตรวจสอบหลังลงชื่อเข้าใช้", "Check after signing in")
                : t("ตรวจสอบอีกครั้ง", "Check again")}</button
            >
          {/if}
          {#if setup.oauthSupported && !appSetupRequired && !setup.oauthConnected && oauthURL}
            <button class="k-button quiet" disabled={busy} onclick={startOAuth}
              >{t("เริ่มลงชื่อเข้าใช้ใหม่", "Restart sign-in")}</button
            >
          {/if}
          {#if (requiresURL || fields.length) && !appSetupRequired}
            <button
              class="k-button quiet"
              disabled={busy}
              onclick={() => editConfiguration(true)}
              >{configured
                ? t("เปลี่ยนการตั้งค่าบัญชี", "Change account settings")
                : t(
                    "ตั้งค่าโทเคนหรือตัวเลือกเพิ่มเติม",
                    "Set up a token or other options",
                  )}</button
            >
          {/if}
          {#if setup.oauthSupported && (setup.oauthConnected || oauthURL)}
            <button
              class="k-button quiet"
              disabled={busy}
              onclick={disconnectOAuth}
              ><Unplug size={16} aria-hidden="true" />{action === "disconnect"
                ? t("กำลังยกเลิก…", "Disconnecting…")
                : setup.oauthConnected
                  ? t("ยกเลิกการเชื่อมบัญชี", "Disconnect account")
                  : t(
                      "ยกเลิกการลงชื่อเข้าใช้ที่ค้างอยู่",
                      "Cancel the pending sign-in",
                    )}</button
            >
          {/if}
          <button class="k-link-button" disabled={busy} onclick={() => load()}
            >{t("โหลดสถานะล่าสุด", "Reload status")}</button
          >
        </div>
        {#if setup.oauthConnected}
          <p class="k-small k-muted" style="margin-top:10px">
            {t(
              "หากต้องการเปลี่ยนบัญชี ให้ยกเลิกการเชื่อมบัญชีก่อน การยกเลิกใน ORCA ไม่ได้เพิกถอนสิทธิ์ที่อนุญาตไว้กับผู้ให้บริการ",
              "To change accounts, disconnect first. Disconnecting in ORCA does not revoke consent already granted to the provider.",
            )}
          </p>
        {/if}
      </details>
    {/if}
  {:else}<button class="k-button" disabled={busy} onclick={() => load()}
      >{t("โหลดการตั้งค่าอีกครั้ง", "Reload settings")}</button
    >{/if}
  {#if !sourceID || apiGuide || guide || fields.length || providerHost || providerKind}
    <details class="source-provider">
      <summary>{t("วิธีตั้งค่า", "Setup help")}</summary
      >
      {#if !sourceID}
        <p>{t("กรอก URL ของ MCP ในขั้นตอนนี้ ส่วนโทเคนจะกรอกในขั้นตอนเชื่อมบัญชี", "Enter the MCP URL here. The token is entered during account setup.")}</p>
      {/if}
      {#if apiGuide}
        <p>{t(...apiGuide.summary)}</p>
        <p>{t("รองรับการอ่านข้อมูลเท่านั้น ยังไม่รองรับการส่งข้อความหรือการเผยแพร่โพสต์", "Supports reading data only. Sending messages and publishing posts are not supported.")}</p>
      {:else if guide}
        <p>{t(guide.th, guide.en)}</p>
        <a class="field-help-link" href={guide.href} target="_blank" rel="noopener noreferrer">{t("คู่มือของผู้ให้บริการ", "Provider guide")}<ExternalLink size={14} aria-hidden="true" /></a>
      {/if}
      {#each fields as field, index (field.key)}
        {@const fieldCopy = apiGuide?.fields[field.key]}
        {#if fieldCopy || field.description}
          <div class="setup-field-help" id={`source-help-${index}`}>
            <strong>{fieldCopy ? t(...fieldCopy.label) : field.name || field.key}</strong>
            <p>{fieldCopy ? t(...fieldCopy.hint) : field.description === "Personal upstream access token" ? t("โทเคนส่วนตัวสำหรับเข้าถึงระบบที่เชื่อมต่อ", "Personal access token for the connected system") : field.description}</p>
            {#if fieldCopy}<a class="field-help-link" href={fieldCopy.href} target="_blank" rel="noopener noreferrer">{t(...fieldCopy.linkLabel)}<ExternalLink size={14} aria-hidden="true" /></a>{/if}
          </div>
        {/if}
      {/each}
      {#if providerKind === "orca"}
        <p class="k-small k-muted">{t(
          `ลงชื่อเข้าใช้บัญชี ${providerName} ของคุณ แล้วอนุญาตให้ ORCA เข้าถึง บัญชีที่เชื่อมผ่านผู้ให้บริการรายอื่นต้องลงชื่อเข้าใช้แยกต่างหาก`,
          `Sign in to your own ${providerName} account and authorize ORCA. Accounts connected through another provider require a separate sign-in.`,
        )}</p>
      {:else if providerKind === "obot"}
        <p class="k-small k-muted">
          {t(
            "การเชื่อมต่อนี้ใช้บริการของ Obot บัญชีและสิทธิ์จะผูกอยู่กับการเชื่อมต่อนี้",
            "This connection uses Obot’s service. Its account and permissions stay with this connection.",
          )}
        </p>
      {:else if providerKind === "google"}
        <p class="k-small k-muted">
          {t(
            "เชื่อมต่อกับบริการ Google Drive ของ Google",
            "Connects to Google’s Google Drive service.",
          )}
        </p>
      {/if}
      {#if providerHost && !apiGuide && providerKind !== "orca"}<p class="k-small k-muted">
        {t("โฮสต์ของระบบ", "System host")}: <code>{providerHost}</code>
      </p>{/if}
      {#if providerKind === "obot" || providerKind === "google"}
        <p class="k-small k-muted">
          {t(
            "ชื่อแอปที่แสดงบนหน้าอนุญาตสิทธิ์เป็นไปตามการตั้งค่าของผู้ให้บริการ",
            "The provider’s configuration determines the app name shown on the consent page.",
          )}
        </p>
      {/if}
    </details>
  {/if}
</section>

<style>
  /* These styles load before the shared workspace CSS (WorkspaceDetail and WorkspaceWizard import
     this component first), so overrides of shared classes carry an extra class. */
  .source-setup.k-panel {
    min-width: 0;
  }
  .source-setup .k-section-title {
    margin-bottom: 16px;
    color: var(--orca-subtle);
  }
  .source-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    color: var(--orca-ink);
  }
  .source-heading h3 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .source-logo {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .source-banner.k-banner {
    margin: 0 0 16px;
  }
  .source-banner strong {
    display: block;
    font-weight: 600;
  }
  .source-banner p {
    margin: 2px 0 0;
  }
  .source-setup :global(.k-field + .k-field),
  .source-setup .k-grid-2 + .k-field {
    margin-top: 16px;
  }
  .api-onboarding {
    margin: 0 0 16px;
  }
  .api-onboarding ol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 20px;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: api-step;
  }
  .api-onboarding li {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--orca-muted);
    font-size: 13.5px;
    font-weight: 500;
    counter-increment: api-step;
  }
  .api-onboarding li::before {
    content: counter(api-step);
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border: 1px solid var(--orca-line-strong);
    border-radius: 50%;
    background: var(--orca-surface);
    color: var(--orca-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }
  .api-onboarding li.current {
    color: var(--orca-ink);
    font-weight: 600;
  }
  .api-onboarding li.current::before {
    border-color: var(--orca-ink);
    background: var(--orca-ink);
    color: #fff;
  }
  .client-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .client-setup {
    margin-top: 20px;
  }
  .client-setup .k-field {
    margin-top: 16px;
  }
  .client-provider-help {
    margin: 16px 0;
    padding-top: 12px;
    border-top: 1px solid var(--orca-line);
    font-size: 13.5px;
  }
  .client-provider-help summary,
  .source-provider summary {
    color: var(--orca-muted);
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .client-provider-help summary:hover,
  .source-provider summary:hover {
    color: var(--orca-ink);
  }
  .client-provider-help p {
    margin: 12px 0;
  }
  .client-provider-help ol {
    margin: 12px 0;
    padding-left: 22px;
  }
  .client-provider-help li {
    margin: 6px 0;
    line-height: 1.65;
  }
  .client-provider-help a,
  .field-help-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--orca-ink);
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .client-provider-help a {
    display: flex;
    width: fit-content;
    margin-top: 8px;
  }
  .field-help-link {
    margin: 6px 0 4px;
  }
  .manage-toggle {
    cursor: pointer;
  }
  .manage-toggle:hover {
    color: var(--orca-ink);
  }
  .source-provider {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--orca-line);
  }
  .source-provider p {
    margin: 8px 0 0;
    color: var(--orca-muted);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .setup-field-help {
    margin-top: 12px;
    font-size: 13.5px;
  }
  .setup-field-help strong {
    display: block;
    font-weight: 600;
  }
  .setup-field-help p {
    margin-top: 2px;
  }
  .source-provider code {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
</style>
