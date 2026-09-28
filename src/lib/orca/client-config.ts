import { DEFAULT_COMPANY, currentCompany, validCompanyID } from './company';

export type GatewayClient = 'codex' | 'cursor' | 'vscode' | 'windsurf';

/**
 * What an AI app calls a company's ORCA connection. "default" keeps the names
 * its members already use. Another company gets stable names from its ID, so
 * one app can hold several companies, each with its own credential.
 */
export type ClientNames = { server: string; keyEnv: string; vscodeInput: string };
export function clientNames(company: string = currentCompany()): ClientNames {
  if (company === DEFAULT_COMPANY || !validCompanyID(company)) return { server: 'orca', keyEnv: 'ORCA_MCP_KEY', vscodeInput: 'orca-key' };
  const hex = company.slice('org-'.length, 'org-'.length + 8);
  return { server: `orca-${hex}`, keyEnv: `ORCA_MCP_KEY_${hex.toUpperCase()}`, vscodeInput: `orca-${hex}-key` };
}

/** AI apps the connect panel offers, most used first. */
export type AIApp = 'chatgpt' | 'claude' | 'claude-code' | 'codex' | 'cursor' | 'vscode' | 'windsurf' | 'other';
export const AI_APPS: AIApp[] = ['chatgpt', 'claude', 'claude-code', 'codex', 'cursor', 'vscode', 'windsurf', 'other'];

function governedURL(endpoint: string): URL {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Expected a credential-free MCP HTTP endpoint');
  return url;
}

// A URL's href never contains a raw space, but it can contain a single quote.
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// Configs intentionally contain placeholders, never the user's personal key.
export function gatewayClientConfig(endpoint: string, client: GatewayClient, oauth = false, names: ClientNames = clientNames()): string {
  const url = governedURL(endpoint);
  if (client === 'windsurf') {
    return JSON.stringify({ mcpServers: { [names.server]: oauth
      ? { serverUrl: url.href }
      : { serverUrl: url.href, headers: { Authorization: `Bearer \${env:${names.keyEnv}}` } } } }, null, 2);
  }
  if (client === 'codex') {
    return `[mcp_servers.${names.server}]\nurl = ${JSON.stringify(url.href)}${oauth ? "" : `\nbearer_token_env_var = "${names.keyEnv}"`}`;
  }
  if (oauth) {
    return JSON.stringify(client === 'vscode'
      ? { servers: { [names.server]: { type: 'http', url: url.href } } }
      : { mcpServers: { [names.server]: { url: url.href } } }, null, 2);
  }
  const authorization = client === 'vscode'
    ? `Bearer \${input:${names.vscodeInput}}`
    : `Bearer \${env:${names.keyEnv}}`;
  const server = { url: url.href, headers: { Authorization: authorization } };
  return JSON.stringify(client === 'vscode' ? {
    servers: { [names.server]: { type: 'http', ...server } },
    inputs: [{ id: names.vscodeInput, type: 'promptString', description: 'ORCA personal key', password: true }]
  } : { mcpServers: { [names.server]: server } }, null, 2);
}

export function localGatewayEndpoint(endpoint: string): boolean {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname); }
  catch { return false; }
}

/** One-click install links for apps that accept them. Nothing secret is embedded. */
export function gatewayInstallLink(endpoint: string, app: AIApp, oauth = true, names: ClientNames = clientNames()): string {
  const url = governedURL(endpoint).href;
  if (app === 'cursor') {
    const server = oauth ? { url } : { url, headers: { Authorization: `Bearer \${env:${names.keyEnv}}` } };
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=${names.server}&config=${encodeURIComponent(btoa(JSON.stringify(server)))}`;
  }
  // VS Code prompts for a key through inputs, which its install link cannot carry.
  if (app === 'vscode' && oauth) return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: names.server, type: 'http', url }))}`;
  return '';
}

/** Terminal commands for command-line AI apps; a key stays in the environment. */
export function gatewayClientCommands(endpoint: string, app: AIApp, oauth = true, names: ClientNames = clientNames()): string[] {
  const url = shellQuote(governedURL(endpoint).href);
  if (app === 'claude-code') return [oauth
    ? `claude mcp add --transport http ${names.server} ${url}`
    : `claude mcp add --transport http ${names.server} ${url} --header "Authorization: Bearer $${names.keyEnv}"`];
  if (app === 'codex') return oauth
    ? [`codex mcp add ${names.server} --url ${url}`, `codex mcp login ${names.server}`]
    : [`codex mcp add ${names.server} --url ${url} --bearer-token-env-var ${names.keyEnv}`];
  return [];
}
