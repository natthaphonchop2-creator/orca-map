<script lang="ts">
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
  const currentUser = $derived(
    data.members.find((member) => member.id === data.currentUserID),
  );
  const canManageRoles = $derived(data.canManageRoles === true);
  const roleGroups = $derived([
    {
      id: "owner",
      label: "Owner",
      icon: Crown,
      detail: t(
        "ดูแลทั้งองค์กรและกำหนดบทบาท",
        "Manage the organization and roles",
      ),
    },
    {
      id: "admin",
      label: t("Admin องค์กร", "Organization admin"),
      icon: Shield,
      detail: t(
        "จัดการการเชื่อมต่อ สมาชิก และแผนก",
        "Manage connections, employees and departments",
      ),
    },
    {
      id: "employee",
      label: t("พนักงาน", "Employee"),
      icon: Users,
      detail: t(
        "ใช้งานตามพื้นที่และสิทธิ์ที่ได้รับ",
        "Use assigned workspaces and permissions",
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
            "เปลี่ยนรหัสผ่านแล้ว บัญชีนี้จะต้องเข้าสู่ระบบใหม่บนทุกอุปกรณ์",
            "Password updated. Previous sign-in sessions for this account have been ended.",
          )
        : t(
            "สร้างบัญชีแล้ว ให้ผู้ใช้เข้าสู่ระบบครั้งแรกก่อนเพิ่มเป็นสมาชิกในพื้นที่ทำงาน",
            "Account created. The user must sign in once before being assigned to a workspace.",
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
        "คัดลอกลิงก์แล้ว คุณสามารถนำไปส่งให้สมาชิกได้ ระบบยังไม่ได้ส่งข้อความหรืออีเมล",
        "Sign-in link copied. No message or email has been sent.",
      );
    } catch {
      error = t(
        "คัดลอกลิงก์ไม่สำเร็จ กรุณาเปิดหน้าเข้าสู่ระบบแล้วคัดลอก URL จากแถบที่อยู่ของเบราว์เซอร์",
        "Copy failed. Open the sign-in page and copy its address from the browser.",
      );
    }
  }
</script>

<div class="k-breadcrumb">
  <a href={localeHref("/app?view=workspaces")}
    >{t("พื้นที่ทำงาน", "Workspaces")}</a
  ><span>/</span><span>{t("สมาชิกและสิทธิ์", "Team & access")}</span>
</div>
<div class="k-intro">
  <div class="k-heading-row">
    <h1>
      {t("จัดการสมาชิกและสิทธิ์ของทีม", "The right access for your team")}
    </h1>
    {#if data.canManage && localAvailable && section === "members"}<button
        class="k-button primary"
        onclick={() => start()}
        ><Plus size={18} />{t("เพิ่มบัญชี", "Add account")}</button
      >{/if}
  </div>
  <p class="k-subtitle">
    {t(
      "กำหนดบทบาทในองค์กร จัดพนักงานตามแผนก และให้เข้าถึงงานตามหน้าที่",
      "Assign organization roles, organize departments and give each person the access their work needs.",
    )}
  </p>
</div>
<div class="team-role-overview">
  {#each roleGroups as group}<article>
      <group.icon size={20} />
      <div>
        <strong>{group.label}</strong>
        <p>{group.detail}</p>
      </div>
      <span
        >{data.members.filter(
          (member) => (!member.status || member.status === "active") && organizationRole(member.role) === group.id,
        ).length}</span
      >
    </article>{/each}
</div>
{#if !data.canManage}<div class="k-banner">
    <Info size={18} />{t(
      "บัญชีนี้ดูรายชื่อได้ แต่เปลี่ยนบทบาทหรือจัดแผนกไม่ได้ ติดต่อ Owner หรือ Admin องค์กรเพื่อปรับสิทธิ์",
      "This account cannot manage roles or departments. Contact an Owner or organization admin for access changes.",
    )}
  </div>{:else if !canManageRoles}<p class="k-small k-muted team-role-note">
    {organizationRole(currentUser?.role ?? "") === "admin"
      ? t(
          "Admin องค์กรจัดการสมาชิกและแผนกได้ การเปลี่ยนบทบาทให้ Owner เป็นผู้ดำเนินการ",
          "Organization admins manage employees and departments. An Owner manages roles.",
        )
      : t(
          "ระบบยังไม่ยืนยันสิทธิ์จัดการบทบาท กรุณารีเฟรชข้อมูลเพื่อตรวจสอบสิทธิ์ล่าสุด",
          "Role management permission has not been confirmed. Refresh to check the latest access.",
        )}
  </p>{/if}
<nav class="team-tabs" aria-label={t("จัดการทีม", "Team management")}>
  <button
    class:active={section === "members"}
    aria-pressed={section === "members"}
    disabled={departmentDirty || saving}
    onclick={() => changeSection("members")}
    ><Users size={17} />{t("สมาชิกและบทบาท", "Members & roles")}</button
  >
  {#if data.canManage}<button
      class:active={section === "departments"}
      aria-pressed={section === "departments"}
      disabled={departmentDirty || saving}
      onclick={() => changeSection("departments")}
      ><Building2 size={17} />{t("แผนก", "Departments")}<span
        >{data.units.filter((unit) => unit.kind === "department" && !unit.archivedAt && !unit.deletedAt).length}</span
      ></button
    >{/if}
</nav>
{#if navigationBlocked}<div class="k-banner" role="alert">
    <Info size={18} />{t(
      "มีการแก้ไขที่ยังไม่บันทึก กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนออกจากหน้านี้",
      "Save or discard your changes before leaving this page.",
    )}
  </div>{/if}
{#if section === "departments" && data.canManage}<div
    class="business-library k-panel"
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
      <Info size={18} />{error}
    </div>{/if}
  {#if success}<div class="k-banner success" role="status">
      <Check size={18} />{success}
    </div>{/if}
  {#if open && data.canManage && localAvailable}<form
      class="k-panel"
      style="margin-bottom:24px"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>
        {resetting
          ? t("ตั้งรหัสผ่านใหม่", "Set a new password")
          : t("สร้างบัญชีให้สมาชิก", "Add an account to this installation")}
      </h2>
      <fieldset disabled={saving}>
        <div class="k-grid-2 k-section">
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
            <p class="k-small k-muted">
              {t(
                `อย่างน้อย ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} ตัวอักษร`,
                `At least ${LOCAL_AUTH_MIN_PASSWORD_LENGTH} characters`,
              )}
            </p>
          </div>
        </div>
        <p class="k-small k-muted" style="margin-top:14px">
          {t(
            "กรุณาส่งข้อมูลเข้าสู่ระบบให้สมาชิกผ่านช่องทางที่เหมาะสมด้วยตนเอง แบบฟอร์มนี้ไม่ส่งอีเมลหรือคำเชิญโดยอัตโนมัติ",
            "Share sign-in details with the user through an appropriate channel. This form does not send email or invitations.",
          )}
        </p>
        <div class="k-actions" style="margin-top:18px">
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

  <div class="k-heading-row" style="margin-bottom:22px">
    <div class="k-field" style="width:min(440px,100%)">
      <label for="team-search">{t("ค้นหาสมาชิก", "Search team")}</label><input
        id="team-search"
        type="search"
        bind:value={query}
        placeholder={t("ชื่อหรืออีเมล", "Name or email")}
      />
    </div>
    <div class="team-filters">
      <div class="k-field"><label for="member-status">{t('สถานะสมาชิก','Member status')}</label><select id="member-status" bind:value={memberStatus}><option value="active">{t('ใช้งานอยู่','Active')}</option><option value="suspended">{t('ระงับแล้ว','Suspended')}</option></select></div>
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
            ><option value="none">{t("ยังไม่ระบุแผนก", "Unassigned")}</option
            >{#each data.units.filter((unit) => unit.kind === "department" && !unit.archivedAt && !unit.deletedAt) as unit}<option
                value={unit.id}>{unit.name}</option
              >{/each}</select
          >
        </div>{/if}
    </div>
    {#if data.canManage}<div class="k-actions">
        <button
          class="k-button"
          disabled={loading || saving}
          onclick={async () => {
            await refresh();
            await onchanged();
            await refreshDepartments();
          }}><RefreshCw size={16} />{t("รีเฟรชข้อมูล", "Refresh")}</button
        ><button class="k-button quiet" onclick={copyLogin}
          ><Copy size={15} />{t(
            "คัดลอกลิงก์เข้าสู่ระบบ",
            "Sign-in link",
          )}</button
        >
      </div>{/if}
  </div>
  {#if departmentError}<div class="k-banner" role="alert">
      <Info size={17} />{t(
        "โหลดรายชื่อแผนกไม่สำเร็จ",
        "Could not load departments",
      )}: {departmentError}
    </div>{/if}
  {#if members.length}<div class="k-table-wrap">
      <table class="k-table">
        <thead
          ><tr
            ><th>{t("สมาชิกที่เคยเข้าสู่ระบบ", "Signed-in members")}</th><th
              >{t("บทบาท", "Role")}</th
            >{#if data.canManage}<th>{t("แผนก", "Department")}</th>{/if}<th
              >{t("พื้นที่ทำงาน", "Workspaces")}</th
            >{#if data.canManage && localAvailable}<th
                >{t("บัญชี", "Account")}</th
              >{/if}{#if data.canManage}<th>{t('จัดการสมาชิก', 'Manage member')}</th>{/if}</tr
          ></thead
        ><tbody
          >{#each members as member (member.id)}<tr
              ><td
                ><strong>{memberName(member)}</strong>
                <p class="k-small k-muted">{member.email}</p></td
              ><td
                ><span class="role-badge">{memberRole(member.role)}</span
                >{#if member.roleLocked}<small class="role-locked"
                    >{t(
                      "กำหนดจากการตั้งค่าระบบ",
                      "Set by system configuration",
                    )}</small
                  >{:else if canManageRoles && typeof member.role === "number" && (!member.status || member.status === "active")}<button
                    class="k-link-button"
                    onclick={() => (editingRole = member)}
                    >{t("เปลี่ยนบทบาท", "Change role")}</button
                  >{/if}</td
              >{#if data.canManage}<td
                  >{#each departments.filter( (department) => department.memberIDs.includes(member.id), ) as department}<span
                      class="department-badge"
                      >{data.units.find((unit) => unit.id === department.unitID)
                        ?.name || department.name}</span
                    >{:else}<span class="k-muted"
                      >{departmentError
                        ? "—"
                        : t("ยังไม่ระบุ", "Unassigned")}</span
                    >{/each}</td
                >{/if}<td
                >{#each data.hubs.filter( (hub) => hub.memberIDs.includes(member.id), ) as hub}<a
                    href={localeHref(
                      `/app?view=hub&hub=${encodeURIComponent(hub.id)}`,
                    )}
                    style="display:block">{hub.name}</a
                  >{:else}<span class="k-muted"
                    >{t(
                      "ยังไม่มีสิทธิ์เข้าถึงพื้นที่ทำงาน",
                      "No workspace access yet",
                    )}</span
                  >{/each}</td
              >{#if data.canManage && localAvailable}{@const account =
                  accounts.find(
                    (item) =>
                      normalized(item.email) === normalized(member.email),
                  )}<td
                  >{#if account && passwordAllowed(member)}<button
                      class="k-button quiet small"
                      onclick={() => start(account)}
                      ><KeyRound size={14} />{t(
                        "ตั้งรหัสผ่านใหม่",
                        "Reset password",
                      )}</button
                    >{:else}<span class="k-small k-muted"
                      >{member.status === 'suspended'
                        ? t('บัญชีถูกระงับ', 'Account suspended')
                        : account
                          ? t(
                              "บัญชีผู้ดูแล · จำกัดสิทธิ์",
                              "Protected administrator account",
                            )
                          : t(
                              "บัญชีจากผู้ให้บริการยืนยันตัวตน",
                              "Identity provider account",
                            )}</span
                    >{/if}</td
                >{/if}{#if data.canManage}<td>
                  {#if canManageMember(member)}<TeamLifecycleActions kind="member" id={member.id} name={memberName(member)} version={member.version ?? 0} inactive={member.status === 'suspended'} disabled={saving || !!editingRole || open} onbusy={(value) => saving = value} onchanged={memberChanged} />
                  {:else}<span class="k-small k-muted">{member.id === data.currentUserID ? t('บัญชีของคุณ', 'Your account') : t('จำกัดสิทธิ์ผู้ดูแล', 'Administrator access required')}</span>{/if}
                </td>{/if}</tr
            >{/each}</tbody
        >
      </table>
    </div>{:else}<div class="k-empty">
      <Users size={32} />
      <h2>{t("ไม่พบสมาชิก", "No members found")}</h2>
      <p>{t("ลองค้นหาด้วยชื่อหรืออีเมลอื่น", "Try another name or email.")}</p>
    </div>{/if}
  {#if data.canManage && pending.length}<section class="k-section">
      <div class="k-section-title">
        <h2>{t("รอเข้าสู่ระบบครั้งแรก", "Waiting for first sign-in")}</h2>
        <span class="k-badge">{pending.length}</span>
      </div>
      <p class="k-small k-muted" style="margin-bottom:15px">
        {t(
          "บัญชีเหล่านี้พร้อมให้เข้าสู่ระบบแล้ว แต่ยังเพิ่มเข้าพื้นที่ทำงานไม่ได้ ให้สมาชิกเข้าสู่ระบบครั้งแรก แล้วกดรีเฟรชข้อมูล",
          "These accounts exist but cannot be assigned yet. Ask each user to sign in, then refresh the list.",
        )}
      </p>
      <div class="k-table-wrap">
        <table class="k-table">
          <thead
            ><tr
              ><th>{t("อีเมล", "Email")}</th><th>{t("สถานะ", "Status")}</th><th
                >{t("จัดการ", "Manage")}</th
              ></tr
            ></thead
          ><tbody
            >{#each pending as account}<tr
                ><td>{account.email}</td><td
                  ><span class="k-badge paused"
                    >{t("รอเข้าสู่ระบบ", "Pending sign-in")}</span
                  ></td
                ><td
                  ><button
                    class="k-button quiet small"
                    disabled={organizationRole(currentUser?.role ?? "") !==
                      "owner"}
                    onclick={() => start(account)}
                    >{t("ตั้งรหัสผ่านใหม่", "Reset password")}</button
                  ></td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
    </section>{/if}
  {#if data.canManage && availabilityError}<div class="k-banner">
      <Info size={18} />
      <div>
        <strong
          >{t(
            "ยังสร้างบัญชีแบบอีเมลและรหัสผ่านไม่ได้",
            "Password account creation is unavailable",
          )}</strong
        >
        <p>{availabilityError}</p>
        <p>
          {t(
            "หากองค์กรใช้ผู้ให้บริการยืนยันตัวตนอื่น รายชื่อสมาชิกจะแสดงหลังเข้าสู่ระบบครั้งแรก",
            "If your organization uses another identity provider, accounts appear after their first sign-in.",
          )}
        </p>
      </div>
    </div>{/if}
  <p class="k-small k-muted" style="margin-top:22px">
    {t(
      "สิทธิ์ผู้ดูแลไม่ได้ให้สิทธิ์อ่านข้อมูลโดยอัตโนมัติ หากต้องการให้ใครเข้าถึงข้อมูล ให้เพิ่มเป็นสมาชิกในการตั้งค่าพื้นที่ทำงาน",
      "Administrators do not receive data access automatically. Assign the intended members in workspace settings.",
    )}
  </p>
{/if}

<style>
  .team-role-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin: 22px 0;
  }
  .team-role-overview article {
    display: flex;
    gap: 12px;
    align-items: start;
    min-width: 0;
    padding: 19px;
    border: 1px solid #e0e5ec;
    border-radius: 14px;
    background: white;
  }
  .team-role-overview article > :global(svg) {
    color: #5c7635;
    flex: 0 0 auto;
  }
  .team-role-overview article div {
    min-width: 0;
    flex: 1;
  }
  .team-role-overview strong {
    font-size: 14px;
  }
  .team-role-overview p {
    color: #677287;
    font-size: 12px;
    line-height: 1.6;
    margin-top: 6px;
  }
  .team-role-overview article > span {
    font-size: 21px;
    font-weight: 750;
  }
  .team-role-note {
    margin-bottom: 14px;
  }
  .team-tabs {
    display: flex;
    gap: 7px;
    border-bottom: 1px solid #dfe4ec;
    margin-bottom: 24px;
  }
  .team-tabs button {
    display: flex;
    align-items: center;
    gap: 9px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: transparent;
    padding: 13px 17px;
    font: inherit;
    color: #637087;
  }
  .team-tabs button.active {
    color: #263420;
    border-bottom-color: #bfe35d;
    font-weight: 700;
  }
  .team-tabs button span {
    font-size: 12px;
    background: #eef2e7;
    border-radius: 7px;
    padding: 1px 6px;
  }
  .team-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .team-filters .k-field {
    min-width: 160px;
    margin-top: 0;
  }
  .role-badge {
    display: block;
    font-weight: 650;
    white-space: nowrap;
  }
  .role-locked {
    display: block;
    color: #718096;
    font-size: 10px;
    margin-top: 5px;
  }
  .department-badge {
    display: inline-block;
    padding: 3px 7px;
    margin: 2px;
    border-radius: 6px;
    background: #eef3e6;
    color: #526832;
    font-size: 12px;
  }
  @media (max-width: 850px) {
    .team-role-overview {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .team-role-overview article {
      padding: 14px;
    }
    .team-role-overview p {
      margin-top: 2px;
    }
  }
</style>
