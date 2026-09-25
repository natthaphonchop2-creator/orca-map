<script lang="ts">
  import { AI_APPS, gatewayClientCommands, gatewayClientConfig, gatewayInstallLink, localGatewayEndpoint, type AIApp, type GatewayClient } from '$lib/orca/client-config';
  import { gatewayClientInstructions, type GatewaySetupScope } from '$lib/orca/client-instructions';
  import { orcaLocale, t } from '$lib/orca/locale.svelte';
  import { Copy, Check, ExternalLink, ChevronDown, ArrowRight } from '@lucide/svelte';
  let { endpoint, ready = true, scope = 'gateway', oauth = true }: { endpoint: string; ready?: boolean; scope?: GatewaySetupScope; oauth?: boolean } = $props();
  const endpointID = $derived(`mcp-endpoint-${scope}-${oauth ? 'oauth' : 'key'}`);
  const appID = $derived(`ai-app-${scope}-${oauth ? 'oauth' : 'key'}`);
  // The chosen app is a per-viewer convenience; storage may be unavailable.
  const APP_KEY = 'orca.aiApp';
  function rememberedApp(): AIApp {
    try { const value = localStorage.getItem(APP_KEY); if (value && (AI_APPS as string[]).includes(value)) return value as AIApp; } catch { /* storage unavailable */ }
    return 'chatgpt';
  }
  let app = $state<AIApp>(rememberedApp());
  $effect(() => { try { localStorage.setItem(APP_KEY, app); } catch { /* storage unavailable */ } });
  let copied = $state('');
  let error = $state('');
  const names: Record<AIApp, string> = { chatgpt: 'ChatGPT', claude: 'Claude', 'claude-code': 'Claude Code', codex: 'Codex', cursor: 'Cursor', vscode: 'VS Code', windsurf: 'Windsurf', other: '' };
  const appName = (value: AIApp) => names[value] || t('แอปอื่น', 'Another app');
  const configClient = $derived<GatewayClient | null>(app === 'codex' || app === 'cursor' || app === 'vscode' || app === 'windsurf' ? app : null);
  const config = $derived.by(() => {
    if (!configClient) return '';
    try { return gatewayClientConfig(endpoint, configClient, oauth); } catch { return ''; }
  });
  const installLink = $derived.by(() => { try { return gatewayInstallLink(endpoint, app, oauth); } catch { return ''; } });
  const commands = $derived.by(() => { try { return gatewayClientCommands(endpoint, app, oauth); } catch { return []; } });
  const instructions = $derived.by(() => {
    try { return gatewayClientInstructions(endpoint, scope, oauth); } catch { return ''; }
  });
  // Chat apps connect only through OAuth, in their own settings.
  const chatApp = $derived(app === 'chatgpt' || app === 'claude');
  const steps = $derived.by(() => {
    if (!oauth) return [];
    if (app === 'chatgpt') return [
      t('เปิด ChatGPT แล้วไปที่ ตั้งค่า → Apps & Connectors', 'In ChatGPT, open Settings → Apps & Connectors.'),
      t('ใน Advanced settings เปิด Developer mode (ใช้ได้กับแพ็กเกจที่รองรับ เช่น Plus, Pro, Business)', 'Under Advanced settings, turn on Developer mode (on plans that support it, such as Plus, Pro and Business).'),
      t('กด Create ตั้งชื่อ ORCA วางลิงก์เชื่อม AI ด้านบน แล้วเลือกการยืนยันตัวตนแบบ OAuth', 'Choose Create, name it ORCA, paste the AI connection link above, and choose OAuth authentication.'),
      t('กด Create แล้วเข้าสู่ระบบด้วยบัญชี ORCA ของคุณ', 'Choose Create, then sign in with your ORCA account.')
    ];
    if (app === 'claude') return [
      t('เปิด Claude (เว็บหรือแอปเดสก์ท็อป) แล้วไปที่ Settings → Connectors', 'In Claude (web or desktop), open Settings → Connectors.'),
      t('กด Add custom connector ตั้งชื่อ ORCA แล้ววางลิงก์เชื่อม AI ด้านบน', 'Choose Add custom connector, name it ORCA, and paste the AI connection link above.'),
      t('กด Add แล้ว Connect จากนั้นเข้าสู่ระบบด้วยบัญชี ORCA ของคุณ', 'Choose Add, then Connect, and sign in with your ORCA account.'),
      t('ถ้าใช้ Claude แบบองค์กร (Team หรือ Enterprise) ผู้ดูแลต้องเพิ่ม connector ในการตั้งค่าองค์กรก่อน', 'On a Team or Enterprise plan, an owner adds the connector in the organization settings first.')
    ];
    return [];
  });
  const afterInstall = $derived.by(() => {
    if (app === 'cursor') return t('ใน Cursor กด Install แล้วกด Connect เพื่อเข้าสู่ระบบ ORCA', 'In Cursor, choose Install, then Connect to sign in to ORCA.');
    if (app === 'vscode') return t('ใน VS Code กด Install แล้วเริ่มการเชื่อมต่อ ระบบจะเปิดหน้าเข้าสู่ระบบ ORCA', 'In VS Code, choose Install and start the server; it opens the ORCA sign-in page.');
    if (app === 'claude-code') return oauth ? t('จากนั้นพิมพ์ /mcp ใน Claude Code แล้วเลือก orca เพื่อเข้าสู่ระบบ', 'Then type /mcp in Claude Code and choose orca to sign in.') : t('ตั้งตัวแปร ORCA_MCP_KEY ก่อนรันคำสั่ง', 'Set ORCA_MCP_KEY before running the command.');
    if (app === 'codex') return oauth ? t('คำสั่งที่สองจะเปิดหน้าเข้าสู่ระบบ ORCA', 'The second command opens the ORCA sign-in page.') : t('ตั้งตัวแปร ORCA_MCP_KEY ในสภาพแวดล้อมที่ใช้เปิด Codex', 'Set ORCA_MCP_KEY in the environment Codex starts from.');
    if (app === 'windsurf') return t('บันทึกไฟล์แล้วกด Refresh ในแผง MCP ของ Windsurf', 'Save the file, then choose Refresh in Windsurf’s MCP panel.');
    return '';
  });
  const configPath = $derived(app === 'codex' ? '~/.codex/config.toml' : app === 'cursor' ? '.cursor/mcp.json' : app === 'windsurf' ? '~/.codeium/windsurf/mcp_config.json' : '.vscode/mcp.json');
  const docsUrl = $derived(app === 'codex' ? 'https://developers.openai.com/codex/mcp' : app === 'cursor' ? 'https://cursor.com/docs/mcp' : app === 'windsurf' ? 'https://docs.windsurf.com/windsurf/cascade/mcp' : 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration');
  const notReady = $derived(scope === 'orca'
    ? t('ต้องเป็นสมาชิกของพื้นที่ทำงาน AI ที่เปิดใช้งานอย่างน้อย 1 แห่งก่อนเชื่อมต่อ', 'You must be a member of at least one active AI workspace before connecting.')
    : t('พื้นที่ทำงาน AI นี้ต้องเปิดใช้งาน และคุณต้องเป็นสมาชิกก่อนเชื่อมต่อ', 'This AI workspace must be active and you must be a member before connecting.'));
  $effect(() => { void app; void endpoint; void scope; void oauth; void orcaLocale.value; copied = ''; error = ''; });
  async function copy(text: string, name: string) {
    copied = ''; error = '';
    try { await navigator.clipboard.writeText(text); copied = name; }
    catch { error = t('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง', 'The text could not be copied automatically. Select and copy it manually.'); }
  }
</script>

<div class="client-setup">
  {#if instructions}
    <div class="link-field"><label for={endpointID}>{scope === 'orca' ? t('ลิงก์เชื่อม AI สำหรับทุกพื้นที่ทำงานของคุณ (MCP URL)', 'AI connection link for all your workspaces (MCP URL)') : t('ลิงก์เชื่อม AI (MCP URL)', 'AI connection link (MCP URL)')}</label>
      <div class="endpoint"><input id={endpointID} readonly value={endpoint} /><button class="k-button" onclick={() => copy(endpoint, t('ลิงก์', 'Link'))} aria-label={t('คัดลอกลิงก์', 'Copy link')}><Copy size={16} aria-hidden="true" />{t('คัดลอกลิงก์', 'Copy link')}</button></div>
      <p class="link-hint">{scope === 'orca' ? t('ลิงก์เดียวใช้ได้กับทุกพื้นที่ทำงาน AI ที่คุณได้รับสิทธิ์ ', 'One link for every AI workspace you can access. ') : ''}{oauth
        ? t('แต่ละคนเข้าสู่ระบบด้วยบัญชี ORCA ของตัวเอง (OAuth)', 'Each person signs in with their own ORCA account (OAuth).')
        : t('ใช้คีย์ API ส่วนตัว เก็บคีย์ไว้ในการตั้งค่าของแอป ห้ามวางในแชท', 'Uses a personal API key. Keep the key in the app’s settings, never in a chat.')}</p>
    </div>
    {#if !ready}<p class="setup-note">{notReady}</p>{/if}
    <div class="app-field">
      <label for={appID}>{t('แอป AI ที่คุณใช้', 'Your AI app')}</label>
      <select id={appID} bind:value={app}>{#each AI_APPS as value (value)}<option {value}>{appName(value)}</option>{/each}</select>
    </div>
    <div class="app-panel" aria-live="polite">
      {#if installLink}
        <a class="k-button primary install" href={installLink}><span>{t(`เพิ่มใน ${appName(app)}`, `Add to ${appName(app)}`)}</span><ArrowRight size={16} aria-hidden="true" /></a>
      {/if}
      {#if commands.length}
        <ol class="connect-commands">{#each commands as command, i (command)}<li><div class="command-row"><code>{command}</code><button class="k-button small" onclick={() => copy(command, t('คำสั่ง', 'Command'))} aria-label={t(`คัดลอกคำสั่งที่ ${i + 1}`, `Copy command ${i + 1}`)}><Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}</button></div></li>{/each}</ol>
      {/if}
      {#if steps.length}
        <ol class="connect-steps">{#each steps as step (step)}<li>{step}</li>{/each}</ol>
      {/if}
      {#if chatApp && !oauth}<p class="setup-note">{t(`${appName(app)} เชื่อมได้เฉพาะการเข้าสู่ระบบด้วยบัญชี ORCA (OAuth) ใช้ลิงก์แบบเข้าสู่ระบบแทนคีย์ส่วนตัว`, `${appName(app)} connects only by signing in with your ORCA account (OAuth). Use the sign-in link instead of a personal key.`)}</p>{/if}
      {#if afterInstall}<p class="after">{afterInstall}</p>{/if}
      {#if app === 'other'}
        <p class="setup-intro">{oauth
          ? t('เพิ่มลิงก์นี้ในแอป AI ที่รองรับ MCP และ OAuth จากนั้นเข้าสู่ระบบด้วยบัญชี ORCA ของคุณเพื่อยืนยันตัวตน', 'Add this link to an AI app that supports MCP and OAuth, then sign in with your ORCA account to verify your identity.')
          : t('เพิ่มลิงก์นี้ในแอป AI ที่รองรับ MCP และการกำหนด Authorization header จากนั้นใส่คีย์ส่วนตัวในช่องเก็บข้อมูลลับของแอป', 'Add this link to an AI app that supports MCP and custom Authorization headers, then enter your personal key in the app’s secure credential field.')}</p>
        <dl><dt>{t('การรับส่งข้อมูล', 'Transport')}</dt><dd>Streamable HTTP</dd><dt>{t('การยืนยันตัวตน', 'Authorization')}</dt><dd>{oauth ? 'OAuth' : 'Bearer <personal-key>'}</dd></dl>
        <div class="setup-actions"><span class="auth-mode">{t('ให้ AI ช่วยตั้งค่าแทน', 'Let your AI set it up')}</span><button class="k-button" onclick={() => copy(instructions, t('คำสั่งตั้งค่า', 'Setup instructions'))}><Copy size={16} aria-hidden="true" />{t('คัดลอกคำสั่งตั้งค่า', 'Copy setup instructions')}</button></div>
        <pre class="prompt-preview" aria-label={t('ข้อความตั้งค่าสำหรับแอป AI', 'Setup instructions for your AI app')}>{instructions}</pre>
      {/if}
      {#if localGatewayEndpoint(endpoint)}<p class="setup-note">{t('ลิงก์นี้เป็นที่อยู่ภายในเครื่อง ใช้ได้เฉพาะแอปที่ทำงานบนคอมพิวเตอร์เครื่องเดียวกับ ORCA', 'This local link is reachable only by apps on the same computer as ORCA.')}</p>{/if}
    </div>
    {#if config}
      <details class="advanced-setup" open={!installLink && !commands.length}>
        <summary>{installLink || commands.length ? t('ติดตั้งไม่ได้? ตั้งค่าเอง', 'Quick install not working? Set it up manually') : t('ค่าที่ต้องเพิ่ม', 'Configuration to add')}<ChevronDown size={16} aria-hidden="true" /></summary>
        <div class="advanced-body">
          <div class="config-header"><code>{configPath}</code><button class="k-button small" onclick={() => copy(config, t('การตั้งค่า', 'Configuration'))}><Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}</button></div>
          <pre aria-label={t('การตั้งค่าการเชื่อมต่อ', 'Connection configuration')}>{config}</pre>
          <a class="docs" href={docsUrl} target="_blank" rel="noreferrer">{t(`คู่มือการตั้งค่า ${appName(app)}`, `${appName(app)} configuration guide`)}<ExternalLink size={14} aria-hidden="true" /></a>
        </div>
      </details>
    {/if}
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
  .client-setup .link-field p.link-hint {
    margin: 0;
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
  .app-panel dl {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 6px 12px;
    margin: 0 0 12px;
    font-size: 13px;
  }
  .app-panel dt {
    color: var(--orca-muted);
  }
  .app-panel dd {
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
  /* App picker and its panel. */
  .app-field {
    display: grid;
    gap: 6px;
    margin-top: 16px;
  }
  .app-field label {
    font-size: 13.5px;
    font-weight: 600;
  }
  .app-field select {
    height: 36px;
    max-width: 280px;
    padding: 0 10px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
  }
  .app-panel {
    container-type: inline-size;
    display: grid;
    gap: 10px;
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .app-panel > :global(*),
  .client-setup .app-panel > p {
    margin: 0;
  }
  .install {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    font-weight: 600;
    text-decoration: none;
  }
  .install:focus-visible {
    outline: 2px solid var(--orca-ink);
    outline-offset: 2px;
  }
  /* Unique names: daisyUI ships a global horizontal .steps component, and the
     reset strips list numbers, so both lists set their own layout and markers. */
  .connect-commands,
  .connect-steps {
    display: grid;
    gap: 8px;
    padding-left: 22px;
    font-size: 13.5px;
    line-height: 1.6;
    list-style: decimal;
  }
  .connect-commands li,
  .connect-steps li {
    display: list-item;
    padding-left: 2px;
  }
  .connect-commands li::marker,
  .connect-steps li::marker {
    color: var(--orca-muted);
    font-weight: 600;
  }
  .command-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .command-row .k-button {
    flex: none;
    white-space: nowrap;
  }
  /* Narrow panels (phones, side drawers) put the copy button under the command. */
  @container (max-width: 440px) {
    .command-row {
      flex-direction: column;
    }
  }
  .app-panel pre.prompt-preview {
    max-height: 220px;
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-sm);
    background: var(--orca-surface-2);
    color: var(--orca-ink);
    font-family: var(--setup-mono);
    font-size: 12.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .connect-commands code {
    flex: 1 1 auto;
    align-self: stretch;
    min-width: 0;
    display: block;
    padding: 8px 10px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-sm);
    background: var(--orca-surface-2);
    font-family: var(--setup-mono);
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .client-setup p.after {
    color: var(--orca-ink);
  }
  @media (max-width: 600px) {
    .setup-actions .k-button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
