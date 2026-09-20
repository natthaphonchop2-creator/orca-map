<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Audit from "$lib/components/khum/Audit.svelte";
  import OrganizationSettings from "$lib/components/khum/OrganizationSettings.svelte";
  import WorkspaceDetail from "$lib/components/khum/WorkspaceDetail.svelte";
  import WorkspaceWizard from "$lib/components/khum/WorkspaceWizard.svelte";
  import GatewayCreated from "$lib/components/orca/GatewayCreated.svelte";
  import notoLicenseURL from "$lib/components/khum/assets/noto-sans-thai-OFL.txt?url";
  import "$lib/components/khum/khum.css";
  import WorkspaceDashboard from "$lib/components/orca/WorkspaceDashboard.svelte";
  import AppOverview from "$lib/components/orca/AppOverview.svelte";
  import AppShell from "$lib/components/orca/AppShell.svelte";
  import MyConnections from "$lib/components/orca/MyConnections.svelte";
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
      if (request === refreshGeneration) data = result;
    } catch (cause) {
      if (request === refreshGeneration) error = orcaError(cause);
    } finally {
      if (request === refreshGeneration) refreshing = false;
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
    >{t("ORCA · เครื่องมือและ MCP Gateways", "ORCA · Tools & MCP Gateways")}</title
  ><meta
    name="description"
    content={t(
      "เชื่อมระบบขององค์กร เลือกเครื่องมือและสมาชิก ให้ทีมใช้ AI กับข้อมูลตามสิทธิ์ที่กำหนด",
      "Connect your organization’s systems, choose data and members, and give your team clear AI access.",
    )}
  /></svelte:head
>

<AppShell {data} {view} {refreshing} onrefresh={refresh}>
  {#if error}<div class="k-banner error" role="alert">
      <Info size={20} />
      <div>
        <p>{error}</p>
        <button class="k-link-button" disabled={refreshing} onclick={refresh}
          >{t("โหลดข้อมูลอีกครั้ง", "Reload data")}</button
        >
      </div>
    </div>{/if}
  {#if !data}<div class="k-loading" role="status" aria-live="polite">
      {#if refreshing}<LoaderCircle size={25} class="k-spin" />
        {t("กำลังโหลดข้อมูลองค์กร…", "Loading organization data…")}{:else}{t(
          "โหลดข้อมูลองค์กรไม่สำเร็จ กรุณากดโหลดข้อมูลอีกครั้ง",
          "Could not load your organization yet.",
        )}{/if}
    </div>
  {:else if view === "dashboard"}{#key data}<WorkspaceDashboard data={currentData!} />{/key}
  {:else if view === "new"}
    {#if !data.canManage}<div class="k-empty">
        <Folder size={34} />
        <h1>
          {t(
            "คุณยังไม่มีสิทธิ์จัดการ MCP Gateways",
            "This account cannot manage MCP Gateways.",
          )}
        </h1>
        <p>
          {t(
            "ติดต่อผู้ดูแลองค์กรเพื่อขอสิทธิ์ที่จำเป็น",
            "Contact your organization administrator for the required access.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไป MCP Gateways", "Back to MCP Gateways")}</a
        >
      </div>
    {:else if editID && !editingHub}<div class="k-empty">
        <Info size={34} />
        <h1>{t("ไม่พบ MCP Gateway นี้", "MCP Gateway not found")}</h1>
        <p>
          {t(
            "Gateway อาจมีการเปลี่ยนแปลง หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง กรุณาติดต่อผู้ดูแลองค์กร",
            "This gateway may have changed, or your account cannot access it.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไป MCP Gateways", "Back to MCP Gateways")}</a
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
        <h1>{t("ไม่พบ MCP Gateway นี้", "MCP Gateway not found")}</h1>
        <p>
          {t(
            "Gateway อาจมีการเปลี่ยนแปลง หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง กรุณาติดต่อผู้ดูแลองค์กร",
            "This gateway may have changed, or your account cannot access it.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไป MCP Gateways", "Back to MCP Gateways")}</a
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
    <header class="connection-heading"><div>
      <h1>Organization</h1>
      <p>{t("จัดการข้อมูลองค์กรและโครงสร้างหน่วยงาน", "Manage organization details and organizational units.")}</p>
    </div></header>
    <div class="arcade-embedded"><OrganizationSettings data={currentData!} onchanged={refresh} /></div>
  {:else if view === "members"}
    <header class="connection-heading"><div>
      <h1>Members &amp; departments</h1>
      <p>{t("จัดการสมาชิก บทบาท และแผนกตามสิทธิ์ของคุณ", "Manage members, roles and departments according to your permissions.")}</p>
    </div></header>
    <div class="arcade-embedded"><TeamAccess {data} onchanged={refresh} /></div>
  {:else if view === "api-keys"}
    <header class="connection-heading"><div>
      <h1>API keys</h1>
      <p>{t("จัดการคีย์ส่วนตัวสำหรับเชื่อมแอป AI กับ ORCA", "Manage personal keys for connecting AI clients to ORCA.")}</p>
    </div></header>
    <section class="connection-detail-panel">
      <div class="connection-section-heading"><div>
        <h2><KeyRound size={20} />{t("คีย์ ORCA สำหรับทุก Gateway ที่คุณมีสิทธิ์", "One ORCA key for your authorized Gateways")}</h2>
        <p>{t("สร้างคีย์และคัดลอกวิธีเชื่อม AI จากจุดเดียว เลือกวันหมดอายุหรือใช้จนกว่าจะยกเลิกได้", "Create a key and copy AI setup instructions in one place. Choose an expiry or keep the key active until revoked.")}</p>
      </div><a class="k-button primary" href={localeHref('/app?view=settings&section=ai')}>{t("เชื่อม AI กับ ORCA", "Connect AI to ORCA")}<ArrowRight size={17} /></a></div>
    </section>
    <section class="connection-detail-panel">
      <div class="connection-section-heading"><div>
        <h2><KeyRound size={20} />{t("คีย์ของคุณในแต่ละ Gateway", "Your keys by gateway")}</h2>
        <p>{t("เปิด Gateway เพื่อสร้างคีย์ ดูวันหมดอายุ หรือยกเลิกคีย์ของคุณ", "Open a gateway to create a key, review its expiry or revoke your keys.")}</p>
      </div></div>
      {#each personalHubs as item (item.id)}
        <a class="connection-workspace-row" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(item.id)}&tab=connect`)}>
          <span><strong>{item.name}</strong><small>{t("จัดการคีย์ส่วนตัว", "Manage personal keys")}</small></span>
          <ArrowRight size={17} />
        </a>
      {:else}<p>{t("คุณยังไม่ได้เป็นสมาชิกของ MCP Gateway", "You do not belong to an MCP Gateway yet.")}</p>{/each}
    </section>
  {:else if view === "user-sources"}<UserSources data={currentData!} />
  {:else if plannedFeature}<FeatureScaffold feature={plannedFeature} />
  {:else if view === "settings"}<SettingsCenter {data} onchanged={refresh} />
  {:else if view === "executions"}<Audit {data} {hubID} mode="executions" />
  {:else if view === "audit"}<Audit {data} {hubID} mode="administration" />
  {:else if view === "pilots" && data.canReviewPilotRequests}<PilotInbox />
  {:else if view === "overview" || view === "workspaces"}<AppOverview data={managementData!} onchanged={refresh} />
  {:else if view === "help"}
    <div class="k-breadcrumb">
      <a href={localeHref("/app?view=workspaces")}
        >MCP Gateways</a
      ><span>/</span><span>{t("ช่วยเหลือ", "Help")}</span>
    </div>
    <div class="k-intro">
      <h1>{t("เริ่มใช้งาน ORCA", "Get started with ORCA")}</h1>
      <p class="k-subtitle">
        {t(
          "เชื่อมแอป AI ที่คุณใช้อยู่กับข้อมูลของทีมตามสิทธิ์ที่กำหนด",
          "Give the AI you already use access to your team’s data with clear permissions.",
        )}
      </p>
    </div>
    <WorkspaceSetup data={currentData!} />
    <div class="k-banner">
      <Info size={20} />
      <p>{t(
        "MVP ปัจจุบัน: ค้นหาเครื่องมือใน Tool Catalog → ตั้งค่าระบบและขอบเขตเครื่องมือใน Servers → สร้าง MCP Gateway ให้สมาชิกใช้งาน ส่วน My accounts อยู่ในเมนูบัญชีส่วนตัว หัวข้อที่ระบุว่ายังไม่เปิดใช้งานเป็นหน้าบอกขอบเขตสำหรับการพัฒนาต่อ",
        "Current MVP: find tools in Tool Catalog → configure upstream systems and tool scope in Servers → create an MCP Gateway for members. My accounts is in your account menu. Pages marked Not available yet describe the scope of future work.",
      )}</p>
    </div>
    <div class="k-panel">
      <h2>{t("สำหรับผู้ดูแลองค์กร", "For organization administrators")}</h2>
      <ol
        style="margin:15px 0 0;padding-left:22px;display:flex;flex-direction:column;gap:13px"
      >
        <li>
          {t("ไปที่", "Open")}
          <a href={localeHref("/app?view=servers")}
            >Servers</a
          >
          {t(
            "เพื่อเชื่อมบัญชีของระบบที่ทีมใช้ แล้วตรวจสอบและเลือกเครื่องมือที่อนุญาต",
            "to set up a source account, then review and select allowed tools.",
          )}
        </li>
        <li>
          {t("สร้าง", "Create")}
          <a href={localeHref("/app?view=new")}
            >MCP Gateway</a
          >
          {t(
            "เลือกระบบ เครื่องมือ และสมาชิก พร้อมกำหนดจำนวนครั้งที่ใช้งานได้ต่อวัน",
            "Choose a source and tools, then set members and the daily limit.",
          )}
        </li>
        <li>
          {t(
            "ตรวจสอบสิทธิ์ก่อนเปิดใช้งาน แล้วให้สมาชิกเข้าสู่ระบบด้วยบัญชีของตัวเอง",
            "Review permissions and activate. Each member signs in with their own account.",
          )}
        </li>
        <li>
          {t("ดู", "Check")}
          <a href={localeHref("/app?view=executions")}
            >{t("ประวัติการเรียกเครื่องมือ", "Executions")}</a
          >
          {t(
            "และระงับการใช้งาน Gateway ได้เมื่อต้องการ",
            "and pause gateway access whenever needed.",
          )}
        </li>
      </ol>
    </div>
    <div class="k-panel">
      <h2>{t("สำหรับสมาชิก", "For members")}</h2>
      <ol
        style="margin:15px 0 0;padding-left:22px;display:flex;flex-direction:column;gap:13px"
      >
        <li>
          {t(
            "เปิด MCP Gateway ที่ได้รับสิทธิ์ แล้วคัดลอก URL สำหรับเชื่อมต่อ",
            "Open an MCP Gateway you can access and copy its connection URL.",
          )}
        </li>
        <li>
          {t(
            "สร้างคีย์เชื่อมต่อของคุณ เลือกวันหมดอายุ แล้วคัดลอกคีย์ไปตั้งค่าในแอป AI",
            "Create a personal key, choose an expiry, and copy the key into your AI client.",
          )}
        </li>
        <li>
          {t(
            "เลือกการเชื่อมต่อ MCP แบบ Streamable HTTP แล้วเพิ่ม",
            "Set up MCP over Streamable HTTP and add",
          )}
          <code
            >{t(
              "Authorization: Bearer <คีย์เชื่อมต่อของคุณ>",
              "Authorization: Bearer <personal-key>",
            )}</code
          >
          {t(
            "ในส่วนหัวคำขอที่กำหนดเอง (custom header) ของแอป AI ที่รองรับ",
            "in a client that supports custom headers.",
          )}
        </li>
        <li>
          {t(
            "ยกเลิกคีย์จากหน้า Gateway เมื่อเลิกใช้หรือเปลี่ยนอุปกรณ์",
            "Revoke a key from the gateway page when you stop using it or change devices.",
          )}
        </li>
      </ol>
    </div>
    <div class="k-banner">
      <Info size={20} />
      <p>
        {t(
          "Gateway ใช้ได้เฉพาะเครื่องมือที่ผู้ดูแลเลือก แอป AI ที่ใช้ต้องรองรับการตั้งค่าคีย์เชื่อมต่อในส่วนหัวคำขอ แอปที่รองรับเฉพาะ OAuth ยังเชื่อมกับ Gateway ไม่ได้",
          "Gateways expose only administrator-selected tools. AI clients must support a key in a custom request header. Clients that support only OAuth cannot connect to a gateway yet.",
        )}
      </p>
    </div>
    <div class="k-actions">
      {#if data.canManage}<a
          class="k-button"
          href={localeHref("/app?view=members")}
          >{t("จัดการบัญชีสมาชิก", "Manage accounts and sign-in")}</a
        ><a class="k-button" href={localeHref("/app?view=servers")}
          >{t("ตั้งค่าระบบที่เชื่อมต่อ", "Set up source systems")}</a
        >{/if}<a class="k-button quiet" href="/oauth2/sign_out?rd=/"
        >{t("ออกจากระบบ", "Sign out")}</a
      >
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
