<script lang="ts">
  import { page } from "$app/state";
  import { LOCAL_AUTH_MIN_PASSWORD_LENGTH } from "$lib/constants";
  import Brand from "$lib/components/orca/Brand.svelte";
  import InAppBrowserNotice from "$lib/components/orca/InAppBrowserNotice.svelte";
  import PublicFooter from "$lib/components/orca/PublicFooter.svelte";
  import "$lib/components/orca/forms.css";
  import "$lib/components/orca/orca.css";
  import "$lib/components/orca/login.css";
  import {
    initializeLocale,
    localeHref,
    orcaLocale,
    t,
  } from "$lib/orca/locale.svelte";
  import type { PageProps } from "./$types";
  import { googleSignInReason, googleStartHref, type GoogleSignInReason } from "$lib/orca/google-signin";
  import { ArrowLeft, ArrowRight, BookOpen, Plug, ShieldCheck } from "@lucide/svelte";
  import { onMount } from "svelte";

  let { data }: PageProps = $props();
  let revealed = $state(false);
  const localProvider = $derived(
    data.authProviders.find(
      (provider) => provider.id === "local-auth-provider",
    ),
  );
  const externalProviders = $derived(
    data.authProviders.filter(
      (provider) => provider.id !== "local-auth-provider",
    ),
  );
  const errorParam = $derived(page.url.searchParams.get("error"));
  const googleReason = $derived(googleSignInReason(errorParam));
  const error = $derived(errorParam !== null && !googleReason);
  const googleHref = $derived(localProvider ? googleStartHref(page.url.origin, localeHref(data.rd), localProvider) : "");
  function googleMessage(reason: GoogleSignInReason) {
    return {
      off: t("ตอนนี้ยังเข้าสู่ระบบด้วย Google ไม่ได้ ใช้อีเมลและรหัสผ่านถ้ามี หรือแจ้งทีม ORCA", "Google sign-in isn't on right now. Use an email and password if you have one, or tell the ORCA team."),
      unreachable: t("ติดต่อ Google ไม่ได้ตอนนี้ ลองอีกครั้ง", "Google couldn't be reached. Try again."),
      expired: t("การเข้าสู่ระบบหมดเวลา หรือเริ่มจากหน้าต่างอื่น ลองอีกครั้ง", "The sign-in timed out or started in another window. Try again."),
      cancelled: t("ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว", "Google sign-in was cancelled."),
      unverified: t("อีเมลของบัญชี Google นี้ยังไม่ได้ยืนยัน", "This Google account's email is not verified."),
      domain: t("อีเมลโดเมนนี้ยังเข้าสู่ระบบ ORCA นี้ไม่ได้ ขอลิงก์เชิญจากผู้ดูแลบริษัท", "This email's domain can't sign in here yet. Ask your company admin for an invite link."),
      workspace: t("ใช้บัญชี Google Workspace ของบริษัท ไม่ใช่บัญชี Google ส่วนตัวที่สมัครด้วยอีเมลงาน", "Use your company's Google Workspace account, not a personal Google account made with a work email."),
      organization: t("บัญชี Google นี้เป็นของบริษัทอื่น", "This Google account belongs to another company."),
      member: t("บัญชี Google นี้ยังไม่ได้อยู่ในบริษัทไหน ขอลิงก์เชิญจากผู้ดูแลบริษัท หรือใช้บัญชี Google ของบริษัท", "This Google account isn't in a company yet. Ask your company admin for an invite link, or use your company Google account."),
      failed: t("เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองอีกครั้ง", "Google sign-in failed. Try again."),
    }[reason];
  }
  onMount(initializeLocale);
  // The public website lives on the backend's origin; /home (server/app.mjs) sends people there.
  function site(page = "") {
    return localeHref(page ? `/home?to=${page}` : "/home");
  }
  function signIn(namespace: string | undefined, id: string) {
    const destination = new URL("/oauth2/start", window.location.origin);
    destination.searchParams.set("rd", localeHref(data.rd));
    destination.searchParams.set(
      "obot-auth-provider",
      `${namespace ?? "default"}/${id}`,
    );
    window.location.assign(destination.pathname + destination.search);
  }
</script>

<svelte:head
  ><title>{t("เข้าสู่ระบบ · ORCA", "Sign in · ORCA")}</title></svelte:head
