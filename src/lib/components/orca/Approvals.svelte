<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Check, Inbox, LoaderCircle, RefreshCw } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { approvalTone, argumentEntries } from "$lib/orca/approvals";
  import { orcaLocale, t } from "$lib/orca/locale.svelte";
  import { toolPresentation } from "$lib/orca/tool-presentation";
  import { OrcaService, displayDate, memberName, orcaError, type OrcaApproval, type OrcaBootstrap } from "$lib/services/orca";

  let { data, onchanged }: { data: OrcaBootstrap; onchanged?: () => void } = $props();
  let tab = $state<"pending" | "decided">("pending");
  let items = $state<OrcaApproval[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let error = $state("");
  let notice = $state("");
  let busyID = $state("");
  let confirming = $state("");
  let rejecting = $state("");
  let note = $state("");
  let alive = true;
  let request = 0;

  const person = (id?: string) => {
    const member = data.members.find((item) => item.id === id);
    return member ? memberName(member) : t("ผู้ที่ไม่ได้เป็นสมาชิกแล้ว", "Former member");
  };
  const workspace = (id: string) => data.hubs.find((hub) => hub.id === id)?.name ?? t("พื้นที่ทำงานที่ถูกลบ", "Deleted workspace");
  const system = (id: string) => data.connections.find((connection) => connection.id === id);
  function toolLabel(item: OrcaApproval) {
    const tool = system(item.connectionID)?.tools.find((entry) => entry.name === item.toolName) ?? { name: item.toolName };
    return toolPresentation(tool, orcaLocale.value === "en" ? "en" : "th").label;
  }
  const statusLabel = (status: OrcaApproval["status"]) =>
    ({
      pending: t("รออนุมัติ", "Waiting"),
      running: t("กำลังทำงาน", "Running"),
      succeeded: t("ทำสำเร็จ", "Done"),
      failed: t("ทำไม่สำเร็จ", "Failed"),
      rejected: t("ปฏิเสธแล้ว", "Rejected"),
      expired: t("หมดเวลา", "Expired"),
    })[status];
  function decisionLine(item: OrcaApproval) {
    if (item.status === "expired") return t("ไม่มีผู้ดูแลตัดสินก่อนหมดเวลา ORCA จึงไม่ได้ทำงานนี้", "No manager decided before it expired, so ORCA did not run it.");
    if (!item.decidedBy) return "";
    const by = person(item.decidedBy);
    const when = displayDate(item.decidedAt);
    return item.status === "rejected" ? t(`ปฏิเสธโดย ${by} · ${when}`, `Rejected by ${by} · ${when}`) : t(`อนุมัติโดย ${by} · ${when}`, `Approved by ${by} · ${when}`);
  }
  const failureLabel = (category?: string) =>
    category === "permission_denied" ? t("ผู้ขอไม่มีสิทธิ์ใช้เครื่องมือนี้แล้ว", "The requester no longer has access to this tool")
      : category === "invalid_arguments" ? t("ข้อมูลไม่ครบหรือไม่ถูกต้อง", "The details were incomplete or invalid")
      : category === "timeout" ? t("ระบบปลายทางตอบช้าเกินไป", "The system took too long to answer")
      : category === "upstream_error" ? t("ระบบปลายทางขัดข้อง", "The system returned an error")
      : category === "tool_changed" ? t("เครื่องมือเปลี่ยนที่ผู้ให้บริการ ต้องตรวจสอบใหม่", "The tool changed at the vendor and needs review")
      : category === "quota_exceeded" ? t("ใช้งานครบโควตาของวันนี้แล้ว", "Today's quota is used up")
      : t("ระบบปลายทางแจ้งข้อผิดพลาด", "The system reported an error");

  async function load() {
    const current = ++request;
    loading = true;
    error = "";
    try {
      const next = await OrcaService.approvals(tab, !data.canManage);
      if (!alive || current !== request) return;
      items = next;
      loaded = true;
    } catch (cause) {
      if (alive && current === request) error = orcaError(cause);
    } finally {
      if (alive && current === request) loading = false;
    }
  }
  onMount(() => void load());
  onDestroy(() => { alive = false; });

  function switchTab(next: "pending" | "decided") {
    if (tab === next) return;
    tab = next;
    confirming = rejecting = notice = "";
    void load();
  }

  async function approve(item: OrcaApproval) {
    if (busyID) return;
    busyID = item.id;
    error = notice = "";
    try {
      const done = await OrcaService.approveRequest(item.id);
      confirming = "";
      notice = done.status === "succeeded"
        ? t(`อนุมัติแล้ว ORCA ทำ “${toolLabel(item)}” สำเร็จ`, `Approved. ORCA ran “${toolLabel(item)}”.`)
        : t(`อนุมัติแล้ว แต่ทำไม่สำเร็จ: ${failureLabel(done.errorCategory)}`, `Approved, but it did not complete: ${failureLabel(done.errorCategory)}`);
      await load();
    } catch (cause) {
      // Reload first, since loading clears the page's error.
      const message = orcaError(cause);
      await load();
      error = message;
    } finally {
      busyID = "";
      onchanged?.();
    }
  }

  async function reject(item: OrcaApproval) {
    if (busyID) return;
    busyID = item.id;
    error = notice = "";
    try {
      await OrcaService.rejectRequest(item.id, note.trim());
      rejecting = "";
      note = "";
      notice = t(`ปฏิเสธคำขอ “${toolLabel(item)}” แล้ว`, `Rejected “${toolLabel(item)}”.`);
      await load();
    } catch (cause) {
      // Reload first, since loading clears the page's error.
      const message = orcaError(cause);
      await load();
      error = message;
    } finally {
      busyID = "";
      onchanged?.();
    }
  }
</script>

<section class="approvals" aria-labelledby="approvals-title">
  <header class="approvals-heading">
    <div>
      <h1 id="approvals-title">{data.canManage ? t("กล่องอนุมัติ", "Approvals") : t("คำขออนุมัติของฉัน", "My approval requests")}</h1>
      <p class="k-subtitle">{t("งานที่ AI ขอเขียนข้อมูลลงระบบ เช่น สร้างใบเสนอราคา จะรออยู่ที่นี่จนกว่าผู้ดูแลจะอนุมัติ แล้ว ORCA จึงทำงานด้วยบัญชีของผู้ขอ", "Actions an AI app asks to write, such as creating a quotation, wait here until a manager approves them. ORCA then runs them with the requester's account.")}</p>
    </div>
    <button class="k-button approvals-square" disabled={loading} onclick={() => { void load(); onchanged?.(); }} aria-label={t("โหลดข้อมูลใหม่", "Refresh")} title={t("โหลดข้อมูลใหม่", "Refresh")}><RefreshCw size={16} class={loading ? "k-spin" : ""} /></button>
  </header>

  <div class="approvals-tabs" role="group" aria-label={t("สถานะคำขอ", "Request status")}>
    <button type="button" class:chosen={tab === "pending"} aria-pressed={tab === "pending"} onclick={() => switchTab("pending")}>{t("รออนุมัติ", "Waiting")}{#if tab === "pending" && loaded}<span>{items.length}</span>{/if}</button>
    <button type="button" class:chosen={tab === "decided"} aria-pressed={tab === "decided"} onclick={() => switchTab("decided")}>{t("ตัดสินแล้ว", "Decided")}</button>
  </div>

  {#if error}<div class="k-banner error" role="alert">{error}</div>{/if}
  {#if notice}<p class="approvals-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>{/if}

  {#if loading && !loaded}
    <div class="approvals-empty" role="status"><LoaderCircle size={24} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</div>
  {:else if loaded && !items.length}
    <div class="approvals-empty"><Inbox size={28} aria-hidden="true" /><h2>{tab === "pending" ? t("ไม่มีคำขอที่รออนุมัติ", "Nothing is waiting for approval") : t("ยังไม่มีคำขอที่ตัดสินแล้ว", "No decided requests yet")}</h2>
      <p>{t("เปิดโหมด “ต้องอนุมัติก่อน” ได้ที่หน้าพื้นที่ทำงาน AI เพื่อให้งานที่แก้ไขข้อมูลต้องผ่านการอนุมัติ", "Turn on “Approve first” on an AI workspace so actions that change data wait here.")}</p></div>
  {:else}
    <div class="approval-list">
      {#each items as item (item.id)}
        {@const connection = system(item.connectionID)}
        {@const entries = argumentEntries(item.arguments)}
        <article class="approval-card" aria-labelledby={`approval-${item.id}`}>
          <header>
            <span class="approval-icon"><CatalogIcon name={connection?.name ?? ""} size={22} /></span>
            <div class="approval-title">
              <h2 id={`approval-${item.id}`}>{toolLabel(item)}</h2>
              <span>{connection?.name ?? t("ระบบที่ถูกลบ", "Deleted system")} · {workspace(item.hubID)}</span>
            </div>
            <span class="approval-status tone-{approvalTone(item.status)}">{statusLabel(item.status)}</span>
          </header>
          <p class="approval-meta"><span>{t(`ขอโดย ${person(item.userID)} · ${displayDate(item.createdAt)}`, `Requested by ${person(item.userID)} · ${displayDate(item.createdAt)}`)}</span>{#if item.status === "pending"}{" · "}<span>{t(`หมดเวลา ${displayDate(item.expiresAt)}`, `Expires ${displayDate(item.expiresAt)}`)}</span>{/if}</p>
          {#if entries.length}
            <dl class="approval-args">
              {#each entries as [key, value], index (index)}<dt>{key || t("ข้อมูล", "Details")}</dt><dd>{value}</dd>{/each}
            </dl>
          {/if}
          {#if item.status !== "pending"}
            {@const decision = decisionLine(item)}
            <div class="approval-decision">
              {#if decision}<p>{decision}</p>{/if}
              {#if item.status === "failed"}<p class="approval-failure">{failureLabel(item.errorCategory)}</p>{/if}
              {#if item.note}<p>{t("เหตุผล", "Reason")}: {item.note}</p>{/if}
            </div>
            {#if item.result}<details class="approval-result"><summary>{t("ผลลัพธ์จากระบบ", "Result from the system")}</summary><pre>{item.result}</pre></details>{/if}
          {/if}
          {#if data.canManage && item.status === "pending"}
            {#if confirming === item.id}
              <div class="approval-confirm" role="group" aria-label={t("ยืนยันการอนุมัติ", "Confirm approval")}>
                <p>{t(`ORCA จะทำงานนี้ทันทีด้วยบัญชีของ ${person(item.userID)} และแก้ไขข้อมูลในระบบจริง`, `ORCA will run this now with ${person(item.userID)}'s account and change data in the real system.`)}</p>
                <div class="approval-actions">
                  <button class="k-button" disabled={busyID === item.id} onclick={() => (confirming = "")}>{t("ยกเลิก", "Cancel")}</button>
                  <button class="k-button primary" disabled={busyID === item.id} onclick={() => approve(item)}>{#if busyID === item.id}<LoaderCircle size={16} class="k-spin" />{/if}{t("ยืนยันและทำงาน", "Confirm and run")}</button>
                </div>
              </div>
            {:else if rejecting === item.id}
              <form class="approval-confirm" onsubmit={(event) => { event.preventDefault(); void reject(item); }}>
                <label for={`reject-${item.id}`}>{t("เหตุผล (ไม่บังคับ)", "Reason (optional)")}</label>
                <input id={`reject-${item.id}`} bind:value={note} maxlength="500" autocomplete="off" />
                <div class="approval-actions">
                  <button type="button" class="k-button" disabled={busyID === item.id} onclick={() => { rejecting = ""; note = ""; }}>{t("ยกเลิก", "Cancel")}</button>
                  <button type="submit" class="k-button danger" disabled={busyID === item.id}>{#if busyID === item.id}<LoaderCircle size={16} class="k-spin" />{/if}{t("ปฏิเสธคำขอ", "Reject request")}</button>
                </div>
              </form>
            {:else}
              <div class="approval-actions">
                <button class="k-button" disabled={!!busyID} onclick={() => { rejecting = item.id; confirming = ""; note = ""; }}>{t("ปฏิเสธ", "Reject")}</button>
                <button class="k-button primary" disabled={!!busyID} onclick={() => { confirming = item.id; rejecting = ""; }}>{t("อนุมัติ", "Approve")}</button>
              </div>
            {/if}
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .approvals { display: grid; gap: 18px; min-width: 0; }
  .approvals-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 24px; }
  .approvals-heading h1 { margin: 0; }
  .approvals-heading .k-subtitle { max-width: 720px; }
  .approvals-square { width: 36px; padding: 0; flex: none; justify-content: center; }
  .approvals-tabs { display: inline-flex; gap: 2px; justify-self: start; padding: 3px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius); background: var(--orca-surface); }
  .approvals-tabs button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 12px; border: 0; border-radius: var(--orca-radius-sm); background: transparent; color: var(--orca-muted); font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; }
  .approvals-tabs button.chosen { background: var(--orca-secondary); color: var(--orca-ink); }
  .approvals-tabs button span { padding: 0 6px; border-radius: 999px; background: var(--orca-surface); font-size: 12px; font-variant-numeric: tabular-nums; }
  .approval-list { display: grid; gap: 12px; }
  .approval-card { display: grid; gap: 10px; min-width: 0; padding: 16px 18px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .approval-card > header { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .approval-icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius); background: var(--orca-surface); }
  .approval-title { flex: 1 1 auto; min-width: 0; }
  .approval-title h2 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
  .approval-title span { color: var(--orca-muted); font-size: 13px; }
  .approval-status { flex: none; padding: 2px 9px; border-radius: var(--orca-radius-sm); font-size: 12.5px; font-weight: 500; white-space: nowrap; }
  .approval-status.tone-waiting { background: var(--orca-warn-bg); color: var(--orca-warn); }
  .approval-status.tone-ok { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .approval-status.tone-bad { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .approval-status.tone-muted { background: var(--orca-secondary); color: var(--orca-nav); }
  .approval-meta, .approval-decision { margin: 0; color: var(--orca-muted); font-size: 13px; line-height: 1.6; }
  .approval-meta span { display: inline-block; }
  .approval-decision { display: grid; gap: 2px; }
  .approval-decision p { margin: 0; overflow-wrap: anywhere; }
  .approval-decision .approval-failure { color: var(--orca-deny); font-weight: 500; }
  .approval-args { display: grid; grid-template-columns: minmax(90px, max-content) minmax(0, 1fr); gap: 6px 16px; margin: 0; padding: 12px 14px; border-radius: var(--orca-radius); background: var(--orca-surface-2); font-size: 13.5px; }
  .approval-args dt { color: var(--orca-muted); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; }
  .approval-args dd { max-height: 240px; margin: 0; overflow: auto; overflow-wrap: anywhere; white-space: pre-line; }
  .approval-result summary { color: var(--orca-ink); font-size: 13px; font-weight: 500; cursor: pointer; }
  .approval-result pre { max-height: 240px; margin: 8px 0 0; padding: 10px 12px; overflow: auto; border-radius: var(--orca-radius); background: var(--orca-surface-2); font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .approval-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .approval-confirm { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface-2); }
  .approval-confirm p { margin: 0; font-size: 13.5px; }
  .approval-confirm label { font-size: 13.5px; font-weight: 600; }
  .approval-confirm input { min-height: 36px; padding: 7px 11px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); font: inherit; font-size: 14px; }
  .approvals-notice { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--orca-ok) 22%, transparent); border-radius: var(--orca-radius); background: var(--orca-ok-bg); color: var(--orca-ok); font-size: 13.5px; }
  .approvals-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 44px 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-subtle); text-align: center; font-size: 13.5px; }
  .approvals-empty h2 { margin: 4px 0 0; color: var(--orca-ink); font-size: 15px; font-weight: 600; }
  .approvals-empty p { max-width: 460px; margin: 0; }
  @media (max-width: 600px) {
    .approval-card > header { flex-wrap: wrap; }
    .approval-args { grid-template-columns: minmax(0, 1fr); gap: 2px; }
    .approval-args dd { margin-bottom: 6px; }
    .approval-actions > :global(.k-button) { flex: 1 1 auto; }
  }
</style>
