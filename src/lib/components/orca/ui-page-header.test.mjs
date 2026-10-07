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

test('W0.1: EmptyState draws its icon as a plain 20px --subtle line icon, never on a tile', async () => {
	const { readFile } = await import('node:fs/promises');
	const { compile } = await import('svelte/compiler');
	const source = await readFile(new URL('./ui/EmptyState.svelte', import.meta.url), 'utf8');
	assert.match(source, /<span class="orca-empty-icon" aria-hidden="true"><Icon size=\{20\} strokeWidth=\{1\.75\} \/><\/span>/);
	const css = compile(source, { filename: 'EmptyState.svelte', generate: 'client', css: 'external' }).css.code.replace(/\/\*[\s\S]*?\*\//g, '');
	const rule = css.match(/\.orca-empty-icon[^{]*\{([^}]*)\}/)?.[1];
	assert.ok(rule, 'the icon rule');
	assert.match(rule, /color: var\(--orca-subtle\);/);
	assert.doesNotMatch(rule, /background|border-radius|width|height/, 'no tile');
	// Rendered with an icon: the icon, then the sentence.
	const Icon = (renderer, props) => renderer.push(`<svg data-size="${props.size}"></svg>`);
	const empty = await serverComponent(new URL('./ui/EmptyState.svelte', import.meta.url), {});
	const html = render(empty.Component, { props: { icon: Icon, message: 'Nothing here.' } }).body.replace(/<!--[^>]*-->/g, '');
	assert.match(html, /<span class="orca-empty-icon[^"]*" aria-hidden="true"><svg data-size="20"><\/svg><\/span>\s*<p[^>]*>Nothing here\.<\/p>/);
});

test('the title is 22px (18px on a phone; W0.2, one more step down, owner 2026-10-08) and outranks the shell\'s `.orca-workspace.orca-app h1`', async () => {
	const { readFile } = await import('node:fs/promises');
	const { compile } = await import('svelte/compiler');
	const source = await readFile(new URL('./ui/PageHeader.svelte', import.meta.url), 'utf8');
	const css = compile(source, { filename: 'PageHeader.svelte', generate: 'client', css: 'external' }).css.code.replace(/\/\*[\s\S]*?\*\//g, '');
	const shell = await readFile(new URL('./orca-system.css', import.meta.url), 'utf8');
	assert.match(shell, /\.orca-workspace\.orca-app h1 \{\s*font-size: 18px;/);
	// Scoped, `.orca-page-header .orca-page-title h1` is 0-3-1 at least: more than the shell's 0-2-1.
	const rule = css.match(/(\.orca-page-header[^{]*\.orca-page-title[^{]*h1[^{]*)\{([^}]*)\}/);
	assert.ok(rule, 'the title rule names the header, the title and the h1');
	assert.match(rule[2], /font-size:\s*22px/);
	const classes = (rule[1].match(/\.[\w-]+(?![^(]*\))/g) ?? []).length;
	assert.ok(classes >= 3, `${rule[1].trim()} has ${classes} classes outside :where()`);
	assert.match(css, /@media \(max-width: 720px\)\s*\{\s*\.orca-page-header[^{]*h1[^{]*\{\s*font-size:\s*18px/);
});

test('W0: inside a frame that shows the page H1, a PageHeader keeps only its action and status', async () => {
	const pill = (renderer, props) => renderer.push(`<span data-pill="${props.tone}">${props.label}</span>`);
	const nested = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { StatusPill: pill, pageHeaderClaimed: () => true });
	const action = (renderer) => renderer.push('<a class="k-button" href="/x">Invite</a>');
	let html = render(nested.Component, { props: { title: 'Team', subtitle: 'Invite with a link.', action } }).body;
	assert.doesNotMatch(html, /<h1|orca-page-subtitle|Invite with a link/);
	// Its name stays for screen readers (and a section's aria-labelledby), hidden.
	assert.match(html, /<h2 id="orca-page-section-[^"]+" class="orca-page-hidden[^"]*">Team<\/h2>/, 'its own id, never the frame H1\'s');
	assert.match(html, /<div class="orca-page-subhead[^"]*">[\s\S]*<a class="k-button" href="\/x">Invite<\/a>/);
	html = render(nested.Component, { props: { title: 'Team', subtitle: 'Invite with a link.' } }).body;
	assert.doesNotMatch(html, /orca-page-subhead|<h1/, 'no visible row without an action');
	html = render(nested.Component, { props: { title: 'Team', status: { label: 'Connected', tone: 'ok' } } }).body;
	assert.match(html, /data-pill="ok">Connected/);
	// Without a frame: the page's own H1, as before.
	const plain = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { StatusPill: pill, pageHeaderClaimed: () => false });
	assert.equal(render(plain.Component, { props: { title: 'Team' } }).body.match(/<h1/g)?.length, 1);
});

test('W0 polish: states are text with a dot, the platform mark is plain words, and AI ของฉัน has no numbered steps', async () => {
	const { readFile } = await import('node:fs/promises');
	const pill = await readFile(new URL('./ui/StatusPill.svelte', import.meta.url), 'utf8');
	const pillRule = pill.slice(pill.indexOf('.orca-pill {'), pill.indexOf('}', pill.indexOf('.orca-pill {')));
	assert.match(pillRule, /background: none;/);
	assert.match(pillRule, /border: 0;/);
	assert.doesNotMatch(pill.slice(pill.indexOf('<style>')), /border-radius: 999px|var\(--orca-\w+-bg\)/, 'never a filled pill');
	// W0.1: no eyebrow label above a platform title at all (the top bar says แพลตฟอร์ม ORCA).
	for (const file of ['./views/PlatformOverview.svelte', './PlatformCompanies.svelte', './PilotInbox.svelte', './GoogleSignInSettings.svelte', './OAuthApps.svelte', './platform/PlatformCatalog.svelte', './platform/BreakGlassAccounts.svelte', './platform/PlatformCompanyDetail.svelte'])
		assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /\{#snippet eyebrow\(\)\}|PlatformBadge/, file);
	// The numbered rail is gone altogether (visual review B1): no step component is left.
	const { readdir } = await import('node:fs/promises');
	assert.deepEqual((await readdir(new URL('./connect-ai/', import.meta.url))).filter((name) => /ConnectStep|ConsentDrawing|AIAppPicker/.test(name)), []);
	for (const file of ['./views/ConnectAIView.svelte', './connect-ai/AppSteps.svelte', './connect-ai/DeveloperKeys.svelte']) {
		assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /ขั้นที่ \d|ขั้นตอนเชื่อม|ประมาณ \d+ นาที/, file);
	}
});

test('W0: a frame\'s own header stays the page\'s H1 even though the frame claims the header for its children', async () => {
	const { readFile } = await import('node:fs/promises');
	const nested = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { pageHeaderClaimed: () => true });
	const html = render(nested.Component, { props: { title: 'ตั้งค่า', subtitle: 'บริษัท', frame: true } }).body;
	assert.match(html, /<h1 id="orca-page-title"[^>]*>ตั้งค่า<\/h1>/);
	for (const file of ['./views/SettingsFrame.svelte', './views/OversightView.svelte', './views/MyAIFrame.svelte']) {
		const source = await readFile(new URL(file, import.meta.url), 'utf8');
		assert.match(source, /claimPageHeader\(\);/, file);
		assert.match(source, /<PageHeader\s+frame\b/, `${file}: its own header is marked as the frame's`);
	}
});

test('Codex W0 review 1: a frame and the parts inside it never share a heading id, rendered together with the real context', async () => {
	const { getContext, setContext } = await import('svelte');
	const KEY = Symbol('frame');
	const claimed = () => {
		try {
			return getContext(KEY) === true;
		} catch {
			return false;
		}
	};
	const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
	const { join } = await import('node:path');
	const { tmpdir } = await import('node:os');
	const { pathToFileURL } = await import('node:url');
	const header = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { pageHeaderClaimed: claimed, StatusPill: () => {} });
	const dir = await mkdtemp(join(tmpdir(), 'orca-frame-'));
	try {
		const file = join(dir, 'Frame.svelte');
		await writeFile(file, `<script>
	import PageHeader from './PageHeader.svelte';
	import { claimPageHeader } from './page-header-context';
	claimPageHeader();
</script>
<PageHeader frame title="ตั้งค่า" subtitle="บริษัท" />
<PageHeader title="ทีม" />
<PageHeader title="ประวัติการใช้งาน" id="audit-title" />
<PageHeader title="อีกส่วน" />`);
		const frame = await serverComponent(pathToFileURL(file), { PageHeader: header.Component, claimPageHeader: () => setContext(KEY, true) });
		assert.deepEqual(frame.warnings, []);
		const html = render(frame.Component).body;
		const ids = [...html.matchAll(/<h[12] id="([^"]+)"/g)].map((match) => match[1]);
		assert.equal(ids.length, 4);
		assert.equal(new Set(ids).size, 4, ids.join());
		assert.equal(ids[0], 'orca-page-title');
		assert.equal(ids[2], 'audit-title', 'an explicit id stays (its section is labelled by it)');
		assert.equal(html.match(/<h1/g)?.length, 1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('W0: on the page itself only สร้าง is primary; dialogs keep their own', async () => {
	const { readFile } = await import('node:fs/promises');
	const css = await readFile(new URL('./w0.css', import.meta.url), 'utf8');
	assert.match(css, /\.orca-workspace\.orca-app\.orca-w0 \.workspace-main \.k-button\.primary:not\(dialog \*\) \{\s*border-color: var\(--orca-line-strong\);\s*background: var\(--orca-surface\);\s*color: var\(--orca-ink\) !important;/);
	const modal = await readFile(new URL('./ui/Modal.svelte', import.meta.url), 'utf8');
	assert.match(modal, /box-shadow: none;/, 'a hairline edge, no shadow');
	assert.match(modal, /border: 1px solid var\(--orca-line\);/);
	const organization = await readFile(new URL('./OrganizationSettings.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(organization, /k-button primary/);
	assert.match(organization, /\.organization-logo-field \{\s*position: relative;/, 'the hidden file input no longer widens the page');
	assert.match(organization, /\.organization-logo-input \{\s*position: absolute;\s*top: 0;\s*left: 0;/);
	const team = await readFile(new URL('./TeamAccess.svelte', import.meta.url), 'utf8');
	const badge = team.slice(team.indexOf('  .role-badge {'), team.indexOf('}', team.indexOf('  .role-badge {')));
	assert.doesNotMatch(badge, /background|border-radius|padding/, 'a role is plain text');
	assert.match(team, /<label class="team-filter">[\s\S]*?<select bind:value=\{memberStatus\}>/, 'one dropdown, not a chip row');
});
