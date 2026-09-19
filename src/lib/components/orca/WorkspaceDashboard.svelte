<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Activity,
    ArrowRight,
    CircleAlert,
    Folder,
    Plus,
    Plug,
    Code2,
    ShieldCheck,
  } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { connectionReady, workspaceToolingReady } from "$lib/orca/activation";
  import { sourcePresentationNames } from "$lib/orca/connection-presentation";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { selectedToolInventory } from "$lib/orca/tool-inventory";
  import {
    OrcaService,
    displayDate,
    memberName,
    type OrcaAuditEvent,
    type OrcaBootstrap,
  } from "$lib/services/orca";

  let { data }: { data: OrcaBootstrap } = $props();
  let events = $state<OrcaAuditEvent[]>([]);
  let activityLoading = $state(true);
  let activityError = $state(false);
  let sourceNames = $state<Record<string, string>>({});
  let alive = true;
  const ready = $derived(data.connections.filter(connectionReady).length);
  const paused = $derived(
    data.connections.filter((connection) => !connection.enabled).length,
  );
  const review = $derived(data.connections.length - ready - paused);
  const activeSpaces = $derived(
    data.hubs.filter((hub) => hub.status === "active").length,
  );
  const blockedSpaces = $derived(
    data.hubs.filter(
      (hub) =>
        hub.status === "active" &&
        !workspaceToolingReady(
          hub,
          data.connections.find(
            (connection) => connection.id === hub.connectionID,
          ),
        ),
    ).length,
  );
  const today = $derived(
    data.hubs.reduce((sum, hub) => sum + Math.max(0, hub.usedToday || 0), 0),
  );
  const recentConnections = $derived(
    [...data.connections]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5),
  );
  const recentSpaces = $derived(
    [...data.hubs]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3),
  );
  const stats = $derived([
    {
      label: "Servers",
      value: data.connections.length,
      detail: t("เปิดใช้งาน ", "Enabled: ") + ready,
      icon: Plug,
      href: "/app?view=servers",
    },
    {
      label: "MCP Gateways",
      value: data.hubs.length,
      detail: t("เปิดใช้งาน ", "Active: ") + activeSpaces,
      icon: Folder,
      href: "/app?view=workspaces",
    },
    {
      label: t("เครื่องมือที่เลือก", "Selected tools"),
      value: selectedToolInventory(data).length,
      detail: t("ตามการตั้งค่าขององค์กร", "From saved configuration"),
      icon: Code2,
      href: data.canManage ? "/app?view=catalog" : "/app?view=workspaces",
    },
    {
      label: t("คำขอวันนี้", "Requests today"),
      value: today,
      detail: t("ใน Gateway ที่คุณเข้าถึง", "Across your MCP Gateways"),
      icon: Activity,
      href: "/app?view=executions",
    },
  ]);
  const outcomes: Record<string, string> = $derived({
    success: t("สำเร็จ", "Succeeded"),
    error: t("ไม่สำเร็จ", "Failed"),
    denied: t("ไม่อนุญาต", "Denied"),
    timeout: t("หมดเวลา", "Timed out"),
    admitted: t("รับคำขอแล้ว", "Received"),
    unknown: t("รอตรวจสอบผล", "Unconfirmed"),
  });
  function eventName(event: OrcaAuditEvent) {
    if (event.toolName) return event.toolName;
    const action = event.action || event.method || "";
    if (action.startsWith("connection."))
      return t("ปรับ Server", "Server updated");
    if (action.startsWith("hub."))
      return t("ปรับ MCP Gateway", "MCP Gateway updated");
    if (action.startsWith("key."))
      return t("จัดการคีย์เชื่อมต่อ", "Connection key updated");
    if (action.startsWith("unit.")) return t("ปรับหน่วยงาน", "Unit updated");
    if (action.startsWith("organization."))
      return t("ปรับข้อมูลองค์กร", "Organization updated");
    return t("กิจกรรมใน MCP Gateway", "MCP Gateway activity");
  }
  async function loadActivity() {
    activityLoading = true;
    activityError = false;
    try {
      const result = await OrcaService.audit();
      if (alive)
        events = result
          .filter((event) =>
            ["tools.call", "tools/call"].includes(
              event.action || event.method || "",
            ),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5);
    } catch {
      if (alive) activityError = true;
    } finally {
      if (alive) activityLoading = false;
    }
  }
  onMount(() => {
    void loadActivity();
    void OrcaService.candidates()
      .then((items) => {
        if (alive) sourceNames = sourcePresentationNames(items);
      })
      .catch(() => {
        /* Names remain available when catalog metadata cannot be read. */
      });
  });
  onDestroy(() => {
    alive = false;
  });
