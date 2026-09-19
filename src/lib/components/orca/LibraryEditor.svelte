<script lang="ts">
	import { getHttpStatusCode } from '$lib/errors';
	import { t } from '$lib/orca/locale.svelte';
	import { orcaError, memberName, type OrcaMember } from '$lib/services/orca';
	import {
		OrcaLibraryService,
		type LibraryDepartment,
		type LibraryInput,
		type LibraryItem,
		type LibraryKind
	} from '$lib/services/orca-library';
	import {
		ArrowLeft,
		BookOpen,
		Check,
		FileText,
		Info,
		Plus,
		Save,
		ShieldCheck,
		Trash2,
		X
	} from '@lucide/svelte';
	import { onDestroy } from 'svelte';

	let {
		hubID,
		kind,
		existing,
		items,
		members,
		departments,
		currentUserID,
		departmentName,
		onsaved,
		onclose,
		ondenied,
		ondirty
	}: {
		hubID: string;
		kind: LibraryKind;
		existing?: LibraryItem;
		items: LibraryItem[];
		members: OrcaMember[];
		departments: LibraryDepartment[];
		currentUserID: string;
		departmentName: (id: string) => string;
		onsaved: (item: LibraryItem) => void;
		onclose: () => void;
		ondenied: () => void;
		ondirty: (dirty: boolean) => void;
	} = $props();
	const initial = (): LibraryInput => ({
		kind,
		title: existing?.title ?? '',
		summary: existing?.summary ?? '',
		content: existing?.content ?? '',
		parameters: existing?.parameters.map((item) => ({ ...item })) ?? [],
		knowledgeIDs: [...(existing?.knowledgeIDs ?? [])],
		memberIDs: [...(existing?.memberIDs ?? [])],
		unitIDs: [...(existing?.unitIDs ?? [])],
		status: existing?.status ?? 'draft',
		version: existing?.version ?? 0
	});
	let form = $state<LibraryInput>(initial());
	let baseline = $state(JSON.stringify(initial()));
	let saving = $state(false);
	let error = $state('');
	let conflict = $state(false);
	let latest = $state<LibraryItem>();
	let loadingLatest = $state(false);
	let discard = $state(false);
	let confirmLatest = $state(false);
	const dirty = $derived(JSON.stringify(form) !== baseline);
	$effect(() => ondirty(dirty || saving));
	onDestroy(() => ondirty(false));
	const availableKnowledge = $derived(
		items.filter((item) => item.kind === 'knowledge' && item.status === 'published')
	);
	const missingReferences = $derived(
		form.knowledgeIDs.filter((id) => !availableKnowledge.some((item) => item.id === id))
	);
	const formerMemberIDs = $derived(
		form.memberIDs.filter(
			(id) => id !== currentUserID && !members.some((member) => member.id === id)
		)
	);
	function toggle(field: 'knowledgeIDs' | 'memberIDs' | 'unitIDs', id: string, checked: boolean) {
		form[field] = checked
			? [...new Set([...form[field], id])]
			: form[field].filter((value) => value !== id);
	}
	function cancel() {
		if (dirty) discard = true;
		else onclose();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		error = '';
		const names = form.parameters.map((parameter) => parameter.name.trim());
		if (form.kind === 'template' && /\{\{\s+[A-Za-z_]|[A-Za-z0-9_]\s+\}\}/.test(form.content)) {
			error = t(
				'เขียนตัวแปรโดยไม่มีช่องว่าง เช่น {{date}}',
				'Write placeholders without spaces, for example {{date}}.'
			);
			return;
		}
		if (new Set(names).size !== names.length) {
			error = t('ชื่อช่องกรอกต้องไม่ซ้ำกัน', 'Each field needs a unique name.');
			return;
		}
		const placeholders = [...form.content.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]{0,63})\}\}/g)].map(
			(match) => match[1]
		);
		if (form.kind === 'template' && placeholders.some((name) => !names.includes(name))) {
			error = t(
				'เพิ่มช่องกรอกให้ครบทุกตัวแปรในเทมเพลต ก่อนบันทึก',
				'Add a field for every placeholder in the template before saving.'
			);
			return;
		}
		saving = true;
		try {
			const input = {
				...form,
				title: form.title.trim(),
				summary: form.summary.trim(),
				parameters: form.parameters.map((parameter) => ({
					...parameter,
					name: parameter.name.trim(),
					label: parameter.label.trim()
				}))
			};
			const saved = await OrcaLibraryService.save(hubID, input, existing?.id);
			baseline = JSON.stringify(form);
			onsaved(saved);
		} catch (cause) {
			if (getHttpStatusCode(cause) === 403 || getHttpStatusCode(cause) === 404) {
				ondenied();
				return;
			}
			conflict = getHttpStatusCode(cause) === 409;
			error = conflict
				? t(
						'รายการนี้มีการแก้ไขแล้ว ข้อความที่คุณกำลังเขียนยังอยู่ เลือกดูฉบับล่าสุดก่อนบันทึกอีกครั้ง',
						'This item has changed. Your edits are still here. Review the latest version before saving again.'
					)
				: orcaError(cause);
		} finally {
			saving = false;
		}
	}
	async function loadLatest() {
		if (!existing || loadingLatest) return;
		loadingLatest = true;
		try {
			const result = await OrcaLibraryService.load(hubID);
			latest = result.items.find((item) => item.id === existing.id && item.canEdit);
			if (!latest) {
				ondenied();
				return;
			}
			confirmLatest = true;
		} catch (cause) {
			if ([403, 404].includes(getHttpStatusCode(cause) ?? 0)) ondenied();
			else error = orcaError(cause);
		} finally {
			loadingLatest = false;
		}
	}
	function replaceWithLatest() {
		if (!latest) return;
		form = {
			kind: latest.kind,
			title: latest.title,
			summary: latest.summary,
			content: latest.content,
			parameters: latest.parameters.map((item) => ({ ...item })),
			knowledgeIDs: [...latest.knowledgeIDs],
			memberIDs: [...latest.memberIDs],
			unitIDs: [...latest.unitIDs],
			status: latest.status,
			version: latest.version
		};
		baseline = JSON.stringify(form);
		conflict = false;
		error = '';
		confirmLatest = false;
	}
