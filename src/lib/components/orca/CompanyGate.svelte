<script lang="ts">
  import Brand from "./Brand.svelte";
  import "./forms.css";
  import "./orca.css";
  import { companyHref, rememberCompany, type OrcaCompanyChoice } from "$lib/orca/company";
  import { localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { ArrowRight, Building2 } from "@lucide/svelte";

  // Shown instead of the workspace when this page has no company to open:
  // the person has several and must choose, has none yet, or asked for one
  // that isn't theirs.
  let {
    mode,
    companies = [],
    account,
  }: {
    mode: "choose" | "none" | "denied" | "error";
    companies?: OrcaCompanyChoice[];
    account: string;
  } = $props();

  function roleLabel(role: string) {
    if (role === "owner") return t("เจ้าของ", "Owner");
    if (role === "admin") return t("ผู้ดูแลระบบ", "Admin");
    return t("สมาชิก", "Member");
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
          "แต่ละบริษัทมีสมาชิก ระบบที่เชื่อม และประวัติการใช้งานแยกกัน ทำงานได้ทีละบริษัท",
          "Each company has its own members, connected systems and history. You work in one company at a time.",
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
      {:else if mode === "error"}
        <h2>{t("โหลดรายชื่อบริษัทไม่สำเร็จ", "Your companies could not be loaded")}</h2>
        <p>{t("ORCA ไม่ได้เลือกบริษัทให้แทน ลองอีกครั้ง", "ORCA won't pick a company for you instead. Please try again.")}</p>
        <button class="o-button" onclick={() => window.location.reload()}>{t("ลองอีกครั้ง", "Try again")}</button>
      {:else}
        <h2>{t("บัญชีนี้ยังไม่อยู่ในบริษัทใด", "This account isn't in a company yet")}</h2>
      {/if}
      {#if mode === "error"}
        <!-- Nothing to choose from until the list loads. -->
      {:else if companies.length === 0}
        <p>
          {t(
            "เปิดลิงก์คำเชิญที่ได้รับ หรือขอลิงก์ใหม่จากผู้ดูแลบริษัทของคุณ",
            "Open your invitation link, or ask your company's administrator for a new one.",
          )}
        </p>
        <a class="o-button outline" href="/oauth2/sign_out?rd=/">{t("ออกจากระบบ", "Sign out")}</a>
      {:else}
        <ul class="company-gate-list">
          {#each companies as company (company.id)}
            <li>
              <!-- A new page: nothing from the last company carries over. -->
              <a
                href={localeHref(companyHref(company.id))}
                data-sveltekit-reload
                onclick={() => rememberCompany(account, company.id)}
              >
                <Building2 size={18} strokeWidth={1.7} aria-hidden="true" />
                <span><strong>{company.displayName}</strong><small>{roleLabel(company.role)}</small></span>
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
    padding: 14px 16px; border: 1px solid var(--orca-line, #e5e7eb); border-radius: 12px;
    color: inherit; text-decoration: none; background: var(--orca-surface, #fff);
  }
  .company-gate-list a:hover, .company-gate-list a:focus-visible { border-color: var(--orca-ink, #111827); }
  .company-gate-list span { display: grid; gap: 2px; min-width: 0; }
  .company-gate-list strong { overflow-wrap: anywhere; }
  .company-gate-list small { color: var(--orca-muted, #5b6270); font-size: 13px; }
  a.o-button { text-decoration: none; }
</style>
