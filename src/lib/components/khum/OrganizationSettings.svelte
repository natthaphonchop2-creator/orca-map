<script lang="ts">
  import { t, localeHref } from "$lib/orca/locale.svelte";
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
      success = t("บันทึกข้อมูลองค์กรแล้ว", "Organization saved");
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
        "เลือกไฟล์ PNG หรือ JPG ขนาดไม่เกิน 128 KB",
        "Choose a PNG or JPG up to 128 KB",
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
          "Logo must be at most 1024 × 1024 pixels",
        );
        return;
      }
      logoDataURL = value;
    } catch {
      error = t(
        "เปิดรูปนี้ไม่ได้ กรุณาเลือก PNG หรือ JPG ใหม่",
        "Cannot open this image. Choose another PNG or JPG",
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
      success = t("บันทึกหน่วยงานแล้ว", "Unit saved");
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

<div class="k-breadcrumb">
  <a href={localeHref("/app?view=workspaces")}
    >{t("พื้นที่ทำงาน", "Workspaces")}</a
  ><span>/</span><span>{t("ตั้งค่าองค์กร", "Organization settings")}</span>
</div>
<div class="k-intro">
  <h1>{t("องค์กรของคุณ", "Your organization")}</h1>
  <p class="k-subtitle">
    {t(
      "จัดการชื่อองค์กร และจัดกลุ่มพื้นที่ทำงานตามทีม แผนก สาขา หรือโครงการ",
      "Name your organization and organize its workspaces.",
    )}
  </p>
</div>
{#if error}<div class="k-banner error" role="alert">
    <Info size={19} />
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
    <Check size={19} />{success}
  </div>{/if}
<section class="k-panel">
  <div class="k-section-title">
    <h2>{t("ข้อมูลองค์กร", "Organization details")}</h2>
    <Building2 size={23} color="#5143e8" />
  </div>
  <form
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
            />{:else}<Building2 size={24} />{/if}
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
            class="k-button quiet small"
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
          class="k-button primary"
          type="submit"
          disabled={orgBusy || logoBusy || !displayName.trim()}
          style="margin-top:21px"
          >{orgBusy
            ? t("กำลังบันทึก…", "Saving…")
            : t("บันทึกข้อมูลองค์กร", "Save organization")}</button
        >{/if}
    </fieldset>
  </form>
  <p class="k-small k-muted" style="margin-top:15px">
    {t(
      "ORCA ชุดนี้ใช้สำหรับองค์กรเดียว คุณจัดการบัญชีและสิทธิ์ของสมาชิกแยกจากการจัดหน่วยงาน",
      "This installation serves one organization. Accounts and access are managed separately from units.",
    )}
  </p>
</section>
<section class="k-section">
  <div class="k-section-title">
    <h2>{t("หน่วยงาน", "Organization units")}</h2>
    {#if data.canManage}<button
        class="k-button small"
        disabled={unitBusy}
        onclick={() => editUnit()}
        ><Plus size={16} /> {t("เพิ่มหน่วยงาน", "Add unit")}</button
      >{/if}
  </div>
  <p class="k-small k-muted" style="margin-bottom:17px">
    {t(
      "ใช้หน่วยงานจัดกลุ่มพื้นที่ทำงานตามโครงสร้างองค์กร โดยสมาชิกยังเข้าถึงข้อมูลได้เฉพาะพื้นที่ทำงานที่ได้รับสิทธิ์",
      "Group workspaces into teams, departments, branches, or projects. Data access follows workspace membership.",
    )}
  </p>
  {#if unitForm && data.canManage}<form
      class="k-panel"
      style="margin-bottom:20px"
      onsubmit={(event) => {
        event.preventDefault();
        void saveUnit();
      }}
    >
      <h3>
        {editingUnit
          ? t("แก้ไขหน่วยงาน", "Update unit")
          : t("เพิ่มหน่วยงาน", "Add unit")}
      </h3>
      <fieldset disabled={unitBusy}>
        <div class="k-grid-2 k-section">
          <div class="k-field">
            <label for="unit-name">{t("ชื่อหน่วยงาน", "Unit name")}</label
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
        <div class="k-field">
          <label for="unit-parent">{t("สังกัด", "Parent unit")}</label><select
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
        <div class="k-actions" style="margin-top:19px">
          <button
            class="k-button primary"
            type="submit"
            disabled={unitBusy || !unitName.trim()}
            >{unitBusy
              ? t("กำลังบันทึก…", "Saving…")
              : t("บันทึกหน่วยงาน", "Save unit")}</button
          ><button
            class="k-button"
            type="button"
            disabled={unitBusy}
            onclick={() => (unitForm = false)}>{t("ยกเลิก", "Cancel")}</button
          >
        </div>
      </fieldset>
    </form>{/if}
  {#if data.units.length}<div class="k-table-wrap">
      <table class="k-table">
        <thead
          ><tr
            ><th>{t("หน่วยงาน", "Organization units")}</th><th
              >{t("ประเภท", "Type")}</th
            ><th>{t("สังกัด", "Parent unit")}</th>{#if data.canManage}<th
                >{t("จัดการ", "Manage")}</th
              >{/if}</tr
          ></thead
        ><tbody
          >{#each data.units as unit}<tr
              ><td>{unit.name}</td><td>{unitLabels[unit.kind]}</td><td
                >{data.units.find((parent) => parent.id === unit.parentID)
                  ?.name || data.organization.displayName}</td
              >{#if data.canManage}<td
                  ><button
                    class="k-button quiet small"
                    disabled={unitBusy}
                    onclick={() => editUnit(unit)}
                    ><Pencil size={14} /> {t("แก้ไข", "Edit")}</button
                  ></td
                >{/if}</tr
            >{/each}</tbody
        >
      </table>
    </div>{:else}<div class="k-empty">
      <Building2 size={32} />
      <h2>{t("ยังไม่มีหน่วยงาน", "No units yet")}</h2>
      <p>
        {t(
          "เพิ่มทีม แผนก สาขา หรือโครงการ เพื่อจัดกลุ่มพื้นที่ทำงานให้ค้นหาได้ง่ายขึ้น",
          "Add units when you want to make workspaces easier to find.",
        )}
      </p>
    </div>{/if}
</section>

<style>
  .organization-logo-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
  }
  .organization-logo-preview {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    flex: 0 0 60px;
    border: 1px solid #dce1d6;
    border-radius: 12px;
    color: #68725e;
    background: #f7f9f3;
    overflow: hidden;
  }
  .organization-logo-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .organization-logo-field {
    flex: 1 1 180px;
    min-width: 0;
    margin: 0;
  }
  .organization-logo-field input {
    width: 100%;
    max-width: 320px;
  }
</style>
