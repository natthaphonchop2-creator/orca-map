<script lang="ts">
  import Brand from "$lib/components/orca/Brand.svelte";
  import PublicFooter from "$lib/components/orca/PublicFooter.svelte";
  import "$lib/components/orca/forms.css";
  import "$lib/components/orca/orca.css";
  import "$lib/components/orca/login.css";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { initializeLocale, localeHref, orcaLocale, t } from "$lib/orca/locale.svelte";
  import {
    AI_HANDOFF_FALLBACK,
    AI_LOGIN,
    AI_SWITCH_ACCOUNT,
    mintHandoff,
    shouldContinueBySelf,
    type HandoffDecision,
    type HandoffOutcome,
  } from "$lib/orca/ai-handoff";
  import { stoppedMessage } from "$lib/orca/platform-console";
  import { reloadForAccount } from "$lib/services/writes";
  import { ArrowLeft, ArrowRight, Bot, Clock, UserRound } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import type { PageProps } from "./$types";

  // An AI app's ORCA sign-in (C4 design §14h): the signed-in person continues
  // as this account, or picks another. The next page, on ORCA's own address,
  // names the company and asks them to allow it. This page never sees the
  // company, the AI app or its sign-in: only this browser's hand-off cookie,
  // which the server reads.
  let { data }: PageProps = $props();

  type Problem = Exclude<HandoffOutcome["kind"], "redeem" | "signed-out"> | "";
  let busy = $state<HandoffDecision | "">("");
  let problem = $state<Problem>("");
  // The company's status, when the mint answered 423 (its own member only).
  let stoppedStatus = $state<"suspended" | "closed">("suspended");
  let tried = false;
  const expired = $derived(data.expired || problem === "expired");
  const notMember = $derived(problem === "not-member");

  function storage() {
    try {
      return window.sessionStorage;
    } catch {
      return undefined;
    }
  }

  async function run(decision: HandoffDecision) {
    if (busy) return;
    busy = decision;
    problem = "";
    const outcome = await mintHandoff(decision, data.account, (input, init) => fetch(input, init));
    // The only navigation with a code: a constant path on this origin.
    if (outcome.kind === "redeem") return window.location.replace(outcome.href);
    busy = "";
    if (outcome.kind === "signed-out") return window.location.replace(AI_LOGIN);
    if (outcome.kind === "account-changed" && reloadForAccount(() => window.location.reload(), storage())) return;
    if (outcome.kind === "stopped") stoppedStatus = outcome.status;
    problem = outcome.kind;
    // The card changed under the person's focus (the button they pressed is gone): start it at the new title.
    if (problem === "not-member" || problem === "expired" || problem === "stopped") {
      await tick();
      document.getElementById("ai-handoff-title")?.focus();
    }
  }

  onMount(() => {
    initializeLocale();
    // Back from ORCA's page (the browser's back-forward cache): the buttons work again.
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) busy = "";
    };
    window.addEventListener("pageshow", onShow);
    // Right after choosing the account on /login: continue once by itself.
    // The address loses signed=1 first, so a reload asks again.
    if (shouldContinueBySelf({ ...data, tried })) {
      tried = true;
      const url = new URL(page.url);
      url.searchParams.delete("signed");
      // Once the router has started (SvelteKit refuses replaceState before it).
      setTimeout(() => {
        try {
          replaceState(url, page.state);
        } catch {
          /* The address keeps signed=1; the consent page still asks. */
        }
      }, 0);
      void run("continue");
    }
    return () => window.removeEventListener("pageshow", onShow);
  });
  // The public website lives on the backend's origin; /home (server/app.mjs) sends people there.
  const site = () => localeHref("/home");
</script>

<svelte:head
  ><title>{t("เชื่อมแอป AI · ORCA", "Connect an AI app · ORCA")}</title></svelte:head
