import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { typescriptModuleURL } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

const company = await import(await typescriptModuleURL(new URL('../../orca/company.ts', import.meta.url)));

const gate = new URL('./CompanyGate.svelte', import.meta.url);
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deps = { companyHref: company.companyHref, rememberCompany: company.rememberCompany, localeHref: (path) => path, t: (_th, en) => en, orcaLocale: { value: 'en' } };

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
	assert.match(html, /Company A[\s\S]*Owner[\s\S]*Company B[\s\S]*Member/);
	assert.doesNotMatch(html, /Sign out/);
});

test('without a company, the page asks for an invitation instead of an error', async () => {
	const { Component } = await serverComponent(gate, deps);
	const html = render(Component, { props: { mode: 'none', account: '7' } }).body;
	assert.match(html, /isn't in a company yet/);
	assert.match(html, /Open your invitation link, or ask your company's administrator for a new one/);
	assert.match(html, /href="\/oauth2\/sign_out\?rd=\/"/);
	assert.doesNotMatch(html, /org=/);
});

test('a company that isn\'t theirs offers their own companies, or the invitation text', async () => {
	const { Component } = await serverComponent(gate, deps);
	let html = render(Component, { props: { mode: 'denied', account: '7', companies: [{ id: B, displayName: 'Company B', role: 'admin', canManage: true }] } }).body;
	assert.match(html, /You can't open this company/);
	assert.match(html, /Open one of your companies instead/);
	assert.match(html, new RegExp(`href="/app\\?org=${B}"`));
	html = render(Component, { props: { mode: 'denied', account: '7', companies: [] } }).body;
	assert.match(html, /You can't open this company/);
	assert.match(html, /Open your invitation link/);
});