</script>

<section
	class="library-editor"
	aria-label={kind === 'knowledge'
		? t('เขียนหัวข้อความรู้', 'Knowledge editor')
		: t('สร้างเทมเพลต', 'Template editor')}
>
	<button type="button" class="library-back" disabled={saving} onclick={cancel}
		><ArrowLeft size={17} />{t('กลับไปที่คลัง', 'Back to library')}</button
	>
	<div class="library-editor-heading">
		<span class="library-symbol"
			>{#if kind === 'knowledge'}<BookOpen size={23} />{:else}<FileText size={23} />{/if}</span
		>
		<div>
			<h2>
				{existing
					? t('แก้ไขเนื้อหา', 'Edit content')
					: kind === 'knowledge'
						? t('เพิ่มความรู้ของธุรกิจ', 'Add business knowledge')
						: t('สร้างเทมเพลตของธุรกิจ', 'Create a business template')}
			</h2>
			<p>
				{kind === 'knowledge'
					? t('หนึ่งหัวข้อ หนึ่งขอบเขตการแบ่งปัน', 'One topic, its own sharing permissions')
					: t(
							'วิธีทำงานและรูปแบบคำตอบที่ทีมใช้ร่วมกัน',
							'Reusable business instructions and output formats'
						)}
			</p>
		</div>
	</div>
	{#if discard}<div class="library-alert" role="alert">
			<p>
				{t(
					'มีข้อความที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?',
					'You have unsaved edits. Leave this editor?'
				)}
			</p>
			<div class="library-actions">
				<button class="k-button" onclick={() => (discard = false)}
					>{t('เขียนต่อ', 'Keep editing')}</button
				><button class="k-button" onclick={onclose}>{t('ออกโดยไม่บันทึก', 'Discard edits')}</button>
			</div>
		</div>{/if}
	<form onsubmit={save}>
		<fieldset disabled={saving} class="library-form-fields">
			<div class="library-field">
				<label for="library-title">{t('ชื่อหัวข้อ', 'Title')}</label><input
					id="library-title"
					bind:value={form.title}
					required
					maxlength="160"
					placeholder={kind === 'knowledge'
						? t('เช่น แนวทางดูแลลูกค้า VIP', 'e.g. VIP guest service guidelines')
						: t('เช่น สรุปงานประจำวันของแผนก', 'e.g. Department daily briefing')}
				/>
			</div>
			<div class="library-field">
				<label for="library-summary"
					>{t('คำอธิบายสั้น ๆ', 'Short description')}
					<span>{t('(ไม่บังคับ)', '(optional)')}</span></label
				><input
					id="library-summary"
					bind:value={form.summary}
					maxlength="500"
					placeholder={t(
						'บอกทีมว่าเนื้อหานี้ใช้กับงานอะไร',
						'Help your team know when to use this'
					)}
				/>
			</div>
			<div class="library-field">
				<label for="library-content"
					>{kind === 'knowledge'
						? t('เนื้อหาความรู้', 'Knowledge content')
						: t('เนื้อหาเทมเพลต', 'Template content')}</label
				><textarea
					id="library-content"
					bind:value={form.content}
					required
					maxlength="40000"
					rows="12"
					placeholder={kind === 'knowledge'
						? t(
								'เพิ่มนโยบาย วิธีปฏิบัติงาน หรือข้อมูลที่ทีมควรใช้เป็นหลักอ้างอิง',
								'Add policies, procedures or reference information for your team'
							)
						: t(
								'เขียนขั้นตอนทำงาน และรูปแบบผลลัพธ์ที่ต้องการ\nใช้ {{date}} ตรงตำแหน่งที่ต้องการให้กรอกวันที่',
								'Describe the workflow and the expected output.\nUse {{date}} where the date should be filled in.'
							)}
				></textarea>
				<p class="library-hint">
					{kind === 'knowledge'
						? t(
								'แบ่งเนื้อหาที่มีสิทธิ์ต่างกันเป็นคนละหัวข้อ เช่น แนวทางบริการ กับราคาสัญญาเฉพาะลูกค้า',
								'Put content with different audiences in separate topics, such as service guidelines and customer contract rates.'
							)
						: t(
								'ใช้ {{field_name}} แทนข้อมูลที่เปลี่ยนในแต่ละครั้ง แล้วเพิ่มช่องกรอกด้านล่าง ใช้ข้อความหรือ Markdown ได้',
								'Use {{field_name}} for values that change each time, then define the fields below. Plain text and Markdown are supported.'
							)}
				</p>
			</div>
			{#if kind === 'template'}
				<section class="library-editor-section">
					<div class="library-section-heading">
						<div>
							<h3>{t('ข้อมูลที่ต้องกรอกก่อนใช้', 'Inputs for each use')}</h3>
							<p>
								{t(
									'เช่น วันที่ แผนก หรือชื่อลูกค้า',
									'For example: a date, department or customer name'
								)}
							</p>
						</div>
						<button
							type="button"
							class="k-button"
							disabled={form.parameters.length >= 20}
							onclick={() =>
								(form.parameters = [...form.parameters, { name: '', label: '', required: true }])}
							><Plus size={16} />{t('เพิ่มช่อง', 'Add field')}</button
						>
					</div>
					{#each form.parameters as parameter, index}<div class="library-parameter">
							<div class="library-field">
								<label for={`parameter-name-${index}`}>{t('ชื่อตัวแปร', 'Field name')}</label><input
									id={`parameter-name-${index}`}
									bind:value={parameter.name}
									required
									pattern="[A-Za-z_][A-Za-z0-9_]*"
									maxlength="64"
									placeholder="date"
								/>
							</div>
							<div class="library-field">
								<label for={`parameter-label-${index}`}
									>{t('ชื่อที่ผู้ใช้เห็น', 'Display label')}</label
								><input
									id={`parameter-label-${index}`}
									bind:value={parameter.label}
									required
									maxlength="120"
									placeholder={t('วันที่สรุปงาน', 'Report date')}
								/>
							</div>
							<label class="library-check-inline"
								><input type="checkbox" bind:checked={parameter.required} />{t(
									'ต้องกรอก',
									'Required'
								)}</label
							><button
								type="button"
								class="library-icon-button"
								aria-label={t(`ลบช่องที่ ${index + 1}`, `Remove field ${index + 1}`)}
								onclick={() =>
									(form.parameters = form.parameters.filter((_, position) => position !== index))}
								><Trash2 size={17} /></button
							>
						</div>{/each}
					<p class="library-hint">
						{t(
							'ชื่อตัวแปรใช้ภาษาอังกฤษ ตัวเลข และ _ โดยไม่ขึ้นต้นด้วยตัวเลข เช่น report_date',
							'Field names use letters, numbers and underscores, starting with a letter or underscore, e.g. report_date.'
						)}
					</p>
				</section>
				<section class="library-editor-section">
					<h3>{t('ความรู้ที่ใช้ประกอบเทมเพลต', 'Knowledge to include')}</h3>
					<p class="library-hint">
						{t(
							'ผู้เรียกใช้ต้องมีสิทธิ์อ่านทุกหัวข้อที่เลือก จึงจะใช้เทมเพลตนี้ได้',
							'A person must have access to every selected topic to use this template.'
						)}
					</p>
					{#if availableKnowledge.length}<div class="library-choice-grid">
							{#each availableKnowledge as item}<label class="library-choice"
									><input
										type="checkbox"
										checked={form.knowledgeIDs.includes(item.id)}
										disabled={form.knowledgeIDs.length >= 20 &&
											!form.knowledgeIDs.includes(item.id)}
										onchange={(event) =>
											toggle('knowledgeIDs', item.id, event.currentTarget.checked)}
									/><span
										><strong>{item.title}</strong><small
											>{item.summary ||
												t('หัวข้อความรู้ที่เผยแพร่แล้ว', 'Published knowledge')}</small
										></span
									></label
								>{/each}
						</div>{:else}<p class="library-hint">
							{t(
								'ยังไม่มีหัวข้อความรู้ที่เผยแพร่ คุณบันทึกเทมเพลตก่อน แล้วเพิ่มหัวข้ออ้างอิงภายหลังได้',
								'No published knowledge yet. You can save this template now and add references later.'
							)}
						</p>{/if}
					{#if missingReferences.length}<div class="library-alert" role="alert">
							<p>
								{t(
									'บางหัวข้อที่เคยอ้างอิงไม่พร้อมใช้งาน กรุณาตรวจเนื้อหาและนำหัวข้อเหล่านั้นออกก่อนเผยแพร่',
									'Some referenced topics are no longer available. Review the template and remove them before publishing.'
								)}
							</p>
							<button
								type="button"
								class="k-button"
								onclick={() =>
									(form.knowledgeIDs = form.knowledgeIDs.filter(
										(id) => !missingReferences.includes(id)
									))}>{t('นำหัวข้อที่ไม่พร้อมออก', 'Remove unavailable references')}</button
							>
						</div>{/if}
				</section>
			{/if}
			<section class="library-editor-section">
				<div class="library-section-heading">
					<div>
						<h3><ShieldCheck size={19} />{t('ใครเข้าถึงได้', 'Who can access this')}</h3>
						<p>
							{t(
								'คุณเป็นเจ้าของเนื้อหานี้ และเลือกแบ่งปันให้ทีมได้',
								'You own this content and choose who to share it with.'
							)}
						</p>
					</div>
				</div>
				<div class="library-audience-grid">
					<div>
						<h4>{t('เลือกสมาชิก', 'Select people')}</h4>
						<div class="library-choices">
							{#each members.filter((member) => member.id !== currentUserID) as member}<label
									class="library-choice"
									><input
										type="checkbox"
										checked={form.memberIDs.includes(member.id)}
										onchange={(event) =>
											toggle('memberIDs', member.id, event.currentTarget.checked)}
									/><span><strong>{memberName(member)}</strong><small>{member.email}</small></span
									></label
								>{:else}<p class="library-hint">
									{t(
										'ยังไม่มีสมาชิกคนอื่นในพื้นที่นี้',
										'There are no other members in this workspace.'
									)}
								</p>{/each}
						</div>
					</div>
					<div>
						<h4>{t('เลือกแผนก', 'Select departments')}</h4>
						<div class="library-choices">
							{#each departments as department}<label class="library-choice"
									><input
										type="checkbox"
										checked={form.unitIDs.includes(department.unitID)}
										onchange={(event) =>
											toggle('unitIDs', department.unitID, event.currentTarget.checked)}
									/><span
										><strong>{departmentName(department.unitID)}</strong><small
											>{t(
												'เฉพาะคนที่เป็นสมาชิกพื้นที่นี้ด้วย',
												'Only people who also belong to this workspace'
											)}</small
										></span
									></label
								>{:else}<p class="library-hint">
									{t(
										'ผู้ดูแลยังไม่ได้จัดสมาชิกแผนก',
										'Department membership has not been set up yet.'
									)}
								</p>{/each}
						</div>
					</div>
				</div>
				<p class="library-note">
					<Info size={16} />
					{t(
						'การเลือกแผนกไม่เพิ่มสิทธิ์เข้าพื้นที่ทำงาน ถ้าไม่เลือกใคร เนื้อหาจะใช้ได้เฉพาะคุณ',
						'Department sharing does not grant workspace access. If you select nobody, only you can use this content.'
					)}
				</p>
				{#if formerMemberIDs.length}<div class="library-alert">
						<p>
							{t(
								'สมาชิกบางคนที่เคยเลือกไม่ได้อยู่ในพื้นที่นี้แล้ว นำรายชื่อเดิมออกก่อนบันทึกการแบ่งปัน',
								'Some previously selected people no longer belong to this workspace. Remove their old grants before saving.'
							)}
						</p>
						<button
							type="button"
							class="k-button"
							onclick={() =>
								(form.memberIDs = form.memberIDs.filter((id) => !formerMemberIDs.includes(id)))}
							>{t('นำสมาชิกที่ออกจากพื้นที่แล้วออก', 'Remove former members')}</button
						>
					</div>{/if}
			</section>
			<div class="library-field library-publish">
				<label for="library-status">{t('การเผยแพร่', 'Publishing')}</label><select
					id="library-status"
					bind:value={form.status}
					><option value="draft">{t('ฉบับร่าง · เฉพาะฉัน', 'Draft · only me')}</option><option
						value="published"
						>{t('เผยแพร่ · ใช้ตามสิทธิ์ที่เลือก', 'Published · selected audience')}</option
					>{#if existing?.status === 'archived'}<option value="archived"
							>{t('เก็บเข้าคลัง', 'Archived')}</option
						>{/if}</select
				>
				<p class="library-hint">
					{t(
						'AI เรียกใช้ผ่าน MCP ได้เมื่อเผยแพร่และพื้นที่ทำงานเปิดใช้งานแล้ว',
						'AI can use published content through MCP when this workspace is active.'
					)}
				</p>
			</div>
		</fieldset>
		{#if error}<div class="library-alert" role="alert">
				<Info size={18} />
				<div>
					<p>{error}</p>
					{#if conflict}<button
							type="button"
							class="k-button"
							disabled={loadingLatest}
							onclick={loadLatest}
							>{loadingLatest
								? t('กำลังโหลด…', 'Loading…')
								: t('ดูฉบับล่าสุด', 'Review latest version')}</button
						>{/if}
				</div>
			</div>{/if}
		{#if confirmLatest && latest}<div class="library-conflict">
				<h3>{t('ฉบับล่าสุดที่บันทึกไว้', 'Latest saved version')}</h3>
				<strong>{latest.title}</strong>
				<pre>{latest.content}</pre>
				<p>
					{t(
						'หากเลือกใช้ฉบับนี้ ข้อความที่กำลังเขียนจะถูกแทนที่',
						'Loading this version will replace your current edits.'
					)}
				</p>
				<div class="library-actions">
					<button type="button" class="k-button" onclick={() => (confirmLatest = false)}
						>{t('เก็บข้อความที่เขียนไว้', 'Keep my edits')}</button
					><button type="button" class="k-button" onclick={replaceWithLatest}
						><Check size={16} />{t('ใช้ฉบับล่าสุดแทน', 'Load latest version')}</button
					>
				</div>
			</div>{/if}
		<div class="library-editor-footer">
			<span>{t('คุณเป็นผู้แก้ไขเนื้อหานี้', 'Only you can edit this content')}</span>
			<div class="library-actions">
				<button type="button" class="k-button" onclick={cancel} disabled={saving}
					><X size={16} />{t('ยกเลิก', 'Cancel')}</button
				><button
					type="submit"
					class="k-button primary"
					disabled={saving || conflict || missingReferences.length > 0}
					><Save size={17} />{saving ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button
				>
			</div>
		</div>
	</form>
</section>
