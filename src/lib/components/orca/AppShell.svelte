<script lang="ts">
  import { goto } from "$app/navigation";
  import { companyHref, companySwitch, currentCompany, DEFAULT_COMPANY, rememberCompany, type OrcaCompanyChoice } from "$lib/orca/company";
  import { companyStatus, companyStatusNote, platformCompanyHref } from "$lib/orca/platform-console";
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { writesInFlight } from "$lib/services/writes";
  import { activeNavigationView, APP_VIEWS, platformHref, showsPlatformSwitch, type PlatformSection } from "$lib/orca/navigation";
  import { hubAsksApproval } from "$lib/orca/approvals";
  import { term } from "$lib/orca/glossary";
  import { createMenu, createShortcut, menuFeatures, settingsEntries, workspaceSections, type CreateItem, type NavIcon, type NavSectionID, type SettingsEntryID } from "$lib/orca/workspace-nav";
  import { buildJumpTargets, usableHubIDs, type JumpGroup, type JumpTarget } from "$lib/orca/jump-targets";
  import { jumpCache, keepWorkspaces, warmJumpCache } from "$lib/orca/jump-cache.svelte";
  import { getHttpStatusCode } from "$lib/errors";
  import { OrcaLibraryService } from "$lib/services/orca-library";
  import { OrcaDocTemplateService } from "$lib/services/orca-doc-templates";
  import { createSequence, isJumpShortcut } from "$lib/orca/menu-keys";
  import { createRail, railFocusTarget, type RailState } from "$lib/orca/rail";
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
  import "./w02.css";
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
  const features = $derived(menuFeatures(data?.features));

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
  let railElement: HTMLElement | undefined = $state();
  let rail = $state<RailState>({ open: false, pinned: false });
  // Before the panel collapses, focus leaves a control that hides on the
  // 56 px rail (ตั้งค่า's caret and pages, the pin) for one that stays.
  function keepFocusVisible() {
    if (typeof document === "undefined") return;
    railFocusTarget(document.activeElement as HTMLElement | null, railElement)?.focus();
  }
  const railControl = createRail({
    storage,
    onchange: (state) => {
      const closing = rail.open && !state.open;
      // The state first: moving focus fires focusin, which may open it again.
      rail = state;
      if (closing) keepFocusVisible();
    },
  });
  // Tooltips on the collapsed rail: the item's name beside it.
  let tip = $state<{ text: string; top: number }>();
  function tipFor(element: Element | null | undefined) {
    if (rail.open) return;
    const target = element?.closest<HTMLElement>("[data-label]");
    if (!target || !railElement?.contains(target)) return;
    const box = target.getBoundingClientRect();
    tip = { text: target.dataset.label ?? "", top: box.top + box.height / 2 };
  }
  function showTip(event: Event) {
    tipFor(event.target as Element | null);
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
    // A dialog or a menu above the rail closes first, one layer per press (Codex W0.1 round 2, NOTE 2):
    // a menu opened with the pointer can leave focus in the rail.
    if (event.key === "Escape" && !layerAboveRail() && railControl.escape()) {
      event.preventDefault();
      // The tooltip stays for a keyboard user (notes.md), on the control focus is on now.
      tipFor(document.activeElement);
    }
  }

  // ---------- The สร้าง menu and the shortcuts ----------
  const views = APP_VIEWS as readonly string[];
  // Skills: managers, or a member a manager allowed (bootstrap canCreateSkills, which no server sends yet).
  const createGroups = $derived(data && !platformMode ? createMenu({ canManage, canCreateSkills: data.canCreateSkills === true, features, views }) : []);
  const sequence = createSequence();
  const menuOpen = () => creating || companyOpen || accountOpen;
  // Esc's layers above the rail: a dialog (ไปที่…, the phone drawer, any other), then a menu.
  function layerAboveRail() {
    return jumping || !!drawer?.open || !!document.querySelector("dialog[open]") || menuOpen();
  }
  // ⌘K from a row of an open menu: the row goes away with the menu, so the
  // menu's own button is where focus returns when ไปที่… closes. The phone
  // sheet is a modal dialog: it closes first, or the button behind it is still
  // inert and cannot take focus (Codex W0.1 round 2, NOTE 3).
  function leaveMenu() {
    const menu = (document.activeElement as Element | null)?.closest(".pm");
    const trigger = menu?.querySelector<HTMLElement>(":scope > button");
    menu?.querySelector<HTMLDialogElement>("dialog[open]")?.close();
    creating = companyOpen = accountOpen = false;
    trigger?.focus();
  }
  function onShortcut(event: KeyboardEvent) {
    if (isJumpShortcut(event)) {
      event.preventDefault();
      leaveMenu();
      closeDrawer();
      jumping = true;
      return;
    }
    // Esc closes the topmost layer, one per press: a dialog (its own cancel),
    // then a menu (PopMenu's own listener), then the rail opened by hover.
    if (event.key === "Escape") {
      if (event.defaultPrevented || layerAboveRail()) return;
      if (railControl.escape()) event.preventDefault();
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

  // ไปที่… (ค้นหา…, W0.2): the pages, ตั้งค่า's tabs, the สร้าง actions, and the programs,
  // workspaces, people, knowledge, templates and companies this viewer can already open,
  // from what the page holds (no new requests). jump-targets.ts builds and matches them.
  const createLabels: Record<CreateItem["id"], () => string> = {
    workspace: () => term("createWorkspace", t),
    program: () => term("addProgram", t),
    workflow: () => "Workflow",
    skill: () => "Skill",
    agent: () => term("orcaAgent", t),
    knowledge: () => term("createKnowledge", t),
    template: () => term("docTemplate", t),
    ai: () => term("connectAI", t),
    invite: () => term("inviteMember", t),
    account: () => term("companyAccount", t),
  };
  // Words a row also answers to: "สร้าง", and what people type for it.
  const createWords: Partial<Record<CreateItem["id"], string>> = {
    workspace: "workspace ใหม่",
    program: "เชื่อม เพิ่ม connect add program โปรแกรม",
    knowledge: "เพิ่ม ความรู้ add",
    template: "template excel",
    ai: "เชื่อม connect claude chatgpt",
    invite: "เชิญ invite member คน",
    account: "บัญชีกลาง company account",
  };
  const jumpGroupLabels: Record<JumpGroup, () => string> = {
    action: () => term("create", t),
    page: () => t("หน้า", "Pages"),
    setting: () => term("settings", t),
    program: () => term("programs", t),
    workspace: () => term("workspaces", t),
    person: () => term("members", t),
    knowledge: () => term("knowledge", t),
    template: () => term("docTemplate", t),
    company: () => term("company", t),
  };
  const jumpGroupLabel = (group: JumpGroup) => jumpGroupLabels[group]();
  const hubName = (id: string) => data?.hubs?.find((hub) => hub?.id === id)?.name ?? "";
  const jumpTargets = $derived.by<JumpTarget[]>(() => {
    try {
      return buildJumpTargets({
        platformMode,
        canManage,
        pages: [
          ...sections.flatMap((railSection) => railSection.items),
          { id: "help", label: term("help", t), href: "/app?view=help" },
        ],
        settings: settingsList,
        actions: createGroups.flat().map((item) => ({
          id: item.id,
          label: createLabels[item.id](),
          href: item.href,
          soon: item.soon,
          keywords: `${term("create", t)} ${createWords[item.id] ?? ""}`,
        })),
        connections: data?.connections,
        hubs: data?.hubs,
        members: data?.members,
        memberName: (member: Parameters<typeof memberName>[0]) => memberName(member),
        usableHubIDs: usableHubs,
        knowledge: jumpCache.knowledge.map((item) => ({ ...item, hubName: hubName(item.hubID) })),
        templates: features?.docTemplates ? jumpCache.templates.map((item) => ({ ...item, hubName: hubName(item.hubID) })) : [],
        // The platform: its customer companies as its pages listed them; a company: the switcher's.
        companies: platformMode && jumpCache.companies.length ? jumpCache.companies : companies,
        currentCompany: company,
        platformCompanyHref: (id) => platformCompanyHref(id),
        companyHref: (id) => companyHref(id),
      });
    } catch {
      // A field the live bootstrap left out must never take the search down: the pages at least.
      return sections.flatMap((railSection) => railSection.items).filter((item) => !item.soon).map((item) => ({ id: `page:${item.id}`, label: item.label, href: item.href, group: "page" as const }));
    }
  });
  const jumpPlaceholder = $derived(
    platformMode ? t("ค้นหาหน้า หรือบริษัทลูกค้า…", "Search pages or customer companies…")
      : canManage ? t("ค้นหาหน้า โปรแกรม คน หรือความรู้…", "Search pages, programs, people or knowledge…")
      : t("ค้นหาหน้า พื้นที่ทำงาน หรือความรู้…", "Search pages, workspaces or knowledge…"),
  );
  const jumpEmptyHint = $derived(
    platformMode ? t("ลองค้นชื่อหน้า หรือชื่อบริษัท", "Try a page or a company name")
      : canManage ? t("ลองค้นชื่อหน้า โปรแกรม คน หรือความรู้", "Try a page, a program, a person or knowledge")
      : t("ลองค้นชื่อหน้า พื้นที่ทำงาน หรือความรู้", "Try a page, a workspace or knowledge"),
  );
  // The workspaces whose library this viewer reads now. Whenever the bootstrap
  // changes, the titles of any other workspace leave the search at once (Codex
  // W0.2 round 1, MAJOR 1).
  const usableHubs = $derived(usableHubIDs(data?.hubs, data?.currentUserID));
  $effect(() => {
    const ids = usableHubs;
    untrack(() => keepWorkspaces(ids));
  });
  // The first ค้นหา… of the page loads the usable workspaces' titles quietly, so a
  // cold search finds knowledge too (W0.2 visual sweep). Typing never waits for it.
  $effect(() => {
    if (!jumping || platformMode || !data) return;
    const ids = usableHubs;
    const templates = features?.docTemplates === true;
    untrack(() => {
      void warmJumpCache({
        hubIDs: ids,
        templates,
        loadLibrary: (id) => OrcaLibraryService.load(id),
        loadTemplates: (id) => OrcaDocTemplateService.list(id),
        status: (cause) => getHttpStatusCode(cause) ?? undefined,
        usable: (id) => usableHubs.includes(id),
      });
    });
  });
  // Another company from the search: the same guard as the switcher (a save in flight waits).
  function pickJump(target: JumpTarget, event: MouseEvent) {
    if (target.group !== "company" || !target.reload) return;
    switchCompany(event, target.id.slice("company:".length));
    if (!event.defaultPrevented) return;
    jumping = false;
    // A save still in flight: the company menu says so (its note), as when switching there.
    if (switchWaiting) companyOpen = true;
  }
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
  // In-page links (#…, the skip link, a form's error list) glide to their place unless
  // reduced motion is asked for (W0.2). The page itself keeps instant scrolling, so a page
  // change still starts at the top at once (SvelteKit scrolls the window on navigation).
  function onAnchorClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href^='#']");
    const id = link?.getAttribute("href")?.slice(1);
    if (!link || !id) return;
    const target = document.getElementById(decodeURIComponent(id));
    if (!target) return;
    event.preventDefault();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }
  onMount(() => {
    const desktop = window.matchMedia("(min-width: 821px)");
    const onResize = () => {
      if (desktop.matches) closeDrawer();
    };
    desktop.addEventListener("change", onResize);
    document.addEventListener("keydown", onShortcut);
    document.addEventListener("click", onAnchorClick);
    return () => {
      desktop.removeEventListener("change", onResize);
      document.removeEventListener("keydown", onShortcut);
      document.removeEventListener("click", onAnchorClick);
      railControl.dispose();
    };
  });
  $effect(() => {
    const currentView = view;
    if (currentView) closeDrawer();
  });
