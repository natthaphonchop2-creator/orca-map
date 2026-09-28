<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Building2, Check, Copy, Link2, MailPlus, Plus, Send, TriangleAlert, X } from "@lucide/svelte";
  import { parseErrorContent } from "$lib/errors";
  import { invitationLink, lineShareURL } from "$lib/orca/invitations";
  import { t } from "$lib/orca/locale.svelte";
  import { canInviteOwner, emailDomain, ownerStatus, platformRefusal, signInWarnings, type OwnerStatus } from "$lib/orca/platform-companies";
  import { OrcaService, displayDate, orcaError, type OrcaOwnerInvitationLink, type OrcaPlatformCompany } from "$lib/services/orca";

  // The platform operator's customer companies (C4 §14e). The operator opens a
  // company and sends its owner a link; the owner then invites everyone else.
  // The operator never joins a company this way, and these calls are the
  // platform's, whichever company this page shows.
  let items = $state<OrcaPlatformCompany[]>([]);
  let loaded = $state(false);
  let listError = $state("");
  let dialog: HTMLDialogElement | undefined = $state();
  let nameInput: HTMLInputElement | undefined = $state();
  let emailInput: HTMLInputElement | undefined = $state();
  // The dialog opens a company, then invites its owner, then shows the link once.
  let step = $state<"open" | "invite" | "issued">("open");
  let target = $state<OrcaPlatformCompany>();
  let justOpened = $state(false);
  let name = $state("");
  let email = $state("");
  let busy = $state(false);
  let formError = $state("");
  let issued = $state<{ link: string; result: OrcaOwnerInvitationLink }>();
  let copied = $state<"" | "link" | "message">("");
  let revoking = $state("");
  let actionID = $state("");
  let request = 0;

  const statusText = (status: OwnerStatus, owners: number) =>
    ({
      owned: owners > 1 ? t(`มีเจ้าของ ${owners} คน`, `${owners} owners`) : t("มีเจ้าของแล้ว", "Has an owner"),
      waiting: t("รอเจ้าของตอบรับ", "Waiting for the owner"),
      expired: t("ลิงก์เชิญหมดอายุ", "Invitation link expired"),
      none: t("ยังไม่มีเจ้าของ", "No owner yet"),
    })[status];
  const statusTone = (status: OwnerStatus) => ({ owned: "ok", waiting: "waiting", expired: "bad", none: "muted" })[status];
  const message = $derived(
    issued && target
      ? t(
          `คุณได้รับเชิญเป็นเจ้าของ ${target.displayName} บน ORCA เปิดลิงก์นี้แล้วเข้าสู่ระบบด้วย Google โดยใช้อีเมล ${issued.result.invitation.email} (ใช้ได้ถึง ${displayDate(issued.result.invitation.expiresAt)})\n${issued.link}`,
          `You're invited to be the owner of ${target.displayName} on ORCA. Open this link and sign in with Google using ${issued.result.invitation.email} (valid until ${displayDate(issued.result.invitation.expiresAt)}):\n${issued.link}`,
        )
      : "",
  );

  function explain(cause: unknown): string {
    const parsed = parseErrorContent(cause);
    switch (platformRefusal(parsed.status, parsed.message)) {
      case "name-taken":
        return t("มีบริษัทชื่อนี้แล้ว ใช้ชื่ออื่นที่แยกออกจากกันได้", "A company with this name already exists. Use a name that tells them apart.");
      case "has-owner":
        return t("บริษัทนี้มีเจ้าของแล้ว เจ้าของบริษัทเป็นคนเชิญคนอื่นเอง", "This company already has an owner, who invites everyone else.");
      case "waiting":
        return t("มีคำเชิญอื่นของบริษัทนี้รออีเมลนี้อยู่ ให้บริษัทยกเลิกคำเชิญนั้นก่อน", "Another invitation from this company is waiting for this email. The company can revoke it first.");
      case "unavailable":
        return t("คนนี้ถูกระงับในบริษัทนี้ บริษัทต้องกู้คืนเขาแทนการเชิญ", "This person is suspended in this company. The company restores them instead.");
      case "closed":
        return t("คำเชิญนี้ถูกใช้หรือยกเลิกไปแล้ว", "This invitation was already used or revoked.");
    }
    return orcaError(cause);
  }

  async function load() {
    const current = ++request;
    try {
      const next = await OrcaService.platformCompanies();
      if (current !== request) return;
      items = next;
      loaded = true;
      listError = "";
    } catch (cause) {
      if (current === request) listError = explain(cause);
    }
  }
  onMount(() => void load());

  async function show(next: "open" | "invite", company?: OrcaPlatformCompany) {
    step = next;
    target = company;
    justOpened = false;
    name = "";
    email = "";
    formError = "";
    copied = "";
    issued = undefined;
    dialog?.showModal();
    await tick();
    (next === "open" ? nameInput : emailInput)?.focus();
  }

  async function openCompany() {
    if (busy) return;
    const displayName = name.trim();
    if (!displayName) {
      formError = t("กรุณากรอกชื่อบริษัท", "Enter the company's name.");
      return;
    }
    busy = true;
    formError = "";
    try {
      target = await OrcaService.openCompany(displayName);
      justOpened = true;
      step = "invite";
      await load();
      await tick();
      emailInput?.focus();
    } catch (cause) {
      formError = explain(cause);
    } finally {
      busy = false;
    }
  }

  async function inviteOwner() {
    if (busy || !target) return;
    const address = email.trim();
    if (!address) {
      formError = t("กรุณากรอกอีเมลของเจ้าของบริษัท", "Enter the owner's email.");
      return;
    }
    busy = true;
    formError = "";
    try {
      const result = await OrcaService.inviteCompanyOwner(target.id, address);
      issued = { link: invitationLink(window.location.origin, result.token), result };
      step = "issued";
      await load();
    } catch (cause) {
      formError = explain(cause);
    } finally {
      busy = false;
    }
  }

  async function revoke(company: OrcaPlatformCompany, id: string) {
    if (actionID) return;
    actionID = id;
    try {
      await OrcaService.revokeCompanyOwnerInvitation(company.id, id);
      revoking = "";
      await load();
    } catch (cause) {
      // Reload first, since loading clears the list's error.
      const text = explain(cause);
      await load();
      listError = text;
    } finally {
      actionID = "";
    }
  }

  async function copy(text: string, what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
    } catch {
      formError = t("คัดลอกไม่สำเร็จ เลือกข้อความแล้วคัดลอกเอง", "Couldn't copy. Select the text and copy it yourself.");
    }
  }
