import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));
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
		activeNavigationView: (view) => view, memberName: (member) => member.displayName, memberRole: () => 'Member',
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
