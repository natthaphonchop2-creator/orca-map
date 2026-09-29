import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { serverComponent } from './test-render.mjs';

test('ChoiceTile is a real radio in a large tile, marked when chosen', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/ChoiceTile.svelte', import.meta.url), {});
	assert.deepEqual(warnings, []);
	const chosen = render(Component, { props: { name: 'ai-app', value: 'claude', selected: 'claude', title: 'Claude', description: 'Web, desktop and phone' } }).body;
	assert.match(chosen, /<label class="orca-choice[^"]*checked/);
	assert.match(chosen, /<input class="orca-choice-input[^"]*" type="radio" name="ai-app" value="claude" checked/);
	assert.match(chosen, /Web, desktop and phone/);
	const other = render(Component, { props: { name: 'ai-app', value: 'chatgpt', selected: 'claude', title: 'ChatGPT', disabled: true } }).body;
	assert.doesNotMatch(other, / checked/);
	assert.match(other, /disabled/);
});
