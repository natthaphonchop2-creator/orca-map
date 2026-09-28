import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('./SettingsCenter.svelte', import.meta.url), 'utf8');
const result = compile(source, { filename: 'SettingsCenter.svelte', generate: 'server' });
const code = result.js.code.replace(/^import[\s\S]*?;\n/gm, '').replace('export default function SettingsCenter', 'function SettingsCenter');
const module = `import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
export function component(deps) {
	const { page, localeHref, t, ArrowRight, BookOpen, Globe, LocaleSwitch, PilotInbox, OrcaMCPAccess, PlatformCompanies, ThemeSetting } = deps;
	${code}
	return SettingsCenter;
}`;
const { component } = await import('data:text/javascript;base64,' + Buffer.from(module).toString('base64'));
function screen(section, data = {}) {
	const calls = [];
	const themes = [];
	const noop = () => {};
	const Screen = component({
		page: { url: new URL(`https://orca.example/app?view=settings&section=${section}`) },
		localeHref: (url) => url, t: (_th, en) => en,
		ArrowRight: noop, BookOpen: noop, Globe: noop, LocaleSwitch: noop, PilotInbox: noop,
		OrcaMCPAccess: (_renderer, props) => calls.push(props),
		PlatformCompanies: () => calls.push('companies'),
		ThemeSetting: (renderer) => { themes.push(section); renderer.push('<div data-theme-setting></div>'); },
	});
	return { html: render(Screen, { props: { data, onchanged: async () => {} } }).body, calls, themes };
}
test('Connect AI is a settings tab available to an ordinary signed-in member', () => {
	const data = { currentUserID: 'member-one', canManage: false };
	const { html, calls } = screen('ai', data);
	assert.match(html, /section=ai/);
	assert.match(html, /Connect AI/);
	assert.match(html, /aria-current="page"[^>]*>Connect AI/);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].data, data);
});
test('key UI is not mounted on other settings tabs or an unknown section', () => {
	for (const section of ['preferences', 'additional', 'owner', 'unknown']) assert.equal(screen(section).calls.length, 0);
});
test('only the platform operator gets the customer companies section', () => {
	const operator = { currentUserID: '1', canManage: true, platformOperator: true };
	let { html, calls } = screen('companies', operator);
	assert.match(html, /section=companies[^>]*>Customer companies/);
	assert.match(html, /aria-current="page"[^>]*>Customer companies/);
	assert.deepEqual(calls, ['companies']);
	for (const data of [{ currentUserID: '2', canManage: true }, { currentUserID: '3', canManage: true, platformOperator: false }]) {
		({ html, calls } = screen('companies', data));
		assert.doesNotMatch(html, /Customer companies/);
		assert.deepEqual(calls, [], 'no companies for anyone else, even by address');
	}
	// Other sections never mount it, even for the operator.
	for (const section of ['preferences', 'ai', 'additional', 'owner']) {
		assert.ok(!screen(section, operator).calls.includes('companies'), section);
	}
});
test('the theme choice is a row of General, after the display language, and nowhere else', () => {
	const { html, themes } = screen('preferences');
	assert.equal(themes.length, 1);
	// The last row of the same panel as the display language.
	assert.match(html, /<section class="settings-panel[^"]*">(?:(?!<\/section>)[\s\S])*Display language(?:(?!<\/section>)[\s\S])*<div data-theme-setting><\/div>(?:<!---->|\s)*<\/section>/);
	assert.equal(screen('unknown').themes.length, 1, 'an unknown section falls back to General');
	const everyone = { currentUserID: '1', canManage: true, platformOperator: true, canReviewPilotRequests: true };
	for (const section of ['ai', 'additional', 'companies', 'owner']) {
		const other = screen(section, everyone);
		assert.deepEqual(other.themes, [], section);
		assert.doesNotMatch(other.html, /data-theme-setting/, section);
	}
});
