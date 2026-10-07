<script lang="ts">
	import { onDestroy } from 'svelte';
	import { UserRoundCheck } from '@lucide/svelte';
	import { getHttpStatusCode, parseErrorContent } from '$lib/errors';
	import { fileActionProblem } from '$lib/orca/knowledge';
	import { t } from '$lib/orca/locale.svelte';
	import { orcaError } from '$lib/services/orca';
	import { OrcaLibraryService, type LibraryItem } from '$lib/services/orca-library';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';

	// "รับช่วงดูแล" (C4 §14m S5, owner decision 7): a company owner or admin
	// takes over an item whose owner left the company or the workspace. It is
	// a manager's only power over people's items; the server checks it all.
	let {
		hubID,
		item,
		ontaken,
		ondenied
	}: {
		hubID: string;
		item: LibraryItem;
		ontaken: (item: LibraryItem) => void;
		ondenied: () => void;
	} = $props();
	let open = $state(false);
	let busy = $state(false);
	let error = $state('');
	// Gone (the page moved on): a late answer changes nothing of the page now (Codex S7 second confirmation #2).
	let gone = false;
	onDestroy(() => (gone = true));
	const noun = $derived(item.kind === 'file' ? t('ไฟล์นี้', 'this file') : item.kind === 'template' ? t('คำสั่งนี้', 'this prompt') : t('เรื่องนี้', 'this item'));

	async function take() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const taken = await OrcaLibraryService.takeover(hubID, item.id);
			open = false;
			if (!gone) ontaken(taken);
		} catch (cause) {
			const code = getHttpStatusCode(cause);
			if (code === 404) {
				open = false;
				if (!gone) ondenied();
				return;
			}
			const problem = parseErrorContent(cause);
			// The server's 403 has no reason code: the owner is still here, or this person's role changed (Codex S7 fourth confirmation #6).
			error =
				code === 403
					? t('ยังรับช่วงไม่ได้ เจ้าของอาจยังอยู่ในพื้นที่ทำงานนี้ หรือสิทธิ์ของคุณเปลี่ยน โหลดหน้าใหม่แล้วลองอีกครั้ง', 'You can’t take this over now: its owner may still be in this workspace, or your role changed. Reload and try again.')
					: (fileActionProblem(problem, t) ?? orcaError(cause));
		} finally {
			busy = false;
		}
	}
</script>

<section class="tk" aria-labelledby={`tk-${item.id}`}>
	<h2 id={`tk-${item.id}`}>{t(`เจ้าของ${noun}ไม่อยู่แล้ว`, 'Its owner has left')}</h2>
	<p>{t(`ไม่มีใครแก้ไข${noun}ได้ จนกว่าเจ้าของบริษัทหรือผู้ดูแลจะรับช่วงดูแล`, 'Nobody can change it until a company owner or admin takes it over.')}</p>
	<button type="button" class="k-button" onclick={() => (open = true)}><UserRoundCheck size={16} aria-hidden="true" />{t('รับช่วงดูแล', 'Take over')}</button>
</section>

<ConfirmDialog
	bind:open
	icon={UserRoundCheck}
	title={t(`รับช่วงดูแล “${item.title}”?`, `Take over “${item.title}”?`)}
	message={t(
		`คุณจะเป็นเจ้าของ${noun} แก้ไข เผยแพร่ และลบได้ ส่วนคนที่ใช้ได้ยังเหมือนเดิม ORCA บันทึกไว้ในประวัติการตั้งค่า`,
		'You become its owner and can edit, publish and delete it. Who can use it stays the same. ORCA records it in the settings history.'
	)}
	confirmLabel={busy ? t('กำลังรับช่วง…', 'Taking over…') : t('รับช่วงดูแล', 'Take over')}
	{busy}
	onconfirm={take}
	oncancel={() => (error = '')}
>
	{#if error}<p class="tk-error" role="alert">{error}</p>{/if}
</ConfirmDialog>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
	.tk {
		padding: 18px 20px;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
	}
	.tk h2 {
		margin: 0 0 6px;
		font-size: 13.5px;
		font-weight: 700;
	}
	.tk p {
		margin: 0 0 12px;
		color: var(--orca-text-2);
		font-size: 13px;
		line-height: 1.55;
	}
	.tk :global(.k-button) {
		width: 100%;
		justify-content: center;
		font-weight: 600;
	}
	.tk-error {
		margin: 12px 0 0;
		color: var(--orca-deny);
		font-size: 13px;
	}
</style>
