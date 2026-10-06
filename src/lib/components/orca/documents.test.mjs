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
		assert.doesNotMatch(source, /<select|\{@html|กรุณา|แม่แบบ|StatusPill/, file);
	}
	// Citron marks a point only: the "still to decide" dot.
	const review = await readFile(new URL('./documents/DocTemplateReview.svelte', import.meta.url), 'utf8');
	assert.equal(review.match(/--orca-citron(?![\w-])/g)?.length, 1);
});

async function view(data, props = {}) {
	const { warnings, Component } = await serverComponent(new URL('./documents/DocumentsView.svelte', import.meta.url), {
		...d, ORCA_SUPPORT_LINE_ID: '@147njpwd', libraryScope: k.libraryScope, formatBytes: k.formatBytes, t: th, localeHref: (value) => value, PageHeader, untrack: (fn) => fn(), goto: noop,
		currentCompany: () => 'default', displayDate: (v) => v, memberName: (m) => m.displayName, orcaError: () => '', OrcaDocTemplateService: {}, showToast: noop,
		DocTemplateReview: (renderer, input) => renderer.push(`<review data-template="${input.templateID}"></review>`)
	});
	assert.deepEqual(warnings, []);
	return render(Component, { props: { data: { currentUserID: 'me', canManage: true, members: [], hubs: [hub('front')], features: ON, ...data }, hubID: '', templateID: '', ...props } }).body;
}

test('the page needs both company switches, then opens the viewer\'s workspace', async () => {
	assert.match(await view({ features: { libraryV2: true } }), /เทมเพลตเอกสารยังไม่เปิดให้บริษัทนี้/);
	assert.match(await view({ features: { docTemplates: true } }), /เทมเพลตเอกสารยังไม่เปิดให้บริษัทนี้/);
	assert.match(await view({ hubs: [] , canManage: false }), /เปิดคลังความรู้เพื่อเลือกพื้นที่ทำงาน AI ก่อน/);
	const manager = await view({});
	assert.match(manager, /ฟอร์มของบริษัทที่ AI กรอกให้ ใน ฝ่ายต้อนรับ/);
	assert.match(manager, />เพิ่มเทมเพลตเอกสาร</);
	assert.match(manager, /accept="\.xlsx"/);
	assert.equal(manager.match(/k-button primary/g)?.length, 1, 'one primary action');
	const member = await view({ canManage: false });
	assert.doesNotMatch(member, /เพิ่มเทมเพลตเอกสาร/, 'a member adds no templates');
});

test('the review opens for a manager only', async () => {
	assert.match(await view({}, { templateID: 'orl-1' }), /<review data-template="orl-1">/);
	const member = await view({ canManage: false }, { templateID: 'orl-1' });
	assert.doesNotMatch(member, /<review/);
});

test('the knowledge list links to เอกสาร only while the company has it', async () => {
	const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
	const term = (key, t) => t(...glossary[key]);
	const { warnings, Component } = await serverComponent(new URL('./knowledge/KnowledgeList.svelte', import.meta.url), {
		...k, term, t: th, localeHref: (value) => value, PageHeader
	});
	assert.deepEqual(warnings, []);
	const props = { hub: hub('front'), choices: [], items: [], departments: [], members: [], currentUserID: 'me', onchoose: noop, oncreate: noop, onopen: noop, onreload: noop };
	assert.match(render(Component, { props: { ...props, documentsHref: '/app?view=documents&hub=front' } }).body, /href="\/app\?view=documents&amp;hub=front"[^>]*>เทมเพลตเอกสาร</);
	assert.doesNotMatch(render(Component, { props }).body, /เทมเพลตเอกสาร/);
});
