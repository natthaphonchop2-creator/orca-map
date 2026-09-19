import type { OrcaConnection, OrcaHub, OrcaKey } from '../services/khum';

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
	connection: OrcaConnection | undefined
): boolean {
	return (
		connectionReady(connection) &&
		hub.connectionID === connection?.id &&
		validNames(hub.toolNames) &&
		hub.toolNames.every((name) => connection!.toolNames.includes(name))
	);
}

export function personalKeyAvailable(key: Pick<OrcaKey, 'expiresAt'>, now: number): boolean {
	return !key.expiresAt || Date.parse(key.expiresAt) > now;
}
