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
    Plug,
    Plus,
    ShieldCheck,
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
  const me = $derived(data.members.find((member) => member.id === data.currentUserID));
  const greetingName = $derived.by(() => {
    const name = me?.displayName?.trim() || me?.email || "";
    return name.includes("@") ? name.split("@")[0] : name;
  });
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const ready = $derived(data.connections.filter(connectionReady).length);
  const paused = $derived(data.connections.filter((connection) => !connection.enabled).length);
  const review = $derived(data.connections.length - ready - paused);
  const activeSpaces = $derived(data.hubs.filter((hub) => hub.status === "active").length);
  const blockedSpaces = $derived(
    data.hubs.filter((hub) => hub.status === "active" && !workspaceToolingReady(hub, data.connections)).length,
  );
  const today = $derived(data.hubs.reduce((sum, hub) => sum + Math.max(0, hub.usedToday || 0), 0));
  const attention = $derived(review + blockedSpaces + (manager ? paused : 0));
  const spaces = $derived([...data.hubs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4));
  const systems = $derived([...data.connections].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));

  // The first steps an owner takes; the guide disappears once all four are done.
  const aiUsed = $derived(events.length > 0);
  const setupSteps = $derived([
    {
      done: data.connections.length > 0,
      title: t("เชื่อมระบบแรกของบริษัท", "Connect your first system"),
      detail: t("เช่น FlowAccount, Google Drive หรือระบบของบริษัท", "Such as FlowAccount, Google Drive or your own system"),
      href: "/app?view=catalog",
      action: t("เพิ่มระบบ", "Add a system"),
    },
    {
      done: data.hubs.length > 0,
      title: t("สร้างพื้นที่ทำงาน AI", "Create an AI workspace"),
      detail: t("เลือกระบบ เครื่องมือ และคนที่ใช้ได้", "Choose the systems, tools and people"),
      href: "/app?view=new",
      action: t("สร้าง", "Create"),
    },
    {
      done: data.members.length > 1,
      title: t("เชิญทีมเข้าใช้งาน", "Invite your team"),
      detail: t("เพิ่มสมาชิกและจัดแผนก", "Add members and departments"),
      href: "/app?view=members",
      action: t("เพิ่มสมาชิก", "Add members"),
    },
    {
      done: aiUsed,
      title: t("เชื่อม AI ที่ทีมใช้อยู่", "Connect the AI your team uses"),
      detail: t("ใส่ลิงก์ของ ORCA ใน ChatGPT หรือ Claude", "Add ORCA's link to ChatGPT or Claude"),
      href: "/app?view=api-keys",
      action: t("ดูวิธีเชื่อม", "See how"),
    },
  ]);
  const setupDone = $derived(setupSteps.filter((step) => step.done).length);
  const showSetup = $derived(manager && !activityLoading && setupDone < setupSteps.length);

  const stats = $derived(
    manager
      ? [
          { label: t("ระบบที่เชื่อมต่อ", "Connected systems"), value: data.connections.length, detail: t(`พร้อมใช้ ${ready}`, `${ready} ready`), icon: Plug, href: "/app?view=servers" },
          { label: t("พื้นที่ทำงาน AI", "AI workspaces"), value: data.hubs.length, detail: t(`เปิดใช้ ${activeSpaces}`, `${activeSpaces} active`), icon: Boxes, href: "/app?view=workspaces" },
          { label: t("สมาชิก", "Members"), value: data.members.length, detail: t("ในองค์กร", "In your organization"), icon: Users, href: "/app?view=members" },
          { label: t("ใช้งานวันนี้", "Used today"), value: today, detail: t("ครั้ง รวมทุกพื้นที่ทำงาน", "requests across workspaces"), icon: Activity, href: "/app?view=executions" },
        ]
      : [
          { label: t("พื้นที่ทำงานของคุณ", "Your workspaces"), value: data.hubs.length, detail: t(`เปิดใช้ ${activeSpaces}`, `${activeSpaces} active`), icon: Boxes, href: "/app?view=workspaces" },
          { label: t("ระบบที่ใช้ได้", "Systems you can use"), value: data.connections.length, detail: t(`พร้อมใช้ ${ready}`, `${ready} ready`), icon: Plug, href: "/app?view=accounts" },
          { label: t("ใช้งานวันนี้", "Used today"), value: today, detail: t("ครั้ง ในพื้นที่ทำงานของคุณ", "requests in your workspaces"), icon: Activity, href: "/app?view=workspaces" },
        ],
  );

  const outcomes: Record<string, string> = $derived({
    success: t("สำเร็จ", "Succeeded"),
    error: t("ไม่สำเร็จ", "Failed"),
    denied: t("ไม่อนุญาต", "Denied"),
    timeout: t("หมดเวลา", "Timed out"),
    admitted: t("รับคำขอแล้ว", "Received"),
    unknown: t("รอตรวจสอบผล", "Unconfirmed"),
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
        : { label: t("ต้องตรวจสอบ", "Needs attention"), tone: "warn" };
    if (hub.status === "draft") return { label: t("แบบร่าง", "Draft"), tone: "idle" };
    return { label: t("ระงับ", "Paused"), tone: "warn" };
  }
  function systemStatus(connection: OrcaConnection) {
    if (!connection.enabled) return { label: t("ระงับ", "Paused"), tone: "warn" };
    return connectionReady(connection)
      ? { label: t("พร้อมใช้", "Ready"), tone: "ok" }
      : { label: t("รอตรวจเครื่องมือ", "Review tools"), tone: "warn" };
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
    <div class="home-hello">
      <p class="home-org">{data.organization.displayName || "ORCA"}</p>
      <h1>{greetingName ? t(`สวัสดี ${greetingName}`, `Hello, ${greetingName}`) : t("หน้าหลัก", "Home")}</h1>
      <p class="home-status" class:warn={attention > 0}>
        {#if attention > 0}<CircleAlert size={17} aria-hidden="true" />{t(`มี ${attention} เรื่องที่ควรตรวจสอบ`, `${attention} ${attention === 1 ? "thing needs" : "things need"} a look`)}
        {:else}<ShieldCheck size={17} aria-hidden="true" />{t("ทุกระบบพร้อมใช้งาน", "Everything is ready")}{/if}
      </p>
    </div>
    <div class="home-actions">
      {#if manager}
        <a class="k-button" href={localeHref("/app?view=catalog")}><Plug size={16} />{t("เพิ่มระบบใหม่", "Add a system")}</a>
        <a class="k-button primary" href={localeHref("/app?view=new")}><Plus size={17} />{t("สร้างพื้นที่ทำงาน AI", "New AI workspace")}</a>
      {:else}
        <a class="k-button primary" href={localeHref("/app?view=api-keys")}><Sparkles size={16} />{t("เชื่อม AI กับ ORCA", "Connect AI to ORCA")}</a>
      {/if}
    </div>
  </header>

  {#if showSetup}
    <section class="home-setup" aria-labelledby="home-setup-title">
      <div class="home-setup-head">
        <div>
          <h2 id="home-setup-title">{t("เริ่มต้นใช้งาน ORCA", "Get started with ORCA")}</h2>
          <p>{t(`ทำไปแล้ว ${setupDone} จาก ${setupSteps.length} ขั้น`, `${setupDone} of ${setupSteps.length} steps done`)}</p>
        </div>
        <div class="home-progress" role="progressbar" aria-valuemin="0" aria-valuemax={setupSteps.length} aria-valuenow={setupDone} aria-label={t("ความคืบหน้าการเริ่มต้นใช้งาน", "Setup progress")}>
          <i style:width={`${(setupDone / setupSteps.length) * 100}%`}></i>
        </div>
      </div>
      <ol class="home-steps">
        {#each setupSteps as step, index}
          <li class:done={step.done}>
            <span class="home-step-n" aria-hidden="true">{#if step.done}<Check size={15} strokeWidth={3} />{:else}{index + 1}{/if}</span>
            <span class="home-step-copy"><strong>{step.title}</strong><small>{step.detail}</small></span>
            {#if step.done}<span class="home-step-done">{t("เสร็จแล้ว", "Done")}</span>
            {:else}<a class="k-button small" href={localeHref(step.href)}>{step.action}<ArrowRight size={14} /></a>{/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <section class="home-stats" class:three={stats.length === 3} aria-label={t("สรุป", "Summary")}>
    {#each stats as stat}
      <a class="home-stat" href={localeHref(stat.href)}>
        <span class="home-stat-label"><span class="home-stat-icon"><stat.icon size={17} /></span>{stat.label}</span>
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
            <p>{t("แต่ละพื้นที่รวมระบบ เครื่องมือ และคนที่ใช้ได้ ไว้ในลิงก์เดียวสำหรับ AI", "Each workspace bundles systems, tools and people behind one link for AI")}</p>
          </div>
          <a class="home-more" href={localeHref("/app?view=workspaces")}>{t("ดูทั้งหมด", "View all")}<ArrowRight size={15} /></a>
        </header>
        {#each spaces as hub (hub.id)}
          {@const status = spaceStatus(hub)}
          {@const linked = gatewayConnections(hub, data.connections)}
          <a class="home-space" href={localeHref("/app?view=hub&hub=" + encodeURIComponent(hub.id))}>
            <span class="home-space-icon" aria-hidden="true"><Boxes size={20} /></span>
            <span class="home-space-main">
              <strong title={hub.name}>{hub.name}</strong>
              <span class="home-space-meta">
                {#if linked.length}<span class="home-logos" aria-hidden="true">{#each linked.slice(0, 4) as connection (connection.id)}<span class="home-logo"><CatalogIcon name={systemIconName(connection)} size={18} /></span>{/each}</span>{/if}
                {t(`${linked.length} ระบบ · ${gatewayToolCount(hub)} เครื่องมือ · ${gatewayMemberIDs(hub).length} คน`, `${plural(linked.length, "system", "systems")} · ${plural(gatewayToolCount(hub), "tool", "tools")} · ${plural(gatewayMemberIDs(hub).length, "person", "people")}`)}
              </span>
            </span>
            <span class="home-usage" title={t("ใช้วันนี้เทียบกับเพดานต่อวัน", "Used today against the daily limit")}>
              <small>{t(`วันนี้ ${hub.usedToday || 0} / ${hub.dailyLimit || "—"}`, `Today ${hub.usedToday || 0} / ${hub.dailyLimit || "—"}`)}</small>
              <span class="home-bar" aria-hidden="true"><i style:width={`${usage(hub)}%`}></i></span>
            </span>
            <span class="home-badge {status.tone}">{status.label}</span>
            <ArrowRight class="home-row-arrow" size={16} aria-hidden="true" />
          </a>
        {:else}
          <div class="home-empty">
            <Boxes size={26} aria-hidden="true" />
            <strong>{manager ? t("ยังไม่มีพื้นที่ทำงาน AI", "No AI workspaces yet") : t("คุณยังไม่ได้อยู่ในพื้นที่ทำงานไหน", "You're not in a workspace yet")}</strong>
            <p>{manager
              ? t("สร้างพื้นที่ทำงานแรก เลือกระบบ เครื่องมือ และสมาชิกที่ใช้ได้", "Create the first workspace and choose its systems, tools and members.")
              : t("ขอให้ผู้ดูแลองค์กรเพิ่มคุณในพื้นที่ทำงาน", "Ask your organization admin to add you to a workspace.")}</p>
            {#if manager}<a class="k-button primary small" href={localeHref("/app?view=new")}><Plus size={15} />{t("สร้างพื้นที่ทำงาน AI", "New AI workspace")}</a>{/if}
          </div>
        {/each}
        {#if data.hubs.length > spaces.length}<p class="home-note">{t(`แสดง ${spaces.length} จาก ${data.hubs.length} พื้นที่ทำงาน`, `Showing ${spaces.length} of ${data.hubs.length} workspaces`)}</p>{/if}
      </section>

      <section class="home-card" aria-labelledby="home-activity-title">
        <header class="home-card-head">
          <div>
            <h2 id="home-activity-title">{t("การใช้งานล่าสุด", "Recent activity")}</h2>
            <p>{manager ? t("ทุกครั้งที่ AI เรียกใช้เครื่องมือผ่าน ORCA", "Every time AI used a tool through ORCA") : t("การใช้งานของคุณผ่าน ORCA", "Your use through ORCA")}</p>
          </div>
          <a class="home-more" href={localeHref("/app?view=executions")}>{t("ดูประวัติทั้งหมด", "Full history")}<ArrowRight size={15} /></a>
        </header>
        {#if activityLoading}
          <p class="home-note" role="status">{t("กำลังโหลดประวัติ…", "Loading activity…")}</p>
        {:else if activityError}
          <div class="home-note" role="alert">
            {t("โหลดประวัติไม่สำเร็จ", "Could not load activity")}
            <button class="k-link-button" onclick={loadActivity}>{t("ลองอีกครั้ง", "Try again")}</button>
          </div>
        {:else}
          <ul class="home-activity">
            {#each events as event (event.id)}
              <li>
                <span class="home-activity-icon {outcomeTone(event.outcome)}" aria-hidden="true"><Activity size={15} /></span>
                <span class="home-activity-copy">
                  <strong title={event.toolName}>{readableTool(event.toolName) || t("เรียกใช้เครื่องมือ", "Tool call")}</strong>
                  <small>{whoName(event.userID)}{#if hubName(event.hubID)}<span class="home-sep" aria-hidden="true">·</span>{hubName(event.hubID)}{/if}</small>
                </span>
                <span class="home-badge {outcomeTone(event.outcome)}">{outcomes[event.outcome] || outcomes.unknown}</span>
                <time datetime={event.createdAt}>{displayDate(event.createdAt)}</time>
              </li>
            {:else}
              <li class="home-activity-empty">{t("ยังไม่มีการใช้งาน เมื่อทีมเชื่อม AI แล้ว ประวัติจะแสดงที่นี่", "No activity yet. Once your team connects AI, it shows up here.")}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <aside class="home-side" aria-label={t("สถานะระบบ", "System status")}>
      {#if manager}
        <section class="home-card" aria-labelledby="home-attention-title">
          <header class="home-card-head"><h2 id="home-attention-title">{t("ต้องดูแล", "Needs attention")}</h2></header>
          {#if review > 0}
            <a class="home-alert" href={localeHref("/app?view=servers&status=needs-review")}>
              <CircleAlert size={18} aria-hidden="true" />
              <span><strong>{t(`${review} ระบบรอตรวจเครื่องมือ`, `${review} ${review === 1 ? "system needs" : "systems need"} a tool review`)}</strong><small>{t("ตรวจก่อนเปิดให้ทีมใช้", "Review before your team uses them")}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          {/if}
          {#if blockedSpaces > 0}
            <a class="home-alert" href={localeHref("/app?view=workspaces")}>
              <CircleAlert size={18} aria-hidden="true" />
              <span><strong>{t(`${blockedSpaces} พื้นที่ทำงานยังใช้ไม่ได้`, `${blockedSpaces} ${blockedSpaces === 1 ? "workspace isn't" : "workspaces aren't"} usable yet`)}</strong><small>{t("ระบบถูกระงับ หรือเครื่องมือยังไม่ผ่านการตรวจ", "A system is paused or its tools aren't reviewed")}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          {/if}
          {#if paused > 0}
            <a class="home-alert quiet" href={localeHref("/app?view=servers")}>
              <CircleAlert size={18} aria-hidden="true" />
              <span><strong>{t(`${paused} ระบบถูกระงับ`, `${paused} ${paused === 1 ? "system is" : "systems are"} paused`)}</strong><small>{t("ทีมใช้ระบบนี้ไม่ได้จนกว่าจะเปิดอีกครั้ง", "Your team can't use it until it's resumed")}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          {/if}
          {#if attention === 0}
            <p class="home-clear"><ShieldCheck size={18} aria-hidden="true" />{t("ไม่มีเรื่องที่ต้องดูแลตอนนี้", "Nothing needs your attention")}</p>
          {/if}
        </section>
      {/if}

      <section class="home-card" aria-labelledby="home-systems-title">
        <header class="home-card-head">
          <h2 id="home-systems-title">{manager ? t("ระบบที่เชื่อมต่อ", "Connected systems") : t("ระบบที่คุณใช้ได้", "Systems you can use")}</h2>
          <a class="home-more" href={localeHref(manager ? "/app?view=servers" : "/app?view=accounts")}>{t("ดูทั้งหมด", "View all")}<ArrowRight size={15} /></a>
        </header>
        {#each systems as connection (connection.id)}
          {@const status = systemStatus(connection)}
          <a class="home-system" href={localeHref(manager ? "/app?view=servers&connection=" + encodeURIComponent(connection.id) : "/app?view=accounts")}>
            <span class="home-logo large"><CatalogIcon name={systemIconName(connection)} size={24} /></span>
            <span class="home-system-copy"><strong title={connection.name}>{connection.name}</strong><small>{t(`${connection.toolNames.length} เครื่องมือที่อนุญาต`, `${connection.toolNames.length} allowed tools`)}</small></span>
            <span class="home-badge {status.tone}">{status.label}</span>
          </a>
        {:else}
          <div class="home-empty compact">
            <Plug size={22} aria-hidden="true" />
            <strong>{t("ยังไม่มีระบบที่เชื่อมต่อ", "No connected systems yet")}</strong>
            {#if manager}<a class="k-button small" href={localeHref("/app?view=catalog")}>{t("เพิ่มระบบใหม่", "Add a system")}</a>{/if}
          </div>
        {/each}
        {#if data.connections.length > systems.length}<p class="home-note">{t(`แสดง ${systems.length} จาก ${data.connections.length} ระบบ`, `Showing ${systems.length} of ${data.connections.length} systems`)}</p>{/if}
      </section>

      <a class="home-knowledge" href={localeHref("/app?view=knowledge")}>
        <span class="home-knowledge-icon" aria-hidden="true"><BookOpen size={20} /></span>
        <span>
          <strong>{t("คลังความรู้ (Orca Cloud)", "Knowledge (Orca Cloud)")}</strong>
          <small>{t("ให้ AI ตอบจากคู่มือและเอกสารของบริษัท แยกตามแผนก", "Let AI answer from your company's manuals and documents, by department")}</small>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    </aside>
  </div>
</div>

<style>
  .home {
    display: grid;
    gap: 22px;
    min-inline-size: 0;
  }
  /* ---------- Header ---------- */
  .home-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px 24px;
    flex-wrap: wrap;
  }
  .home-org {
    margin: 0 0 4px;
    color: var(--orca-muted);
    font-size: 14px;
    font-weight: 600;
  }
  .home-hello h1 {
    margin: 0;
  }
  .home-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: 8px 0 0;
    color: var(--orca-ok);
    font-size: 14.5px;
    font-weight: 600;
  }
  .home-status.warn {
    color: var(--orca-warn);
  }
  .home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  /* ---------- Setup guide ---------- */
  .home-setup {
    padding: 22px;
    border-radius: var(--orca-radius-lg);
    background: var(--orca-ink);
    color: var(--orca-on-dark);
    box-shadow: var(--orca-shadow);
  }
  .home-setup-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    flex-wrap: wrap;
  }
  .home-setup h2 {
    margin: 0;
    color: #fff;
  }
  .home-setup-head p {
    margin: 2px 0 0;
    color: var(--orca-on-dark-muted);
    font-size: 14px;
  }
  .home-progress {
    flex: 0 1 260px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .home-progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--orca-citron);
  }
  .home-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }
  .home-steps li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    grid-template-rows: auto 1fr auto;
    gap: 4px 12px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--orca-radius);
    background: rgba(255, 255, 255, 0.04);
  }
  .home-step-n {
    grid-row: 1 / span 2;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 13px;
    font-weight: 750;
  }
  .home-steps li.done .home-step-n {
    background: var(--orca-citron);
    color: var(--orca-ink);
  }
  .home-step-copy strong {
    display: block;
    color: #fff;
    font-size: 14.5px;
    line-height: 1.4;
  }
  .home-step-copy small {
    display: block;
    margin-top: 2px;
    color: var(--orca-on-dark-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .home-steps li :global(.k-button),
  .home-step-done {
    grid-column: 2;
    justify-self: start;
    margin-top: 8px;
  }
  .home-steps li :global(.k-button.small) {
    border-color: rgba(255, 255, 255, 0.2);
    background: transparent;
    color: #fff !important;
  }
  .home-steps li :global(.k-button.small:hover) {
    background: rgba(255, 255, 255, 0.1);
  }
  .home-step-done {
    color: var(--orca-citron);
    font-size: 13px;
    font-weight: 700;
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
    gap: 6px;
    padding: 16px 18px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-ink);
    text-decoration: none;
    box-shadow: var(--orca-shadow-sm);
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .home-stat:hover {
    border-color: var(--orca-line-strong);
    box-shadow: var(--orca-shadow);
  }
  .home-stat-label {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--orca-muted);
    font-size: 14px;
    font-weight: 600;
  }
  .home-stat-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--orca-citron-soft);
    color: var(--orca-ink);
  }
  .home-stat strong {
    font-size: 30px;
    font-weight: 760;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }
  .home-stat small {
    color: var(--orca-muted);
    font-size: 13px;
  }
  /* ---------- Layout ---------- */
  .home-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr);
    gap: 18px;
    align-items: start;
  }
  .home-main,
  .home-side {
    display: grid;
    gap: 18px;
    min-width: 0;
  }
  .home-card {
    padding: 6px 0 8px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    box-shadow: var(--orca-shadow-sm);
    min-width: 0;
  }
  .home-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 20px 10px;
  }
  .home-card-head h2 {
    margin: 0;
  }
  .home-card-head p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13.5px;
  }
  .home-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    color: var(--orca-ink);
    font-size: 13.5px;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
  }
  .home-more:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .home-note {
    margin: 6px 20px 8px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  /* ---------- Workspaces ---------- */
  .home-space {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 150px auto 16px;
    align-items: center;
    gap: 14px;
    margin: 0 8px;
    padding: 12px;
    border-radius: var(--orca-radius);
    color: var(--orca-ink);
    text-decoration: none;
  }
  .home-space + .home-space {
    border-top: 1px solid #eef0f4;
  }
  .home-space:hover {
    background: var(--orca-surface-2);
  }
  .home-space-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: var(--orca-ink);
    color: var(--orca-citron);
  }
  .home-space-main {
    min-width: 0;
  }
  .home-space-main strong {
    display: block;
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .home-space-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    color: var(--orca-muted);
    font-size: 13px;
    flex-wrap: wrap;
  }
  .home-logos {
    display: inline-flex;
  }
  .home-logos .home-logo + .home-logo {
    margin-left: -6px;
  }
  .home-logo {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: inline-grid;
    place-items: center;
    background: #fff;
    border: 1px solid var(--orca-line);
    overflow: hidden;
  }
  .home-logo.large {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    flex: none;
  }
  .home-usage {
    display: grid;
    gap: 5px;
  }
  .home-usage small {
    color: var(--orca-muted);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .home-bar {
    display: block;
    height: 6px;
    border-radius: 999px;
    background: #eceef2;
    overflow: hidden;
  }
  .home-bar i {
    display: block;
    height: 100%;
    min-width: 3px;
    border-radius: inherit;
    background: var(--orca-ink);
  }
  :global(.home-row-arrow) {
    color: var(--orca-muted);
  }
  .home-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    background: #eceef2;
    color: #3d4455;
    font-size: 12.5px;
    font-weight: 650;
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
  /* ---------- Activity ---------- */
  .home-activity {
    margin: 0;
    padding: 0 8px;
    list-style: none;
  }
  .home-activity li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
  }
  .home-activity li + li {
    border-top: 1px solid #eef0f4;
  }
  .home-activity-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: #eceef2;
    color: var(--orca-muted);
  }
  .home-activity-icon.ok {
    background: var(--orca-ok-bg);
    color: var(--orca-ok);
  }
  .home-activity-icon.bad {
    background: var(--orca-deny-bg);
    color: var(--orca-deny);
  }
  .home-activity-copy {
    min-width: 0;
  }
  .home-activity-copy strong,
  .home-activity-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .home-activity-copy strong {
    font-size: 14.5px;
    font-weight: 650;
  }
  .home-activity-copy small {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .home-sep {
    margin: 0 6px;
  }
  .home-activity time {
    color: var(--orca-muted);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .home-activity-empty {
    display: block !important;
    color: var(--orca-muted);
    font-size: 14px;
  }
  /* ---------- Side ---------- */
  .home-alert {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) 15px;
    gap: 12px;
    align-items: center;
    margin: 0 8px;
    padding: 12px;
    border-radius: var(--orca-radius);
    color: var(--orca-warn);
    text-decoration: none;
  }
  .home-alert + .home-alert {
    margin-top: 4px;
  }
  .home-alert:hover {
    background: var(--orca-warn-bg);
  }
  .home-alert.quiet {
    color: var(--orca-muted);
  }
  .home-alert.quiet:hover {
    background: var(--orca-surface-2);
  }
  .home-alert strong {
    display: block;
    color: var(--orca-ink);
    font-size: 14.5px;
  }
  .home-alert small {
    display: block;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .home-clear {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 4px 20px 12px;
    color: var(--orca-ok);
    font-size: 14.5px;
    font-weight: 600;
  }
  .home-system {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    margin: 0 8px;
    padding: 10px 12px;
    border-radius: var(--orca-radius);
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
    font-size: 14.5px;
  }
  .home-system-copy small {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .home-knowledge {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 14px;
    padding: 18px;
    border-radius: var(--orca-radius-lg);
    background: var(--orca-citron-soft);
    border: 1px solid #e3efb2;
    color: var(--orca-ink);
    text-decoration: none;
  }
  .home-knowledge:hover {
    border-color: #cfe38a;
  }
  .home-knowledge-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: var(--orca-ink);
    color: var(--orca-citron);
  }
  .home-knowledge strong {
    display: block;
    font-size: 15px;
  }
  .home-knowledge small {
    display: block;
    margin-top: 2px;
    color: #3d4455;
    font-size: 13.5px;
    line-height: 1.5;
  }
  .home-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    margin: 4px 20px 12px;
    padding: 28px 16px;
    border: 1.5px dashed var(--orca-line-strong);
    border-radius: var(--orca-radius);
    color: var(--orca-muted);
    text-align: center;
  }
  .home-empty strong {
    color: var(--orca-ink);
  }
  .home-empty p {
    margin: 0;
    max-width: 44ch;
    font-size: 14px;
  }
  .home-empty.compact {
    padding: 20px 12px;
  }
  /* ---------- Responsive ---------- */
  @media (max-width: 1180px) {
    .home-steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .home-space {
      grid-template-columns: 40px minmax(0, 1fr) auto 16px;
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
    .home-actions {
      width: 100%;
    }
    .home-actions :global(.k-button) {
      flex: 1 1 auto;
    }
    .home-activity li {
      grid-template-columns: 32px minmax(0, 1fr) auto;
    }
    .home-activity time {
      grid-column: 2 / -1;
      margin-top: -6px;
    }
    .home-space {
      grid-template-columns: 40px minmax(0, 1fr) 16px;
    }
    .home-space .home-badge {
      grid-column: 2;
      justify-self: start;
      grid-row: 2;
      margin-top: -4px;
    }
    .home-card-head {
      padding-inline: 16px;
    }
  }
  @media (max-width: 420px) {
    .home-stat strong {
      font-size: 26px;
    }
  }
</style>
