<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Archive, ArrowRight, BookOpen, Check, Copy, Sparkles, Zap } from '@lucide/svelte';
	import { term } from '$lib/orca/glossary';
	import { askPrompt } from '$lib/orca/knowledge';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import type { OrcaHub } from '$lib/services/orca';
	import type { LibraryItem, LibraryUsage } from '$lib/services/orca-library';
	import { copyFeedback, copyText } from '../ui/copy';
	import { showToast } from '../ui/toast-store.svelte';
	import UsageCard from './UsageCard.svelte';

	// The side of the knowledge page: a nudge to connect my AI when it is not
	// (in place of the old MCP-URL box), "ลองถาม AI" with a prompt to copy, and
	// what each status means.
	let {
		item,
		connected = false,
		app = '',
		workspace,
		legend = true,
		ask = true,
		files = false,
		paused = false,
		usage
	}: {
		/** The item to ask about: the open one, or the newest published article. */
		item?: LibraryItem;
		/** The viewer's AI reaches this workspace (aiConnectionReaches). */
		connected?: boolean;
		/** The AI app whose sign-in reaches this workspace, e.g. "Claude" (aiConnectionAppFor). */
		app?: string;
		/** The library's workspace: one with its own sign-in (SSO) is connected with its own link. */
		workspace?: Pick<OrcaHub, 'id' | 'userSourceID'>;
		legend?: boolean;
		/** Whether to show "ลองถาม AI" at all. */
		ask?: boolean;
		/** The file list (knowledge library v2): the legend tells the reading states too. */
		files?: boolean;
		/** The file list after library v2 was turned off: the AI uses no file. */
		paused?: boolean;
		/** The company's file quota, beside the file list. */
		usage?: LibraryUsage;
	} = $props();
	const prompt = $derived(item ? askPrompt(item, t) : '');
	let copied = $state(false);
	const feedback = copyFeedback((value) => (copied = value));
	onDestroy(() => feedback.dispose());
	async function copy() {
		const ok = await copyText(prompt, typeof navigator === 'undefined' ? undefined : navigator.clipboard, typeof document === 'undefined' ? undefined : document);
		if (ok) {
			feedback.copied();
			showToast(t('คัดลอกคำถามแล้ว วางใน AI ของคุณได้เลย', 'Question copied. Paste it into your AI.'));
		} else showToast(t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง', 'Copy failed. Select the text and copy it yourself.'), { tone: 'error' });
	}
</script>

<aside class="rail" aria-label={t('ลองใช้กับ AI', 'Try it with AI')}>
	{#if !connected && workspace?.userSourceID}
		<!-- Its own sign-in (SSO) and nothing of mine reaches it: its own link on the overview, not เชื่อม AI ของฉัน (Codex review 72). -->
		<div class="kn-card connect">
			<div class="connect-h"><span class="ask-ic" aria-hidden="true"><Sparkles size={16} /></span><b>{t('AI ของคุณยังใช้พื้นที่นี้ไม่ได้', "Your AI can't use this workspace yet")}</b></div>
			<p>{t('พื้นที่นี้ใช้ SSO ของบริษัท ลิงก์ ORCA ของบริษัทจึงไม่รวมพื้นที่นี้ เพิ่มลิงก์ของพื้นที่นี้ใน Claude หรือ ChatGPT แล้วเข้าสู่ระบบด้วย SSO ของบริษัท', "It uses company SSO, so your company's ORCA link doesn't include it. Add this workspace's link in Claude or ChatGPT and sign in with company SSO.")}</p>
			<a class="k-button" href={localeHref(`/app?view=hub&hub=${encodeURIComponent(workspace.id)}&tab=overview`)}>{t('ดูลิงก์ของพื้นที่นี้', "See this workspace's link")}<ArrowRight size={15} aria-hidden="true" /></a>
		</div>
	{:else if !connected}
		<div class="kn-card connect">
			<div class="connect-h"><span class="ask-ic" aria-hidden="true"><Sparkles size={16} /></span><b>{t('ยังไม่ได้เชื่อม AI ของคุณ', 'Your AI is not connected')}</b></div>
			<p>{t('เชื่อมครั้งเดียว แล้ว Claude หรือ ChatGPT จะตอบจากคลังนี้ได้', 'Connect once and Claude or ChatGPT can answer from this library.')}</p>
			<a class="k-button" href={localeHref('/app?view=connect-ai')}>{term('connectMyAI', t)}<ArrowRight size={15} aria-hidden="true" /></a>
		</div>
	{/if}

	{#if ask}
	<div class="kn-card ask">
		<div class="ask-h"><span class="ask-ic" aria-hidden="true"><Sparkles size={16} /></span><b>{t('ลองถาม AI', 'Try asking AI')}</b></div>
		{#if item}
			<p>
				{app
					? t(`ถามใน ${app} เพื่อเช็กว่า AI ตอบถูก`, `Ask in ${app} to check the answer`)
					: t('ถามใน Claude หรือ ChatGPT เพื่อเช็กว่า AI ตอบถูก', 'Ask in Claude or ChatGPT to check the answer')}
			</p>
			<p class="ask-q">{prompt}</p>
			<button type="button" class="k-button ask-copy" onclick={copy}>
				{#if copied}<Check size={15} aria-hidden="true" />{t('คัดลอกแล้ว', 'Copied')}{:else}<Copy size={15} aria-hidden="true" />{t('คัดลอกคำถาม', 'Copy question')}{/if}
			</button>
			<p class="ask-src">
				{#if item.kind === 'template'}<Zap size={14} aria-hidden="true" />{:else}<BookOpen size={14} aria-hidden="true" />{/if}
				<span>{t('AI จะตอบจาก', 'AI answers from')} <b>{item.title}</b></span>
			</p>
		{:else}
			<p>{t('เผยแพร่ความรู้อย่างน้อย 1 เรื่อง แล้วลองถาม AI ได้ที่นี่', 'Publish at least one article, then try asking AI here.')}</p>
		{/if}
	</div>
	{/if}

	{#if usage}<UsageCard {usage} />{/if}

	{#if legend}
		<div class="kn-card lg">
			<h2>{t('สถานะหมายถึงอะไร', 'What the statuses mean')}</h2>
			<ul>
				{#if paused}
					<li><span class="pill"><i class="dt plain"></i>{t('เผยแพร่แล้ว', 'Published')}</span>{t('ตอนนี้ AI ไม่ได้ใช้ไฟล์ เพราะคลังความรู้แบบไฟล์ของบริษัทปิดอยู่', 'AI does not use files now: file Knowledge is off for this company')}</li>
				{:else}
					<li><span class="pill ok"><i class="dt"></i>{t('AI ใช้ได้', 'AI can use')}</span>{t('AI ของคนที่เลือกไว้ใช้ตอบได้ทันที', 'The chosen people’s AI can answer from it now')}</li>
				{/if}
				<li><span class="pill"><i class="dt draft"></i>{t('ฉบับร่าง', 'Draft')}</span>{t('เห็นแค่คุณ AI ยังไม่ใช้', 'Only you see it. AI does not use it yet')}</li>
				<li><span class="pill"><Archive size={12} aria-hidden="true" />{t('จัดเก็บแล้ว', 'Archived')}</span>{t('AI เลิกใช้ แต่ยังเปิดดูย้อนหลังได้', 'AI no longer uses it; you can still open it')}</li>
				{#if files}
					<li><span class="pill"><i class="dt draft"></i>{t('กำลังอ่าน', 'Reading')}</span>{t('ORCA กำลังอ่านข้อความในไฟล์ AI ยังไม่เห็น', 'ORCA is reading the file; AI does not see it yet')}</li>
					<li><span class="pill deny"><i class="dt"></i>{t('อ่านไม่ได้', 'Can’t be read')}</span>{paused ? t('เปิดไฟล์เพื่อดูเหตุผล', 'Open the file to see why') : t('เปิดไฟล์เพื่อดูเหตุผล แล้วอัปโหลดฉบับใหม่', 'Open the file to see why, then upload a new version')}</li>
				{/if}
			</ul>
		</div>
	{/if}
</aside>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.kn-card {
		padding: 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.ask-h,
	.connect-h {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}
	.ask-h b,
	.connect-h b {
		font-size: 16px;
		font-weight: 700;
		line-height: 1.4;
	}
	.ask-ic {
		display: grid;
		flex: none;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 1px solid var(--orca-citron-line);
		border-radius: 9px;
		background: var(--orca-citron-soft);
		color: var(--orca-ink);
	}
	.kn-card p {
		margin: 0 0 14px;
		color: var(--orca-muted);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.connect {
		border-color: var(--orca-citron-line);
		background: var(--orca-citron-soft);
	}
	.connect p {
		color: var(--orca-text-2);
	}
	.connect .k-button {
		width: 100%;
		justify-content: center;
	}
	.ask .ask-q {
		margin: 0;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: 12px 12px 4px 12px;
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14.5px;
		line-height: 1.6;
	}
	.ask-copy {
		width: 100%;
		min-height: 40px;
		margin-top: 12px;
		justify-content: center;
		font-weight: 600;
	}
	.ask .ask-src {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		margin: 14px 0 0;
		padding-top: 12px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-subtle);
		font-size: 12.5px;
	}
	.ask-src :global(svg) {
		flex: none;
		margin-top: 3px;
	}
	.ask-src b {
		color: var(--orca-text-2);
		font-weight: 600;
	}
	.lg {
		padding: 18px 20px;
		background: var(--orca-surface-2);
	}
	.lg h2 {
		margin: 0 0 12px;
		font-size: 14px;
		font-weight: 600;
	}
	.lg ul {
		display: grid;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.lg li {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 9px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.pill.ok {
		border-color: var(--orca-ok-line);
		background: var(--orca-ok-bg);
		color: var(--orca-ok);
	}
	.pill.deny {
		border-color: var(--orca-deny-line);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
	}
	.dt {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	/* A neutral state (published while file Knowledge is off): a grey dot in either theme. */
	.dt.plain {
		background: var(--orca-subtle);
	}
	.dt.draft {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--orca-subtle);
		background: transparent;
	}
</style>
