<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, ChevronDown, Copy, ExternalLink, Info } from '@lucide/svelte';
	import type { AIApp } from '$lib/orca/client-config';
	import { CONNECTOR_PAGES, appName, devAfterStep, devSetup, isChatApp, otherAppInstructions } from '$lib/orca/connect-ai';
	import { localGatewayEndpoint } from '$lib/orca/client-config';
	import { t } from '$lib/orca/locale.svelte';
	import { copyFeedback, copyText } from '../ui/copy';

	// Step 3: what to do inside the chosen app. Claude and ChatGPT get three
	// short steps (ก ข ค) in their own menu names; developer tools get their
	// command, one-click install or config, as before.
	let { app, endpoint, connector, companyName = '' }: { app: AIApp; endpoint: string; connector: string; companyName?: string } = $props();
	const name = $derived(appName(app, t));
	const setup = $derived(devSetup(app, endpoint, true));
	const after = $derived(devAfterStep(app, true, t));
	const instructions = $derived(app === 'other' ? otherAppInstructions(endpoint, true, companyName) : '');
	const letters = $derived(t('กขค', 'abc'));

	let copied = $state('');
	let failed = $state(false);
	const feedback = copyFeedback((on) => {
		if (!on) copied = '';
	});
	onDestroy(() => feedback.dispose());
	async function copy(text: string, what: string) {
		failed = false;
		const ok = await copyText(text, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) {
			copied = what;
			feedback.copied();
		} else failed = true;
	}
</script>

