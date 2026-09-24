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
              "องค์กรต้องมีเจ้าของระบบอย่างน้อยหนึ่งคน กรุณาแต่งตั้งสมาชิกคนอื่นเป็นเจ้าของระบบก่อนเปลี่ยนบทบาทนี้",
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
  <header class="role-editor-head">
    <h2>{t("บทบาทของ", "Role for")} {memberName(member)}</h2>
    <p>
      {member.email} · {t("บทบาทปัจจุบัน", "Current role")}: {memberRole(originalRole)}
    </p>
  </header>
  {#if error}<div class="k-banner error" role="alert">
      <Info size={16} />
      <div>
        {error}
        {#if staleRole}<p>
            {t(
              "กรุณาปิดแล้วเปิดการแก้ไขบทบาทอีกครั้งเพื่อแสดงบทบาทล่าสุด",
              "Close and reopen this editor to see the latest role.",
            )}
          </p>{/if}
      </div>
    </div>{/if}
  {#if saved}<div class="k-banner success" role="status">
      <Check size={16} />{t("บันทึกบทบาทแล้ว", "Role saved")}
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
          <option value="owner">{t("เจ้าของระบบ", "Owner")}</option><option value="admin"
            >{t("ผู้ดูแลระบบ", "Admin")}</option
          ><option value="employee">{t("สมาชิกทั่วไป", "Member")}</option>
        </select>
      </div>
      <p class="role-help">
        {role === "owner"
          ? t(
              "ดูแลการตั้งค่าทั้งหมดขององค์กรและกำหนดบทบาทของสมาชิก",
              "Manages all organization settings and member roles.",
            )
          : role === "admin"
            ? t(
                "จัดการระบบที่เชื่อมต่อ พื้นที่ทำงาน AI สมาชิก และแผนก แต่เปลี่ยนบทบาทของผู้ดูแลไม่ได้",
                "Manages connected systems, AI workspaces, members and departments, but cannot change administrative roles.",
              )
            : t(
                "ใช้งานได้เฉพาะพื้นที่ทำงาน AI เครื่องมือ และความรู้ที่ได้รับสิทธิ์",
                "Uses only assigned AI workspaces, tools and knowledge.",
              )}
      </p>
      {#if member.id === currentUserID && role !== "owner"}<p class="k-banner">
          {t(
            "คุณกำลังลดสิทธิ์ของตนเอง หลังบันทึกแล้วคุณจะจัดการบทบาทไม่ได้ และองค์กรต้องมีเจ้าของระบบคนอื่นอยู่",
            "You are reducing your own access. After saving, you will no longer manage roles, and another Owner must remain.",
          )}
        </p>{/if}
    </fieldset>
    <div class="role-actions">
      <button
        class="k-button primary"
        type="submit"
        disabled={saving || saved || role === organizationRole(originalRole)}
        >{saving
          ? t("กำลังบันทึก…", "Saving…")
          : t("บันทึกบทบาท", "Save role")}</button
      ><button class="k-button" type="button" disabled={saving} onclick={oncancel}
        >{t("ปิด", "Close")}</button
      >
    </div>
  </form>
</section>

<style>
  .role-editor {
    margin: 0 0 20px;
  }
  .role-editor-head {
    margin-bottom: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--orca-line);
  }
  .role-editor-head h2 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .role-editor-head p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .role-editor .k-field {
    max-width: 380px;
  }
  .role-help {
    margin: 8px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .role-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
</style>