>
<div class="orca o-auth-page o-login" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a class="o-login-brand" href={site()} aria-label={t("หน้าเว็บ ORCA", "ORCA website")}
      ><Brand dark /></a
    >
    <a class="o-login-back" href={site()}
      ><ArrowLeft size={15} aria-hidden="true" />{t("กลับหน้าเว็บ ORCA", "Back to the ORCA website")}</a
    >
  </header>
  <main class="o-auth o-wrap">
    <section class="o-auth-story">
      <p class="o-login-eyebrow"><span aria-hidden="true"></span>ORCA Workspace</p>
      <h1>
        {t("พื้นที่ทำงาน AI", "The AI workspace")}<br />{t(
          "สำหรับบริษัทของคุณ",
          "for your company",
        )}
      </h1>
      <p>
        {t(
          "เชื่อมโปรแกรมที่บริษัทใช้ เก็บความรู้ของบริษัท และเลือกว่าใครใช้ AI ทำอะไรได้ ในที่เดียว",
          "Connect the programs your company uses, keep its knowledge, and choose who can do what with AI, in one place.",
        )}
      </p>
      <ul class="o-login-points">
        <li><span class="o-login-icon"><Plug size={16} aria-hidden="true" /></span>{t("เชื่อมโปรแกรมที่บริษัทใช้อยู่ เช่น FlowAccount, PEAK, LINE", "Connect the programs you already use, like FlowAccount, PEAK and LINE")}</li>
        <li><span class="o-login-icon"><BookOpen size={16} aria-hidden="true" /></span>{t("คลังความรู้ของบริษัท แยกตามแผนก", "Company knowledge, kept by department")}</li>
        <li><span class="o-login-icon"><ShieldCheck size={16} aria-hidden="true" /></span>{t("สิทธิ์รายคน อนุมัติก่อนแก้ข้อมูล และบันทึกทุกการใช้งาน", "Access per person, approval before changes, and a record of everything AI does")}</li>
      </ul>
    </section>
    <section class="o-auth-form">
      <h2>{t("เข้าสู่ระบบ ORCA", "Sign in to ORCA")}</h2>
      <p>
        {t(
          localProvider && data.google
            ? "เข้าสู่ระบบด้วยบัญชี Google ของบริษัท หรืออีเมลและรหัสผ่าน"
            : localProvider
              ? "กรอกอีเมลและรหัสผ่านของคุณเพื่อเข้าสู่ระบบ"
              : "เลือกวิธีเข้าสู่ระบบที่บริษัทของคุณใช้",
          localProvider && data.google
            ? "Sign in with your company Google account, or your email and password."
            : localProvider
              ? "Enter your email and password to sign in."
              : "Choose the sign-in your company uses.",
        )}
      </p>
      <!-- Inside LINE or Facebook, Google refuses to sign in: open the page in a real browser first. -->
      <InAppBrowserNotice />
      {#if data.unavailable}<div class="o-alert" role="alert">
          {t(
            "โหลดวิธีเข้าสู่ระบบไม่สำเร็จ โหลดหน้านี้อีกครั้ง",
            "Sign-in methods could not be loaded. Reload this page.",
          )}
        </div>{/if}
      {#if googleReason}<div class="o-alert" role="alert">{googleMessage(googleReason)}</div>{/if}
      {#if data.signedIn}
        <p>
          {t("คุณยังเข้าสู่ระบบด้วยบัญชีเดิมอยู่", "You are still signed in with your current account.")}
          <a class="o-link" href={localeHref(data.rd)}>{t("กลับไปหน้าเดิม", "Go back")}</a>
        </p>
      {/if}
      {#if localProvider && data.google}
        <a class="o-button outline o-google" href={googleHref}
          ><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"
            ><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg
          >{t("เข้าสู่ระบบด้วย Google", "Sign in with Google")}</a
        >
        <p class="o-auth-divider"><span>{t("หรือใช้อีเมลและรหัสผ่าน", "or use your email and password")}</span></p>
      {/if}
      {#if localProvider}
        <form method="POST" action="/oauth2/start">
          {#if error}<div class="o-alert" role="alert">
              {t(
                "เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน แล้วลองอีกครั้ง",
                "Sign-in failed. Check your email and password, then try again.",
              )}
            </div>{/if}
          <input type="hidden" name="rd" value={localeHref(data.rd)} />
          <label class="o-field" for="local-auth-email"
            >{t("อีเมล", "Email")}<input
              id="local-auth-email"
              type="email"
              name="email"
              autocomplete="username"
              required
            /></label
          >
          <div class="o-field">
            <div class="o-password-label">
              <label for="local-auth-password"
                >{t("รหัสผ่าน", "Password")}</label
              ><button
                type="button"
                aria-pressed={revealed}
                onclick={() => (revealed = !revealed)}
                >{revealed
                  ? t("ซ่อนรหัสผ่าน", "Hide password")
                  : t("แสดงรหัสผ่าน", "Show password")}</button
              >
            </div>
            <input
              id="local-auth-password"
              type={revealed ? "text" : "password"}
              name="password"
              autocomplete="current-password"
              minlength={LOCAL_AUTH_MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          <button class="o-button" type="submit"
            >{t("เข้าสู่ระบบ", "Sign in")} <ArrowRight size={16} /></button
          >
        </form>
      {/if}
      {#if externalProviders.length > 0}
        {#if localProvider}<p class="o-auth-bottom">
            {t(
              "หรือเข้าสู่ระบบด้วยวิธีอื่น",
              "Or sign in another way",
            )}
          </p>{/if}
        <div class="o-auth-provider">
          {#each externalProviders as provider (provider.id)}
            <button
              class="o-button"
              class:outline={Boolean(localProvider)}
              onclick={() => signIn(provider.namespace, provider.id)}
            >
              {t("เข้าสู่ระบบด้วย", "Sign in with")}
              {provider.name}<ArrowRight size={16} />
            </button>
          {/each}
        </div>
      {/if}
      {#if !data.unavailable && data.authProviders.length === 0}
        <p class="o-alert">
          {t(
            "ยังไม่มีวิธีเข้าสู่ระบบที่เปิดไว้ แจ้งทีม ORCA",
            "No sign-in method is set up yet. Tell the ORCA team.",
          )}
        </p>
      {/if}
      <p class="o-login-new">
        {t("บริษัทยังไม่มี ORCA?", "Company not on ORCA yet?")}
        <a href={site("start")}>{t("คุยกับทีม ORCA", "Talk to the ORCA team")}<ArrowRight size={14} aria-hidden="true" /></a>
      </p>
    </section>
  </main>
  <PublicFooter />
</div>
