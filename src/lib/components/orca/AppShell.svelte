<script lang="ts">
  import { companyHref, companySwitch, currentCompany, DEFAULT_COMPANY, rememberCompany, type OrcaCompanyChoice } from "$lib/orca/company";
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { writesInFlight } from "$lib/services/writes";
  import { activeNavigationView, platformHref, type PlatformSection } from "$lib/orca/navigation";
  import { aiConnectionLine, type AIConnectionStatus } from "$lib/orca/ai-connection";
  import { aiConnection } from "$lib/orca/ai-connection.svelte";
  import { term } from "$lib/orca/glossary";
  import {
    memberName,
    memberRole,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  import Brand from "./Brand.svelte";
  import LocaleSwitch from "./LocaleSwitch.svelte";
  import ThemeSwitch from "./ThemeSwitch.svelte";
  import Toast from "./ui/Toast.svelte";
  import "./app-workspace.css";
  import "./orca-system.css";
  import {
    Book,
    Boxes,
    Building2,
    ChartNoAxesColumn,
    Check,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    CircleHelp,
    Globe,
    Grid2x2Plus,
    House,
    Inbox,
    KeyRound,
    LogIn,
    LogOut,
    Menu,
    RefreshCw,
    Settings,
    Shield,
    ShieldCheck,
    Sparkles,
    UserRound,
    Users,
    X,
  } from "@lucide/svelte";
  import { onMount, type Snippet } from "svelte";

  let {
    data,
    view,
    section = null,
    refreshing,
    pendingApprovals = 0,
    companies = [],
    account = "",
    aiStatus,
    onrefresh,
    children,
  }: {
    data?: OrcaBootstrap;
    view: string;
    /** The platform section, when view is "platform". */
    section?: string | null;
    refreshing: boolean;
    pendingApprovals?: number;
    /** The person's companies; the switcher shows when there are several. */
    companies?: OrcaCompanyChoice[];
    account?: string;
    /** The pinned button's state line; the shared store by default (B1 feeds it). */
    aiStatus?: AIConnectionStatus;
    onrefresh: () => void;
    children: Snippet;
  } = $props();
  const company = currentCompany();
  const switchable = $derived(companies.length > 1);
  let switchWaiting = $state(false);
  // Switching opens the other company's page, a new page. A save still in
  // flight would be cut off, so the switch waits for it to finish.
  function switchCompany(event: MouseEvent, id: string) {
    const decision = companySwitch(id, writesInFlight());
    if (decision === "stay") {
      event.preventDefault();
      closeAccounts();
      return;
    }
    if (decision === "wait") {
      event.preventDefault();
      switchWaiting = true;
      return;
    }
    switchWaiting = false;
    rememberCompany(account, id);
  }
  const preferenceKey = "orca.workspace.sidebar.collapsed";
  function readSidebarPreference() {
    try {
      return (
        typeof window !== "undefined" &&
        window.localStorage.getItem(preferenceKey) === "1"
      );
    } catch {
      return false;
    }
  }
  let collapsed = $state(readSidebarPreference());
  let drawer: HTMLDialogElement | undefined = $state();
  let shell: HTMLDivElement | undefined = $state();
  const currentUser = $derived(
    data?.members.find((item) => item.id === data?.currentUserID),
  );
  const organization = $derived(data?.organization.displayName || "ORCA");
  const accountName = $derived(
    currentUser ? memberName(currentUser) : t("บัญชีของคุณ", "Your account"),
  );
  // Six flat items for Owners and Admins, the three a member uses (plus their
  // requests once a workspace holds writes), and the platform area for the
  // ORCA team. Every role gets the pinned "เชื่อม AI ของฉัน" button.
  const canManage = $derived(!!data?.canManage);
  const operator = $derived(data?.platformOperator === true);
  const platformMode = $derived(view === "platform" && operator);
  const requestsApproval = $derived(!!data?.hubs.some((hub) => hub.writeMode === "approval" && hub.status !== "archived" && hub.status !== "deleted"));
  type NavigationItem = { id: string; label: string; href: string; icon: typeof House; count?: number };
  const platformItem = (id: PlatformSection, key: Parameters<typeof term>[0], icon: typeof House): NavigationItem => ({ id: `platform:${id}`, label: term(key, t), href: platformHref(id), icon });
  const navigationItems = $derived<NavigationItem[]>(
    platformMode
      ? [
          platformItem("overview", "platformOverview", ChartNoAxesColumn),
          platformItem("companies", "customerCompanies", Building2),
          ...(data?.canReviewPilotRequests ? [platformItem("pilots", "pilotRequests", Inbox)] : []),
          platformItem("signin", "googleSignIn", LogIn),
          platformItem("oauth-apps", "programOAuthApps", KeyRound),
          platformItem("catalog", "programCatalog", Grid2x2Plus),
          platformItem("breakglass", "breakGlass", Shield),
        ]
      : canManage
        ? [
            { id: "dashboard", label: term("home", t), href: "/app", icon: House },
            { id: "servers", label: term("programs", t), href: "/app?view=servers", icon: Grid2x2Plus },
            { id: "workspaces", label: term("workspaces", t), href: "/app?view=workspaces", icon: Boxes },
            { id: "knowledge", label: term("knowledge", t), href: "/app?view=knowledge", icon: Book },
            { id: "members", label: term("team", t), href: "/app?view=members", icon: Users },
            { id: "oversight", label: term("oversight", t), href: "/app?view=approvals", icon: ShieldCheck, count: pendingApprovals },
          ]
        : [
            { id: "dashboard", label: term("home", t), href: "/app", icon: House },
            { id: "workspaces", label: term("workspaces", t), href: "/app?view=workspaces", icon: Boxes },
            { id: "knowledge", label: term("knowledge", t), href: "/app?view=knowledge", icon: Book },
            ...(requestsApproval ? [{ id: "oversight", label: term("myRequests", t), href: "/app?view=approvals", icon: Inbox }] : []),
          ],
  );
  const utilityNavigation = $derived([
    { id: "settings", label: term("settings", t), href: "/app?view=settings", icon: Settings },
    { id: "help", label: term("help", t), href: "/app?view=help", icon: CircleHelp },
  ]);
  // An employee has no ตรวจสอบ: their "คำขอของฉัน" lights only on their
  // requests, not on their own activity history.
  const activeView = $derived.by(() => {
    const active = activeNavigationView(view, section);
    return active === "oversight" && !canManage && !platformMode && view !== "approvals" ? "" : active;
  });
  const aiLine = $derived(aiConnectionLine(aiStatus ?? aiConnection, t));
  const aiConnected = $derived((aiStatus ?? aiConnection)?.state === "connected");
  // The platform always opens the default company; from another company that is a new page.
  const platformReload = $derived(company !== DEFAULT_COMPANY);
  // The breadcrumb names the page; an employee's oversight pages by their own names.
  const employeeOversight: Record<string, Parameters<typeof term>[0]> = { approvals: "myRequests", executions: "usageHistory", audit: "settingsHistory" };
  const currentPage = $derived(
    view === "new"
      ? term("newWorkspace", t)
      : view === "add-program"
        ? term("addProgram", t)
        : activeView === "connect-ai"
          ? term("connectMyAI", t)
          : !canManage && !platformMode && employeeOversight[view]
            ? term(employeeOversight[view], t)
            : [...navigationItems, ...utilityNavigation].find((item) => item.id === activeView)?.label ||
              (activeView === "oversight" ? term("oversight", t) : term("home", t)),
  );
  const accountInitial = $derived(
    (accountName.trim()[0] || "O").toLocaleUpperCase(),
  );
  const menus = ".workspace-account[open], .workspace-company-switch[open]";
  function closeAccounts() {
    shell
      ?.querySelectorAll<HTMLDetailsElement>(menus)
      .forEach((account) => {
        account.open = false;
      });
  }
  function closeDrawer() {
    drawer?.close();
    closeAccounts();
  }
  function toggleSidebar() {
    closeAccounts();
    collapsed = !collapsed;
    try {
      window.localStorage.setItem(preferenceKey, collapsed ? "1" : "0");
    } catch {
      // The rail still works when browser storage is unavailable.
    }
  }
  function onAccountKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !(event.target instanceof Element)) return;
    const account = event.target.closest<HTMLDetailsElement>(menus);
    if (!account || !shell?.contains(account)) return;
    event.preventDefault();
    event.stopPropagation();
    account.open = false;
    account.querySelector("summary")?.focus();
  }
  onMount(() => {
    const desktop = window.matchMedia("(min-width: 821px)");
    const onResize = () => {
      if (desktop.matches) closeDrawer();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey) {
        closeAccounts();
        collapsed = event.newValue === "1";
      }
    };
    const onOutsideAccount = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      shell
        ?.querySelectorAll<HTMLDetailsElement>(menus)
        .forEach((account) => {
          if (!account.contains(target)) account.open = false;
        });
    };
    desktop.addEventListener("change", onResize);
    window.addEventListener("storage", onStorage);
    document.addEventListener("pointerdown", onOutsideAccount);
    document.addEventListener("focusin", onOutsideAccount);
    document.addEventListener("keydown", onAccountKeydown);
    return () => {
      desktop.removeEventListener("change", onResize);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("pointerdown", onOutsideAccount);
      document.removeEventListener("focusin", onOutsideAccount);
      document.removeEventListener("keydown", onAccountKeydown);
    };
  });
  $effect(() => {
    const currentView = view;
    if (currentView) closeDrawer();
  });
