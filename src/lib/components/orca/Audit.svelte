<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    ArrowDown,
    ArrowUp,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Clock3,
    FilterX,
    Info,
    RefreshCw,
    Search,
    X,
  } from "@lucide/svelte";
  import AuditDetails from "$lib/components/orca/AuditDetails.svelte";
  import { auditDetailValues, auditDuration } from "$lib/orca/audit-details";
  import {
    auditEventMode,
    auditFilterOptions,
    auditPage,
    filterAuditEvents,
    type AuditMode,
    type AuditSort,
    type AuditTimeRange,
  } from "$lib/orca/audit-filters";
  import { t, localeHref } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    displayDate,
    orcaError,
    memberName,
    type OrcaAuditEvent,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  let {
    data,
    hubID = "",
    mode = "executions",
  }: { data: OrcaBootstrap; hubID?: string; mode?: AuditMode } = $props();
  let events = $state<OrcaAuditEvent[]>([]);
  let loading = $state(true),
    error = $state(""),
    selectedHubID = $state("");
  let outcome = $state(""),
    query = $state(""),
    userID = $state(""),
    connectionID = $state(""),
    toolName = $state(""),
    action = $state("");
  let timeRange = $state<AuditTimeRange>("all"),
    sort = $state<AuditSort>("newest");
  let pageNumber = $state(1),
    pageSize = $state(25),
    loadedAt = $state<number>();
  let selected = $state<OrcaAuditEvent>();
  let detailDialog: HTMLDialogElement;
  let requestNumber = 0,
    previousFilters = "";
  let previousMode: AuditMode | undefined;
  const title = $derived(
    mode === "executions"
      ? t("การเรียกใช้เครื่องมือ", "Tool Executions")
      : t("ประวัติการจัดการ", "Audit Logs"),
  );
  const labels: Record<string, string> = $derived({
    admitted: t("รับคำขอแล้ว", "Admitted"),
    success: t("สำเร็จ", "Succeeded"),
    error: t("ไม่สำเร็จ", "Failed"),
    denied: t("ไม่อนุญาต", "Denied"),
    timeout: t("หมดเวลา", "Timed out"),
    unknown: t("ยังไม่ทราบผล", "Unknown"),
  });
  const actionLabels: Record<string, string> = $derived({
    "member.role.update": t("เปลี่ยนบทบาทสมาชิก", "Member role changed"),
    "organization.update": t("แก้ไขข้อมูลองค์กร", "Organization updated"),
    "unit.create": t("เพิ่มหน่วยงาน", "Unit created"),
    "unit.update": t("แก้ไขหน่วยงาน", "Unit updated"),
    "connection.create": t("เพิ่มการเชื่อมต่อ", "Connection created"),
    "connection.update": t("แก้ไขการเชื่อมต่อ", "Connection updated"),
    "hub.create": t("สร้าง MCP Gateway", "MCP Gateway created"),
    "hub.update": t("แก้ไข MCP Gateway", "MCP Gateway updated"),
    "key.create": t("สร้างคีย์เชื่อมต่อ", "Client key created"),
    "key.revoke": t("ยกเลิกคีย์เชื่อมต่อ", "Client key revoked"),
    "tools.call": t("เรียกเครื่องมือ", "Tool call"),
    "tools/call": t("เรียกเครื่องมือ", "Tool call"),
    "library.call": t("เรียกเครื่องมือในคลัง", "Library tool call"),
    "mcp.request": t("คำขอ MCP", "MCP request"),
    "library.create": t("สร้างรายการในคลัง", "Library item created"),
    "library.update": t("แก้ไขรายการในคลัง", "Library item updated"),
    "library.archive": t("เก็บรายการในคลัง", "Library item archived"),
    "department.members": t(
      "แก้ไขสมาชิกหน่วยงาน",
      "Department members updated",
    ),
    "template.preview": t("เปิดตัวอย่างเทมเพลต", "Template previewed"),
  });
  const names = $derived({
    users: Object.fromEntries(
      data.members.map((member) => [member.id, memberName(member)]),
    ),
    hubs: Object.fromEntries(data.hubs.map((hub) => [hub.id, hub.name])),
    connections: Object.fromEntries(
      data.connections.map((connection) => [connection.id, connection.name]),
    ),
  });
  const modeEvents = $derived(
    events.filter((event) => auditEventMode(event) === mode),
  );
  const visibleEvents = $derived(
    filterAuditEvents(
      events,
      mode,
      {
        query,
        outcome,
        userID,
        connectionID,
        toolName,
        action,
        timeRange,
        sort,
      },
      names,
      loadedAt ?? Date.now(),
    ),
  );
  const pagination = $derived(auditPage(visibleEvents, pageNumber, pageSize));
  const activeFilters = $derived(
    Boolean(
      query ||
      outcome ||
      userID ||
      connectionID ||
      toolName ||
      action ||
      timeRange !== "all",
    ),
  );
  const filterSignature = $derived(
    JSON.stringify({
      query,
      outcome,
      userID,
      connectionID,
      toolName,
      action,
      timeRange,
      sort,
      pageSize,
      mode,
      selectedHubID,
    }),
  );
  const users = $derived(auditFilterOptions(modeEvents, "userID"));
  const connections = $derived(auditFilterOptions(modeEvents, "connectionID"));
  const tools = $derived(auditFilterOptions(modeEvents, "toolName"));
  const actions = $derived(auditFilterOptions(modeEvents, "action"));
  const outcomes = $derived(auditFilterOptions(modeEvents, "outcome"));
  function clearFilters() {
    query = "";
    outcome = "";
    userID = "";
    connectionID = "";
    toolName = "";
    action = "";
    timeRange = "all";
    pageNumber = 1;
  }
  function eventLabel(event: OrcaAuditEvent) {
    return mode === "executions"
      ? event.toolName ||
          actionLabels[event.action ?? event.method ?? ""] ||
          event.action ||
          event.method ||
          t("ไม่ระบุเครื่องมือ", "Tool not recorded")
      : actionLabels[event.action ?? ""] ||
          event.action ||
          event.method ||
          t("ไม่ระบุกิจกรรม", "Action not recorded");
  }
  function resourceLabel(event: OrcaAuditEvent) {
    const id = event.resourceID;
    if (id)
      return (
        names.hubs[id] ||
        names.connections[id] ||
        names.users[id] ||
        data.units.find((unit) => unit.id === id)?.name ||
        id
      );
    return (
      (event.connectionID && names.connections[event.connectionID]) ||
      (event.hubID && names.hubs[event.hubID]) ||
      event.connectionID ||
      event.hubID ||
      "—"
    );
  }
  async function refresh(id: string) {
    const current = ++requestNumber;
    loading = true;
    error = "";
    selected = undefined;
    detailDialog?.close();
    try {
      const result = await OrcaService.audit(id || undefined);
      if (current === requestNumber) {
        events = result;
        loadedAt = Date.now();
      }
    } catch (cause) {
      if (current === requestNumber) {
        events = [];
        loadedAt = undefined;
        error = orcaError(cause);
      }
    } finally {
      if (current === requestNumber) loading = false;
    }
  }
  async function openDetails(event: OrcaAuditEvent) {
    selected = event;
    await tick();
    detailDialog.showModal();
  }
  $effect(() => {
    selectedHubID = hubID;
  });
  $effect(() => {
    void refresh(selectedHubID);
  });
  $effect(() => {
    if (previousMode !== mode) {
      previousMode = mode;
      clearFilters();
      selected = undefined;
      detailDialog?.close();
    }
  });
  $effect(() => {
    if (filterSignature !== previousFilters) {
      previousFilters = filterSignature;
      pageNumber = 1;
    }
  });
  onDestroy(() => {
    requestNumber += 1;
  });
