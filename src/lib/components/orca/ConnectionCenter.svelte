<script lang="ts">
  import { gatewayUsesConnection } from "$lib/orca/gateway-sources";
  import LifecycleActions from "./LifecycleActions.svelte";
  import { page } from "$app/state";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { connectionReady } from "$lib/orca/activation";
  import {
    filterConnections,
    connectionPage,
    type ConnectionFilter,
  } from "$lib/orca/connection-list";
  import { sourcePresentationNames } from "$lib/orca/connection-presentation";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    orcaError,
    type OrcaBootstrap,
    type OrcaCandidate,
  } from "$lib/services/orca";
  import {
    ArrowRight,
    Check,
    ChevronLeft,
    ChevronRight,
    FileCheck2,
    Info,
    Plus,
    Search,
  } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";

  let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
  let notice = $state("");
  async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
    notice = action === 'archive' ? t('จัดเก็บ Server แล้ว ดูได้ที่แท็บจัดเก็บแล้ว', 'Server archived. Find it under Archived.')
      : action === 'restore' ? t('กู้คืน Server แล้ว โดยยังปิดใช้งานอยู่', 'Server restored and remains disabled.')
      : t('ลบ Server แล้ว', 'Server deleted.');
    await onchanged();
  }
  let candidates = $state<OrcaCandidate[]>([]);
  let error = $state("");
  let query = $state("");
  let statusFilter = $state<ConnectionFilter>(
    ["reviewed", "needs-review", "paused", "archived"].includes(
      page.url.searchParams.get("status") || "",
    )
      ? (page.url.searchParams.get("status") as ConnectionFilter)
      : "all",
  );
  let pageNumber = $state(1);
  let alive = true;
  const filtered = $derived(
    filterConnections(data.connections, query, statusFilter),
  );
  const currentPage = $derived(connectionPage(filtered, pageNumber));
  const filters = $derived([
    { id: "all" as const, label: t("ทั้งหมด", "All") },
    {
      id: "reviewed" as const,
      label: t("เปิดใช้และตรวจเครื่องมือแล้ว", "Enabled & tools reviewed"),
    },
    { id: "needs-review" as const, label: t("รอตรวจสอบ", "Needs review") },
    { id: "paused" as const, label: t("ระงับแล้ว", "Paused") },
    ...(data.canManage ? [{ id: "archived" as const, label: t("จัดเก็บแล้ว", "Archived") }] : []),
  ]);
  async function loadCandidates() {
    if (!data.canManage) return;
    error = "";
    try {
      const result = await OrcaService.candidates();
      if (alive) candidates = result;
    } catch (cause) {
      if (alive) error = orcaError(cause);
    }
  }
  $effect(() => {
    if (pageNumber !== currentPage.page) pageNumber = currentPage.page;
  });
  onMount(() => {
    void loadCandidates();
  });
  onDestroy(() => {
    alive = false;
  });
  const presentationNames = $derived(sourcePresentationNames(candidates));
</script>

