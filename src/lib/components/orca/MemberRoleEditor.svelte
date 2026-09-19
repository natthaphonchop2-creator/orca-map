<script lang="ts">
  import { parseErrorContent } from "$lib/errors";
  import { t } from "$lib/orca/locale.svelte";
  import {
    organizationRole,
    memberRoleConflict,
    type OrganizationRole,
  } from "$lib/orca/member-access";
  import {
    OrcaService,
    orcaError,
    memberName,
    memberRole,
    type OrcaMember,
  } from "$lib/services/orca";
  import { Check, Info } from "@lucide/svelte";
  import { untrack } from "svelte";
  let {
    member,
    currentUserID,
    onchanged,
    oncancel,
  }: {
    member: OrcaMember;
    currentUserID: string;
    onchanged: () => Promise<void>;
    oncancel: () => void;
  } = $props();
  let role = $state<OrganizationRole>(
    untrack(() => organizationRole(member.role) ?? "employee"),
  );
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);
  let staleRole = $state(false);
  const originalRole = untrack(() => member.role);
  async function save() {
    if (saving || typeof originalRole !== "number" || member.roleLocked) return;
    saving = true;
    error = "";
    staleRole = false;
    try {
      await OrcaService.updateMemberRole(member.id, role, originalRole);
      saved = true;
      await onchanged();
    } catch (cause) {
      const conflict = memberRoleConflict(parseErrorContent(cause));
      staleRole = conflict === "stale";
      if (staleRole) await onchanged();
      error =
        conflict === "last-owner"
          ? t(
              "องค์กรต้องมี Owner อย่างน้อยหนึ่งคน กรุณาตั้งสมาชิกคนอื่นเป็น Owner ก่อนเปลี่ยนบทบาทนี้",
              "Your organization needs at least one Owner. Appoint another Owner before changing this role.",
            )
          : orcaError(cause);
    } finally {
      saving = false;
    }
  }
</script>

<section
  class="k-panel role-editor"
  aria-label={t("เปลี่ยนบทบาทสมาชิก", "Change member role")}
>
  <h2>{t("บทบาทของ", "Role for")} {memberName(member)}</h2>
  <p class="k-small k-muted">
    {member.email} · {t("ปัจจุบัน", "Current")}: {memberRole(originalRole)}
  </p>
  {#if error}<div class="k-banner error" role="alert">
      <Info size={17} />
      <div>
        {error}
        {#if staleRole}<p>
            {t(
              "ให้ปิดแล้วเปิดรายการนี้ใหม่เพื่อใช้บทบาทล่าสุด",
              "Close and reopen this editor to use the latest role.",
            )}
          </p>{/if}
      </div>
    </div>{/if}
  {#if saved}<div class="k-banner success" role="status">
      <Check size={17} />{t("บันทึกบทบาทแล้ว", "Role saved")}
    </div>{/if}
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <fieldset disabled={saving || saved}>
      <div class="k-field">
        <label for="member-role"
          >{t("บทบาทในองค์กร", "Organization role")}</label
        >
        <select id="member-role" bind:value={role}>
          <option value="owner">Owner</option><option value="admin"
            >{t("Admin องค์กร", "Organization admin")}</option
          ><option value="employee">{t("พนักงาน", "Employee")}</option>
        </select>
      </div>
      <p class="k-small k-muted role-help">
        {role === "owner"
          ? t(
              "ดูแลการตั้งค่าทั้งองค์กรและกำหนดบทบาทสมาชิก",
              "Manage all organization settings and member roles.",
            )
          : role === "admin"
            ? t(
                "จัดการการเชื่อมต่อ พื้นที่ทำงาน สมาชิก และแผนก โดยเปลี่ยนบทบาทผู้ดูแลไม่ได้",
                "Manage connections, workspaces, employees and departments without changing administrative roles.",
              )
            : t(
                "ใช้งานเฉพาะพื้นที่ เครื่องมือ และความรู้ที่ได้รับสิทธิ์",
                "Use only assigned workspaces, tools and knowledge.",
              )}
      </p>
      {#if member.id === currentUserID && role !== "owner"}<p class="k-banner">
          {t(
            "คุณกำลังลดสิทธิ์ของตัวเอง หลังบันทึกจะจัดการบทบาทไม่ได้ และองค์กรต้องมี Owner คนอื่นอยู่",
            "You are reducing your own access. Another Owner is required, and you will no longer manage roles after saving.",
          )}
        </p>{/if}
      <button
        class="k-button primary"
        type="submit"
        disabled={saving || saved || role === organizationRole(originalRole)}
        >{saving
          ? t("กำลังบันทึก…", "Saving…")
          : t("บันทึกบทบาท", "Save role")}</button
      >
    </fieldset>
  </form>
  <button class="k-button quiet" disabled={saving} onclick={oncancel}
    >{t("ปิด", "Close")}</button
  >
</section>

<style>
  .role-editor {
    margin-block: 20px;
  }
  .role-editor form {
    margin-block: 18px 10px;
  }
  .role-editor .k-field {
    max-width: 380px;
  }
  .role-help {
    margin-block: 12px 20px;
  }
</style>
