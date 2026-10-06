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
              "บริษัทต้องมีเจ้าของบริษัทอย่างน้อย 1 คน ตั้งคนอื่นเป็นเจ้าของบริษัทก่อน แล้วค่อยเปลี่ยนบทบาทนี้",
              "The company needs at least one company owner. Make someone else an owner before changing this role.",
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
              "ปิดแล้วเปิดหน้าแก้บทบาทอีกครั้งเพื่อดูบทบาทล่าสุด",
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
          >{t("บทบาทในบริษัท", "Company role")}</label
        >
        <select id="member-role" bind:value={role}>
          <option value="owner">{t("เจ้าของบริษัท", "Company owner")}</option><option value="admin"
            >{t("ผู้ดูแล", "Admin")}</option
          ><option value="employee">{t("พนักงาน", "Employee")}</option>
        </select>
      </div>
      <p class="role-help">
        {role === "owner"
          ? t(
              "ดูแลการตั้งค่าทั้งบริษัท และเปลี่ยนบทบาทของทุกคนได้",
              "Manages all company settings and everyone's role.",
            )
          : role === "admin"
            ? t(
                "จัดการโปรแกรมที่เชื่อม พื้นที่ทำงาน AI สมาชิก และแผนก แต่เปลี่ยนบทบาทไม่ได้",
                "Manages connected programs, AI workspaces, members and departments, but can't change roles.",
              )
            : t(
                "ใช้ AI ได้เฉพาะในพื้นที่ทำงานและความรู้ที่ได้รับสิทธิ์",
                "Uses AI only in the workspaces and knowledge they're given.",
              )}
      </p>
      {#if member.id === currentUserID && role !== "owner"}<p class="k-banner">
          {t(
            "คุณกำลังลดสิทธิ์ของตัวเอง หลังบันทึกคุณจะเปลี่ยนบทบาทไม่ได้อีก และต้องมีเจ้าของบริษัทคนอื่นอยู่",
            "You're lowering your own access. After saving you can't change roles, and another company owner must remain.",
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
	/* orca-type-remap v1 */
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
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .role-editor .k-field {
    max-width: 380px;
  }
  .role-help {
    margin: 8px 0 0;
    color: var(--orca-muted);
    font-size: 12.5px;
    line-height: 1.6;
  }
  .role-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
</style>
