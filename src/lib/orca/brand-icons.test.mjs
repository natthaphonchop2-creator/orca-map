import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Browser, home-screen and legacy-alias icons are the brand kit mark (four 6-unit strokes
// tilted -14 degrees, unchanged) on the citron #d7f471 tile. Rendered by Chromium from
// static/orca/favicon.svg; the owner approved these exact files before release.
const file = (name) => readFile(new URL(`../../../static/${name}`, import.meta.url));
const sha256 = async (name) => createHash('sha256').update(await file(name)).digest('hex');
const rects = (svg) => svg.match(/<rect x="[^"]*" y="[^"]*" width="6" height="[^"]*" rx="3"\/>/g);

test('the favicon SVG is the kit mark, unchanged, on the citron tile', async () => {
	const tile = String(await file('orca/favicon.svg'));
	assert.match(tile, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#d7f471"\/><g fill="#151823" transform="translate\(9\.23 6\.6\) scale\(1\.44\) rotate\(-14 17 17\)">/);
	assert.deepEqual(rects(tile), rects(String(await file('orca-assets/wordmark-light.svg'))), 'the same four strokes as the kit logo');
	for (const alias of ['orca-assets/favicon.svg', 'khum-assets/favicon.svg']) assert.equal(String(await file(alias)), tile, alias);
});

test('the raster icons are the approved renders of the tile', async () => {
	const approved = {
		'favicon.ico': '9618c58ca17f0b4c6712c5660e475254c915b67d1ad6a9fbfbba317e3aac4c39',
		'favicon-16x16.png': 'e5a30ad4e0bd212f318bb884161218f8b2f9a74672291a7c09bbabda7a778700',
		'favicon-32x32.png': 'cf69f43e8c86af41616ccde35090aab7ec1007b36a41b1478a894a74faca9a40',
		'apple-touch-icon.png': 'd4e6aad19f4a2ad75b78c29dec605665a24326f42ba8898d46949821daf91e2b',
		'android-chrome-192x192.png': 'ec8129f0a79b977beae992ca2f4fb80af57dc5d82bb3e6a124ca95388070f03e',
		'android-chrome-512x512.png': '4b6775ce619af05030c0e8c3c42e2ecb5389f7704a19fe38bb08e5da87fd1f89'
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
	for (const link of links) assert.match(link, /\?v=orca-kit-20260929"/);
});
