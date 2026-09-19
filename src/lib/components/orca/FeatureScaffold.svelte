<script lang="ts">
  import type { FeatureDefinition } from "$lib/orca/feature-registry";
  import { t } from "$lib/orca/locale.svelte";

  let { feature }: { feature: FeatureDefinition } = $props();
</script>

<section class="feature-page" aria-labelledby="feature-title">
  <header class="feature-heading">
    <div>
      <h1 id="feature-title">{feature.title}</h1>
      <p>{t(feature.purpose.th, feature.purpose.en)}</p>
    </div>
    <span class="feature-status">{t("ยังไม่เปิดใช้งาน", "Not available yet")}</span>
  </header>

  <div class="feature-scope">
    <h2>{t("ขอบเขตของหน้านี้", "Page scope")}</h2>
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
    gap: 18px;
    margin-bottom: 24px;
  }
  .feature-heading > div {
    min-width: 0;
  }
  .feature-heading h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .feature-heading p {
    max-width: 680px;
    margin: 7px 0 0;
    color: var(--k-muted, #697386);
    font-size: 13px;
    line-height: 1.7;
  }
  .feature-status {
    flex-shrink: 0;
    margin-top: 4px;
    border: 1px solid var(--k-line, #e2e6ed);
    border-radius: 5px;
    padding: 4px 8px;
    color: var(--k-muted, #697386);
    background: #f7f8fa;
    font-size: 11px;
    line-height: 1.5;
  }
  .feature-scope {
    max-width: 760px;
    border: 1px solid var(--k-line, #e2e6ed);
    border-radius: 7px;
    padding: 22px 24px;
    background: white;
  }
  .feature-scope h2 {
    margin: 0;
    color: var(--k-ink, #171c2a);
    font-size: 13px;
    line-height: 1.6;
    font-weight: 600;
  }
  .feature-scope p {
    margin: 6px 0 0;
    color: var(--k-muted, #697386);
    font-size: 13px;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .feature-limitation {
    margin-top: 20px;
    border-top: 1px solid var(--k-line, #e2e6ed);
    padding-top: 18px;
  }
  @media (max-width: 640px) {
    .feature-heading {
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }
    .feature-status {
      margin-top: 0;
    }
    .feature-scope {
      padding: 18px;
    }
  }
</style>
