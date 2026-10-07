import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { compileModule } from 'svelte/compiler';
import { importTypeScript } from './test-import.mjs';

// ค้นหา…'s titles beyond the bootstrap (W0.2, Codex round 1 MAJOR 1 and the visual
// sweep's cold search): kept to the workspaces the viewer can use, loaded quietly the
// first time the search opens, cleared when a load is refused.
const require = createRequire(import.meta.url);
const internal = pathToFileURL(require.resolve('svelte/internal/client')).href;
const source = stripTypeScriptTypes(await readFile(new URL('./jump-cache.svelte.ts', import.meta.url), 'utf8'));
const code = compileModule(source, { filename: 'jump-cache.svelte.js', generate: 'client' }).js.code.replaceAll('svelte/internal/client', internal);
const cache = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { buildJumpTargets, searchJump, usableHubIDs } = await importTypeScript(new URL('./jump-targets.ts', import.meta.url));

const hubs = [
	{ id: 'sales', name: 'ฝ่ายขาย', status: 'active', memberIDs: ['me', 'x'] },
	{ id: 'hr', name: 'บุคคล', status: 'active', memberIDs: ['x'], effectiveMemberIDs: ['x'] },
	{ id: 'old', name: 'เก่า', status: 'archived', memberIDs: ['me'] },
	{ id: 'team', name: 'ทีม', status: 'paused', memberIDs: [], effectiveMemberIDs: ['me'] }
];
const article = (id, title, status = 'published') => ({ id, title, kind: 'knowledge', status });
const refusal = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
const deferred = () => {
	let resolve, reject;
	const promise = new Promise((yes, no) => ((resolve = yes), (reject = no)));
	return { promise, resolve, reject };
};
const search = (query, usable) =>
	searchJump(buildJumpTargets({ canManage: false, hubs, usableHubIDs: usable, knowledge: cache.jumpCache.knowledge, templates: cache.jumpCache.templates }), query).map(
		(section) => `${section.group}: ${section.items.map((item) => item.label).join(', ')}`
	);
const warm = (overrides = {}) => {
	const calls = { library: [], templates: [] };
	const run = cache.warmJumpCache({
		hubIDs: usableHubIDs(hubs, 'me'),
		templates: false,
		loadLibrary: async (id) => (calls.library.push(id), { items: [article(`${id}-1`, `นโยบาย ${id}`)] }),
		loadTemplates: async (id) => (calls.templates.push(id), [{ id: `${id}-t`, title: `แม่แบบ ${id}` }]),
		status: (cause) => cause?.status,
		...overrides
	});
	return { calls, run };
};

test('the usable workspaces: open ones the viewer is in, by effectiveMemberIDs when the server sends them', () => {
	assert.deepEqual(usableHubIDs(hubs, 'me'), ['sales', 'team'], 'not hr (not a member), not old (archived)');
	assert.deepEqual(usableHubIDs(hubs, 'x'), ['sales', 'hr']);
	assert.deepEqual(usableHubIDs(hubs, ''), []);
	assert.deepEqual(usableHubIDs(undefined, 'me'), []);
	assert.deepEqual(usableHubIDs([null, { id: 'n', status: 'active' }], 'me'), [], 'a hub without members grants nobody');
});

test('a cold search finds knowledge once the first opening has loaded it, fetching only usable workspaces', async () => {
	cache.resetJumpCache();
	assert.deepEqual(search('นโยบาย'), [], 'cold: nothing cached yet');
	const { calls, run } = warm();
	await run;
	assert.deepEqual(calls.library, ['sales', 'team'], 'only the workspaces the viewer can use');
	assert.deepEqual(calls.templates, [], 'templates are off: never asked for');
	assert.deepEqual(search('นโยบาย'), ['knowledge: นโยบาย sales, นโยบาย team']);
	// Loaded once per page: the next opening asks nothing.
	const again = warm();
	await again.run;
	assert.deepEqual(again.calls.library, []);
});

