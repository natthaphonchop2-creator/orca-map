import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));
const navigation = await import(await typescriptModuleURL(new URL('../../orca/navigation.ts', import.meta.url)));
const { term } = await import(await typescriptModuleURL(new URL('../../orca/glossary.ts', import.meta.url)));
const { aiConnectionLine } = await import(await typescriptModuleURL(new URL('../../orca/ai-connection.ts', import.meta.url)));
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
		activeNavigationView: navigation.activeNavigationView, platformHref: navigation.platformHref, term, aiConnectionLine,
		aiConnection: { state: 'none' }, memberName: (member) => member.displayName, memberRole: () => 'Member',
		writesInFlight: () => 0, onMount: () => {},
	});
	return { warnings, html: render(Component, { props: { view: 'dashboard', refreshing: false, onrefresh() {}, children: () => {}, ...props } }).body };
}

test('someone in one company sees its name, with no switcher', async () => {
	const { warnings, html } = await renderShell({ data: { ...data, organization: { displayName: 'Company A' } }, companies: [companies[0]], account: '7' });
	assert.deepEqual(warnings, []);
	assert.match(html, /<span title="Company A">Company A<\/span>/);
	assert.doesNotMatch(html, /Switch company/);
	assert.doesNotMatch(html, /org=/);
});

test('someone in several companies can switch from the breadcrumb and the account menu', async () => {
	company.setPageCompany(B, companies);
	try {
		const { html } = await renderShell({ data, companies, account: '7' });
		assert.match(html, /workspace-company-switch/);
		assert.equal(html.match(/Switch company/g)?.length >= 2, true, 'the breadcrumb and the account menu');
		// Each choice opens that company's page afresh; this page's company is
		// marked. The account menu renders in the sidebar and the mobile drawer.
		assert.equal(html.match(/href="\/app\?org=default" data-sveltekit-reload/g)?.length, 3);
		assert.equal(html.match(new RegExp(`href="/app\\?org=${B}" data-sveltekit-reload(?:="")? aria-current="true"`, 'g'))?.length, 3);
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

test('Owners and Admins get six flat items, the pinned Connect my AI, then Settings and Help', async () => {
	const { warnings, html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', pendingApprovals: 2 });
	assert.deepEqual(warnings, []);
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'Programs', 'AI workspaces', 'Knowledge', 'Team', 'Oversight', 'Settings', 'Help']);
	assert.deepEqual(sidebarLinks(html).map((item) => item.href), ['/app', '/app?view=servers', '/app?view=workspaces', '/app?view=knowledge', '/app?view=members', '/app?view=approvals', '/app?view=settings', '/app?view=help']);
	// No group headings, no "Setup" group and no separate "Add a system".
	assert.doesNotMatch(html, /workspace-nav-heading|Setup|Add a system|OAuth apps|Secrets|Sign-in sources|Connect AI to ORCA/);
	assert.match(html, /aria-label="Oversight, 2 waiting"/);
	// The pin sits above Settings, with its state line.
	const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	assert.ok(aside.indexOf('workspace-pin') < aside.indexOf('/app?view=settings'));
	assert.match(aside, /href="\/app\?view=connect-ai"[^>]*aria-label="Connect my AI · Not connected"/);
	assert.match(aside, /<small class="workspace-pin-state[^"]*">Not connected<\/small>/);
	// The account menu: My account, the theme and sign out; no "My accounts", no language.
	assert.match(aside, /href="\/app\?view=settings&amp;section=account"/);
	assert.doesNotMatch(html, /view=accounts|section=preferences/);
	assert.doesNotMatch(aside, /Company \| ORCA platform|workspace-mode/, 'no platform switch for a customer');
});

test('employees get Home, AI workspaces and Knowledge, plus My requests once a workspace holds writes', async () => {
	let { html } = await renderShell({ data, companies: [companies[1]], account: '7' });
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'AI workspaces', 'Knowledge', 'Settings', 'Help']);
	assert.match(html, /workspace-pin/);
	({ html } = await renderShell({ data: { ...data, hubs: [{ id: 'h', status: 'active', writeMode: 'approval' }] }, companies: [companies[1]], account: '7' }));
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Home', 'AI workspaces', 'Knowledge', 'My requests', 'Settings', 'Help']);
	assert.doesNotMatch(html, /view=servers|view=members|view=secrets|workspace-mode/);
});

