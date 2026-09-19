import type { OrcaConnection, OrcaHub, HubStatus } from '../services/orca';
import { gatewayConnections } from './gateway-sources';

export function filterGateways(hubs: OrcaHub[], connections: OrcaConnection[], query: string, status: HubStatus | ''): OrcaHub[] {
  const term = query.normalize('NFKC').trim().toLocaleLowerCase();
  return hubs.filter((hub) => {
    if (hub.status === 'deleted') return false;
    if (status === 'archived' ? hub.status !== 'archived' : hub.status === 'archived') return false;
    if (status && hub.status !== status) return false;
    const sourceNames = gatewayConnections(hub, connections).map((item) => item.name).join(' ');
    return `${hub.name} ${hub.description} ${sourceNames}`.normalize('NFKC').toLocaleLowerCase().includes(term);
  });
}
