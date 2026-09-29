<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import CompanyGate from "$lib/components/orca/CompanyGate.svelte";
  import { companyDenied, currentCompany, DEFAULT_COMPANY, reloadForAddress } from "$lib/orca/company";
  import { guardPage, reloadForAccount } from "$lib/services/writes";
  import notoLicenseURL from "$lib/components/orca/assets/noto-sans-thai-OFL.txt?url";
  import "$lib/components/orca/workspace-base.css";
  import WorkspaceDashboard from "$lib/components/orca/WorkspaceDashboard.svelte";
  import AppOverview from "$lib/components/orca/AppOverview.svelte";
  import AppShell from "$lib/components/orca/AppShell.svelte";
  import ConnectionCenter from "$lib/components/orca/ConnectionCenter.svelte";
  import ConnectionSettings from "$lib/components/orca/ConnectionSettings.svelte";
  import SettingsCenter from "$lib/components/orca/SettingsCenter.svelte";
  import KnowledgeLibrary from "$lib/components/orca/KnowledgeLibrary.svelte";
  import WorkspaceSetup from "$lib/components/orca/WorkspaceSetup.svelte";
  import AddProgramView from "$lib/components/orca/views/AddProgramView.svelte";
  import ConnectAIView from "$lib/components/orca/views/ConnectAIView.svelte";
  import OversightView from "$lib/components/orca/views/OversightView.svelte";
  import PlatformView from "$lib/components/orca/views/PlatformView.svelte";
  import TeamView from "$lib/components/orca/views/TeamView.svelte";
  import WorkspaceHubView from "$lib/components/orca/views/WorkspaceHubView.svelte";
  import WorkspaceNewView from "$lib/components/orca/views/WorkspaceNewView.svelte";
  import "$lib/components/orca/orca.css";
  import { initializeLocale, localeHref, t } from "$lib/orca/locale.svelte";
  import { appNavigation, type PlatformSection } from "$lib/orca/navigation";
  import {
    OrcaService,
    orcaError,
    type OrcaBootstrap,
    type OrcaHub,
  } from "$lib/services/orca";
  import { Folder, Info, LoaderCircle } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import type { PageProps } from "./$types";

  // The company this page opens was picked before it rendered (+page.ts).
  let { data: route }: PageProps = $props();
  const gate = $derived(
    route.place.kind === "choose" ? "choose"
      : route.place.kind === "none" ? "none"
      : route.place.kind === "error" ? "error"
      : companyDenied(route.place) ? "denied"
      : undefined,
  );
  const companies = $derived(route.place.kind === "company" || route.place.kind === "choose" ? (route.place.companies ?? []) : []);
  let data = $state<OrcaBootstrap>();
  let error = $state("");
  let refreshing = $state(false);
  let refreshGeneration = 0;
  let pendingApprovals = $state(0);
  let approvalsGeneration = 0;
  // Every old address still works: it is sent to its new home once the
  // company's data (and so the viewer's role) is known.
  const navigation = $derived(appNavigation(page.url.searchParams, { hash: page.url.hash, role: data, hubs: data?.hubs }));
  const view = $derived(navigation.view);
  const section = $derived(navigation.params.get("section"));
  const currentData = $derived(data ? {...data,
    hubs: data.hubs.filter(item => item.status !== 'archived' && item.status !== 'deleted'),
    connections: data.connections.filter(item => !item.archivedAt && !item.deletedAt),
    members: data.members.filter(item => !item.status || item.status === 'active'),
    units: data.units.filter(item => !item.archivedAt && !item.deletedAt),
  } : undefined);
  const managementData = $derived(data && currentData ? {...data, members: currentData.members, units: currentData.units} : undefined);
  const hubID = $derived(page.url.searchParams.get("hub") ?? "");
  const sourceID = $derived(page.url.searchParams.get("source") ?? "");
  const connectionID = $derived(page.url.searchParams.get("connection") ?? "");
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
  async function refresh() {
    const request = ++refreshGeneration;
    refreshing = true;
    error = "";
    try {
      const result = await OrcaService.bootstrap();
      if (request === refreshGeneration) {
        // The session is someone else's than this page's (another tab signed
        // in as them): start again as them, never show their data here.
        if (result.currentUserID !== route.account) {
          if (!reloadForAccount(() => window.location.reload(), sessionStorageOrNothing()))
            error = t("คุณเข้าสู่ระบบด้วยบัญชีอื่นในอีกแท็บ กรุณาโหลดหน้านี้ใหม่", "You signed in as someone else in another tab. Reload this page.");
          return;
        }
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
  function sessionStorageOrNothing() {
    try {
      return window.sessionStorage;
    } catch {
      return undefined;
    }
  }
  onMount(() => {
    initializeLocale();
    // A page restored from the back-forward cache opens afresh, and leaving
    // while a save is in flight asks first.
    const stopGuard = guardPage(window, () => window.location.reload());
    if (!gate) void refresh();
    return stopGuard;
  });
  // An address naming another company than this page's (going back or
  // forward, or any navigation that skips a reload) opens it afresh.
  $effect(() => {
    if (reloadForAddress(route.place, page.url.searchParams.get("org"))) window.location.reload();
  });
  // Old addresses go to their new home, replacing the history entry. The
  // platform area always opens the default company: from any other company
  // that is a new page (critique 12).
  $effect(() => {
    if (!data) return;
    const target = navigation.redirect;
    if (navigation.view === "platform" && currentCompany() !== DEFAULT_COMPANY) {
      const url = new URL(target ?? page.url.pathname + page.url.search + page.url.hash, window.location.href);
      url.searchParams.set("org", DEFAULT_COMPANY);
      window.location.replace(url.pathname + url.search + url.hash);
      return;
    }
    if (target) void goto(target, { replaceState: true, keepFocus: true });
  });
  async function savedNew(saved: OrcaHub) {
    refreshGeneration += 1;
    if (data)
      data = {
        ...data,
        hubs: [...data.hubs.filter((item) => item.id !== saved.id), saved],
      };
    await goto(localeHref(`/app?view=hub&hub=${encodeURIComponent(saved.id)}&created=1`));
    await refresh();
  }
  $effect(() => {
    const currentView = view;
    // A link to a part of the page (#accounts) keeps its own scroll.
    if (typeof window !== "undefined" && currentView && !untrack(() => page.url.hash))
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

{#if gate}<CompanyGate mode={gate} {companies} account={route.account} />
{:else}
<AppShell {data} {view} {section} {refreshing} {pendingApprovals} {companies} account={route.account} onrefresh={refresh}>
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
        {t("กำลังโหลดข้อมูลบริษัท…", "Loading company data…")}{:else}{t(
          "โหลดข้อมูลบริษัทไม่สำเร็จ กรุณาลองอีกครั้ง",
          "Company data could not be loaded. Please try again.",
        )}{/if}
    </div>
  {:else if navigation.redirect}<div class="k-loading" role="status" aria-live="polite">
      <LoaderCircle size={25} class="k-spin" />{t("กำลังเปิดหน้า…", "Opening…")}
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
            "ขอให้ผู้ดูแลบริษัทสร้างพื้นที่ทำงานให้",
            "Ask a company admin to create the workspace.",
          )}
        </p>
        <a href={localeHref("/app?view=workspaces")} class="k-button"
          >{t("กลับไปพื้นที่ทำงาน AI", "Back to AI workspaces")}</a
        >
      </div>
    {:else}{#key `new:${connectionID}:${page.url.searchParams.get("everyone")}`}<WorkspaceNewView
          data={currentData!}
          {connectionID}
          everyone={page.url.searchParams.get("everyone") === "1"}
          onsaved={savedNew}
        />{/key}{/if}
  {:else if view === "hub"}
    {#if hub}<WorkspaceHubView data={managementData!} {hub} onchanged={refresh} />{:else}<div class="k-empty">
        <Info size={34} />
        <h1>{t("ไม่พบพื้นที่ทำงาน AI นี้", "AI workspace not found")}</h1>
        <p>
          {t(
            "พื้นที่ทำงานนี้อาจถูกเปลี่ยน หรือบัญชีของคุณไม่มีสิทธิ์ ขอให้ผู้ดูแลบริษัทตรวจสอบ",
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
  {:else if view === "add-program" && data.canManage}<AddProgramView
      data={managementData!}
      activeData={currentData!}
      {sourceID}
      onchanged={refresh}
    />
  {:else if view === "servers" && data.canManage}
    {#if navigation.connectionDetail}{#key connectionID}<ConnectionSettings
          data={managementData!}
          onchanged={refresh}
          initialConnectionID={connectionID}
        />{/key}{:else}
      <ConnectionCenter data={managementData!} onchanged={refresh} />
    {/if}
  {:else if view === "connect-ai"}<ConnectAIView data={currentData!} />
  {:else if view === "members"}<TeamView {data} onchanged={refresh} />
  {:else if view === "approvals" || view === "executions" || view === "audit" || view === "secrets"}<OversightView
      {data}
      activeData={currentData!}
      {view}
      {hubID}
      {pendingApprovals}
      onapprovalschanged={refreshApprovals}
    />
  {:else if view === "settings"}<SettingsCenter {data} activeData={currentData} onchanged={refresh} />
  {:else if view === "platform" && data.platformOperator}<PlatformView
      {data}
      activeData={currentData!}
      section={(section ?? "overview") as PlatformSection}
      onchanged={refresh}
    />
  {:else if view === "workspaces"}<AppOverview data={managementData!} onchanged={refresh} />
  {:else if view === "help"}
    <div class="k-breadcrumb">
      <a href={localeHref("/app")}>{t("หน้าหลัก", "Home")}</a><span>/</span><span>{t("ช่วยเหลือ", "Help")}</span>
    </div>
    <div class="k-intro">
      <h1>{t("ช่วยเหลือ", "Help")}</h1>
      <p class="k-subtitle">
        {t(
          "ขั้นตอนตั้งค่าสำหรับผู้ดูแลและพนักงาน เพื่อให้ AI ของทีมใช้ข้อมูลบริษัทได้ตามสิทธิ์",
          "Setup steps for admins and employees, so your team's AI can use company data within its permissions.",
        )}
      </p>
    </div>
    <WorkspaceSetup data={currentData!} />
    <div class="k-banner">
      <Info size={18} />
      <p>{t(
        "ลำดับการตั้งค่า: เชื่อมโปรแกรม → เลือกสิ่งที่ AI ทำได้ → สร้างพื้นที่ทำงาน AI และเลือกคนที่ใช้ได้ → เชื่อม AI ของฉัน",
        "Setup order: connect a program → choose what AI can do → create an AI workspace and choose who can use it → connect my AI.",
      )}</p>
    </div>
    <div class="k-panel">
      <h2>{t("สำหรับผู้ดูแล", "For admins")}</h2>
      <ol class="k-numbered">
        <li>
          {t("เปิดหน้า", "Open")}
          <a href={localeHref("/app?view=servers")}>{t("โปรแกรมที่เชื่อม", "Programs")}</a>
          {t(
            "เพื่อเชื่อมโปรแกรมของบริษัท แล้วเลือกสิ่งที่ AI ทำได้",
            "to connect your company's programs, then choose what AI can do.",
          )}
        </li>
        <li>
          <a href={localeHref("/app?view=new")}>{t("สร้างพื้นที่ทำงาน AI", "Create an AI workspace")}</a>
          {t(
            "โดยเลือกโปรแกรม คนที่ใช้ได้ และจำกัดการใช้ต่อวัน",
            "and choose its programs, who can use it and its daily limit.",
          )}
        </li>
        <li>
          {t(
            "ตรวจสิทธิ์ก่อนเปิดใช้ แต่ละคนเข้าสู่ระบบด้วยบัญชีของตัวเอง",
            "Review access before activating. Each person signs in with their own account.",
          )}
        </li>
        <li>
          {t("ดู", "Check")}
          <a href={localeHref("/app?view=executions")}>{t("ประวัติการใช้งาน", "Activity")}</a>
          {t(
            "และหยุดพื้นที่ทำงานได้ทุกเมื่อ",
            "and pause a workspace at any time.",
          )}
        </li>
      </ol>
    </div>
    <div class="k-panel">
      <h2>{t("สำหรับพนักงาน", "For employees")}</h2>
      <ol class="k-numbered">
        <li>{t("เปิดหน้า", "Open")} <a href={localeHref("/app?view=connect-ai")}>{t("เชื่อม AI ของฉัน", "Connect my AI")}</a> {t("แล้วคัดลอกลิงก์ ORCA ของบริษัท", "and copy your company's ORCA link.")}</li>
        <li>{t("วางลิงก์ใน Claude หรือ ChatGPT", "Paste the link into Claude or ChatGPT.")}</li>
        <li>{t("เมื่อหน้าต่าง ORCA เด้งขึ้น ให้เข้าสู่ระบบด้วยบัญชีของคุณแล้วกด อนุญาต", "When the ORCA window opens, sign in with your account and choose Allow.")}</li>
      </ol>
    </div>
    <div class="k-actions">
      {#if data.canManage}<a class="k-button" href={localeHref("/app?view=members")}>{t("ไปที่ทีม", "Go to Team")}</a
        ><a class="k-button" href={localeHref("/app?view=servers")}>{t("ไปที่โปรแกรมที่เชื่อม", "Go to Programs")}</a
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
{/if}
