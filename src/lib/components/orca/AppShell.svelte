<script lang="ts">
  import { goto } from "$app/navigation";
  import { companyHref, companySwitch, currentCompany, DEFAULT_COMPANY, rememberCompany, type OrcaCompanyChoice } from "$lib/orca/company";
  import { companyStatus, companyStatusNote } from "$lib/orca/platform-console";
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { writesInFlight } from "$lib/services/writes";
  import { activeNavigationView, APP_VIEWS, platformHref, showsPlatformSwitch, type PlatformSection } from "$lib/orca/navigation";
  import { hubAsksApproval } from "$lib/orca/approvals";
  import { term } from "$lib/orca/glossary";
  import { createMenu, createShortcut, settingsEntries, workspaceSections, type JumpTarget, type NavIcon, type NavSectionID, type SettingsEntryID } from "$lib/orca/workspace-nav";
  import { createSequence, isJumpShortcut } from "$lib/orca/menu-keys";
  import { createRail, type RailState } from "$lib/orca/rail";
  import {
    memberName,
    memberRole,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  import Brand from "./Brand.svelte";
  import LocaleSwitch from "./LocaleSwitch.svelte";
  import ThemeSwitch from "./ThemeSwitch.svelte";
  import CreateMenu from "./shell/CreateMenu.svelte";
  import JumpDialog from "./shell/JumpDialog.svelte";
  import McpMark from "./shell/McpMark.svelte";
  import PopMenu from "./shell/PopMenu.svelte";
  import Toast from "./ui/Toast.svelte";
  import "./app-workspace.css";
  import "./orca-system.css";
  import "./w0.css";
  import "./w01.css";
  import {
    BookOpenText,
    BotMessageSquare,
    Boxes,
    Building2,
    ChartNoAxesColumn,
    Check,
    ChevronDown,
    ChevronsUpDown,
    CircleQuestionMark,
    CircleUserRound,
    Globe,
    Grid2x2Plus,
    History,
    House,
    Inbox,
    KeyRound,
    LogIn,
    LogOut,
    Menu,
    Pin,
    PinOff,
    RefreshCw,
    Search,
    Settings,
    Shield,
    Users,
    WandSparkles,
    Workflow,
    X,
  } from "@lucide/svelte";
  import { onMount, untrack, type Snippet } from "svelte";

  // The W0.1 shell (approved 2026-10-07, output/orca-w01): a full-width top bar
  // (the company at the left; ＋ สร้าง ▾ and the account at the right) over a
  // 56 px icon rail that opens as a 272 px panel on hover or keyboard focus, and
  // can be pinned. A phone keeps the drawer. Sections: หน้าหลัก · AI · ข้อมูล ·
  // จัดการ, then ช่วยเหลือ and the ORCA mark.
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
    /** The address's section (settings) or the platform section. */
    section?: string | null;
    refreshing: boolean;
    pendingApprovals?: number;
    /** The person's companies; the switcher lists them. */
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
      companyOpen = false;
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
  let drawer: HTMLDialogElement | undefined = $state();
  let creating = $state(false);
  let companyOpen = $state(false);
  let accountOpen = $state(false);
  let jumping = $state(false);
  const currentUser = $derived(data?.members.find((item) => item.id === data?.currentUserID));
  const organization = $derived(data?.organization.displayName || "ORCA");
  const accountName = $derived(currentUser ? memberName(currentUser) : t("บัญชีของคุณ", "Your account"));
  const canManage = $derived(!!data?.canManage);
  // The platform's pages need the default company's operator flag (the
  // platform area always loads that company); the switch to them shows in
  // every company the operator opens.
  const operator = $derived(data?.platformOperator === true);
  const platformSwitch = $derived(showsPlatformSwitch(data));
  const platformMode = $derived(view === "platform" && operator);
  // LINE's writes wait for a manager even in a workspace that runs at once (design §14l).
  const requestsApproval = $derived(!!data?.hubs.some((hub) => hubAsksApproval(hub, data?.connections ?? [])));
  const features = $derived(data?.features);

  // ---------- The rail ----------
  type RailItem = { id: string; label: string; href: string; icon: NavIcon | "platform"; platformIcon?: typeof House; soon?: boolean; count?: number };
  type RailSection = { id: NavSectionID | "platform"; label: string; items: RailItem[] };
  const sectionLabels: Record<NavSectionID, () => string> = { start: () => "", ai: () => term("navAI", t), data: () => term("navData", t), manage: () => term("navManage", t) };
  const itemLabels: Record<string, () => string> = {
    dashboard: () => term("home", t),
    "connect-ai": () => term("myAI", t),
    skills: () => term("skills", t),
    workflows: () => term("workflows", t),
    servers: () => term("programs", t),
    knowledge: () => term("knowledge", t),
    history: () => term("history", t),
    settings: () => term("settings", t),
  };
  const platformItem = (id: PlatformSection, key: Parameters<typeof term>[0], icon: typeof House): RailItem => ({ id: `platform:${id}`, label: term(key, t), href: platformHref(id), icon: "platform", platformIcon: icon });
  const sections = $derived<RailSection[]>(
    platformMode
      ? [{ id: "platform", label: "", items: [
          platformItem("overview", "platformOverview", ChartNoAxesColumn),
          platformItem("companies", "customerCompanies", Building2),
          ...(data?.canReviewPilotRequests ? [platformItem("pilots", "pilotRequests", Inbox)] : []),
          platformItem("signin", "googleSignIn", LogIn),
          platformItem("oauth-apps", "programOAuthApps", KeyRound),
          platformItem("catalog", "programCatalog", Grid2x2Plus),
          platformItem("breakglass", "breakGlass", Shield),
        ] }]
      : workspaceSections({ canManage, features, requestsApproval }).map((navSection) => ({
          id: navSection.id,
          label: sectionLabels[navSection.id](),
          items: navSection.items.map((entry) => ({
            id: entry.id,
            label: itemLabels[entry.id](),
            href: entry.href,
            icon: entry.icon,
            soon: entry.soon,
            // Owners and Admins: approvals waiting for them.
            count: entry.count && canManage ? pendingApprovals : undefined,
          })),
        })),
  );
  const settingsLabels: Record<SettingsEntryID, () => string> = { team: () => term("team", t), workspaces: () => term("workspaces", t), company: () => term("company", t), account: () => term("myAccount", t) };
  const settingsList = $derived(platformMode ? [] : settingsEntries({ canManage }).map((entry) => ({ ...entry, label: settingsLabels[entry.id]() })));
  const activeView = $derived(activeNavigationView(view, section));
  // Which ตั้งค่า sub-item the page is.
  const activeSetting = $derived<SettingsEntryID | "">(
    view === "members" ? "team"
      : ["workspaces", "hub", "new"].includes(view) ? "workspaces"
      : view === "settings" && section === "company" ? "company"
      : view === "settings" && section === "account" ? "account"
      : "",
  );
  // ตั้งค่า ▾ starts open on a settings page, and opens when one is reached.
  let settingsOpen = $state(untrack(() => activeView === "settings"));
  $effect(() => {
    if (activeView === "settings") settingsOpen = true;
  });
  const homeHref = $derived(localeHref(platformMode ? platformHref("overview") : "/app"));
  const icons: Record<NavIcon, typeof House> = {
    home: House,
    "my-ai": BotMessageSquare,
    skills: WandSparkles,
    workflows: Workflow,
    programs: House,
    knowledge: BookOpenText,
    history: History,
    settings: Settings,
    team: Users,
    workspaces: Boxes,
    company: Building2,
    account: CircleUserRound,
    help: CircleQuestionMark,
  };

  const storage = () => {
    try {
      return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
      return undefined;
    }
  };
  let rail = $state<RailState>({ open: false, pinned: false });
  const railControl = createRail({ storage, onchange: (state) => (rail = state) });
  let railElement: HTMLElement | undefined = $state();
  // Tooltips on the collapsed rail: the item's name beside it.
  let tip = $state<{ text: string; top: number }>();
  function showTip(event: Event) {
    if (rail.open) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-label]");
    if (!target || !railElement?.contains(target)) return;
    const box = target.getBoundingClientRect();
    tip = { text: target.dataset.label ?? "", top: box.top + box.height / 2 };
  }
  function hideTip() {
    tip = undefined;
  }
  $effect(() => {
    if (rail.open) tip = undefined;
  });
  function onRailFocusIn(event: FocusEvent) {
    const target = event.target as Element | null;
    let visible = false;
    try {
      visible = !!target?.matches(":focus-visible");
    } catch {
      visible = false;
    }
    railControl.focusIn(visible);
    if (!visible) return;
    showTip(event);
  }
  function onRailFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && railElement?.contains(next)) return;
    hideTip();
    railControl.focusOut();
  }
  function onRailKey(event: KeyboardEvent) {
    if (event.key === "Escape" && railControl.escape()) {
      event.preventDefault();
      // The tooltip stays for a keyboard user (notes.md).
      showTip(event);
    }
  }

  // ---------- The สร้าง menu and the shortcuts ----------
  const views = APP_VIEWS as readonly string[];
  const createGroups = $derived(data && !platformMode ? createMenu({ canManage, features, views }) : []);
  const sequence = createSequence();
  function onShortcut(event: KeyboardEvent) {
    if (isJumpShortcut(event)) {
      event.preventDefault();
      closeDrawer();
      jumping = true;
      return;
    }
    if (creating || companyOpen || accountOpen || jumping || drawer?.open || !createGroups.length) {
      sequence.reset();
      return;
    }
    const read = sequence.read(event);
    if (read.action !== "pick") return;
    const item = createShortcut(createGroups, read.code);
    if (!item) return;
    event.preventDefault();
    void goto(localeHref(item.href));
  }

  // ไปที่…: the pages in the menu, ตั้งค่า's tabs, and the programs and workspaces this viewer can open.
  const jumpTargets = $derived.by<JumpTarget[]>(() => {
    const pages = t("หน้า", "Page");
    const targets: JumpTarget[] = sections
      .flatMap((railSection) => railSection.items)
      .filter((item) => !item.soon)
      .map((item) => ({ id: `page:${item.id}`, label: item.label, href: item.href, group: pages }));
    targets.push({ id: "page:help", label: term("help", t), href: "/app?view=help", group: pages });
    if (platformMode) return targets;
    for (const entry of settingsList) targets.push({ id: `page:${entry.id}`, label: entry.label, href: entry.href, group: pages });
    if (canManage)
      for (const connection of data?.connections ?? [])
        if (!connection.archivedAt && !connection.deletedAt)
          targets.push({ id: `program:${connection.id}`, label: connection.name, href: `/app?view=servers&connection=${encodeURIComponent(connection.id)}`, group: term("program", t) });
    for (const hub of data?.hubs ?? [])
      if (hub.status !== "archived" && hub.status !== "deleted")
        targets.push({ id: `hub:${hub.id}`, label: hub.name, href: `/app?view=hub&hub=${encodeURIComponent(hub.id)}`, group: term("workspaces", t) });
    return targets;
  });
  const accountInitial = $derived((accountName.trim()[0] || "O").toLocaleUpperCase());
  // One company: it is still listed, with its check, so the menu says where you are.
  const companyChoices = $derived<Pick<OrcaCompanyChoice, "id" | "displayName" | "status">[]>(
    companies.length ? companies : data ? [{ id: company, displayName: organization }] : [],
  );
  const companyInitial = $derived(((platformMode ? "ORCA" : organization).trim()[0] || "O").toLocaleUpperCase());
  // The platform always opens the default company; from another company that is a new page.
  const platformReload = $derived(company !== DEFAULT_COMPANY);
  function closeDrawer() {
    drawer?.close();
  }
  onMount(() => {
    const desktop = window.matchMedia("(min-width: 821px)");
    const onResize = () => {
      if (desktop.matches) closeDrawer();
    };
    desktop.addEventListener("change", onResize);
    document.addEventListener("keydown", onShortcut);
    return () => {
      desktop.removeEventListener("change", onResize);
      document.removeEventListener("keydown", onShortcut);
      railControl.dispose();
    };
  });
  $effect(() => {
    const currentView = view;
    if (currentView) closeDrawer();
  });
