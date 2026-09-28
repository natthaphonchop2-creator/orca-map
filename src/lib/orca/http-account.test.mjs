import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { typescriptModuleURL } from './test-import.mjs';

// The real services/http.ts with its store imports stubbed: every request
// the workspace makes goes through it.
const writesURL = await typescriptModuleURL(new URL('../services/writes.ts', import.meta.url));
const code = stripTypeScriptTypes(await readFile(new URL('../services/http.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export \{[^}]*\};?$/gm, '')
	.replace(/^export /gm, '')
	.replaceAll('import.meta.env.VITE_API_TARGET', 'undefined');
const { http, setPageAccount } = await import('data:text/javascript;base64,' + Buffer.from(`import { accountHeaders, counted, orcaAccountChanged, pageAccountOr, reloadForAccount, writesInFlight, setPageAccount } from ${JSON.stringify(writesURL)};
export { setPageAccount };
export function http(deps) {
	const { UNAUTHORIZED_PATHS, UNAUTHORIZED_PATH_PREFIXES, createHttpError, loginHref, errors, profile } = deps;
	${code};
	return { doGet, doPost, doDelete, writesInFlight };
}`).toString('base64'));

const client = http({
	UNAUTHORIZED_PATHS: new Set(), UNAUTHORIZED_PATH_PREFIXES: [], loginHref: () => '/login',
	createHttpError: (status, path, body) => Object.assign(new Error(`${status} ${path}: ${body}`), { status }),
	errors: { items: [], append() {} },
	profile: { current: { id: '7', loaded: true } },
});

function response(status, body, contentType = 'application/json') {
	return { ok: status < 400, status, headers: { get: (name) => (name === 'Content-Type' ? contentType : null) }, text: async () => body, json: async () => JSON.parse(body) };
}

test('every request carries the page\'s account, the engine\'s routes included', async () => {
	const seen = [];
	const fetch = async (url, init) => { seen.push({ url, headers: init?.headers ?? {} }); return response(200, '{}'); };
	await client.doPost('/orca/keys', { name: 'laptop' }, { fetch });
	await client.doGet('/orca/orgs/org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bootstrap', { fetch });
	await client.doDelete('/orca/keys/1', { fetch });
	await client.doPost('/local-auth/users', { email: 'x@example.invalid' }, { fetch });
	await client.doPost('/local-auth/users/9/password', { password: 'x' }, { fetch });
	await client.doPost('/mcp-catalogs/default/entries', { name: 'x' }, { fetch });
	await client.doGet('/me', { fetch });
	assert.deepEqual(seen.map((request) => request.headers['X-Orca-Account']), ['7', '7', '7', '7', '7', '7', '7']);
});

test('a save counts until its response body is read, not just its headers', async () => {
	let finish;
	const body = new Promise((resolve) => { finish = resolve; });
	const fetch = async () => ({ ...response(201, ''), json: () => body });
	const save = client.doPost('/orca/keys', { name: 'laptop' }, { fetch });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(client.writesInFlight(), 1, 'the key is still being read');
	finish({ key: 'shown once' });
	assert.deepEqual(await save, { key: 'shown once' });
	assert.equal(client.writesInFlight(), 0);
});

test('the server\'s account refusal reloads the page once, and nothing else does', async (t) => {
	const values = new Map();
	let reloads = 0;
	globalThis.window = { location: { reload: () => reloads++ }, sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
	t.after(() => { delete globalThis.window; });
	const refuse = async () => response(412, '{"error":"orca_account_changed"}');
	await assert.rejects(client.doPost('/orca/keys', { name: 'laptop' }, { fetch: refuse }));
	assert.equal(reloads, 1);
	await assert.rejects(client.doGet('/orca/bootstrap', { fetch: refuse }));
	assert.equal(reloads, 1, 'no reload loop');
	values.clear();
	await assert.rejects(client.doGet('/orca/bootstrap', { fetch: async () => response(412, 'MCP server requires authentication') }));
	await assert.rejects(client.doGet('/orca/bootstrap', { fetch: async () => response(409, 'orca_account_changed') }));
	assert.equal(reloads, 1, 'only the account refusal reloads');
});

test('the page\'s own account wins over the profile, which fills in later', async () => {
	const seen = [];
	const fetch = async (url, init) => { seen.push(init?.headers?.['X-Orca-Account']); return response(200, '{}'); };
	// The first requests go out before the layout fills the profile store.
	const early = http({
		UNAUTHORIZED_PATHS: new Set(), UNAUTHORIZED_PATH_PREFIXES: [], loginHref: () => '/login',
		createHttpError: (status, path, body) => Object.assign(new Error(`${status} ${path}: ${body}`), { status }),
		errors: { items: [], append() {} },
		profile: { current: { id: '' } },
	});
	setPageAccount('7');
	setPageAccount('8'); // fixed once per page
	await early.doGet('/orca/companies', { fetch });
	await client.doGet('/orca/bootstrap', { fetch });
	assert.deepEqual(seen, ['7', '7']);
});
