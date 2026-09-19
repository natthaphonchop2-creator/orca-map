<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, Trash2 } from '@lucide/svelte';
	import { workspaceToolingReady } from '$lib/orca/activation';
	import { gatewayClientConfig } from '$lib/orca/client-config';
	import { gatewaySources, gatewayToolCount } from '$lib/orca/gateway-sources';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { OrcaService, displayDate, orcaError, type OrcaBootstrap, type OrcaKey } from '$lib/services/orca';
	import GatewayClientSetup from './GatewayClientSetup.svelte';

	let { data }: { data: OrcaBootstrap } = $props();
	const endpoint = $derived(data.unifiedConnectURL?.trim() || '');
	const hasEndpoint = $derived.by(() => {
		try { gatewayClientConfig(endpoint, 'codex'); return true; } catch { return false; }
	});
	const accessibleGateways = $derived(data.hubs.filter((hub) =>
		!!data.currentUserID && hub.status === 'active' && hub.memberIDs.includes(data.currentUserID) &&
		workspaceToolingReady(hub, data.connections)
	));
	const canCreate = $derived(!!data.currentUserID && hasEndpoint && accessibleGateways.length > 0);
	const identity = $derived(JSON.stringify([data.organization.displayName, data.currentUserID, endpoint]));
	const accessSignature = $derived(JSON.stringify(accessibleGateways.map((hub) => [
		hub.id,
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
			keyError = t('ตั้งชื่อคีย์และเลือกอายุ 1–30 วัน หรือไม่หมดอายุ', 'Enter a key name and select 1–30 days or no expiry.');
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
				keyError = t('คัดลอกไม่ได้ กดแสดงคีย์แล้วเลือกข้อความเพื่อคัดลอกเองได้', 'Copy failed. Reveal the key and select it to copy manually.');
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
		<h2 id="orca-mcp-title">{t('เชื่อม AI กับ ORCA ครั้งเดียว', 'Connect your AI to ORCA once')}</h2>
		<p>{t('ใช้เครื่องมือจากทุก Gateway ที่คุณเป็นสมาชิก เมื่อเพิ่มหรือถอนสิทธิ์ ORCA จะตรวจตามสิทธิ์ใหม่ในการเรียกครั้งถัดไป', 'Use tools from every Gateway you belong to. ORCA checks updated permissions on the next call when access is added or removed.')}</p>
	</header>
	<details class="access-gateways">
		<summary>{t(`Gateway ที่คุณใช้งานได้ · ${accessibleGateways.length}`, `Gateways available to you · ${accessibleGateways.length}`)}</summary>
		{#each accessibleGateways as hub (hub.id)}
			<a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(hub.id)}`)}><strong>{hub.name}</strong><span>{t(`${gatewaySources(hub).length} ระบบ · ${gatewayToolCount(hub)} เครื่องมือที่เลือก`, `${gatewaySources(hub).length} sources · ${gatewayToolCount(hub)} selected tools`)}</span></a>
		{:else}<p>{t('ยังไม่มี Gateway ที่เปิดใช้งานและเลือกคุณเป็นสมาชิก ขอให้ผู้ดูแลเพิ่มคุณใน Gateway ที่ต้องการ', 'No active Gateway has you as a member yet. Ask an administrator to add you to the Gateway you need.')}</p>{/each}
	</details>

	<div class="setup-step"><div class="step-title"><span>1</span><h3>{t('เพิ่ม ORCA ในแอป AI', 'Add ORCA to your AI client')}</h3></div>
		{#if hasEndpoint}<GatewayClientSetup {endpoint} ready={canCreate} scope="orca" />{:else}<p class="k-muted">{t('ระบบยังไม่มี URL สำหรับเชื่อม ORCA MCP กรุณาโหลดข้อมูลล่าสุดหรือติดต่อผู้ดูแล', 'An ORCA MCP URL is not available yet. Reload the latest data or contact your administrator.')}</p>{/if}
	</div>
	<div class="setup-step"><div class="step-title"><span>2</span><h3>{t('สร้างคีย์ส่วนตัวสำหรับแอป', 'Create a personal key for your client')}</h3></div>
		{#if notice}<p class="key-notice" role="status"><Check size={15} />{notice}</p>{/if}
		{#if keyError}<div class="k-banner error" role="alert"><div>{keyError}<button class="k-link-button" onclick={loadKeys} disabled={loadingKeys}>{t('โหลดรายการคีย์อีกครั้ง', 'Reload keys')}</button></div></div>{/if}
		{#if newKey && canCreate && secretAccess === accessSignature}
			<div class="key-created">
				<strong>{t('คีย์ของคุณพร้อมแล้ว', 'Your key is ready')}</strong>
				<p>{t('คัดลอกไปใส่ในช่องเก็บคีย์ของแอป คีย์แสดงได้เฉพาะครั้งนี้ และไม่ถูกรวมในคำสั่งตั้งค่า', 'Copy it into your client secret field. It is shown only this once and is not included in the setup instructions.')}</p>
				<div class="k-actions"><button class="k-button primary" onclick={copyKey}><Copy size={16} />{t('คัดลอกคีย์', 'Copy key')}</button><button class="k-button" onclick={toggleReveal}>{#if revealKey}<EyeOff size={16} />{t('ซ่อนคีย์', 'Hide key')}{:else}<Eye size={16} />{t('แสดงคีย์', 'Reveal key')}{/if}</button><button class="k-button quiet" onclick={dismissCreatedKey}>{t('เก็บคีย์แล้ว', 'I have saved the key')}</button></div>
				{#if revealKey}<div class="k-field reveal-field"><label for="orca-created-key">{t('คีย์เชื่อมต่อของคุณ', 'Your connection key')}</label><input id="orca-created-key" value={newKey} readonly autocomplete="off" spellcheck="false" /></div>{/if}
			</div>
		{:else if canCreate}
			<form onsubmit={(event) => { event.preventDefault(); void createKey(); }}>
				<fieldset disabled={creating}>
					<div class="key-fields"><div class="k-field"><label for="orca-key-name">{t('ชื่อคีย์', 'Key name')}</label><input id="orca-key-name" bind:value={keyName} maxlength="100" placeholder={t('เช่น Codex บนคอมของฉัน', 'For example, Codex on my computer')} required /></div>
					<div class="k-field"><label for="orca-key-expiry">{t('อายุคีย์', 'Key expiry')}</label><select id="orca-key-expiry" bind:value={expiryDays}><option value={1}>{t('1 วัน', '1 day')}</option><option value={7}>{t('7 วัน', '7 days')}</option><option value={14}>{t('14 วัน', '14 days')}</option><option value={30}>{t('30 วัน', '30 days')}</option><option value={0}>{t('ไม่หมดอายุ', 'No expiry')}</option></select></div></div>
					<button type="submit" class="k-button primary" disabled={creating || !keyName.trim()}><KeyRound size={16} />{creating ? t('กำลังสร้าง…', 'Creating…') : t('สร้างคีย์', 'Create key')}</button>
				</fieldset>
			</form>
		{:else}<p class="k-muted">{t('เมื่อคุณได้รับสิทธิ์ใน Gateway ที่เปิดใช้งาน จะสร้างคีย์ได้ที่นี่ คีย์เดิมยังจัดการและยกเลิกได้ด้านล่าง', 'You can create a key here once you have access to an active Gateway. Existing keys can still be managed and revoked below.')}</p>{/if}
	</div>

	<section class="owned-keys" aria-labelledby="orca-keys-title">
		<div class="key-list-heading"><h3 id="orca-keys-title">{t('คีย์เชื่อม ORCA ของคุณ', 'Your ORCA connection keys')}</h3><button class="k-button quiet small" onclick={loadKeys} disabled={loadingKeys || creating || revoking !== undefined}><RefreshCw size={14} />{t('โหลดล่าสุด', 'Reload')}</button></div>
		{#if loadingKeys}<p class="k-muted" role="status">{t('กำลังโหลดรายการคีย์…', 'Loading keys…')}</p>
		{:else if keysLoaded && !keys.length}<p class="k-muted">{t('ยังไม่มีคีย์เชื่อม ORCA', 'No ORCA connection keys yet.')}</p>
		{:else if keys.length}<div class="key-list">{#each keys as key (key.id)}<div class="key-row"><div class="key-meta"><strong>{key.name}</strong><span>{t('หมดอายุ: ', 'Expires: ')}{key.expiresAt ? displayDate(key.expiresAt) : t('ไม่หมดอายุ', 'No expiry')}</span><small>{t('ใช้งานล่าสุด: ', 'Last used: ')}{displayDate(key.lastUsedAt)}</small></div>
			{#if confirmRevoke === key.id}<div class="revoke-confirm"><span>{t('ยกเลิกการเชื่อมต่อของคีย์นี้?', 'Revoke this key’s access?')}</span><div class="k-actions"><button class="k-button danger small" disabled={revoking !== undefined} onclick={() => revokeKey(key.id)}>{revoking === key.id ? t('กำลังยกเลิก…', 'Revoking…') : t('ยืนยันยกเลิก', 'Confirm revocation')}</button><button class="k-button quiet small" disabled={revoking !== undefined} onclick={() => confirmRevoke = undefined}>{t('กลับ', 'Back')}</button></div></div>
			{:else}<button class="k-button quiet small" aria-label={t(`ยกเลิกคีย์ ${key.name}`, `Revoke key ${key.name}`)} disabled={revoking !== undefined} onclick={() => requestRevoke(key.id)}><Trash2 size={15} />{t('ยกเลิกคีย์', 'Revoke')}</button>{/if}
		</div>{/each}</div>{/if}
	</section>
</section>

<style>
	.orca-mcp-access { max-width:960px; min-width:0; }
	.access-heading h2 { font-size:23px; margin:0 0 10px; }
	p { color:#647087; font-size:13px; line-height:1.8; margin:10px 0; }
	.access-gateways { margin:20px 0 28px; border:1px solid #e1e6ed; border-radius:9px; padding:15px 18px; background:#fff; }
	.access-gateways summary { cursor:pointer; font-size:13px; font-weight:600; }
	.access-gateways a { display:flex; justify-content:space-between; align-items:center; gap:12px; color:inherit; text-decoration:none; padding-top:15px; font-size:13px; }
	.access-gateways a span { color:#647087; font-size:12px; }
	.setup-step { background:#fff; border:1px solid #e1e6ed; padding:23px; border-radius:10px; margin:16px 0; }
	.step-title { display:flex; align-items:center; gap:11px; margin-bottom:20px; }
	.step-title > span { display:grid; place-items:center; border-radius:50%; width:27px; height:27px; background:#eaf2d6; color:#42651e; font-size:13px; font-weight:700; flex-shrink:0; }
	h3 { font-size:16px; margin:0; }
	.key-fields { display:grid; grid-template-columns:minmax(0,1fr) minmax(150px,.45fr); gap:18px; margin-bottom:18px; }
	fieldset { border:0; padding:0; margin:0; min-width:0; }
	.key-created { background:#f7faef; border:1px solid #dfe7cd; border-radius:9px; padding:19px; }
	.key-created > strong { font-size:15px; }
	.reveal-field { margin-top:18px; }
	.key-notice { display:flex; align-items:center; gap:7px; color:#4d722d; }
	.k-banner .k-link-button { display:block; margin-top:6px; }
	.owned-keys { margin-top:30px; }
	.key-list-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
	.key-list { border:1px solid #e1e6ed; border-radius:9px; background:white; }
	.key-row { display:flex; justify-content:space-between; align-items:center; gap:18px; padding:17px 18px; }
	.key-row + .key-row { border-top:1px solid #e8ebf0; }
	.key-meta { min-width:0; display:flex; flex-direction:column; gap:6px; overflow-wrap:anywhere; }
	.key-meta strong { font-size:13px; }
	.key-meta span, .key-meta small, .revoke-confirm > span { font-size:12px; color:#647087; }
	.revoke-confirm .k-actions { margin-top:8px; }
	@media(max-width:600px) {
		.setup-step { padding:17px; }
		.key-fields { grid-template-columns:1fr; }
		.access-gateways a, .key-row { align-items:flex-start; flex-direction:column; }
		.key-list-heading { align-items:flex-start; }
	}
</style>
