import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// เอกสาร (kv2 phase 2a P5): the document templates page, the review and the
// file page compile cleanly, use tokens only, and show each role its own.
const d = await importTypeScript(new URL('../../orca/doc-templates.ts', import.meta.url));
const k = await importTypeScript(new URL('../../orca/knowledge.ts', import.meta.url));
const th = (thai) => thai;
const noop = () => {};
const PageHeader = (await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), {})).Component;
const hub = (id, extra = {}) => ({ id, name: id === 'front' ? 'ฝ่ายต้อนรับ' : id, description: '', connectionID: 'c', toolNames: ['t'], memberIDs: ['me', 'x'], unitIDs: [], dailyLimit: 100, status: 'active', version: 2, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0, ...extra });
const ON = { libraryV2: true, docTemplates: true };

const FILES = [
	'documents/DocumentsView.svelte',
	'documents/DocTemplateReview.svelte',
	'../../../routes/app/files/[id]/+page.svelte'
];

test('each new screen compiles without warnings, uses tokens only, and keeps the knowledge area\'s rules', async () => {
	for (const file of FILES) {
		const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
		for (const generate of ['client', 'server']) assert.deepEqual(compile(source, { filename: file.split('/').pop(), generate }).warnings, [], `${file} (${generate})`);
		assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} uses tokens only`);
		// W0.2: this area says แม่แบบ (document templates), never the older เทมเพลต.
		assert.doesNotMatch(source, /<select|\{@html|กรุณา|เทมเพลต|StatusPill/, file);
	}
	// W0: สร้าง is the page's one ink primary; in-page buttons are outline, and no citron.
	for (const file of FILES.slice(0, 2)) {
		const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
		assert.doesNotMatch(source, /--orca-citron|k-button primary|class:primary/, file);
	}
});

async function view(data, props = {}) {
	const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
	const { warnings, Component } = await serverComponent(new URL('./documents/DocumentsView.svelte', import.meta.url), {
		...d, term: (key, t) => t(...glossary[key]), ORCA_SUPPORT_LINE_ID: '@147njpwd', libraryScope: k.libraryScope, formatBytes: k.formatBytes, t: th, localeHref: (value) => value, PageHeader, untrack: (fn) => fn(), goto: noop,
		currentCompany: () => 'default', displayDate: (v) => v, memberName: (m) => m.displayName, orcaError: () => '', OrcaDocTemplateService: {}, showToast: noop,
		DocTemplateReview: (renderer, input) => renderer.push(`<review data-template="${input.templateID}"></review>`)
	});
	assert.deepEqual(warnings, []);
	return render(Component, { props: { data: { currentUserID: 'me', canManage: true, members: [], hubs: [hub('front')], features: ON, ...data }, hubID: '', templateID: '', ...props } }).body;
}

test('the page needs both company switches, then opens the viewer\'s workspace', async () => {
	assert.match(await view({ features: { libraryV2: true } }), /แม่แบบเอกสารยังไม่เปิดให้บริษัทนี้/);
	assert.match(await view({ features: { docTemplates: true } }), /แม่แบบเอกสารยังไม่เปิดให้บริษัทนี้/);
	assert.match(await view({ hubs: [] , canManage: false }), /เปิดคลังความรู้เพื่อเลือกพื้นที่ทำงาน AI ก่อน/);
	const manager = await view({});
	// W0: แม่แบบเอกสาร (W0.2's name for เอกสาร) is a tab of คลังความรู้: its header, its type tabs with it current,
	// and its two sub-tabs แม่แบบ and ไฟล์ที่ AI สร้าง.
	assert.match(manager, /<h1[^>]*>คลังความรู้<\/h1>/);
	assert.match(manager, /แม่แบบฟอร์มของบริษัทที่ AI กรอกให้ และไฟล์ที่ AI สร้าง/);
	assert.match(manager, /aria-current="page">(?:<[^>]*>)*แม่แบบเอกสาร<\/a>/);
	assert.match(manager, /aria-pressed="true"[^>]*>แม่แบบ<\/button>/);
	assert.match(manager, />ไฟล์ที่ AI สร้าง<\/button>/);
	assert.doesNotMatch(manager, /เทมเพลต/, 'แม่แบบ throughout this area');
	for (const kind of ['knowledge', 'file', 'template']) assert.match(manager, new RegExp(`href="/app\\?view=knowledge&amp;hub=front&amp;kind=${kind}"`));
	assert.match(manager, /class="on[^"]*" href="\/app\?view=documents&amp;hub=front" aria-current="page"/);
	assert.doesNotMatch(manager, /orca-page-back/, 'a tab, not a page to go back from');
	assert.match(manager, /<label class="k-button dc-upload[^"]*"[^>]*><input type="file" accept="\.xlsx"[^>]*\/>(?:<[^>]*>)*เพิ่มแม่แบบ<\/label>/);
	assert.doesNotMatch(manager, /k-button primary/, 'สร้าง is the one primary');
	const member = await view({ canManage: false });
	assert.doesNotMatch(member, /เพิ่มแม่แบบ/, 'a member adds no templates');
});

test('the review opens for a manager only', async () => {
	assert.match(await view({}, { templateID: 'orl-1' }), /<review data-template="orl-1">/);
	const member = await view({ canManage: false }, { templateID: 'orl-1' });
	assert.doesNotMatch(member, /<review/);
});

test('the knowledge list links to แม่แบบเอกสาร only while the company has it', async () => {
	const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
	const term = (key, t) => t(...glossary[key]);
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeList.svelte', import.meta.url), {
		...k, term, t: th, localeHref: (value) => value, PageHeader
	});
	assert.deepEqual(warnings, []);
	const props = { hub: hub('front'), choices: [], items: [], departments: [], members: [], currentUserID: 'me', onchoose: noop, oncreate: noop, onopen: noop, onreload: noop };
	// W0: a fourth type tab, แม่แบบเอกสาร (เอกสาร until W0.2), beside the library's own.
	assert.match(render(Component, { props: { ...props, documentsHref: '/app?view=documents&hub=front' } }).body, /<div class="seg[^"]*"[^>]*>[\s\S]*<a href="\/app\?view=documents&amp;hub=front"[^>]*>(?:<!---->)?แม่แบบเอกสาร<\/a>/);
	assert.doesNotMatch(render(Component, { props }).body, /view=documents|แม่แบบเอกสาร/);
	// W0.2: ไฟล์ keeps its name, and one short line says what these files are for.
	const fileTab = render(Component, { props: { ...props, kind: 'file', features: { files: true, audienceModes: true }, documentsHref: '/app?view=documents&hub=front' } }).body;
	assert.match(fileTab, /aria-pressed="true"[^>]*>(?:<[^>]*>)*ไฟล์/);
	assert.match(fileTab, /<p class="kn-kind-line[^"]*">ไฟล์ที่ AI อ่านเพื่อตอบคำถาม<\/p>/);
	assert.doesNotMatch(render(Component, { props }).body, /ไฟล์ที่ AI อ่านเพื่อตอบคำถาม/, 'only on the ไฟล์ tab');
});

// Codex code review 1, finding 9: the review confirms what it sent, and
// locks its fields while the server answers.
test('the review keeps what it sent as the confirmed spec', async () => {
	const source = await readFile(new URL('./documents/DocTemplateReview.svelte', import.meta.url), 'utf8');
	assert.match(source, /const \{ result, sent \} = await confirmReview\(/);
	assert.match(source, /confirmedSnapshot = sent;/);
	assert.doesNotMatch(source, /confirmedSnapshot = snapshot\(review\);/, 'never the review as it is after the answer');
	assert.match(source, /<fieldset class="dt-lock" disabled=\{busy === 'confirm'\}>/);
});

// The file page shows its requester the stored report, read in the file's
// own company and workspace (Codex code review 1).
test('the file page reads the stored report where the file lives', async () => {
	const source = await readFile(new URL('../../../routes/app/files/[id]/+page.svelte', import.meta.url), 'utf8');
	assert.match(source, /OrcaDocTemplateService\.documents\(location\.hubID, location\.companyID\)/);
	assert.match(source, /reportRows\(doc\.report, t\)/);
	assert.match(source, /over\.given - over\.written/);
});
