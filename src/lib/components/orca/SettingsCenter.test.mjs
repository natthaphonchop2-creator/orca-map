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

// W0: ตั้งค่า's header and tabs come from SettingsFrame (real), with ทีม and พื้นที่ทำงาน AI.
const PageTabs = (await serverComponent(new URL('./ui/PageTabs.svelte', import.meta.url), { localeHref: (url) => url })).Component;
const frame = await serverComponent(new URL('./views/SettingsFrame.svelte', import.meta.url), {
	...sections, term, t: (_th, en) => en, localeHref: (url) => url, onMount: () => {}, currentCompany: () => 'default',
	PageTabs, PageHeader: (renderer, props) => renderer.push(`<h1>${props.title}</h1>`), claimPageHeader: () => {}
});
assert.deepEqual(frame.warnings, []);

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
		SettingsFrame: frame.Component,
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
	// ทีม and พื้นที่ทำงาน AI are tabs here, at their own addresses.
	assert.deepEqual([...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)/g)].map(([, href, label]) => `${label} ${href}`), [
		'Company /app?view=settings&amp;section=company', 'Team /app?view=members', 'AI workspaces /app?view=workspaces', 'My account /app?view=settings&amp;section=account'
	]);
	assert.equal(html.match(/<h1>/g)?.length, 1);
});

test('บัญชีของฉัน holds the theme once; the language is in the account menu (W0)', async () => {
	for (const data of [owner, member]) {
		const { html, mounted } = await screen('account', data);
		assert.deepEqual(mounted, ['ThemeSetting']);
		assert.match(html, /in the account menu/);
		assert.doesNotMatch(html, /Display language/);
	}
});

test('members see only their own account, whatever section the address names', async () => {
	for (const section of ['', 'company', 'advanced', 'account', 'unknown']) {
		const { html, mounted } = await screen(section, member);
		assert.deepEqual(mounted, ['ThemeSetting'], section);
		assert.doesNotMatch(html, /settings-tabs|section=company|section=advanced|view=members/, section);
		// Their own workspaces and their account.
		assert.match(html, /href="\/app\?view=workspaces"[^>]*>AI workspaces</, section);
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

test('W0: the settings tabs by role, and ขั้นสูง only once the company has a sign-in source', () => {
	assert.deepEqual(sections.settingsTabs(true, 'unknown'), ['company', 'team', 'workspaces', 'account']);
	assert.deepEqual(sections.settingsTabs(true, 'none'), ['company', 'team', 'workspaces', 'account']);
	assert.deepEqual(sections.settingsTabs(true, 'some'), ['company', 'team', 'workspaces', 'account', 'advanced']);
	assert.deepEqual(sections.settingsTabs(true, 'error'), ['company', 'team', 'workspaces', 'account', 'advanced']);
	assert.deepEqual(sections.settingsTabs(false, 'some'), ['workspaces', 'account'], 'never ทีม, บริษัท or ขั้นสูง for an employee');
	assert.equal(sections.SETTINGS_TAB_HREF.team, '/app?view=members');
	assert.equal(sections.SETTINGS_TAB_HREF.workspaces, '/app?view=workspaces');
});

test('W0: ทีม and พื้นที่ทำงาน AI open inside the ตั้งค่า frame, with their own page and role checks', async () => {
	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{:else if view === "members"\}<SettingsFrame \{data\} current="team"><TeamView \{data\} onchanged=\{refresh\} \/><\/SettingsFrame>/);
	assert.match(page, /\{:else if view === "workspaces"\}<SettingsFrame \{data\} current="workspaces"><AppOverview data=\{managementData!\} onchanged=\{refresh\} \/><\/SettingsFrame>/);
	const frameSource = await readFile(new URL('./views/SettingsFrame.svelte', import.meta.url), 'utf8');
	assert.match(frameSource, /claimPageHeader\(\);/, 'their own headers become sub-headers: one H1');
	assert.match(frameSource, /if \(given !== undefined \|\| !data\.canManage\) return;/, 'employees never read sign-in sources');
});
