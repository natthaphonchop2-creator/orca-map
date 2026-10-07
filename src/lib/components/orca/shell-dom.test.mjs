import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

// Real DOM interaction for the shell's layers (Codex W0.1 round 2, NOTEs 2 and 3):
// the built app (build/) in Chromium, every /api call mocked, no server. The
// project has no DOM library and none may be installed, so this drives the
// browser the screenshots use. It skips, saying why, without Playwright or a
// build at least as new as the shell sources (run `vite build` first).
const PLAYWRIGHT = '/Users/natthaphon/Developer/MCP orgzi/outputs/node_modules/playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BUILD = path.join(root, 'build');
const ORIGIN = 'https://orca.test';
const sources = ['src/lib/components/orca/AppShell.svelte', 'src/lib/components/orca/shell/PopMenu.svelte', 'src/lib/components/orca/shell/CreateMenu.svelte', 'src/lib/components/orca/shell/JumpDialog.svelte', 'src/lib/components/orca/w01.css', 'src/lib/components/orca/w02.css', 'src/lib/orca/rail.ts', 'src/lib/orca/menu-keys.ts', 'src/lib/orca/jump-targets.ts', 'src/lib/orca/jump-cache.svelte.ts'];

function unavailable() {
	if (!existsSync(PLAYWRIGHT)) return `Playwright is not at ${PLAYWRIGHT}`;
	const page = path.join(BUILD, 'fallback.html');
	if (!existsSync(page)) return 'no build/: run vite build first';
	const built = statSync(page).mtimeMs;
	const stale = sources.find((file) => statSync(path.join(root, file)).mtimeMs > built);
	return stale ? `build/ is older than ${stale}: run vite build first` : '';
}
const skip = unavailable() || false;

const members = [{ id: '7', displayName: 'Manop', email: 'manop@example.test', role: 'owner' }];
const bootstrap = {
	organization: { displayName: 'Siam Herb', timezone: 'Asia/Bangkok', version: 1 },
	currentUserID: '7', canManage: true, canManageRoles: true, members, units: [], connections: [], hubs: [], unifiedConnectURL: 'https://orca.test/mcp', features: {}
};
function api(pathname, boot = bootstrap) {
	const p = pathname.replace(/^\/api/, '');
	if (p === '/me') return [200, { id: '7', email: 'manop@example.test', username: 'manop', iconURL: '', role: 1, effectiveRole: 1, groups: [] }];
	if (p === '/orca/bootstrap') return [200, boot];
	if (p === '/orca/companies') return [404, { error: 'not found' }];
	if (p === '/app-preferences') return [200, {}];
	if (p === '/orca/me/ai-apps' || p === '/orca/secrets') return [200, { sessions: [], keys: [] }];
	return [200, { items: [] }];
}

