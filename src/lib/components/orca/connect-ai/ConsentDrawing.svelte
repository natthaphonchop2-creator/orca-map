<script lang="ts">
	import { t } from '$lib/orca/locale.svelte';
	import Brand from '../Brand.svelte';

	// Step 4: a small drawing of ORCA's consent window, so the person knows it
	// when it opens, with the two things to check pointed out beside it.
	let { app, host, name, email }: { app: string; host: string; name: string; email: string } = $props();
	const initial = $derived((name.trim()[0] || email.trim()[0] || 'O').toLocaleUpperCase());
</script>

<div class="ca-consent">
	<div class="ca-frame" role="img" aria-label={t(`ตัวอย่างหน้าต่าง ORCA: ${app} ขอใช้ข้อมูลบริษัท มีปุ่ม อนุญาต`, `Example of the ORCA window: ${app} asks to use company data, with an Allow button`)}></div>
	<div class="ca-bar" aria-hidden="true"><i></i><i></i><i></i><span>{host}</span></div>
	<div class="ca-head" aria-hidden="true">
		<span class="ca-wordmark"><Brand /></span>
		<b>{t(`${app} ขอใช้ข้อมูลบริษัทผ่าน ORCA ในนามของคุณ`, `${app} wants to use company data through ORCA for you`)}</b>
		<small>{t('ทำได้เฉพาะสิ่งที่บริษัทอนุญาตให้คุณ', 'Only what your company allows you')}</small>
	</div>
	<div class="ca-account" aria-hidden="true"><span class="ca-avatar">{initial}</span><span class="ca-name">{name || email}</span>{#if name && email}<span class="ca-email">{email}</span>{/if}</div>
	<div class="ca-buttons" aria-hidden="true">
		<span>{t('ไม่อนุญาต', 'Deny')}</span><span class="go">{t('อนุญาต', 'Allow')}</span>
		<svg class="ca-cursor" viewBox="0 0 22 22"><path d="M4 2.5v15l3.8-3.6 2.6 6 2.6-1.1-2.6-5.9h5.3z" /></svg>
	</div>
	<p class="ca-note one"><span class="ca-lead" aria-hidden="true"></span><span><b>{t('ดูว่าเป็นบัญชีของคุณ', 'Check it is your account')}</b><small>{t('ต้องเป็น Google บัญชีเดียวกับที่ใช้เข้า ORCA', 'The same Google account you use for ORCA')}</small></span></p>
	<p class="ca-note two"><span class="ca-lead" aria-hidden="true"></span><span><b>{t('กด อนุญาต ครั้งเดียว', 'Choose Allow once')}</b><small>{t(`ครั้งต่อไป ${app} ใช้ข้อมูลได้ทันที`, `After that, ${app} can use the data right away`)}</small></span></p>
</div>

<style>
	/* orca-type-remap v1 */
	/* One grid: the window's rows in the first column, each note in the second
	   on the row it points at, so the notes stay level with what they name. */
	.ca-consent {
		display: grid;
		grid-template-columns: 352px minmax(0, 1fr);
		grid-template-rows: repeat(4, auto);
		max-width: 100%;
	}
	.ca-frame {
		position: relative;
		z-index: 0;
		grid-column: 1;
		grid-row: 1 / -1;
		border: 1px solid var(--orca-line-strong);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		box-shadow: var(--orca-popover-shadow);
	}
	.ca-bar,
	.ca-head,
	.ca-account,
	.ca-buttons {
		position: relative;
		z-index: 1;
		grid-column: 1;
		min-width: 0;
	}
	.ca-bar {
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 7px 10px;
		border: 1px solid transparent;
		border-bottom-color: var(--orca-line);
		border-radius: var(--orca-radius-lg) var(--orca-radius-lg) 0 0;
		background: var(--orca-surface-2);
	}
	.ca-bar i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--orca-line-strong);
	}
	.ca-bar span {
		min-width: 0;
		margin-left: 8px;
		padding: 3px 8px;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: 5px;
		background: var(--orca-surface);
		color: var(--orca-subtle);
		font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ca-head {
		grid-row: 2;
		display: grid;
		padding: 16px 18px 0;
	}
	.ca-wordmark {
		--orca-brand-size: 18px;
		margin: 0 0 12px -2px;
		color: var(--orca-ink);
	}
	.ca-head b {
		color: var(--orca-ink);
		font-size: 13px;
		font-weight: 650;
		line-height: 1.45;
	}
	.ca-head small {
		margin-top: 3px;
		color: var(--orca-muted);
		font-size: 11.5px;
	}
	.ca-account {
		grid-row: 3;
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 18px 0;
		padding: 7px 9px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font-size: 11.5px;
	}
	.ca-avatar {
		display: grid;
		flex: none;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--orca-ink);
		color: var(--orca-on-ink);
		font-size: 10px;
		font-weight: 700;
	}
	.ca-name,
	.ca-email {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ca-email {
		margin-left: auto;
		color: var(--orca-muted);
	}
	.ca-buttons {
		grid-row: 4;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 22px 18px 18px;
	}
	.ca-buttons span {
		padding: 7px 0;
		border: 1px solid var(--orca-line-strong);
		border-radius: 7px;
		color: var(--orca-ink);
		font-size: 12px;
		font-weight: 600;
		text-align: center;
	}
	/* "อนุญาต": the chosen fill (ink in light, citron in dark) with a citron ring. */
	.ca-buttons span.go {
		border-color: var(--orca-chosen);
		background: var(--orca-chosen);
		color: var(--orca-on-ink);
		box-shadow: 0 0 0 3px var(--orca-citron);
	}
	:global(:root[data-orca-theme='dark']) .ca-buttons span.go {
		box-shadow: 0 0 0 3px var(--orca-citron-line);
	}
	.ca-cursor {
		position: absolute;
		right: 52px;
		bottom: 6px;
		width: 22px;
		height: 22px;
	}
	.ca-cursor path {
		fill: var(--orca-ink);
		stroke: var(--orca-surface);
		stroke-width: 1.4;
	}
	.ca-note {
		grid-column: 2;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin: 0 0 0 -19px;
		min-width: 0;
	}
	.ca-note.one {
		grid-row: 3;
		align-self: end;
		transform: translateY(12px);
	}
	.ca-note.two {
		grid-row: 4;
		align-self: center;
		transform: translateY(6px);
	}
	.ca-lead {
		position: relative;
		flex: none;
		width: 52px;
		margin-top: 10px;
		border-top: 1.5px dashed var(--orca-line-strong);
	}
	.ca-lead::before {
		content: '';
		position: absolute;
		top: -5px;
		left: -4px;
		box-sizing: border-box;
		width: 8px;
		height: 8px;
		border: 2px solid var(--orca-ink);
		border-radius: 50%;
		background: var(--orca-surface);
	}
	.ca-note > span:last-child {
		display: grid;
		min-width: 0;
	}
	.ca-note b {
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.ca-note small {
		color: var(--orca-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	/* Narrow: the notes go under the window as a short list. */
	@container ca (max-width: 640px) {
		.ca-consent {
			grid-template-columns: minmax(0, 352px);
		}
		.ca-note {
			grid-column: 1;
			margin: 14px 0 0;
			transform: none;
			align-self: start;
		}
		.ca-note.one {
			grid-row: 5;
		}
		.ca-note.two {
			grid-row: 6;
			margin-top: 10px;
		}
		.ca-lead {
			width: 8px;
			height: 8px;
			margin-top: 7px;
			border: 0;
		}
		.ca-lead::before {
			top: 0;
			left: 0;
		}
	}
</style>
