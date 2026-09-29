import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const picker = await importTypeScript(new URL('./ui/person-picker.ts', import.meta.url));
const people = [
	{ id: 'me', name: 'วิภา ตัวอย่าง', email: 'wipa@example.invalid', detail: 'เจ้าของบริษัท' },
	{ id: 'a', name: 'ธนา ทดสอบ', email: 'thana@example.invalid', detail: 'ผู้ดูแล' },
	{ id: 'b', name: 'มาลี สมบูรณ์', email: 'malee@example.invalid', detail: 'พนักงาน' },
	{ id: 'c', name: 'Somchai Test', email: 'somchai@example.invalid' },
];

test('search matches every word typed in name, email or role, and skips people already chosen', () => {
	assert.deepEqual(picker.matchPeople(people, 'มาลี', []).map((p) => p.id), ['b']);
	assert.deepEqual(picker.matchPeople(people, 'SOMCHAI example', []).map((p) => p.id), ['c']);
	assert.deepEqual(picker.matchPeople(people, 'พนักงาน', []).map((p) => p.id), ['b']);
	assert.deepEqual(picker.matchPeople(people, '', ['me', 'a']).map((p) => p.id), ['b', 'c']);
	assert.equal(picker.matchPeople(people, '', [], 2).length, 2);
});

test('chips add once, remove unless locked, and Backspace removes the last removable one', () => {
	assert.deepEqual(picker.addPerson(['me'], 'a'), ['me', 'a']);
	assert.deepEqual(picker.addPerson(['me'], 'me'), ['me']);
	assert.deepEqual(picker.removePerson(['me', 'a'], 'a'), ['me']);
	assert.deepEqual(picker.removePerson(['me', 'a'], 'me', ['me']), ['me', 'a']);
	assert.deepEqual(picker.removeLastPerson(['a', 'me'], ['me']), ['me']);
	assert.deepEqual(picker.removeLastPerson(['me'], ['me']), ['me']);
});

test('arrow keys wrap through the suggestions; initials skip punctuation', () => {
	assert.equal(picker.moveHighlight(-1, 3, 1), 0);
	assert.equal(picker.moveHighlight(-1, 3, -1), 2);
	assert.equal(picker.moveHighlight(2, 3, 1), 0);
	assert.equal(picker.moveHighlight(0, 3, -1), 2);
	assert.equal(picker.moveHighlight(0, 0, 1), -1);
	assert.equal(picker.personInitial('  "มาลี'), 'ม');
	assert.equal(picker.personInitial('somchai'), 'S');
	assert.equal(picker.personInitial(''), '?');
});

test('PersonPicker renders the chosen chips, "you" first-class, and a labelled combobox', async () => {
	const { warnings, Component } = await serverComponent(new URL('./ui/PersonPicker.svelte', import.meta.url), { ...picker, t: (_th, en) => en });
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { people, selected: ['me', 'a'], youID: 'me', label: 'Who can use it' } }).body;
	assert.match(html, /You \(วิภา ตัวอย่าง\)/);
	assert.match(html, /aria-label="Remove ธนา ทดสอบ"/);
	assert.match(html, /role="combobox" aria-label="Who can use it"/);
	const locked = render(Component, { props: { people, selected: ['me'], locked: ['me'], youID: 'me', label: 'Who' } }).body;
	assert.doesNotMatch(locked, /Remove วิภา/);
});
