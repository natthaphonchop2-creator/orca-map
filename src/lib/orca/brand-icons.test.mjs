import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Browser, home-screen and legacy-alias icons are the brand kit mark (four 6-unit strokes
// tilted -14 degrees, unchanged) in citron #d7f471 on the ink #151823 tile: the owner's
// choice B of 2026-09-30, for every ORCA tab icon. Rendered by Chromium from
// static/orca/favicon.svg (16/32/48) and the same mark at 1.17x (180/192/512).
const file = (name) => readFile(new URL(`../../../static/${name}`, import.meta.url));
const sha256 = async (name) => createHash('sha256').update(await file(name)).digest('hex');
const rects = (svg) => svg.match(/<rect x="[^"]*" y="[^"]*" width="6" height="[^"]*" rx="3"\/>/g);

test('the favicon SVG is the kit mark, unchanged, in citron on the ink tile', async () => {
	const tile = String(await file('orca/favicon.svg'));
	assert.match(tile, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#151823"\/><g fill="#d7f471" transform="translate\(9\.23 6\.6\) scale\(1\.44\) rotate\(-14 17 17\)">/);
	assert.deepEqual(rects(tile), rects(String(await file('orca-assets/wordmark-light.svg'))), 'the same four strokes as the kit logo');
	for (const alias of ['orca-assets/favicon.svg', 'khum-assets/favicon.svg']) assert.equal(String(await file(alias)), tile, alias);
});

test('the raster icons are the approved renders of the tile', async () => {
	const approved = {
		'favicon.ico': '77a5a1fdad151adb8801f1b9720d9c2056e7740c8be2dd068a14305d20161f0d',
		'favicon-16x16.png': '89b1e9c2a378e3a2044df702cd0578480c67f09561bf05102fd55844ef4b07ca',
		'favicon-32x32.png': '96aba832f84bfb239f0022864d7ceb443e1d17dcbbf0d3181e33862dd4343559',
		'apple-touch-icon.png': '6cdc6f81e9d9e1b370c370a3ff0ee969bdc92cb583ef986f64bedac04ce1c081',
		'android-chrome-192x192.png': '7b22c7b1a47f2161edef4d2f9e1544fa8f85224816506599c098cc9ff19e1695',
		'android-chrome-512x512.png': '3ad4a75a43420ef3c215656eff92de22b7f208b2601db7cc70d90ff0968fb570'
	};
	for (const [name, hash] of Object.entries(approved)) assert.equal(await sha256(name), hash, name);
});

test('the legacy /khum-assets logo files are the kit files, like /orca-assets', async () => {
	for (const name of ['icon.svg', 'wordmark-light.svg', 'wordmark-dark.svg']) assert.equal(await sha256(`khum-assets/${name}`), await sha256(`orca-assets/${name}`), name);
});

test('every icon link in app.html carries the new cache token', async () => {
	const html = String(await readFile(new URL('../../app.html', import.meta.url)));
	const links = html.match(/<link rel="(?:icon|apple-touch-icon)"[^>]*>/g);
	assert.equal(links.length, 4);
	for (const link of links) assert.match(link, /\?v=orca-kit-20261001"/);
	// Keep "any" on the ICO link, never "32x32" (workspace-ux-plan §7).
	assert.match(html, /<link rel="icon" href="\/favicon\.ico\?v=orca-kit-20261001" sizes="any" \/>/);
});