>
<div class="orca o-auth-page o-login o-login-handoff" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a class="o-login-brand" href={site()} aria-label={t("หน้าเว็บ ORCA", "ORCA website")}><Brand dark /></a>
    <a class="o-login-back" href={site()}
      ><ArrowLeft size={15} aria-hidden="true" />{t("กลับหน้าเว็บ ORCA", "Back to the ORCA website")}</a
    >
  </header>
  <main class="o-auth o-wrap">
    <section class="o-auth-form" aria-labelledby="ai-handoff-title" aria-busy={busy !== ""}>
      <p class="o-login-ai-note"><Bot size={15} aria-hidden="true" />{t("แอป AI ขอเชื่อมกับ ORCA", "An AI app wants to connect to ORCA")}</p>
      {#if expired}
        <h1 id="ai-handoff-title" tabindex="-1">{t("เริ่มเชื่อมใหม่จากแอป AI", "Start again from your AI app")}</h1>
        <div class="o-handoff-state" role="status">
          <span class="o-handoff-icon" aria-hidden="true"><Clock size={18} /></span>
          <p>
            {t(
              "การเชื่อมแอป AI หมดเวลา หรือเริ่มจากเบราว์เซอร์อื่น กลับไปที่แอป AI แล้วเริ่มเชื่อม ORCA ใหม่",
              "The AI app's connection timed out or started in another browser. Go back to your AI app and connect ORCA again.",
            )}
          </p>
        </div>
      {:else if problem === "stopped"}
        <h1 id="ai-handoff-title" tabindex="-1">{t("เชื่อมแอป AI กับบริษัทนี้ไม่ได้ตอนนี้", "This AI app can't connect to this company now")}</h1>
        <div class="o-alert" role="alert">{stoppedMessage(stoppedStatus, t)}</div>
        <div class="o-handoff-actions">
          <button type="button" class="o-handoff-cancel" disabled={busy !== ""} onclick={() => run("cancel")}>{t("ยกเลิก", "Cancel")}</button>
        </div>
      {:else if notMember}
        <h1 id="ai-handoff-title" tabindex="-1">{t("ลองใช้บัญชีอื่น", "Try another account")}</h1>
        <div class="o-alert" role="alert">
          {t(`บัญชี ${data.email} ไม่ได้อยู่ในบริษัทที่แอป AI นี้ขอเชื่อม`, `${data.email} is not a member of the company this AI app is connecting to.`)}
        </div>
        <p>{t("ถ้าคุณควรอยู่ในบริษัทนั้น ขอลิงก์เชิญจากผู้ดูแลบริษัท", "If you should be in that company, ask its admin for an invite link.")}</p>
        <div class="o-handoff-actions">
          <a class="o-button" href={AI_SWITCH_ACCOUNT} data-sveltekit-reload>{t("ใช้บัญชีอื่น", "Use another account")}</a>
          <button type="button" class="o-handoff-cancel" disabled={busy !== ""} onclick={() => run("cancel")}>{t("ยกเลิก", "Cancel")}</button>
        </div>
      {:else}
        <h1 id="ai-handoff-title" tabindex="-1">{t("เชื่อมแอป AI ด้วยบัญชีนี้", "Connect your AI app with this account")}</h1>
        <p>
          {t(
            "ขั้นต่อไป ORCA จะบอกว่าแอป AI จะใช้บริษัทไหน แล้วให้คุณกดอนุญาต",
            "Next, ORCA shows which company your AI app will use and asks you to allow it.",
          )}
        </p>
        <p class="o-handoff-account">
          <span class="o-handoff-icon" aria-hidden="true"><UserRound size={18} /></span>
          <span><small>{t("เข้าสู่ระบบอยู่ในชื่อ", "Signed in as")}</small><strong>{data.email}</strong></span>
        </p>
        {#if problem === "account-changed"}
          <div class="o-alert" role="alert">
            {t("คุณเข้าสู่ระบบด้วยบัญชีอื่นในอีกแท็บ โหลดหน้านี้ใหม่", "You signed in as someone else in another tab. Reload this page.")}
          </div>
        {:else if problem === "retry"}
          <div class="o-alert" role="alert">{t("ดำเนินการต่อไม่สำเร็จ ลองอีกครั้ง", "Couldn't continue. Try again.")}</div>
        {/if}
        <div class="o-handoff-actions">
          {#if problem === "account-changed"}
            <button type="button" class="o-button" onclick={() => window.location.reload()}>{t("โหลดหน้านี้ใหม่", "Reload this page")}</button>
          {:else}
            <button type="button" class="o-button" disabled={busy !== ""} onclick={() => run("continue")}
              ><span class="o-handoff-label">{t(`ดำเนินการต่อในชื่อ ${data.email}`, `Continue as ${data.email}`)}</span><ArrowRight size={16} aria-hidden="true" /></button
            >
          {/if}
          <a class="o-button outline" href={AI_SWITCH_ACCOUNT} data-sveltekit-reload>{t("ใช้บัญชีอื่น", "Use another account")}</a>
          <button type="button" class="o-handoff-cancel" disabled={busy !== ""} onclick={() => run("cancel")}>{t("ยกเลิก", "Cancel")}</button>
        </div>
      {/if}
      <p class="o-handoff-progress" role="status" aria-live="polite">
        {busy === "continue" ? t("กำลังไปหน้าอนุญาตของ ORCA…", "Opening ORCA's allow page…") : busy === "cancel" ? t("กำลังยกเลิก…", "Cancelling…") : ""}
      </p>
      <p class="o-login-ai-fallback">
        {t("มีปัญหาในการเข้าสู่ระบบ?", "Trouble signing in?")}
        <a href={AI_HANDOFF_FALLBACK} data-sveltekit-reload>{t("ใช้หน้าเข้าสู่ระบบสำรอง", "Use the backup sign-in page")}</a>
      </p>
    </section>
  </main>
  <PublicFooter />
</div>
