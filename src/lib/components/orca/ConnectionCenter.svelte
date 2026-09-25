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
  import { connectionHealthView, healthByConnection } from "$lib/orca/connection-health";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    displayDate,
    orcaError,
    type OrcaBootstrap,
    type OrcaCandidate,
    type OrcaConnectionHealth,
  } from "$lib/services/orca";
  import {
    Activity,
    Check,
    ChevronLeft,
    ChevronRight,
    FileCheck2,
    Info,
    Plug,
    Plus,
    Search,
    Settings2,
  } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";

  let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
  let notice = $state("");
  async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
    notice = action === 'archive' ? t('จัดเก็บระบบแล้ว ดูได้ที่ตัวกรอง “จัดเก็บแล้ว”', 'System archived. It is listed under Archived.')
      : action === 'restore' ? t('กู้คืนระบบแล้ว ระบบยังอยู่ในสถานะระงับ', 'System restored. It remains paused.')
      : t('ลบระบบแล้ว', 'System deleted.');
    await onchanged();
  }
  let candidates = $state<OrcaCandidate[]>([]);
  // Health is advisory: if it cannot load, the column says so and the page still works.
  let health = $state<Map<string, OrcaConnectionHealth>>();
  let healthUnavailable = $state(false);
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
      label: t("เปิดใช้งานและตรวจสอบแล้ว", "Active and reviewed"),
    },
    { id: "needs-review" as const, label: t("รอตรวจสอบ", "Needs review") },
    { id: "paused" as const, label: t("ระงับ", "Paused") },
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
  async function loadHealth() {
    if (!data.canManage) return;
    try {
      const result = await OrcaService.connectionHealth();
      if (alive) health = healthByConnection(result.items);
    } catch {
      if (alive) healthUnavailable = true;
    }
  }
  const failureName = (category?: string) =>
    category === "timeout" ? t("หมดเวลา", "timed out")
      : category === "upstream_error" ? t("ระบบปลายทางขัดข้อง", "the system returned an error")
      : category === "invalid_response" ? t("ข้อมูลตอบกลับอ่านไม่ได้", "unreadable response")
      : category === "tool_changed" ? t("เครื่องมือเปลี่ยนที่ผู้ให้บริการ", "a tool changed at the vendor")
      : t("ข้อผิดพลาด", "error");
  onMount(() => {
    void loadCandidates();
    void loadHealth();
  });
  onDestroy(() => {
    alive = false;
  });
  const presentationNames = $derived(sourcePresentationNames(candidates));
</script>

