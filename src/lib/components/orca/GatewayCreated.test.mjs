import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';

const require = createRequire(import.meta.url);
const { gatewayClientConfig } = await importTypeScript(new URL('../../orca/client-config.ts', import.meta.url));
const source = await readFile(new URL('./GatewayCreated.svelte', import.meta.url), 'utf8');
const compiled = compile(source, { filename: 'GatewayCreated.svelte', generate: 'server' });
const code = compiled.js.code.replace(/^import[\s\S]*?;\n/gm, '').replace('export default function GatewayCreated', 'function GatewayCreated');
const { component } = await import('data:text/javascript;base64,' + Buffer.from(`import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
export function component(page, localeHref, t, gatewayClientConfig, ArrowRight, Check, Copy) { ${code}; return GatewayCreated; }`).toString('base64'));
const Screen = component({ url: new URL('https://admin.example.test/app?view=hub') }, (url) => url, (_th, en) => en, gatewayClientConfig, () => {}, () => {}, () => {});
const hub = { id: 'hub-one', name: 'Team', status: 'active', connectURL: 'https://gateway.example.test/api/orca/hubs/hub-one/mcp' };

test('OAuth Gateway shares the real MCP endpoint instead of sending employees to the admin app', () => {
  assert.deepEqual(compiled.warnings, []);
  const html = render(Screen, { props: { hub: { ...hub, userSourceID: 'company-idp' } } }).body;
  const input = html.match(/<input[^>]+id="gateway-share-link"[^>]+>/)?.[0];
  assert.match(input, /https:\/\/gateway.example.test\/api\/orca\/hubs\/hub-one\/mcp/);
  assert.doesNotMatch(input, /admin.example.test|view=hub/);
  assert.match(html, /MCP gateway URL/);
  assert.match(html, /sign in to ORCA to confirm their account/);
});

test('ordinary Gateway shares the MCP endpoint without a custom IdP and keeps the draft requirement', () => {
  const html = render(Screen, { props: { hub: { ...hub, status: 'draft' } } }).body;
  assert.match(html, /MCP gateway URL/);
  assert.match(html, /https:\/\/gateway.example.test\/api\/orca\/hubs\/hub-one\/mcp/);
  assert.doesNotMatch(html, /Member setup link|admin.example.test/);
  assert.match(html, /Activate this Gateway when you are ready/);
});

test('an unsafe OAuth endpoint cannot become a copied share URL', () => {
  const html = render(Screen, { props: { hub: { ...hub, userSourceID: 'idp', connectURL: 'https://gateway.example.test/mcp?token=secret' } } }).body;
  assert.doesNotMatch(html, /gateway-share-link|token=secret/);
  assert.match(html, /A connection URL is not available yet/);
});
