<script lang="ts">
  import type { FeatureDefinition } from "$lib/orca/feature-registry";
  import { t } from "$lib/orca/locale.svelte";

  let { feature }: { feature: FeatureDefinition } = $props();
</script>

<section class="feature-page" aria-labelledby="feature-title">
  <header class="feature-heading">
    <div>
      <h1 id="feature-title">{t(feature.title.th, feature.title.en)}</h1>
      <p>{t(feature.purpose.th, feature.purpose.en)}</p>
    </div>
    <span class="feature-status">{t("ยังไม่เปิดใช้งาน", "Not available yet")}</span>
  </header>

  <div class="feature-scope">
    <h2>{t("ขอบเขตของหน้านี้", "What this page covers")}</h2>
    <p>{t(feature.scope.th, feature.scope.en)}</p>
    <div class="feature-limitation">
      <h2>{t("สถานะปัจจุบัน", "Current availability")}</h2>
      <p>{t(feature.limitation.th, feature.limitation.en)}</p>
    </div>
  </div>
</section>

<style>
  .feature-page {
    min-width: 0;
  }
  .feature-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 20px;
  }
  .feature-heading > div {
    min-width: 0;
  }
  .feature-heading h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .feature-heading p {
    max-width: 72ch;
    margin: 4px 0 0;
    color: var(--orca-muted);
    font-size: 14px;
    line-height: 1.65;
  }
  .feature-status {
    flex-shrink: 0;
    margin-top: 6px;
    padding: 1px 8px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.6;
    white-space: nowrap;
  }
  .feature-scope {
    max-width: 760px;
    padding: 18px 20px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .feature-scope h2 {
    margin: 0;
    color: var(--orca-ink);
  }
  .feature-scope p {
    margin: 4px 0 0;
    color: var(--orca-muted);
    font-size: 14px;
    line-height: 1.65;
    overflow-wrap: anywhere;
  }
  .feature-limitation {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--orca-line);
  }
  @media (max-width: 640px) {
    .feature-heading {
      flex-direction: column;
      gap: 8px;
    }
    .feature-status {
      margin-top: 0;
    }
    .feature-scope {
      padding: 16px;
    }
  }
</style>
