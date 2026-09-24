import { gatewayClientConfig, localGatewayEndpoint, type GatewayClient } from './client-config';

export type GatewaySetupClient = GatewayClient | 'manual';
export type GatewaySetupScope = 'gateway' | 'orca';

// The copied prompt is always English and client-neutral. App-specific config
// examples live in manual setup; neither surface receives the user's key.
export function gatewayClientInstructions(
	endpoint: string,
	scope: GatewaySetupScope = 'gateway',
	oauth = false
): string {
	// Reuse the config generator's credential-free HTTP URL validation.
	gatewayClientConfig(endpoint, 'codex');
	const url = new URL(endpoint).href;
	if (oauth) {
		const instructions = [
			`Help me connect the AI app I am using to ${scope === 'orca' ? 'the ORCA MCP server' : 'this ORCA AI workspace (an MCP server)'}.`,
			'Server name: orca',
			`MCP URL: ${url}`,
			'Transport: Streamable HTTP',
			'Authentication: OAuth using my ORCA account.',
			...(scope === 'orca' ? ['Use this single connection for every AI workspace I am allowed to use. ORCA determines available tools from my current membership and permissions.'] : []),
			'',
			'Identify the AI app and verify that its MCP client supports Streamable HTTP and OAuth. If you cannot identify it, ask which app I use. Do not assume every client supports this flow.',
			'Add this MCP URL through the app’s supported setup flow, preserving existing MCP connections and settings. If a connection named orca already points to another URL, ask me before replacing it.',
			'Use the MCP client’s OAuth sign-in flow to open ORCA. Let me choose my organization identity provider if offered, complete sign-in in the browser, and approve the requested connection. Do not ask me to paste credentials or tokens into chat.',
			'Do not require a manually issued API key or add a static Authorization header for this OAuth connection.',
			'If this client does not support the required OAuth flow, explain the limitation and ask me to choose a compatible client. Do not invent a successful login.',
			'If you cannot configure the app directly, give me the steps to complete in its settings.',
			'After setup, verify tools/list only. Do not call tools that read or change business data until I request it.',
			'On an authentication or access error, stop and check sign-in, identity mapping, AI workspace membership and permissions. Do not claim the connection is complete until verification succeeds.'
		];
		if (localGatewayEndpoint(endpoint)) instructions.push('This is a localhost URL. The connecting app must run on the same computer as ORCA; a cloud AI service cannot reach it.');
		return instructions.join('\n');
	}
	const lines = [
		`Help me connect the AI app I am using to ${scope === 'orca' ? 'the ORCA MCP server' : 'this ORCA AI workspace (an MCP server)'}.`,
		'Server name: orca',
		`MCP URL: ${url}`,
		'Transport: Streamable HTTP',
		'Authentication: Authorization: Bearer <personal-key>',
		...(scope === 'orca' ? ['Use this single connection for every AI workspace I am allowed to use. ORCA determines available tools from my current membership and permissions.'] : []),
		'',
		'Identify the AI app and its supported MCP setup method. If you cannot identify it, ask which app I use. Check that it supports Streamable HTTP with a custom Authorization header.',
		'Use the app’s supported setup flow, preserving existing MCP connections and settings. If a connection named orca already points to another URL, ask me before replacing it.',
		'Let me enter my personal key in the app’s secure credential field or an environment variable such as ORCA_MCP_KEY. Do not ask me to paste the key into chat, display it, or write its value into a configuration file.',
		'This is the optional API-key setup. If the app only supports OAuth, switch to ORCA’s sign-in setup for this same MCP URL instead. Do not invent a successful login.',
		'If you cannot configure the app directly, give me the steps to complete in its settings.',
		'After setup, reload the MCP connection if needed and verify tools/list only. Do not call tools that read or change business data until I request it.',
		'On 401 or 403, stop and ask me to check the key, membership, and permissions in ORCA.'
	];
	if (localGatewayEndpoint(endpoint)) lines.push('This is a localhost URL. The connecting app must run on the same computer as ORCA; a cloud AI service cannot reach it.');
	return lines.join('\n');
}
