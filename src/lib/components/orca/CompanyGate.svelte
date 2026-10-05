<script lang="ts">
  import { page } from "$app/state";
  import Brand from "./Brand.svelte";
  import "./forms.css";
  import "./orca.css";
  import { companyHref, rememberCompany, type OrcaCompanyChoice } from "$lib/orca/company";
  import { term } from "$lib/orca/glossary";
  import { inviteRequestText } from "$lib/orca/home-setup";
  import { companyStatus, companyStatusNote, stoppedMessage } from "$lib/orca/platform-console";
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { ArrowRight, Building2, Check, Copy, UserRound } from "@lucide/svelte";
  import { onDestroy } from "svelte";
  import { copyFeedback, copyText } from "./ui/copy";

  // Shown instead of the workspace when this page has no company to open:
  // the person has several and must choose, has none yet, or asked for one
  // that isn't theirs. "stopped": the company is suspended or closed by ORCA
  // (platform console C6 §4.2), and its people see only the fixed message.
  let {
    mode,
    companies = [],
    account,
    stopped,
    current = "",
  }: {
    mode: "choose" | "none" | "denied" | "error" | "stopped";
    companies?: OrcaCompanyChoice[];
    account: string;
    stopped?: "suspended" | "closed";
    current?: string;
  } = $props();
  // On the stopped page, the person's other companies stay one click away.
  const listed = $derived(mode === "stopped" ? companies.filter((company) => company.id !== current) : companies);

  function roleLabel(role: string) {
    if (role === "owner") return term("companyOwner", t);
    if (role === "admin") return term("admin", t);
    return term("employee", t);
  }
  // No company at all: the owner asks for a trial, an employee for an invite link.
  const email = $derived((page?.data?.profile?.email as string | undefined) ?? "");
  const inviteRequest = $derived(inviteRequestText(email, t));
  let copied = $state(false);
  let copyFailed = $state(false);
  const feedback = copyFeedback((value) => (copied = value));
  onDestroy(() => feedback.dispose());
  async function copyRequest() {
    copyFailed = false;
    const ok = await copyText(inviteRequest, typeof navigator === "undefined" ? undefined : navigator.clipboard, typeof document === "undefined" ? undefined : document);
    if (ok) feedback.copied();
    else copyFailed = true;
  }
</script>

