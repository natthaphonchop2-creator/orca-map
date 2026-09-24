import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import { effect_root, flush } from 'svelte/internal/client';

const require = createRequire(import.meta.url);
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const configURL = moduleURL(stripTypeScriptTypes(await readFile(new URL('../../orca/client-config.ts', import.meta.url), 'utf8')));
const instructionsURL = moduleURL(stripTypeScriptTypes(await readFile(new URL('../../orca/client-instructions.ts', import.meta.url), 'utf8'))
	.replace("'./client-config'", JSON.stringify(configURL)));
const { gatewayClientConfig, localGatewayEndpoint } = await import(configURL);
const { gatewayClientInstructions } = await import(instructionsURL);
const source = await readFile(new URL('./GatewayClientSetup.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(`export function harness(testProps, gatewayClientConfig, localGatewayEndpoint, gatewayClientInstructions, orcaLocale, t, navigator) {
	${script}
	return { copy, get instructions() { return instructions; }, get config() { return config; }, get copied() { return copied; }, get error() { return error; }, setClient(value) { client = value; }, setEndpoint(value) { endpoint = value; } };
}`, { filename: 'gateway-setup-test.svelte.js', generate: 'client' }).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));

function setupHarness(context, clipboard, locale = 'en', oauth = true) {
	let view;
	const stop = effect_root(() => {
		view = harness({ endpoint: 'https://orca.example/mcp/team', oauth }, gatewayClientConfig, localGatewayEndpoint, gatewayClientInstructions, { value: locale }, (_th, en) => en, { clipboard });
	});
	context.after(stop);
	flush();
	return view;
}

test('copying setup stays English and generic while manual formats and endpoint change', async (context) => {
	const copied = [];
	const view = setupHarness(context, { writeText: async (value) => copied.push(value) }, 'th', false);
	await view.copy(view.instructions, 'Setup instructions');
	assert.equal(view.copied, 'Setup instructions');
	assert.match(copied[0], /AI app I am using/);
	assert.doesNotMatch(copied[0], /Codex|Cursor|VS Code|[\u0E00-\u0E7F]/);
	view.setClient('vscode');
	flush();
	assert.equal(view.instructions, copied[0]);
	assert.ok(view.config.includes('Bearer ${input:orca-key}'));
	view.setEndpoint('https://orca.example/mcp/another-team');
	flush();
	assert.equal(view.copied, '');
	await view.copy(view.instructions, 'Setup instructions');
	assert.doesNotMatch(copied[1], /Codex|Cursor|VS Code|[\u0E00-\u0E7F]/);
	assert.match(copied[1], /another-team/);
	assert.doesNotMatch(copied[1], /mcp\/team/);
});

test('clipboard failure provides a manual-copy fallback without a false success', async (context) => {
	const view = setupHarness(context, { writeText: async () => { throw new Error('denied'); } });
	await view.copy(view.instructions, 'Setup instructions');
	assert.equal(view.copied, '');
	assert.equal(view.error, 'The text could not be copied automatically. Select and copy it manually.');
});

async function rendered(props) {
	let code = compile(source, { filename: 'GatewayClientSetup.svelte', generate: 'server' }).js.code;
	const imports = {
		'svelte/internal/server': pathToFileURL(require.resolve('svelte/internal/server')).href,
		'$lib/orca/client-config': configURL,
		'$lib/orca/client-instructions': instructionsURL,
		'$lib/orca/locale.svelte': moduleURL("export const orcaLocale = {value:'en'}; export const t = (_th,en) => en;"),
		'@lucide/svelte': moduleURL('export const Copy = () => {}, Check = () => {}, ExternalLink = () => {}, MessageSquareText = () => {}, ChevronDown = () => {};')
	};
	for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url));
	const { default: Component } = await import(moduleURL(code));
	return render(Component, { props }).body;
}

test('OAuth URL and instructions are available while manual configuration remains collapsed', async () => {
	const html = await rendered({ endpoint: 'http://localhost:8787/mcp/team', ready: false });
	assert.match(html, /Copy setup instructions/);
	assert.match(html, /Do not require a manually issued API key/);
	assert.doesNotMatch(html, /Bearer &lt;personal-key&gt;|ORCA_MCP_KEY/);
	assert.equal((html.match(/<details/g) ?? []).length, 1);
	assert.match(html, /This AI workspace must be active and you must be a member/);
	assert.match(html, /reachable only by apps on the same computer/);
	const advanced = html.match(/<details([^>]*class="advanced-setup[^>]*)>([\s\S]*?)<\/details>/);
	assert.ok(advanced);
	assert.doesNotMatch(advanced[1], /\bopen(?:\s|=|$)/);
	assert.match(html.slice(0, html.indexOf('<details')), /AI connection link \(MCP URL\)/);
	assert.match(advanced[2], /Setup help/);
	assert.match(advanced[2], /General/);
	assert.match(advanced[2], /Manual configuration format/);
	assert.match(advanced[2], /Authorization/);
	assert.doesNotMatch(html.slice(0, html.indexOf('<details class="advanced-setup')), />Codex<|>Cursor<|>VS Code</);
});

test('an invalid endpoint cannot produce a copyable setup prompt', async () => {
	const html = await rendered({ endpoint: 'https://orca.example/mcp?token=secret' });
	assert.doesNotMatch(html, /Copy setup instructions/);
	assert.match(html, /AI connection link cannot be used to generate a configuration/);
});

test('the unified endpoint explains that one connection includes only permitted Gateways', async () => {
	const html = await rendered({ endpoint: 'https://orca.example/api/orca/mcp', scope: 'orca' });
	assert.match(html, /Connect to ORCA once to use tools from every AI workspace you are allowed to access/);
	assert.match(html, /AI connection link for all your workspaces \(MCP URL\)/);
	assert.doesNotMatch(html, /AI connection link \(MCP URL\)/);
	assert.match(html, /current membership and permissions/);
});


test('OAuth setup is English, uses ORCA sign-in and does not demand a personal API key', async (context) => {
  const view = setupHarness(context, { writeText: async () => {} }, 'th', true);
  assert.match(view.instructions, /Authentication: OAuth/);
  assert.match(view.instructions, /organization identity provider/);
  assert.doesNotMatch(view.instructions, /ORCA_MCP_KEY|Bearer <personal-key>|[\u0E00-\u0E7F]/);
  for (const client of ['codex', 'cursor', 'vscode']) {
    view.setClient(client); flush();
    assert.doesNotMatch(view.config, /Bearer|Authorization|ORCA_MCP_KEY|orca-key|inputs/);
    assert.match(view.config, /https:\/\/orca.example\/mcp\/team/);
  }
  const html = await rendered({ endpoint: 'https://orca.example/mcp/team', oauth: true, ready: false });
  assert.match(html, /Sign in with your ORCA account \(OAuth\)/);
  assert.match(html, /This AI workspace must be active and you must be a member/);
  assert.equal((html.match(/<details/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Create a personal key|ORCA_MCP_KEY|Bearer/);
});


test('OAuth and optional key setup have distinct labels and key config appears only on explicit selection', async () => {
  const oauth = await rendered({ endpoint: 'https://orca.example/mcp/team' });
  const key = await rendered({ endpoint: 'https://orca.example/mcp/team', oauth: false });
  assert.match(oauth, /mcp-endpoint-gateway-oauth/);
  assert.doesNotMatch(oauth, /ORCA_MCP_KEY|Bearer/);
  assert.match(key, /mcp-endpoint-gateway-key/);
  assert.match(key, /Authorization: Bearer/);
  assert.match(key, /optional API-key setup/);
});