async function open(browser, viewport, { reducedMotion = 'no-preference', hasTouch = false, isMobile = false, boot = bootstrap, answer, target = '/app' } = {}) {
	const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US', reducedMotion, hasTouch, isMobile });
	await context.addInitScript(() => {
		try {
			localStorage.setItem('orca.workspace.rail.pinned', '0');
			// A new company starts with onboarding; this one has done it (onboarding.ts's key).
			localStorage.setItem('orca.w0.onboarding.default.7', 'done');
		} catch {}
	});
	await context.route(`${ORIGIN}/**`, async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.startsWith('/api/')) {
			const [status, body] = (await answer?.(url.pathname.replace(/^\/api/, ''))) ?? api(url.pathname, boot);
			return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		}
		const file = path.join(BUILD, decodeURIComponent(url.pathname));
		if (url.pathname !== '/' && existsSync(file) && statSync(file).isFile()) return route.fulfill({ path: file });
		return route.fulfill({ path: path.join(BUILD, 'fallback.html'), contentType: 'text/html' });
	});
	const page = await context.newPage();
	await page.goto(`${ORIGIN}${target}${target.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.w1-create');
	return { context, page };
}
const railOpen = (page) => page.evaluate(() => document.querySelector('.w1-rail').classList.contains('open'));
const focusIn = (page, selector) => page.evaluate((within) => !!document.activeElement?.closest(within), selector);

test('Esc with focus in the rail and a menu opened with the pointer: the menu closes first, then the rail, one per press', { skip }, async () => {
	const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
	const browser = await chromium.launch();
	try {
		const { context, page } = await open(browser, { width: 1440, height: 900 });
		await page.mouse.move(900, 500);
		// Keyboard focus on a rail item opens the panel.
		await page.focus('.w1-rail .w1-group > a.w1-item');
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab');
		assert.equal(await railOpen(page), true, 'keyboard focus opens the panel');
		assert.equal(await focusIn(page, '.w1-rail'), true);
		// A pointer click that does not move focus (Safari's buttons): the menu opens, focus stays in the rail.
		await page.evaluate(() => document.querySelector('.w1-create').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })));
		await page.waitForSelector('#orca-create-menu');
		assert.equal(await focusIn(page, '.w1-rail'), true, 'focus is still in the rail');
		await page.keyboard.press('Escape');
		assert.equal(await page.locator('#orca-create-menu').count(), 0, 'the first Esc closes the menu');
		assert.equal(await railOpen(page), true, 'and only the menu');
		assert.equal(await focusIn(page, '.w1-rail'), true, 'focus goes back to where it was');
		await page.keyboard.press('Escape');
		assert.equal(await railOpen(page), false, 'the next Esc closes the rail');
		await context.close();
	} finally {
		await browser.close();
	}
});

test('⌘K from a row of the phone สร้าง sheet: the sheet closes first, and Esc from ไปที่… returns focus to สร้าง', { skip }, async () => {
	const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
	const browser = await chromium.launch();
	try {
		const { context, page } = await open(browser, { width: 390, height: 844 });
		await page.click('.w1-create');
		await page.waitForSelector('dialog.pm-sheet[open]');
		assert.equal(await page.evaluate(() => document.querySelector('dialog.pm-sheet').matches(':modal')), true, 'a modal sheet');
		assert.equal(await focusIn(page, 'dialog.pm-sheet [role="menuitem"]'), true, 'focus on a row');
		await page.keyboard.press('Meta+KeyK');
		await page.waitForSelector('dialog.orca-modal[open]');
		assert.equal(await page.locator('dialog.pm-sheet').count(), 0, 'the sheet is gone');
		assert.equal(await page.evaluate(() => document.querySelectorAll('dialog:modal').length), 1, 'only ไปที่… is modal');
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => !document.querySelector('dialog.orca-modal[open]'));
		assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('w1-create')), true, 'focus is back on สร้าง');
		await context.close();
	} finally {
		await browser.close();
	}
});

// W0.2 (owner, "ปุ่มค้นหาใช้ไม่ได้"): on the collapsed rail the panel opens when the
// pointer arrives, so a click on ค้นหา must land on ค้นหา: no rail item moves while it opens.
// Chromium and, when installed, WebKit (the owner uses Safari).
test('the rail never moves under the pointer while it opens: every icon keeps its place, the click on ค้นหา opens search', { skip }, async () => {
	const pw = createRequire(import.meta.url)(PLAYWRIGHT);
	for (const engine of ['chromium', 'webkit']) {
		let browser;
		try {
			browser = await pw[engine].launch();
		} catch {
			continue; // that engine is not installed here
		}
		try {
			const { context, page } = await open(browser, { width: 1440, height: 900 });
			const icons = () => page.evaluate(() => [...document.querySelectorAll('.w1-rail .w1-item:not(.w1-subitem) > :is(svg, .mcp-mark), .w1-rail .w1-brand')].map((icon) => {
				const box = icon.getBoundingClientRect();
				return `${icon.closest('[data-label], .w1-brand')?.getAttribute('data-label') ?? 'mark'} ${box.left.toFixed(1)},${box.top.toFixed(1)}`;
			}));
			await page.mouse.move(900, 500);
			const closed = await icons();
			assert.ok(closed.length >= 8, `${engine}: the rail's icons`);
			const jump = await page.locator('.w1-rail .w1-jump > svg').boundingBox();
			const x = jump.x + jump.width / 2, y = jump.y + jump.height / 2;
			await page.mouse.move(x, y, { steps: 3 });
			for (const wait of [40, 120, 230, 270, 330, 450]) {
				await page.waitForTimeout(wait === 40 ? 40 : 60);
				assert.deepEqual(await icons(), closed, `${engine}: the icons at about ${wait} ms into the hover`);
				assert.equal(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.w1-jump'), [x, y]), true, `${engine}: ค้นหา is still under the pointer`);
			}
			assert.equal(await railOpen(page), true, `${engine}: the panel opened`);
			assert.deepEqual(await icons(), closed, `${engine}: open, the icons are where they were`);
			await page.mouse.down();
			await page.mouse.up();
			await page.waitForSelector('dialog.orca-jump[open]');
			assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox', `${engine}: the search field has focus`);
			await context.close();
		} finally {
			await browser.close();
		}
	}
});

