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
    operator = false,
    oncreated,
    onready,
    onstatechange,
  }: {
    sourceID?: string;
    sourceLabel?: string;
    endpointHost?: string;
    managedProvider?: OrcaSourceSetup["managedProvider"];
    canCreate?: boolean;
    /** On the ORCA team's platform pages: app set-up and technical details show. */
    operator?: boolean;
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
  let helpOpen = $state(false);
  const needsOAuthClient = $derived(Boolean(setup?.oauthClientRequired && !setup.oauthClientConfigured));
  const providerSetup = $derived(oauthProviderSetup(sourceID, setup?.endpointHost || endpointHost, setup ? setup.managedProvider : managedProvider));
  const providerReviewRequired = $derived(Boolean(
    // A record saved with no field reads as configured: only a grant (or a
    // saved key, where the program takes one) is an account to keep.
    (setup?.setupStatus === "review_required" && !(setup.oauthSupported ? setup.oauthConnected : setup.configured)) ||
    (providerSetup?.vendorConfirmationRequired && needsOAuthClient)
  ));
  const appSetupRequired = $derived(needsOAuthClient || providerReviewRequired);
  // Customers never see the app set-up (Client ID, secret): that is the ORCA
  // team's, on the platform pages.
  const canConfigureClient = $derived(operator && Boolean(setup?.oauthClientCanConfigure) && !providerReviewRequired);
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
        t("โปรแกรมนี้", "this program"),
      ...providerMetadata,
    }),
  );
  const busy = $derived(loading || action !== "");
  // The callback URL goes into the provider's console: one click to copy, as on the shared provider apps.
  let callbackCopied = $state(false);
  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(setup?.oauthRedirectURL ?? "");
      callbackCopied = true;
      setTimeout(() => (callbackCopied = false), 2000);
    } catch {
      // The field stays selectable to copy by hand.
    }
  }
  /** "จัดการการเชื่อมต่อ" holds something to do besides reloading the status. */
  const manageActions = $derived(
    Boolean(setup) &&
      ((configured && !appSetupRequired && Boolean(oauthURL || connectionReady)) ||
        Boolean(setup?.oauthSupported && !appSetupRequired && !setup.oauthConnected && oauthURL) ||
        ((requiresURL || fields.length > 0) && !appSetupRequired) ||
        Boolean(setup?.oauthSupported && (setup.oauthConnected || oauthURL))),
  );
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
        "ลิงก์ลงชื่อเข้าใช้ที่โปรแกรมส่งมาใช้ไม่ได้ แจ้งทีม ORCA",
        "The program sent an invalid sign-in link. Tell the ORCA team.",
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
        "กรอกชื่อโปรแกรมและ URL ที่ขึ้นต้นด้วย https:// โดยไม่มีรหัสผ่านหรือพารามิเตอร์ใน URL",
        "Enter a program name and an https:// URL without credentials or query parameters.",
      );
      return;
    }
    const request = requestContext();
    action = "create";
    clearConnection();
    try {
      const created = await OrcaService.createRemoteEntry({
        name: name.trim(),
        shortDescription: t("โปรแกรมที่ทีม ORCA เพิ่มไว้", "A program the ORCA team added"),
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
        "เพิ่มโปรแกรมแล้ว ขั้นต่อไปคือเชื่อมบัญชี",
        "Program added. Next, connect an account.",
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
        "ยังเชื่อมต่อไม่ได้ ตรวจข้อมูลบัญชีแล้วลองอีกครั้ง",
        "Not connected yet. Check the account details and try again.",
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
        `กำลังเชื่อมต่อ ${providerName}… หน้าลงชื่อเข้าใช้จะเปิดในหน้าต่างนี้`,
        `Connecting to ${providerName}… The sign-in page opens in this window.`,
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
        `${providerName} ไม่รับคีย์นี้ ตรวจคีย์และสิทธิ์ของบัญชีแล้วลองอีกครั้ง`,
        `${providerName} did not accept this key. Check the key and the account's permissions, then try again.`,
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
        `กรอกที่อยู่บัญชี ${providerName} ที่ขึ้นต้นด้วย https:// โดยไม่มีรหัสผ่านอยู่ในลิงก์`,
        `Enter your ${providerName} account address, starting with https:// and without a password in it.`,
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
          'บันทึกแอปไม่สำเร็จ ตรวจว่าคุณอยู่ในทีม ORCA แล้วโหลดสถานะล่าสุดและลองอีกครั้ง',
          'The app could not be saved. Check that you are in the ORCA team, reload the status, and try again.'
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
            `ยังเชื่อมต่อ ${providerName} ไม่ได้ โหลดสถานะอีกครั้ง หรือแจ้งทีม ORCA`,
            `${providerName} can't be connected yet. Reload the status or tell the ORCA team.`,
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
            "ตัดการเชื่อมต่อบัญชีไม่สำเร็จ ลองอีกครั้ง",
            "The account could not be disconnected. Try again.",
          ),
        );
      if (setup) setup = { ...setup, oauthConnected: false };
      notice = t(
        `ตัดการเชื่อมต่อบัญชี ${providerName} จาก ORCA แล้ว ถ้าจะยกเลิกสิทธิ์ที่เคยอนุญาตด้วย ให้ทำในการตั้งค่าของ ${providerName}`,
        `Your ${providerName} account is disconnected from ORCA. To also remove the access you allowed, use ${providerName}'s settings.`,
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
  // "หาได้ที่ไหน?" opens the set-up help below the form at that field's note.
  function showHelp(id: string) {
    helpOpen = true;
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "nearest" }), 0);
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
          ? operator
            ? t(`เชื่อมต่อ ${providerName}`, `Connect ${providerName}`)
            : t(`บัญชี ${providerName} ของคุณ`, `Your ${providerName} account`)
          : t("เพิ่มโปรแกรมด้วยลิงก์ MCP", "Add a program by its MCP link")}
      </h3>
    </div>
    {#if !sourceID}<Plug size={18} aria-hidden="true" />{/if}
  </div>
  <!-- The account steps only once the app exists: while the ORCA team sets the app up, they would describe the wrong task. -->
  {#if apiGuide && !connectionReady && !appSetupRequired}
    <div class="api-onboarding">
      {#if !onready}<ol aria-label={t("ขั้นตอนเชื่อมบัญชี", "Account connection steps")}>
        <li class:current={!configured || editing}>{t("กรอกข้อมูลบัญชี", "Enter account details")}</li>
        <li class:current={configured && !editing}>{t("ทดสอบบัญชี", "Test the account")}</li>
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
              >{t("ชื่อโปรแกรม", "Program name")}</label
            ><input
              id="remote-source-name"
              bind:value={name}
              maxlength="100"
              required
            />
          </div>
          <div class="k-field">
            <label for="remote-source-endpoint"
              >{t("ลิงก์ MCP ของโปรแกรม (Remote MCP)", "Remote MCP URL")}</label
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
              "วิธียืนยันตัวตนกับโปรแกรม",
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
            : t("เพิ่มโปรแกรม", "Add program")}</button
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
              `เชื่อม ${providerName} แล้ว`,
              `${providerName} is connected`,
            )}</strong
          >
          <p>
            {apiGuide ? t(...apiGuide.result) : t(
              `AI ใช้ ${providerName} ด้วยบัญชีนี้ได้แล้ว`,
              `AI can now use ${providerName} with this account.`,
            )}
          </p>
        </div>
      </div>
    {:else if primaryState === 'unavailable'}
      <div class="k-banner source-banner">
        <Info size={16} aria-hidden="true" />
        <div>
          <strong
            >{!operator
              ? t(`ยังเชื่อม ${providerName} ไม่ได้ตอนนี้`, `${providerName} can't be connected yet`)
              : t(
              providerReviewRequired ? `${providerName} รอการยืนยันจากผู้ให้บริการ` : `${providerName} ต้องตั้งค่าแอปก่อนเชื่อมต่อ`,
              providerReviewRequired ? `${providerName} needs provider review` : `${providerName} needs app setup`
            )}</strong
          >
          <p>
            {providerReviewRequired && operator
              ? t('ทีม ORCA ต้องยืนยันข้อกำหนดการเชื่อมต่อกับผู้ให้บริการก่อน','The ORCA team must first confirm the provider’s connection requirements.')
              : canConfigureClient
              ? t(
                  'ตั้งค่าแอปของ ORCA หนึ่งครั้ง เพื่อให้ทุกคนเชื่อมบัญชีของตัวเองได้',
                  'Set up the ORCA app once so that everyone can connect their own account.'
                )
              : t(
                  'ทีม ORCA ต้องตั้งค่าโปรแกรมนี้ก่อน จึงจะลงชื่อเข้าใช้ได้',
                  'The ORCA team must set this program up before you can sign in.'
                )}
          </p>
        </div>
      </div>
      <div class="client-actions">
        {#if operator && providerReviewRequired && providerSetup}
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
      {#if operator && providerReviewRequired}{@render oauthAppHelp()}{/if}
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
              <div class="callback-row">
                <input id="source-client-callback" readonly value={setup.oauthRedirectURL} />
                <button type="button" class="k-button small" onclick={copyCallback}
                  >{#if callbackCopied}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}{t('คัดลอก', 'Copy')}{/if}</button
                >
              </div>
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
                  `ที่อยู่บัญชี ${providerName}`,
                  `${providerName} account address`,
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
              <div class="source-field-head"><label for={`source-value-${index}`}
                >{fieldCopy ? t(...fieldCopy.label) : field.key === "READ_ONLY" &&
                (endpointHost === "mcp.supabase.com" ||
                  setup?.name === "Supabase")
                  ? t("สิทธิ์การทำงานใน Supabase", "Supabase access mode")
                  : field.name === "Access token" || field.key.toLowerCase() === "authorization"
                    ? t(`คีย์ของ ${providerName}`, `${providerName} key`)
                    : field.name || field.key}{field.required
                  ? " *"
                  : ""}</label
              >{#if fieldCopy || field.description || guide}<button type="button" class="source-where" aria-controls="source-help" onclick={() => showHelp(fieldCopy || field.description ? `source-help-${index}` : "source-help")}>{t("หาได้ที่ไหน?", "Where do I find it?")}</button>{/if}</div>
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
                `อนุญาตในหน้าต่าง ${providerName} ให้เสร็จ แล้วกลับมาที่หน้านี้`,
                `Finish allowing access in the ${providerName} window, then come back here.`,
              )
            : t(
                "หน้าต่างไม่ได้เปิดขึ้นเอง กดปุ่มด้านล่างเพื่อเปิด",
                "The window didn't open by itself. Use the button below.",
              )
          : t(
                  `ต้องลงชื่อเข้าใช้ ${providerName} ใหม่ ตัดการเชื่อมต่อบัญชีเดิมก่อน แล้วลงชื่อเข้าใช้อีกครั้ง`,
                  `Sign in to ${providerName} again: disconnect the current account first, then sign in.`,
                )}
      </p>{/if}
      <div class="k-actions" style="margin-top:16px">
        {#if busy}
          <button class="k-button primary" disabled
            ><RefreshCw size={16} aria-hidden="true" />{action === "check" || action === "return"
              ? t("กำลังตรวจการเชื่อมต่อ…", "Checking the connection…")
              : action === "disconnect"
                ? t("กำลังตัดการเชื่อมต่อ…", "Disconnecting…")
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
              ? t("เปิดหน้าต่างอีกครั้ง", "Open the window again")
              : t(
                  `เปิดหน้า ${providerName}`,
                  `Open ${providerName}`,
                )}
            <ExternalLink size={16} aria-hidden="true" /></a
          >
        {:else if primaryState === "connect"}
          <button class="k-button primary" onclick={startOAuth}
            ><KeyRound size={16} aria-hidden="true" />{t(
              `ลงชื่อเข้าใช้ ${providerName}`,
              `Sign in to ${providerName}`,
            )}</button
          >
        {:else if primaryState === "reconnect"}
          <button class="k-button primary" onclick={disconnectOAuth}
            ><Unplug size={16} aria-hidden="true" />{t(
              "ตัดการเชื่อมต่อแล้วลงชื่อเข้าใช้ใหม่",
              "Disconnect and sign in again",
            )}</button
          >
        {:else}
          <button class="k-button primary" onclick={verify}
            ><RefreshCw size={16} aria-hidden="true" />{t(
              onready ? "ตรวจแล้วไปต่อ" : "ตรวจการเชื่อมต่อ",
              onready ? "Check and continue" : "Check the connection",
            )}</button
          >
        {/if}
      </div>
    {/if}
    <!-- Only when it holds something besides "โหลดสถานะล่าสุด": someone who never signed in has nothing to manage yet. -->
    {#if !editing && manageActions && (!appSetupRequired || setup.oauthConnected || oauthURL)}
      <details style="margin-top:16px">
        <summary class="k-small k-muted manage-toggle"
          >{t("จัดการการเชื่อมต่อ", "Manage connection")}</summary
        >
        <div class="k-actions" style="margin-top:12px">
          {#if configured && !appSetupRequired && (oauthURL || connectionReady)}
            <button class="k-button" disabled={busy} onclick={verify}
              ><RefreshCw size={16} aria-hidden="true" />{oauthURL
                ? t("ตรวจหลังลงชื่อเข้าใช้", "Check after signing in")
                : t("ตรวจอีกครั้ง", "Check again")}</button
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
                ? t("เปลี่ยนข้อมูลบัญชี", "Change account details")
                : t(
                    "ใส่คีย์หรือตัวเลือกเพิ่มเติม",
                    "Add a key or other options",
                  )}</button
            >
          {/if}
          {#if setup.oauthSupported && (setup.oauthConnected || oauthURL)}
            <button
              class="k-button quiet"
              disabled={busy}
              onclick={disconnectOAuth}
              ><Unplug size={16} aria-hidden="true" />{action === "disconnect"
                ? t("กำลังตัดการเชื่อมต่อ…", "Disconnecting…")
                : setup.oauthConnected
                  ? t("ตัดการเชื่อมต่อบัญชี", "Disconnect account")
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
              `ถ้าจะเปลี่ยนบัญชี ให้ตัดการเชื่อมต่อก่อน การตัดใน ORCA ไม่ได้ยกเลิกสิทธิ์ที่คุณอนุญาตไว้ใน ${providerName}`,
              `To change accounts, disconnect first. Disconnecting in ORCA doesn't remove the access you allowed in ${providerName}.`,
            )}
          </p>
        {/if}
      </details>
    {/if}
  {:else}<button class="k-button" disabled={busy} onclick={() => load()}
      >{t("โหลดการตั้งค่าอีกครั้ง", "Reload settings")}</button
    >{/if}
  {#if !sourceID || apiGuide || guide || fields.length || (operator ? providerHost || providerKind : providerKind === "orca")}
    <details class="source-provider" id="source-help" bind:open={helpOpen}>
      <summary>{t("วิธีตั้งค่า", "Setup help")}</summary
      >
      {#if !sourceID}
        <p>{t("กรอก URL ของ MCP ในขั้นตอนนี้ ส่วนโทเคนจะกรอกในขั้นตอนเชื่อมบัญชี", "Enter the MCP URL here. The token is entered during account setup.")}</p>
      {/if}
      {#if apiGuide}
        <p>{t(...apiGuide.summary)}</p>
        <p>{t("AI อ่านข้อมูลได้อย่างเดียว ยังส่งข้อความหรือโพสต์ไม่ได้", "AI can only read. It can't send messages or post yet.")}</p>
      {:else if guide}
        <p>{t(guide.th, guide.en)}</p>
        <a class="field-help-link" href={guide.href} target="_blank" rel="noopener noreferrer">{t(`คู่มือของ ${providerName}`, `${providerName} guide`)}<ExternalLink size={14} aria-hidden="true" /></a>
      {/if}
      {#each fields as field, index (field.key)}
        {@const fieldCopy = apiGuide?.fields[field.key]}
        {#if fieldCopy || field.description}
          <div class="setup-field-help" id={`source-help-${index}`}>
            <strong>{fieldCopy ? t(...fieldCopy.label) : field.name === "Access token" || field.key.toLowerCase() === "authorization" ? t(`คีย์ของ ${providerName}`, `${providerName} key`) : field.name || field.key}</strong>
            <p>{fieldCopy ? t(...fieldCopy.hint) : field.description === "Personal upstream access token" ? t("คีย์ส่วนตัวที่ออกให้คุณในโปรแกรมนี้", "A personal key issued to you in this program.") : field.description}</p>
            {#if fieldCopy}<a class="field-help-link" href={fieldCopy.href} target="_blank" rel="noopener noreferrer">{t(...fieldCopy.linkLabel)}<ExternalLink size={14} aria-hidden="true" /></a>{/if}
          </div>
        {/if}
      {/each}
      {#if providerKind === "orca"}
        <p class="k-small k-muted">{t(
          `ลงชื่อเข้าใช้บัญชี ${providerName} ของคุณ แล้วกดอนุญาตให้ ORCA ถ้าเคยเชื่อม ${providerName} ผ่านทางอื่น ต้องลงชื่อเข้าใช้ที่นี่อีกครั้ง`,
          `Sign in to your own ${providerName} account and allow ORCA. If you connected ${providerName} another way before, sign in here again.`,
        )}</p>
      {:else if operator && providerKind === "obot"}
        <p class="k-small k-muted">
          {t(
            "การเชื่อมต่อนี้ใช้บริการของ Obot บัญชีและสิทธิ์จะผูกอยู่กับการเชื่อมต่อนี้",
            "This connection uses Obot’s service. Its account and permissions stay with this connection.",
          )}
        </p>
      {:else if operator && providerKind === "google"}
        <p class="k-small k-muted">
          {t(
            "เชื่อมต่อกับบริการ Google Drive ของ Google",
            "Connects to Google’s Google Drive service.",
          )}
        </p>
      {/if}
      {#if operator && providerHost && !apiGuide && providerKind !== "orca"}<p class="k-small k-muted">
        {t("โฮสต์ของโปรแกรม", "Program host")}: <code>{providerHost}</code>
      </p>{/if}
      {#if operator && (providerKind === "obot" || providerKind === "google")}
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
    border-color: var(--orca-chosen, var(--orca-ink));
    background: var(--orca-chosen, var(--orca-ink));
    color: var(--orca-on-ink, #fff);
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
  .source-field-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .source-where {
    padding: 0;
    border: 0;
    background: none;
    color: var(--orca-text-2);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--orca-line-strong);
    text-underline-offset: 3px;
    cursor: pointer;
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
  .callback-row {
    display: flex;
    gap: 8px;
  }
  .callback-row input {
    flex: 1;
    min-width: 0;
  }
</style>
