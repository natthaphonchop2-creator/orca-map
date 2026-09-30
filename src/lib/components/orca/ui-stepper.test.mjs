import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

// The width rule. เพิ่มโปรแกรม's four steps, in both languages, with each label's
// real width in the browser (ORCA Noto Sans Thai, 14px semibold, 2026-09-30).
const addProgram = {
	th: { steps: ['เลือกโปรแกรม', 'เชื่อมบัญชี', 'เลือกสิ่งที่ AI ทำได้', 'เสร็จ'], measured: [83, 59.2, 104.3, 27.5] },
	en: { steps: ['Choose a program', 'Connect the account', 'Choose what AI can do', 'Done'], measured: [125.2, 140.9, 155.3, 36] }
};
const asSteps = (labels) => labels.map((label, index) => ({ id: `s${index}`, label }));
const measuredFull = (widths) => widths.reduce((sum, width) => sum + 26 + 8 + width, 0) + (widths.length - 1) * 36;

test('a label is never estimated narrower than it is, so the labels fold before they could wrap', () => {
	for (const { steps, measured } of Object.values(addProgram)) {
		steps.forEach((label, index) => assert.ok(stepper.stepLabelWidth(label) >= measured[index], `${label}: ${stepper.stepLabelWidth(label)} < ${measured[index]}`));
		const full = stepper.stepperFullWidth(asSteps(steps));
		assert.ok(full >= measuredFull(measured), `${steps}: ${full}`);
		assert.ok(full <= measuredFull(measured) * 1.12, `${steps}: ${full} errs too wide`);
	}
	// Thai marks above and below a letter take no width.
	assert.equal(stepper.stepLabelWidth('ที่'), stepper.stepLabelWidth('ท'));
	assert.equal(stepper.stepperFullWidth([]), 0);
});

test('the fit class: the smallest container width that holds every label, or none', () => {
	assert.equal(stepper.stepperFit(asSteps(addProgram.th.steps)), 'fit-560');
	assert.equal(stepper.stepperFit(asSteps(addProgram.en.steps)), 'fit-720');
	assert.equal(stepper.stepperFit(asSteps(['หนึ่ง', 'สอง'])), 'fit-280');
	assert.equal(stepper.stepperFit(asSteps(Array.from({ length: 8 }, () => 'Choose what AI can do'))), 'fit-none');
	for (const labels of [addProgram.th.steps, addProgram.en.steps, ['a'], ['เลือก', 'เชื่อม']]) {
		const fit = Number(stepper.stepperFit(asSteps(labels)).slice(4));
		assert.ok(stepper.STEPPER_FIT_WIDTHS.includes(fit));
		assert.ok(fit >= stepper.stepperFullWidth(asSteps(labels)) && fit - 40 < Math.max(280, stepper.stepperFullWidth(asSteps(labels))));
	}
});

test('which labels show, by state and by the stepper\'s own width', () => {
	const th = asSteps(addProgram.th.steps);
	const en = asSteps(addProgram.en.steps);
	const shown = (steps, width, current) => stepper.stepStates(steps, current).map((step) => stepper.stepLabelShown(step.state, width, steps));
	// 1440 (974px beside ยกเลิก) and 1024 with the sidebar open (606px): Thai shows every label.
	assert.deepEqual(shown(th, 974, 's1'), [true, true, true, true]);
	assert.deepEqual(shown(th, 606, 's1'), [true, true, true, true]);
	// 1024 with the sidebar in English, and a 390px phone (358px): only the current step keeps its label.
	assert.deepEqual(shown(en, 974, 's2'), [true, true, true, true]);
	assert.deepEqual(shown(en, 606, 's2'), [false, false, true, false]);
	assert.deepEqual(shown(th, 358, 's0'), [true, false, false, false]);
	assert.deepEqual(shown(en, 358, 's3'), [false, false, false, true]);
	// The boundary is the fit class's width.
	assert.equal(stepper.stepLabelShown('done', 560, th), true);
	assert.equal(stepper.stepLabelShown('done', 559, th), false);
	assert.equal(stepper.stepLabelShown('upcoming', 5000, asSteps(Array.from({ length: 8 }, () => 'Choose what AI can do'))), false);
	assert.deepEqual(['done', 'current', 'upcoming'].map(stepper.stepLabelClass), ['fold', 'keep', 'fold']);
	// On a phone every current label of the flow fits beside the circles, in both languages.
	for (const { steps, measured } of Object.values(addProgram)) {
		steps.forEach((label, index) => assert.ok(stepper.stepperCompactWidth(4) + measured[index] <= 358, label));
	}
	assert.equal(stepper.stepperCompactWidth(4), 4 * 26 + 8 + 3 * 28);
});

