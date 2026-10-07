// W1-B5 (C4 design §14i): the ORCA team's usage numbers on ภาพรวมแพลตฟอร์ม.
// The answer's shape, the order and words the page uses, the one service call,
// the section rendered from a fixture (loaded, loading, failed, empty), a
// failure that leaves the overview's other numbers alone, and that no customer
// reaches any of it.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const usageModule = await importTypeScript(new URL('../../orca/platform-usage.ts', import.meta.url));
const platform = await importTypeScript(new URL('../../services/orca-platform.ts', import.meta.url));
const require = createRequire(import.meta.url);
const internal = pathToFileURL(require.resolve('svelte/internal/client')).href;
const files = {
	usage: new URL('./platform/PlatformUsage.svelte', import.meta.url),
	overview: new URL('./views/PlatformOverview.svelte', import.meta.url),
	service: new URL('../../services/orca-platform-usage.ts', import.meta.url),
	view: new URL('./views/PlatformView.svelte', import.meta.url)
};
const th = (thai) => thai;
const text = (html) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// The backend's answer (synthetic companies; numbers only, never a person).
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'org-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'org-dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const answer = {
	generatedAt: '2026-09-29T01:00:00Z',
	timezone: 'Asia/Bangkok',
	today: '2026-09-29',
	since: '2026-09-23',
	companies: { total: 4, activeLast7Days: 2 },
	people: { members: 12, aiConnected: 5 },
	aiUsers: { today: 2, last7Days: 4 },
	toolCalls: { today: 31, last7Days: 1210 },
	items: [
		{ id: 'default', displayName: 'ORCA', members: 3, aiConnected: 2, aiUsersLast7Days: 2, toolCallsLast7Days: 150, lastCallDay: '2026-09-28' },
		{ id: B, displayName: 'บริษัท ตัวอย่าง บี จำกัด', members: 5, aiConnected: 3, aiUsersLast7Days: 3, toolCallsLast7Days: 1060, lastCallDay: '2026-09-29' },
		{ id: C, displayName: 'Company C', members: 2, aiConnected: 0, aiUsersLast7Days: 0, toolCallsLast7Days: 0, lastCallDay: null },
		{ id: D, displayName: 'Company D', members: 2, aiConnected: 1, aiUsersLast7Days: 0, toolCallsLast7Days: 0, lastCallDay: '2026-09-10' }
	]
};

test('the answer keeps exactly its fields: numbers default to 0, days to null, and no person field survives', () => {
	const usage = usageModule.platformUsage({
		...answer,
		userIDs: ['1'],
		items: [...answer.items.map((item, i) => (i === 0 ? { ...item, userIDs: ['1'], emails: ['x@example.test'] } : item)), { displayName: 'no id' }, null, { id: 'e', members: -3, toolCallsLast7Days: 'many', lastCallDay: '29/09/2026' }]
	});
	assert.deepEqual(Object.keys(usage).sort(), ['aiUsers', 'companies', 'generatedAt', 'items', 'people', 'since', 'timezone', 'today', 'toolCalls']);
	assert.deepEqual(usage.companies, { total: 4, activeLast7Days: 2 });
	assert.deepEqual(usage.items.map((item) => item.id), ['default', B, C, D, 'e']);
	for (const item of usage.items) assert.deepEqual(Object.keys(item).sort(), ['aiConnected', 'aiUsersLast7Days', 'displayName', 'id', 'lastCallDay', 'members', 'toolCallsLast7Days']);
	assert.deepEqual(usage.items[4], { id: 'e', displayName: 'e', members: 0, aiConnected: 0, aiUsersLast7Days: 0, toolCallsLast7Days: 0, lastCallDay: null });
	const empty = usageModule.platformUsage(undefined);
	assert.deepEqual([empty.items, empty.toolCalls, empty.timezone], [[], { today: 0, last7Days: 0 }, 'Asia/Bangkok']);
});

