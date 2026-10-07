// Generated documents meet their company's suspension (platform console C6
// §4.2, as the library's originals after Codex PC1 review 2 MAJOR 2). ดาวน์โหลด
// and ตรวจเอกสาร go through the real services/http.ts and the real document
// service, so a 423 stops the page (company-stop), which opens the suspended
// page; nothing more of the company goes out. Its own file: the stop lasts
// for the page's life.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { typescriptModuleURL } from '../../orca/test-import.mjs';

const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'org-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FILE = '0123456789abcdef0123456789abcdef';
const stopURL = await typescriptModuleURL(new URL('../../orca/company-stop.ts', import.meta.url));
const companyURL = await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url));
const stops = await import(stopURL);
const company = await import(companyURL);

// The real services/http.ts, its store imports stubbed (as company-stop-download.test.mjs).
const writesURL = await typescriptModuleURL(new URL('../../services/writes.ts', import.meta.url));
const httpCode = stripTypeScriptTypes(await readFile(new URL('../../services/http.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export \{[^}]*\};?$/gm, '')
	.replace(/^export /gm, '')
	.replaceAll('import.meta.env.VITE_API_TARGET', 'undefined');
const { http } = await import('data:text/javascript;base64,' + Buffer.from(`import { companyStop, stoppedCode } from ${JSON.stringify(stopURL)};
import { accountHeaders, counted, orcaAccountChanged, pageAccountOr, reloadForAccount, writesInFlight } from ${JSON.stringify(writesURL)};
export function http(deps) {
	const { UNAUTHORIZED_PATHS, UNAUTHORIZED_PATH_PREFIXES, createHttpError, loginHref, errors, profile } = deps;
	${httpCode};
	return { doGet, doGetForResponse, doPost, doPut, doDelete, doUpload };
}`).toString('base64'));
const client = http({
	UNAUTHORIZED_PATHS: new Set(), UNAUTHORIZED_PATH_PREFIXES: [], loginHref: () => '/login',
	createHttpError: (status, path, body) => Object.assign(new Error(`${status} ${path}: ${body}`), { status }),
	errors: { items: [], append() {} },
	profile: { current: { id: '7', loaded: true } },
});
// The real library service, for attachmentName, and the real document service on the same client.
const strip = async (file) => stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export /gm, '');
const libraryCode = await strip('../../services/orca-library.ts');
const docsCode = await strip('../../services/orca-doc-templates.ts');
const { services } = await import('data:text/javascript;base64,' + Buffer.from(`import { orcaPath } from ${JSON.stringify(companyURL)};
function library({ doGet, doGetForResponse, doPost, doPut, doDelete, doUpload }) {
	${libraryCode};
	return attachmentName;
}
export function services(client) {
	const attachmentName = library(client);
	const { doGet, doGetForResponse, doPost, doPut, doDelete, doUpload } = client;
	${docsCode};
	return { OrcaDocTemplateService };
}`).toString('base64'));
const { OrcaDocTemplateService } = services(client);

test('a document\'s download or inspection 423 stops the page, and nothing more of the company goes out', async (t) => {
	company.setPageCompany(B, []);
	const opened = [];
	stops.onCompanyStop((status) => opened.push(status));
	const network = [];
	let answer = () => ({ ok: true, status: 200, headers: { get: (name) => (name === 'Content-Disposition' ? `attachment; filename="Daily_Briefing.xlsx"; filename*=UTF-8''Daily%20Briefing%202026-10-05.xlsx` : null) }, blob: async () => new Blob(['bytes']) });
	globalThis.fetch = async (url) => {
		network.push(url.replace(/^.*\/api/, ''));
		return answer();
	};
	t.after(() => { delete globalThis.fetch; });

	// Before the suspension: the file comes back under its own name, from the page's company.
	const file = await OrcaDocTemplateService.download(FILE);
	assert.equal(file.fileName, 'Daily Briefing 2026-10-05.xlsx');
	const inspected = await OrcaDocTemplateService.inspect('sales', FILE);
	assert.equal(inspected.fileName, 'Daily Briefing 2026-10-05.xlsx');
	// The file page pins the company locate named, whatever the page's.
	await OrcaDocTemplateService.download(FILE, C);
	assert.deepEqual(network, [`/orca/orgs/${B}/files/${FILE}/download`, `/orca/orgs/${B}/hubs/sales/documents/${FILE}/inspect`, `/orca/orgs/${C}/files/${FILE}/download`],
		'through the request layer');

	// B is suspended; the member clicks ดาวน์โหลด again.
	answer = () => ({ ok: false, status: 423, headers: { get: () => null }, text: async () => 'orca_company_suspended\n' });
	await assert.rejects(OrcaDocTemplateService.download(FILE), (error) => error.status === 423);
	assert.deepEqual(opened, ['suspended'], 'the page is stopped, and opens the suspended page');
	const sent = network.length;
	await assert.rejects(OrcaDocTemplateService.inspect('sales', FILE), (error) => error.status === 423);
	await assert.rejects(OrcaDocTemplateService.list('sales'), (error) => error.status === 423);
	assert.equal(network.length, sent, 'nothing more of B goes out');
});

test('เอกสาร and the file page ask through the document service, never with a plain link', async () => {
	const view = await readFile(new URL('./documents/DocumentsView.svelte', import.meta.url), 'utf8');
	assert.match(view, /const file = inspect \? await OrcaDocTemplateService\.inspect\(hub\.id, doc\.id\) : await OrcaDocTemplateService\.download\(doc\.id\);/);
	assert.match(view, /if \(getHttpStatusCode\(cause\) === 423\) return;/, 'the suspended page says why, not a toast');
	assert.doesNotMatch(view, /downloadHref|inspectHref|<a [^>]*download/);
	const page = await readFile(new URL('../../../routes/app/files/[id]/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /const file = await OrcaDocTemplateService\.download\(ready\.location\.id, ready\.company\);/);
	assert.match(page, /\{:else if view\.kind === "stopped"\}/);
	assert.doesNotMatch(page, /downloadHref|<a [^>]*download/);
	const service = await readFile(new URL('../../services/orca-doc-templates.ts', import.meta.url), 'utf8');
	assert.doesNotMatch(service, /baseURL/, 'no link the request layer does not see');
});
