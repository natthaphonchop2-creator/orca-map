import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));
const navigation = await import(await typescriptModuleURL(new URL('../../orca/navigation.ts', import.meta.url)));
const { term } = await import(await typescriptModuleURL(new URL('../../orca/glossary.ts', import.meta.url)));
const workspaceNav = await import(await typescriptModuleURL(new URL('../../orca/workspace-nav.ts', import.meta.url)));
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

async function renderShell(props) {
	const { warnings, Component } = await serverComponent(shell, {
		...company, localeHref: (path) => path, t: (_th, en) => en, orcaLocale: { value: 'en' },
		activeNavigationView: navigation.activeNavigationView, platformHref: navigation.platformHref, showsPlatformSwitch: navigation.showsPlatformSwitch, term, hubAsksApproval,
		skillsEnabled: workspaceNav.skillsEnabled, workspaceNavigation: workspaceNav.workspaceNavigation,
		memberName: (member) => member.displayName, memberRole: () => 'Member',
		writesInFlight: () => 0, onMount: () => {},
	});
	return { warnings, html: render(Component, { props: { view: 'dashboard', refreshing: false, onrefresh() {}, children: () => {}, ...props } }).body };
}

test('someone in one company sees its name under the logo, with no switcher', async () => {
	const { warnings, html } = await renderShell({ data: { ...data, organization: { displayName: 'Company A' } }, companies: [companies[0]], account: '7' });
	assert.deepEqual(warnings, []);
	assert.match(html, /<div class="workspace-company">(?:<!--[^>]*-->)*<span class="workspace-company-name" title="Company A">Company A<\/span>/);
	assert.doesNotMatch(html, /Switch company/);
	assert.doesNotMatch(html, /org=/);
});

test('someone in several companies can switch from the company under the logo and the account menu', async () => {
	company.setPageCompany(B, companies);
	try {
		const { html } = await renderShell({ data, companies, account: '7' });
		assert.match(html, /workspace-company-switch/);
		assert.equal(html.match(/Switch company/g)?.length >= 2, true, 'the company block and the account menu');
		// Each choice opens that company's page afresh; this page's company is
		// marked. The sidebar renders twice (the desktop sidebar and the phone
		// drawer), each with the company block and the account menu.
		assert.equal(html.match(/href="\/app\?org=default" data-sveltekit-reload/g)?.length, 4);
		assert.equal(html.match(new RegExp(`href="/app\\?org=${B}" data-sveltekit-reload(?:="")? aria-current="true"`, 'g'))?.length, 4);
		assert.equal(html.match(/class="workspace-company"/g)?.length, 2, 'the sidebar and the drawer name the company');
		assert.doesNotMatch(html, /org=default"[^>]*aria-current/);
	} finally {
		company.setPageCompany('default', []);
	}
});

/** The sidebar's links, once (the mobile drawer repeats the same sidebar). */
function sidebarLinks(html) {
	const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	return [...aside.matchAll(/<a href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?<span class="workspace-nav-label">([^<]*)<\/span>/g)].map(([, href, label]) => ({ href, label }));
}
const owner = { ...data, organization: { displayName: 'Company A' }, canManage: true, members: [{ id: '7', displayName: 'Person 7', email: 'person-7@example.invalid', role: 'owner' }] };

test('Owners and Admins: one flat menu, Workflows greyed as coming soon, then Settings and Help', async () => {
	const { warnings, html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', pendingApprovals: 2 });
	assert.deepEqual(warnings, []);
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'Programs', 'My AI', 'Knowledge', 'History', 'Settings', 'Help']);
	assert.deepEqual(sidebarLinks(html).map((item) => item.href), ['/app', '/app?view=servers', '/app?view=connect-ai', '/app?view=knowledge', '/app?view=approvals', '/app?view=settings', '/app?view=help']);
	// Workflows: shown, greyed and not a link, between Home and Programs.
	const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	assert.match(aside, /<span class="workspace-nav-soon" aria-disabled="true"[^>]*>(?:(?!<\/span>\s*<\/span>)[\s\S])*Workflows<\/span>\s*<small class="workspace-nav-aside">Coming soon<\/small>/);
	assert.ok(aside.indexOf('Workflows') > aside.indexOf('Home</span>') && aside.indexOf('Workflows') < aside.indexOf('Programs</span>'));
	assert.doesNotMatch(aside, /<a [^>]*>(?:(?!<\/a>)[\s\S])*Workflows/);
	// No group headings, no old pinned button and none of the moved pages in the menu.
	assert.doesNotMatch(html, /workspace-nav-heading|workspace-pin|Setup|Add a system|OAuth apps|Secrets|Sign-in sources|Connect AI to ORCA|view=members"|view=workspaces"|Oversight/);
	assert.match(html, /aria-label="History, 2 waiting"/);
	// The account menu: My account, the theme, the language and sign out.
	assert.match(aside, /href="\/app\?view=settings&amp;section=account"/);
	assert.match(aside, /class="workspace-account-language"/);
	assert.doesNotMatch(html, /view=accounts|section=preferences/);
	assert.doesNotMatch(aside, /Company \| ORCA platform|workspace-mode/, 'no platform switch for a customer');
	// The top bar: ไปที่… ⌘K and the one สร้าง button.
	assert.match(html, /class="workspace-jump"[^>]*>(?:(?!<\/button>)[\s\S])*Go to…(?:(?!<\/button>)[\s\S])*<kbd>⌘K<\/kbd>/);
	assert.equal(html.match(/class="k-button primary workspace-create"/g)?.length, 1);
});

