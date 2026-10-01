import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { typescriptModuleURL } from './test-import.mjs';

// The knowledge library's uploads (C4 §14m S7) through the real
// services/http.ts, its store imports stubbed: a multipart POST with
// progress that names the page's account and counts as a write, like doPost.
const writesURL = await typescriptModuleURL(new URL('../services/writes.ts', import.meta.url));
const code = stripTypeScriptTypes(await readFile(new URL('../services/http.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export \{[^}]*\};?$/gm, '')
	.replace(/^export /gm, '')
	.replaceAll('import.meta.env.VITE_API_TARGET', 'undefined');
const { http } = await import('data:text/javascript;base64,' + Buffer.from(`import { accountHeaders, counted, orcaAccountChanged, pageAccountOr, reloadForAccount, writesInFlight } from ${JSON.stringify(writesURL)};
export function http(deps) {
	const { UNAUTHORIZED_PATHS, UNAUTHORIZED_PATH_PREFIXES, createHttpError, loginHref, errors, profile } = deps;
	${code};
	return { doUpload, writesInFlight, get baseURL() { return baseURL; } };
}`).toString('base64'));

function client(profile = { current: { id: '7', loaded: true } }) {
	const logged = [];
	return {
		logged,
		profile,
		...http({
			UNAUTHORIZED_PATHS: new Set(), UNAUTHORIZED_PATH_PREFIXES: [], loginHref: () => '/login',
			createHttpError: (status, path, body) => Object.assign(new Error(`${status} ${path}: ${body}`), { statusCode: status }),
			errors: { items: logged, append() {} },
			profile
		})
	};
}

/** A stand-in XMLHttpRequest: records what the upload did, answers when told. */
function fakeRequest() {
	const seen = { opened: [], headers: {}, sent: undefined, aborted: 0 };
	const request = {
		seen,
		status: 0,
		responseText: '',
		upload: { onprogress: null, onload: null },
		onload: null,
		onerror: null,
		onabort: null,
		open: (method, url) => seen.opened.push([method, url]),
		setRequestHeader: (name, value) => { seen.headers[name] = value; },
		send: (body) => { seen.sent = body; },
		abort: () => { seen.aborted += 1; request.onabort?.(); },
		answer(status, body) { request.status = status; request.responseText = body; request.onload?.(); }
	};
	return request;
}

test('an upload posts the form to the API with the page\'s account, and reports its progress', async () => {
	const api = client();
	const request = fakeRequest();
	const progress = [];
	const form = new FormData();
	form.append('files', new File(['x'], 'ราคา.xlsx'));
	const pending = api.doUpload('/orca/hubs/hub-sales/library/files', form, { request: () => request, onprogress: (loaded, total) => progress.push([loaded, total]) });
	assert.deepEqual(request.seen.opened, [['POST', `${api.baseURL}/orca/hubs/hub-sales/library/files`]]);
	assert.equal(request.seen.headers['X-Orca-Account'], '7');
	assert.equal(request.seen.headers['Content-Type'], undefined, 'the browser sets the multipart type and its boundary');
	assert.equal(request.seen.sent, form);
	assert.equal(api.writesInFlight(), 1, 'counted as a write while it is on its way');
	request.upload.onprogress({ loaded: 10, total: 40, lengthComputable: true });
	request.upload.onprogress({ loaded: 20, total: 0, lengthComputable: false });
	assert.deepEqual(progress, [[10, 40], [20, 0]]);
	request.answer(202, '{"files":[{"fileName":"ราคา.xlsx","item":{"id":"orl-1"}}]}');
	assert.deepEqual(await pending, { files: [{ fileName: 'ราคา.xlsx', item: { id: 'orl-1' } }] });
	assert.equal(api.writesInFlight(), 0);
});

test('a refused upload fails like any API call, and is logged only when asked', async () => {
	const api = client();
	const quiet = fakeRequest();
	const refused = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => quiet, dontLogErrors: true });
	quiet.answer(409, 'library_quota: the company\'s library quota is used up\n');
	await assert.rejects(refused, (error) => error.statusCode === 409 && /library_quota/.test(error.message));
	assert.equal(api.logged.length, 0);
	assert.equal(api.writesInFlight(), 0);
	const loud = fakeRequest();
	const logged = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => loud });
	loud.answer(500, 'boom');
	await assert.rejects(logged);
	assert.equal(api.logged.length, 1);
});

test('a lapsed session asks to sign in again, and another tab\'s account reloads the page', async (t) => {
	const values = new Map();
	let reloads = 0;
	globalThis.window = { location: { reload: () => reloads++, pathname: '/app' }, sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
	t.after(() => { delete globalThis.window; });
	const api = client({ current: { id: '7', loaded: true } });
	const expired = fakeRequest();
	const pending = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => expired, dontLogErrors: true });
	expired.answer(401, 'unauthorized');
	await assert.rejects(pending);
	assert.equal(api.profile.current.expired, true);
	assert.equal(reloads, 0, 'a lapsed session never reloads');
	const changed = fakeRequest();
	const refused = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => changed, dontLogErrors: true });
	changed.answer(412, 'orca_account_changed');
	await assert.rejects(refused);
	assert.equal(reloads, 1);
});

test('a cancelled upload stops the request; a dropped one fails as a network error', async () => {
	const api = client();
	const request = fakeRequest();
	const abort = new AbortController();
	const pending = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => request, signal: abort.signal });
	abort.abort();
	await assert.rejects(pending, (error) => error.name === 'AbortError');
	assert.equal(request.seen.aborted, 1);
	assert.equal(api.writesInFlight(), 0);
	// Cancelled before it started: nothing is sent.
	const never = fakeRequest();
	const stopped = new AbortController();
	stopped.abort();
	await assert.rejects(api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => never, signal: stopped.signal }), (error) => error.name === 'AbortError');
	assert.equal(never.seen.sent, undefined);
	assert.deepEqual(never.seen.opened, []);
	const dropped = fakeRequest();
	const lost = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => dropped });
	dropped.onerror();
	await assert.rejects(lost, TypeError);
	assert.equal(api.writesInFlight(), 0);
});

test('an upload says when its whole body is sent: after that, a lost answer leaves the outcome unknown', async () => {
	const api = client();
	const request = fakeRequest();
	let sent = 0;
	const pending = api.doUpload('/orca/hubs/h/library/files', new FormData(), { request: () => request, onsent: () => sent++ });
	assert.equal(sent, 0);
	request.upload.onload();
	assert.equal(sent, 1);
	request.onerror();
	await assert.rejects(pending, TypeError);
});
