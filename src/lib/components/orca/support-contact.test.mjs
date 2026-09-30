import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// The ORCA team's LINE and email (owner, 2026-09-30) live in one module,
// $lib/orca/support; every "contact the ORCA team" place reads them from there.
const support = await importTypeScript(new URL('../../orca/support.ts', import.meta.url));
const th = (thai) => thai;
const en = (_th, english) => english;
const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const source = new URL('../../', import.meta.url);

test('the channels: LINE OA @147njpwd and the team email, LINE first', () => {
	assert.equal(support.ORCA_SUPPORT_LINE_ID, '@147njpwd');
	assert.equal(support.ORCA_SUPPORT_LINE_URL, `https://line.me/R/ti/p/${support.ORCA_SUPPORT_LINE_ID}`);
	assert.equal(support.ORCA_SUPPORT_EMAIL, 'natthaphon.chop@gmail.com');
	assert.equal(support.ORCA_SUPPORT_MAILTO, `mailto:${support.ORCA_SUPPORT_EMAIL}`);
	assert.equal(support.ORCA_SUPPORT_LINE_REL, 'noopener noreferrer');
	assert.deepEqual(support.supportLinks(th), [
		{ kind: 'line', href: 'https://line.me/R/ti/p/@147njpwd', label: 'ส่งข้อความหาทีม ORCA ทาง LINE', handle: '@147njpwd', newTab: true },
		{ kind: 'email', href: 'mailto:natthaphon.chop@gmail.com', label: 'อีเมล', handle: 'natthaphon.chop@gmail.com', newTab: false }
	]);
	assert.deepEqual(support.supportLinks(en).map((link) => link.label), ['Message the ORCA team on LINE', 'Email']);
	// After "or": the English words go on in lower case; Thai has no case.
	assert.deepEqual(support.supportLinks(en, true).map((link) => link.label), ['message the ORCA team on LINE', 'email']);
	assert.deepEqual(support.supportLinks(th, true).map((link) => link.label), ['ส่งข้อความหาทีม ORCA ทาง LINE', 'อีเมล']);
});

test('SupportContact renders whatever the module says: LINE in a new tab without a referrer, the email as mailto:', async () => {
	const file = new URL('./ui/SupportContact.svelte', import.meta.url);
	const real = await serverComponent(file, { t: th, ...support });
	assert.deepEqual(real.warnings, []);
	let html = render(real.Component).body;
	assert.match(html, /<a href="https:\/\/line\.me\/R\/ti\/p\/@147njpwd" target="_blank" rel="noopener noreferrer"[^>]*>ส่งข้อความหาทีม ORCA ทาง LINE <span class="orca-support-handle[^"]*">@147njpwd<\/span>/);
	assert.match(html, /<a href="mailto:natthaphon\.chop@gmail\.com"[^>]*>อีเมล <span class="orca-support-handle[^"]*">natthaphon\.chop@gmail\.com<\/span><\/a>/);
	assert.doesNotMatch(html.slice(html.indexOf('mailto:')), /target=/, 'the email opens the mail app, not a tab');
	assert.equal(plain(html), 'ส่งข้อความหาทีม ORCA ทาง LINE @147njpwd (เปิดในแท็บใหม่) · อีเมล natthaphon.chop@gmail.com');
	html = render((await serverComponent(file, { t: en, ...support })).Component, { props: { midSentence: true } }).body;
	assert.equal(plain(html), 'message the ORCA team on LINE @147njpwd (opens in a new tab) · email natthaphon.chop@gmail.com');

	// A stand-in module changes every word and link: nothing is written in the component itself.
	const fake = {
		ORCA_SUPPORT_LINE_REL: 'noopener noreferrer',
		supportLinks: () => [
			{ kind: 'line', href: 'https://line.example/other', label: 'LINE-X', handle: '@other', newTab: true },
			{ kind: 'email', href: 'mailto:team@example.test', label: 'MAIL-X', handle: 'team@example.test', newTab: false }
		]
	};
	html = render((await serverComponent(file, { t: th, ...fake })).Component).body;
	assert.match(html, /href="https:\/\/line\.example\/other" target="_blank" rel="noopener noreferrer"[^>]*>LINE-X /);
	assert.match(html, /href="mailto:team@example\.test"[^>]*>MAIL-X /);
	assert.doesNotMatch(html, /147njpwd|natthaphon/);
});

async function sourceFiles(dir) {
	const found = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
		if (entry.isDirectory()) found.push(...(await sourceFiles(path)));
		else if (/\.(svelte|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)) found.push(path);
	}
	return found;
}

test('only the support module holds the channels, and every "ติดต่อทีม ORCA" names the LINE', async () => {
	const files = await sourceFiles(source);
	const holders = [];
	for (const file of files) {
		const code = await readFile(file, 'utf8');
		const name = file.pathname.slice(source.pathname.length);
		if (/147njpwd|natthaphon\.chop@gmail\.com|line\.me\/R\/ti\/p/.test(code)) holders.push(name);
		if (name === 'orca/support.ts') continue;
		for (const match of code.matchAll(/ติดต่อทีม ORCA(.{0,40})/g)) {
			assert.match(match[1], /^ ทาง LINE \$\{ORCA_SUPPORT_LINE_ID\}/, `${name}: "ติดต่อทีม ORCA${match[1]}"`);
		}
	}
	assert.deepEqual(holders, ['orca/support.ts']);
	// The places that say to reach the ORCA team use the module.
	for (const [file, uses] of [
		['components/orca/views/ConnectAIView.svelte', /<SupportContact midSentence \/>/],
		['components/orca/views/HelpView.svelte', /supportLinks\(t\)/],
		['components/orca/WorkspaceDashboard.svelte', /\{#if manager\}\{t\('ติดตรงไหน', 'Stuck\?'\)\} <SupportContact \/>/],
		['services/orca.ts', /import \{ ORCA_SUPPORT_LINE_ID \} from "\$lib\/orca\/support";/]
	]) {
		assert.match(await readFile(new URL(file, source), 'utf8'), uses, file);
	}
	// The trial-request form stays for companies not on ORCA yet (the company chooser, the sign-in page).
	assert.match(await readFile(new URL('components/orca/CompanyGate.svelte', source), 'utf8'), /href=\{localeHref\("\/home\?to=start"\)\}>\{t\("ขอทดลองใช้"/);
	assert.match(await readFile(new URL('../routes/login/+page.svelte', source), 'utf8'), /บริษัทยังไม่มี ORCA\?[\s\S]{0,120}site\("start"\)/);
});