</script>

{#snippet itemIcon(item: RailItem)}
  {#if item.icon === "platform" && item.platformIcon}<item.platformIcon size={18} strokeWidth={1.75} aria-hidden="true" />
  {:else if item.icon === "programs"}<McpMark size={18} />
  {:else if item.icon !== "platform"}{@const Icon = icons[item.icon]}<Icon size={18} strokeWidth={1.75} aria-hidden="true" />{/if}
{/snippet}

{#snippet railBody(mobile: boolean)}
  <div class="w1-rail-scroll">
    <!-- ค้นหา… (W0.2): an icon on the rail, a search field in the open panel; it opens ไปที่… either way. -->
    <button type="button" class="w1-item w1-jump" data-label={`${t("ค้นหา", "Search")} ⌘K`} aria-label={t("ค้นหา", "Search")} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" onclick={() => { closeDrawer(); jumping = true; }}
      ><Search size={18} strokeWidth={1.75} aria-hidden="true" /><span class="w1-label">{t("ค้นหา…", "Search…")}</span><span class="w1-jump-hint" aria-hidden="true">⌘K</span></button
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
                    ><Icon size={16} strokeWidth={1.75} aria-hidden="true" /><span class="w1-label">{entry.label}</span></a
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
      ><CircleQuestionMark size={18} strokeWidth={1.75} aria-hidden="true" /><span class="w1-label">{term("help", t)}</span></a
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
    <button class="w1-icon-button w1-menu" onclick={() => drawer?.showModal()} aria-label={t("เปิดเมนู", "Open menu")} aria-haspopup="dialog"><Menu size={20} /></button>
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
      ><RefreshCw size={16} class={refreshing ? "k-spin" : ""} /></button
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
  <JumpDialog bind:open={jumping} targets={jumpTargets} groupLabel={jumpGroupLabel} placeholder={jumpPlaceholder} emptyHint={jumpEmptyHint} loading={jumpCache.loading && !platformMode} onpick={pickJump} />
  <Toast />
</div>
