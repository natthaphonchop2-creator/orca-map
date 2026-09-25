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
    DELETED_CONNECTIONS,
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
  // One "Activity" page; the tabs tell tool use apart from admin changes.
  const title = $derived(t("ประวัติการใช้งาน", "Activity"));
  const labels: Record<string, string> = $derived({
    admitted: t("รับคำขอแล้ว", "Received"),
    success: t("สำเร็จ", "Succeeded"),
    error: t("ไม่สำเร็จ", "Failed"),
    denied: t("ไม่ได้รับอนุญาต", "Denied"),
    timeout: t("หมดเวลา", "Timed out"),
    unknown: t("ไม่ทราบผล", "Unknown"),
  });
  const actionLabels: Record<string, string> = $derived({
    "member.role.update": t("เปลี่ยนบทบาทสมาชิก", "Member role changed"),
    "organization.update": t("แก้ไขข้อมูลองค์กร", "Organization details updated"),
    "unit.create": t("สร้างแผนก", "Department created"),
    "unit.update": t("แก้ไขแผนก", "Department updated"),
    "connection.create": t("เพิ่มระบบที่เชื่อมต่อ", "Connected system added"),
    "connection.update": t("แก้ไขระบบที่เชื่อมต่อ", "Connected system updated"),
    "connection.archive": t("จัดเก็บระบบที่เชื่อมต่อ", "Connected system archived"),
    "connection.restore": t("กู้คืนระบบที่เชื่อมต่อ", "Connected system restored"),
    "connection.delete": t("ลบระบบที่เชื่อมต่อ", "Connected system deleted"),
    "hub.create": t("สร้างพื้นที่ทำงาน AI", "AI workspace created"),
    "hub.update": t("แก้ไขพื้นที่ทำงาน AI", "AI workspace updated"),
    "hub.archive": t("จัดเก็บพื้นที่ทำงาน AI", "AI workspace archived"),
    "hub.restore": t("กู้คืนพื้นที่ทำงาน AI", "AI workspace restored"),
    "hub.delete": t("ลบพื้นที่ทำงาน AI", "AI workspace deleted"),
    "key.create": t("สร้างคีย์ API", "API key created"),
    "key.revoke": t("เพิกถอนคีย์ API", "API key revoked"),
    "member.suspend": t("ระงับสมาชิก", "Member suspended"),
    "member.restore": t("กู้คืนสมาชิก", "Member restored"),
    "member.remove": t("นำสมาชิกออก", "Member removed"),
    "department.archive": t("จัดเก็บแผนก", "Department archived"),
    "department.restore": t("กู้คืนแผนก", "Department restored"),
    "department.delete": t("ลบแผนก", "Department deleted"),
    "user_source.create": t("เพิ่มผู้ให้บริการเข้าสู่ระบบ", "Sign-in source added"),
    "user_source.update": t("แก้ไขผู้ให้บริการเข้าสู่ระบบ", "Sign-in source updated"),
    "user_source.delete": t("ลบผู้ให้บริการเข้าสู่ระบบ", "Sign-in source deleted"),
    "oauth_app.configure": t("ตั้งค่าแอปเชื่อมบัญชี", "OAuth app set up"),
    "oauth_app.replace": t("เปลี่ยนแอปเชื่อมบัญชี", "OAuth app replaced"),
    "oauth_app.remove": t("นำแอปเชื่อมบัญชีออก", "OAuth app removed"),
    "access.inspect": t(
      "ตรวจสอบสิทธิ์การเข้าถึงผ่านแอป AI",
      "Access checked from an AI app",
    ),
    "tools.call": t("เรียกใช้เครื่องมือ", "Tool used"),
    "tools/call": t("เรียกใช้เครื่องมือ", "Tool used"),
    "library.call": t("เรียกใช้คลังความรู้", "Knowledge used"),
    "mcp.request": t("คำขอจากแอป AI", "AI app request"),
    "library.create": t("เพิ่มรายการในคลังความรู้", "Knowledge item added"),
    "library.update": t("แก้ไขรายการในคลังความรู้", "Knowledge item updated"),
    "library.archive": t("จัดเก็บรายการในคลังความรู้", "Knowledge item archived"),
    "department.members": t(
      "แก้ไขสมาชิกของแผนก",
      "Department members updated",
    ),
    "template.preview": t("ดูตัวอย่างแม่แบบ", "Template previewed"),
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
          t("ไม่มีการบันทึกชื่อเครื่องมือ", "Tool not recorded")
      : actionLabels[event.action ?? ""] ||
          event.action ||
          event.method ||
          t("ไม่มีการบันทึกกิจกรรม", "Action not recorded");
  }
  // Presentation only: records that no longer resolve keep their ID, shown under a readable label.
  // Managers see every system and workspace, so an unresolved ID there means the record was deleted.
  type EntityDisplay = { label?: string; id?: string };
  const signInSourceIDs = $derived(
    new Set(
      events
        .filter((event) => (event.action ?? "").startsWith("user_source."))
        .map((event) => event.connectionID)
        .filter(Boolean),
    ),
  );
  const isSignInSourceEvent = (event: OrcaAuditEvent) =>
    (event.action ?? "").startsWith("user_source.");
  function connectionDisplay(id?: string): EntityDisplay {
    if (!id) return { label: "—" };
    if (names.connections[id]) return { label: names.connections[id] };
    if (signInSourceIDs.has(id))
      return { label: t("การเข้าสู่ระบบองค์กร", "Sign-in source"), id };
    return data.canManage
      ? { label: t("ระบบที่ถูกลบแล้ว", "Deleted system"), id }
      : { id };
  }
  function hubDisplay(id?: string): EntityDisplay {
    if (!id) return { label: "—" };
    if (names.hubs[id]) return { label: names.hubs[id] };
    return data.canManage
      ? { label: t("พื้นที่ทำงานที่ถูกลบแล้ว", "Deleted workspace"), id }
      : { id };
  }
  function resourceDisplay(event: OrcaAuditEvent): EntityDisplay {
    const id = event.resourceID;
    if (id) {
      const known =
        names.hubs[id] ||
        names.connections[id] ||
        names.users[id] ||
        data.units.find((unit) => unit.id === id)?.name;
      if (known) return { label: known };
      if (isSignInSourceEvent(event))
        return { label: t("การเข้าสู่ระบบองค์กร", "Sign-in source"), id };
      if (id === event.connectionID || (event.action ?? "").startsWith("connection."))
        return connectionDisplay(id);
      if (id === event.hubID || (event.action ?? "").startsWith("hub."))
        return hubDisplay(id);
      return { id };
    }
    if (event.connectionID && names.connections[event.connectionID])
      return { label: names.connections[event.connectionID] };
    if (event.hubID && names.hubs[event.hubID])
      return { label: names.hubs[event.hubID] };
    if (event.connectionID) return connectionDisplay(event.connectionID);
    if (event.hubID) return hubDisplay(event.hubID);
    return { label: "—" };
  }
  // Known systems by name; every system that no longer resolves shares one
  // option, so the filter never lists raw IDs.
  const connectionOptions = $derived.by(() => {
    const known = connections
      .filter((id) => names.connections[id] || signInSourceIDs.has(id))
      .map((id) => ({
        value: id,
        label:
          names.connections[id] ||
          t("การเข้าสู่ระบบองค์กร", "Sign-in source"),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const gone = connections.filter(
      (id) => !names.connections[id] && !signInSourceIDs.has(id),
    ).length;
    return gone
      ? [
          ...known,
          {
            value: DELETED_CONNECTIONS,
            label: `${data.canManage ? t("ระบบที่ถูกลบแล้ว", "Deleted systems") : t("ระบบอื่น", "Other systems")} (${gone})`,
          },
        ]
      : known;
  });
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

{#snippet entity(item: EntityDisplay, secondary: boolean)}
  {#if secondary}<span class="secondary-cell entity-line"
      >{#if item.label}<span title={item.id}>{item.label}</span>{:else if item.id}<span
          class="audit-id"
          title={item.id}>{item.id}</span
        >{/if}</span
    >{:else}{#if item.label}<span class="primary-cell" title={item.id}>{item.label}</span
      >{:else if item.id}<span class="audit-id" title={item.id}>{item.id}</span>{/if}{/if}
{/snippet}

<section class="observability" aria-labelledby="audit-title">
  <header class="audit-heading">
    <div>
      <h1 id="audit-title">{title}</h1>
      <p class="subtitle">
        {mode === "executions"
          ? data.canManage
            ? t(
                "ตรวจสอบการใช้งานเครื่องมือ ผู้ใช้งาน และผลลัพธ์ของแต่ละรายการ",
                "Review tool use, who used each tool and the result of each request.",
              )
            : t(
                "ตรวจสอบการใช้งานเครื่องมือของคุณและผลลัพธ์ที่บันทึกไว้",
                "Review your tool use and the recorded results.",
              )
          : t(
              "ตรวจสอบการเปลี่ยนแปลงการตั้งค่า สิทธิ์การเข้าถึง และข้อมูลขององค์กรโดยผู้ดูแล",
              "Review changes that administrators made to settings, access and organization data.",
            )}
      </p>
    </div>
    <button
      type="button"
      class="k-button"
      disabled={loading}
      onclick={() => refresh(selectedHubID)}
      ><RefreshCw size={16} class={loading ? "k-spin" : ""} />{t(
        "โหลดข้อมูลใหม่",
        "Refresh",
      )}</button
    >
  </header>
  <nav class="audit-tabs" aria-label={t("ประเภทประวัติการใช้งาน", "Activity type")}>
    <a
      class:active={mode === "executions"}
      aria-current={mode === "executions" ? "page" : undefined}
      href={localeHref(
        `/app?view=executions${selectedHubID ? `&hub=${encodeURIComponent(selectedHubID)}` : ""}`,
      )}>{t("การใช้งานเครื่องมือ", "Tool use")}</a
    ><a
      class:active={mode === "administration"}
      aria-current={mode === "administration" ? "page" : undefined}
      href={localeHref(
        `/app?view=audit${selectedHubID ? `&hub=${encodeURIComponent(selectedHubID)}` : ""}`,
      )}>{t("การเปลี่ยนแปลงโดยผู้ดูแล", "Admin changes")}</a
    >
  </nav>
  <div class="audit-toolbar">
    <div class="filters">
      <div class="search-field">
        <Search size={16} aria-hidden="true" /><input
          type="search"
          bind:value={query}
          aria-label={t("ค้นหาในประวัติที่โหลดแล้ว", "Search loaded records")}
          placeholder={mode === "executions"
            ? t(
                "ค้นหาชื่อเครื่องมือ ผู้ใช้งาน หรือรหัสอ้างอิง",
                "Search by tool, user or reference ID",
              )
            : t(
                "ค้นหากิจกรรม ผู้ดำเนินการ หรือรหัสรายการ",
                "Search by action, user or item ID",
              )}
        />
      </div>
      <label
        ><span>{t("พื้นที่ทำงาน AI", "AI workspace")}</span><select bind:value={selectedHubID}
          ><option value=""
            >{t("ทุกพื้นที่ทำงานที่คุณมีสิทธิ์ดู", "All workspaces you can access")}</option
          >{#each data.hubs as hub (hub.id)}<option value={hub.id}
              >{hub.name}</option
            >{/each}</select
        ></label
      >
      <label
        ><span>{t("ผลลัพธ์", "Result")}</span><select bind:value={outcome}
          ><option value="">{t("ทุกผลลัพธ์", "All results")}</option
          >{#each outcomes as value}<option {value}
              >{labels[value] || value}</option
            >{/each}</select
        ></label
      >
      <label
        ><span>{t("ช่วงเวลา", "Time range")}</span><select bind:value={timeRange}
          ><option value="all">{t("ทุกช่วงเวลา", "All time")}</option
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
            >{t("ผู้ใช้งานทั้งหมด", "All users")}</option
          >{#each users as id}<option value={id}>{names.users[id] || id}</option
            >{/each}</select
        ></label
      ><label
        ><span>{t("ระบบ", "System")}</span><select
          bind:value={connectionID}
          ><option value="">{t("ทุกระบบ", "All systems")}</option
          >{#each connectionOptions as option (option.value)}<option
              value={option.value}>{option.label}</option
            >{/each}</select
        ></label
      >{#if mode === "executions"}<label
          ><span>{t("เครื่องมือ", "Tool")}</span><select bind:value={toolName}
            ><option value="">{t("ทุกเครื่องมือ", "All tools")}</option
            >{#each tools as name}<option value={name}>{name}</option
              >{/each}</select
          ></label
        >{:else}<label
          ><span>{t("กิจกรรม", "Action")}</span><select bind:value={action}
            ><option value="">{t("ทุกกิจกรรม", "All actions")}</option
            >{#each actions as value}<option {value}
                >{actionLabels[value] || value}</option
              >{/each}</select
          ></label
        >{/if}
    </div>
  </div>
  <div class="audit-meta">
    <div class="loaded-summary" role="status">
      <span
        >{loading
          ? t("กำลังโหลดรายการ…", "Loading records…")
          : `${visibleEvents.length} ${t("รายการที่ตรงเงื่อนไข จากทั้งหมด", "matching records out of")} ${modeEvents.length} ${t("รายการในหมวดนี้", "in this tab")}`}</span
      >{#if loadedAt && !loading}<span
          ><Clock3 size={14} aria-hidden="true" />{t("โหลดข้อมูลล่าสุดเมื่อ", "Last loaded")}
          {displayDate(new Date(loadedAt).toISOString())}</span
        >{/if}
    </div>
    {#if activeFilters}<button
        type="button"
        class="k-button small quiet clear-button"
        onclick={clearFilters}
        ><FilterX size={16} aria-hidden="true" />{t("ล้างตัวกรอง", "Clear filters")}</button
      >{/if}
  </div>
  {#if error}<div class="audit-error" role="alert">
      <Info size={18} />
      <div>
        <h2>{t("โหลดประวัติการใช้งานไม่สำเร็จ", "Could not load activity records")}</h2>
        <p>{error}</p>
        <button type="button" class="k-button small" onclick={() => refresh(selectedHubID)}
          >{t("ลองอีกครั้ง", "Try again")}</button
        >
      </div>
    </div>
  {:else if loading}<div class="audit-empty" role="status">
      <RefreshCw size={24} class="k-spin" />
      <p>
        {t(
          "กำลังโหลดประวัติการใช้งานที่คุณมีสิทธิ์ดู…",
          "Loading the records you can access…",
        )}
      </p>
    </div>
  {:else if !visibleEvents.length}<div class="audit-empty">
      <ClipboardList size={28} />
      <h2>
        {activeFilters
          ? t("ไม่พบรายการที่ตรงเงื่อนไข", "No matching records")
          : mode === "executions"
            ? t("ยังไม่มีประวัติการใช้งานเครื่องมือ", "No tool use recorded yet")
            : t("ยังไม่มีการเปลี่ยนแปลงโดยผู้ดูแล", "No admin changes recorded yet")}
      </h2>
      <p>
        {activeFilters
          ? t(
              "เปลี่ยนคำค้นหาหรือล้างตัวกรองเพื่อดูรายการอื่น",
              "Change the search or clear the filters to see other records.",
            )
          : t(
              "รายการจะแสดงที่นี่เมื่อมีการใช้งานผ่าน ORCA ตามสิทธิ์ของคุณ",
              "Records appear here when activity occurs in ORCA, according to your access.",
            )}
      </p>
      {#if activeFilters}<button
          type="button"
          class="k-button small"
          onclick={clearFilters}>{t("ล้างตัวกรอง", "Clear filters")}</button
        >{/if}
    </div>
  {:else}<div class="audit-panel">
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead
            ><tr
              ><th scope="col">{t("ผลลัพธ์", "Result")}</th><th scope="col"
                >{mode === "executions"
                  ? t("เครื่องมือ", "Tool")
                  : t("กิจกรรม", "Action")}</th
              ><th scope="col"
                >{mode === "executions"
                  ? t("ระบบ / พื้นที่ทำงาน", "System / workspace")
                  : t("รายการที่เกี่ยวข้อง", "Related item")}</th
              ><th scope="col">{t("ผู้ใช้งาน", "User")}</th>{#if mode === "executions"}<th scope="col" class="duration"
                  >{t("ระยะเวลา", "Duration")}</th
                >{/if}<th
                scope="col"
                aria-sort={sort === "newest" ? "descending" : "ascending"}
                ><button
                  type="button"
                  class="sort-button"
                  onclick={() => (sort = sort === "newest" ? "oldest" : "newest")}
                  >{t(
                    "วันเวลา (เวลาไทย)",
                    "Time (Bangkok)",
                  )}{#if sort === "newest"}<ArrowDown size={14} />{:else}<ArrowUp
                      size={14}
                    />{/if}</button
                ></th
              ><th scope="col" class="open-col"><span class="sr-only">{t("รายละเอียด", "Details")}</span></th
              ></tr
            ></thead
          ><tbody
            >{#each pagination.items as event (event.id)}{@const detail =
                auditDetailValues(event)}{@const related = resourceDisplay(event)}{@const workspace =
                hubDisplay(event.hubID)}<tr
                ><td
                  ><span
                    class="outcome"
                    class:success={event.outcome === "success"}
                    class:failed={event.outcome === "error" ||
                      event.outcome === "denied" ||
                      event.outcome === "timeout"}
                    >{labels[event.outcome] ||
                      event.outcome ||
                      "—"}</span
                  ></td
                ><td class="event-cell"
                  ><button
                    type="button"
                    class="event-name"
                    onclick={() => openDetails(event)}>{eventLabel(event)}</button
                  ><span class="event-code"
                    >{mode === "executions"
                      ? event.id
                      : event.action || event.method || "—"}</span
                  ></td
                ><td class="context-cell"
                  >{#if mode === "executions"}{@render entity(connectionDisplay(event.connectionID), false)}{@render entity(hubDisplay(event.hubID), true)}{:else}{@render entity(related, false)}{#if event.hubID && (related.label !== workspace.label || related.id !== workspace.id)}{@render entity(workspace, true)}{/if}{/if}</td
                ><td
                  ><span class="primary-cell"
                    >{names.users[event.userID] ||
                      event.userID ||
                      t("ORCA (อัตโนมัติ)", "ORCA (automated)")}</span
                  >{#if names.users[event.userID]}<span class="secondary-cell"
                      >{t("รหัส", "ID")}: {event.userID}</span
                    >{/if}</td
                >{#if mode === "executions"}<td class="duration"
                    >{detail.durationMs !== undefined
                      ? auditDuration(detail.durationMs)
                      : "—"}</td
                  >{/if}<td class="timestamp">{displayDate(event.createdAt)}</td
                ><td class="open-col"
                  ><button
                    type="button"
                    class="detail-button"
                    aria-label={`${t("ดูรายละเอียด", "View details")}: ${eventLabel(event)}`}
                    title={t("ดูรายละเอียด", "View details")}
                    onclick={() => openDetails(event)}
                    ><ChevronRight size={16} /></button
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
            >{t("แถวต่อหน้า", "Rows per page")}<select bind:value={pageSize}
              ><option value={25}>25</option><option value={50}>50</option><option
                value={100}>100</option
              ></select
            ></label
          ><button
            type="button"
            disabled={pagination.page <= 1}
            onclick={() => (pageNumber = pagination.page - 1)}
            aria-label={t("หน้าก่อนหน้า", "Previous page")}
            title={t("หน้าก่อนหน้า", "Previous page")}
            ><ChevronLeft size={16} /></button
          ><span class="page-status">{pagination.page} / {pagination.pages}</span><button
            type="button"
            disabled={pagination.page >= pagination.pages}
            onclick={() => (pageNumber = pagination.page + 1)}
            aria-label={t("หน้าถัดไป", "Next page")}
            title={t("หน้าถัดไป", "Next page")}
            ><ChevronRight size={16} /></button
          >
        </div>
      </footer>
    </div>{/if}
  <p class="retention-note">
    {t(
      "แสดงรายการล่าสุดไม่เกิน 200 รายการ ตามสิทธิ์ของคุณและพื้นที่ทำงานที่เลือก ตัวกรองและจำนวนรายการคำนวณจากข้อมูลชุดนี้เท่านั้น",
      "Shows up to the 200 most recent records for your access and the selected workspace. Filters and counts apply only to this loaded set.",
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
        <h2 id="audit-detail-title">{eventLabel(selected)}</h2>
        <p>
          {mode === "executions"
            ? t("รายละเอียดการใช้งานเครื่องมือ", "Tool use details")
            : t("รายละเอียดการเปลี่ยนแปลง", "Change details")}
        </p>
      </div>
      <button
        type="button"
        class="drawer-close"
        onclick={() => detailDialog.close()}
        aria-label={t("ปิดรายละเอียด", "Close details")}
        title={t("ปิดรายละเอียด", "Close details")}><X size={16} /></button
      >
    </header>
    <div class="drawer-body">
      <div class="drawer-status">
        <span
          class="outcome"
          class:success={selected.outcome === "success"}
          class:failed={selected.outcome === "error" ||
            selected.outcome === "denied"}
          >{labels[selected.outcome] ||
            selected.outcome}</span
        ><span>{displayDate(selected.createdAt)}</span>
      </div>
      {#if selected.outcome === "admitted"}<p class="admission-note">
          {t(
            "ORCA ได้รับคำขอแล้ว แต่ยังไม่มีการบันทึกผลการดำเนินการในประวัตินี้",
            "ORCA received the request, but no result has been recorded for it yet.",
          )}
        </p>{/if}
      <dl class="identity-details">
        <div>
          <dt>{t("ผู้ดำเนินการ", "Performed by")}</dt>
          <dd>
            {names.users[selected.userID] ||
              selected.userID ||
              t("ORCA (อัตโนมัติ)", "ORCA (automated)")}{#if selected.userID}<small
                >{t("รหัส", "ID")}: {selected.userID}</small
              >{/if}
          </dd>
        </div>
        <div>
          <dt>{t("รหัสกิจกรรมที่บันทึก", "Recorded action code")}</dt>
          <dd><code>{selected.action || selected.method || "—"}</code></dd>
        </div>
        {#if selected.hubID}{@const workspace = hubDisplay(selected.hubID)}<div>
            <dt>{t("พื้นที่ทำงาน AI", "AI workspace")}</dt>
            <dd>
              <a
                href={localeHref(
                  `/app?view=hub&hub=${encodeURIComponent(selected.hubID)}`,
                )}
                >{workspace.label || selected.hubID}<ArrowUpRight
                  size={14}
                /></a
              >{#if workspace.id && workspace.label}<small class="audit-id">{workspace.id}</small>{/if}
            </dd>
          </div>{/if}{#if selected.connectionID}{@const system = connectionDisplay(selected.connectionID)}<div>
            <dt>
              {isSignInSourceEvent(selected)
                ? t("การเข้าสู่ระบบองค์กร", "Sign-in source")
                : t("ระบบที่เชื่อมต่อ", "Connected system")}
            </dt>
            <dd>
              <a
                href={localeHref(
                  `/app?view=servers&connection=${encodeURIComponent(selected.connectionID)}`,
                )}
                >{isSignInSourceEvent(selected)
                  ? selected.connectionID
                  : system.label || selected.connectionID}<ArrowUpRight size={14} /></a
              >{#if !isSignInSourceEvent(selected) && system.id && system.label}<small class="audit-id"
                  >{system.id}</small
                >{/if}
            </dd>
          </div>{/if}
      </dl>
      <AuditDetails event={selected} expanded />
      <p class="payload-note">
        {t(
          "ประวัตินี้เก็บเฉพาะข้อมูลอ้างอิง ไม่เก็บข้อมูลที่ส่งให้เครื่องมือ เนื้อหาผลลัพธ์ หรือคีย์ API",
          "This record contains reference data only. Tool inputs, response contents and API keys are not stored.",
        )}
      </p>
    </div>{/if}
</dialog>

<style>
  .observability {
    min-width: 0;
    color: var(--orca-ink);
  }
  .audit-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 20px;
  }
  .audit-heading > div {
    flex: 1 1 360px;
    min-width: 0;
  }
  .audit-heading h1 {
    margin: 0;
  }
  .subtitle {
    max-width: 72ch;
    margin: 4px 0 0;
    color: var(--orca-muted);
    font-size: 14px;
    line-height: 1.65;
  }
  .audit-heading :global(.k-button) {
    flex: none;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  /* Underline tabs */
  .audit-tabs {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    overflow-x: auto;
    box-shadow: inset 0 -1px 0 var(--orca-line);
    scrollbar-width: none;
  }
  .audit-tabs a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 2px;
    border-bottom: 2px solid transparent;
    color: var(--orca-muted);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }
  .audit-tabs a:hover {
    color: var(--orca-ink);
    text-decoration: none;
  }
  .audit-tabs a.active {
    border-bottom-color: var(--orca-ink);
    color: var(--orca-ink);
    font-weight: 600;
  }
  /* Toolbar: the search is wider; the filters share equal columns. */
  .audit-toolbar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: end;
    gap: 12px;
  }
  .filters,
  .secondary-filters {
    display: contents;
  }
  .search-field {
    grid-column: span 2;
  }
  label {
    display: grid;
    gap: 6px;
    min-width: 0;
    color: var(--orca-muted);
    font-size: 13px;
    font-weight: 500;
  }
  input,
  select {
    min-width: 0;
    color: var(--orca-ink);
    font: inherit;
  }
  .audit-toolbar select {
    width: 100%;
    height: 36px;
    padding: 0 28px 0 11px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background-color: var(--orca-surface);
    color: var(--orca-ink);
    font-size: 14px;
    font-weight: 400;
  }
  .search-field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 11px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-subtle);
  }
  .search-field input {
    width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 14px;
  }
  .search-field input::placeholder {
    color: var(--orca-subtle);
  }
  .search-field:focus-within,
  .audit-toolbar select:focus-visible {
    border-color: var(--orca-ink);
    outline: none;
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .search-field input:focus-visible {
    outline: none;
  }
  .audit-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    min-height: 32px;
    margin: 14px 0 12px;
  }
  .loaded-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .loaded-summary > span:last-child {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* Table panel */
  .audit-panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .audit-table-wrap {
    position: relative;
    overflow-x: auto;
  }
  .audit-table {
    width: 100%;
    border-collapse: collapse;
    text-align: start;
    font-size: 14px;
  }
  th {
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
  td {
    max-width: 280px;
    padding: 10px 14px;
    border-bottom: 1px solid #eff0f2;
    color: var(--orca-ink);
    vertical-align: middle;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover td {
    background: var(--orca-surface-2);
  }
  .sort-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .sort-button:hover {
    color: var(--orca-ink);
  }
  .event-name {
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--orca-ink);
    font-size: 14px;
    font-weight: 500;
    text-align: start;
    cursor: pointer;
    overflow-wrap: break-word;
  }
  .event-name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .event-code,
  .audit-id {
    display: block;
    max-width: 260px;
    margin-top: 2px;
    overflow: hidden;
    color: var(--orca-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .primary-cell {
    display: block;
    overflow-wrap: break-word;
  }
  .secondary-cell.entity-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .entity-line > span:first-child {
    flex: none;
  }
  .entity-line .audit-id {
    flex: 1 1 auto;
    min-width: 0;
    margin-top: 0;
  }
  .secondary-cell {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 13px;
    overflow-wrap: break-word;
  }
  .duration,
  .timestamp {
    color: var(--orca-muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .outcome {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.6;
    white-space: nowrap;
  }
  .outcome.success {
    background: var(--orca-ok-bg);
    color: var(--orca-ok);
  }
  .outcome.failed {
    background: var(--orca-deny-bg);
    color: var(--orca-deny);
  }
  .open-col {
    width: 1%;
    padding-inline: 8px;
    text-align: end;
  }
  .detail-button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .detail-button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 10px 14px;
    border-top: 1px solid var(--orca-line);
    color: var(--orca-muted);
    font-size: 13px;
  }
  .pagination > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pagination label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
    font-weight: 400;
    white-space: nowrap;
  }
  .pagination select {
    width: 72px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background-color: var(--orca-surface);
    font-size: 13px;
  }
  .pagination button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-ink);
    cursor: pointer;
  }
  .pagination button:hover:not(:disabled) {
    border-color: var(--orca-line-strong);
    background: var(--orca-secondary);
  }
  .page-status {
    min-width: 48px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .retention-note {
    max-width: 900px;
    margin: 12px 0 0;
    color: var(--orca-muted);
    font-size: 12.5px;
    line-height: 1.65;
  }
  .audit-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 240px;
    padding: 48px 24px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-subtle);
    text-align: center;
  }
  .audit-empty h2 {
    margin: 4px 0 0;
    color: var(--orca-ink);
    font-size: 15px;
    font-weight: 600;
  }
  .audit-empty p {
    max-width: 460px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13.5px;
    line-height: 1.65;
  }
  .audit-empty :global(.k-button) {
    margin-top: 8px;
  }
  .audit-error {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--orca-deny) 25%, transparent);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-deny-bg);
    color: var(--orca-deny);
  }
  .audit-error > :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .audit-error h2 {
    margin: 0;
    color: var(--orca-ink);
    font-size: 14.5px;
    font-weight: 600;
  }
  .audit-error p {
    margin: 4px 0 10px;
    color: var(--orca-ink);
    font-size: 13.5px;
    overflow-wrap: anywhere;
  }
  /* Detail drawer */
  .audit-drawer {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(520px, 100%);
    max-width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--orca-line);
    background: var(--orca-surface);
    color: var(--orca-ink);
  }
  .audit-drawer::backdrop {
    background: rgba(21, 24, 35, 0.35);
  }
  .drawer-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px 16px 24px;
    border-bottom: 1px solid var(--orca-line);
  }
  .drawer-heading h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .drawer-heading p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .drawer-close {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .drawer-close:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .drawer-body {
    padding: 18px 24px 24px;
  }
  .drawer-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .identity-details {
    display: grid;
    margin: 14px 0 0;
    border-top: 1px solid #eff0f2;
  }
  .identity-details > div {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 4px 16px;
    padding: 10px 0;
    border-bottom: 1px solid #eff0f2;
  }
  dt {
    color: var(--orca-muted);
    font-size: 13px;
  }
  dd {
    min-width: 0;
    margin: 0;
    color: var(--orca-ink);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  dd small {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  dd .audit-id {
    max-width: none;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  dd code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px;
  }
  dd a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--orca-ink);
    text-decoration: none;
  }
  dd a:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  dd a :global(svg) {
    flex: none;
    color: var(--orca-subtle);
  }
  .payload-note,
  .admission-note {
    margin: 16px 0 0;
    color: var(--orca-muted);
    font-size: 12.5px;
    line-height: 1.65;
  }
  .admission-note {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--orca-warn) 24%, transparent);
    border-radius: var(--orca-radius);
    background: var(--orca-warn-bg);
    color: var(--orca-warn);
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
  @media (max-width: 1100px) {
    .audit-toolbar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .search-field {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 760px) {
    .audit-heading > div {
      flex-basis: 100%;
    }
    .audit-table {
      min-width: 760px;
    }
    .pagination > div {
      margin-left: auto;
    }
  }
  @media (max-width: 480px) {
    .identity-details > div {
      grid-template-columns: minmax(0, 1fr);
    }
    .drawer-heading,
    .drawer-body {
      padding-inline: 16px;
    }
  }
</style>
