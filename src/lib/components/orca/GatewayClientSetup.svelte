<script lang="ts">
  import { gatewayClientConfig, localGatewayEndpoint } from '$lib/orca/client-config';
  import { gatewayClientInstructions, type GatewaySetupClient, type GatewaySetupScope } from '$lib/orca/client-instructions';
  import { orcaLocale, t } from '$lib/orca/locale.svelte';
  import { Copy, Check, ExternalLink, ChevronDown } from '@lucide/svelte';
  let { endpoint, ready = true, scope = 'gateway', oauth = true }: { endpoint: string; ready?: boolean; scope?: GatewaySetupScope; oauth?: boolean } = $props();
  const endpointID = $derived(`mcp-endpoint-${scope}-${oauth ? 'oauth' : 'key'}`);
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
    ? t('ต้องเป็นสมาชิกของพื้นที่ทำงาน AI ที่เปิดใช้งานอย่างน้อย 1 แห่งก่อนเชื่อมต่อ', 'You must be a member of at least one active AI workspace before connecting.')
    : t('พื้นที่ทำงาน AI นี้ต้องเปิดใช้งาน และคุณต้องเป็นสมาชิกก่อนเชื่อมต่อ', 'This AI workspace must be active and you must be a member before connecting.'));
  $effect(() => { void client; void endpoint; void scope; void oauth; void orcaLocale.value; copied = ''; error = ''; });
  async function copy(text: string, name: string) {
    copied = ''; error = '';
    try { await navigator.clipboard.writeText(text); copied = name; }
    catch { error = t('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง', 'The text could not be copied automatically. Select and copy it manually.'); }
  }
</script>

