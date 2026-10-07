import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// The W0.1 shell (output/orca-w01): the full-width top bar, the rail and its
// sections, the สร้าง menu, the company and account menus. Menus render open
// here (a stub PopMenu), so what each one holds can be read.
const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));
const navigation = await import(await typescriptModuleURL(new URL('../../orca/navigation.ts', import.meta.url)));
const { term } = await import(await typescriptModuleURL(new URL('../../orca/glossary.ts', import.meta.url)));
const workspaceNav = await import(await typescriptModuleURL(new URL('../../orca/workspace-nav.ts', import.meta.url)));
const menuKeys = await import(await typescriptModuleURL(new URL('../../orca/menu-keys.ts', import.meta.url)));
const rail = await import(await typescriptModuleURL(new URL('../../orca/rail.ts', import.meta.url)));
const { hubAsksApproval } = await import(await typescriptModuleURL(new URL('../../orca/approvals.ts', import.meta.url)));
const shell = new URL('./AppShell.svelte', import.meta.url);
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const companies = [
	{ id: 'default', displayName: 'Company A', role: 'owner', canManage: true },
	{ id: B, displayName: 'Company B', role: 'employee', canManage: false },
];
const data = {
	organization: { displayName: 'Company B' }, currentUserID: '7', canManage: false,
	members: [{ id: '7', displayName: 'Person 7', email: 'person-7@example.invalid', role: 1 }], hubs: [], connections: [], units: [],
};
const owner = { ...data, organization: { displayName: 'Company A' }, canManage: true, members: [{ id: '7', displayName: 'Person 7', email: 'person-7@example.invalid', role: 'owner' }] };
const en = (_th, english) => english;
// Open menus: the button, then the menu with its rows.
const PopMenu = (renderer, props) => {
	renderer.push(`<div data-menu="${props.id}" data-kind="${props.kind ?? 'menu'}" data-sheet="${props.sheet ?? ''}"><button class="${props.buttonClass}" aria-label="${props.buttonLabel ?? ''}">`);
	props.button(renderer);
	renderer.push(`</button><div role="${(props.kind ?? 'menu') === 'menu' ? 'menu' : 'dialog'}" aria-label="${props.label}">`);
	props.children(renderer, () => () => {});
	renderer.push('</div></div>');
};
const McpMark = (renderer) => renderer.push('<svg class="mcp-mark"></svg>');
const { Component: CreateMenu } = await serverComponent(new URL('./shell/CreateMenu.svelte', import.meta.url), { term, t: en, localeHref: (path) => path, PopMenu, McpMark });

