import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const sections = await importTypeScript(new URL('../../orca/settings-sections.ts', import.meta.url));
const { term } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const file = new URL('./SettingsCenter.svelte', import.meta.url);
const source = await readFile(file, 'utf8');

async function screen(section, data) {
	const mounted = [];
	const child = (name) => (renderer, props) => {
		mounted.push({ name, props });
		renderer.push(`<div data-child="${name}"></div>`);
	};
	const { warnings, Component } = await serverComponent(file, {
		...sections,
		term,
		page: { url: new URL(`https://orca.example/app?view=settings${section ? `&section=${section}` : ''}`) },
		localeHref: (url) => url,
		t: (_th, en) => en,
		goto: () => {},
		onMount: () => {},
		memberName: (member) => member.displayName,
		memberRole: () => 'Company owner',
		OrganizationSettings: child('OrganizationSettings'),
		ThemeSetting: child('ThemeSetting'),
		UserSources: child('UserSources'),
		PageHeader: (renderer, props) => renderer.push(`<h1>${props.title}</h1>`),
	});
	const html = render(Component, { props: { data: { members: [], ...data }, onchanged: async () => {} } }).body;
	return { warnings, html, mounted: mounted.map((item) => item.name), props: mounted };
}

const owner = { currentUserID: '1', canManage: true, members: [{ id: '1', displayName: 'Owner', email: 'owner@example.invalid', role: 'owner' }] };
const member = { currentUserID: '2', canManage: false, members: [{ id: '2', displayName: 'Member', email: 'member@example.invalid', role: 'employee' }] };

test('Owners and Admins get บริษัท first, with the company editor embedded and no language duplicate', async () => {
	const { warnings, html, mounted, props } = await screen('', owner);
	assert.deepEqual(warnings, []);
	assert.match(html, /aria-current="page"[^>]*>Company</);
	assert.match(html, /section=account[^>]*>My account</);
	assert.deepEqual(mounted, ['OrganizationSettings']);
	assert.equal(props[0].props.embedded, true);
	assert.doesNotMatch(html, /Display language|Advanced/);
});

test('บัญชีของฉัน holds the theme once; the language stays in the top bar', async () => {
	for (const data of [owner, member]) {
		const { html, mounted } = await screen('account', data);
		assert.deepEqual(mounted, ['ThemeSetting']);
		assert.match(html, /at the top right/);
		assert.doesNotMatch(html, /Display language/);
	}
});

test('members see only their own account, whatever section the address names', async () => {
	for (const section of ['', 'company', 'advanced', 'account', 'unknown']) {
		const { html, mounted } = await screen(section, member);
		assert.deepEqual(mounted, ['ThemeSetting'], section);
		assert.doesNotMatch(html, /settings-tabs|section=company|section=advanced/, section);
	}
});

test('ขั้นสูง opens the company SSO for managers while the list loads, never for members', async () => {
	assert.deepEqual((await screen('advanced', owner)).mounted, ['UserSources']);
	assert.deepEqual((await screen('advanced', member)).mounted, ['ThemeSetting']);
});

test('platform, connect-AI and pilot pages are not part of Settings any more', () => {
	for (const name of ['PlatformCompanies', 'PilotInbox', 'OrcaMCPAccess', 'LocaleSwitch', 'GoogleSignInSettings', 'OAuthApps']) {
		assert.doesNotMatch(source, new RegExp(`import ${name}\\b`), name);
	}
});

test('Settings › บริษัท lost the unit editor and the one-organization sentence', async () => {
	const organization = await readFile(new URL('./OrganizationSettings.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(organization, /องค์กรเดียว|one organization/);
	assert.doesNotMatch(organization, /OrcaService\.unit\(|saveUnit|editUnit/);
	assert.match(organization, /view=members&tab=departments/);
	const userSources = await readFile(new URL('./UserSources.svelte', import.meta.url), 'utf8');
	assert.doesNotMatch(userSources, /GoogleSignInSettings/, 'Google sign-in is the platform\'s, never a company setting');
});
