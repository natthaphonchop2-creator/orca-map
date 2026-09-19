const categories = [
  "authentication_required",
  "permission_denied",
  "tool_changed",
  "invalid_arguments",
  "quota_exceeded",
  "timeout",
  "canceled",
  "upstream_error",
  "tool_error",
  "invalid_response",
] as const;
export type AuditErrorCategory = (typeof categories)[number] | "unknown";

type AuditMetadata = {
  id?: unknown;
  hubID?: unknown;
  version?: unknown;
  connectionVersion?: unknown;
  toolSchemaHash?: unknown;
  durationMs?: unknown;
  errorCategory?: unknown;
  action?: unknown;
  resourceID?: unknown;
  finishedAt?: unknown;
};
const positiveVersion = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

/** Keep legacy absence distinct from zero and never echo an arbitrary provider error. */
export function auditDetailValues(event: AuditMetadata) {
  const errorCategory: AuditErrorCategory | undefined =
    typeof event.errorCategory === "string" && event.errorCategory
      ? categories.includes(event.errorCategory as (typeof categories)[number])
        ? (event.errorCategory as (typeof categories)[number])
        : "unknown"
      : undefined;
  const action = typeof event.action === "string" ? event.action : "";
  const version = positiveVersion(event.version);
  // Library/template events carry the resource version even when they have a Hub ID.
  const hubVersion =
    (!action ||
      [
        "tools.call",
        "tools/call",
        "hub.create",
        "hub.update",
        "key.create",
      ].includes(action)) &&
    typeof event.hubID === "string" &&
    event.hubID
      ? version
      : undefined;
  const connectionVersion =
    positiveVersion(event.connectionVersion) ??
    (["connection.create", "connection.update"].includes(action)
      ? version
      : undefined);
  return {
    reference: typeof event.id === "string" && event.id ? event.id : undefined,
    hubVersion,
    connectionVersion,
    resourceVersion: [
      "organization.update",
      "unit.create",
      "unit.update",
      "library.create",
      "library.update",
      "library.archive",
      "department.members",
      "template.preview",
    ].includes(action)
      ? version
      : undefined,
    resourceID:
      typeof event.resourceID === "string" && event.resourceID
        ? event.resourceID
        : undefined,
    finishedAt:
      typeof event.finishedAt === "string" &&
      Number.isFinite(Date.parse(event.finishedAt))
        ? event.finishedAt
        : undefined,
    durationMs:
      typeof event.durationMs === "number" &&
      Number.isSafeInteger(event.durationMs) &&
      event.durationMs >= 0
        ? event.durationMs
        : undefined,
    schemaHash:
      typeof event.toolSchemaHash === "string" &&
      /^(sha256:)?[a-f0-9]{64}$/i.test(event.toolSchemaHash)
        ? event.toolSchemaHash.toLowerCase()
        : undefined,
    errorCategory,
  };
}
export function auditDuration(value: number): string {
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(2)} s`;
}
