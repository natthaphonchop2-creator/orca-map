import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { settingsSections, settingsSection, advancedFallback } = await importTypeScript(new URL('./settings-sections.ts', import.meta.url));

test('members have one tab; managers get ขั้นสูง only once the company has a sign-in source', () => {
	for (const sources of ['unknown', 'none', 'some', 'error']) assert.deepEqual(settingsSections(false, sources), ['account'], sources);
	assert.deepEqual(settingsSections(true, 'unknown'), ['company', 'account']);
	assert.deepEqual(settingsSections(true, 'none'), ['company', 'account']);
	assert.deepEqual(settingsSections(true, 'some'), ['company', 'account', 'advanced']);
	// An unreadable list still offers the page, which shows its own error.
	assert.deepEqual(settingsSections(true, 'error'), ['company', 'account', 'advanced']);
});

test('the section shown follows the address and the role', () => {
	assert.equal(settingsSection(null, true, 'unknown'), 'company');
	assert.equal(settingsSection('account', true, 'none'), 'account');
	assert.equal(settingsSection('advanced', true, 'unknown'), 'advanced');
	assert.equal(settingsSection('advanced', true, 'some'), 'advanced');
	assert.equal(settingsSection('advanced', true, 'none'), 'company');
	for (const requested of [null, 'company', 'advanced', 'account']) assert.equal(settingsSection(requested, false, 'some'), 'account');
});

test('a company without a sign-in source is sent to ทีม from ขั้นสูง (the old sign-in sources page)', () => {
	assert.equal(advancedFallback('advanced', true, 'none'), '/app?view=settings&section=company', 'stays in Settings');
	assert.equal(advancedFallback('advanced', true, 'unknown'), undefined);
	assert.equal(advancedFallback('advanced', true, 'some'), undefined);
	assert.equal(advancedFallback('company', true, 'none'), undefined);
	assert.equal(advancedFallback('advanced', false, 'none'), undefined);
});
