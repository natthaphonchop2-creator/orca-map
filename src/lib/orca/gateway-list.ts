import type { OrcaConnection, OrcaHub, HubStatus } from '../services/orca';

export function filterGateways(hubs: OrcaHub[], connections: OrcaConnection[], query: string, status: HubStatus | ''): OrcaHub[] {
  const term = query.normalize('NFKC').trim().toLocaleLowerCase();
  return hubs.filter((hub) => {
    if (hub.status === 'deleted') return false;
    if (status === 'archived' ? hub.status !== 'archived' : hub.status === 'archived') return false;
    if (status && hub.status !== status) return false;
    const source = connections.find((connection) => connection.id === hub.connectionID);
    return `${hub.name} ${hub.description} ${source?.name || ''}`.normalize('NFKC').toLocaleLowerCase().includes(term);
  });
}
