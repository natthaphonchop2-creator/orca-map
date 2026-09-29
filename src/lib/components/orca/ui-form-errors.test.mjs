import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const errors = await importTypeScript(new URL('./ui/form-errors.ts', import.meta.url));

test('all errors at once, from a map or a list, without blanks or repeats', () => {
	assert.deepEqual(errors.formErrors({ name: 'Enter a name', programs: '', people: undefined, limit: false }), [{ field: 'name', message: 'Enter a name' }]);
	assert.deepEqual(errors.formErrors([{ message: ' Choose a program ' }, { message: 'Choose a program' }, { field: 'name', message: 'Choose a program' }]), [
		{ message: 'Choose a program' },
		{ field: 'name', message: 'Choose a program' },
	]);
	assert.deepEqual(errors.formErrors(undefined), []);
	assert.equal(errors.formErrorTitle(1, (_th, en) => en), 'Fix 1 thing before saving');
	assert.equal(errors.formErrorTitle(3, (th) => th), 'แก้ไข 3 จุดก่อนบันทึก');
});

test('FormErrorSummary is an alert whose items jump to their fields', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/FormErrorSummary.svelte', import.meta.url), { ...errors, t: (_th, en) => en, tick: async () => {} });
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { errors: { 'workspace-name': 'Enter a name', 'workspace-programs': 'Choose at least one program' } } }).body;
	assert.match(html, /role="alert"/);
	assert.match(html, /Fix 2 things before saving/);
	assert.match(html, /href="#workspace-name"[^>]*>Enter a name/);
	assert.equal(render(Component, { props: { errors: {} } }).body.includes('role="alert"'), false);
});