<div class="client-setup">
  {#if instructions}
    <div class="link-field"><label for={endpointID}>{scope === 'orca' ? t('ลิงก์เชื่อม AI สำหรับทุกพื้นที่ทำงานของคุณ (MCP URL)', 'AI connection link for all your workspaces (MCP URL)') : t('ลิงก์เชื่อม AI (MCP URL)', 'AI connection link (MCP URL)')}</label>
      <div class="endpoint"><input id={endpointID} readonly value={endpoint} /><button class="k-button" class:primary={oauth} onclick={() => copy(endpoint, t('ลิงก์', 'Link'))} aria-label={t('คัดลอกลิงก์', 'Copy link')}><Copy size={16} aria-hidden="true" />{t('คัดลอกลิงก์', 'Copy link')}</button></div>
    </div>
    <div class="setup-actions"><span class="auth-mode">{oauth ? t('เข้าสู่ระบบด้วยบัญชี ORCA (OAuth)', 'Sign in with your ORCA account (OAuth)') : t('ใช้คีย์ API ส่วนตัว', 'Use a personal API key')}</span><button class="k-button" onclick={() => copy(instructions, t('คำสั่งตั้งค่า', 'Setup instructions'))}><Copy size={16} aria-hidden="true" />{t('คัดลอกคำสั่งตั้งค่า', 'Copy setup instructions')}</button></div>
    {#if !ready}<p class="setup-note">{notReady}</p>{/if}
    <details class="advanced-setup">
      <summary>{t('วิธีตั้งค่า', 'Setup help')}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div class="advanced-body">
      <p class="setup-intro">{oauth
        ? t('เพิ่มลิงก์นี้ในแอป AI ที่รองรับ MCP และ OAuth จากนั้นเข้าสู่ระบบด้วยบัญชี ORCA ของคุณเพื่อยืนยันตัวตน', 'Add this link to an AI app that supports MCP and OAuth, then sign in with your ORCA account to verify your identity.')
        : t('เพิ่มลิงก์นี้ในแอป AI ที่รองรับ MCP และการกำหนด Authorization header จากนั้นใส่คีย์ส่วนตัวในช่องเก็บข้อมูลลับของแอป', 'Add this link to an AI app that supports MCP and custom Authorization headers, then enter your personal key in the app’s secure credential field.')}</p>
      {#if scope === 'orca'}<p>{t('เชื่อม ORCA เพียงครั้งเดียว เพื่อใช้เครื่องมือจากทุกพื้นที่ทำงาน AI ที่คุณได้รับสิทธิ์', 'Connect to ORCA once to use tools from every AI workspace you are allowed to access.')}</p>{/if}
      {#if localGatewayEndpoint(endpoint)}<p class="setup-note">{t('ลิงก์นี้เป็นที่อยู่ภายในเครื่อง ใช้ได้เฉพาะแอปที่ทำงานบนคอมพิวเตอร์เครื่องเดียวกับ ORCA', 'This local link is reachable only by apps on the same computer as ORCA.')}</p>{/if}
      <div class="clients" role="group" aria-label={t('รูปแบบการตั้งค่าด้วยตนเอง', 'Manual configuration format')}>
        <button class:chosen={client === 'manual'} aria-pressed={client === 'manual'} onclick={() => client = 'manual'}>{t('แบบทั่วไป', 'General')}</button>
        <button class:chosen={client === 'codex'} aria-pressed={client === 'codex'} onclick={() => client = 'codex'}>Codex</button>
        <button class:chosen={client === 'cursor'} aria-pressed={client === 'cursor'} onclick={() => client = 'cursor'}>Cursor</button>
        <button class:chosen={client === 'vscode'} aria-pressed={client === 'vscode'} onclick={() => client = 'vscode'}>VS Code</button>
      </div>
      {#if client === 'manual'}
        <dl><dt>{t('การรับส่งข้อมูล', 'Transport')}</dt><dd>Streamable HTTP</dd><dt>{t('การยืนยันตัวตน', 'Authorization')}</dt><dd>{oauth ? 'OAuth' : 'Bearer <personal-key>'}</dd></dl>
        <pre class="prompt-preview" aria-label={t('คำสั่งตั้งค่าการเชื่อมต่อ', 'Connection setup instructions')}>{instructions}</pre>
      {:else if config}
        <div class="config-header"><code>{configPath}</code><button class="k-button small" onclick={() => copy(config, t('การตั้งค่า', 'Configuration'))}><Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}</button></div>
        <pre aria-label={t('การตั้งค่าการเชื่อมต่อ', 'Connection configuration')}>{config}</pre>
        <p>{oauth
          ? t('เพิ่มการตั้งค่านี้ จากนั้นใช้คำสั่งเข้าสู่ระบบ MCP ของแอปเพื่อเปิดหน้ายืนยันสิทธิ์', 'Add this configuration, then use the app’s MCP sign-in command to open the authorization page.')
          : client === 'vscode'
            ? t('กรอกคีย์ส่วนตัวเมื่อ VS Code ขอคีย์สำหรับการเชื่อมต่อ', 'Enter your personal key when VS Code prompts for the connection key.')
            : t('กำหนดตัวแปร ORCA_MCP_KEY ในสภาพแวดล้อม (environment) ที่ใช้เปิดแอป โดยใส่เฉพาะค่าคีย์ ไม่ต้องใส่คำว่า Bearer', 'Set ORCA_MCP_KEY in the environment used to launch the app, using the key value without the Bearer prefix.')}</p>
        <a class="docs" href={docsUrl} target="_blank" rel="noreferrer">{t(`คู่มือการตั้งค่า ${clientName}`, `${clientName} configuration guide`)}<ExternalLink size={14} aria-hidden="true" /></a>
      {/if}
      </div>
    </details>
  {:else}<p class="copy-error" role="alert">{t('ลิงก์เชื่อม AI นี้ใช้สร้างการตั้งค่าไม่ได้ กรุณาติดต่อผู้ดูแลระบบ', 'This AI connection link cannot be used to generate a configuration. Contact your administrator.')}</p>{/if}
  {#if copied}<p role="status" class="copied"><Check size={14} aria-hidden="true" />{t(`คัดลอก${copied}แล้ว`, `${copied} copied`)}</p>{/if}
  {#if error}<p class="copy-error" role="alert">{error}</p>{/if}
</div>

<style>
  .client-setup {
    --setup-mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    min-width: 0;
    color: var(--orca-ink);
  }
  .link-field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .link-field label {
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.45;
  }
  /* The link and its copy button stay on one line; the link shortens with an ellipsis. */
  .endpoint {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .endpoint input {
    flex: 1 1 auto;
    min-width: 0;
    height: 36px;
    padding: 0 11px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface-2);
    color: var(--orca-ink);
    font-family: var(--setup-mono);
    font-size: 13px;
    text-overflow: ellipsis;
  }
  .endpoint input:focus-visible {
    outline: none;
    border-color: var(--orca-ink);
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .endpoint .k-button {
    flex: none;
    white-space: nowrap;
  }
  .setup-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 12px;
  }
  .setup-actions .k-button {
    white-space: nowrap;
  }
  .auth-mode {
    color: var(--orca-muted);
    font-size: 13px;
    font-weight: 500;
  }
  .client-setup .setup-note {
    padding: 8px 12px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface-2);
  }
  .advanced-setup {
    margin-top: 16px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .advanced-setup > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 40px;
    padding: 8px 12px 8px 14px;
    border-radius: var(--orca-radius);
    color: var(--orca-ink);
    font-size: 14px;
    font-weight: 500;
    list-style: none;
    cursor: pointer;
  }
  .advanced-setup > summary::-webkit-details-marker {
    display: none;
  }
  .advanced-setup > summary:hover {
    background: var(--orca-surface-2);
  }
  .advanced-setup > summary:focus-visible {
    outline-offset: -2px;
  }
  .advanced-setup > summary :global(svg) {
    flex: none;
    color: var(--orca-subtle);
    transition: transform 0.15s;
  }
  .advanced-setup[open] > summary {
    border-bottom: 1px solid var(--orca-line);
    border-radius: var(--orca-radius) var(--orca-radius) 0 0;
  }
  .advanced-setup[open] > summary :global(svg) {
    transform: rotate(180deg);
  }
  .advanced-body {
    padding: 12px 14px 14px;
  }
  .client-setup .advanced-body > p:first-child {
    margin-top: 0;
  }
  /* Segmented control for the configuration format. */
  .clients {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    margin: 14px 0 12px;
    padding: 2px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .clients button {
    min-height: 30px;
    padding: 0 11px;
    border: 0;
    border-radius: var(--orca-radius-sm);
    background: transparent;
    color: var(--orca-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .clients button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .clients button.chosen {
    background: var(--orca-secondary);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .advanced-body dl {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 6px 12px;
    margin: 0 0 12px;
    font-size: 13px;
  }
  .advanced-body dt {
    color: var(--orca-muted);
  }
  .advanced-body dd {
    margin: 0;
    font-family: var(--setup-mono);
    overflow-wrap: anywhere;
  }
  .advanced-body pre {
    max-height: 360px;
    margin: 0;
    padding: 12px 14px;
    overflow: auto;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface-2);
    color: var(--orca-ink);
    font-family: var(--setup-mono);
    font-size: 13px;
    line-height: 1.6;
  }
  .prompt-preview {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .config-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .config-header code {
    min-width: 0;
    color: var(--orca-nav);
    font-family: var(--setup-mono);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .client-setup p {
    margin: 12px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.65;
  }
  .advanced-body .docs {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    color: var(--orca-ink);
    font-size: 13px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .client-setup p.copied {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--orca-ok);
  }
  .client-setup p.copy-error {
    color: var(--orca-deny);
  }
  @media (max-width: 600px) {
    .setup-actions .k-button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
