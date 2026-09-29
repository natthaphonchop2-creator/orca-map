import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const stepper = await importTypeScript(new URL('./ui/stepper.ts', import.meta.url));
const steps = [
	{ id: 'choose', label: 'Choose a program' },
	{ id: 'connect', label: 'Connect the account' },
	{ id: 'tools', label: 'Choose what AI can do' },
	{ id: 'done', label: 'Done' },
];

test('steps before the current one are done, the rest upcoming', () => {
	assert.deepEqual(stepper.stepStates(steps, 'tools').map((step) => [step.number, step.state]), [[1, 'done'], [2, 'done'], [3, 'current'], [4, 'upcoming']]);
	assert.deepEqual(stepper.stepStates(steps, 'nope').map((step) => step.state), ['current', 'upcoming', 'upcoming', 'upcoming']);
	// The caller may say which steps are really done.
	assert.deepEqual(stepper.stepStates(steps, 'tools', ['choose']).map((step) => step.state), ['done', 'upcoming', 'current', 'upcoming']);
});

test('the step lives in the address and every other parameter is kept', () => {
	assert.equal(stepper.currentStep(steps, 'connect'), 'connect');
	assert.equal(stepper.currentStep(steps, null), 'choose');
	assert.equal(stepper.currentStep(steps, 'x'), 'choose');
	assert.equal(stepper.stepHref('/app?view=add-program&source=a%26b&lang=th#top', 'tools'), '/app?view=add-program&source=a%26b&lang=th&step=tools#top');
	assert.equal(stepper.stepHref('/app?view=add-program&step=connect', 'choose'), '/app?view=add-program&step=choose');
});

test('only done steps and the current one are links; the current one is aria-current="step"', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/Stepper.svelte', import.meta.url), { ...stepper, t: (_th, en) => en });
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { steps, current: 'connect', hrefFor: (id) => `/app?view=add-program&step=${id}` } }).body;
	assert.equal(html.match(/<a /g)?.length, 2);
	assert.match(html, /href="\/app\?view=add-program&amp;step=connect" aria-current="step"/);
	assert.doesNotMatch(html, /step=tools|step=done/);
	assert.match(html, /\(done\)/);
});
