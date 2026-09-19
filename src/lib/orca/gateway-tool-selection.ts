import type { OrcaConnection } from '../services/orca';

/** Keep revoked selections visible until the administrator explicitly removes them. */
export function unavailableGatewayTools(
	connection: Pick<OrcaConnection, 'toolNames' | 'tools'> | undefined,
	selected: string[]
): string[] {
	return selected.filter(
		(name) =>
			!connection?.toolNames.includes(name) ||
			!connection.tools.some((tool) => tool.name === name)
	);
}