test('companies come by last activity: the latest day, then the most requests; never-used last', () => {
	const rows = usageModule.usageRows(usageModule.platformUsage(answer).items);
	assert.deepEqual(rows.map((row) => row.id), [B, 'default', D, C]);
	const tie = usageModule.usageRows([
		{ id: 'a', displayName: 'A', members: 1, aiConnected: 1, aiUsersLast7Days: 1, toolCallsLast7Days: 5, lastCallDay: '2026-09-29' },
		{ id: 'b', displayName: 'B', members: 1, aiConnected: 1, aiUsersLast7Days: 1, toolCallsLast7Days: 9, lastCallDay: '2026-09-29' },
		{ id: 'c', displayName: 'C', members: 1, aiConnected: 0, aiUsersLast7Days: 0, toolCallsLast7Days: 0, lastCallDay: null }
	]);
	assert.deepEqual(tie.map((row) => row.id), ['b', 'a', 'c']);
});

test('ใช้ล่าสุด reads today, yesterday, days ago within the week, else the date, in Bangkok days', () => {
	const last = (day, locale = 'th', t = th) => usageModule.lastUsedLabel(day, '2026-09-29', t, locale);
	assert.equal(last('2026-09-29'), 'วันนี้');
	assert.equal(last('2026-09-28'), 'เมื่อวาน');
	assert.equal(last('2026-09-25'), '4 วันก่อน');
	assert.equal(last('2026-09-10'), '10 ก.ย. 2569');
	assert.equal(last('2026-09-10', 'en', (_th, en) => en), '10 Sept 2026');
	assert.equal(last(null), 'ยังไม่เคยใช้');
	assert.equal(usageModule.usageNumber(1210), '1,210');
	// The same day formatter the company pages use, with no time.
	assert.equal(usageModule.displayDay('2026-10-05'), '5 ต.ค. 2569');
	assert.equal(usageModule.displayDay('2026-10-05', 'en'), '5 Oct 2026');
	assert.equal(usageModule.displayDay(null), '—');
});

