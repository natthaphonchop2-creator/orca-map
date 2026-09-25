<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { Check, Copy, Link2, MailPlus, RefreshCw, Send, X } from "@lucide/svelte";
  import { invitationLink, invitationTone, lineShareURL, splitInvitations } from "$lib/orca/invitations";
  import { t } from "$lib/orca/locale.svelte";
  import { OrcaService, displayDate, memberName, orcaError, type OrcaBootstrap, type OrcaInvitation } from "$lib/services/orca";

  // Invitation links until ORCA sends mail itself: the manager shares each link
  // by LINE or email, and the person accepts it after signing in.
  let {
    data,
    inviting = $bindable(false),
    onchanged,
  }: { data: OrcaBootstrap; inviting?: boolean; onchanged?: () => void | Promise<void> } = $props();
  let items = $state<OrcaInvitation[]>([]);
  let loaded = $state(false);
  let listError = $state("");
  let notice = $state("");
  let dialog: HTMLDialogElement | undefined = $state();
  let emailInput: HTMLInputElement | undefined = $state();
  let email = $state("");
  let role = $state<OrcaInvitation["role"]>("employee");
  let unitIDs = $state<string[]>([]);
  let busy = $state(false);
  let formError = $state("");
  let issued = $state<{ link: string; invitation: OrcaInvitation; renewed: boolean }>();
  let copied = $state<"" | "link" | "message">("");
  let actionID = $state("");
  let revoking = $state("");
  let request = 0;

  const departments = $derived(data.units.filter((unit) => unit.kind === "department" && !unit.archivedAt && !unit.deletedAt));
  // Only an owner changes roles, so only an owner invites administrators.
  const canInviteAdmins = $derived(data.canManageRoles === true);
  const groups = $derived(splitInvitations(items));
  const roleLabel = (value: OrcaInvitation["role"]) => (value === "admin" ? t("ผู้ดูแลระบบ", "Admin") : t("สมาชิกทั่วไป", "Member"));
  const statusLabel = (value: OrcaInvitation["status"]) =>
    ({ pending: t("รอตอบรับ", "Waiting"), accepted: t("ตอบรับแล้ว", "Accepted"), revoked: t("ยกเลิกแล้ว", "Revoked"), expired: t("หมดอายุ", "Expired") })[value];
  const departmentNames = (ids: string[]) =>
    ids.map((id) => data.units.find((unit) => unit.id === id)?.name ?? t("แผนกที่ถูกลบ", "Deleted department")).join(", ");
  const person = (id?: string) => {
    const member = data.members.find((item) => item.id === id);
    return member ? memberName(member) : "—";
  };
  const organization = $derived(data.organization.displayName || "ORCA");
  const message = $derived(
    issued
      ? t(
          `คุณได้รับเชิญเข้าร่วม ${organization} บน ORCA ในฐานะ${roleLabel(issued.invitation.role)} เปิดลิงก์นี้แล้วเข้าสู่ระบบด้วยอีเมล ${issued.invitation.email} (ใช้ได้ถึง ${displayDate(issued.invitation.expiresAt)})\n${issued.link}`,
          `You're invited to join ${organization} on ORCA as ${roleLabel(issued.invitation.role)}. Open this link and sign in with ${issued.invitation.email} (valid until ${displayDate(issued.invitation.expiresAt)}):\n${issued.link}`,
        )
      : "",
  );

  async function load() {
    const current = ++request;
    try {
      const next = await OrcaService.invitations();
      if (current !== request) return;
      items = next;
      loaded = true;
      listError = "";
    } catch (cause) {
      if (current === request) listError = orcaError(cause);
    }
  }
  onMount(() => void load());

  // The header's button opens the dialog through `inviting`; closing resets it.
  $effect(() => {
    if (inviting && dialog && !dialog.open) {
      untrack(() => {
        if (!issued) resetForm();
        dialog?.showModal();
      });
      void tick().then(() => (issued ? undefined : emailInput?.focus()));
    }
  });
  function resetForm() {
    email = "";
    role = "employee";
    unitIDs = [];
    formError = "";
    copied = "";
  }
  function closed() {
    inviting = false;
    issued = undefined;
    copied = "";
  }
  function toggleUnit(id: string) {
    unitIDs = unitIDs.includes(id) ? unitIDs.filter((value) => value !== id) : [...unitIDs, id];
  }

  async function submit() {
    if (busy) return;
    const address = email.trim();
    if (!address) {
      formError = t("กรุณากรอกอีเมลของคนที่ต้องการเชิญ", "Enter the email of the person to invite.");
      return;
    }
    busy = true;
    formError = "";
    try {
      const created = await OrcaService.invite(address, canInviteAdmins ? role : "employee", unitIDs);
      issued = { link: invitationLink(window.location.origin, created.token), invitation: created.invitation, renewed: false };
      await load();
      await onchanged?.();
    } catch (cause) {
      formError = orcaError(cause);
    } finally {
      busy = false;
    }
  }

  async function reissue(item: OrcaInvitation) {
    if (actionID) return;
    actionID = item.id;
    notice = "";
    listError = "";
    try {
      const renewed = await OrcaService.reissueInvitation(item.id);
      issued = { link: invitationLink(window.location.origin, renewed.token), invitation: renewed.invitation, renewed: true };
      inviting = true;
      await load();
    } catch (cause) {
      // Reload first, since loading clears the list's error.
      const message = orcaError(cause);
      await load();
      listError = message;
    } finally {
      actionID = "";
    }
  }

  async function revoke(item: OrcaInvitation) {
    if (actionID) return;
    actionID = item.id;
    notice = "";
    listError = "";
    try {
      await OrcaService.revokeInvitation(item.id);
      revoking = "";
      notice = t(`ยกเลิกคำเชิญของ ${item.email} แล้ว ลิงก์เดิมใช้ไม่ได้อีก`, `Revoked the invitation for ${item.email}. Its link no longer works.`);
      await load();
    } catch (cause) {
      // Reload first, since loading clears the list's error.
      const message = orcaError(cause);
      await load();
      listError = message;
    } finally {
      actionID = "";
    }
  }

  async function copy(text: string, what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
    } catch {
      formError = t("คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง", "Copy failed. Select the text and copy it yourself.");
    }
  }
