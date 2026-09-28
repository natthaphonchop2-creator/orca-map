import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { gatewayClientInstructions } = await importTypeScript(new URL('./client-instructions.ts', import.meta.url));
const endpoint = 'https://orca.example/api/orca/hubs/team/mcp';

test('the setup prompt is English and client-neutral with safe connection instructions', () => {
	const prompt = gatewayClientInstructions(endpoint);
	assert.ok(prompt.includes(endpoint));
	assert.match(prompt, /AI app I am using/);
	assert.match(prompt, /ORCA_MCP_KEY/);
	assert.match(prompt, /preserving existing MCP connections/);
	assert.match(prompt, /ask me before replacing it/);
	assert.match(prompt, /Do not ask me to paste the key into chat/);
	assert.match(prompt, /tools\/list only/);
	assert.match(prompt, /On 401 or 403, stop/);
	assert.doesNotMatch(prompt, /Codex|Cursor|VS Code|[\u0E00-\u0E7F]/);
	assert.doesNotMatch(prompt, /mcp_servers|mcpServers|```/);
});

test('optional key prompt checks client capabilities and points OAuth-only clients to sign-in', () => {
	const prompt = gatewayClientInstructions(endpoint);
	assert.match(prompt, /ask which app I use/);
	assert.match(prompt, /supports Streamable HTTP with a custom Authorization header/);
	assert.match(prompt, /only supports OAuth/);
	assert.match(prompt, /switch to ORCA’s sign-in setup/);
	assert.match(prompt, /cannot configure the app directly/);
});

test('local limitations travel with the English prompt only for local endpoints', () => {
	const local = gatewayClientInstructions('http://localhost:8787/api/orca/hubs/team/mcp');
	assert.match(local, /same computer as ORCA/);
	assert.match(local, /a cloud AI service cannot reach it/);
	assert.doesNotMatch(gatewayClientInstructions(endpoint), /a cloud AI service cannot reach it/);
});

test('generic instructions still reject embedded credentials or query secrets', () => {
	for (const url of ['https://user:secret@orca.example/mcp', 'https://orca.example/mcp?token=secret', 'https://orca.example/mcp#secret', 'javascript:alert(1)'])
		assert.throws(() => gatewayClientInstructions(url));
});

test('unified instructions describe only the Gateways the member is permitted to access', () => {
	const prompt = gatewayClientInstructions('https://orca.example/api/orca/mcp', 'orca');
	assert.match(prompt, /single connection for every AI workspace I am allowed to use/);
	assert.match(prompt, /current membership and permissions/);
	assert.doesNotMatch(gatewayClientInstructions(endpoint), /every AI workspace/);
});


test('OAuth instructions verify client capability and use browser identity sign-in without issuing a key', () => {
  const prompt = gatewayClientInstructions(endpoint, 'gateway', true);
  assert.match(prompt, /Authentication: OAuth using my ORCA account/);
  assert.match(prompt, /verify that its MCP client supports Streamable HTTP and OAuth/);
  assert.match(prompt, /complete sign-in in the browser/);
  assert.match(prompt, /Do not require a manually issued API key/);
  assert.match(prompt, /Do not assume every client supports this flow/);
  assert.match(prompt, /verify tools\/list only/);
  assert.doesNotMatch(prompt, /ORCA_MCP_KEY|Bearer <personal-key>|Codex|Cursor|VS Code|[\u0E00-\u0E7F]/);
  assert.match(gatewayClientInstructions('http://localhost:8787/api/orca/mcp', 'orca', true), /cloud AI service cannot reach it/);
});

test('another company\'s prompt names the company and its own server and key names', async () => {
  const { clientNames } = await importTypeScript(new URL('./client-config.ts', import.meta.url));
  const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const prompt = gatewayClientInstructions(`https://orca.example/api/orca/orgs/${B}/mcp`, 'orca', false, 'Company B', clientNames(B));
  assert.match(prompt, /Server name: orca-bbbbbbbb/);
  assert.match(prompt, /Company: Company B\. Keep this connection separate/);
  assert.match(prompt, /ORCA_MCP_KEY_BBBBBBBB/);
  assert.match(prompt, /a connection named orca-bbbbbbbb already points/);
  assert.doesNotMatch(prompt, /Server name: orca$/m);
  const oauth = gatewayClientInstructions(`https://orca.example/api/orca/orgs/${B}/mcp`, 'orca', true, 'Company B', clientNames(B));
  assert.match(oauth, /Server name: orca-bbbbbbbb/);
  assert.match(oauth, /Company: Company B/);
  // One company: exactly as before.
  const single = gatewayClientInstructions(endpoint);
  assert.match(single, /Server name: orca$/m);
  assert.doesNotMatch(single, /Company:/);
});
