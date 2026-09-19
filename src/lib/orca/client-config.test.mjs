import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const source = stripTypeScriptTypes(await readFile(new URL('./client-config.ts', import.meta.url), 'utf8'));
const { gatewayClientConfig, localGatewayEndpoint } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

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
  for (const client of ['codex', 'cursor', 'vscode']) {
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
