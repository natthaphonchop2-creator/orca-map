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
        title: t("กำลังอ่านสถานะ", "Loading account status"),
        description: t(
          "อ่านข้อมูลบัญชีของคุณที่บันทึกไว้",
          "Reading your saved account metadata.",
        ),
      },
      unknown: {
        title: t("ยังอ่านสถานะไม่ได้", "Status unavailable"),
        description: t(
          "โหลดข้อมูลไม่สำเร็จ หรือสิทธิ์เข้าถึงมีการเปลี่ยนแปลง",
          "The metadata could not be loaded, or your access has changed.",
        ),
      },
      unverified: {
        title: t("ยังไม่ทราบสถานะ", "Status unknown"),
        description: t(
          "ยังไม่มีข้อมูลสถานะบัญชีจากระบบ",
          "No account status has been received.",
        ),
      },
      unavailable: {
        title: t("Gateway ยังไม่พร้อม", "Gateway unavailable"),
        description: t(
          "ให้ผู้ดูแลเปิด Gateway และตรวจเครื่องมือก่อนจัดการบัญชี",
          "Ask an administrator to activate the gateway and review its tools.",
        ),
      },
      "client-needed": {
        title: t("รอตั้งค่า OAuth", "OAuth setup needed"),
        description: t(
          "ผู้ดูแลต้องตั้งค่า OAuth ของระบบนี้ก่อน",
          "An administrator must configure this source’s OAuth client.",
        ),
      },
      "account-needed": {
        title: t("ยังไม่เชื่อมบัญชี", "Account not connected"),
        description: t(
          "เปิด Gateway เพื่อเชื่อมบัญชีของคุณ",
          "Open the gateway to connect your own account.",
        ),
      },
      "not-configured": {
        title: t("ยังไม่ตั้งค่าบัญชี", "Account setup needed"),
        description: t(
          "ยังไม่มีการตั้งค่าบัญชีที่ครบถ้วน",
          "Your saved account configuration is incomplete.",
        ),
      },
      "account-connected": {
        title: t("มีการอนุญาตที่บันทึกไว้", "Saved authorization"),
        description: t(
          "พบการอนุญาต OAuth ของคุณ ยังไม่ได้ตรวจระบบต้นทาง",
          "Your OAuth authorization is saved; the provider has not been checked.",
        ),
      },
      configured: {
        title: t("มีการตั้งค่าที่บันทึกไว้", "Saved configuration"),
        description: t(
          "บันทึกการตั้งค่าไว้แล้ว ยังไม่ได้ตรวจระบบต้นทาง",
          "Your configuration is saved; the provider has not been checked.",
        ),
      },
    });
</script>

