import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { gatewayClientConfig, gatewayClientCommands, gatewayInstallLink, AI_APPS, localGatewayEndpoint, clientNames } = await importTypeScript(new URL('./client-config.ts', import.meta.url));

test('client configs preserve the governed endpoint and use client-specific secret references', () => {
  const endpoint = 'https://orca.example/mcp/hub%2Fteam';
  const cursor = JSON.parse(gatewayClientConfig(endpoint, 'cursor'));
  assert.equal(cursor.mcpServers.orca.url, endpoint);
  assert.equal(cursor.mcpServers.orca.headers.Authorization, 'Bearer ${env:ORCA_MCP_KEY}');
  const vscode = JSON.parse(gatewayClientConfig(endpoint, 'vscode'));
  assert.equal(vscode.servers.orca.url, endpoint);
  assert.equal(vscode.servers.orca.type, 'http');
  assert.equal(vscode.servers.orca.headers.Authorization, 'Bearer ${input:orca-key}');
  assert.equal(vscode.inputs[0].password, true);
  assert.equal(vscode.inputs[0].id, 'orca-key');
});

test('Codex config preserves the governed endpoint and references the key through its environment', () => {
  const endpoint = 'https://orca.example/mcp/hub%2Fteam';
  assert.equal(gatewayClientConfig(endpoint, 'codex'), [
    '[mcp_servers.orca]',
    `url = "${endpoint}"`,
    'bearer_token_env_var = "ORCA_MCP_KEY"'
  ].join('\n'));
  assert.equal(gatewayClientConfig('http://localhost:8787/mcp/team', 'codex'), [
    '[mcp_servers.orca]',
    'url = "http://localhost:8787/mcp/team"',
    'bearer_token_env_var = "ORCA_MCP_KEY"'
  ].join('\n'));
});

test('Codex config encodes URL quotes instead of allowing TOML injection', () => {
  const config = gatewayClientConfig('https://orca.example/mcp/";key="injected', 'codex');
  assert.equal(config, [
    '[mcp_servers.orca]',
    'url = "https://orca.example/mcp/%22;key=%22injected"',
    'bearer_token_env_var = "ORCA_MCP_KEY"'
  ].join('\n'));
});