async function renderShell(props) {
	const { warnings, Component } = await serverComponent(shell, {
		...company, ...workspaceNav, ...menuKeys, ...rail, localeHref: (path) => path, t: en, orcaLocale: { value: 'en' },
		activeNavigationView: navigation.activeNavigationView, APP_VIEWS: navigation.APP_VIEWS, platformHref: navigation.platformHref, showsPlatformSwitch: navigation.showsPlatformSwitch,
		term, hubAsksApproval, memberName: (member) => member.displayName, memberRole: () => 'Member',
		writesInFlight: () => 0, onMount: () => {}, untrack: (fn) => fn(), goto: async () => {}, PopMenu, CreateMenu, McpMark,
	});
	return { warnings, html: render(Component, { props: { view: 'dashboard', refreshing: false, onrefresh() {}, children: () => {}, ...props } }).body };
}
/** The rail's own part of the page (the phone drawer repeats it). */
const railOf = (html) => html.slice(html.indexOf('<aside class="w1-rail'), html.indexOf('</aside>'));
const railLinks = (html) => [...railOf(html).matchAll(/<a class="w1-item[^"]*"[^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?<span class="w1-label">([^<]*)<\/span>/g)].map(([, href, label]) => `${label} ${href.replaceAll('&amp;', '&')}`);
const sections = (html) => [...railOf(html).matchAll(/<div class="w1-sec" role="presentation"><span>([^<]*)<\/span>/g)].map((match) => match[1]);
const menuOf = (html, id) => {
	const start = html.indexOf(`data-menu="${id}"`);
	return start < 0 ? '' : html.slice(start, html.indexOf('</div></div>', start));
};
const createRows = (html) => [...menuOf(html, 'orca-create-menu').matchAll(/data-create="([^"]+)"/g)].map((match) => match[1]);

test('W0.1 rail for Owners and Admins: ไปที่…, หน้าหลัก, then AI · ข้อมูล · จัดการ, and ช่วยเหลือ with the ORCA mark', async () => {
	const { warnings, html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', pendingApprovals: 2 });
	assert.deepEqual(warnings, []);
	assert.deepEqual(sections(html), ['AI', 'Data', 'Manage']);
	assert.deepEqual(railLinks(html), [
		'Home /app', 'My AI /app?view=connect-ai', 'Programs /app?view=servers', 'Knowledge /app?view=knowledge', 'History /app?view=approvals', 'Settings /app?view=settings', 'Help /app?view=help'
	]);
	const aside = railOf(html);
	assert.match(aside, /class="w1-item w1-jump"[^>]*aria-keyshortcuts="Meta\+K Control\+K"[\s\S]*?Go to…[\s\S]*?<kbd>⌘K<\/kbd>/);
	assert.match(aside, /<span class="w1-item w1-soon" aria-disabled="true" data-label="Workflows · Coming soon">[\s\S]*?Workflows<\/span><small class="w1-aside">Coming soon<\/small>/);
	assert.doesNotMatch(aside, /<a [^>]*>(?:(?!<\/a>)[\s\S])*Workflows/);
	// โปรแกรม's icon is the MCP mark (owner, 2026-10-07).
	assert.match(aside, /href="\/app\?view=servers"[^>]*>(?:<!--[^>]*-->)*<svg class="mcp-mark"><\/svg>/);
	assert.match(aside, /aria-label="History, 2 waiting"[\s\S]*?<span class="w1-count" aria-hidden="true">2<\/span>/);
	// The bottom: help, the official ORCA mark, the pin.
	assert.match(aside, /class="w1-rail-foot"[\s\S]*?Help[\s\S]*?class="w1-brand"[\s\S]*?class="w1-pin" aria-pressed="false" aria-label="Pin the menu"/);
	// Nothing of the old sidebar's bottom (user, company) is left in the rail.
	assert.doesNotMatch(aside, /workspace-account|workspace-company|Person 7|Sign out/);
});

test('ตั้งค่า ▾ lists ทีม, พื้นที่ทำงาน AI, บริษัท and บัญชีของฉัน, opened on a settings page; employees see what they reach today', async () => {
	let { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'members' });
	assert.deepEqual(railLinks(html).filter((row) => /Team|AI workspaces|Company|My account/.test(row)), [
		'Team /app?view=members', 'AI workspaces /app?view=workspaces', 'Company /app?view=settings&section=company', 'My account /app?view=settings&section=account'
	]);
	assert.match(railOf(html), /class="w1-caret" aria-expanded="true"/);
	assert.match(railOf(html), /class="w1-item w1-subitem active"[^>]*aria-current="page"[^>]*data-label="Team"/);
	({ html } = await renderShell({ data, companies: [companies[1]], account: '7', view: 'settings', section: 'account' }));
	assert.deepEqual(railLinks(html).filter((row) => /Team|AI workspaces|Company|My account/.test(row)), ['AI workspaces /app?view=workspaces', 'My account /app?view=settings&section=account']);
	// Closed until opened elsewhere.
	({ html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'dashboard' }));
	assert.match(railOf(html), /class="w1-caret" aria-expanded="false"/);
	assert.doesNotMatch(railOf(html), /w1-subitem/);
});

