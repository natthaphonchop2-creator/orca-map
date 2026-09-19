<script lang="ts">
  import { goto } from "$app/navigation";
  import LifecycleActions from "./LifecycleActions.svelte";
  import { page } from "$app/state";
  import Connections from "$lib/components/khum/Connections.svelte";
  import ConnectionMembers from "./ConnectionMembers.svelte";
  import SourceSetup from "./SourceSetup.svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { connectionReady } from "$lib/orca/activation";
  import { sourcePresentationNames } from "$lib/orca/connection-presentation";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    displayDate,
    orcaError,
    statusLabels,
    type OrcaAuditEvent,
    type OrcaBootstrap,
    type OrcaCandidate,
  } from "$lib/services/orca";
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    Folder,
    Info,
    Plus,
    ShieldCheck,
  } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";

  let {
    data,
    onchanged,
    initialSourceID = "",
    initialConnectionID = "",
    initiallyAddSource = false,
  }: {
    data: OrcaBootstrap;
    onchanged: () => Promise<void>;
    initialSourceID?: string;
    initialConnectionID?: string;
    initiallyAddSource?: boolean;
  } = $props();
  let catalogNames = $state<Record<string, string>>({});
  let catalogHosts = $state<Record<string, string>>({});
  let catalogProviders = $state<Record<string, OrcaCandidate["managedProvider"]>>({});
  onMount(() => {
    if (!data.canManage) return;
    void OrcaService.candidates()
      .then((candidates) => {
        if (alive) {
          catalogNames = sourcePresentationNames(candidates);
          catalogHosts = Object.fromEntries(candidates.map((item) => [item.id, item.endpointHost || ""]));
          catalogProviders = Object.fromEntries(candidates.map((item) => [item.id, item.managedProvider]));
        }
      })
      .catch(() => {
        /* Connection content remains usable when catalog metadata is unavailable. */
      });
  });
  const connection = $derived(
    data.connections.find((item) => item.id === initialConnectionID),
  );
  const editableData = $derived({ ...data,
    connections: data.connections.filter((item) => !item.archivedAt && !item.deletedAt),
    hubs: data.hubs.filter((item) => item.status !== 'archived' && item.status !== 'deleted')
  });
  const workspaces = $derived(
    data.hubs.filter((item) => item.connectionID === initialConnectionID && item.status !== 'deleted'),
  );
  const requestedTab = $derived(page.url.searchParams.get("tab") || (connection ? "overview" : "account"));
  const tab = $derived(connection?.archivedAt && !['workspaces', 'activity'].includes(requestedTab) ? 'overview' : requestedTab);
  const tabs = $derived([
    { id: "overview", name: t("ภาพรวม", "Overview") },
    ...(!connection?.archivedAt ? [
      { id: "account", name: t("บัญชี", "Account") },
      { id: "tools", name: t("เครื่องมือและสิทธิ์", "Tools & permissions") }
    ] : []),
    { id: "workspaces", name: "MCP Gateways" },
    { id: "activity", name: t("กิจกรรม", "Activity") },
  ]);
  let events = $state<OrcaAuditEvent[]>([]);
  let loading = $state(false);
  let error = $state("");
  let alive = true;
  let generation = 0;
  async function lifecycleChanged(action: 'archive' | 'restore' | 'delete') {
    await onchanged();
    if (action === 'delete') await goto(localeHref('/app?view=servers'));
  }
  function href(next: string) {
    return localeHref(
      `/app?view=servers&connection=${encodeURIComponent(initialConnectionID)}&tab=${next}`,
    );
  }
  async function loadActivity(id: string) {
    const request = ++generation;
    loading = true;
    error = "";
    try {
      const result = await OrcaService.audit();
      if (alive && request === generation)
        events = result.filter(
          (event) =>
            event.connectionID === id ||
            workspaces.some((workspace) => workspace.id === event.hubID),
        );
    } catch (cause) {
      if (alive && request === generation) error = orcaError(cause);
    } finally {
      if (alive && request === generation) loading = false;
    }
  }
  $effect(() => {
    if (tab === "activity" && initialConnectionID)
      void loadActivity(initialConnectionID);
  });
  onDestroy(() => {
    alive = false;
    generation++;
  });
</script>

