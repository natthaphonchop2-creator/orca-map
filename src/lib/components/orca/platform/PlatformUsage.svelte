<script lang="ts">
	import { Building2, TriangleAlert } from '@lucide/svelte';
	import { orcaLocale, t } from '$lib/orca/locale.svelte';
	import { lastUsedLabel, usageNumber, usageRows, type OrcaPlatformUsage } from '$lib/orca/platform-usage';
	import EmptyState from '../ui/EmptyState.svelte';

	// ภาพรวมแพลตฟอร์ม › การใช้งาน AI (C4 design §14i): four numbers for the
	// whole platform, then each company, the latest activity first. Numbers and
	// company names only: the answer never names a person. Before it loads the
	// numbers read "—"; a failure says so here only, with a retry.
	let {
		usage,
		error = '',
		onretry
	}: {
		usage?: OrcaPlatformUsage;
		error?: string;
		onretry?: () => void;
	} = $props();

	const loading = $derived(!usage && !error);
	const n = (value: number | undefined) => (usage && value !== undefined ? usageNumber(value) : '—');
	type Tile = { label: string; value: string; extra?: string; detail: string };
	const tiles = $derived<Tile[]>([
		{
			label: t('บริษัทที่ใช้งานใน 7 วัน', 'Companies active in 7 days'),
			value: n(usage?.companies.activeLast7Days),
			detail: error ? t('โหลดไม่สำเร็จ', "Couldn't load") : usage ? t(`จากทั้งหมด ${n(usage.companies.total)} บริษัท`, `of ${n(usage.companies.total)} companies`) : ' '
		},
		{
			label: t('คนที่เชื่อม AI แล้ว', 'People with AI connected'),
			value: n(usage?.people.aiConnected),
			detail: error ? t('โหลดไม่สำเร็จ', "Couldn't load") : usage ? t(`จากสมาชิก ${n(usage.people.members)} คน`, `of ${n(usage.people.members)} members`) : ' '
		},
		{
			label: t('คนที่ใช้ AI วันนี้ / 7 วัน', 'People using AI today / 7 days'),
			value: n(usage?.aiUsers.today),
			extra: usage ? n(usage.aiUsers.last7Days) : undefined,
			detail: error ? t('โหลดไม่สำเร็จ', "Couldn't load") : usage ? t('นับคนละครั้ง แม้อยู่หลายบริษัท', 'Each person counts once, even in several companies') : ' '
		},
		{
			label: t('คำขอจาก AI ใน 7 วัน', 'AI requests in 7 days'),
			value: n(usage?.toolCalls.last7Days),
			detail: error ? t('โหลดไม่สำเร็จ', "Couldn't load") : usage ? t(`วันนี้ ${n(usage.toolCalls.today)} ครั้ง`, `${n(usage.toolCalls.today)} today`) : ' '
		}
	]);
	const rows = $derived(usage ? usageRows(usage.items) : []);
	const updated = $derived.by(() => {
		const at = usage ? new Date(usage.generatedAt) : undefined;
		if (!at || Number.isNaN(at.getTime())) return '';
		return new Intl.DateTimeFormat(orcaLocale.value === 'en' ? 'en-GB' : 'th-TH', { timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(at);
	});
	const last = (day: string | null) => lastUsedLabel(day, usage?.today ?? '', t, orcaLocale.value);
</script>

<section class="usage" aria-labelledby="usage-title" aria-busy={loading}>
	<div class="usage-head">
		<h2 id="usage-title">{t('การใช้งาน AI', 'AI usage')}</h2>
		<p>
			{t('7 วันล่าสุด ตามเวลาประเทศไทย รวมบริษัทของทีม ORCA', "The last 7 days in Thailand time, the ORCA team's company included")}{#if updated}<span class="usage-updated">{t(` · ข้อมูลเมื่อ ${updated} น.`, ` · as of ${updated}`)}</span>{/if}
		</p>
	</div>

	<ul class="usage-tiles">
		{#each tiles as tile (tile.label)}
			<li>
				<span class="usage-tile-label">{tile.label}</span>
				<strong class="usage-tile-value">{tile.value}{#if tile.extra !== undefined}<span class="usage-tile-extra">/ {tile.extra}</span>{/if}</strong>
				<span class="usage-tile-detail" class:failed={!!error}>{tile.detail}</span>
			</li>
		{/each}
	</ul>

	{#if error}
		<p class="usage-error" role="alert">
			<TriangleAlert size={16} aria-hidden="true" />{t('โหลดตัวเลขการใช้งานไม่สำเร็จ', "The usage numbers couldn't load.")}
			{#if onretry}<button type="button" class="k-link-button" onclick={onretry}>{t('ลองอีกครั้ง', 'Try again')}</button>{/if}
		</p>
	{:else if loading}
		<p class="usage-quiet" role="status">{t('กำลังโหลดการใช้งาน…', 'Loading usage…')}</p>
	{:else if rows.length === 0}
		<EmptyState icon={Building2} message={t('ยังไม่มีบริษัทบน ORCA', 'No companies on ORCA yet.')} />
	{:else}
		<h3 id="usage-companies-title" class="usage-subtitle">{t('การใช้งานรายบริษัท', 'Usage by company')}<small>{t('เรียงตามการใช้งานล่าสุด', 'Latest activity first')}</small></h3>
		{#if usage && usage.toolCalls.last7Days === 0}
			<p class="usage-quiet">{t('ยังไม่มีบริษัทไหนใช้ AI ใน 7 วันที่ผ่านมา', 'No company has used AI in the last 7 days.')}</p>
		{/if}
		<div class="usage-list">
			<table class="usage-table" aria-labelledby="usage-companies-title">
				<thead>
					<tr>
						<th scope="col">{t('บริษัท', 'Company')}</th>
						<th scope="col" class="num">{t('สมาชิก', 'Members')}</th>
						<th scope="col" class="num">{t('เชื่อม AI แล้ว', 'AI connected')}</th>
						<th scope="col" class="num">{t('คนที่ใช้ AI (7 วัน)', 'Using AI (7 days)')}</th>
						<th scope="col" class="num">{t('คำขอจาก AI (7 วัน)', 'AI requests (7 days)')}</th>
						<th scope="col">{t('ใช้ล่าสุด', 'Last used')}</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class:idle={!row.lastCallDay}>
							<th scope="row">
								<span class="usage-company">
									<span class="usage-mark" aria-hidden="true"><Building2 size={16} /></span>
									<span><strong>{row.displayName}</strong>{#if row.id === 'default'}<small>{t('บริษัทของทีม ORCA', "The ORCA team's company")}</small>{/if}</span>
								</span>
							</th>
							<td class="num"><span class="usage-cell-label">{t('สมาชิก', 'Members')}</span>{usageNumber(row.members)}</td>
							<td class="num"><span class="usage-cell-label">{t('เชื่อม AI แล้ว', 'AI connected')}</span>{usageNumber(row.aiConnected)}</td>
							<td class="num"><span class="usage-cell-label">{t('คนที่ใช้ AI (7 วัน)', 'Using AI (7 days)')}</span>{usageNumber(row.aiUsersLast7Days)}</td>
							<td class="num"><span class="usage-cell-label">{t('คำขอจาก AI (7 วัน)', 'AI requests (7 days)')}</span>{usageNumber(row.toolCallsLast7Days)}</td>
							<td class="usage-last"><span class="usage-cell-label">{t('ใช้ล่าสุด', 'Last used')}</span>{last(row.lastCallDay)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.usage {
		margin-bottom: 28px;
	}
	.usage-head {
		margin-bottom: 12px;
	}
	.usage-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 650;
	}
	.usage-head p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13.5px;
	}
	.usage-tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
		gap: 14px;
		margin: 0 0 18px;
		padding: 0;
		list-style: none;
	}
	.usage-tiles li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-ink);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
	}
	.usage-tile-label {
		color: var(--orca-muted);
		font-size: 13.5px;
		font-weight: 500;
	}
	/* A headline number keeps proportional figures; only the table's columns are tabular. */
	.usage-tile-value {
		font-size: 28px;
		font-weight: 700;
		line-height: 1.3;
	}
	.usage-tile-extra {
		margin-left: 6px;
		color: var(--orca-muted);
		font-size: 20px;
		font-weight: 600;
	}
	.usage-tile-detail {
		min-height: 1.5em;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.usage-tile-detail.failed {
		color: var(--orca-deny);
	}
	.usage-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		margin: 0;
		padding: 12px 16px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 14px;
	}
	.usage-error :global(svg) {
		flex: none;
	}
	.usage-quiet {
		margin: 0 0 12px;
		padding: 14px 18px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 14px;
	}
	.usage-subtitle {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		margin: 0 0 10px;
		font-size: 14.5px;
		font-weight: 600;
	}
	.usage-subtitle small {
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 400;
	}
	.usage-list {
		container: usage / inline-size;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--orca-ink) 5%, transparent);
	}
	.usage-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	.usage-table thead th {
		padding: 11px 16px;
		border-bottom: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-size: 12.5px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}
	.usage-table tbody th,
	.usage-table td {
		padding: 13px 16px;
		border-top: 1px solid var(--orca-line-soft);
		color: var(--orca-ink);
		font-weight: 400;
		text-align: left;
		vertical-align: middle;
	}
	.usage-table tbody tr:first-child th,
	.usage-table tbody tr:first-child td {
		border-top: 0;
	}
	.usage-table .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.usage-table thead th.num {
		text-align: right;
	}
	.usage-company {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 200px;
	}
	.usage-company strong {
		display: block;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.usage-company small {
		display: block;
		color: var(--orca-muted);
		font-size: 12.5px;
	}
	.usage-mark {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--orca-secondary);
		color: var(--orca-text-2);
	}
	.usage-last {
		white-space: nowrap;
	}
	tr.idle .usage-last {
		color: var(--orca-muted);
	}
	.usage-cell-label {
		display: none;
	}

	@media (max-width: 720px) {
		.usage-tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.usage-tiles li {
			padding: 14px;
		}
		.usage-tile-value {
			font-size: 24px;
		}
		.usage-tile-extra {
			font-size: 17px;
		}
	}
	/* Each company is a card when the list is narrower than the table needs
	   (under 720px of page, or a laptop with the sidebar open). */
	@container usage (max-width: 760px) {
		.usage-table thead {
			display: none;
		}
		.usage-table,
		.usage-table tbody,
		.usage-table tr {
			display: block;
			width: auto;
		}
		.usage-table tr {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px 16px;
			padding: 14px 16px;
			border-top: 1px solid var(--orca-line-soft);
		}
		.usage-table tbody tr:first-child {
			border-top: 0;
		}
		.usage-table tbody th,
		.usage-table td {
			display: flex;
			flex-direction: column;
			padding: 0;
			border: 0;
			text-align: left;
		}
		.usage-table tbody th {
			grid-column: 1 / -1;
		}
		.usage-table .num {
			text-align: left;
		}
		/* The first column lines up with the company's name, beside its mark. */
		.usage-table td:nth-child(even) {
			padding-left: 44px;
		}
		.usage-table td {
			font-weight: 600;
		}
		.usage-cell-label {
			display: block;
			color: var(--orca-muted);
			font-size: 12.5px;
			font-weight: 400;
			font-variant-numeric: normal;
			white-space: normal;
		}
		.usage-company {
			min-width: 0;
		}
	}
</style>
