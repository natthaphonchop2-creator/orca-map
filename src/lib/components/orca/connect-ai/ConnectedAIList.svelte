<script lang="ts">
	import { Unplug } from '@lucide/svelte';
	import { dayLabel, keyScope, sessionLabel, sessionScope, shortDate } from '$lib/orca/connect-ai';
	import { orcaLocale, t } from '$lib/orca/locale.svelte';
	import { OrcaService, orcaError, type OrcaHub } from '$lib/services/orca';
	import { MyAIAppsService, type MyAIKey, type MyAISession } from '$lib/services/orca-ai-apps';
	import { term } from '$lib/orca/glossary';
	import AIAppTile from '../AIAppTile.svelte';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import { showToast } from '../ui/toast-store.svelte';

	// "AI ที่คุณเชื่อมไว้": the person's own AI app sign-ins and keys, each with
	// ตัดการเชื่อมต่อ behind a confirmation. `legacy`: this server has no B1, so
	// only company-wide keys are listed and removed the old way.
	let {
		sessions,
		keys,
		hubs,
		now,
		legacy = false,
		onchanged
	}: {
		sessions: MyAISession[];
		keys: MyAIKey[];
		hubs: Pick<OrcaHub, 'id' | 'name'>[];
		now: number;
		legacy?: boolean;
		/** After a disconnect: which one went, so the page drops it at once (Codex release review 67). */
		onchanged: (revoked?: { kind: 'session' | 'key'; id: string | number }) => void | Promise<void>;
	} = $props();

	type Target = { kind: 'session'; item: MyAISession; label: string } | { kind: 'key'; item: MyAIKey; label: string };
	let target = $state<Target>();
	let confirmOpen = $state(false);
	let busy = $state(false);
	let error = $state('');
	const lang = $derived(orcaLocale.value);
	const count = $derived(sessions.length + keys.length);

	function ask(next: Target) {
		error = '';
		target = next;
		confirmOpen = true;
	}
	async function disconnect() {
		const chosen = target;
		if (!chosen || busy) return;
		busy = true;
		error = '';
		try {
			if (chosen.kind === 'session') await MyAIAppsService.revokeSession(chosen.item.id);
			else if (legacy) await OrcaService.revokeOrcaKey(chosen.item.id);
			else await MyAIAppsService.revokeKey(chosen.item.id);
			confirmOpen = false;
			showToast(t(`ตัดการเชื่อมต่อ ${chosen.label} แล้ว`, `Disconnected ${chosen.label}`));
			await onchanged({ kind: chosen.kind, id: chosen.item.id });
		} catch (cause) {
			error = orcaError(cause);
		} finally {
			busy = false;
		}
	}
</script>

{#if count}
	<section class="ca-connected" aria-labelledby="ca-connected-title">
		<h2 id="ca-connected-title">{t('AI ที่คุณเชื่อมไว้', 'AI you connected')}<span class="ca-count">{count}</span></h2>
		<ul>
			{#each sessions as session (session.id)}
				{@const label = sessionLabel(session, t)}
				<li>
					<AIAppTile kind={session.client} size={40} />
					<div class="ca-copy">
						<b>{label}</b>
						<small>{sessionScope(session, hubs, t)} · {t(`เชื่อมเมื่อ ${shortDate(session.createdAt, now, lang)}`, `Connected ${shortDate(session.createdAt, now, lang)}`)} · {t(`ต่ออายุล่าสุด ${dayLabel(session.lastRefreshedAt, now, t, lang)}`, `Last renewed ${dayLabel(session.lastRefreshedAt, now, t, lang)}`)}</small>
					</div>
					<button type="button" class="k-button small ca-cut" onclick={() => ask({ kind: 'session', item: session, label })} aria-label={t(`ตัดการเชื่อมต่อ ${label}`, `Disconnect ${label}`)}>
						<Unplug size={14} aria-hidden="true" />{term('disconnect', t)}
					</button>
				</li>
			{/each}
			{#each keys as key (key.id)}
				{@const label = t(`คีย์ ${key.name}`, `key ${key.name}`)}
				<li>
					<AIAppTile kind="key" size={40} />
					<div class="ca-copy">
						<b>{t('คีย์', 'Key')} · {key.name}</b>
						<small>{keyScope(key, hubs, t)} · {key.lastUsedAt ? t(`ใช้ล่าสุด ${dayLabel(key.lastUsedAt, now, t, lang)}`, `Last used ${dayLabel(key.lastUsedAt, now, t, lang)}`) : t('ยังไม่เคยใช้', 'Never used')} · {key.expiresAt ? t(`หมดอายุ ${shortDate(key.expiresAt, now, lang)}`, `Expires ${shortDate(key.expiresAt, now, lang)}`) : t('ไม่หมดอายุ', 'No expiry')}</small>
					</div>
					<button type="button" class="k-button small ca-cut" onclick={() => ask({ kind: 'key', item: key, label })} aria-label={t(`ตัดการเชื่อมต่อคีย์ ${key.name}`, `Disconnect key ${key.name}`)}>
						<Unplug size={14} aria-hidden="true" />{term('disconnect', t)}
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={target ? t(`ตัดการเชื่อมต่อ ${target.label}?`, `Disconnect ${target.label}?`) : ''}
	message={target?.kind === 'key'
		? t('แอปหรือสคริปต์ที่ใช้คีย์นี้จะใช้ข้อมูลบริษัทไม่ได้ทันที', 'Apps or scripts using this key lose access to company data at once.')
		: target
			? t(`${target.label} จะใช้ข้อมูลบริษัทผ่าน ORCA ไม่ได้ทันที ถ้าต้องการใช้อีก ให้เชื่อมใหม่ตามขั้นตอนในหน้านี้`, `${target.label} loses access to company data through ORCA at once. To use it again, connect it with the steps on this page.`)
			: ''}
	confirmLabel={busy ? t('กำลังตัดการเชื่อมต่อ…', 'Disconnecting…') : term('disconnect', t)}
	tone="danger"
	icon={Unplug}
	{busy}
	onconfirm={disconnect}
	oncancel={() => (error = '')}
>
	{#if error}<p class="ca-error" role="alert">{error}</p>{/if}
</ConfirmDialog>

<style>
	.ca-connected {
		margin-bottom: 8px;
	}
	.ca-connected h2 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 12px;
		color: var(--orca-ink);
		font-size: 17px;
		font-weight: 650;
		line-height: 1.4;
	}
	.ca-count {
		padding: 1px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
	}
	ul {
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px;
		border-top: 1px solid var(--orca-line-soft);
	}
	li:first-child {
		border-top: 0;
	}
	.ca-copy {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.ca-copy b {
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.ca-copy small {
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ca-cut {
		flex: none;
	}
	.ca-cut:hover {
		border-color: var(--orca-deny-line) !important;
		background: var(--orca-deny-bg) !important;
		color: var(--orca-deny) !important;
	}
	.ca-error {
		margin: 14px 0 0 !important;
		color: var(--orca-deny) !important;
		font-size: 14px;
	}
	@container ca (max-width: 560px) {
		li {
			flex-wrap: wrap;
			padding: 14px;
		}
		.ca-cut {
			margin-left: 54px;
		}
	}
</style>