test('employees: Home, My AI, Knowledge and History (their own use, or their requests once a workspace holds writes)', async () => {
	let { html } = await renderShell({ data, companies: [companies[1]], account: '7' });
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'My AI', 'Knowledge', 'History', 'Settings', 'Help']);
	assert.equal(sidebarLinks(html).find((item) => item.label === 'History').href, '/app?view=executions');
	assert.doesNotMatch(html, /Workflows|workspace-nav-soon/, 'employees have no Workflows');
	({ html } = await renderShell({ data: { ...data, hubs: [{ id: 'h', status: 'active', writeMode: 'approval' }] }, companies: [companies[1]], account: '7' }));
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'My AI', 'Knowledge', 'History', 'Settings', 'Help']);
	assert.equal(sidebarLinks(html).find((item) => item.label === 'History').href, '/app?view=approvals');
	assert.doesNotMatch(html, /view=servers|view=members|view=secrets|workspace-mode/);
	assert.doesNotMatch(html, /History, \d+ waiting/, 'the waiting count is the managers\'');
	assert.equal(html.match(/class="k-button primary workspace-create"/g)?.length, 1, 'everyone gets สร้าง');
});

test('Skills shows in the menu only when the company bootstrap carries the skills feature', async () => {
	for (const features of [undefined, {}, { skills: false }, { skills: 'yes' }, { libraryV2: true }]) {
		for (const viewer of [owner, data]) {
			const { html } = await renderShell({ data: { ...viewer, features }, companies: [companies[0]], account: '7' });
			assert.doesNotMatch(html, /view=skills|>Skills</, JSON.stringify(features));
		}
	}
	let { html } = await renderShell({ data: { ...owner, features: { skills: true } }, companies: [companies[0]], account: '7' });
	assert.deepEqual(sidebarLinks(html).map((item) => item.label).slice(0, 3), ['Home', 'Skills', 'Programs']);
	({ html } = await renderShell({ data: { ...data, features: { skills: true } }, companies: [companies[1]], account: '7', view: 'skills' }));
	assert.deepEqual(sidebarLinks(html).map((item) => item.label).slice(0, 2), ['Home', 'Skills']);
	assert.match(html, /aria-current="page"[^>]*class="active"[^>]*>(?:(?!<\/a>)[\s\S])*Skills<\/span>/);
});

