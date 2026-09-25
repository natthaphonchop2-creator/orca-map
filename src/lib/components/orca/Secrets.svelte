<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ArrowRight, Check, CircleAlert, KeyRound, KeySquare, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from "@lucide/svelte";
  import { organizationRole } from "$lib/orca/member-access";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import { STALE_DAYS, canRevokeSecret, secretHolders, secretRows, type SecretRow } from "$lib/orca/secrets";
  import { OrcaService, displayDate, type OrcaBootstrap, type OrcaSecrets } from "$lib/services/orca";

  let { data }: { data: OrcaBootstrap } = $props();
  let inventory = $state<OrcaSecrets>();
  let loading = $state(false);
  let error = $state("");
  let notice = $state("");
  let holder = $state("");
  let revoking = $state<SecretRow>();
  let busy = $state(false);
  let revokeError = $state("");
  let alive = true;
  let request = 0;

  const viewer = $derived(data.members.find((member) => member.id === data.currentUserID));
  const viewerIsOwner = $derived(organizationRole(viewer?.role ?? "") === "owner");
  const rows = $derived(inventory
    ? secretRows(inventory, data.members, data.hubs, Date.now(), (role) => organizationRole(role) === "owner")
    : { sessions: [], keys: [] });
  const holders = $derived(secretHolders([...rows.sessions, ...rows.keys]));
  const sessions = $derived(holder ? rows.sessions.filter((row) => row.userID === holder) : rows.sessions);
  const keys = $derived(holder ? rows.keys.filter((row) => row.userID === holder) : rows.keys);
  const neverExpiring = $derived(rows.keys.filter((row) => row.neverExpires).length);
  const stale = $derived([...rows.sessions, ...rows.keys].filter((row) => row.stale).length);

  const holderName = (row: { member: string }) => row.member || t("ผู้ที่ไม่ได้เป็นสมาชิกแล้ว", "Former member");
  const appName = (row: SecretRow) => row.label || t("แอป AI", "AI app");
  const reach = (row: SecretRow) =>
    row.hubID ? t(`เฉพาะ ${row.hubName ?? "พื้นที่ทำงานหนึ่งแห่ง"}`, `Only ${row.hubName ?? "one workspace"}`) : t("ทุกพื้นที่ทำงานที่ได้รับสิทธิ์", "Every permitted workspace");

  async function refresh() {
    const current = ++request;
    loading = true;
    error = "";
    try {
      const next = await OrcaService.secrets();
      if (!alive || current !== request) return;
      inventory = next;
      if (holder && !next.keys.some((key) => key.userID === holder) && !next.sessions.some((session) => session.userID === holder)) holder = "";
    } catch {
      if (alive && current === request) error = t("โหลดข้อมูลลับไม่สำเร็จ กรุณาลองอีกครั้ง", "Access could not be loaded. Try again.");
    } finally {
      if (alive && current === request) loading = false;
    }
  }
  onMount(() => { if (data.canManage) void refresh(); });
  onDestroy(() => { alive = false; });

  function askRevoke(row: SecretRow) {
    notice = "";
    revokeError = "";
    revoking = row;
  }

  async function revoke() {
    const row = revoking;
    if (busy || !row) return;
    busy = true;
    revokeError = "";
    try {
      if (row.kind === "session") await OrcaService.revokeSecretSession(row.id);
      else await OrcaService.revokeSecretKey(row.keyID!);
      if (!alive) return;
      revoking = undefined;
      notice = row.kind === "session"
        ? t(`ให้ ${appName(row)} ของ ${holderName(row)} ออกจากระบบแล้ว`, `${appName(row)} was signed out for ${holderName(row)}.`)
        : t(`เพิกถอนคีย์ ${row.label} แล้ว`, `The key ${row.label} was revoked.`);
      await refresh();
    } catch {
      if (alive) revokeError = t("เพิกถอนไม่สำเร็จ รายการนี้อาจถูกเพิกถอนไปแล้ว หรือคุณไม่มีสิทธิ์ กรุณาโหลดข้อมูลใหม่", "It could not be revoked. It may already be gone, or you may not have permission. Reload and try again.");
    } finally {
      if (alive) busy = false;
    }
  }
</script>