test('refuses credential-bearing or executable endpoints for every copyable client config', () => {
  for (const client of ['codex', 'cursor', 'vscode', 'windsurf']) {
    for (const endpoint of ['javascript:alert(1)', 'https://secret@example.com/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'https://example.com/mcp#secret'])
      assert.throws(() => gatewayClientConfig(endpoint, client));
  }
});

test('identifies endpoints that are local to the client computer', () => {
  assert.equal(localGatewayEndpoint('http://localhost:8787/mcp/team'), true);
  assert.equal(localGatewayEndpoint('http://127.0.0.1:8787/mcp/team'), true);
  assert.equal(localGatewayEndpoint('http://[::1]:8787/mcp/team'), true);
  assert.equal(localGatewayEndpoint('https://orca.example/mcp/team'), false);
  assert.equal(localGatewayEndpoint('not-a-url'), false);
});


test('OAuth configs preserve endpoint and omit all static credential fields', () => {
  const endpoint = 'https://orca.example/api/orca/mcp';
  assert.equal(gatewayClientConfig(endpoint, 'codex', true), `[mcp_servers.orca]\nurl = "${endpoint}"`);
  assert.deepEqual(JSON.parse(gatewayClientConfig(endpoint, 'cursor', true)), { mcpServers: { orca: { url: endpoint } } });
  assert.deepEqual(JSON.parse(gatewayClientConfig(endpoint, 'vscode', true)), { servers: { orca: { type: 'http', url: endpoint } } });
  for (const client of ['codex', 'cursor', 'vscode']) {
    assert.throws(() => gatewayClientConfig('https://orca.example/mcp?token=secret', client, true));
  }
});

test('one-click install links carry only the endpoint, never a key', () => {
  const endpoint = 'https://orca.example/api/orca/mcp';
  const cursor = new URL(gatewayInstallLink(endpoint, 'cursor'));
  assert.equal(cursor.protocol, 'cursor:');
  assert.equal(cursor.searchParams.get('name'), 'orca');
  assert.deepEqual(JSON.parse(atob(cursor.searchParams.get('config'))), { url: endpoint });
  const keyed = new URL(gatewayInstallLink(endpoint, 'cursor', false));
  assert.equal(JSON.parse(atob(keyed.searchParams.get('config'))).headers.Authorization, 'Bearer ${env:ORCA_MCP_KEY}');
  const vscode = gatewayInstallLink(endpoint, 'vscode');
  assert.ok(vscode.startsWith('vscode:mcp/install?'));
  assert.deepEqual(JSON.parse(decodeURIComponent(vscode.slice('vscode:mcp/install?'.length))), { name: 'orca', type: 'http', url: endpoint });
  assert.equal(gatewayInstallLink(endpoint, 'vscode', false), '', 'VS Code asks for a key through inputs, which a link cannot carry');
  for (const app of ['chatgpt', 'claude', 'claude-code', 'codex', 'windsurf', 'other']) assert.equal(gatewayInstallLink(endpoint, app), '');
  assert.throws(() => gatewayInstallLink('https://orca.example/mcp?token=secret', 'cursor'));
});

test('command-line apps get shell-safe commands; a key stays in the environment', () => {
  const endpoint = 'https://orca.example/api/orca/mcp';
  assert.deepEqual(gatewayClientCommands(endpoint, 'claude-code'), [`claude mcp add --transport http orca '${endpoint}'`]);
  assert.deepEqual(gatewayClientCommands(endpoint, 'codex'), [`codex mcp add orca --url '${endpoint}'`, 'codex mcp login orca']);
  assert.deepEqual(gatewayClientCommands(endpoint, 'codex', false), [`codex mcp add orca --url '${endpoint}' --bearer-token-env-var ORCA_MCP_KEY`]);
  assert.match(gatewayClientCommands(endpoint, 'claude-code', false)[0], /--header "Authorization: Bearer \$ORCA_MCP_KEY"$/);
  // A quote in the path cannot end the shell word early.
  assert.deepEqual(gatewayClientCommands("https://orca.example/mcp/it's", 'claude-code'), [`claude mcp add --transport http orca 'https://orca.example/mcp/it'\\''s'`]);
  for (const app of ['chatgpt', 'claude', 'cursor', 'vscode', 'windsurf', 'other']) assert.deepEqual(gatewayClientCommands(endpoint, app), []);
});

test('Windsurf config uses its serverUrl field', () => {
  const endpoint = 'https://orca.example/api/orca/mcp';
  assert.deepEqual(JSON.parse(gatewayClientConfig(endpoint, 'windsurf', true)), { mcpServers: { orca: { serverUrl: endpoint } } });
  assert.equal(JSON.parse(gatewayClientConfig(endpoint, 'windsurf')).mcpServers.orca.headers.Authorization, 'Bearer ${env:ORCA_MCP_KEY}');
  assert.deepEqual(AI_APPS, ['chatgpt', 'claude', 'claude-code', 'codex', 'cursor', 'vscode', 'windsurf', 'other']);
});

test('one app holds "default", A and B side by side, each with its own credential', async () => {
  const endpoint = (path) => `https://orca.example/api/orca${path}/mcp`;
  const A = 'org-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const companies = [['default', ''], [A, `/orgs/${A}`], [B, `/orgs/${B}`]];
  assert.deepEqual(clientNames('default'), { server: 'orca', keyEnv: 'ORCA_MCP_KEY', vscodeInput: 'orca-key' });
  assert.deepEqual(clientNames(B), { server: 'orca-bbbbbbbb', keyEnv: 'ORCA_MCP_KEY_BBBBBBBB', vscodeInput: 'orca-bbbbbbbb-key' });
  // VS Code: one file, three servers, three prompted keys.
  const vscode = { servers: {}, inputs: [] };
  for (const [id, path] of companies) {
    const config = JSON.parse(gatewayClientConfig(endpoint(path), 'vscode', false, clientNames(id)));
    Object.assign(vscode.servers, config.servers);
    vscode.inputs.push(...config.inputs);
  }
  assert.deepEqual(Object.keys(vscode.servers), ['orca', 'orca-aaaaaaaa', 'orca-bbbbbbbb']);
  assert.deepEqual(vscode.inputs.map((input) => input.id), ['orca-key', 'orca-aaaaaaaa-key', 'orca-bbbbbbbb-key']);
  assert.equal(vscode.servers['orca-bbbbbbbb'].url, endpoint(`/orgs/${B}`));
  assert.equal(vscode.servers['orca-bbbbbbbb'].headers.Authorization, 'Bearer ${input:orca-bbbbbbbb-key}');
  assert.equal(vscode.servers.orca.headers.Authorization, 'Bearer ${input:orca-key}');
  // Cursor, Codex and the command lines name each company's key.
  const cursor = JSON.parse(gatewayClientConfig(endpoint(`/orgs/${A}`), 'cursor', false, clientNames(A)));
  assert.equal(cursor.mcpServers['orca-aaaaaaaa'].headers.Authorization, 'Bearer ${env:ORCA_MCP_KEY_AAAAAAAA}');
  assert.equal(gatewayClientConfig(endpoint(`/orgs/${A}`), 'codex', false, clientNames(A)), [
    '[mcp_servers.orca-aaaaaaaa]',
    `url = "${endpoint(`/orgs/${A}`)}"`,
    'bearer_token_env_var = "ORCA_MCP_KEY_AAAAAAAA"'
  ].join('\n'));
  assert.deepEqual(gatewayClientCommands(endpoint(`/orgs/${B}`), 'codex', true, clientNames(B)), [
    `codex mcp add orca-bbbbbbbb --url '${endpoint(`/orgs/${B}`)}'`,
    'codex mcp login orca-bbbbbbbb'
  ]);
  assert.deepEqual(gatewayClientCommands(endpoint(`/orgs/${B}`), 'claude-code', false, clientNames(B)), [
    `claude mcp add --transport http orca-bbbbbbbb '${endpoint(`/orgs/${B}`)}' --header "Authorization: Bearer $ORCA_MCP_KEY_BBBBBBBB"`
  ]);
  assert.match(gatewayInstallLink(endpoint(`/orgs/${B}`), 'cursor', true, clientNames(B)), /[?&]name=orca-bbbbbbbb&/);
  // Nothing but the default names without a company.
  assert.equal(JSON.parse(gatewayClientConfig(endpoint(''), 'windsurf')).mcpServers.orca.headers.Authorization, 'Bearer ${env:ORCA_MCP_KEY}');
});