test('the ORCA team switches between their company and the platform, whose items only they see', async () => {
	const operator = { ...owner, platformOperator: true, canReviewPilotRequests: true };
	let { html } = await renderShell({ data: operator, companies: [companies[0]], account: '7' });
	const aside = () => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
	assert.match(aside(), /class="workspace-mode"/);
	assert.match(aside(), /aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*Company<\/span>/);
	assert.match(aside(), /href="\/app\?org=default&amp;view=platform&amp;section=overview"/);
	assert.deepEqual(sidebarLinks(html).map((item) => item.label).slice(0, 6), ['Home', 'Programs', 'AI workspaces', 'Knowledge', 'Team', 'Oversight']);
	({ html } = await renderShell({ data: operator, companies: [companies[0]], account: '7', view: 'platform', section: 'signin' }));
	assert.deepEqual(sidebarLinks(html).map((item) => item.label), ['Platform overview', 'Customer companies', 'Pilot requests', 'Sign in with Google', 'Program OAuth apps', 'Program catalog', 'Break-glass accounts', 'Settings', 'Help']);
	assert.match(aside(), /aria-current="page"[^>]*class="active"[^>]*>(?:(?!<\/a>)[\s\S])*Sign in with Google/);
	assert.doesNotMatch(aside(), /workspace-pin/, 'the platform has no Connect my AI');
	assert.match(html, /<span title="ORCA platform">ORCA platform<\/span>/);
	// A customer who opens the platform address still sees their company menu.
	({ html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'platform' }));
	assert.doesNotMatch(html, /Customer companies|Break-glass|workspace-mode/);
});

test('the pin says which AI is connected once B1 reports it', async () => {
	const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', aiStatus: { state: 'connected', app: 'Claude' } });
	assert.match(html, /<small class="workspace-pin-state connected">Claude connected<\/small>/);
});

test('sub-pages keep their sidebar item lit', async () => {
	for (const [view, label] of [['add-program', 'Programs'], ['hub', 'AI workspaces'], ['secrets', 'Oversight'], ['audit', 'Oversight']]) {
		const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view });
		const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
		assert.match(aside, new RegExp(`aria-current="page"[^>]*class="active"[^>]*>(?:(?!</a>)[\\s\\S])*${label}</span>`), view);
	}
	const { html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'connect-ai' });
	assert.match(html, /class="workspace-pin active"/);
});

test("an employee's oversight pages are named for them, and My requests lights only on their requests", async () => {
	const requests = { ...data, hubs: [{ id: 'h', status: 'active', writeMode: 'approval' }] };
	const current = (html) => html.match(/<strong class="workspace-current-page"[^>]*>([^<]*)<\/strong>/)?.[1];
	const lit = (html) => {
		const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
		return [...aside.matchAll(/aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*?<span class="workspace-nav-label">([^<]*)<\/span>/g)].map((match) => match[1]);
	};
	let { html } = await renderShell({ data: requests, companies: [companies[1]], account: '7', view: 'approvals' });
	assert.equal(current(html), 'My requests');
	assert.deepEqual(lit(html), ['My requests']);
	({ html } = await renderShell({ data: requests, companies: [companies[1]], account: '7', view: 'executions' }));
	assert.equal(current(html), 'Activity', 'not "Oversight", which employees do not have');
	assert.deepEqual(lit(html), []);
	({ html } = await renderShell({ data, companies: [companies[1]], account: '7', view: 'audit' }));
	assert.equal(current(html), 'Settings history');
	// Owners and Admins keep ตรวจสอบ lit on every oversight tab.
	({ html } = await renderShell({ data: owner, companies: [companies[0]], account: '7', view: 'executions' }));
	assert.equal(current(html), 'Oversight');
	assert.deepEqual(lit(html), ['Oversight']);
});
