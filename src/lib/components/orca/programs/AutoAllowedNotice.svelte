<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { programToolsHref } from '$lib/orca/program-catalog';
	import type { OrcaConnection } from '$lib/services/orca';

	// After the connect page saved a program on its own (W0, owner 2026-10-07:
	// "บันทึกอัตโนมัติ"): what AI was allowed, said once, with the way to change it.
	let { connection }: { connection: Pick<OrcaConnection, 'id' | 'name' | 'toolNames' | 'reviewedReadOnly'> } = $props();
	const count = $derived(connection.toolNames?.length ?? 0);
</script>

<p class="auto-allowed" role="status">
	<Check size={15} strokeWidth={2.25} aria-hidden="true" />
	<span
		>{connection.reviewedReadOnly
			? t(`เชื่อม ${connection.name} แล้ว · AI ดูข้อมูลได้ ${count} อย่าง`, `${connection.name} connected · AI can read ${count} ${count === 1 ? 'thing' : 'things'}`)
			: t(`เชื่อม ${connection.name} แล้ว · AI ทำได้ ${count} อย่าง`, `${connection.name} connected · AI can do ${count} ${count === 1 ? 'thing' : 'things'}`)}</span
	>
	<a href={localeHref(programToolsHref(connection.id))}>{t('เปลี่ยน', 'Change')}</a>
</p>

<style>
	/* orca-type-remap v1 */
	.auto-allowed {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		margin: 12px 0 0;
		padding: 10px 12px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		color: var(--orca-ink);
		font-size: 13px;
	}
	.auto-allowed span {
		flex: 1 1 200px;
		min-width: 0;
	}
	.auto-allowed a {
		color: var(--orca-ink);
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
