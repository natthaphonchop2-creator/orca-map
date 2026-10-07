<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Check, ChevronRight, Copy, Eye, EyeOff, KeyRound } from '@lucide/svelte';
	import type { AIApp } from '$lib/orca/client-config';
	import {
		DEFAULT_KEY_DAYS,
		appName,
		devAfterStep,
		devSetup,
		isChatApp,
		keyExpiryError,
		keyExpiryOptions,
		keyNameError,
		otherAppInstructions,
		validConnectLink
	} from '$lib/orca/connect-ai';
	import { clientNames } from '$lib/orca/client-config';
	import { t } from '$lib/orca/locale.svelte';
	import { OrcaService, orcaError, type OrcaHub } from '$lib/services/orca';
	import FormErrorSummary from '../ui/FormErrorSummary.svelte';
	import { copyFeedback, copyText } from '../ui/copy';

	// "สำหรับนักพัฒนา: เชื่อมด้วยคีย์": a key for scripts and tools that cannot
	// sign in. Company-wide, or for one workspace (critique 10); 30 days by
	// default, never-expiring only for owners and admins. The key is shown once,
	// with the key-mode setup for the developer tool chosen in step 1.
	let {
		hubs,
		endpoint,
		app,
		canManage,
		identity,
		companyName = '',
		oncreated
	}: {
		/** Workspaces the company link reaches for this person. */
		hubs: OrcaHub[];
		endpoint: string;
		app: AIApp;
		canManage: boolean;
		/** Who and where: the created key is forgotten when it changes. */
		identity: string;
		companyName?: string;
		oncreated: () => void | Promise<void>;
	} = $props();
	const uid = $props.id();
	const nameID = `ca-key-name-${uid}`;
	const scopeID = `ca-key-scope-${uid}`;
	const daysID = `ca-key-days-${uid}`;

	let name = $state('');
	let scope = $state('');
	let days = $state<number>(DEFAULT_KEY_DAYS);
	let errors = $state<Record<string, string>>({});
	let attempt = $state(0);
	let creating = $state(false);
	let failure = $state('');
	let created = $state<{ key: string; name: string; endpoint: string }>();
	let reveal = $state(false);
	let generation = 0;

	const options = $derived(keyExpiryOptions(canManage));
	const tool = $derived<AIApp>(isChatApp(app) ? 'other' : app);
	const scopeHub = $derived(hubs.find((hub) => hub.id === scope));
	const keyEndpoint = $derived(created?.endpoint || (scopeHub && validConnectLink(scopeHub.connectURL) ? scopeHub.connectURL : endpoint));
	const setup = $derived(devSetup(tool, keyEndpoint, false));
	const after = $derived(devAfterStep(tool, false, t));
	const instructions = $derived(tool === 'other' ? otherAppInstructions(keyEndpoint, false, companyName) : '');
	const names = $derived(clientNames());

	function forget() {
		generation += 1;
		created = undefined;
		reveal = false;
		creating = false;
	}
	// Another account, company or link: the one-time key belongs to the old one.
	$effect(() => {
		void identity;
		untrack(() => {
			forget();
			name = '';
			scope = '';
			days = DEFAULT_KEY_DAYS;
			errors = {};
			failure = '';
		});
	});
	// Access changed (a workspace or department grant removed): the one-time key
	// is not shown any longer; it stays listed above for ตัดการเชื่อมต่อ.
	const accessSignature = $derived(hubs.map((hub) => hub.id).sort().join('\n'));
	let previousAccess: string | undefined;
	$effect(() => {
		const signature = accessSignature;
		untrack(() => {
			if (previousAccess !== undefined && signature !== previousAccess) forget();
			previousAccess = signature;
		});
	});
	// A workspace that is no longer usable cannot be the key's scope.
	$effect(() => {
		if (scope && !hubs.some((hub) => hub.id === scope)) untrack(() => (scope = ''));
	});
	onDestroy(forget);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		const next = { [nameID]: keyNameError(name, t), [daysID]: keyExpiryError(days, canManage, t) };
		errors = Object.fromEntries(Object.entries(next).filter(([, message]) => message));
		attempt += 1;
		failure = '';
		if (Object.keys(errors).length) return;
		const request = ++generation;
		const chosen = scopeHub;
		const keyName = name.trim();
		creating = true;
		try {
			const result = chosen ? await OrcaService.createKey(chosen.id, keyName, days) : await OrcaService.createOrcaKey(keyName, days);
			if (request !== generation) return;
			created = { key: result.key, name: keyName, endpoint: validConnectLink(result.connectURL) ? result.connectURL : '' };
			reveal = false;
			name = '';
			await oncreated();
		} catch (cause) {
			if (request === generation) failure = orcaError(cause);
		} finally {
			if (request === generation) creating = false;
		}
	}

	let copied = $state('');
	let copyFailed = $state(false);
	const feedback = copyFeedback((on) => {
		if (!on) copied = '';
	});
	onDestroy(() => feedback.dispose());
	async function copy(text: string, what: string) {
		copyFailed = false;
		const ok = await copyText(text, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) {
			copied = what;
			feedback.copied();
		} else copyFailed = true;
	}
	const dayLabel = (value: number) => (value === 0 ? t('ไม่หมดอายุ', 'No expiry') : t(`${value} วัน`, value === 1 ? '1 day' : `${value} days`));
