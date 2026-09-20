<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Check, Copy, KeyRound, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, X } from "@lucide/svelte";
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
    if (!name.trim() || !issuerURL.trim() || !clientID.trim()) return t("กรอกชื่อ, Issuer URL และ Client ID", "Enter a name, Issuer URL and Client ID.");
    if (enabled && !editing?.secretConfigured && !clientSecret) return t("กรอก Client secret", "Enter a client secret.");
    if (editing?.secretConfigured && clientID.trim() !== editing.clientID && !clientSecret) return t("กรอก Client secret ใหม่เมื่อเปลี่ยน Client ID", "Enter a new client secret when changing the client ID.");
    if (enabled && !bindings.length) return t("เพิ่มบัญชีพนักงานอย่างน้อย 1 บัญชีก่อนเปิดใช้งาน", "Add at least one employee account before enabling this provider.");
    const subjects = new Set<string>();
    const members = new Set<string>();
    for (const binding of bindings) {
      if (!binding.memberID || !binding.subject.trim()) return t("เลือกสมาชิกและกรอก Subject ให้ครบ", "Select a member and enter a subject for each mapping.");
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
        notice = t("พบการตั้งค่า OpenID Connect", "OpenID Connect configuration found.");
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
    catch { if (alive) error = t("คัดลอกไม่สำเร็จ เลือกและคัดลอก URL ในช่องได้", "Copy failed. Select and copy the URL from the field."); }
  }
</script>

