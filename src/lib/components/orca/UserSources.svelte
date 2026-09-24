<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Check, Copy, KeyRound, LoaderCircle, Plus, Power, PowerOff, RefreshCw, ShieldCheck, Trash2, X } from "@lucide/svelte";
  import { t } from "$lib/orca/locale.svelte";
  import { memberName, orcaError, type OrcaBootstrap } from "$lib/services/orca";
  import {
    OrcaUserSourcesService,
    type OrcaUserSource,
    type OrcaUserSourceInput,
    type OrcaUserSourceBinding,
  } from "$lib/services/orca-user-sources";

  let { data }: { data: OrcaBootstrap } = $props();
  let items = $state<OrcaUserSource[]>([]);
  let callbackURL = $state("");
  let loading = $state(false);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let editing = $state<OrcaUserSource | null | undefined>();
  let deleting = $state<OrcaUserSource>();
  let name = $state("");
  let issuerURL = $state("");
  let clientID = $state("");
  let clientSecret = $state("");
  let enabled = $state(false);
  let bindings = $state<OrcaUserSourceBinding[]>([]);
  let verifiedIssuer = $state("");
  let copied = $state(false);
  let alive = true;
  let requestNumber = 0;
  let controller: AbortController | undefined;
  const activeMembers = $derived(data.members.filter((member) => !member.status || member.status === "active"));

  async function refresh() {
    controller?.abort();
    const request = ++requestNumber;
    error = "";
    if (!data.canManage) { loading = false; return; }
    const next = new AbortController();
    controller = next;
    loading = true;
    try {
      const result = await OrcaUserSourcesService.list(next.signal);
      if (alive && data.canManage && request === requestNumber && !next.signal.aborted) {
        items = result.items;
        callbackURL = result.callbackURL;
      }
    } catch (cause) {
      if (alive && data.canManage && request === requestNumber && !next.signal.aborted) error = orcaError(cause);
    } finally {
      if (alive && request === requestNumber) loading = false;
    }
  }
  $effect(() => {
    if (!data.canManage) {
      clientSecret = "";
      editing = undefined;
      deleting = undefined;
      items = [];
      callbackURL = "";
      controller?.abort();
    }
  });
  onMount(() => { void refresh(); });
  onDestroy(() => { alive = false; requestNumber++; controller?.abort(); clientSecret = ""; });

  function open(source?: OrcaUserSource) {
    if (!data.canManage || busy || loading) return;
    editing = source ?? null;
    deleting = undefined;
    name = source?.name ?? "";
    issuerURL = source?.issuerURL ?? "";
    clientID = source?.clientID ?? "";
    clientSecret = "";
    enabled = source?.enabled ?? false;
    bindings = (source?.bindings ?? []).map((binding) => ({ ...binding }));
    verifiedIssuer = "";
    error = "";
    notice = "";
    copied = false;
  }
  function close() {
    if (busy) return;
    clientSecret = "";
    editing = undefined;
    deleting = undefined;
    error = "";
  }
  function validate() {
    if (!name.trim() || !issuerURL.trim() || !clientID.trim()) return t("กรุณากรอกชื่อ Issuer URL และ Client ID", "Enter a name, issuer URL and client ID.");
    if (enabled && !editing?.secretConfigured && !clientSecret) return t("กรุณากรอก Client secret", "Enter a client secret.");
    if (editing?.secretConfigured && clientID.trim() !== editing.clientID && !clientSecret) return t("กรุณากรอก Client secret ใหม่เมื่อเปลี่ยน Client ID", "Enter a new client secret when changing the client ID.");
    if (enabled && !bindings.length) return t("กรุณาจับคู่บัญชีสมาชิกอย่างน้อย 1 บัญชีก่อนเปิดใช้งาน", "Map at least one member account before activating this sign-in source.");
    const subjects = new Set<string>();
    const members = new Set<string>();
    for (const binding of bindings) {
      if (!binding.memberID || !binding.subject.trim()) return t("กรุณาเลือกสมาชิกและกรอก Subject ให้ครบทุกรายการ", "Select a member and enter a subject for each mapping.");
      if (subjects.has(binding.subject.trim()) || members.has(binding.memberID)) return t("สมาชิกและ Subject ต้องไม่ซ้ำกัน", "Members and subjects must be unique.");
      subjects.add(binding.subject.trim()); members.add(binding.memberID);
    }
    return "";
  }
  function input(): OrcaUserSourceInput {
    return {
      name: name.trim(), issuerURL: issuerURL.trim(), clientID: clientID.trim(), enabled,
      bindings: bindings.map((binding) => ({ memberID: binding.memberID, subject: binding.subject.trim() })),
      ...(editing ? { version: editing.version } : {}),
      ...(clientSecret ? { clientSecret } : {}),
    };
  }
  async function check() {
    if (!data.canManage || busy || !issuerURL.trim()) return;
    const requestedIssuer = issuerURL.trim();
    busy = true; error = ""; notice = ""; verifiedIssuer = "";
    try {
      await OrcaUserSourcesService.discover(requestedIssuer);
      if (alive && data.canManage && issuerURL.trim() === requestedIssuer) {
        verifiedIssuer = requestedIssuer;
        notice = t("ตรวจพบการตั้งค่า OpenID Connect", "OpenID Connect configuration found.");
      }
    } catch (cause) { if (alive) error = orcaError(cause); }
    finally { if (alive) busy = false; }
  }
  async function save() {
    if (!data.canManage || busy || editing === undefined) return;
    error = validate();
    if (error) return;
    const payload = input();
    const id = editing?.id;
    clientSecret = "";
    busy = true; notice = "";
    try {
      const saved = await OrcaUserSourcesService.save(payload, id);
      if (!alive || !data.canManage) return;
      items = [...items.filter((item) => item.id !== saved.id), saved];
      editing = undefined;
      notice = t("บันทึกแล้ว", "Saved.");
    } catch (cause) { if (alive) error = orcaError(cause); }
    finally { if (alive) busy = false; }
  }
  async function toggle(source: OrcaUserSource) {
    if (!data.canManage || busy) return;
    busy = true; error = ""; notice = "";
    try {
      const saved = await OrcaUserSourcesService.save({
        name: source.name, issuerURL: source.issuerURL, clientID: source.clientID,
        enabled: !source.enabled, bindings: source.bindings, version: source.version,
      }, source.id);
      if (alive && data.canManage) items = items.map((item) => item.id === saved.id ? saved : item);
    } catch (cause) { if (alive) error = orcaError(cause); }
    finally { if (alive) busy = false; }
  }
  async function remove() {
    if (!data.canManage || busy || !deleting) return;
    const source = deleting;
    busy = true; error = ""; notice = "";
    try {
      await OrcaUserSourcesService.remove(source.id, source.version);
      if (!alive || !data.canManage) return;
      items = items.filter((item) => item.id !== source.id);
      deleting = undefined;
      notice = t("ลบแล้ว", "Deleted.");
    } catch (cause) { if (alive) error = orcaError(cause); }
    finally { if (alive) busy = false; }
  }
  async function copyCallback() {
    copied = false;
    try { await navigator.clipboard.writeText(callbackURL); if (alive) copied = true; }
    catch { if (alive) error = t("คัดลอกไม่สำเร็จ กรุณาเลือกและคัดลอก URL จากช่องด้วยตนเอง", "Copy failed. Select and copy the URL from the field manually."); }
  }
