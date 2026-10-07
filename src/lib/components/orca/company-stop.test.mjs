// A company suspended or closed while its page is open (platform console C6
// §4.2, Codex PC1 review 1 MAJOR 4): a 423 met by any request of the page's
// company, a poll's included, goes through one place (company-stop), which
// opens the suspended page and stops every other request of the company:
// polls, timers and loads on their way. Tested through the real
// services/http.ts, on the knowledge library and on "เชื่อม AI ของฉัน"'s poller.
// The stop is for the page's life, so this file stops its company once, in
// its last test; the earlier ones use their own stops.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { importTypeScript, typescriptModuleURL } from '../../orca/test-import.mjs';

const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'org-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const stopURL = await typescriptModuleURL(new URL('../../orca/company-stop.ts', import.meta.url));
const stops = await import(stopURL);
const company = await importTypeScript(new URL('../../orca/company.ts', import.meta.url));
const ai = await importTypeScript(new URL('../../orca/connect-ai.ts', import.meta.url));
const k = await importTypeScript(new URL('../../orca/knowledge.ts', import.meta.url));
const { glossary } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const th = (thai) => thai;
const term = (key, t) => t(...glossary[key]);

// The real services/http.ts, its store imports stubbed (as http-account.test.mjs).
const writesURL = await typescriptModuleURL(new URL('../../services/writes.ts', import.meta.url));
const code = stripTypeScriptTypes(await readFile(new URL('../../services/http.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export \{[^}]*\};?$/gm, '')
	.replace(/^export /gm, '')
	.replaceAll('import.meta.env.VITE_API_TARGET', 'undefined');
const { http } = await import('data:text/javascript;base64,' + Buffer.from(`import { companyStop, stoppedCode } from ${JSON.stringify(stopURL)};
import { accountHeaders, counted, orcaAccountChanged, pageAccountOr, reloadForAccount, writesInFlight } from ${JSON.stringify(writesURL)};
export function http(deps) {
	const { UNAUTHORIZED_PATHS, UNAUTHORIZED_PATH_PREFIXES, createHttpError, loginHref, errors, profile } = deps;
	${code};
	return { doGet, doPost, doDelete };
}`).toString('base64'));
const client = http({
	UNAUTHORIZED_PATHS: new Set(), UNAUTHORIZED_PATH_PREFIXES: [], loginHref: () => '/login',
	createHttpError: (status, path, body) => Object.assign(new Error(`${status} ${path}: ${body}`), { status }),
	errors: { items: [], append() {} },
	profile: { current: { id: '7', loaded: true } },
});
const answer = (status, body) => ({ ok: status < 400, status, headers: { get: (name) => (name === 'Content-Type' ? 'application/json' : null) }, text: async () => body, json: async () => JSON.parse(body) });

test('only a 423 with the status, for the page\'s own company, stops it', () => {
	let page = B;
	const stop = stops.createCompanyStop(() => page);
	const heard = [];
	stop.subscribe((status) => heard.push(status));
	assert.equal(stops.companyScopedPath(`/orca/orgs/${B}/bootstrap`, B), true);
	assert.equal(stops.companyScopedPath(`/orca/orgs/${B}`, B), true);
	assert.equal(stops.companyScopedPath(`/orca/orgs/${B}x/bootstrap`, B), false);
	assert.equal(stops.companyScopedPath('/orca/bootstrap', 'default'), false, 'ORCA\'s own company is never suspended');
	assert.equal(stops.companyScopedPath('/orca/companies', B), false, 'the person\'s company list is nobody\'s');
	assert.equal(stops.companyScopedPath(`/orca/platform/companies/${B}`, B), false, 'the platform\'s routes are nobody\'s');

	assert.equal(stop.notice(403, `/orca/orgs/${B}/keys`, 'orca_company_suspended'), undefined);
	assert.equal(stop.notice(423, `/orca/orgs/${C}/keys`, 'orca_company_suspended'), undefined, 'another company\'s answer');
	assert.equal(stop.notice(423, `/orca/platform/companies/${B}/suspend`, 'orca_company_suspended'), undefined);
	assert.deepEqual(heard, []);
	assert.equal(stop.refusal(`/orca/orgs/${B}/bootstrap`), undefined);
	const load = stop.signal(`/orca/orgs/${B}/bootstrap`);
	const own = new AbortController();
	const both = stop.signal(`/orca/orgs/${B}/bootstrap`, own.signal);
	assert.equal(stop.signal('/orca/companies', own.signal), own.signal, 'a request of nobody\'s company keeps its own signal');

	assert.equal(stop.notice(423, `/orca/orgs/${B}/hubs/h/library`, '{"error":"orca_company_suspended"}'), 'suspended');
	assert.deepEqual(heard, ['suspended']);
	assert.equal(load.aborted, true, 'a load on its way is aborted');
	assert.equal(both.aborted, true);
	assert.equal(stop.stopped(), 'suspended');
	assert.equal(stop.refusal(`/orca/orgs/${B}/me/ai-apps`), 'suspended');
	assert.equal(stop.refusal('/orca/companies'), undefined);
	stop.notice(423, `/orca/orgs/${B}/keys`, 'orca_company_suspended');
	assert.deepEqual(heard, ['suspended'], 'told once');
	stop.notice(423, `/orca/orgs/${B}/keys`, 'orca_company_closed');
	assert.deepEqual(heard, ['suspended', 'closed'], 'closed outranks suspended');
	stop.notice(423, `/orca/orgs/${B}/keys`, 'orca_company_suspended');
	assert.equal(stop.stopped(), 'closed', 'and stays');
	const late = [];
	stop.subscribe((status) => late.push(status));
	assert.deepEqual(late, ['closed'], 'a page that listens later hears it at once');
	assert.equal(stop.pageSignal().aborted, true);
	page = 'default';
	assert.equal(stop.refusal('/orca/bootstrap'), undefined);
	assert.equal(stop.pageSignal(), undefined, 'ORCA\'s own company never stops');
});

test('a poller with `until` stops for good when its company stops', async () => {
	const controller = new AbortController();
	const scheduled = [];
	const cancelled = [];
	let runs = 0;
	const poller = ai.createPoller(async () => { runs += 1; return 'continue'; }, { interval: 4000, schedule: (callback) => { scheduled.push(callback); return scheduled.length; }, cancel: (handle) => cancelled.push(handle), until: controller.signal });
	await poller.poke();
	assert.equal(runs, 1);
	assert.equal(poller.waiting, true);
	controller.abort();
	assert.deepEqual(cancelled, [1], 'its next round is cancelled');
	assert.equal(poller.waiting, false);
	await poller.poke();
	await scheduled[0]();
	assert.equal(runs, 1, 'nothing runs again');
	const already = ai.createPoller(async () => { runs += 1; return 'continue'; }, { interval: 4000, until: controller.signal });
	await already.poke();
	assert.equal(runs, 1, 'a poller made after the stop never runs');
});

test('the app page, the knowledge library and the AI apps page use the one stop', async () => {
	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /const stopListening = onCompanyStop\(\(status\) => \{\s*refusedStatus = status;/, 'the app page opens the suspended page');
	assert.match(page, /return \(\) => \{\s*stopListening\(\);\s*stopGuard\(\);\s*\};/);
	const view = await readFile(new URL('./views/ConnectAIView.svelte', import.meta.url), 'utf8');
	assert.match(view, /until: companyStop\.pageSignal\(\) \}\);/);
	const library = await readFile(new URL('./KnowledgeLibrary.svelte', import.meta.url), 'utf8');
	assert.equal(library.match(/if \(companyRefused\(cause\)\) return;/g)?.length, 2, 'the list\'s load and the reading\'s refresh');
	const httpSource = await readFile(new URL('../../services/http.ts', import.meta.url), 'utf8');
	assert.equal(httpSource.match(/companyStop\.notice\(/g)?.length, 3, 'loads, writes and uploads read their refusals');
	assert.equal(httpSource.match(/companyRefusal\(path\)/g)?.length, 5, 'and every kind of request is refused once stopped');
});

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
const reading = {
	id: 'r', kind: 'file', title: 'ราคาสินค้า', summary: '', content: '', parameters: [], knowledgeIDs: [], memberIDs: [], unitIDs: [], status: 'draft', version: 1,
	hubID: 'sales', ownerID: 'me', createdAt: '', updatedAt: '', canEdit: true, audienceMode: 'list',
	file: { origin: 'upload', fileName: 'ราคาสินค้า.xlsx', ext: 'xlsx', mime: 'x', bytes: 1, allowDownload: true, options,
		pending: { version: 1, state: 'extracting', fileName: 'ราคาสินค้า.xlsx', bytes: 1, createdAt: '', options } }
};
const members = [{ id: 'me', displayName: 'วิภา ตัวอย่าง', email: 'me@example.invalid', role: 'owner' }];
const salesHub = { id: 'sales', name: 'ฝ่ายขาย', description: '', connectionID: 'c', toolNames: ['t'], memberIDs: ['me'], accessUnitIDs: [], unitIDs: [], dailyLimit: 100, status: 'active', version: 2, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0 };

test('a poll of the knowledge library meets the suspension: the page stops, and so does every other request of the company', async (t) => {
	const svelte = await import('svelte/internal/client');
	company.setPageCompany(B, []);
	const opened = [];
	stops.onCompanyStop((status) => opened.push(status));
	const network = [];
	let libraryAnswer = () => answer(200, JSON.stringify({ items: [reading], members, departments: [] }));
	// "เชื่อม AI ของฉัน" polls the person's AI apps meanwhile.
	let aiLoad;
	const pendingAI = new Promise((resolve) => { aiLoad = resolve; });
	const fetch = async (url, init) => {
		network.push(url.replace(/^.*\/api/, ''));
		if (url.includes('/library')) return libraryAnswer();
		if (url.includes('/me/ai-apps')) {
			// A load still on its way when the company stops.
			return new Promise((resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
				pendingAI.then(() => resolve(answer(200, '{"sessions":[],"keys":[]}')));
			});
		}
		return answer(200, '{"items":[]}');
	};
	const libraryPath = (id) => company.orcaPath(`/hubs/${id}/library`);
	const aiApps = company.orcaPath('/me/ai-apps');
	const aiTicks = [];
	const aiAnswers = [];
	let aiRuns = 0;
	const poller = ai.createPoller(async () => {
		aiRuns += 1;
		try {
			await client.doGet(aiApps, { fetch, dontLogErrors: true });
			aiAnswers.push('read');
		} catch (error) {
			aiAnswers.push(error.status);
		}
		return 'continue';
	}, { interval: 4000, schedule: (callback) => { aiTicks.push(callback); return aiTicks.length; }, cancel: () => {}, until: stops.companyStop.pageSignal() });
	const aiRun = poller.poke();

	const harness = await scriptHarness('./KnowledgeLibrary.svelte', '{ load, get pollTimer() { return pollTimer; }, get items() { return items; }, stopPolling }');
	let view;
	const stop = svelte.effect_root(() => {
		view = harness(
			{ data: { hubs: [salesHub], currentUserID: 'me', canManage: true, features: { libraryV2: true }, members, units: [] }, hubID: 'sales', initialKind: 'file', initialCreate: false, onchanged: async () => {} },
			{
				...k, t: th, term, untrack: svelte.untrack, onDestroy: () => {}, beforeNavigate: () => {}, goto: async () => {}, replaceState: () => {},
				page: { url: new URL('https://orca.example.test/app?view=knowledge&hub=sales&kind=file'), state: {} },
				getHttpStatusCode: (error) => error.status, isAbortError: () => false, parseErrorContent: (error) => ({ status: error.status ?? 0, message: error.message ?? '' }),
				aiConnection: {}, aiConnectionReaches: () => true, aiConnectionAppFor: () => 'Claude', currentCompany: company.currentCompany, rememberLibrary: () => {}, forgetWorkspace: () => {}, refusedStatus: () => false, workspaceToken: () => 0, localeHref: (value) => value,
				memberName: (member) => member.displayName, orcaError: (error) => error.message, statusLabels: {}, showToast: () => {}, connectionReady: () => true,
				OrcaLibraryService: {
					load: (id) => client.doGet(libraryPath(id), { fetch, dontLogErrors: true }),
					usage: async () => ({ bytes: 0, bytesLimit: 1, chars: 0, charsLimit: 1, uploadsToday: 0, uploadsLimit: 50, items: 0, itemsLimit: 1000 })
				}
			}
		);
	});
	t.after(() => {
		view.stopPolling();
		stop();
	});
	svelte.flush();
	for (let i = 0; i < 10 && !view.pollTimer; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.ok(view.pollTimer, 'the library asks again while its file is read');
	assert.equal(view.items.length, 1);

	// B is suspended. The library's next poll gets 423.
	libraryAnswer = () => answer(423, 'orca_company_suspended');
	// What the poll's timer runs (no unsaved editor): a quiet load.
	void view.load('sales', true);
	for (let i = 0; i < 10 && !opened.length; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(opened, ['suspended'], 'the app page is told once, and opens the suspended page');
	assert.equal(stops.companyStopped(), 'suspended');
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
	assert.equal(view.pollTimer, undefined, 'the library asks nothing more');

	// The AI apps' load on its way was aborted, as a 423, and its poller
	// stopped. (Its server answering now changes nothing.)
	aiLoad();
	await aiRun;
	assert.equal(aiRuns, 1);
	assert.deepEqual(aiAnswers, [423], 'the load was aborted when the company stopped');
	assert.equal(poller.waiting, false, 'no next round');
	for (const tick of aiTicks) await tick();
	assert.equal(aiRuns, 1, 'the AI apps page asks nothing more');

	// Every later request of B fails at once, without reaching the server.
	const before = network.length;
	await assert.rejects(client.doGet(libraryPath('sales'), { fetch, dontLogErrors: true }), (error) => error.status === 423 && /orca_company_suspended/.test(error.message));
	await assert.rejects(client.doPost(company.orcaPath('/keys'), { name: 'x' }, { fetch, dontLogErrors: true }), (error) => error.status === 423);
	await assert.rejects(client.doDelete(company.orcaPath('/keys/1'), { fetch, dontLogErrors: true }), (error) => error.status === 423);
	assert.equal(network.length, before, 'nothing went out');
	// The person's company list still loads, for the suspended page's other companies.
	await client.doGet('/orca/companies', { fetch, dontLogErrors: true });
	assert.equal(network.at(-1), '/orca/companies');
});