<div class="systems">
  <header class="systems-head">
    <div>
      <h1>{t("ระบบที่เชื่อมต่อ", "Connected systems")}</h1>
      <p class="k-subtitle">
        {t(
          "ตั้งค่าระบบที่เชื่อมต่อและกำหนดเครื่องมือที่องค์กรอนุญาต",
          "Set up connected systems and the tools your organization allows.",
        )}
      </p>
    </div>
    {#if data.canManage}<div class="systems-actions">
        <a class="k-button primary" href={localeHref("/app?view=servers&add=source")}
          ><Plus size={16} aria-hidden="true" />{t("เพิ่มระบบ", "Add a system")}</a
        >
      </div>{/if}
  </header>
  {#if notice}<div class="k-banner success systems-notice" role="status">{notice}</div>{/if}
  <div class="systems-toolbar">
    <label class="systems-search"
      ><Search size={16} aria-hidden="true" /><input
        bind:value={query}
        oninput={() => (pageNumber = 1)}
        placeholder={t("ค้นหาจากชื่อหรือคำอธิบาย", "Search by name or description")}
        aria-label={t("ค้นหาระบบ", "Search systems")}
      /></label
    >
    <div
      class="systems-filter"
      role="group"
      aria-label={t("กรองตามสถานะ", "Filter by status")}
    >
      {#each filters as filter}<button
          type="button"
          class:selected={statusFilter === filter.id}
          aria-pressed={statusFilter === filter.id}
          onclick={() => {
            statusFilter = filter.id;
            pageNumber = 1;
          }}>{filter.label}</button
        >{/each}
    </div>
  </div>
  {#if error}<div class="k-banner error systems-notice" role="alert">
      <Info size={16} aria-hidden="true" />
      <div>
        {error}<button class="k-link-button systems-retry" onclick={loadCandidates}
          >{t("ลองอีกครั้ง", "Try again")}</button
        >
      </div>
    </div>{/if}
  <div class="systems-panel">
    <div class="systems-table-wrap">
      <table class="systems-table">
        <thead
          ><tr
            ><th scope="col">{t("ชื่อ", "Name")}</th><th scope="col">{t("พื้นที่ทำงาน AI", "AI workspaces")}</th
            ><th scope="col">{t("เครื่องมือ", "Tools")}</th><th scope="col"
              >{t("สถานะ", "Status")}</th
            >{#if data.canManage}<th scope="col">{t("การใช้งาน 7 วัน", "Last 7 days")}</th>{/if}<th scope="col" class="actions-col">{t("จัดการ", "Manage")}</th></tr
          ></thead
        ><tbody>
          {#each currentPage.items as connection (connection.id)}
            {@const affectedGateways = data.hubs.filter((hub) => gatewayUsesConnection(hub, connection.id) && hub.status !== 'deleted')}
            {@const gatewayCount = affectedGateways.length}
            <tr
              ><td class="systems-name"
                ><a
                  class="systems-name-link"
                  href={localeHref(
                    `/app?view=servers&connection=${encodeURIComponent(connection.id)}`,
                  )}
                  ><span class="systems-logo"
                    ><CatalogIcon
                      name={presentationNames[connection.mcpID] || connection.name}
                      size={20}
                    /></span
                  ><span class="systems-name-copy"
                    ><strong>{connection.name}</strong><small
                      >{connection.description ||
                        t("ระบบขององค์กร", "Organization system")}</small
                    ></span
                  ></a
                ></td
              ><td
                class="systems-gateways"
                data-label={t("พื้นที่ทำงาน AI", "AI workspaces")}
                ><a href={localeHref(`/app?view=servers&connection=${encodeURIComponent(connection.id)}&tab=workspaces`)}
                  >{t(`${gatewayCount} พื้นที่ทำงาน`, gatewayCount === 1 ? "1 workspace" : `${gatewayCount} workspaces`)}</a
                ></td
              ><td
                class="systems-tools"
                data-label={t("เครื่องมือ", "Tools")}
                ><span
                  >{connection.toolNames.length
                    ? t("เครื่องมือที่อนุญาต", "Allowed tools")
                    : "—"}</span
                >{#if connection.toolNames.length}<small
                    >{connection.toolNames.length}
                    {t("เครื่องมือ", "tools")}</small
                  >{/if}</td
              ><td
                class="systems-status"
                data-label={t("สถานะ", "Status")}
                ><span
                  class="k-badge"
                  class:active={connectionReady(connection)}
                  class:paused={!connection.archivedAt && !connectionReady(connection)}
                  >{#if connectionReady(connection)}<Check
                      size={14}
                      aria-hidden="true"
                    />{/if}{connection.archivedAt ? t("จัดเก็บแล้ว", "Archived") : !connection.enabled
                    ? t("ระงับ", "Paused")
                    : connectionReady(connection)
                      ? t("ตรวจสอบเครื่องมือแล้ว", "Tools reviewed")
                      : t("รอตรวจสอบ", "Needs review")}</span
                >{#if connection.reviewedReadOnly}<small
                    >{t("อ่านข้อมูลเท่านั้น", "Read-only")}</small
                  >{:else if connection.reviewedTools}<small>{t("ตามเครื่องมือที่อนุญาต", "Allowed tools")}</small>{/if}</td
              >{#if data.canManage}{@const view = connectionHealthView(health?.get(connection.id))}<td
                class="systems-health"
                data-label={t("การใช้งาน 7 วัน", "Last 7 days")}
                title={view.lastFailureAt ? t(`ล้มเหลวล่าสุด ${displayDate(view.lastFailureAt)}: ${failureName(view.lastFailureCategory)}`, `Last failure ${displayDate(view.lastFailureAt)}: ${failureName(view.lastFailureCategory)}`) : undefined}
                >{#if healthUnavailable}<span class="health-muted">{t("ดูข้อมูลการใช้งานไม่ได้", "Usage unavailable")}</span>{:else if !health}<span class="health-muted">…</span>{:else}<span class="health-badge tone-{view.tone}"
                    ><Activity size={13} aria-hidden="true" />{view.tone === "ok"
                      ? t("ปกติ", "Healthy")
                      : view.tone === "warn"
                        ? view.changed ? t("ต้องตรวจเครื่องมือ", "Review tools") : t("มีปัญหาบางครั้ง", "Some failures")
                        : view.tone === "bad"
                          ? t("ใช้งานไม่ได้", "Failing")
                          : t("ยังไม่มีการใช้งาน", "No recent use")}</span
                  ><small
                    >{view.tone === "idle"
                      ? t("ใน 7 วันที่ผ่านมา", "in the last 7 days")
                      : view.tone === "bad" && view.lastFailureCategory
                        ? t(`ล่าสุด: ${failureName(view.lastFailureCategory)}`, `Latest: ${failureName(view.lastFailureCategory)}`)
                        : t(`สำเร็จ ${view.succeeded} จาก ${view.attempts} ครั้ง`, `${view.succeeded} of ${view.attempts} succeeded`)}</small
                  >{#if view.needsSignIn}<small class="health-signin"
                      >{t(`${view.needsSignIn} ครั้งต้องเข้าสู่ระบบใหม่`, `${view.needsSignIn} needed sign-in`)}</small
                    >{/if}{/if}</td
              >{/if}<td class="actions-col"
                ><div class="systems-row-actions">
                  <a
                    class="k-button small"
                    href={localeHref(
                      `/app?view=servers&connection=${encodeURIComponent(connection.id)}`,
                    )}><Settings2 size={16} aria-hidden="true" />{t("การตั้งค่า", "Settings")}</a
                  >
                  {#if data.canManage}<LifecycleActions entity={connection} kind="server" archived={Boolean(connection.archivedAt)} canManage={data.canManage} {affectedGateways} compact onchanged={lifecycleChanged} onreload={onchanged} />{/if}
                </div></td
              ></tr
            >
          {:else}<tr class="systems-empty-row"
              ><td colspan={data.canManage ? 6 : 5}
                ><div class="systems-empty">
                  {#if query || statusFilter !== "all"}<Search size={24} aria-hidden="true" />{:else}<Plug
                      size={24}
                      aria-hidden="true"
                    />{/if}
                  <p>
                    {query || statusFilter !== "all"
                      ? t("ไม่พบระบบที่ตรงกับคำค้นหรือตัวกรอง", "No systems match your search or filter.")
                      : t(
                          "ยังไม่มีระบบที่เชื่อมต่อ เลือก “เพิ่มระบบ” เพื่อเริ่มต้น",
                          "No connected systems yet. Add a system to get started.",
                        )}
                  </p>
                </div></td
              ></tr
            >{/each}
        </tbody>
      </table>
    </div>
    <footer class="systems-foot">
      <div class="systems-summary" role="status" aria-live="polite">
        {t(
          `แสดง ${currentPage.start}–${currentPage.end} จาก ${currentPage.total} ระบบ`,
          `Showing ${currentPage.start}–${currentPage.end} of ${currentPage.total} systems`,
        )}{#if filtered.length !== data.connections.length}<span
            >{t(
              `จากทั้งหมด ${data.connections.length} ระบบ`,
              `${data.connections.length} in total`,
            )}</span
          >{/if}
      </div>
      <nav
        class="systems-pages"
        aria-label={t("เลขหน้ารายการระบบ", "System list pages")}
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
            ><ChevronLeft size={16} aria-hidden="true" />{t("ก่อนหน้า", "Previous")}</button
          ><button
            class="k-button small"
            disabled={currentPage.page >= currentPage.pages}
            onclick={() => (pageNumber = currentPage.page + 1)}
            >{t("ถัดไป", "Next")}<ChevronRight size={16} aria-hidden="true" /></button
          >
        </div>
      </nav>
    </footer>
  </div>
  <div class="k-banner systems-note">
    <FileCheck2 size={16} aria-hidden="true" />
    <div>
      <strong
        >{t(
          "การเข้าถึงข้อมูลเป็นไปตามสิทธิ์ที่องค์กรกำหนด",
          "Data access follows the permissions you set",
        )}</strong
      >
      <p>
        {t(
          "กำหนดเครื่องมือที่อนุญาตในแต่ละระบบ แล้วเลือกเครื่องมือและสมาชิกสำหรับแต่ละพื้นที่ทำงาน AI",
          "Set the allowed tools for each system, then choose tools and members for each AI workspace.",
        )}
      </p>
    </div>
  </div>
</div>

<style>
  .systems {
    min-width: 0;
    color: var(--orca-ink);
  }
  .systems-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px 24px;
    margin-bottom: 20px;
  }
  .systems-head h1 {
    margin: 0;
  }
  .systems-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    flex: none;
  }
  .systems .systems-notice {
    margin: 0 0 16px;
  }
  .systems-retry {
    margin-left: 8px;
  }
  .systems-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    margin: 0 0 14px;
  }
  .systems-search {
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
  .systems-search:focus-within {
    border-color: var(--orca-ink);
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .systems-search :global(svg) {
    flex: none;
  }
  .systems-search input {
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
  .systems-search input::placeholder {
    color: var(--orca-subtle);
  }
  .systems-search input:focus-visible {
    outline: none;
  }
  .systems-filter {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .systems-filter button {
    min-height: 30px;
    padding: 0 11px;
    border: 0;
    border-radius: var(--orca-radius-sm);
    background: transparent;
    color: var(--orca-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .systems-filter button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .systems-filter button.selected {
    background: var(--orca-secondary);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .systems-panel {
    min-width: 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .systems-table-wrap {
    overflow-x: auto;
  }
  .systems-table {
    width: 100%;
    border-collapse: collapse;
    text-align: start;
  }
  .systems-table th:first-child {
    width: 40%;
  }
  .systems-table th {
    height: 40px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
    color: var(--orca-nav);
    font-size: 13px;
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .systems-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #eff0f2;
    font-size: 14px;
    line-height: 1.4;
    vertical-align: middle;
  }
  .systems-table tbody tr:last-child td {
    border-bottom: 0;
  }
  .systems-table tbody tr:hover td {
    background: var(--orca-surface-2);
  }
  .systems-table tbody tr.systems-empty-row:hover td {
    background: none;
  }
  .systems-table td > small {
    display: block;
    margin-top: 1px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .systems-name {
    min-width: 240px;
    max-width: 420px;
  }
  .systems-name-link {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    color: var(--orca-ink);
    text-decoration: none;
  }
  .systems-name-link:hover strong {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .systems-logo {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .systems-name-copy {
    display: grid;
    min-width: 0;
  }
  .systems-name-copy strong {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .systems-name-copy small {
    overflow: hidden;
    color: var(--orca-muted);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .systems-gateways a {
    color: var(--orca-ink);
    text-decoration: none;
    white-space: nowrap;
  }
  .systems-gateways a:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .systems-tools,
  .systems-status {
    white-space: nowrap;
  }
  .systems-health {
    white-space: nowrap;
  }
  .systems-health small {
    display: block;
    margin-top: 3px;
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  .systems-health small.health-signin {
    color: var(--orca-warn);
  }
  .health-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: var(--orca-radius-sm);
    font-size: 12.5px;
    font-weight: 500;
  }
  .health-badge.tone-ok {
    background: var(--orca-ok-bg);
    color: var(--orca-ok);
  }
  .health-badge.tone-warn {
    background: var(--orca-warn-bg);
    color: var(--orca-warn);
  }
  .health-badge.tone-bad {
    background: var(--orca-deny-bg);
    color: var(--orca-deny);
  }
  .health-badge.tone-idle {
    background: var(--orca-secondary);
    color: var(--orca-nav);
  }
  .health-muted {
    color: var(--orca-subtle);
    font-size: 12.5px;
  }
  .actions-col {
    width: 1%;
    white-space: nowrap;
  }
  .systems-row-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }
  .systems-row-actions > :global(.k-button) {
    margin-right: 4px;
    white-space: nowrap;
  }
  .systems-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 40px 24px;
    color: var(--orca-subtle);
    text-align: center;
  }
  .systems-empty p {
    max-width: 460px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 14px;
  }
  .systems-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 10px 18px;
    border-top: 1px solid var(--orca-line);
    color: var(--orca-muted);
    font-size: 13px;
  }
  .systems-summary > span {
    margin-left: 8px;
    color: var(--orca-subtle);
  }
  .systems-pages {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .systems-pages > div {
    display: flex;
    gap: 8px;
  }
  .systems .systems-note {
    margin: 16px 0 0;
  }
  .systems-note strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .systems-note p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  @media (max-width: 760px) {
    .systems-head {
      flex-direction: column;
    }
    .systems-actions,
    .systems-search {
      width: 100%;
    }
    .systems-actions > :global(.k-button) {
      flex: 1 1 auto;
    }
    /* Rows stack on phones: name and status, then workspaces and tools, then actions. */
    .systems-table,
    .systems-table tbody {
      display: block;
    }
    .systems-table thead {
      display: none;
    }
    .systems-table tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px 16px;
      padding: 14px 16px;
      border-bottom: 1px solid #eff0f2;
    }
    .systems-table tbody tr:last-child {
      border-bottom: 0;
    }
    .systems-table td,
    .systems-table tbody tr:hover td {
      padding: 0;
      border: 0;
      background: none;
    }
    .systems-table td[data-label]::before {
      content: attr(data-label);
      display: block;
      margin-bottom: 2px;
      color: var(--orca-subtle);
      font-size: 12px;
    }
    .systems-name {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      max-width: none;
    }
    .systems-status {
      grid-column: 2;
      grid-row: 1;
      text-align: end;
    }
    .systems-table td.systems-status[data-label]::before {
      display: none;
    }
    .systems-gateways {
      grid-column: 1;
      grid-row: 2;
    }
    .systems-tools {
      grid-column: 2;
      grid-row: 2;
      text-align: end;
    }
    .systems-health {
      grid-column: 1 / -1;
      grid-row: 3;
    }
    .systems-table .actions-col {
      grid-column: 1 / -1;
      width: auto;
    }
    .systems-row-actions {
      justify-content: flex-start;
    }
    .systems-row-actions > :global(.k-button) {
      margin-right: auto;
    }
    .systems-table tr.systems-empty-row {
      display: block;
      padding: 0;
    }
    .systems-foot {
      padding-inline: 16px;
    }
  }
</style>
