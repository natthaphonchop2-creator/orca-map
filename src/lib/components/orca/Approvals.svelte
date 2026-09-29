<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { Check, CircleCheck, Inbox, LoaderCircle, RefreshCw, X } from "@lucide/svelte";
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { approvalTone, argumentEntries } from "$lib/orca/approvals";
  import { term } from "$lib/orca/glossary";
  import { orcaLocale, t } from "$lib/orca/locale.svelte";
  import { toolPresentation } from "$lib/orca/tool-presentation";
  import { OrcaService, displayDate, memberName, orcaError, type OrcaApproval, type OrcaBootstrap } from "$lib/services/orca";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import StatusPill from "./ui/StatusPill.svelte";
  import { showToast } from "./ui/toast-store.svelte";

  // ตรวจสอบ › รออนุมัติ: changes an AI app asked to make wait here until an
  // Owner or Admin decides. Employees see their own requests (คำขอของฉัน).
  // Approving and rejecting each ask first in a modal.
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
  // The status switch: where focus goes when the request it was on has moved.
  let bar: HTMLElement | undefined = $state();
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
  const pillTone = (status: OrcaApproval["status"]) =>
    ({ waiting: "warn", ok: "ok", bad: "deny", muted: "neutral" } as const)[approvalTone(status)];
  function decisionLine(item: OrcaApproval) {
    if (item.status === "expired") return t("ไม่มีผู้ดูแลตัดสินก่อนหมดเวลา ORCA จึงไม่ได้ทำงานนี้", "No manager decided before it expired, so ORCA did not run it.");
    if (!item.decidedBy) return "";
    const by = person(item.decidedBy);
    const when = displayDate(item.decidedAt);
    return item.status === "rejected" ? t(`ปฏิเสธโดย ${by} · ${when}`, `Rejected by ${by} · ${when}`) : t(`อนุมัติโดย ${by} · ${when}`, `Approved by ${by} · ${when}`);
  }
  const failureLabel = (category?: string) =>
    category === "permission_denied" ? t("คนที่ขอไม่มีสิทธิ์ทำสิ่งนี้แล้ว", "The requester is no longer allowed to do this")
      : category === "invalid_arguments" ? t("ข้อมูลไม่ครบหรือไม่ถูกต้อง", "The details were incomplete or invalid")
      : category === "timeout" ? t("โปรแกรมตอบช้าเกินไป", "The program took too long to answer")
      : category === "upstream_error" ? t("โปรแกรมขัดข้อง", "The program returned an error")
      : category === "tool_changed" ? t("ผู้ให้บริการเปลี่ยนสิ่งนี้ ต้องตรวจใหม่ก่อน", "The provider changed this; review it again first")
      : category === "quota_exceeded" ? t("ใช้ครบจำนวนของวันนี้แล้ว", "Today's limit is used up")
      : t("โปรแกรมแจ้งข้อผิดพลาด", "The program reported an error");

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

  /**
   * A decided request leaves the waiting list, and with it the button focus
   * went back to when the dialog closed: keep keyboard users on the status
   * switch above the list instead of the top of the page.
   */
  async function keepFocus() {
    await tick();
    if (!alive || typeof document === "undefined") return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    bar?.querySelector<HTMLElement>("button.chosen")?.focus();
  }

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
      showToast(notice, { tone: done.status === "succeeded" ? "ok" : "error" });
      await load();
    } catch (cause) {
      // Reload first, since loading clears the page's error.
      const message = orcaError(cause);
      confirming = "";
      await load();
      error = message;
    } finally {
      busyID = "";
      onchanged?.();
    }
    await keepFocus();
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
      showToast(notice);
      await load();
    } catch (cause) {
      // Reload first, since loading clears the page's error.
      const message = orcaError(cause);
      rejecting = "";
      await load();
      error = message;
    } finally {
      busyID = "";
      onchanged?.();
    }
    await keepFocus();
  }

  const approving = $derived(items.find((item) => item.id === confirming));
  const declining = $derived(items.find((item) => item.id === rejecting));
</script>

<PageHeader
  title={data.canManage ? term("waitingApproval", t) : term("myRequests", t)}
  subtitle={data.canManage
    ? t("งานที่ AI ขอสร้างหรือแก้ข้อมูลจะรอที่นี่ เมื่ออนุมัติ ORCA จะทำให้ด้วยบัญชีของคนที่ขอ", "Changes an AI app asks to make wait here. Once approved, ORCA runs them with the requester's account.")
    : t("งานที่ AI ของคุณขอสร้างหรือแก้ข้อมูล จะรอผู้ดูแลอนุมัติก่อน", "Changes your AI app asks to make wait for an admin's approval.")}
/>