</script>

{#if loaded && items.length}
  <section class="team-invitations" aria-labelledby="team-invitations-title">
    <div class="inv-head">
      <div class="k-section-title">
        <h2 id="team-invitations-title">{t("คำเชิญ", "Invitations")}</h2>
        {#if groups.open.length}<span class="k-badge">{groups.open.length}</span>{/if}
      </div>
      <p class="k-small k-muted">
        {t(
          "ORCA ยังไม่ส่งอีเมลเอง ส่งลิงก์ให้แต่ละคนทาง LINE หรืออีเมล เมื่อเขาเข้าสู่ระบบด้วยอีเมลที่เชิญและกดรับ จะได้บทบาทและแผนกตามที่กำหนดทันที",
          "ORCA does not send email yet. Share each link by LINE or email. When the person signs in with the invited email and accepts, they get the role and departments you chose.",
        )}
      </p>
    </div>
    {#if listError}<div class="k-banner error" role="alert">{listError}</div>{/if}
    {#if notice}<div class="k-banner success" role="status"><Check size={16} aria-hidden="true" />{notice}</div>{/if}
    {#if groups.open.length}
      <div class="inv-table-wrap">
        <table class="k-table inv-table">
          <thead
            ><tr
              ><th scope="col">{t("อีเมล", "Email")}</th><th scope="col">{t("บทบาท", "Role")}</th><th scope="col">{t("แผนก", "Department")}</th><th scope="col"
                >{t("สถานะ", "Status")}</th
              ><th scope="col" class="inv-actions-col">{t("การจัดการ", "Actions")}</th></tr
            ></thead
          >
          <tbody>
            {#each groups.open as item (item.id)}
              <tr>
                <td class="inv-person"><strong>{item.email}</strong><p class="k-small k-muted">{t(`เชิญโดย ${person(item.invitedBy)}`, `Invited by ${person(item.invitedBy)}`)}</p></td>
                <td><span class="inv-role">{roleLabel(item.role)}</span></td>
                <td>{#if item.unitIDs.length}{departmentNames(item.unitIDs)}{:else}<span class="inv-none">{t("ไม่ระบุ", "None")}</span>{/if}</td>
                <td
                  ><span class="invitation-status tone-{invitationTone(item.status)}">{statusLabel(item.status)}</span>
                  <p class="k-small k-muted">{item.status === "expired" ? t(`หมดอายุ ${displayDate(item.expiresAt)}`, `Expired ${displayDate(item.expiresAt)}`) : t(`ใช้ได้ถึง ${displayDate(item.expiresAt)}`, `Valid until ${displayDate(item.expiresAt)}`)}</p></td
                >
                <td class="inv-actions-col">
                  {#if revoking === item.id}
                    <div class="invitation-actions">
                      <button class="k-button small danger" disabled={!!actionID} onclick={() => revoke(item)}>{t("ยืนยันยกเลิก", "Confirm revoke")}</button>
                      <button class="k-button small" disabled={!!actionID} onclick={() => (revoking = "")}>{t("ไม่ยกเลิก", "Keep")}</button>
                    </div>
                  {:else}
                    <div class="invitation-actions">
                      <button class="k-button small" disabled={!!actionID || (item.role === "admin" && !canInviteAdmins)} onclick={() => reissue(item)}
                        ><RefreshCw size={14} aria-hidden="true" />{t("สร้างลิงก์ใหม่", "New link")}</button
                      >
                      {#if item.status === "pending"}<button class="k-button small" disabled={!!actionID} onclick={() => (revoking = item.id)}
                          ><X size={14} aria-hidden="true" />{t("ยกเลิกคำเชิญ", "Revoke")}</button
                        >{/if}
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if groups.closed.length}
      <details class="invitation-history">
        <summary>{t(`ตอบรับหรือยกเลิกแล้วใน 30 วันที่ผ่านมา (${groups.closed.length})`, `Accepted or revoked in the last 30 days (${groups.closed.length})`)}</summary>
        <ul>
          {#each groups.closed as item (item.id)}
            <li>
              <span>{item.email} · {roleLabel(item.role)}</span>
              <span class="invitation-status tone-{invitationTone(item.status)}">{statusLabel(item.status)}</span>
              <span class="k-small k-muted">{displayDate(item.acceptedAt ?? item.revokedAt)}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>
{/if}

<dialog bind:this={dialog} class="invitation-dialog" aria-labelledby="invitation-dialog-title" onclose={closed} oncancel={(event) => { if (busy) event.preventDefault(); }}>
  {#if issued}
    <div class="dialog-icon ok"><Link2 size={22} aria-hidden="true" /></div>
    <h2 id="invitation-dialog-title">{issued.renewed ? t("สร้างลิงก์ใหม่แล้ว", "New link ready") : t("สร้างลิงก์เชิญแล้ว", "Invitation link ready")}</h2>
    <p>
      {t(
        `ส่งลิงก์นี้ให้ ${issued.invitation.email} ทาง LINE หรืออีเมล ลิงก์นี้แสดงครั้งเดียว ถ้าหายให้กดสร้างลิงก์ใหม่ แล้วลิงก์เดิมจะใช้ไม่ได้`,
        `Send this link to ${issued.invitation.email} by LINE or email. It is shown only once; if it is lost, make a new link and the old one stops working.`,
      )}
    </p>
    <label class="invitation-label" for="invitation-link">{t("ลิงก์เชิญ", "Invitation link")}</label>
    <input id="invitation-link" class="invitation-link" readonly value={issued.link} onfocus={(event) => event.currentTarget.select()} />
    <div class="invitation-share">
      <button type="button" class="k-button" onclick={() => copy(issued!.link, "link")}
        >{#if copied === "link"}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกลิงก์", "Copy link")}{/if}</button
      >
      <button type="button" class="k-button" onclick={() => copy(message, "message")}
        >{#if copied === "message"}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกข้อความเชิญ", "Copy message")}{/if}</button
      >
      <a class="k-button line-share" href={lineShareURL(message)} target="_blank" rel="noopener noreferrer"><Send size={16} aria-hidden="true" />{t("ส่งทาง LINE", "Send by LINE")}</a>
    </div>
    <p class="invitation-note">{t(`ใช้ได้ถึง ${displayDate(issued.invitation.expiresAt)} · บทบาท ${roleLabel(issued.invitation.role)}`, `Valid until ${displayDate(issued.invitation.expiresAt)} · ${roleLabel(issued.invitation.role)}`)}</p>
    {#if formError}<p class="dialog-error" role="alert">{formError}</p>{/if}
    <div class="dialog-actions">
      <button type="button" class="k-button primary" onclick={() => dialog?.close()}>{t("เสร็จสิ้น", "Done")}</button>
    </div>
  {:else}
    <form onsubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div class="dialog-icon"><MailPlus size={22} aria-hidden="true" /></div>
      <h2 id="invitation-dialog-title">{t("เชิญสมาชิก", "Invite a member")}</h2>
      <p>
        {t(
          "ORCA จะสร้างลิงก์เชิญให้คุณส่งเองทาง LINE หรืออีเมล ลิงก์ใช้ได้ 7 วัน และใช้ได้เฉพาะคนที่เข้าสู่ระบบด้วยอีเมลนี้",
          "ORCA makes a link for you to send by LINE or email. It works for 7 days, and only for someone who signs in with this email.",
        )}
      </p>
      <fieldset disabled={busy}>
        <label class="invitation-label" for="invitation-email">{t("อีเมล", "Email")}</label>
        <input id="invitation-email" class="invitation-input" type="email" bind:this={emailInput} bind:value={email} autocomplete="off" required maxlength="254" placeholder="name@company.com" />
        {#if canInviteAdmins}
          <p class="invitation-label">{t("บทบาท", "Role")}</p>
          <div class="invitation-roles" role="radiogroup" aria-label={t("บทบาท", "Role")}>
            <label class:chosen={role === "employee"}><input type="radio" name="invitation-role" value="employee" bind:group={role} /><span><strong>{t("สมาชิกทั่วไป", "Member")}</strong><small>{t("ใช้พื้นที่ทำงาน AI ตามสิทธิ์", "Uses assigned AI workspaces")}</small></span></label>
            <label class:chosen={role === "admin"}><input type="radio" name="invitation-role" value="admin" bind:group={role} /><span><strong>{t("ผู้ดูแลระบบ", "Admin")}</strong><small>{t("จัดการระบบ พื้นที่ทำงาน และสมาชิก", "Manages systems, workspaces and members")}</small></span></label>
          </div>
        {/if}
        {#if departments.length}
          <p class="invitation-label">{t("แผนก", "Departments")} <span class="k-muted">{t("(ไม่บังคับ)", "(optional)")}</span></p>
          <div class="invitation-departments">
            {#each departments as unit (unit.id)}
              <label class:chosen={unitIDs.includes(unit.id)}><input type="checkbox" checked={unitIDs.includes(unit.id)} onchange={() => toggleUnit(unit.id)} />{unit.name}</label>
            {/each}
          </div>
          <p class="invitation-note">{t("เมื่อรับคำเชิญ จะได้สิทธิ์ในพื้นที่ทำงาน AI ที่แผนกเหล่านี้ใช้อยู่", "On accepting, they get the AI workspaces these departments can use.")}</p>
        {/if}
      </fieldset>
      {#if formError}<p class="dialog-error" role="alert">{formError}</p>{/if}
      <div class="dialog-actions">
        <button type="button" class="k-button" disabled={busy} onclick={() => dialog?.close()}>{t("ยกเลิก", "Cancel")}</button>
        <button type="submit" class="k-button primary" disabled={busy}>{busy ? t("กำลังสร้าง…", "Creating…") : t("สร้างลิงก์เชิญ", "Create invitation link")}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  .team-invitations { margin-top: 20px; overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .team-invitations > :global(.k-banner) { margin: 0 18px 12px; }
  .inv-head { padding: 16px 18px 14px; }
  .inv-head :global(.k-section-title) { justify-content: flex-start; gap: 8px; margin: 0; }
  .inv-head p { margin: 2px 0 0; }
  .inv-table-wrap { overflow-x: auto; border-top: 1px solid var(--orca-line); }
  .inv-table th { white-space: nowrap; }
  .inv-table td { vertical-align: middle; }
  .inv-person { min-width: 200px; }
  .inv-person strong { display: block; font-weight: 600; overflow-wrap: anywhere; }
  .inv-person p, .inv-table td p { margin: 1px 0 0; overflow-wrap: anywhere; }
  .inv-role { display: block; font-weight: 500; white-space: nowrap; }
  .inv-none { color: var(--orca-muted); font-size: 13px; }
  .inv-actions-col { width: 1%; white-space: nowrap; }
  .invitation-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .invitation-actions :global(.k-button) { white-space: nowrap; }
  .invitation-status { display: inline-flex; padding: 2px 8px; border-radius: var(--orca-radius-sm); font-size: 12.5px; font-weight: 500; white-space: nowrap; }
  .invitation-status.tone-waiting { background: var(--orca-warn-bg); color: var(--orca-warn); }
  .invitation-status.tone-ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .invitation-status.tone-bad { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .invitation-status.tone-muted { background: var(--orca-secondary); color: var(--orca-nav); }
  .invitation-history { padding: 12px 18px 14px; border-top: 1px solid var(--orca-line); font-size: 13.5px; }
  .invitation-history summary { color: var(--orca-muted); cursor: pointer; }
  .invitation-history ul { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
  .invitation-history li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; overflow-wrap: anywhere; }
  .invitation-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-ink); box-shadow: 0 16px 48px -12px rgba(21, 24, 35, 0.28); }
  .invitation-dialog::backdrop { background: rgba(21, 24, 35, 0.45); }
  .invitation-dialog h2 { margin: 16px 0 4px; font-size: 18px; font-weight: 600; line-height: 1.4; }
  .invitation-dialog p { margin: 8px 0; color: var(--orca-muted); font-size: 14px; line-height: 1.7; }
  .invitation-dialog fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .dialog-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--orca-radius); background: var(--orca-secondary); color: var(--orca-nav); }
  .dialog-icon.ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .invitation-dialog .invitation-label { display: block; margin: 16px 0 6px; color: var(--orca-ink); font-size: 13.5px; font-weight: 600; }
  .invitation-input, .invitation-link { width: 100%; min-height: 38px; padding: 8px 11px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .invitation-link { background: var(--orca-surface-2); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; }
  .invitation-roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .invitation-roles label { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); cursor: pointer; }
  .invitation-roles label.chosen, .invitation-departments label.chosen { border-color: var(--orca-ink); box-shadow: inset 0 0 0 1px var(--orca-ink); }
  .invitation-roles input { margin-top: 3px; accent-color: var(--orca-ink); }
  .invitation-roles span { display: grid; gap: 2px; min-width: 0; }
  .invitation-roles strong { font-size: 14px; }
  .invitation-roles small { color: var(--orca-muted); font-size: 12.5px; line-height: 1.5; }
  .invitation-departments { display: flex; flex-wrap: wrap; gap: 6px; }
  .invitation-departments label { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--orca-line-strong); border-radius: 999px; font-size: 13.5px; cursor: pointer; }
  .invitation-departments input { accent-color: var(--orca-ink); }
  .invitation-dialog .invitation-note { margin-top: 10px; font-size: 13px; }
  .invitation-share { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .line-share { text-decoration: none; }
  .dialog-error { padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny) !important; font-size: 13px !important; }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  @media (max-width: 600px) {
    .invitation-roles { grid-template-columns: minmax(0, 1fr); }
    .invitation-share > :global(*) { flex: 1 1 auto; justify-content: center; }
  }
</style>
