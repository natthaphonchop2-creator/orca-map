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
				'กรุณาเขียนตัวแปรโดยไม่มีช่องว่าง เช่น {{date}}',
				'Write placeholders without spaces, for example {{date}}.'
			);
			return;
		}
		if (new Set(names).size !== names.length) {
			error = t('ชื่อตัวแปรของช่องกรอกต้องไม่ซ้ำกัน', 'Each field name must be unique.');
			return;
		}
		const placeholders = [...form.content.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]{0,63})\}\}/g)].map(
			(match) => match[1]
		);
		if (form.kind === 'template' && placeholders.some((name) => !names.includes(name))) {
			error = t(
				'กรุณาเพิ่มช่องกรอกให้ครบทุกตัวแปรในแม่แบบก่อนบันทึก',
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
						'รายการนี้มีการเปลี่ยนแปลงแล้ว ข้อความที่คุณแก้ไขยังคงอยู่ กรุณาตรวจสอบฉบับล่าสุดก่อนบันทึกอีกครั้ง',
						'This item has changed. Your edits are preserved. Review the latest version before saving again.'
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
		? t('แก้ไขบทความความรู้', 'Knowledge article editor')
		: t('แก้ไขแม่แบบ', 'Template editor')}
>
	<button type="button" class="library-back" disabled={saving} onclick={cancel}
		><ArrowLeft size={16} />{t('กลับไปที่คลังความรู้', 'Back to Knowledge')}</button
	>
	<div class="library-editor-heading">
		<span class="library-symbol" aria-hidden="true"
			>{#if kind === 'knowledge'}<BookOpen size={18} />{:else}<FileText size={18} />{/if}</span
		>
		<div>
			<h2>
				{existing
					? t('แก้ไขเนื้อหา', 'Edit content')
					: kind === 'knowledge'
						? t('เพิ่มบทความความรู้', 'Add a knowledge article')
						: t('สร้างแม่แบบ', 'Create a template')}
			</h2>
			<p>
				{kind === 'knowledge'
					? t(
							'แต่ละบทความกำหนดสิทธิ์การเข้าถึงแยกกัน',
							'Each article has its own access settings'
						)
					: t(
							'ขั้นตอนการทำงานและรูปแบบผลลัพธ์ที่ทีมใช้ร่วมกัน',
							'Shared instructions and output formats for your team'
						)}
			</p>
		</div>
	</div>
	{#if discard}<div class="library-alert" role="alert">
			<Info size={16} />
			<div>
				<p>
					{t(
						'มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่',
						'You have unsaved changes. Leave this editor?'
					)}
				</p>
				<div class="library-actions">
					<button class="k-button small" onclick={() => (discard = false)}
						>{t('แก้ไขต่อ', 'Keep editing')}</button
					><button class="k-button small" onclick={onclose}>{t('ออกโดยไม่บันทึก', 'Discard changes')}</button>
				</div>
			</div>
		</div>{/if}
	<form onsubmit={save}>
		<fieldset disabled={saving} class="library-form-fields">
			<div class="library-field">
				<label for="library-title">{t('ชื่อเรื่อง', 'Title')}</label><input
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
						'ระบุว่าเนื้อหานี้ใช้กับงานใด',
						'Describe when this content should be used'
					)}
				/>
			</div>
			<div class="library-field">
				<label for="library-content"
					>{kind === 'knowledge'
						? t('เนื้อหาบทความ', 'Article content')
						: t('เนื้อหาแม่แบบ', 'Template content')}</label
				><textarea
					id="library-content"
					bind:value={form.content}
					required
					maxlength="40000"
					rows="12"
					placeholder={kind === 'knowledge'
						? t(
								'เพิ่มนโยบาย วิธีปฏิบัติงาน หรือข้อมูลที่ทีมใช้เป็นหลักอ้างอิง',
								'Add policies, procedures or reference information for your team'
							)
						: t(
								'ระบุขั้นตอนการทำงานและรูปแบบผลลัพธ์ที่ต้องการ\nใช้ {{date}} ในตำแหน่งที่ต้องการให้กรอกวันที่',
								'Describe the workflow and the expected output.\nUse {{date}} where the date should be filled in.'
							)}
				></textarea>
				<p class="library-hint">
					{kind === 'knowledge'
						? t(
								'แยกเนื้อหาที่มีผู้เข้าถึงต่างกันเป็นคนละบทความ เช่น แนวทางการให้บริการ และราคาตามสัญญาของลูกค้าแต่ละราย',
								'Put content for different audiences in separate articles, such as service guidelines and customer contract rates.'
							)
						: t(
								'ใช้ {{field_name}} แทนข้อมูลที่เปลี่ยนไปในแต่ละครั้ง แล้วเพิ่มช่องกรอกด้านล่าง รองรับข้อความธรรมดาและ Markdown',
								'Use {{field_name}} for values that change each time, then define the fields below. Plain text and Markdown are supported.'
							)}
				</p>
			</div>
			{#if kind === 'template'}
				<section class="library-editor-section">
					<div class="library-section-heading">
						<div>
							<h3>{t('ช่องกรอกข้อมูล', 'Input fields')}</h3>
							<p>
								{t(
									'เช่น วันที่ แผนก หรือชื่อลูกค้า',
									'For example: a date, department or customer name'
								)}
							</p>
						</div>
						<button
							type="button"
							class="k-button small"
							disabled={form.parameters.length >= 20}
							onclick={() =>
								(form.parameters = [...form.parameters, { name: '', label: '', required: true }])}
							><Plus size={16} />{t('เพิ่มช่องกรอก', 'Add field')}</button
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
									>{t('ชื่อที่แสดง', 'Display label')}</label
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
								class="library-icon-button danger"
								aria-label={t(`ลบช่องกรอกที่ ${index + 1}`, `Remove field ${index + 1}`)}
								title={t(`ลบช่องกรอกที่ ${index + 1}`, `Remove field ${index + 1}`)}
								onclick={() =>
									(form.parameters = form.parameters.filter((_, position) => position !== index))}
								><Trash2 size={16} /></button
							>
						</div>{/each}
					<p class="library-hint">
						{t(
							'ชื่อตัวแปรใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และ _ และต้องไม่ขึ้นต้นด้วยตัวเลข เช่น report_date',
							'Field names may contain English letters, numbers and underscores, and cannot start with a number, e.g. report_date.'
						)}
					</p>
				</section>
				<section class="library-editor-section">
					<h3>{t('บทความความรู้ที่ใช้ประกอบ', 'Knowledge articles to include')}</h3>
					<p class="library-hint">
						{t(
							'ผู้ใช้แม่แบบนี้ต้องมีสิทธิ์อ่านบทความทุกรายการที่เลือก',
							'To use this template, a person must have access to every selected article.'
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
												t('บทความที่เผยแพร่แล้ว', 'Published article')}</small
										></span
									></label
								>{/each}
						</div>{:else}<p class="library-hint">
							{t(
								'ยังไม่มีบทความความรู้ที่เผยแพร่ สามารถบันทึกแม่แบบนี้ก่อน แล้วเพิ่มบทความอ้างอิงภายหลัง',
								'No published knowledge articles yet. You can save this template now and add references later.'
							)}
						</p>{/if}
					{#if missingReferences.length}<div class="library-alert" role="alert">
							<Info size={16} />
							<div>
								<p>
									{t(
										'บทความที่อ้างอิงบางรายการไม่พร้อมใช้งานแล้ว กรุณานำรายการดังกล่าวออกก่อนบันทึก',
										'Some referenced articles are no longer available. Remove them before saving.'
									)}
								</p>
								<button
									type="button"
									class="k-button small"
									onclick={() =>
										(form.knowledgeIDs = form.knowledgeIDs.filter(
											(id) => !missingReferences.includes(id)
										))}>{t('นำบทความที่ไม่พร้อมใช้งานออก', 'Remove unavailable references')}</button
								>
							</div>
						</div>{/if}
				</section>
			{/if}
			<section class="library-editor-section">
				<div class="library-section-heading">
					<div>
						<h3><ShieldCheck size={18} />{t('สิทธิ์การเข้าถึง', 'Access')}</h3>
						<p>
							{t(
								'คุณเป็นเจ้าของเนื้อหานี้และกำหนดผู้ที่เข้าถึงได้',
								'You own this content and decide who can access it.'
							)}
						</p>
					</div>
				</div>
				<div class="library-audience-grid">
					<div>
						<h4>{t('เลือกสมาชิก', 'Select members')}</h4>
						<div class="library-choices">
							{#each members.filter((member) => member.id !== currentUserID) as member}<label
									class="library-choice"
									><input
										type="checkbox"
										checked={form.memberIDs.includes(member.id)}
										onchange={(event) =>
											toggle('memberIDs', member.id, event.currentTarget.checked)}
									/><span><strong>{memberName(member)}</strong>{#if memberName(member) !== member.email}<small>{member.email}</small>{/if}</span
									></label
								>{:else}<p class="library-hint">
									{t(
										'พื้นที่ทำงานนี้ยังไม่มีสมาชิกคนอื่น',
										'This workspace has no other members.'
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
												'เฉพาะผู้ที่เป็นสมาชิกของพื้นที่ทำงานนี้',
												'Only members of this workspace'
											)}</small
										></span
									></label
								>{:else}<p class="library-hint">
									{t(
										'ผู้ดูแลระบบยังไม่ได้กำหนดสมาชิกของแผนก',
										'An administrator has not set up department membership yet.'
									)}
								</p>{/each}
						</div>
					</div>
				</div>
				<p class="library-note">
					<Info size={16} />
					{t(
						'การเลือกแผนกไม่ได้ให้สิทธิ์เข้าถึงพื้นที่ทำงาน หากไม่เลือกผู้ใด เนื้อหานี้จะใช้ได้เฉพาะคุณ',
						'Selecting a department does not grant workspace access. If you select no one, only you can use this content.'
					)}
				</p>
				{#if formerMemberIDs.length}<div class="library-alert">
					<Info size={16} />
					<div>
						<p>
							{t(
								'สมาชิกบางคนที่เคยเลือกไม่ได้อยู่ในพื้นที่ทำงานนี้แล้ว กรุณานำรายชื่อดังกล่าวออกก่อนบันทึก',
								'Some previously selected people are no longer members of this workspace. Remove them before saving.'
							)}
						</p>
						<button
							type="button"
							class="k-button small"
							onclick={() =>
								(form.memberIDs = form.memberIDs.filter((id) => !formerMemberIDs.includes(id)))}
							>{t('นำอดีตสมาชิกออก', 'Remove former members')}</button
						>
					</div>
				</div>{/if}
			</section>
			<div class="library-field library-publish">
				<label for="library-status">{t('สถานะการเผยแพร่', 'Publishing status')}</label><select
					id="library-status"
					bind:value={form.status}
					><option value="draft">{t('ฉบับร่าง · เฉพาะคุณ', 'Draft · only you')}</option><option
						value="published"
						>{t('เผยแพร่ · ตามสิทธิ์ที่กำหนด', 'Published · selected audience')}</option
					>{#if existing?.status === 'archived'}<option value="archived"
							>{t('จัดเก็บแล้ว', 'Archived')}</option
						>{/if}</select
				>
				<p class="library-hint">
					{t(
						'AI จะใช้เนื้อหานี้ได้เมื่อเผยแพร่แล้วและพื้นที่ทำงาน AI เปิดใช้งานอยู่',
						'AI can use this content once it is published and the AI workspace is active.'
					)}
				</p>
			</div>
		</fieldset>
		{#if error}<div class="library-alert" role="alert">
				<Info size={16} />
				<div>
					<p>{error}</p>
					{#if conflict}<button
							type="button"
							class="k-button small"
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
						'หากใช้ฉบับนี้ ข้อความที่คุณแก้ไขอยู่จะถูกแทนที่',
						'Using this version will replace your current edits.'
					)}
				</p>
				<div class="library-actions">
					<button type="button" class="k-button small" onclick={() => (confirmLatest = false)}
						>{t('เก็บข้อความที่แก้ไขไว้', 'Keep my edits')}</button
					><button type="button" class="k-button small" onclick={replaceWithLatest}
						><Check size={16} />{t('ใช้ฉบับล่าสุด', 'Use latest version')}</button
					>
				</div>
			</div>{/if}
		<div class="library-editor-footer">
			<span>{t('เฉพาะคุณที่แก้ไขเนื้อหานี้ได้', 'Only you can edit this content')}</span>
			<div class="library-actions">
				<button type="button" class="k-button" onclick={cancel} disabled={saving}
					><X size={16} />{t('ยกเลิก', 'Cancel')}</button
				><button
					type="submit"
					class="k-button primary"
					disabled={saving || conflict || missingReferences.length > 0}
					><Save size={16} />{saving ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button
				>
			</div>
		</div>
	</form>
</section>
