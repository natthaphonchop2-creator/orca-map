<script lang="ts">
  import { gatewayConnections, gatewayMemberIDs, gatewayToolCount } from "$lib/orca/gateway-sources";
  import { onDestroy, onMount } from "svelte";
  import {
    Activity,
    ArrowRight,
    BookOpen,
    Boxes,
    Check,
    CircleAlert,
    CircleCheck,
    Plug,
    Plus,
    Sparkles,
    Users,
  } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { connectionReady, workspaceToolingReady } from "$lib/orca/activation";
  import { sourcePresentationNames } from "$lib/orca/connection-presentation";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    displayDate,
    memberName,
    type OrcaAuditEvent,
    type OrcaBootstrap,
    type OrcaConnection,
    type OrcaHub,
  } from "$lib/services/orca";

  let { data }: { data: OrcaBootstrap } = $props();
  let events = $state<OrcaAuditEvent[]>([]);
  let activityLoading = $state(true);
  let activityError = $state(false);
  let sourceNames = $state<Record<string, string>>({});
  let alive = true;

  const manager = $derived(data.canManage);
  const organization = $derived(data.organization.displayName || "ORCA");
  const ready = $derived(data.connections.filter(connectionReady).length);
  const paused = $derived(data.connections.filter((connection) => !connection.enabled).length);
  const review = $derived(data.connections.length - ready - paused);
  const activeSpaces = $derived(data.hubs.filter((hub) => hub.status === "active").length);
  const blockedSpaces = $derived(
    data.hubs.filter((hub) => hub.status === "active" && !workspaceToolingReady(hub, data.connections)).length,
  );
  const today = $derived(data.hubs.reduce((sum, hub) => sum + Math.max(0, hub.usedToday || 0), 0));
  const attention = $derived(review + blockedSpaces + (manager ? paused : 0));
  const spaces = $derived([...data.hubs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
  const systems = $derived([...data.connections].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // The first steps an owner takes; the card disappears once all four are complete.
  const aiUsed = $derived(events.length > 0);
  const setupSteps = $derived([
    {
      done: data.connections.length > 0,
      title: t("เชื่อมระบบขององค์กร", "Connect a system"),
      detail: t("เช่น FlowAccount, Google Drive หรือ API ขององค์กร", "Such as FlowAccount, Google Drive or your own API"),
      href: "/app?view=catalog",
      action: t("เพิ่มระบบ", "Add a system"),
    },
    {
      done: data.hubs.length > 0,
      title: t("สร้างพื้นที่ทำงาน AI", "Create an AI workspace"),
      detail: t("กำหนดระบบ เครื่องมือ และสมาชิกที่ใช้งานได้", "Choose the systems, tools and members"),
      href: "/app?view=new",
      action: t("สร้างพื้นที่ทำงาน", "Create workspace"),
    },
    {
      done: data.members.length > 1,
      title: t("เพิ่มสมาชิก", "Add members"),
      detail: t("เพิ่มสมาชิกและจัดแผนกขององค์กร", "Add members and organize departments"),
      href: "/app?view=members",
      action: t("จัดการสมาชิก", "Manage members"),
    },
    {
      done: aiUsed,
      title: t("เชื่อม AI กับ ORCA", "Connect AI to ORCA"),
      detail: t("เพิ่มลิงก์เชื่อม AI ใน ChatGPT หรือ Claude", "Add the AI connection link to ChatGPT or Claude"),
      href: "/app?view=api-keys",
      action: t("ดูวิธีเชื่อม", "View instructions"),
    },
  ]);
  const setupDone = $derived(setupSteps.filter((step) => step.done).length);
  const showSetup = $derived(manager && !activityLoading && setupDone < setupSteps.length);

  const stats = $derived(
    manager
      ? [
          { label: t("ระบบที่เชื่อมต่อ", "Connected systems"), value: data.connections.length, detail: t(`พร้อมใช้งาน ${ready} ระบบ`, `${ready} ready`), icon: Plug, href: "/app?view=servers" },
          { label: t("พื้นที่ทำงาน AI", "AI workspaces"), value: data.hubs.length, detail: t(`เปิดใช้งาน ${activeSpaces} แห่ง`, `${activeSpaces} active`), icon: Boxes, href: "/app?view=workspaces" },
          { label: t("สมาชิก", "Members"), value: data.members.length, detail: t("สมาชิกที่ใช้งานอยู่", "Active members"), icon: Users, href: "/app?view=members" },
          { label: t("การใช้งานวันนี้", "Usage today"), value: today, detail: t("จำนวนครั้งจากทุกพื้นที่ทำงาน", "Requests across all workspaces"), icon: Activity, href: "/app?view=executions" },
        ]
      : [
          { label: t("พื้นที่ทำงานของคุณ", "Your workspaces"), value: data.hubs.length, detail: t(`เปิดใช้งาน ${activeSpaces} แห่ง`, `${activeSpaces} active`), icon: Boxes, href: "/app?view=workspaces" },
          { label: t("ระบบที่ใช้งานได้", "Available systems"), value: data.connections.length, detail: t(`พร้อมใช้งาน ${ready} ระบบ`, `${ready} ready`), icon: Plug, href: "/app?view=accounts" },
          { label: t("การใช้งานวันนี้", "Usage today"), value: today, detail: t("จำนวนครั้งในพื้นที่ทำงานของคุณ", "Requests in your workspaces"), icon: Activity, href: "/app?view=workspaces" },
        ],
  );

  const outcomes: Record<string, string> = $derived({
    success: t("สำเร็จ", "Succeeded"),
    error: t("ไม่สำเร็จ", "Failed"),
    denied: t("ไม่ได้รับอนุญาต", "Denied"),
    timeout: t("หมดเวลา", "Timed out"),
    admitted: t("รับคำขอแล้ว", "Received"),
    unknown: t("รอยืนยันผล", "Unconfirmed"),
  });
  const outcomeTone = (outcome: string) =>
    outcome === "success" ? "ok" : outcome === "denied" || outcome === "error" || outcome === "timeout" ? "bad" : "idle";

  function systemIconName(connection: OrcaConnection) {
    return sourceNames[connection.mcpID] || connection.name;
  }
  function spaceStatus(hub: OrcaHub) {
    if (hub.status === "active")
      return workspaceToolingReady(hub, data.connections)
        ? { label: t("เปิดใช้งาน", "Active"), tone: "ok" }
        : { label: t("รอตรวจสอบ", "Needs review"), tone: "warn" };
    if (hub.status === "draft") return { label: t("ฉบับร่าง", "Draft"), tone: "idle" };
    return { label: t("ระงับ", "Paused"), tone: "warn" };
  }
  function systemStatus(connection: OrcaConnection) {
    if (!connection.enabled) return { label: t("ระงับ", "Paused"), tone: "warn" };
    return connectionReady(connection)
      ? { label: t("พร้อมใช้งาน", "Ready"), tone: "ok" }
      : { label: t("รอตรวจสอบ", "Needs review"), tone: "warn" };
  }
  const usage = (hub: OrcaHub) =>
    hub.dailyLimit > 0 ? Math.min(100, Math.round(((hub.usedToday || 0) / hub.dailyLimit) * 100)) : 0;
  const readableTool = (name?: string) => (name || "").replace(/[_-]+/g, " ").trim();
  const hubName = (id: string) => data.hubs.find((hub) => hub.id === id)?.name || "";
  const whoName = (id: string) => {
    const member = data.members.find((item) => item.id === id);
    return member ? memberName(member) : t("สมาชิก", "Member");
  };

  async function loadActivity() {
    activityLoading = true;
    activityError = false;
    try {
      const result = await OrcaService.audit();
      if (alive)
        events = result
          .filter((event) => ["tools.call", "tools/call"].includes(event.action || event.method || ""))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6);
    } catch {
      if (alive) activityError = true;
    } finally {
      if (alive) activityLoading = false;
    }
  }
  onMount(() => {
    void loadActivity();
    // The system catalog is for managers only; members fall back to connection names.
    if (!data.canManage) return;
    void OrcaService.candidates()
      .then((items) => {
        if (alive) sourceNames = sourcePresentationNames(items);
      })
      .catch(() => {
        /* Names fall back to the connection name when catalog metadata cannot be read. */
      });
  });
  onDestroy(() => {
    alive = false;
  });
</script>

<div class="home">
  <header class="home-head">
    <div class="home-title">
      <div class="home-title-row">
        <h1>{t("ภาพรวม", "Overview")}</h1>
        {#if manager}
          <span class="home-state" class:warn={attention > 0}>
            {#if attention > 0}<CircleAlert size={14} aria-hidden="true" />{t(`รอดำเนินการ ${attention} รายการ`, `${plural(attention, "item needs", "items need")} attention`)}
            {:else}<CircleCheck size={14} aria-hidden="true" />{t("ระบบพร้อมใช้งาน", "All systems ready")}{/if}
          </span>
        {/if}
      </div>
      <p class="k-subtitle">
        {manager
          ? t(`สรุประบบที่เชื่อมต่อ พื้นที่ทำงาน AI และการใช้งานของ ${organization}`, `Connected systems, AI workspaces and usage for ${organization}`)
          : t("พื้นที่ทำงาน AI และระบบที่คุณใช้งานได้", "Your AI workspaces and the systems you can use")}
      </p>
    </div>
    <div class="home-actions">
      {#if manager}
        <a class="k-button" href={localeHref("/app?view=catalog")}><Plug size={16} />{t("เพิ่มระบบ", "Add a system")}</a>
        <a class="k-button primary" href={localeHref("/app?view=new")}><Plus size={16} />{t("สร้างพื้นที่ทำงาน AI", "New AI workspace")}</a>
      {:else}
        <a class="k-button primary" href={localeHref("/app?view=api-keys")}><Sparkles size={16} />{t("เชื่อม AI กับ ORCA", "Connect AI to ORCA")}</a>
      {/if}
    </div>
  </header>

  {#if showSetup}
    <section class="home-card home-setup" aria-labelledby="home-setup-title">
      <header class="home-card-head">
        <div>
          <h2 id="home-setup-title">{t("เริ่มต้นใช้งาน", "Getting started")}</h2>
          <p>{t(`ดำเนินการแล้ว ${setupDone} จาก ${setupSteps.length} ขั้นตอน`, `${setupDone} of ${setupSteps.length} steps complete`)}</p>
        </div>
        <div class="home-progress" role="progressbar" aria-valuemin="0" aria-valuemax={setupSteps.length} aria-valuenow={setupDone} aria-label={t("ความคืบหน้าการเริ่มต้นใช้งาน", "Setup progress")}>
          <i style:width={`${(setupDone / setupSteps.length) * 100}%`}></i>
        </div>
      </header>
      <ol class="home-steps">
        {#each setupSteps as step, index}
          <li class:done={step.done}>
            <span class="home-step-n" aria-hidden="true">{#if step.done}<Check size={14} strokeWidth={3} />{:else}{index + 1}{/if}</span>
            <span class="home-step-copy"><strong>{step.title}</strong><small>{step.detail}</small></span>
            {#if step.done}<span class="home-step-done">{t("ดำเนินการแล้ว", "Complete")}</span>
            {:else}<a class="k-button small" href={localeHref(step.href)}>{step.action}</a>{/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <section class="home-stats" class:three={stats.length === 3} aria-label={t("สรุปข้อมูล", "Summary")}>
    {#each stats as stat}
      <a class="home-stat" href={localeHref(stat.href)}>
        <span class="home-stat-label">{stat.label}<stat.icon size={16} aria-hidden="true" /></span>
        <strong>{stat.value.toLocaleString()}</strong>
        <small>{stat.detail}</small>
      </a>
    {/each}
  </section>

  <div class="home-grid">
    <div class="home-main">
      <section class="home-card" aria-labelledby="home-spaces-title">
        <header class="home-card-head">
          <div>
            <h2 id="home-spaces-title">{manager ? t("พื้นที่ทำงาน AI", "AI workspaces") : t("พื้นที่ทำงานของคุณ", "Your AI workspaces")}</h2>
            <p>{t("แต่ละพื้นที่ทำงานกำหนดระบบ เครื่องมือ และสมาชิกที่ใช้งานได้ ผ่านลิงก์เชื่อม AI หนึ่งลิงก์", "Each workspace sets the systems, tools and members available through one AI connection link")}</p>
          </div>
          <a class="k-button small" href={localeHref("/app?view=workspaces")}>{t("ดูทั้งหมด", "View all")}</a>
        </header>
        <div class="home-table">
          {#each spaces as hub (hub.id)}
            {@const status = spaceStatus(hub)}
            {@const linked = gatewayConnections(hub, data.connections)}
            <a class="home-space" href={localeHref("/app?view=hub&hub=" + encodeURIComponent(hub.id))}>
              <span class="home-space-icon" aria-hidden="true"><Boxes size={18} /></span>
              <span class="home-space-main">
                <strong title={hub.name}>{hub.name}</strong>
                <span class="home-space-meta">
                  {#if linked.length}<span class="home-logos" aria-hidden="true">{#each linked.slice(0, 4) as connection (connection.id)}<span class="home-logo"><CatalogIcon name={systemIconName(connection)} size={16} /></span>{/each}</span>{/if}
                  {t(`${linked.length} ระบบ · ${gatewayToolCount(hub)} เครื่องมือ · สมาชิก ${gatewayMemberIDs(hub).length} คน`, `${plural(linked.length, "system", "systems")} · ${plural(gatewayToolCount(hub), "tool", "tools")} · ${plural(gatewayMemberIDs(hub).length, "member", "members")}`)}
                </span>
              </span>
              <span class="home-usage" title={t("การใช้งานวันนี้เทียบกับเพดานต่อวัน", "Usage today against the daily limit")}>
                <small>{t(`วันนี้ ${hub.usedToday || 0} / ${hub.dailyLimit || "—"}`, `Today ${hub.usedToday || 0} / ${hub.dailyLimit || "—"}`)}</small>
                <span class="home-bar" aria-hidden="true"><i style:width={`${usage(hub)}%`}></i></span>
              </span>
              <span class="home-badge {status.tone}">{status.label}</span>
              <ArrowRight class="home-row-arrow" size={16} aria-hidden="true" />
            </a>
          {:else}
            <div class="home-empty">
              <strong>{manager ? t("ยังไม่มีพื้นที่ทำงาน AI", "No AI workspaces yet") : t("คุณยังไม่ได้รับสิทธิ์ในพื้นที่ทำงานใด", "You have not been added to a workspace")}</strong>
              <p>{manager
                ? t("สร้างพื้นที่ทำงานแรก และกำหนดระบบ เครื่องมือ และสมาชิกที่ใช้งานได้", "Create the first workspace and choose its systems, tools and members.")
                : t("กรุณาติดต่อผู้ดูแลระบบขององค์กรเพื่อขอสิทธิ์", "Please contact your organization administrator for access.")}</p>
              {#if manager}<a class="k-button primary small" href={localeHref("/app?view=new")}><Plus size={15} />{t("สร้างพื้นที่ทำงาน AI", "New AI workspace")}</a>{/if}
            </div>
          {/each}
        </div>
        {#if data.hubs.length > spaces.length}<p class="home-note">{t(`แสดง ${spaces.length} จาก ${data.hubs.length} พื้นที่ทำงาน`, `Showing ${spaces.length} of ${data.hubs.length} workspaces`)}</p>{/if}
      </section>

      <section class="home-card" aria-labelledby="home-activity-title">
        <header class="home-card-head">
          <div>
            <h2 id="home-activity-title">{t("การใช้งานล่าสุด", "Recent activity")}</h2>
            <p>{manager ? t("การเรียกใช้เครื่องมือผ่าน ORCA ล่าสุด", "The latest tool calls made through ORCA") : t("การเรียกใช้เครื่องมือล่าสุดของคุณ", "Your latest tool calls")}</p>
          </div>
          <a class="k-button small" href={localeHref("/app?view=executions")}>{t("ดูประวัติทั้งหมด", "View history")}</a>
        </header>
        {#if activityLoading}
          <p class="home-note" role="status">{t("กำลังโหลดประวัติการใช้งาน…", "Loading activity…")}</p>
        {:else if activityError}
          <div class="home-note" role="alert">
            {t("โหลดประวัติการใช้งานไม่สำเร็จ", "Activity could not be loaded.")}
            <button class="k-link-button" onclick={loadActivity}>{t("ลองอีกครั้ง", "Try again")}</button>
          </div>
        {:else}
          <table class="home-activity">
            <thead>
              <tr>
                <th scope="col">{t("เครื่องมือ", "Tool")}</th>
                <th scope="col">{t("ผู้ใช้งาน", "User")}</th>
                <th scope="col">{t("ผลลัพธ์", "Result")}</th>
                <th scope="col">{t("เวลา", "Time")}</th>
              </tr>
            </thead>
            <tbody>
              {#each events as event (event.id)}
                <tr>
                  <td>
                    <strong title={event.toolName}>{readableTool(event.toolName) || t("การเรียกใช้เครื่องมือ", "Tool call")}</strong>
                    {#if hubName(event.hubID)}<small>{hubName(event.hubID)}</small>{/if}
                  </td>
                  <td>{whoName(event.userID)}</td>
                  <td><span class="home-badge {outcomeTone(event.outcome)}">{outcomes[event.outcome] || outcomes.unknown}</span></td>
                  <td><time datetime={event.createdAt}>{displayDate(event.createdAt)}</time></td>
                </tr>
              {:else}
                <tr><td colspan="4" class="home-activity-empty">{t("ยังไม่มีการใช้งาน ประวัติจะแสดงเมื่อมีการเรียกใช้เครื่องมือผ่าน ORCA", "No activity yet. Tool calls made through ORCA will appear here.")}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    </div>

    <aside class="home-side" aria-label={t("สถานะระบบ", "System status")}>
      {#if manager}
        <section class="home-card" aria-labelledby="home-attention-title">
          <header class="home-card-head"><h2 id="home-attention-title">{t("รายการที่ต้องดำเนินการ", "Action items")}</h2></header>
          {#if review > 0}
            <a class="home-alert" href={localeHref("/app?view=servers&status=needs-review")}>
              <CircleAlert size={17} aria-hidden="true" />
              <span><strong>{t(`ระบบรอตรวจสอบเครื่องมือ ${review} ระบบ`, `${plural(review, "system needs", "systems need")} a tool review`)}</strong><small>{t("ตรวจสอบเครื่องมือก่อนเปิดให้สมาชิกใช้งาน", "Review the tools before members can use them")}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          {/if}
          {#if blockedSpaces > 0}
            <a class="home-alert" href={localeHref("/app?view=workspaces")}>
              <CircleAlert size={17} aria-hidden="true" />
              <span><strong>{t(`พื้นที่ทำงานที่ยังใช้งานไม่ได้ ${blockedSpaces} แห่ง`, `${plural(blockedSpaces, "workspace is", "workspaces are")} not usable yet`)}</strong><small>{t("มีระบบที่ถูกระงับ หรือเครื่องมือยังไม่ผ่านการตรวจสอบ", "A system is paused or its tools have not been reviewed")}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          {/if}
          {#if paused > 0}
            <a class="home-alert quiet" href={localeHref("/app?view=servers")}>
              <CircleAlert size={17} aria-hidden="true" />
              <span><strong>{t(`ระบบที่ถูกระงับ ${paused} ระบบ`, `${plural(paused, "system is", "systems are")} paused`)}</strong><small>{t("สมาชิกใช้งานไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง", "Members cannot use it until it is resumed")}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          {/if}
          {#if attention === 0}
            <p class="home-clear"><CircleCheck size={17} aria-hidden="true" />{t("ไม่มีรายการที่ต้องดำเนินการ", "There are no action items")}</p>
          {/if}
        </section>
      {/if}

      <section class="home-card" aria-labelledby="home-systems-title">
        <header class="home-card-head">
          <h2 id="home-systems-title">{manager ? t("ระบบที่เชื่อมต่อ", "Connected systems") : t("ระบบที่ใช้งานได้", "Available systems")}</h2>
          <a class="k-button small" href={localeHref(manager ? "/app?view=servers" : "/app?view=accounts")}>{t("ดูทั้งหมด", "View all")}</a>
        </header>
        {#each systems as connection (connection.id)}
          {@const status = systemStatus(connection)}
          <a class="home-system" href={localeHref(manager ? "/app?view=servers&connection=" + encodeURIComponent(connection.id) : "/app?view=accounts")}>
            <span class="home-logo large"><CatalogIcon name={systemIconName(connection)} size={20} /></span>
            <span class="home-system-copy"><strong title={connection.name}>{connection.name}</strong><small>{t(`เครื่องมือที่อนุญาต ${connection.toolNames.length} รายการ`, `${plural(connection.toolNames.length, "allowed tool", "allowed tools")}`)}</small></span>
            <span class="home-badge {status.tone}">{status.label}</span>
          </a>
        {:else}
          <div class="home-empty compact">
            <strong>{t("ยังไม่มีระบบที่เชื่อมต่อ", "No connected systems yet")}</strong>
            {#if manager}<a class="k-button small" href={localeHref("/app?view=catalog")}>{t("เพิ่มระบบ", "Add a system")}</a>{/if}
          </div>
        {/each}
        {#if data.connections.length > systems.length}<p class="home-note">{t(`แสดง ${systems.length} จาก ${data.connections.length} ระบบ`, `Showing ${systems.length} of ${data.connections.length} systems`)}</p>{/if}
      </section>

      <a class="home-knowledge" href={localeHref("/app?view=knowledge")}>
        <span class="home-knowledge-icon" aria-hidden="true"><BookOpen size={18} /></span>
        <span>
          <strong>{t("คลังความรู้ (Orca Cloud)", "Knowledge (Orca Cloud)")}</strong>
          <small>{t("จัดเก็บคู่มือและเอกสารขององค์กรแยกตามแผนก เพื่อให้ AI ตอบได้ถูกต้อง", "Store your organization's manuals and documents by department so AI can answer accurately")}</small>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    </aside>
  </div>
</div>

<style>
  .home {
    display: grid;
    gap: 20px;
    min-inline-size: 0;
  }
  /* ---------- Header ---------- */
  .home-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px 24px;
    flex-wrap: wrap;
    padding-bottom: 4px;
  }
  .home-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .home-title-row h1 {
    margin: 0;
  }
  .home-state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 9px;
    border: 1px solid #c7e5d3;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-ok-bg);
    color: var(--orca-ok);
    font-size: 12.5px;
    font-weight: 500;
  }
  .home-state.warn {
    border-color: #f0dca3;
    background: var(--orca-warn-bg);
    color: var(--orca-warn);
  }
  .home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* ---------- Cards ---------- */
  .home-card {
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    min-width: 0;
    overflow: hidden;
  }
  .home-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 12px;
  }
  .home-card-head h2 {
    margin: 0;
  }
  .home-card-head p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .home-card-head :global(.k-button) {
    flex: none;
  }
  .home-note {
    margin: 0;
    padding: 10px 18px 14px;
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  /* ---------- Getting started ---------- */
  .home-progress {
    flex: 0 1 220px;
    align-self: center;
    height: 6px;
    border-radius: 999px;
    background: var(--orca-secondary);
    overflow: hidden;
  }
  .home-progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--orca-ink);
  }
  .home-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--orca-line);
  }
  .home-steps li {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    grid-template-rows: auto 1fr auto;
    gap: 2px 12px;
    padding: 14px 18px 16px;
  }
  .home-steps li + li {
    border-left: 1px solid var(--orca-line);
  }
  .home-step-n {
    grid-row: 1 / span 2;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 1px solid var(--orca-line-strong);
    color: var(--orca-muted);
    font-size: 12.5px;
    font-weight: 600;
  }
  .home-steps li.done .home-step-n {
    border-color: transparent;
    background: var(--orca-citron);
    color: var(--orca-ink);
  }
  .home-step-copy strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
  }
  .home-step-copy small {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .home-steps li :global(.k-button),
  .home-step-done {
    grid-column: 2;
    justify-self: start;
    margin-top: 10px;
  }
  .home-step-done {
    color: var(--orca-ok);
    font-size: 12.5px;
    font-weight: 500;
  }
  /* ---------- Stats ---------- */
  .home-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .home-stats.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .home-stat {
    display: grid;
    gap: 4px;
    padding: 16px 18px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-ink);
    text-decoration: none;
    transition: border-color 0.12s, background-color 0.12s;
  }
  .home-stat:hover {
    border-color: var(--orca-line-strong);
    background: var(--orca-surface-2);
  }
  .home-stat-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--orca-muted);
    font-size: 13.5px;
    font-weight: 500;
  }
  .home-stat-label :global(svg) {
    color: var(--orca-subtle);
  }
  .home-stat strong {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  .home-stat small {
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  /* ---------- Layout ---------- */
  .home-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr);
    gap: 16px;
    align-items: start;
  }
  .home-main,
  .home-side {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  /* ---------- Workspaces ---------- */
  .home-table {
    border-top: 1px solid var(--orca-line);
  }
  .home-space {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 140px auto 16px;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    color: var(--orca-ink);
    text-decoration: none;
  }
  .home-space + .home-space {
    border-top: 1px solid #eff0f2;
  }
  .home-space:hover {
    background: var(--orca-surface-2);
  }
  .home-space-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--orca-radius);
    display: grid;
    place-items: center;
    background: var(--orca-secondary);
    color: var(--orca-ink);
  }
  .home-space-main {
    min-width: 0;
  }
  .home-space-main strong {
    display: block;
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .home-space-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 12.5px;
    flex-wrap: wrap;
  }
  .home-logos {
    display: inline-flex;
  }
  .home-logos .home-logo + .home-logo {
    margin-left: -5px;
  }
  .home-logo {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: inline-grid;
    place-items: center;
    background: #fff;
    border: 1px solid var(--orca-line);
    overflow: hidden;
  }
  .home-logo.large {
    width: 32px;
    height: 32px;
    border-radius: var(--orca-radius);
    flex: none;
  }
  .home-usage {
    display: grid;
    gap: 5px;
  }
  .home-usage small {
    color: var(--orca-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .home-bar {
    display: block;
    height: 4px;
    border-radius: 999px;
    background: var(--orca-secondary);
    overflow: hidden;
  }
  .home-bar i {
    display: block;
    height: 100%;
    min-width: 2px;
    border-radius: inherit;
    background: var(--orca-ink);
  }
  :global(.home-row-arrow) {
    color: var(--orca-subtle);
  }
  .home-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .home-badge.ok {
    background: var(--orca-ok-bg);
    color: var(--orca-ok);
  }
  .home-badge.warn {
    background: var(--orca-warn-bg);
    color: var(--orca-warn);
  }
  .home-badge.bad {
    background: var(--orca-deny-bg);
    color: var(--orca-deny);
  }
  /* ---------- Activity table ---------- */
  .home-activity {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }
  .home-activity th {
    height: 38px;
    padding: 6px 18px;
    border-block: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
    color: var(--orca-nav);
    font-size: 12.5px;
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .home-activity td {
    padding: 10px 18px;
    border-bottom: 1px solid #eff0f2;
    vertical-align: middle;
  }
  .home-activity tr:last-child td {
    border-bottom: 0;
  }
  .home-activity td strong,
  .home-activity td small {
    display: block;
  }
  .home-activity td strong {
    font-weight: 600;
  }
  .home-activity td small {
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  .home-activity time {
    color: var(--orca-muted);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .home-activity-empty {
    color: var(--orca-muted);
  }
  /* ---------- Side ---------- */
  .home-alert {
    display: grid;
    grid-template-columns: 17px minmax(0, 1fr) 15px;
    gap: 12px;
    align-items: center;
    padding: 12px 18px;
    border-top: 1px solid #eff0f2;
    color: var(--orca-warn);
    text-decoration: none;
  }
  .home-alert:hover {
    background: var(--orca-surface-2);
  }
  .home-alert.quiet {
    color: var(--orca-subtle);
  }
  .home-alert strong {
    display: block;
    color: var(--orca-ink);
    font-size: 13.5px;
    font-weight: 600;
  }
  .home-alert small {
    display: block;
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  .home-clear {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 4px 18px 16px;
    color: var(--orca-ok);
    font-size: 13.5px;
    font-weight: 500;
  }
  .home-system {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border-top: 1px solid #eff0f2;
    color: var(--orca-ink);
    text-decoration: none;
  }
  .home-system:hover {
    background: var(--orca-surface-2);
  }
  .home-system-copy {
    min-width: 0;
  }
  .home-system-copy strong,
  .home-system-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .home-system-copy strong {
    font-size: 13.5px;
    font-weight: 600;
  }
  .home-system-copy small {
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  .home-knowledge {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface-2);
    color: var(--orca-ink);
    text-decoration: none;
  }
  .home-knowledge:hover {
    border-color: var(--orca-line-strong);
  }
  .home-knowledge-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--orca-radius);
    display: grid;
    place-items: center;
    background: var(--orca-citron);
    color: var(--orca-ink);
  }
  .home-knowledge strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .home-knowledge small {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .home-empty {
    display: grid;
    justify-items: start;
    gap: 6px;
    padding: 18px;
    border-top: 1px solid var(--orca-line);
    color: var(--orca-muted);
  }
  .home-empty strong {
    color: var(--orca-ink);
    font-size: 14px;
  }
  .home-empty p {
    margin: 0;
    font-size: 13px;
  }
  .home-empty :global(.k-button) {
    margin-top: 6px;
  }
  /* ---------- Responsive ---------- */
  @media (max-width: 1180px) {
    .home-steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .home-steps li:nth-child(3) {
      border-left: 0;
    }
    .home-steps li:nth-child(n + 3) {
      border-top: 1px solid var(--orca-line);
    }
    .home-space {
      grid-template-columns: 34px minmax(0, 1fr) auto 16px;
    }
    .home-usage {
      display: none;
    }
  }
  @media (max-width: 1080px) {
    .home-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 760px) {
    .home-stats,
    .home-stats.three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .home-steps {
      grid-template-columns: minmax(0, 1fr);
    }
    .home-steps li + li {
      border-left: 0;
      border-top: 1px solid var(--orca-line);
    }
    .home-actions {
      width: 100%;
    }
    .home-actions :global(.k-button) {
      flex: 1 1 auto;
    }
    .home-space {
      grid-template-columns: 34px minmax(0, 1fr) 16px;
    }
    .home-space .home-badge {
      grid-column: 2;
      grid-row: 2;
      justify-self: start;
      margin-top: -4px;
    }
    .home-card-head {
      padding-inline: 14px;
    }
    /* Rows stack on phones: tool and workspace first, then result and time. */
    .home-activity,
    .home-activity tbody {
      display: block;
    }
    .home-activity thead,
    .home-activity td:nth-child(2) {
      display: none;
    }
    .home-activity tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px 12px;
      padding: 12px 14px;
      border-bottom: 1px solid #eff0f2;
    }
    .home-activity tr:last-child {
      border-bottom: 0;
    }
    .home-activity td {
      padding: 0;
      border: 0;
    }
    .home-activity td:first-child,
    .home-activity-empty {
      grid-column: 1 / -1;
    }
    .home-activity td:nth-child(4) {
      justify-self: end;
    }
  }
</style>