test('the ORCA team switches between their company and the platform, whose items only they see', async () => {
	const operator = { ...owner, platformOperator: true, canReviewPilotRequests: true };
	let { html } = await renderShell({ data: operator, companies: [companies[0]], account: '7' });
	const aside = () => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	assert.match(aside(), /class="workspace-mode"/);
	assert.match(aside(), /aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*Company<\/span>/);
	assert.match(aside(), /href="\/app\?org=default&amp;view=platform&amp;section=overview"/);
	assert.deepEqual(sidebarLinks(html).map((item) => item.label).slice(0, 5), ['Home', 'Programs', 'My AI', 'Knowledge', 'History']);
	({ html } = await renderShell({ data: operator, companies: [companies[0]], account: '7', view: 'platform', section: 'signin' }));
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Platform overview', 'Customer companies', 'Pilot requests', 'Sign in with Google', 'Program OAuth apps', 'Program catalog', 'Break-glass accounts', 'Settings', 'Help']);
	assert.match(aside(), /aria-current="page"[^>]*class="active"[^>]*>(?:(?!<\/a>)[\s\S])*Sign in with Google/);
	assert.doesNotMatch(aside(), /view=connect-ai|Workflows/, 'the platform has no company menu');
	assert.match(html, /<span class="workspace-company-name" title="ORCA platform">ORCA platform<\/span>/);
	// The same shell, without สร้าง.
	assert.doesNotMatch(html, /workspace-create/);
	assert.match(html, /class="workspace-jump"/);
	// A customer who opens the platform address still sees their company menu.
	({ html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'platform' }));
	assert.doesNotMatch(html, /Customer companies|Break-glass|workspace-mode/);
});

test('the platform switch follows the account-level operator flag in every company; customers never see it', async () => {
	const aside = (html) => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	company.setPageCompany(B, companies);
	try {
		// The operator opens Company B, where they are an employee: B's bootstrap
		// says platformOperator false (not a manager there) and platformOperatorAccount true.
		const inB = { ...data, platformOperator: false, platformOperatorAccount: true };
		let { warnings, html } = await renderShell({ data: inB, companies, account: '7' });
		assert.deepEqual(warnings, []);
		assert.match(aside(html), /class="workspace-mode"/);
		assert.match(aside(html), /aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*Company<\/span>/, 'Company B stays chosen');
		// The platform always opens the default company, as a new page.
		assert.match(aside(html), /href="\/app\?org=default&amp;view=platform&amp;section=overview" data-sveltekit-reload/);
		assert.equal(html.match(/view=platform&amp;section=overview/g)?.length, 2, 'the sidebar and the phone drawer');
		assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'My AI', 'Knowledge', 'History', 'Settings', 'Help'], "B's own menu for an employee");
		// The flag alone never shows the platform's pages: they need the default company's flag.
		({ html } = await renderShell({ data: inB, companies, account: '7', view: 'platform', section: 'breakglass' }));
		assert.doesNotMatch(html, /Customer companies|Break-glass|Platform overview/);
		assert.match(aside(html), /view=connect-ai/);
		// As an admin of Company B, the same switch beside B's manager menu.
		({ html } = await renderShell({ data: { ...owner, organization: { displayName: 'Company B' }, platformOperator: false, platformOperatorAccount: true }, companies, account: '7' }));
		assert.match(aside(html), /class="workspace-mode"/);
		assert.deepEqual(sidebarLinks(html).map((item) => item.label).slice(0, 5), ['Home', 'Programs', 'My AI', 'Knowledge', 'History']);
	} finally {
		company.setPageCompany('default', []);
	}
	// Customers: an owner, an admin or an employee of their own company, never the pinned operator.
	for (const customer of [
		owner,
		{ ...owner, platformOperator: false, platformOperatorAccount: false },
		{ ...data, platformOperator: false, platformOperatorAccount: false },
		{ ...owner, platformOperatorAccount: 'yes' },
		{ ...owner, platformOperatorAccount: 1 }
	]) {
		for (const view of ['dashboard', 'platform']) {
			const { html } = await renderShell({ data: customer, companies: [companies[0]], account: '7', view });
			assert.doesNotMatch(html, /workspace-mode|view=platform|ORCA platform|Customer companies|Break-glass/, `${JSON.stringify(customer.platformOperatorAccount)} ${view}`);
		}
	}
	// An older server without the account flag: the operator's own company still shows it.
	const { html } = await renderShell({ data: { ...owner, platformOperator: true }, companies: [companies[0]], account: '7' });
	assert.match(aside(html), /class="workspace-mode"/);
	assert.equal(navigation.showsPlatformSwitch(undefined), false);
	assert.equal(navigation.showsPlatformSwitch({ platformOperator: false, platformOperatorAccount: true }), true);
	assert.equal(navigation.showsPlatformSwitch({ platformOperator: false }), false);
});