{#snippet key(label: string)}<kbd>{label}</kbd>{/snippet}
<!-- <wbr> lets a long menu path (ChatGPT's) wrap after an arrow on a phone instead of running off the edge. -->
{#snippet arrow()}<span class="ca-arrow" aria-hidden="true">→</span><wbr />{/snippet}

{#if isChatApp(app)}
	{#if app === 'chatgpt'}
		<p class="ca-need"><Info size={16} aria-hidden="true" />{t('ต้องเปิด Developer mode ก่อน ใช้ได้กับ ChatGPT Plus, Pro หรือ Business', 'Developer mode must be on first. It is available on ChatGPT Plus, Pro and Business.')}</p>
	{/if}
	<ol class="ca-mini">
		{#if app === 'claude'}
			<li><span class="ca-letter" aria-hidden="true">{letters[0]}</span><div>{t('เปิด Claude แล้วไปที่', 'Open Claude and go to')} {@render key('Settings')}{@render arrow()}{@render key('Connectors')}</div></li>
			<li><span class="ca-letter" aria-hidden="true">{letters[1]}</span><div>{t('กด', 'Choose')} {@render key('Add custom connector')} {t('แล้วพิมพ์ชื่อ', 'and type the name')} <b>{connector}</b></div></li>
			<li><span class="ca-letter" aria-hidden="true">{letters[2]}</span><div>{t('วางลิงก์ ORCA ของบริษัท กด', 'Paste your company’s ORCA link, choose')} {@render key('Add')} {t('แล้วกด', 'then')} {@render key('Connect')}</div></li>
		{:else}
			<li><span class="ca-letter" aria-hidden="true">{letters[0]}</span><div>{t('เปิด ChatGPT ไปที่', 'Open ChatGPT, go to')} {@render key('Settings')}{@render arrow()}{@render key('Apps & Connectors')}{@render arrow()}{@render key('Advanced settings')} {t('แล้วเปิด', 'and turn on')} {@render key('Developer mode')}</div></li>
			<li><span class="ca-letter" aria-hidden="true">{letters[1]}</span><div>{t('กลับมาที่', 'Back in')} {@render key('Apps & Connectors')} {t('กด', 'choose')} {@render key('Create')} {t('แล้วพิมพ์ชื่อ', 'and type the name')} <b>{connector}</b></div></li>
			<li><span class="ca-letter" aria-hidden="true">{letters[2]}</span><div>{t('วางลิงก์ ORCA ของบริษัท เลือก', 'Paste your company’s ORCA link, choose')} {@render key('OAuth')} {t('แล้วกด', 'then')} {@render key('Create')}</div></li>
		{/if}
	</ol>
	<div class="ca-act">
		<a class="k-button" href={CONNECTOR_PAGES[app]} target="_blank" rel="noopener noreferrer">
			{app === 'claude' ? t('เปิดหน้า Connectors ของ Claude', "Open Claude's Connectors") : t('เปิด ChatGPT', 'Open ChatGPT')}<ExternalLink size={16} aria-hidden="true" />
		</a>
		<span class="ca-small">{app === 'claude'
			? t('ใช้ Claude แบบ Team หรือ Enterprise? ให้ผู้ดูแล Claude เพิ่ม ORCA ก่อน', 'On Claude Team or Enterprise? Ask your Claude admin to add ORCA first.')
			: t('ใช้ ChatGPT Business? ให้ผู้ดูแล ChatGPT เปิด Developer mode ให้ก่อน', 'On ChatGPT Business? Ask your ChatGPT admin to allow Developer mode first.')}</span>
	</div>
{:else}
	<div class="ca-dev">
		{#if setup.installLink}
			<a class="k-button" href={setup.installLink}>{t(`เพิ่มใน ${name}`, `Add to ${name}`)}<ExternalLink size={16} aria-hidden="true" /></a>
		{/if}
		{#if setup.commands.length}
			<ol class="ca-commands">
				{#each setup.commands as command, index (command)}
					<li>
						<code>{command}</code>
						<button type="button" class="k-button small" onclick={() => copy(command, `command-${index}`)} aria-label={t(`คัดลอกคำสั่งที่ ${index + 1}`, `Copy command ${index + 1}`)}>
							{#if copied === `command-${index}`}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}{/if}
						</button>
					</li>
				{/each}
			</ol>
		{/if}
		{#if after}<p class="ca-after">{after}</p>{/if}
		{#if app === 'other'}
			<p class="ca-after">{t('เพิ่มลิงก์ ORCA ของบริษัทในแอปที่รองรับ MCP และการเข้าสู่ระบบแบบ OAuth หรือให้ AI ในแอปนั้นช่วยตั้งค่าด้วยข้อความนี้', 'Add your company’s ORCA link to an app that supports MCP with OAuth sign-in, or let that app’s AI set it up with this text.')}</p>
			<dl class="ca-facts"><dt>{t('การรับส่งข้อมูล', 'Transport')}</dt><dd>Streamable HTTP</dd><dt>{t('การยืนยันตัวตน', 'Authorization')}</dt><dd>OAuth</dd></dl>
			{#if instructions}
				<button type="button" class="k-button" onclick={() => copy(instructions, 'instructions')}>
					{#if copied === 'instructions'}<Check size={16} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={16} aria-hidden="true" />{t('คัดลอกคำสั่งตั้งค่า', 'Copy setup instructions')}{/if}
				</button>
			{/if}
		{/if}
		{#if setup.config}
			<details class="ca-config" open={!setup.installLink && !setup.commands.length}>
				<summary>{setup.installLink || setup.commands.length ? t('ติดตั้งไม่ได้? ตั้งค่าเอง', 'Quick setup not working? Set it up by hand') : t('ค่าที่ต้องเพิ่ม', 'Configuration to add')}<ChevronDown size={16} aria-hidden="true" /></summary>
				<div class="ca-config-body">
					<div class="ca-config-head">
						<code>{setup.configPath}</code>
						<button type="button" class="k-button small" onclick={() => copy(setup.config, 'config')}>
							{#if copied === 'config'}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}{/if}
						</button>
					</div>
					<pre>{setup.config}</pre>
					<a class="ca-docs" href={setup.docsUrl} target="_blank" rel="noopener noreferrer">{t(`คู่มือการตั้งค่า ${name}`, `${name} setup guide`)}<ExternalLink size={14} aria-hidden="true" /></a>
				</div>
			</details>
		{/if}
		{#if localGatewayEndpoint(endpoint)}<p class="ca-after">{t('ลิงก์นี้เป็นที่อยู่ในเครื่อง ใช้ได้เฉพาะแอปที่ทำงานบนคอมพิวเตอร์เครื่องเดียวกับ ORCA', 'This local link works only for apps on the same computer as ORCA.')}</p>{/if}
	</div>
{/if}
<span class="ca-announce" role="status" aria-live="polite">{copied ? t('คัดลอกแล้ว', 'Copied') : ''}</span>
{#if failed}<p class="ca-failed" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}

<style>
	/* orca-type-remap v1 */
	.ca-need {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 12px;
		padding: 10px 14px;
		border: 1px solid var(--orca-warn-line);
		border-radius: var(--orca-radius);
		background: var(--orca-warn-bg);
		color: var(--orca-ink);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.ca-need :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--orca-warn);
	}
	.ca-mini {
		margin: 0;
		padding: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		list-style: none;
	}
	.ca-mini li {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 13px 18px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.9;
	}
	.ca-mini li:first-child {
		border-top: 0;
	}
	.ca-mini li > div {
		min-width: 0;
	}
	.ca-letter {
		display: grid;
		flex: none;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 11.5px;
		font-weight: 700;
		line-height: 1;
	}
	.ca-arrow {
		margin: 0 6px;
		color: var(--orca-subtle);
	}
	kbd {
		padding: 2px 8px;
		border: 1px solid var(--orca-line-strong);
		border-bottom-width: 2px;
		border-radius: 6px;
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}
	.ca-mini b {
		font-weight: 650;
	}
	.ca-act {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		margin-top: 14px;
	}
	.ca-act .k-button {
		min-height: 42px;
		padding: 0 16px;
		font-weight: 600;
	}
	.ca-small {
		flex: 1 1 260px;
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.ca-dev {
		display: grid;
		justify-items: start;
		gap: 12px;
	}
	.ca-commands {
		display: grid;
		gap: 8px;
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ca-commands li {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		padding: 8px 8px 8px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
	}
	.ca-commands code,
	.ca-config-head code {
		flex: 1;
		min-width: 0;
		color: var(--orca-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.ca-commands .k-button {
		flex: none;
	}
	.ca-after {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.6;
	}
	.ca-facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 16px;
		margin: 0;
		font-size: 13px;
	}
	.ca-facts dt {
		color: var(--orca-muted);
	}
	.ca-facts dd {
		margin: 0;
		color: var(--orca-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12.5px;
	}
	.ca-config {
		width: 100%;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
	}
	.ca-config > summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 40px;
		padding: 8px 12px 8px 14px;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 500;
		list-style: none;
		cursor: pointer;
	}
	.ca-config > summary::-webkit-details-marker {
		display: none;
	}
	.ca-config > summary :global(svg) {
		flex: none;
		color: var(--orca-subtle);
		transition: transform 0.15s var(--orca-ease);
	}
	.ca-config[open] > summary {
		border-bottom: 1px solid var(--orca-line);
	}
	.ca-config[open] > summary :global(svg) {
		transform: rotate(180deg);
	}
	.ca-config-body {
		display: grid;
		gap: 10px;
		padding: 12px 14px 14px;
	}
	.ca-config-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ca-config pre {
		margin: 0;
		padding: 12px 14px;
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 12px;
		line-height: 1.55;
	}
	.ca-docs {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--orca-ink);
		font-size: 13px;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.ca-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.ca-failed {
		margin: 10px 0 0;
		color: var(--orca-deny);
		font-size: 12.5px;
	}
	@container ca (max-width: 560px) {
		.ca-mini li {
			align-items: flex-start;
			padding: 12px 14px;
			font-size: 13.5px;
		}
		.ca-letter {
			margin-top: 4px;
		}
	}
</style>
