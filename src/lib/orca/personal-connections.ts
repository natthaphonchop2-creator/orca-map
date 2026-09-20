import { workspaceToolingReady } from "./activation";
import { gatewayConnections, gatewayHasMember } from "./gateway-sources";
import type {
  OrcaBootstrap,
  OrcaConnection,
  OrcaHub,
  OrcaSourceSetup,
} from "../services/orca";

export interface PersonalSource {
  sourceID: string;
  connections: OrcaConnection[];
  hubs: OrcaHub[];
  canReadSetup: boolean;
  manageHubID: string;
}

/** An organization management role never adds someone else's sources to this list. */
export function personalSources(data: OrcaBootstrap): PersonalSource[] {
  const records = new Map<string, PersonalSource>();
  for (const hub of data.hubs) {
    if (!gatewayHasMember(hub, data.currentUserID)) continue;
    for (const connection of gatewayConnections(hub, data.connections)) {
    if (!connection?.mcpID) continue;
    const usable =
      hub.status === "active" && workspaceToolingReady(hub, connection);
    let record = records.get(connection.mcpID);
    if (!record) {
      record = {
        sourceID: connection.mcpID,
        connections: [],
        hubs: [],
        canReadSetup: false,
        manageHubID: hub.id,
      };
      records.set(connection.mcpID, record);
    }
    if (!record.connections.some((item) => item.id === connection.id))
      record.connections.push(connection);
    if (!record.hubs.some((item) => item.id === hub.id)) record.hubs.push(hub);
    if (usable) record.manageHubID = hub.id;
    record.canReadSetup ||= data.canManage || usable;
    }
  }
  return [...records.values()].sort((a, b) =>
    a.connections[0].name.localeCompare(b.connections[0].name),
  );
}

export type PersonalSetup = Pick<
  OrcaSourceSetup,
  | "sourceID"
  | "name"
  | "endpointHost"
  | "managedProvider"
  | "oauthProvider"
  | "configured"
  | "oauthSupported"
  | "oauthConnected"
  | "oauthClientRequired"
  | "oauthClientConfigured"
>;
export function personalSetup(
  value: OrcaSourceSetup,
  expectedID: string,
): PersonalSetup {
  if (value.sourceID !== expectedID)
    throw new Error("Source metadata does not match the requested source");
  return {
    sourceID: value.sourceID,
    name: value.name,
    endpointHost: value.endpointHost,
    managedProvider: value.managedProvider,
    oauthProvider: value.oauthProvider,
    configured: value.configured,
    oauthSupported: value.oauthSupported,
    oauthConnected: value.oauthConnected,
    oauthClientRequired: value.oauthClientRequired,
    oauthClientConfigured: value.oauthClientConfigured,
  };
}

export type PersonalAccountUpdate<T> =
  | { sourceID: string; status: "loading" }
  | { sourceID: string; status: "ready"; value: T }
  | { sourceID: string; status: "error"; error: unknown };

/** Aborts superseded reads and keeps one shared four-request budget, including retries. */
export function personalAccountReader<T>(
  read: (sourceID: string, signal: AbortSignal) => Promise<T>,
  update: (event: PersonalAccountUpdate<T>) => void,
) {
  type Job = {
    sourceID: string;
    generation: number;
    revision: number;
    controller: AbortController;
  };
  let generation = 0;
  let disposed = false;
  let queued: Job[] = [];
  const active = new Set<Job>();
  const revisions = new Map<string, number>();
  const current = (job: Job) =>
    !disposed &&
    !job.controller.signal.aborted &&
    job.generation === generation &&
    revisions.get(job.sourceID) === job.revision;
  function pump() {
    while (!disposed && active.size < 4 && queued.length) {
      const job = queued.shift()!;
      if (!current(job)) continue;
      active.add(job);
      void (async () => {
        try {
          const value = await read(job.sourceID, job.controller.signal);
          if (current(job))
            update({ sourceID: job.sourceID, status: "ready", value });
        } catch (error) {
          if (current(job))
            update({ sourceID: job.sourceID, status: "error", error });
        } finally {
          active.delete(job);
          pump();
        }
      })();
    }
  }
  function retry(sourceID: string) {
    if (disposed || !revisions.has(sourceID)) return;
    const revision = (revisions.get(sourceID) ?? 0) + 1;
    revisions.set(sourceID, revision);
    for (const job of active)
      if (job.sourceID === sourceID) job.controller.abort();
    queued = queued.filter((job) => job.sourceID !== sourceID);
    queued.push({
      sourceID,
      generation,
      revision,
      controller: new AbortController(),
    });
    update({ sourceID, status: "loading" });
    pump();
  }
  return {
    replace(sourceIDs: string[]) {
      if (disposed) return;
      generation += 1;
      queued = [];
      revisions.clear();
      for (const job of active) job.controller.abort();
      // Prepare all jobs before pumping so immediate completions cannot skip a source.
      for (const sourceID of new Set(sourceIDs)) {
        revisions.set(sourceID, 1);
        queued.push({
          sourceID,
          generation,
          revision: 1,
          controller: new AbortController(),
        });
        update({ sourceID, status: "loading" });
      }
      pump();
    },
    retry,
    dispose() {
      disposed = true;
      queued = [];
      revisions.clear();
      for (const job of active) job.controller.abort();
    },
  };
}
