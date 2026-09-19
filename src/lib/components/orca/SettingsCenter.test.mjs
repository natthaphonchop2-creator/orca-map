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
	const { page, localeHref, t, ArrowRight, BookOpen, Globe, LocaleSwitch, PilotInbox, OrcaMCPAccess } = deps;
	${code}
	return SettingsCenter;
}`;
const { component } = await import('data:text/javascript;base64,' + Buffer.from(module).toString('base64'));
function screen(section, data = {}) {
	const calls = [];
	const noop = () => {};
	const Screen = component({
		page: { url: new URL(`https://orca.example/app?view=settings&section=${section}`) },
		localeHref: (url) => url, t: (_th, en) => en,
		ArrowRight: noop, BookOpen: noop, Globe: noop, LocaleSwitch: noop, PilotInbox: noop,
		OrcaMCPAccess: (_renderer, props) => calls.push(props)
	});
	return { html: render(Screen, { props: { data, onchanged: async () => {} } }).body, calls };
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
