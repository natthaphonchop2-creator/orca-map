<script lang="ts">
  import { toolPresentation } from "$lib/orca/tool-presentation";
  import { orcaLocale } from "$lib/orca/locale.svelte";
  import { gatewayUsesConnection, gatewayToolCount, gatewayMemberIDs } from "$lib/orca/gateway-sources";
  import { goto } from "$app/navigation";
  import LifecycleActions from "./LifecycleActions.svelte";
  import { page } from "$app/state";
  import Connections from "$lib/components/orca/Connections.svelte";
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
    data.hubs.filter((item) => gatewayUsesConnection(item, initialConnectionID) && item.status !== 'deleted'),
  );
  const requestedTab = $derived(page.url.searchParams.get("tab") || (connection ? "overview" : "account"));
  const tab = $derived(connection?.archivedAt && !['workspaces', 'activity'].includes(requestedTab) ? 'overview' : requestedTab);
  const tabs = $derived([
    { id: "overview", name: t("ภาพรวม", "Overview") },
    ...(!connection?.archivedAt ? [
      { id: "account", name: t("บัญชี", "Account") },
      { id: "tools", name: t("เครื่องมือและสิทธิ์", "Tools and permissions") }
    ] : []),
    { id: "workspaces", name: t("พื้นที่ทำงาน AI", "AI workspaces") },
    { id: "activity", name: t("ประวัติการใช้งาน", "Activity") },
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

<div class="detail">
<a class="detail-back" href={localeHref("/app?view=servers")}
  ><ArrowLeft size={16} aria-hidden="true" />{t("กลับไปที่ระบบที่เชื่อมต่อ", "Back to connected systems")}</a
>
<header class="detail-head">
  <div class="detail-title">
    {#if connection}<span class="detail-logo"
        ><CatalogIcon
          name={catalogNames[connection.mcpID] || connection.name}
          size={24}
        /></span
      >{/if}
    <div class="detail-title-copy">
      <div class="detail-title-row">
        <h1>{connection?.name || t("เพิ่มระบบ", "Add a system")}</h1>
        {#if connection}<span
            class="k-badge"
            class:active={connectionReady(connection)}
            class:paused={!connection.archivedAt && !connectionReady(connection)}
            >{connection.archivedAt ? t("จัดเก็บแล้ว", "Archived") : connectionReady(connection)
              ? t("ตรวจสอบเครื่องมือแล้ว", "Tools reviewed")
              : !connection.enabled
                ? t("ระงับ", "Paused")
                : t("รอตรวจสอบ", "Needs review")}</span
          >{/if}
      </div>
      {#if connection?.description}<p class="k-subtitle">{connection.description}</p>{/if}
    </div>
  </div>
  {#if connection && data.canManage}<div class="detail-actions"><LifecycleActions entity={connection} kind="server" archived={Boolean(connection.archivedAt)} canManage={data.canManage} affectedGateways={workspaces} onchanged={lifecycleChanged} onreload={onchanged} /></div>{/if}
</header>
{#if connection?.archivedAt}<div class="k-banner detail-banner" role="status"><Info size={16} aria-hidden="true" /><p>{t('ระบบนี้ถูกจัดเก็บแล้ว พื้นที่ทำงาน AI ที่ใช้ระบบนี้จะเรียกใช้เครื่องมือไม่ได้ กู้คืนระบบก่อนแก้ไขการตั้งค่าหรือเปิดใช้งานอีกครั้ง คีย์เดิมของพื้นที่ทำงานถูกเพิกถอนแล้ว', 'This system is archived. AI workspaces that use it cannot call its tools. Restore it before changing settings or resuming it. Previous workspace keys have been revoked.')}</p></div>{/if}
{#if connection}<nav
    class="detail-tabs"
    aria-label={t("การตั้งค่าระบบ", "System settings")}
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
  <section class="detail-card"><header class="detail-card-head"><h2>{t('รายละเอียดระบบที่จัดเก็บแล้ว', 'Archived system details')}</h2></header><p class="detail-note">{connection.toolNames.length} {t('เครื่องมือ', 'tools')} · {workspaces.length} {t('พื้นที่ทำงาน AI', 'AI workspaces')}</p><p class="detail-note">{t('การตั้งค่าและบัญชีที่เชื่อมไว้ยังคงอยู่ กู้คืนและตรวจสอบระบบก่อนเปิดให้ทีมใช้งานอีกครั้ง', 'Settings and connected accounts are retained. Restore and review this system before giving your team access again.')}</p></section>
{:else if tab === "account" && connection && !data.canManage}
  <section class="detail-card">
    <header class="detail-card-head"><h2>{t("บัญชีของระบบ", "System account")}</h2></header>
    <p class="detail-note">
      {t(
        "ติดต่อผู้ดูแลระบบขององค์กรเพื่อตรวจสอบหรือตั้งค่าบัญชีของระบบนี้",
        "Contact your administrator to review or set up the account for this system.",
      )}
    </p>
  </section>
{:else if tab === "account" && connection}
  <SourceSetup
    sourceID={connection.mcpID}
    sourceLabel={catalogNames[connection.mcpID] || ""}
    endpointHost={catalogHosts[connection.mcpID] || ""}
    managedProvider={catalogProviders[connection.mcpID]}
    canCreate={data.canManage}
  />
  <a class="detail-next" href={href("tools")}>{t("จัดการเครื่องมือและสิทธิ์", "Manage tools and permissions")}<ArrowRight size={16} aria-hidden="true" /></a>
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
  <section class="detail-card">
    <header class="detail-card-head">
      <div>
        <h2>{t("เครื่องมือที่อนุญาต", "Allowed tools")}</h2>
      </div>
    </header>
    {#each connection.tools.filter( (tool) => connection.toolNames.includes(tool.name), ) as tool}<div
        class="detail-tool"
      >
        <Check size={16} aria-hidden="true" />
        <div>
          <strong>{toolPresentation(tool, orcaLocale.value).label}</strong>
          <small>{tool.name}</small>
          {#if tool.description}<p>{tool.description}</p>{/if}
        </div>
      </div>{:else}<p class="detail-note">
        {t("ยังไม่มีเครื่องมือที่อนุญาต", "No allowed tools yet.")}
      </p>{/each}
    {#if connection.scopeNote}<div class="detail-scope">
        <h3>{t("ขอบเขตข้อมูล", "Data scope")}</h3>
        <p>{connection.scopeNote}</p>
      </div>{/if}
  </section>
{:else if tab === "workspaces"}
  <section class="detail-card">
    <header class="detail-card-head">
      <div>
        <h2>
          {t("พื้นที่ทำงาน AI ที่ใช้ระบบนี้", "AI workspaces using this system")}
        </h2>
      </div>
      {#if data.canManage && !connection.archivedAt && connectionReady(connection)}<a
          class="k-button primary small"
          href={localeHref(
            `/app?view=new&connection=${encodeURIComponent(connection.id)}`,
          )}><Plus size={16} aria-hidden="true" />{t("สร้างพื้นที่ทำงาน AI", "Create an AI workspace")}</a
        >{/if}
    </header>
    {#each workspaces as workspace}<a
        class="detail-row"
        href={localeHref(
          `/app?view=hub&hub=${encodeURIComponent(workspace.id)}`,
        )}
        ><span class="detail-row-icon" aria-hidden="true"><Folder size={16} /></span><span class="detail-row-copy"
          ><strong>{workspace.name}</strong><small
            >{gatewayToolCount(workspace)}
            {t("เครื่องมือ", "tools")} · {gatewayMemberIDs(workspace).length}
            {t("สมาชิก", "members")}</small
          ></span
        ><span
          class="k-badge"
          class:active={workspace.status === "active"}
          class:paused={workspace.status === "paused"}>{statusLabels[workspace.status]}</span
        ><ArrowRight size={16} aria-hidden="true" /></a
      >{:else}<p class="detail-note">
        {t(
          "ยังไม่มีพื้นที่ทำงาน AI ที่ใช้ระบบนี้",
          "No AI workspaces use this system yet.",
        )}
      </p>{/each}
  </section>
{:else if tab === "activity"}
  <section class="detail-card">
    <header class="detail-card-head">
      <div>
        <h2>{t("ประวัติการใช้งานของระบบ", "System activity")}</h2>
      </div>
      <button
        class="k-button small"
        disabled={loading}
        onclick={() => loadActivity(initialConnectionID)}
        >{t("โหลดข้อมูลล่าสุด", "Refresh")}</button
      >
    </header>
    {#if error}<div class="k-banner error detail-card-banner" role="alert">
        <Info size={16} aria-hidden="true" />{error}
      </div>{:else if loading}<p class="detail-note" role="status">
        {t("กำลังโหลดประวัติการใช้งาน…", "Loading activity…")}
      </p>{:else}{#each events as event}<div class="detail-event">
          <span
            ><strong
              >{event.toolName ||
                event.action ||
                event.method ||
                t("การใช้งาน", "Activity")}</strong
            ><small>{displayDate(event.createdAt)}</small></span
          ><span class="k-badge">{event.outcome}</span>
        </div>{:else}<p class="detail-note">
          {t(
            "ยังไม่มีประวัติการใช้งานของระบบนี้",
            "No activity has been recorded for this system yet.",
          )}
        </p>{/each}{/if}
  </section>
{:else}
  <section class="detail-card">
    <header class="detail-card-head">
      <div>
        <h2>{t("การตั้งค่าระบบ", "System setup")}</h2>
      </div>
      <ShieldCheck size={18} aria-hidden="true" />
    </header>
    <ol class="detail-steps">
      <li>
        <span class="detail-step-number">1</span>
        <div>
          <strong>{t("บัญชีของระบบ", "System account")}</strong>
        </div>
        <a class="k-button small" href={href("account")}
          >{t("จัดการบัญชี", "Manage account")}<ArrowRight size={16} aria-hidden="true" /></a
        >
      </li>
      <li>
        <span class="detail-step-number">2</span>
        <div>
          <strong>{t("เครื่องมือและสิทธิ์", "Tools and permissions")}</strong>
          <p>
            {connection.toolNames.length}
            {t("เครื่องมือที่อนุญาต", "allowed tools")} · {connection.reviewedReadOnly
              ? t(
                  "ตรวจสอบแล้ว (อ่านข้อมูลเท่านั้น)",
                  "Reviewed (read-only)",
                )
              : connection.reviewedTools
                ? t("ตรวจสอบและอนุญาตแล้ว", "Reviewed and allowed")
                : t("รอตรวจสอบ", "Needs review")}
          </p>
        </div>
        <a class="k-button small" href={href("tools")}
          >{t("ดูเครื่องมือ", "View tools")}<ArrowRight size={16} aria-hidden="true" /></a
        >
      </li>
      <li>
        <span class="detail-step-number">3</span>
        <div>
          <strong
            >{t("พื้นที่ทำงาน AI", "AI workspaces")}</strong
          >
          <p>
            {t("พื้นที่ทำงาน AI ที่ใช้ระบบนี้", "AI workspaces using this system")}:
            {workspaces.length}
          </p>
        </div>
        <a class="k-button small" href={href("workspaces")}
          >{t("ดูพื้นที่ทำงาน AI", "View AI workspaces")}<ArrowRight
            size={16}
            aria-hidden="true"
          /></a
        >
      </li>
    </ol>
  </section>
  <section class="detail-card">
    <header class="detail-card-head"><h2>{t("รายละเอียด", "Details")}</h2></header>
    <dl class="detail-list">
      <div>
        <dt>{t("สถานะ", "Status")}</dt>
        <dd>
          {connection.enabled
            ? t("เปิดใช้งาน", "Active")
            : t("ระงับ", "Paused")}
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
</div>

<style>
  .detail {
    min-width: 0;
    color: var(--orca-ink);
  }
  .detail-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    color: var(--orca-muted);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
  }
  .detail-back:hover {
    color: var(--orca-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px 24px;
    margin-bottom: 20px;
  }
  .detail-title {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;
  }
  .detail-logo {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    margin-top: 1px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .detail-title-copy {
    min-width: 0;
  }
  .detail-title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }
  .detail-title-row h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .detail-actions {
    flex: none;
  }
  .detail .detail-banner {
    margin: 0 0 16px;
  }
  .detail-banner p {
    margin: 0;
  }
  .detail-tabs {
    display: flex;
    gap: 24px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--orca-line);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .detail-tabs a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: -1px;
    padding: 10px 0 11px;
    border-bottom: 2px solid transparent;
    color: var(--orca-muted);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }
  .detail-tabs a:hover {
    color: var(--orca-ink);
  }
  .detail-tabs a.chosen {
    border-bottom-color: var(--orca-ink);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .detail-tabs a > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    padding: 0 6px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
  }
  .detail-card {
    min-width: 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .detail-card + .detail-card {
    margin-top: 16px;
  }
  .detail-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 12px;
    color: var(--orca-subtle);
  }
  .detail-card-head h2 {
    margin: 0;
    color: var(--orca-ink);
  }
  .detail-card-head :global(.k-button) {
    flex: none;
  }
  .detail-note {
    margin: 0;
    padding: 0 18px 16px;
    color: var(--orca-muted);
    font-size: 14px;
  }
  .detail-note + .detail-note {
    margin-top: -8px;
  }
  .detail .detail-card-banner {
    margin: 0 18px 16px;
  }
  .detail-steps {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .detail-steps li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-top: 1px solid #eff0f2;
  }
  .detail-steps li > div {
    flex: 1;
    min-width: 0;
  }
  .detail-steps strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .detail-steps p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .detail-step-number {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border: 1px solid var(--orca-line-strong);
    border-radius: 50%;
    background: var(--orca-surface);
    color: var(--orca-ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }
  .detail-steps li > :global(.k-button) {
    flex: none;
  }
  .detail-list {
    margin: 0;
  }
  .detail-list > div {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 16px;
    padding: 10px 18px;
    border-top: 1px solid #eff0f2;
    font-size: 14px;
  }
  .detail-list dt {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .detail-list dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .detail-tool {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 18px;
    border-top: 1px solid #eff0f2;
    color: var(--orca-ok);
  }
  .detail-tool :global(svg) {
    flex: none;
    margin-top: 3px;
  }
  .detail-tool > div {
    min-width: 0;
    color: var(--orca-ink);
  }
  .detail-tool strong {
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .detail-tool small {
    display: block;
    color: var(--orca-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .detail-tool p {
    margin: 4px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .detail-scope {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--orca-line);
  }
  .detail-scope h3 {
    margin: 0;
  }
  .detail-scope p {
    margin: 4px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    white-space: pre-wrap;
  }
  .detail-row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-top: 1px solid #eff0f2;
    color: var(--orca-ink);
    text-decoration: none;
  }
  .detail-row:hover {
    background: var(--orca-surface-2);
  }
  .detail-row > :global(svg) {
    color: var(--orca-subtle);
  }
  .detail-row-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--orca-radius);
    background: var(--orca-secondary);
    color: var(--orca-nav);
  }
  .detail-row-copy {
    min-width: 0;
  }
  .detail-row-copy strong,
  .detail-row-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail-row-copy strong {
    font-size: 14px;
    font-weight: 600;
  }
  .detail-row-copy small {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .detail-event {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 18px;
    border-top: 1px solid #eff0f2;
    font-size: 14px;
  }
  .detail-event > span:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .detail-event strong {
    font-weight: 600;
  }
  .detail-event small {
    display: block;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .detail :global(.source-setup) {
    margin-bottom: 0;
  }
  .detail-next {
    display: flex;
    width: fit-content;
    align-items: center;
    gap: 6px;
    margin-top: 16px;
    color: var(--orca-ink);
    font-size: 14px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  @media (max-width: 760px) {
    .detail-head {
      flex-direction: column;
    }
    .detail-tabs {
      gap: 20px;
    }
    .detail-steps li {
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .detail-steps li > div {
      flex-basis: calc(100% - 36px);
    }
    .detail-steps li > :global(.k-button) {
      margin-left: 36px;
    }
    .detail-list > div {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
    .detail-row {
      grid-template-columns: 32px minmax(0, 1fr) 16px;
    }
    .detail-row .k-badge {
      grid-column: 2;
      grid-row: 2;
      justify-self: start;
    }
  }
</style>
