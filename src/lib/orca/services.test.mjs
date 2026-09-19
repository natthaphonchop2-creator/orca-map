import { pilotUseCaseWithPlan } from './pricing.ts';
import {
	pilotServiceContext,
	pilotUseCaseWithService,
	serviceInterestFromQuery,
	serviceInterestName
} from './services.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { beforeEach, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';

// Exercise the actual rune module in memory. Only SvelteKit's browser flag is
// substituted; the Svelte state proxy and intake functions remain unchanged.
const source = stripTypeScriptTypes(
	await readFile(new URL('./pilot-intake.svelte.ts', import.meta.url), 'utf8')
);
const require = createRequire(import.meta.url);
const compiled = compileModule(source, {
	filename: 'pilot-intake.svelte.js',
	generate: 'client'
})
	.js.code.replaceAll(
		'svelte/internal/client',
		pathToFileURL(require.resolve('svelte/internal/client')).href
	)
	.replaceAll('$app/environment', 'data:text/javascript,export const browser = true;');
const {
	pilotIntake: intake,
	applyRequestedIntake,
	pilotAttempt,
	receivePilotRequest
} = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

beforeEach(() => {
	intake.submitting = false;
	intake.selectedPlan = '';
	intake.selectedService = '';
	intake.entryContext = null;
	intake.receipt = null;
	intake.attempt = null;
	intake.error = '';
	intake.details = {
		name: 'Test contact',
		email: 'contact@example.test',
		organization: 'Test organization',
		teamSize: '6-20',
		useCase: 'Improve our weekly reporting workflow.',
		consent: true,
		website: ''
	};
});

test('only supported service values can enter the inquiry context', () => {
	for (const service of ['training', 'implementation', 'consultation']) {
		assert.equal(serviceInterestFromQuery(service), service);
	}
	for (const invalid of [
		null,
		'',
		'Training',
		' training ',
		'enterprise',
		'__proto__',
		'<script>'
	]) {
		assert.equal(serviceInterestFromQuery(invalid), '');
	}
});

test('service context is stable across languages and fits the existing payload limit', () => {
	for (const service of ['training', 'implementation', 'consultation']) {
		assert.notEqual(serviceInterestName(service, 'th'), serviceInterestName(service, 'en'));
		const prefix = pilotServiceContext(service);
		assert.match(prefix, /^\[ORCA service: .+\]\n\n$/);
		assert.equal(pilotUseCaseWithService('  Team goals  ', service), prefix + 'Team goals');
		assert.equal(pilotUseCaseWithService('x'.repeat(3000 - prefix.length), service).length, 3000);
		assert.equal(pilotUseCaseWithService('x'.repeat(3001 - prefix.length), service).length, 3001);
	}
	assert.equal(pilotUseCaseWithService('  Team goals  ', ''), 'Team goals');
	assert.equal(pilotUseCaseWithPlan('  Team goals  ', 'team'), '[ORCA plan: Team]\n\nTeam goals');
});

test('direct and explicit entries select one intent while retaining the contact draft', () => {
	const details = { ...intake.details };
	applyRequestedIntake('team', 'training');
	assert.equal(intake.selectedService, 'training');
	assert.equal(intake.selectedPlan, '');
	applyRequestedIntake('enterprise', '', true);
	assert.equal(intake.selectedService, '');
	assert.equal(intake.selectedPlan, 'enterprise');
	applyRequestedIntake('', 'implementation', true);
	assert.equal(intake.selectedService, 'implementation');
	assert.equal(intake.selectedPlan, '');
	assert.deepEqual({ ...intake.details }, details);
});

test('returning to the same entry preserves a manually changed plan and a receipt', () => {
	applyRequestedIntake('team', '');
	intake.selectedPlan = 'free';
	applyRequestedIntake('team', '');
	assert.equal(intake.selectedPlan, 'free');
	receivePilotRequest({ reference: 'ORCA-test-1', status: 'received' }, 'free');
	applyRequestedIntake('team', '');
	assert.equal(intake.receipt.reference, 'ORCA-test-1');
	assert.equal(intake.receipt.plan, 'free');
	applyRequestedIntake('', 'consultation', true);
	assert.equal(intake.receipt, null);
	assert.equal(intake.selectedService, 'consultation');
});

test('navigation cannot retarget a submission and the receipt uses the submitted service', () => {
	applyRequestedIntake('', 'training');
	intake.submitting = true;
	const context = { ...intake.entryContext };
	applyRequestedIntake('team', '', true);
	assert.equal(intake.selectedService, 'training');
	assert.equal(intake.selectedPlan, '');
	assert.deepEqual({ ...intake.entryContext }, context);
	receivePilotRequest({ reference: 'ORCA-test-2', status: 'received' }, '', 'training');
	assert.equal(intake.receipt.service, 'training');
	assert.equal(intake.receipt.plan, '');
	assert.equal(intake.details.name, '');
});

test('uncertain retries keep the same payload and key across locale changes', () => {
	const input = {
		...intake.details,
		useCase: pilotUseCaseWithService(intake.details.useCase, 'training'),
		locale: 'th'
	};
	const first = pilotAttempt(input);
	const translated = pilotAttempt({ ...input, locale: 'en' });
	assert.equal(translated.key, first.key);
	assert.equal(translated.input.locale, 'th');
	const changed = pilotAttempt({
		...input,
		useCase: pilotUseCaseWithService(intake.details.useCase, 'implementation')
	});
	assert.notEqual(changed.key, first.key);
	assert.match(changed.input.useCase, /AI implementation and workflow redesign/);
});
