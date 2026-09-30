import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { typescriptModuleURL } from './test-import.mjs';

// Every OrcaService call, made with stand-in arguments, for "default" and for
// another company: company calls go to that company's path, and account and
// platform calls never do.
const code = stripTypeScriptTypes(await readFile(new URL('../services/orca.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export /gm, '');
const companyURL = await typescriptModuleURL(new URL('./company.ts', import.meta.url));
const supportURL = await typescriptModuleURL(new URL('./support.ts', import.meta.url));
const { service, setPageCompany } = await import('data:text/javascript;base64,' + Buffer.from(`import { orcaPath, setPageCompany } from ${JSON.stringify(companyURL)};
import { ORCA_SUPPORT_LINE_ID } from ${JSON.stringify(supportURL)};
export { setPageCompany };
export function service(stubs) {
	const { doDelete, doGet, doPatch, doPost, doPut, doWithBody, parseErrorContent, t, orcaLocale } = stubs;
	${code};
	return OrcaService;
}`).toString('base64'));

const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Account and platform calls: never a company's path.
const accountLevel = new Set([
	'previewInvitation', 'acceptInvitation', 'companies', 'googleSignIn', 'saveGoogleSignIn', 'signInMethods',
	'requestPilot', 'listPilotRequests', 'updatePilotRequest', 'localUsers', 'authProviders', 'createLocalUser',
	'resetLocalPassword', 'createRemoteEntry', 'configureSourceOAuthClient', 'removeSourceOAuthClient',
	'platformCompanies', 'openCompany', 'inviteCompanyOwner', 'revokeCompanyOwnerInvitation',
]);

async function paths(company) {
	const calls = [];
	const record = (method) => async (path) => { calls.push({ method, path }); return { items: [], tools: [] }; };
	const orca = service({
		doGet: record('GET'), doPost: record('POST'), doPut: record('PUT'), doPatch: record('PATCH'), doDelete: record('DELETE'),
		doWithBody: async (method, path) => { calls.push({ method, path }); return {}; },
		parseErrorContent: () => ({}), t: (_th, en) => en, orcaLocale: { value: 'en' },
	});
	setPageCompany(company, company === 'default' ? [] : [{ id: company }]);
	const result = {};
	try {
		for (const [name, call] of Object.entries(orca)) {
			if (typeof call !== 'function') continue;
			calls.length = 0;
			await call.call(orca, 'id-1', 'name', 1, 'x');
			result[name] = calls.map((item) => item.path);
		}
	} finally {
		setPageCompany('default', []);
	}
	return result;
}

test('another company\'s calls go to its own path; account and platform calls never do', async () => {
	const byName = await paths(B);
	const names = Object.keys(byName);
	assert.ok(names.length > 40, 'every call was made');
	for (const name of names) {
		assert.ok(byName[name].length > 0, `${name} made a request`);
		for (const path of byName[name]) {
			if (accountLevel.has(name)) assert.doesNotMatch(path, /\/orgs\//, name);
			else assert.ok(path.startsWith(`/orca/orgs/${B}/`), `${name}: ${path}`);
		}
	}
	for (const name of accountLevel) assert.ok(name in byName, `${name} still exists`);
});

test('"default" keeps every legacy path', async () => {
	const byName = await paths('default');
	for (const [name, list] of Object.entries(byName)) {
		for (const path of list) assert.doesNotMatch(path, /\/orgs\//, `${name}: ${path}`);
	}
	assert.deepEqual(byName.bootstrap, ['/orca/bootstrap']);
	assert.deepEqual(byName.audit, ['/orca/audit?hubID=id-1']);
	assert.deepEqual(byName.approvals, ['/orca/approvals?status=id-1&mine=1']);
	assert.deepEqual(byName.companies, ['/orca/companies']);
	assert.deepEqual(byName.platformCompanies, ['/orca/platform/companies']);
	assert.deepEqual(byName.openCompany, ['/orca/platform/companies']);
	assert.deepEqual(byName.inviteCompanyOwner, ['/orca/platform/companies/id-1/owner-invitations']);
	assert.deepEqual(byName.revokeCompanyOwnerInvitation, ['/orca/platform/companies/id-1/owner-invitations/name/revoke']);
});

// The library service: every call for "default" and for another company.
const libraryCode = stripTypeScriptTypes(await readFile(new URL('../services/orca-library.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export /gm, '');
const { library } = await import('data:text/javascript;base64,' + Buffer.from(`import { orcaPath } from ${JSON.stringify(companyURL)};
export function library(doGet, doPost, doPut) {
	${libraryCode};
	return OrcaLibraryService;
}`).toString('base64'));

async function libraryPaths(company) {
	const calls = [];
	const record = async (path) => { calls.push(path); return { items: [], departments: [], knowledge: [] }; };
	const service = library(record, record, record);
	setPageCompany(company, company === 'default' ? [] : [{ id: company }]);
	const result = {};
	try {
		for (const [name, call] of Object.entries(service)) {
			if (typeof call !== 'function') continue;
			calls.length = 0;
			await call.call(service, 'id-1', { title: 'x', memberIDs: [], unitIDs: [], parameters: [], knowledgeIDs: [] }, 'x');
			result[name] = [...calls];
		}
	} finally {
		setPageCompany('default', []);
	}
	return result;
}

test('the library, departments included, uses the page\'s company', async () => {
	const inB = await libraryPaths(B);
	const names = Object.keys(inB);
	assert.ok(names.includes('departments'), 'the department list is covered');
	for (const name of names) {
		assert.ok(inB[name].length > 0, `${name} made a request`);
		for (const path of inB[name]) assert.ok(path.startsWith(`/orca/orgs/${B}/`), `${name}: ${path}`);
	}
	const inDefault = await libraryPaths('default');
	for (const [name, list] of Object.entries(inDefault)) {
		for (const path of list) assert.ok(path.startsWith('/orca/') && !path.includes('/orgs/'), `${name}: ${path}`);
	}
	assert.deepEqual(inDefault.departments, ['/orca/library/departments']);
});
