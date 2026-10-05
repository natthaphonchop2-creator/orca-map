<script lang="ts">
  import { groupPlatformViews, platformAuditLabel } from "$lib/orca/platform-console";
  import { onDestroy, tick } from "svelte";
  import {
    ArrowDown,
    ArrowUp,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    ListFilter,
    RefreshCw,
    Search,
    SearchX,
    X,
  } from "@lucide/svelte";
  import AuditDetails from "$lib/components/orca/AuditDetails.svelte";
  import { auditDetailValues, auditDuration } from "$lib/orca/audit-details";
  import {
    DELETED_CONNECTIONS,
    PLATFORM_ACTOR,
    auditEventMode,
    auditFilterOptions,
    auditPage,
    filterAuditEvents,
    type AuditMode,
    type AuditSort,
    type AuditTimeRange,
  } from "$lib/orca/audit-filters";
  import { term } from "$lib/orca/glossary";
  import { t, localeHref, orcaLocale } from "$lib/orca/locale.svelte";
  import { eventToolLabel } from "$lib/orca/program-tools";
  import {
    OrcaService,
    displayDate,
    orcaError,
    memberName,
    type OrcaAuditEvent,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  import EmptyState from "./ui/EmptyState.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import StatusPill, { type StatusTone } from "./ui/StatusPill.svelte";

  // ตรวจสอบ › ประวัติการใช้งาน (what AI apps did) and ประวัติการตั้งค่า (what
  // Owners and Admins changed). The workspace filter keeps its place in the
  // address (&hub=); the other filters work on the records already loaded.
  let {
    data,
    hubID = "",
    mode = "executions",
    showModeTabs = true,
    onhubchange,
  }: {
    data: OrcaBootstrap;
    hubID?: string;
    mode?: AuditMode;
    /** Off under ตรวจสอบ, whose tab bar already switches between the two histories. */
    showModeTabs?: boolean;
    /** The workspace chosen in the filter, so ตรวจสอบ's tab links keep it. */
    onhubchange?: (hubID: string) => void;
  } = $props();
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
  let moreFilters = $state(false);
  let selected = $state<OrcaAuditEvent>();
  let detailDialog: HTMLDialogElement;
  let requestNumber = 0,
    previousFilters = "";
  let previousMode: AuditMode | undefined;
  // Tool use is ประวัติการใช้งาน; changes by Owners and Admins are ประวัติการตั้งค่า.
  const title = $derived(mode === "administration" ? term("settingsHistory", t) : term("usageHistory", t));
  const subtitle = $derived(
    mode === "administration"
      ? data.canManage
        ? t("ดูว่าเจ้าของบริษัทและผู้ดูแลเปลี่ยนการตั้งค่าอะไร เมื่อไร", "See what owners and admins changed, and when.")
        : // An employee receives only their own changes.
          t("สิ่งที่คุณเปลี่ยนเอง เช่น ความรู้และคำสั่งสำเร็จรูปที่คุณแก้ และเมื่อไร", "What you changed yourself, such as knowledge and ready-made prompts, and when.")
      : data.canManage
        ? t("ดูว่าใครให้ AI ทำอะไรกับโปรแกรมไหน และสำเร็จหรือไม่", "See who had AI do what in which program, and whether it worked.")
        : t("ดูว่า AI ของคุณทำอะไรไปบ้าง และสำเร็จหรือไม่", "See what your AI did, and whether it worked."),
  );
  const labels: Record<string, string> = $derived({
    admitted: t("รับคำขอแล้ว", "Received"),
    success: t("สำเร็จ", "Succeeded"),
    error: t("ไม่สำเร็จ", "Failed"),
    denied: t("ไม่ได้รับอนุญาต", "Denied"),
    timeout: t("หมดเวลา", "Timed out"),
    unknown: t("ไม่ทราบผล", "Unknown"),
  });
  const outcomeTone = (value: string): StatusTone =>
    value === "success" ? "ok" : value === "error" || value === "denied" || value === "timeout" ? "deny" : "neutral";
  const actionLabels: Record<string, string> = $derived({
    "member.role.update": t("เปลี่ยนบทบาทสมาชิก", "Member role changed"),
    "organization.update": t("แก้ไขข้อมูลบริษัท", "Company details updated"),
    "unit.create": t("สร้างแผนก", "Department created"),
    "unit.update": t("แก้ไขแผนก", "Department updated"),
    "connection.create": t("เชื่อมโปรแกรมใหม่", "Program connected"),
    "connection.update": t("แก้ไขโปรแกรมที่เชื่อม", "Program updated"),
    "connection.archive": t("จัดเก็บโปรแกรมที่เชื่อม", "Program archived"),
    "connection.restore": t("กู้คืนโปรแกรมที่เชื่อม", "Program restored"),
    "connection.delete": t("ลบโปรแกรมที่เชื่อม", "Program deleted"),
    "hub.create": t("สร้างพื้นที่ทำงาน AI", "AI workspace created"),
    "hub.update": t("แก้ไขพื้นที่ทำงาน AI", "AI workspace updated"),
    "hub.archive": t("จัดเก็บพื้นที่ทำงาน AI", "AI workspace archived"),
    "hub.restore": t("กู้คืนพื้นที่ทำงาน AI", "AI workspace restored"),
    "hub.delete": t("ลบพื้นที่ทำงาน AI", "AI workspace deleted"),
    "key.create": t("สร้างคีย์", "Key created"),
    "key.revoke": t("ตัดการเชื่อมต่อคีย์", "Key disconnected"),
    "member.suspend": t("ระงับสมาชิก", "Member suspended"),
    "member.restore": t("เปิดใช้สมาชิกอีกครั้ง", "Member restored"),
    "member.remove": t("นำสมาชิกออก", "Member removed"),
    "department.archive": t("จัดเก็บแผนก", "Department archived"),
    "department.restore": t("กู้คืนแผนก", "Department restored"),
    "department.delete": t("ลบแผนก", "Department deleted"),
    "user_source.create": t("เพิ่ม SSO ของบริษัท", "Company SSO added"),
    "user_source.update": t("แก้ไข SSO ของบริษัท", "Company SSO updated"),
    "user_source.delete": t("ลบ SSO ของบริษัท", "Company SSO deleted"),
    "oauth_app.configure": t("ตั้งค่าการเข้าสู่ระบบของโปรแกรม", "Program sign-in set up"),
    "oauth_app.replace": t("เปลี่ยนการเข้าสู่ระบบของโปรแกรม", "Program sign-in replaced"),
    "oauth_app.remove": t("นำการเข้าสู่ระบบของโปรแกรมออก", "Program sign-in removed"),
    "oauth_session.revoke": t("ตัดการเชื่อมต่อแอป AI", "AI app disconnected"),
    // An AI app's sign-in continued on the workspace's login (C4 design §14h).
    "ai.signin.handoff": t("เข้าสู่ระบบเพื่อเชื่อมแอป AI", "Signed in to connect an AI app"),
    "approval.request": t("ขออนุมัติงานที่แก้ข้อมูล", "Approval requested"),
    "approval.approve": t("อนุมัติงานที่แก้ข้อมูล", "Change approved"),
    "approval.reject": t("ปฏิเสธงานที่แก้ข้อมูล", "Change rejected"),
    "access.inspect": t("แอป AI ตรวจสิทธิ์ของตัวเอง", "An AI app checked its access"),
    "tools.call": t("AI ใช้โปรแกรม", "AI used a program"),
    "tools/call": t("AI ใช้โปรแกรม", "AI used a program"),
    "library.call": t("AI เปิดคลังความรู้", "AI used knowledge"),
    "mcp.request": t("คำขอจากแอป AI", "AI app request"),
    "library.create": t("เพิ่มรายการในคลังความรู้", "Knowledge item added"),
    "library.update": t("แก้ไขรายการในคลังความรู้", "Knowledge item updated"),
    "library.archive": t("จัดเก็บรายการในคลังความรู้", "Knowledge item archived"),
    // Knowledge library v2 (C4 §14m S5): files, their reading, and who may use them.
    "library.file.upload": t("อัปโหลดไฟล์เข้าคลังความรู้", "File uploaded to Knowledge"),
    "library.file.replace": t("อัปโหลดไฟล์ฉบับใหม่", "New file version uploaded"),
    "library.file.ready": t("ORCA อ่านไฟล์เสร็จ", "ORCA read a file"),
    "library.file.partial": t("ORCA อ่านไฟล์ได้บางส่วน", "ORCA read part of a file"),
    "library.file.failed": t("ORCA อ่านไฟล์ไม่ได้", "ORCA could not read a file"),
    "library.file.publish": t("ใช้ไฟล์ฉบับใหม่", "New file version put in use"),
    "library.file.options": t("เปลี่ยนการตั้งค่าไฟล์", "File settings changed"),
    "library.file.reextract": t("สั่งอ่านไฟล์ใหม่", "File read again"),
    "library.file.download": t("ดาวน์โหลดไฟล์ต้นฉบับ", "Original file downloaded"),
    "library.audience.live": t("ให้ทุกคนใช้ได้ (อัปเดตอัตโนมัติ)", "Audience set to everyone (updates itself)"),
    "library.audience.list": t("ให้ใช้ได้ตามรายชื่อ", "Audience set to a list"),
    "library.delete": t("ลบรายการในคลังความรู้", "Knowledge item deleted"),
    "library.purged": t("ORCA ลบรายการที่สั่งลบออกหมดแล้ว", "ORCA finished deleting an item"),
    "library.takeover": t("รับช่วงดูแลรายการในคลังความรู้", "Knowledge item taken over"),
    "library.v2": t("ทีม ORCA เปิดหรือปิดคลังความรู้แบบไฟล์", "The ORCA team switched file Knowledge"),
    "platform.company.library_v2": t("เปิดหรือปิดคลังความรู้แบบไฟล์ของบริษัทลูกค้า", "File Knowledge switched for a customer company"),
    "department.members": t("แก้ไขสมาชิกของแผนก", "Department members updated"),
    "template.preview": t("ดูตัวอย่างคำสั่งสำเร็จรูป", "Ready-made prompt previewed"),
    "invitation.create": t("สร้างคำเชิญ", "Invitation created"),
    "invitation.reissue": t("สร้างลิงก์เชิญใหม่", "Invitation link renewed"),
    "invitation.revoke": t("ยกเลิกคำเชิญ", "Invitation revoked"),
    "invitation.accept": t("ตอบรับคำเชิญ", "Invitation accepted"),
    "platform.company.create": t("เปิดบริษัทลูกค้า", "Customer company opened"),
    "platform.company.owner_invite": t("เชิญเจ้าของบริษัทลูกค้า", "Customer company's owner invited"),
    "platform.company.owner_revoke": t("ยกเลิกคำเชิญเจ้าของบริษัทลูกค้า", "Customer company's owner invitation revoked"),
    // What ORCA did in this company (platform console C6, owner decision P6).
    "platform.view": t("ORCA ดูข้อมูลบริษัท", "ORCA viewed company data"),
    "platform.suspend": t("ORCA ระงับการใช้งานบริษัทชั่วคราว", "ORCA suspended the company"),
    "platform.restore": t("ORCA เปิดให้ใช้งานบริษัทอีกครั้ง", "ORCA restored the company"),
    "platform.rename": t("ORCA เปลี่ยนชื่อบริษัท", "ORCA renamed the company"),
  });
  const names = $derived({
    // A customer company's log names the platform, never the operator's account.
    users: Object.fromEntries([
      [PLATFORM_ACTOR, "ORCA"],
      ...data.members.map((member) => [member.id, memberName(member)]),
    ]),
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
      // What each row shows, e.g. "ค้นหาไฟล์" for search_files.
      (event) => [eventLabel(event)],
    ),
  );
  // Consecutive looks by ORCA at the same area show as one row (C6 §4.1);
  // every look is still recorded.
  const pagination = $derived(auditPage(groupPlatformViews(visibleEvents), pageNumber, pageSize));
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
  // The filters behind "ตัวกรองเพิ่มเติม": person, program, and what AI did or the change.
  const moreFilterCount = $derived([userID, connectionID, mode === "executions" ? toolName : action].filter(Boolean).length);
  // Members only ever see their own records, so the person column and filter are for managers.
  const showPeople = $derived(data.canManage);
  // A filter in use stays in sight.
  const moreOpen = $derived(moreFilters || moreFilterCount > 0);
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
  /** What the AI did, in words: the program's own label for the tool when it is known. */
  function toolLabel(name: string, fromConnection?: string) {
    return eventToolLabel(data.connections, fromConnection, name, orcaLocale.value === "en" ? "en" : "th");
  }
  // The flag's events say which way it went by their version: 1 on, 0 off.
  function switchLabel(event: OrcaAuditEvent) {
    if (event.action === "library.v2")
      return event.version === 1 ? t("ทีม ORCA เปิดคลังความรู้แบบไฟล์", "The ORCA team turned on file Knowledge") : t("ทีม ORCA ปิดคลังความรู้แบบไฟล์", "The ORCA team turned off file Knowledge");
    if (event.action === "platform.company.library_v2")
      return event.version === 1 ? t("เปิดคลังความรู้แบบไฟล์ให้บริษัทลูกค้า", "File Knowledge turned on for a customer company") : t("ปิดคลังความรู้แบบไฟล์ของบริษัทลูกค้า", "File Knowledge turned off for a customer company");
    return "";
  }
  function eventLabel(event: OrcaAuditEvent & { repeated?: number }) {
    const flag = switchLabel(event);
    if (flag) return flag;
    const platform = platformAuditLabel(event, t);
    if (platform) return event.repeated && event.repeated > 1 ? t(`${platform} (${event.repeated} ครั้ง)`, `${platform} (${event.repeated} times)`) : platform;
    return mode === "executions"
      ? (event.toolName ? toolLabel(event.toolName, event.connectionID) : "") ||
          actionLabels[event.action ?? event.method ?? ""] ||
          event.action ||
          event.method ||
          t("ไม่ได้บันทึกว่า AI ทำอะไร", "Not recorded")
      : actionLabels[event.action ?? ""] ||
          event.action ||
          event.method ||
          t("ไม่ได้บันทึกว่าเปลี่ยนอะไร", "Not recorded");
  }
  // Presentation only: records that no longer resolve keep their ID, shown under a readable label.
  // Managers see every program and workspace, so an unresolved ID there means the record was deleted.
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
      return { label: term("companySSO", t), id };
    return data.canManage
      ? { label: t("โปรแกรมที่ถูกลบแล้ว", "Deleted program"), id }
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
    // The company's own details: name the company, never a code or "—".
    if ((event.action ?? "").startsWith("organization.") || event.action === "library.v2")
      return { label: data.organization?.displayName || t("ข้อมูลบริษัท", "Company details") };
    const id = event.resourceID;
    if (id) {
      const known =
        names.hubs[id] ||
        names.connections[id] ||
        names.users[id] ||
        data.units.find((unit) => unit.id === id)?.name;
      if (known) return { label: known };
      if (isSignInSourceEvent(event))
        return { label: term("companySSO", t), id };
      if (id === event.connectionID || (event.action ?? "").startsWith("connection."))
        return connectionDisplay(id);
      if (id === event.hubID || (event.action ?? "").startsWith("hub."))
        return hubDisplay(id);
      // A knowledge item: the history keeps no title, so it is named by its kind (its code in the title).
      if ((event.action ?? "").startsWith("library.file."))
        return { label: t("ไฟล์ในคลังความรู้", "A file in Knowledge"), id };
      if ((event.action ?? "").startsWith("library."))
        return { label: t("รายการในคลังความรู้", "A Knowledge item"), id };
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
  // Known programs by name; every program that no longer resolves shares one
  // option, so the filter never lists raw IDs.
  const connectionOptions = $derived.by(() => {
    const known = connections
      .filter((id) => names.connections[id] || signInSourceIDs.has(id))
      .map((id) => ({
        value: id,
        label:
          names.connections[id] ||
          term("companySSO", t),
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
            label: `${data.canManage ? t("โปรแกรมที่ถูกลบแล้ว", "Deleted programs") : t("โปรแกรมอื่น", "Other programs")} (${gone})`,
          },
        ]
      : known;
  });
  const toolOptions = $derived(
    tools.map((name) => ({ value: name, label: toolLabel(name) })).sort((a, b) => a.label.localeCompare(b.label)),
  );
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
    onhubchange?.(selectedHubID);
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
  const hubQuery = $derived(selectedHubID ? `&hub=${encodeURIComponent(selectedHubID)}` : "");
</script>

{#snippet entity(item: EntityDisplay, secondary: boolean)}
  {#if secondary}<span class="secondary-cell"
      >{#if item.label}<span title={item.id}>{item.label}</span>{:else if item.id}<span
          class="audit-id"
          title={item.id}>{item.id}</span
        >{/if}</span
    >{:else}{#if item.label}<span class="primary-cell" title={item.id}>{item.label}</span
      >{:else if item.id}<span class="audit-id" title={item.id}>{item.id}</span>{/if}{/if}
{/snippet}

<section class="observability" aria-labelledby="audit-title">
  {#if showModeTabs}<nav class="audit-tabs" aria-label={t("ประเภทประวัติ", "History type")}>
      <a
        class:active={mode === "executions"}
        aria-current={mode === "executions" ? "page" : undefined}
        href={localeHref(`/app?view=executions${hubQuery}`)}>{term("usageHistory", t)}</a
      ><a
        class:active={mode === "administration"}
        aria-current={mode === "administration" ? "page" : undefined}
        href={localeHref(`/app?view=audit${hubQuery}`)}>{term("settingsHistory", t)}</a
      >
    </nav>{/if}
  <PageHeader id="audit-title" {title} {subtitle} />

  <div class="audit-toolbar">
    <label class="search-field">
      <Search size={16} aria-hidden="true" /><input
        type="search"
        bind:value={query}
        aria-label={t("ค้นหาในประวัติ", "Search the history")}
        placeholder={mode === "executions"
          ? showPeople ? t("ค้นหาสิ่งที่ AI ทำ ชื่อคน หรือรหัสอ้างอิง", "Search by what AI did, person or reference") : t("ค้นหาสิ่งที่ AI ทำ หรือรหัสอ้างอิง", "Search by what AI did or reference")
          : showPeople ? t("ค้นหาสิ่งที่เปลี่ยน หรือชื่อคน", "Search by change or person") : t("ค้นหาสิ่งที่เปลี่ยน", "Search by change")}
      />
    </label>
    <label class="audit-field"
      ><span>{term("workspaces", t)}</span><select bind:value={selectedHubID}
        ><option value="">{t("ทุกพื้นที่ทำงาน", "All workspaces")}</option
        >{#each data.hubs as hub (hub.id)}<option value={hub.id}>{hub.name}</option>{/each}</select
      ></label
    >
    <label class="audit-field"
      ><span>{t("ผลลัพธ์", "Result")}</span><select bind:value={outcome}
        ><option value="">{t("ทุกผลลัพธ์", "All results")}</option
        >{#each outcomes as value}<option {value}>{labels[value] || value}</option>{/each}</select
      ></label
    >
    <label class="audit-field"
      ><span>{t("ช่วงเวลา", "Time")}</span><select bind:value={timeRange}
        ><option value="all">{t("ทุกช่วงเวลา", "All time")}</option><option value="24h"
          >{t("24 ชั่วโมงล่าสุด", "Last 24 hours")}</option
        ><option value="7d">{t("7 วันล่าสุด", "Last 7 days")}</option><option value="30d"
          >{t("30 วันล่าสุด", "Last 30 days")}</option
        ></select
      ></label
    >
    <div class="audit-toolbar-actions">
      <button
        type="button"
        class="k-button audit-more-toggle"
        class:open={moreOpen}
        aria-expanded={moreOpen}
        aria-controls="audit-more-filters"
        onclick={() => (moreFilters = !moreOpen)}
        ><ListFilter size={16} aria-hidden="true" />{t("ตัวกรองเพิ่มเติม", "More filters")}{#if moreFilterCount}<span class="audit-more-count">{moreFilterCount}</span>{/if}</button
      >
      <button
        type="button"
        class="k-button audit-refresh"
        disabled={loading}
        onclick={() => refresh(selectedHubID)}
        aria-label={t("โหลดใหม่", "Reload")}
        title={t("โหลดใหม่", "Reload")}><RefreshCw size={16} class={loading ? "k-spin" : ""} aria-hidden="true" /></button
      >
    </div>
  </div>
  {#if moreOpen}<div class="audit-more" id="audit-more-filters">
      {#if showPeople}<label class="audit-field"
          ><span>{t("คน", "Person")}</span><select bind:value={userID}
            ><option value="">{t("ทุกคน", "Everyone")}</option
            >{#each users as id}<option value={id}>{names.users[id] || id}</option>{/each}</select
          ></label
        >{/if}<label class="audit-field"
        ><span>{term("program", t)}</span><select bind:value={connectionID}
          ><option value="">{t("ทุกโปรแกรม", "All programs")}</option
          >{#each connectionOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select
        ></label
      >{#if mode === "executions"}<label class="audit-field"
          ><span>{term("whatAICanDo", t)}</span><select bind:value={toolName}
            ><option value="">{t("ทุกอย่าง", "Everything")}</option
            >{#each toolOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select
          ></label
        >{:else}<label class="audit-field"
          ><span>{t("สิ่งที่เปลี่ยน", "Change")}</span><select bind:value={action}
            ><option value="">{t("ทุกอย่าง", "Everything")}</option
            >{#each actions as value}<option {value}>{actionLabels[value] || value}</option>{/each}</select
          ></label
        >{/if}
    </div>{/if}

  <div class="audit-meta">
    <p class="loaded-summary" role="status">
      {#if loading}{t("กำลังโหลด…", "Loading…")}{:else}{t(
          `${visibleEvents.length} จาก ${modeEvents.length} รายการ`,
          `${visibleEvents.length} of ${modeEvents.length} records`,
        )}{#if loadedAt}<span>· {t("โหลดเมื่อ", "Loaded")} {displayDate(new Date(loadedAt).toISOString())}</span>{/if}{/if}
    </p>
    {#if activeFilters}<button type="button" class="k-button quiet small" onclick={clearFilters}
        ><X size={15} aria-hidden="true" />{t("ล้างตัวกรอง", "Clear filters")}</button
      >{/if}
  </div>

  {#if error}<div class="k-banner error audit-error" role="alert">
      <p><strong>{t("โหลดประวัติไม่สำเร็จ", "The history could not be loaded.")}</strong> {error}</p>
      <button type="button" class="k-button small" onclick={() => refresh(selectedHubID)}>{t("ลองอีกครั้ง", "Try again")}</button>
    </div>
  {:else if loading}<div class="audit-loading" role="status">
      <RefreshCw size={20} class="k-spin" aria-hidden="true" />{t("กำลังโหลดประวัติ…", "Loading the history…")}
    </div>
  {:else if !visibleEvents.length}
    {#if activeFilters}<EmptyState
        icon={SearchX}
        message={t("ไม่พบรายการที่ตรงกับตัวกรอง", "Nothing matches these filters.")}
        actionLabel={t("ล้างตัวกรอง", "Clear filters")}
        onaction={clearFilters}
      />{:else}<EmptyState
        icon={ClipboardList}
        message={mode === "executions"
          ? t("ยังไม่มีประวัติการใช้งาน รายการจะขึ้นเมื่อ AI เริ่มทำงาน", "No activity yet. It appears once AI starts working.")
          : data.canManage
            ? t("ยังไม่มีการเปลี่ยนการตั้งค่า", "No settings changes yet.")
            : t("คุณยังไม่ได้เปลี่ยนอะไร", "You haven't changed anything yet.")}
      />{/if}
  {:else}<div class="audit-panel">
      <table class="audit-table">
        <thead
          ><tr
            ><th scope="col">{t("ผลลัพธ์", "Result")}</th><th scope="col"
              >{mode === "executions" ? t("สิ่งที่ AI ทำ", "What AI did") : t("สิ่งที่เปลี่ยน", "Change")}</th
            ><th scope="col"
              >{mode === "executions" ? t("โปรแกรม / พื้นที่ทำงาน", "Program / workspace") : t("รายการที่เกี่ยวข้อง", "Related item")}</th
            >{#if showPeople}<th scope="col">{t("คน", "Person")}</th>{/if}{#if mode === "executions"}<th scope="col" class="duration"
                >{t("ใช้เวลา", "Duration")}</th
              >{/if}<th scope="col" aria-sort={sort === "newest" ? "descending" : "ascending"}
              ><button type="button" class="sort-button" onclick={() => (sort = sort === "newest" ? "oldest" : "newest")}
                >{t("วันเวลา", "Time")}{#if sort === "newest"}<ArrowDown size={14} aria-hidden="true" />{:else}<ArrowUp
                    size={14}
                    aria-hidden="true"
                  />{/if}</button
              ></th
            ><th scope="col" class="open-col"><span class="sr-only">{t("รายละเอียด", "Details")}</span></th></tr
          ></thead
        ><tbody
          >{#each pagination.items as event (event.id)}{@const detail = auditDetailValues(event)}{@const related =
              resourceDisplay(event)}{@const workspace = hubDisplay(event.hubID)}<tr
              ><td class="outcome-cell"
                ><StatusPill label={labels[event.outcome] || event.outcome || "—"} tone={outcomeTone(event.outcome)} /></td
              ><td class="event-cell"
                ><button type="button" class="event-name audit-open" onclick={() => openDetails(event)}>{eventLabel(event)}</button
                ></td
              ><td class="context-cell"
                >{#if mode === "executions"}{@render entity(connectionDisplay(event.connectionID), false)}{@render entity(
                    hubDisplay(event.hubID),
                    true,
                  )}{:else}{@render entity(related, false)}{#if event.hubID && (related.label !== workspace.label || related.id !== workspace.id)}{@render entity(
                      workspace,
                      true,
                    )}{/if}{/if}</td
              >{#if showPeople}<td class="person-cell"
                  ><span class="primary-cell">{names.users[event.userID] || event.userID || t("ORCA (อัตโนมัติ)", "ORCA (automated)")}</span></td
                >{/if}{#if mode === "executions"}<td class="duration" data-label={t("ใช้เวลา ", "Duration ")}
                  >{detail.durationMs !== undefined ? auditDuration(detail.durationMs, orcaLocale.value === "en" ? "en" : "th") : "—"}</td
                >{/if}<td class="timestamp">{displayDate(event.createdAt)}</td
              ><td class="open-col"
                ><button
                  type="button"
                  class="detail-button"
                  aria-label={`${t("ดูรายละเอียด", "View details")}: ${eventLabel(event)}`}
                  title={t("ดูรายละเอียด", "View details")}
                  onclick={() => openDetails(event)}><ChevronRight size={16} aria-hidden="true" /></button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
      <footer class="pagination">
        <span>{pagination.start}–{pagination.end} {t("จาก", "of")} {pagination.total}</span>
        <div>
          <label
            >{t("แถวต่อหน้า", "Rows per page")}<select bind:value={pageSize}
              ><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select
            ></label
          ><button
            type="button"
            disabled={pagination.page <= 1}
            onclick={() => (pageNumber = pagination.page - 1)}
            aria-label={t("หน้าก่อนหน้า", "Previous page")}
            title={t("หน้าก่อนหน้า", "Previous page")}><ChevronLeft size={16} aria-hidden="true" /></button
          ><span class="page-status">{pagination.page} / {pagination.pages}</span><button
            type="button"
            disabled={pagination.page >= pagination.pages}
            onclick={() => (pageNumber = pagination.page + 1)}
            aria-label={t("หน้าถัดไป", "Next page")}
            title={t("หน้าถัดไป", "Next page")}><ChevronRight size={16} aria-hidden="true" /></button
          >
        </div>
      </footer>
    </div>{/if}
  <p class="retention-note">
    {t(
      "แสดง 200 รายการล่าสุดที่คุณมีสิทธิ์ดู ตัวกรองและตัวเลขนับจากรายการชุดนี้",
      "Shows the 200 most recent records you may see. Filters and counts use only these.",
    )}
  </p>
</section>

<dialog bind:this={detailDialog} class="audit-drawer" aria-labelledby="audit-detail-title" onclose={() => (selected = undefined)}>
  {#if selected}<header class="drawer-heading">
      <div>
        <h2 id="audit-detail-title">{eventLabel(selected)}</h2>
        <p>{mode === "executions" ? t("รายละเอียดสิ่งที่ AI ทำ", "What AI did") : t("รายละเอียดการเปลี่ยนแปลง", "Change details")}</p>
      </div>
      <button
        type="button"
        class="drawer-close"
        onclick={() => detailDialog.close()}
        aria-label={t("ปิดรายละเอียด", "Close details")}
        title={t("ปิดรายละเอียด", "Close details")}><X size={16} aria-hidden="true" /></button
      >
    </header>
    <div class="drawer-body">
      <div class="drawer-status">
        <StatusPill label={labels[selected.outcome] || selected.outcome} tone={outcomeTone(selected.outcome)} /><span
          >{displayDate(selected.createdAt)}</span
        >
      </div>
      {#if selected.outcome === "admitted"}<p class="admission-note">
          {t("ORCA รับคำขอแล้ว แต่ยังไม่มีผลบันทึกไว้", "ORCA received the request, but no result is recorded yet.")}
        </p>{/if}
      <dl class="identity-details">
        <div>
          <dt>{t("ทำโดย", "Done by")}</dt>
          <dd>{names.users[selected.userID] || selected.userID || t("ORCA (อัตโนมัติ)", "ORCA (automated)")}</dd>
        </div>
        {#if selected.hubID}{@const workspace = hubDisplay(selected.hubID)}<div>
            <dt>{t("พื้นที่ทำงาน AI", "AI workspace")}</dt>
            <dd>
              <a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(selected.hubID)}`)}
                >{workspace.label || selected.hubID}<ArrowUpRight size={14} aria-hidden="true" /></a
              >{#if workspace.id && workspace.label}<small class="audit-id">{workspace.id}</small>{/if}
            </dd>
          </div>{/if}{#if selected.connectionID}{@const system = connectionDisplay(selected.connectionID)}<div>
            <dt>{isSignInSourceEvent(selected) ? term("companySSO", t) : term("program", t)}</dt>
            <dd>
              <a href={localeHref(`/app?view=servers&connection=${encodeURIComponent(selected.connectionID)}`)}
                >{isSignInSourceEvent(selected) ? selected.connectionID : system.label || selected.connectionID}<ArrowUpRight
                  size={14}
                  aria-hidden="true"
                /></a
              >{#if !isSignInSourceEvent(selected) && system.id && system.label}<small class="audit-id">{system.id}</small>{/if}
            </dd>
          </div>{/if}
      </dl>
      <AuditDetails
        event={selected}
        codes={[
          { label: t("รหัสผู้ใช้", "Person ID"), value: selected.userID },
          { label: t("ชื่อที่โปรแกรมใช้", "Program's name for it"), value: selected.toolName ?? "" },
          { label: t("รหัสกิจกรรม", "Action code"), value: selected.action || selected.method || "" },
        ]}
      />
      <p class="payload-note">
        {t(
          "ORCA เก็บแค่ข้อมูลอ้างอิง ไม่เก็บข้อมูลที่ AI ส่งหรือได้รับ และไม่เก็บคีย์",
          "ORCA keeps reference data only: never what AI sent or received, and never keys.",
        )}
      </p>
    </div>{/if}
</dialog>

<style>
  /* The page follows its own width, not the window's: the sidebar takes a share. */
  .observability {
    min-width: 0;
    color: var(--orca-ink);
    container: audit / inline-size;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  /* A member's own switch between the two histories (managers use ตรวจสอบ's tab bar). */
  .audit-tabs {
    display: flex;
    gap: 28px;
    margin: 0 0 28px;
    overflow-x: auto;
    box-shadow: inset 0 -1px 0 var(--orca-line);
    scrollbar-width: none;
  }
  .audit-tabs a {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    border-bottom: 2px solid transparent;
    color: var(--orca-muted);
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }
  .audit-tabs a:hover {
    color: var(--orca-ink);
    text-decoration: none;
  }
  .audit-tabs a.active {
    border-bottom-color: var(--orca-tab-indicator, var(--orca-ink));
    color: var(--orca-ink);
    font-weight: 600;
  }
  /* Toolbar: search, the three main filters, then more filters and reload. */
  .audit-toolbar,
  .audit-more {
    display: grid;
    grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 12px;
  }
  .audit-more {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface-2);
  }
  .audit-field {
    display: grid;
    gap: 6px;
    min-width: 0;
    color: var(--orca-muted);
    font-size: 12.5px;
    font-weight: 600;
  }
  .audit-field select,
  .pagination select {
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 0 28px 0 11px;
    border: 1px solid var(--orca-field-line);
    border-radius: var(--orca-radius);
    background-color: var(--orca-field);
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 400;
  }
  .search-field {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--orca-field-line);
    border-radius: var(--orca-radius);
    background: var(--orca-field);
    color: var(--orca-subtle);
  }
  .search-field input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
  }
  .search-field input::placeholder {
    color: var(--orca-subtle);
  }
  .search-field:focus-within,
  .audit-field select:focus-visible,
  .pagination select:focus-visible {
    border-color: var(--orca-focus);
    outline: none;
    box-shadow: 0 0 0 3px var(--orca-focus-halo);
  }
  .audit-toolbar-actions {
    display: flex;
    gap: 8px;
  }
  .audit-toolbar-actions :global(.k-button) {
    min-height: 38px;
    color: var(--orca-text-2) !important;
  }
  .audit-toolbar-actions .audit-refresh {
    width: 38px;
    padding: 0;
    justify-content: center;
  }
  .audit-more-toggle.open {
    border-color: var(--orca-line-strong);
    background: var(--orca-secondary);
  }
  .audit-more-count {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--orca-ink);
    color: var(--orca-on-ink);
    font-size: 11px;
    font-weight: 700;
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
    gap: 4px 8px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .audit-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
  }
  .audit-error p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .audit-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 48px 20px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-muted);
    font-size: 14px;
  }
  /* The table */
  .audit-panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .audit-table {
    width: 100%;
    border-collapse: collapse;
    text-align: start;
    font-size: 14px;
  }
  th {
    height: 42px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--orca-line);
    background: var(--orca-surface);
    color: var(--orca-subtle);
    font-size: 12.5px;
    font-weight: 600;
    text-align: start;
    white-space: nowrap;
  }
  td {
    max-width: 300px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--orca-line-soft);
    color: var(--orca-text-2);
    vertical-align: middle;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover td {
    background: var(--orca-hover);
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
    font: inherit;
    font-size: 14.5px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
    overflow-wrap: break-word;
  }
  .event-name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
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
    color: var(--orca-ink);
    overflow-wrap: break-word;
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
    padding: 10px 16px;
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
    white-space: nowrap;
  }
  .pagination select {
    width: 72px;
    height: 32px;
    padding: 0 8px;
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
    margin: 12px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  /* The detail drawer */
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
    background: var(--orca-scrim, rgba(21, 24, 35, 0.45));
  }
  .drawer-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 20px 16px 24px;
    border-bottom: 1px solid var(--orca-line);
  }
  .drawer-heading h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
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
    border-top: 1px solid var(--orca-line-soft);
  }
  .identity-details > div {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 4px 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--orca-line-soft);
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
    font-size: 13px;
    line-height: 1.6;
  }
  .admission-note {
    padding: 10px 12px;
    border: 1px solid var(--orca-warn-line);
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
  @container audit (max-width: 1000px) {
    .audit-toolbar {
      grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    }
    .search-field {
      grid-column: 1 / -1;
    }
  }
  @container audit (max-width: 640px) {
    .audit-toolbar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .audit-toolbar-actions {
      grid-column: 1 / -1;
    }
    .audit-toolbar-actions .audit-more-toggle {
      flex: 1;
      justify-content: center;
    }
    .audit-more {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* Cards under 900px of page: each record stacks, the result and time on top. */
  @container audit (max-width: 900px) {
    .audit-panel {
      overflow: visible;
      border: 0;
      background: transparent;
    }
    .audit-table,
    .audit-table tbody {
      display: block;
    }
    .audit-table thead {
      display: none;
    }
    .audit-table tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 12px;
      margin-bottom: 10px;
      padding: 14px 16px;
      border: 1px solid var(--orca-line);
      border-radius: var(--orca-radius-lg);
      background: var(--orca-surface);
    }
    .audit-table td {
      display: block;
      max-width: none;
      padding: 0;
      border: 0;
    }
    tbody tr:hover td {
      background: transparent;
    }
    .outcome-cell {
      grid-column: 1;
      grid-row: 1;
    }
    .timestamp {
      grid-column: 2;
      grid-row: 1;
      align-self: center;
      text-align: end;
    }
    .event-cell,
    .context-cell,
    .person-cell {
      grid-column: 1 / -1;
    }
    .audit-table td.duration {
      grid-column: 1 / -1;
    }
    .audit-table td.duration::before {
      content: attr(data-label);
    }
    .open-col {
      display: none !important;
    }
    .person-cell .primary-cell,
    .context-cell .primary-cell {
      color: var(--orca-text-2);
      font-size: 13.5px;
    }
    .pagination {
      padding: 4px 0 0;
      border: 0;
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
