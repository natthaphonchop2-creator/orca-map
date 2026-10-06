// A file's download meets its company's suspension (platform console C6
// §4.2, Codex PC1 review 2 MAJOR 2). A member opens a file that finished
// reading, so nothing on the page polls; the company is suspended; the member
// clicks ดาวน์โหลด. The download goes through the real services/http.ts and
// the real library service, so its 423 stops the page (company-stop), which
// opens the suspended page; nothing is saved and nothing more goes out.
// Its own file: the stop lasts for the page's life.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { importTypeScript, typescriptModuleURL } from '../../orca/test-import.mjs';

const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const stopURL = await typescriptModuleURL(new URL('../../orca/company-stop.ts', import.meta.url));
const companyURL = await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url));
const stops = await import(stopURL);
const company = await import(companyURL);
const k = await importTypeScript(new URL('../../orca/knowledge.ts', import.meta.url));
const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const th = (thai) => thai;
const term = (key, t) => t(...glossary[key]);
const noop = () => {};

// The real services/http.ts, its store imports stubbed (as http-account.test.mjs).
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
// The real library service on it.
const libraryCode = stripTypeScriptTypes(await readFile(new URL('../../services/orca-library.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export /gm, '');
const { library } = await import('data:text/javascript;base64,' + Buffer.from(`import { orcaPath } from ${JSON.stringify(companyURL)};
export function library({ doGet, doGetForResponse, doPost, doPut, doDelete, doUpload }) {
	${libraryCode};
	return OrcaLibraryService;
}`).toString('base64'));
const OrcaLibraryService = library(client);

async function scriptHarness(file, expose) {
	const { compileModule } = await import('svelte/compiler');
	const { createRequire } = await import('node:module');
	const { pathToFileURL } = await import('node:url');
	const require = createRequire(import.meta.url);
	const source = await readFile(new URL(file, import.meta.url), 'utf8');
	const stripped = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1]);
	const names = [...stripped.matchAll(/^\s*import\s+(?:(\w+)|\{([^}]*)\})\s+from\s+['"][^'"]+['"];?/gm)].flatMap(([, single, list]) => (single ? [single] : list.split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter((name) => name && !name.startsWith('type '))));
	const script = stripped.replace(/^\s*import[^;]+;/gm, '').replace('$props()', '$state(testProps)').replace('$props.id()', "'test'").replace(/\$bindable\(\)/g, 'undefined').replace(/\$bindable\(([^()]*)\)/g, '$1');
	const compiled = compileModule(`export function harness(testProps, deps) {
	const { ${[...new Set(names)].join(', ')} } = deps;
	${script}
	return ${expose};
}`, { filename: 'script-harness.svelte.js', generate: 'client' }).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
	return (await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))).harness;
}

const options = { includeHidden: false, includeComments: false, includeNotes: false, allowDownload: true, reviewBeforeUpdate: false };
const version = { version: 1, state: 'ready', fileName: 'ราคา.xlsx', bytes: 1, createdAt: '', options, stats: { chars: 1 } };
const item = {
	id: 'f', kind: 'file', title: 'ราคา', summary: '', content: '', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [], status: 'published', version: 2,
	hubID: 'sales', ownerID: 'y', createdAt: '', updatedAt: '', canEdit: false, audienceMode: 'list',
	file: { origin: 'upload', fileName: 'ราคา.xlsx', ext: 'xlsx', mime: 'x', bytes: 1, allowDownload: true, options, published: version }
};
const hub = { id: 'sales', name: 'ฝ่ายขาย', memberIDs: ['me', 'y'], accessUnitIDs: [], unitIDs: [], status: 'active', version: 2 };
const members = [{ id: 'me', displayName: 'วิภา', email: 'me@example.invalid', role: 'employee' }, { id: 'y', displayName: 'มาลี', email: 'y@example.invalid', role: 'employee' }];

test('the download\'s 423 stops the page: no file is saved, the suspended page opens, and nothing more goes out', async (t) => {
	const svelte = await import('svelte/internal/client');
	company.setPageCompany(B, []);
	const opened = [];
	stops.onCompanyStop((status) => opened.push(status));
	const network = [];
	let answer = () => ({ ok: true, status: 200, headers: { get: (name) => (name === 'Content-Disposition' ? `attachment; filename="____.xlsx"; filename*=UTF-8''%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2.xlsx` : null) }, blob: async () => new Blob(['bytes']) });
	globalThis.fetch = async (url) => {
		network.push(url.replace(/^.*\/api/, ''));
		return answer();
	};
	t.after(() => { delete globalThis.fetch; });
	const saved = [];
	const harness = await scriptHarness('./knowledge/FileDetail.svelte', '{ download, get actionError() { return actionError; } }');
	let view;
	const stop = svelte.effect_root(() => {
		view = harness(
			{ hub, item, members, departments: [], currentUserID: 'me', canManage: false, features: { files: true, audienceModes: true }, now: 0, onback: noop, onedit: noop, onchanged: noop, onarchived: noop, ondeleted: noop, ondenied: noop },
			{ ...k, t: th, term, onDestroy: () => {}, getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				orcaError: (error) => error.message, OrcaLibraryService, saveBlob: (blob, name) => saved.push(name) }
		);
	});
	t.after(stop);
	svelte.flush();

	// Before the suspension: the file is saved under its own name.
	await view.download();
	assert.deepEqual(saved, ['ราคา.xlsx']);
	assert.deepEqual(network, [`/orca/orgs/${B}/hubs/sales/library/files/f/download?version=published`], 'through the request layer');

	// B is suspended; the member clicks ดาวน์โหลด again.
	answer = () => ({ ok: false, status: 423, headers: { get: () => null }, text: async () => 'orca_company_suspended\n' });
	await view.download();
	assert.deepEqual(opened, ['suspended'], 'the page is stopped, and opens the suspended page');
	assert.deepEqual(saved, ['ราคา.xlsx'], 'nothing is saved');
	assert.equal(view.actionError, '', 'the suspended page says why, not the file card');
	const sent = network.length;
	await view.download();
	await assert.rejects(OrcaLibraryService.load('sales'), (error) => error.status === 423);
	assert.equal(network.length, sent, 'nothing more of B goes out');
});

test('the file card asks through the library service, never with a plain link', async () => {
	const source = await readFile(new URL('./knowledge/FileDetail.svelte', import.meta.url), 'utf8');
	assert.match(source, /<button type="button" class="k-button" disabled=\{downloading\} onclick=\{download\}>/);
	assert.match(source, /const original = await OrcaLibraryService\.download\(hub\.id, item\.id, downloadWhich\);/);
	assert.doesNotMatch(source, /downloadHref|<a [^>]*download/);
	const service = await readFile(new URL('../../services/orca-library.ts', import.meta.url), 'utf8');
	assert.match(service, /const response = await doGetForResponse\(`\$\{fileBase\(hubID, itemID\)\}\/download\?version=\$\{which\}`, options\);/);
});