<section class="my-connections" aria-labelledby="accounts-title">
  <header class="accounts-heading">
    <div>
      <h1 id="accounts-title">{t("บัญชีที่เชื่อมไว้", "My accounts")}</h1>
      <p>
        {t(
          "จัดการบัญชีส่วนตัวของคุณสำหรับระบบที่ใช้ผ่าน MCP Gateways ที่คุณเป็นสมาชิก",
          "Manage your personal accounts for sources used by MCP Gateways you belong to.",
        )}
      </p>
    </div>
    <button class="k-button" onclick={refresh} disabled={loading}
      ><RefreshCw size={15} class={loading ? "k-spin" : ""} />{t(
        "โหลดสถานะใหม่",
        "Refresh status",
      )}</button
    >
  </header>
  <div class="accounts-notice">
    <ShieldCheck size={16} />
    <p>
      {t(
        "หน้านี้อ่านเฉพาะสถานะการตั้งค่าที่บันทึกไว้ การอนุญาตที่มีอยู่ยังไม่ยืนยันว่าเรียกข้อมูลจากระบบต้นทางได้",
        "This page reads saved account metadata. A saved authorization does not confirm that provider requests will succeed.",
      )}
    </p>
  </div>
  {#if sources.length}
    <div class="accounts-toolbar">
      <div class="accounts-search">
        <Search size={16} /><input
          type="search"
          bind:value={query}
          aria-label={t("ค้นหาบัญชีของฉัน", "Search my accounts")}
          placeholder={t(
            "ค้นหาระบบหรือ Gateway…",
            "Search a source or gateway…",
          )}
        />{#if query}<button
            onclick={() => (query = "")}
            aria-label={t("ล้างคำค้น", "Clear search")}><X size={15} /></button
          >{/if}
      </div>
      <span role="status">{visible.length} {t("ระบบ", "sources")}</span>
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
                size={28}
              /></span
            >
            <div>
              <h2>{sourceName}</h2>
              <p>{source.connections.map((item) => item.name).join(" · ")}</p>
            </div>
          </div>
          <div class="account-status">
            <span
              class="status-label"
              class:saved={status === "account-connected" ||
                status === "configured"}
              >{#if status === "loading"}<LoaderCircle
                  size={14}
                  class="k-spin"
                />{:else if status === "unknown"}<CircleAlert
                  size={14}
                />{:else}<KeyRound size={14} />{/if}{states[status].title}</span
            >
            <p>{states[status].description}</p>
          </div>
          <div class="account-actions">
            {#if status === "unknown"}<button
                class="retry"
                onclick={() => reader.retry(source.sourceID)}
                ><RefreshCw size={14} />{t("ลองอีกครั้ง", "Retry")}</button
              >{/if}<a class="k-button small" href={manageHref(source)}
              >{canConnectSource(source) &&
              (status === "account-needed" || status === "not-configured")
                ? t("เชื่อมบัญชี", "Connect account")
                : t("เปิด Gateway", "Open gateway")}<ArrowRight size={14} /></a
            >
          </div>
          <div class="linked-gateways">
            <span>MCP Gateways</span>
            <div>
              {#each source.hubs as hub (hub.id)}<a
                  href={localeHref(
                    `/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=connect`,
                  )}
                  >{hub.name}{#if hub.status !== "active"}<small
                      >{hub.status === "draft"
                        ? t("แบบร่าง", "Draft")
                        : t("ระงับ", "Paused")}</small
                    >{/if}</a
                >{/each}
            </div>
          </div>
        </article>
      {:else}<div class="accounts-empty">
          <Search size={27} />
          <h2>{t("ไม่พบระบบที่ตรงกับคำค้น", "No matching sources")}</h2>
          <button class="k-button" onclick={() => (query = "")}
            >{t("ล้างคำค้น", "Clear search")}</button
          >
        </div>{/each}
    </div>
  {:else}<div class="accounts-empty">
      <KeyRound size={30} />
      <h2>
        {t(
          "ยังไม่มีระบบสำหรับบัญชีของคุณ",
          "No sources assigned to your account",
        )}
      </h2>
      <p>
        {t(
          "ระบบจะแสดงที่นี่เมื่อคุณเป็นสมาชิกของ MCP Gateway ที่มีการเชื่อมต่อ ผู้ดูแลสามารถเพิ่มสิทธิ์ให้คุณได้",
          "Sources appear here when you are a member of an MCP Gateway with a connection. Ask your administrator to add your access.",
        )}
      </p>
      <a class="k-button" href={localeHref("/app?view=workspaces")}
        >{t("ดู MCP Gateways", "View MCP Gateways")}<ArrowRight size={15} /></a
      >
    </div>{/if}
</section>

<style>
  .my-connections {
    min-width: 0;
  }
  .accounts-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    margin-bottom: 21px;
  }
  .accounts-heading h1 {
    font-size: 20px;
    line-height: 1.35;
    font-weight: 650;
    margin: 0;
  }
  .accounts-heading p {
    font-size: 13px;
    color: var(--k-muted);
    margin-top: 6px;
    line-height: 1.7;
  }
  .accounts-heading > button {
    flex-shrink: 0;
  }
  .accounts-notice {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 12px 14px;
    border: 1px solid #e4e8de;
    border-radius: 7px;
    background: #fafcf6;
    color: #68745a;
    margin-bottom: 22px;
  }
  .accounts-notice :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }
  .accounts-notice p {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
  }
  .accounts-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .accounts-toolbar > span {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--k-muted);
  }
  .accounts-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(410px, 100%);
    border: 1px solid var(--k-line);
    border-radius: 6px;
    padding: 0 11px;
    color: var(--k-muted);
  }
  .accounts-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    padding: 9px 0;
    outline: none;
    background: transparent;
    font: inherit;
    font-size: 12px;
  }
  .accounts-search:focus-within {
    outline: 2px solid #7a9a37;
    outline-offset: 2px;
  }
  .accounts-search button {
    display: grid;
    place-items: center;
    border: 0;
    background: none;
    color: inherit;
    padding: 3px;
  }
  .accounts-list {
    border: 1px solid var(--k-line);
    border-radius: 8px;
    overflow: clip;
    background: white;
  }
  .account-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 16px 24px;
    padding: 19px 20px;
  }
  .account-row + .account-row {
    border-top: 1px solid var(--k-line);
  }
  .source-heading {
    display: flex;
    gap: 11px;
    align-items: flex-start;
    min-width: 0;
  }
  .source-icon {
    width: 40px;
    height: 40px;
    border: 1px solid #edf0e8;
    border-radius: 7px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .source-heading > div {
    min-width: 0;
  }
  h2 {
    font-size: 13px;
    line-height: 1.6;
    font-weight: 600;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .source-heading p,
  .account-status p {
    font-size: 11px;
    color: var(--k-muted);
    line-height: 1.7;
    margin: 4px 0 0;
    overflow-wrap: anywhere;
  }
  .status-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #7c7866;
  }
  .status-label.saved {
    color: #5f793c;
  }
  .status-label :global(svg) {
    flex-shrink: 0;
  }
  .account-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 9px;
  }
  .retry {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    background: none;
    color: #697849;
    font-size: 11px;
    padding: 0;
  }
  .linked-gateways {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 12px;
    border-top: 1px solid #f0f2ec;
    padding-top: 12px;
  }
  .linked-gateways > span {
    font-size: 10px;
    color: #899080;
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
    gap: 7px;
    font-size: 11px;
    color: #536e32;
    background: #f5f8ef;
    padding: 3px 8px;
    border-radius: 4px;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .linked-gateways small {
    color: #969b8f;
    font-size: 9px;
    flex-shrink: 0;
  }
  .accounts-empty {
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: center;
    gap: 13px;
    min-height: 250px;
    padding: 25px;
    text-align: center;
    color: var(--k-muted);
  }
  .accounts-empty h2 {
    font-size: 17px;
    color: var(--k-ink);
  }
  .accounts-empty p {
    max-width: 490px;
    font-size: 13px;
    line-height: 1.8;
    margin: 0;
  }
  @media (max-width: 1000px) {
    .account-row {
      gap: 14px 17px;
    }
  }
  @media (max-width: 640px) {
    .accounts-heading {
      flex-direction: column;
      gap: 13px;
    }
    .account-row {
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 16px;
    }
    .account-status {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .account-actions {
      grid-column: 2;
      grid-row: 1;
      justify-content: center;
    }
    .linked-gateways {
      flex-direction: column;
      gap: 7px;
    }
    .account-actions :global(.k-button) {
      padding-inline: 9px;
      font-size: 10px;
      min-height: 35px;
    }
    .source-heading {
      gap: 8px;
    }
    .source-icon {
      width: 32px;
      height: 32px;
    }
    .source-icon :global(svg) {
      width: 24px;
      height: 24px;
    }
  }
</style>