</script>

<section class="platform-companies" aria-labelledby="platform-companies-title">
  <div class="platform-head">
    <div>
      <h2 id="platform-companies-title"><Building2 size={18} aria-hidden="true" />{t("บริษัทลูกค้า", "Customer companies")}</h2>
      <p>
        {t(
          "เปิดบริษัทให้ลูกค้า แล้วส่งลิงก์ให้เจ้าของบริษัท เมื่อเจ้าของตอบรับ เขาจะเชิญและจัดการคนในบริษัทเอง คุณไม่ได้เป็นสมาชิกของบริษัทเหล่านี้",
          "Open a company for a customer, then send its owner a link. Once the owner accepts, they invite and manage their own people. You are not a member of these companies.",
        )}
      </p>
    </div>
    <button type="button" class="k-button primary" onclick={() => show("open")}><Plus size={16} aria-hidden="true" />{t("เปิดบริษัทใหม่", "Open a company")}</button>
  </div>
  {#if listError}<div class="k-banner error" role="alert">{listError}</div>{/if}
  {#if !loaded && !listError}
    <p class="companies-loading">{t("กำลังโหลดรายชื่อบริษัท…", "Loading companies…")}</p>
  {:else if loaded}
    <div class="companies-table-wrap">
      <table class="k-table companies-table">
        <thead>
          <tr>
            <th scope="col">{t("บริษัท", "Company")}</th>
            <th scope="col">{t("ที่นั่ง", "Seats")}</th>
            <th scope="col">{t("เจ้าของ", "Owner")}</th>
            <th scope="col" class="companies-actions-col">{t("การจัดการ", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as company (company.id)}
            {@const status = ownerStatus(company)}
            <tr>
              <td class="company-name">
                <strong>{company.displayName}</strong>
                <p class="k-small k-muted">
                  {company.id === "default" ? t("บริษัทของทีม ORCA", "The ORCA team's company") : t(`เปิดเมื่อ ${displayDate(company.createdAt)}`, `Opened ${displayDate(company.createdAt)}`)}
                </p>
              </td>
              <td class="company-seats"><strong>{company.seats}</strong><p class="k-small k-muted">{t("คนที่ใช้งานได้", "people who can use it")}</p></td>
              <td>
                <span class="owner-status tone-{statusTone(status)}">{statusText(status, company.owners)}</span>
                {#each company.ownerInvitations as invitation (invitation.id)}
                  <div class="owner-invitation">
                    <span class="owner-invitation-email">{invitation.email}</span>
                    <span class="k-small k-muted">{invitation.status === "expired" ? t(`หมดอายุ ${displayDate(invitation.expiresAt)}`, `Expired ${displayDate(invitation.expiresAt)}`) : t(`ใช้ได้ถึง ${displayDate(invitation.expiresAt)}`, `Valid until ${displayDate(invitation.expiresAt)}`)}</span>
                    {#if revoking === invitation.id}
                      <span class="owner-invitation-actions">
                        <button type="button" class="k-button small danger" disabled={!!actionID} onclick={() => revoke(company, invitation.id)}>{t("ยืนยันยกเลิก", "Confirm revoke")}</button>
                        <button type="button" class="k-button small" disabled={!!actionID} onclick={() => (revoking = "")}>{t("ไม่ยกเลิก", "Keep")}</button>
                      </span>
                    {:else}
                      <button type="button" class="k-button small" disabled={!!actionID} onclick={() => (revoking = invitation.id)} aria-label={t(`ยกเลิกคำเชิญของ ${invitation.email}`, `Revoke the invitation for ${invitation.email}`)}
                        ><X size={14} aria-hidden="true" />{t("ยกเลิก", "Revoke")}</button
                      >
                    {/if}
                  </div>
                {/each}
              </td>
              <td class="companies-actions-col">
                {#if canInviteOwner(company)}<button type="button" class="k-button small" onclick={() => show("invite", company)}
                    ><MailPlus size={14} aria-hidden="true" />{status === "none" ? t("เชิญเจ้าของ", "Invite the owner") : t("ส่งลิงก์ใหม่", "Send a new link")}</button
                  >{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<dialog bind:this={dialog} class="company-dialog" aria-labelledby="company-dialog-title" oncancel={(event) => { if (busy) event.preventDefault(); }}>
  {#if step === "issued" && issued && target}
    <div class="dialog-icon ok"><Link2 size={22} aria-hidden="true" /></div>
    <h2 id="company-dialog-title">{t(`ลิงก์สำหรับเจ้าของ ${target.displayName}`, `The link for ${target.displayName}'s owner`)}</h2>
    <p>
      {t(
        `ส่งลิงก์นี้ให้ ${issued.result.invitation.email} ทาง LINE หรืออีเมล ลิงก์นี้แสดงครั้งเดียว ถ้าหาย ให้เชิญอีเมลเดิมอีกครั้งเพื่อได้ลิงก์ใหม่`,
        `Send this link to ${issued.result.invitation.email} by LINE or email. It is shown only once; if it is lost, invite the same email again for a new link.`,
      )}
    </p>
    {#if issued.result.reissued}<p class="dialog-note">{t("ลิงก์เดิมที่ส่งให้อีเมลนี้ใช้ไม่ได้แล้ว", "The earlier link for this email no longer works.")}</p>{/if}
    {#each signInWarnings(issued.result) as warning (warning)}
      <div class="dialog-warning" role="status">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>
          {#if warning === "google"}
            {t(
              "ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google เจ้าของบริษัทจะสร้างบัญชีไม่ได้จนกว่าจะเปิด",
              "Google sign-in is off, so the owner can't make an account until it's turned on.",
            )}
          {:else}
            {t(
              `โดเมน @${emailDomain(issued.result.invitation.email)} ยังไม่อยู่ในโดเมนอีเมลที่ระบบอนุญาต เจ้าของบริษัทจะเข้าสู่ระบบไม่ได้จนกว่าจะเพิ่มโดเมนนี้`,
              `@${emailDomain(issued.result.invitation.email)} isn't one of the sign-in's allowed email domains, so the owner can't sign in until it's added.`,
            )}
          {/if}
        </span>
      </div>
    {/each}
    <label class="dialog-label" for="company-owner-link">{t("ลิงก์เชิญเจ้าของ", "Owner invitation link")}</label>
    <input id="company-owner-link" class="dialog-link" readonly value={issued.link} onfocus={(event) => event.currentTarget.select()} />
    <div class="dialog-share">
      <button type="button" class="k-button" onclick={() => copy(issued!.link, "link")}
        >{#if copied === "link"}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกลิงก์", "Copy link")}{/if}</button
      >
      <button type="button" class="k-button" onclick={() => copy(message, "message")}
        >{#if copied === "message"}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกข้อความเชิญ", "Copy message")}{/if}</button
      >
      <a class="k-button line-share" href={lineShareURL(message)} target="_blank" rel="noopener noreferrer"><Send size={16} aria-hidden="true" />{t("ส่งทาง LINE", "Send by LINE")}</a>
    </div>
    <p class="dialog-note">{t(`ใช้ได้ถึง ${displayDate(issued.result.invitation.expiresAt)} · บทบาท เจ้าของ`, `Valid until ${displayDate(issued.result.invitation.expiresAt)} · Owner`)}</p>
    {#if formError}<p class="dialog-error" role="alert">{formError}</p>{/if}
    <div class="dialog-actions">
      <button type="button" class="k-button primary" onclick={() => dialog?.close()}>{t("เสร็จสิ้น", "Done")}</button>
    </div>
  {:else if step === "invite" && target}
    <form onsubmit={(event) => { event.preventDefault(); void inviteOwner(); }}>
      <div class="dialog-icon"><MailPlus size={22} aria-hidden="true" /></div>
      <h2 id="company-dialog-title">{t(`เชิญเจ้าของ ${target.displayName}`, `Invite ${target.displayName}'s owner`)}</h2>
      {#if justOpened}<p class="dialog-note ok"><Check size={16} aria-hidden="true" />{t(`เปิดบริษัท ${target.displayName} แล้ว`, `${target.displayName} is open.`)}</p>{/if}
      <p>
        {t(
          "ORCA จะสร้างลิงก์ให้คุณส่งเอง เจ้าของต้องเข้าสู่ระบบด้วย Google โดยใช้อีเมลนี้ (Gmail หรือ Google Workspace) ลิงก์ใช้ได้ 7 วัน",
          "ORCA makes a link for you to send. The owner signs in with Google using this email (Gmail or Google Workspace). It works for 7 days.",
        )}
      </p>
      <fieldset disabled={busy}>
        <label class="dialog-label" for="company-owner-email">{t("อีเมลของเจ้าของบริษัท", "The owner's email")}</label>
        <input id="company-owner-email" class="dialog-input" type="email" bind:this={emailInput} bind:value={email} autocomplete="off" required maxlength="254" placeholder="owner@company.com" />
      </fieldset>
      {#if formError}<p class="dialog-error" role="alert">{formError}</p>{/if}
      <div class="dialog-actions">
        <button type="button" class="k-button" disabled={busy} onclick={() => dialog?.close()}>{justOpened ? t("ไว้ทีหลัง", "Later") : t("ยกเลิก", "Cancel")}</button>
        <button type="submit" class="k-button primary" disabled={busy}>{busy ? t("กำลังสร้าง…", "Creating…") : t("สร้างลิงก์เชิญ", "Create invitation link")}</button>
      </div>
    </form>
  {:else}
    <form onsubmit={(event) => { event.preventDefault(); void openCompany(); }}>
      <div class="dialog-icon"><Building2 size={22} aria-hidden="true" /></div>
      <h2 id="company-dialog-title">{t("เปิดบริษัทใหม่", "Open a company")}</h2>
      <p>
        {t(
          "บริษัทใหม่ยังไม่มีใครเป็นสมาชิก รวมถึงคุณด้วย ขั้นต่อไปคือเชิญเจ้าของบริษัท",
          "A new company has no members yet, you included. Next, you invite its owner.",
        )}
      </p>
      <fieldset disabled={busy}>
        <label class="dialog-label" for="company-name">{t("ชื่อบริษัท", "Company name")}</label>
        <input id="company-name" class="dialog-input" bind:this={nameInput} bind:value={name} autocomplete="off" required maxlength="120" placeholder={t("เช่น โรงแรมตัวอย่าง", "e.g. Example Hotel")} />
      </fieldset>
      {#if formError}<p class="dialog-error" role="alert">{formError}</p>{/if}
      <div class="dialog-actions">
        <button type="button" class="k-button" disabled={busy} onclick={() => dialog?.close()}>{t("ยกเลิก", "Cancel")}</button>
        <button type="submit" class="k-button primary" disabled={busy}>{busy ? t("กำลังเปิด…", "Opening…") : t("เปิดบริษัท", "Open company")}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  /* The settings panel's look; its own styles are scoped to the settings page. */
  .platform-companies { overflow: hidden; margin-bottom: 16px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .platform-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding: 16px 18px; }
  .platform-head > div { flex: 1 1 320px; min-width: 0; }
  .platform-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
  .platform-head h2 :global(svg) { flex: none; color: var(--orca-subtle); }
  .platform-head p { margin: 2px 0 0; color: var(--orca-muted); font-size: 13px; line-height: 1.6; }
  .platform-head :global(.k-button) { white-space: nowrap; }
  .platform-companies > :global(.k-banner) { margin: 0 18px 12px; }
  .companies-loading { margin: 0; padding: 14px 18px 18px; color: var(--orca-muted); font-size: 14px; }
  .companies-table-wrap { overflow-x: auto; border-top: 1px solid var(--orca-line); }
  .companies-table th { white-space: nowrap; }
  .companies-table td { vertical-align: top; }
  .company-name { min-width: 180px; }
  .company-name strong, .company-seats strong { display: block; font-weight: 600; overflow-wrap: anywhere; }
  .companies-table td p { margin: 1px 0 0; }
  .companies-actions-col { width: 1%; white-space: nowrap; text-align: right; }
  .companies-table :global(.k-button) { white-space: nowrap; }
  .owner-status { display: inline-flex; padding: 2px 8px; border-radius: var(--orca-radius-sm); font-size: 12.5px; font-weight: 500; white-space: nowrap; }
  .owner-status.tone-ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .owner-status.tone-waiting { background: var(--orca-warn-bg); color: var(--orca-warn); }
  .owner-status.tone-bad { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .owner-status.tone-muted { background: var(--orca-secondary); color: var(--orca-nav); }
  .owner-invitation { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 8px; font-size: 13.5px; }
  .owner-invitation-email { font-weight: 500; overflow-wrap: anywhere; }
  .owner-invitation-actions { display: inline-flex; gap: 6px; }
  .company-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-ink); box-shadow: var(--orca-popover-shadow); }
  .company-dialog::backdrop { background: color-mix(in srgb, var(--orca-ink) 45%, transparent); }
  .company-dialog h2 { margin: 16px 0 4px; font-size: 18px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
  .company-dialog p { margin: 8px 0; color: var(--orca-muted); font-size: 14px; line-height: 1.7; }
  .company-dialog fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .dialog-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--orca-radius); background: var(--orca-secondary); color: var(--orca-nav); }
  .dialog-icon.ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .dialog-label { display: block; margin: 16px 0 6px; color: var(--orca-ink); font-size: 13.5px; font-weight: 600; }
  .dialog-input, .dialog-link { width: 100%; min-height: 38px; padding: 8px 11px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .dialog-link { background: var(--orca-surface-2); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; }
  .dialog-share { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .line-share { text-decoration: none; }
  .company-dialog .dialog-note { font-size: 13px; }
  .company-dialog .dialog-note.ok { display: flex; align-items: center; gap: 6px; color: var(--orca-ok); }
  .dialog-warning { display: flex; align-items: flex-start; gap: 8px; margin: 10px 0 0; padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-warn-bg); color: var(--orca-warn); font-size: 13px; line-height: 1.6; }
  .dialog-warning :global(svg) { flex: none; margin-top: 2px; }
  .dialog-error { padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny) !important; font-size: 13px !important; }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  @media (max-width: 600px) {
    .dialog-share > :global(*) { flex: 1 1 auto; justify-content: center; }
    /* One card per company instead of a table that scrolls sideways; the
       panel's class outranks the workspace's own table cell rules. */
    .platform-companies .companies-table thead { display: none; }
    .platform-companies .companies-table, .platform-companies .companies-table tbody, .platform-companies .companies-table tr, .platform-companies .companies-table td { display: block; width: auto; min-width: 0; }
    .platform-companies .companies-table tr { padding: 12px 18px; border-bottom: 1px solid var(--orca-line); }
    .platform-companies .companies-table tr:last-child { border-bottom: 0; }
    .platform-companies .companies-table td { padding: 4px 0; border: 0; }
    .platform-companies .companies-table td.company-seats { display: flex; align-items: baseline; gap: 6px; }
    .platform-companies .companies-table td.company-seats p { margin: 0; }
    .platform-companies .companies-actions-col { text-align: left; }
  }
</style>
