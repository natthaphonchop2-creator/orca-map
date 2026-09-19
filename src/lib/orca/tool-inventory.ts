import type { OrcaBootstrap, OrcaConnection, OrcaTool } from "../services/orca";

/** A saved, selected tool is a configuration record, not proof of a successful call. */
export function selectedToolInventory(
  data: Pick<OrcaBootstrap, "connections" | "hubs" | "currentUserID">,
) {
  return data.connections.flatMap((connection: OrcaConnection) =>
    connection.tools
      .filter((tool: OrcaTool) => connection.toolNames.includes(tool.name))
      .map((tool: OrcaTool) => ({
        key: JSON.stringify([connection.id, tool.name]),
        connection,
        tool,
        hub: data.hubs.find(
          (hub) =>
            hub.connectionID === connection.id &&
            hub.status === "active" &&
            hub.memberIDs.includes(data.currentUserID) &&
            hub.toolNames.includes(tool.name),
        ),
        enabled: connection.enabled && (connection.reviewedReadOnly || connection.reviewedTools === true),
      })),
  );
}

export function toolWorkspaceHref(hubID: string) {
  return `/app?view=hub&hub=${encodeURIComponent(hubID)}`;
}
