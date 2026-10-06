<script lang="ts">
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    orcaError,
    unitLabels,
    type OrcaBootstrap,
  } from "$lib/services/orca";
  import { ArrowRight, Building2, Check, Info, Upload } from "@lucide/svelte";
  import { untrack } from "svelte";

  // Settings › บริษัท: the company's name and logo. Departments are edited in
  // ทีม › แผนก; older teams, branches and projects stay as read-only labels.
  let {
    data,
    onchanged,
    embedded = false,
  }: {
    data: OrcaBootstrap;
    onchanged: () => Promise<void>;
    /** Inside Settings, whose page header already names the page. */
    embedded?: boolean;
  } = $props();
  let displayName = $state(untrack(() => data.organization.displayName));
  let logoDataURL = $state(untrack(() => data.organization.logoDataURL ?? ""));
  let logoBusy = $state(false);
  let organizationVersion = $state(untrack(() => data.organization.version));
  let orgBusy = $state(false);
  let error = $state("");
  let success = $state("");
  // Units made by the old structure editor that are not departments.
  const otherUnits = $derived(data.units.filter((unit) => unit.kind !== "department"));
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
      success = t("บันทึกข้อมูลบริษัทแล้ว", "Company details saved.");
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
        "เปิดรูปนี้ไม่ได้ เลือกไฟล์ PNG หรือ JPG อื่น",
        "This image could not be opened. Choose another PNG or JPG file.",
      );
    } finally {
      input.value = "";
      logoBusy = false;
    }
  }
  async function reload() {
    await onchanged();
    displayName = data.organization.displayName;
    logoDataURL = data.organization.logoDataURL ?? "";
    organizationVersion = data.organization.version;
    error = "";
  }
</script>

{#if !embedded}<div class="k-intro">
  <h1>{t("ข้อมูลบริษัท", "Company")}</h1>
  <p class="k-subtitle">
    {t("ชื่อและโลโก้ของบริษัทที่ทุกคนเห็นใน ORCA", "The company name and logo everyone sees in ORCA.")}
  </p>
</div>{/if}
{#if error}<div class="k-banner error" role="alert">
    <Info size={16} />
    <div>
      {error}
      <div class="k-actions">
        <button
          class="k-link-button"
          disabled={orgBusy}
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
    <h2 id="organization-details-title">{t("ข้อมูลบริษัท", "Company details")}</h2>
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
              alt={t("โลโก้บริษัท", "Company logo")}
            />{:else}<Building2 size={20} />{/if}
        </div>
        <div class="k-field organization-logo-field">
          <span class="organization-logo-label" id="organization-logo-label">{t("โลโก้บริษัท", "Company logo")}</span>
          <!-- A Thai button, not the browser's own "Choose File / No file chosen". -->
          {#if data.canManage}<input
              id="organization-logo"
              class="organization-logo-input"
              type="file"
              accept="image/png,image/jpeg"
              aria-labelledby="organization-logo-label organization-logo-choose"
              aria-describedby="organization-logo-hint"
              onchange={selectLogo}
            /><label class="k-button small organization-logo-choose" id="organization-logo-choose" for="organization-logo"
              ><Upload size={15} aria-hidden="true" />{logoDataURL ? t("เปลี่ยนโลโก้", "Change logo") : t("เลือกไฟล์โลโก้", "Choose a logo file")}</label
            ><small class="organization-logo-hint" id="organization-logo-hint">{t("PNG หรือ JPG ไม่เกิน 128 KB", "PNG or JPG, up to 128 KB")}</small>{/if}
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
            >{t("ชื่อบริษัท", "Company name")}</label
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
            : t("บันทึกข้อมูลบริษัท", "Save company details")}</button
        >{/if}
    </fieldset>
  </form>
  <p class="org-panel-note">
    {t("แผนกของบริษัทแก้ไขได้ที่", "Edit your company's departments in")}
    <a href={localeHref("/app?view=members&tab=departments")}>{t("ทีม › แผนก", "Team › Departments")}<ArrowRight size={14} aria-hidden="true" /></a>
  </p>
</section>
{#if otherUnits.length}<section class="org-panel" aria-labelledby="organization-labels-title">
  <header class="org-panel-head">
    <div class="org-panel-copy">
      <h2 id="organization-labels-title">
        {t("ป้ายกำกับเดิม", "Earlier labels")}<span class="org-count">{otherUnits.length}</span>
      </h2>
      <p>
        {t(
          "ใช้เป็นป้ายกำกับเท่านั้น ไม่ได้ให้สิทธิ์ใคร",
          "Teams, branches and projects made earlier. They only label workspaces; they give nobody access.",
        )}
      </p>
    </div>
  </header>
  <div class="org-table-wrap">
    <table class="org-table">
      <thead
        ><tr
          ><th scope="col">{t("ชื่อ", "Name")}</th><th scope="col"
            >{t("ประเภท", "Type")}</th
          ></tr
        ></thead
      ><tbody
        >{#each otherUnits as unit (unit.id)}<tr
            ><td class="org-unit-name">{unit.name}</td><td class="org-muted">{unitLabels[unit.kind]}</td></tr
          >{/each}</tbody
      >
    </table>
  </div>
</section>{/if}

<style>
	/* orca-type-remap v1 */
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
    font-size: 12.5px;
    line-height: 1.6;
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
    font-size: 11.5px;
    font-weight: 500;
  }
  .org-panel-body {
    padding: 18px;
  }
  .org-save {
    margin-top: 18px;
  }
  .org-panel-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 12px 18px;
    border-top: 1px solid var(--orca-line);
    color: var(--orca-muted);
    font-size: 12.5px;
    line-height: 1.6;
  }
  .org-panel-note a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--orca-ink);
    font-weight: 600;
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
  .organization-logo-label {
    display: block;
    margin-bottom: 6px;
    color: var(--orca-ink);
    font-size: 13.5px;
    font-weight: 600;
  }
  /* The real input stays in the page (keyboard and screen readers use it); the label is its button. */
  .organization-logo-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    opacity: 0;
  }
  /* A button, not a field label: the shared .k-field label rule would stretch it. */
  .organization-logo-field .organization-logo-choose {
    display: inline-flex;
    justify-self: start;
    align-self: start;
    width: auto;
    margin: 0;
    gap: 6px;
    cursor: pointer;
  }
  .organization-logo-input:focus-visible + .organization-logo-choose {
    outline: 2px solid var(--orca-focus, var(--orca-ink));
    outline-offset: 2px;
  }
  .organization-logo-hint {
    display: block;
    margin-top: 6px;
    color: var(--orca-muted);
    font-size: 12px;
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
    font-size: 12.5px;
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .org-table td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--orca-line-soft, #eff0f2);
    font-size: 13.5px;
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
  @media (max-width: 760px) {
    .org-panel-head {
      flex-wrap: wrap;
      padding: 14px 16px;
    }
    .org-panel-body {
      padding: 16px;
    }
  }
</style>