</script>

<div class="dashboard">
  <div class="connection-heading">
    <div>
      <h1>{t("ภาพรวม", "Dashboard")}</h1>
      <p>
        {t(
          "ระบบ เครื่องมือ และการเข้าถึงของทีม ในที่เดียว",
          "Your systems, tools and team access at a glance.",
        )}
      </p>
    </div>
    <div class="dashboard-actions">
      <a class="k-button" href={localeHref("/app?view=workspaces")}
        ><Folder size={15} />{t("เปิด MCP Gateways", "Open MCP Gateways")}</a
      >
      {#if data.canManage}<a
          class="k-button primary"
          href={localeHref("/app?view=servers&add=source")}
          ><Plus size={18} />{t("เพิ่ม Server", "Add server")}</a
        >{/if}
    </div>
  </div>
  <section
    class="dashboard-stats"
    aria-label={t("สรุปการใช้งาน", "Usage summary")}
  >
    {#each stats as stat}<a class="dashboard-stat" href={localeHref(stat.href)}
        ><span class="stat-label"><stat.icon size={18} />{stat.label}</span
        ><strong>{stat.value.toLocaleString()}</strong><small
          >{stat.detail}<ArrowRight size={14} /></small
        ></a
      >{/each}
  </section>
  <div class="dashboard-grid">
    <section
      class="dashboard-panel connections-summary"
      aria-labelledby="dashboard-connections"
    >
      <header>
        <div>
          <h2 id="dashboard-connections">
            {"Servers"}
          </h2>
          <p>
            {t(
              "สถานะตามการตั้งค่าล่าสุด",
              "Status from the saved configuration",
            )}
          </p>
        </div>
        <a href={localeHref("/app?view=servers")}
          >{t("ดูทั้งหมด", "View all")}<ArrowRight size={15} /></a
        >
      </header>
      <div class="status-summary">
        <div class="status-track" aria-hidden="true">
          {#if data.connections.length}<span class="ready" style:flex={ready}
            ></span><span class="review" style:flex={review}></span><span
              class="paused"
              style:flex={paused}
            ></span>{/if}
        </div>
        <div class="status-legend">
          <span
            ><i class="ready"></i>{t("เปิดใช้งาน", "Enabled")}
            <b>{ready}</b></span
          ><span
            ><i class="review"></i>{t("รอตรวจสอบ", "Needs review")}
            <b>{review}</b></span
          ><span
            ><i class="paused"></i>{t("ระงับ", "Paused")} <b>{paused}</b></span
          >
        </div>
      </div>
      <div class="dashboard-connections">
        {#each recentConnections as connection (connection.id)}<a
            class="dashboard-row"
            href={localeHref(
              "/app?view=servers&connection=" +
                encodeURIComponent(connection.id),
            )}
          >
            <span class="provider-icon"
              ><CatalogIcon
                name={sourceNames[connection.mcpID] || connection.name}
                size={28}
              /></span
            >
            <span class="row-copy"
              ><strong title={connection.name}>{connection.name}</strong><small
                >{connection.toolNames.length}
                {t("เครื่องมือที่เลือก", "selected tools")}</small
              ></span
            >
            <span
              class="dashboard-badge"
              class:enabled={connectionReady(connection)}
              >{!connection.enabled
                ? t("ระงับ", "Paused")
                : connectionReady(connection)
                  ? t("เปิดใช้งาน", "Enabled")
                  : t("รอตรวจสอบ", "Needs review")}</span
            ><ArrowRight class="row-arrow" size={16} />
          </a>{:else}<div class="dashboard-empty">
            <Plug size={25} /><strong
              >{t(
                "เริ่มเชื่อมระบบที่ทีมใช้",
                "Connect your first system",
              )}</strong
            >
            <p>
              {t(
                "เพิ่ม Server และกำหนดเครื่องมือที่องค์กรอนุญาต ก่อนเลือกเครื่องมือและสมาชิกใน MCP Gateway",
                "Add a server and approve its tools, then choose tools and members in an MCP Gateway.",
              )}
            </p>
            <a
              href={localeHref(
                data.canManage ? "/app?view=servers&add=source" : "/app?view=help",
              )}>{t("เริ่มต้น", "Get started")}<ArrowRight size={15} /></a
            >
          </div>{/each}
      </div>
      {#if data.connections.length > 5}<div class="panel-note">
          {t(
            "แสดง 5 รายการที่อัปเดตล่าสุด จากทั้งหมด ",
            "5 recently updated servers of ",
          )}{data.connections.length}
        </div>{/if}
    </section>
    <div class="dashboard-side">
      <section
        class="dashboard-panel attention-panel"
        aria-labelledby="dashboard-attention"
      >
        <header>
          <h2 id="dashboard-attention">
            <ShieldCheck size={19} />{t("การดูแลระบบ", "Access checks")}
          </h2>
        </header>
        {#if review > 0}<a
            class="attention-row"
            href={localeHref("/app?view=servers&status=needs-review")}
            ><CircleAlert size={18} /><span
              ><strong
                >{review}
                {t("Servers รอตรวจสอบ", "servers need review")}</strong
              ><small
                >{t(
                  "ตรวจเครื่องมือก่อนเปิดให้ทีมใช้",
                  "Review tools before giving access",
                )}</small
              ></span
            ><ArrowRight size={15} /></a
          >{/if}
        {#if blockedSpaces > 0}<a
            class="attention-row"
            href={localeHref("/app?view=workspaces")}
            ><CircleAlert size={18} /><span
              ><strong
                >{blockedSpaces}
                {t(
                  "Gateway ยังใช้เครื่องมือไม่ได้",
                  "MCP Gateways need attention",
                )}</strong
              ><small
                >{t(
                  "Server ถูกระงับหรือยังไม่ผ่านการตรวจสอบเครื่องมือ",
                  "Source paused or tools not yet reviewed",
                )}</small
              ></span
            ><ArrowRight size={15} /></a
          >{/if}
        {#if !review && !blockedSpaces}<p class="attention-clear">
            <ShieldCheck size={19} />{t(
              "ไม่มีรายการรอตรวจสอบเครื่องมือ",
              "No pending tool reviews",
            )}
          </p>{/if}
        <a
          class="attention-footer"
          href={localeHref("/app?view=settings&section=members")}
          >{t("จัดการสมาชิกและสิทธิ์", "Manage members and access")}<ArrowRight
            size={15}
          /></a
        >
      </section>
      <section class="dashboard-panel" aria-labelledby="dashboard-workspaces">
        <header>
          <h2 id="dashboard-workspaces">{"MCP Gateways"}</h2>
          <a href={localeHref("/app?view=workspaces")}
            >{t("ดูทั้งหมด", "View all")}<ArrowRight size={15} /></a
          >
        </header>
        {#each recentSpaces as hub (hub.id)}<a
            class="dashboard-row compact"
            href={localeHref("/app?view=hub&hub=" + encodeURIComponent(hub.id))}
            ><Folder size={19} /><span class="row-copy"
              ><strong title={hub.name}>{hub.name}</strong><small
                >{hub.memberIDs.length}
                {t("สมาชิก", "members")} · {hub.status === "active"
                  ? t("เปิดใช้งาน", "Active")
                  : hub.status === "draft"
                    ? t("แบบร่าง", "Draft")
                    : t("ระงับ", "Paused")}</small
              ></span
            ><ArrowRight size={15} /></a
          >{:else}<p class="panel-note">
            {t("ยังไม่มี MCP Gateway", "No MCP Gateways yet")}
          </p>{/each}
      </section>
    </div>
  </div>
  <section
    class="dashboard-panel activity-panel"
    aria-labelledby="dashboard-activity"
  >
    <header>
      <div>
        <h2 id="dashboard-activity">
          {t("การเรียกเครื่องมือล่าสุด", "Recent executions")}
        </h2>
        <p>
          {data.canManage
            ? t(
                "การเรียกเครื่องมือที่คุณมีสิทธิ์ดู",
                "Executions you have access to",
              )
            : t("ประวัติการเรียกเครื่องมือของคุณ", "Your recent executions")}
        </p>
      </div>
      <a href={localeHref("/app?view=executions")}
        >{t("ดูประวัติทั้งหมด", "View executions")}<ArrowRight size={15} /></a
      >
    </header>
    {#if activityLoading}<p class="panel-note" role="status">
        {t("กำลังโหลดประวัติ…", "Loading executions…")}
      </p>{:else if activityError}<div class="panel-note" role="alert">
        {t("โหลดประวัติไม่สำเร็จ", "Could not load executions")}
        <button class="k-link-button" onclick={loadActivity}
          >{t("ลองอีกครั้ง", "Retry")}</button
        >
      </div>{:else}<ul class="activity-list">
        {#each events as event (event.id)}<li>
            <span class="event-icon"><Activity size={16} /></span><span
              class="row-copy"
              ><strong title={eventName(event)}>{eventName(event)}</strong
              ><small
                >{memberName(
                  data.members.find((member) => member.id === event.userID) || {
                    id: "",
                    email: "",
                    displayName: t("สมาชิก", "Member"),
                    role: "",
                  },
                )}</small
              ></span
            ><span
              class="dashboard-badge"
              class:enabled={event.outcome === "success"}
              >{outcomes[event.outcome] ||
                t("รอตรวจสอบผล", "Unconfirmed")}</span
            ><time datetime={event.createdAt}
              >{displayDate(event.createdAt)}</time
            >
          </li>{:else}<li class="activity-empty">
            {t(
              "ยังไม่มีประวัติการเรียกเครื่องมือ",
              "No executions to display yet",
            )}
          </li>{/each}
      </ul>{/if}
  </section>
</div>

<style>
  .dashboard {
    display: grid;
    gap: 20px;
    min-inline-size: 0;
  }
  .dashboard .connection-heading {
    margin-block-end: 0;
  }
  .dashboard-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dashboard-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .dashboard-stat {
    padding: 17px 18px;
    border: 1px solid #e3e7ed;
    border-radius: 8px;
    color: #1b2331;
    display: grid;
    gap: 12px;
    text-decoration: none;
    background: #fff;
  }
  .dashboard-stat:hover {
    border-color: #adbf7e;
    background: #fafcf6;
  }
  .stat-label {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 13px;
    color: #627080;
  }
  .dashboard-stat > strong {
    font-size: 30px;
    line-height: 1.1;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .dashboard-stat small {
    display: flex;
    justify-content: space-between;
    gap: 5px;
    font-size: 11px;
    color: #697586;
    align-items: center;
  }
  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }
  .dashboard-panel {
    min-inline-size: 0;
    border: 1px solid #e3e7ed;
    border-radius: 8px;
    background: white;
    overflow: clip;
  }
  .dashboard-panel header {
    padding: 20px 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .dashboard-panel h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dashboard-panel header p {
    margin: 5px 0 0;
    font-size: 11px;
    color: #718091;
  }
  .dashboard-panel a {
    text-decoration: none;
  }
  .dashboard-panel header > a,
  .dashboard-empty a,
  .attention-footer {
    color: #526c2f;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    white-space: nowrap;
  }
  .status-summary {
    padding: 0 22px 16px;
  }
  .status-track {
    display: flex;
    gap: 3px;
    height: 7px;
    overflow: hidden;
    border-radius: 5px;
    background: #eef1f4;
  }
  .status-track > span {
    min-width: 0;
  }
  .ready {
    background: #9fc650;
  }
  .review {
    background: #dca34f;
  }
  .paused {
    background: #ced5df;
  }
  .status-legend {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    margin-top: 12px;
    font-size: 11px;
    color: #647183;
  }
  .status-legend span {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .status-legend i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .status-legend b {
    color: #303949;
    font-variant-numeric: tabular-nums;
  }
  .dashboard-row {
    padding: 14px 22px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid #edf0f4;
    color: #263142;
    min-inline-size: 0;
  }
  .dashboard-row:hover {
    background: #fafcf6;
  }
  .row-copy {
    display: grid;
    gap: 4px;
    min-inline-size: 0;
    flex: 1;
  }
  .row-copy strong {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-copy small {
    font-size: 11px;
    color: #748193;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .provider-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .dashboard-badge {
    padding: 4px 9px;
    border-radius: 5px;
    background: #f0f2f6;
    color: #657185;
    font-size: 10px;
    white-space: nowrap;
  }
  .dashboard-badge.enabled {
    color: #4f6f28;
    background: #eef6df;
  }
  .dashboard-row :global(.row-arrow) {
    color: #94a0ad;
  }
  .dashboard-side {
    display: grid;
    gap: 20px;
    min-inline-size: 0;
  }
  .attention-panel header {
    padding-block-end: 12px;
  }
  .attention-row {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 12px 22px;
    color: #8a6628;
  }
  .attention-row span {
    display: grid;
    gap: 4px;
    flex: 1;
    min-inline-size: 0;
  }
  .attention-row strong {
    font-size: 12px;
    font-weight: 600;
    color: #364153;
  }
  .attention-row small {
    color: #718091;
    font-size: 11px;
    line-height: 1.5;
  }
  .attention-footer {
    border-top: 1px solid #edf0f4;
    padding: 13px 22px;
    width: 100%;
    box-sizing: border-box;
  }
  .attention-clear {
    display: flex;
    gap: 9px;
    margin: 0;
    padding: 12px 22px 20px;
    color: #607a3f;
    font-size: 12px;
  }
  .compact {
    padding-block: 12px;
  }
  .compact > :global(svg) {
    color: #839178;
    flex-shrink: 0;
  }
  .panel-note {
    margin: 0;
    padding: 14px 22px;
    font-size: 11px;
    color: #778391;
    border-top: 1px solid #edf0f4;
  }
  .dashboard-empty {
    padding: 32px 24px;
    display: grid;
    justify-items: center;
    gap: 10px;
    color: #768471;
    text-align: center;
  }
  .dashboard-empty strong {
    color: #364153;
    font-size: 14px;
  }
  .dashboard-empty p {
    margin: 0;
    font-size: 12px;
  }
  .activity-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .activity-list li {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 13px 22px;
    border-top: 1px solid #edf0f4;
  }
  .event-icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 8px;
    background: #f4f6f9;
    color: #7c8c9b;
  }
  .activity-list time {
    width: 148px;
    font-size: 11px;
    color: #7b8794;
    text-align: end;
  }
  .activity-empty {
    font-size: 12px;
    color: #718091;
  }
  @media (max-width: 1080px) {
    .dashboard-grid {
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    }
    .dashboard-stats {
      gap: 12px;
    }
    .dashboard-stat {
      padding: 17px;
    }
    .dashboard-panel header,
    .dashboard-row {
      padding-inline: 17px;
    }
    .dashboard-row :global(.row-arrow) {
      display: none;
    }
  }
  @media (max-width: 680px) {
    .dashboard-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .dashboard-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .dashboard {
      gap: 18px;
    }
    .activity-list li {
      flex-wrap: wrap;
      gap: 9px;
      padding-inline: 17px;
    }
    .activity-list time {
      width: auto;
      margin-inline-start: 39px;
      flex-basis: calc(100% - 39px);
      text-align: start;
    }
    .dashboard-panel header > a {
      font-size: 10px;
    }
    .dashboard-panel h2 {
      font-size: 14px;
    }
    .dashboard-row {
      gap: 9px;
    }
  }
</style>
