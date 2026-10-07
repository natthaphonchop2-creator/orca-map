<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import CompanyGate from "$lib/components/orca/CompanyGate.svelte";
  import { companyDenied, currentCompany, DEFAULT_COMPANY, reloadForAddress, type OrcaCompanyChoice } from "$lib/orca/company";
  import { onCompanyStop } from "$lib/orca/company-stop";
  import { companyStatus, stoppedFromRefusal } from "$lib/orca/platform-console";
  import { parseErrorContent } from "$lib/errors";
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
  import AddProgramView from "$lib/components/orca/views/AddProgramView.svelte";
  import HelpView from "$lib/components/orca/views/HelpView.svelte";
  import ConnectAIView from "$lib/components/orca/views/ConnectAIView.svelte";
  import OversightView from "$lib/components/orca/views/OversightView.svelte";
  import MyAIFrame from "$lib/components/orca/views/MyAIFrame.svelte";
  import PlatformView from "$lib/components/orca/views/PlatformView.svelte";
  import TeamView from "$lib/components/orca/views/TeamView.svelte";
  import WorkspaceHubView from "$lib/components/orca/views/WorkspaceHubView.svelte";
  import WorkspaceNewView from "$lib/components/orca/views/WorkspaceNewView.svelte";
  import Onboarding from "$lib/components/orca/onboarding/Onboarding.svelte";
  import { onboardingDone, onboardingKey, showsOnboarding } from "$lib/orca/onboarding";
  import "$lib/components/orca/orca.css";
  import { initializeLocale, localeHref, t } from "$lib/orca/locale.svelte";
  import { appNavigation, type PlatformSection } from "$lib/orca/navigation";
  import {
    OrcaService,
    orcaError,
    type OrcaBootstrap,
    type OrcaHub,
  } from "$lib/services/orca";
  import { checkAIConnectionOnce } from "$lib/services/orca-ai-apps";
  import { savedHubHref } from "$lib/orca/workspace-edit";
  import { Folder, Info, LoaderCircle } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import type { PageProps } from "./$types";

  // The company this page opens was picked before it rendered (+page.ts).
  let { data: route }: PageProps = $props();
  // A company that is not active (platform console C6 §4.2): its people see
  // only the fixed message, from the company list's status or from a 423 that
  // any request of the page met (company-stop): the workspace and every page
  // in it go, with their polls, timers and loads.
  let refusedStatus = $state<"suspended" | "closed">();
  // The company list as it is now: read again with every refresh and after
  // ORCA changes a company, so the switcher never shows an old status (Codex
  // PC1 review 1, MINOR 7). Until then, the list the page opened with.
  let liveCompanies = $state<OrcaCompanyChoice[]>();
  const listedCompanies = $derived(
    liveCompanies ?? (route.place.kind === "company" || route.place.kind === "choose" ? route.place.companies : undefined),
  );
  const listedStatus = $derived(
    route.place.kind === "company" ? companyStatus(listedCompanies?.find((choice) => choice.id === (route.place as { id: string }).id)?.status) : "active",
  );
  const stopped = $derived(refusedStatus ?? (listedStatus === "active" ? undefined : listedStatus));
  const gate = $derived(
    route.place.kind === "choose" ? "choose"
      : route.place.kind === "none" ? "none"
      : route.place.kind === "error" ? "error"
      : companyDenied(route.place) ? "denied"
      : stopped ? "stopped"
      : undefined,
  );
  const companies = $derived(route.place.kind === "company" || route.place.kind === "choose" ? (listedCompanies ?? []) : []);
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
        : page.url.searchParams.get("kind") === "file"
          ? "file"
          : undefined,
  );
  const createLibraryItem = $derived(
    !!libraryKind && page.url.searchParams.get("create") === "1",
  );
  const hub = $derived(data?.hubs.find((item) => item.id === hubID));
  // The first run (W0): an Owner or Admin of a company with no program yet sees
  // the two onboarding screens on Home until they finish or skip them;
  // view=welcome opens them on purpose. Remembered in this browser only.
  let onboardingFinished = $state(false);
  const onboarding = $derived(
    !!data && !navigation.redirect && showsOnboarding({
      view,
      canManage: data.canManage,
      platform: view === "platform",
      connections: data.connections,
      done: onboardingFinished || onboardingDone(localStorageOrNothing, onboardingKey(currentCompany(), data.currentUserID)),
    }),
  );
  function localStorageOrNothing() {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }
  async function refresh() {
    const request = ++refreshGeneration;
    refreshing = true;
    error = "";
    void refreshCompanies();
    try {
      const result = await OrcaService.bootstrap();
      if (request === refreshGeneration) {
        // The session is someone else's than this page's (another tab signed
        // in as them): start again as them, never show their data here.
        if (result.currentUserID !== route.account) {
          if (!reloadForAccount(() => window.location.reload(), sessionStorageOrNothing()))
            error = t("คุณเข้าสู่ระบบด้วยบัญชีอื่นในอีกแท็บ โหลดหน้านี้ใหม่", "You signed in as someone else in another tab. Reload this page.");
          return;
        }
        data = result;
        void refreshApprovals();
        void checkAIConnectionOnce();
      }
    } catch (cause) {
      if (request === refreshGeneration) {
        const parsed = parseErrorContent(cause);
        const refused = stoppedFromRefusal(parsed.status, parsed.message);
        if (refused) refusedStatus = refused;
        else error = orcaError(cause);
      }
    } finally {
      if (request === refreshGeneration) refreshing = false;
    }
  }
  // The person's companies, with their status. An older server has no list
  // (the page opened without one), and a failed read keeps the last list.
  let companiesGeneration = 0;
  async function refreshCompanies() {
    if (route.place.kind !== "company" || !route.place.companies) return;
    const request = ++companiesGeneration;
    try {
      const items = await OrcaService.companies();
      if (request === companiesGeneration) liveCompanies = items;
    } catch {
      // Keep the last list.
    }
  }
  // The top bar's "อัปเดตข้อมูล": on a platform page its lists (companies, Google, accounts,
  // the catalog) are the platform's own, so they load again too.
  let platformReloads = $state(0);
  function refreshFromTopBar() {
    if (view === "platform") platformReloads += 1;
    return refresh();
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
    // Any request of this company refused for its status opens the
    // suspended page, and the list it shows is read again.
    const stopListening = onCompanyStop((status) => {
      refusedStatus = status;
      refreshGeneration += 1;
      refreshing = false;
      void refreshCompanies();
    });
    if (!gate) void refresh();
    return () => {
      stopListening();
      stopGuard();
    };
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
  /** After the create form or the one click; `added` names a program added to a workspace that already existed. */
  async function savedNew(saved: OrcaHub, added?: string) {
    refreshGeneration += 1;
    if (data)
      data = {
        ...data,
        hubs: [...data.hubs.filter((item) => item.id !== saved.id), saved],
      };
    await goto(localeHref(savedHubHref(saved.id, added)));
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
      "เชื่อมโปรแกรมของบริษัท เลือกว่าใครใช้ได้ และให้ทีมใช้ AI กับข้อมูลตามสิทธิ์",
      "Connect your company's programs, choose who can use them, and let your team use AI with the data they're allowed.",
    )}
  /></svelte:head
