<script lang="ts">
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { catalogSourceDisplayName, googleDriveProvider } from "$lib/orca/catalog";
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
    "" | "create" | "configure" | "check" | "return" | "oauth" | "disconnect"
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
  let generation = 0;
  let active = true;
  const fields = $derived(setup?.fields ?? []);
  const configured = $derived(Boolean(setup?.configured));
  const requiresURL = $derived(Boolean(setup?.requiresURL));
  const needsOAuthClient = $derived(
    Boolean(setup?.oauthClientRequired && !setup.oauthClientConfigured),
  );
  const directSignIn = $derived(
    Boolean(setup && !requiresURL && !fields.some((field) => field.required)),
  );
  const providerHost = $derived(setup?.endpointHost || endpointHost);
  const providerMetadata = $derived({
    endpointHost: providerHost,
    managedProvider: setup ? setup.managedProvider : managedProvider,
  });
  const providerKind = $derived(googleDriveProvider(providerMetadata));
  const providerName = $derived(
    catalogSourceDisplayName({
      name:
        sourceLabel.trim() ||
        setup?.name.trim() ||
        t("แหล่งข้อมูล", "your source"),
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
    needsOAuthClient
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
  function clearFields() {
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
        "ลิงก์เข้าสู่ระบบที่ได้รับไม่ถูกต้อง กรุณาติดต่อทีม ORCA",
        "The source returned an invalid sign-in link. Contact ORCA.",
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
      if (isCurrent(request)) setup = response;
    } catch (cause) {
      if (isCurrent(request)) error = orcaError(cause);
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
        "กรอกชื่อระบบและ URL ที่ขึ้นต้นด้วย HTTPS โดยไม่ใส่รหัสผ่านหรือพารามิเตอร์ใน URL",
        "Enter a name and HTTPS URL without credentials or query parameters.",
      );
      return;
    }
    const request = requestContext();
    action = "create";
    clearConnection();
    try {
      const created = await OrcaService.createRemoteEntry({
        name: name.trim(),
        shortDescription: t("ระบบที่องค์กรเชื่อมต่อ", "Organization source"),
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
        "เพิ่มแหล่งข้อมูลแล้ว ตั้งค่าบัญชีของคุณเพื่อเริ่มเชื่อมต่อ",
        "Source added. Set up your account to connect.",
      );
    } catch (cause) {
      if (isCurrent(request)) error = orcaError(cause);
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
      error = t(
        "ยังเชื่อมต่อไม่ได้ กรุณาตรวจสอบการตั้งค่าบัญชีแล้วลองอีกครั้ง",
        "The connection is not ready. Check your source account settings and try again.",
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
        `กำลังเชื่อมต่อ ${providerName}… หน้าขอสิทธิ์จะเปิดที่นี่เมื่อพร้อม`,
        `Connecting to ${providerName}… The permission page will open here when ready.`,
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
        "The source did not accept this token. Check the token and its account permissions.",
      );
      return;
    }
    if (!setup?.oauthSupported || needsOAuthClient) return;
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
    if (busy || !setup || setup.sourceID !== sourceID || needsOAuthClient)
      return;
    if (requiresURL && !validEndpoint(sourceEndpoint.trim())) {
      error = t(
        "กรอก URL ที่ขึ้นต้นด้วย HTTPS ของบัญชีที่ต้องการเชื่อมต่อ โดยไม่ใส่รหัสผ่านหรือข้อมูลลับใน URL",
        "Enter the upstream HTTPS URL without secrets in the URL.",
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
      if (isCurrent(request)) error = orcaError(cause);
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
      needsOAuthClient
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
      if (isCurrent(request)) error = orcaError(cause);
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
      needsOAuthClient
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
        needsOAuthClient
      )
        return;
      oauthURL = "";
      oauthRequired = false;
      await checkConnection(request, latest);
    } catch (cause) {
      if (isCurrent(request)) error = orcaError(cause);
    } finally {
      if (isCurrent(request)) action = "";
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
      needsOAuthClient
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
          needsOAuthClient
        ) {
          error = t(
            `ยังเชื่อมต่อ ${providerName} ไม่ได้ กรุณาโหลดสถานะอีกครั้ง หรือติดต่อทีม ORCA`,
            `${providerName} is not ready to connect. Reload its status or contact ORCA.`,
          );
          return;
        }
      }
      await connectAccount(request, popup);
    } catch (cause) {
      if (isCurrent(request)) error = orcaError(cause);
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
            "ยังยกเลิกการเชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง",
            "The connection could not be disconnected. Try again.",
          ),
        );
      if (setup) setup = { ...setup, oauthConnected: false };
      notice = t(
        `ยกเลิกการเชื่อมบัญชี ${providerName} ใน ORCA แล้ว หากต้องการถอนสิทธิ์ที่เคยอนุญาต ให้ดำเนินการที่ผู้ให้บริการ`,
        `Your ${providerName} sign-in in ORCA has been removed. Revoke any provider consent in the provider’s settings.`,
      );
    } catch (cause) {
      if (isCurrent(request)) {
        oauthRequired = signInRequired;
        error = orcaError(cause);
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

<section class="k-panel source-setup">
  <div class="k-section-title">
    <div class="source-heading">
      {#if sourceID}<CatalogIcon name={providerName} size={36} />{/if}
      <h3>
        {sourceID
          ? t(`เชื่อมต่อ ${providerName}`, `Connect ${providerName}`)
          : t("เพิ่มแหล่งข้อมูลขององค์กร", "Add an organization source")}
      </h3>
    </div>
    {#if !sourceID}<Plug size={21} />{/if}
  </div>
  {#if error}<div class="k-banner error" role="alert">
      <Info size={18} />
      <p>{error}</p>
    </div>{/if}
  {#if notice && !connectionReady}<div class="k-banner success" role="status">
      <Check size={18} />{notice}
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
              >{t("ชื่อระบบ", "Source name")}</label
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
              "วิธียืนยันตัวตนกับแหล่งข้อมูล",
              "Source authentication",
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
        <p class="k-small k-muted" style="margin-top:12px">
          {t(
            "ใช้ URL เพื่อระบุระบบที่ต้องการเชื่อมต่อ ส่วนโทเคนให้กรอกแยกในขั้นตอนเชื่อมบัญชี โดยสมาชิกคนอื่นจะไม่เห็นโทเคนของคุณ",
            "The URL identifies the source. Tokens are entered separately during account setup and are not shown to other members.",
          )}
        </p>
        <button
          class="k-button primary"
          style="margin-top:16px"
          disabled={busy}
          type="submit"
          >{action === "create"
            ? t("กำลังเพิ่ม…", "Adding…")
            : t("เพิ่มแหล่งข้อมูล", "Add source")}</button
        >
      </fieldset>
    </form>
  {:else if loading}<p class="k-muted" role="status">
      {t("กำลังโหลดการตั้งค่า…", "Loading configuration…")}
    </p>
  {:else if setup}
    {#if primaryState === "ready"}
      <div class="k-banner success" role="status">
        <Check size={19} />
        <div>
          <strong
            >{t(
              `ติดต่อ ${providerName} ได้แล้ว`,
              `${providerName} responded to the connection check`,
            )}</strong
          >
          <p>
            {t(
              "เรียกรายการเครื่องมือสำเร็จแล้ว ตรวจเครื่องมือและสิทธิ์ที่ต้องการให้ทีมใช้ในขั้นถัดไป",
              "The tool list request succeeded. Next, review the tools and permissions for your team.",
            )}
          </p>
        </div>
      </div>
    {:else if primaryState === "unavailable"}
      <div class="k-banner">
        <Info size={18} />
        <div>
          <strong
            >{t(
              `${providerName} ยังไม่พร้อมเชื่อมต่อ`,
              `${providerName} connection unavailable`,
            )}</strong
          >
          <p>
            {t(
              "ทีม ORCA ดูแลการเปิดใช้งานการเชื่อมต่อนี้ กรุณาติดต่อทีม ORCA หรือลองอีกครั้งภายหลัง",
              "ORCA manages this connection. Contact ORCA or try again later.",
            )}
          </p>
        </div>
      </div>
      <button class="k-button primary" disabled={busy} onclick={() => load()}
        >{t("ตรวจสอบสถานะอีกครั้ง", "Refresh connection status")}</button
      >
    {:else if primaryState === "configure"}
      <p class="k-small k-muted">
        {t(
          "กรอกข้อมูลที่จำเป็น ORCA จะบันทึก ตรวจการเชื่อมต่อ และเปิดหน้าขอสิทธิ์ให้เมื่อจำเป็น",
          "Enter the required details. ORCA will save and check the connection, then open sign-in if needed.",
        )}
      </p>
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
                  "Your account URL",
                )}</label
              ><input
                id="personal-source-url"
                type="url"
                bind:value={sourceEndpoint}
                required
                autocomplete="off"
              />
            </div>{/if}
          {#each fields as field, index (field.key)}<div class="k-field">
              <label for={`source-value-${index}`}
                >{field.key === "READ_ONLY" &&
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
                      "อ่านและทำงานตามสิทธิ์บัญชี",
                      "Read and act within account permissions",
                    )}</option
                  >
                  <option value="true"
                    >{t("อ่านข้อมูลเท่านั้น", "Read only")}</option
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
                />{/if}
              <p class="k-small k-muted">
                {field.key === "READ_ONLY" &&
                (endpointHost === "mcp.supabase.com" ||
                  setup?.name === "Supabase")
                  ? t(
                      onready
                        ? "เลือกรูปแบบที่ต้องการ แล้วเลือกเครื่องมือที่อนุญาตให้ทีมใช้ในขั้นตอนถัดไป"
                        : "เลือกรูปแบบที่บัญชีนี้ใช้เข้าถึงระบบ",
                      onready
                        ? "Choose your access mode, then select the tools your team may use in the next step."
                        : "Choose how this account accesses the source.",
                    )
                  : field.description === "Personal upstream access token"
                    ? t(
                        "โทเคนส่วนตัวสำหรับเข้าถึงระบบที่เชื่อมต่อ",
                        "Personal upstream access token",
                      )
                    : field.description}
              </p>
            </div>{/each}
          {#if !fields.length}<p class="k-small k-muted">
              {t(
                "ระบบนี้ไม่ต้องกรอกข้อมูลเพิ่มเติม กดเชื่อมต่อเพื่อเชื่อมบัญชีของคุณ",
                "This source needs no additional details. Connect your account.",
              )}
            </p>{/if}
          {#if editing}<p class="k-small k-muted" style="margin-top:12px">
              {t(
                "กรอกข้อมูลชุดใหม่ให้ครบ เมื่อบันทึก ระบบจะใช้การตั้งค่าใหม่นี้แทนการตั้งค่าเดิม",
                "Enter the complete new values. Saving replaces the previous account configuration.",
              )}
            </p>{/if}
          <div class="k-actions" style="margin-top:17px">
            <button type="submit" class="k-button primary" disabled={busy}
              ><KeyRound size={16} />{action === "configure"
                ? t("กำลังเชื่อมต่อ…", "Connecting…")
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
      <p class="k-small k-muted">
        {primaryState === "pending"
          ? oauthWindowOpened
            ? t(
                "เปิดหน้าขอสิทธิ์แล้ว เมื่อเสร็จให้กลับมาหน้านี้ ORCA จะตรวจการเชื่อมต่อให้อัตโนมัติ",
                "The permission page is open. Return here when finished and ORCA will check the connection automatically.",
              )
            : t(
                "เบราว์เซอร์ยังไม่ได้เปิดหน้าขอสิทธิ์ กดปุ่มด้านล่างเพื่อเปิด แล้วกลับมาหน้านี้เมื่อเสร็จ",
                "The permission page did not open. Use the button below, then return here when finished.",
              )
          : primaryState === "check"
            ? t(
                onready
                  ? "ตรวจสอบว่าบัญชีนี้ใช้งานได้ก่อนดำเนินการต่อ"
                  : "ตรวจสอบว่าบัญชีนี้เชื่อมต่อและใช้งานได้",
                onready
                  ? "Check that this account works before continuing."
                  : "Check that this account is connected and ready to use.",
              )
            : primaryState === "reconnect"
              ? t(
                  "บัญชีนี้ต้องเข้าสู่ระบบใหม่ กรุณายกเลิกการเชื่อมบัญชีเดิมก่อน",
                  "This account needs a new sign-in. Disconnect the current account first.",
                )
              : t(
                  "เข้าสู่ระบบด้วยบัญชีของคุณ แล้วตรวจสอบสิทธิ์ที่ผู้ให้บริการขอก่อนอนุญาต",
                  "Sign in with your account and review the provider’s requested permissions before granting access.",
                )}
      </p>
      <div class="k-actions" style="margin-top:16px">
        {#if busy}
          <button class="k-button primary" disabled
            ><RefreshCw size={16} />{action === "check" || action === "return"
              ? t("กำลังตรวจสอบการเชื่อมต่อ…", "Checking connection…")
              : action === "disconnect"
                ? t("กำลังยกเลิกการเชื่อมบัญชี…", "Disconnecting account…")
                : t("กำลังเตรียมการเข้าสู่ระบบ…", "Preparing sign-in…")}</button
          >
        {:else if primaryState === "pending"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Validated external provider URL; it must not be resolved as an app route. -->
          <a
            class="k-button primary"
            href={oauthURL}
            target="_blank"
            rel="noopener noreferrer"
            >{oauthWindowOpened
              ? t("เปิดหน้าขอสิทธิ์อีกครั้ง", "Reopen permission page")
              : t(
                  `เปิดหน้าขอสิทธิ์ ${providerName}`,
                  `Open ${providerName} permission page`,
                )}
            <ExternalLink size={15} /></a
          >
        {:else if primaryState === "connect"}
          <button class="k-button primary" onclick={startOAuth}
            ><KeyRound size={16} />{t(
              `เชื่อมต่อ ${providerName}`,
              `Connect ${providerName}`,
            )}</button
          >
        {:else if primaryState === "reconnect"}
          <button class="k-button primary" onclick={disconnectOAuth}
            ><Unplug size={16} />{t(
              "ยกเลิกการเชื่อมบัญชีเพื่อเข้าสู่ระบบใหม่",
              "Disconnect account to sign in again",
            )}</button
          >
        {:else}
          <button class="k-button primary" onclick={verify}
            ><RefreshCw size={16} />{t(
              onready ? "ตรวจสอบและดำเนินการต่อ" : "ตรวจสอบการเชื่อมต่อบัญชี",
              onready ? "Check and continue" : "Check account connection",
            )}</button
          >
        {/if}
      </div>
    {/if}
    {#if !editing && (configured || oauthURL || setup.oauthConnected || fields.length) && (!needsOAuthClient || setup.oauthConnected || oauthURL)}
      <details style="margin-top:16px">
        <summary class="k-small k-muted"
          >{t("จัดการการเชื่อมต่อ", "Manage connection")}</summary
        >
        <div class="k-actions" style="margin-top:12px">
          {#if configured && !needsOAuthClient && (oauthURL || connectionReady)}
            <button class="k-button" disabled={busy} onclick={verify}
              ><RefreshCw size={16} />{oauthURL
                ? t("ตรวจสอบหลังเข้าสู่ระบบ", "Check after sign-in")
                : t("ตรวจสอบอีกครั้ง", "Check again")}</button
            >
          {/if}
          {#if setup.oauthSupported && !needsOAuthClient && !setup.oauthConnected && oauthURL}
            <button class="k-button quiet" disabled={busy} onclick={startOAuth}
              >{t("เริ่มเข้าสู่ระบบใหม่", "Restart sign-in")}</button
            >
          {/if}
          {#if (requiresURL || fields.length) && !needsOAuthClient}
            <button
              class="k-button quiet"
              disabled={busy}
              onclick={() => editConfiguration(true)}
              >{configured
                ? t("เปลี่ยนการตั้งค่าบัญชี", "Replace account configuration")
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
              ><Unplug size={16} />{action === "disconnect"
                ? t("กำลังยกเลิก…", "Disconnecting…")
                : setup.oauthConnected
                  ? t("ยกเลิกการเชื่อมบัญชี", "Disconnect account")
                  : t(
                      "ยกเลิกการเข้าสู่ระบบที่รออยู่",
                      "Cancel pending sign-in",
                    )}</button
            >
          {/if}
          <button class="k-link-button" disabled={busy} onclick={() => load()}
            >{t("โหลดสถานะล่าสุด", "Reload current status")}</button
          >
        </div>
        {#if setup.oauthConnected}
          <p class="k-small k-muted" style="margin-top:10px">
            {t(
              "หากต้องการเปลี่ยนบัญชี ให้ยกเลิกการเชื่อมบัญชีก่อน การยกเลิกใน ORCA จะไม่ถอนสิทธิ์ที่เคยอนุญาตกับผู้ให้บริการ",
              "To change accounts, disconnect first. Disconnecting in ORCA does not revoke consent already granted to the provider.",
            )}
          </p>
        {/if}
      </details>
    {/if}
  {:else}<button class="k-button" disabled={busy} onclick={() => load()}
      >{t("โหลดการตั้งค่าอีกครั้ง", "Reload configuration")}</button
    >{/if}
  {#if sourceID && (providerHost || providerKind)}
    <details class="source-provider">
      <summary class="k-small k-muted"
        >{t("รายละเอียดการเชื่อมต่อ", "Connection details")}</summary
      >
      {#if providerKind === "orca"}
        <p class="k-small k-muted">
          {t(
            "ORCA ให้บริการ connector ที่เรียก Google Drive API และจัดการ OAuth ผ่าน Google Cloud project ที่ตั้งค่าให้ระบบนี้",
            "ORCA hosts the connector that calls the Google Drive API and manages OAuth through the Google Cloud project configured for this installation.",
          )}
        </p>
        <p class="k-small k-muted">
          {t(
            "ชื่อแอปบนหน้าขอสิทธิ์ของ Google ขึ้นอยู่กับการตั้งค่า OAuth ของ project นั้น บัญชีที่เคยเชื่อมกับผู้ให้บริการอื่นต้องเชื่อมใหม่แยกกัน",
            "The project’s OAuth configuration determines the app name on Google’s consent page. Accounts connected through another provider require a separate sign-in.",
          )}
        </p>
      {:else if providerKind === "obot"}
        <p class="k-small k-muted">
          {t(
            "การเชื่อมต่อนี้ผ่านบริการของ Obot บัญชีและสิทธิ์ผูกกับการเชื่อมต่อเดิม",
            "This connection uses Obot’s service. Its account and permissions stay with this connection.",
          )}
        </p>
      {:else if providerKind === "google"}
        <p class="k-small k-muted">
          {t(
            "เชื่อมกับบริการ Google Drive ของ Google",
            "Connects to Google’s Google Drive service.",
          )}
        </p>
      {/if}
      {#if providerHost}<p class="k-small k-muted">
        {t("เซิร์ฟเวอร์ต้นทาง", "Source server")}: <code>{providerHost}</code>
      </p>{/if}
      {#if providerKind === "obot" || providerKind === "google"}
        <p class="k-small k-muted">
          {t(
            "ชื่อแอปบนหน้าขอสิทธิ์ของ Google เป็นไปตามการตั้งค่าของผู้ให้บริการ",
            "The provider’s configuration determines the app name shown on Google’s consent page.",
          )}
        </p>
      {/if}
    </details>
  {/if}
</section>

<style>
  .source-heading {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .source-heading h3 {
    margin: 0;
  }
  .source-provider {
    margin-top: 18px;
    border-top: 1px solid var(--k-line);
    padding-top: 14px;
  }
  .source-provider summary {
    cursor: pointer;
  }
  .source-provider p {
    margin: 10px 0 0;
  }
  .source-provider code {
    overflow-wrap: anywhere;
  }
</style>
