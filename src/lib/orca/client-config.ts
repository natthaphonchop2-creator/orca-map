export type GatewayClient = 'codex' | 'cursor' | 'vscode' | 'windsurf';

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
export function gatewayClientConfig(endpoint: string, client: GatewayClient, oauth = false): string {
  const url = governedURL(endpoint);
  if (client === 'windsurf') {
    return JSON.stringify({ mcpServers: { orca: oauth
      ? { serverUrl: url.href }
      : { serverUrl: url.href, headers: { Authorization: 'Bearer ${env:ORCA_MCP_KEY}' } } } }, null, 2);
  }
  if (client === 'codex') {
    return `[mcp_servers.orca]\nurl = ${JSON.stringify(url.href)}${oauth ? "" : '\nbearer_token_env_var = "ORCA_MCP_KEY"'}`;
  }
  if (oauth) {
    return JSON.stringify(client === 'vscode'
      ? { servers: { orca: { type: 'http', url: url.href } } }
      : { mcpServers: { orca: { url: url.href } } }, null, 2);
  }
  const authorization = client === 'vscode'
    ? 'Bearer ${input:orca-key}'
    : 'Bearer ${env:ORCA_MCP_KEY}';
  const server = { url: url.href, headers: { Authorization: authorization } };
  return JSON.stringify(client === 'vscode' ? {
    servers: { orca: { type: 'http', ...server } },
    inputs: [{ id: 'orca-key', type: 'promptString', description: 'ORCA personal key', password: true }]
  } : { mcpServers: { orca: server } }, null, 2);
}

export function localGatewayEndpoint(endpoint: string): boolean {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname); }
  catch { return false; }
}

/** One-click install links for apps that accept them. Nothing secret is embedded. */
export function gatewayInstallLink(endpoint: string, app: AIApp, oauth = true): string {
  const url = governedURL(endpoint).href;
  if (app === 'cursor') {
    const server = oauth ? { url } : { url, headers: { Authorization: 'Bearer ${env:ORCA_MCP_KEY}' } };
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=orca&config=${encodeURIComponent(btoa(JSON.stringify(server)))}`;
  }
  // VS Code prompts for a key through inputs, which its install link cannot carry.
  if (app === 'vscode' && oauth) return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'orca', type: 'http', url }))}`;
  return '';
}

/** Terminal commands for command-line AI apps; a key stays in the environment. */
export function gatewayClientCommands(endpoint: string, app: AIApp, oauth = true): string[] {
  const url = shellQuote(governedURL(endpoint).href);
  if (app === 'claude-code') return [oauth
    ? `claude mcp add --transport http orca ${url}`
    : `claude mcp add --transport http orca ${url} --header "Authorization: Bearer $ORCA_MCP_KEY"`];
  if (app === 'codex') return oauth
    ? [`codex mcp add orca --url ${url}`, 'codex mcp login orca']
    : [`codex mcp add orca --url ${url} --bearer-token-env-var ORCA_MCP_KEY`];
  return [];
}
