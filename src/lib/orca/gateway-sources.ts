import type { OrcaConnection, OrcaHub, OrcaHubSource } from '../services/orca';

type SourceSelection = Pick<OrcaHub, 'connectionID' | 'toolNames' | 'sources'>;

/** A missing sources field is legacy data. An explicit empty list is not. */
export function gatewaySources(hub: SourceSelection): OrcaHubSource[] {
  return hub.sources !== undefined
    ? hub.sources
    : hub.connectionID ? [{ connectionID: hub.connectionID, toolNames: hub.toolNames }] : [];
}

export function gatewayUsesConnection(hub: SourceSelection, connectionID: string): boolean {
  return gatewaySources(hub).some((source) => source.connectionID === connectionID);
}

export function gatewayToolCount(hub: SourceSelection): number {
  return gatewaySources(hub).reduce((total, source) => total + source.toolNames.length, 0);
}

export function gatewayConnections(hub: SourceSelection, connections: OrcaConnection[]): OrcaConnection[] {
  return gatewaySources(hub).flatMap((source) => {
    const connection = connections.find((item) => item.id === source.connectionID);
    return connection ? [connection] : [];
  });
}
