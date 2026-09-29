<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Check, ChevronDown, Copy, ExternalLink, Info, Link2, LoaderCircle, Lock, TriangleAlert, Users } from "@lucide/svelte";
  import { consumerDomains, googleRedirectURI, parseDomains } from "$lib/orca/google-signin";
  import { term } from "$lib/orca/glossary";
  import { t } from "$lib/orca/locale.svelte";
  import { OrcaService, displayDate, orcaError, type OrcaBootstrap, type OrcaGoogleSignIn } from "$lib/services/orca";
  import { backendOrigin, googleClientIDFormat, googleClientSaved, googleRedirectTargets } from "$lib/services/orca-u2";
  import PlatformBadge from "./platform/PlatformBadge.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import StatusPill from "./ui/StatusPill.svelte";
  import { copyText } from "./ui/copy";

  // แพลตฟอร์ม ORCA › เข้าสู่ระบบด้วย Google. One Google client serves every
  // company's sign-in page and invitation links; only the ORCA team changes it
  // (the server refuses anyone else). The client secret is write-only: the page
  // never receives it, it only says whether one is saved.
  let { data }: { data: OrcaBootstrap } = $props();
  let setting = $state<OrcaGoogleSignIn>();
  let clientID = $state("");
  let clientSecret = $state("");
  let domains = $state("");
  let enabled = $state(false);
  let changingSecret = $state(false);
  // A saved address from another origin (the workspace moved): the operator can adopt this page's.
  let useSuggested = $state(false);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let confirmOff = $state(false);
  let copied = $state("");
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const owner = $derived(data.platformOperator === true);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const suggested = $derived(googleRedirectURI(origin));
  // The saved address wins; a new setup starts from this workspace's address.
  const redirectURI = $derived(!useSuggested && setting?.redirectURI ? setting.redirectURI : suggested);
  const movedOrigin = $derived(!!setting?.redirectURI && setting.redirectURI !== suggested && !useSuggested);
  // Google must list both: the workspace's, and the backend's, where customers
  // sign in while connecting Claude or ChatGPT.
  const targets = $derived(googleRedirectTargets(redirectURI, backendOrigin(data.unifiedConnectURL, origin)));
  const clientSaved = $derived(googleClientSaved(setting));
  const clientFormat = $derived(googleClientIDFormat(clientID));
  const savedDomains = $derived(setting?.allowedDomains ?? []);

  function fill(next: OrcaGoogleSignIn) {
    setting = next;
    clientID = next.clientID;
    domains = next.allowedDomains.join(", ");
    enabled = next.enabled;
    clientSecret = "";
    changingSecret = false;
    useSuggested = false;
  }
  async function load() {
    error = "";
    try {
      fill(await OrcaService.googleSignIn());
    } catch (cause) {
      error = orcaError(cause);
    }
  }
  onMount(() => void load());
  onDestroy(() => {
    clientSecret = "";
    if (copyTimer) clearTimeout(copyTimer);
  });

  function refusedDomains(joining: string[]): string {
    const gmail = consumerDomains(joining);
    return gmail.length
      ? t(
          `ใส่ ${gmail.join(", ")} ไม่ได้ เพราะใครก็สมัคร Gmail ได้ ให้เชิญคนที่ใช้ Gmail ทีละคนแทน แล้วเขาจะเข้าด้วย Google ได้`,
          `${gmail.join(", ")} can't be added, because anyone can make a Gmail account. Invite Gmail users one by one instead; they can then sign in with Google.`,
        )
      : "";
  }

  /**
   * "all" saves the Google Cloud card as typed; "domains" saves only the joining
   * domains, beside what is already saved, so an unsaved client edit stays a draft.
   */
  async function save(scope: "all" | "domains" = "all") {
    if (busy || !owner || !setting) return;
    error = notice = "";
    const joining = parseDomains(domains);
    const refusal = refusedDomains(joining);
    if (refusal) {
      error = refusal;
      return;
    }
    busy = true;
    try {
      const secret = scope === "all" ? clientSecret.trim() : "";
      const saved = await OrcaService.saveGoogleSignIn({
        clientID: scope === "all" ? clientID.trim() : setting.clientID,
        ...(secret ? { clientSecret: secret } : {}),
        allowedDomains: joining,
        redirectURI,
        enabled,
        version: setting.version,
      });
      if (scope === "all") fill(saved);
      else {
        setting = saved;
        domains = saved.allowedDomains.join(", ");
        enabled = saved.enabled;
      }
      notice = scope === "domains"
        ? t("บันทึกโดเมนแล้ว", "Domains saved.")
        : saved.enabled
          ? t("บันทึกแล้ว สมาชิกเข้าสู่ระบบด้วย Google ได้แล้ว", "Saved. Members can now sign in with Google.")
          : t("บันทึกแล้ว การเข้าสู่ระบบด้วย Google ยังปิดอยู่", "Saved. Google sign-in is still off.");
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      busy = false;
      clientSecret = "";
    }
  }

  /** The switch saves at once, with what is already saved; switching off asks first. */
  async function toggle() {
    if (busy || !owner || !setting) return;
    if (enabled) {
      confirmOff = true;
      return;
    }
    if (!clientSaved) return;
    await saveSwitch(true);
  }
  async function saveSwitch(next: boolean) {
    if (busy || !owner || !setting) return;
    error = notice = "";
    busy = true;
    try {
      const saved = await OrcaService.saveGoogleSignIn({
        clientID: setting.clientID,
        allowedDomains: setting.allowedDomains,
        redirectURI,
        enabled: next,
        version: setting.version,
      });
      setting = saved;
      enabled = saved.enabled;
      confirmOff = false;
      notice = saved.enabled
        ? t("เปิดแล้ว ลูกค้าทุกบริษัทเข้าสู่ระบบด้วย Google ได้", "On. Every company can sign in with Google.")
        : t("ปิดแล้ว ลูกค้าจะเข้าสู่ระบบด้วย Google ไม่ได้จนกว่าจะเปิดอีกครั้ง", "Off. Nobody can sign in with Google until it is turned on again.");
    } catch (cause) {
      error = orcaError(cause);
      confirmOff = false;
    } finally {
      busy = false;
    }
  }

  async function copyURI(uri: string) {
    const ok = await copyText(uri, typeof navigator === "undefined" ? undefined : navigator.clipboard, typeof document === "undefined" ? undefined : document);
    if (!ok) {
      error = t("คัดลอกไม่สำเร็จ กรุณาเลือกที่อยู่แล้วคัดลอกเอง", "Copy failed. Select the address and copy it yourself.");
      return;
    }
    copied = uri;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = ""), 2000);
  }
