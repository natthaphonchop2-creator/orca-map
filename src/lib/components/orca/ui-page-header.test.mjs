import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const contract = await importTypeScript(new URL('./ui/page-contract.ts', import.meta.url));
const { titleWithinContract, subtitleWithinContract, visibleLength } = contract;

test('the page contract: a title of at most 4 words, one line of about 80 Thai characters', () => {
	for (const title of ['เชื่อม AI ของฉัน', 'แอป AI ที่เชื่อมอยู่', 'ตั้งค่า', 'ภาพรวมแพลตฟอร์ม', 'Connect my AI', 'Connected AI apps']) {
		assert.ok(titleWithinContract(title), title);
	}
	assert.equal(titleWithinContract('คีย์และการเข้าสู่ระบบที่ใช้เชื่อม AI กับ ORCA ทั้งหมด'), false);
	assert.equal(titleWithinContract('One two three four five'), false);
	assert.equal(titleWithinContract('  '), false);
	assert.ok(subtitleWithinContract('ให้ Claude หรือ ChatGPT ใช้ข้อมูลบริษัทได้ ทำครั้งเดียว ประมาณ 3 นาที ไม่ต้องใช้คีย์'));
	assert.ok(subtitleWithinContract(undefined));
	assert.equal(subtitleWithinContract('ก'.repeat(91)), false);
	assert.equal(subtitleWithinContract('one\ntwo'), false);
	// Thai tone marks and vowels above or below a letter are not extra characters.
	assert.equal(visibleLength('ที่'), 1);
});

test('PageHeader renders one h1, its line, a status pill and at most one action', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), {
		StatusPill: (renderer, props) => renderer.push(`<span data-pill="${props.tone}">${props.label}</span>`),
	});
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { title: 'Connect my AI', subtitle: 'Once, about 3 minutes.', status: { label: 'Not connected' }, back: { href: '/app', label: 'Home' } } }).body;
	assert.equal(html.match(/<h1/g)?.length, 1);
	assert.match(html, /<h1 id="orca-page-title"[^>]*>Connect my AI<\/h1>/);
	assert.match(html, /<p class="orca-page-subtitle[^"]*">Once, about 3 minutes.<\/p>/);
	assert.match(html, /data-pill="neutral">Not connected/);
	assert.match(html, /href="\/app"/);
	assert.doesNotMatch(html, /orca-page-action/);
});

test('StatusPill and EmptyState stay within their contract', async () => {
	const pill = await serverComponent(new URL('./ui/StatusPill.svelte', import.meta.url), {});
	assert.deepEqual(pill.warnings, []);
	assert.match(render(pill.Component, { props: { label: 'Ready', tone: 'ok', dot: true } }).body, /class="orca-pill ok[^"]*"[^>]*>(?:<!--[^>]*-->)*<span class="orca-pill-dot[^"]*" aria-hidden="true"><\/span>(?:<!--[^>]*-->)*Ready/);
	const empty = await serverComponent(new URL('./ui/EmptyState.svelte', import.meta.url), {});
	assert.deepEqual(empty.warnings, []);
	const html = render(empty.Component, { props: { message: 'No programs yet.', actionLabel: 'Connect a program', href: '/app?view=add-program' } }).body;
	assert.match(html, /<p[^>]*>No programs yet.<\/p>/);
	assert.equal(html.match(/<a |<button /g)?.length, 1, 'one button');
	assert.doesNotMatch(render(empty.Component, { props: { message: 'Nothing here.' } }).body, /<a |<button /);
});

test('the title is 24px (20px on a phone; one step down, owner 2026-10-07) and outranks the shell\'s `.orca-workspace.orca-app h1`', async () => {
	const { readFile } = await import('node:fs/promises');
	const { compile } = await import('svelte/compiler');
	const source = await readFile(new URL('./ui/PageHeader.svelte', import.meta.url), 'utf8');
	const css = compile(source, { filename: 'PageHeader.svelte', generate: 'client', css: 'external' }).css.code.replace(/\/\*[\s\S]*?\*\//g, '');
	const shell = await readFile(new URL('./orca-system.css', import.meta.url), 'utf8');
	assert.match(shell, /\.orca-workspace\.orca-app h1 \{\s*font-size: 20px;/);
	// Scoped, `.orca-page-header .orca-page-title h1` is 0-3-1 at least: more than the shell's 0-2-1.
	const rule = css.match(/(\.orca-page-header[^{]*\.orca-page-title[^{]*h1[^{]*)\{([^}]*)\}/);
	assert.ok(rule, 'the title rule names the header, the title and the h1');
	assert.match(rule[2], /font-size:\s*24px/);
	const classes = (rule[1].match(/\.[\w-]+(?![^(]*\))/g) ?? []).length;
	assert.ok(classes >= 3, `${rule[1].trim()} has ${classes} classes outside :where()`);
	assert.match(css, /@media \(max-width: 720px\)\s*\{\s*\.orca-page-header[^{]*h1[^{]*\{\s*font-size:\s*20px/);
});

test('W0: inside a frame that shows the page H1, a PageHeader keeps only its action and status', async () => {
	const pill = (renderer, props) => renderer.push(`<span data-pill="${props.tone}">${props.label}</span>`);
	const nested = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { StatusPill: pill, pageHeaderClaimed: () => true });
	const action = (renderer) => renderer.push('<a class="k-button" href="/x">Invite</a>');
	let html = render(nested.Component, { props: { title: 'Team', subtitle: 'Invite with a link.', action } }).body;
	assert.doesNotMatch(html, /<h1|orca-page-subtitle|Team/);
	assert.match(html, /<div class="orca-page-subhead[^"]*">[\s\S]*<a class="k-button" href="\/x">Invite<\/a>/);
	html = render(nested.Component, { props: { title: 'Team', subtitle: 'Invite with a link.' } }).body;
	assert.doesNotMatch(html, /orca-page-subhead|<h1/, 'nothing at all without an action');
	html = render(nested.Component, { props: { title: 'Team', status: { label: 'Connected', tone: 'ok' } } }).body;
	assert.match(html, /data-pill="ok">Connected/);
	// Without a frame: the page's own H1, as before.
	const plain = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { StatusPill: pill, pageHeaderClaimed: () => false });
	assert.equal(render(plain.Component, { props: { title: 'Team' } }).body.match(/<h1/g)?.length, 1);
});
