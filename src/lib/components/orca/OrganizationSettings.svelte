<script lang="ts">
  import { t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    orcaError,
    unitLabels,
    type OrcaBootstrap,
    type OrcaUnit,
    type UnitKind,
  } from "$lib/services/orca";
  import { Building2, Check, Info, Pencil, Plus } from "@lucide/svelte";
  import { untrack } from "svelte";

  let {
    data,
    onchanged,
  }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
  let displayName = $state(untrack(() => data.organization.displayName));
  let logoDataURL = $state(untrack(() => data.organization.logoDataURL ?? ""));
  let logoBusy = $state(false);
  let organizationVersion = $state(untrack(() => data.organization.version));
  let orgBusy = $state(false);
  let unitBusy = $state(false);
  let error = $state("");
  let success = $state("");
  let editingUnit = $state<OrcaUnit>();
  let unitName = $state("");
  let kind = $state<UnitKind>("team");
  let parentID = $state("");
  let unitForm = $state(false);
  async function saveOrganization() {
    if (orgBusy || logoBusy) return;
    orgBusy = true;
    error = "";
    success = "";
    try {
      const saved = await OrcaService.organization(
        displayName.trim(),
        organizationVersion,
        logoDataURL,
      );
      organizationVersion = saved.version;
      logoDataURL = saved.logoDataURL ?? "";
      await onchanged();
      success = t("บันทึกข้อมูลองค์กรแล้ว", "Organization details saved.");
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      orgBusy = false;
    }
  }
  async function selectLogo(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !data.canManage || orgBusy || logoBusy) return;
    error = "";
    success = "";
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 128 * 1024
    ) {
      error = t(
        "กรุณาเลือกไฟล์ PNG หรือ JPG ขนาดไม่เกิน 128 KB",
        "Choose a PNG or JPG file up to 128 KB.",
      );
      input.value = "";
      return;
    }
    logoBusy = true;
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("image"));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = value;
      await image.decode();
      if (image.naturalWidth > 1024 || image.naturalHeight > 1024) {
        error = t(
          "โลโก้ต้องมีขนาดไม่เกิน 1024 × 1024 พิกเซล",
          "The logo must be no larger than 1024 × 1024 pixels.",
        );
        return;
      }
      logoDataURL = value;
    } catch {
      error = t(
        "ไม่สามารถเปิดไฟล์รูปภาพนี้ได้ กรุณาเลือกไฟล์ PNG หรือ JPG อื่น",
        "This image could not be opened. Choose another PNG or JPG file.",
      );
    } finally {
      input.value = "";
      logoBusy = false;
    }
  }
  function editUnit(unit?: OrcaUnit) {
    editingUnit = unit;
    unitName = unit?.name ?? "";
    kind = unit?.kind ?? "team";
    parentID = unit?.parentID ?? "";
    unitForm = true;
    error = "";
    success = "";
  }
  async function saveUnit() {
    if (unitBusy) return;
    unitBusy = true;
    error = "";
    success = "";
    try {
      await OrcaService.unit(
        {
          name: unitName.trim(),
          kind,
          parentID,
          ...(editingUnit ? { version: editingUnit.version } : {}),
        },
        editingUnit?.id,
      );
      await onchanged();
      unitForm = false;
      success = t("บันทึกแผนกแล้ว", "Department saved.");
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      unitBusy = false;
    }
  }
  async function reload() {
    await onchanged();
    displayName = data.organization.displayName;
    logoDataURL = data.organization.logoDataURL ?? "";
    organizationVersion = data.organization.version;
    if (editingUnit)
      editUnit(data.units.find((unit) => unit.id === editingUnit?.id));
    error = "";
  }
</script>

<div class="k-intro">
  <h1>{t("ข้อมูลองค์กร", "Organization")}</h1>
  <p class="k-subtitle">
    {t(
      "จัดการข้อมูลและโครงสร้างขององค์กร",
      "Manage your organization details and structure.",
    )}
  </p>
