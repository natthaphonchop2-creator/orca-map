import type { OrcaConnection, OrcaHub, OrcaKey } from '../services/khum';
import { gatewaySources } from './gateway-sources';

function validNames(names: string[]) {
	return (
		names.length > 0 &&
		new Set(names).size === names.length &&
		names.every((name) => name.length > 0 && name.trim() === name)
	);
}

// These checks guide setup only. The server still authorizes every operation.
export function connectionReady(connection: OrcaConnection | undefined): boolean {
	return (
		!!connection &&
    !connection.archivedAt && !connection.deletedAt &&
		connection.enabled &&
		(connection.reviewedReadOnly || connection.reviewedTools === true) &&
		validNames(connection.toolNames) &&
		connection.toolNames.every((name) => connection.tools.some((tool) => tool.name === name))
	);
}

export function workspaceToolingReady(
	hub: OrcaHub,
	connection: OrcaConnection | OrcaConnection[] | undefined
): boolean {
	const connections = Array.isArray(connection) ? connection : connection ? [connection] : [];
	return gatewaySources(hub).some((source) => {
		const candidate = connections.find((item) => item.id === source.connectionID);
		return connectionReady(candidate) && validNames(source.toolNames) &&
			source.toolNames.every((name) => candidate!.toolNames.includes(name));
	});
}

export function personalKeyAvailable(key: Pick<OrcaKey, 'expiresAt'>, now: number): boolean {
	return !key.expiresAt || Date.parse(key.expiresAt) > now;
}
