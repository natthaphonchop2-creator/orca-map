<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Copy, MessageSquare } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import { copyFeedback, copyText } from '../ui/copy';

	// Step 5: "กำลังรอ…" while the page checks every few seconds, "เชื่อม
	// Claude แล้ว" once a sign-in arrives, or a plain hint when this server
	// cannot tell (no B1 yet).
	let {
		app,
		status,
		when = '',
		prompts
	}: {
		app: string;
		status: 'waiting' | 'connected' | 'unknown' | 'idle';
		when?: string;
		prompts: string[];
	} = $props();
	const shown = $derived(status === 'connected' ? prompts : prompts.slice(0, 1));

	let copied = $state(-1);
	let failed = $state(false);
	const feedback = copyFeedback((on) => {
		if (!on) copied = -1;
	});
	onDestroy(() => feedback.dispose());
	async function copy(text: string, index: number) {
		failed = false;
		const ok = await copyText(text, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) {
			copied = index;
			feedback.copied();
		} else failed = true;
	}
</script>

<div class="ca-result" class:connected={status === 'connected'}>
	<div class="ca-state" role="status" aria-live="polite">
		{#if status === 'connected'}
			<span class="ca-ok" aria-hidden="true"><Check size={15} strokeWidth={2.6} /></span>
			<div><b>{t(`เชื่อม ${app} แล้ว`, `${app} connected`)}{#if when}<span class="ca-when">{` · ${when}`}</span>{/if}</b><small>{t(`ลองพิมพ์คำสั่งด้านล่างใน ${app} ได้เลย`, `Try one of these in ${app} now`)}</small></div>
		{:else if status === 'waiting'}
			<span class="ca-spin" aria-hidden="true"></span>
			<div><b>{t(`กำลังรอการเชื่อมต่อจาก ${app}…`, `Waiting for ${app} to connect…`)}</b><small>{t('ตรวจให้อัตโนมัติ ไม่ต้องรีเฟรชหน้า', 'Checked for you. No need to reload.')}</small></div>
		{:else if status === 'unknown'}
			<span class="ca-dot" aria-hidden="true"><MessageSquare size={15} /></span>
			<div><b>{t(`ถาม ${app} ว่าเห็น ORCA หรือยัง`, `Ask ${app} whether it sees ORCA`)}</b><small>{t('ถ้าตอบพร้อมรายชื่อพื้นที่ทำงานของคุณ แสดงว่าเชื่อมแล้ว', 'If it answers with your workspaces, you are connected.')}</small></div>
		{:else}
			<span class="ca-dot" aria-hidden="true"></span>
			<div><b>{t('ยังตรวจผลไม่ได้', 'Nothing to check yet')}</b><small>{t('เมื่อคุณได้รับสิทธิ์ใช้พื้นที่ทำงาน หน้านี้จะตรวจให้เอง', 'Once you can use a workspace, this page checks for you.')}</small></div>
		{/if}
	</div>
	{#if status !== 'idle'}
		<div class="ca-try">
			<p>{status === 'waiting' ? t(`เมื่อเชื่อมแล้ว ลองพิมพ์ใน ${app} ว่า`, `Once connected, type this in ${app}`) : t(`ลองพิมพ์ใน ${app} ว่า`, `Type this in ${app}`)}</p>
			<ul>
				{#each shown as prompt, index (prompt)}
					<li>
						<MessageSquare size={16} aria-hidden="true" />
						<span>{prompt}</span>
						<button type="button" class="k-button small" onclick={() => copy(prompt, index)} aria-label={t(`คัดลอก "${prompt}"`, `Copy "${prompt}"`)}>
							{#if copied === index}<Check size={14} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={14} aria-hidden="true" />{t('คัดลอก', 'Copy')}{/if}
						</button>
					</li>
				{/each}
			</ul>
			{#if failed}<p class="ca-failed" role="alert">{t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.')}</p>{/if}
		</div>
	{/if}
</div>

<style>
	.ca-result {
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.ca-result.connected {
		border-color: var(--orca-ok-line);
	}
	.ca-state {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 18px;
	}
	.connected .ca-state {
		background: var(--orca-ok-bg);
	}
	.ca-state b {
		display: block;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.45;
	}
	.ca-when {
		color: var(--orca-ok);
		font-weight: 600;
	}
	.ca-state small {
		display: block;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.ca-spin {
		flex: none;
		width: 22px;
		height: 22px;
		border: 2.5px solid var(--orca-line);
		border-top-color: var(--orca-chosen);
		border-right-color: var(--orca-chosen);
		border-radius: 50%;
		animation: ca-turn 0.9s linear infinite;
	}
	@keyframes ca-turn {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ca-spin {
			animation-duration: 3s;
		}
	}
	.ca-ok {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--orca-ok);
		color: var(--orca-on-ink);
	}
	.ca-dot {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.ca-try {
		padding: 16px 18px 18px;
		border-top: 1px solid var(--orca-line-soft);
		background: var(--orca-surface-2);
	}
	.ca-try > p {
		margin: 0 0 8px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.ca-try ul {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ca-try li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px 10px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-size: 15px;
	}
	.ca-try li > :global(svg) {
		flex: none;
		color: var(--orca-subtle);
	}
	.ca-try li > span {
		flex: 1;
		min-width: 0;
	}
	.ca-try .k-button {
		flex: none;
	}
	.ca-failed {
		margin: 8px 0 0 !important;
		color: var(--orca-deny) !important;
	}
</style>
