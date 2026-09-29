import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const queue = await importTypeScript(new URL('./ui/toast-queue.ts', import.meta.url));

function clock() {
	const timers = new Map();
	let next = 1;
	return {
		timers,
		schedule: (callback, ms) => { timers.set(next, { callback, ms }); return next++; },
		cancel: (handle) => timers.delete(handle),
		run(handle) { const timer = timers.get(handle); timers.delete(handle); timer.callback(); },
	};
}

test('a toast leaves by itself; an error stays until it is closed', () => {
	const time = clock();
	let shown = [];
	const toasts = queue.createToastQueue((items) => { shown = items; }, time.schedule, time.cancel);
	const created = toasts.push('Created. Your AI sees this workspace.');
	assert.deepEqual(shown.map((item) => [item.message, item.tone]), [['Created. Your AI sees this workspace.', 'ok']]);
	assert.equal([...time.timers.values()][0].ms, queue.TOAST_TIMEOUT_MS);
	const failed = toasts.push('Could not save', { tone: 'error' });
	assert.equal(time.timers.size, 1, 'no timer for an error');
	time.run([...time.timers.keys()][0]);
	assert.deepEqual(shown.map((item) => item.id), [failed]);
	toasts.dismiss(failed);
	assert.deepEqual(shown, []);
	assert.equal(toasts.push('   '), 0, 'nothing to say, no toast');
	assert.notEqual(created, failed);
});

test('at most three show; the oldest goes first and its timer with it', () => {
	const time = clock();
	let shown = [];
	const toasts = queue.createToastQueue((items) => { shown = items; }, time.schedule, time.cancel);
	for (const message of ['one', 'two', 'three', 'four']) toasts.push(message);
	assert.deepEqual(shown.map((item) => item.message), ['two', 'three', 'four']);
	assert.equal(time.timers.size, queue.TOAST_LIMIT);
	toasts.clear();
	assert.deepEqual(shown, []);
	assert.equal(time.timers.size, 0);
});

test('Toast is a polite live region with a close button per message', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/Toast.svelte', import.meta.url), { t: (_th, en) => en, toasts: { items: [] }, dismissToast: () => {} });
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { items: [{ id: 1, message: 'Saved', tone: 'ok' }] } }).body;
	assert.match(html, /role="status" aria-live="polite"/);
	assert.match(html, /<p[^>]*>Saved<\/p>/);
	assert.match(html, /aria-label="Dismiss"/);
});