</script>

<section class="observability" aria-labelledby="audit-title">
  <header class="audit-heading">
    <div>
      <p class="eyebrow">OBSERVABILITY</p>
      <h1 id="audit-title">{title}</h1>
      <p class="subtitle">
        {mode === "executions"
          ? data.canManage
            ? t(
                "ตรวจสอบว่าใครเรียกเครื่องมือใด และได้ผลอย่างไร",
                "Review tool calls, the people using them, and their results.",
              )
            : t(
                "ตรวจการเรียกเครื่องมือของคุณและผลที่บันทึกไว้",
                "Inspect your tool calls and their recorded outcomes.",
              )
          : t(
              "ตรวจว่าใครเปลี่ยนการตั้งค่า การเข้าถึง และรายการในองค์กร",
              "Review changes to organization settings, access, and resources.",
            )}
      </p>
    </div>
    <button
      type="button"
      class="refresh-button"
      disabled={loading}
      onclick={() => refresh(selectedHubID)}
      ><RefreshCw size={14} class={loading ? "k-spin" : ""} />{t(
        "รีเฟรช",
        "Refresh",
      )}</button
    >
  </header>
  <nav class="audit-tabs" aria-label={t("ประเภทประวัติ", "Activity type")}>
    <a
      class:active={mode === "executions"}
      aria-current={mode === "executions" ? "page" : undefined}
      href={localeHref(
        `/app?view=executions${selectedHubID ? `&hub=${encodeURIComponent(selectedHubID)}` : ""}`,
      )}>{t("การเรียกเครื่องมือ", "Tool Executions")}</a
    ><a
      class:active={mode === "administration"}
      aria-current={mode === "administration" ? "page" : undefined}
      href={localeHref(
        `/app?view=audit${selectedHubID ? `&hub=${encodeURIComponent(selectedHubID)}` : ""}`,
      )}>{t("ประวัติการจัดการ", "Audit Logs")}</a
    >
  </nav>
  <div class="filters">
    <div class="search-field">
      <Search size={16} /><input
        type="search"
        bind:value={query}
        aria-label={t("ค้นหาประวัติที่โหลดมา", "Search loaded records")}
        placeholder={mode === "executions"
          ? t(
              "ค้นหาเครื่องมือ ผู้ใช้ หรือรหัสการเรียก",
              "Search tools, users, or execution IDs",
            )
          : t(
              "ค้นหากิจกรรม ผู้ใช้ หรือรหัสรายการ",
              "Search actions, users, or resource IDs",
            )}
      />
    </div>
    <label
      ><span>MCP Gateway</span><select bind:value={selectedHubID}
        ><option value=""
          >{t("ทุก Gateway ที่มีสิทธิ์ดู", "All accessible gateways")}</option
        >{#each data.hubs as hub (hub.id)}<option value={hub.id}
            >{hub.name}</option
          >{/each}</select
      ></label
    >
    <label
      ><span>{t("ผลลัพธ์", "Outcome")}</span><select bind:value={outcome}
        ><option value="">{t("ทุกผลลัพธ์", "All outcomes")}</option
        >{#each outcomes as value}<option {value}
            >{labels[value] || value}</option
          >{/each}</select
      ></label
    >
    <label
      ><span>{t("ช่วงเวลา", "Time range")}</span><select bind:value={timeRange}
        ><option value="all">{t("ทุกเวลาที่โหลดมา", "All loaded dates")}</option
        ><option value="24h">{t("24 ชั่วโมงล่าสุด", "Last 24 hours")}</option
        ><option value="7d">{t("7 วันล่าสุด", "Last 7 days")}</option><option
          value="30d">{t("30 วันล่าสุด", "Last 30 days")}</option
        ></select
      ></label
    >
  </div>
  <div class="secondary-filters">
    <label
      ><span>{t("ผู้ใช้งาน", "User")}</span><select bind:value={userID}
        ><option value=""
          >{t("ผู้ใช้ทั้งหมดในรายการ", "All listed users")}</option
        >{#each users as id}<option value={id}>{names.users[id] || id}</option
          >{/each}</select
      ></label
    ><label
      ><span>{t("การเชื่อมต่อ", "Connection")}</span><select
        bind:value={connectionID}
        ><option value="">{t("การเชื่อมต่อทั้งหมด", "All connections")}</option
        >{#each connections as id}<option value={id}
            >{names.connections[id] || id}</option
          >{/each}</select
      ></label
    >{#if mode === "executions"}<label
        ><span>{t("เครื่องมือ", "Tool")}</span><select bind:value={toolName}
          ><option value="">{t("เครื่องมือทั้งหมด", "All tools")}</option
          >{#each tools as name}<option value={name}>{name}</option
            >{/each}</select
        ></label
      >{:else}<label
        ><span>{t("กิจกรรม", "Action")}</span><select bind:value={action}
          ><option value="">{t("กิจกรรมทั้งหมด", "All actions")}</option
          >{#each actions as value}<option {value}
              >{actionLabels[value] || value}</option
            >{/each}</select
        ></label
      >{/if}{#if activeFilters}<button
        type="button"
        class="clear-button"
        onclick={clearFilters}
        ><FilterX size={13} />{t("ล้างตัวกรอง", "Clear filters")}</button
      >{/if}
  </div>
  <div class="loaded-summary" role="status">
    <span
      >{loading
        ? t("กำลังโหลดรายการ…", "Loading records…")
        : `${visibleEvents.length} ${t("รายการที่ตรงเงื่อนไข จาก", "matching records from")} ${modeEvents.length} ${t("รายการในหมวดนี้", "in this category")}`}</span
    >{#if loadedAt && !loading}<span
        ><Clock3 size={12} />{t("โหลดล่าสุด", "Loaded")}
        {displayDate(new Date(loadedAt).toISOString())}</span
      >{/if}
  </div>
  {#if error}<div class="audit-error" role="alert">
      <Info size={20} />
      <div>
        <h2>{t("โหลดประวัติไม่สำเร็จ", "Could not load records")}</h2>
        <p>{error}</p>
        <button type="button" onclick={() => refresh(selectedHubID)}
          >{t("ลองอีกครั้ง", "Try again")}</button
        >
      </div>
    </div>
  {:else if loading}<div class="audit-empty" role="status">
      <RefreshCw size={23} class="k-spin" />
      <p>
        {t(
          "กำลังโหลดประวัติที่คุณมีสิทธิ์ดู",
          "Loading records you can access.",
        )}
      </p>
    </div>
  {:else if !visibleEvents.length}<div class="audit-empty">
      <ClipboardList size={30} />
      <h2>
        {activeFilters
          ? t("ไม่พบรายการที่ตรงเงื่อนไข", "No matching records")
          : mode === "executions"
            ? t("ยังไม่มีประวัติการเรียกเครื่องมือ", "No tool executions yet")
            : t("ยังไม่มีประวัติการจัดการ", "No administrative activity yet")}
      </h2>
      <p>
        {activeFilters
          ? t(
              "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองในข้อมูลที่โหลดมา",
              "Try another search or clear filters within the loaded records.",
            )
          : t(
              "รายการที่คุณมีสิทธิ์ดูจะแสดงเมื่อมีการใช้งานผ่าน ORCA",
              "Records you can access appear after activity occurs in ORCA.",
            )}
      </p>
      {#if activeFilters}<button
          type="button"
          class="refresh-button"
          onclick={clearFilters}>{t("ล้างตัวกรอง", "Clear filters")}</button
        >{/if}
    </div>
  {:else}<div class="audit-table-wrap">
      <table class="audit-table">
        <thead
          ><tr
            ><th>{t("ผลลัพธ์", "Outcome")}</th><th
              >{mode === "executions"
                ? t("เครื่องมือ", "Tool")
                : t("กิจกรรม", "Action")}</th
            ><th
              >{mode === "executions"
                ? t("การเชื่อมต่อ / Hub", "Connection / Hub")
                : t("รายการที่เกี่ยวข้อง", "Resource")}</th
            ><th>{t("ผู้ใช้งาน", "User")}</th>{#if mode === "executions"}<th
                >{t("ระยะเวลา", "Duration")}</th
              >{/if}<th
              aria-sort={sort === "newest" ? "descending" : "ascending"}
              ><button
                type="button"
                class="sort-button"
                onclick={() => (sort = sort === "newest" ? "oldest" : "newest")}
                >{t(
                  "วันเวลา (ไทย)",
                  "Time (Bangkok)",
                )}{#if sort === "newest"}<ArrowDown size={12} />{:else}<ArrowUp
                    size={12}
                  />{/if}</button
              ></th
            ><th><span class="sr-only">{t("รายละเอียด", "Details")}</span></th
            ></tr
          ></thead
        ><tbody
          >{#each pagination.items as event (event.id)}{@const detail =
              auditDetailValues(event)}<tr
              ><td
                ><span
                  class="outcome"
                  class:success={event.outcome === "success"}
                  class:failed={event.outcome === "error" ||
                    event.outcome === "denied" ||
                    event.outcome === "timeout"}
                  class:pending={event.outcome === "admitted"}
                  ><span class="status-dot"></span>{labels[event.outcome] ||
                    event.outcome ||
                    "—"}</span
                ></td
              ><td
                ><button
                  type="button"
                  class="event-name"
                  onclick={() => openDetails(event)}>{eventLabel(event)}</button
                ><span class="event-code"
                  >{mode === "executions"
                    ? event.id
                    : event.action || event.method || "—"}</span
                ></td
              ><td
                >{#if mode === "executions"}<span class="primary-cell"
                    >{(event.connectionID &&
                      names.connections[event.connectionID]) ||
                      event.connectionID ||
                      "—"}</span
                  ><span class="secondary-cell"
                    >{names.hubs[event.hubID] || event.hubID || "—"}</span
                  >{:else}<span class="primary-cell"
                    >{resourceLabel(event)}</span
                  >{#if event.hubID}<span class="secondary-cell"
                      >{names.hubs[event.hubID] || event.hubID}</span
                    >{/if}{/if}</td
              ><td
                ><span class="primary-cell"
                  >{names.users[event.userID] ||
                    event.userID ||
                    t("ระบบ", "System")}</span
                >{#if names.users[event.userID]}<span class="secondary-cell"
                    >ID: {event.userID}</span
                  >{/if}</td
              >{#if mode === "executions"}<td class="duration"
                  >{detail.durationMs !== undefined
                    ? auditDuration(detail.durationMs)
                    : "—"}</td
                >{/if}<td class="timestamp">{displayDate(event.createdAt)}</td
              ><td
                ><button
                  type="button"
                  class="detail-button"
                  aria-label={`${t("รายละเอียด", "Details")}: ${eventLabel(event)}`}
                  onclick={() => openDetails(event)}
                  ><ChevronRight size={17} /></button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    <footer class="pagination">
      <span
        >{pagination.start}–{pagination.end}
        {t("จาก", "of")}
        {pagination.total}</span
      >
      <div>
        <label
          >{t("ต่อหน้า", "Rows per page")}<select bind:value={pageSize}
            ><option value={25}>25</option><option value={50}>50</option><option
              value={100}>100</option
            ></select
          ></label
        ><button
          type="button"
          disabled={pagination.page <= 1}
          onclick={() => (pageNumber = pagination.page - 1)}
          aria-label={t("หน้าก่อน", "Previous page")}
          ><ChevronLeft size={16} /></button
        ><span>{pagination.page} / {pagination.pages}</span><button
          type="button"
          disabled={pagination.page >= pagination.pages}
          onclick={() => (pageNumber = pagination.page + 1)}
          aria-label={t("หน้าถัดไป", "Next page")}
          ><ChevronRight size={16} /></button
        >
      </div>
    </footer>{/if}
  <p class="retention-note">
    {t(
      "แสดงสูงสุด 200 รายการล่าสุดที่เซิร์ฟเวอร์ส่งมา ตามสิทธิ์และ Gateway ที่เลือก ตัวกรองและจำนวนรายการคำนวณจากข้อมูลชุดนี้",
      "Shows up to 200 latest records returned for your access and selected Hub. Filters and counts apply to this loaded set.",
    )}
  </p>
</section>

<dialog
  bind:this={detailDialog}
  class="audit-drawer"
  aria-labelledby="audit-detail-title"
  onclose={() => (selected = undefined)}
>
  {#if selected}<header class="drawer-heading">
      <div>
        <p>
          {mode === "executions"
            ? t("รายละเอียดการเรียก", "Execution details")
            : t("รายละเอียดเหตุการณ์", "Audit event")}
        </p>
        <h2 id="audit-detail-title">{eventLabel(selected)}</h2>
      </div>
      <button
        type="button"
        onclick={() => detailDialog.close()}
        aria-label={t("ปิดรายละเอียด", "Close details")}><X size={19} /></button
      >
    </header>
    <div class="drawer-body">
      <div class="drawer-status">
        <span
          class="outcome"
          class:success={selected.outcome === "success"}
          class:failed={selected.outcome === "error" ||
            selected.outcome === "denied"}
          class:pending={selected.outcome === "admitted"}
          ><span class="status-dot"></span>{labels[selected.outcome] ||
            selected.outcome}</span
        ><span>{displayDate(selected.createdAt)}</span>
      </div>
      {#if selected.outcome === "admitted"}<p class="admission-note">
          {t(
            "บันทึกว่ารับคำขอแล้ว แต่ยังไม่มีผลเสร็จสิ้นในประวัตินี้",
            "The request was admitted, but this record has no confirmed completion yet.",
          )}
        </p>{/if}
      <dl class="identity-details">
        <div>
          <dt>{t("ผู้ดำเนินการ", "Actor")}</dt>
          <dd>
            {names.users[selected.userID] ||
              selected.userID ||
              t("ระบบ", "System")}{#if selected.userID}<small
                >ID: {selected.userID}</small
              >{/if}
          </dd>
        </div>
        <div>
          <dt>{t("กิจกรรมที่บันทึก", "Recorded action")}</dt>
          <dd><code>{selected.action || selected.method || "—"}</code></dd>
        </div>
        {#if selected.hubID}<div>
            <dt>MCP Gateway</dt>
            <dd>
              <a
                href={localeHref(
                  `/app?view=hub&hub=${encodeURIComponent(selected.hubID)}`,
                )}
                >{names.hubs[selected.hubID] || selected.hubID}<ArrowUpRight
                  size={12}
                /></a
              >
            </dd>
          </div>{/if}{#if selected.connectionID}<div>
            <dt>{t("การเชื่อมต่อ", "Connection")}</dt>
            <dd>
              <a
                href={localeHref(
                  `/app?view=servers&connection=${encodeURIComponent(selected.connectionID)}`,
                )}
                >{names.connections[selected.connectionID] ||
                  selected.connectionID}<ArrowUpRight size={12} /></a
              >
            </dd>
          </div>{/if}
      </dl>
      <AuditDetails event={selected} expanded />
      <p class="payload-note">
        {t(
          "บันทึกนี้มีเฉพาะข้อมูลอ้างอิง ไม่มี arguments ผลลัพธ์เนื้อหา หรือคีย์เชื่อมต่อ",
          "This record contains metadata only. Arguments, response contents, and connection keys are not recorded here.",
        )}
      </p>
    </div>{/if}
</dialog>

<style>
  .observability {
    color: var(--k-ink, #172023);
    max-width: 1500px;
    margin: 0 auto;
  }
  .audit-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
  }
  .eyebrow {
    margin: 0 0 7px;
    color: var(--k-muted, #748078);
    font-size: 10px;
    letter-spacing: 0.1em;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.4;
    font-weight: 600;
    letter-spacing: -0.025em;
  }
  .subtitle {
    margin: 6px 0 0;
    color: var(--k-muted, #68766c);
    font-size: 12px;
    line-height: 1.7;
  }
  .refresh-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 7px 11px;
    background: white;
    color: #415044;
    border: 1px solid var(--k-line, #dfe5df);
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  .audit-tabs {
    display: flex;
    gap: 25px;
    border-bottom: 1px solid var(--k-line, #e0e5e0);
    margin-bottom: 22px;
  }
  .audit-tabs a {
    color: #7b877d;
    font-size: 12px;
    text-decoration: none;
    padding: 0 1px 13px;
  }
  .audit-tabs a.active {
    border-bottom: 2px solid #3b5d3f;
    color: #263d2a;
    font-weight: 600;
  }
  .filters {
    display: grid;
    grid-template-columns: minmax(250px, 1.65fr) repeat(3, minmax(125px, 1fr));
    gap: 12px;
    align-items: end;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 10px;
    color: #717c72;
  }
  input,
  select {
    font: inherit;
    min-width: 0;
    color: #455247;
  }
  select {
    width: 100%;
    height: 35px;
    padding: 6px 24px 6px 9px;
    border: 1px solid var(--k-line, #dfe5df);
    border-radius: 6px;
    background: white;
    font-size: 11px;
  }
  .search-field {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    background: white;
    height: 35px;
    border: 1px solid var(--k-line, #dfe5df);
    border-radius: 6px;
    color: #839080;
  }
  .search-field input {
    width: 100%;
    border: 0;
    outline: none;
    padding: 6px 0;
    background: transparent;
    font-size: 11px;
  }
  .search-field:focus-within {
    outline: 2px solid #7a965f;
    outline-offset: 2px;
  }
  .secondary-filters {
    display: flex;
    align-items: end;
    gap: 12px;
    margin-top: 12px;
  }
  .secondary-filters label {
    width: 200px;
    min-width: 0;
  }
  .clear-button {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    border: 0;
    background: transparent;
    color: #5c7750;
    padding: 8px 0;
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .loaded-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
    margin-top: 7px;
    font-size: 10px;
    color: #798477;
  }
  .loaded-summary > span:last-child {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .audit-table-wrap {
    position: relative;
    border: 1px solid var(--k-line, #e0e5df);
    border-radius: 8px;
    overflow-x: auto;
    background: white;
  }
  .audit-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 11px;
  }
  th {
    color: #818b80;
    font-weight: 500;
    padding: 11px 13px;
    background: #fafbf9;
    white-space: nowrap;
    font-size: 10px;
  }
  td {
    padding: 15px 13px;
    border-top: 1px solid #eaf0e7;
    color: #596653;
    vertical-align: middle;
    max-width: 260px;
  }
  tbody tr:hover {
    background: #fafcf8;
  }
  .sort-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .event-name {
    display: block;
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
    color: #344b30;
    font-size: 11px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .event-name:hover {
    text-decoration: underline;
  }
  .event-code,
  .secondary-cell {
    display: block;
    margin-top: 4px;
    color: #909b8b;
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .event-code {
    max-width: 270px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
  }
  .primary-cell {
    display: block;
    overflow-wrap: anywhere;
  }
  .duration,
  .timestamp {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-size: 10px;
  }
  .outcome {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    font-size: 10px;
    color: #74816f;
    white-space: nowrap;
    border-radius: 4px;
    padding: 3px 6px;
    background: #f0f3ed;
  }
  .outcome.success {
    background: #edf5e8;
    color: #547342;
  }
  .outcome.failed {
    background: #fff0eb;
    color: #a46143;
  }
  .outcome.pending {
    background: #f7f2e3;
    color: #977b40;
  }
  .status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .detail-button {
    border: 0;
    background: transparent;
    color: #7e9072;
    padding: 3px;
    cursor: pointer;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 15px;
    font-size: 10px;
    color: #819077;
  }
  .pagination > div {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pagination label {
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
    margin-right: 7px;
  }
  .pagination select {
    width: 64px;
    height: 28px;
    font-size: 10px;
  }
  .pagination button {
    display: grid;
    place-items: center;
    border: 1px solid #dfe5da;
    border-radius: 5px;
    background: white;
    color: #718763;
    width: 28px;
    height: 28px;
    cursor: pointer;
  }
  .retention-note {
    color: #939e8b;
    font-size: 10px;
    line-height: 1.8;
    margin-top: 18px;
    max-width: 900px;
  }
  .audit-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 62px 24px;
    min-height: 290px;
    border: 1px solid var(--k-line, #e0e5df);
    border-radius: 8px;
    background: white;
    color: #91a082;
    text-align: center;
  }
  .audit-empty h2 {
    font-size: 13px;
    color: #65775a;
    font-weight: 500;
    margin: 15px 0 0;
  }
  .audit-empty p {
    font-size: 11px;
    color: #8b9980;
    margin: 8px 0 0;
    line-height: 1.8;
  }
  .audit-empty button {
    margin-top: 17px;
  }
  .audit-error {
    display: flex;
    align-items: start;
    gap: 11px;
    border: 1px solid #eedad0;
    background: #fff9f5;
    border-radius: 8px;
    padding: 23px;
    color: #aa7353;
  }
  .audit-error h2 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }
  .audit-error p {
    font-size: 11px;
    margin: 7px 0;
    overflow-wrap: anywhere;
  }
  .audit-error button {
    border: 0;
    background: transparent;
    padding: 0;
    color: #966239;
    text-decoration: underline;
    font-size: 11px;
    cursor: pointer;
  }
  .audit-drawer {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(470px, 100%);
    height: 100dvh;
    max-height: 100dvh;
    max-width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-left: 1px solid #e1e7dc;
    background: white;
    color: #34422f;
  }
  .audit-drawer::backdrop {
    background: rgb(21 32 19 / 20%);
  }
  .drawer-heading {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 20px;
    padding: 24px;
    border-bottom: 1px solid #e7ede1;
  }
  .drawer-heading p {
    color: #8d9b83;
    font-size: 11px;
    margin: 0 0 8px;
  }
  .drawer-heading h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .drawer-heading button {
    border: 0;
    background: transparent;
    color: #7f9073;
    padding: 0;
    cursor: pointer;
  }
  .drawer-body {
    padding: 22px 24px;
  }
  .drawer-status {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    font-size: 10px;
    color: #8c9c80;
  }
  .identity-details {
    display: grid;
    gap: 17px;
    margin: 23px 0 18px;
  }
  .identity-details > div {
    display: grid;
    gap: 5px;
    border-bottom: 1px solid #e7ede1;
    padding-bottom: 14px;
  }
  dt {
    font-size: 11px;
    color: #839576;
  }
  dd {
    margin: 0;
    font-size: 12px;
    color: #4d6640;
    overflow-wrap: anywhere;
  }
  dd small {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    color: #91a085;
  }
  dd code {
    font-size: 11px;
  }
  dd a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    text-decoration: none;
    color: #577d41;
  }
  dd a:hover {
    text-decoration: underline;
  }
  .payload-note,
  .admission-note {
    margin: 20px 0 0;
    font-size: 10px;
    line-height: 1.8;
    color: #8c9d7d;
  }
  .admission-note {
    padding: 10px 12px;
    background: #faf7ed;
    color: #977f49;
    border: 1px solid #eee5cb;
    border-radius: 6px;
  }
  button:focus-visible,
  a:focus-visible,
  select:focus-visible {
    outline: 2px solid #819f65;
    outline-offset: 3px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 1050px) {
    .filters {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .search-field {
      grid-column: 1 / -1;
    }
    .secondary-filters {
      flex-wrap: wrap;
    }
    .secondary-filters label {
      flex: 1;
      min-width: 145px;
    }
  }
  @media (max-width: 650px) {
    h1 {
      font-size: 21px;
    }
    .audit-heading {
      align-items: start;
    }
    .audit-heading > button {
      margin-top: 25px;
    }
    .filters {
      grid-template-columns: 1fr 1fr;
    }
    .filters > label:first-of-type {
      grid-column: 1 / -1;
    }
    .loaded-summary {
      flex-direction: column;
      align-items: start;
      gap: 5px;
      padding: 12px 0;
    }
    .secondary-filters label {
      min-width: calc(50% - 12px);
    }
    .audit-table {
      min-width: 780px;
    }
    .pagination {
      flex-wrap: wrap;
    }
    .pagination > div {
      margin-left: auto;
    }
    .drawer-body,
    .drawer-heading {
      padding: 20px;
    }
  }
</style>
