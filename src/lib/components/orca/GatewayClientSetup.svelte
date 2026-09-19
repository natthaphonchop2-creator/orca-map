<script lang="ts">
  import { gatewayClientConfig, localGatewayEndpoint, type GatewayClient } from '$lib/orca/client-config';
  import { t } from '$lib/orca/locale.svelte';
  import { Copy, Check, ExternalLink } from '@lucide/svelte';
  let { endpoint, ready = true }: { endpoint: string; ready?: boolean } = $props();
  let client = $state<GatewayClient | 'manual'>('codex');
  let copied = $state('');
  let error = $state('');
  const config = $derived.by(() => {
    if (client === 'manual') return '';
    try { return gatewayClientConfig(endpoint, client); } catch { return ''; }
  });
  const configPath = $derived(client === 'codex' ? '~/.codex/config.toml' : client === 'cursor' ? '.cursor/mcp.json' : '.vscode/mcp.json');
  const clientName = $derived(client === 'codex' ? 'Codex' : client === 'cursor' ? 'Cursor' : 'VS Code');
  const docsUrl = $derived(client === 'codex' ? 'https://developers.openai.com/codex/mcp' : client === 'cursor' ? 'https://cursor.com/docs/mcp' : 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration');
  $effect(() => { void client; void endpoint; copied = ''; error = ''; });
  async function copy(text: string, name: string) {
    copied = ''; error = '';
    try { await navigator.clipboard.writeText(text); copied = name; }
    catch { error = t('เลือกข้อความแล้วคัดลอกด้วยตนเองได้เลย', 'Select and copy the text manually.'); }
  }
</script>

<div class="client-setup">
  <div class="k-field"><label for="hub-endpoint">{t('URL ของ MCP Gateway', 'MCP gateway URL')}</label>
    <div class="endpoint"><input id="hub-endpoint" readonly value={endpoint} /><button class="k-button" onclick={() => copy(endpoint, 'URL')} aria-label={t('คัดลอก URL', 'Copy URL')}><Copy size={16} /></button></div>
  </div>
  <div class="clients" role="group" aria-label={t('เลือกแอป AI', 'Choose an AI client')}>
    <button class:chosen={client === 'codex'} aria-pressed={client === 'codex'} onclick={() => client = 'codex'}>Codex</button>
    <button class:chosen={client === 'cursor'} aria-pressed={client === 'cursor'} onclick={() => client = 'cursor'}>Cursor</button>
    <button class:chosen={client === 'vscode'} aria-pressed={client === 'vscode'} onclick={() => client = 'vscode'}>VS Code</button>
    <button class:chosen={client === 'manual'} aria-pressed={client === 'manual'} onclick={() => client = 'manual'}>{t('ตั้งค่าเอง', 'Manual setup')}</button>
  </div>
  {#if client === 'manual'}
    <dl><dt>Transport</dt><dd>Streamable HTTP</dd><dt>Authorization</dt><dd><code>Bearer &lt;personal-key&gt;</code></dd></dl>
    <p>{t('ใช้ URL ด้านบนกับแอปที่รองรับการส่ง Authorization header แล้วใส่คีย์ส่วนตัวของคุณ', 'Use this URL in a client that supports custom Authorization headers, with your personal key.')}</p>
  {:else if config}
    <div class="config-header"><strong>{configPath}</strong><button class="k-button small" onclick={() => copy(config, t('การตั้งค่า', 'Configuration'))}><Copy size={14} />{t('คัดลอก', 'Copy')}</button></div>
    <pre aria-label={t('การตั้งค่า MCP', 'MCP configuration')}>{config}</pre>
    <p>{!ready ? t('เปิดใช้งาน Gateway และรับสิทธิ์สมาชิกก่อนสร้างคีย์ส่วนตัวสำหรับแอปของคุณ', 'Activate this gateway and obtain membership before creating your personal client key.') : client === 'codex' ? t('สร้างคีย์ส่วนตัวด้านล่าง แล้วตั้งค่า ORCA_MCP_KEY ใน environment ที่ใช้เปิด Codex โดยใส่เฉพาะค่าคีย์ ไม่ต้องเติม Bearer จากนั้นเพิ่มการตั้งค่านี้ในไฟล์ด้านบน', 'Create a personal key below and set ORCA_MCP_KEY in the environment used to launch Codex. Use the key value without the Bearer prefix, then add this configuration to the file above.') : client === 'cursor' ? t('สร้างคีย์ส่วนตัวด้านล่าง แล้วเก็บไว้ในตัวแปร ORCA_MCP_KEY ของเครื่องที่เปิด Cursor', 'Create a personal key below and set ORCA_MCP_KEY in the environment used to launch Cursor.') : t('สร้างคีย์ส่วนตัวด้านล่าง แล้วกรอกเมื่อ VS Code ขอคีย์สำหรับการเชื่อมต่อ', 'Create a personal key below and enter it when VS Code prompts for the connection key.')}</p>
    {#if client === 'codex'}<p>{t('การตั้งค่านี้อ้างถึงชื่อตัวแปรเท่านั้น อย่าวางคีย์จริงในไฟล์ config และ Codex ต้องเข้าถึงตัวแปรนี้ได้ก่อนเริ่มเชื่อมต่อ', 'This configuration references only the variable name. Keep the actual key out of the config file, and make the variable available to Codex before connecting.')}</p>{/if}
    <a class="docs" href={docsUrl} target="_blank" rel="noreferrer">{t('คู่มือการตั้งค่า', 'Configuration guide')} {clientName}<ExternalLink size={13} /></a>
  {:else}<p role="alert">{t('URL ยังไม่พร้อมสำหรับสร้างการตั้งค่า กรุณาติดต่อผู้ดูแล', 'The endpoint cannot be used to generate a configuration. Contact your administrator.')}</p>{/if}
  {#if localGatewayEndpoint(endpoint)}<p class="local-note">{t('URL นี้ใช้กับแอปบนเครื่องเดียวกับ ORCA เท่านั้น', 'This local URL is reachable only by apps on the same computer as ORCA.')}</p>{/if}
  {#if copied}<p role="status" class="copied"><Check size={14} />{t(`คัดลอก${copied}แล้ว`, `${copied} copied`)}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .client-setup { min-width:0; }
  .endpoint { display:flex; gap:8px; }
  .endpoint input { min-width:0; }
  .clients { display:flex; gap:6px; margin:24px 0 16px; flex-wrap:wrap; }
  .clients button { border:1px solid #e1e5ed; border-radius:6px; background:white; padding:8px 13px; font:inherit; font-size:12px; cursor:pointer; color:#647087; }
  .clients button.chosen { background:#191f2c; color:#def589; border-color:#191f2c; }
  .config-header { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; font-size:12px; }
  pre { margin:0; background:#f6f7fa; padding:18px; overflow:auto; max-height:360px; border:1px solid #e2e6ed; border-radius:6px; font-size:12px; line-height:1.6; }
  p { margin:12px 0 0; color:#647087; font-size:12px; line-height:1.7; }
  .docs { display:inline-flex; align-items:center; gap:5px; font-size:12px; margin-top:8px; color:#526f28; }
  .local-note { border-left:2px solid #c8d49a; padding-left:10px; }
  .copied { display:flex; align-items:center; gap:6px; color:#526f28; }
  dl { display:grid; grid-template-columns:110px minmax(0,1fr); gap:10px; font-size:13px; }
  dt { color:#647087; } dd { margin:0; overflow-wrap:anywhere; }
</style>
