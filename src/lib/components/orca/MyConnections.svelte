<script lang="ts">
  import { gatewayHasMember } from '$lib/orca/gateway-sources';
  import { onDestroy, untrack } from "svelte";
  import {
    ArrowRight,
    CircleAlert,
    KeyRound,
    LoaderCircle,
    RefreshCw,
    Search,
    ShieldCheck,
    X,
  } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { catalogSourceDisplayName } from "$lib/orca/catalog";
  import { workspaceToolingReady } from "$lib/orca/activation";
  import { sourceAccountState } from "$lib/orca/connection-presentation";
  import {
    personalAccountReader,
    personalSetup,
    personalSources,
    type PersonalSetup,
    type PersonalSource,
  } from "$lib/orca/personal-connections";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { OrcaService, type OrcaBootstrap } from "$lib/services/orca";

  let { data }: { data: OrcaBootstrap } = $props();
  type AccountRecord = {
    status: "loading" | "ready" | "error";
    setup?: PersonalSetup;
  };
  let query = $state("");
  let accounts = $state<Record<string, AccountRecord>>({});
  let accountUserID = $state("");
  const ownAccounts: Record<string, AccountRecord> = $derived(
    accountUserID === data.currentUserID ? accounts : {},
  );
  const sources = $derived(personalSources(data));
  const scope = $derived(
    JSON.stringify({
      user: data.currentUserID,
      manager: data.canManage,
      sources: sources.map((source) => ({
        id: source.sourceID,
        readable: source.canReadSetup,
        connections: source.connections.map((item) => [item.id, item.version]),
        hubs: source.hubs.map((item) => [item.id, item.version, item.status]),
      })),
    }),
  );
  const loading = $derived(
    Object.values(ownAccounts).some((record) => record.status === "loading"),
  );
  const visible = $derived(
    sources.filter((source) => {
      const text = [
        ownAccounts[source.sourceID]?.setup?.name,
        ...source.connections.map((item) => item.name),
        ...source.hubs.map((hub) => hub.name),
      ]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase();
      return query
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => text.includes(word));
    }),
  );
  const reader = personalAccountReader(
    async (sourceID, signal) =>
      personalSetup(await OrcaService.sourceSetup(sourceID, signal), sourceID),
    (event) => {
      accounts[event.sourceID] =
        event.status === "ready"
          ? { status: "ready", setup: event.value }
          : { status: event.status };
    },
  );
  function refresh() {
    accounts = {};
    accountUserID = data.currentUserID;
    reader.replace(
      sources
        .filter((source) => source.canReadSetup)
        .map((source) => source.sourceID),
    );
  }
  $effect(() => {
    const currentScope = scope;
    if (currentScope) untrack(refresh);
  });
  onDestroy(() => reader.dispose());
  function manageHref(source: PersonalSource) {
    return localeHref(
      `/app?view=hub&hub=${encodeURIComponent(source.manageHubID)}&tab=connect`,
    );
  }
  function canConnectSource(source: PersonalSource) {
    const gateway = source.hubs.find((hub) => hub.id === source.manageHubID);
    return Boolean(
      gateway &&
      gatewayHasMember(gateway, data.currentUserID) &&
      gateway.status === "active" &&
      workspaceToolingReady(
        gateway,
        source.connections,
      ),
    );
  }
  function accountState(source: PersonalSource) {
    const account = ownAccounts[source.sourceID];
    if (!source.canReadSetup) return "unavailable";
    if (!account || account.status === "loading") return "loading";
    if (account.status === "error") return "unknown";
    if (
      account.setup?.oauthClientRequired &&
      !account.setup.oauthClientConfigured
    )
      return "client-needed";
    return sourceAccountState(account.setup);
  }
  const states: Record<string, { title: string; description: string }> =
    $derived({
      loading: {
        title: t("กำลังโหลดสถานะบัญชี", "Loading account status"),
        description: t(
          "กำลังอ่านข้อมูลบัญชีที่บันทึกไว้",
          "Reading your saved account details.",
        ),
      },
      unknown: {
        title: t("อ่านสถานะไม่สำเร็จ", "Status unavailable"),
        description: t(
          "โหลดข้อมูลไม่สำเร็จ หรือสิทธิ์การเข้าถึงมีการเปลี่ยนแปลง กรุณาลองอีกครั้ง",
          "The account details could not be loaded, or your access has changed. Try again.",
        ),
      },
      unverified: {
        title: t("ยังไม่ทราบสถานะ", "Status unknown"),
        description: t(
          "ยังไม่ได้รับข้อมูลสถานะบัญชีจากระบบ",
          "No account status has been received from the system.",
        ),
      },
      unavailable: {
        title: t("พื้นที่ทำงาน AI ยังไม่พร้อม", "AI workspace not ready"),
        description: t(
          "ผู้ดูแลระบบต้องเปิดใช้งานพื้นที่ทำงาน AI และตรวจสอบเครื่องมือก่อน จึงจะจัดการบัญชีได้",
          "An administrator must activate the AI workspace and review its tools before you can manage this account.",
        ),
      },
      "client-needed": {
        title: t("รอผู้ดูแลระบบตั้งค่า", "Waiting for administrator setup"),
        description: t(
          "ผู้ดูแลระบบต้องตั้งค่าการลงชื่อเข้าใช้ (OAuth) ของระบบนี้ก่อน",
          "An administrator must set up sign-in (OAuth) for this system first.",
        ),
      },
      "account-needed": {
        title: t("ยังไม่เชื่อมบัญชี", "Account not connected"),
        description: t(
          "เปิดพื้นที่ทำงาน AI เพื่อเชื่อมบัญชีของคุณ",
          "Open the AI workspace to connect your own account.",
        ),
      },
      "not-configured": {
        title: t("ยังไม่ตั้งค่าบัญชี", "Account setup needed"),
        description: t(
          "การตั้งค่าบัญชียังไม่ครบถ้วน",
          "Your account settings are incomplete.",
        ),
      },
      "account-connected": {
        title: t("มีการอนุญาตที่บันทึกไว้", "Authorization saved"),
        description: t(
          "พบการอนุญาตด้วยบัญชีของคุณ (OAuth) ที่บันทึกไว้ ยังไม่ได้ตรวจสอบกับระบบ",
          "Your sign-in authorization (OAuth) is saved. It has not been checked with the system.",
        ),
      },
      configured: {
        title: t("บันทึกการตั้งค่าแล้ว", "Settings saved"),
        description: t(
          "บันทึกการตั้งค่าไว้แล้ว ยังไม่ได้ตรวจสอบกับระบบ",
          "Your settings are saved. They have not been checked with the system.",
        ),
      },
    });
