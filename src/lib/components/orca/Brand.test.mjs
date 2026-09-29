import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { serverComponent } from './test-render.mjs';

// The workspace logo must be the official one. static/orca-assets/wordmark-light.svg and
// wordmark-dark.svg are the brand kit's orca-logo.svg and orca-logo-white.svg, unchanged
// (khum-obot docs/orca/brand/exports, 2026-09-08); Brand.svelte draws the same shapes inline.
const brand = new URL('./Brand.svelte', import.meta.url);
const kitFile = (name) => readFile(new URL(`../../../../static/orca-assets/${name}`, import.meta.url), 'utf8');

const shapes = (svg) => ({
	mark: svg.match(/<g\b[^>]*transform="rotate\(-14 17 17\)"[^>]*>([\s\S]*?)<\/g>/)?.[1].match(/<rect\b[^>]*>/g)?.map((rect) => rect.replace(/\s*\/?>$/, '')),
	paths: [...svg.matchAll(/<path\b[^>]*\btransform="([^"]+)"[^>]*\bd="([^"]+)"/g)].map(([, transform, d]) => ({ transform, d })),
});

async function renderBrand(props = {}) {
	const { warnings, Component } = await serverComponent(brand, {});
	return { warnings, html: render(Component, { props }).body };
}

test('Brand compiles with no warnings', async () => {
	const source = await readFile(brand, 'utf8');
	for (const generate of ['server', 'client']) assert.deepEqual(compile(source, { filename: 'Brand.svelte', generate }).warnings, [], generate);
});

test('the full logo is the brand kit logo: four strokes tilted -14 degrees, the outlined word and the citron full stop', async () => {
	const { warnings, html } = await renderBrand();
	assert.deepEqual(warnings, []);
	const kit = shapes(await kitFile('wordmark-light.svg'));
	assert.equal(kit.mark.length, 4);
	assert.equal(kit.paths.length, 5);
	assert.deepEqual(shapes(await kitFile('wordmark-dark.svg')), kit, 'both kit colourways share the shapes');
	assert.deepEqual(shapes(html), kit);
	assert.match(html, /<svg class="orca-logo[^"]*" viewBox="0 0 121\.996 34" aria-hidden="true" focusable="false">/);
	assert.equal(html.match(/<path class="orca-logo-dot\b[^"]*"/g)?.length, 1, 'the full stop is the last path');
	assert.match(html, /<path class="orca-logo-dot[^"]*" transform="translate\(113\.598000 27\.387000\)/);
});

test('compact is the mark only, in a square box', async () => {
	const { html } = await renderBrand({ compact: true });
	assert.match(html, /<span class="orca-brand[^"]*\bcompact\b[^"]*"/);
	assert.match(html, /viewBox="0 0 34 34"/);
	assert.deepEqual(shapes(html).mark, shapes(await kitFile('wordmark-light.svg')).mark);
	assert.deepEqual(shapes(html).paths, []);
});

test('screen readers get one name for the logo; the drawing itself is hidden', async () => {
	for (const props of [{}, { compact: true }, { dark: true }]) {
		const { html } = await renderBrand(props);
		assert.match(html, /^(?:<!--[^>]*-->)*<span class="orca-brand[^"]*" role="img" aria-label="ORCA ออก้า">/);
		assert.match(html, /<svg [^>]*aria-hidden="true"/);
	}
	assert.match((await renderBrand({ dark: true })).html, /<span class="orca-brand[^"]*\bdark\b/);
});

test('the logo files are the brand kit files, byte for byte (sha256 from the kit export-manifest.json)', async () => {
	const sha256 = async (name) => createHash('sha256').update(await readFile(new URL(`../../../../static/orca-assets/${name}`, import.meta.url))).digest('hex');
	assert.equal(await sha256('wordmark-light.svg'), '7b49d8d4a489ec31ecf8e9c205315d1eef564315b1233a681688cedfb9d65fa9', 'kit orca-logo.svg');
	assert.equal(await sha256('wordmark-dark.svg'), '414d3fddec46d38aa4cf43f6397ccb50f0e021036ea0609dcf7a7d32d2890329', 'kit orca-logo-white.svg');
	assert.match(await kitFile('icon.svg'), /<g fill="#151823" transform="rotate\(-14 17 17\)">/, 'the icon mark is kit ink');
});

test('Brand colours and sizing: theme ink, kit white when dark, citron full stop, kit proportions', async () => {
	const { css } = compile(await readFile(brand, 'utf8'), { filename: 'Brand.svelte', generate: 'client' });
	const code = css.code.replace(/\s+/g, ' ');
	assert.match(code, /\.orca-brand\.svelte-\w+ \{[^}]*color: var\(--orca-ink, #151823\);[^}]*vertical-align: top;|\.orca-brand\.svelte-\w+ \{[^}]*vertical-align: top;[^}]*color: var\(--orca-ink, #151823\);/);
	assert.match(code, /\.orca-brand\.dark\.svelte-\w+ \{ color: #f8f9fb; \}/);
	assert.match(code, /\.orca-logo\.svelte-\w+ \{[^}]*width: calc\(var\(--orca-brand-size, 34px\) \* 121\.996 \/ 34\);[^}]*height: var\(--orca-brand-size, 34px\);[^}]*overflow: visible;[^}]*fill: currentColor;/);
	assert.match(code, /\.orca-logo-dot\.svelte-\w+ \{ fill: #d7f471; \}/);
});

test('the icon file uses the same four strokes', async () => {
	const icon = await kitFile('icon.svg');
	assert.deepEqual(shapes(icon).mark, shapes(await kitFile('wordmark-light.svg')).mark);
	assert.deepEqual(shapes(icon).paths, []);
});
