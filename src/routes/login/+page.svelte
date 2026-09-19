<script lang="ts">
  import { page } from "$app/state";
  import { LOCAL_AUTH_MIN_PASSWORD_LENGTH } from "$lib/constants";
  import Brand from "$lib/components/orca/Brand.svelte";
  import PublicFooter from "$lib/components/orca/PublicFooter.svelte";
  import "$lib/components/orca/forms.css";
  import "$lib/components/orca/orca.css";
  import {
    initializeLocale,
    localeHref,
    orcaLocale,
    t,
  } from "$lib/orca/locale.svelte";
  import type { PageProps } from "./$types";
  import { ArrowRight } from "@lucide/svelte";
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
  const error = $derived(page.url.searchParams.has("error"));
  onMount(initializeLocale);
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
<div class="orca" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a href={localeHref("/")} aria-label={t("หน้าหลัก ORCA", "ORCA home")}
      ><Brand /></a
    >
  </header>
  <main class="o-auth o-wrap">
    <section class="o-auth-story">
      <Brand dark />
      <h1>
        {t("เชื่อม AI กับข้อมูล", "Your team’s space.")}<br />{t(
          "ให้ทีมทำงานร่วมกัน",
          "Your business rhythm.",
        )}
      </h1>
      <p>
        {t(
          "จัดการระบบที่เชื่อมต่อ กำหนดสิทธิ์ และให้ทีมใช้ AI กับข้อมูลที่จำเป็นต่องาน",
          "Manage connected systems, set access, and let your team use AI with the data they need.",
        )}
      </p>
    </section>
    <section class="o-auth-form">
      <h2>{t("ยินดีต้อนรับกลับ", "Welcome back")}</h2>
      <p>
        {t(
          localProvider
            ? "กรอกอีเมลและรหัสผ่านเพื่อเข้าสู่พื้นที่ทำงาน"
            : "เลือกวิธีเข้าสู่ระบบที่องค์กรของคุณจัดเตรียมไว้",
          localProvider
            ? "Enter your email and password to open your workspace."
            : "Choose the sign-in method configured by your organization.",
        )}
      </p>
      {#if data.unavailable}<div class="o-alert" role="alert">
          {t(
            "โหลดตัวเลือกการเข้าสู่ระบบไม่สำเร็จ กรุณารีเฟรชหน้านี้",
            "Sign-in methods could not be loaded. Please reload this page.",
          )}
        </div>{/if}
      {#if localProvider}
        <form method="POST" action="/oauth2/start">
          {#if error}<div class="o-alert" role="alert">
              {t(
                "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจอีเมลและรหัสผ่านแล้วลองอีกครั้ง",
                "Sign-in failed. Please check your email and password, then try again.",
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
                  ? t("ซ่อนรหัสผ่าน", "Hide")
                  : t("แสดงรหัสผ่าน", "Show")}</button
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
            >{t("เข้าสู่ระบบ", "Sign in")} <ArrowRight size={19} /></button
          >
        </form>
      {/if}
      {#if externalProviders.length > 0}
        {#if localProvider}<p class="o-auth-bottom">
            {t(
              "หรือเข้าสู่ระบบด้วยบัญชีองค์กร",
              "Or continue with your organization account",
            )}
          </p>{/if}
        <div class="o-auth-provider">
          {#each externalProviders as provider (provider.id)}
            <button
              class="o-button"
              onclick={() => signIn(provider.namespace, provider.id)}
            >
              {t("เข้าสู่ระบบด้วย", "Continue with")}
              {provider.name}<ArrowRight size={19} />
            </button>
          {/each}
        </div>
      {/if}
      {#if !data.unavailable && data.authProviders.length === 0}
        <p class="o-alert">
          {t(
            "องค์กรยังไม่ได้ตั้งค่าวิธีเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลองค์กร",
            "Sign-in is not configured yet. Contact your installation administrator.",
          )}
        </p>
      {/if}
    </section>
  </main>
  <PublicFooter />
</div>
