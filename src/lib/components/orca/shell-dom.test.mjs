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
const sources = ['src/lib/components/orca/AppShell.svelte', 'src/lib/components/orca/shell/PopMenu.svelte', 'src/lib/components/orca/shell/CreateMenu.svelte', 'src/lib/orca/rail.ts', 'src/lib/orca/menu-keys.ts'];

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
function api(pathname) {
	const p = pathname.replace(/^\/api/, '');
	if (p === '/me') return [200, { id: '7', email: 'manop@example.test', username: 'manop', iconURL: '', role: 1, effectiveRole: 1, groups: [] }];
	if (p === '/orca/bootstrap') return [200, bootstrap];
	if (p === '/orca/companies') return [404, { error: 'not found' }];
	if (p === '/app-preferences') return [200, {}];
	if (p === '/orca/me/ai-apps' || p === '/orca/secrets') return [200, { sessions: [], keys: [] }];
	return [200, { items: [] }];
}

async function open(browser, viewport) {
	const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US' });
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
			const [status, body] = api(url.pathname);
			return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		}
		const file = path.join(BUILD, decodeURIComponent(url.pathname));
		if (url.pathname !== '/' && existsSync(file) && statSync(file).isFile()) return route.fulfill({ path: file });
		return route.fulfill({ path: path.join(BUILD, 'fallback.html'), contentType: 'text/html' });
	});
	const page = await context.newPage();
	await page.goto(`${ORIGIN}/app?lang=en`, { waitUntil: 'networkidle' });
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
