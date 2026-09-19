import { gatewayClientConfig, localGatewayEndpoint, type GatewayClient } from './client-config';

export type GatewaySetupClient = GatewayClient | 'manual';
export type GatewaySetupScope = 'gateway' | 'orca';

// The copied prompt is always English and client-neutral. App-specific config
// examples live in manual setup; neither surface receives the user's key.
export function gatewayClientInstructions(
	endpoint: string,
	scope: GatewaySetupScope = 'gateway'
): string {
	// Reuse the config generator's credential-free HTTP URL validation.
	gatewayClientConfig(endpoint, 'codex');
	const url = new URL(endpoint).href;
	const lines = [
		`Help me connect the AI app I am using to ${scope === 'orca' ? 'ORCA MCP' : 'this ORCA MCP Gateway'}.`,
		'Server name: orca',
		`MCP URL: ${url}`,
		'Transport: Streamable HTTP',
		'Authentication: Authorization: Bearer <personal-key>',
		...(scope === 'orca' ? ['Use this single connection for every Gateway I am allowed to use. ORCA determines available tools from my current membership and permissions.'] : []),
		'',
		'Identify the AI app and its supported MCP setup method. If you cannot identify it, ask which app I use. Check that it supports Streamable HTTP with a custom Authorization header.',
		'Use the app’s supported setup flow, preserving existing MCP connections and settings. If a connection named orca already points to another URL, ask me before replacing it.',
		'Let me enter my personal key in the app’s secure credential field or an environment variable such as ORCA_MCP_KEY. Do not ask me to paste the key into chat, display it, or write its value into a configuration file.',
		'If the app only supports OAuth, explain that this endpoint currently uses a Bearer key and cannot use that flow yet. Do not invent an OAuth flow or claim the connection is complete.',
		'If you cannot configure the app directly, give me the steps to complete in its settings.',
		'After setup, reload the MCP connection if needed and verify tools/list only. Do not call tools that read or change business data until I request it.',
		'On 401 or 403, stop and ask me to check the key, membership, and permissions in ORCA.'
	];
	if (localGatewayEndpoint(endpoint)) lines.push('This is a localhost URL. The connecting app must run on the same computer as ORCA; a cloud AI service cannot reach it.');
	return lines.join('\n');
}
