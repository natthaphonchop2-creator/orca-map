<script lang="ts">
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { activeNavigationView } from "$lib/orca/navigation";
  import {
    memberName,
    memberRole,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  import Brand from "./Brand.svelte";
  import LocaleSwitch from "./LocaleSwitch.svelte";
  import "./app-workspace.css";
  import "./orca-system.css";
  import {
    Activity,
    BookOpen,
    Boxes,
    Building2,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    CircleHelp,
    House,
    KeyRound,
    KeySquare,
    LayoutGrid,
    LockKeyhole,
    LogOut,
    Menu,
    Plug,
    RefreshCw,
    Settings,
    ShieldCheck,
    Sparkles,
    UserCheck,
    Users,
    X,
  } from "@lucide/svelte";
  import { onMount, type Snippet } from "svelte";

  let {
    data,
    view,
    refreshing,
    onrefresh,
    children,
  }: {
    data?: OrcaBootstrap;
    view: string;
    refreshing: boolean;
    onrefresh: () => void;
    children: Snippet;
  } = $props();
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
  // The menu follows ORCA's three pillars: connect systems, company knowledge, and
  // team access with an audit trail. Planned pages stay reachable by URL but are not
  // advertised here, and members only see what they can use.
  const canManage = $derived(!!data?.canManage);
  const navigationGroups = $derived([
    {
      id: "main", label: "",
      items: [{ id: "dashboard", label: t("หน้าหลัก", "Home"), href: "/app", icon: House }],
    },
    {
      id: "connect", label: t("เชื่อมต่อ", "Connect"),
      items: [
        ...(canManage
          ? [
              { id: "servers", label: t("ระบบที่เชื่อมต่อ", "Connected systems"), href: "/app?view=servers", icon: Plug },
              { id: "catalog", label: t("เพิ่มระบบใหม่", "Add a system"), href: "/app?view=catalog", icon: LayoutGrid },
            ]
          : [{ id: "accounts", label: t("บัญชีที่เชื่อมไว้", "My accounts"), href: "/app?view=accounts", icon: KeyRound }]),
        { id: "workspaces", label: t("พื้นที่ทำงาน AI", "AI workspaces"), href: "/app?view=workspaces", icon: Boxes },
        { id: "knowledge", label: t("คลังความรู้", "Knowledge"), href: "/app?view=knowledge", icon: BookOpen },
      ],
    },
    ...(canManage
      ? [{
          id: "team", label: t("ทีมและการควบคุม", "Team & control"),
          items: [
            { id: "members", label: t("สมาชิกและแผนก", "Members & departments"), href: "/app?view=members", icon: Users },
            { id: "connected-users", label: t("ผู้ใช้ที่เชื่อมบัญชี", "Connected users"), href: "/app?view=connected-users", icon: UserCheck },
            { id: "executions", label: t("ประวัติการใช้งาน", "Activity"), href: "/app?view=executions", icon: Activity },
          ],
        }]
      : []),
    {
      id: "setup", label: t("ตั้งค่าระบบ", "Setup"),
      items: [
        { id: "api-keys", label: t("เชื่อม AI กับ ORCA", "Connect AI to ORCA"), href: "/app?view=api-keys", icon: Sparkles },
        ...(canManage
          ? [
              { id: "connected-apps", label: t("แอปเชื่อมบัญชี (OAuth)", "OAuth apps"), href: "/app?view=connected-apps", icon: KeySquare },
              { id: "secrets", label: t("ข้อมูลลับ", "Secrets"), href: "/app?view=secrets", icon: LockKeyhole },
              { id: "organization", label: t("ข้อมูลองค์กร", "Organization"), href: "/app?view=organization", icon: Building2 },
              { id: "user-sources", label: t("การเข้าสู่ระบบองค์กร", "Sign-in sources"), href: "/app?view=user-sources", icon: ShieldCheck },
            ]
          : []),
      ],
    },
  ]);
  const utilityNavigation = $derived([
    { id: "settings", label: t("ตั้งค่า", "Settings"), href: "/app?view=settings", icon: Settings },
    { id: "help", label: t("ช่วยเหลือ", "Help"), href: "/app?view=help", icon: CircleHelp },
  ]);
  const activeView = $derived(activeNavigationView(view));
  const currentPage = $derived(
    view === "new"
      ? t("สร้างพื้นที่ทำงาน AI", "New AI workspace")
      : view === "accounts"
        ? t("บัญชีที่เชื่อมไว้", "My accounts")
        : [
            ...navigationGroups.flatMap((group) => group.items),
            ...utilityNavigation,
          ].find((item) => item.id === activeView)?.label ||
          (view === "catalog"
            ? t("เพิ่มระบบใหม่", "Add a system")
            : t("หน้าหลัก", "Home")),
  );
  const accountInitial = $derived(
    (accountName.trim()[0] || "O").toLocaleUpperCase(),
  );
  function closeAccounts() {
    shell
      ?.querySelectorAll<HTMLDetailsElement>(".workspace-account[open]")
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
    const account = event.target.closest<HTMLDetailsElement>(
      ".workspace-account[open]",
    );
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
        ?.querySelectorAll<HTMLDetailsElement>(".workspace-account[open]")
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

  <div
    class="workspace-sidebar-scroll"
    id={mobile ? undefined : "workspace-desktop-navigation"}
  >
    <nav class="workspace-nav" aria-label={t("เมนูหลัก", "Main navigation")}>
      {#each navigationGroups as group (group.id)}
        <div class="workspace-nav-group">
          {#if group.label}
            <p class="workspace-nav-heading">{group.label}</p>
          {/if}
          {#each group.items as item (item.id)}
            <a
              href={localeHref(item.href)}
              onclick={closeDrawer}
              class:active={activeView === item.id}
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
            >
              <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span class="workspace-nav-label">{item.label}</span>
            </a>
          {/each}
        </div>
      {/each}
    </nav>
  </div>
  <div class="workspace-sidebar-bottom">
    <nav
      class="workspace-nav"
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
          <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
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
            >{currentUser
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
        <a
          href={localeHref("/app?view=accounts")}
          onclick={closeDrawer}
          aria-current={view === "accounts" ? "page" : undefined}
          ><KeyRound size={17} aria-hidden="true" />{t(
            "บัญชีที่เชื่อมไว้",
            "My accounts",
          )}</a
        >
        <a
          href={localeHref("/app?view=settings&section=preferences")}
          onclick={closeDrawer}
          ><Settings size={17} aria-hidden="true" />{t(
            "การตั้งค่าบัญชี",
            "Account settings",
          )}</a
        >
        <a href="/oauth2/sign_out?rd=/"
          ><LogOut size={17} aria-hidden="true" />{t(
            "ออกจากระบบ",
            "Sign out",
          )}</a
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
          <Building2 size={16} strokeWidth={1.6} aria-hidden="true" />
          <span title={organization}>{organization}</span>
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
</div>