test('with document templates on, their titles load too; at most ten workspaces are asked', async () => {
	cache.resetJumpCache();
	const many = Array.from({ length: 14 }, (_, index) => `h${index}`);
	const { calls, run } = warm({ hubIDs: many, templates: true });
	await run;
	assert.equal(calls.library.length, cache.WARM_HUBS);
	assert.deepEqual(calls.templates, calls.library);
	assert.equal(cache.jumpCache.templates.length, 10);
});

test('the loading flag is up while titles load and down after, and typing never waits for it', async () => {
	cache.resetJumpCache();
	const pending = deferred();
	const { run } = warm({ hubIDs: ['sales'], loadLibrary: () => pending.promise });
	assert.equal(cache.jumpCache.loading, true, 'the quiet row shows');
	assert.deepEqual(search('ราคา'), [], 'search answers from what it has meanwhile');
	assert.deepEqual(search('ฝ่าย'), ['workspace: ฝ่ายขาย'], 'the bootstrap places are there at once');
	pending.resolve({ items: [article('a', 'ฝ่ายขาย: ราคา')] });
	await run;
	assert.equal(cache.jumpCache.loading, false, 'the row goes');
	assert.deepEqual(search('ราคา'), ['knowledge: ฝ่ายขาย: ราคา']);
});

test('a refused workspace (401, 403, 404, 423) is cleared; another failure is silent and retried once on the next opening', async () => {
	for (const status of [401, 403, 404, 423]) {
		cache.resetJumpCache();
		cache.rememberLibrary('sales', [article('a', 'เก่าแล้ว')]);
		cache.rememberTemplates('sales', [{ id: 't', title: 'แม่แบบเก่า' }]);
		await warm({ hubIDs: ['sales'], loadLibrary: async () => { throw refusal(status); } }).run;
		assert.deepEqual(cache.jumpCache.knowledge, [], `${status}: its titles go`);
		assert.deepEqual(cache.jumpCache.templates, [], `${status}: its templates go too`);
		assert.equal(cache.jumpCache.loading, false);
	}
	// A refused template list is a refused workspace too: all its titles go (Codex W0.2 round 2).
	cache.resetJumpCache();
	await warm({ hubIDs: ['sales'], templates: true, loadTemplates: async () => { throw refusal(403); } }).run;
	assert.equal(cache.jumpCache.knowledge.length, 0);
	assert.equal(cache.jumpCache.templates.length, 0);
	// A network failure: nothing thrown, retried on the next opening, and no more after that.
	cache.resetJumpCache();
	let asked = 0;
	const failing = { hubIDs: ['sales'], loadLibrary: async () => { asked += 1; throw new Error('offline'); } };
	await warm(failing).run;
	assert.equal(asked, 1);
	await warm(failing).run;
	assert.equal(asked, 2, 'the next opening tries once more');
	await warm(failing).run;
	assert.equal(asked, 2, 'and then it stops asking');
	assert.equal(cache.jumpCache.loading, false);
});

test('access changes: a workspace the viewer leaves loses its titles at once, however they were cached', async () => {
	cache.resetJumpCache();
	cache.keepWorkspaces(['sales', 'team']);
	await warm().run;
	cache.rememberTemplates('sales', [{ id: 't', title: 'ใบเสนอราคา' }]);
	assert.deepEqual(search('นโยบาย'), ['knowledge: นโยบาย sales, นโยบาย team']);
	// The bootstrap refreshes without sales: its titles leave the cache and the search.
	cache.keepWorkspaces(['team']);
	assert.deepEqual(cache.jumpCache.knowledge.map((item) => item.hubID), ['team']);
	assert.deepEqual(cache.jumpCache.templates, []);
	assert.deepEqual(search('นโยบาย', ['team']), ['knowledge: นโยบาย team']);
	// Even a title still cached is left out by the builder when its workspace is not usable.
	cache.rememberLibrary('sales', [article('late', 'นโยบาย ใหม่')]);
	assert.deepEqual(search('ใหม่', ['team']), []);
	assert.deepEqual(search('ใหม่'), ['knowledge: นโยบาย ใหม่'], 'without the usable list, as before');
});

