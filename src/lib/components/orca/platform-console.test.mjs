// The platform console's PC1 screens (C6): a customer company's own page for
// the ORCA team, the page a suspended company's people see, the chooser's
// status, and how a company's history shows ORCA's looks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const consoleHelpers = await import(await typescriptModuleURL(new URL('../../orca/platform-console.ts', import.meta.url)));
const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));
const glossary = await import(await typescriptModuleURL(new URL('../../orca/glossary.ts', import.meta.url)));
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'org-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const en = (_th, english) => english;

const files = {
	detail: new URL('./platform/PlatformCompanyDetail.svelte', import.meta.url),
	view: new URL('./views/PlatformView.svelte', import.meta.url),
	companies: new URL('./PlatformCompanies.svelte', import.meta.url),
	gate: new URL('./CompanyGate.svelte', import.meta.url),
	audit: new URL('./Audit.svelte', import.meta.url),
	shell: new URL('./AppShell.svelte', import.meta.url),
	page: new URL('../../../routes/app/+page.svelte', import.meta.url),
	invite: new URL('../../../routes/invite/[token]/+page.svelte', import.meta.url),
};
const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, url]) => [name, await readFile(url, 'utf8')])));

test('the company page compiles without warnings and opens on its overview', async () => {
	assert.deepEqual(compile(source.detail, { filename: 'PlatformCompanyDetail.svelte', generate: 'client' }).warnings.map((w) => `${w.code}: ${w.message}`), []);
	const header = [];
	const PageHeader = (renderer, props) => {
		header.push(props);
		renderer.push(`<h1>${props.title}</h1><p>${props.subtitle}</p>`);
	};
	const { Component } = await serverComponent(files.detail, { ...consoleHelpers, t: en, localeHref: (path) => path, platformHref: (section) => `/app?section=${section}`, PageHeader, OrcaService: {}, displayDate: (value) => value ?? '—' });
	for (const tab of consoleHelpers.DETAIL_TABS) {
		const html = render(Component, { props: { companyID: B, tab } }).body;
		assert.match(html, /ORCA sees this, and records that it looked/, 'every header says ORCA looked');
		for (const label of ['Overview', 'Customer profile', 'Members', 'Manage company']) assert.match(html, new RegExp(label));
		assert.match(html, new RegExp(`aria-current="page"[^>]*>|href="[^"]*${tab === 'overview' ? `company=${B}"` : `tab=${tab}`}`));
	}
	assert.equal(header[0].back.href, '/app?section=companies');
});

test('each tab is one look, loaded only when it is opened', () => {
	// The header reads the company list, which writes the platform's log only.
	assert.match(source.detail, /const items = await OrcaService\.platformCompanies\(\);/);
	assert.match(source.detail, /if \(tab === "overview"\) overview = await OrcaService\.platformCompany\(companyID\);\s*else if \(tab === "members"\) members = await OrcaService\.platformCompanyMembers\(companyID\);\s*else if \(tab === "profile"\) fillProfile\(await OrcaService\.platformCompanyProfile\(companyID\)\);/);
	// A new tab mounts the page afresh.
	assert.match(source.view, /\{#key `\$\{companyID\}:\$\{companyTab\}`\}<PlatformCompanyDetail \{companyID\} tab=\{detailTab\(companyTab\)\} \{onchanged\} \/>\{\/key\}/);
	assert.match(source.page, /companyID=\{navigation\.params\.get\("company"\) \?\? ""\}/);
});

test('suspending and restoring are confirmed with the company named; ORCA\'s own company has neither', () => {
	assert.match(source.detail, /<ConfirmDialog[\s\S]*?t\(`ระงับการใช้งาน \$\{company\?\.displayName \?\? ""\}\?`/);
	assert.match(source.detail, /tone=\{confirming === "suspend" \? "danger" : "default"\}/);
	assert.match(source.detail, /await OrcaService\.suspendCompany\(company\.id, company\.version \?\? 0\)/);
	assert.match(source.detail, /await OrcaService\.restoreCompany\(company\.id, company\.version \?\? 0\)/);
	assert.match(source.detail, /\{#if own\}[\s\S]*?ระงับหรือเปลี่ยนชื่อจากหน้านี้ไม่ได้/);
	// The confirmation warns that the people see only that it is suspended.
	assert.match(source.detail, /คนในบริษัทเห็นเพียงข้อความว่าถูกระงับ จดเหตุผลไว้ในข้อมูลลูกค้า/);
});

test('the private fields are sent only when edited, never without a key (P10)', () => {
	assert.match(source.detail, /\.\.\.\(privateEdited && !privateOff \? \{ sensitive: privateFields \} : \{\}\)/);
	assert.match(source.detail, /<fieldset disabled=\{saving \|\| privateOff\}>/);
	// Writing and reading are told apart (Codex PC1 review 1 MINOR 6): the
	// fields close when the server can't write them, whatever reading found,
	// and the message names that cause.
	assert.match(source.detail, /const privateState = \$derived\(privateFieldsState\(profile\)\);\s*const privateOff = \$derived\(!privateState\.writable\);/);
	assert.match(source.detail, /\{#if privateState\.cause === "no-key"\}\s*<p class="detail-note" role="status">\{t\("ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสบนเซิร์ฟเวอร์/);
	assert.match(source.detail, /\{:else if privateState\.cause === "unreadable"\}/);
	assert.doesNotMatch(source.detail, /sensitiveState === "off"/);
	// A save the server refuses for no key says so, and reads the profile again.
	assert.match(source.detail, /if \(encryptionOffRefusal\(refused\.status, refused\.message\)\) \{[\s\S]*?ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสบนเซิร์ฟเวอร์[\s\S]*?void loadTab\(\);/);
});

test('the list opens each company and says its status in words, never a pill', () => {
	assert.match(source.companies, /<a class="company-open" href=\{localeHref\(platformCompanyHref\(company\.id\)\)\}>/);
	assert.match(source.companies, /\{#if companyStatus\(company\.status\) !== "active"\}<small class="company-stopped">\{companyStatusNote\(companyStatus\(company\.status\), t\)\}<\/small>\{\/if\}/);
	assert.doesNotMatch(source.detail, /StatusPill/);
});

const gateDeps = { ...consoleHelpers, companyHref: company.companyHref, rememberCompany: company.rememberCompany, term: glossary.term, localeHref: (path) => path, t: en, orcaLocale: { value: 'en' }, page: { data: { profile: { email: 'staff@b.example' } } } };

test("a suspended company's people see only the fixed message, and their other companies (P5)", async () => {
	const { warnings, Component } = await serverComponent(files.gate, gateDeps);
	assert.deepEqual(warnings, []);
	const companies = [
		{ id: B, displayName: 'Company B', role: 'employee', canManage: false, status: 'suspended' },
		{ id: C, displayName: 'Company C', role: 'owner', canManage: true, status: 'active' },
	];
	let html = render(Component, { props: { mode: 'stopped', stopped: 'suspended', current: B, account: '7', companies } }).body;
	assert.match(html, /This company is suspended for now\. Please contact ORCA\./);
	assert.match(html, /Open one of your other companies instead/);
	assert.match(html, new RegExp(`href="/app\\?org=${C}"`));
	assert.doesNotMatch(html, new RegExp(`href="/app\\?org=${B}"`), 'not the stopped company again');
	html = render(Component, { props: { mode: 'stopped', stopped: 'closed', current: B, account: '7', companies: companies.slice(0, 1) } }).body;
	assert.match(html, /This company is closed\./);
	assert.match(html, /Sign out/);
	// The chooser shows the status beside the role.
	html = render(Component, { props: { mode: 'choose', account: '7', companies } }).body;
	assert.match(html, /Company B[\s\S]*Employee[\s\S]*Suspended[\s\S]*Company C/);
	assert.doesNotMatch(html.slice(html.indexOf('Company C')), /Suspended/);
});

test('the page opens the stopped gate from the list or from a 423, and never retries', () => {
	assert.match(source.page, /const stopped = \$derived\(refusedStatus \?\? \(listedStatus === "active" \? undefined : listedStatus\)\);/);
	assert.match(source.page, /: stopped \? "stopped"/);
	assert.match(source.page, /const refused = stoppedFromRefusal\(parsed\.status, parsed\.message\);\s*if \(refused\) refusedStatus = refused;/);
	assert.match(source.page, /<CompanyGate mode=\{gate\} \{companies\} account=\{route\.account\} \{stopped\}/);
	// The switcher says it too.
	assert.match(source.shell, /\{#if companyStatus\(choice\.status\) !== "active"\}<small class="workspace-company-stopped"/);
	// And it never shows an old status (Codex PC1 review 1, MINOR 7): every
	// refresh reads the list again, ORCA's changes to a company refresh, and
	// the list read last decides the gate and the switcher.
	assert.match(source.page, /async function refresh\(\) \{\s*const request = \+\+refreshGeneration;\s*refreshing = true;\s*error = "";\s*void refreshCompanies\(\);/);
	assert.match(source.page, /const items = await OrcaService\.companies\(\);\s*if \(request === companiesGeneration\) liveCompanies = items;/);
	assert.match(source.page, /companyStatus\(listedCompanies\?\.find\(/);
	assert.match(source.page, /const companies = \$derived\([^\n]*\(listedCompanies \?\? \[\]\)/);
	assert.match(source.view, /<PlatformCompanyDetail \{companyID\} tab=\{detailTab\(companyTab\)\} \{onchanged\} \/>/);
	assert.equal(source.detail.match(/void onchanged\?\.\(\);/g)?.length, 2, 'after a suspend or restore, and after a rename');
	// An invitation into a suspended company waits, and says why.
	assert.match(source.invite, /\{#if preview\.companyStatus\}[\s\S]*?stoppedMessage\(preview\.companyStatus, t\)[\s\S]*?\{:else if data\.signedIn\}/);
});

test("a company's history names ORCA's looks, grouped in the display only (P6)", () => {
	assert.match(source.audit, /const pagination = \$derived\(auditPage\(groupPlatformViews\(visibleEvents\), pageNumber, pageSize\)\);/);
	assert.match(source.audit, /const platform = platformAuditLabel\(event, t\);/);
	assert.match(source.audit, /"platform\.view": t\("ORCA ดูข้อมูลบริษัท"/);
});

test('"เปลี่ยนชื่อ" is disabled until the trimmed name differs, and sends nothing otherwise', () => {
	assert.match(source.detail, /const canRename = \$derived\(renameReady\(newName, company\?\.displayName\)\);/);
	assert.match(source.detail, /<button type="submit" class="k-button" disabled=\{changing \|\| !canRename\}>\{t\("เปลี่ยนชื่อ", "Rename"\)\}<\/button>/);
	assert.match(source.detail, /if \(!renameReady\(name, company\.displayName\)\) return;\s*changing = true;/);
});
