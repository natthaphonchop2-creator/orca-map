import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));
const glossary = await import(await typescriptModuleURL(new URL('../../orca/glossary.ts', import.meta.url)));

const gate = new URL('./CompanyGate.svelte', import.meta.url);
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deps = { companyHref: company.companyHref, rememberCompany: company.rememberCompany, term: glossary.term, localeHref: (path) => path, t: (_th, en) => en, orcaLocale: { value: 'en' }, page: { data: { profile: { email: 'new.person@example.com' } } } };

test('the chooser lists the person\'s companies, each opening a new page', async () => {
	const { warnings, Component } = await serverComponent(gate, deps);
	assert.deepEqual(warnings, []);
	const html = render(Component, { props: { mode: 'choose', account: '7', companies: [
		{ id: 'default', displayName: 'Company A', role: 'owner', canManage: true },
		{ id: B, displayName: 'Company B', role: 'employee', canManage: false },
	] } }).body;
	assert.match(html, /Choose a company/);
	assert.match(html, /href="\/app\?org=default"[^>]*data-sveltekit-reload/);
	assert.match(html, new RegExp(`href="/app\\?org=${B}"[^>]*data-sveltekit-reload`));
	// Roles in the glossary's words (เจ้าของบริษัท / ผู้ดูแล / พนักงาน).
	assert.match(html, /Company A[\s\S]*Company owner[\s\S]*Company B[\s\S]*Employee/);
	assert.doesNotMatch(html, /Sign out/);
});

test('without a company: an owner asks for a trial, an employee for an invite link; sign out is secondary', async () => {
	const { Component } = await serverComponent(gate, deps);
	const html = render(Component, { props: { mode: 'none', account: '7' } }).body;
	assert.match(html, /isn't in a company yet/);
	// Two cards, each with one action.
	assert.match(html, /I own the company[\s\S]*<a class="o-button[^"]*" href="\/home\?to=start">Request a trial/);
	assert.match(html, /I work for the company[\s\S]*<button type="button" class="o-button outline[^"]*"[^>]*>[\s\S]*Copy an invite request/);
	// Sign out is a link below them, not a button.
	assert.match(html, /Wrong account\?[\s\S]*<a href="\/oauth2\/sign_out\?rd=\/"[^>]*>Sign out<\/a>/);
	assert.doesNotMatch(html, /class="o-button[^"]*" href="\/oauth2\/sign_out/);
	assert.doesNotMatch(html, /org=/);
});

test('the invite request names the signed-in email when it is known', async () => {
	const source = await readFile(gate, 'utf8');
	assert.match(source, /page\?\.data\?\.profile\?\.email/);
	assert.match(source, /Could you send me an invite link to our company's ORCA\? My email is \$\{email\}\./);
});

test('a company that isn\'t theirs offers their own companies, or the invitation text', async () => {
	const { Component } = await serverComponent(gate, deps);
	let html = render(Component, { props: { mode: 'denied', account: '7', companies: [{ id: B, displayName: 'Company B', role: 'admin', canManage: true }] } }).body;
	assert.match(html, /You can't open this company/);
	assert.match(html, /Open one of your companies instead/);
	assert.match(html, new RegExp(`href="/app\\?org=${B}"`));
	html = render(Component, { props: { mode: 'denied', account: '7', companies: [] } }).body;
	assert.match(html, /You can't open this company/);
	assert.match(html, /Request a trial[\s\S]*Copy an invite request/);
});