{#snippet revokeButton(row: SecretRow)}
  {#if canRevokeSecret(row, data.currentUserID, viewerIsOwner)}
    <button class="k-button small danger" aria-controls="secret-revoke" onclick={() => askRevoke(row)}>{row.kind === "session" ? t("ให้ออกจากระบบ", "Sign out") : t("เพิกถอน", "Revoke")}</button>
  {:else}
    <span class="owner-only" title={t("เฉพาะเจ้าของระบบเพิกถอนสิทธิ์ของเจ้าของได้", "Only an owner can revoke an owner's access")}>{t("เฉพาะเจ้าของ", "Owner only")}</span>
  {/if}
{/snippet}

{#snippet revokePanel(row: SecretRow)}
  <section id="secret-revoke" class="revoke-confirm" aria-labelledby="secret-revoke-title">
    <h3 id="secret-revoke-title">{row.kind === "session"
      ? t(`ให้ ${appName(row)} ของ ${holderName(row)} ออกจากระบบไหม`, `Sign ${appName(row)} out for ${holderName(row)}?`)
      : t(`เพิกถอนคีย์ ${row.label} ของ ${holderName(row)} ไหม`, `Revoke ${holderName(row)}'s key ${row.label}?`)}</h3>
    <p>{row.kind === "session"
      ? t("แอปนี้จะใช้ ORCA ไม่ได้ทันที ถ้ายังต้องใช้ เจ้าของบัญชีต้องเชื่อมแอปใหม่", "The app loses ORCA access at once. To keep using it, the member connects it again.")
      : t("แอปหรือสคริปต์ที่ใช้คีย์นี้จะเชื่อม ORCA ไม่ได้ทันที และกู้คืนคีย์นี้ไม่ได้", "Apps and scripts using this key lose ORCA access at once. The key cannot be restored.")}</p>
    {#if revokeError}<p class="form-error" role="alert">{revokeError}</p>{/if}
    <div class="panel-actions">
      <button class="k-button" disabled={busy} onclick={() => { revoking = undefined; revokeError = ""; }}>{t("ยกเลิก", "Cancel")}</button>
      <button class="k-button danger" disabled={busy} onclick={revoke}>{#if busy}<LoaderCircle size={16} class="k-spin" />{/if}{row.kind === "session" ? t("ให้ออกจากระบบ", "Sign out") : t("เพิกถอนคีย์", "Revoke key")}</button>
    </div>
  </section>
{/snippet}

<section class="secrets" aria-labelledby="secrets-title">
  <header class="secrets-heading">
    <div>
      <h1 id="secrets-title">{t("ข้อมูลลับ", "Secrets")}</h1>
      <p class="k-subtitle">{t("คีย์และการเข้าสู่ระบบที่ใช้เชื่อม AI กับ ORCA ค่าจริงแสดงครั้งเดียวตอนสร้าง หน้านี้จึงแสดงแค่ข้อมูลประกอบ ใช้เพิกถอนได้ทันทีเมื่อมีคนออกหรือเครื่องหาย", "Keys and sign-ins that connect AI to ORCA. Values are shown only once, when created, so this page lists details only. Revoke access at once when someone leaves or loses a device.")}</p>
    </div>
    {#if data.canManage}
      <button class="k-button secrets-square" disabled={loading} onclick={refresh} aria-label={t("โหลดข้อมูลใหม่", "Refresh")} title={t("โหลดข้อมูลใหม่", "Refresh")}><RefreshCw size={16} class={loading ? "k-spin" : ""} /></button>
    {/if}
  </header>

  {#if !data.canManage}
    <div class="secrets-empty"><ShieldCheck size={28} aria-hidden="true" /><h2>{t("หน้านี้สำหรับผู้ดูแลระบบเท่านั้น", "This page is available to Admins only")}</h2></div>
  {:else}
    {#if error}<div class="k-banner error" role="alert">{error}</div>{/if}
    {#if notice}<p class="secrets-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>{/if}
    {#if loading && !inventory}
      <div class="secrets-empty" role="status"><LoaderCircle size={24} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</div>
    {:else if inventory}
      <div class="secret-stats">
        <div class="stat"><span class="stat-label"><Sparkles size={15} aria-hidden="true" />{t("แอป AI ที่เข้าสู่ระบบอยู่", "AI apps signed in")}</span><strong>{rows.sessions.length}</strong></div>
        <div class="stat"><span class="stat-label"><KeyRound size={15} aria-hidden="true" />{t("คีย์ API ที่ใช้งานได้", "Active API keys")}</span><strong>{rows.keys.length}</strong>{#if neverExpiring}<span class="stat-note warn">{t(`${neverExpiring} คีย์ไม่มีวันหมดอายุ`, `${neverExpiring} never expire`)}</span>{/if}</div>
        <div class="stat"><span class="stat-label"><CircleAlert size={15} aria-hidden="true" />{t(`ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `Unused for ${STALE_DAYS}+ days`)}</span><strong>{stale}</strong>{#if stale}<span class="stat-note">{t("ควรพิจารณาเพิกถอน", "Consider revoking")}</span>{/if}</div>
        <a class="stat link" href={localeHref("/app?view=connected-apps")}><span class="stat-label"><KeySquare size={15} aria-hidden="true" />{t("แอปเชื่อมบัญชี (OAuth)", "OAuth apps")}</span><span class="stat-link">{t("ดูแอปที่ตั้งค่าไว้", "View app settings")}<ArrowRight size={14} aria-hidden="true" /></span></a>
      </div>

      {#if holders.length > 1}
        <div class="holder-filter">
          <label for="secret-holder">{t("ของใคร", "Whose access")}</label>
          <select id="secret-holder" bind:value={holder}>
            <option value="">{t("ทุกคน", "Everyone")}</option>
            {#each holders as person (person.userID)}<option value={person.userID}>{holderName(person)}</option>{/each}
          </select>
        </div>
      {/if}

      <section class="secret-section" aria-labelledby="secret-sessions-title">
        <div class="section-head">
          <h2 id="secret-sessions-title">{t("แอป AI ที่เข้าสู่ระบบอยู่", "AI apps signed in")}<span class="secrets-count">{sessions.length}</span></h2>
          <p>{t("แอปที่สมาชิกเชื่อมด้วยการเข้าสู่ระบบบัญชี ORCA (OAuth) เช่น ChatGPT หรือ Claude", "Apps members connected by signing in with their ORCA account (OAuth), such as ChatGPT or Claude.")}</p>
        </div>
        {#if sessions.length}
          <div class="secret-list">
            {#each sessions as row (row.id)}
              <div class="secret-row">
                <span class="secret-icon" aria-hidden="true"><Sparkles size={16} /></span>
                <span class="secret-name"><strong>{appName(row)}</strong><span>{holderName(row)}</span></span>
                <span class="secret-meta">{t("เข้าสู่ระบบเมื่อ", "Since")} {displayDate(row.createdAt)}<span>{t("ใช้ล่าสุด", "Last active")} {displayDate(row.lastActiveAt)}{#if row.stale}<em class="stale">{t(`ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `Unused ${STALE_DAYS}+ days`)}</em>{/if}</span></span>
                <span class="secret-expiry">{t("หมดอายุ", "Expires")} {displayDate(row.expiresAt)}</span>
                <span class="secret-action">{@render revokeButton(row)}</span>
              </div>
            {/each}
          </div>
          {#if revoking?.kind === "session"}{@render revokePanel(revoking)}{/if}
        {:else}
          <p class="secrets-muted">{holder ? t("คนนี้ไม่มีแอป AI ที่เข้าสู่ระบบอยู่", "This person has no AI app signed in.") : t("ยังไม่มีแอป AI ที่เข้าสู่ระบบอยู่", "No AI app is signed in.")}</p>
        {/if}
      </section>

      <section class="secret-section" aria-labelledby="secret-keys-title">
        <div class="section-head">
          <h2 id="secret-keys-title">{t("คีย์ API", "API keys")}<span class="secrets-count">{keys.length}</span></h2>
          <p>{t("คีย์ที่สมาชิกสร้างเองสำหรับแอปที่ไม่รองรับการเข้าสู่ระบบ หรือสำหรับสคริปต์", "Keys members created for apps without sign-in support, or for scripts.")}</p>
        </div>
        {#if keys.length}
          <div class="secret-list">
            {#each keys as row (row.id)}
              <div class="secret-row">
                <span class="secret-icon" aria-hidden="true"><KeyRound size={16} /></span>
                <span class="secret-name"><strong>{row.label}</strong><span>{holderName(row)} · {reach(row)}</span></span>
                <span class="secret-meta">{t("สร้างเมื่อ", "Created")} {displayDate(row.createdAt)}<span>{row.lastActiveAt ? `${t("ใช้ล่าสุด", "Last used")} ${displayDate(row.lastActiveAt)}` : t("ยังไม่เคยใช้", "Never used")}{#if row.stale}<em class="stale">{t(`ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `Unused ${STALE_DAYS}+ days`)}</em>{/if}</span></span>
                <span class="secret-expiry">{#if row.neverExpires}<em class="never">{t("ไม่มีวันหมดอายุ", "Never expires")}</em>{:else}{t("หมดอายุ", "Expires")} {displayDate(row.expiresAt)}{/if}</span>
                <span class="secret-action">{@render revokeButton(row)}</span>
              </div>
            {/each}
          </div>
          {#if revoking?.kind === "key"}{@render revokePanel(revoking)}{/if}
        {:else}
          <p class="secrets-muted">{holder ? t("คนนี้ไม่มีคีย์ API", "This person has no API keys.") : t("ยังไม่มีคีย์ API", "No API keys yet.")}</p>
        {/if}
      </section>
    {/if}
  {/if}
</section>

<style>
  .secrets { display: grid; gap: 20px; min-width: 0; }
  .secrets-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 24px; }
  .secrets-heading h1 { margin: 0; }
  .secrets-heading .k-subtitle { max-width: 720px; }
  .secrets-square { width: 36px; padding: 0; flex: none; justify-content: center; }
  .secret-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
  .stat { display: grid; align-content: start; gap: 4px; min-width: 0; padding: 14px 16px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-ink); text-decoration: none; }
  .stat strong { font-size: 24px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .stat-label { display: inline-flex; align-items: center; gap: 6px; color: var(--orca-muted); font-size: 13px; }
  .stat-note { color: var(--orca-muted); font-size: 12.5px; }
  .stat-note.warn { color: var(--orca-warn); }
  .stat.link:hover { background: var(--orca-surface-2); }
  .stat.link:focus-visible { outline: 2px solid var(--orca-ink); outline-offset: 2px; }
  .stat-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 14px; font-weight: 500; }
  .holder-filter { display: flex; align-items: center; gap: 10px; }
  .holder-filter label { font-size: 13.5px; font-weight: 600; }
  .holder-filter select { height: 36px; min-width: 0; max-width: 280px; padding: 0 10px; border: 1px solid var(--orca-line-strong); border-radius: var(--orca-radius); background: var(--orca-surface); color: var(--orca-ink); font: inherit; font-size: 14px; }
  .secret-section { display: grid; gap: 12px; min-width: 0; }
  .section-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 600; }
  .section-head p { max-width: 760px; margin: 4px 0 0; color: var(--orca-muted); font-size: 13.5px; line-height: 1.6; }
  .secrets-count { padding: 0 7px; border-radius: 999px; background: var(--orca-secondary); color: var(--orca-nav); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .secret-list { overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .secret-row { display: grid; grid-template-columns: 32px minmax(0, 1.4fr) minmax(0, 1.3fr) minmax(0, 0.9fr) 128px; align-items: center; gap: 14px; padding: 12px 18px; }
  .secret-row + .secret-row { border-top: 1px solid #eff0f2; }
  .secret-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--orca-radius); background: var(--orca-secondary); color: var(--orca-nav); }
  .secret-name { min-width: 0; }
  .secret-name strong { display: block; overflow: hidden; font-size: 14px; font-weight: 600; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
  .secret-name span { display: block; overflow: hidden; color: var(--orca-muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .secret-meta, .secret-expiry { min-width: 0; color: var(--orca-muted); font-size: 13px; line-height: 1.55; }
  .secret-meta > span { display: block; }
  .secret-action { justify-self: end; }
  .stale, .never { margin-left: 6px; padding: 0 6px; border-radius: var(--orca-radius-sm); background: var(--orca-warn-bg); color: var(--orca-warn); font-size: 12px; font-style: normal; white-space: nowrap; }
  .never { margin-left: 0; }
  .owner-only { color: var(--orca-subtle); font-size: 12.5px; white-space: nowrap; }
  .revoke-confirm { display: grid; gap: 10px; padding: 18px 20px; border: 1px solid color-mix(in srgb, var(--orca-deny) 30%, transparent); border-radius: var(--orca-radius-lg); background: var(--orca-surface); }
  .revoke-confirm h3 { margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .revoke-confirm p { margin: 0; color: var(--orca-muted); font-size: 14px; line-height: 1.6; }
  .panel-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .form-error { color: var(--orca-deny) !important; font-size: 13.5px; }
  .secrets-notice { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--orca-ok) 22%, transparent); border-radius: var(--orca-radius); background: var(--orca-ok-bg); color: var(--orca-ok); font-size: 13.5px; }
  .secrets-muted { margin: 0; color: var(--orca-muted); font-size: 13.5px; }
  .secrets-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-subtle); text-align: center; font-size: 13.5px; }
  .secrets-empty h2 { margin: 4px 0 0; color: var(--orca-ink); font-size: 15px; font-weight: 600; }
  @media (max-width: 900px) {
    .secret-row { grid-template-columns: 32px minmax(0, 1fr) auto; row-gap: 6px; }
    .secret-row .secret-meta, .secret-row .secret-expiry { grid-column: 2 / -1; }
    .secret-row .secret-action { grid-column: 3; grid-row: 1; }
  }
  @media (max-width: 600px) {
    .secret-row { padding: 12px 14px; }
    .holder-filter { flex-wrap: wrap; }
    .holder-filter select { flex: 1 1 200px; }
  }
</style>
