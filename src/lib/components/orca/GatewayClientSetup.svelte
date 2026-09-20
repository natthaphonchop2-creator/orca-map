<script lang="ts">
  import { gatewayClientConfig, localGatewayEndpoint } from '$lib/orca/client-config';
  import { gatewayClientInstructions, type GatewaySetupClient, type GatewaySetupScope } from '$lib/orca/client-instructions';
  import { orcaLocale, t } from '$lib/orca/locale.svelte';
  import { Copy, Check, ExternalLink, ChevronDown } from '@lucide/svelte';
  let { endpoint, ready = true, scope = 'gateway', oauth = false }: { endpoint: string; ready?: boolean; scope?: GatewaySetupScope; oauth?: boolean } = $props();
  let client = $state<GatewaySetupClient>('manual');
  let copied = $state('');
  let error = $state('');
  const config = $derived.by(() => {
    if (client === 'manual') return '';
    try { return gatewayClientConfig(endpoint, client, oauth); } catch { return ''; }
  });
  const instructions = $derived.by(() => {
    try { return gatewayClientInstructions(endpoint, scope, oauth); } catch { return ''; }
  });
  const configPath = $derived(client === 'codex' ? '~/.codex/config.toml' : client === 'cursor' ? '.cursor/mcp.json' : '.vscode/mcp.json');
  const clientName = $derived(client === 'codex' ? 'Codex' : client === 'cursor' ? 'Cursor' : 'VS Code');
  const docsUrl = $derived(client === 'codex' ? 'https://developers.openai.com/codex/mcp' : client === 'cursor' ? 'https://cursor.com/docs/mcp' : 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration');
  const notReady = $derived(scope === 'orca'
    ? t('ต้องได้รับสิทธิ์ใน Gateway ที่เปิดใช้งานก่อนเชื่อมต่อ', 'Join an active Gateway before connecting.')
    : t('ต้องเปิดใช้งาน Gateway และได้รับสิทธิ์สมาชิกก่อนเชื่อมต่อ', 'Activate this Gateway and obtain membership before connecting.'));
  $effect(() => { void client; void endpoint; void scope; void oauth; void orcaLocale.value; copied = ''; error = ''; });
  async function copy(text: string, name: string) {
    copied = ''; error = '';
    try { await navigator.clipboard.writeText(text); copied = name; }
    catch { error = t('เลือกข้อความแล้วคัดลอกด้วยตนเองได้เลย', 'Select and copy the text manually.'); }
  }
</script>

<div class="client-setup">
  {#if instructions}
    <div class="k-field"><label for="hub-endpoint">{scope === 'orca' ? t('URL ของ ORCA MCP', 'ORCA MCP URL') : t('URL ของ MCP Gateway', 'MCP gateway URL')}</label>
      <div class="endpoint"><input id="hub-endpoint" readonly value={endpoint} /><button class="k-button" onclick={() => copy(endpoint, 'URL')} aria-label={t('คัดลอก URL', 'Copy URL')}><Copy size={16} /></button></div>
    </div>
    <div class="setup-actions"><span class="auth-mode">{oauth ? t('เข้าสู่ระบบด้วยบัญชีองค์กร', 'Organization sign-in') : 'API key'}</span><button class="k-button primary" onclick={() => copy(instructions, t('คำสั่งตั้งค่า', 'Setup instructions'))}><Copy size={16} />{t('คัดลอกคำสั่งตั้งค่า', 'Copy setup instructions')}</button></div>
    {#if !ready}<p class="readiness-note">{notReady}</p>{/if}
    <details class="advanced-setup">
      <summary>{t('วิธีตั้งค่า', 'Setup help')}<ChevronDown size={15} /></summary>
      <p class="setup-intro">{oauth
        ? t('เพิ่ม URL ในแอป AI ที่รองรับ MCP และ OAuth แล้วกดเข้าสู่ระบบด้วยบัญชีองค์กร', 'Add this URL to an AI app that supports MCP and OAuth, then sign in with your organization account.')
        : t('เพิ่ม URL ในแอปที่รองรับ MCP และ Authorization header แล้วใส่คีย์ส่วนตัวในช่องเก็บคีย์ของแอป', 'Add this URL to an app supporting MCP and custom Authorization headers. Enter your personal key in its secure credential field.')}</p>
      {#if scope === 'orca'}<p>{t('เชื่อม ORCA ครั้งเดียว เพื่อใช้เครื่องมือจากทุก Gateway ที่คุณได้รับสิทธิ์', 'Connect to ORCA once to use tools from every Gateway you are allowed to access.')}</p>{/if}
      {#if localGatewayEndpoint(endpoint)}<p class="local-note">{t('URL นี้ใช้กับแอปบนเครื่องเดียวกับ ORCA เท่านั้น', 'This local URL is reachable only by apps on the same computer as ORCA.')}</p>{/if}
      <div class="clients" role="group" aria-label={t('รูปแบบการตั้งค่าด้วยตนเอง', 'Manual configuration format')}>
        <button class:chosen={client === 'manual'} aria-pressed={client === 'manual'} onclick={() => client = 'manual'}>{t('แบบทั่วไป', 'General')}</button>
        <button class:chosen={client === 'codex'} aria-pressed={client === 'codex'} onclick={() => client = 'codex'}>Codex</button>
        <button class:chosen={client === 'cursor'} aria-pressed={client === 'cursor'} onclick={() => client = 'cursor'}>Cursor</button>
        <button class:chosen={client === 'vscode'} aria-pressed={client === 'vscode'} onclick={() => client = 'vscode'}>VS Code</button>
      </div>
      {#if client === 'manual'}
        <dl><dt>Transport</dt><dd>Streamable HTTP</dd><dt>Authorization</dt><dd>{oauth ? 'OAuth' : 'Bearer <personal-key>'}</dd></dl>
        <pre class="prompt-preview" aria-label={t('คำสั่งตั้งค่า MCP', 'MCP setup instructions')}>{instructions}</pre>
      {:else if config}
        <div class="config-header"><strong>{configPath}</strong><button class="k-button small" onclick={() => copy(config, t('การตั้งค่า', 'Configuration'))}><Copy size={14} />{t('คัดลอก', 'Copy')}</button></div>
        <pre aria-label={t('การตั้งค่า MCP', 'MCP configuration')}>{config}</pre>
        <p>{oauth
          ? t('เพิ่มการตั้งค่านี้ แล้วใช้คำสั่งเข้าสู่ระบบ MCP ของแอปเพื่อเปิดหน้าอนุญาต', 'Add this configuration, then use your client’s MCP sign-in action to open authorization.')
          : client === 'vscode'
            ? t('กรอกคีย์ส่วนตัวเมื่อ VS Code ขอคีย์สำหรับการเชื่อมต่อ', 'Enter your personal key when VS Code prompts for the connection key.')
            : t('ตั้งค่า ORCA_MCP_KEY ใน environment ของแอป โดยใส่เฉพาะค่าคีย์และไม่เติม Bearer', 'Set ORCA_MCP_KEY in the environment used to launch the app, using the key value without the Bearer prefix.')}</p>
        <a class="docs" href={docsUrl} target="_blank" rel="noreferrer">{t('คู่มือการตั้งค่า', 'Configuration guide')} {clientName}<ExternalLink size={13} /></a>
      {/if}
    </details>
  {:else}<p role="alert">{t('URL ยังไม่พร้อมสำหรับสร้างการตั้งค่า กรุณาติดต่อผู้ดูแล', 'The endpoint cannot be used to generate a configuration. Contact your administrator.')}</p>{/if}
  {#if copied}<p role="status" class="copied"><Check size={14} />{t(`คัดลอก${copied}แล้ว`, `${copied} copied`)}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .client-setup { min-width:0; }
  .endpoint { display:flex; gap:8px; }
  .endpoint input { min-width:0; }
  .setup-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; margin-top:18px; }
  .auth-mode { color:#4f6240; font-size:13px; font-weight:600; }
  .clients { display:flex; gap:6px; margin:20px 0 16px; flex-wrap:wrap; }
  .clients button { border:1px solid #e1e5ed; border-radius:6px; background:white; padding:8px 13px; font:inherit; font-size:12px; cursor:pointer; color:#647087; }
  .clients button.chosen { background:#191f2c; color:#def589; border-color:#191f2c; }
  .advanced-setup { margin-top:20px; border:1px solid #e1e5ed; border-radius:8px; padding:16px; }
  summary { display:flex; align-items:center; justify-content:space-between; gap:12px; list-style:none; cursor:pointer; color:#52613d; font-size:13px; font-weight:600; }
  summary::-webkit-details-marker { display:none; }
  details[open] > summary { margin-bottom:16px; }
  .prompt-preview { white-space:pre-wrap; overflow-wrap:anywhere; font-family:inherit; }
  .readiness-note { border-left:2px solid #c8d49a; padding-left:10px; }
  .config-header { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; font-size:12px; }
  pre { margin:0; background:#f6f7fa; padding:18px; overflow:auto; max-height:360px; border:1px solid #e2e6ed; border-radius:6px; font-size:12px; line-height:1.6; }
  p { margin:12px 0 0; color:#647087; font-size:13px; line-height:1.7; }
  .docs { display:inline-flex; align-items:center; gap:5px; font-size:13px; margin-top:12px; color:#526f28; }
  .local-note { border-left:2px solid #c8d49a; padding-left:10px; }
  .copied { display:flex; align-items:center; gap:6px; color:#526f28; }
  dl { display:grid; grid-template-columns:110px minmax(0,1fr); gap:10px; font-size:13px; }
  dt { color:#647087; } dd { margin:0; overflow-wrap:anywhere; }
  @media(max-width:600px) { .setup-actions .k-button { width:100%; justify-content:center; } }
</style>
