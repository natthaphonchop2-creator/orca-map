export type GatewayClient = 'codex' | 'cursor' | 'vscode';

// Configs intentionally contain placeholders, never the user's personal key.
export function gatewayClientConfig(endpoint: string, client: GatewayClient): string {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Expected a credential-free MCP HTTP endpoint');
  if (client === 'codex') {
    return `[mcp_servers.orca]\nurl = ${JSON.stringify(url.href)}\nbearer_token_env_var = "ORCA_MCP_KEY"`;
  }
  const authorization = client === 'vscode'
    ? 'Bearer ${input:orca-key}'
    : 'Bearer ${env:ORCA_MCP_KEY}';
  const server = { url: url.href, headers: { Authorization: authorization } };
  return JSON.stringify(client === 'vscode' ? {
    servers: { orca: { type: 'http', ...server } },
    inputs: [{ id: 'orca-key', type: 'promptString', description: 'ORCA personal MCP key', password: true }]
  } : { mcpServers: { orca: server } }, null, 2);
}

export function localGatewayEndpoint(endpoint: string): boolean {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname); }
  catch { return false; }
}
