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
const lib = { ...(await import(configURL)), ...(await import(instructionsURL)) };
const source = await readFile(new URL('./GatewayClientSetup.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const compiled = compileModule(`export function harness(testProps, lib, orcaLocale, t, navigator, localStorage) {
	const { AI_APPS, gatewayClientCommands, gatewayClientConfig, gatewayInstallLink, localGatewayEndpoint, gatewayClientInstructions } = lib;
	${script}
	return { copy, get app() { return app; }, get instructions() { return instructions; }, get config() { return config; }, get installLink() { return installLink; }, get commands() { return commands; }, get copied() { return copied; }, get error() { return error; }, setApp(value) { app = value; }, setEndpoint(value) { endpoint = value; } };
}`, { filename: 'gateway-setup-test.svelte.js', generate: 'client' }).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import(moduleURL(compiled));

function memoryStorage(initial = {}) {
	const values = new Map(Object.entries(initial));
	return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); } };
}

function setupHarness(context, clipboard, { locale = 'en', oauth = true, storage = memoryStorage() } = {}) {
	let view;
	const stop = effect_root(() => {
		view = harness({ endpoint: 'https://orca.example/mcp/team', oauth }, lib, { value: locale }, (_th, en) => en, { clipboard }, storage);
	});
	context.after(stop);
	flush();
	return view;
}

test('copying setup stays English and generic while the app and endpoint change', async (context) => {
	const copied = [];
	const view = setupHarness(context, { writeText: async (value) => copied.push(value) }, { locale: 'th', oauth: false });
	await view.copy(view.instructions, 'Setup instructions');
	assert.equal(view.copied, 'Setup instructions');
	assert.match(copied[0], /AI app I am using/);
	assert.doesNotMatch(copied[0], /Codex|Cursor|VS Code|[\u0E00-\u0E7F]/);
	view.setApp('vscode');
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

test('the chosen AI app is remembered, and bad or unavailable storage falls back to ChatGPT', (context) => {
	const storage = memoryStorage({ 'orca.aiApp': 'cursor' });
	const view = setupHarness(context, { writeText: async () => {} }, { storage });
	assert.equal(view.app, 'cursor');
	assert.match(view.installLink, /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=orca&config=/);
	view.setApp('codex');
	flush();
	assert.equal(storage.values.get('orca.aiApp'), 'codex');
	assert.deepEqual(view.commands, ["codex mcp add orca --url 'https://orca.example/mcp/team'", 'codex mcp login orca']);
	assert.equal(setupHarness(context, { writeText: async () => {} }, { storage: memoryStorage({ 'orca.aiApp': 'javascript:alert(1)' }) }).app, 'chatgpt');
	const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
	assert.equal(setupHarness(context, { writeText: async () => {} }, { storage: broken }).app, 'chatgpt');
});

test('OAuth setup never offers a personal key, in any app', (context) => {
	const view = setupHarness(context, { writeText: async () => {} }, { locale: 'th' });
	assert.match(view.instructions, /Authentication: OAuth/);
	assert.match(view.instructions, /organization identity provider/);
	assert.doesNotMatch(view.instructions, /ORCA_MCP_KEY|Bearer <personal-key>|[\u0E00-\u0E7F]/);
	for (const app of lib.AI_APPS) {
		view.setApp(app); flush();
		assert.doesNotMatch(`${view.config}\n${view.installLink}\n${view.commands.join('\n')}`, /Bearer|Authorization|ORCA_MCP_KEY|orca-key|inputs/, app);
		if (view.config) assert.match(view.config, /https:\/\/orca.example\/mcp\/team/);
	}
});

// Server-renders the component; `app` seeds the remembered choice the way a returning viewer's browser would.
async function rendered(props, app) {
	let code = compile(source, { filename: 'GatewayClientSetup.svelte', generate: 'server' }).js.code;
	const imports = {
		'svelte/internal/server': pathToFileURL(require.resolve('svelte/internal/server')).href,
		'$lib/orca/client-config': configURL,
		'$lib/orca/client-instructions': instructionsURL,
		'$lib/orca/locale.svelte': moduleURL("export const orcaLocale = {value:'en'}; export const t = (_th,en) => en;"),
		'@lucide/svelte': moduleURL('export const Copy = () => {}, Check = () => {}, ExternalLink = () => {}, ChevronDown = () => {}, ArrowRight = () => {};')
	};
	for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url));
	const { default: Component } = await import(moduleURL(code));
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(app ? { 'orca.aiApp': app } : {}), configurable: true, writable: true });
	try { return render(Component, { props }).body; }
	finally {
		if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
		else delete globalThis.localStorage;
	}
}

test('ChatGPT is the default: numbered steps, sign-in note and no manual config', async () => {
	const html = await rendered({ endpoint: 'http://localhost:8787/mcp/team', ready: false });
	assert.match(html, /AI connection link \(MCP URL\)/);
	assert.match(html, /Each person signs in with their own ORCA account \(OAuth\)/);
	assert.match(html, /<option value="chatgpt"[^>]*selected/);
	assert.equal((html.match(/<option /g) ?? []).length, lib.AI_APPS.length);
	assert.match(html, /<ol class="connect-steps[^"]*">/);
	assert.match(html, /Apps &amp; Connectors/);
	assert.match(html, /choose OAuth authentication/);
	assert.match(html, /This AI workspace must be active and you must be a member/);
	assert.match(html, /reachable only by apps on the same computer/);
	assert.doesNotMatch(html, /<details|Bearer|ORCA_MCP_KEY/);
});

test('Cursor offers a one-click install first and keeps manual config collapsed', async () => {
	const html = await rendered({ endpoint: 'https://orca.example/mcp/team' }, 'cursor');
	assert.match(html, /<a class="k-button primary install[^"]*" href="cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=orca&amp;config=/);
	assert.match(html, /Add to Cursor/);
	const advanced = html.match(/<details([^>]*class="advanced-setup[^>]*)>([\s\S]*?)<\/details>/);
	assert.ok(advanced);
	assert.doesNotMatch(advanced[1], /\bopen(?:\s|=|$)/);
	assert.match(advanced[2], /Quick install not working\? Set it up manually/);
	assert.match(advanced[2], /\.cursor\/mcp\.json/);
});

test('Codex and Claude Code get copyable commands; Windsurf opens its manual config', async () => {
	const codex = await rendered({ endpoint: 'https://orca.example/mcp/team' }, 'codex');
	assert.match(codex, /<ol class="connect-commands[^"]*">/);
	assert.match(codex, /codex mcp add orca --url (?:'|&#39;)https:\/\/orca\.example\/mcp\/team(?:'|&#39;)/);
	assert.match(codex, /codex mcp login orca/);
	assert.match(codex, /Copy command 2/);
	const claudeCode = await rendered({ endpoint: 'https://orca.example/mcp/team' }, 'claude-code');
	assert.match(claudeCode, /claude mcp add --transport http orca/);
	assert.match(claudeCode, /type \/mcp in Claude Code/);
	const windsurf = await rendered({ endpoint: 'https://orca.example/mcp/team' }, 'windsurf');
	assert.match(windsurf, /<details[^>]*class="advanced-setup[^"]*"[^>]*\bopen/);
	assert.match(windsurf, /serverUrl/);
});

test('another app shows the transport, the sign-in method and the setup prompt before copying', async () => {
	const html = await rendered({ endpoint: 'https://orca.example/api/orca/mcp', scope: 'orca' }, 'other');
	assert.match(html, /AI connection link for all your workspaces \(MCP URL\)/);
	assert.match(html, /One link for every AI workspace you can access/);
	assert.match(html, /Streamable HTTP/);
	assert.match(html, /Copy setup instructions/);
	const preview = html.match(/<pre class="prompt-preview[^"]*"[^>]*>([\s\S]*?)<\/pre>/);
	assert.ok(preview);
	assert.match(preview[1], /current membership and permissions/);
	assert.match(preview[1], /Do not require a manually issued API key/);
});

test('an invalid endpoint cannot produce any setup', async () => {
	const html = await rendered({ endpoint: 'https://orca.example/mcp?token=secret' }, 'other');
	assert.doesNotMatch(html, /Copy setup instructions|<select|token=secret/);
	assert.match(html, /AI connection link cannot be used to generate a configuration/);
});

test('the optional key setup has its own label, and chat apps point back to sign-in', async () => {
	const oauth = await rendered({ endpoint: 'https://orca.example/mcp/team' });
	const key = await rendered({ endpoint: 'https://orca.example/mcp/team', oauth: false });
	assert.match(oauth, /mcp-endpoint-gateway-oauth/);
	assert.doesNotMatch(oauth, /ORCA_MCP_KEY|Bearer/);
	assert.match(key, /mcp-endpoint-gateway-key/);
	assert.match(key, /Uses a personal API key/);
	assert.match(key, /ChatGPT connects only by signing in with your ORCA account \(OAuth\)/);
	const codexKey = await rendered({ endpoint: 'https://orca.example/mcp/team', oauth: false }, 'codex');
	assert.match(codexKey, /--bearer-token-env-var ORCA_MCP_KEY/);
	assert.doesNotMatch(codexKey, /codex mcp login/);
	const other = await rendered({ endpoint: 'https://orca.example/mcp/team', oauth: false }, 'other');
	assert.match(other, /Bearer &lt;personal-key(?:&gt;|>)/);
	assert.match(other, /optional API-key setup/);
});