<svelte:head><title>{mode === "choose" ? t("เลือกบริษัท · ORCA", "Choose a company · ORCA") : "ORCA"}</title></svelte:head>
<div class="orca o-auth-page" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a href={localeHref("/")} aria-label={t("หน้าหลัก ORCA", "ORCA home")}><Brand /></a>
  </header>
  <main class="o-auth o-wrap">
    <section class="o-auth-story">
      <Brand dark />
      <h1>{t("พื้นที่ทำงาน AI ของบริษัทคุณ", "Your company's AI workspace")}</h1>
      <p>
        {t(
          "แต่ละบริษัทมีสมาชิก โปรแกรมที่เชื่อม และประวัติการใช้งานแยกกัน ทำงานได้ทีละบริษัท",
          "Each company has its own members, connected programs and history. You work in one company at a time.",
        )}
      </p>
    </section>
    <section class="o-auth-form company-gate" aria-live="polite">
      {#if mode === "choose"}
        <h2>{t("เลือกบริษัท", "Choose a company")}</h2>
        <p>
          {t(
            "บัญชีนี้อยู่ในหลายบริษัท เลือกบริษัทที่จะทำงานตอนนี้ เปลี่ยนได้ทุกเมื่อจากชื่อบริษัทด้านบน",
            "This account belongs to several companies. Choose one to work in now; switch any time from the company name at the top.",
          )}
        </p>
      {:else if mode === "denied"}
        <h2>{t("เปิดบริษัทนี้ไม่ได้", "You can't open this company")}</h2>
        <p>
          {t(
            "บัญชีนี้ไม่ได้อยู่ในบริษัทที่ลิงก์นี้พาไป หรือบริษัทนั้นไม่มีแล้ว",
            "This account isn't in the company this link opens, or that company no longer exists.",
          )}
          {#if companies.length > 0}{t("เปิดบริษัทของคุณแทน:", "Open one of your companies instead:")}{/if}
        </p>
      {:else if mode === "stopped"}
        <h2>{stoppedMessage(stopped ?? "suspended", t)}</h2>
        {#if listed.length > 0}<p>{t("เปิดบริษัทอื่นของคุณแทน:", "Open one of your other companies instead:")}</p>{/if}
      {:else if mode === "error"}
        <h2>{t("โหลดรายชื่อบริษัทไม่สำเร็จ", "Your companies could not be loaded")}</h2>
        <p>{t("ORCA ไม่ได้เลือกบริษัทให้แทน ลองอีกครั้ง", "ORCA won't pick a company for you instead. Try again.")}</p>
        <button class="o-button" onclick={() => window.location.reload()}>{t("ลองอีกครั้ง", "Try again")}</button>
      {:else}
        <h2>{t("บัญชีนี้ยังไม่อยู่ในบริษัทใด", "This account isn't in a company yet")}</h2>
        <p>{t("เลือกข้อที่ตรงกับคุณ", "Choose the one that fits you.")}</p>
      {/if}
      {#if mode === "error"}
        <!-- Nothing to choose from until the list loads. -->
      {:else if mode === "stopped" && listed.length === 0}
        <div class="company-gate-signout">
          {t("ใช้บัญชีผิด?", "Wrong account?")}
          <a href="/oauth2/sign_out?rd=/">{t("ออกจากระบบ", "Sign out")}</a>
        </div>
      {:else if companies.length === 0}
        <ul class="company-gate-paths">
          <li>
            <span class="company-gate-icon" aria-hidden="true"><Building2 size={18} strokeWidth={1.8} /></span>
            <div>
              <h3>{t("ฉันเป็นเจ้าของบริษัท", "I own the company")}</h3>
              <p>{t("ขอทดลองใช้ ORCA ทีม ORCA จะติดต่อกลับเพื่อเปิดบริษัทของคุณ", "Ask for a trial. The ORCA team gets back to you and opens your company.")}</p>
              <a class="o-button" href={localeHref("/home?to=start")}>{t("ขอทดลองใช้", "Request a trial")}<ArrowRight size={16} aria-hidden="true" /></a>
            </div>
          </li>
          <li>
            <span class="company-gate-icon" aria-hidden="true"><UserRound size={18} strokeWidth={1.8} /></span>
            <div>
              <h3>{t("ฉันเป็นพนักงาน", "I work for the company")}</h3>
              <p>{t("ขอลิงก์เชิญจากหัวหน้าหรือผู้ดูแลบริษัท แล้วเปิดลิงก์นั้นในเบราว์เซอร์นี้", "Ask your manager or company admin for an invite link, then open it in this browser.")}</p>
              <button type="button" class="o-button outline" onclick={copyRequest}>
                {#if copied}<Check size={16} aria-hidden="true" />{t("คัดลอกแล้ว", "Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("คัดลอกข้อความขอลิงก์เชิญ", "Copy an invite request")}{/if}
              </button>
              <span class="company-gate-announce" role="status">{copied ? t("คัดลอกแล้ว", "Copied") : ""}</span>
              {#if copyFailed}<p class="company-gate-failed" role="alert">{inviteRequest}</p>{/if}
            </div>
          </li>
        </ul>
        <div class="company-gate-signout">
          {t("ใช้บัญชีผิด?", "Wrong account?")}
          <a href="/oauth2/sign_out?rd=/">{t("ออกจากระบบ", "Sign out")}</a>
        </div>
      {:else}
        <ul class="company-gate-list">
          {#each listed as company (company.id)}
            <li>
              <!-- A new page: nothing from the last company carries over. -->
              <a
                href={localeHref(companyHref(company.id))}
                data-sveltekit-reload
                onclick={() => rememberCompany(account, company.id)}
              >
                <Building2 size={18} strokeWidth={1.7} aria-hidden="true" />
                <span
                  ><strong>{company.displayName}</strong><small
                    >{roleLabel(company.role)}{#if companyStatus(company.status) !== "active"}{" · "}<span class="company-gate-stopped">{companyStatusNote(companyStatus(company.status), t)}</span>{/if}</small
                  ></span
                >
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </main>
</div>

<style>
  .company-gate { align-self: center; }
  .company-gate-list { display: grid; gap: 10px; margin: 4px 0 0; padding: 0; list-style: none; }
  .company-gate-list a {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px;
    padding: 14px 16px; border: 1px solid var(--orca-line); border-radius: 12px;
    color: inherit; text-decoration: none; background: var(--orca-surface);
  }
  .company-gate-list a:hover, .company-gate-list a:focus-visible { border-color: var(--orca-ink); }
  .company-gate-list span { display: grid; gap: 2px; min-width: 0; }
  .company-gate-list strong { overflow-wrap: anywhere; }
  .company-gate-list small { color: var(--orca-muted); font-size: 13px; }
  .company-gate-list .company-gate-stopped { display: inline; color: var(--orca-deny); font-weight: 600; }
  a.o-button { text-decoration: none; }

  /* No company: two paths, as two cards. */
  .company-gate-paths { display: grid; gap: 12px; margin: 20px 0 0; padding: 0; list-style: none; }
  .company-gate-paths li {
    display: flex; gap: 14px; padding: 18px;
    border: 1px solid var(--orca-line-strong); border-radius: 12px; background: var(--orca-surface-2);
  }
  .company-gate-paths li > div { display: grid; flex: 1; gap: 6px; min-width: 0; }
  .company-gate-paths h3 { margin: 0; color: var(--orca-ink); font-size: 16px; font-weight: 700; line-height: 1.4; }
  .company-gate-paths p { margin: 0 0 6px; color: var(--orca-muted); font-size: 13.5px; line-height: 1.6; }
  .company-gate-paths .o-button { gap: 8px; }
  .company-gate-icon {
    display: grid; flex: none; place-items: center; width: 36px; height: 36px;
    border: 1px solid var(--orca-line); border-radius: 10px; background: var(--orca-surface); color: var(--orca-ink);
  }
  .company-gate-announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .company-gate-paths .company-gate-failed { margin: 4px 0 0; color: var(--orca-ink); font-size: 13px; user-select: all; overflow-wrap: anywhere; }
  .company-gate-signout { margin-top: 20px; color: var(--orca-muted); font-size: 13.5px; text-align: center; }
  .company-gate-signout a { color: var(--orca-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
</style>
