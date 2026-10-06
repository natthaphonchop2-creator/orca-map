<script lang="ts">
	import { parseErrorContent } from '$lib/errors';
	import {
		buildSpec,
		cellRoles,
		classifyTemplate,
		columnName,
		decide,
		FIELD_TYPES,
		gateText,
		gridBounds,
		keepAllText,
		problemText,
		publishGate,
		refusalText,
		specProblems,
		startReview,
		templateFileText,
		typeText,
		undecided,
		versionStateText,
		workingVersion,
		type Disposition,
		type Review,
		type SpecProblem
	} from '$lib/orca/doc-templates';
	import { gatewayHasMember } from '$lib/orca/gateway-sources';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { memberName, orcaError, type OrcaBootstrap, type OrcaHub } from '$lib/services/orca';
	import { OrcaDocTemplateService, type DocTemplate } from '$lib/services/orca-doc-templates';
	import { onDestroy } from 'svelte';
	import ConfirmDialog from '../ui/ConfirmDialog.svelte';
	import PageHeader from '../ui/PageHeader.svelte';
	import { showToast } from '../ui/toast-store.svelte';

	// One document template, for a manager (plan §1.1): ORCA's proposal on
	// one screen, every uncovered cell's คงไว้ / ล้างทุกครั้ง, ยืนยัน, ลองสร้างเอกสาร
	// and เผยแพร่, which waits until every cell is decided. The server checks
	// the same again.
	let {
		data,
		hub,
		templateID,
		onback,
		onchanged
	}: {
		data: OrcaBootstrap;
		hub: OrcaHub;
		templateID: string;
		onback: () => void;
		onchanged: () => void;
	} = $props();

	let template = $state<DocTemplate>();
	let loadError = $state('');
	let review = $state<Review>();
	let confirmedSnapshot = $state('');
	let busy = $state<'' | 'confirm' | 'test' | 'publish' | 'unpublish' | 'delete' | 'replace'>('');
	let problems = $state<SpecProblem[]>([]);
	let actionError = $state('');
	let testFile = $state<{ id: string; name: string }>();
	let audience = $state<'everyone_live' | 'list'>('everyone_live');
	let chosen = $state<string[]>([]);
	let deleteOpen = $state(false);
	let showAllCells = $state(false);
	let sheetIndex = $state(0);
	let poll: ReturnType<typeof setTimeout> | undefined;
	let reviewVersion = 0;
	let typeOpen = $state('');

	const version = $derived(template ? workingVersion(template) : undefined);
	const report = $derived(version?.report);
	const uncovered = $derived(report?.facts.uncovered ?? []);
	const open = $derived(review ? undecided(review, uncovered) : []);
	const snapshot = (value: Review | undefined) => (value && report ? JSON.stringify([buildSpec(report.proposal, value, uncovered), value.whenToUse.trim(), value.expectedSources]) : '');
	const edited = $derived(!!review && snapshot(review) !== confirmedSnapshot);
	const gate = $derived(publishGate(version, review, edited));
	const people = $derived(data.members.filter((member) => gatewayHasMember(hub, member.id)));
	const sheet = $derived(report?.grid[sheetIndex]);
	const roles = $derived(sheet && review && report ? cellRoles(sheet, review, report.proposal.kept, uncovered) : new Map());
	const bounds = $derived(sheet ? gridBounds(sheet) : { rows: 0, cols: 0, cut: false });
	const sheetText = $derived(new Map((sheet?.cells ?? []).map((cell) => [cell.ref, cell.text] as const)));
	const texts = $derived(new Map<string, string>((report?.grid ?? []).flatMap((s) => s.cells.map((c) => [`${s.name}!${c.ref}`, c.text] as [string, string]))));
	const shownCells = $derived(showAllCells ? uncovered : open.length ? open : uncovered.slice(0, 12));

	async function load() {
		try {
			const next = await OrcaDocTemplateService.get(hub.id, templateID);
			template = next;
			loadError = '';
			const v = workingVersion(next);
			if (v && v.state !== 'scanning' && v.state !== 'refused' && (!review || v.version !== reviewVersion)) {
				review = startReview(v, next);
				reviewVersion = v.version;
				confirmedSnapshot = v.specSha256 ? snapshot(review) : '';
				audience = next.audienceMode === 'list' ? 'list' : 'everyone_live';
				chosen = [...next.memberIDs];
			}
			clearTimeout(poll);
			if (v?.state === 'scanning') poll = setTimeout(() => void load(), 3000);
		} catch (cause) {
			loadError = orcaError(cause);
		}
	}
	$effect(() => {
		void templateID;
		void load();
	});
	onDestroy(() => clearTimeout(poll));

	function setDecision(cell: string, value: Disposition | undefined) {
		if (review) review = decide(review, cell, value);
	}

	async function confirm() {
		if (!template || !version || !review || !report || busy) return;
		busy = 'confirm';
		problems = [];
		actionError = '';
		try {
			template = await OrcaDocTemplateService.confirm(hub.id, template.id, {
				version: version.version,
				spec: buildSpec(report.proposal, review, uncovered),
				whenToUse: review.whenToUse.trim(),
				expectedSources: review.expectedSources.filter(Boolean)
			});
			confirmedSnapshot = snapshot(review);
			showToast(t('ยืนยันการตั้งค่าแล้ว', 'Setup confirmed'));
			onchanged();
		} catch (cause) {
			const parsed = parseErrorContent(cause);
			problems = specProblems(parsed.message);
			if (!problems.length) actionError = orcaError(cause);
		} finally {
			busy = '';
		}
	}

	async function testFill() {
		if (!template || busy) return;
		busy = 'test';
		actionError = '';
		testFile = undefined;
		try {
			const result = await OrcaDocTemplateService.testFill(hub.id, template.id);
			testFile = result.file;
		} catch (cause) {
			actionError = orcaError(cause);
		} finally {
			busy = '';
		}
	}

	async function publish() {
		if (!template || !version || gate.block !== 'none' || busy) return;
		if (audience === 'list' && !chosen.length) {
			actionError = t('เลือกอย่างน้อยหนึ่งคน', 'Choose at least one person');
			return;
		}
		busy = 'publish';
		actionError = '';
		try {
			template = await OrcaDocTemplateService.publish(hub.id, template.id, {
				version: version.version,
				audienceMode: audience,
				memberIDs: audience === 'list' ? chosen : [],
				unitIDs: []
			});
			showToast(t('เผยแพร่แล้ว AI ใช้เทมเพลตนี้ได้', 'Published. AI can use this template.'));
			onchanged();
		} catch (cause) {
			const parsed = parseErrorContent(cause);
			problems = specProblems(parsed.message);
			if (!problems.length) actionError = orcaError(cause);
		} finally {
			busy = '';
		}
	}

	async function unpublish() {
		if (!template || busy) return;
		busy = 'unpublish';
		try {
			template = await OrcaDocTemplateService.unpublish(hub.id, template.id);
			onchanged();
		} catch (cause) {
			actionError = orcaError(cause);
		} finally {
			busy = '';
		}
	}

	async function remove() {
		if (!template || busy) return;
		busy = 'delete';
		try {
			await OrcaDocTemplateService.remove(hub.id, template.id);
			showToast(t('ลบเทมเพลตแล้ว', 'Template deleted'));
			onchanged();
			onback();
		} catch (cause) {
			actionError = orcaError(cause);
		} finally {
			busy = '';
			deleteOpen = false;
		}
	}

	async function replace(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !template || busy) return;
		const check = classifyTemplate(file.name, file.size);
		if (!check.ok) {
			actionError = templateFileText(check.reason, t);
			return;
		}
		busy = 'replace';
		actionError = '';
		try {
			template = await OrcaDocTemplateService.replace(hub.id, template.id, file);
			review = undefined;
			reviewVersion = 0;
			await load();
		} catch (cause) {
			actionError = orcaError(cause);
		} finally {
			busy = '';
		}
	}

	const roleText = (role: string) =>
		({
			field: t('ช่องที่ AI กรอก', 'Filled by AI'),
			table: t('ตาราง', 'Table'),
			kept: t('สูตร คำนวณเมื่อเปิดไฟล์', 'Formula'),
			static: t('คงไว้', 'Kept'),
			clear: t('ล้างทุกครั้ง', 'Cleared'),
			undecided: t('ยังไม่ได้เลือก', 'Undecided')
		})[role] ?? '';