<a class="connection-back" href={localeHref("/app?view=servers")}
  ><ArrowLeft size={16} />{t("กลับไป Servers", "Back to Servers")}</a
>
<div class="connection-heading connection-detail-heading">
  <div class="connection-detail-name">
    {#if connection}<CatalogIcon
        name={catalogNames[connection.mcpID] || connection.name}
        size={42}
      />{/if}
    <div>
      <h1>{connection?.name || t("เพิ่ม Server", "Add server")}</h1>
      <p>
        {connection?.description ||
          t(
            "ตั้งค่าระบบต้นทางและขอบเขตเครื่องมือที่องค์กรอนุญาต",
            "Configure the source system and the maximum set of tools approved by your organization.",
          )}
      </p>
    </div>
  </div>
  {#if connection}<span
      class="connection-status"
      class:reviewed={connectionReady(connection)}
      >{connection.archivedAt ? t("จัดเก็บแล้ว", "Archived") : connectionReady(connection)
        ? t("ตรวจเครื่องมือแล้ว", "Tools reviewed")
        : !connection.enabled
          ? t("ระงับแล้ว", "Paused")
          : t("รอตรวจสอบ", "Review needed")}</span
    >{/if}
</div>
{#if connection && data.canManage}<div class="server-detail-lifecycle"><LifecycleActions entity={connection} kind="server" archived={Boolean(connection.archivedAt)} canManage={data.canManage} affectedGateways={workspaces} onchanged={lifecycleChanged} onreload={onchanged} /></div>{/if}
{#if connection?.archivedAt}<div class="k-banner" role="status"><Info size={20} /><p>{t('Server นี้จัดเก็บแล้ว ทุก Gateway ที่ใช้ Server นี้จะเรียกเครื่องมือไม่ได้ กู้คืนเพื่อแก้ไขและเปิดใช้งานใหม่ คีย์ Gateway เดิมถูกยกเลิกแล้ว', 'This server is archived. Gateways using it cannot call tools. Restore it before changing settings and enabling it. Previous Gateway keys are revoked.')}</p></div>{/if}
{#if connection}<nav
    class="connection-detail-tabs"
    aria-label={t("การตั้งค่า Server", "Server settings")}
  >
    {#each tabs as item}<a
        href={href(item.id)}
        class:chosen={tab === item.id}
        aria-current={tab === item.id ? "page" : undefined}
        >{item.name}{#if item.id === "workspaces"}<span
            >{workspaces.length}</span
          >{/if}</a
      >{/each}
  </nav>{/if}
{#if connection?.archivedAt && tab === 'overview'}
  <section class="connection-detail-panel"><h2>{t('รายละเอียด Server ที่จัดเก็บ', 'Archived server details')}</h2><p class="connection-empty-copy">{connection.toolNames.length} {t('เครื่องมือ', 'tools')} · {workspaces.length} MCP Gateways</p><p class="connection-empty-copy">{t('การตั้งค่าและบัญชีที่เชื่อมไว้ยังคงอยู่ กู้คืนแล้วตรวจสอบก่อนเปิดให้ทีมใช้งานอีกครั้ง', 'Settings and connected accounts are retained. Restore and review this server before enabling team access again.')}</p></section>
{:else if tab === "account" && connection && !data.canManage}
  <section class="connection-detail-panel">
    <h2>{t("บัญชีของระบบต้นทาง", "Source account")}</h2>
    <p class="connection-empty-copy">
      {t(
        "ติดต่อผู้ดูแลองค์กรเพื่อตรวจสอบหรือตั้งค่าบัญชีของระบบนี้",
        "Contact your organization administrator to review or configure this source account.",
      )}
    </p>
  </section>
{:else if tab === "account" && connection}
  <p class="connection-empty-copy">{t(
    "จัดการบัญชีส่วนตัวของคุณที่ใช้กับ Server นี้ เครื่องมือที่องค์กรอนุญาตแก้ไขได้ในแท็บเครื่องมือและสิทธิ์",
    "Manage your personal account for this server. Edit the organization’s approved tools in Tools & permissions.",
  )}</p>
  <SourceSetup
    sourceID={connection.mcpID}
    sourceLabel={catalogNames[connection.mcpID] || ""}
    endpointHost={catalogHosts[connection.mcpID] || ""}
    managedProvider={catalogProviders[connection.mcpID]}
    canCreate={data.canManage}
  />
  <a class="connection-help-link" href={href("tools")}>{t("จัดการเครื่องมือและสิทธิ์", "Manage tools & permissions")}<ArrowRight size={16} /></a>
{:else if !connection}
  <div class="connection-editor">
    <Connections
      data={editableData}
      {onchanged}
      {initialSourceID}
      {initialConnectionID}
      {initiallyAddSource}
    />
  </div>
{:else if tab === "members" && connection && data.canManage}
  <ConnectionMembers {data} connectionID={connection.id} />
{:else if tab === "tools" && data.canManage}
  <div class="connection-editor">
    <Connections data={editableData} {onchanged} {initialConnectionID} mode="policy" />
  </div>
{:else if tab === "tools"}
  <section class="connection-detail-panel">
    <div class="connection-section-heading">
      <div>
        <h2>{t("เครื่องมือที่อนุญาต", "Approved tools")}</h2>
        <p>
          {t(
            "ขอบเขตเครื่องมือสูงสุดที่องค์กรอนุญาตสำหรับ Server นี้ แต่ละ MCP Gateway เลือกเครื่องมือย่อยและสมาชิกได้ภายในขอบเขตนี้",
            "The maximum set of tools approved for this server. Each MCP Gateway chooses a subset of these tools and its members.",
          )}
        </p>
      </div>
    </div>
    {#each connection.tools.filter( (tool) => connection.toolNames.includes(tool.name), ) as tool}<div
        class="connection-tool-row"
      >
        <Check size={17} />
        <div>
          <strong>{tool.name}</strong>
          <p>
            {tool.description ||
              t("ไม่มีคำอธิบายเพิ่มเติม", "No additional description.")}
          </p>
        </div>
      </div>{:else}<p class="connection-empty-copy">
        {t("ยังไม่มีเครื่องมือที่บันทึกไว้", "No approved tools saved yet.")}
      </p>{/each}
    {#if connection.scopeNote}<div class="connection-scope">
        <h3>{t("ขอบเขตข้อมูล", "Data scope")}</h3>
        <p>{connection.scopeNote}</p>
      </div>{/if}
  </section>
{:else if tab === "workspaces"}
  <section class="connection-detail-panel">
    <div class="connection-section-heading">
      <div>
        <h2>
          {t("MCP Gateways ที่ใช้ Server นี้", "MCP Gateways using this server")}
        </h2>
        <p>
          {t(
            "เลือกเครื่องมือภายในขอบเขตที่ Server อนุญาตและสมาชิก แล้วนำ URL ของ Gateway ไปเชื่อมกับ AI",
            "Choose tools within this server’s approved set and add members, then connect AI using the Gateway URL.",
          )}
        </p>
      </div>
      {#if data.canManage && !connection.archivedAt && connectionReady(connection)}<a
          class="k-button primary"
          href={localeHref(
            `/app?view=new&connection=${encodeURIComponent(connection.id)}`,
          )}><Plus size={17} />{t("สร้าง MCP Gateway", "Create MCP Gateway")}</a
        >{/if}
    </div>
    {#each workspaces as workspace}<a
        class="connection-workspace-row"
        href={localeHref(
          `/app?view=hub&hub=${encodeURIComponent(workspace.id)}`,
        )}
        ><Folder size={21} /><span
          ><strong>{workspace.name}</strong><small
            >{workspace.toolNames.length}
            {t("เครื่องมือ", "tools")} · {workspace.memberIDs.length}
            {t("สมาชิก", "members")}</small
          ></span
        ><span class="connection-status">{statusLabels[workspace.status]}</span
        ><ArrowRight size={17} /></a
      >{:else}<p class="connection-empty-copy">
        {t(
          "ยังไม่มี MCP Gateway ที่ใช้ Server นี้",
          "No MCP Gateways use this server yet.",
        )}
      </p>{/each}
  </section>
{:else if tab === "activity"}
  <section class="connection-detail-panel">
    <div class="connection-section-heading">
      <div>
        <h2>{t("กิจกรรมของ Server", "Server activity")}</h2>
        <p>
          {t(
            "รายการจากประวัติการใช้งานจริง",
            "Recorded events for this server and its MCP Gateways.",
          )}
        </p>
      </div>
      <button
        class="k-button"
        disabled={loading}
        onclick={() => loadActivity(initialConnectionID)}
        >{t("โหลดข้อมูลล่าสุด", "Refresh")}</button
      >
    </div>
    {#if error}<div class="k-banner error" role="alert">
        <Info size={18} />{error}
      </div>{:else if loading}<p class="connection-empty-copy" role="status">
        {t("กำลังโหลดกิจกรรม…", "Loading activity…")}
      </p>{:else}{#each events as event}<div class="connection-event-row">
          <span
            ><strong
              >{event.toolName ||
                event.action ||
                event.method ||
                t("กิจกรรม", "Activity")}</strong
            ><small>{displayDate(event.createdAt)}</small></span
          ><span>{event.outcome}</span>
        </div>{:else}<p class="connection-empty-copy">
          {t(
            "ยังไม่มีกิจกรรมที่บันทึกไว้สำหรับ Server นี้",
            "No activity recorded for this server yet.",
          )}
        </p>{/each}{/if}
  </section>
{:else}
  <section class="connection-detail-panel">
    <div class="connection-section-heading">
      <div>
        <h2>{t("ตั้งค่า Server", "Server setup")}</h2>
        <p>
          {t(
            "ตรวจสอบแต่ละส่วนก่อนให้ทีมเริ่มใช้งาน",
            "Review each part before giving your team access.",
          )}
        </p>
      </div>
      <ShieldCheck size={25} />
    </div>
    <ol class="connection-setup-checklist">
      <li>
        <span>1</span>
        <div>
          <strong>{t("บัญชีของระบบต้นทาง", "Source account")}</strong>
          <p>
            {t(
              "ตรวจสอบหรือเชื่อมบัญชีที่คุณใช้เข้าถึงระบบนี้",
              "Review or connect your own account for this system.",
            )}
          </p>
        </div>
        <a href={href("account")}
          >{t("จัดการบัญชี", "Manage account")}<ArrowRight size={16} /></a
        >
      </li>
      <li>
        <span>2</span>
        <div>
          <strong>{t("เครื่องมือและสิทธิ์", "Tools and permissions")}</strong>
          <p>
            {connection.toolNames.length}
            {t("เครื่องมือที่เลือก", "selected tools")} · {connection.reviewedReadOnly
              ? t(
                  "ผู้ดูแลตรวจเครื่องมืออ่านข้อมูลแล้ว",
                  "Read-only tool review saved",
                )
              : connection.reviewedTools
                ? t("ใช้งานตามเครื่องมือที่เลือก", "Selected tools approved")
                : t("ยังไม่ผ่านการตรวจสอบ", "Review required")}
          </p>
        </div>
        <a href={href("tools")}
          >{t("ดูเครื่องมือ", "View tools")}<ArrowRight size={16} /></a
        >
      </li>
      <li>
        <span>3</span>
        <div>
          <strong
            >{t("MCP Gateways และแอป AI", "MCP Gateways and AI apps")}</strong
          >
          <p>
            {workspaces.length}
            {t("MCP Gateways ใช้ Server นี้", "MCP Gateways use this server")}
          </p>
        </div>
        <a href={href("workspaces")}
          >{t("ดู MCP Gateways", "View MCP Gateways")}<ArrowRight
            size={16}
          /></a
        >
      </li>
    </ol>
  </section>
  <section class="connection-detail-panel">
    <h2>{t("รายละเอียด", "Details")}</h2>
    <dl class="connection-details">
      <div>
        <dt>{t("สถานะการใช้งาน", "Availability")}</dt>
        <dd>
          {connection.enabled
            ? t("เปิดใช้งาน", "Enabled")
            : t("ระงับแล้ว", "Paused")}
        </dd>
      </div>
      <div>
        <dt>{t("อัปเดตล่าสุด", "Last updated")}</dt>
        <dd>{displayDate(connection.updatedAt)}</dd>
      </div>
      {#if connection.scopeNote}<div>
          <dt>{t("ขอบเขตข้อมูล", "Data scope")}</dt>
          <dd>{connection.scopeNote}</dd>
        </div>{/if}
    </dl>
  </section>
{/if}
