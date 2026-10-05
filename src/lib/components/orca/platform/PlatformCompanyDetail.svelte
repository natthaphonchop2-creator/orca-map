<script lang="ts">
  import { onMount } from "svelte";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { platformHref } from "$lib/orca/navigation";
  import {
    companyStatus,
    companyStatusNote,
    contractNote,
    platformCompanyHref,
    priceValue,
    profileProblems,
    type DetailTab,
  } from "$lib/orca/platform-console";
  import {
    OrcaService,
    displayDate,
    orcaError,
    type OrcaPlatformCompany,
    type OrcaPlatformCompanyOverview,
    type OrcaPlatformMember,
    type OrcaPlatformProfile,
    type OrcaPlatformProfileSensitive,
  } from "$lib/services/orca";
  import PlatformBadge from "./PlatformBadge.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import PageHeader from "../ui/PageHeader.svelte";
  import { showToast } from "../ui/toast-store.svelte";

  // One customer company in the platform area (platform console C6, PC1).
  // The header comes from the company list, which writes the platform's log
  // only. Each tab is one look: the server records it in the platform's log
  // and in the company's own ("ORCA ดูข้อมูล …"), so a tab loads only when
  // it is opened, and only once.
  let { companyID, tab }: { companyID: string; tab: DetailTab } = $props();

  let company = $state<OrcaPlatformCompany>();
  let companyError = $state("");
  let overview = $state<OrcaPlatformCompanyOverview>();
  let members = $state<OrcaPlatformMember[]>();
  let profile = $state<OrcaPlatformProfile>();
  let lookError = $state("");
  const status = $derived(companyStatus(company?.status));
  const own = $derived(companyID === "default");

  const tabs = $derived<{ id: DetailTab; label: string }[]>([
    { id: "overview", label: t("ภาพรวม", "Overview") },
    { id: "profile", label: t("ข้อมูลลูกค้า", "Customer profile") },
    { id: "members", label: t("สมาชิก", "Members") },
    { id: "manage", label: t("จัดการบริษัท", "Manage company") },
  ]);

  async function loadCompany() {
    try {
      const items = await OrcaService.platformCompanies();
      company = items.find((item) => item.id === companyID);
      companyError = company ? "" : t("ไม่พบบริษัทนี้", "This company was not found.");
    } catch (cause) {
      companyError = orcaError(cause);
    }
  }

  async function loadTab() {
    lookError = "";
    try {
      if (tab === "overview") overview = await OrcaService.platformCompany(companyID);
      else if (tab === "members") members = await OrcaService.platformCompanyMembers(companyID);
      else if (tab === "profile") fillProfile(await OrcaService.platformCompanyProfile(companyID));
    } catch (cause) {
      lookError = orcaError(cause);
    }
  }

  onMount(() => {
    void loadCompany();
    void loadTab();
  });

  // The profile form (C6 §4.4): the business facts, and the private fields,
  // which the server keeps only encrypted.
  let form = $state({ legalName: "", branch: "", package: "", monthlyPrice: "", contractStart: "", contractEnd: "" });
  let privateFields = $state<OrcaPlatformProfileSensitive>({ taxID: "", address: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
  let privateEdited = $state(false);
  let saving = $state(false);
  let saveError = $state("");
  const problems = $derived(profileProblems({ ...privateFields, ...form }));
  const privateOff = $derived(profile?.sensitiveState === "off");

  function fillProfile(next: OrcaPlatformProfile) {
    profile = next;
    form = {
      legalName: next.legalName,
      branch: next.branch,
      package: next.package,
      monthlyPrice: next.monthlyPrice === null || next.monthlyPrice === undefined ? "" : String(next.monthlyPrice),
      contractStart: next.contractStart,
      contractEnd: next.contractEnd,
    };
    privateFields = next.sensitive ?? { taxID: "", address: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" };
    privateEdited = false;
  }

  async function saveProfile() {
    if (!profile || saving || problems.length) return;
    saving = true;
    saveError = "";
    try {
      fillProfile(
        await OrcaService.savePlatformCompanyProfile(companyID, {
          version: profile.version,
          legalName: form.legalName,
          branch: form.branch,
          package: form.package,
          monthlyPrice: priceValue(form.monthlyPrice),
          contractStart: form.contractStart,
          contractEnd: form.contractEnd,
          // Left out, the stored private fields stay as they are.
          ...(privateEdited && !privateOff ? { sensitive: privateFields } : {}),
        }),
      );
      showToast(t("บันทึกข้อมูลลูกค้าแล้ว", "Customer profile saved."));
      void loadCompany();
    } catch (cause) {
      saveError = orcaError(cause);
    } finally {
      saving = false;
    }
  }

  // จัดการบริษัท: suspend and restore, each confirmed with the company's name,
  // and rename. The server compares the version the list gave.
  let confirming = $state<"suspend" | "restore">();
  let changing = $state(false);
  let changeError = $state("");
  let newName = $state("");

  async function changeStatus() {
    if (!company || !confirming || changing) return;
    changing = true;
    changeError = "";
    try {
      const next = confirming === "suspend"
        ? await OrcaService.suspendCompany(company.id, company.version ?? 0)
        : await OrcaService.restoreCompany(company.id, company.version ?? 0);
      company = { ...company, status: next.status, version: next.version, displayName: next.displayName };
      showToast(
        next.status === "suspended"
          ? t(`ระงับการใช้งาน ${next.displayName} แล้ว`, `${next.displayName} is suspended.`)
          : t(`เปิดให้ ${next.displayName} ใช้งานอีกครั้งแล้ว`, `${next.displayName} is open again.`),
      );
      confirming = undefined;
    } catch (cause) {
      changeError = orcaError(cause);
      void loadCompany();
    } finally {
      changing = false;
    }
  }

  async function rename() {
    if (!company || changing) return;
    const name = newName.trim();
    if (!name) {
      changeError = t("กรอกชื่อใหม่", "Enter the new name.");
      return;
    }
    changing = true;
    changeError = "";
    try {
      const next = await OrcaService.renameCompany(company.id, company.version ?? 0, name);
      company = { ...company, displayName: next.displayName, version: next.version };
      newName = "";
      showToast(t(`เปลี่ยนชื่อเป็น ${next.displayName} แล้ว`, `Renamed to ${next.displayName}.`));
    } catch (cause) {
      changeError = orcaError(cause);
      void loadCompany();
    } finally {
      changing = false;
    }
  }

  const roleName = (role: string) =>
    role === "owner" ? t("เจ้าของบริษัท", "Owner") : role === "admin" ? t("ผู้ดูแล", "Admin") : t("พนักงาน", "Employee");
  const memberStatus = (value: string) =>
    value === "active" ? t("ใช้งานได้", "Active") : value === "suspended" ? t("ถูกระงับ", "Suspended") : t("ถูกนำออก", "Removed");
  const accountStatus = (value: string) =>
    ({ ready: t("พร้อมใช้", "Ready"), connecting: t("กำลังเชื่อม", "Connecting"), needs_reconnect: t("ต้องเชื่อมใหม่", "Needs reconnecting"), disconnected: t("ตัดการเชื่อมแล้ว", "Disconnected") })[value] ?? value;
  const count = (values: Record<string, number> | undefined) => Object.values(values ?? {}).reduce((sum, value) => sum + value, 0);
</script>

<PageHeader
  title={company?.displayName ?? t("บริษัทลูกค้า", "Customer company")}
  subtitle={t("ORCA เห็นข้อมูลนี้ และบันทึกว่าดูแล้ว", "ORCA sees this, and records that it looked.")}
  back={{ href: localeHref(platformHref("companies")), label: t("บริษัทลูกค้า", "Customer companies") }}
>
  {#snippet eyebrow()}<PlatformBadge />{/snippet}
</PageHeader>

{#if companyError}<p class="detail-error" role="alert">{companyError}</p>{/if}
{#if company && status !== "active"}<p class="detail-stopped" role="status">{companyStatusNote(status, t)}{company.contractEnd ? ` · ${contractNote(company.contractState, company.contractEnd, t)}` : ""}</p>{/if}

<nav class="detail-tabs" aria-label={t("ส่วนของบริษัท", "Company sections")}>
  {#each tabs as item (item.id)}
    <a href={localeHref(platformCompanyHref(companyID, item.id))} class:chosen={item.id === tab} aria-current={item.id === tab ? "page" : undefined}>{item.label}</a>
  {/each}
</nav>

{#if lookError}<p class="detail-error" role="alert">{lookError}</p>{/if}

{#if tab === "overview"}
  {#if !overview && !lookError}<p class="detail-loading">{t("กำลังโหลด…", "Loading…")}</p>
  {:else if overview}
    <dl class="detail-facts">
      <div><dt>{t("สมาชิกที่ใช้งานได้", "Active members")}</dt><dd>{overview.counts.membersByStatus.active ?? 0}</dd></div>
      <div><dt>{t("เจ้าของ · ผู้ดูแล · พนักงาน", "Owners · admins · employees")}</dt><dd>{overview.counts.membersByRole.owner ?? 0} · {overview.counts.membersByRole.admin ?? 0} · {overview.counts.membersByRole.employee ?? 0}</dd></div>
      <div><dt>{t("ถูกระงับหรือนำออก", "Suspended or removed")}</dt><dd>{(overview.counts.membersByStatus.suspended ?? 0) + (overview.counts.membersByStatus.removed ?? 0)}</dd></div>
      <div><dt>{t("พื้นที่ทำงาน", "Workspaces")}</dt><dd>{overview.counts.workspaces}</dd></div>
      <div><dt>{t("โปรแกรมที่เชื่อม", "Connected programs")}</dt><dd>{overview.counts.connections}</dd></div>
      <div><dt>{t("บัญชีกลาง", "Company accounts")}</dt><dd>{count(overview.counts.companyAccounts)}{#each Object.entries(overview.counts.companyAccounts) as [key, value] (key)}<small>{accountStatus(key)} {value}</small>{/each}</dd></div>
      <div><dt>{t("คำเชิญที่รออยู่", "Invitations waiting")}</dt><dd>{overview.counts.invitationsWaiting}</dd></div>
      <div><dt>{t("คำขออนุมัติที่รออยู่", "Approvals waiting")}</dt><dd>{overview.counts.approvalsWaiting}</dd></div>
      <div><dt>{t("ใช้ AI 7 วัน · 30 วัน", "AI use, 7 · 30 days")}</dt><dd>{t(`${overview.usage.toolCalls7} · ${overview.usage.toolCalls30} ครั้ง`, `${overview.usage.toolCalls7} · ${overview.usage.toolCalls30} calls`)}<small>{t(`${overview.usage.people7} · ${overview.usage.people30} คน`, `${overview.usage.people7} · ${overview.usage.people30} people`)}</small></dd></div>
      <div><dt>{t("ใช้ล่าสุด", "Last used")}</dt><dd>{overview.usage.lastCallDay ?? t("ยังไม่เคยใช้", "Never")}</dd></div>
    </dl>
    <h2 class="detail-heading">{t("เจ้าของบริษัท", "Owners")}</h2>
    {#if overview.owners.length === 0}<p class="detail-muted">{t("ยังไม่มีเจ้าของที่ใช้งานได้", "No owner who can act yet.")}</p>
    {:else}<ul class="detail-people">
        {#each overview.owners as owner (owner.id)}<li><strong>{owner.displayName || owner.email}</strong><span>{owner.email}</span></li>{/each}
      </ul>{/if}
    {#if overview.profile.package || overview.profile.contractEnd}
      <p class="detail-muted">{overview.profile.package}{overview.profile.package && overview.profile.contractEnd ? " · " : ""}{overview.profile.contractEnd ? contractNote(company?.contractState, overview.profile.contractEnd, t) : ""}</p>
    {/if}
  {/if}
{:else if tab === "members"}
  {#if !members && !lookError}<p class="detail-loading">{t("กำลังโหลด…", "Loading…")}</p>
  {:else if members}
    {#if members.length === 0}<p class="detail-muted">{t("ยังไม่มีสมาชิก", "No members yet.")}</p>
    {:else}
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead><tr>
            <th scope="col">{t("ชื่อ", "Name")}</th><th scope="col">{t("บทบาท", "Role")}</th><th scope="col">{t("สถานะ", "Status")}</th>
            <th scope="col">{t("เข้าร่วม", "Joined")}</th><th scope="col">{t("ใช้ล่าสุด", "Last active")}</th><th scope="col">{t("แผนก", "Departments")}</th>
            <th scope="col">{t("แอป AI · คีย์", "AI apps · keys")}</th>
          </tr></thead>
          <tbody>
            {#each members as member (member.id)}
              <tr>
                <td><strong>{member.displayName || member.email}</strong><small>{member.email}</small></td>
                <td>{roleName(member.role)}</td>
                <td>{memberStatus(member.status)}</td>
                <td>{displayDate(member.joinedAt)}</td>
                <td>{displayDate(member.lastActiveAt)}</td>
                <td>{member.departments.length ? member.departments.join(", ") : "—"}</td>
                <td>{member.aiSignIns} · {member.keys}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
{:else if tab === "profile"}
  {#if !profile && !lookError}<p class="detail-loading">{t("กำลังโหลด…", "Loading…")}</p>
  {:else if profile}
    <form class="detail-form" onsubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
      <fieldset disabled={saving}>
        <legend>{t("ข้อมูลธุรกิจ", "Business facts")}</legend>
        <label>{t("ชื่อนิติบุคคล", "Legal name")}<input bind:value={form.legalName} maxlength="255" autocomplete="off" /></label>
        <label>{t("สาขา", "Branch")}<input bind:value={form.branch} maxlength="64" placeholder={t("สำนักงานใหญ่ หรือเลขสาขา", "Head office or branch number")} autocomplete="off" /></label>
        <label>{t("แพ็กเกจ", "Package")}<input bind:value={form.package} maxlength="120" placeholder="Early Partner" autocomplete="off" /></label>
        <label>{t("ราคาต่อเดือน (บาท)", "Monthly price (baht)")}<input bind:value={form.monthlyPrice} inputmode="numeric" autocomplete="off" /></label>
        <label>{t("เริ่มสัญญา", "Contract start")}<input type="date" bind:value={form.contractStart} /></label>
        <label>{t("สิ้นสุดสัญญา", "Contract end")}<input type="date" bind:value={form.contractEnd} /></label>
      </fieldset>
      <fieldset disabled={saving || privateOff}>
        <legend>{t("ข้อมูลส่วนตัวของลูกค้า", "Private details")}</legend>
        {#if privateOff}
          <p class="detail-note" role="status">{t("ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสบนเซิร์ฟเวอร์ จึงยังเก็บเลขผู้เสียภาษี ที่อยู่ ผู้ติดต่อ และบันทึกไม่ได้", "No encryption key is set up on the server yet, so the tax ID, address, contact and notes can't be kept.")}</p>
        {:else if profile.sensitiveState === "unreadable"}
          <p class="detail-note" role="status">{t("อ่านข้อมูลส่วนตัวที่เก็บไว้ไม่ได้ (อ่านไม่ได้) ถ้ากรอกใหม่แล้วบันทึก ข้อมูลเดิมจะถูกแทน", "The stored private details can't be read. Typing new ones and saving replaces them.")}</p>
        {:else}
          <p class="detail-muted">{t("เก็บแบบเข้ารหัส เห็นได้เฉพาะทีม ORCA", "Stored encrypted; only the ORCA team sees them.")}</p>
        {/if}
        <label>{t("เลขผู้เสียภาษี (13 หลัก)", "Tax ID (13 digits)")}<input bind:value={privateFields.taxID} oninput={() => (privateEdited = true)} inputmode="numeric" maxlength="13" autocomplete="off" /></label>
        <label>{t("ที่อยู่", "Address")}<textarea bind:value={privateFields.address} oninput={() => (privateEdited = true)} maxlength="1000" rows="2"></textarea></label>
        <label>{t("ชื่อผู้ติดต่อ", "Contact name")}<input bind:value={privateFields.contactName} oninput={() => (privateEdited = true)} maxlength="255" autocomplete="off" /></label>
        <label>{t("อีเมลผู้ติดต่อ", "Contact email")}<input type="email" bind:value={privateFields.contactEmail} oninput={() => (privateEdited = true)} maxlength="254" autocomplete="off" /></label>
        <label>{t("โทรศัพท์ผู้ติดต่อ", "Contact phone")}<input bind:value={privateFields.contactPhone} oninput={() => (privateEdited = true)} maxlength="32" autocomplete="off" /></label>
        <label>{t("บันทึก (เช่น เหตุผลที่ระงับ)", "Notes (e.g. why it was suspended)")}<textarea bind:value={privateFields.notes} oninput={() => (privateEdited = true)} maxlength="4000" rows="3"></textarea></label>
      </fieldset>
      {#if problems.length}<p class="detail-error" role="alert">
          {problems.map((problem) => ({
            taxID: t("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก", "The tax ID is 13 digits."),
            email: t("อีเมลผู้ติดต่อไม่ถูกต้อง", "The contact email isn't valid."),
            dates: t("วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่ม", "The contract can't end before it starts."),
            price: t("ราคาเป็นจำนวนบาทเต็ม", "The price is whole baht."),
            notes: t("บันทึกยาวเกิน 4,000 ตัวอักษร", "Notes are longer than 4,000 characters."),
          })[problem]).join(" ")}
        </p>{/if}
      {#if saveError}<p class="detail-error" role="alert">{saveError}</p>{/if}
      <div class="detail-actions"><button type="submit" class="k-button primary" disabled={saving || problems.length > 0}>{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึกข้อมูลลูกค้า", "Save profile")}</button></div>
    </form>
  {/if}
{:else if tab === "manage"}
  {#if own}
    <p class="detail-muted">{t("บริษัทของทีม ORCA ระงับหรือเปลี่ยนชื่อจากหน้านี้ไม่ได้", "The ORCA team's own company can't be suspended or renamed here.")}</p>
  {:else if company}
    <section class="detail-manage">
      <h2 class="detail-heading">{t("การใช้งาน", "Use")}</h2>
      <p>{status === "active" ? t("ทุกคนในบริษัทนี้ใช้ ORCA ได้ตามปกติ", "Everyone in this company can use ORCA.") : companyStatusNote(status, t)}</p>
      {#if status === "active"}<button type="button" class="k-button danger" disabled={changing} onclick={() => { changeError = ""; confirming = "suspend"; }}>{t("ระงับการใช้งาน", "Suspend")}</button>
      {:else if status === "suspended"}<button type="button" class="k-button primary" disabled={changing} onclick={() => { changeError = ""; confirming = "restore"; }}>{t("เปิดให้ใช้งานอีกครั้ง", "Restore")}</button>{/if}
    </section>
    {#if status !== "closed"}
      <form class="detail-manage" onsubmit={(event) => { event.preventDefault(); void rename(); }}>
        <h2 class="detail-heading">{t("เปลี่ยนชื่อบริษัท", "Rename")}</h2>
        <label>{t("ชื่อใหม่", "New name")}<input bind:value={newName} maxlength="120" placeholder={company.displayName} autocomplete="off" disabled={changing} /></label>
        <div class="detail-actions"><button type="submit" class="k-button" disabled={changing}>{t("เปลี่ยนชื่อ", "Rename")}</button></div>
      </form>
    {/if}
    {#if changeError && !confirming}<p class="detail-error" role="alert">{changeError}</p>{/if}
  {/if}
{/if}

<ConfirmDialog
  open={!!confirming && !!company}
  title={confirming === "suspend"
    ? t(`ระงับการใช้งาน ${company?.displayName ?? ""}?`, `Suspend ${company?.displayName ?? ""}?`)
    : t(`เปิดให้ ${company?.displayName ?? ""} ใช้งานอีกครั้ง?`, `Restore ${company?.displayName ?? ""}?`)}
  message={confirming === "suspend"
    ? t(
        "ทุกคนในบริษัทนี้และแอป AI ของพวกเขาจะใช้ ORCA ไม่ได้ทันที ข้อมูลยังอยู่ครบ คนในบริษัทเห็นเพียงข้อความว่าถูกระงับ จดเหตุผลไว้ในข้อมูลลูกค้า",
        "Everyone in this company, and their AI apps, stop using ORCA at once. Its data stays. Its people see only that it's suspended; note the reason in the customer profile.",
      )
    : t(
        "ทุกอย่างกลับมาใช้ได้ทันที การเชื่อมแอป AI ที่ยังไม่หมดอายุใช้ต่อได้โดยไม่ต้องเข้าสู่ระบบใหม่",
        "Everything works again at once. AI app sign-ins that haven't expired keep working with no new sign-in.",
      )}
  confirmLabel={changing ? t("กำลังบันทึก…", "Saving…") : confirming === "suspend" ? t("ระงับการใช้งาน", "Suspend") : t("เปิดให้ใช้งาน", "Restore")}
  cancelLabel={t("ไม่เปลี่ยน", "Keep it")}
  tone={confirming === "suspend" ? "danger" : "default"}
  busy={changing}
  oncancel={() => (confirming = undefined)}
  onconfirm={changeStatus}
>
  {#if changeError}<p class="detail-error" role="alert">{changeError}</p>{/if}
</ConfirmDialog>

<style>
  .detail-tabs { display: flex; gap: 24px; margin: 0 0 24px; overflow-x: auto; box-shadow: inset 0 -1px 0 var(--orca-line); scrollbar-width: none; }
  .detail-tabs a { display: inline-flex; align-items: center; min-height: 44px; border-bottom: 2px solid transparent; color: var(--orca-muted); font-size: 14.5px; text-decoration: none; white-space: nowrap; }
  .detail-tabs a:hover { color: var(--orca-ink); }
  .detail-tabs a.chosen { border-bottom-color: var(--orca-tab-indicator, var(--orca-ink)); color: var(--orca-ink); font-weight: 600; }
  .detail-loading, .detail-muted { margin: 0 0 16px; color: var(--orca-muted); font-size: 14px; line-height: 1.6; }
  .detail-error { margin: 0 0 16px; padding: 10px 14px; border: 1px solid var(--orca-deny-line); border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny); font-size: 14px; }
  .detail-stopped { margin: -8px 0 16px; color: var(--orca-deny); font-size: 14px; font-weight: 600; }
  .detail-note { margin: 0 0 8px; padding: 10px 14px; border: 1px solid var(--orca-warn-line); border-radius: var(--orca-radius); background: var(--orca-warn-bg); color: var(--orca-warn); font-size: 13.5px; line-height: 1.6; }
  .detail-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1px; margin: 0 0 24px; overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-line); }
  .detail-facts div { display: grid; gap: 4px; padding: 14px 16px; background: var(--orca-surface); }
  .detail-facts dt { color: var(--orca-muted); font-size: 13px; }
  .detail-facts dd { display: grid; gap: 2px; margin: 0; color: var(--orca-ink); font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .detail-facts small { color: var(--orca-muted); font-size: 12.5px; font-weight: 400; }
  .detail-heading { margin: 0 0 10px; font-size: 16px; font-weight: 700; }
  .detail-people { display: grid; gap: 8px; margin: 0 0 16px; padding: 0; list-style: none; }
  .detail-people li { display: grid; gap: 2px; }
  .detail-people span { color: var(--orca-muted); font-size: 13.5px; overflow-wrap: anywhere; }
  .detail-table-wrap { overflow-x: auto; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .detail-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .detail-table th { padding: 10px 14px; border-bottom: 1px solid var(--orca-line); background: var(--orca-surface-2); color: var(--orca-muted); font-size: 12.5px; font-weight: 600; text-align: left; white-space: nowrap; }
  .detail-table td { padding: 12px 14px; border-top: 1px solid var(--orca-line-soft); vertical-align: top; }
  .detail-table tbody tr:first-child td { border-top: 0; }
  .detail-table small { display: block; color: var(--orca-muted); font-size: 13px; overflow-wrap: anywhere; }
  .detail-form { display: grid; gap: 20px; max-width: 640px; }
  .detail-form fieldset { display: grid; gap: 12px; min-width: 0; margin: 0; padding: 0; border: 0; }
  .detail-form legend { margin-bottom: 4px; font-size: 16px; font-weight: 700; }
  .detail-form label, .detail-manage label { display: grid; gap: 6px; color: var(--orca-ink); font-size: 14px; font-weight: 600; }
  .detail-form input, .detail-form textarea, .detail-manage input { min-height: 42px; padding: 9px 12px; border: 1px solid var(--orca-field-line); border-radius: var(--orca-radius); background: var(--orca-field); color: var(--orca-ink); font: inherit; font-size: 14px; font-weight: 400; }
  .detail-form textarea { min-height: 64px; resize: vertical; }
  .detail-actions { display: flex; justify-content: flex-start; gap: 10px; }
  .detail-actions :global(.k-button), .detail-manage :global(.k-button) { min-height: 42px; padding: 0 18px; font-weight: 600; }
  .detail-manage { display: grid; gap: 10px; max-width: 640px; margin: 0 0 28px; }
  .detail-manage p { margin: 0; color: var(--orca-text-2, var(--orca-ink)); font-size: 14px; }
  .detail-manage :global(.k-button) { justify-self: start; }
  @media (max-width: 720px) {
    .detail-tabs { gap: 18px; }
    .detail-facts { grid-template-columns: 1fr 1fr; }
  }
</style>
