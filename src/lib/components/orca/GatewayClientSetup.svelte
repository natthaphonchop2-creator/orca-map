<script lang="ts">
  import { gatewayClientConfig, localGatewayEndpoint } from '$lib/orca/client-config';
  import { gatewayClientInstructions, type GatewaySetupClient, type GatewaySetupScope } from '$lib/orca/client-instructions';
  import { orcaLocale, t } from '$lib/orca/locale.svelte';
  import { Copy, Check, ExternalLink, MessageSquareText, ChevronDown } from '@lucide/svelte';
  let { endpoint, ready = true, scope = 'gateway' }: { endpoint: string; ready?: boolean; scope?: GatewaySetupScope } = $props();
  let client = $state<GatewaySetupClient>('manual');
  let copied = $state('');
  let error = $state('');
  const config = $derived.by(() => {
    if (client === 'manual') return '';
    try { return gatewayClientConfig(endpoint, client); } catch { return ''; }
  });
  const instructions = $derived.by(() => {
    try { return gatewayClientInstructions(endpoint, scope); } catch { return ''; }
  });
  const configPath = $derived(client === 'codex' ? '~/.codex/config.toml' : client === 'cursor' ? '.cursor/mcp.json' : '.vscode/mcp.json');
  const clientName = $derived(client === 'codex' ? 'Codex' : client === 'cursor' ? 'Cursor' : 'VS Code');
  const docsUrl = $derived(client === 'codex' ? 'https://developers.openai.com/codex/mcp' : client === 'cursor' ? 'https://cursor.com/docs/mcp' : 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration');
  const notReady = $derived(scope === 'orca'
    ? t('รับสิทธิ์สมาชิกใน Gateway ที่เปิดใช้งานก่อน แล้วสร้างคีย์ส่วนตัวเพื่อเชื่อมต่อ ORCA', 'Join an active Gateway, then create a personal key to connect to ORCA.')
    : t('เปิดใช้งาน Gateway และรับสิทธิ์สมาชิกก่อนสร้างคีย์ส่วนตัวเพื่อเชื่อมต่อ', 'Activate this Gateway and obtain membership before creating a personal connection key.'));
  $effect(() => { void client; void endpoint; void scope; void orcaLocale.value; copied = ''; error = ''; });
  async function copy(text: string, name: string) {
    copied = ''; error = '';
    try { await navigator.clipboard.writeText(text); copied = name; }
    catch { error = t('เลือกข้อความแล้วคัดลอกด้วยตนเองได้เลย', 'Select and copy the text manually.'); }
  }
</script>

<div class="client-setup">
  {#if instructions}
    <div class="quick-setup">
      <div class="quick-heading"><MessageSquareText size={20} /><strong>{t('ให้ AI ช่วยตั้งค่าการเชื่อมต่อ', 'Let AI help with setup')}</strong></div>
      {#if scope === 'orca'}<p class="scope-note">{t('เชื่อม ORCA ครั้งเดียว เพื่อใช้เครื่องมือจากทุก Gateway ที่คุณได้รับสิทธิ์', 'Connect to ORCA once to use tools from every Gateway you are allowed to access.')}</p>{/if}
      <p>{t('คัดลอกคำสั่งภาษาอังกฤษไปให้ AI ที่คุณใช้ช่วยตั้งค่า โดยแอปต้องรองรับ MCP และการใช้คีย์ส่วนตัว', 'Copy the English instructions into your AI app to help with setup. The app must support MCP and personal-key authentication.')}</p>
      <button class="k-button primary prompt-copy" onclick={() => copy(instructions, t('คำสั่งตั้งค่า', 'Setup instructions'))}><Copy size={16} />{t('คัดลอกคำสั่งตั้งค่า', 'Copy setup instructions')}</button>
      <p class="prompt-note">{t('คำสั่งเป็นภาษาอังกฤษและไม่มีคีย์ของคุณ ใส่คีย์ในช่องเก็บคีย์ของแอปเมื่อตั้งค่า', 'These English instructions do not include your key. Enter it in the app’s secure credential field during setup.')}</p>
      <details class="prompt-preview"><summary>{t('ดูคำสั่งก่อนคัดลอก', 'Preview instructions')}<ChevronDown size={14} /></summary><pre aria-label={t('คำสั่งตั้งค่า MCP', 'MCP setup instructions')}>{instructions}</pre></details>
    </div>
  {/if}
  {#if !ready}<p class="readiness-note">{notReady}</p>{/if}
  <details class="advanced-setup">
    <summary>{t('ตั้งค่าด้วยตนเอง / ดู URL และ config', 'Manual setup / URL and configuration')}<ChevronDown size={15} /></summary>
  <div class="clients" role="group" aria-label={t('รูปแบบการตั้งค่าด้วยตนเอง', 'Manual configuration format')}>
    <button class:chosen={client === 'manual'} aria-pressed={client === 'manual'} onclick={() => client = 'manual'}>{t('แบบทั่วไป', 'General')}</button>
    <button class:chosen={client === 'codex'} aria-pressed={client === 'codex'} onclick={() => client = 'codex'}>Codex</button>
    <button class:chosen={client === 'cursor'} aria-pressed={client === 'cursor'} onclick={() => client = 'cursor'}>Cursor</button>
    <button class:chosen={client === 'vscode'} aria-pressed={client === 'vscode'} onclick={() => client = 'vscode'}>VS Code</button>
  </div>
    <div class="k-field"><label for="hub-endpoint">{scope === 'orca' ? t('URL ของ ORCA MCP', 'ORCA MCP URL') : t('URL ของ MCP Gateway', 'MCP gateway URL')}</label>
      <div class="endpoint"><input id="hub-endpoint" readonly value={endpoint} /><button class="k-button" onclick={() => copy(endpoint, 'URL')} aria-label={t('คัดลอก URL', 'Copy URL')}><Copy size={16} /></button></div>
    </div>
    {#if client === 'manual'}
      <dl><dt>Transport</dt><dd>Streamable HTTP</dd><dt>Authorization</dt><dd><code>Bearer &lt;personal-key&gt;</code></dd></dl>
      <p>{t('ใช้ URL ด้านบนกับแอปที่รองรับการส่ง Authorization header แล้วใส่คีย์ส่วนตัวของคุณ', 'Use this URL in a client that supports custom Authorization headers, with your personal key.')}</p>
      <p>{t('ถ้าแอปรับเฉพาะ OAuth เช่นการเพิ่มตัวเชื่อมต่อบางรูปแบบใน ChatGPT หรือ Claude จะใช้คีย์แบบนี้โดยตรงไม่ได้ ต้องใช้วิธีที่แอปรองรับ', 'If a client only accepts OAuth, including some ChatGPT or Claude connector flows, this bearer-key setup cannot be used directly. Use a connection method supported by the client.')}</p>
    {:else if config}
    <div class="config-header"><strong>{configPath}</strong><button class="k-button small" onclick={() => copy(config, t('การตั้งค่า', 'Configuration'))}><Copy size={14} />{t('คัดลอก', 'Copy')}</button></div>
    <pre aria-label={t('การตั้งค่า MCP', 'MCP configuration')}>{config}</pre>
    <p>{!ready ? notReady : client === 'codex' ? t('สร้างคีย์ส่วนตัวด้านล่าง แล้วตั้งค่า ORCA_MCP_KEY ใน environment ที่ใช้เปิด Codex โดยใส่เฉพาะค่าคีย์ ไม่ต้องเติม Bearer จากนั้นเพิ่มการตั้งค่านี้ในไฟล์ด้านบน', 'Create a personal key below and set ORCA_MCP_KEY in the environment used to launch Codex. Use the key value without the Bearer prefix, then add this configuration to the file above.') : client === 'cursor' ? t('สร้างคีย์ส่วนตัวด้านล่าง แล้วเก็บไว้ในตัวแปร ORCA_MCP_KEY ของเครื่องที่เปิด Cursor', 'Create a personal key below and set ORCA_MCP_KEY in the environment used to launch Cursor.') : t('สร้างคีย์ส่วนตัวด้านล่าง แล้วกรอกเมื่อ VS Code ขอคีย์สำหรับการเชื่อมต่อ', 'Create a personal key below and enter it when VS Code prompts for the connection key.')}</p>
    {#if client === 'codex'}<p>{t('การตั้งค่านี้อ้างถึงชื่อตัวแปรเท่านั้น อย่าวางคีย์จริงในไฟล์ config และ Codex ต้องเข้าถึงตัวแปรนี้ได้ก่อนเริ่มเชื่อมต่อ', 'This configuration references only the variable name. Keep the actual key out of the config file, and make the variable available to Codex before connecting.')}</p>{/if}
    <a class="docs" href={docsUrl} target="_blank" rel="noreferrer">{t('คู่มือการตั้งค่า', 'Configuration guide')} {clientName}<ExternalLink size={13} /></a>
    {/if}
  </details>
  {#if !instructions}<p role="alert">{t('URL ยังไม่พร้อมสำหรับสร้างการตั้งค่า กรุณาติดต่อผู้ดูแล', 'The endpoint cannot be used to generate a configuration. Contact your administrator.')}</p>{/if}
  {#if localGatewayEndpoint(endpoint)}<p class="local-note">{t('URL นี้ใช้กับแอปบนเครื่องเดียวกับ ORCA เท่านั้น', 'This local URL is reachable only by apps on the same computer as ORCA.')}</p>{/if}
  {#if copied}<p role="status" class="copied"><Check size={14} />{t(`คัดลอก${copied}แล้ว`, `${copied} copied`)}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .client-setup { min-width:0; }
  .endpoint { display:flex; gap:8px; }
  .endpoint input { min-width:0; }
  .clients { display:flex; gap:6px; margin:0 0 16px; flex-wrap:wrap; }
  .clients button { border:1px solid #e1e5ed; border-radius:6px; background:white; padding:8px 13px; font:inherit; font-size:12px; cursor:pointer; color:#647087; }
  .clients button.chosen { background:#191f2c; color:#def589; border-color:#191f2c; }
  .quick-setup { border:1px solid #dfe7cd; background:#f7faef; padding:20px; border-radius:10px; }
  .quick-heading { display:flex; align-items:center; gap:9px; color:#263b17; font-size:15px; }
  .prompt-copy { margin-top:16px; }
  .prompt-note { font-size:11px; }
  .prompt-preview { margin-top:16px; border-top:1px solid #dfe7cd; padding-top:12px; }
  .advanced-setup { margin-top:18px; border:1px solid #e1e5ed; border-radius:8px; padding:15px; }
  summary { display:flex; align-items:center; justify-content:space-between; gap:12px; list-style:none; cursor:pointer; color:#52613d; font-size:12px; font-weight:600; }
  summary::-webkit-details-marker { display:none; }
  details[open] > summary { margin-bottom:16px; }
  .prompt-preview pre { white-space:pre-wrap; overflow-wrap:anywhere; font-family:inherit; background:#fff; }
  .advanced-setup .k-field { margin-bottom:18px; }
  .readiness-note { border-left:2px solid #c8d49a; padding-left:10px; }
  .config-header { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; font-size:12px; }
  pre { margin:0; background:#f6f7fa; padding:18px; overflow:auto; max-height:360px; border:1px solid #e2e6ed; border-radius:6px; font-size:12px; line-height:1.6; }
  p { margin:12px 0 0; color:#647087; font-size:12px; line-height:1.7; }
  .docs { display:inline-flex; align-items:center; gap:5px; font-size:12px; margin-top:8px; color:#526f28; }
  .local-note { border-left:2px solid #c8d49a; padding-left:10px; }
  .copied { display:flex; align-items:center; gap:6px; color:#526f28; }
  dl { display:grid; grid-template-columns:110px minmax(0,1fr); gap:10px; font-size:13px; }
  dt { color:#647087; } dd { margin:0; overflow-wrap:anywhere; }
</style>