test('AI ของฉัน is an ordinary menu item; its state lives on its page and Home, never claimed before B1 answers', async () => {
	const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7' });
	const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	assert.match(aside, /<a href="\/app\?view=connect-ai"[^>]*aria-label="My AI"/);
	assert.doesNotMatch(aside, /workspace-pin|Not connected/);
	// The store still starts unknown, so nothing is claimed before B1 answers.
	const store = await readFile(new URL('../../orca/ai-connection.svelte.ts', import.meta.url), 'utf8');
	assert.match(store, /\$state<AIConnectionStatus & \{ disconnected: boolean \}>\(\{ state: 'unknown', disconnected: false \}\)/);
});

test('sub-pages keep their sidebar item lit: pages that moved light their new home', async () => {
	for (const [view, label] of [
		['add-program', 'Programs'], ['servers', 'Programs'], ['hub', 'Settings'], ['new', 'Settings'], ['workspaces', 'Settings'], ['members', 'Settings'],
		['secrets', 'My AI'], ['connect-ai', 'My AI'], ['audit', 'History'], ['executions', 'History'], ['approvals', 'History'], ['welcome', 'Home']
	]) {
		const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view });
		const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
		assert.match(aside, new RegExp(`aria-current="page"[^>]*class="active"[^>]*>(?:(?!</a>)[\\s\\S])*${label}</span>`), view);
	}
});

test("an employee's history pages light History, whichever tab", async () => {
	const requests = { ...data, hubs: [{ id: 'h', status: 'active', writeMode: 'approval' }] };
	const lit = (html) => {
		const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
		return [...aside.matchAll(/aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*?<span class="workspace-nav-label">([^<]*)<\/span>/g)].map((match) => match[1]);
	};
	for (const view of ['approvals', 'executions', 'audit']) {
		const { html } = await renderShell({ data: requests, companies: [companies[1]], account: '7', view });
		assert.deepEqual(lit(html), ['History'], view);
	}
	// LINE's writes wait for a manager even in a workspace that runs at once (design §14l).
	const line = { ...data, connections: [{ id: 'c-line', mcpID: 'default-orca-api-line-messaging' }], hubs: [{ id: 'h', status: 'active', writeMode: 'direct', sources: [{ connectionID: 'c-line', toolNames: ['line_push_text'] }] }] };
	let { html } = await renderShell({ data: line, companies: [companies[1]], account: '7', view: 'approvals' });
	assert.equal(sidebarLinks(html).find((item) => item.label === 'History').href, '/app?view=approvals');
	({ html } = await renderShell({ data: { ...line, hubs: [{ ...line.hubs[0], sources: [{ connectionID: 'c-line', toolNames: ['line_profile_get'] }] }] }, companies: [companies[1]], account: '7', view: 'dashboard' }));
	assert.equal(sidebarLinks(html).find((item) => item.label === 'History').href, '/app?view=executions', 'reads alone never wait');
});