<div class="connection-heading connections-section-heading">
  <div>
    <h1>Servers</h1>
    <p>
      {t(
        "ตั้งค่าระบบต้นทางและขอบเขตเครื่องมือที่องค์กรอนุญาต",
        "Configure source systems and the maximum set of tools approved by your organization.",
      )}
    </p>
  </div>
  {#if data.canManage}<a
      class="k-button primary"
      href={localeHref("/app?view=servers&add=source")}
      ><Plus size={19} />{t("เพิ่ม Server", "Add server")}</a
    >{/if}
</div>
{#if notice}<div class="k-banner success" role="status">{notice}</div>{/if}
<div class="connections-list-controls">
  <label class="connections-list-search"
    ><Search size={17} /><input
      bind:value={query}
      oninput={() => (pageNumber = 1)}
      placeholder={t("ค้นหาชื่อหรือคำอธิบาย", "Search name or description")}
      aria-label={t("ค้นหา Servers", "Search servers")}
    /></label
  >
  <div
    class="connections-list-filters"
    role="group"
    aria-label={t("กรองสถานะ Servers", "Filter server status")}
  >
    {#each filters as filter}<button
        class:chosen={statusFilter === filter.id}
        aria-pressed={statusFilter === filter.id}
        onclick={() => {
          statusFilter = filter.id;
          pageNumber = 1;
        }}>{filter.label}</button
      >{/each}
  </div>
</div>
{#if error}<div class="k-banner error" role="alert">
    <Info size={18} />
    <div>
      {error}<button class="k-link-button" onclick={loadCandidates}
        >{t("ลองอีกครั้ง", "Retry")}</button
      >
    </div>
  </div>{/if}
<div class="connections-list-summary" role="status" aria-live="polite">
  {t(
    `แสดง ${currentPage.start}–${currentPage.end} จาก ${currentPage.total} Servers`,
    `Showing ${currentPage.start}–${currentPage.end} of ${currentPage.total} servers`,
  )}{#if filtered.length !== data.connections.length}<span
      >{t(
        `จากทั้งหมด ${data.connections.length}`,
        `${data.connections.length} total`,
      )}</span
    >{/if}
</div>
<div class="connection-table-wrap">
  <table class="connection-table">
    <thead
      ><tr
        ><th scope="col">{t("ชื่อ", "Name")}</th><th scope="col">MCP Gateways</th
        ><th scope="col">{t("เครื่องมือ", "Tools")}</th><th scope="col"
          >{t("สิทธิ์การใช้งาน", "Access")}</th
        ><th scope="col">{t("จัดการ", "Manage")}</th></tr
      ></thead
    ><tbody>
      {#each currentPage.items as connection (connection.id)}
        {@const affectedGateways = data.hubs.filter((hub) => gatewayUsesConnection(hub, connection.id) && hub.status !== 'deleted')}
        {@const gatewayCount = affectedGateways.length}
        <tr
          ><td class="connection-name-cell"
            ><a
              class="connection-name"
              href={localeHref(
                `/app?view=servers&connection=${encodeURIComponent(connection.id)}`,
              )}
              ><CatalogIcon
                name={presentationNames[connection.mcpID] || connection.name}
                size={36}
              /><span
                ><strong>{connection.name}</strong><small
                  >{connection.description ||
                    t("ระบบขององค์กร", "Company system")}</small
                ></span
              ></a
            ></td
          ><td
            class="connection-gateways-cell"
            data-label="MCP Gateways"
            ><a href={localeHref(`/app?view=servers&connection=${encodeURIComponent(connection.id)}&tab=workspaces`)}
              >{gatewayCount} {gatewayCount === 1 ? "Gateway" : "Gateways"}</a
            ></td
          ><td
            class="connection-tools-cell"
            data-label={t("เครื่องมือ", "Tools")}
            ><span
              >{connection.toolNames.length
                ? t("เครื่องมือที่เลือก", "Selected tools")
                : "—"}</span
            >{#if connection.toolNames.length}<small
                >{connection.toolNames.length}
                {t("เครื่องมือ", "tools")}</small
              >{/if}</td
          ><td
            class="connection-access-cell"
            data-label={t("สิทธิ์การใช้งาน", "Access")}
            ><span
              class="connection-status"
              class:reviewed={connectionReady(connection)}
              >{#if connectionReady(connection)}<Check
                  size={13}
                />{/if}{connection.archivedAt ? t("จัดเก็บแล้ว", "Archived") : !connection.enabled
                ? t("ระงับแล้ว", "Paused")
                : connectionReady(connection)
                  ? t("ตรวจเครื่องมือแล้ว", "Tools reviewed")
                  : t("รอตรวจสอบ", "Review needed")}</span
            >{#if connection.reviewedReadOnly}<small
                >{t("อ่านข้อมูลเท่านั้น", "Read only")}</small
              >{:else if connection.reviewedTools}<small>{t("ตามเครื่องมือที่เลือก", "Selected tools")}</small>{/if}</td
          ><td class="connection-manage-cell"
            ><a
              class="connection-manage"
              href={localeHref(
                `/app?view=servers&connection=${encodeURIComponent(connection.id)}`,
              )}>{t("การตั้งค่า", "Settings")}<ArrowRight size={17} /></a
            >
            {#if data.canManage}<div class="server-lifecycle-actions"><LifecycleActions entity={connection} kind="server" archived={Boolean(connection.archivedAt)} canManage={data.canManage} {affectedGateways} compact onchanged={lifecycleChanged} onreload={onchanged} /></div>{/if}
            </td
          ></tr
        >
      {:else}<tr
          ><td colspan="5" class="connection-table-empty"
            >{query || statusFilter !== "all"
              ? t("ไม่พบ Server ที่ตรงกับคำค้น", "No matching servers.")
              : t(
                  "ยังไม่มี Server ที่ตั้งค่าไว้ เลือกเพิ่ม Server เพื่อเริ่มต้น",
                  "No servers configured yet. Add a server to get started.",
                )}</td
          ></tr
        >{/each}
    </tbody>
  </table>
</div>
<nav
  class="connections-list-pagination"
  aria-label={t("หน้ารายการ Servers", "Server pages")}
>
  <span
    >{t(
      `หน้า ${currentPage.page} จาก ${currentPage.pages}`,
      `Page ${currentPage.page} of ${currentPage.pages}`,
    )}</span
  >
  <div>
    <button
      class="k-button small"
      disabled={currentPage.page <= 1}
      onclick={() => (pageNumber = currentPage.page - 1)}
      ><ChevronLeft size={16} />{t("ก่อนหน้า", "Previous")}</button
    ><button
      class="k-button small"
      disabled={currentPage.page >= currentPage.pages}
      onclick={() => (pageNumber = currentPage.page + 1)}
      >{t("ถัดไป", "Next")}<ChevronRight size={16} /></button
    >
  </div>
</nav>
<div class="connection-trust">
  <span><FileCheck2 size={27} strokeWidth={1.6} /></span>
  <div>
    <strong
      >{t(
        "ข้อมูลของคุณอยู่ภายใต้สิทธิ์ที่คุณกำหนด",
        "Your data stays under your control",
      )}</strong
    >
    <p>
      {t(
        "กำหนดเครื่องมือที่องค์กรอนุญาตไว้ที่ Server แล้วเลือกเครื่องมือย่อยและสมาชิกในแต่ละ MCP Gateway",
        "Approve the maximum tool set on the server, then choose a subset of tools and members for each MCP Gateway.",
      )}
    </p>
  </div>
</div>

<style>
  .server-lifecycle-actions { margin-top: 10px; }
  .connections-list-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 13px 18px;
    margin-bottom: 19px;
  }
  .connections-list-search {
    display: flex;
    align-items: center;
    flex: 1 1 240px;
    gap: 9px;
    min-height: 42px;
    max-width: 400px;
    padding: 8px 13px;
    border: 1px solid #dce3ed;
    border-radius: 6px;
    color: #76849b;
  }
  .connections-list-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
    color: #22314b;
    font: inherit;
    font-size: 12px;
  }
  .connections-list-search:focus-within {
    outline: 2px solid #87aee0;
    outline-offset: 2px;
  }
  .connections-list-search :global(svg) {
    flex-shrink: 0;
  }
  .connections-list-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .connections-list-filters button {
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: #728096;
    padding: 8px 11px;
    font: inherit;
    font-size: 12px;
    min-height: 36px;
    cursor: pointer;
  }
  .connections-list-filters button:hover {
    background: #f4f6f9;
  }
  .connections-list-filters button.chosen {
    color: #253813;
    border-color: #e1eebf;
    background: #eff9d8;
    font-weight: 600;
  }
  .connections-list-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    color: #6e7c93;
    font-size: 12px;
  }
  .connections-list-summary > span {
    color: #96a0b0;
    font-size: 11px;
  }
  .connections-list-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: -5px 0 26px;
  }
  .connections-list-pagination > span {
    font-size: 12px;
    color: #79869a;
  }
  .connections-list-pagination > div {
    display: flex;
    gap: 8px;
  }
  .connections-list-pagination button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
  @media (max-width: 640px) {
    .connections-list-controls {
      gap: 13px;
    }
    .connections-list-search {
      max-width: none;
      flex-basis: 100%;
    }
    .connections-list-filters {
      gap: 4px;
    }
    .connections-list-filters button {
      padding-inline: 9px;
      font-size: 11px;
    }
    .connections-list-pagination {
      flex-wrap: wrap;
      gap: 12px;
    }
    .connections-list-pagination > div {
      margin-left: auto;
    }
  }
</style>
