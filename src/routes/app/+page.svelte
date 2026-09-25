<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Approvals from "$lib/components/orca/Approvals.svelte";
  import Audit from "$lib/components/orca/Audit.svelte";
  import OrganizationSettings from "$lib/components/orca/OrganizationSettings.svelte";
  import WorkspaceDetail from "$lib/components/orca/WorkspaceDetail.svelte";
  import WorkspaceWizard from "$lib/components/orca/WorkspaceWizard.svelte";
  import GatewayCreated from "$lib/components/orca/GatewayCreated.svelte";
  import notoLicenseURL from "$lib/components/orca/assets/noto-sans-thai-OFL.txt?url";
  import "$lib/components/orca/workspace-base.css";
  import WorkspaceDashboard from "$lib/components/orca/WorkspaceDashboard.svelte";
  import AppOverview from "$lib/components/orca/AppOverview.svelte";
  import AppShell from "$lib/components/orca/AppShell.svelte";
  import MyConnections from "$lib/components/orca/MyConnections.svelte";
  import OAuthApps from "$lib/components/orca/OAuthApps.svelte";
  import Secrets from "$lib/components/orca/Secrets.svelte";
  import ConnectionCenter from "$lib/components/orca/ConnectionCenter.svelte";
  import ConnectionSettings from "$lib/components/orca/ConnectionSettings.svelte";
  import ConnectedUsers from "$lib/components/orca/ConnectedUsers.svelte";
  import FeatureScaffold from "$lib/components/orca/FeatureScaffold.svelte";
  import UserSources from "$lib/components/orca/UserSources.svelte";
  import SettingsCenter from "$lib/components/orca/SettingsCenter.svelte";
  import KnowledgeLibrary from "$lib/components/orca/KnowledgeLibrary.svelte";
  import PilotInbox from "$lib/components/orca/PilotInbox.svelte";
  import TeamAccess from "$lib/components/orca/TeamAccess.svelte";
  import ToolCatalog from "$lib/components/orca/ToolCatalog.svelte";
  import WorkspaceSetup from "$lib/components/orca/WorkspaceSetup.svelte";
  import "$lib/components/orca/orca.css";
  import { initializeLocale, localeHref, t } from "$lib/orca/locale.svelte";
  import { appNavigation } from "$lib/orca/navigation";
  import { gatewayHasMember } from "$lib/orca/gateway-sources";
  import { getFeatureDefinition } from "$lib/orca/feature-registry";
  import {
    OrcaService,
    orcaError,
    type OrcaBootstrap,
    type OrcaHub,
  } from "$lib/services/orca";
  import { ArrowRight, Folder, Info, KeyRound, LoaderCircle } from "@lucide/svelte";
  import { onMount } from "svelte";

  let data = $state<OrcaBootstrap>();
  let error = $state("");
  let refreshing = $state(false);
  let refreshGeneration = 0;
  let wizardRevision = $state(0);
  let pendingApprovals = $state(0);
  let approvalsGeneration = 0;
  const navigation = $derived(appNavigation(page.url.searchParams));
  const view = $derived(navigation.view);
  const plannedFeature = $derived(getFeatureDefinition(view));
  const personalHubs = $derived.by(() => {
    const current = data;
    return current?.hubs.filter((item) => item.status !== "archived" && item.status !== "deleted" && gatewayHasMember(item, current.currentUserID)) ?? [];
  });
  const currentData = $derived(data ? {...data,
    hubs: data.hubs.filter(item => item.status !== 'archived' && item.status !== 'deleted'),
    connections: data.connections.filter(item => !item.archivedAt && !item.deletedAt),
    members: data.members.filter(item => !item.status || item.status === 'active'),
    units: data.units.filter(item => !item.archivedAt && !item.deletedAt),
  } : undefined);
  const managementData = $derived(data && currentData ? {...data, members: currentData.members, units: currentData.units} : undefined);
  const hubID = $derived(page.url.searchParams.get("hub") ?? "");
  const editID = $derived(page.url.searchParams.get("edit") ?? "");
  const sourceID = $derived(page.url.searchParams.get("source") ?? "");
  const connectionID = $derived(page.url.searchParams.get("connection") ?? "");
  const addSource = $derived(page.url.searchParams.get("add") === "source");
  const libraryKind = $derived(
    page.url.searchParams.get("kind") === "knowledge"
      ? "knowledge"
      : page.url.searchParams.get("kind") === "template"
        ? "template"
        : undefined,
  );
  const createLibraryItem = $derived(
    !!libraryKind && page.url.searchParams.get("create") === "1",
  );
  const hub = $derived(data?.hubs.find((item) => item.id === hubID));
  const editingHub = $derived(currentData?.hubs.find((item) => item.id === editID));
  async function refresh() {
    const request = ++refreshGeneration;
    refreshing = true;
    error = "";
    try {
      const result = await OrcaService.bootstrap();
      if (request === refreshGeneration) {
        data = result;
        void refreshApprovals();
      }
    } catch (cause) {
      if (request === refreshGeneration) error = orcaError(cause);
    } finally {
      if (request === refreshGeneration) refreshing = false;
    }
  }
  // The waiting count on the manager's menu; a failed check keeps the last count.
  async function refreshApprovals() {
    const request = ++approvalsGeneration;
    if (!data?.canManage) {
      pendingApprovals = 0;
      return;
    }
    try {
      const items = await OrcaService.approvals("pending");
      if (request === approvalsGeneration) pendingApprovals = items.length;
    } catch {
      // Keep the last count; the inbox itself shows any error.
    }
  }
  onMount(() => {
    initializeLocale();
    void refresh();
  });
  async function reloadWizard() {
    await refresh();
  }
  async function saved(hub: OrcaHub) {
    refreshGeneration += 1;
    if (data)
      data = {
        ...data,
        hubs: [...data.hubs.filter((item) => item.id !== hub.id), hub],
      };
    const nextTab = !editID ? '&tab=connect&created=1'
      : page.url.searchParams.get('step') === 'tools' ? '&tab=tools' : '';
    await goto(localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}${nextTab}`));
    await refresh();
  }
  $effect(() => {
    const currentView = view;
    if (typeof window !== "undefined" && currentView)
      window.scrollTo({ top: 0, behavior: "instant" });
  });
</script>

<svelte:head
  ><title
    >{t("ORCA · พื้นที่ทำงาน", "ORCA · Workspace")}</title
  ><meta
    name="description"
    content={t(
      "เชื่อมระบบขององค์กร เลือกเครื่องมือและสมาชิก ให้ทีมใช้ AI กับข้อมูลตามสิทธิ์ที่กำหนด",
      "Connect your organization’s systems, choose data and members, and give your team clear AI access.",
    )}
  /></svelte:head
>

<AppShell {data} {view} {refreshing} {pendingApprovals} onrefresh={refresh}>
  {#if error}<div class="k-banner error" role="alert">
      <Info size={20} />
      <div>
        <p>{error}</p>
        <button class="k-link-button" disabled={refreshing} onclick={refresh}
          >{t("ลองอีกครั้ง", "Try again")}</button
        >
      </div>
    </div>{/if}
  {#if !data}<div class="k-loading" role="status" aria-live="polite">
      {#if refreshing}<LoaderCircle size={25} class="k-spin" />
        {t("กำลังโหลดข้อมูลองค์กร…", "Loading organization data…")}{:else}{t(
          "โหลดข้อมูลองค์กรไม่สำเร็จ กรุณาลองอีกครั้ง",
          "Organization data could not be loaded. Please try again.",
        )}{/if}
    </div>
  {:else if view === "dashboard"}{#key data}<WorkspaceDashboard data={currentData!} />{/key}
  {:else if view === "new"}
    {#if !data.canManage}<div class="k-empty">
        <Folder size={34} />
        <h1>
          {t(
            "คุณยังไม่มีสิทธิ์จัดการพื้นที่ทำงาน AI",
            "This account cannot manage AI workspaces.",
          )}
        </h1>
        <p>
          {t(
            "ติดต่อผู้ดูแลองค์กรเพื่อขอสิทธิ์ที่จำเป็น",
            "Contact your organization administrator for the required access.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไปพื้นที่ทำงาน AI", "Back to AI workspaces")}</a
        >
      </div>
    {:else if editID && !editingHub}<div class="k-empty">
        <Info size={34} />
        <h1>{t("ไม่พบพื้นที่ทำงาน AI นี้", "AI workspace not found")}</h1>
        <p>
          {t(
            "พื้นที่ทำงานนี้อาจมีการเปลี่ยนแปลง หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง กรุณาติดต่อผู้ดูแลองค์กร",
            "This workspace may have changed, or your account cannot access it.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไปพื้นที่ทำงาน AI", "Back to AI workspaces")}</a
        >
      </div>
    {:else}{#key `${editID}:${wizardRevision}:${page.url.searchParams.get('step')}`}<WorkspaceWizard
          data={currentData!}
          existing={editingHub}
          initialConnectionID={connectionID}
          initialStep={page.url.searchParams.get('step') === 'tools' ? 'tools' : undefined}
          onsaved={saved}
          onreload={reloadWizard}
        />{/key}{/if}
  {:else if view === "hub"}
    {#if hub}{#if page.url.searchParams.get('created') === '1' && data.canManage}<GatewayCreated {hub} />{/if}{#key hub.id}<WorkspaceDetail
          data={managementData!}
          {hub}
          onchanged={refresh}
        />{/key}{:else}<div class="k-empty">
        <Info size={34} />
        <h1>{t("ไม่พบพื้นที่ทำงาน AI นี้", "AI workspace not found")}</h1>
        <p>
          {t(
            "พื้นที่ทำงานนี้อาจมีการเปลี่ยนแปลง หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง กรุณาติดต่อผู้ดูแลองค์กร",
            "This workspace may have changed, or your account cannot access it.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไปพื้นที่ทำงาน AI", "Back to AI workspaces")}</a
        >
      </div>{/if}
  {:else if view === "knowledge"}<KnowledgeLibrary
      data={currentData!}
      {hubID}
      initialKind={libraryKind}
      initialCreate={createLibraryItem}
      onchanged={refresh}
    />
  {:else if view === "catalog"}<ToolCatalog data={currentData!} onchanged={refresh} />
  {:else if view === "servers"}
    {#if navigation.connectionDetail}{#key `${sourceID}:${connectionID}:${addSource}`}<ConnectionSettings
          data={managementData!}
          onchanged={refresh}
          initialSourceID={sourceID}
          initialConnectionID={connectionID}
          initiallyAddSource={addSource}
        />{/key}{:else}
      <ConnectionCenter data={managementData!} onchanged={refresh} />
    {/if}
  {:else if view === "accounts"}<MyConnections data={currentData!} />
  {:else if view === "connected-users"}<ConnectedUsers data={currentData!} />
  {:else if view === "organization"}
    <div class="arcade-embedded"><OrganizationSettings data={currentData!} onchanged={refresh} /></div>
  {:else if view === "members"}
    <div class="arcade-embedded"><TeamAccess {data} onchanged={refresh} /></div>
  {:else if view === "api-keys"}
    <header class="connection-heading"><div>
      <h1>{t("เชื่อม AI กับ ORCA", "Connect AI to ORCA")}</h1>
      <p>{t("สร้างคีย์และดูวิธีเชื่อม AI เช่น ChatGPT หรือ Claude เข้ากับพื้นที่ทำงานที่คุณได้รับสิทธิ์", "Create keys and view the instructions for connecting AI, such as ChatGPT or Claude, to the workspaces you can access.")}</p>
    </div></header>
    <section class="connection-detail-panel">
      <div class="connection-section-heading"><div>
        <h2><KeyRound size={18} />{t("คีย์ ORCA สำหรับทุกพื้นที่ทำงานของคุณ", "One ORCA key for all your workspaces")}</h2>
        <p>{t("สร้างคีย์และคัดลอกวิธีเชื่อม AI ได้ในที่เดียว กำหนดวันหมดอายุ หรือใช้งานจนกว่าจะยกเลิก", "Create a key and copy the setup instructions in one place. Set an expiry date or keep it active until revoked.")}</p>
      </div><a class="k-button primary" href={localeHref('/app?view=settings&section=ai')}>{t("สร้างคีย์และดูวิธีเชื่อม", "Create key and view instructions")}<ArrowRight size={16} /></a></div>
    </section>
    <section class="connection-detail-panel">
      <div class="connection-section-heading"><div>
        <h2><KeyRound size={18} />{t("คีย์ตามพื้นที่ทำงาน", "Keys by workspace")}</h2>
        <p>{t("เปิดพื้นที่ทำงานเพื่อสร้างคีย์ ตรวจสอบวันหมดอายุ หรือยกเลิกคีย์", "Open a workspace to create a key, check its expiry date or revoke it.")}</p>
      </div></div>
      {#each personalHubs as item (item.id)}
        <a class="connection-workspace-row" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(item.id)}&tab=connect`)}>
          <span><strong>{item.name}</strong><small>{t("จัดการคีย์ส่วนตัว", "Manage personal keys")}</small></span>
          <ArrowRight size={16} />
        </a>
      {:else}<p>{t("คุณยังไม่ได้รับสิทธิ์ในพื้นที่ทำงานใด", "You have not been added to a workspace.")}</p>{/each}
    </section>
  {:else if view === "user-sources"}<UserSources data={currentData!} />
  {:else if view === "approvals"}<Approvals {data} onchanged={refreshApprovals} />
  {:else if view === "connected-apps"}<OAuthApps data={currentData!} />
  {:else if view === "secrets"}<Secrets data={currentData!} />
  {:else if plannedFeature}<FeatureScaffold feature={plannedFeature} />
  {:else if view === "settings"}<SettingsCenter {data} onchanged={refresh} />
  {:else if view === "executions"}<Audit {data} {hubID} mode="executions" />
  {:else if view === "audit"}<Audit {data} {hubID} mode="administration" />
  {:else if view === "pilots" && data.canReviewPilotRequests}<PilotInbox />
  {:else if view === "overview" || view === "workspaces"}<AppOverview data={managementData!} onchanged={refresh} />
  {:else if view === "help"}
    <div class="k-breadcrumb">
      <a href={localeHref("/app")}>{t("หน้าหลัก", "Home")}</a><span>/</span><span>{t("ช่วยเหลือ", "Help")}</span>
    </div>
    <div class="k-intro">
      <h1>{t("ช่วยเหลือ", "Help")}</h1>
      <p class="k-subtitle">
        {t(
          "ขั้นตอนการตั้งค่าสำหรับผู้ดูแลระบบและสมาชิก เพื่อให้ AI ที่องค์กรใช้อยู่เข้าถึงข้อมูลตามสิทธิ์ที่กำหนด",
          "Setup steps for administrators and members, so the AI your organization uses can access data within the permissions you set.",
        )}
      </p>
    </div>
    <WorkspaceSetup data={currentData!} />
    <div class="k-banner">
      <Info size={18} />
      <p>{t(
        "ลำดับการตั้งค่า: เพิ่มระบบ → ตรวจสอบและเลือกเครื่องมือที่อนุญาต → สร้างพื้นที่ทำงาน AI และกำหนดสมาชิก → เชื่อม AI กับ ORCA",
        "Setup order: add a system → review and choose the allowed tools → create an AI workspace and choose its members → connect AI to ORCA.",
      )}</p>
    </div>
    <div class="k-panel">
      <h2>{t("สำหรับผู้ดูแลระบบ", "For administrators")}</h2>
      <ol class="k-numbered">
        <li>
          {t("เปิดหน้า", "Open")}
          <a href={localeHref("/app?view=servers")}>{t("ระบบที่เชื่อมต่อ", "Connected systems")}</a>
          {t(
            "เพื่อเชื่อมระบบขององค์กร แล้วตรวจสอบและเลือกเครื่องมือที่อนุญาต",
            "to connect your organization's systems, then review and choose the allowed tools.",
          )}
        </li>
        <li>
          <a href={localeHref("/app?view=new")}>{t("สร้างพื้นที่ทำงาน AI", "Create an AI workspace")}</a>
          {t(
            "โดยเลือกระบบ เครื่องมือ สมาชิก และเพดานการใช้งานต่อวัน",
            "and choose its systems, tools, members and daily limit.",
          )}
        </li>
        <li>
          {t(
            "ตรวจสอบสิทธิ์ก่อนเปิดใช้งาน สมาชิกแต่ละคนเข้าสู่ระบบด้วยบัญชีของตนเอง",
            "Review access before activating. Each member signs in with their own account.",
          )}
        </li>
        <li>
          {t("ตรวจสอบ", "Check")}
          <a href={localeHref("/app?view=executions")}>{t("ประวัติการใช้งาน", "Activity")}</a>
          {t(
            "และระงับการใช้งานพื้นที่ทำงานได้ทุกเมื่อ",
            "and pause a workspace at any time.",
          )}
        </li>
      </ol>
    </div>
    <div class="k-panel">
      <h2>{t("สำหรับสมาชิก", "For members")}</h2>
      <ol class="k-numbered">
        <li>{t("คัดลอกลิงก์เชื่อม AI (MCP URL) ของ ORCA หรือของพื้นที่ทำงานที่ได้รับสิทธิ์", "Copy ORCA's AI connection link (MCP URL), or the link of a workspace you can access.")}</li>
        <li>{t("เพิ่มลิงก์ในแอป AI ที่รองรับ MCP แบบ Streamable HTTP และ OAuth", "Add the link to an AI app that supports Streamable HTTP MCP with OAuth.")}</li>
        <li>{t("เมื่อหน้าเข้าสู่ระบบของ ORCA ปรากฏ ให้เข้าสู่ระบบด้วยบัญชีของคุณและยืนยันการเชื่อมต่อ", "When the ORCA sign-in page appears, sign in with your account and approve the connection.")}</li>
      </ol>
    </div>
    <div class="k-banner">
      <Info size={18} />
      <p>
        {t("คีย์ API เป็นทางเลือกสำหรับแอปที่ต้องใช้คีย์ ORCA ตรวจสอบสิทธิ์ของบัญชีทุกครั้งที่มีการเรียกใช้เครื่องมือ", "API keys are an option for apps that require them. ORCA checks account access on every tool call.")}
      </p>
    </div>
    <div class="k-actions">
      {#if data.canManage}<a class="k-button" href={localeHref("/app?view=members")}>{t("จัดการสมาชิก", "Manage members")}</a
        ><a class="k-button" href={localeHref("/app?view=servers")}>{t("จัดการระบบที่เชื่อมต่อ", "Manage connected systems")}</a
        >{/if}<a class="k-button quiet" href="/oauth2/sign_out?rd=/">{t("ออกจากระบบ", "Sign out")}</a>
    </div>
  {:else}{#key data}<WorkspaceDashboard data={currentData!} />{/key}
  {/if}
  <footer class="k-footer">
    <span
      >{t(
        "ORCA · เข้าถึงข้อมูลองค์กรตามสิทธิ์ที่กำหนด",
        "ORCA · Governed access to organizational data",
      )}</span
    ><a href={localeHref("/privacy")}>{t("ความเป็นส่วนตัว", "Privacy")}</a><a
      href="/terms-of-service">{t("เงื่อนไขการใช้งาน", "Terms of use")}</a
    ><a href="/third-party.html"
      >{t("ข้อมูลซอฟต์แวร์โอเพนซอร์ส", "Open-source notices")}</a
    ><a href={notoLicenseURL}
      >{t("สัญญาอนุญาตฟอนต์ Noto Sans Thai", "Noto Sans Thai license")}</a
    >
  </footer>
</AppShell>