</script>

{#snippet companyLinks()}
  {#each companies as choice (choice.id)}
    <!-- A new page: nothing from this company carries over to the next. -->
    <a
      href={localeHref(companyHref(choice.id))}
      data-sveltekit-reload
      aria-current={choice.id === company && !platformMode ? "true" : undefined}
      onclick={(event) => switchCompany(event, choice.id)}
    >
      <Building2 size={16} strokeWidth={1.7} aria-hidden="true" /><span>{choice.displayName}</span>
      {#if choice.id === company && !platformMode}<Check size={15} aria-hidden="true" />{/if}
    </a>
  {/each}
  {#if switchWaiting}<p class="workspace-company-wait" role="status">{t("กำลังบันทึกอยู่ รอสักครู่แล้วลองอีกครั้ง", "Still saving. Try again in a moment.")}</p>{/if}
{/snippet}

{#snippet sidebar(compact: boolean = false, mobile: boolean = false)}
  <div class="workspace-sidebar-header">
    <div
      class="workspace-brand"
      aria-label="ORCA"
      title={compact ? "ORCA" : undefined}
    >
      <Brand {compact} />
    </div>
    {#if !mobile}
      <button
        class="workspace-collapse workspace-icon-button"
        onclick={toggleSidebar}
        aria-expanded={!collapsed}
        aria-controls="workspace-desktop-navigation"
        aria-label={collapsed
          ? t("ขยายเมนูด้านข้าง", "Expand sidebar")
          : t("ย่อเมนูด้านข้าง", "Collapse sidebar")}
        title={collapsed
          ? t("ขยายเมนูด้านข้าง", "Expand sidebar")
          : t("ย่อเมนูด้านข้าง", "Collapse sidebar")}
      >
        {#if collapsed}<ChevronsRight size={17} />{:else}<ChevronsLeft
            size={17}
          />{/if}
      </button>
    {/if}
  </div>

  {#if operator}
    <!-- The ORCA team works in two places: their own company and the platform. -->
    <nav class="workspace-mode" aria-label={t("เลือกพื้นที่", "Choose an area")}>
      <a
        href={localeHref("/app")}
        class:chosen={!platformMode}
        aria-current={!platformMode ? "page" : undefined}
        title={compact ? term("companyMode", t) : undefined}
        onclick={closeDrawer}
        ><Building2 size={15} aria-hidden="true" /><span class="workspace-mode-label">{term("companyMode", t)}</span></a
      >
      {#if platformReload}<a
          href={localeHref(platformHref("overview"))}
          data-sveltekit-reload
          class:chosen={platformMode}
          aria-current={platformMode ? "page" : undefined}
          title={compact ? term("platform", t) : undefined}
          ><Globe size={15} aria-hidden="true" /><span class="workspace-mode-label">{term("platform", t)}</span></a
        >{:else}<a
          href={localeHref(platformHref("overview"))}
          class:chosen={platformMode}
          aria-current={platformMode ? "page" : undefined}
          title={compact ? term("platform", t) : undefined}
          onclick={closeDrawer}
          ><Globe size={15} aria-hidden="true" /><span class="workspace-mode-label">{term("platform", t)}</span></a
        >{/if}
    </nav>
  {/if}

  <div
    class="workspace-sidebar-scroll"
    id={mobile ? undefined : "workspace-desktop-navigation"}
  >
    <nav class="workspace-nav" aria-label={platformMode ? term("platform", t) : t("เมนูหลัก", "Main navigation")}>
      <div class="workspace-nav-group">
        {#each navigationItems as item (item.id)}
          <a
            href={localeHref(item.href)}
            onclick={closeDrawer}
            class:active={activeView === item.id}
            aria-current={activeView === item.id ? "page" : undefined}
            aria-label={item.count ? t(`${item.label} รออนุมัติ ${item.count} รายการ`, `${item.label}, ${item.count} waiting`) : item.label}
            title={item.label}
          >
            <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
            <span class="workspace-nav-label">{item.label}</span>
            {#if item.count}<span class="workspace-nav-count" aria-hidden="true">{item.count > 99 ? "99+" : item.count}</span>{/if}
          </a>
        {/each}
      </div>
    </nav>
  </div>
  <div class="workspace-sidebar-bottom">
    {#if !platformMode}
      <a
        class="workspace-pin"
        class:active={activeView === "connect-ai"}
        href={localeHref("/app?view=connect-ai")}
        onclick={closeDrawer}
        aria-current={activeView === "connect-ai" ? "page" : undefined}
        aria-label={`${term("connectMyAI", t)} · ${aiLine}`}
        title={compact ? `${term("connectMyAI", t)} · ${aiLine}` : undefined}
      >
        <Sparkles size={18} strokeWidth={1.7} aria-hidden="true" />
        <span class="workspace-pin-copy">
          <strong>{term("connectMyAI", t)}</strong>
          <small class="workspace-pin-state" class:connected={aiConnected}>{aiLine}</small>
        </span>
      </a>
    {/if}
    <nav
      class="workspace-nav workspace-utility"
      aria-label={t("การตั้งค่าและความช่วยเหลือ", "Settings and help")}
    >
      {#each utilityNavigation as item (item.id)}
        <a
          href={localeHref(item.href)}
          onclick={closeDrawer}
          class:active={activeView === item.id}
          aria-current={activeView === item.id ? "page" : undefined}
          aria-label={item.label}
          title={compact ? item.label : undefined}
        >
          <item.icon size={17} strokeWidth={1.7} aria-hidden="true" />
          <span class="workspace-nav-label">{item.label}</span>
        </a>
      {/each}
    </nav>
    <details class="workspace-account">
      <summary
        aria-label={t(`บัญชี ${accountName}`, `Account: ${accountName}`)}
        title={compact ? accountName : undefined}
      >
        <span class="workspace-avatar" aria-hidden="true">{accountInitial}</span>
        <span class="workspace-account-copy"
          ><strong>{accountName}</strong><small
            >{platformMode
              ? term("orcaTeam", t)
              : currentUser
                ? memberRole(currentUser.role)
                : t("กำลังโหลด…", "Loading…")}</small
          ></span
        >
        <ChevronDown
          size={15}
          class="workspace-account-chevron"
          aria-hidden="true"
        />
      </summary>
      <div class="workspace-account-menu">
        <strong>{accountName}</strong>
        {#if currentUser?.email}<span>{currentUser.email}</span>{/if}
        <small>{organization}</small>
        {#if switchable}<small class="workspace-account-heading">{t("เปลี่ยนบริษัท", "Switch company")}</small>{@render companyLinks()}{/if}
        <a
          href={localeHref("/app?view=settings&section=account")}
          onclick={closeDrawer}
          ><UserRound size={17} aria-hidden="true" />{term("myAccount", t)}</a
        >
        <ThemeSwitch compact label />
        <a href="/oauth2/sign_out?rd=/"
          ><LogOut size={17} aria-hidden="true" />{term("signOut", t)}</a
        >
      </div>
    </details>
  </div>
{/snippet}

<div
  class="orca orca-app orca-workspace"
  class:sidebar-collapsed={collapsed}
  lang={orcaLocale.value}
  bind:this={shell}
>
  <a href="#orca-main" class="k-skip"
    >{t("ข้ามไปยังเนื้อหา", "Skip to content")}</a
  >
  <aside
    class="workspace-sidebar"
    class:compact={collapsed}
    aria-label={t("เมนู ORCA", "ORCA menu")}
  >
    {@render sidebar(collapsed)}
  </aside>
  <dialog
    class="workspace-drawer"
    bind:this={drawer}
    onclose={closeAccounts}
    aria-label={t("เมนู ORCA", "ORCA menu")}
  >
    <button
      class="workspace-close"
      onclick={closeDrawer}
      aria-label={t("ปิดเมนู", "Close menu")}><X size={22} /></button
    >
    {@render sidebar(false, true)}
  </dialog>
  <div class="workspace-stage">
    <header class="workspace-topbar">
      <button
        class="workspace-menu workspace-icon-button"
        onclick={() => drawer?.showModal()}
        aria-label={t("เปิดเมนู", "Open menu")}
        aria-haspopup="dialog"><Menu size={22} /></button
      >
      <div class="workspace-location">
        <div class="workspace-organization">
          {#if platformMode}
            <Globe size={16} strokeWidth={1.6} aria-hidden="true" />
            <span title={term("platform", t)}>{term("platform", t)}</span>
          {:else}
            <Building2 size={16} strokeWidth={1.6} aria-hidden="true" />
            {#if switchable}
              <details class="workspace-company-switch">
                <summary aria-label={t(`บริษัท ${organization} เปลี่ยนบริษัท`, `Company: ${organization}. Switch company`)}>
                  <span title={organization}>{organization}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div class="workspace-company-menu">
                  <small>{t("เปลี่ยนบริษัท", "Switch company")}</small>
                  {@render companyLinks()}
                </div>
              </details>
            {:else}
              <span title={organization}>{organization}</span>
            {/if}
          {/if}
        </div>
        <span class="workspace-breadcrumb-divider" aria-hidden="true">/</span>
        <strong class="workspace-current-page" aria-current="page"
          >{currentPage}</strong
        >
      </div>
      <div class="workspace-header-actions">
        <LocaleSwitch />
        <button
          class="workspace-icon-button"
          disabled={refreshing}
          onclick={onrefresh}
          aria-label={t("อัปเดตข้อมูล", "Refresh data")}
          title={t("อัปเดตข้อมูล", "Refresh data")}
          ><RefreshCw size={17} class={refreshing ? "k-spin" : ""} /></button
        >
      </div>
    </header>
    <main class="workspace-main" id="orca-main" tabindex="-1">
      {@render children()}
    </main>
  </div>
  <Toast />
</div>