test('an answer that comes after the viewer lost the workspace is dropped; a newly usable workspace loads on the next opening', async () => {
	cache.resetJumpCache();
	let usable = ['sales', 'team'];
	cache.keepWorkspaces(usable);
	const late = deferred();
	const { run } = warm({ hubIDs: usable, loadLibrary: (id) => (id === 'sales' ? late.promise : Promise.resolve({ items: [article('t1', 'นโยบาย team')] })), usable: (id) => usable.includes(id) });
	usable = ['team'];
	cache.keepWorkspaces(usable);
	late.resolve({ items: [article('s1', 'นโยบาย sales')] });
	await run;
	assert.deepEqual(cache.jumpCache.knowledge.map((item) => item.hubID), ['team'], 'sales never comes back');
	// A workspace added to the viewer: the next opening loads again.
	cache.keepWorkspaces(['team', 'hr']);
	const next = warm({ hubIDs: ['team', 'hr'] });
	await next.run;
	assert.deepEqual(next.calls.library, ['team', 'hr']);
});

// Codex W0.2 round 2, MAJOR: a success admitted before a refusal answers after it. The
// refusal moves the workspace's generation on, and every write checks it, whichever load
// was refused and whichever answered late.
test('a refusal, then a late success of the other load: nothing comes back (library refused first, or templates refused first)', async () => {
	for (const refused of ['library', 'templates']) {
		cache.resetJumpCache();
		cache.keepWorkspaces(['sales']);
		const library = deferred();
		const templates = deferred();
		const { run } = warm({ hubIDs: ['sales'], templates: true, loadLibrary: () => library.promise, loadTemplates: () => templates.promise, usable: () => true });
		const [first, late] = refused === 'library' ? [library, templates] : [templates, library];
		first.reject(refusal(403));
		await new Promise((resolve) => setImmediate(resolve));
		late.resolve(refused === 'library' ? [{ id: 't', title: 'แม่แบบ ฝ่ายขาย' }] : { items: [article('a', 'นโยบาย ฝ่ายขาย')] });
		await run;
		assert.deepEqual(cache.jumpCache.knowledge, [], `${refused} refused first: no knowledge comes back`);
		assert.deepEqual(cache.jumpCache.templates, [], `${refused} refused first: no templates come back`);
		assert.deepEqual(search('ฝ่ายขาย'), ['workspace: ฝ่ายขาย'], 'only the bootstrap place, which the bootstrap still lists');
	}
});

test('the pages write with the token of the load they began: a refusal meanwhile keeps their answer out; a new load writes again', () => {
	cache.resetJumpCache();
	const token = cache.workspaceToken('sales');
	cache.forgetWorkspace('sales'); // the search's own load was refused meanwhile
	assert.equal(cache.rememberLibrary('sales', [article('a', 'นโยบาย')], token), false, 'the page’s older answer is not written');
	assert.equal(cache.rememberTemplates('sales', [{ id: 't', title: 'แม่แบบ' }], token), false);
	assert.deepEqual([cache.jumpCache.knowledge, cache.jumpCache.templates], [[], []]);
	// A load that begins after the refusal (the page asked again and was let in) writes.
	assert.equal(cache.rememberLibrary('sales', [article('b', 'นโยบายใหม่')], cache.workspaceToken('sales')), true);
	assert.deepEqual(cache.jumpCache.knowledge.map((item) => item.id), ['b']);
	// Losing the workspace moves its generation on as well.
	cache.keepWorkspaces(['sales']);
	const before = cache.workspaceToken('sales');
	cache.keepWorkspaces([]);
	assert.ok(cache.workspaceToken('sales') > before);
	assert.equal(cache.rememberLibrary('sales', [article('c', 'x')], before), false);
});
