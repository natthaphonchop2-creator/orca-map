import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// The W0 first run: two screens for a new company's Owner or Admin, skippable,
// remembered in this browser only.
const onboarding = await importTypeScript(new URL('../../orca/onboarding.ts', import.meta.url));
const catalogHelpers = await importTypeScript(new URL('../../orca/program-catalog.ts', import.meta.url));
const navigation = await importTypeScript(new URL('../../orca/navigation.ts', import.meta.url));
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const memory = () => {
	const store = new Map();
	return { store, getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
};

test('who sees it: an Owner or Admin on Home while the company has no program, until done; view=welcome on purpose', () => {
	const base = { view: 'dashboard', canManage: true, platform: false, connections: [], done: false };
	assert.equal(onboarding.showsOnboarding(base), true);
	assert.equal(onboarding.showsOnboarding({ ...base, done: true }), false, 'finished or skipped');
	assert.equal(onboarding.showsOnboarding({ ...base, canManage: false }), false, 'never an employee');
	assert.equal(onboarding.showsOnboarding({ ...base, connections: [{ id: 'c' }] }), false, 'a program is connected');
	assert.equal(onboarding.showsOnboarding({ ...base, connections: [{ id: 'c', archivedAt: 'x' }] }), true, 'archived ones do not count');
	assert.equal(onboarding.showsOnboarding({ ...base, view: 'servers' }), false, 'only on Home');
	assert.equal(onboarding.showsOnboarding({ ...base, view: 'platform', platform: true }), false);
	assert.equal(onboarding.showsOnboarding({ ...base, view: 'welcome', done: true, connections: [{ id: 'c' }] }), true, 'view=welcome forces it');
	assert.equal(onboarding.showsOnboarding({ ...base, view: 'welcome', canManage: false }), false);
	// Employees are sent Home by the router as well.
	assert.equal(navigation.appNavigation(new URLSearchParams('view=welcome'), { role: { canManage: false } }).redirect, '/app');
});

test('skip and finish are remembered per company and account; without storage, for this page', () => {
	const storage = memory();
	const key = onboarding.onboardingKey('org-1', 'u1');
	assert.equal(key, 'orca.w0.onboarding.org-1.u1');
	assert.equal(onboarding.onboardingDone(() => storage, key), false);
	onboarding.finishOnboarding(() => storage, key);
	assert.equal(storage.store.get(key), 'done');
	assert.equal(onboarding.onboardingDone(() => storage, key), true);
	assert.equal(onboarding.onboardingDone(() => storage, onboarding.onboardingKey('org-2', 'u1')), false, 'another company asks again');
	// Storage that throws (a private window): nothing breaks, and skipping still holds for this page.
	const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
	const other = onboarding.onboardingKey('org-3', 'u1');
	assert.equal(onboarding.onboardingDone(() => broken, other), false);
	onboarding.finishOnboarding(() => broken, other);
	assert.equal(onboarding.onboardingDone(() => broken, other), true);
	assert.equal(onboarding.onboardingDone(() => undefined, onboarding.onboardingKey('org-4', 'u1')), false);
});

test('the answer stays local: roles and title, unknown roles dropped, and it never throws', () => {
	const storage = memory();
	const key = onboarding.rolesKey('org-1', 'u1');
	onboarding.saveAnswer(() => storage, key, { roles: ['finance', 'owner'], title: '  กรรมการผู้จัดการ ' });
	assert.deepEqual(JSON.parse(storage.store.get(key)), { roles: ['finance', 'owner'], title: 'กรรมการผู้จัดการ' });
	assert.deepEqual(onboarding.readAnswer(() => storage, key), { roles: ['finance', 'owner'], title: 'กรรมการผู้จัดการ' });
	storage.setItem(key, JSON.stringify({ roles: ['finance', 'admin', 3], title: 5 }));
	assert.deepEqual(onboarding.readAnswer(() => storage, key), { roles: ['finance'], title: '' });
	storage.setItem(key, '{not json');
	assert.deepEqual(onboarding.readAnswer(() => storage, key), { roles: [], title: '' });
	const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
	onboarding.saveAnswer(() => broken, key, { roles: ['it'], title: '' });
	assert.deepEqual(onboarding.readAnswer(() => broken, key), { roles: [], title: '' });
	// Nothing in the module or the screen sends it anywhere.
	return Promise.all([
		readFile(new URL('../../orca/onboarding.ts', import.meta.url), 'utf8'),
		readFile(new URL('./onboarding/Onboarding.svelte', import.meta.url), 'utf8')
	]).then(([module, screen]) => {
		assert.doesNotMatch(module, /fetch|OrcaService|doPost|doPut/);
		assert.doesNotMatch(screen, /OrcaService|doPost|doPut|\.save\(|updateMember/);
	});
});

test('suggestions by role, in order, at most six, from the catalog only', () => {
	assert.deepEqual(onboarding.suggestedPrograms(['finance']), ['flowaccount', 'peak', 'gmail', 'drive', 'sheets', 'line']);
	assert.deepEqual(onboarding.suggestedPrograms(['online']), ['shopee', 'lazada', 'line', 'facebook', 'gmail', 'drive']);
	assert.deepEqual(onboarding.suggestedPrograms(['marketing']), ['canva', 'facebook', 'line', 'drive', 'gmail', 'sheets']);
	assert.deepEqual(onboarding.suggestedPrograms([]), ['gmail', 'drive', 'sheets', 'line']);
	assert.deepEqual(onboarding.suggestedPrograms(['owner', 'it']), ['gmail', 'drive', 'sheets', 'line']);
	assert.equal(onboarding.suggestionFor(['owner', 'finance']), 'finance');
	assert.equal(onboarding.suggestionFor(['owner']), undefined);
	const sources = [
		{ id: 'default-orca-flowaccount', name: 'FlowAccount' }, { id: 'default-orca-peak', name: 'PEAK' },
		{ id: 'default-orca-api-line-messaging', name: 'LINE OA (Messaging API)' }, { id: 'drive', name: 'Google Drive' },
		{ id: 'guide-lazada-seller-api', name: 'Lazada Seller API', guideOnly: true }, { id: 'x', name: 'Notion' }
	];
	assert.deepEqual(onboarding.pickSuggested(sources, ['finance']).map((source) => source.id), ['default-orca-flowaccount', 'default-orca-peak', 'drive', 'default-orca-api-line-messaging']);
	assert.deepEqual(onboarding.pickSuggested(sources, ['online']).map((source) => source.id), ['guide-lazada-seller-api', 'default-orca-api-line-messaging', 'drive'], 'a guide shows as เร็วๆ นี้ rather than nothing');
});

async function screen(page, extra = {}) {
	const { warnings, Component } = await serverComponent(new URL('./onboarding/Onboarding.svelte', import.meta.url), {
		...onboarding, ...catalogHelpers, t: (th) => th, localeHref: (path) => path, orcaLocale: { value: 'th' }, currentCompany: () => 'org-1',
		catalogSource: (source) => source, goto: async () => {}, onMount: () => {}, ProgramService: { candidates: async () => [] }, ...extra
	});
	assert.deepEqual(warnings, []);
	const data = { currentUserID: 'u1', canManage: true, platformOperator: false, organization: { displayName: 'สยามเฮิร์บ จำกัด' }, connections: [], hubs: [], members: [] };
	return render(Component, { props: { data, page } }).body;
}

test('screen 1: the role chips (real toggles), an optional title, ข้าม and ต่อไป; two dots, no numbers or steps', async () => {
	const html = await screen(1);
	const plain = text(html);
	assert.match(html, /<h1 id="onb-roles"[^>]*>คุณดูแลงานด้านไหน<\/h1>/);
	assert.match(plain, /เลือกได้หลายข้อ เพื่อแนะนำโปรแกรมให้ตรงงาน/);
	assert.equal(html.match(/class="onb-chip[^"]*" aria-pressed="false"/g)?.length, 9);
	for (const role of ['เจ้าของกิจการ', 'บัญชีและการเงิน', 'ขายและบริการลูกค้า', 'ขายออนไลน์', 'การตลาด', 'บุคคล', 'จัดซื้อและสต็อก', 'ไอที', 'อื่น ๆ']) assert.match(plain, new RegExp(role));
	assert.match(plain, /ตำแหน่ง ไม่บังคับ/);
	assert.match(html, />ข้าม<\/button>/);
	assert.match(html, /class="k-button primary lg[^"]*"[^>]*>ต่อไป<\/button>/);
	assert.equal(html.match(/k-button primary/g)?.length, 1);
	assert.match(html, /aria-label="หน้าแรกจากสองหน้า"/);
	assert.doesNotMatch(plain, /ขั้นตอน|\d+ \/ 2|1 จาก 2|ประมาณ \d+ นาที/);
	assert.match(plain, /สยามเฮิร์บ จำกัด/, 'the company top right');
	assert.doesNotMatch(html, /workspace-sidebar|workspace-nav/, 'no sidebar');
});

test('screen 2: suggested programs with เชื่อม or ✓ เชื่อมแล้ว, ดูโปรแกรมทั้งหมด, the one hint, ย้อนกลับ and เข้าใช้ ORCA', async () => {
	const html = await screen(2);
	const plain = text(html);
	assert.match(html, /<h1[^>]*>เชื่อมโปรแกรมที่ใช้<\/h1>/);
	assert.match(plain, /แนะนำสำหรับธุรกิจไทย/);
	assert.match(plain, /ดูโปรแกรมทั้งหมด/);
	assert.match(plain, /ใช้บัญชีของคุณเอง AI เห็นเท่าที่บัญชีนั้นเห็น/);
	assert.match(html, /href="\/app\?view=welcome"[^>]*>ย้อนกลับ<\/a>/);
	assert.match(html, /class="k-button primary lg[^"]*"[^>]*>เข้าใช้ ORCA<\/button>/);
	assert.match(html, /aria-label="หน้าที่สองจากสองหน้า"/);
	const source = await readFile(new URL('./onboarding/Onboarding.svelte', import.meta.url), 'utf8');
	// Admins see เชื่อมแล้ว here too; เชื่อม connects and comes back to this screen.
	assert.match(source, /\{#if card\.state === 'connected'\}<span class="onb-state"><Check [^>]*\/>\{t\('เชื่อมแล้ว', 'Connected'\)\}/);
	assert.doesNotMatch(source, /ใช้ได้'/);
	assert.match(source, /&step=connect&return=welcome/);
	assert.match(source, /<CatalogModal[\s\S]*?returnTo="welcome"/);
	// At ≤480 px the hint stacks under ดูโปรแกรมทั้งหมด, left-aligned (visual review fix 5).
	const narrow = source.slice(source.indexOf('@media (max-width: 480px)'));
	assert.match(narrow, /\.onb-below \{\s*flex-direction: column;\s*align-items: flex-start;/);
	assert.match(narrow, /\.onb-hint \{\s*text-align: left;/);
	// Citron only on the page dots and the one link underline.
	assert.equal(source.match(/--orca-citron/g)?.length, 2);
	// The phone keeps the actions at the bottom, full width.
	assert.match(source, /\.onb-actions \{\s*position: fixed;/);
});

test('the app page shows it where the first run starts, outside the shell, and it can be skipped', async () => {
	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{:else if onboarding && data\}<Onboarding \{data\} page=\{navigation\.params\.get\("page"\) === "2" \? 2 : 1\} ondone=\{\(\) => \(onboardingFinished = true\)\} \/>\s*\{:else\}\s*<AppShell/);
	assert.match(page, /showsOnboarding\(\{\s*view,\s*canManage: data\.canManage,/);
	assert.match(page, /onboardingDone\(localStorageOrNothing, onboardingKey\(currentCompany\(\), data\.currentUserID\)\)/);
	const screenSource = await readFile(new URL('./onboarding/Onboarding.svelte', import.meta.url), 'utf8');
	assert.match(screenSource, /function finish\(\) \{[\s\S]*?finishOnboarding\(storage, doneKey\);[\s\S]*?goto\(localeHref\('\/app'\)\)/, 'ข้าม and เข้าใช้ ORCA finish it');
	assert.match(screenSource, /onclick=\{finish\}>\{t\('ข้าม', 'Skip'\)\}/);
});
