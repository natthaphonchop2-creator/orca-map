import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const copy = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));

function fakeDocument(result = true) {
	const nodes = [];
	return {
		nodes,
		createElement: () => ({ value: '', style: {}, setAttribute() {}, select() {} }),
		body: { appendChild: (node) => nodes.push(node), removeChild: (node) => nodes.splice(nodes.indexOf(node), 1) },
		execCommand: () => result,
	};
}

test('copies with the clipboard, falls back to a hidden textarea, and reports failure', async () => {
	const written = [];
	assert.equal(await copy.copyText('https://orca.example/mcp', { writeText: async (text) => { written.push(text); } }), true);
	assert.deepEqual(written, ['https://orca.example/mcp']);
	const doc = fakeDocument();
	assert.equal(await copy.copyText('link', { writeText: async () => { throw new Error('denied'); } }, doc), true);
	assert.equal(doc.nodes.length, 0, 'the textarea is removed again');
	assert.equal(await copy.copyText('link', undefined, fakeDocument(false)), false);
	assert.equal(await copy.copyText('link', undefined, undefined), false);
	assert.equal(await copy.copyText('', { writeText: async () => {} }), false);
});

test('the textarea fallback gives the focus back to the copy button', async () => {
	let focused = 0;
	const doc = { ...fakeDocument(), activeElement: { focus() { focused += 1; } } };
	assert.equal(await copy.copyText('link', undefined, doc), true);
	assert.equal(focused, 1);
	// A failed copy gives it back too.
	const failing = { ...fakeDocument(false), activeElement: { focus() { focused += 1; } } };
	assert.equal(await copy.copyText('link', undefined, failing), false);
	assert.equal(focused, 2);
});

test('"คัดลอกแล้ว" shows for a moment; a second copy restarts the timer', () => {
	const timers = [];
	const cancelled = [];
	const states = [];
	const feedback = copy.copyFeedback((value) => states.push(value), (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, (handle) => cancelled.push(handle));
	feedback.copied();
	feedback.copied();
	assert.deepEqual(states, [true, true]);
	assert.deepEqual(cancelled, [1]);
	assert.equal(timers[1].ms, copy.COPIED_FEEDBACK_MS);
	timers[1].callback();
	assert.deepEqual(states, [true, true, false]);
	feedback.dispose();
	assert.deepEqual(cancelled, [1], 'nothing left to cancel');
});

test('CopyField shows a big copy button beside the value in small mono text', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/CopyField.svelte', import.meta.url), { ...copy, t: (_th, en) => en, onDestroy: () => {} });
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { value: 'https://orca.example/api/orca/mcp', label: 'Your company ORCA link', buttonLabel: 'Copy ORCA link' } }).body;
	assert.match(html, /<button type="button" class="orca-copy-button[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*Copy ORCA link/);
	assert.match(html, /<code[^>]*>https:\/\/orca.example\/api\/orca\/mcp<\/code>/);
	assert.match(html, /role="status"/);
	// The button is described by the value it copies (several copy buttons stay distinguishable).
	const described = html.match(/class="orca-copy-button[^"]*"[^>]*aria-describedby="([^"]+)"/)?.[1];
	assert.ok(described, 'the button names what it copies');
	assert.match(html, new RegExp(`<div class="orca-copy-value[^"]*" id="${described}">`));
});
