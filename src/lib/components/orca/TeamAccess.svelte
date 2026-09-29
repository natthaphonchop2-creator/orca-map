<script lang="ts">
  import { gatewayHasMember } from '$lib/orca/gateway-sources';
  import { beforeNavigate } from "$app/navigation";
  import { organizationRole } from "$lib/orca/member-access";
  import {
    OrcaLibraryService,
    type LibraryDepartment,
  } from "$lib/services/orca-library";
  import TeamLifecycleActions from "./TeamLifecycleActions.svelte";
  import LibraryDepartments from "./LibraryDepartments.svelte";
  import MemberRoleEditor from "./MemberRoleEditor.svelte";
  import MemberInvitations from "./MemberInvitations.svelte";
  import "./library.css";
  import { t, localeHref } from "$lib/orca/locale.svelte";
  import { connectedAppsHref } from "$lib/orca/connected-ai-apps";
  import {
    OrcaService,
    orcaError,
    memberName,
    memberRole,
    type OrcaBootstrap,
    type OrcaMember,
  } from "$lib/services/orca";
  import {
    Building2,
    Check,
    Crown,
    Ellipsis,
    Info,
    MailPlus,
    RefreshCw,
    Shield,
    UserPlus,
    Users,
  } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";

  type TeamSection = "members" | "invitations" | "departments";
  let {
    data,
    onchanged,
    tab,
    ontab,
    invite = false,
  }: {
    data: OrcaBootstrap;
    onchanged: () => Promise<void>;
    /** The tab from the address (ทีม › สมาชิก · คำเชิญ · แผนก). */
    tab?: TeamSection;
    /** Reports a tab change, so the page can keep it in the address. */
    ontab?: (next: TeamSection) => void;
    /** Open the invite dialog at once (&invite=1, from Home); managers only. */
    invite?: boolean;
  } = $props();
  let saving = $state(false);
  let query = $state("");
  let section = $state<TeamSection>(untrack(() => tab ?? "members"));
  let memberStatus = $state("active");
  let departments = $state<LibraryDepartment[]>([]);
  let departmentError = $state("");
  let departmentDirty = $state(false);
  let navigationBlocked = $state(false);
  let editingRole = $state<OrcaMember>();
  let inviting = $state(untrack(() => invite && data.canManage));
  // Open invitations, reported by MemberInvitations for the tab and reminder.
  let invitationCount = $state(0);
  // One small menu at a time: the page's "more" menu or one member row's.
  let moreOpen = $state(false);
  let menuFor = $state("");
  // Each manageable row keeps its confirmation dialog; its menu items open it.
  const lifecycle = $state<Record<string, { request: (action: "suspend" | "restore" | "delete", returnTo?: HTMLElement) => void } | undefined>>({});
  function closeMenus() {
    moreOpen = false;
    menuFor = "";
  }
  const currentUser = $derived(
    data.members.find((member) => member.id === data.currentUserID),
  );
  const canManageRoles = $derived(data.canManageRoles === true);
  // One person may belong to several companies, so a company manager never
  // chooses someone's password: password accounts are the ORCA team's, under
  // แพลตฟอร์ม ORCA › บัญชีฉุกเฉิน (platform/BreakGlassAccounts.svelte).
  const operator = $derived(data.platformOperator === true);
  // Suspending or removing someone in the default company changes their
  // account in every company, so there the server allows it only to the
  // platform operator. A server that doesn't say serves only that company.
  const canChangeStatus = $derived(data.canChangeMemberStatus ?? operator);
  const roleGroups = $derived([
    {
      id: "owner",
      label: t("เจ้าของบริษัท", "Company owner"),
      icon: Crown,
      detail: t(
        "ดูแลการตั้งค่าทั้งบริษัท และเปลี่ยนบทบาทของทุกคนได้",
        "Manages all company settings and everyone's role",
      ),
    },
    {
      id: "admin",
      label: t("ผู้ดูแล", "Admin"),
      icon: Shield,
      detail: t(
        "จัดการโปรแกรมที่เชื่อม พื้นที่ทำงาน AI สมาชิก และแผนก",
        "Manages connected programs, AI workspaces, members and departments",
      ),
    },
    {
      id: "employee",
      label: t("พนักงาน", "Employee"),
      icon: Users,
      detail: t(
        "ใช้ AI ในพื้นที่ทำงานที่ได้รับสิทธิ์",
        "Uses AI in the workspaces they're given",
      ),
    },
  ]);
  beforeNavigate((navigation) => {
    if (departmentDirty || saving) {
      navigation.cancel();
      navigationBlocked = true;
    }
  });
  async function refreshDepartments() {
    if (!data.canManage) return;
    try {
      departments = await OrcaLibraryService.departments();
      departmentError = "";
    } catch (cause) {
      departmentError = orcaError(cause);
    }
  }
  async function changedDepartment() {
    await onchanged();
    await refreshDepartments();
  }
  function changeSection(next: TeamSection) {
    if (departmentDirty || saving) return;
    section = next;
    navigationBlocked = false;
    if (next === "members") void refreshDepartments();
    if (next !== (tab ?? "members")) ontab?.(next);
  }
  // Back and forward move between tabs held in the address.
  $effect(() => {
    const requested = tab ?? "members";
    untrack(() => {
      if (requested !== section) changeSection(requested);
    });
  });
  function canManageMember(member: OrcaMember) {
    return data.canManage && member.id !== data.currentUserID && (organizationRole(currentUser?.role ?? '') === 'owner' || organizationRole(currentUser?.role ?? '') === 'admin' && organizationRole(member.role) === 'employee' && !member.roleLocked);
  }
  async function memberChanged() { await onchanged(); await refreshDepartments(); }
  /** The row's "…" button, where focus returns after a confirmation opened from its menu. */
  const menuButton = (event: Event) =>
    (event.currentTarget as HTMLElement | null)?.closest(".team-row-menu")?.querySelector<HTMLElement>('button[aria-haspopup="menu"]') ?? undefined;
  const active = (member: OrcaMember) => !member.status || member.status === "active";
  // Only an active workspace gives data access: not a draft, a paused or an archived one.
  const hubsFor = (member: OrcaMember) => data.hubs.filter((hub) => hub.status === "active" && gatewayHasMember(hub, member.id));
  const departmentsFor = (member: OrcaMember) =>
    departments
      .filter((department) => department.memberIDs.includes(member.id))
      .map((department) => data.units.find((unit) => unit.id === department.unitID)?.name || department.name);
  const activeMembers = $derived(data.members.filter(active));
  const suspendedMembers = $derived(data.members.filter((member) => member.status === "suspended"));
  // Being a member is not data access: that comes from an AI workspace.
  const withoutAccess = $derived(activeMembers.filter((member) => !hubsFor(member).length));
  const members = $derived(
    (memberStatus === "suspended" ? suspendedMembers : memberStatus === "noaccess" ? withoutAccess : activeMembers).filter((member) =>
      `${memberName(member)} ${member.email}`.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  onMount(() => {
    void refreshDepartments();
  });
</script>

<svelte:window
  onclick={(event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.(".team-menu")) closeMenus();
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") closeMenus();
  }}
/>

<div class="k-intro">
  <div class="k-heading-row">
    <div class="team-heading">
      <h1>
        {t("ทีม", "Team")}
      </h1>
      <p class="k-subtitle">
        {data.canManage
          ? t(
              "คนที่ใช้ ORCA ของบริษัทนี้ เชิญคนใหม่ด้วยลิงก์ แล้วเขาเข้าสู่ระบบด้วยบัญชี Google ของตัวเอง",
              "People using this company's ORCA. Invite with a link; each person signs in with Google.",
            )
          : t("คนที่ใช้ ORCA ของบริษัทนี้", "People who use this company's ORCA.")}
      </p>
    </div>
    {#if data.canManage && section !== "departments"}<div class="team-heading-actions">
        <div class="team-menu">
          <button
            class="k-button team-more"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label={t("ตัวเลือกเพิ่มเติม", "More options")}
            onclick={() => {
              menuFor = "";
              moreOpen = !moreOpen;
            }}><Ellipsis size={18} aria-hidden="true" /></button
          >
          <div class="team-menu-panel" role="menu" hidden={!moreOpen}>
            <button
              role="menuitem"
              disabled={saving}
              onclick={async () => {
                moreOpen = false;
                await onchanged();
                await refreshDepartments();
              }}><RefreshCw size={16} aria-hidden="true" />{t("โหลดข้อมูลใหม่", "Refresh")}</button
            >
          </div>
        </div>
        <button
          class="k-button primary"
          onclick={() => {
            moreOpen = false;
            inviting = true;
          }}><UserPlus size={16} />{t("เชิญสมาชิก", "Invite a member")}</button
        >
      </div>{/if}
  </div>
</div>
{#if !data.canManage}<div class="k-banner">
    <Info size={16} />{t(
      "คุณดูรายชื่อได้อย่างเดียว ถ้าจะเปลี่ยนบทบาทหรือแผนก ขอให้เจ้าของบริษัทหรือผู้ดูแลเปลี่ยนให้",
      "You can only view this list. To change a role or department, ask a company owner or admin.",
    )}
  </div>{/if}
<nav class="team-tabs" aria-label={t("การจัดการสมาชิก", "Member management")}>
  <button
    class:active={section === "members"}
    aria-pressed={section === "members"}
    disabled={departmentDirty || saving}
    onclick={() => changeSection("members")}
    ><Users size={16} />{t("สมาชิก", "Members")}<span>{activeMembers.length}</span></button
  >
  {#if data.canManage}<button
      class:active={section === "invitations"}
      aria-pressed={section === "invitations"}
      disabled={departmentDirty || saving}
      onclick={() => changeSection("invitations")}
      ><MailPlus size={16} />{t("คำเชิญ", "Invitations")}{#if invitationCount}<span class="team-tab-alert">{invitationCount}</span>{/if}</button
    ><button
      class:active={section === "departments"}
      aria-pressed={section === "departments"}
      disabled={departmentDirty || saving}
      onclick={() => changeSection("departments")}
      ><Building2 size={16} />{t("แผนก", "Departments")}<span
        >{data.units.filter((unit) => unit.kind === "department" && !unit.archivedAt && !unit.deletedAt).length}</span
      ></button
    >{/if}
</nav>
{#if navigationBlocked}<div class="k-banner" role="alert">
    <Info size={16} />{t(
      "มีการแก้ไขที่ยังไม่ได้บันทึก บันทึกหรือยกเลิกก่อนออกจากหน้านี้",
      "You have unsaved changes. Save or discard them before leaving this page.",
    )}
  </div>{/if}
{#if section === "departments" && data.canManage}<div
    class="business-library"
  >
    <LibraryDepartments
      {data}
      onchanged={changedDepartment}
      ondirty={(value) => (departmentDirty = value)}
      context="team"
    />
  </div>{:else if section === "members"}
  {#if editingRole && canManageRoles}{#key editingRole.id}<MemberRoleEditor
        member={editingRole}
        currentUserID={data.currentUserID}
        {onchanged}
        oncancel={() => (editingRole = undefined)}
      />{/key}{/if}
  {#if data.canManage && invitationCount}<div class="team-reminder" role="status">
      <MailPlus size={16} aria-hidden="true" /><span
        >{t(`มีคำเชิญที่ยังไม่ได้ตอบรับ ${invitationCount} รายการ`, `${invitationCount} invitation${invitationCount === 1 ? "" : "s"} not accepted yet`)}</span
      ><button class="k-link-button" onclick={() => changeSection("invitations")}>{t("ดูคำเชิญ", "View invitations")}</button>
    </div>{/if}
  <div class="team-toolbar">
    <div class="team-filter" role="group" aria-label={t("ตัวกรองสมาชิก", "Member filters")}>
      <button class:active={memberStatus === "active"} aria-pressed={memberStatus === "active"} onclick={() => (memberStatus = "active")}
        >{t("ทั้งหมด", "All")}<span>{activeMembers.length}</span></button
      >{#if data.canManage && (withoutAccess.length || memberStatus === "noaccess")}<button
          class:active={memberStatus === "noaccess"}
          aria-pressed={memberStatus === "noaccess"}
          onclick={() => (memberStatus = "noaccess")}>{t("ยังไม่เข้าถึงข้อมูล", "No data access")}<span>{withoutAccess.length}</span></button
        >{/if}{#if suspendedMembers.length || memberStatus === "suspended"}<button
          class:active={memberStatus === "suspended"}
          aria-pressed={memberStatus === "suspended"}
          onclick={() => (memberStatus = "suspended")}>{t("ถูกระงับ", "Suspended")}<span>{suspendedMembers.length}</span></button
        >{/if}
    </div>
    {#if data.members.length > 8 || query}<input
        class="team-search"
        type="search"
        bind:value={query}
        aria-label={t("ค้นหาสมาชิก", "Search members")}
        placeholder={t("ค้นหาชื่อหรืออีเมล", "Search name or email")}
      />{/if}
  </div>
  {#if departmentError}<div class="k-banner" role="alert">
      <Info size={16} />{t(
        "โหลดรายชื่อแผนกไม่สำเร็จ",
        "Could not load departments",
      )}: {departmentError}
    </div>{/if}
  {#if members.length}<div class="k-table-wrap team-table-wrap">
      <table class="k-table team-table">
        <thead
          ><tr
            ><th scope="col">{t("สมาชิก", "Member")}</th><th scope="col">{t("บทบาท", "Role")}</th><th scope="col"
              >{t("เข้าถึงข้อมูล", "Data access")}</th
            >{#if data.canManage}<th scope="col" class="team-actions-col"><span class="sr-only">{t("การจัดการสมาชิก", "Member actions")}</span></th>{/if}</tr
          ></thead
        ><tbody
          >{#each members as member (member.id)}{@const hubs = hubsFor(member)}{@const canChangeRole =
              canManageRoles && typeof member.role === "number" && !member.roleLocked && active(member)}{@const manageable = canChangeStatus && canManageMember(member)}<tr
              ><td class="team-member"
                ><strong
                  >{memberName(member)}{#if member.id === data.currentUserID}<span class="team-you">{t(" (คุณ)", " (you)")}</span>{/if}</strong
                >{#if departmentsFor(member).length || memberName(member) !== member.email}<p class="k-small k-muted">
                    {[...departmentsFor(member), memberName(member) !== member.email ? member.email : ""].filter(Boolean).join(" · ")}
                  </p>{/if}{#if member.status === "suspended"}<span class="team-status">{t("บัญชีถูกระงับ", "Account suspended")}</span>{/if}</td
              ><td class="team-role"
                ><span class="role-badge role-{organizationRole(member.role)}">{memberRole(member.role)}</span
                >{#if member.roleLocked}<small class="role-locked">{t("ทีม ORCA ตั้งไว้", "Set by the ORCA team")}</small>{/if}</td
              ><td class="team-hubs"
                >{#if !active(member)}<span class="team-none">—</span>{:else if hubs.length}{#each hubs as hub}<a
                      class="team-hub-link"
                      href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}
                      title={hub.name}><Check size={14} aria-hidden="true" />{hub.name}</a
                    >{/each}{:else}<span class="team-noaccess">{t("ยังไม่เข้าถึงข้อมูล", "No data access yet")}</span
                  >{#if data.canManage}<a class="team-noaccess-link" href={localeHref("/app?view=workspaces")}
                      >{t("เพิ่มเข้าพื้นที่ทำงาน", "Add to a workspace")}</a
                    >{/if}{/if}</td
              >{#if data.canManage}<td class="team-actions-col"
                  >{#if canChangeRole || active(member) || manageable}<div class="team-menu team-row-menu">
                    <button
                      class="team-icon-button"
                      aria-haspopup="menu"
                      aria-expanded={menuFor === member.id}
                      aria-label={t(`จัดการ ${memberName(member)}`, `Manage ${memberName(member)}`)}
                      onclick={() => {
                        moreOpen = false;
                        menuFor = menuFor === member.id ? "" : member.id;
                      }}><Ellipsis size={18} aria-hidden="true" /></button
                    >
                    <div class="team-menu-panel" role="menu" hidden={menuFor !== member.id}>
                      {#if canChangeRole}<button
                          role="menuitem"
                          onclick={() => {
                            menuFor = "";
                            editingRole = member;
                          }}>{t("เปลี่ยนบทบาท", "Change role")}</button
                        >{/if}{#if active(member)}<a role="menuitem" href={localeHref("/app?view=workspaces")}
                          >{t("เพิ่มเข้าพื้นที่ทำงาน", "Add to a workspace")}</a
                        ><a role="menuitem" href={localeHref(connectedAppsHref("all", member.id))}
                          >{t("ดูแอป AI ที่เชื่อมอยู่", "See connected AI apps")}</a
                        >{/if}{#if manageable}<button
                          role="menuitem"
                          onclick={(event) => {
                            menuFor = "";
                            lifecycle[member.id]?.request(member.status === "suspended" ? "restore" : "suspend", menuButton(event));
                          }}>{member.status === "suspended" ? t("เปิดใช้งานอีกครั้ง", "Restore") : t("ระงับการใช้งาน", "Suspend")}</button
                        ><button
                          role="menuitem"
                          class="danger"
                          onclick={(event) => {
                            menuFor = "";
                            lifecycle[member.id]?.request("delete", menuButton(event));
                          }}>{t("นำออกจากบริษัท", "Remove from company")}</button
                        >{/if}
                    </div>
                  </div>{/if}{#if manageable}<TeamLifecycleActions
                      bind:this={lifecycle[member.id]}
                      menu
                      kind="member"
                      id={member.id}
                      name={memberName(member)}
                      version={member.version ?? 0}
                      inactive={member.status === "suspended"}
                      disabled={saving || !!editingRole}
                      onbusy={(value) => (saving = value)}
                      onchanged={memberChanged}
                    />{/if}</td
                >{/if}</tr
            >{/each}</tbody
        >
      </table>
    </div>{:else}<div class="k-empty team-empty">
      <Users size={28} />
      <h2>{memberStatus === "noaccess" ? t("ทุกคนเข้าถึงข้อมูลแล้ว", "Everyone has data access") : t("ไม่พบสมาชิก", "No members found")}</h2>
      <p>
        {memberStatus === "noaccess"
          ? t("สมาชิกที่เปิดใช้งานอยู่ทุกคนอยู่ในพื้นที่ทำงาน AI อย่างน้อยหนึ่งแห่ง", "Every active member is in at least one AI workspace.")
          : t("ลองค้นหาด้วยชื่อหรืออีเมลอื่น หรือเลือกตัวกรองอื่น", "Try another name or email, or another filter.")}
      </p>
    </div>{/if}
  <details class="team-role-help">
    <summary><Info size={15} aria-hidden="true" />{t("บทบาทแต่ละแบบทำอะไรได้", "What each role can do")}</summary>
    <ul>
      {#each roleGroups as group}<li>
          <span class="team-role-icon" aria-hidden="true"><group.icon size={15} /></span><span
            ><strong>{group.label}</strong>{group.detail}</span
          >
        </li>{/each}
    </ul>
    <p>
      {t(
        "บทบาทไม่ได้เปิดให้เห็นข้อมูลเอง คนจะใช้ AI กับข้อมูลของบริษัทได้เมื่ออยู่ในพื้นที่ทำงาน AI",
        "A role doesn't open data by itself. People use AI with company data once they're in an AI workspace.",
      )}
    </p>
    {#if data.canManage && !canManageRoles}<p>
        {t("ผู้ดูแลจัดการสมาชิกและแผนกได้ ส่วนการเปลี่ยนบทบาทต้องให้เจ้าของบริษัททำ", "Admins manage members and departments. Only a company owner changes roles.")}
      </p>{/if}
  </details>
{/if}
{#if data.canManage}<MemberInvitations {data} bind:inviting bind:openCount={invitationCount} showList={section === "invitations"} onchanged={memberChanged} />{/if}

<style>
  .team-heading {
    flex: 1 1 360px;
    min-width: 0;
  }
  .team-heading-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  /* Small menus: the page's "more" menu and each member row's menu */
  .team-menu {
    position: relative;
  }
  .team-more {
    width: 40px;
    padding: 0;
    justify-content: center;
  }
  .team-menu-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    display: grid;
    min-width: 230px;
    padding: 6px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-popover, var(--orca-surface));
    box-shadow: 0 12px 32px -12px rgba(21, 24, 35, 0.28);
    text-align: start;
    white-space: normal;
  }
  .team-menu-panel[hidden] {
    display: none;
  }
  .team-menu-panel > button,
  .team-menu-panel > a {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
    line-height: 1.5;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }
  .team-menu-panel > button:hover:not(:disabled),
  .team-menu-panel > a:hover {
    background: var(--orca-hover);
  }
  .team-menu-panel > button:disabled {
    color: var(--orca-muted);
    cursor: not-allowed;
  }
  .team-menu-panel > button :global(svg) {
    flex: none;
    margin-top: 3px;
    color: var(--orca-subtle);
  }
  .team-menu-panel > button.danger {
    color: var(--orca-deny);
  }
  .team-menu-panel > button.danger:hover {
    background: var(--orca-deny-bg);
  }
  /* Section tabs */
  .team-tabs {
    display: flex;
    gap: 20px;
    margin: 0 0 20px;
    overflow-x: auto;
    box-shadow: inset 0 -1px 0 var(--orca-line);
    scrollbar-width: none;
  }
  .team-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 2px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--orca-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .team-tabs button :global(svg) {
    color: var(--orca-subtle);
  }
  .team-tabs button:hover:not(:disabled) {
    color: var(--orca-ink);
  }
  .team-tabs button.active {
    border-bottom-color: var(--orca-ink);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .team-tabs button.active :global(svg) {
    color: var(--orca-ink);
  }
  .team-tabs button span {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
  }
  .team-tabs button span.team-tab-alert {
    background: var(--orca-warn-bg);
    color: var(--orca-warn);
  }
  /* A reminder that invitations are still waiting */
  .team-reminder {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px;
    padding: 10px 14px;
    border-radius: var(--orca-radius);
    background: var(--orca-warn-bg);
    color: var(--orca-warn);
    font-size: 14px;
  }
  .team-reminder span {
    flex: 1;
    min-width: 0;
  }
  .team-reminder .k-link-button {
    color: inherit;
    font-weight: 600;
    white-space: nowrap;
  }
  /* Quick filters and search */
  .team-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    margin: 0 0 12px;
  }
  .team-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .team-filter button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--orca-line-strong);
    border-radius: 999px;
    background: var(--orca-surface);
    color: var(--orca-nav);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .team-filter button span {
    color: var(--orca-muted);
    font-variant-numeric: tabular-nums;
  }
  .team-filter button.active {
    border-color: var(--orca-ink);
    background: var(--orca-ink);
    color: var(--orca-on-ink, #fff);
  }
  .team-filter button.active span {
    color: inherit;
    opacity: 0.8;
  }
  .team-search {
    width: min(280px, 100%);
    min-height: 36px;
    padding: 6px 11px;
    border: 1px solid var(--orca-field-line, var(--orca-line-strong));
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
  }
  /* Members table */
  .team-table-wrap {
    overflow: visible;
  }
  table.team-table {
    min-width: 0;
  }
  .team-table th {
    white-space: nowrap;
  }
  .team-table-wrap .team-table td {
    vertical-align: middle;
  }
  .team-member {
    min-width: 220px;
  }
  .team-member strong {
    display: block;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .team-you {
    color: var(--orca-muted);
    font-weight: 400;
  }
  .team-member p {
    margin: 1px 0 0;
    overflow-wrap: anywhere;
  }
  .team-status {
    display: inline-block;
    margin-top: 4px;
    padding: 1px 8px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-deny-bg);
    color: var(--orca-deny);
    font-size: 12px;
    font-weight: 500;
  }
  .role-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .role-badge.role-owner,
  .role-badge.role-admin {
    background: var(--orca-ink);
    color: var(--orca-on-ink, #fff);
  }
  .role-locked {
    display: block;
    margin-top: 4px;
    color: var(--orca-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .team-none {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .team-hub-link {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 260px;
    overflow: hidden;
    color: var(--orca-ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .team-hub-link :global(svg) {
    flex: none;
    color: var(--orca-ok);
  }
  .team-hub-link:hover {
    text-underline-offset: 3px;
  }
  .team-noaccess {
    display: block;
    color: var(--orca-warn);
    font-size: 13.5px;
  }
  .team-noaccess-link {
    color: var(--orca-ink);
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .team-icon-button {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .team-icon-button:hover,
  .team-icon-button[aria-expanded="true"] {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .team-actions-col {
    width: 1%;
    text-align: end;
    white-space: nowrap;
  }
  .team-row-menu {
    display: inline-block;
  }
  .team-empty {
    margin-top: 0;
    gap: 8px;
  }
  .team-empty h2 {
    margin-top: 4px;
    font-size: 15px;
  }
  .team-empty p {
    margin: 0;
    font-size: 13.5px;
  }
  /* What each role can do */
  .team-role-help {
    margin-top: 16px;
    color: var(--orca-muted);
    font-size: 13.5px;
  }
  .team-role-help summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .team-role-help summary:hover {
    color: var(--orca-ink);
  }
  .team-role-help ul {
    display: grid;
    gap: 8px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .team-role-help li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .team-role-help li > span:last-child {
    display: grid;
    gap: 1px;
  }
  .team-role-help strong {
    color: var(--orca-ink);
    font-weight: 600;
  }
  .team-role-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: var(--orca-radius);
    background: var(--orca-secondary);
    color: var(--orca-nav);
  }
  .team-role-help p {
    margin: 10px 0 0;
    line-height: 1.6;
  }
  @media (max-width: 900px) {
    /* Member rows stack: name and menu, then role and data access. */
    .team-table-wrap table.team-table,
    .team-table-wrap .team-table tbody {
      display: block;
    }
    .team-table-wrap .team-table thead {
      display: none;
    }
    .team-table-wrap .team-table tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--orca-line);
    }
    .team-table-wrap .team-table tr:last-child {
      border-bottom: 0;
    }
    .team-table-wrap .team-table td {
      min-width: 0;
      padding: 0;
      border: 0;
    }
    .team-member {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
    }
    .team-table-wrap .team-actions-col {
      grid-column: 2;
      grid-row: 1;
      width: auto;
      align-self: start;
    }
    .team-role,
    .team-hubs {
      grid-column: 1 / -1;
    }
    .team-hub-link {
      max-width: 100%;
    }
  }
  @media (max-width: 760px) {
    .team-heading-actions {
      width: 100%;
    }
    .team-heading-actions > .k-button {
      flex: 1 1 auto;
      justify-content: center;
    }
    .team-search {
      width: 100%;
    }
  }
</style>