</script>

<section class="my-connections" aria-labelledby="accounts-title">
  <header class="accounts-heading">
    <div>
      <h1 id="accounts-title">{t("บัญชีที่เชื่อมไว้", "My accounts")}</h1>
      <p class="k-subtitle">
        {t(
          "จัดการบัญชีส่วนตัวที่ใช้กับระบบในพื้นที่ทำงาน AI ที่คุณเป็นสมาชิก",
          "Manage the personal accounts you use with systems in the AI workspaces you belong to.",
        )}
      </p>
    </div>
    <button class="k-button" onclick={refresh} disabled={loading}
      ><RefreshCw size={16} class={loading ? "k-spin" : ""} aria-hidden="true" />{t(
        "โหลดสถานะอีกครั้ง",
        "Refresh status",
      )}</button
    >
  </header>
  <div class="k-banner accounts-notice">
    <ShieldCheck size={16} aria-hidden="true" />
    <p>
      {t(
        "หน้านี้แสดงเฉพาะสถานะการตั้งค่าที่บันทึกไว้ การอนุญาตที่บันทึกไว้ไม่ได้ยืนยันว่าจะเรียกข้อมูลจากระบบได้สำเร็จ",
        "This page shows saved account status only. A saved authorization does not confirm that requests to the system will succeed.",
      )}
    </p>
  </div>
  {#if sources.length}
    <div class="accounts-toolbar">
      <div class="accounts-search">
        <Search size={16} aria-hidden="true" /><input
          type="search"
          bind:value={query}
          aria-label={t("ค้นหาบัญชีที่เชื่อมไว้", "Search my accounts")}
          placeholder={t(
            "ค้นหาระบบหรือพื้นที่ทำงาน…",
            "Search systems or workspaces…",
          )}
        />{#if query}<button
            onclick={() => (query = "")}
            aria-label={t("ล้างคำค้น", "Clear search")}
            title={t("ล้างคำค้น", "Clear search")}><X size={16} aria-hidden="true" /></button
          >{/if}
      </div>
      <span role="status">{visible.length} {t("ระบบ", "systems")}</span>
    </div>
    <div class="accounts-list">
      {#each visible as source (source.sourceID)}
        {@const status = accountState(source)}
        {@const setup = ownAccounts[source.sourceID]?.setup}
        {@const sourceName = catalogSourceDisplayName({
          name: setup?.name || source.connections[0].name,
          endpointHost: setup?.endpointHost,
          managedProvider: setup?.managedProvider,
        })}
        <article class="account-row" aria-busy={status === "loading"}>
          <div class="source-heading">
            <span class="source-icon"
              ><CatalogIcon
                name={sourceName}
                size={24}
              /></span
            >
            <div>
              <h2 class="source-name">{sourceName}</h2>
              <p>{source.connections.map((item) => item.name).join(" · ")}</p>
            </div>
          </div>
          <div class="account-status">
            <span
              class="k-badge status-label"
              class:active={status === "account-connected" ||
                status === "configured"}
              class:paused={status === "unknown" ||
                status === "client-needed" ||
                status === "account-needed" ||
                status === "not-configured"}
              >{#if status === "loading"}<LoaderCircle
                  size={14}
                  class="k-spin"
                  aria-hidden="true"
                />{:else if status === "unknown"}<CircleAlert
                  size={14}
                  aria-hidden="true"
                />{:else}<KeyRound size={14} aria-hidden="true" />{/if}{states[status].title}</span
            >
            <p>{states[status].description}</p>
          </div>
          <div class="account-actions">
            {#if status === "unknown"}<button
                class="k-button small quiet retry"
                onclick={() => reader.retry(source.sourceID)}
                ><RefreshCw size={16} aria-hidden="true" />{t("ลองอีกครั้ง", "Try again")}</button
              >{/if}<a class="k-button small" href={manageHref(source)}
              >{canConnectSource(source) &&
              (status === "account-needed" || status === "not-configured")
                ? t("เชื่อมบัญชี", "Connect account")
                : t("เปิดพื้นที่ทำงาน AI", "Open AI workspace")}<ArrowRight size={16} aria-hidden="true" /></a
            >
          </div>
          <div class="linked-gateways">
            <span>{t("พื้นที่ทำงาน AI", "AI workspaces")}</span>
            <div>
              {#each source.hubs as hub (hub.id)}<a
                  href={localeHref(
                    `/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=connect`,
                  )}
                  >{hub.name}{#if hub.status !== "active"}<small
                      >{hub.status === "draft"
                        ? t("ฉบับร่าง", "Draft")
                        : t("ระงับ", "Paused")}</small
                    >{/if}</a
                >{/each}
            </div>
          </div>
        </article>
      {:else}<div class="accounts-empty">
          <Search size={24} aria-hidden="true" />
          <h2 class="empty-title">{t("ไม่พบระบบที่ตรงกับคำค้น", "No matching systems")}</h2>
          <button class="k-button small" onclick={() => (query = "")}
            >{t("ล้างคำค้น", "Clear search")}</button
          >
        </div>{/each}
    </div>
  {:else}<div class="accounts-empty accounts-panel">
      <KeyRound size={28} aria-hidden="true" />
      <h2 class="empty-title">
        {t(
          "ยังไม่มีระบบที่ใช้บัญชีของคุณ",
          "No systems are assigned to you",
        )}
      </h2>
      <p>
        {t(
          "ระบบจะแสดงที่นี่เมื่อคุณเป็นสมาชิกของพื้นที่ทำงาน AI ที่มีระบบเชื่อมต่อ ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์",
          "Systems appear here when you are a member of an AI workspace that uses them. Contact your administrator to request access.",
        )}
      </p>
      <a class="k-button small" href={localeHref("/app?view=workspaces")}
        >{t("ดูพื้นที่ทำงาน AI", "View AI workspaces")}<ArrowRight size={16} aria-hidden="true" /></a
      >
    </div>{/if}
</section>

<style>
  .my-connections {
    min-width: 0;
    color: var(--orca-ink);
  }
  .accounts-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px 24px;
    margin-bottom: 20px;
  }
  .accounts-heading h1 {
    margin: 0;
  }
  .accounts-heading > button {
    flex-shrink: 0;
  }
  .my-connections .accounts-notice {
    margin: 0 0 16px;
  }
  .accounts-notice p {
    margin: 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  .accounts-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    margin-bottom: 14px;
  }
  .accounts-toolbar > span {
    flex-shrink: 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .accounts-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(320px, 100%);
    height: 36px;
    padding: 0 11px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-subtle);
  }
  .accounts-search:focus-within {
    border-color: var(--orca-ink);
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .accounts-search :global(svg) {
    flex: none;
  }
  .accounts-search input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
  }
  .accounts-search input::placeholder {
    color: var(--orca-subtle);
  }
  .accounts-search input:focus-visible {
    outline: none;
  }
  /* The field has its own clear button, so the browser's is hidden. */
  .accounts-search input::-webkit-search-cancel-button {
    display: none;
    -webkit-appearance: none;
  }
  .accounts-search button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-right: -6px;
    border: 0;
    border-radius: var(--orca-radius-sm);
    background: none;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .accounts-search button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .accounts-list,
  .accounts-panel {
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    overflow: clip;
  }
  .account-row {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px 24px;
    padding: 14px 18px;
  }
  .account-row + .account-row {
    border-top: 1px solid #eff0f2;
  }
  .source-heading {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
  }
  .source-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .source-heading > div {
    min-width: 0;
  }
  .source-heading .source-name {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .source-heading p,
  .account-status p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .account-status p {
    margin-top: 6px;
  }
  .status-label :global(svg) {
    flex-shrink: 0;
  }
  .account-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .account-actions > :global(.k-button) {
    white-space: nowrap;
  }
  .linked-gateways {
    display: flex;
    align-items: baseline;
    gap: 12px;
    grid-column: 1 / -1;
    padding-top: 10px;
    border-top: 1px solid #eff0f2;
  }
  .linked-gateways > span {
    color: var(--orca-subtle);
    font-size: 12px;
    white-space: nowrap;
  }
  .linked-gateways > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .linked-gateways a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 1px 8px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-sm);
    background: var(--orca-surface);
    color: var(--orca-ink);
    font-size: 13px;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .linked-gateways a:hover {
    border-color: var(--orca-line-strong);
    background: var(--orca-surface-2);
  }
  .linked-gateways small {
    flex-shrink: 0;
    color: var(--orca-muted);
    font-size: 12px;
  }
  .accounts-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 220px;
    padding: 32px 24px;
    color: var(--orca-subtle);
    text-align: center;
  }
  .accounts-empty .empty-title {
    margin: 4px 0 0;
    color: var(--orca-ink);
    font-size: 15px;
    font-weight: 600;
  }
  .accounts-empty p {
    max-width: 460px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .accounts-empty > :global(.k-button) {
    margin-top: 8px;
  }
  @media (max-width: 760px) {
    .accounts-heading {
      flex-direction: column;
    }
    .accounts-heading > button {
      width: 100%;
    }
    .accounts-toolbar {
      flex-wrap: wrap;
    }
    .accounts-search {
      width: 100%;
    }
    .account-row {
      grid-template-columns: minmax(0, 1fr);
      padding: 14px 16px;
    }
    .account-actions {
      justify-content: flex-start;
    }
    .linked-gateways {
      flex-direction: column;
      gap: 6px;
    }
  }
</style>
