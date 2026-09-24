<script lang="ts">
  import { localeHref, t } from '$lib/orca/locale.svelte';
  import { gatewayClientConfig } from '$lib/orca/client-config';
  import type { OrcaHub } from '$lib/services/orca';
  import { ArrowRight, Check, Copy } from '@lucide/svelte';

  let { hub }: { hub: OrcaHub } = $props();
  let copied = $state(false);
  let copyError = $state(false);
  const connectPath = $derived(localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}&tab=connect`));
  const shareURL = $derived.by(() => {
    try { gatewayClientConfig(hub.connectURL, 'codex', true); return hub.connectURL; }
    catch { return ''; }
  });
  async function copyLink() {
    copied = false;
    copyError = false;
    if (!shareURL) return;
    try { await navigator.clipboard.writeText(shareURL); copied = true; }
    catch { copyError = true; }
  }
</script>

<section class="gateway-created" aria-labelledby="gateway-created-title">
  <div class="complete-icon" aria-hidden="true"><Check size={16} /></div>
  <div class="complete-content">
    <h2 id="gateway-created-title">{t('สร้างพื้นที่ทำงาน AI แล้ว', 'AI workspace created')}: {hub.name}</h2>
    <p class="step-label">{t('ขั้นตอนที่ 5 จาก 5 · เชื่อมแอป AI', 'Step 5 of 5 · Connect an AI app')}</p>
    <p>{hub.status === 'active'
      ? t('ส่งลิงก์เชื่อม AI นี้ให้สมาชิกเพิ่มในแอป AI ของตน จากนั้นสมาชิกแต่ละคนเข้าสู่ระบบด้วยบัญชี ORCA ของตนเองเพื่อยืนยันตัวตน', 'Share this AI connection link with members. Each member adds it to their AI app and signs in with their own ORCA account.')
      : t('บันทึกเป็นฉบับร่างแล้ว เปิดใช้งานพื้นที่ทำงาน AI นี้เมื่อพร้อมให้สมาชิกเชื่อมแอป AI', 'Saved as a draft. Activate this AI workspace when you are ready for members to connect their AI apps.')}</p>
    {#if shareURL}<div class="share-field">
      <label for="gateway-share-link">{t('ลิงก์เชื่อม AI (MCP URL)', 'AI connection link (MCP URL)')}</label>
      <div class="share-input">
        <input id="gateway-share-link" readonly value={shareURL} />
        <button type="button" class="k-button" onclick={copyLink}><Copy size={16} aria-hidden="true" />{t('คัดลอกลิงก์', 'Copy link')}</button>
      </div>
    </div>
    {:else}<p class="copy-error" role="alert">{t('ยังไม่มีลิงก์เชื่อม AI สำหรับพื้นที่ทำงานนี้ กรุณาเปิดพื้นที่ทำงานเพื่อตรวจสอบอีกครั้ง', 'The AI connection link for this workspace is not available yet. Open the workspace to check again.')}</p>{/if}
    <div class="complete-actions">
      <a class="k-button primary" href={localeHref('/app?view=settings&section=ai')}>{t('ดูวิธีเชื่อม AI กับ ORCA', 'How to connect AI to ORCA')}<ArrowRight size={16} aria-hidden="true" /></a>
      <a class="k-button" href={connectPath}>{t('เปิดพื้นที่ทำงาน AI', 'Open AI workspace')}</a>
    </div>
    {#if copied}<p class="copy-status" role="status">{t('คัดลอกลิงก์แล้ว', 'Link copied')}</p>{/if}
    {#if copyError}<p class="copy-error" role="alert">{t('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกและคัดลอกลิงก์จากช่องด้านบน', 'The link could not be copied automatically. Select and copy it from the field above.')}</p>{/if}
  </div>
</section>

<style>
  .gateway-created {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 20px;
    padding: 16px 18px 18px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-ink);
  }
  .complete-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--orca-ok-bg);
    color: var(--orca-ok);
  }
  .complete-content {
    flex: 1;
    min-width: 0;
  }
  .complete-content h2 {
    margin: 0;
    padding-top: 3px;
    overflow-wrap: anywhere;
  }
  .complete-content p {
    margin: 8px 0 0;
    color: var(--orca-muted);
    font-size: 14px;
    line-height: 1.65;
  }
  .complete-content p.step-label {
    margin-top: 2px;
    font-size: 13px;
  }
  .share-field {
    display: grid;
    gap: 6px;
    margin-top: 16px;
  }
  .share-field label {
    font-size: 13.5px;
    font-weight: 600;
  }
  /* The link and its copy button stay on one line; the link shortens with an ellipsis. */
  .share-input {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 760px;
    min-width: 0;
  }
  .share-input input {
    flex: 1 1 auto;
    min-width: 0;
    height: 36px;
    padding: 0 11px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface-2);
    color: var(--orca-ink);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 13px;
    text-overflow: ellipsis;
  }
  .share-input input:focus-visible {
    outline: none;
    border-color: var(--orca-ink);
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .share-input .k-button {
    flex: none;
    white-space: nowrap;
  }
  .complete-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .complete-content p.copy-status {
    color: var(--orca-ok);
    font-size: 13px;
  }
  .complete-content p.copy-error {
    color: var(--orca-deny);
    font-size: 13px;
  }
  @media (max-width: 640px) {
    .gateway-created {
      padding: 14px;
      gap: 12px;
    }
    .complete-actions a {
      flex: 1 1 auto;
      justify-content: center;
    }
  }
</style>