</script>

{#snippet itemIcon(item: RailItem)}
  {#if item.icon === "platform" && item.platformIcon}<item.platformIcon size={20} strokeWidth={1.75} aria-hidden="true" />
  {:else if item.icon === "programs"}<McpMark size={20} />
  {:else if item.icon !== "platform"}{@const Icon = icons[item.icon]}<Icon size={20} strokeWidth={1.75} aria-hidden="true" />{/if}
{/snippet}

{#snippet railBody(mobile: boolean)}
  <div class="w1-rail-scroll">
    <button type="button" class="w1-item w1-jump" data-label={`${term("jumpTo", t)} ⌘K`} aria-keyshortcuts="Meta+K Control+K" onclick={() => { closeDrawer(); jumping = true; }}
      ><Search size={20} strokeWidth={1.75} aria-hidden="true" /><span class="w1-label">{term("jumpTo", t)}</span><kbd>⌘K</kbd></button
    >
    <nav class="w1-nav" aria-label={platformMode ? term("platform", t) : t("เมนูหลัก", "Main navigation")}>
      {#each sections as railSection (railSection.id)}
        {#if railSection.label}<div class="w1-sec" role="presentation"><span>{railSection.label}</span></div>{/if}
        {#each railSection.items as item (item.id)}
          {#if item.soon}
            <!-- Workflows: shown, greyed, not a link until it ships. -->
            <span class="w1-item w1-soon" aria-disabled="true" data-label={`${item.label} · ${term("soon", t)}`}
              >{@render itemIcon(item)}<span class="w1-label">{item.label}</span><small class="w1-aside">{term("soon", t)}</small></span
            >
          {:else if item.id === "settings"}
            <div class="w1-group" class:open={settingsOpen}>
              <a class="w1-item" class:active={activeView === "settings"} href={localeHref(item.href)} onclick={closeDrawer}
                aria-current={activeView === "settings" && !activeSetting ? "page" : undefined} data-label={item.label}
                >{@render itemIcon(item)}<span class="w1-label">{item.label}</span></a
              >
              <button type="button" class="w1-caret" aria-expanded={settingsOpen} aria-controls={mobile ? "w1-settings-drawer" : "w1-settings"}
                aria-label={t(`${item.label}: แสดงรายการย่อย`, `${item.label}: show its pages`)} onclick={() => (settingsOpen = !settingsOpen)}
                ><ChevronDown size={16} aria-hidden="true" /></button
              >
            </div>
            {#if settingsOpen}
              <div class="w1-sub" id={mobile ? "w1-settings-drawer" : "w1-settings"}>
                {#each settingsList as entry (entry.id)}
                  {@const Icon = icons[entry.icon]}
                  <a class="w1-item w1-subitem" class:active={activeSetting === entry.id} href={localeHref(entry.href)} onclick={closeDrawer}
                    aria-current={activeSetting === entry.id ? "page" : undefined} data-label={entry.label}
                    ><Icon size={18} strokeWidth={1.75} aria-hidden="true" /><span class="w1-label">{entry.label}</span></a
                  >
                {/each}
              </div>
            {/if}
          {:else}
            <a
              class="w1-item"
              class:active={activeView === item.id}
              href={localeHref(item.href)}
              onclick={closeDrawer}
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={item.count ? t(`${item.label} รออนุมัติ ${item.count} รายการ`, `${item.label}, ${item.count} waiting`) : undefined}
              data-label={item.label}
              >{@render itemIcon(item)}<span class="w1-label">{item.label}</span>{#if item.count}<span class="w1-count" aria-hidden="true">{item.count > 99 ? "99+" : item.count}</span>{/if}</a
            >
          {/if}
        {/each}
      {/each}
    </nav>
  </div>
  <div class="w1-rail-foot">
    <a class="w1-item" href={localeHref("/app?view=help")} onclick={closeDrawer} class:active={activeView === "help"} aria-current={activeView === "help" ? "page" : undefined} data-label={term("help", t)}
      ><CircleQuestionMark size={20} strokeWidth={1.75} aria-hidden="true" /><span class="w1-label">{term("help", t)}</span></a
    >
    <div class="w1-brand-row">
      <!-- The official ORCA mark (Brand.svelte): the mark alone on the rail, the logo when open. -->
      <a class="w1-brand" href={homeHref} onclick={closeDrawer} aria-label={t("ORCA หน้าหลัก", "ORCA home")}>
        <span class="w1-brand-mark"><Brand compact /></span><span class="w1-brand-full"><Brand /></span>
      </a>
      {#if !mobile}
        <button type="button" class="w1-pin" aria-pressed={rail.pinned} aria-label={rail.pinned ? term("unpinMenu", t) : term("pinMenu", t)}
          title={rail.pinned ? term("unpinMenu", t) : term("pinMenu", t)} onclick={() => railControl.togglePin()}
          >{#if rail.pinned}<PinOff size={16} aria-hidden="true" />{:else}<Pin size={16} aria-hidden="true" />{/if}</button
        >
      {/if}
    </div>
  </div>
{/snippet}

{#snippet companyLinks(close: () => void)}
  {#each companyChoices as choice (choice.id)}
    <!-- A new page: nothing from this company carries over to the next. -->
    <a
      class="w1-menu-row"
      role="menuitem"
      tabindex="-1"
      href={localeHref(companyHref(choice.id))}
      data-sveltekit-reload
      aria-current={choice.id === company && !platformMode ? "true" : undefined}
      onclick={(event) => { switchCompany(event, choice.id); if (!event.defaultPrevented) close(); }}
    >
      <span class="w1-initial" aria-hidden="true">{(choice.displayName.trim()[0] || "O").toLocaleUpperCase()}</span><span class="w1-menu-text"
        >{choice.displayName}{#if companyStatus(choice.status) !== "active"}<small class="workspace-company-stopped">{companyStatusNote(companyStatus(choice.status), t)}</small>{/if}</span
      >
      {#if choice.id === company && !platformMode}<Check size={15} aria-hidden="true" />{/if}
    </a>
  {/each}
  {#if switchWaiting}<p class="workspace-company-wait" role="status">{t("กำลังบันทึกอยู่ รอสักครู่แล้วลองอีกครั้ง", "Still saving. Try again in a moment.")}</p>{/if}
{/snippet}

<div
  class="orca orca-app orca-workspace orca-w0 orca-w01"
  class:rail-open={rail.open}
  class:rail-pinned={rail.pinned}
  lang={orcaLocale.value}
>
  <a href="#orca-main" class="k-skip">{t("ข้ามไปยังเนื้อหา", "Skip to content")}</a>
  <header class="w1-top">
    <button class="w1-icon-button w1-menu" onclick={() => drawer?.showModal()} aria-label={t("เปิดเมนู", "Open menu")} aria-haspopup="dialog"><Menu size={22} /></button>
    {#if data}
      <!-- The company at the top left (W0.1): no plan label for customers. -->
      <PopMenu id="orca-company-menu" label={t("เปลี่ยนบริษัท", "Switch company")} buttonClass="w1-company" kind="menu" align="left" bind:open={companyOpen}
        buttonLabel={platformMode ? term("platform", t) : t(`บริษัท ${organization} เปลี่ยนบริษัท`, `Company: ${organization}. Switch company`)}>
        {#snippet button()}<span class="w1-initial" aria-hidden="true">{companyInitial}</span><span class="w1-company-name" title={platformMode ? term("platform", t) : organization}
            >{platformMode ? term("platform", t) : organization}</span
          ><ChevronsUpDown size={14} aria-hidden="true" />{/snippet}
        {#snippet children(close)}
          <p class="w1-menu-label">{t("บริษัทของคุณ", "Your companies")}</p>
          {@render companyLinks(close)}
          {#if platformSwitch}
            <!-- The ORCA team works in two places: the company open now and the platform. -->
            <div class="w1-menu-sep" role="separator"></div>
            {#if platformMode}
              <a class="w1-menu-row" role="menuitem" tabindex="-1" href={localeHref("/app")} onclick={close}><Building2 size={16} aria-hidden="true" /><span class="w1-menu-text">{term("companyMode", t)}</span></a>
            {:else if platformReload}
              <a class="w1-menu-row" role="menuitem" tabindex="-1" href={localeHref(platformHref("overview"))} data-sveltekit-reload><Globe size={16} aria-hidden="true" /><span class="w1-menu-text">{term("platform", t)}</span></a>
            {:else}
              <a class="w1-menu-row" role="menuitem" tabindex="-1" href={localeHref(platformHref("overview"))} onclick={close}><Globe size={16} aria-hidden="true" /><span class="w1-menu-text">{term("platform", t)}</span></a>
            {/if}
          {/if}
        {/snippet}
      </PopMenu>
    {/if}
    <span class="w1-top-spacer"></span>
    <button class="w1-icon-button w1-refresh" disabled={refreshing} onclick={onrefresh} aria-label={t("อัปเดตข้อมูล", "Refresh data")} title={t("อัปเดตข้อมูล", "Refresh data")}
      ><RefreshCw size={17} class={refreshing ? "k-spin" : ""} /></button
    >
    {#if data && !platformMode && createGroups.length}
      <!-- The one primary button on every page. The platform's pages have none. -->
      <CreateMenu groups={createGroups} bind:open={creating} />
    {/if}
    <PopMenu id="orca-account-menu" label={t("บัญชี", "Account")} buttonClass="w1-avatar-button" kind="panel" align="right" bind:open={accountOpen}
      buttonLabel={t(`บัญชี ${accountName}`, `Account: ${accountName}`)}>
      {#snippet button()}<span class="w1-avatar" aria-hidden="true">{accountInitial}</span>{/snippet}
      {#snippet children(close)}
        <div class="w1-who">
          <span class="w1-avatar" aria-hidden="true">{accountInitial}</span>
          <span><strong>{accountName}</strong>{#if currentUser?.email}<small>{currentUser.email}</small>{/if}<small
              >{platformMode ? term("orcaTeam", t) : currentUser ? memberRole(currentUser.role) : t("กำลังโหลด…", "Loading…")}</small
            ></span
          >
        </div>
        <div class="w1-menu-sep" role="separator"></div>
        <a class="w1-menu-row" href={localeHref("/app?view=settings&section=account")} onclick={close}><CircleUserRound size={16} aria-hidden="true" /><span class="w1-menu-text">{term("myAccount", t)}</span></a>
        <div class="w1-menu-control"><ThemeSwitch compact label /></div>
        <div class="w1-menu-control workspace-account-language"><span>{t("ภาษา", "Language")}</span><LocaleSwitch /></div>
        <div class="w1-menu-sep" role="separator"></div>
        <a class="w1-menu-row" href="/oauth2/sign_out?rd=/"><LogOut size={16} aria-hidden="true" /><span class="w1-menu-text">{term("signOut", t)}</span></a>
      {/snippet}
    </PopMenu>
  </header>

  <!-- The listeners only open and close the panel; every item inside is its own link or button. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside
    class="w1-rail"
    class:open={rail.open}
    class:pinned={rail.pinned}
    bind:this={railElement}
    aria-label={t("เมนู ORCA", "ORCA menu")}
    onpointerenter={() => railControl.pointerEnter()}
    onpointerleave={() => { hideTip(); railControl.pointerLeave(); }}
    onpointerover={showTip}
    onfocusin={onRailFocusIn}
    onfocusout={onRailFocusOut}
    onkeydown={onRailKey}
  >
    {@render railBody(false)}
  </aside>
  {#if tip && !rail.open}<div class="w1-tip" role="tooltip" style:top="{tip.top}px">{tip.text}</div>{/if}

  <!-- A phone: the same contents as a drawer; a tap on the dimmed page beside it closes it. -->
  <dialog
    class="workspace-drawer w1-drawer"
    bind:this={drawer}
    onclick={(event) => {
      if (event.target === drawer) closeDrawer();
    }}
    aria-label={t("เมนู ORCA", "ORCA menu")}
  >
    <button class="workspace-close" onclick={closeDrawer} aria-label={t("ปิดเมนู", "Close menu")}><X size={22} /></button>
    {@render railBody(true)}
  </dialog>

  <div class="w1-stage">
    <main class="workspace-main" id="orca-main" tabindex="-1">
      {@render children()}
    </main>
  </div>
  <JumpDialog bind:open={jumping} targets={jumpTargets} />
  <Toast />
</div>