test('ค้นหา… finds a settings tab and a person, opens the active row on Enter, and says what it searched when nothing matches', { skip }, async () => {
	const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
	const browser = await chromium.launch();
	try {
		const { context, page } = await open(browser, { width: 1440, height: 900 });
		await page.keyboard.press('Control+KeyK');
		await page.waitForSelector('dialog.orca-jump[open]');
		const groups = () => page.$$eval('.jump-group-label', (nodes) => nodes.map((node) => node.textContent.trim()));
		assert.deepEqual(await groups(), ['Pages', 'Create'], 'with no query: pages and the สร้าง actions');
		await page.keyboard.type('manop');
		assert.deepEqual(await groups(), ['Members']);
		assert.match(await page.locator('.jump-row.active').textContent(), /Manop/);
		await page.fill('dialog.orca-jump input', 'zzqx');
		assert.match(await page.locator('.jump-empty').textContent(), /Nothing found for “zzqx”[\s\S]*a page, a program, a person or knowledge/);
		await page.fill('dialog.orca-jump input', 'acc');
		const rows = await page.$$eval('.jump-row', (nodes) => nodes.map((node) => node.querySelector('.jump-label').textContent));
		const at = rows.indexOf('My account');
		assert.ok(at >= 0, `ตั้งค่า's บัญชีของฉัน is listed: ${rows}`);
		for (let i = 0; i < at; i++) await page.keyboard.press('ArrowDown');
		assert.equal(await page.locator('.jump-row.active .jump-label').textContent(), 'My account');
		await page.keyboard.press('Enter');
		await page.waitForFunction(() => location.search.includes('section=account'));
		assert.equal(await page.locator('dialog.orca-jump[open]').count(), 0, 'the dialog closed');
		await context.close();
	} finally {
		await browser.close();
	}
});

test('reduced motion turns the W0.2 transitions and animations off', { skip }, async () => {
	const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
	const browser = await chromium.launch();
	try {
		const read = (page) => page.evaluate(() => {
			const seconds = (value) => Math.max(...value.split(',').map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1)));
			const style = (selector) => getComputedStyle(document.querySelector(selector));
			return { rail: seconds(style('.w1-rail').transitionDuration), item: seconds(style('.w1-rail .w1-item').transitionDuration), create: seconds(style('.w1-create').transitionDuration) };
		});
		const moving = await open(browser, { width: 1440, height: 900 });
		const on = await read(moving.page);
		assert.ok(on.rail >= 0.15 && on.rail <= 0.22, `the rail slides (${on.rail}s)`);
		assert.ok(on.item >= 0.15 && on.create >= 0.15, 'rows and buttons ease their colours');
		await moving.page.keyboard.press('Control+KeyK');
		await moving.page.waitForSelector('dialog.orca-jump[open]');
		assert.notEqual(await moving.page.evaluate(() => getComputedStyle(document.querySelector('dialog.orca-jump')).animationName), 'none', 'the dialog rises in');
		await moving.context.close();
		const still = await open(browser, { width: 1440, height: 900 }, { reducedMotion: 'reduce' });
		const off = await read(still.page);
		assert.ok(off.rail < 0.001 && off.item < 0.001 && off.create < 0.001, `no transitions: ${JSON.stringify(off)}`);
		await still.page.keyboard.press('Control+KeyK');
		await still.page.waitForSelector('dialog.orca-jump[open]');
		assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('dialog.orca-jump')).animationName), 'none', 'no animation');
		await still.context.close();
	} finally {
		await browser.close();
	}
});