test('the service makes one platform call, never under a company\'s path', async () => {
	const source = await readFile(files.service, 'utf8');
	assert.doesNotMatch(source, /orcaPath|\/orgs\//);
	const code = stripTypeScriptTypes(source).replace(/^import[^;]+;/gm, '').replace(/^export /gm, '');
	const calls = [];
	const { PlatformUsageService } = new Function('doGet', 'platformUsage', `${code}; return { PlatformUsageService };`)(
		async (path, options) => {
			calls.push({ path, options });
			return answer;
		},
		usageModule.platformUsage
	);
	const usage = await PlatformUsageService.usage();
	assert.deepEqual(calls.map((call) => call.path), ['/orca/platform/usage']);
	assert.equal(calls[0].options.dontLogErrors, true);
	assert.equal(usage.toolCalls.last7Days, 1210);
});

// ---------------------------------------------------------------------------
// The section, rendered
// ---------------------------------------------------------------------------

async function section(props) {
	const empties = [];
	const { warnings, Component } = await serverComponent(files.usage, {
		...usageModule,
		t: th,
		orcaLocale: { value: 'th' },
		EmptyState: (_renderer, p) => empties.push(p.message)
	});
	assert.deepEqual(warnings, []);
	return { html: render(Component, { props }).body, empties };
}
const tiles = (html) => [...html.matchAll(/<li[^>]*><span class="usage-tile-label[^"]*">([^<]+)<\/span>\s*<strong class="usage-tile-value[^"]*">([\s\S]*?)<\/strong>\s*<span class="usage-tile-detail[^"]*">([^<]*)<\/span>/g)].map(([, label, value, detail]) => [label, text(value).trim(), detail]);

test('four numbers for the platform, then each company, the latest activity first', async () => {
	const { html } = await section({ usage: usageModule.platformUsage(answer) });
	assert.deepEqual(tiles(html), [
		['บริษัทที่ใช้งานใน 7 วัน', '2', 'จากทั้งหมด 4 บริษัท'],
		['คนที่เชื่อม AI แล้ว', '5', 'จากสมาชิก 12 คน'],
		['คนที่ใช้ AI วันนี้ / 7 วัน', '2 / 4', 'นับคนละครั้ง แม้อยู่หลายบริษัท'],
		['คำขอจาก AI ใน 7 วัน', '1,210', 'วันนี้ 31 ครั้ง']
	]);
	assert.match(text(html), /7 วันล่าสุด ตามเวลาประเทศไทย รวมบริษัทของทีม ORCA · ข้อมูลเมื่อ 08:00 น\./);
	assert.deepEqual([...html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]), ['บริษัท', 'สมาชิก', 'เชื่อม AI แล้ว', 'คนที่ใช้ AI (7 วัน)', 'คำขอจาก AI (7 วัน)', 'ใช้ล่าสุด']);
	const rows = [...html.matchAll(/<tr[^>]*>\s*<th scope="row"[\s\S]*?<\/tr>/g)].map((m) => text(m[0]).trim());
	assert.deepEqual(rows, [
		'บริษัท ตัวอย่าง บี จำกัด สมาชิก 5 เชื่อม AI แล้ว 3 คนที่ใช้ AI (7 วัน) 3 คำขอจาก AI (7 วัน) 1,060 ใช้ล่าสุด วันนี้',
		'ORCA บริษัทของทีม ORCA สมาชิก 3 เชื่อม AI แล้ว 2 คนที่ใช้ AI (7 วัน) 2 คำขอจาก AI (7 วัน) 150 ใช้ล่าสุด เมื่อวาน',
		'Company D สมาชิก 2 เชื่อม AI แล้ว 1 คนที่ใช้ AI (7 วัน) 0 คำขอจาก AI (7 วัน) 0 ใช้ล่าสุด 10 ก.ย. 2569',
		'Company C สมาชิก 2 เชื่อม AI แล้ว 0 คนที่ใช้ AI (7 วัน) 0 คำขอจาก AI (7 วัน) 0 ใช้ล่าสุด ยังไม่เคยใช้'
	]);
	assert.match(html, /<section class="usage[^"]*" aria-labelledby="usage-title" aria-busy="false">/);
	assert.doesNotMatch(html, /@|userID|email/i, 'no person anywhere');
});

test('loading shows dashes, a failure says so on these tiles only with a retry, and no company or no use has its own words', async () => {
	let { html } = await section({});
	assert.deepEqual(tiles(html).map(([, value]) => value), ['—', '—', '—', '—']);
	assert.match(html, /aria-busy="true"/);
	assert.match(text(html), /กำลังโหลดการใช้งาน…/);
	assert.doesNotMatch(html, /<table/);
	({ html } = await section({ error: 'boom', onretry: () => {} }));
	assert.deepEqual(tiles(html).map(([, value, detail]) => [value, detail]), Array(4).fill(['—', 'โหลดไม่สำเร็จ']));
	assert.match(html, /<p class="usage-error[^"]*" role="alert">[\s\S]*โหลดตัวเลขการใช้งานไม่สำเร็จ[\s\S]*<button type="button" class="k-link-button[^"]*">ลองอีกครั้ง<\/button>/);
	let empties;
	({ html, empties } = await section({ usage: usageModule.platformUsage({ ...answer, companies: { total: 0, activeLast7Days: 0 }, items: [] }) }));
	assert.deepEqual(empties, ['ยังไม่มีบริษัทบน ORCA']);
	({ html } = await section({ usage: usageModule.platformUsage({ ...answer, toolCalls: { today: 0, last7Days: 0 }, items: answer.items.map((item) => ({ ...item, toolCallsLast7Days: 0, aiUsersLast7Days: 0 })) }) }));
	assert.match(text(html), /ยังไม่มีบริษัทไหนใช้ AI ใน 7 วันที่ผ่านมา/);
	assert.match(html, /<table/, 'the members and connections still show');
});

test('the section uses the workspace tokens only, compiles clean, and turns rows into cards on narrow screens', async () => {
	const source = await readFile(files.usage, 'utf8');
	assert.doesNotMatch(source.match(/<style>([\s\S]*)<\/style>/)[1], /#[0-9a-f]{3,8}\b|rgba?\(|hsl\(/i, 'colours come from --orca-* tokens');
	for (const colour of source.match(/(?<![-\w])(?:color|background|border-color):[^;]+;/g)) assert.match(colour, /^[a-z-]+: (?:var\(--orca-[a-z0-9-]+\)|none);$/, colour);
	assert.deepEqual(compile(source, { filename: 'PlatformUsage.svelte', generate: 'client' }).warnings.map((w) => w.code), []);
	assert.match(source, /@container usage \(max-width: 760px\)/);
	assert.match(source, /\.usage-table thead \{\s*display: none;/);
	assert.match(source, /@media \(max-width: 720px\)/);
});

// ---------------------------------------------------------------------------
// ภาพรวมแพลตฟอร์ม: its own call, its own error
// ---------------------------------------------------------------------------

// PlatformOverview's script, run with its services replaced: its load, its
// usage load and the state its tiles read.
async function overviewHarness() {
	const script = stripTypeScriptTypes((await readFile(files.overview, 'utf8')).match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
		.replace(/^\s*import[\s\S]*?;$/gm, '')
		.replace('$props()', '$state(testProps)');
	const names = ['rememberCompanies', 'onMount', 'term', 't', 'localeHref', 'platformHref', 'OrcaService', 'orcaError', 'catalogSummary', 'googleClientSaved', 'platformCounts', 'PlatformUsageService', 'usageNumber', 'ArrowRight', 'Building2', 'Check', 'Grid2x2Plus', 'Inbox', 'KeyRound', 'LogIn', 'Shield', 'TriangleAlert'];
	const { harness } = await import(
		'data:text/javascript;base64,' +
			Buffer.from(
				compileModule(`export function harness(testProps, deps) { const { ${names.join(', ')} } = deps; ${script}; return { load, loadUsage, get state() { return { tiles, todos, clearText, usage, usageError, companiesError, googleError, catalogFailed, loading }; } }; }`, {
					filename: 'overview.harness.svelte.js',
					generate: 'client'
				}).js.code.replaceAll('svelte/internal/client', internal)
			).toString('base64')
	);
	return (orcaService, usageService) =>
		harness(
			{ canReviewPilotRequests: false },
			{
				rememberCompanies: () => {},
				onMount: () => {},
				term: (key) => key,
				t: th,
				localeHref: (path) => path,
				platformHref: (section) => `/app?view=platform&section=${section}`,
				OrcaService: {
					googleSignIn: async () => ({ enabled: true, clientID: 'x.apps.googleusercontent.com', secretConfigured: true }),
					candidates: async () => [],
					listPilotRequests: async () => ({ items: [] }),
					...orcaService
				},
				orcaError: (cause) => cause.message,
				catalogSummary: platform.catalogSummary,
				googleClientSaved: platform.googleClientSaved,
				platformCounts: platform.platformCounts,
				PlatformUsageService: usageService,
				usageNumber: usageModule.usageNumber
			}
		);
}
const overviewCompanies = [{ id: 'default', displayName: 'ORCA', createdAt: '', seats: 3, owners: 1, ownerInvitations: [] }, { id: B, displayName: 'B', createdAt: '', seats: 5, owners: 1, ownerInvitations: [] }];

test('a usage failure leaves the overview\'s other numbers alone, a retry reloads only the usage, and a failed reload drops the old numbers', async () => {
	let usageCalls = 0;
	let companyCalls = 0;
	let fail = true;
	const view = (await overviewHarness())(
		{ platformCompanies: async () => (companyCalls++, overviewCompanies) },
		{
			usage: async () => {
				usageCalls++;
				if (fail) throw new Error('usage failed');
				return usageModule.platformUsage(answer);
			}
		}
	);
	await view.load();
	assert.equal(view.state.usageError, 'usage failed');
	assert.deepEqual([view.state.companiesError, view.state.googleError], ['', '']);
	assert.deepEqual(view.state.tiles.map((tile) => [tile.value, tile.detail]).slice(0, 2), [['1', 'มีเจ้าของแล้ว 1'], ['5', 'รวมทุกบริษัทลูกค้า']]);
	fail = false;
	await view.loadUsage();
	assert.deepEqual([usageCalls, companyCalls, view.state.usageError, view.state.usage.toolCalls.last7Days], [2, 1, '', 1210]);
	// A later reload that fails drops the numbers it had, so no old number sits beside the failure.
	fail = true;
	await view.loadUsage();
	assert.deepEqual([usageCalls, companyCalls, view.state.usageError, view.state.usage], [3, 1, 'usage failed', undefined]);
	assert.deepEqual(view.state.tiles.map((tile) => [tile.value, tile.detail]).slice(0, 2), [['1', 'มีเจ้าของแล้ว 1'], ['5', 'รวมทุกบริษัทลูกค้า']]);
	const source = await readFile(files.overview, 'utf8');
	assert.match(source, /<PlatformUsage \{usage\} error=\{usageError\} onretry=\{loadUsage\} \/>/);
	// "Nothing waiting" only when every read answered: a failed one proves nothing (Codex release review 64).
	assert.match(source, /\{:else if !\(companiesError \|\| pilotsError \|\| googleError \|\| catalogFailed\)\}\s*<!--[^>]*-->\s*<p class="overview-clear">/);
	assert.match(source, /\{#if companiesError \|\| pilotsError \|\| googleError \|\| catalogFailed\}\s*<p class="overview-error"/, 'and says what failed');
	assert.match(source, /\(\) => \{\s*\/\/[^\n]*\n\s*catalogFailed = true;/);
});

test('the owner to-do counts one set: the companies that get the invite button (Codex PC1 polish review 1)', async () => {
	// Fake companies: one active and never invited, one suspended whose owner
	// link expired, one suspended with a link still out, one active with an owner.
	const company = (id, displayName, extra = {}) => ({ id, displayName, createdAt: '', seats: 0, owners: 0, ownerInvitations: [], ...extra });
	const invitation = (status) => [{ id: `inv-${status}`, email: 'owner@example.invalid', expiresAt: '2026-10-01T00:00:00Z', status }];
	const neverInvited = company('org-11111111-1111-4111-8111-111111111111', 'บริษัท ทดลองสยาม จำกัด');
	const suspendedExpired = company('org-22222222-2222-4222-8222-222222222222', 'บริษัท ตัวอย่างพัฒนา จำกัด', { status: 'suspended', ownerInvitations: invitation('expired') });
	const suspendedWaiting = company('org-33333333-3333-4333-8333-333333333333', 'บริษัท สมมุติการค้า จำกัด', { status: 'suspended', ownerInvitations: invitation('pending') });
	const owned = company(B, 'บริษัท เดโมโลจิสติกส์ จำกัด', { owners: 1, seats: 4 });
	const open = (companies) => (async () => (await overviewHarness())({ platformCompanies: async () => companies }, { usage: async () => usageModule.platformUsage(answer) }))();

	const view = await open([overviewCompanies[0], neverInvited, suspendedExpired, suspendedWaiting, owned]);
	await view.load();
	// The heading and its breakdown agree, and no suspended company is offered a new link.
	assert.deepEqual(
		view.state.todos.map((todo) => [todo.title, todo.detail, todo.action]),
		[['1 บริษัทยังไม่มีเจ้าของ', 'ยังไม่ได้เชิญ 1', 'ส่งลิงก์เชิญ']]
	);

	// Nothing to do, but two suspended companies still have no owner: "every company has an owner" would be false.
	const clear = await open([overviewCompanies[0], suspendedExpired, suspendedWaiting, owned]);
	await clear.load();
	assert.deepEqual(clear.state.todos, []);
	assert.equal(clear.state.clearText, 'ไม่มีงานค้าง บริษัทที่ใช้งานอยู่มีเจ้าของครบและปุ่ม Google เปิดอยู่ ส่วนบริษัทที่ระงับหรือปิดไว้ 2 บริษัทยังไม่มีเจ้าของ');
	assert.doesNotMatch(clear.state.clearText, /ทุกบริษัทมีเจ้าของ/);

	// Every company with an owner: the plain all-clear.
	const all = await open([overviewCompanies[0], owned]);
	await all.load();
	assert.equal(all.state.clearText, 'ไม่มีงานค้าง ทุกบริษัทมีเจ้าของและปุ่ม Google เปิดอยู่');

	// No customer companies yet: "every company has an owner" would say nothing true (Codex PC1 polish review 2 NOTE).
	const none = await open([overviewCompanies[0]]);
	await none.load();
	assert.deepEqual(none.state.todos, []);
	assert.equal(none.state.clearText, 'ไม่มีงานค้าง ยังไม่มีบริษัทลูกค้า และปุ่ม Google เปิดอยู่');
	const source = await readFile(files.overview, 'utf8');
	// W0: one ink line with a green dot, never a green box.
	assert.match(source, /<p class="overview-clear"><span class="overview-clear-dot" aria-hidden="true"><\/span>\{clearText\}<\/p>/);
	const css = source.slice(source.indexOf('<style>'));
	assert.doesNotMatch(css, /--orca-(ok|warn|deny)-bg/, 'no tinted tiles or boxes');
	assert.match(css, /\.overview-todo-icon \{\s*display: inline-flex;\s*flex: none;\s*color: var\(--orca-subtle\);/);
});

test('only the newest usage load counts: an older answer that lands later changes nothing', async () => {
	// The usage retry starts load A; the overview's own retry starts load B
	// before A answers. Whatever order they land in, the tiles show B's answer.
	const pending = [];
	const view = (await overviewHarness())(
		{ platformCompanies: async () => overviewCompanies },
		{ usage: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) }
	);
	const settle = async (index, fails) => {
		if (fails) pending[index].reject(new Error('usage failed'));
		else pending[index].resolve(usageModule.platformUsage(answer));
		await new Promise((done) => setTimeout(done, 0));
	};

	// B fails, then A succeeds: B's failure stays, A's numbers never appear.
	const a = view.loadUsage();
	const b = view.load();
	await settle(1, true);
	await settle(0, false);
	await Promise.all([a, b]);
	assert.deepEqual([view.state.usageError, view.state.usage], ['usage failed', undefined]);

	// D succeeds, then C fails: D's numbers stay, C's failure never appears.
	const c = view.loadUsage();
	const d = view.loadUsage();
	await settle(3, false);
	await settle(2, true);
	await Promise.all([c, d]);
	assert.deepEqual([view.state.usageError, view.state.usage.toolCalls.last7Days], ['', 1210]);
	assert.equal(pending.length, 4);
});

// ---------------------------------------------------------------------------
// Customers never reach it
// ---------------------------------------------------------------------------

async function sources(dir) {
	const found = [];
	for (const entry of await readdir(new URL(dir, new URL('../../../../', import.meta.url)), { withFileTypes: true })) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) found.push(...(await sources(path)));
		else if (/\.(svelte|ts)$/.test(entry.name)) found.push(path);
	}
	return found;
}

test('only the platform overview calls the usage service, and the platform area mounts it for the ORCA team only', async () => {
	const root = new URL('../../../../', import.meta.url);
	const users = [];
	for (const file of await sources('src')) {
		const source = await readFile(new URL(file, root), 'utf8');
		if (/services\/orca-platform-usage['"]|platform\/PlatformUsage\.svelte['"]|PlatformUsageService/.test(source) && !file.endsWith('services/orca-platform-usage.ts')) users.push(file);
	}
	assert.deepEqual(users, ['src/lib/components/orca/views/PlatformOverview.svelte']);
	const view = await readFile(files.view, 'utf8');
	assert.match(view, /\{#if data\.platformOperator === true\}/);
	assert.match(view, /\{:else\}<PlatformOverview canReviewPilotRequests=/);
	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{:else if view === "platform" && data\.platformOperator\}/);
});

test('a failed catalog read holds back "nothing waiting", and a good reload clears it (Codex release review 65)', async () => {
	let fail = true;
	const view = (await overviewHarness())(
		{ platformCompanies: async () => overviewCompanies, candidates: async () => { if (fail) throw new Error('catalog failed'); return []; } },
		{ usage: async () => usageModule.platformUsage(answer) }
	);
	await view.load();
	assert.equal(view.state.catalogFailed, true);
	assert.equal(view.state.loading, false);
	fail = false;
	await view.load();
	assert.equal(view.state.catalogFailed, false);
	// A catalog still on its way keeps the overview loading: its to-do may still come (Codex release review 66).
	const slow = (await overviewHarness())(
		{ platformCompanies: async () => overviewCompanies, candidates: () => new Promise(() => {}) },
		{ usage: async () => usageModule.platformUsage(answer) }
	);
	void slow.load();
	await new Promise((done) => setTimeout(done, 0));
	assert.equal(slow.state.loading, true);
});
