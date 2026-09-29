import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { effect_root, flush, untrack } from 'svelte/internal/client';
import { importTypeScript } from '../../orca/test-import.mjs';

// The developer key form of เชื่อม AI ของฉัน, run with Svelte's client runtime:
// the one-time key never outlives the account, company, link or access it was
// made for, and what is sent follows the form (critique 10).
const require = createRequire(import.meta.url);
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const ai = await importTypeScript(new URL('../../orca/connect-ai.ts', import.meta.url));
const { clientNames } = await importTypeScript(new URL('../../orca/client-config.ts', import.meta.url));
const { copyFeedback, copyText } = await importTypeScript(new URL('./ui/copy.ts', import.meta.url));

const source = await readFile(new URL('./connect-ai/DeveloperKeys.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props.id()', "'test'")
	.replace('$props()', '$state(testProps)');
// Exactly the names the component imports from the page's rules.
const rules = source.match(/import \{([^}]+)\} from '\$lib\/orca\/connect-ai';/)[1].split(',').map((name) => name.trim()).filter(Boolean);
const deps = ['OrcaService', 'orcaError', 'onDestroy', 'untrack', 't', 'clientNames', 'copyFeedback', 'copyText', ...rules];
const compiled = compileModule(
	`export function harness(testProps, { ${deps.join(', ')} }) {
	${script}
	return {
		submit: () => create({ preventDefault() {} }),
		forget,
		set(values) {
			if ('identity' in values) identity = values.identity;
			if ('hubs' in values) hubs = values.hubs;
			if ('name' in values) name = values.name;
			if ('scope' in values) scope = values.scope;
			if ('days' in values) days = values.days;
		},
		get state() { return { created, creating, failure, errors, name, scope, days, reveal, options }; }
	};
}`,
	{ filename: 'developer-keys-test.svelte.js', generate: 'client' }
).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));

const endpoint = 'https://orca.example.test/api/orca/mcp';
const hub = (id) => ({ id, name: id, connectURL: `https://orca.example.test/api/orca/hubs/${id}/mcp` });
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((done, fail) => ((resolve = done), (reject = fail)));
	return { promise, resolve, reject };
}
async function settle() {
	flush();
	await new Promise((resolve) => setImmediate(resolve));
	flush();
}

async function setup(context, props = {}, service = {}) {
	const calls = { company: [], hub: [], created: 0 };
	const destroyers = [];
	let view;
	const stop = effect_root(() => {
		view = harness(
			{ hubs: [hub('sales')], endpoint, app: 'codex', canManage: false, identity: 'me@company-a', companyName: '', oncreated: () => (calls.created += 1), ...props },
			{
				...ai,
				OrcaService: {
					createOrcaKey: async (name, days) => (calls.company.push({ name, days }), { key: 'synthetic-company-key', connectURL: endpoint }),
					createKey: async (id, name, days) => (calls.hub.push({ id, name, days }), { key: 'synthetic-hub-key', connectURL: hub(id).connectURL }),
					...service
				},
				orcaError: (error) => error.message,
				onDestroy: (fn) => destroyers.push(fn),
				untrack,
				t: (_th, en) => en,
				clientNames,
				copyFeedback,
				copyText
			}
		);
	});
	context.after(() => {
		destroyers.forEach((fn) => fn());
		stop();
	});
	await settle();
	return { view, calls };
}

test('a company-wide key by default, 30 days, and a named workspace when one is chosen', async (context) => {
	const { view, calls } = await setup(context);
	assert.equal(view.state.days, 30);
	assert.deepEqual(view.state.options, [1, 7, 14, 30]);
	view.set({ name: ' n8n ' });
	await view.submit();
	await settle();
	assert.deepEqual(calls.company, [{ name: 'n8n', days: 30 }]);
	assert.equal(view.state.created?.key, 'synthetic-company-key');
	assert.equal(view.state.reveal, false, 'shown masked until "แสดง"');
	assert.equal(view.state.name, '', 'the form is ready for the next key');
	assert.equal(calls.created, 1, 'the list above reloads');
	view.forget();
	view.set({ name: 'report', scope: 'sales', days: 7 });
	await view.submit();
	await settle();
	assert.deepEqual(calls.hub, [{ id: 'sales', name: 'report', days: 7 }]);
	assert.equal(view.state.created?.endpoint, hub('sales').connectURL, 'the key-mode setup uses that workspace’s link');
});

test('an employee cannot send a never-expiring key, and an empty name sends nothing', async (context) => {
	const { view, calls } = await setup(context);
	view.set({ name: 'script', days: 0 });
	await view.submit();
	view.set({ name: '  ', days: 30 });
	await view.submit();
	await settle();
	assert.deepEqual([calls.company, calls.hub], [[], []]);
	assert.match(Object.values(view.state.errors).join(' '), /Name the key first/);
	const manager = await setup(context, { canManage: true });
	assert.deepEqual(manager.view.state.options, [1, 7, 14, 30, 0]);
	manager.view.set({ name: 'server', days: 0 });
	await manager.view.submit();
	await settle();
	assert.deepEqual(manager.calls.company, [{ name: 'server', days: 0 }]);
});

for (const [boundary, change] of [
	['account, company or link', { identity: 'someone@company-b' }],
	['access', { hubs: [hub('other')] }]
]) {
	test(`a change of ${boundary} clears the one-time key`, async (context) => {
		const { view } = await setup(context);
		view.set({ name: 'n8n' });
		await view.submit();
		await settle();
		assert.ok(view.state.created);
		view.set(change);
		await settle();
		assert.equal(view.state.created, undefined);
		assert.equal(view.state.reveal, false);
	});

	test(`a key created late cannot come back after the ${boundary} changes`, async (context) => {
		const pending = deferred();
		const { view } = await setup(context, {}, { createOrcaKey: () => pending.promise });
		view.set({ name: 'n8n' });
		const submitted = view.submit();
		await settle();
		assert.equal(view.state.creating, true);
		view.set(change);
		await settle();
		pending.resolve({ key: 'synthetic-late-key', connectURL: endpoint });
		await submitted;
		await settle();
		assert.equal(view.state.created, undefined, 'the late key is never shown');
		assert.equal(view.state.creating, false);
	});
}

test('a late failure after the account changes writes no error into the new session', async (context) => {
	const pending = deferred();
	const { view } = await setup(context, {}, { createOrcaKey: () => pending.promise });
	view.set({ name: 'n8n' });
	const submitted = view.submit();
	await settle();
	view.set({ identity: 'someone@company-b' });
	await settle();
	pending.reject(new Error('forbidden'));
	await submitted;
	await settle();
	assert.equal(view.state.failure, '');
	assert.equal(view.state.name, '', 'the form is reset for the new account');
});

test('a workspace that is no longer usable stops being the key’s scope', async (context) => {
	const { view, calls } = await setup(context, { hubs: [hub('sales'), hub('ops')] });
	view.set({ scope: 'ops' });
	await settle();
	view.set({ hubs: [hub('sales')] });
	await settle();
	assert.equal(view.state.scope, '');
	view.set({ name: 'n8n' });
	await view.submit();
	await settle();
	assert.deepEqual(calls.hub, [], 'never a key for a workspace this person lost');
	assert.equal(calls.company.length, 1);
});