<div class="approvals-bar" bind:this={bar}>
  <div class="approvals-tabs" role="group" aria-label={t("สถานะคำขอ", "Request status")}>
    <button type="button" class:chosen={tab === "pending"} aria-pressed={tab === "pending"} onclick={() => switchTab("pending")}>{t("รออนุมัติ", "Waiting")}{#if tab === "pending" && loaded}<span>{items.length}</span>{/if}</button>
    <button type="button" class:chosen={tab === "decided"} aria-pressed={tab === "decided"} onclick={() => switchTab("decided")}>{t("ตัดสินแล้ว", "Decided")}</button>
  </div>
  <button type="button" class="k-button approvals-refresh" disabled={loading} onclick={() => { void load(); onchanged?.(); }} aria-label={t("โหลดใหม่", "Reload")} title={t("โหลดใหม่", "Reload")}><RefreshCw size={16} class={loading ? "k-spin" : ""} aria-hidden="true" /></button>
</div>

{#if error}<div class="k-banner error approvals-error" role="alert">{error}</div>{/if}

{#if loading && !loaded}
  <div class="approvals-loading" role="status"><LoaderCircle size={22} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</div>
{:else if loaded && !items.length}
  <EmptyState
    icon={tab === "pending" ? Inbox : CircleCheck}
    message={tab === "pending"
      ? data.canManage ? t("ไม่มีงานรออนุมัติตอนนี้", "Nothing is waiting for approval.") : t("คุณไม่มีคำขอที่รออนุมัติ", "You have no requests waiting.")
      : t("ยังไม่มีคำขอที่ตัดสินแล้ว", "No decided requests yet.")}
  />
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
            <span>{connection?.name ?? t("โปรแกรมที่ถูกลบ", "Deleted program")} · {workspace(item.hubID)}</span>
          </div>
          <StatusPill label={statusLabel(item.status)} tone={pillTone(item.status)} />
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
          {#if item.result}<details class="approval-result"><summary>{t("ผลลัพธ์จากโปรแกรม", "Result from the program")}</summary><pre>{item.result}</pre></details>{/if}
        {/if}
        {#if data.canManage && item.status === "pending"}
          <div class="approval-actions">
            <button type="button" class="k-button quiet" disabled={!!busyID} onclick={() => { rejecting = item.id; confirming = ""; note = ""; }}><X size={16} aria-hidden="true" />{t("ปฏิเสธ", "Reject")}</button>
            <button type="button" class="k-button approval-approve" disabled={!!busyID} onclick={() => { confirming = item.id; rejecting = ""; }}><Check size={16} aria-hidden="true" />{t("อนุมัติ", "Approve")}</button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
{/if}

<ConfirmDialog
  open={!!approving}
  icon={CircleCheck}
  title={approving ? t(`อนุมัติ “${toolLabel(approving)}”?`, `Approve “${toolLabel(approving)}”?`) : ""}
  message={approving
    ? t(`ORCA จะทำงานนี้ทันทีด้วยบัญชีของ ${person(approving.userID)} และแก้ข้อมูลใน ${system(approving.connectionID)?.name ?? "โปรแกรม"} จริง`, `ORCA runs this now with ${person(approving.userID)}'s account and changes real data in ${system(approving.connectionID)?.name ?? "the program"}.`)
    : ""}
  confirmLabel={busyID && busyID === approving?.id ? t("กำลังทำงาน…", "Running…") : t("อนุมัติและทำงาน", "Approve and run")}
  busy={!!busyID}
  onconfirm={() => { if (approving) void approve(approving); }}
  oncancel={() => (confirming = "")}
/>

<ConfirmDialog
  open={!!declining}
  tone="danger"
  icon={X}
  title={declining ? t(`ปฏิเสธ “${toolLabel(declining)}”?`, `Reject “${toolLabel(declining)}”?`) : ""}
  message={declining ? t(`ORCA จะไม่ทำงานนี้ และ ${person(declining.userID)} จะเห็นเหตุผลที่คุณเขียน`, `ORCA will not run it, and ${person(declining.userID)} sees the reason you give.`) : ""}
  confirmLabel={t("ปฏิเสธคำขอ", "Reject request")}
  busy={!!busyID}
  onconfirm={() => { if (declining) void reject(declining); }}
  oncancel={() => { rejecting = ""; note = ""; }}
>
  {#if declining}
    <label class="approval-reason" for={`reject-${declining.id}`}>{t("เหตุผล (ไม่บังคับ)", "Reason (optional)")}</label>
    <input
      id={`reject-${declining.id}`}
      class="approval-reason-input"
      bind:value={note}
      maxlength="500"
      autocomplete="off"
      placeholder={t("เช่น มีใบเสนอราคานี้อยู่แล้ว", "e.g. This quotation already exists")}
      onkeydown={(event) => { if (event.key === "Enter" && declining) { event.preventDefault(); void reject(declining); } }}
    />
  {/if}
</ConfirmDialog>

<style>
  .approvals-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .approvals-tabs { display: inline-flex; gap: 8px; }
  .approvals-tabs button { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border: 1px solid var(--orca-line-strong); border-radius: 999px; background: var(--orca-surface); color: var(--orca-text-2); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
  .approvals-tabs button:hover { background: var(--orca-hover); color: var(--orca-ink); }
  .approvals-tabs button.chosen { border-color: var(--orca-ink); background: var(--orca-ink); color: var(--orca-on-ink); font-weight: 600; }
  .approvals-tabs button span { display: inline-grid; place-items: center; min-width: 22px; height: 20px; padding: 0 7px; border-radius: 999px; background: var(--orca-secondary); color: var(--orca-text-2); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .approvals-tabs button.chosen span { background: color-mix(in srgb, var(--orca-on-ink) 18%, transparent); color: var(--orca-on-ink); }
  /* On the light chosen chip of the dark theme a tinted fill turns grey: ring the count instead. */
  :global(:root[data-orca-theme='dark']) .approvals-tabs button.chosen span { background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--orca-on-ink) 30%, transparent); }
  .approvals-bar .approvals-refresh { width: 38px; min-height: 38px; padding: 0; flex: none; justify-content: center; color: var(--orca-text-2) !important; }
  .approvals-error { margin-bottom: 16px; }
  .approvals-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px 20px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-muted); font-size: 14px; }
  .approval-list { display: grid; gap: 12px; }
  .approval-card { display: grid; gap: 12px; min-width: 0; padding: 18px 20px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .approval-card > header { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .approval-icon { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid var(--orca-line); border-radius: 10px; background: var(--orca-surface); }
  .approval-title { flex: 1 1 auto; min-width: 0; }
  .approval-title h2 { margin: 0; color: var(--orca-ink); font-size: 15.5px; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
  .approval-title span { color: var(--orca-muted); font-size: 13.5px; }
  .approval-meta, .approval-decision { margin: 0; color: var(--orca-muted); font-size: 13.5px; line-height: 1.6; }
  .approval-meta span { display: inline-block; }
  .approval-decision { display: grid; gap: 2px; }
  .approval-decision p { margin: 0; overflow-wrap: anywhere; }
  .approval-decision .approval-failure { color: var(--orca-deny); font-weight: 500; }
  .approval-args { display: grid; grid-template-columns: minmax(90px, max-content) minmax(0, 1fr); gap: 6px 16px; margin: 0; padding: 12px 14px; border: 1px solid var(--orca-line-soft); border-radius: var(--orca-radius); background: var(--orca-surface-2); color: var(--orca-ink); font-size: 14px; }
  .approval-args dt { color: var(--orca-muted); font-size: 13px; }
  .approval-args dd { max-height: 240px; margin: 0; overflow: auto; overflow-wrap: anywhere; white-space: pre-line; }
  .approval-result summary { color: var(--orca-ink); font-size: 13.5px; font-weight: 500; cursor: pointer; }
  .approval-result pre { max-height: 240px; margin: 8px 0 0; padding: 10px 12px; overflow: auto; border-radius: var(--orca-radius); background: var(--orca-surface-2); color: var(--orca-ink); font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .approval-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 4px; }
  .approval-card .approval-approve { border-color: var(--orca-line-strong); font-weight: 600; }
  .approval-approve :global(svg) { color: var(--orca-ok); }
  .approval-reason { display: block; margin-top: 16px; color: var(--orca-ink); font-size: 13.5px; font-weight: 600; }
  .approval-reason-input { width: 100%; min-height: 40px; margin-top: 6px; padding: 8px 12px; border: 1px solid var(--orca-field-line); border-radius: var(--orca-radius); background: var(--orca-field); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .approval-reason-input:focus-visible { border-color: var(--orca-focus); outline: none; box-shadow: 0 0 0 3px var(--orca-focus-halo); }
  @media (max-width: 720px) {
    .approval-card { padding: 16px; }
    /* The icon and the title stay on one line; the status pill goes under the title. */
    .approval-card > header { flex-wrap: wrap; row-gap: 8px; }
    .approval-title { flex: 1 1 calc(100% - 52px); }
    .approval-card > header > :global(.orca-pill) { margin-left: 52px; }
    .approval-args { grid-template-columns: minmax(0, 1fr); gap: 2px; }
    .approval-args dd { margin-bottom: 6px; }
    .approval-actions > :global(.k-button) { flex: 1 1 0; justify-content: center; min-height: 40px; }
  }
</style>
