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
  <div class="complete-icon"><Check size={24} /></div>
  <div class="complete-content">
    <p class="step-label">{t('ขั้นตอน 5 จาก 5 · เชื่อม AI', 'Step 5 of 5 · Connect AI')}</p>
    <h2 id="gateway-created-title">{t('สร้าง Gateway แล้ว', 'Gateway created')}: {hub.name}</h2>
    <p>{hub.status === 'active'
      ? t('ส่ง URL นี้ให้พนักงานเพิ่มในแอป AI แล้วเข้าสู่ระบบ ORCA เพื่อยืนยันบัญชี', 'Share this MCP URL for employees to add to their AI app and sign in to ORCA to confirm their account.')
      : t('บันทึกเป็นฉบับร่างแล้ว เปิดใช้งาน Gateway เมื่อพร้อมให้สมาชิกเชื่อม AI', 'Saved as a draft. Activate this Gateway when you are ready for members to connect their AI.')}</p>
    {#if shareURL}<div class="share-field">
      <label for="gateway-share-link">{t('URL ของ MCP Gateway', 'MCP gateway URL')}</label>
      <div class="share-input">
        <input id="gateway-share-link" readonly value={shareURL} />
        <button type="button" class="k-button" onclick={copyLink}><Copy size={16} />{t('คัดลอก URL', 'Copy URL')}</button>
      </div>
    </div>
    {:else}<p role="alert">{t('ยังไม่มี URL สำหรับเชื่อมต่อ', 'A connection URL is not available yet.')}</p>{/if}
    <div class="complete-actions">
      <a class="k-button primary" href={localeHref('/app?view=settings&section=ai')}>{t('ดูวิธีเชื่อม AI กับ ORCA', 'Connect your AI to ORCA')}<ArrowRight size={16} /></a>
      <a class="k-button" href={connectPath}>{t('ไปที่ Gateway', 'Open Gateway')}</a>
    </div>
    {#if copied}<p class="copy-status" role="status">{t('คัดลอกลิงก์แล้ว', 'Link copied')}</p>{/if}
    {#if copyError}<p role="alert">{t('เลือกและคัดลอกลิงก์ในช่องด้านบนได้เลย', 'Select and copy the link from the field above.')}</p>{/if}
  </div>
</section>

<style>
  .gateway-created { display:flex; align-items:flex-start; gap:18px; padding:24px; margin-bottom:28px; border:1px solid #d8e6b9; border-radius:12px; background:#f8fbed; }
  .complete-icon { flex:none; display:grid; place-items:center; width:44px; height:44px; border-radius:50%; color:#47681c; background:#e5f3c7; }
  .complete-content { min-width:0; flex:1; }
  .step-label { color:#526b30; font-size:12px; font-weight:600; margin:0 0 6px; }
  h2 { margin:0; font-size:20px; overflow-wrap:anywhere; }
  p { margin:10px 0 0; font-size:14px; line-height:1.7; color:#536078; }
  .share-field { margin-top:20px; }
  label { display:block; font-size:13px; font-weight:600; margin-bottom:6px; }
  .share-input { display:flex; gap:8px; }
  input { min-width:0; width:100%; flex:1; background:white; border:1px solid #cdd7bb; border-radius:6px; padding:10px 12px; font:inherit; font-size:14px; }
  .complete-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
  .copy-status { color:#47681c; }
  @media (max-width:640px) { .gateway-created { padding:18px; gap:12px; } .complete-icon { width:32px; height:32px; } .share-input { flex-direction:column; } input { font-size:16px; } .complete-actions a { width:100%; justify-content:center; } }
</style>
