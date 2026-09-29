<script lang="ts">
  import Brand from "$lib/components/orca/Brand.svelte";
  import InAppBrowserNotice from "$lib/components/orca/InAppBrowserNotice.svelte";
  import PublicFooter from "$lib/components/orca/PublicFooter.svelte";
  import "$lib/components/orca/forms.css";
  import "$lib/components/orca/orca.css";
  import { parseErrorContent } from "$lib/errors";
  import { initializeLocale, localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import { googleStartHref } from "$lib/orca/google-signin";
  import { invitationReturnPath } from "$lib/orca/company";
  import { OrcaService, displayDate, orcaError, type OrcaInvitationPreview, type OrcaInvitationTarget } from "$lib/services/orca";
  import { ArrowRight, Check, LoaderCircle } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  let preview = $state<OrcaInvitationPreview>();
  let phase = $state<"loading" | "ready" | "invalid" | "failed" | "joined">("loading");
  let error = $state("");
  let wrongAccount = $state(false);
  // The account is the invited email, but nothing has proven the person owns
  // it yet; signing in with Google does, then brings them back here.
  let needsGoogle = $state(false);
  let busy = $state(false);
  const returnPath = $derived(`/invite/${encodeURIComponent(data.token)}`);
  const signInHref = $derived(localeHref(`/login?rd=${encodeURIComponent(returnPath)}`));
  const signOutHref = $derived(`/oauth2/sign_out?rd=${encodeURIComponent(returnPath)}`);
  const googleHref = $derived(googleStartHref(window.location.origin, localeHref(returnPath), { id: "local-auth-provider" }));
  const roleLabel = $derived(preview?.role === "admin" ? t("ผู้ดูแลระบบ", "an admin") : t("สมาชิก", "a member"));
  const organizationName = $derived(preview?.organization ?? "ORCA");
  const joinedText = $derived(
    preview?.role === "owner"
      ? t(`ตอนนี้คุณเป็นเจ้าของ ${organizationName} แล้ว`, `You are now the owner of ${organizationName}.`)
      : t(`ตอนนี้คุณเป็น${roleLabel}ของ ${organizationName} แล้ว`, `You are now ${roleLabel} of ${organizationName}.`),
  );
  // Where the server says the accepted invitation leads: its company's page.
  let target = $state<OrcaInvitationTarget>();
  function openHref(to?: OrcaInvitationTarget) {
    return localeHref(invitationReturnPath(to));
  }

  onMount(async () => {
    initializeLocale();
    try {
      preview = await OrcaService.previewInvitation(data.token);
      phase = "ready";
    } catch (cause) {
      phase = parseErrorContent(cause).status === 404 ? "invalid" : "failed";
      error = orcaError(cause);
    }
  });

  async function accept() {
    if (busy) return;
    busy = true;
    error = "";
    wrongAccount = false;
    needsGoogle = false;
    try {
      target = (await OrcaService.acceptInvitation(data.token)).target;
      phase = "joined";
    } catch (cause) {
      const status = parseErrorContent(cause).status;
      if (status === 428) {
        needsGoogle = true;
        error = t(
          `ยืนยันอีเมลก่อนรับคำเชิญ: เลือก “เข้าสู่ระบบด้วย Google” ด้วยบัญชี Google ของ ${preview?.email ?? "อีเมลที่ได้รับเชิญ"} แล้ว ORCA จะพากลับมาหน้านี้ให้กดรับคำเชิญอีกครั้ง`,
          `Confirm your email first: choose “Sign in with Google” with the Google account for ${preview?.email ?? "the invited email"}. ORCA brings you back here to accept.`,
        );
      } else if (status === 403) {
        wrongAccount = true;
        error = t(
          `คำเชิญนี้ส่งถึง ${preview?.email ?? ""} แต่ตอนนี้คุณเข้าสู่ระบบด้วย ${data.email || "บัญชีอื่น"} กรุณาออกจากระบบ แล้วเข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ`,
          `This invitation is for ${preview?.email ?? ""}, but you are signed in as ${data.email || "another account"}. Sign out, then sign in with the invited email.`,
        );
      } else if (status === 409 && parseErrorContent(cause).message.includes("already has an owner")) {
        // An owner invitation hands over a company only while nobody owns it.
        error = t("บริษัทนี้มีเจ้าของแล้ว ขอให้เจ้าของบริษัทเชิญคุณเข้าร่วมแทน", "This company already has an owner. Ask them to invite you.");
      } else if (status === 409) {
        error = t("คำเชิญนี้ถูกใช้ ยกเลิก หรือหมดอายุไปแล้ว ขอลิงก์ใหม่จากผู้ดูแลที่เชิญคุณ", "This invitation was already used, revoked or has expired. Ask the person who invited you for a new link.");
      } else {
        error = orcaError(cause);
      }
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t("คำเชิญเข้าร่วม ORCA", "Invitation to ORCA")}</title><meta name="robots" content="noindex" /></svelte:head>
<div class="orca o-auth-page" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a href={localeHref("/")} aria-label={t("หน้าหลัก ORCA", "ORCA home")}><Brand /></a>
  </header>
  <main class="o-auth o-wrap">
    <section class="o-auth-story">
      <Brand dark />
      <h1>
        {#if preview}{t("คุณได้รับเชิญเข้าร่วม", "You're invited to join")}<br />{preview.organization}{:else}{t("คำเชิญเข้าร่วม", "An invitation to")}<br />ORCA{/if}
      </h1>
      <p>
        {t(
          "ORCA คือพื้นที่ทำงาน AI ขององค์กร ให้ทีมใช้ AI กับระบบและข้อมูลของบริษัทตามสิทธิ์ที่ผู้ดูแลกำหนด",
          "ORCA is your organization's AI workspace: your team uses AI with company systems and data, within the access managers set.",
        )}
      </p>
    </section>
    <section class="o-auth-form invite-panel" aria-live="polite">
      <!-- Invitations are often shared in LINE, where Google refuses to sign in. -->
      {#if phase !== "joined"}<InAppBrowserNotice />{/if}
      {#if phase === "loading"}
        <p class="invite-loading"><LoaderCircle size={20} class="k-spin" aria-hidden="true" />{t("กำลังตรวจสอบลิงก์เชิญ…", "Checking the invitation link…")}</p>
      {:else if phase === "invalid"}
        <h2>{t("ลิงก์เชิญนี้ใช้ไม่ได้", "This invitation link does not work")}</h2>
        <p>{t("ลิงก์อาจคัดลอกมาไม่ครบ หรือถูกแทนที่ด้วยลิงก์ใหม่แล้ว ขอลิงก์ใหม่จากผู้ดูแลที่เชิญคุณ", "The link may be incomplete, or a newer link replaced it. Ask the person who invited you for a new one.")}</p>
      {:else if phase === "failed"}
        <h2>{t("ตรวจสอบลิงก์เชิญไม่สำเร็จ", "The invitation could not be checked")}</h2>
        <div class="o-alert" role="alert">{error}</div>
        <button class="o-button" onclick={() => location.reload()}>{t("ลองอีกครั้ง", "Try again")}</button>
      {:else if phase === "joined"}
        <span class="invite-done" aria-hidden="true"><Check size={22} /></span>
        <h2>{t("เข้าร่วมเรียบร้อยแล้ว", "You're in")}</h2>
        <p>{joinedText}</p>
        <a class="o-button" href={openHref(target)} data-sveltekit-reload>{t("เปิด ORCA", "Open ORCA")} <ArrowRight size={16} /></a>
      {:else if preview && preview.status !== "pending"}
        <h2>
          {preview.status === "accepted"
            ? t("คำเชิญนี้ถูกใช้แล้ว", "This invitation was already used")
            : preview.status === "revoked"
              ? t("ผู้ดูแลยกเลิกคำเชิญนี้แล้ว", "This invitation was revoked")
              : t("คำเชิญนี้หมดอายุแล้ว", "This invitation has expired")}
        </h2>
        <p>
          {preview.status === "accepted"
            ? t("ถ้าคุณเป็นคนที่รับคำเชิญ เข้าสู่ระบบได้เลย", "If you accepted it, sign in to continue.")
            : t("ขอลิงก์ใหม่จากผู้ดูแลที่เชิญคุณ", "Ask the person who invited you for a new link.")}
        </p>
        <!-- Signing in comes back here, where the server shows the acceptor where it leads. -->
        {#if preview.status === "accepted"}<a class="o-button" href={data.signedIn ? openHref(preview.target) : signInHref} data-sveltekit-reload>{data.signedIn ? t("เปิด ORCA", "Open ORCA") : t("เข้าสู่ระบบ", "Sign in")} <ArrowRight size={16} /></a>{/if}
      {:else if preview}
        <h2>{t(`เข้าร่วม ${preview.organization}`, `Join ${preview.organization}`)}</h2>
        <dl class="invite-facts">
          <div><dt>{t("บทบาท", "Role")}</dt><dd>{preview.role === "owner" ? t("เจ้าของ", "Owner") : preview.role === "admin" ? t("ผู้ดูแลระบบ", "Admin") : t("สมาชิกทั่วไป", "Member")}</dd></div>
          <div><dt>{t("อีเมลที่ได้รับเชิญ", "Invited email")}</dt><dd>{preview.email}</dd></div>
          <div><dt>{t("ใช้ได้ถึง", "Valid until")}</dt><dd>{displayDate(preview.expiresAt)}</dd></div>
        </dl>
        {#if data.signedIn}
          <p>{t(`คุณเข้าสู่ระบบด้วย ${data.email}`, `You are signed in as ${data.email}.`)}</p>
          {#if error && !needsGoogle}<div class="o-alert" role="alert">{error}{#if wrongAccount}{" "}<a href={signOutHref}>{t("ออกจากระบบ", "Sign out")}</a>{/if}</div>{/if}
          {#if needsGoogle && !data.google}
            <p role="status">
              {t(
                "ต้องยืนยันอีเมลด้วย Google ก่อนรับคำเชิญ แต่ ORCA นี้ยังไม่เปิดการเข้าสู่ระบบด้วย Google ติดต่อผู้ดูแลที่เชิญคุณ",
                "The invitation needs your email confirmed with Google, but Google sign-in is not turned on for this ORCA. Contact the person who invited you.",
              )}
            </p>
          {:else if needsGoogle}
            <p role="status">{error}</p>
            <a class="o-button outline o-google" href={googleHref}
              ><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"
                ><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg
              >{t("เข้าสู่ระบบด้วย Google", "Sign in with Google")}</a
            >
          {:else}
            <button class="o-button" disabled={busy} onclick={accept}
              >{busy ? t("กำลังรับคำเชิญ…", "Accepting…") : t("รับคำเชิญ", "Accept invitation")} <ArrowRight size={16} /></button
            >
          {/if}
        {:else}
          <p>
            {data.google
              ? t("เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ หรือเลือก “เข้าสู่ระบบด้วย Google” ด้วยบัญชี Google ของอีเมลนั้น (ยังไม่มีรหัสผ่านก็ได้) แล้ว ORCA จะพากลับมาหน้านี้เพื่อรับคำเชิญ", "Sign in with the invited email, or choose “Sign in with Google” with that email's Google account (no password needed). ORCA brings you back here to accept.")
              : t("เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ แล้ว ORCA จะพากลับมาหน้านี้เพื่อรับคำเชิญ", "Sign in with the invited email, and ORCA brings you back here to accept.")}
          </p>
          <a class="o-button" href={signInHref}>{t("เข้าสู่ระบบเพื่อรับคำเชิญ", "Sign in to accept")} <ArrowRight size={16} /></a>
        {/if}
      {/if}
    </section>
  </main>
  <PublicFooter />
</div>

<style>
  .invite-panel { align-self: center; }
  .invite-loading { display: flex; align-items: center; gap: 10px; }
  .invite-done { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--orca-ok-bg, #e8f5ec); color: var(--orca-ok, #1d7a42); }
  .invite-facts { display: grid; gap: 0; margin: 4px 0 18px; border: 1px solid var(--orca-line, #e5e7eb); border-radius: 10px; overflow: hidden; }
  .invite-facts div { display: grid; grid-template-columns: minmax(110px, 40%) minmax(0, 1fr); }
  .invite-facts div + div { border-top: 1px solid var(--orca-line, #e5e7eb); }
  .invite-facts dt { padding: 10px 12px; background: var(--orca-surface-2, #fafafa); color: var(--orca-muted, #5b6270); font-size: 13px; }
  .invite-facts dd { margin: 0; padding: 10px 12px; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .invite-panel :global(.o-alert a) { color: inherit; font-weight: 600; text-decoration: underline; }
  a.o-button { text-decoration: none; }
</style>