test('employees: หน้าหลัก, AI ของฉัน, คลังความรู้, ประวัติ and ตั้งค่า; no Workflows, no โปรแกรม, no waiting count', async () => {
	let { html } = await renderShell({ data, companies: [companies[1]], account: '7', pendingApprovals: 3 });
	assert.deepEqual(railLinks(html), ['Home /app', 'My AI /app?view=connect-ai', 'Knowledge /app?view=knowledge', 'History /app?view=executions', 'Settings /app?view=settings', 'Help /app?view=help']);
	assert.doesNotMatch(railOf(html), /Workflows|w1-soon|view=servers|w1-count/);
	({ html } = await renderShell({ data: { ...data, hubs: [{ id: 'h', status: 'active', writeMode: 'approval' }] }, companies: [companies[1]], account: '7' }));
	assert.ok(railLinks(html).includes('History /app?view=approvals'), 'their requests once a workspace holds writes');
	// An employee's history pages light ประวัติ, whichever tab (W0, e45e9ea).
	const requests = { ...data, hubs: [{ id: 'h', status: 'active', writeMode: 'approval' }] };
	const lit = (page) => [...railOf(page).matchAll(/<a class="w1-item active"[^>]*aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*?<span class="w1-label">([^<]*)<\/span>/g)].map((match) => match[1]);
	for (const view of ['approvals', 'executions', 'audit']) {
		({ html } = await renderShell({ data: requests, companies: [companies[1]], account: '7', view }));
		assert.deepEqual(lit(html), ['History'], view);
	}
	// LINE's writes wait for a manager even in a workspace that runs at once (design §14l); rendered, as in W0 (e45e9ea).
	const line = { ...data, connections: [{ id: 'c-line', mcpID: 'default-orca-api-line-messaging' }], hubs: [{ id: 'h', status: 'active', writeMode: 'direct', sources: [{ connectionID: 'c-line', toolNames: ['line_push_text'] }] }] };
	({ html } = await renderShell({ data: line, companies: [companies[1]], account: '7', view: 'approvals' }));
	assert.ok(railLinks(html).includes('History /app?view=approvals'), 'a LINE write: their requests');
	assert.ok(!railLinks(html).includes('History /app?view=executions'));
	({ html } = await renderShell({ data: { ...line, hubs: [{ ...line.hubs[0], sources: [{ connectionID: 'c-line', toolNames: ['line_profile_get'] }] }] }, companies: [companies[1]], account: '7', view: 'dashboard' }));
	assert.ok(railLinks(html).includes('History /app?view=executions'), 'reads alone never wait');
	assert.ok(!railLinks(html).includes('History /app?view=approvals'));
});

test('Skills shows in the rail only with the bootstrap feature', async () => {
	for (const features of [undefined, {}, { skills: false }, { skills: 'yes' }, { libraryV2: true }])
		for (const viewer of [owner, data]) {
			const { html } = await renderShell({ data: { ...viewer, features }, companies: [companies[0]], account: '7' });
			assert.doesNotMatch(html, /view=skills|>Skills</, JSON.stringify(features));
		}
	const { html } = await renderShell({ data: { ...owner, features: { skills: true } }, companies: [companies[0]], account: '7', view: 'skills' });
	assert.deepEqual(railLinks(html).slice(0, 3), ['Home /app', 'My AI /app?view=connect-ai', 'Skills /app?view=skills']);
	assert.match(railOf(html), /class="w1-item active"[^>]*href="\/app\?view=skills"[^>]*aria-current="page"/);
});

test('the rail\'s active item: a grey tile only on the rail; the citron dot only in the open panel', async () => {
	for (const [view, label, section] of [
		['servers', 'Programs'], ['add-program', 'Programs'], ['connect-ai', 'My AI'], ['secrets', 'My AI'], ['executions', 'History'], ['audit', 'History'], ['knowledge', 'Knowledge'], ['welcome', 'Home'], ['hub', 'Settings'], ['help', 'Help']
	]) {
		const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view, section });
		assert.match(railOf(html), new RegExp(`class="w1-item active"[^>]*data-label="${label}"`), view);
	}
	const css = await readFile(new URL('./w01.css', import.meta.url), 'utf8');
	const active = css.slice(css.indexOf('.orca-w01 .w1-item.active {'), css.indexOf('}', css.indexOf('.orca-w01 .w1-item.active {')));
	assert.match(active, /background: var\(--orca-secondary\)/);
	assert.doesNotMatch(css, /\.w1-rail:not\(\.open\)[^{]*\.active::after|\.orca-w01 \.w1-item\.active::after/, 'no corner dot on the collapsed rail');
	assert.match(css, /\.orca-w01 \.w1-rail\.open \.w1-item\.active::after,\s*\.orca-w01 \.w1-drawer \.w1-item\.active::after \{[^}]*background: var\(--orca-citron\)/);
	// 56 px rail, 272 px panel over the content, the content moves only when pinned; no slide with reduced motion.
	assert.match(css, /--w1-rail: 56px;\s*--w1-panel: 272px;/);
	assert.match(css, /\.orca-w01 \.w1-stage \{[^}]*margin-left: var\(--w1-rail\);/);
	assert.match(css, /\.orca-w01\.rail-pinned \.w1-stage \{\s*margin-left: var\(--w1-panel\);/);
	assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.orca-w01 \.w1-rail \{\s*transition: width/);
	assert.doesNotMatch(css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[^}]*\}\s*\}/, ''), /transition|animation/, 'no other motion');
});