</script>

<div class="dt">
	<PageHeader
		title={template?.title || t('เทมเพลตเอกสาร', 'Document template')}
		subtitle={version ? `${version.originalName} · ${versionStateText(version.state, t)}` : ''}
		back={{ href: localeHref(`/app?view=documents&hub=${encodeURIComponent(hub.id)}`), label: t('เทมเพลตเอกสาร', 'Document templates') }}
	/>

	{#if loadError}
		<p class="dt-alert" role="alert">{loadError}</p>
	{:else if !template || !version}
		<p class="dt-muted">{t('กำลังโหลด…', 'Loading…')}</p>
	{:else if version.state === 'scanning'}
		<p class="dt-panel" role="status">{t('ORCA กำลังตรวจไฟล์และหาช่องที่ต้องกรอก หน้านี้จะแสดงผลเองเมื่อเสร็จ', 'ORCA is checking the file and finding the cells to fill. This page updates when it is done.')}</p>
	{:else if version.state === 'refused'}
		<div class="dt-panel">
			<p class="dt-strong">{t('ใช้ไฟล์นี้เป็นเทมเพลตไม่ได้', 'This file can’t be a template')}</p>
			<p>{refusalText(version.refusalReason, t)}</p>
			<label class="k-button primary">
				<input type="file" accept=".xlsx" class="dt-file" onchange={replace} disabled={!!busy} />{busy === 'replace' ? t('กำลังอัปโหลด…', 'Uploading…') : t('อัปโหลดไฟล์ที่แก้แล้ว', 'Upload the fixed file')}
			</label>
		</div>
	{:else if review && report}
		<section class="dt-section">
			<h2>{t('ช่องที่ AI กรอก', 'Cells AI fills')}</h2>
			<p class="dt-muted">{t('ตั้งชื่อที่ทีมเข้าใจ บอก AI ว่าค่ามาจากรายงานไหน ตัวอย่างมาจากค่าที่อยู่ในไฟล์ตอนนี้', 'Name each so your team understands it, and tell AI which report it comes from.')}</p>
			<div class="dt-fields">
				{#each review.fields as field, index (field.key)}
					<div class="dt-field" class:bad={problems.some((p) => p.key === field.key)}>
						<span class="dt-cell">{field.target.sheet}!{field.target.cell}</span>
						<label class="k-field"><span>{t('ชื่อช่อง', 'Name')}</span><input bind:value={review.fields[index].label} maxlength="120" /></label>
						<div class="k-field"><span>{t('ชนิด', 'Type')}</span>
							<span class="dt-type">{typeText(field.type, t)}
								<button type="button" class="k-button quiet small" aria-expanded={typeOpen === field.key} onclick={() => (typeOpen = typeOpen === field.key ? '' : field.key)}>{t('เปลี่ยน', 'Change')}</button>
							</span>
						</div>
						<label class="dt-check"><input type="checkbox" bind:checked={review.fields[index].required} />{t('ต้องมี', 'Required')}</label>
						{#if typeOpen === field.key}
							<div class="dt-choice wide" role="radiogroup" aria-label={t('ชนิด', 'Type')}>
								{#each [...new Set([field.type, ...FIELD_TYPES])] as type (type)}
									<label><input type="radio" name={`type-${field.key}`} value={type} bind:group={review.fields[index].type} />{typeText(type, t)}</label>
								{/each}
							</div>
						{/if}
						<label class="k-field wide"><span>{t('ค่ามาจากไหน', 'Where it comes from')}</span><input bind:value={review.fields[index].sourceHint} maxlength="200" placeholder={t('เช่น Manager Flash → Check in', 'e.g. Manager Flash → Check in')} /></label>
						<label class="k-field wide"><span>{t('คำอธิบายสำหรับ AI', 'Note for AI')}</span><input bind:value={review.fields[index].description} maxlength="500" /></label>
					</div>
				{/each}
			</div>
		</section>

		{#if review.tables.length}
			<section class="dt-section">
				<h2>{t('ตาราง', 'Tables')}</h2>
				<div class="dt-tables">
					{#each review.tables as table, index (table.key)}
						{@const proposed = report.proposal.tables.find((p) => p.key === table.key)}
						{@const across = table.orientation === 'columns'}
						<div class="dt-table" class:bad={problems.some((p) => p.key === table.key)}>
							<span class="dt-cell">{table.sheet}!{table.owns}</span>
							<label class="k-field"><span>{t('ชื่อตาราง', 'Name')}</span><input bind:value={review.tables[index].label} maxlength="120" /></label>
							{#if across}
								<label class="k-field"><span>{t('จำนวนคอลัมน์สูงสุด', 'Most columns')}</span><input type="number" min="1" max={proposed?.maxCols ?? table.maxCols} bind:value={review.tables[index].maxCols} /></label>
							{:else}
								<label class="k-field"><span>{t('จำนวนแถวสูงสุด', 'Most rows')}</span><input type="number" min="1" max={proposed?.maxRows ?? table.maxRows} bind:value={review.tables[index].maxRows} /></label>
							{/if}
							<p class="dt-muted">{t('แถวที่เกินจะอยู่ในรายงาน ไม่ถูกเขียนลงไฟล์', 'Rows that don’t fit are reported, not written.')}</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="dt-section">
			<div class="dt-row">
				<h2>{t('ช่องอื่นที่มีข้อมูล', 'Other cells with content')}</h2>
				{#if open.some((cell) => cell.kind === 'text')}
					<button type="button" class="k-button small" onclick={() => (review = keepAllText(review!, uncovered))}>{t('คงไว้ทุกช่องที่เป็นข้อความ', 'Keep all text')}</button>
				{/if}
			</div>
			<p class="dt-muted">
				{t('เลือกให้ทุกช่อง: คงไว้ = หัวข้อหรือป้ายที่เหมือนเดิมทุกวัน · ล้างทุกครั้ง = ตัวเลขของเมื่อวานที่ไม่ควรติดไปในไฟล์ใหม่', 'Choose for each: keep = headings and labels that stay the same; clear = yesterday’s figures that must not carry over.')}
			</p>
			{#if uncovered.length}
				<p class="dt-count" class:point={open.length > 0}>{open.length ? t(`ยังไม่ได้เลือก ${open.length} ช่อง`, `${open.length} cells undecided`) : t('เลือกครบทุกช่องแล้ว', 'Every cell is decided')}</p>
				<ul class="dt-cells">
					{#each shownCells as cell (cell.cell)}
						<li>
							<span class="dt-cell">{cell.cell}</span>
							<span class="dt-text">{texts.get(cell.cell) ?? ''}</span>
							<span class="dt-choice" role="radiogroup" aria-label={cell.cell}>
								<label><input type="radio" name={`d-${cell.cell}`} checked={review.decisions[cell.cell] === 'static'} onchange={() => setDecision(cell.cell, 'static')} />{t('คงไว้', 'Keep')}</label>
								<label><input type="radio" name={`d-${cell.cell}`} checked={review.decisions[cell.cell] === 'clear'} onchange={() => setDecision(cell.cell, 'clear')} />{t('ล้างทุกครั้ง', 'Clear each time')}</label>
							</span>
						</li>
					{/each}
				</ul>
				{#if !showAllCells && shownCells.length < uncovered.length}
					<button type="button" class="k-button quiet small" onclick={() => (showAllCells = true)}>{t(`ดูทั้งหมด ${uncovered.length} ช่อง`, `Show all ${uncovered.length}`)}</button>
				{/if}
			{:else}
				<p class="dt-muted">{t('ไม่มีช่องอื่นที่ต้องเลือก', 'No other cells to decide')}</p>
			{/if}
			{#if report.outside.length}
				<p class="dt-muted">{t(`ข้อความนอกช่อง (ความเห็น หัว/ท้ายกระดาษ กราฟ) ${report.outside.length} รายการ ORCA ไม่แก้ ถ้ามีข้อมูลเก่าให้ลบใน Excel`, `${report.outside.length} texts outside cells (comments, headers, charts) are never changed. Remove stale ones in Excel.`)}</p>
			{/if}
		</section>

		{#if sheet}
			<section class="dt-section">
				<div class="dt-row">
					<h2>{t('หน้าตาไฟล์', 'The sheet')}</h2>
					{#if report.grid.length > 1}
						<span class="dt-sheets" role="group" aria-label={t('ชีต', 'Sheet')}>
							{#each report.grid as s, i (s.name)}<button type="button" class="k-button small" class:quiet={i !== sheetIndex} aria-pressed={i === sheetIndex} onclick={() => (sheetIndex = i)}>{s.name}</button>{/each}
						</span>
					{/if}
				</div>
				<div class="dt-grid-wrap">
					<table class="dt-grid">
						<thead><tr><th></th>{#each Array(bounds.cols) as _, c (c)}<th>{columnName(c + 1)}</th>{/each}</tr></thead>
						<tbody>
							{#each Array(bounds.rows) as _, r (r)}
								<tr>
									<th>{r + 1}</th>
									{#each Array(bounds.cols) as _, c (c)}
										{@const ref = `${columnName(c + 1)}${r + 1}`}
										{@const role = roles.get(ref) ?? ''}
										<td class={role} title={role ? `${ref} · ${roleText(role)}` : ref}>{sheetText.get(ref) ?? ''}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="dt-legend">
					<span class="field">{roleText('field')}</span><span class="table">{roleText('table')}</span><span class="kept">{roleText('kept')}</span><span class="clear">{roleText('clear')}</span><span class="undecided">{roleText('undecided')}</span>
				</p>
				{#if bounds.cut}<p class="dt-muted">{t('แสดงเฉพาะส่วนต้นของชีต', 'Only the top of the sheet is shown')}</p>{/if}
			</section>
		{/if}

		<section class="dt-section">
			<h2>{t('บอก AI ว่าใช้เมื่อไหร่', 'Tell AI when to use it')}</h2>
			<label class="k-field wide"><span>{t('เมื่อไหร่ใช้เทมเพลตนี้', 'When to use this template')}</span>
				<textarea rows="2" maxlength="500" bind:value={review.whenToUse} placeholder={t('เช่น ทุกเช้าหลังปิด Night Audit', 'e.g. every morning after the night audit')}></textarea>
			</label>
			<label class="k-field wide"><span>{t('รายงานที่ใช้ (คั่นด้วยจุลภาค)', 'Reports it needs (comma separated)')}</span>
				<input value={review.expectedSources.join(', ')} oninput={(e) => (review!.expectedSources = (e.currentTarget as HTMLInputElement).value.split(',').map((s) => s.trim()).slice(0, 20))} maxlength="600" />
			</label>
		</section>

		<section class="dt-section dt-actions">
			{#if problems.length}
				<ul class="dt-alert" role="alert">{#each problems as problem, i (i)}<li>{problemText(problem, t)}</li>{/each}</ul>
			{/if}
			{#if actionError}<p class="dt-alert" role="alert">{actionError}</p>{/if}
			<div class="dt-buttons">
				<button type="button" class="k-button" class:primary={gate.block === 'unconfirmed' || gate.block === 'edited'} disabled={!!busy || (!edited && !!version.specSha256)} onclick={confirm}>
					{busy === 'confirm' ? t('กำลังยืนยัน…', 'Confirming…') : t('ยืนยันการตั้งค่า', 'Confirm setup')}
				</button>
				<button type="button" class="k-button" disabled={!!busy || !version.specSha256 || edited} onclick={testFill}>
					{busy === 'test' ? t('กำลังสร้าง…', 'Making…') : t('ลองสร้างเอกสาร', 'Try a document')}
				</button>
			</div>
			{#if testFile}
				<p class="dt-panel">{t('สร้างไฟล์ทดลองแล้ว:', 'Test file ready:')} <a href={localeHref(`/app/files/${testFile.id}`)} target="_blank" rel="noopener">{testFile.name}</a></p>
			{/if}

			{#if template.status === 'published' && version.state === 'published'}
				<p class="dt-panel">{t('เผยแพร่แล้ว AI ของคนในกลุ่มที่เลือกใช้เทมเพลตนี้ได้', 'Published: the chosen people’s AI can use it.')}</p>
				<div class="dt-buttons"><button type="button" class="k-button" disabled={!!busy} onclick={unpublish}>{t('หยุดเผยแพร่', 'Unpublish')}</button></div>
			{:else}
				<h2>{t('เผยแพร่', 'Publish')}</h2>
				<div class="dt-audience" role="radiogroup" aria-label={t('ใครใช้ได้', 'Who can use it')}>
					<label><input type="radio" name="dt-audience" value="everyone_live" bind:group={audience} />{t('ทุกคนในพื้นที่ทำงาน (อัปเดตอัตโนมัติ)', 'Everyone in the workspace (kept up to date)')}</label>
					<label><input type="radio" name="dt-audience" value="list" bind:group={audience} />{t('เลือกคน', 'Chosen people')}</label>
				</div>
				{#if audience === 'list'}
					<div class="dt-people">
						{#each people as person (person.id)}
							<label class="dt-check"><input type="checkbox" value={person.id} bind:group={chosen} />{memberName(person)}</label>
						{/each}
					</div>
				{/if}
				{#if gate.block !== 'none'}<p class="dt-count point">{gateText(gate, t)}</p>{/if}
				<div class="dt-buttons">
					<button type="button" class="k-button primary" disabled={!!busy || gate.block !== 'none'} onclick={publish}>
						{busy === 'publish' ? t('กำลังเผยแพร่…', 'Publishing…') : t('เผยแพร่', 'Publish')}
					</button>
				</div>
			{/if}
		</section>

		<section class="dt-section dt-foot">
			<label class="k-button quiet small">
				<input type="file" accept=".xlsx" class="dt-file" onchange={replace} disabled={!!busy} />{t('อัปโหลดไฟล์ฉบับใหม่', 'Upload a new version')}
			</label>
			<button type="button" class="k-button danger small" disabled={!!busy} onclick={() => (deleteOpen = true)}>{t('ลบเทมเพลต', 'Delete template')}</button>
		</section>
	{/if}
</div>

<ConfirmDialog
	bind:open={deleteOpen}
	title={t('ลบเทมเพลตนี้?', 'Delete this template?')}
	message={t('AI จะใช้เทมเพลตนี้ไม่ได้อีก ไฟล์ที่สร้างไปแล้วจะถูกลบด้วย', 'AI can no longer use it, and the files made from it are deleted too.')}
	confirmLabel={t('ลบ', 'Delete')}
	cancelLabel={t('ยกเลิก', 'Cancel')}
	tone="danger"
	busy={busy === 'delete'}
	onconfirm={remove}
/>

<style>
	.dt {
		display: grid;
		gap: 18px;
		max-width: 980px;
	}
	.dt-section {
		display: grid;
		gap: 10px;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.dt-section h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 16px;
		font-weight: 650;
	}
	.dt-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}
	.dt-muted,
	.dt-section p {
		margin: 0;
		color: var(--orca-muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.dt-panel {
		margin: 0;
		padding: 14px 16px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.6;
	}
	.dt-strong {
		color: var(--orca-ink) !important;
		font-weight: 600;
	}
	.dt-alert {
		margin: 0;
		padding: 10px 14px;
		border: 1px solid var(--orca-deny-line);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-ink);
		font-size: 14px;
		list-style: none;
	}
	.dt-fields,
	.dt-tables {
		display: grid;
		gap: 10px;
	}
	.dt-field,
	.dt-table {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
		align-items: end;
		gap: 8px 12px;
		padding: 12px 0;
		border-top: 1px solid var(--orca-line-soft);
	}
	.dt-field.bad,
	.dt-table.bad {
		border-top-color: var(--orca-deny-line);
	}
	.dt-field .wide,
	.dt-field .dt-choice,
	.dt-table .dt-muted {
		grid-column: 1 / -1;
	}
	.dt-cell {
		grid-column: 1 / -1;
		color: var(--orca-muted);
		font-family: var(--orca-mono, ui-monospace, monospace);
		font-size: 12.5px;
	}
	.dt .k-field {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.dt .k-field > span {
		color: var(--orca-text-2);
		font-size: 13px;
	}
	.dt-check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		color: var(--orca-ink);
		font-size: 14px;
	}
	.dt-count {
		color: var(--orca-ink) !important;
		font-weight: 600;
	}
	.dt-count.point::before {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 8px;
		border-radius: 50%;
		background: var(--orca-citron);
		box-shadow: 0 0 0 1px var(--orca-citron-line);
		content: '';
	}
	.dt-cells {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.dt-cells li {
		display: grid;
		grid-template-columns: 150px minmax(0, 1fr) auto;
		align-items: center;
		gap: 6px 12px;
		padding: 8px 0;
		border-top: 1px solid var(--orca-line-soft);
	}
	.dt-text {
		overflow: hidden;
		color: var(--orca-ink);
		font-size: 14px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dt-choice,
	.dt-audience {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.dt-choice label,
	.dt-audience label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		color: var(--orca-ink);
		font-size: 14px;
	}
	.dt-people {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
		gap: 0 12px;
	}
	.dt-grid-wrap {
		max-height: 420px;
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
	}
	.dt-grid {
		border-collapse: collapse;
		font-size: 12px;
	}
	.dt-grid th,
	.dt-grid td {
		max-width: 160px;
		height: 24px;
		padding: 2px 6px;
		overflow: hidden;
		border: 1px solid var(--orca-line-soft);
		color: var(--orca-ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dt-grid th {
		position: sticky;
		top: 0;
		background: var(--orca-surface-2);
		color: var(--orca-muted);
		font-weight: 500;
	}
	.dt-grid tbody th {
		left: 0;
	}
	.dt-grid td.field,
	.dt-legend .field {
		background: var(--orca-ok-bg);
	}
	.dt-grid td.table,
	.dt-legend .table {
		background: var(--orca-secondary);
	}
	.dt-grid td.kept,
	.dt-legend .kept {
		color: var(--orca-muted);
		font-style: italic;
	}
	.dt-grid td.clear,
	.dt-legend .clear {
		text-decoration: line-through;
	}
	.dt-grid td.undecided,
	.dt-legend .undecided {
		outline: 2px dashed var(--orca-warn);
		outline-offset: -2px;
	}
	.dt-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		margin: 0;
		font-size: 13px;
	}
	.dt-legend span {
		padding: 1px 6px;
		border-radius: 4px;
		color: var(--orca-ink);
	}
	.dt-sheets {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.dt-type {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		color: var(--orca-ink);
		font-size: 14px;
	}
	.dt-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.dt-foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
	}
	.dt-file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	label.k-button {
		position: relative;
		cursor: pointer;
	}
	@media (max-width: 720px) {
		.dt-section {
			padding: 16px;
		}
		.dt-field,
		.dt-table {
			grid-template-columns: minmax(0, 1fr);
		}
		.dt-cells li {
			grid-template-columns: minmax(0, 1fr);
		}
		.dt-buttons :global(.k-button) {
			flex: 1 1 100%;
			justify-content: center;
		}
	}
</style>