</div>
{#if error}<div class="k-banner error" role="alert">
    <Info size={16} />
    <div>
      {error}
      <div class="k-actions">
        <button
          class="k-link-button"
          disabled={orgBusy || unitBusy}
          onclick={reload}>{t("โหลดข้อมูลล่าสุด", "Reload latest data")}</button
        >
      </div>
    </div>
  </div>{/if}
{#if success}<div class="k-banner success" role="status">
    <Check size={16} />{success}
  </div>{/if}
<section class="org-panel" aria-labelledby="organization-details-title">
  <header class="org-panel-head">
    <h2 id="organization-details-title">{t("ข้อมูลองค์กร", "Organization details")}</h2>
  </header>
  <form
    class="org-panel-body"
    onsubmit={(event) => {
      event.preventDefault();
      void saveOrganization();
    }}
  >
    <fieldset disabled={!data.canManage || orgBusy || logoBusy}>
      <div class="organization-logo-row">
        <div class="organization-logo-preview">
          {#if logoDataURL}<img
              src={logoDataURL}
              alt={t("โลโก้องค์กร", "Organization logo")}
            />{:else}<Building2 size={20} />{/if}
        </div>
        <div class="k-field organization-logo-field">
          <label for="organization-logo"
            >{t("โลโก้องค์กร", "Organization logo")}</label
          >
          {#if data.canManage}<input
              id="organization-logo"
              type="file"
              accept="image/png,image/jpeg"
              onchange={selectLogo}
            />{/if}
        </div>
        {#if data.canManage && logoDataURL}<button
            class="k-button small"
            type="button"
            onclick={() => (logoDataURL = "")}
            >{t("ลบโลโก้", "Remove logo")}</button
          >{/if}
      </div>
      <div class="k-grid-2">
        <div class="k-field">
          <label for="organization-name"
            >{t("ชื่อองค์กร", "Organization name")}</label
          ><input
            id="organization-name"
            bind:value={displayName}
            maxlength="100"
            required
          />
        </div>
        <div class="k-field">
          <label for="organization-timezone">{t("เขตเวลา", "Time zone")}</label
          ><input
            id="organization-timezone"
            readonly
            value={t("ประเทศไทย · Asia/Bangkok", "Thailand · Asia/Bangkok")}
          />
        </div>
      </div>
      {#if data.canManage}<button
          class="k-button primary org-save"
          type="submit"
          disabled={orgBusy || logoBusy || !displayName.trim()}
          >{orgBusy
            ? t("กำลังบันทึก…", "Saving…")
            : t("บันทึกข้อมูลองค์กร", "Save organization details")}</button
        >{/if}
    </fieldset>
  </form>
  <p class="org-panel-note">
    {t(
      "ORCA ชุดนี้ใช้สำหรับองค์กรเดียว บัญชีและสิทธิ์ของสมาชิกจัดการแยกจากโครงสร้างองค์กร",
      "This ORCA installation serves one organization. Member accounts and access are managed separately from the organization structure.",
    )}
  </p>
</section>
<section class="org-panel" aria-labelledby="organization-structure-title">
  <header class="org-panel-head">
    <div class="org-panel-copy">
      <h2 id="organization-structure-title">
        {t("โครงสร้างองค์กร", "Organization structure")}<span class="org-count">{data.units.length}</span>
      </h2>
      <p>
        {t(
          "ใช้แผนกเพื่อจัดกลุ่มพื้นที่ทำงาน AI ตามโครงสร้างองค์กร สมาชิกยังคงเข้าถึงข้อมูลได้เฉพาะพื้นที่ทำงานที่ได้รับสิทธิ์",
          "Use departments to group AI workspaces by organization structure. Members can access data only in the workspaces assigned to them.",
        )}
      </p>
    </div>
    {#if data.canManage}<button
        class="k-button small"
        disabled={unitBusy}
        onclick={() => editUnit()}
        ><Plus size={16} />{t("เพิ่มแผนก", "Add department")}</button
      >{/if}
  </header>
  {#if unitForm && data.canManage}<form
      class="org-unit-form"
      onsubmit={(event) => {
        event.preventDefault();
        void saveUnit();
      }}
    >
      <h3>
        {editingUnit
          ? t("แก้ไขแผนก", "Edit department")
          : t("เพิ่มแผนก", "Add department")}
      </h3>
      <fieldset disabled={unitBusy}>
        <div class="k-grid-2">
          <div class="k-field">
            <label for="unit-name">{t("ชื่อแผนก", "Department name")}</label
            ><input
              id="unit-name"
              bind:value={unitName}
              required
              maxlength="100"
            />
          </div>
          <div class="k-field">
            <label for="unit-kind">{t("ประเภท", "Type")}</label><select
              id="unit-kind"
              bind:value={kind}
              >{#each Object.entries(unitLabels) as [value, label]}<option
                  {value}>{label}</option
                >{/each}</select
            >
          </div>
        </div>
        <div class="k-field org-parent-field">
          <label for="unit-parent">{t("สังกัด", "Parent department")}</label><select
            id="unit-parent"
            bind:value={parentID}
            ><option value=""
              >{t(
                "ขึ้นตรงกับองค์กร",
                "Directly under the organization",
              )}</option
            >{#each data.units.filter((unit) => unit.id !== editingUnit?.id) as unit}<option
                value={unit.id}>{unit.name}</option
              >{/each}</select
          >
        </div>
        <div class="k-actions org-form-actions">
          <button
            class="k-button primary"
            type="submit"
            disabled={unitBusy || !unitName.trim()}
            >{unitBusy
              ? t("กำลังบันทึก…", "Saving…")
              : t("บันทึกแผนก", "Save department")}</button
          ><button
            class="k-button"
            type="button"
            disabled={unitBusy}
            onclick={() => (unitForm = false)}>{t("ยกเลิก", "Cancel")}</button
          >
        </div>
      </fieldset>
    </form>{/if}
  {#if data.units.length}<div class="org-table-wrap">
      <table class="org-table">
        <thead
          ><tr
            ><th scope="col">{t("แผนก", "Department")}</th><th scope="col"
              >{t("ประเภท", "Type")}</th
            ><th scope="col">{t("สังกัด", "Parent department")}</th>{#if data.canManage}<th scope="col" class="org-actions-col"
                >{t("การจัดการ", "Actions")}</th
              >{/if}</tr
          ></thead
        ><tbody
          >{#each data.units as unit}<tr
              ><td class="org-unit-name">{unit.name}</td><td>{unitLabels[unit.kind]}</td><td class="org-muted"
                >{data.units.find((parent) => parent.id === unit.parentID)
                  ?.name || data.organization.displayName}</td
              >{#if data.canManage}<td class="org-actions-col"
                  ><button
                    class="org-icon-button"
                    disabled={unitBusy}
                    aria-label={t(`แก้ไข ${unit.name}`, `Edit ${unit.name}`)}
                    title={t("แก้ไข", "Edit")}
                    onclick={() => editUnit(unit)}
                    ><Pencil size={16} aria-hidden="true" /></button
                  ></td
                >{/if}</tr
            >{/each}</tbody
        >
      </table>
    </div>{:else}<div class="org-empty">
      <Building2 size={28} />
      <h3>{t("ยังไม่มีแผนก", "No departments yet")}</h3>
      <p>
        {t(
          "เพิ่มแผนกเพื่อจัดกลุ่มพื้นที่ทำงาน AI ให้ค้นหาได้ง่ายขึ้น",
          "Add departments to group AI workspaces and make them easier to find.",
        )}
      </p>
    </div>{/if}
</section>

<style>
  .org-panel {
    min-width: 0;
    margin-bottom: 16px;
    overflow: hidden;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .org-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--orca-line);
  }
  .org-panel-head h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .org-panel-copy {
    min-width: 0;
  }
  .org-panel-copy p {
    max-width: 72ch;
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .org-panel-head :global(.k-button) {
    flex: none;
  }
  .org-count {
    display: inline-grid;
    place-items: center;
    min-width: 24px;
    height: 22px;
    padding: 0 7px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
  }
  .org-panel-body {
    padding: 18px;
  }
  .org-save {
    margin-top: 18px;
  }
  .org-panel-note {
    margin: 0;
    padding: 12px 18px;
    border-top: 1px solid var(--orca-line);
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .organization-logo-row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 12px 16px;
    margin-bottom: 18px;
  }
  .organization-logo-preview {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface-2);
    color: var(--orca-subtle);
  }
  .organization-logo-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .organization-logo-field {
    flex: 1 1 220px;
    min-width: 0;
    max-width: 360px;
    margin: 0;
  }
  #organization-logo {
    width: 100%;
    padding: 3px 4px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  #organization-logo::file-selector-button {
    height: 28px;
    margin-right: 10px;
    padding: 0 10px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-sm);
    background: var(--orca-surface);
    color: var(--orca-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .org-unit-form {
    padding: 16px 18px 18px;
    border-bottom: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
  }
  .org-unit-form h3 {
    margin: 0 0 12px;
  }
  .org-parent-field {
    margin-top: 16px;
  }
  .org-form-actions {
    margin-top: 16px;
  }
  .org-table-wrap {
    overflow-x: auto;
  }
  .org-table {
    width: 100%;
    border-collapse: collapse;
  }
  .org-table th {
    height: 40px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
    color: var(--orca-nav);
    font-size: 13px;
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .org-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #eff0f2;
    font-size: 14px;
    vertical-align: middle;
  }
  .org-table tbody tr:last-child td {
    border-bottom: 0;
  }
  .org-table tbody tr:hover td {
    background: var(--orca-surface-2);
  }
  .org-unit-name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .org-muted {
    color: var(--orca-muted);
  }
  .org-actions-col {
    width: 1%;
    text-align: end;
    white-space: nowrap;
  }
  .org-icon-button {
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
  .org-icon-button:hover:not(:disabled) {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .org-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 40px 24px;
    color: var(--orca-subtle);
    text-align: center;
  }
  .org-empty h3 {
    margin: 4px 0 0;
    color: var(--orca-ink);
    font-size: 15px;
  }
  .org-empty p {
    max-width: 460px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13.5px;
  }
  @media (max-width: 760px) {
    .org-panel-head {
      flex-wrap: wrap;
      padding: 14px 16px;
    }
    .org-panel-body,
    .org-unit-form {
      padding: 16px;
    }
  }
</style>
