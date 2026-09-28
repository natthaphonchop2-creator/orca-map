import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const { THEME_PREFERENCES } = await importTypeScript(new URL('../../orca/theme.ts', import.meta.url));
const themeSwitch = new URL('./ThemeSwitch.svelte', import.meta.url);
const themeSetting = new URL('./ThemeSetting.svelte', import.meta.url);
const english = (_th, en) => en;
const thai = (th) => th;

async function renderSwitch(props = {}, { preference = 'light', t = english, chosen = [] } = {}) {
	const { warnings, Component } = await serverComponent(themeSwitch, {
		t,
		THEME_PREFERENCES,
		orcaTheme: { preference, systemDark: false },
		setThemePreference: (choice) => chosen.push(choice),
	});
	return { warnings, html: render(Component, { props }).body };
}
const buttons = (html) => html.match(/<button\b[^>]*>/g) ?? [];

test('the switch and the settings row compile with no warnings', async () => {
	for (const file of [themeSwitch, themeSetting]) {
		const source = await readFile(file, 'utf8');
		for (const generate of ['server', 'client']) {
			const { warnings } = compile(source, { filename: file.pathname.split('/').pop(), generate });
			assert.deepEqual(warnings, [], `${file.pathname.split('/').pop()} (${generate})`);
		}
	}
});

test('three choices in a named group, and only the stored one is pressed', async () => {
	assert.deepEqual([...THEME_PREFERENCES], ['light', 'dark', 'system']);
	for (const preference of THEME_PREFERENCES) {
		const { warnings, html } = await renderSwitch({}, { preference });
		assert.deepEqual(warnings, []);
		assert.match(html, /<div class="o-theme[^"]*" role="group" aria-label="Theme">/);
		const found = buttons(html);
		assert.equal(found.length, 3);
		for (const button of found) assert.match(button, /type="button"/);
		assert.deepEqual(
			found.map((button) => button.match(/aria-pressed="(true|false)"/)?.[1]),
			THEME_PREFERENCES.map((choice) => String(choice === preference)),
			preference,
		);
		assert.equal(html.match(/class="[^"]*\bchosen\b/g)?.length, 1, 'one chosen look');
	}
});

test('words beside the icons in Settings; icons only, still named, in the compact switch', async () => {
	const { html } = await renderSwitch();
	assert.deepEqual([...html.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(([, words]) => words), ['Light', 'Dark', 'System']);
	for (const button of buttons(html)) assert.doesNotMatch(button, /aria-label=|title=/);
	assert.doesNotMatch(html, /\bcompact\b/);

	const compact = (await renderSwitch({ compact: true })).html;
	assert.match(compact, /class="o-theme\b[^"]*\bcompact\b/);
	assert.deepEqual(
		buttons(compact).map((button) => [button.match(/aria-label="([^"]+)"/)?.[1], button.match(/title="([^"]+)"/)?.[1]]),
		[['Light', 'Light'], ['Dark', 'Dark'], ['System', 'System']],
	);
	assert.doesNotMatch(compact, /<span/, 'no visible words');
});

test('the account menu row shows a Theme caption; the plain switch does not', async () => {
	const row = (await renderSwitch({ compact: true, label: true })).html;
	assert.match(row, /^(?:<!--[^>]*-->)*<div class="o-theme-row\b[^"]*"><span class="o-theme-caption\b[^"]*" aria-hidden="true">(?:<!---->)*Theme<\/span>\s*<div class="o-theme\b[^"]*\bcompact\b[^"]*" role="group" aria-label="Theme">/);
	assert.equal(buttons(row).length, 3);
	for (const props of [{}, { compact: true }]) assert.doesNotMatch((await renderSwitch(props)).html, /o-theme-row|o-theme-caption/);
});

test('Thai wording comes through t()', async () => {
	const { html } = await renderSwitch({}, { t: thai });
	assert.match(html, /aria-label="ธีม"/);
	assert.deepEqual([...html.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(([, words]) => words), ['สว่าง', 'มืด', 'ตามระบบ']);
	const compact = (await renderSwitch({ compact: true, label: true }, { t: thai })).html;
	assert.match(compact, /aria-label="ตามระบบ" title="ตามระบบ"/);
	assert.match(compact, />ธีม<\/span>/);
});

async function renderSetting(orcaTheme, t = english) {
	const mounted = [];
	const { warnings, Component } = await serverComponent(themeSetting, {
		t,
		orcaTheme,
		ThemeSwitch: (renderer, props) => {
			mounted.push(props);
			renderer.push('<div data-theme-switch></div>');
		},
	});
	return { warnings, mounted, html: render(Component, {}).body };
}

test('the settings row explains the choice and holds the full switch', async () => {
	const { warnings, mounted, html } = await renderSetting({ preference: 'light', systemDark: true });
	assert.deepEqual(warnings, []);
	assert.match(html, /<h2[^>]*>(?:<!---->)*Theme<\/h2>/);
	assert.match(html, /follow your device\. Remembered in this browser\./);
	assert.deepEqual(mounted, [{}], 'words and icons, not compact');
	assert.match(html, /<div class="theme-setting-control[^"]*"><div data-theme-switch><\/div>/);
	// The live region is there from the start and says nothing until "system" is chosen.
	assert.match(html, /<p class="theme-setting-device[^"]*" aria-live="polite"><\/p>/);
	assert.match((await renderSetting({ preference: 'dark', systemDark: true })).html, /aria-live="polite"><\/p>/);
});

test('following the device says what the device shows right now', async () => {
	assert.match((await renderSetting({ preference: 'system', systemDark: true })).html, /aria-live="polite">Your device is using dark mode right now\.<\/p>/);
	assert.match((await renderSetting({ preference: 'system', systemDark: false })).html, /aria-live="polite">Your device is using light mode right now\.<\/p>/);
	const thaiRow = (await renderSetting({ preference: 'system', systemDark: true }, thai)).html;
	assert.match(thaiRow, /aria-live="polite">ตอนนี้อุปกรณ์ใช้โหมดมืด<\/p>/);
	assert.match(thaiRow, />ธีม<\/h2>/);
	assert.match(thaiRow, /ตามการตั้งค่าของอุปกรณ์ · จำไว้ในเบราว์เซอร์นี้/);
});
