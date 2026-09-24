<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, Trash2 } from '@lucide/svelte';
	import { workspaceToolingReady } from '$lib/orca/activation';
	import { gatewayClientConfig } from '$lib/orca/client-config';
	import { gatewaySources, gatewayToolCount, gatewayHasMember } from '$lib/orca/gateway-sources';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { OrcaService, displayDate, orcaError, type OrcaBootstrap, type OrcaKey } from '$lib/services/orca';
	import GatewayClientSetup from './GatewayClientSetup.svelte';

	let { data }: { data: OrcaBootstrap } = $props();
	const endpoint = $derived(data.unifiedConnectURL?.trim() || '');
	const hasEndpoint = $derived.by(() => {
		try { gatewayClientConfig(endpoint, 'codex'); return true; } catch { return false; }
	});
	const accessibleGateways = $derived(data.hubs.filter((hub) =>
		!!data.currentUserID && hub.status === 'active' && gatewayHasMember(hub, data.currentUserID) &&
		workspaceToolingReady(hub, data.connections)
	));
	const oauth = true;
	const canCreate = $derived(!!data.currentUserID && hasEndpoint && accessibleGateways.length > 0);
	const identity = $derived(JSON.stringify([data.organization.displayName, data.currentUserID, endpoint]));
	const accessSignature = $derived(JSON.stringify(accessibleGateways.map((hub) => [
		hub.id, hub.userSourceID ?? '',
		gatewaySources(hub).map((source) => [source.connectionID, [...source.toolNames].sort()])
	]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
	let keys = $state<OrcaKey[]>([]);
	let loadingKeys = $state(false);
	let keysLoaded = $state(false);
	let keyError = $state('');
	let notice = $state('');
	let keyName = $state('');
	let expiryDays = $state<number | undefined>(7);
	let creating = $state(false);
	let revoking = $state<number>();
	let confirmRevoke = $state<number>();
	let newKey = $state('');
	let newKeyID = $state<number>();
	let revealKey = $state(false);
	let secretAccess = $state('');
	let keyRequest = 0;
	let creationGeneration = 0;
	let revokeGeneration = 0;
	let destroyed = false;
	let previousAccess = '';

	function current(startedIdentity: string) {
		return !destroyed && identity === startedIdentity;
	}
	function clearCreatedKey() {
		newKey = '';
		newKeyID = undefined;
		revealKey = false;
		secretAccess = '';
	}
	function dismissCreatedKey() {
		creationGeneration += 1;
		creating = false;
		clearCreatedKey();
		notice = '';
	}
	function toggleReveal() {
		if (canCreate && secretAccess === accessSignature && newKey) revealKey = !revealKey;
	}

	async function loadKeys() {
		if (destroyed || !data.currentUserID) return;
		const startedIdentity = identity;
		const request = ++keyRequest;
		loadingKeys = true;
		keyError = '';
		try {
			const result = await OrcaService.orcaKeys();
			if (!current(startedIdentity) || request !== keyRequest) return;
			keys = result;
			keysLoaded = true;
		} catch (cause) {
			if (current(startedIdentity) && request === keyRequest) keyError = orcaError(cause);
		} finally {
			if (current(startedIdentity) && request === keyRequest) loadingKeys = false;
		}
	}

	$effect(() => {
		void identity;
		untrack(() => {
			keyRequest += 1;
			creationGeneration += 1;
			revokeGeneration += 1;
			keys = [];
			keysLoaded = false;
			loadingKeys = false;
			creating = false;
			revoking = undefined;
			confirmRevoke = undefined;
			keyName = '';
			expiryDays = 7;
			keyError = '';
			notice = '';
			clearCreatedKey();
			void loadKeys();
		});
	});
	$effect(() => {
		const signature = accessSignature;
		untrack(() => {
			if (signature === previousAccess) return;
			previousAccess = signature;
			creationGeneration += 1;
			creating = false;
			clearCreatedKey();
			notice = '';
		});
	});
	onDestroy(() => {
		destroyed = true;
		keyRequest += 1;
		creationGeneration += 1;
		revokeGeneration += 1;
		clearCreatedKey();
	});

	async function createKey() {
		if (destroyed || creating || !canCreate) return;
		if (!keyName.trim() || keyName.trim().length > 100 || !Number.isInteger(expiryDays) || (expiryDays ?? -1) < 0 || (expiryDays ?? 31) > 30) {
			keyError = t('กรุณาตั้งชื่อคีย์ และเลือกอายุการใช้งาน 1–30 วัน หรือไม่หมดอายุ', 'Enter a key name and select an expiry of 1–30 days or no expiry.');
			return;
		}
		const startedIdentity = identity;
		const startedAccess = accessSignature;
		const request = ++creationGeneration;
		creating = true;
		keyError = '';
		notice = '';
		clearCreatedKey();
		try {
			const created = await OrcaService.createOrcaKey(keyName.trim(), expiryDays!);
			if (!current(startedIdentity)) return;
			if (request === creationGeneration && canCreate && accessSignature === startedAccess) {
				newKey = created.key;
				newKeyID = created.id;
				secretAccess = startedAccess;
				keyName = '';
			}
			await loadKeys();
		} catch (cause) {
			if (current(startedIdentity) && request === creationGeneration) keyError = orcaError(cause);
		} finally {
			if (current(startedIdentity) && request === creationGeneration) creating = false;
		}
	}

	async function copyKey() {
		if (!newKey || !canCreate || secretAccess !== accessSignature || destroyed) return;
		const startedIdentity = identity;
		const request = creationGeneration;
		try {
			await navigator.clipboard.writeText(newKey);
			if (current(startedIdentity) && request === creationGeneration) notice = t('คัดลอกคีย์แล้ว', 'Key copied');
		} catch {
			if (current(startedIdentity) && request === creationGeneration) {
				keyError = t('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาแสดงคีย์ แล้วเลือกข้อความเพื่อคัดลอกด้วยตนเอง', 'The key could not be copied automatically. Reveal the key and copy it manually.');
			}
		}
	}
	function requestRevoke(id: number) {
		if (!destroyed && data.currentUserID && revoking === undefined && keys.some((key) => key.id === id)) confirmRevoke = id;
	}
	async function revokeKey(id: number) {
		if (destroyed || !data.currentUserID || revoking !== undefined || confirmRevoke !== id || !keys.some((key) => key.id === id)) return;
		const startedIdentity = identity;
		const request = ++revokeGeneration;
		revoking = id;
		keyError = '';
		notice = '';
		try {
			await OrcaService.revokeOrcaKey(id);
			if (!current(startedIdentity) || request !== revokeGeneration) return;
			if (newKeyID === id) clearCreatedKey();
			keys = keys.filter((key) => key.id !== id);
			confirmRevoke = undefined;
			await loadKeys();
			if (current(startedIdentity) && request === revokeGeneration) notice = t('ยกเลิกคีย์แล้ว', 'Key revoked');
		} catch (cause) {
			if (current(startedIdentity) && request === revokeGeneration) keyError = orcaError(cause);
		} finally {
			if (current(startedIdentity) && request === revokeGeneration) revoking = undefined;
		}
	}
</script>

<section class="orca-mcp-access" aria-labelledby="orca-mcp-title">
	<header class="access-heading">
		<h2 id="orca-mcp-title">{t('เชื่อม AI กับ ORCA เพียงครั้งเดียว', 'Connect your AI to ORCA once')}</h2>
	</header>
	<details class="access-gateways access-panel">
		<summary>{t(`พื้นที่ทำงาน AI ที่คุณใช้งานได้ · ${accessibleGateways.length}`, `AI workspaces available to you · ${accessibleGateways.length}`)}</summary>
		<div class="access-gateway-list">
			{#each accessibleGateways as hub (hub.id)}
				<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}><strong>{hub.name}</strong><span>{t(`${gatewaySources(hub).length} ระบบ · เครื่องมือที่อนุญาต ${gatewayToolCount(hub)} รายการ`, `Systems: ${gatewaySources(hub).length} · Allowed tools: ${gatewayToolCount(hub)}`)}</span></a>
			{:else}<p>{t('คุณยังไม่มีสิทธิ์ใช้พื้นที่ทำงาน AI ใด ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์', 'You do not have access to any AI workspace yet. Contact your administrator to request access.')}</p>{/each}
		</div>
	</details>

	<div class="setup-step access-panel"><div class="step-title"><h3>{t('เพิ่ม ORCA ในแอป AI', 'Add ORCA to your AI app')}</h3></div>
		<div class="step-body">{#if hasEndpoint}<GatewayClientSetup {endpoint} ready={canCreate} scope="orca" {oauth} />{:else}<p>{t('ยังไม่มีลิงก์เชื่อม AI สำหรับ ORCA กรุณาโหลดข้อมูลล่าสุดหรือติดต่อผู้ดูแลระบบ', 'The AI connection link for ORCA is not available yet. Reload the latest data or contact your administrator.')}</p>{/if}</div>
	</div>
	<details class="api-key-option access-panel">
		<summary>{t('คีย์ API (ไม่บังคับ)', 'API key (optional)')}</summary>
		<div class="api-key-body">
		{#if hasEndpoint}<GatewayClientSetup {endpoint} ready={canCreate} scope="orca" oauth={false} />{/if}
		<div class="key-step"><div class="step-title"><h3>{t('สร้างคีย์ส่วนตัวสำหรับแอป AI', 'Create a personal key for your AI app')}</h3></div>
			{#if notice}<p class="key-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>{/if}
			{#if keyError}<div class="k-banner error" role="alert"><div>{keyError}<button class="k-link-button" onclick={loadKeys} disabled={loadingKeys}>{t('โหลดรายการคีย์อีกครั้ง', 'Reload keys')}</button></div></div>{/if}
			{#if newKey && canCreate && secretAccess === accessSignature}
				<div class="key-created">
					<strong>{t('สร้างคีย์ส่วนตัวแล้ว', 'Personal key created')}</strong>
					<p>{t('คัดลอกคีย์ไปบันทึกในแอป AI คีย์นี้จะแสดงเพียงครั้งเดียว', 'Save this key in your AI app. It is shown only once.')}</p>
					<div class="key-actions"><button class="k-button primary" onclick={copyKey}><Copy size={16} aria-hidden="true" />{t('คัดลอกคีย์', 'Copy key')}</button><button class="k-button" onclick={toggleReveal}>{#if revealKey}<EyeOff size={16} aria-hidden="true" />{t('ซ่อนคีย์', 'Hide key')}{:else}<Eye size={16} aria-hidden="true" />{t('แสดงคีย์', 'Reveal key')}{/if}</button><button class="k-button quiet" onclick={dismissCreatedKey}>{t('บันทึกคีย์แล้ว', 'I have saved the key')}</button></div>
					{#if revealKey}<div class="k-field reveal-field"><label for="orca-created-key">{t('คีย์ส่วนตัวของคุณ', 'Your personal key')}</label><input id="orca-created-key" value={newKey} readonly autocomplete="off" spellcheck="false" /></div>{/if}
				</div>
			{:else if canCreate}
				<form onsubmit={(event) => { event.preventDefault(); void createKey(); }}>
					<fieldset disabled={creating}>
						<div class="key-fields"><div class="k-field"><label for="orca-key-name">{t('ชื่อคีย์', 'Key name')}</label><input id="orca-key-name" bind:value={keyName} maxlength="100" placeholder={t('เช่น Codex บนคอมพิวเตอร์ของฉัน', 'For example, Codex on my computer')} required /></div>
						<div class="k-field"><label for="orca-key-expiry">{t('อายุการใช้งานคีย์', 'Key expiry')}</label><select id="orca-key-expiry" bind:value={expiryDays}><option value={1}>{t('1 วัน', '1 day')}</option><option value={7}>{t('7 วัน', '7 days')}</option><option value={14}>{t('14 วัน', '14 days')}</option><option value={30}>{t('30 วัน', '30 days')}</option><option value={0}>{t('ไม่หมดอายุ', 'No expiry')}</option></select></div></div>
						<button type="submit" class="k-button primary" disabled={creating || !keyName.trim()}><KeyRound size={16} aria-hidden="true" />{creating ? t('กำลังสร้าง…', 'Creating…') : t('สร้างคีย์', 'Create key')}</button>
					</fieldset>
				</form>
			{:else}<p>{t('ต้องเป็นสมาชิกของพื้นที่ทำงาน AI ที่เปิดใช้งานก่อนสร้างคีย์', 'You must be a member of an active AI workspace to create a key.')}</p>{/if}
		</div>

		<section class="owned-keys" aria-labelledby="orca-keys-title">
			<div class="key-list-heading"><h3 id="orca-keys-title">{t('คีย์ส่วนตัวของคุณ', 'Your personal keys')}</h3><button class="k-button quiet small" onclick={loadKeys} disabled={loadingKeys || creating || revoking !== undefined}><RefreshCw size={14} aria-hidden="true" />{t('โหลดข้อมูลล่าสุด', 'Reload')}</button></div>
			{#if loadingKeys}<p role="status">{t('กำลังโหลดรายการคีย์…', 'Loading keys…')}</p>
			{:else if keysLoaded && !keys.length}<p>{t('ยังไม่มีคีย์ส่วนตัว', 'No personal keys yet.')}</p>
			{:else if keys.length}<div class="key-list">{#each keys as key (key.id)}<div class="key-row"><div class="key-meta"><strong>{key.name}</strong><span>{t('หมดอายุ: ', 'Expires: ')}{key.expiresAt ? displayDate(key.expiresAt) : t('ไม่หมดอายุ', 'No expiry')}</span><small>{t('ใช้งานล่าสุด: ', 'Last used: ')}{displayDate(key.lastUsedAt)}</small></div>
				{#if confirmRevoke === key.id}<div class="revoke-confirm"><span>{t('ยกเลิกคีย์นี้หรือไม่ แอปที่ใช้คีย์นี้จะเชื่อมต่อไม่ได้ทันที', 'Revoke this key? Apps using it will lose access immediately.')}</span><div class="key-actions"><button class="k-button danger small" disabled={revoking !== undefined} onclick={() => revokeKey(key.id)}>{revoking === key.id ? t('กำลังยกเลิก…', 'Revoking…') : t('ยืนยันการยกเลิก', 'Confirm revocation')}</button><button class="k-button quiet small" disabled={revoking !== undefined} onclick={() => confirmRevoke = undefined}>{t('กลับ', 'Back')}</button></div></div>
				{:else}<button class="k-button small revoke-button" aria-label={t(`ยกเลิกคีย์ ${key.name}`, `Revoke key ${key.name}`)} disabled={revoking !== undefined} onclick={() => requestRevoke(key.id)}><Trash2 size={14} aria-hidden="true" />{t('ยกเลิกคีย์', 'Revoke key')}</button>{/if}
			</div>{/each}</div>{/if}
		</section>
		</div>
	</details>
</section>

<style>
	.orca-mcp-access {
		--access-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		display: grid;
		gap: 16px;
		max-width: 960px;
		min-width: 0;
		color: var(--orca-ink);
	}
	.access-heading h2 {
		margin: 0;
	}
	p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.65;
	}
	h3 {
		margin: 0;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.access-panel {
		min-width: 0;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	/* Collapsible panels: a header row with a chevron that turns when open. */
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
		padding: 12px 18px;
		border-radius: var(--orca-radius-lg);
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.45;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '';
		flex: none;
		width: 16px;
		height: 16px;
		background-color: var(--orca-subtle);
		-webkit-mask: var(--access-chevron) center / 16px 16px no-repeat;
		mask: var(--access-chevron) center / 16px 16px no-repeat;
		transition: transform 0.15s;
	}
	summary:hover {
		background: var(--orca-surface-2);
	}
	summary:focus-visible {
		outline-offset: -2px;
	}
	details[open] > summary {
		border-bottom: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg) var(--orca-radius-lg) 0 0;
	}
	details[open] > summary::after {
		transform: rotate(180deg);
	}
	.access-gateway-list a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		color: var(--orca-ink);
		text-decoration: none;
	}
	.access-gateway-list a + a {
		border-top: 1px solid #eff0f2;
	}
	.access-gateway-list a:hover {
		background: var(--orca-surface-2);
	}
	.access-gateway-list a:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.access-gateway-list a:focus-visible {
		outline-offset: -2px;
	}
	.access-gateway-list strong {
		min-width: 0;
		font-size: 14px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.access-gateway-list span {
		flex: none;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.access-gateway-list > p {
		padding: 14px 18px;
	}
	.setup-step > .step-title {
		padding: 14px 18px;
		border-bottom: 1px solid var(--orca-line);
	}
	.step-body {
		padding: 16px 18px 18px;
	}
	.api-key-body {
		padding: 16px 18px 18px;
	}
	.key-step {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid #eff0f2;
	}
	.key-step > .step-title {
		margin-bottom: 12px;
	}
	.key-step .k-banner {
		margin: 0 0 12px;
	}
	.k-banner .k-link-button {
		display: block;
		margin-top: 6px;
	}
	.key-notice {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 12px;
		color: var(--orca-ok);
		font-weight: 500;
	}
	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.key-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(160px, 220px);
		gap: 16px;
		margin-bottom: 16px;
	}
	.key-fields .k-field + .k-field {
		margin-top: 0;
	}
	.key-created {
		padding: 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
	}
	.key-created > strong {
		font-size: 14.5px;
		font-weight: 600;
	}
	.key-created > p {
		margin-top: 4px;
	}
	.key-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	.reveal-field {
		margin-top: 16px;
	}
	.reveal-field input {
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 13px;
	}
	.owned-keys {
		margin-top: 24px;
		padding-top: 16px;
		border-top: 1px solid #eff0f2;
	}
	.key-list-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 10px;
	}
	.key-list {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
	}
	.key-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 12px 14px;
	}
	.key-row + .key-row {
		border-top: 1px solid #eff0f2;
	}
	.key-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 14px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.key-meta strong {
		flex-basis: 100%;
		font-size: 14px;
		font-weight: 600;
	}
	.key-meta span,
	.key-meta small {
		color: var(--orca-muted);
		font-size: 13px;
	}
	.revoke-button {
		flex: none;
	}
	.revoke-button:hover {
		border-color: color-mix(in srgb, var(--orca-deny) 25%, var(--orca-surface));
		background: var(--orca-deny-bg);
		color: var(--orca-deny) !important;
	}
	.revoke-confirm {
		display: grid;
		justify-items: end;
		gap: 6px;
		max-width: 320px;
	}
	.revoke-confirm > span {
		color: var(--orca-deny);
		font-size: 12.5px;
		line-height: 1.5;
		text-align: end;
	}
	.revoke-confirm .key-actions {
		margin-top: 0;
	}
	@media (max-width: 600px) {
		summary,
		.access-gateway-list a,
		.access-gateway-list > p {
			padding-inline: 14px;
		}
		.setup-step > .step-title {
			padding-inline: 14px;
		}
		.step-body,
		.api-key-body {
			padding-inline: 14px;
		}
		.key-fields {
			grid-template-columns: minmax(0, 1fr);
		}
		.access-gateway-list a,
		.key-row {
			align-items: flex-start;
			flex-direction: column;
			gap: 6px;
		}
		.revoke-confirm {
			justify-items: start;
		}
		.revoke-confirm > span {
			text-align: start;
		}
	}
</style>
