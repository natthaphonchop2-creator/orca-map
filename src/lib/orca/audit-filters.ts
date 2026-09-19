import type { OrcaAuditEvent } from "$lib/services/orca";

export type AuditMode = "executions" | "administration";
export type AuditTimeRange = "all" | "24h" | "7d" | "30d";
export type AuditSort = "newest" | "oldest";
export interface AuditFilters {
  query?: string;
  outcome?: string;
  userID?: string;
  toolName?: string;
  connectionID?: string;
  action?: string;
  timeRange?: AuditTimeRange;
  sort?: AuditSort;
}
export interface AuditSearchNames {
  users?: Record<string, string>;
  hubs?: Record<string, string>;
  connections?: Record<string, string>;
}

const runtimeActions = new Set([
  "tools.call",
  "tools/call",
  "library.call",
  "mcp.request",
]);

/** Current durable admissions use tools.call; keep explicit legacy request actions readable. */
export function auditEventMode(event: OrcaAuditEvent): AuditMode {
  if (event.action)
    return runtimeActions.has(event.action) ? "executions" : "administration";
  return event.method === "tools/call" ? "executions" : "administration";
}

export function filterAuditEvents(
  events: OrcaAuditEvent[],
  mode: AuditMode,
  filters: AuditFilters = {},
  names: AuditSearchNames = {},
  now = Date.now(),
) {
  const words = (filters.query ?? "")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const range = {
    all: 0,
    "24h": 86_400_000,
    "7d": 604_800_000,
    "30d": 2_592_000_000,
  }[filters.timeRange ?? "all"];
  return events
    .filter((event) => {
      if (auditEventMode(event) !== mode) return false;
      if (filters.outcome && event.outcome !== filters.outcome) return false;
      if (filters.userID && event.userID !== filters.userID) return false;
      if (filters.toolName && event.toolName !== filters.toolName) return false;
      if (filters.connectionID && event.connectionID !== filters.connectionID)
        return false;
      if (filters.action && event.action !== filters.action) return false;
      if (range) {
        const timestamp = Date.parse(event.createdAt);
        if (
          !Number.isFinite(timestamp) ||
          timestamp < now - range ||
          timestamp > now
        )
          return false;
      }
      // Search only metadata already exposed by the endpoint. Never search arbitrary message/payload fields.
      const text = [
        event.id,
        event.toolName,
        event.action,
        event.method,
        event.errorCategory,
        event.userID,
        names.users?.[event.userID],
        event.hubID,
        names.hubs?.[event.hubID],
        event.connectionID,
        names.connections?.[event.connectionID ?? ""],
        event.resourceID,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt),
        bTime = Date.parse(b.createdAt);
      if (!Number.isFinite(aTime))
        return Number.isFinite(bTime) ? 1 : a.id.localeCompare(b.id);
      if (!Number.isFinite(bTime)) return -1;
      const difference = aTime - bTime || a.id.localeCompare(b.id);
      return filters.sort === "oldest" ? difference : -difference;
    });
}

export function auditPage<T>(
  events: T[],
  requestedPage: number,
  pageSize = 20,
) {
  const size =
    Number.isSafeInteger(pageSize) && pageSize > 0
      ? Math.min(pageSize, 100)
      : 20;
  const pages = Math.max(1, Math.ceil(events.length / size));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(Math.trunc(requestedPage), pages))
    : 1;
  return {
    items: events.slice((page - 1) * size, page * size),
    page,
    pages,
    total: events.length,
    start: events.length ? (page - 1) * size + 1 : 0,
    end: Math.min(page * size, events.length),
  };
}

export function auditFilterOptions(
  events: OrcaAuditEvent[],
  field: "userID" | "toolName" | "action" | "outcome" | "connectionID",
) {
  return [
    ...new Set(
      events
        .map((event) => event[field])
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
}