test('the rail opens on hover, focus and Esc through the rail module, and its pin through the shell', async () => {
	const source = await readFile(shell, 'utf8');
	assert.match(source, /onpointerenter=\{\(\) => railControl\.pointerEnter\(\)\}/);
	assert.match(source, /onpointerleave=\{\(\) => \{ hideTip\(\); railControl\.pointerLeave\(\); \}\}/);
	assert.match(source, /onfocusin=\{onRailFocusIn\}/);
	assert.match(source, /onfocusout=\{onRailFocusOut\}/);
	assert.match(source, /if \(event\.key === "Escape" && !layerAboveRail\(\) && railControl\.escape\(\)\)/);
	assert.match(source, /onclick=\{\(\) => railControl\.togglePin\(\)\}/);
	assert.match(source, /visible = !!target\?\.matches\(":focus-visible"\);/, 'only keyboard focus opens it at once');
	// Tooltips only while it is closed.
	assert.match(source, /\{#if tip && !rail\.open\}<div class="w1-tip" role="tooltip"/);
	// A pinned rail, restored from storage, renders open.
	const store = new Map([[rail.RAIL_PIN_KEY, '1']]);
	globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };
	try {
		const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7' });
		assert.match(html, /class="w1-rail open pinned"|class="w1-rail[^"]*\bopen\b[^"]*\bpinned\b/);
		assert.match(html, /class="w1-pin" aria-pressed="true" aria-label="Unpin the menu"/);
		assert.match(html, /class="orca orca-app orca-workspace orca-w0 orca-w01[^"]*\brail-pinned\b/);
	} finally {
		delete globalThis.window;
	}
});

test('the top bar: the company at the left without a plan, ＋ สร้าง ▾ and the account at the right', async () => {
	const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7' });
	const top = html.slice(html.indexOf('<header class="w1-top">'), html.indexOf('</header>'));
	assert.ok(top.indexOf('orca-company-menu') < top.indexOf('orca-create-menu'));
	assert.ok(top.indexOf('orca-create-menu') < top.indexOf('orca-account-menu'));
	assert.match(top, /<button class="w1-company" aria-label="Company: Company A. Switch company"><span class="w1-initial" aria-hidden="true">C<\/span><span class="w1-company-name" title="Company A">Company A<\/span>/);
	assert.doesNotMatch(top, /Early Partner|package|plan/i, 'no plan label for customers');
	assert.equal(html.match(/class="w1-create"/g)?.length, 1, 'one primary');
	assert.match(top, /<button class="w1-create"[^>]*>(?:<!--[^>]*-->)*<span>Create<\/span>/);
	const css = await readFile(new URL('./w01.css', import.meta.url), 'utf8');
	assert.match(css, /\.orca-w01 \.w1-create \{[^}]*height: 36px;[^}]*background: var\(--orca-ink\);[^}]*color: var\(--orca-on-ink, #fff\);/, 'solid ink; ink is light in dark');
	assert.match(css, /\.orca-w01 \.w1-top \{\s*position: fixed;\s*inset: 0 0 auto 0;/, 'full width');
});

test('the account menu: who, บัญชีของฉัน, theme, language and ออกจากระบบ', async () => {
	const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7' });
	const menu = menuOf(html, 'orca-account-menu');
	assert.match(menu, /data-kind="panel"/, 'controls inside keep Tab');
	assert.match(menu, /aria-label="Account: Person 7"/);
	assert.match(menu.replace(/<!--[^>]*-->/g, ''), /<strong>Person 7<\/strong><small>person-7@example\.invalid<\/small><small>Member<\/small>/);
	assert.match(menu, /href="\/app\?view=settings&amp;section=account"[\s\S]*?My account/);
	assert.match(menu, /class="w1-menu-control"/);
	assert.match(menu, /workspace-account-language"><span>Language<\/span>/);
	assert.match(menu, /href="\/oauth2\/sign_out\?rd=\/"[\s\S]*?Sign out/);
	assert.ok(menu.indexOf('My account') < menu.indexOf('Language') && menu.indexOf('Language') < menu.indexOf('Sign out'));
});

test('the company menu lists the person\'s companies; each opens that company\'s page afresh', async () => {
	company.setPageCompany(B, companies);
	try {
		const { html } = await renderShell({ data, companies, account: '7' });
		const menu = menuOf(html, 'orca-company-menu');
		assert.match(menu, /Your companies/);
		assert.match(menu, /href="\/app\?org=default" data-sveltekit-reload/);
		assert.match(menu, new RegExp(`href="/app\\?org=${B}" data-sveltekit-reload(?:="")? aria-current="true"`));
		assert.doesNotMatch(menu, /org=default"[^>]*aria-current/);
		assert.doesNotMatch(menu, /ORCA platform/, 'no platform for a customer');
	} finally {
		company.setPageCompany('default', []);
	}
	// One company: still named, with its check.
	const { html } = await renderShell({ data: owner, companies: [], account: '7' });
	assert.match(menuOf(html, 'orca-company-menu'), /Company A[\s\S]*?<\/span>/);
});

test('the ORCA team switches to the platform from the company menu; the platform has the same shell without สร้าง', async () => {
	const operator = { ...owner, platformOperator: true, canReviewPilotRequests: true };
	let { html } = await renderShell({ data: operator, companies: [companies[0]], account: '7' });
	assert.match(menuOf(html, 'orca-company-menu'), /href="\/app\?org=default&amp;view=platform&amp;section=overview"[\s\S]*?ORCA platform/);
	({ html } = await renderShell({ data: operator, companies: [companies[0]], account: '7', view: 'platform', section: 'signin' }));
	assert.deepEqual(railLinks(html), [
		'Platform overview /app?org=default&view=platform&section=overview', 'Customer companies /app?org=default&view=platform&section=companies', 'Pilot requests /app?org=default&view=platform&section=pilots',
		'Sign in with Google /app?org=default&view=platform&section=signin', 'Program OAuth apps /app?org=default&view=platform&section=oauth-apps', 'Program catalog /app?org=default&view=platform&section=catalog',
		'Break-glass accounts /app?org=default&view=platform&section=breakglass', 'Help /app?view=help'
	]);
	assert.match(railOf(html), /class="w1-item active"[^>]*aria-current="page"[^>]*data-label="Sign in with Google"/);
	assert.doesNotMatch(html, /w1-create|orca-create-menu/);
	assert.match(html, /<span class="w1-company-name" title="ORCA platform">ORCA platform<\/span>/);
	assert.match(menuOf(html, 'orca-company-menu'), /href="\/app"[\s\S]*?Company/);
	// A customer who opens the platform address still sees their company menu.
	({ html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'platform' }));
	assert.doesNotMatch(html, /Customer companies|Break-glass/);
});

test('the platform switch follows the account-level operator flag in every company; customers never see it', async () => {
	company.setPageCompany(B, companies);
	try {
		const inB = { ...data, platformOperator: false, platformOperatorAccount: true };
		let { warnings, html } = await renderShell({ data: inB, companies, account: '7' });
		assert.deepEqual(warnings, []);
		// The platform always opens the default company, as a new page.
		assert.match(menuOf(html, 'orca-company-menu'), /href="\/app\?org=default&amp;view=platform&amp;section=overview" data-sveltekit-reload/);
		// The flag alone never shows the platform's pages: they need the default company's flag.
		({ html } = await renderShell({ data: inB, companies, account: '7', view: 'platform', section: 'breakglass' }));
		assert.doesNotMatch(html, /Customer companies|Break-glass|Platform overview/);
	} finally {
		company.setPageCompany('default', []);
	}
	for (const customer of [owner, { ...owner, platformOperator: false, platformOperatorAccount: false }, { ...data, platformOperatorAccount: false }, { ...owner, platformOperatorAccount: 'yes' }, { ...owner, platformOperatorAccount: 1 }]) {
		for (const view of ['dashboard', 'platform']) {
			const { html } = await renderShell({ data: customer, companies: [companies[0]], account: '7', view });
			assert.doesNotMatch(html, /view=platform|ORCA platform|Customer companies|Break-glass/, `${JSON.stringify(customer.platformOperatorAccount)} ${view}`);
		}
	}
	assert.equal(navigation.showsPlatformSwitch(undefined), false);
	assert.equal(navigation.showsPlatformSwitch({ platformOperator: false, platformOperatorAccount: true }), true);
});

test('the สร้าง menu by role and flag: groups with hairlines, shortcut hints, greyed coming-soon rows', async () => {
	let { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7' });
	assert.deepEqual(createRows(html), ['workspace', 'program', 'workflow', 'agent', 'knowledge', 'ai', 'invite', 'account']);
	const menu = menuOf(html, 'orca-create-menu');
	assert.match(menu, /data-sheet="Create"/, 'a bottom sheet on a phone');
	assert.equal(menu.match(/class="cm-group[^"]*" role="group"/g)?.length, 4);
	assert.match(menu, /<a class="cm-row[^"]*" role="menuitem" tabindex="-1" href="\/app\?view=servers&amp;catalog=1" data-create="program" aria-keyshortcuts="C P">(?:<!--[^>]*-->)*<svg class="mcp-mark"><\/svg>/, 'เชื่อมโปรแกรม with the MCP mark');
	assert.match(menu.replace(/<!--[^>]*-->/g, ''), /Connect a program<\/span><span class="cm-hint[^"]*">C then P<\/span>/);
	assert.match(menu.replace(/<!--[^>]*-->/g, ''), /<div class="cm-row off[^"]*" role="menuitem" aria-disabled="true" tabindex="-1" data-create="workflow">[\s\S]*?Workflow<\/span><span class="cm-hint[^"]*">Coming soon<\/span>/);
	assert.match(menu, /Connect AI<\/span>/);
	assert.doesNotMatch(menu, /\(MCP\)/, 'the label is "เชื่อม AI" (review-landing 5)');
	({ html } = await renderShell({ data: { ...owner, features: { skills: true, docTemplates: true } }, companies: [companies[0]], account: '7' }));
	// เทมเพลตเอกสาร waits for its page (view=documents) to be in this build.
	assert.deepEqual(createRows(html), ['workspace', 'program', 'workflow', 'skill', 'agent', 'knowledge', 'ai', 'invite', 'account']);
	// Members: only what they may use.
	({ html } = await renderShell({ data, companies: [companies[1]], account: '7' }));
	assert.deepEqual(createRows(html), ['agent', 'knowledge', 'ai']);
	// No Workflow and no Skill for members (W0); Skill only with a manager's grant, which no server sends yet.
	({ html } = await renderShell({ data: { ...data, features: { skills: true } }, companies: [companies[1]], account: '7' }));
	assert.deepEqual(createRows(html), ['agent', 'knowledge', 'ai']);
	({ html } = await renderShell({ data: { ...data, canCreateSkills: true, features: { skills: true } }, companies: [companies[1]], account: '7' }));
	assert.deepEqual(createRows(html), ['skill', 'agent', 'knowledge', 'ai']);
	const css = await readFile(new URL('./shell/CreateMenu.svelte', import.meta.url), 'utf8');
	assert.match(css, /\.cm-hint \{[^}]*color: var\(--orca-subtle\);\s*font-size: 11\.5px;/, 'lighter hints (review-landing 7)');
	assert.match(css, /\.cm-group \+ \.cm-group \{[^}]*border-top: 1px solid var\(--orca-line\);/);
});

test('shortcuts in the shell: C then a letter by event.code, ⌘K by KeyK, never while typing or another menu is open', async () => {
	const source = await readFile(shell, 'utf8');
	const handler = source.slice(source.indexOf('function onShortcut('), source.indexOf('// ไปที่…: the pages'));
	assert.match(handler, /if \(isJumpShortcut\(event\)\)/);
	assert.match(handler, /if \(creating \|\| companyOpen \|\| accountOpen \|\| jumping \|\| drawer\?\.open \|\| !createGroups\.length\)/);
	assert.match(handler, /const read = sequence\.read\(event\);/);
	assert.match(handler, /const item = createShortcut\(createGroups, read\.code\);/, 'only rows this viewer sees');
	assert.match(handler, /void goto\(localeHref\(item\.href\)\);/);
	assert.doesNotMatch(handler, /event\.key\.toLowerCase|event\.key === "k"/, 'never by event.key');
});

test('the phone drawer keeps the rail\'s contents, without the pin', async () => {
	const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7' });
	const drawer = html.slice(html.indexOf('<dialog class="workspace-drawer w1-drawer"'), html.indexOf('</dialog>'));
	assert.match(drawer, /aria-label="Close menu"/);
	assert.match(drawer, /href="\/app\?view=servers"/);
	assert.doesNotMatch(drawer, /w1-pin/);
	assert.match(html, /class="w1-icon-button w1-menu"[^>]*aria-label="Open menu"/);
});

test('the top-bar menus: anchored under their button, arrows over the rows, Esc back to the button, Tab closes a menu', async () => {
	const source = await readFile(new URL('./shell/PopMenu.svelte', import.meta.url), 'utf8');
	assert.match(source, /aria-haspopup=\{kind === 'menu' \? 'menu' : 'dialog'\}\s*aria-expanded=\{open\}\s*aria-controls=\{id\}/);
	assert.match(source, /if \(event\.key === 'Escape'\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*close\(true\);/, 'Esc returns focus to the button');
	assert.match(source, /if \(event\.key === 'Tab'\) \{\s*\/\/[^\n]*\n\s*if \(!modal\) close\(\);\s*return;/, 'Tab closes a dropdown; the phone sheet keeps it inside');
	assert.match(source, /const next = menuMove\(list\.map\(\(row\) => row\.getAttribute\('aria-disabled'\) === 'true'\), current, event\.key\);/, 'greyed rows are skipped');
	assert.match(source, /if \(event\.detail === 0\) void focusRow\('first'\);/, 'Enter or Space lands on the first row');
	assert.match(source, /\.pm-menu \{\s*position: absolute;\s*top: calc\(100% \+ 6px\);/, 'a menu, not a modal');
	// The dropdown is never modal; only the phone sheet is.
	const dropdown = source.slice(source.indexOf('{:else if open}'), source.indexOf('</div>\n\t{/if}'));
	assert.match(dropdown, /class="pm-menu align-\{align\}"/);
	assert.doesNotMatch(dropdown, /<dialog/);
	assert.equal(source.match(/showModal\(\)/g)?.length, 1, 'one modal: the phone sheet');
});

test('the phone สร้าง sheet is a modal dialog: focus trapped, the page inert, focus back to the button (Codex W0.1 round 1)', async () => {
	const source = await readFile(new URL('./shell/PopMenu.svelte', import.meta.url), 'utf8');
	assert.match(source, /const query = window\.matchMedia\('\(max-width: 720px\)'\);/);
	assert.match(source, /const modal = \$derived\(!!sheet && phone\);/);
	assert.match(source, /\{#if open && modal\}[\s\S]*?<dialog\s+bind:this=\{sheetDialog\}\s+class="pm-sheet"\s+aria-labelledby="pm-sheet-title-\{uid\}"/);
	// showModal() makes everything behind it inert; the dialog's Tab trap keeps focus inside.
	assert.match(source, /element\.showModal\(\);\s*void focusRow\('first'\);/);
	// Tab goes between the close button and the menu; it never leaves the sheet.
	assert.match(source, /onkeydown=\{onSheetKey\}/);
	assert.match(source, /function onSheetKey\(event: KeyboardEvent\) \{\s*if \(event\.key !== 'Tab'\) return;\s*event\.preventDefault\(\);\s*if \(document\.activeElement === closeButton\) void focusRow\('first'\);\s*else closeButton\?\.focus\(\);/);
	// Esc (cancel), the scrim and the close button all return focus to the button, after the modal is gone.
	assert.match(source, /oncancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*close\(true\);/);
	assert.match(source, /if \(event\.target === sheetDialog\) close\(true\);/);
	assert.match(source, /if \(sheetDialog\?\.open\) sheetDialog\.close\(\);\s*open = false;\s*if \(!refocus\) return;\s*const back = opener\?\.isConnected && !menu\?\.contains\(opener\) && !sheetDialog\?\.contains\(opener\) \? opener : trigger;\s*back\?\.focus\(\);/, 'back to where focus was when it opened, else the button');
	assert.match(source, /\.pm-sheet \{\s*position: fixed;\s*inset: auto 0 0 0;/, 'at the bottom of the screen');
	assert.match(source, /\.pm-sheet::backdrop \{\s*background: var\(--orca-scrim/);
	assert.doesNotMatch(source, /pm-scrim/, 'no fake scrim button: the dialog\'s backdrop');
});

test('Esc closes the topmost layer from anywhere: a dialog, then a menu, then the rail opened by hover (Codex W0.1 round 1)', async () => {
	const pop = await readFile(new URL('./shell/PopMenu.svelte', import.meta.url), 'utf8');
	// An open menu listens on the document, so one opened with the pointer closes too, and focus goes back to its button.
	assert.match(pop, /const escape = \(event: KeyboardEvent\) => \{\s*if \(event\.key !== 'Escape' \|\| event\.defaultPrevented\) return;\s*event\.preventDefault\(\);\s*close\(true\);/);
	assert.match(pop, /document\.addEventListener\('keydown', escape\);/);
	assert.match(pop, /document\.removeEventListener\('keydown', escape\);/);
	const source = await readFile(shell, 'utf8');
	const handler = source.slice(source.indexOf('function onShortcut('), source.indexOf('// ไปที่…: the pages'));
	// The shell's document handler leaves dialogs and menus to themselves, then closes an unpinned rail.
	assert.match(handler, /if \(event\.key === "Escape"\) \{\s*if \(event\.defaultPrevented \|\| layerAboveRail\(\)\) return;\s*if \(railControl\.escape\(\)\) event\.preventDefault\(\);/);
	assert.match(source, /function layerAboveRail\(\) \{\s*return jumping \|\| !!drawer\?\.open \|\| !!document\.querySelector\("dialog\[open\]"\) \|\| menuOpen\(\);/);
	// The rail's own Esc (focus inside it) keeps the same order (Codex W0.1 round 2, NOTE 2).
	assert.match(source, /if \(event\.key === "Escape" && !layerAboveRail\(\) && railControl\.escape\(\)\)/);
	assert.match(source, /const menuOpen = \(\) => creating \|\| companyOpen \|\| accountOpen;/);
});

test('the rail never hides the control focus is on: ตั้งค่า pages and the pin hand focus to an icon it keeps (Codex W0.1 round 1)', async () => {
	const source = await readFile(shell, 'utf8');
	assert.match(source, /onchange: \(state\) => \{\s*const closing = rail\.open && !state\.open;[\s\S]*?rail = state;\s*if \(closing\) keepFocusVisible\(\);/, 'on every collapse: Esc, leaving, unpinning');
	assert.match(source, /railFocusTarget\(document\.activeElement as HTMLElement \| null, railElement\)\?\.focus\(\);/);
	// After Esc the tooltip names the control focus is on now.
	assert.match(source, /if \(event\.key === "Escape" && !layerAboveRail\(\) && railControl\.escape\(\)\) \{\s*event\.preventDefault\(\);[^\n]*\n?\s*(?:\/\/[^\n]*\n\s*)?tipFor\(document\.activeElement\);/);
});

test('⌘K from a row of an open menu: the menu closes and ไปที่… returns focus to the menu\'s button (Codex W0.1 round 1)', async () => {
	const source = await readFile(shell, 'utf8');
	assert.match(source, /function leaveMenu\(\) \{\s*const menu = \(document\.activeElement as Element \| null\)\?\.closest\("\.pm"\);\s*const trigger = menu\?\.querySelector<HTMLElement>\(":scope > button"\);\s*menu\?\.querySelector<HTMLDialogElement>\("dialog\[open\]"\)\?\.close\(\);\s*creating = companyOpen = accountOpen = false;\s*trigger\?\.focus\(\);/, 'the phone sheet closes before its button takes focus');
	const handler = source.slice(source.indexOf('function onShortcut('), source.indexOf('// ไปที่…: the pages'));
	assert.match(handler, /if \(isJumpShortcut\(event\)\) \{\s*event\.preventDefault\(\);\s*leaveMenu\(\);\s*closeDrawer\(\);\s*jumping = true;/, 'the button is focused before ไปที่… remembers where to return');
});