</script>

<details class="ca-keys">
	<summary>
		<ChevronRight size={16} aria-hidden="true" />
		<span><b>{t('สำหรับนักพัฒนา: เชื่อมด้วยคีย์', 'For developers: connect with a key')}</b> <span class="ca-muted">{t('(Claude และ ChatGPT ไม่ต้องใช้)', '(not needed for Claude or ChatGPT)')}</span></span>
	</summary>
	<div class="ca-keys-body">
		<p class="ca-intro">{t('คีย์ใช้กับสคริปต์หรือเครื่องมือที่เข้าสู่ระบบเองไม่ได้ เช่น n8n เก็บคีย์ไว้ในการตั้งค่าของแอป ห้ามวางในแชท', 'A key is for scripts and tools that cannot sign in, such as n8n. Keep it in the app’s settings, never in a chat.')}</p>

		{#if created}
			<div class="ca-created" role="status">
				<b><Check size={16} aria-hidden="true" />{t(`สร้างคีย์ ${created.name} แล้ว`, `Key ${created.name} created`)}</b>
				<p>{t('คีย์นี้แสดงครั้งเดียว คัดลอกไปเก็บในแอปตอนนี้', 'This key is shown once. Copy it into your app now.')}</p>
				<div class="ca-keyline">
					<code aria-label={reveal ? t('คีย์ของคุณ', 'Your key') : t('คีย์ถูกซ่อน', 'Key hidden')}>{reveal ? created.key : '•'.repeat(28)}</code>
					<button type="button" class="k-button small" onclick={() => (reveal = !reveal)}>{#if reveal}<EyeOff size={14} aria-hidden="true" />{t('ซ่อน', 'Hide')}{:else}<Eye size={14} aria-hidden="true" />{t('แสดง', 'Show')}{/if}</button>
					<button type="button" class="k-button small" onclick={() => created && copy(created.key, 'key')}>{#if copied === 'key'}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอกคีย์', 'Copy key')}{/if}</button>
				</div>
				<button type="button" class="k-button quiet small ca-saved" onclick={forget}>{t('เก็บคีย์แล้ว', 'I saved the key')}</button>
			</div>
		{:else if hubs.length}
			<form class="ca-form" onsubmit={create} novalidate>
				<FormErrorSummary errors={errors} focusKey={attempt} title={t('แก้ไขก่อนสร้างคีย์', 'Fix this before creating the key')} />
				<fieldset disabled={creating}>
					<div class="k-field ca-name">
						<label for={nameID}>{t('ชื่อคีย์', 'Key name')}</label>
						<input id={nameID} bind:value={name} autocomplete="off" placeholder={t('เช่น สคริปต์รายงานประจำวัน หรือ n8n', 'e.g. daily report script or n8n')} aria-invalid={errors[nameID] ? 'true' : undefined} />
					</div>
					<div class="ca-row">
						<div class="k-field">
							<label for={scopeID}>{t('ใช้กับ', 'Works with')}</label>
							<select id={scopeID} bind:value={scope}>
								<option value="">{t('ทุกพื้นที่ทำงานที่ฉันใช้ได้', 'Every workspace I can use')}</option>
								{#each hubs as hub (hub.id)}<option value={hub.id}>{t(`เฉพาะ ${hub.name}`, `Only ${hub.name}`)}</option>{/each}
							</select>
						</div>
						<div class="k-field">
							<label for={daysID}>{t('อายุของคีย์', 'Expires after')}</label>
							<select id={daysID} bind:value={days} aria-invalid={errors[daysID] ? 'true' : undefined}>
								{#each options as value (value)}<option {value}>{dayLabel(value)}</option>{/each}
							</select>
						</div>
					</div>
					<button type="submit" class="k-button ca-create"><KeyRound size={16} aria-hidden="true" />{creating ? t('กำลังสร้าง…', 'Creating…') : t('สร้างคีย์', 'Create key')}</button>
				</fieldset>
				{#if failure}<p class="ca-failure" role="alert">{failure}</p>{/if}
			</form>
		{:else}
			<p class="ca-intro">{t('ต้องได้รับสิทธิ์ใช้พื้นที่ทำงานก่อน จึงจะสร้างคีย์ได้', 'You need access to a workspace before you can create a key.')}</p>
		{/if}

		{#if hubs.length}
			<div class="ca-howto">
				<h3>{tool === 'other' ? t('ใช้คีย์กับแอปของคุณ', 'Use the key in your app') : t(`ใช้คีย์กับ ${appName(tool, t)}`, `Use the key with ${appName(tool, t)}`)}</h3>
				{#if tool === 'other'}
					<dl class="ca-facts">
						<dt>{t('ลิงก์', 'Link')}</dt><dd>{keyEndpoint}</dd>
						<dt>{t('การรับส่งข้อมูล', 'Transport')}</dt><dd>Streamable HTTP</dd>
						<dt>{t('การยืนยันตัวตน', 'Authorization')}</dt><dd>Bearer &lt;{t('คีย์ของคุณ', 'your key')}&gt;</dd>
					</dl>
					{#if instructions}<button type="button" class="k-button small" onclick={() => copy(instructions, 'instructions')}>{#if copied === 'instructions'}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอกคำสั่งตั้งค่า', 'Copy setup instructions')}{/if}</button>{/if}
					<p class="ca-muted small">{t('เลือกเครื่องมือของคุณในขั้นที่ 1 เพื่อดูวิธีตั้งค่าเฉพาะ', 'Choose your tool in step 1 for its own setup.')}</p>
				{:else}
					{#each setup.commands as command, index (command)}
						<div class="ca-code"><code>{command}</code><button type="button" class="k-button small" onclick={() => copy(command, `command-${index}`)} aria-label={t(`คัดลอกคำสั่งที่ ${index + 1}`, `Copy command ${index + 1}`)}>{#if copied === `command-${index}`}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}{/if}</button></div>
					{/each}
					{#if setup.config}
						<div class="ca-code block"><div class="ca-code-head"><code>{setup.configPath}</code><button type="button" class="k-button small" onclick={() => copy(setup.config, 'config')}>{#if copied === 'config'}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}{/if}</button></div><pre>{setup.config}</pre></div>
					{/if}
					{#if after}<p class="ca-muted">{after}</p>{/if}
					<p class="ca-muted small">{t(`อย่าเขียนคีย์ลงในไฟล์ ให้เก็บไว้ในตัวแปร ${names.keyEnv} เท่านั้น`, `Never write the key into a file; keep it in ${names.keyEnv} only.`)}</p>
				{/if}
			</div>
		{/if}
		<span class="ca-announce" role="status" aria-live="polite">{copied ? t('คัดลอกแล้ว', 'Copied') : ''}</span>
		{#if copyFailed}<p class="ca-failure" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}
	</div>
</details>

<style>
	/* orca-type-remap v1 */
	.ca-keys {
		margin-top: 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	.ca-keys > summary {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 20px;
		border-radius: var(--orca-radius-lg);
		color: var(--orca-text-2);
		font-size: 13.5px;
		list-style: none;
		cursor: pointer;
	}
	.ca-keys > summary::-webkit-details-marker {
		display: none;
	}
	.ca-keys > summary:hover {
		background: var(--orca-hover);
	}
	.ca-keys > summary :global(svg) {
		flex: none;
		color: var(--orca-muted);
		transition: transform 0.15s var(--orca-ease);
	}
	.ca-keys[open] > summary {
		border-bottom: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg) var(--orca-radius-lg) 0 0;
	}
	.ca-keys[open] > summary :global(svg) {
		transform: rotate(90deg);
	}
	.ca-keys > summary b {
		color: var(--orca-ink);
		font-weight: 600;
	}
	.ca-muted {
		color: var(--orca-muted);
	}
	.ca-keys-body {
		display: grid;
		gap: 18px;
		padding: 18px 20px 20px;
		background: var(--orca-surface);
		border-radius: 0 0 var(--orca-radius-lg) var(--orca-radius-lg);
	}
	.ca-intro {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.6;
	}
	fieldset {
		display: grid;
		gap: 14px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.ca-form .k-field {
		display: grid;
		gap: 6px;
		min-width: 0;
		margin: 0;
	}
	.ca-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(160px, 220px);
		gap: 14px;
	}
	.ca-create {
		justify-self: start;
	}
	.ca-failure {
		margin: 12px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
	}
	.ca-created {
		display: grid;
		gap: 8px;
		padding: 16px;
		border: 1px solid var(--orca-ok-line);
		border-radius: var(--orca-radius);
		background: var(--orca-ok-bg);
	}
	.ca-created b {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 650;
	}
	.ca-created b :global(svg) {
		color: var(--orca-ok);
	}
	.ca-created p {
		margin: 0;
		color: var(--orca-text-2);
		font-size: 13px;
	}
	.ca-keyline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.ca-keyline code {
		flex: 1 1 220px;
		min-width: 0;
		padding: 8px 12px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
		color: var(--orca-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12.5px;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.ca-saved {
		justify-self: start;
	}
	.ca-howto {
		display: grid;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.ca-howto h3 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
	}
	.ca-howto p {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
	}
	.ca-howto .k-button {
		justify-self: start;
	}
	.small {
		font-size: 12.5px !important;
	}
	.ca-facts {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
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
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.ca-code {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
	}
	.ca-code.block {
		display: grid;
		padding: 10px 12px;
	}
	.ca-code-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ca-code code {
		flex: 1;
		min-width: 0;
		color: var(--orca-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.ca-code pre {
		margin: 8px 0 0;
		overflow: auto;
		color: var(--orca-ink);
		font-size: 12px;
		line-height: 1.55;
	}
	.ca-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@container ca (max-width: 560px) {
		.ca-keys > summary {
			padding: 14px 16px;
		}
		.ca-keys-body {
			padding: 16px;
		}
		.ca-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