</script>

<section class="user-sources" aria-label={t("การเข้าสู่ระบบองค์กร", "Sign-in sources")}>
  <header class="source-heading">
    <h1>{t("การเข้าสู่ระบบองค์กร", "Sign-in sources")}</h1>
    {#if data.canManage && editing === undefined}
      <div class="source-actions">
        <button class="k-button source-square" disabled={busy || loading} onclick={refresh} aria-label={t("โหลดข้อมูลใหม่", "Refresh")} title={t("โหลดข้อมูลใหม่", "Refresh")}><RefreshCw size={16} class={loading ? "k-spin" : ""} /></button>
        <button class="k-button primary" disabled={busy || loading} onclick={() => open()}><Plus size={16} />{t("เพิ่มผู้ให้บริการเข้าสู่ระบบ", "Add sign-in source")}</button>
      </div>
    {/if}
  </header>
  {#if !data.canManage}
    <div class="source-empty"><ShieldCheck size={28} /><h2>{t("หน้านี้สำหรับผู้ดูแลระบบเท่านั้น", "This page is available to Admins only")}</h2></div>
  {:else}
    {#if error}<div class="k-banner error" role="alert">{error}</div>{/if}
    {#if notice}<div class="source-notice" role="status"><Check size={16} />{notice}</div>{/if}
    {#if editing !== undefined}
      <form class="source-editor" onsubmit={(event) => { event.preventDefault(); void save(); }}>
        <div class="editor-heading"><h2>{editing ? t("แก้ไขผู้ให้บริการเข้าสู่ระบบ", "Edit sign-in source") : t("เพิ่มผู้ให้บริการเข้าสู่ระบบ", "Add sign-in source")}</h2><button type="button" class="source-icon-button" disabled={busy} onclick={close} aria-label={t("ปิด", "Close")} title={t("ปิด", "Close")}><X size={16} /></button></div>
        <fieldset disabled={busy}>
          <label>{t("ชื่อ", "Name")}<input bind:value={name} required maxlength="120" autocomplete="off" placeholder="Microsoft Entra ID" /></label>
          <label>Issuer URL<div class="field-action"><input type="url" bind:value={issuerURL} readonly={Boolean(editing)} required autocomplete="off" placeholder="https://login.example.com" /><button type="button" class="k-button" disabled={!issuerURL.trim() || busy} onclick={check}>{verifiedIssuer === issuerURL.trim() ? t("ตรวจสอบอีกครั้ง", "Check again") : t("ตรวจสอบการตั้งค่า", "Check configuration")}</button></div></label>
          <label>Client ID<input bind:value={clientID} required autocomplete="off" /></label>
          <label>{editing?.secretConfigured ? t("Client secret ใหม่ (เว้นว่างเพื่อใช้ค่าเดิม)", "New client secret (leave blank to keep current)") : "Client secret"}<input type="password" bind:value={clientSecret} required={(enabled && !editing?.secretConfigured) || (Boolean(editing?.secretConfigured) && clientID.trim() !== editing?.clientID)} autocomplete="new-password" spellcheck="false" /></label>
          {#if callbackURL}<label>Callback URL<div class="field-action"><input readonly value={callbackURL} /><button type="button" class="k-button source-square" onclick={copyCallback} aria-label={t("คัดลอก Callback URL", "Copy callback URL")} title={t("คัดลอก Callback URL", "Copy callback URL")}>{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}</button></div></label>{/if}
          <label class="source-switch"><input type="checkbox" bind:checked={enabled} />{t("เปิดใช้งาน", "Active")}</label>
          <div class="mapping-heading"><h3>{t("การจับคู่บัญชีสมาชิก", "Member account mapping")}</h3><button type="button" class="k-button small" onclick={() => bindings = [...bindings, { memberID: "", subject: "" }]}><Plus size={16} />{t("เพิ่มการจับคู่", "Add mapping")}</button></div>
          {#each bindings as binding, index}
            <div class="identity-mapping">
              <label>{t("สมาชิก ORCA", "ORCA member")}<select bind:value={binding.memberID} required><option value="">{t("เลือกสมาชิก", "Select a member")}</option>{#each activeMembers as member (member.id)}<option value={member.id}>{memberName(member)}</option>{/each}</select></label>
              <label>Subject (sub)<input bind:value={binding.subject} required autocomplete="off" spellcheck="false" /></label>
              <button type="button" class="source-icon-button danger" aria-label={t("ลบการจับคู่บัญชี", "Remove account mapping")} title={t("ลบการจับคู่บัญชี", "Remove account mapping")} onclick={() => bindings = bindings.filter((_, row) => row !== index)}><Trash2 size={16} /></button>
            </div>
          {/each}
          <details class="source-help"><summary>{t("ขั้นตอนการตั้งค่า", "Setup steps")}</summary><ol class="k-numbered">
            <li>{t("สร้างแอป OpenID Connect ในระบบจัดการบัญชีขององค์กร และลงทะเบียน Callback URL ด้านบน", "Create an OpenID Connect app in your organization’s identity provider and register the callback URL above.")}</li>
            <li>{t("กรอก Issuer URL, Client ID และ Client secret ของแอปดังกล่าวในหน้านี้", "Enter that app’s issuer URL, client ID and client secret on this page.")}</li>
            <li>{t("จับคู่ Subject (sub) ของแต่ละบัญชีกับสมาชิก ORCA โดย ORCA จะไม่จับคู่บัญชีจากอีเมลโดยอัตโนมัติ", "Map each account’s subject (sub) to an ORCA member. ORCA does not match accounts by email automatically.")}</li>
            <li>{t("เลือกผู้ให้บริการเข้าสู่ระบบนี้ในการตั้งค่าพื้นที่ทำงาน AI ที่สมาชิกจะใช้งาน", "Select this sign-in source in the settings of the AI workspace your members will use.")}</li>
          </ol></details>
        </fieldset>
        <footer class="source-actions"><button type="button" class="k-button" disabled={busy} onclick={close}>{t("ยกเลิก", "Cancel")}</button><button type="submit" class="k-button primary" disabled={busy}>{#if busy}<LoaderCircle size={16} class="k-spin" />{/if}{t("บันทึก", "Save")}</button></footer>
      </form>
    {:else if loading}
      <div class="source-empty" role="status"><LoaderCircle size={24} class="k-spin" />{t("กำลังโหลด…", "Loading…")}</div>
    {:else if items.length}
      <div class="source-list">
        {#each items as source (source.id)}
          <article class="source-row"><span class="source-icon" aria-hidden="true"><KeyRound size={16} /></span><div class="source-name"><h2>{source.name}</h2><span>{source.issuerURL}</span></div><span class="source-status" class:enabled={source.enabled}>{source.enabled ? t("เปิดใช้งาน", "Active") : t("ปิดใช้งาน", "Inactive")}</span><span class="source-count">{source.bindings.length} {t("บัญชี", "accounts")}</span><div class="source-actions"><button class="k-button small" disabled={busy} onclick={() => open(source)}>{t("ตั้งค่า", "Configure")}</button>{#if source.enabled || (source.secretConfigured && source.bindings.length > 0)}<button class="source-icon-button" disabled={busy} aria-label={`${source.enabled ? t("ปิดใช้งาน", "Deactivate") : t("เปิดใช้งาน", "Activate")} ${source.name}`} title={source.enabled ? t("ปิดใช้งาน", "Deactivate") : t("เปิดใช้งาน", "Activate")} onclick={() => toggle(source)}>{#if source.enabled}<PowerOff size={16} />{:else}<Power size={16} />{/if}</button>{/if}<button class="source-icon-button danger" disabled={busy} aria-label={`${t("ลบ", "Delete")} ${source.name}`} title={t("ลบ", "Delete")} onclick={() => { deleting = source; error = ""; }}><Trash2 size={16} /></button></div></article>
        {/each}
      </div>
    {:else if !error}
      <div class="source-empty"><KeyRound size={28} /><h2>{t("ยังไม่มีผู้ให้บริการเข้าสู่ระบบ", "No sign-in sources yet")}</h2><button class="k-button primary small" onclick={() => open()}><Plus size={16} />{t("เพิ่มผู้ให้บริการเข้าสู่ระบบ", "Add sign-in source")}</button></div>
    {/if}
    {#if deleting}<section class="delete-confirm" aria-label={t("ยืนยันการลบ", "Confirm deletion")}><h2>{t(`ต้องการลบ ${deleting.name} หรือไม่`, `Delete ${deleting.name}?`)}</h2><p>{t("สมาชิกจะไม่สามารถเข้าสู่ระบบผ่านผู้ให้บริการนี้ได้อีก", "Members will no longer be able to sign in through this source.")}</p><div class="source-actions"><button class="k-button" disabled={busy} onclick={() => deleting = undefined}>{t("ยกเลิก", "Cancel")}</button><button class="k-button danger" disabled={busy} onclick={remove}>{t("ลบ", "Delete")}</button></div></section>{/if}
  {/if}
</section>

<style>
  .user-sources { display: grid; gap: 16px; min-width: 0; }
  .source-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 24px; margin-bottom: 4px; }
  .source-heading h1 { margin: 0; }
  .editor-heading, .mapping-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .editor-heading h2, .mapping-heading h3 { margin: 0; }
  .source-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .source-square { width: 36px; padding: 0; flex: none; }
  .source-icon-button { display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--orca-radius); background: transparent; color: var(--orca-subtle); cursor: pointer; }
  .source-icon-button:hover:not(:disabled) { background: var(--orca-hover); color: var(--orca-ink); }
  .source-icon-button.danger:hover:not(:disabled) { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .source-icon-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .source-editor, .source-list, .source-empty, .delete-confirm { border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .source-editor { display: grid; gap: 18px; max-width: 900px; padding: 20px; }
  .editor-heading { padding-bottom: 14px; border-bottom: 1px solid var(--orca-line); }
  fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; min-width: 0; margin: 0; padding: 0; border: 0; }
  fieldset > label:nth-child(2), fieldset > label:nth-child(5), .source-switch, .mapping-heading, .identity-mapping, .source-help { grid-column: 1 / -1; }
  label { display: grid; gap: 6px; min-width: 0; font-size: 13.5px; font-weight: 600; }
  .source-editor :is(input:not([type=checkbox]), select) { width: 100%; min-width: 0; min-height: 36px; padding: 7px 11px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); color: var(--orca-ink); font: inherit; font-size: 14px; font-weight: 400; line-height: 1.45; }
  .source-editor select { height: 36px; padding-block: 0; }
  .source-editor :is(input:not([type=checkbox]), select):focus-visible { outline: none; border-color: var(--orca-ink); box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1); }
  .source-editor input[readonly] { background: var(--orca-surface-2); color: var(--orca-muted); }
  .field-action { display: flex; gap: 8px; min-width: 0; }
  .field-action :global(.k-button) { flex-shrink: 0; }
  .source-switch { display: flex; align-items: center; gap: 10px; font-weight: 500; }
  .source-switch input { accent-color: var(--orca-ink); }
  .mapping-heading { padding-top: 16px; border-top: 1px solid var(--orca-line); }
  .identity-mapping { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 12px; align-items: end; }
  .identity-mapping .source-icon-button { margin-bottom: 2px; }
  .source-help { padding-top: 16px; border-top: 1px solid var(--orca-line); color: var(--orca-muted); font-size: 14px; }
  summary { color: var(--orca-ink); font-size: 13.5px; font-weight: 600; cursor: pointer; }
  footer { justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--orca-line); }
  .source-notice { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--orca-ok) 22%, transparent); border-radius: var(--orca-radius); background: var(--orca-ok-bg); color: var(--orca-ok); font-size: 13.5px; }
  .source-list { overflow: hidden; }
  .source-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto auto auto; align-items: center; gap: 16px; padding: 12px 18px; }
  .source-row + .source-row { border-top: 1px solid #eff0f2; }
  .source-row:hover { background: var(--orca-surface-2); }
  .source-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--orca-radius); background: var(--orca-secondary); color: var(--orca-nav); }
  .source-name { min-width: 0; }
  .source-name h2 { margin: 0; font-size: 14px; line-height: 1.45; font-weight: 600; overflow-wrap: anywhere; }
  .source-name span { display: block; margin-top: 1px; overflow: hidden; color: var(--orca-muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .source-status { padding: 1px 8px; border-radius: var(--orca-radius-sm); background: var(--orca-secondary); color: var(--orca-nav); font-size: 12px; font-weight: 500; white-space: nowrap; }
  .source-status.enabled { background: var(--orca-ok-bg); color: var(--orca-ok); }
  .source-count { color: var(--orca-muted); font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .source-row .source-actions { flex-wrap: nowrap; gap: 4px; }
  .source-row .source-actions :global(.k-button) { margin-right: 4px; }
  .source-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; color: var(--orca-subtle); text-align: center; font-size: 13.5px; }
  .source-empty h2 { margin: 4px 0 0; color: var(--orca-ink); font-size: 15px; font-weight: 600; }
  .source-empty :global(.k-button) { margin-top: 8px; }
  .delete-confirm { display: grid; gap: 10px; padding: 18px 20px; border-color: color-mix(in srgb, var(--orca-deny) 30%, transparent); }
  .delete-confirm h2 { margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .delete-confirm p { margin: 0; color: var(--orca-muted); font-size: 14px; }
  .delete-confirm .source-actions { margin-top: 4px; }
  @media (max-width: 1000px) {
    .source-row { grid-template-columns: 32px minmax(0, 1fr) auto; row-gap: 8px; }
    .source-row .source-count { grid-column: 2; grid-row: 2; }
    .source-row .source-actions { grid-column: 3; grid-row: 2; justify-self: end; }
  }
  @media (max-width: 600px) {
    .source-heading .source-actions { width: 100%; }
    .source-heading .source-actions :global(.k-button.primary) { flex: 1 1 auto; }
    .source-editor { padding: 16px; }
    fieldset { grid-template-columns: minmax(0, 1fr); }
    fieldset > label { grid-column: 1; }
    .field-action { flex-wrap: wrap; }
    .field-action input { flex-basis: 100%; }
    .identity-mapping { grid-template-columns: minmax(0, 1fr) auto; }
    .identity-mapping label:first-child { grid-column: 1 / -1; }
    .source-row { grid-template-columns: 32px auto minmax(0, 1fr); column-gap: 12px; padding: 12px 16px; }
    .source-row .source-name { grid-column: 2 / -1; }
    .source-row .source-status { grid-column: 2; grid-row: 2; justify-self: start; }
    .source-row .source-count { grid-column: 3; grid-row: 2; }
    .source-row .source-actions { grid-column: 2 / -1; grid-row: 3; justify-self: start; }
  }
</style>
