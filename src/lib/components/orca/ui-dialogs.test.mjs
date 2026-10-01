import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const trap = await importTypeScript(new URL('./ui/focus-trap.ts', import.meta.url));

test('Tab wraps inside a modal at either end and is left alone in between', () => {
	const [first, middle, last] = ['first', 'middle', 'last'];
	const items = [first, middle, last];
	assert.equal(trap.wrapFocus(items, last, false), first);
	assert.equal(trap.wrapFocus(items, first, true), last);
	assert.equal(trap.wrapFocus(items, middle, false), undefined);
	assert.equal(trap.wrapFocus(items, middle, true), undefined);
	// Focus outside (the page behind) comes back in.
	assert.equal(trap.wrapFocus(items, 'outside', false), first);
	assert.equal(trap.wrapFocus(items, null, true), last);
	assert.equal(trap.wrapFocus([], first, false), undefined);
});

test('focus returns to where it was when the modal closes', () => {
	let focused = 0;
	const button = { isConnected: true, focus() { focused += 1; } };
	trap.rememberFocus({ activeElement: button })();
	assert.equal(focused, 1);
	const gone = { isConnected: false, focus() { focused += 1; } };
	trap.rememberFocus({ activeElement: gone })();
	assert.equal(focused, 1, 'a removed element is not focused');
	trap.rememberFocus({ activeElement: null })();
});

test('ConfirmDialog and Sheet are labelled modal dialogs with a cancel and a close', async () => {
	const deps = { ...trap, t: (_th, en) => en, tick: async () => {} };
	const confirm = await serverComponent(new URL('./ui/ConfirmDialog.svelte', import.meta.url), deps);
	assert.deepEqual(confirm.warnings, []);
	const html = render(confirm.Component, { props: { title: 'Disconnect ChatGPT for Malee?', message: 'It stops at once.', confirmLabel: 'Disconnect', tone: 'danger', onconfirm() {} } }).body;
	assert.match(html, /<dialog class="orca-confirm[^"]*danger[^"]*" aria-labelledby="(orca-confirm-[^"]+)"/);
	const id = html.match(/aria-labelledby="([^"]+)"/)[1];
	assert.match(html, new RegExp(`<h2 id="${id}"[^>]*>Disconnect ChatGPT for Malee\\?</h2>`));
	const described = html.match(/aria-describedby="([^"]+)"/)?.[1];
	assert.ok(described, 'the message describes the dialog');
	assert.match(html, new RegExp(`<p id="${described}"[^>]*>It stops at once.</p>`));
	assert.match(html, />Cancel<\/button>/);
	assert.match(html, /class="k-button danger-solid[^"]*"[^>]*>Disconnect<\/button>/);
	const sheet = await serverComponent(new URL('./ui/Sheet.svelte', import.meta.url), deps);
	assert.deepEqual(sheet.warnings, []);
	const panel = render(sheet.Component, { props: { title: 'Sign in to FlowAccount', children: (renderer) => renderer.push('<p>inside</p>') } }).body;
	assert.match(panel, /<dialog class="orca-sheet[^"]*" aria-labelledby="orca-sheet-/);
	assert.match(panel, /aria-label="Close"/);
	assert.doesNotMatch(panel, /aria-describedby/, 'no description, no reference');
	const withDescription = render(sheet.Component, { props: { title: 'Sign in', description: 'Use your own account.', children: () => {} } }).body;
	const descriptionID = withDescription.match(/aria-describedby="([^"]+)"/)?.[1];
	assert.ok(descriptionID);
	assert.match(withDescription, new RegExp(`<p id="${descriptionID}"[^>]*>Use your own account.</p>`));
	assert.doesNotMatch(panel, /inside/, 'the content mounts only while open');
});

test('Esc or a click outside a confirmation runs ondismiss when given, never the cancel button\'s choice; the knowledge conflict keeps its version (Codex release review 68)', async () => {
	const dialog = await readFile(new URL('./ui/ConfirmDialog.svelte', import.meta.url), 'utf8');
	assert.match(dialog, /oncancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*dismiss\(\);/, 'Esc dismisses');
	assert.match(dialog, /if \(event\.target === dialog\) dismiss\(\);/, 'a click outside dismisses');
	assert.match(dialog, /bind:this=\{cancelButton\} disabled=\{busy\} onclick=\{cancel\}/, 'the cancel button cancels');
	assert.match(dialog, /function dismiss\(\) \{\s*if \(busy\) return;\s*open = false;\s*\(ondismiss \?\? oncancel\)\?\.\(\);/, 'other dialogs keep Esc as cancel');
	const editor = await readFile(new URL('./LibraryEditor.svelte', import.meta.url), 'utf8');
	const latest = editor.slice(editor.indexOf('bind:open={latestOpen}'), editor.indexOf('</ConfirmDialog>', editor.indexOf('bind:open={latestOpen}')));
	assert.match(latest, /oncancel=\{keepMine\}/, '"Keep my text" is the button');
	const dismiss = latest.match(/ondismiss=\{([\s\S]*?)\}\s*>/)?.[1] ?? '';
	assert.ok(dismiss, 'the conflict dialog has its own dismiss');
	assert.doesNotMatch(dismiss.replace(/\/\/.*$/gm, ''), /keepMine|useLatest|version\s*=|conflict\s*=|latestOpen\s*=/, 'dismissing changes neither the version nor the conflict');
	assert.match(editor, /disabled=\{saving \|\| conflict(?: \|\| fileOff)?\} onclick=\{\(\) => save\('draft'\)\}/, 'no save while the conflict stands');
});