// The visual sweep of W0.2: on a fresh page ⌘K then a knowledge title found nothing,
// because titles came only from an opened library. The first opening now loads the
// titles of the workspaces the viewer can use, quietly, and typing never waits.
test('a cold search finds knowledge after the first opening loads it: only usable workspaces, no templates while the flag is off, a quiet loading row', { skip }, async () => {
	const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
	const browser = await chromium.launch();
	try {
		const hubs = [
			{ id: 'sales', name: 'Sales desk', status: 'active', memberIDs: ['7'], effectiveMemberIDs: ['7'], unitIDs: [], toolNames: [], connectionID: '', dailyLimit: 0, version: 1, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0, description: '' },
			{ id: 'hr', name: 'People desk', status: 'active', memberIDs: ['8'], effectiveMemberIDs: ['8'], unitIDs: [], toolNames: [], connectionID: '', dailyLimit: 0, version: 1, createdAt: '', updatedAt: '', connectURL: '', usedToday: 0, description: '' }
		];
		const asked = [];
		let release;
		const held = new Promise((resolve) => (release = resolve));
		const answer = async (p) => {
			if (!/^\/orca\/hubs\//.test(p)) return undefined;
			asked.push(p);
			if (p === '/orca/hubs/sales/library') {
				await held;
				return [200, { items: [{ id: 'k1', hubID: 'sales', title: 'Return policy', kind: 'knowledge', status: 'published', ownerID: '7', createdAt: '', updatedAt: '', version: 1 }], departments: [], members: [] }];
			}
			return [200, { items: [] }];
		};
		const { context, page } = await open(browser, { width: 1440, height: 900 }, { boot: { ...bootstrap, hubs }, answer });
		assert.deepEqual(asked, [], 'nothing is fetched before the search opens');
		await page.keyboard.press('Control+KeyK');
		await page.waitForSelector('dialog.orca-jump[open]');
		await page.keyboard.type('policy');
		await page.waitForSelector('.jump-loading');
		assert.match(await page.locator('.jump-loading').textContent(), /Loading knowledge/);
		assert.equal(await page.locator('.jump-empty').count(), 0, 'no "Nothing found" while it loads');
		assert.equal(await page.locator('dialog.orca-jump input').inputValue(), 'policy', 'typing went through meanwhile');
		release();
		await page.waitForSelector('.jump-row');
		assert.equal(await page.locator('.jump-loading').count(), 0, 'the loading row goes');
		assert.equal(await page.locator('.jump-row.active .jump-label').textContent(), 'Return policy');
		assert.deepEqual(asked, ['/orca/hubs/sales/library'], 'only the usable workspace, and no templates while the flag is off');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Control+KeyK');
		await page.waitForSelector('dialog.orca-jump[open]');
		assert.equal(asked.length, 1, 'loaded once per page');
		await context.close();
	} finally {
		await browser.close();
	}
});

// Codex W0.2 round 1, MINOR 3: every tab bar and segment keeps a 40 px tap target on a touch screen.
test('on a touch screen the tab bars and segments are at least 40 px tall (ทีม\'s สมาชิก · คำเชิญ · แผนก included)', { skip }, async () => {
	const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
	const browser = await chromium.launch();
	try {
		const { context, page } = await open(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true, target: '/app?view=members' });
		assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'a coarse pointer');
		await page.waitForSelector('.team-tabs button');
		const heights = await page.$$eval('.team-tabs button, .orca-page-tabs a', (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
		assert.ok(heights.length >= 4, `the tabs: ${heights}`);
		assert.ok(heights.every((height) => height >= 40), `all at least 40 px: ${heights}`);
		await context.close();
	} finally {
		await browser.close();
	}
});
