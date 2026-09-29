<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Building2, Check, Copy, ExternalLink, Link2, MailPlus, Plus, Send, TriangleAlert, X } from "@lucide/svelte";
  import { parseErrorContent } from "$lib/errors";
  import { invitationLink, lineShareURL } from "$lib/orca/invitations";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { platformHref } from "$lib/orca/navigation";
  import { canInviteOwner, canRevokeOwnerInvitation, emailDomain, ownerStatus, platformRefusal, resendEmail, signInWarnings, type OwnerStatus } from "$lib/orca/platform-companies";
  import { OrcaService, displayDate, orcaError, type OrcaOwnerInvitationLink, type OrcaPlatformCompany } from "$lib/services/orca";
  import { externalBrowserLink } from "$lib/services/orca-platform";
  import PlatformBadge from "./platform/PlatformBadge.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import StatusPill, { type StatusTone } from "./ui/StatusPill.svelte";

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
  let linkInput: HTMLInputElement | undefined = $state();
  /** "ส่งลิงก์ใหม่": the dialog reissues the waiting owner's link. */
  let resending = $state(false);
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
  // Whether Google sign-in is on: owners can't make an account without it.
  let googleOn = $state<boolean>();
  let request = 0;

  const statusText = (status: OwnerStatus, owners: number) =>
    ({
      owned: owners > 1 ? t(`มีเจ้าของ ${owners} คน`, `${owners} owners`) : t("มีเจ้าของแล้ว", "Has an owner"),
      waiting: t("รอเจ้าของตอบรับ", "Waiting for the owner"),
      expired: t("ลิงก์เชิญหมดอายุ", "Invitation link expired"),
      none: t("ยังไม่มีเจ้าของ", "No owner yet"),
    })[status];
  const statusTone = (status: OwnerStatus): StatusTone => (({ owned: "ok", waiting: "warn", expired: "deny", none: "neutral" }) as const)[status];
  // The invitation a revoke dialog is about, with its company.
  const revokingTarget = $derived(
    revoking
      ? items.flatMap((company) => company.ownerInvitations.map((invitation) => ({ company, invitation }))).find((item) => item.invitation.id === revoking)
      : undefined,
  );
  const customers = $derived(items.filter((company) => company.id !== "default"));
  const message = $derived(
    issued && target
      ? t(
          `คุณได้รับเชิญเป็นเจ้าของ ${target.displayName} บน ORCA เปิดลิงก์นี้แล้วเข้าสู่ระบบด้วย Google โดยใช้อีเมล ${issued.result.invitation.email} (ใช้ได้ถึง ${displayDate(issued.result.invitation.expiresAt)})\n${externalBrowserLink(issued.link)}`,
          `You're invited to be the owner of ${target.displayName} on ORCA. Open this link and sign in with Google using ${issued.result.invitation.email} (valid until ${displayDate(issued.result.invitation.expiresAt)}):\n${externalBrowserLink(issued.link)}`,
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
  async function loadGoogle() {
    try {
      googleOn = (await OrcaService.googleSignIn()).enabled;
    } catch {
      googleOn = undefined;
    }
  }
  onMount(() => {
    void load();
    void loadGoogle();
  });

  async function show(next: "open" | "invite", company?: OrcaPlatformCompany) {
    step = next;
    target = company;
    justOpened = false;
    name = "";
    // A new link for the owner already invited: their email, so a typo can't start a second invitation.
    email = company ? resendEmail(company) : "";
    resending = !!email;
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
      formError = t("กรอกชื่อบริษัท", "Enter the company's name.");
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
      formError = t("กรอกอีเมลของเจ้าของบริษัท", "Enter the owner's email.");
      return;
    }
    busy = true;
    formError = "";
    try {
      const result = await OrcaService.inviteCompanyOwner(target.id, address);
      issued = { link: invitationLink(window.location.origin, result.token), result };
      step = "issued";
      // The button that was focused is gone: put focus on the link to copy.
      await tick();
      linkInput?.focus();
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
      revoking = "";
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

<PageHeader
  title={t("บริษัทลูกค้า", "Customer companies")}
  subtitle={t("เปิดบริษัทให้ลูกค้า แล้วส่งลิงก์ให้เจ้าของดูแลเอง คุณไม่ได้เป็นสมาชิกของบริษัทเหล่านี้", "Open a company and send its owner a link. You are not a member of these companies.")}
>
  {#snippet eyebrow()}<PlatformBadge />{/snippet}
  {#snippet action()}<button type="button" class="k-button primary companies-open" onclick={() => show("open")}><Plus size={16} aria-hidden="true" />{t("เปิดบริษัทใหม่", "Open a company")}</button>{/snippet}
</PageHeader>

<div class="companies-bar">
  {#if googleOn !== undefined}
    <StatusPill label={googleOn ? t("Google: เปิดอยู่", "Google: on") : t("Google: ปิดอยู่", "Google: off")} tone={googleOn ? "ok" : "warn"} dot />
    {#if !googleOn}<a class="companies-bar-link" href={localeHref(platformHref("signin"))}>{t("เปิดการเข้าสู่ระบบด้วย Google", "Turn on Google sign-in")}</a>{/if}
  {/if}
  {#if loaded}<span class="companies-bar-count">{t(`${customers.length} บริษัทลูกค้า`, `${customers.length} customer ${customers.length === 1 ? "company" : "companies"}`)}</span>{/if}
</div>

{#if listError}<div class="companies-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /><span>{listError}</span></div>{/if}
{#if !loaded && !listError}
  <p class="companies-loading">{t("กำลังโหลดรายชื่อบริษัท…", "Loading companies…")}</p>
{:else if loaded}
  <section class="companies-list" aria-labelledby="platform-companies-title">
    <h2 id="platform-companies-title" class="companies-sr">{t("บริษัทลูกค้า", "Customer companies")}</h2>
    <table class="companies-table">
      <thead>
        <tr>
          <th scope="col">{t("บริษัท", "Company")}</th>
          <th scope="col">{t("คนที่ใช้งานได้", "People")}</th>
          <th scope="col">{t("เจ้าของ", "Owner")}</th>
          <th scope="col" class="companies-actions-col"><span class="companies-sr">{t("การจัดการ", "Actions")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each items as company (company.id)}
          {@const status = ownerStatus(company)}
          <tr>
            <td>
              <div class="company-name">
                <span class="company-mark" aria-hidden="true"><Building2 size={17} /></span>
                <span>
                  <strong>{company.displayName}</strong>
                  <small>{company.id === "default" ? t("บริษัทของทีม ORCA", "The ORCA team's company") : t(`เปิดเมื่อ ${displayDate(company.createdAt)}`, `Opened ${displayDate(company.createdAt)}`)}</small>
                </span>
              </div>
            </td>
            <td class="company-seats"><span class="company-seats-label">{t("ใช้งานได้", "Active:")}</span><strong>{company.seats}</strong><small>{t("คน", company.seats === 1 ? "person" : "people")}</small></td>
            <td class="company-owner">
              <StatusPill label={statusText(status, company.owners)} tone={statusTone(status)} />
              {#each company.ownerInvitations as invitation (invitation.id)}
                <div class="owner-invitation">
                  <span class="owner-invitation-email">{invitation.email}</span>
                  <small>{invitation.status === "expired" ? t(`หมดอายุ ${displayDate(invitation.expiresAt)}`, `Expired ${displayDate(invitation.expiresAt)}`) : t(`ใช้ได้ถึง ${displayDate(invitation.expiresAt)}`, `Valid until ${displayDate(invitation.expiresAt)}`)}</small>
                  {#if canRevokeOwnerInvitation(invitation)}<button type="button" class="k-button quiet small" disabled={!!actionID} onclick={() => (revoking = invitation.id)} aria-label={t(`ยกเลิกคำเชิญของ ${invitation.email}`, `Revoke the invitation for ${invitation.email}`)}
                    ><X size={14} aria-hidden="true" />{t("ยกเลิก", "Revoke")}</button
                  >{/if}
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
  </section>
{/if}

<ConfirmDialog
  open={!!revokingTarget}
  title={t("ยกเลิกคำเชิญนี้ไหม", "Revoke this invitation?")}
  message={revokingTarget ? t(`ลิงก์ที่ส่งให้ ${revokingTarget.invitation.email} จะใช้ไม่ได้ทันที เชิญใหม่ได้ภายหลัง`, `The link sent to ${revokingTarget.invitation.email} stops working at once. You can invite again later.`) : ""}
  confirmLabel={t("ยกเลิกคำเชิญ", "Revoke invitation")}
  cancelLabel={t("ไม่ยกเลิก", "Keep")}
  tone="danger"
  icon={X}
  busy={!!actionID}
  oncancel={() => (revoking = "")}
  onconfirm={() => revokingTarget && revoke(revokingTarget.company, revokingTarget.invitation.id)}
/>

<!-- The one-time link is shown once: Escape does not close it before it is copied (เสร็จสิ้น does). -->
<dialog bind:this={dialog} class="company-dialog" aria-labelledby="company-dialog-title" oncancel={(event) => { if (busy || (step === "issued" && !copied)) event.preventDefault(); }}>
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
            <!-- A new tab: this dialog shows the owner's link only once, so it must stay open. -->
            <a class="dialog-warning-link" href={localeHref(platformHref("signin"))} target="_blank" rel="noopener"
              >{t("เปิดการเข้าสู่ระบบด้วย Google", "Turn on Google sign-in")}<ExternalLink size={13} aria-hidden="true" /><span class="companies-sr">{t(" (เปิดในแท็บใหม่)", " (opens in a new tab)")}</span></a
            >
          {:else}
            <!-- The server's own list (the local auth provider's email domains), not the Google page's joining domains. -->
            {t(
              `โดเมน @${emailDomain(issued.result.invitation.email)} ยังไม่อยู่ในรายการ Email domains ของผู้ให้บริการเข้าสู่ระบบบนเซิร์ฟเวอร์ ORCA เจ้าของบริษัทจะเข้าสู่ระบบไม่ได้จนกว่าผู้ดูแลเซิร์ฟเวอร์จะเพิ่มโดเมนนี้ (หรือ *) ที่นั่น อย่าเพิ่มใน “เข้าสู่ระบบด้วย Google › ขั้นสูง” เพราะคนทั้งโดเมนจะเข้าบริษัทของทีม ORCA เป็นพนักงาน`,
              `@${emailDomain(issued.result.invitation.email)} isn't in the Email domains of the ORCA server's sign-in provider, so the owner can't sign in until a server admin adds it (or *) there. Don't add it under “Sign in with Google › Advanced”: that makes everyone at the domain join the ORCA team's company as employees.`,
            )}
          {/if}
        </span>
      </div>
    {/each}
    <label class="dialog-label" for="company-owner-link">{t("ลิงก์เชิญเจ้าของ", "Owner invitation link")}</label>
    <input id="company-owner-link" class="dialog-link" readonly bind:this={linkInput} value={issued.link} onfocus={(event) => event.currentTarget.select()} />
    <div class="dialog-share">
      <button type="button" class="k-button" onclick={() => copy(issued!.link, "link")}
        >{#if copied === "link"}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกลิงก์", "Copy link")}{/if}</button
      >
      <button type="button" class="k-button" onclick={() => copy(message, "message")}
        >{#if copied === "message"}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกข้อความเชิญ", "Copy message")}{/if}</button
      >
      <a class="k-button line-share" href={lineShareURL(message)} target="_blank" rel="noopener noreferrer"><Send size={16} aria-hidden="true" />{t("ส่งทาง LINE", "Send by LINE")}</a>
    </div>
    <p class="dialog-note">{t(`ใช้ได้ถึง ${displayDate(issued.result.invitation.expiresAt)} · บทบาท เจ้าของบริษัท`, `Valid until ${displayDate(issued.result.invitation.expiresAt)} · Company owner`)}</p>
    {#if formError}<p class="dialog-error" role="alert">{formError}</p>{/if}
    <div class="dialog-actions">
      <button type="button" class="k-button primary" onclick={() => dialog?.close()}>{t("เสร็จสิ้น", "Done")}</button>
    </div>
  {:else if step === "invite" && target}
    <form onsubmit={(event) => { event.preventDefault(); void inviteOwner(); }}>
      <div class="dialog-icon"><MailPlus size={22} aria-hidden="true" /></div>
      <h2 id="company-dialog-title">{resending ? t(`ส่งลิงก์ใหม่ให้เจ้าของ ${target.displayName}`, `A new link for ${target.displayName}'s owner`) : t(`เชิญเจ้าของ ${target.displayName}`, `Invite ${target.displayName}'s owner`)}</h2>
      {#if resending}<p class="dialog-note">{t(`ลิงก์ใหม่จะแทนลิงก์เดิมที่ส่งให้ ${email} ลิงก์เดิมจะใช้ไม่ได้อีก`, `The new link replaces the one sent to ${email}; the old link stops working.`)}</p>{/if}
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
  .companies-open { min-height: 42px; padding: 0 18px; font-weight: 600; }
  .companies-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: -4px 0 14px; font-size: 13.5px; }
  .companies-bar-link { color: var(--orca-ink); font-weight: 600; text-decoration: underline; text-decoration-color: var(--orca-line-strong); text-underline-offset: 3px; }
  .companies-bar-count { margin-left: auto; color: var(--orca-muted); }
  .companies-error { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 14px; padding: 12px 16px; border: 1px solid var(--orca-deny-line); border-radius: var(--orca-radius-lg); background: var(--orca-deny-bg); color: var(--orca-deny); font-size: 14px; }
  .companies-error :global(svg) { flex: none; margin-top: 2px; }
  .companies-loading { margin: 0; padding: 18px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-muted); font-size: 14px; }
  .companies-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .companies-list { container: companies / inline-size; overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent); }
  .companies-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .companies-table th { padding: 11px 18px; border-bottom: 1px solid var(--orca-line); background: var(--orca-surface-2); color: var(--orca-muted); font-size: 12.5px; font-weight: 600; text-align: left; white-space: nowrap; }
  .companies-table td { padding: 14px 18px; border-top: 1px solid var(--orca-line-soft); vertical-align: top; }
  .companies-table tbody tr:first-child td { border-top: 0; }
  .company-name { display: flex; align-items: flex-start; gap: 12px; min-width: 220px; }
  .company-mark { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--orca-secondary); color: var(--orca-text-2); }
  .company-name strong { display: block; font-weight: 600; overflow-wrap: anywhere; }
  .company-seats { white-space: nowrap; }
  .company-seats strong { font-weight: 600; }
  .companies-table td.company-seats small { display: inline; margin-left: 4px; }
  .companies-table small { display: block; color: var(--orca-muted); font-size: 13px; }
  .company-seats strong { font-variant-numeric: tabular-nums; }
  .company-seats-label { display: none; }
  .company-owner { min-width: 240px; }
  .companies-actions-col { width: 1%; text-align: right; white-space: nowrap; }
  .companies-table :global(.k-button) { gap: 6px; white-space: nowrap; }
  .owner-invitation { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; margin-top: 8px; font-size: 13.5px; }
  .owner-invitation-email { font-weight: 500; overflow-wrap: anywhere; }
  .owner-invitation small { display: inline; }
  .owner-invitation :global(.k-button) { min-height: 28px; padding: 0 8px; }

  .company-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 28px 28px 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-xl); background: var(--orca-surface); color: var(--orca-ink); box-shadow: var(--orca-dialog-shadow); }
  .company-dialog::backdrop { background: var(--orca-scrim, rgba(21, 24, 35, 0.45)); }
  .company-dialog h2 { margin: 18px 0 4px; font-size: 19px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
  .company-dialog p { margin: 8px 0; color: var(--orca-muted); font-size: 14.5px; line-height: 1.6; }
  .company-dialog fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .dialog-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: var(--orca-secondary); color: var(--orca-text-2); }
  .dialog-icon.ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .dialog-label { display: block; margin: 16px 0 6px; color: var(--orca-ink); font-size: 14px; font-weight: 600; }
  .dialog-input, .dialog-link { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid var(--orca-field-line); border-radius: var(--orca-radius); background: var(--orca-field); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .dialog-link { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .dialog-share { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .line-share { text-decoration: none; }
  .company-dialog .dialog-note { font-size: 13px; }
  .company-dialog .dialog-note.ok { display: flex; align-items: center; gap: 6px; color: var(--orca-ok); }
  .dialog-warning { display: flex; align-items: flex-start; gap: 8px; margin: 10px 0 0; padding: 10px 12px; border: 1px solid var(--orca-warn-line); border-radius: var(--orca-radius); background: var(--orca-warn-bg); color: var(--orca-warn); font-size: 13.5px; line-height: 1.6; }
  .dialog-warning :global(svg) { flex: none; margin-top: 3px; }
  .dialog-warning-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 2px; color: var(--orca-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .dialog-error { padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny) !important; font-size: 13.5px !important; }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 24px; }
  .dialog-actions :global(.k-button) { min-height: 42px; padding: 0 18px; font-weight: 600; }

  /* Under 720px of page each company is a card; the cards also start when the list itself is narrower
     than the table needs (a laptop with the sidebar open), so no action is ever cut off. */
  @media (max-width: 720px) {
    .companies-bar-count { margin-left: 0; }
    .dialog-share > :global(*) { flex: 1 1 auto; justify-content: center; }
  }
  @container companies (max-width: 860px) {
    .companies-table thead { display: none; }
    .companies-table, .companies-table tbody, .companies-table tr, .companies-table td { display: block; width: auto; min-width: 0; }
    .companies-table tr { padding: 14px 16px; border-top: 1px solid var(--orca-line-soft); }
    .companies-table tbody tr:first-child { border-top: 0; }
    .companies-table td { padding: 4px 0; border: 0; }
    .companies-table td.company-seats { padding-left: 46px; }
    .company-seats-label { display: inline; margin-right: 4px; color: var(--orca-muted); font-size: 13px; }
    .companies-table td.company-owner { padding-left: 46px; }
    .companies-actions-col { padding-left: 46px !important; text-align: left; }
  }
</style>
