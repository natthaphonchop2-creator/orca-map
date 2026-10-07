<script lang="ts">
  import { companyHref, companySwitch, currentCompany, DEFAULT_COMPANY, rememberCompany, type OrcaCompanyChoice } from "$lib/orca/company";
  import { companyStatus, companyStatusNote } from "$lib/orca/platform-console";
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { writesInFlight } from "$lib/services/writes";
  import { activeNavigationView, platformHref, showsPlatformSwitch, type PlatformSection } from "$lib/orca/navigation";
  import { hubAsksApproval } from "$lib/orca/approvals";
  import { term } from "$lib/orca/glossary";
  import { skillsEnabled, workspaceNavigation, type JumpTarget, type NavigationID } from "$lib/orca/workspace-nav";
  import {
    memberName,
    memberRole,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  import Brand from "./Brand.svelte";
  import LocaleSwitch from "./LocaleSwitch.svelte";
  import ThemeSwitch from "./ThemeSwitch.svelte";
  import CreateDialog from "./shell/CreateDialog.svelte";
  import JumpDialog from "./shell/JumpDialog.svelte";
  import Toast from "./ui/Toast.svelte";
  import "./app-workspace.css";
  import "./orca-system.css";
  import "./w0.css";
  import {
    Book,
    Bot,
    Building2,
    ChartNoAxesColumn,
    Check,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    ChevronsUpDown,
    CircleHelp,
    Globe,
    Grid2x2Plus,
    History,
    House,
    Inbox,
    KeyRound,
    LogIn,
    LogOut,
    Menu,
    RefreshCw,
    Search,
    Settings2,
    Shield,
    UserRound,
    Workflow,
    X,
    Zap,
  } from "@lucide/svelte";
  import { onMount, type Snippet } from "svelte";

  // The W0 shell (calm workspace, approved 2026-10-07): one flat menu, the
  // company under the logo, ไปที่… ⌘K and the one สร้าง ▾ in the top bar.
  let {
    data,
    view,
    section = null,
    refreshing,
    pendingApprovals = 0,
    companies = [],
    account = "",
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
  let creating = $state(false);
  let jumping = $state(false);
  const currentUser = $derived(
    data?.members.find((item) => item.id === data?.currentUserID),
  );
  const organization = $derived(data?.organization.displayName || "ORCA");
  const accountName = $derived(
    currentUser ? memberName(currentUser) : t("บัญชีของคุณ", "Your account"),
  );
  const canManage = $derived(!!data?.canManage);
  // The platform's pages need the default company's operator flag (the
  // platform area always loads that company); the switch to them shows in
  // every company the operator opens.
  const operator = $derived(data?.platformOperator === true);
  const platformSwitch = $derived(showsPlatformSwitch(data));
  const platformMode = $derived(view === "platform" && operator);
  const skills = $derived(skillsEnabled(data));
  // LINE's writes wait for a manager even in a workspace that runs at once (design §14l).
  const requestsApproval = $derived(!!data?.hubs.some((hub) => hubAsksApproval(hub, data?.connections ?? [])));
  type NavigationItem = { id: string; label: string; href: string; icon: typeof House; count?: number; soon?: boolean };
  const platformItem = (id: PlatformSection, key: Parameters<typeof term>[0], icon: typeof House): NavigationItem => ({ id: `platform:${id}`, label: term(key, t), href: platformHref(id), icon });
  const companyItem: Record<NavigationID, { key: Parameters<typeof term>[0]; icon: typeof House }> = {
    dashboard: { key: "home", icon: House },
    skills: { key: "skills", icon: Zap },
    workflows: { key: "workflows", icon: Workflow },
    servers: { key: "programs", icon: Grid2x2Plus },
    "connect-ai": { key: "myAI", icon: Bot },
    knowledge: { key: "knowledge", icon: Book },
    history: { key: "history", icon: History },
  };
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
      : workspaceNavigation({ canManage, skills, requestsApproval }).map((item) => ({
          id: item.id,
          label: term(companyItem[item.id].key, t),
          href: item.href,
          icon: companyItem[item.id].icon,
          soon: item.soon,
          // Owners and Admins: approvals waiting for them.
          count: item.id === "history" && canManage ? pendingApprovals : undefined,
        })),
  );
  // หน้าหลัก: where the logo goes (owner, 2026-10-05).
  const homeHref = $derived(localeHref(navigationItems[0]?.href ?? "/app"));
  const utilityNavigation = $derived([
    { id: "settings", label: term("settings", t), href: "/app?view=settings", icon: Settings2 },
    { id: "help", label: term("help", t), href: "/app?view=help", icon: CircleHelp },
  ]);
  const activeView = $derived(activeNavigationView(view, section));
  // ไปที่…: the pages in the menu, ตั้งค่า's tabs, and the programs and workspaces this viewer can open.
  const jumpTargets = $derived.by<JumpTarget[]>(() => {
    const pages = t("หน้า", "Page");
    const targets: JumpTarget[] = [...navigationItems, ...utilityNavigation]
      .filter((item) => !("soon" in item && item.soon))
      .map((item) => ({ id: `page:${item.id}`, label: item.label, href: item.href, group: pages }));
    if (platformMode) return targets;
    if (canManage) targets.push({ id: "page:team", label: term("team", t), href: "/app?view=members", group: pages });
    targets.push({ id: "page:workspaces", label: term("workspaces", t), href: "/app?view=workspaces", group: pages });
    if (canManage)
      for (const connection of data?.connections ?? [])
        if (!connection.archivedAt && !connection.deletedAt)
          targets.push({ id: `program:${connection.id}`, label: connection.name, href: `/app?view=servers&connection=${encodeURIComponent(connection.id)}`, group: term("program", t) });
    for (const hub of data?.hubs ?? [])
      if (hub.status !== "archived" && hub.status !== "deleted")
        targets.push({ id: `hub:${hub.id}`, label: hub.name, href: `/app?view=hub&hub=${encodeURIComponent(hub.id)}`, group: term("workspaces", t) });
    return targets;
  });
  const accountInitial = $derived(
    (accountName.trim()[0] || "O").toLocaleUpperCase(),
  );
  // The platform always opens the default company; from another company that is a new page.
  const platformReload = $derived(company !== DEFAULT_COMPANY);
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
  // ⌘K / Ctrl+K opens ไปที่….
  function onShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      closeDrawer();
      jumping = true;
    }
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
    document.addEventListener("keydown", onShortcut);
    return () => {
      desktop.removeEventListener("change", onResize);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("pointerdown", onOutsideAccount);
      document.removeEventListener("focusin", onOutsideAccount);
      document.removeEventListener("keydown", onAccountKeydown);
      document.removeEventListener("keydown", onShortcut);
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
      <Building2 size={16} strokeWidth={1.7} aria-hidden="true" /><span
        >{choice.displayName}{#if companyStatus(choice.status) !== "active"}<small class="workspace-company-stopped"
            >{companyStatusNote(companyStatus(choice.status), t)}</small
          >{/if}</span
      >
      {#if choice.id === company && !platformMode}<Check size={15} aria-hidden="true" />{/if}
    </a>
  {/each}
  {#if switchWaiting}<p class="workspace-company-wait" role="status">{t("กำลังบันทึกอยู่ รอสักครู่แล้วลองอีกครั้ง", "Still saving. Try again in a moment.")}</p>{/if}
{/snippet}

{#snippet sidebar(compact: boolean = false, mobile: boolean = false)}
  <div class="workspace-sidebar-header">
    <!-- The logo goes home (owner, 2026-10-05): the workspace's หน้าหลัก, or the platform overview. -->
    <a
      class="workspace-brand"
      href={homeHref}
      onclick={closeDrawer}
      aria-label={t("ORCA หน้าหลัก", "ORCA home")}
      title={compact ? t("หน้าหลัก", "Home") : undefined}
    >
      <Brand {compact} />
    </a>
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

  {#if data && !compact}
    <!-- The company open now, under the logo, and its switch (W0). -->
    <div class="workspace-company">
      {#if platformMode}
        <span class="workspace-company-name" title={term("platform", t)}>{term("platform", t)}</span>
      {:else if switchable}
        <details class="workspace-company-switch">
          <summary aria-label={t(`บริษัท ${organization} เปลี่ยนบริษัท`, `Company: ${organization}. Switch company`)}>
            <span class="workspace-company-name" title={organization}>{organization}</span>
            <ChevronsUpDown size={14} aria-hidden="true" />
          </summary>
          <div class="workspace-company-menu">
            <small>{t("เปลี่ยนบริษัท", "Switch company")}</small>
            {@render companyLinks()}
          </div>
        </details>
      {:else}
        <span class="workspace-company-name" title={organization}>{organization}</span>
      {/if}
    </div>
  {/if}

  {#if platformSwitch}
    <!-- The ORCA team works in two places: the company open now and the platform. -->
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
          {#if item.soon}
            <!-- Workflows: shown, greyed, not a link until it ships. -->
            <span class="workspace-nav-soon" aria-disabled="true" title={compact ? `${item.label} · ${term("soon", t)}` : undefined}>
              <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span class="workspace-nav-label">{item.label}</span>
              <small class="workspace-nav-aside">{term("soon", t)}</small>
            </span>
          {:else}
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
          {/if}
        {/each}
      </div>
    </nav>
  </div>
  <div class="workspace-sidebar-bottom">
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
        <div class="workspace-account-language"><span>{t("ภาษา", "Language")}</span><LocaleSwitch /></div>
        <a href="/oauth2/sign_out?rd=/"
          ><LogOut size={17} aria-hidden="true" />{term("signOut", t)}</a
        >
      </div>
    </details>
  </div>
{/snippet}

<div
  class="orca orca-app orca-workspace orca-w0"
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
  <!-- A tap on the dimmed page beside the drawer closes it (a phone has no Escape key). -->
  <dialog
    class="workspace-drawer"
    bind:this={drawer}
    onclose={closeAccounts}
    onclick={(event) => {
      if (event.target === drawer) closeDrawer();
    }}
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
      <a class="workspace-mark" href={homeHref} aria-label={t("ORCA หน้าหลัก", "ORCA home")}><Brand compact /></a>
      <button type="button" class="workspace-jump" onclick={() => (jumping = true)} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K">
        <Search size={16} aria-hidden="true" /><span>{term("jumpTo", t)}</span><kbd>⌘K</kbd>
      </button>
      <span class="workspace-topbar-spacer"></span>
      <div class="workspace-header-actions">
        <button
          class="workspace-icon-button"
          disabled={refreshing}
          onclick={onrefresh}
          aria-label={t("อัปเดตข้อมูล", "Refresh data")}
          title={t("อัปเดตข้อมูล", "Refresh data")}
          ><RefreshCw size={17} class={refreshing ? "k-spin" : ""} /></button
        >
        {#if data && !platformMode}
          <!-- The one primary button on every page (W0). The platform's pages have none. -->
          <button type="button" class="k-button primary workspace-create" onclick={() => (creating = true)} aria-haspopup="dialog"
            >{term("create", t)}<ChevronDown size={15} aria-hidden="true" /></button
          >
        {/if}
      </div>
    </header>
    <main class="workspace-main" id="orca-main" tabindex="-1">
      {@render children()}
    </main>
  </div>
  {#if data && !platformMode}<CreateDialog bind:open={creating} {canManage} {skills} />{/if}
  <JumpDialog bind:open={jumping} targets={jumpTargets} />
  <Toast />
</div>
