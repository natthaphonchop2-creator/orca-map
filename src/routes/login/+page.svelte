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
<div class="orca o-auth-page" lang={orcaLocale.value}>
  <header class="o-simple-header o-wrap">
    <a href={localeHref("/")} aria-label={t("หน้าหลัก ORCA", "ORCA home")}
      ><Brand /></a
    >
  </header>
  <main class="o-auth o-wrap">
    <section class="o-auth-story">
      <Brand dark />
      <h1>
        {t("พื้นที่ทำงาน AI", "The AI workspace")}<br />{t(
          "สำหรับองค์กรของคุณ",
          "for your organization",
        )}
      </h1>
      <p>
        {t(
          "เชื่อมต่อระบบที่องค์กรใช้ จัดเก็บคลังความรู้ และกำหนดสิทธิ์การใช้งาน AI ของสมาชิกได้จากที่เดียว",
          "Connect your organization’s systems, manage its knowledge and control each member’s AI access in one place.",
        )}
      </p>
    </section>
    <section class="o-auth-form">
      <h2>{t("เข้าสู่ระบบ ORCA", "Sign in to ORCA")}</h2>
      <p>
        {t(
          localProvider
            ? "กรอกอีเมลและรหัสผ่านของคุณเพื่อเข้าสู่ระบบ"
            : "เลือกวิธีเข้าสู่ระบบที่องค์กรของคุณกำหนดไว้",
          localProvider
            ? "Enter your email and password to sign in."
            : "Choose the sign-in method set up by your organization.",
        )}
      </p>
      {#if data.unavailable}<div class="o-alert" role="alert">
          {t(
            "โหลดวิธีเข้าสู่ระบบไม่สำเร็จ กรุณาโหลดหน้านี้อีกครั้ง",
            "Sign-in methods could not be loaded. Please reload this page.",
          )}
        </div>{/if}
      {#if localProvider}
        <form method="POST" action="/oauth2/start">
          {#if error}<div class="o-alert" role="alert">
              {t(
                "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน แล้วลองอีกครั้ง",
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
              "หรือเข้าสู่ระบบด้วยบัญชีขององค์กร",
              "Or sign in with your organization account",
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
            "องค์กรยังไม่ได้ตั้งค่าวิธีเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบ",
            "Sign-in has not been set up yet. Contact your administrator.",
          )}
        </p>
      {/if}
    </section>
  </main>
  <PublicFooter />
</div>