>

{#if gate}<CompanyGate mode={gate} {companies} account={route.account} {stopped} current={route.place.kind === "company" ? route.place.id : ""} />
{:else if onboarding && data}<Onboarding {data} page={navigation.params.get("page") === "2" ? 2 : 1} ondone={() => (onboardingFinished = true)} />
{:else}
<AppShell {data} {view} {section} {refreshing} {pendingApprovals} {companies} account={route.account} onrefresh={refreshFromTopBar}>
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
          "โหลดข้อมูลบริษัทไม่สำเร็จ ลองอีกครั้ง",
          "Company data could not be loaded. Try again.",
        )}{/if}
    </div>
  {:else if navigation.redirect}<div class="k-loading" role="status" aria-live="polite">
      <LoaderCircle size={25} class="k-spin" />{t("กำลังเปิดหน้า…", "Opening…")}
    </div>
  {:else if view === "dashboard"}{#key data}<WorkspaceDashboard data={currentData!} {pendingApprovals} />{/key}
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
  {:else if view === "connect-ai"}<ConnectAIView data={currentData!} onchanged={refresh} />
  {:else if view === "members"}<TeamView {data} onchanged={refresh} />
  {:else if view === "secrets" && data.canManage}<MyAIFrame data={currentData!} />
  {:else if view === "approvals" || view === "executions" || view === "audit"}<OversightView
      {data}
      activeData={currentData!}
      {view}
      {hubID}
      {pendingApprovals}
      onapprovalschanged={refreshApprovals}
    />
  {:else if view === "settings"}<SettingsCenter {data} activeData={currentData} onchanged={refresh} />
  {:else if view === "platform" && data.platformOperator}{#key platformReloads}<PlatformView
      {data}
      activeData={currentData!}
      section={(section ?? "overview") as PlatformSection}
      companyID={navigation.params.get("company") ?? ""}
      companyTab={navigation.params.get("tab") ?? ""}
      onchanged={refresh}
    />{/key}
  {:else if view === "workspaces"}<AppOverview data={managementData!} onchanged={refresh} />
  {:else if view === "help"}<HelpView {data} />
  {:else}{#key data}<WorkspaceDashboard data={currentData!} {pendingApprovals} />{/key}
  {/if}
  <footer class="k-footer">
    <span
      >{t(
        "ORCA · ใช้ AI กับข้อมูลบริษัทตามสิทธิ์ที่กำหนด",
        "ORCA · AI with company data, within the access you set",
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
