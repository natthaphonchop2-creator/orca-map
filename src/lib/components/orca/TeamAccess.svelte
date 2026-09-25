<script lang="ts">
  import { gatewayHasMember } from '$lib/orca/gateway-sources';
  import { beforeNavigate } from "$app/navigation";
  import {
    organizationRole,
    canResetMemberPassword,
  } from "$lib/orca/member-access";
  import {
    OrcaLibraryService,
    type LibraryDepartment,
  } from "$lib/services/orca-library";
  import TeamLifecycleActions from "./TeamLifecycleActions.svelte";
  import LibraryDepartments from "./LibraryDepartments.svelte";
  import MemberRoleEditor from "./MemberRoleEditor.svelte";
  import MemberInvitations from "./MemberInvitations.svelte";
  import "./library.css";
  import { LOCAL_AUTH_MIN_PASSWORD_LENGTH } from "$lib/constants";
  import { t, localeHref } from "$lib/orca/locale.svelte";
  import type { LocalAuthUser } from "$lib/services/admin/types";
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
    Copy,
    Crown,
    Info,
    KeyRound,
    Plus,
    RefreshCw,
    Shield,
    UserPlus,
    Users,
  } from "@lucide/svelte";
  import { onMount, onDestroy } from "svelte";

  let {
    data,
    onchanged,
  }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
  let accounts = $state<LocalAuthUser[]>([]);
  let localAvailable = $state(false);
  let loading = $state(false);
  let saving = $state(false);
  let open = $state(false);
  let resetting = $state<LocalAuthUser>();
  let email = $state("");
  let password = $state("");
  let error = $state("");
  let availabilityError = $state("");
  let success = $state("");
  let query = $state("");
  let section = $state<"members" | "departments">("members");
  let memberStatus = $state("active");
  let roleFilter = $state("all");
  let departmentFilter = $state("all");
  let departments = $state<LibraryDepartment[]>([]);
  let departmentError = $state("");
  let departmentDirty = $state(false);
  let navigationBlocked = $state(false);
  let editingRole = $state<OrcaMember>();
  let inviting = $state(false);
  const currentUser = $derived(
    data.members.find((member) => member.id === data.currentUserID),
  );
  const canManageRoles = $derived(data.canManageRoles === true);
  const roleGroups = $derived([
    {
      id: "owner",
      label: t("เจ้าของระบบ", "Owner"),
      icon: Crown,
      detail: t(
        "ดูแลการตั้งค่าทั้งองค์กรและกำหนดบทบาทสมาชิก",
        "Manages all organization settings and member roles",
      ),
    },
    {
      id: "admin",
      label: t("ผู้ดูแลระบบ", "Admin"),
      icon: Shield,
      detail: t(
        "จัดการระบบที่เชื่อมต่อ พื้นที่ทำงาน AI สมาชิก และแผนก",
        "Manages connected systems, AI workspaces, members and departments",
      ),
    },
    {
      id: "employee",
      label: t("สมาชิกทั่วไป", "Member"),
      icon: Users,
      detail: t(
        "ใช้งานพื้นที่ทำงาน AI และเครื่องมือตามสิทธิ์ที่ได้รับ",
        "Uses assigned AI workspaces and tools",
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
  function changeSection(next: "members" | "departments") {
    if (departmentDirty || saving) return;
    section = next;
    navigationBlocked = false;
    if (next === "members") void refreshDepartments();
  }
  function passwordAllowed(member: OrcaMember) {
    if (member.status && member.status !== "active") return false;
    return canResetMemberPassword(
      data.canManage,
      currentUser?.role,
      member.role,
      member.roleLocked,
    );
  }

  function canManageMember(member: OrcaMember) {
    return data.canManage && member.id !== data.currentUserID && (organizationRole(currentUser?.role ?? '') === 'owner' || organizationRole(currentUser?.role ?? '') === 'admin' && organizationRole(member.role) === 'employee' && !member.roleLocked);
  }
  async function memberChanged() { await onchanged(); await refresh(); await refreshDepartments(); }
  const normalized = (email: string) => email.trim().toLowerCase();
  const matchingMember = (email: string) =>
    data.members.find(
      (member) => normalized(member.email) === normalized(email),
    );
  const pending = $derived(
    accounts.filter(
      (account) =>
        !matchingMember(account.email) &&
        account.email.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const members = $derived(
    data.members.filter(
      (member) =>
        (memberStatus === "suspended" ? member.status === "suspended" : !member.status || member.status === "active") &&
        `${memberName(member)} ${member.email}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (roleFilter === "all" ||
          organizationRole(member.role) === roleFilter) &&
        (departmentFilter === "all" ||
          (departmentFilter === "none"
            ? !departments.some((department) =>
                department.memberIDs.includes(member.id),
              )
            : departments.some(
                (department) =>
                  department.unitID === departmentFilter &&
                  department.memberIDs.includes(member.id),
              ))),
    ),
  );
  async function refresh() {
    if (!data.canManage) return;
    loading = true;
    availabilityError = "";
    try {
      accounts = await OrcaService.localUsers();
      localAvailable = true;
    } catch (cause) {
      localAvailable = false;
      availabilityError = orcaError(cause);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void refresh();
    void refreshDepartments();
  });
  onDestroy(() => {
    password = "";
  });
  function start(account?: LocalAuthUser) {
    if (account) {
      const member = matchingMember(account.email);
      if (
        member
          ? !passwordAllowed(member)
          : organizationRole(currentUser?.role ?? "") !== "owner"
      )
        return;
    }
    resetting = account;
    email = account?.email ?? "";
    password = "";
    open = true;
    error = "";
    success = "";
  }
  async function save() {
    if (saving) return;
    saving = true;
    error = "";
    success = "";
    try {
      if (resetting)
        await OrcaService.resetLocalPassword(resetting.id, password);
      else await OrcaService.createLocalUser(normalized(email), password);
      password = "";
      open = false;
      success = resetting
        ? t(
            "เปลี่ยนรหัสผ่านแล้ว บัญชีนี้ต้องเข้าสู่ระบบใหม่บนทุกอุปกรณ์",
            "Password updated. This account must sign in again on every device.",
          )
        : t(
            "สร้างบัญชีแล้ว ผู้ใช้ต้องเข้าสู่ระบบครั้งแรกก่อน จึงจะเพิ่มเป็นสมาชิกของพื้นที่ทำงาน AI ได้",
            "Account created. The user must sign in once before being added to an AI workspace.",
          );
      await refresh();
      await onchanged();
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      saving = false;
      password = "";
    }
  }
  async function copyLogin() {
    try {
      await navigator.clipboard.writeText(
        new URL(localeHref("/login"), window.location.origin).href,
      );
      success = t(
        "คัดลอกลิงก์เข้าสู่ระบบแล้ว ORCA ไม่ได้ส่งข้อความหรืออีเมลใดถึงสมาชิก",
        "Sign-in link copied. ORCA has not sent any message or email.",
      );
    } catch {
      error = t(
        "คัดลอกลิงก์ไม่สำเร็จ กรุณาเปิดหน้าเข้าสู่ระบบและคัดลอกที่อยู่จากแถบที่อยู่ของเบราว์เซอร์",
        "Copy failed. Open the sign-in page and copy its address from the browser.",
      );
    }
  }
</script>

<div class="k-intro">
  <div class="k-heading-row">
    <div class="team-heading">
      <h1>
        {t("สมาชิกและแผนก", "Members and departments")}
      </h1>
      <p class="k-subtitle">
        {t(
          "กำหนดบทบาทในองค์กร จัดสมาชิกตามแผนก และกำหนดสิทธิ์การเข้าถึงตามหน้าที่",
          "Assign organization roles, organize members into departments and grant access according to each person’s responsibilities.",
        )}
      </p>
    </div>
    {#if data.canManage && section === "members"}<div class="team-heading-actions">
        <button
          class="k-button"
          disabled={loading || saving}
          onclick={async () => {
            await refresh();
            await onchanged();
            await refreshDepartments();
          }}><RefreshCw size={16} />{t("โหลดข้อมูลใหม่", "Refresh")}</button
        ><button class="k-button" onclick={copyLogin}
          ><Copy size={16} />{t(
            "คัดลอกลิงก์เข้าสู่ระบบ",
            "Copy sign-in link",
          )}</button
        >{#if localAvailable}<button
            class="k-button"
            onclick={() => start()}
            ><Plus size={16} />{t("เพิ่มบัญชีผู้ใช้", "Add user account")}</button
          >{/if}<button class="k-button primary" onclick={() => (inviting = true)}
          ><UserPlus size={16} />{t("เชิญสมาชิก", "Invite a member")}</button
        >
      </div>{/if}
  </div>
</div>
<div class="team-role-overview">
  {#each roleGroups as group}<article>
      <span class="team-role-icon" aria-hidden="true"><group.icon size={16} /></span>
      <div>
        <strong>{group.label}</strong>
        <p>{group.detail}</p>
      </div>
      <span class="team-role-count"
        >{data.members.filter(
          (member) => (!member.status || member.status === "active") && organizationRole(member.role) === group.id,
        ).length}</span
      >
    </article>{/each}
</div>
{#if !data.canManage}<div class="k-banner">
    <Info size={16} />{t(
      "บัญชีนี้ดูรายชื่อสมาชิกได้ แต่ไม่สามารถเปลี่ยนบทบาทหรือจัดการแผนก กรุณาติดต่อเจ้าของระบบหรือผู้ดูแลระบบเพื่อขอปรับสิทธิ์",
      "This account can view members but cannot change roles or manage departments. Contact an Owner or Admin to request access changes.",
    )}
  </div>{:else if !canManageRoles}<p class="k-small k-muted team-role-note">
    {organizationRole(currentUser?.role ?? "") === "admin"
      ? t(
          "ผู้ดูแลระบบจัดการสมาชิกและแผนกได้ ส่วนการเปลี่ยนบทบาทต้องดำเนินการโดยเจ้าของระบบ",
          "Admins manage members and departments. Only an Owner can change roles.",
        )
      : t(
          "ยังไม่สามารถยืนยันสิทธิ์การจัดการบทบาท กรุณาโหลดข้อมูลใหม่เพื่อตรวจสอบสิทธิ์ล่าสุด",
          "Role management access could not be confirmed. Refresh to check your latest access.",
        )}
  </p>{/if}
<nav class="team-tabs" aria-label={t("การจัดการสมาชิก", "Member management")}>
  <button
    class:active={section === "members"}
    aria-pressed={section === "members"}
    disabled={departmentDirty || saving}
    onclick={() => changeSection("members")}
    ><Users size={16} />{t("สมาชิกและบทบาท", "Members & roles")}</button
  >
  {#if data.canManage}<button
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
      "มีการแก้ไขที่ยังไม่ได้บันทึก กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนออกจากหน้านี้",
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
  </div>{:else}
  {#if editingRole && canManageRoles}{#key editingRole.id}<MemberRoleEditor
        member={editingRole}
        currentUserID={data.currentUserID}
        {onchanged}
        oncancel={() => (editingRole = undefined)}
      />{/key}{/if}
  {#if error}<div class="k-banner error" role="alert">
      <Info size={16} />{error}
    </div>{/if}
  {#if success}<div class="k-banner success" role="status">
      <Check size={16} />{success}
    </div>{/if}
  {#if open && data.canManage && localAvailable}<form
      class="k-panel team-form"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>
        {resetting
          ? t("ตั้งรหัสผ่านใหม่", "Set a new password")
          : t("สร้างบัญชีผู้ใช้", "Create a user account")}
      </h2>
      <fieldset disabled={saving}>
        <div class="k-grid-2 team-form-grid">
          <div class="k-field">
            <label for="team-email">{t("อีเมล", "Email")}</label><input
              id="team-email"
              type="email"
              bind:value={email}
              readonly={Boolean(resetting)}
              required
              autocomplete="off"
            />
          </div>
          <div class="k-field">
            <label for="team-password">{t("รหัสผ่าน", "Password")}</label><input
              id="team-password"
              type="password"
              bind:value={password}
              minlength={LOCAL_AUTH_MIN_PASSWORD_LENGTH}
              required
              autocomplete="new-password"
            />
            <p class="k-small k-muted team-form-hint">
              {t(
                `อย่างน้อย ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} ตัวอักษร`,
                `At least ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} characters`,
              )}
            </p>
          </div>
        </div>
        <p class="k-small k-muted team-form-note">
          {t(
            "กรุณาแจ้งข้อมูลเข้าสู่ระบบแก่ผู้ใช้ผ่านช่องทางที่เหมาะสมด้วยตนเอง แบบฟอร์มนี้ไม่ส่งอีเมลหรือคำเชิญโดยอัตโนมัติ",
            "Share the sign-in details with the user through an appropriate channel. This form does not send email or invitations.",
          )}
        </p>
        <div class="k-actions team-form-actions">
          <button class="k-button primary" type="submit" disabled={saving}
            >{saving
              ? t("กำลังบันทึก…", "Saving…")
              : t("บันทึกบัญชี", "Save account")}</button
          ><button
            class="k-button"
            type="button"
            onclick={() => {
              open = false;
              password = "";
            }}>{t("ยกเลิก", "Cancel")}</button
          >
        </div>
      </fieldset>
    </form>{/if}

  <div class="team-toolbar" class:compact={!data.canManage}>
    <div class="k-field team-search">
      <label for="team-search">{t("ค้นหาสมาชิก", "Search members")}</label><input
        id="team-search"
        type="search"
        bind:value={query}
        placeholder={t("ชื่อหรืออีเมล", "Name or email")}
      />
    </div>
    <div class="team-filters">
      <div class="k-field"><label for="member-status">{t('สถานะสมาชิก','Member status')}</label><select id="member-status" bind:value={memberStatus}><option value="active">{t('เปิดใช้งาน','Active')}</option><option value="suspended">{t('ระงับ','Suspended')}</option></select></div>
      <div class="k-field">
        <label for="team-role-filter">{t("บทบาท", "Role")}</label><select
          id="team-role-filter"
          bind:value={roleFilter}
          ><option value="all">{t("ทุกบทบาท", "All roles")}</option
          >{#each roleGroups as group}<option value={group.id}
              >{group.label}</option
            >{/each}</select
        >
      </div>
      {#if data.canManage}<div class="k-field">
          <label for="team-department-filter">{t("แผนก", "Department")}</label
          ><select
            id="team-department-filter"
            bind:value={departmentFilter}
            disabled={!!departmentError}
            ><option value="all">{t("ทุกแผนก", "All departments")}</option
            ><option value="none">{t("ยังไม่มีแผนก", "No department")}</option
            >{#each data.units.filter((unit) => unit.kind === "department" && !unit.archivedAt && !unit.deletedAt) as unit}<option
                value={unit.id}>{unit.name}</option
              >{/each}</select
          >
        </div>{/if}
    </div>
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
            ><th scope="col">{t("สมาชิก", "Member")}</th><th scope="col"
              >{t("บทบาท", "Role")}</th
            >{#if data.canManage}<th scope="col">{t("แผนก", "Department")}</th>{/if}<th scope="col"
              >{t("พื้นที่ทำงาน AI", "AI workspaces")}</th
            >{#if data.canManage && localAvailable}<th scope="col"
                >{t("บัญชีผู้ใช้", "Account")}</th
              >{/if}{#if data.canManage}<th scope="col" class="team-actions-col">{t('การจัดการสมาชิก', 'Member actions')}</th>{/if}</tr
          ></thead
        ><tbody
          >{#each members as member (member.id)}<tr
              ><td class="team-member"
                ><strong>{memberName(member)}</strong>
                {#if memberName(member) !== member.email}<p class="k-small k-muted">{member.email}</p>{/if}</td
              ><td class="team-role"
                ><span class="role-badge">{memberRole(member.role)}</span
                >{#if member.roleLocked}<small class="role-locked"
                    >{t(
                      "กำหนดโดยการตั้งค่า ORCA",
                      "Set by ORCA configuration",
                    )}</small
                  >{:else if canManageRoles && typeof member.role === "number" && (!member.status || member.status === "active")}<button
                    class="k-link-button team-role-change"
                    onclick={() => (editingRole = member)}
                    >{t("เปลี่ยนบทบาท", "Change role")}</button
                  >{/if}</td
              >{#if data.canManage}<td class="team-departments"
                  ><div class="team-chips">{#each departments.filter( (department) => department.memberIDs.includes(member.id), ) as department}{@const departmentLabel = data.units.find((unit) => unit.id === department.unitID)
                        ?.name || department.name}<span
                      class="department-badge"
                      title={departmentLabel}
                      >{departmentLabel}</span
                    >{:else}<span class="team-none"
                      >{departmentError
                        ? "—"
                        : t("ยังไม่มีแผนก", "No department")}</span
                    >{/each}</div></td
                >{/if}<td class="team-hubs"
                >{#each data.hubs.filter( (hub) => gatewayHasMember(hub, member.id), ) as hub}<a
                    class="team-hub-link"
                    href={localeHref(
                      `/app?view=hub&hub=${encodeURIComponent(hub.id)}`,
                    )}
                    title={hub.name}>{hub.name}</a
                  >{:else}<span class="team-none"
                    >{t(
                      "ยังไม่มีพื้นที่ทำงาน AI",
                      "No AI workspace yet",
                    )}</span
                  >{/each}</td
              >{#if data.canManage && localAvailable}{@const account =
                  accounts.find(
                    (item) =>
                      normalized(item.email) === normalized(member.email),
                  )}<td class="team-account"
                  >{#if account && passwordAllowed(member)}<button
                      class="team-icon-button"
                      aria-label={t(`ตั้งรหัสผ่านใหม่ให้ ${member.email}`, `Reset password for ${member.email}`)}
                      title={t("ตั้งรหัสผ่านใหม่", "Reset password")}
                      onclick={() => start(account)}
                      ><KeyRound size={16} aria-hidden="true" /></button
                    >{:else}<span class="team-account-note"
                      >{member.status === 'suspended'
                        ? t('บัญชีถูกระงับ', 'Account suspended')
                        : account
                          ? t(
                              "บัญชีผู้ดูแลระบบที่ได้รับการป้องกัน",
                              "Protected administrator account",
                            )
                          : t(
                              "บัญชีจากผู้ให้บริการเข้าสู่ระบบภายนอก",
                              "External sign-in account",
                            )}</span
                    >{/if}</td
                >{/if}{#if data.canManage}<td class="team-actions-col">
                  {#if canManageMember(member)}<TeamLifecycleActions kind="member" id={member.id} name={memberName(member)} version={member.version ?? 0} inactive={member.status === 'suspended'} disabled={saving || !!editingRole || open} compact onbusy={(value) => saving = value} onchanged={memberChanged} />
                  {:else}<span class="team-account-note">{member.id === data.currentUserID ? t('บัญชีของคุณ', 'Your account') : t('จัดการได้โดยเจ้าของระบบ', 'Managed by an Owner')}</span>{/if}
                </td>{/if}</tr
            >{/each}</tbody
        >
      </table>
    </div>{:else}<div class="k-empty team-empty">
      <Users size={28} />
      <h2>{t("ไม่พบสมาชิก", "No members found")}</h2>
      <p>
        {t(
          "ค้นหาด้วยชื่อหรืออีเมลอื่น หรือเปลี่ยนตัวกรอง",
          "Search for another name or email, or change the filters.",
        )}
      </p>
    </div>{/if}
  {#if data.canManage}<MemberInvitations {data} bind:inviting onchanged={memberChanged} />{/if}
  {#if data.canManage && pending.length}<section class="team-pending">
      <div class="team-pending-head">
        <div class="k-section-title">
          <h2>{t("รอเข้าสู่ระบบครั้งแรก", "Waiting for first sign-in")}</h2>
          <span class="k-badge">{pending.length}</span>
        </div>
        <p class="k-small k-muted">
          {t(
            "บัญชีเหล่านี้เข้าสู่ระบบได้แล้ว แต่ยังเพิ่มเป็นสมาชิกของพื้นที่ทำงาน AI ไม่ได้จนกว่าผู้ใช้จะเข้าสู่ระบบครั้งแรก จากนั้นกดโหลดข้อมูลใหม่",
            "These accounts can sign in but cannot be added to an AI workspace until each user signs in once. Then refresh the list.",
          )}
        </p>
      </div>
      <div class="team-pending-table">
        <table class="k-table team-table">
          <thead
            ><tr
              ><th scope="col">{t("อีเมล", "Email")}</th><th scope="col">{t("สถานะ", "Status")}</th><th scope="col" class="team-actions-col"
                >{t("การจัดการ", "Actions")}</th
              ></tr
            ></thead
          ><tbody
            >{#each pending as account}<tr
                ><td>{account.email}</td><td
                  ><span class="k-badge paused"
                    >{t("รอเข้าสู่ระบบ", "Pending sign-in")}</span
                  ></td
                ><td class="team-actions-col"
                  ><button
                    class="k-button small"
                    disabled={organizationRole(currentUser?.role ?? "") !==
                      "owner"}
                    onclick={() => start(account)}
                    ><KeyRound size={16} aria-hidden="true" />{t("ตั้งรหัสผ่านใหม่", "Reset password")}</button
                  ></td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
    </section>{/if}
  {#if data.canManage && availabilityError}<div class="k-banner">
      <Info size={16} />
      <div>
        <strong
          >{t(
            "ไม่สามารถสร้างบัญชีแบบอีเมลและรหัสผ่านได้ในขณะนี้",
            "Email and password accounts are unavailable",
          )}</strong
        >
        <p>{availabilityError}</p>
        <p>
          {t(
            "หากองค์กรใช้วิธีเข้าสู่ระบบอื่น สมาชิกจะแสดงในรายชื่อหลังจากเข้าสู่ระบบครั้งแรก",
            "If your organization uses another sign-in method, members appear after their first sign-in.",
          )}
        </p>
      </div>
    </div>{/if}
  <p class="k-small k-muted team-footnote">
    {t(
      "บทบาทผู้ดูแลระบบไม่ได้ให้สิทธิ์เข้าถึงข้อมูลโดยอัตโนมัติ หากต้องการให้ผู้ใดเข้าถึงข้อมูล กรุณาเพิ่มเป็นสมาชิกในการตั้งค่าพื้นที่ทำงาน AI",
      "The Admin role does not grant data access automatically. To give someone access, add them as a member in the AI workspace settings.",
    )}
  </p>
{/if}

<style>
  .team-heading {
    flex: 1 1 360px;
    min-width: 0;
  }
  .team-heading-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    flex: none;
  }
  /* Role summary */
  .team-role-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 20px;
  }
  .team-role-overview article {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .team-role-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--orca-radius);
    background: var(--orca-secondary);
    color: var(--orca-nav);
  }
  .team-role-overview article > div {
    flex: 1;
    min-width: 0;
  }
  .team-role-overview strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
  }
  .team-role-overview p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.55;
  }
  .team-role-count {
    flex: none;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }
  .team-role-note {
    margin: 0 0 14px;
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
  /* Add or reset an account */
  .team-form {
    margin-bottom: 20px;
  }
  .team-form h2 {
    margin: 0 0 14px;
  }
  .team-form-hint {
    margin: 0;
  }
  .team-form-note {
    margin: 14px 0 0;
  }
  .team-form-actions {
    margin-top: 16px;
  }
  /* Filters */
  .team-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
    align-items: end;
    gap: 12px;
    margin: 0 0 16px;
  }
  .team-toolbar.compact {
    grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
  }
  .team-filters {
    display: contents;
  }
  .team-toolbar .k-field {
    margin: 0;
  }
  /* Members table */
  .team-table-wrap {
    overflow-x: auto;
  }
  table.team-table {
    min-width: 0;
  }
  .team-table th {
    white-space: nowrap;
  }
  .team-table-wrap .team-table td,
  .team-pending-table .team-table td {
    vertical-align: middle;
  }
  .team-member {
    min-width: 200px;
  }
  .team-member strong {
    display: block;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .team-member p {
    margin: 1px 0 0;
    overflow-wrap: anywhere;
  }
  .role-badge {
    display: block;
    font-weight: 500;
    white-space: nowrap;
  }
  .role-locked {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .team-role .team-role-change {
    display: inline-block;
    margin-top: 2px;
    padding: 0;
    font-size: 13px;
    white-space: nowrap;
    text-decoration-color: var(--orca-line-strong);
  }
  .team-role .team-role-change:hover {
    text-decoration-color: currentColor;
  }
  .team-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-width: 220px;
  }
  .department-badge {
    display: inline-block;
    max-width: 100%;
    padding: 1px 8px;
    overflow: hidden;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.6;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .team-none,
  .team-account-note {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .team-hub-link {
    display: block;
    max-width: 240px;
    overflow: hidden;
    color: var(--orca-ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .team-hub-link:hover {
    text-underline-offset: 3px;
  }
  .team-account-note {
    display: block;
    max-width: 180px;
    line-height: 1.5;
  }
  .team-icon-button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .team-icon-button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .team-actions-col {
    width: 1%;
    white-space: nowrap;
  }
  .team-actions-col .team-account-note {
    max-width: none;
    white-space: nowrap;
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
  /* Accounts waiting for their first sign-in */
  .team-pending {
    margin-top: 20px;
    overflow: hidden;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .team-pending-head {
    padding: 16px 18px 14px;
  }
  .team-pending-head .k-section-title {
    justify-content: flex-start;
    gap: 8px;
    margin: 0;
  }
  .team-pending-head p {
    margin: 2px 0 0;
  }
  .team-pending-table {
    overflow-x: auto;
    border-top: 1px solid var(--orca-line);
  }
  .team-footnote {
    margin: 20px 0 0;
  }
  @media (max-width: 1100px) {
    .team-toolbar {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .team-toolbar.compact {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .team-toolbar .team-search {
      grid-column: 1 / -1;
    }
    .team-role-overview {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    /* Member rows stack on narrower screens: name and role, then departments, workspaces and actions. */
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
      gap: 8px 12px;
      padding: 12px 14px;
      border-bottom: 1px solid #eff0f2;
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
      min-width: 0;
    }
    .team-role {
      text-align: end;
    }
    .team-departments,
    .team-hubs {
      grid-column: 1 / -1;
    }
    .team-chips {
      max-width: none;
    }
    .team-hub-link {
      max-width: 100%;
    }
    .team-table-wrap .team-actions-col {
      width: auto;
      justify-self: end;
    }
  }
  @media (max-width: 760px) {
    .team-heading-actions {
      width: 100%;
    }
    .team-heading-actions > * {
      flex: 1 1 auto;
    }
    .team-toolbar,
    .team-toolbar.compact {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