<section class="user-sources" aria-label="User sources">
  <header class="source-heading">
    <h1>User sources</h1>
    {#if data.canManage && editing === undefined}
      <div class="source-actions">
        <button class="k-button" disabled={busy || loading} onclick={refresh} aria-label={t("โหลดใหม่", "Refresh")}><RefreshCw size={17} class={loading ? "k-spin" : ""} /></button>
        <button class="k-button primary" disabled={busy || loading} onclick={() => open()}><Plus size={17} />{t("เพิ่มผู้ให้บริการ", "Add identity provider")}</button>
      </div>
    {/if}
  </header>
  {#if !data.canManage}
    <div class="source-empty"><ShieldCheck size={26} /><h2>{t("สำหรับผู้ดูแลองค์กร", "Organization administrators only")}</h2></div>
  {:else}
    {#if error}<div class="k-banner error" role="alert">{error}</div>{/if}
    {#if notice}<div class="source-notice" role="status"><Check size={16} />{notice}</div>{/if}
    {#if editing !== undefined}
      <form class="source-editor" onsubmit={(event) => { event.preventDefault(); void save(); }}>
        <div class="editor-heading"><h2>{editing ? t("ตั้งค่าการเข้าสู่ระบบ", "Edit identity provider") : t("เพิ่มผู้ให้บริการ", "Add identity provider")}</h2><button type="button" class="k-button" disabled={busy} onclick={close} aria-label={t("ปิด", "Close")}><X size={18} /></button></div>
        <fieldset disabled={busy}>
          <label>{t("ชื่อ", "Name")}<input bind:value={name} required maxlength="120" autocomplete="off" placeholder="Microsoft Entra ID" /></label>
          <label>Issuer URL<div class="field-action"><input type="url" bind:value={issuerURL} readonly={Boolean(editing)} required autocomplete="off" placeholder="https://login.example.com" /><button type="button" class="k-button" disabled={!issuerURL.trim() || busy} onclick={check}>{verifiedIssuer === issuerURL.trim() ? t("ตรวจอีกครั้ง", "Check again") : t("ตรวจการตั้งค่า", "Check configuration")}</button></div></label>
          <label>Client ID<input bind:value={clientID} required autocomplete="off" /></label>
          <label>{editing?.secretConfigured ? t("Client secret ใหม่ (เว้นว่างเพื่อใช้ค่าเดิม)", "New client secret (leave blank to keep current)") : "Client secret"}<input type="password" bind:value={clientSecret} required={(enabled && !editing?.secretConfigured) || (Boolean(editing?.secretConfigured) && clientID.trim() !== editing?.clientID)} autocomplete="new-password" spellcheck="false" /></label>
          {#if callbackURL}<label>Callback URL<div class="field-action"><input readonly value={callbackURL} /><button type="button" class="k-button" onclick={copyCallback} aria-label={t("คัดลอก Callback URL", "Copy callback URL")}>{#if copied}<Check size={17} />{:else}<Copy size={17} />{/if}</button></div></label>{/if}
          <label class="source-switch"><input type="checkbox" bind:checked={enabled} />{t("เปิดใช้งาน", "Enabled")}</label>
          <div class="mapping-heading"><h3>{t("บัญชีพนักงาน", "Employee accounts")}</h3><button type="button" class="k-button" onclick={() => bindings = [...bindings, { memberID: "", subject: "" }]}><Plus size={16} />{t("เพิ่มบัญชี", "Add account")}</button></div>
          {#each bindings as binding, index}
            <div class="identity-mapping">
              <label>{t("สมาชิก ORCA", "ORCA member")}<select bind:value={binding.memberID} required><option value="">{t("เลือกสมาชิก", "Select a member")}</option>{#each activeMembers as member (member.id)}<option value={member.id}>{memberName(member)}</option>{/each}</select></label>
              <label>Subject (sub)<input bind:value={binding.subject} required autocomplete="off" spellcheck="false" /></label>
              <button type="button" class="k-button" aria-label={t("ลบบัญชีที่จับคู่", "Remove account mapping")} onclick={() => bindings = bindings.filter((_, row) => row !== index)}><Trash2 size={17} /></button>
            </div>
          {/each}
          <details class="source-help"><summary>{t("วิธีตั้งค่า", "Setup help")}</summary><ol>
            <li>{t("สร้างแอป OpenID Connect ในระบบบัญชีของบริษัท และเพิ่ม Callback URL ด้านบน", "Create an OpenID Connect app in your company identity provider and register the callback URL above.")}</li>
            <li>{t("นำ Issuer URL, Client ID และ Client secret ของแอปมาใส่ในหน้านี้", "Enter that app’s issuer URL, client ID and client secret here.")}</li>
            <li>{t("จับคู่ Subject (sub) จากระบบบัญชีกับสมาชิก ORCA ระบบจะไม่จับคู่ด้วยอีเมลอัตโนมัติ", "Map each provider subject (sub) to an ORCA member. Email addresses are not linked automatically.")}</li>
            <li>{t("เลือก User source นี้ใน MCP Gateway ที่ต้องการให้พนักงานใช้", "Select this user source in the MCP Gateway your employees will use.")}</li>
          </ol></details>
        </fieldset>
        <footer class="source-actions"><button type="button" class="k-button" disabled={busy} onclick={close}>{t("ยกเลิก", "Cancel")}</button><button type="submit" class="k-button primary" disabled={busy}>{#if busy}<LoaderCircle size={17} class="k-spin" />{/if}{t("บันทึก", "Save")}</button></footer>
      </form>
    {:else if loading}
      <div class="source-empty" role="status"><LoaderCircle size={24} class="k-spin" />{t("กำลังโหลด…", "Loading…")}</div>
    {:else if items.length}
      <div class="source-list">
        {#each items as source (source.id)}
          <article class="source-row"><KeyRound size={20} /><div class="source-name"><h2>{source.name}</h2><span>{source.issuerURL}</span></div><span class="source-status" class:enabled={source.enabled}>{source.enabled ? t("เปิดใช้งาน", "Enabled") : t("ปิดใช้งาน", "Disabled")}</span><span class="source-count">{source.bindings.length} {t("บัญชี", "accounts")}</span><div class="source-actions"><button class="k-button" disabled={busy} onclick={() => open(source)}>{t("ตั้งค่า", "Configure")}</button>{#if source.enabled || (source.secretConfigured && source.bindings.length > 0)}<button class="k-button" disabled={busy} onclick={() => toggle(source)}>{source.enabled ? t("ปิดใช้งาน", "Disable") : t("เปิดใช้งาน", "Enable")}</button>{/if}<button class="k-button" disabled={busy} aria-label={`${t("ลบ", "Delete")} ${source.name}`} onclick={() => { deleting = source; error = ""; }}><Trash2 size={16} /></button></div></article>
        {/each}
      </div>
    {:else if !error}
      <div class="source-empty"><KeyRound size={28} /><h2>{t("ยังไม่มีผู้ให้บริการเข้าสู่ระบบ", "No identity providers yet")}</h2><button class="k-button primary" onclick={() => open()}><Plus size={17} />{t("เพิ่มผู้ให้บริการ", "Add identity provider")}</button></div>
    {/if}
    {#if deleting}<section class="delete-confirm" aria-label={t("ยืนยันการลบ", "Confirm deletion")}><h2>{t("ลบ", "Delete")} {deleting.name}?</h2><p>{t("พนักงานจะเข้าสู่ระบบผ่านผู้ให้บริการนี้ไม่ได้", "Employees will no longer be able to sign in through this provider.")}</p><div class="source-actions"><button class="k-button" disabled={busy} onclick={() => deleting = undefined}>{t("ยกเลิก", "Cancel")}</button><button class="k-button danger" disabled={busy} onclick={remove}>{t("ลบ", "Delete")}</button></div></section>{/if}
  {/if}
</section>

<style>
  .user-sources { display: grid; gap: 22px; min-width: 0; }
  .source-heading, .editor-heading, .mapping-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  h1 { font-size: 26px; font-weight: 650; margin: 0; }
  h2, h3 { margin: 0; font-size: 17px; font-weight: 650; }
  .source-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .source-editor, .source-list, .source-empty, .delete-confirm { border: 1px solid #dce1d8; background: #fff; border-radius: 10px; }
  .source-editor { display: grid; gap: 24px; padding: 24px; max-width: 900px; }
  fieldset { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; border: 0; padding: 0; margin: 0; min-width: 0; }
  fieldset > label:nth-child(2), fieldset > label:nth-child(5), .source-switch, .mapping-heading, .identity-mapping, .source-help { grid-column: 1 / -1; }
  label { display: grid; gap: 7px; font-weight: 600; font-size: 14px; min-width: 0; }
  input:not([type=checkbox]), select { min-width: 0; width: 100%; min-height: 43px; border: 1px solid #d8ded2; border-radius: 7px; padding: 9px 11px; background: white; color: #242b23; font: inherit; font-weight: 400; }
  input[readonly] { background: #f7f8f5; color: #55614e; }
  .field-action { display: flex; gap: 10px; min-width: 0; }
  .field-action .k-button { flex-shrink: 0; }
  .source-switch { display: flex; align-items: center; gap: 10px; }
  .source-switch input { accent-color: #526f35; width: 18px; height: 18px; }
  .mapping-heading { padding-top: 16px; border-top: 1px solid #e2e6de; }
  .identity-mapping { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
  .source-help { padding-top: 16px; border-top: 1px solid #e2e6de; color: #58644f; font-size: 14px; }
  summary { cursor: pointer; font-weight: 600; }
  ol { display: grid; gap: 9px; padding-left: 22px; margin: 14px 0 0; }
  footer { justify-content: flex-end; padding-top: 20px; border-top: 1px solid #e2e6de; }
  .source-notice { display: flex; align-items: center; gap: 8px; color: #48652f; }
  .source-row { display: flex; align-items: center; gap: 18px; padding: 21px; border-bottom: 1px solid #e2e6de; }
  .source-row:last-child { border-bottom: 0; }
  .source-name { flex: 1; min-width: 0; }
  .source-name span { display: block; font-size: 13px; color: #65725e; overflow-wrap: anywhere; margin-top: 4px; }
  .source-status { border-radius: 5px; padding: 4px 8px; background: #f0f1ef; color: #626a5d; font-size: 12px; white-space: nowrap; }
  .source-status.enabled { background: #edf5e4; color: #4f6c34; }
  .source-count { font-size: 13px; white-space: nowrap; color: #65725e; }
  .source-empty { padding: 48px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
  .delete-confirm { padding: 22px; display: grid; gap: 16px; border-color: #dcb6b0; }
  .delete-confirm p { margin: 0; }
  .danger { color: #a4313a; border-color: #dcb6b0; }
  @media (max-width: 1000px) { .source-row { flex-wrap: wrap; } .source-name { flex-basis: calc(100% - 44px); } .source-row .source-actions { margin-left: auto; } }
  @media (max-width: 600px) { .source-heading { align-items: flex-start; flex-wrap: wrap; } h1 { font-size: 23px; } .source-editor { padding: 18px; } fieldset { grid-template-columns: 1fr; } fieldset > label { grid-column: 1; } .field-action { flex-wrap: wrap; } .field-action input { flex-basis: 100%; } .identity-mapping { grid-template-columns: 1fr auto; } .identity-mapping label:first-child { grid-column: 1 / -1; } .mapping-heading { gap: 10px; } .source-row { padding: 18px; gap: 12px; } .source-row .source-actions { flex-basis: 100%; margin-left: 0; } .source-count { margin-left: auto; } }
</style>