test('W0 rules in the shell: the active item is grey with a citron dot, and nothing on the menu or buttons moves', async () => {
	const css = await readFile(new URL('./w0.css', import.meta.url), 'utf8');
	const active = css.slice(css.indexOf('.workspace-nav a.active {'), css.indexOf('}', css.indexOf('.workspace-nav a.active {')));
	assert.match(active, /background: var\(--orca-secondary\)/);
	assert.doesNotMatch(active, /citron/);
	assert.match(css, /\.workspace-nav a\.active::after \{[^}]*background: var\(--orca-citron\)/);
	assert.match(css, /:is\(\.workspace-nav a, [^)]*\.k-button[^)]*\) \{\s*transition: none;/);
	assert.match(css, /\.orca-w0 h1 \{\s*font-size: 24px;/);
	assert.match(css, /@media \(max-width: 720px\) \{\s*\.orca-workspace\.orca-app\.orca-w0 h1 \{\s*font-size: 20px;/);
	assert.match(css, /\.orca-workspace\.orca-app\.orca-w0 \{\s*font-size: 14px;/);
});

test('the สร้าง dialog: plain line icons without tiles, hairlines between rows, a chevron, and Workflow greyed', async () => {
	const modal = (_renderer, props) => props.children?.(_renderer);
	const { warnings, Component } = await serverComponent(new URL('./shell/CreateDialog.svelte', import.meta.url), {
		term, t: (_th, en) => en, localeHref: (path) => path, createOptions: workspaceNav.createOptions, Modal: modal
	});
	assert.deepEqual(warnings, []);
	let html = render(Component, { props: { open: true, canManage: true, skills: true } }).body;
	const rows = [...html.matchAll(/<strong[^>]*>([^<]*)<\/strong>/g)].map((match) => match[1]);
	assert.deepEqual(rows, ['Skill', 'Workflow', 'Connect AI', 'Add knowledge']);
	assert.match(html, /<div class="create-option off[^"]*" aria-disabled="true">(?:(?!<\/div>)[\s\S])*Workflow(?:(?!<\/div>)[\s\S])*<span class="create-later[^"]*">Coming soon<\/span>/);
	assert.match(html, /<a class="create-option[^"]*" href="\/app\?view=knowledge&amp;kind=knowledge&amp;create=1" data-create="knowledge"/);
	html = render(Component, { props: { open: true, canManage: false, skills: true } }).body;
	assert.deepEqual([...html.matchAll(/<strong[^>]*>([^<]*)<\/strong>/g)].map((match) => match[1]), ['Connect AI', 'Add knowledge']);
	const source = await readFile(new URL('./shell/CreateDialog.svelte', import.meta.url), 'utf8');
	const css = source.slice(source.indexOf('<style>'));
	assert.match(css, /\.create-options li \+ li \{\s*border-top: 1px solid var\(--orca-line\);/, 'hairlines, not cards');
	assert.match(css, /\.create-option > :global\(svg:first-child\) \{\s*flex: none;\s*color: var\(--orca-subtle\);/, 'an 18px line icon in --subtle');
	assert.match(source, /<row\.icon size=\{18\}/);
	assert.doesNotMatch(css, /opt-icon|border-radius: var\(--orca-radius-lg\)|transition/);
	const modalSource = await readFile(new URL('./ui/Modal.svelte', import.meta.url), 'utf8');
	const phone = modalSource.slice(modalSource.indexOf('@media (max-width: 720px)'));
	assert.match(phone, /max-height: 92dvh;/, 'a bottom sheet on a phone');
	assert.match(phone, /margin: auto 0 0;/, 'at the bottom');
	assert.doesNotMatch(modalSource, /transition|animation/);
});
