import type { OrcaBootstrap, OrcaConnectionMembers } from "$lib/services/orca";
import { gatewayUsesConnection, gatewayHasMember } from './gateway-sources';

/** Saved OAuth evidence within the selected server's current Gateway memberships. */
function scopedOAuthMembers(
  data: OrcaBootstrap,
  connectionID: string,
  response?: OrcaConnectionMembers,
) {
  if (
    !data.canManage ||
    !connectionID ||
    response?.connectionID !== connectionID
  )
    return [];
  if (!data.connections.some((connection) => connection.id === connectionID))
    return [];
  const gateways = data.hubs.filter((hub) => gatewayUsesConnection(hub, connectionID));
  return response.items.flatMap((row) => {
    const member = data.members.find((item) => item.id === row.memberID);
    if (!member) return [];
    const memberGateways = gateways.filter(
      (hub) =>
        gatewayHasMember(hub, row.memberID) &&
        row.relevantHubIDs.includes(hub.id),
    );
    return memberGateways.length
      ? [{ ...row, member, gateways: memberGateways }]
      : [];
  });
}

export function connectedOAuthMembers(
  data: OrcaBootstrap,
  connectionID: string,
  response?: OrcaConnectionMembers,
) {
  return scopedOAuthMembers(data, connectionID, response).filter(
    (row) => row.oauthTokenPresent === true,
  );
}

export function unverifiedOAuthMemberCount(
  data: OrcaBootstrap,
  connectionID: string,
  response?: OrcaConnectionMembers,
) {
  return scopedOAuthMembers(data, connectionID, response).filter(
    (row) => row.oauthTokenPresent == null,
  ).length;
}