test('the markup carries the rule: fit class, compact room, keep/fold labels, circle tooltips', async () => {
	const { Component } = await serverComponent(new URL('./ui/Stepper.svelte', import.meta.url), { ...stepper, t: (thai) => thai });
	const html = render(Component, { props: { steps: asSteps(addProgram.th.steps), current: 's1', hrefFor: (id) => `/app?view=add-program&step=${id}` } }).body;
	assert.match(html, /<ol class="orca-stepper-list fit-560[^"]*" style="--orca-stepper-compact: 196px;"/);
	const labels = [...html.matchAll(/<span class="orca-step-label (keep|fold)[^"]*">([^<]+)<\/span>/g)].map((match) => [match[1], match[2]]);
	assert.deepEqual(labels, [['fold', 'เลือกโปรแกรม'], ['keep', 'เชื่อมบัญชี'], ['fold', 'เลือกสิ่งที่ AI ทำได้'], ['fold', 'เสร็จ']]);
	// A folded label stays in the page for screen readers; the circle's tooltip names it.
	assert.equal(html.match(/class="orca-step-number[^"]*" aria-hidden="true" title="[^"]+"/g)?.length, 4);
	assert.match(html, /<a href="\/app\?view=add-program&amp;step=s1" aria-current="step"/);
	assert.equal(html.match(/class="orca-step-bar/g)?.length, 3);
});

test('the CSS: a container query for every fit width, one-line labels, a clear gap around every connector', async () => {
	const css = (await readFile(new URL('./ui/Stepper.svelte', import.meta.url), 'utf8')).split('<style>')[1];
	assert.match(css, /\.orca-stepper \{\s*container: orca-stepper \/ inline-size;/);
	for (const width of stepper.STEPPER_FIT_WIDTHS) {
		assert.match(css, new RegExp(`@container orca-stepper \\(width < ${width}px\\) \\{ \\.fit-${width} \\{ --orca-stepper-folded: 1; \\} \\}`), `fit-${width}`);
	}
	assert.equal(css.match(/@container/g).length, stepper.STEPPER_FIT_WIDTHS.length);
	// fit-none folds at every width (Codex review: it used to keep every label).
	assert.match(css, /\.fit-none \{\s*--orca-stepper-folded: 1;\s*\}/);
	assert.ok(css.indexOf('.fit-none') > css.indexOf('.orca-stepper-list {'), 'after the default, so it wins');
	assert.match(css, /\.orca-step-label \{[^}]*white-space: nowrap;/);
	assert.doesNotMatch(css, /display: none/, 'a folded label is clipped, never removed from the page');
	// The connector is the part that stretches; its line keeps 10px clear (8px when folded) of circles and labels.
	assert.match(css, /grid-auto-columns: max-content minmax\(calc\(36px - 8px \* var\(--orca-stepper-folded\)\), 96px\);/);
	assert.match(css, /\.orca-step-bar \{[^}]*margin-inline: calc\(10px - 2px \* var\(--orca-stepper-folded\)\);/);
	assert.equal(stepper.STEP_SIZES.connector, 36);
	assert.equal(stepper.STEP_SIZES.compactConnector, 28);
	// Light and dark come from the --orca-* tokens only.
	assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