</script>

<div class="google-page">
  <PageHeader title={term("googleSignIn", t)} subtitle={t("ลูกค้าทุกบริษัทเข้า ORCA และรับคำเชิญด้วยบัญชี Google ของตัวเอง ตั้งค่าครั้งเดียวที่นี่", "Every customer signs in and accepts invitations with their own Google account. Set it up once here.")}>
    {#snippet eyebrow()}<PlatformBadge />{/snippet}
  </PageHeader>

  {#if error}<div class="google-callout deny" role="alert"><Info size={17} aria-hidden="true" /><span>{error}</span>{#if !setting}<button type="button" class="k-link-button" onclick={load}>{t("ลองอีกครั้ง", "Try again")}</button>{/if}</div>{/if}
  {#if notice}<p class="google-callout ok" role="status"><Check size={17} aria-hidden="true" /><span>{notice}</span></p>{/if}

  {#if !setting && !error}
    <p class="google-loading" role="status"><LoaderCircle size={18} class="k-spin" aria-hidden="true" />{t("กำลังโหลด…", "Loading…")}</p>
  {:else if setting}
    <section class="google-card google-status" aria-labelledby="google-status-title">
      <div class="google-status-main">
        <span class="google-logo provider-logo" aria-hidden="true"><img src="/orca/tools/google.svg" alt="" width="28" height="28" /></span>
        <div class="google-status-copy">
          <h2 id="google-status-title">{t("ปุ่มเข้าสู่ระบบด้วย Google", "The Sign in with Google button")}</h2>
          <p>
            {#if enabled}<b class="ok">{t("ทุกบริษัทใช้ได้ตอนนี้", "Every company can use it now")}</b> · {t("ตั้งค่า Google Cloud ครบแล้ว", "Google Cloud is set up")}
            {:else if clientSaved}<b class="warn">{t("ปิดอยู่", "Off")}</b> · {t("ลูกค้าเข้าสู่ระบบด้วย Google ไม่ได้", "Customers can't sign in with Google")}
            {:else}<b>{t("ยังเปิดไม่ได้", "Can't be turned on yet")}</b> · {t("ตั้งค่า Google Cloud ด้านล่างให้ครบก่อน", "Finish the Google Cloud setup below first")}{/if}
          </p>
        </div>
        <button
          type="button"
          class="google-switch"
          class:on={enabled}
          role="switch"
          aria-checked={enabled}
          aria-labelledby="google-status-title"
          disabled={busy || !owner || (!enabled && !clientSaved)}
          title={!enabled && !clientSaved ? t("บันทึก Client ID และ Client secret ก่อน", "Save the client ID and secret first") : undefined}
          onclick={toggle}
        >
          <span class="google-switch-label">{enabled ? t("เปิดอยู่", "On") : t("ปิดอยู่", "Off")}</span>
          <span class="google-switch-track" aria-hidden="true"><span class="google-switch-thumb"></span></span>
        </button>
      </div>
      <p class="google-impact">
        <TriangleAlert size={17} aria-hidden="true" />
        <span>{t("ปุ่มนี้อยู่บนหน้าเข้าสู่ระบบและลิงก์เชิญของทุกบริษัท ถ้าปิด ลูกค้าจะเข้าสู่ระบบและรับคำเชิญไม่ได้", "This button is on every company's sign-in page and invitation links. When it's off, customers can't sign in or accept invitations.")}</span>
      </p>
    </section>

    <form class="google-card google-setup" aria-labelledby="google-setup-title" onsubmit={(event) => { event.preventDefault(); void save(); }}>
      <div class="google-setup-head">
        <div>
          <h2 id="google-setup-title">{t("ตั้งค่า Google Cloud", "Google Cloud setup")}<StatusPill label={clientSaved ? t("ครบแล้ว", "Complete") : t("ยังไม่ครบ", "Incomplete")} tone={clientSaved ? "ok" : "warn"} /></h2>
          <p>{t("สร้าง OAuth client ID แบบ Web application ใน Google Cloud แล้วทำตาม 3 ขั้นด้านล่าง", "Create a Web application OAuth client ID in Google Cloud, then follow the 3 steps below.")}</p>
        </div>
        <a class="k-button small" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">{t("เปิด Google Cloud", "Open Google Cloud")}<ExternalLink size={14} aria-hidden="true" /></a>
      </div>

      <fieldset disabled={busy || !owner}>
        <ol class="google-steps">
          <li class="google-step">
            <span class="google-step-number" aria-hidden="true">1</span>
            <div class="google-step-body">
              <h3>{targets.length > 1 ? t("เพิ่ม Redirect URI ทั้ง 2 อันใน Google Cloud", "Add both redirect URIs in Google Cloud") : t("เพิ่ม Redirect URI ใน Google Cloud", "Add the redirect URI in Google Cloud")}</h3>
              <p class="google-step-detail">{t("ใน client ที่สร้างไว้ กด", "In the client, choose")} <span class="google-ui">ADD URI</span> {t("ใต้", "under")} <span class="google-ui">Authorized redirect URIs</span> {targets.length > 1 ? t("แล้ววางทีละอัน", "and paste them one at a time") : t("แล้ววางที่อยู่นี้", "and paste this address")}</p>
              <ul class="google-uris" aria-label={t("Redirect URI ที่ต้องเพิ่ม", "Redirect URIs to add")}>
                {#each targets as target (target.uri)}
                  <li class="google-uri">
                    <Link2 size={16} class="google-uri-icon" aria-hidden="true" />
                    <code class="google-uri-value">{target.uri}</code>
                    <button type="button" class="k-button small google-copy" onclick={() => copyURI(target.uri)} aria-label={t(`คัดลอก ${target.uri}`, `Copy ${target.uri}`)}>
                      {#if copied === target.uri}<Check size={14} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={14} aria-hidden="true" />{t("คัดลอก", "Copy")}{/if}
                    </button>
                  </li>
                {/each}
              </ul>
              {#if targets.length > 1}<p class="google-note"><Info size={15} aria-hidden="true" />{t("อันที่สองใช้ตอนลูกค้าเชื่อม Claude หรือ ChatGPT", "The second is used when customers connect Claude or ChatGPT.")}</p>{/if}
              {#if movedOrigin}
                <div class="google-callout warn google-moved" role="status">
                  <TriangleAlert size={17} aria-hidden="true" />
                  <span>{t(`ที่อยู่ที่บันทึกไว้ต่างจากที่อยู่ของหน้านี้ (${suggested}) ถ้าย้ายโดเมนแล้ว ให้ใช้ที่อยู่ใหม่แล้วกดบันทึก`, `The saved address differs from this page's (${suggested}). If the workspace moved, use the new address and save.`)}</span>
                  {#if owner}<button type="button" class="k-link-button" onclick={() => (useSuggested = true)}>{t("ใช้ที่อยู่ของหน้านี้", "Use this page's address")}</button>{/if}
                </div>
              {/if}
            </div>
          </li>

          <li class="google-step">
            <span class="google-step-number" aria-hidden="true">2</span>
            <div class="google-step-body">
              <h3><label for="google-client-id">{t("วาง Client ID", "Paste the client ID")}</label></h3>
              <p class="google-step-detail" id="google-client-id-help">{t("คัดลอกจากหน้า client ใน Google Cloud ลงท้ายด้วย .apps.googleusercontent.com", "Copy it from the client's page in Google Cloud. It ends in .apps.googleusercontent.com")}</p>
              <div class="google-input" class:unusual={clientFormat === "unusual"}>
                <input id="google-client-id" bind:value={clientID} autocomplete="off" spellcheck="false" placeholder="000000000000-xxxx.apps.googleusercontent.com" aria-describedby="google-client-id-help" />
                {#if clientFormat === "ok"}<span class="google-format ok"><Check size={14} strokeWidth={2.6} aria-hidden="true" />{t("รูปแบบถูกต้อง", "Looks right")}</span>
                {:else if clientFormat === "unusual"}<span class="google-format warn">{t("ตรวจรูปแบบอีกครั้ง", "Check the format")}</span>{/if}
              </div>
            </div>
          </li>

          <li class="google-step">
            <span class="google-step-number" aria-hidden="true">3</span>
            <div class="google-step-body">
              <h3>{#if setting.secretConfigured && !changingSecret}{t("วาง Client secret", "Paste the client secret")}{:else}<label for="google-client-secret">{t("วาง Client secret", "Paste the client secret")}</label>{/if}</h3>
              <p class="google-step-detail">{t("ORCA เก็บเป็นความลับและไม่แสดงค่าอีก ถ้าหายให้สร้างใหม่ใน Google Cloud แล้วกด", "ORCA keeps it secret and never shows it again. If it's lost, make a new one in Google Cloud and choose")} <span class="google-ui">{t("เปลี่ยน", "Change")}</span></p>
              {#if setting.secretConfigured && !changingSecret}
                <span class="google-secret-chip"><Lock size={15} aria-hidden="true" />{t("บันทึกแล้ว", "Saved")}<span class="google-dot" aria-hidden="true">·</span><button type="button" class="google-chip-link" onclick={() => (changingSecret = true)} aria-label={t("เปลี่ยน Client secret", "Change the client secret")}>{t("เปลี่ยน", "Change")}</button></span>
              {:else}
                <div class="google-secret-row">
                  <div class="google-input"><input id="google-client-secret" type="password" bind:value={clientSecret} autocomplete="new-password" spellcheck="false" /></div>
                  {#if setting.secretConfigured}<button type="button" class="k-button quiet small" onclick={() => { changingSecret = false; clientSecret = ""; }}>{t("ใช้ค่าเดิม", "Keep the saved one")}</button>{/if}
                </div>
              {/if}
            </div>
          </li>
        </ol>
      </fieldset>

      <footer class="google-setup-foot">
        <span class="google-meta">
          {#if !owner}{t("ใช้กับทุกบริษัทบน ORCA เปลี่ยนได้เฉพาะทีม ORCA", "Applies to every company on ORCA. Only the ORCA team can change it.")}
          {:else if setting.updatedAt}{t(`แก้ไขล่าสุด ${displayDate(setting.updatedAt)} โดยทีม ORCA`, `Last changed ${displayDate(setting.updatedAt)} by the ORCA team`)}{/if}
        </span>
        {#if owner}<button type="submit" class="k-button primary" disabled={busy}>{#if busy}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{t("บันทึกการตั้งค่า", "Save settings")}</button>{/if}
      </footer>
    </form>

    <details class="google-card google-advanced">
      <summary>
        <span class="google-advanced-icon" aria-hidden="true"><Users size={18} /></span>
        <span class="google-advanced-copy">
          <b>{t("ขั้นสูง: ให้คนในโดเมนเข้าร่วมบริษัทหลักอัตโนมัติ", "Advanced: let a domain join the main company automatically")}</b>
          <span>{t("คนที่อีเมลอยู่ในโดเมนที่ตั้งไว้จะเข้าบริษัทหลักของ ORCA ไม่ใช่บริษัทลูกค้า", "People with an email in these domains join ORCA's main company, not a customer's.")}</span>
        </span>
        <StatusPill label={savedDomains.length ? t(`${savedDomains.length} โดเมน`, `${savedDomains.length} domain${savedDomains.length === 1 ? "" : "s"}`) : t("ยังไม่ได้ตั้ง", "Not set")} tone={savedDomains.length ? "ok" : "neutral"} />
        <ChevronDown size={18} class="google-advanced-chevron" aria-hidden="true" />
      </summary>
      <form class="google-advanced-body" onsubmit={(event) => { event.preventDefault(); void save("domains"); }}>
        <fieldset disabled={busy || !owner}>
          <label for="google-domains">{t("โดเมนที่เข้าร่วมบริษัทหลักได้เอง (ไม่บังคับ)", "Domains that join the main company by themselves (optional)")}</label>
          <div class="google-input"><input id="google-domains" bind:value={domains} autocomplete="off" spellcheck="false" placeholder="example.co.th" aria-describedby="google-domains-help" /></div>
          <p class="google-help" id="google-domains-help">{t("คนที่มีบัญชี Google Workspace ของโดเมนเหล่านี้ เข้าบริษัทหลักของ ORCA (บริษัทของทีม ORCA) เป็นพนักงานได้เองโดยไม่ต้องเชิญ ลูกค้าไม่ได้เข้าบริษัทของตัวเองด้วยวิธีนี้ ต้องใช้ลิงก์เชิญเสมอ คั่นหลายโดเมนด้วยจุลภาค ใส่ gmail.com ไม่ได้", "People with a Google Workspace account in these domains join ORCA's main company (the ORCA team's) as employees, without an invitation. Customers never join their own company this way; they always need an invitation link. Separate several with commas. gmail.com can't be added.")}</p>
          {#if owner}<div class="google-advanced-actions"><button type="submit" class="k-button" disabled={busy}>{t("บันทึกโดเมน", "Save domains")}</button></div>{/if}
        </fieldset>
      </form>
    </details>
  {/if}
</div>

<ConfirmDialog
  bind:open={confirmOff}
  title={t("ปิดการเข้าสู่ระบบด้วย Google ไหม", "Turn off Sign in with Google?")}
  message={t("ลูกค้าทุกบริษัทจะเข้าสู่ระบบและรับคำเชิญไม่ได้ จนกว่าจะเปิดอีกครั้ง", "No customer can sign in or accept an invitation until it is turned on again.")}
  confirmLabel={t("ปิดการเข้าสู่ระบบ", "Turn it off")}
  tone="danger"
  icon={TriangleAlert}
  {busy}
  onconfirm={() => saveSwitch(false)}
/>

<style>
  .google-page { max-width: 880px; }
  .google-card { margin-bottom: 16px; overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent); }
  .google-card h2 { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 3px; font-size: 18px; font-weight: 650; line-height: 1.35; letter-spacing: -0.005em; }
  .google-loading { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--orca-muted); font-size: 14px; }

  /* Status card */
  .google-status { margin-bottom: 32px; }
  .google-status-main { display: flex; align-items: center; gap: 18px; padding: 24px 24px 22px; }
  .google-logo { display: grid; flex: none; place-items: center; width: 52px; height: 52px; border: 1px solid var(--orca-line); border-radius: 14px; background: var(--orca-logo-tile); }
  .google-status-copy { flex: 1; min-width: 0; }
  .google-status-copy p { margin: 0; color: var(--orca-muted); font-size: 14px; }
  .google-status-copy b { color: var(--orca-ink); font-weight: 600; }
  .google-status-copy b.ok { color: var(--orca-ok); }
  .google-status-copy b.warn { color: var(--orca-warn); }
  .google-switch { display: inline-flex; flex: none; align-items: center; gap: 14px; padding: 4px 4px 4px 8px; border: 0; border-radius: 999px; background: transparent; color: var(--orca-muted); font: inherit; cursor: pointer; }
  .google-switch:disabled { cursor: not-allowed; opacity: 0.55; }
  .google-switch-label { font-size: 16px; font-weight: 650; }
  .google-switch.on .google-switch-label { color: var(--orca-ok); }
  /* Off: an outlined track with a muted thumb, readable on light and dark; on: the mockup's green. */
  .google-switch-track { position: relative; flex: none; box-sizing: border-box; width: 64px; height: 36px; border: 2px solid var(--orca-line-hover, var(--orca-line-strong)); border-radius: 999px; background: var(--orca-surface-2); transition: background-color 0.15s var(--orca-ease), border-color 0.15s var(--orca-ease); }
  .google-switch.on .google-switch-track { border-color: var(--orca-ok); background: var(--orca-ok); }
  .google-switch-thumb { position: absolute; top: 6px; left: 6px; width: 20px; height: 20px; border-radius: 50%; background: var(--orca-muted); transition: transform 0.15s var(--orca-ease), width 0.15s var(--orca-ease), height 0.15s var(--orca-ease); }
  .google-switch.on .google-switch-thumb { top: 2px; left: 2px; width: 28px; height: 28px; transform: translateX(28px); background: var(--orca-on-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); }
  .google-impact { display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 13px 24px 14px; border-top: 1px solid var(--orca-line-soft); background: var(--orca-surface-2); color: var(--orca-text-2); font-size: 14px; line-height: 1.6; }
  .google-impact :global(svg) { flex: none; margin-top: 2px; color: var(--orca-warn); }

  /* Google Cloud card */
  .google-setup-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 20px; padding: 22px 24px 4px; }
  .google-setup-head p { margin: 0; color: var(--orca-muted); font-size: 14px; }
  .google-setup-head .k-button { flex: none; gap: 6px; white-space: nowrap; text-decoration: none; }
  .google-setup fieldset, .google-advanced fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .google-steps { margin: 0; padding: 22px 24px 6px; list-style: none; }
  .google-step { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr); column-gap: 18px; padding-bottom: 30px; }
  .google-step::before { content: ""; position: absolute; top: 38px; bottom: 8px; left: 14px; width: 2px; border-radius: 2px; background: var(--orca-line); }
  .google-step:last-child { padding-bottom: 22px; }
  .google-step:last-child::before { display: none; }
  .google-step-number { display: grid; place-items: center; width: 30px; height: 30px; border: 1.5px solid var(--orca-ink); border-radius: 50%; background: var(--orca-surface); color: var(--orca-ink); font-size: 13px; font-weight: 700; }
  .google-step h3 { margin: 3px 0 2px; font-size: 15.5px; font-weight: 650; line-height: 1.45; }
  .google-step h3 label { cursor: pointer; }
  .google-step-detail { margin: 0 0 12px; color: var(--orca-muted); font-size: 14px; line-height: 1.6; }
  .google-ui { color: var(--orca-text-2); font-weight: 600; }
  .google-uris { margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); list-style: none; }
  .google-uri { display: flex; align-items: center; gap: 12px; padding: 9px 9px 9px 14px; }
  .google-uri + .google-uri { border-top: 1px solid var(--orca-line-soft); }
  .google-uri :global(.google-uri-icon) { flex: none; color: var(--orca-subtle); }
  .google-uri-value { flex: 1; min-width: 0; overflow: hidden; color: var(--orca-ink); font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; user-select: all; }
  .google-copy { flex: none; gap: 6px; font-weight: 600; }
  .google-note { display: flex; align-items: center; gap: 7px; margin: 9px 0 0; color: var(--orca-muted); font-size: 13px; }
  .google-note :global(svg) { flex: none; }
  .google-input { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 12px 0 0; border: 1px solid var(--orca-field-line); border-radius: var(--orca-radius); background: var(--orca-field); }
  .google-input:focus-within { border-color: var(--orca-focus); box-shadow: 0 0 0 3px var(--orca-focus-halo); }
  .google-input.unusual { border-color: var(--orca-warn-line); }
  .google-input input { flex: 1; min-width: 0; height: 44px; padding: 0 0 0 14px; border: 0; outline: none; background: transparent; color: var(--orca-ink); font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 14px; }
  .google-input input:focus-visible { outline: none; }
  .google-format { display: inline-flex; flex: none; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .google-format.ok { color: var(--orca-ok); }
  .google-format.warn { color: var(--orca-warn); }
  .google-secret-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 11px; border: 1px solid var(--orca-ok-line); border-radius: 999px; background: var(--orca-ok-bg); color: var(--orca-ok); font-size: 14px; font-weight: 600; }
  .google-dot { color: var(--orca-ok); }
  .google-chip-link { padding: 0; border: 0; background: transparent; color: var(--orca-ink); font: inherit; font-weight: 600; text-decoration: underline; text-decoration-color: var(--orca-line-strong); text-underline-offset: 3px; cursor: pointer; }
  .google-secret-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .google-secret-row .google-input { flex: 1 1 280px; }
  .google-setup-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; padding: 14px 24px; border-top: 1px solid var(--orca-line); background: var(--orca-surface-2); }
  .google-meta { color: var(--orca-muted); font-size: 13px; }
  .google-setup-foot .k-button { min-height: 44px; padding: 0 18px; font-weight: 600; }

  /* Advanced */
  .google-advanced { box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent); }
  .google-advanced summary { display: flex; align-items: center; gap: 14px; padding: 16px 20px; list-style: none; cursor: pointer; }
  .google-advanced summary::-webkit-details-marker { display: none; }
  .google-advanced-icon { display: grid; flex: none; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--orca-secondary); color: var(--orca-text-2); }
  .google-advanced-copy { flex: 1; min-width: 0; }
  .google-advanced-copy b { display: block; font-size: 15px; font-weight: 600; }
  .google-advanced-copy span { color: var(--orca-muted); font-size: 13.5px; }
  .google-advanced summary :global(.google-advanced-chevron) { flex: none; color: var(--orca-muted); transition: transform 0.15s var(--orca-ease); }
  .google-advanced[open] summary :global(.google-advanced-chevron) { transform: rotate(180deg); }
  .google-advanced-body { padding: 4px 20px 20px 70px; }
  .google-advanced-body label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 600; }
  .google-advanced-body .google-input input { font-family: inherit; }
  .google-help { margin: 8px 0 0; color: var(--orca-muted); font-size: 13px; line-height: 1.6; }
  .google-advanced-actions { display: flex; justify-content: flex-end; margin-top: 14px; }

  /* Callouts */
  .google-callout { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 10px; margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); font-size: 14px; line-height: 1.6; }
  .google-callout > span { flex: 1 1 240px; min-width: 0; }
  .google-callout :global(svg) { flex: none; margin-top: 2px; }
  .google-callout.ok { border-color: var(--orca-ok-line); background: var(--orca-ok-bg); color: var(--orca-ok); }
  .google-callout.warn { border-color: var(--orca-warn-line); background: var(--orca-warn-bg); color: var(--orca-warn); }
  .google-callout.deny { border-color: var(--orca-deny-line); background: var(--orca-deny-bg); color: var(--orca-deny); }
  .google-moved { margin: 12px 0 0; font-size: 13px; overflow-wrap: anywhere; }

  @media (max-width: 720px) {
    .google-status-main { flex-wrap: wrap; gap: 14px; padding: 18px 16px; }
    .google-logo { width: 44px; height: 44px; }
    .google-status-copy { flex: 1 1 calc(100% - 64px); }
    .google-switch { margin-left: auto; }
    .google-impact { padding: 12px 16px; }
    .google-setup-head { flex-direction: column; padding: 18px 16px 4px; }
    .google-steps { padding: 18px 16px 4px; }
    .google-step { grid-template-columns: 28px minmax(0, 1fr); column-gap: 12px; }
    .google-step::before { left: 13px; }
    .google-step-number { width: 28px; height: 28px; }
    .google-uri { flex-wrap: wrap; padding: 10px 10px 10px 12px; }
    .google-uri-value { flex-basis: calc(100% - 30px); white-space: normal; overflow-wrap: anywhere; }
    .google-copy { margin-left: 28px; }
    .google-input { flex-wrap: wrap; }
    .google-input input { flex: 1 1 100%; }
    .google-format { padding: 0 0 10px 14px; }
    .google-setup-foot { padding: 14px 16px; }
    .google-setup-foot .k-button { width: 100%; justify-content: center; }
    .google-advanced summary { flex-wrap: wrap; padding: 14px 16px; }
    .google-advanced-copy { flex: 1 1 calc(100% - 50px); }
    .google-advanced summary :global(.orca-pill) { margin-left: 50px; }
    .google-advanced-body { padding: 4px 16px 18px; }
  }
</style>
