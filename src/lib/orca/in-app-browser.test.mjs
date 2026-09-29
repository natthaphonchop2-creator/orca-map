import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { inAppBrowser, lineExternalURL, shareableURL } = await importTypeScript(new URL('./in-app-browser.ts', import.meta.url));

const UA = {
	lineIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0',
	lineAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Line/14.10.0/IAB',
	facebookAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]',
	facebookIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/th_TH;FBOP/5]',
	messenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/460.0]',
	instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone15,2; iOS 17_5; th_TH)',
	safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	chrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
	desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
};

test('LINE and Facebook in-app browsers are recognised; real browsers are not', () => {
	assert.equal(inAppBrowser(UA.lineIOS), 'line');
	assert.equal(inAppBrowser(UA.lineAndroid), 'line');
	for (const ua of [UA.facebookAndroid, UA.facebookIOS, UA.messenger, UA.instagram]) assert.equal(inAppBrowser(ua), 'facebook', ua);
	for (const ua of [UA.safari, UA.chrome, UA.desktop, '', undefined, null]) assert.equal(inAppBrowser(ua), undefined, String(ua));
	// "Line" as a word elsewhere is not the LINE app.
	assert.equal(inAppBrowser('Mozilla/5.0 Headline/2.0 Safari'), undefined);
});

test('LINE opens the same page in the phone\'s browser; the copied link stays clean', () => {
	assert.equal(lineExternalURL('https://orca.example.test/login?rd=%2Fapp'), 'https://orca.example.test/login?rd=%2Fapp&openExternalBrowser=1');
	assert.equal(lineExternalURL('https://orca.example.test/invite/abc?openExternalBrowser=1'), 'https://orca.example.test/invite/abc?openExternalBrowser=1');
	assert.equal(shareableURL('https://orca.example.test/invite/abc?openExternalBrowser=1'), 'https://orca.example.test/invite/abc');
	assert.equal(shareableURL('https://orca.example.test/login?rd=%2Fapp&openExternalBrowser=1'), 'https://orca.example.test/login?rd=%2Fapp');
	assert.equal(lineExternalURL('not a url'), 'not a url');
	assert.equal(shareableURL('not a url'), 'not a url');
});

test('the sign-in and invite pages carry the notice and keep their own flows', async () => {
	const login = await readFile(new URL('../../routes/login/+page.svelte', import.meta.url), 'utf8');
	const invite = await readFile(new URL('../../routes/invite/[token]/+page.svelte', import.meta.url), 'utf8');
	assert.match(login, /import InAppBrowserNotice from "\$lib\/components\/orca\/InAppBrowserNotice\.svelte";/);
	assert.match(login, /<InAppBrowserNotice \/>\n\s*\{#if data\.unavailable\}/, 'above the sign-in methods');
	assert.match(invite, /\{#if phase !== "joined"\}<InAppBrowserNotice \/>\{\/if\}/);
	// The flows below are untouched: Google, the password form, accepting.
	assert.match(login, /<form method="POST" action="\/oauth2\/start">/);
	assert.match(invite, /target = \(await OrcaService\.acceptInvitation\(data\.token\)\)\.target;/);
});
