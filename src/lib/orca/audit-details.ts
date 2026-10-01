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
  // Knowledge library v2 (C4 §14m S5): why a file was refused or could not be read.
  "file_too_large",
  "file_unsupported",
  "file_hostile",
  "file_encrypted",
  "extract_timeout",
  "extract_memory",
  "extract_failed",
  "storage_error",
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
  libraryRefs?: unknown;
};
/** The file events whose version is the file's version (an upload, a reading, a download…). */
const FILE_VERSION_ACTIONS = [
  "library.file.upload",
  "library.file.replace",
  "library.file.ready",
  "library.file.partial",
  "library.file.failed",
  "library.file.publish",
  "library.file.reextract",
  "library.file.options",
  "library.file.download",
];
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
      "library.takeover",
      "library.audience.live",
      "library.audience.list",
      "department.members",
      "template.preview",
    ].includes(action)
      ? version
      : undefined,
    fileVersion: FILE_VERSION_ACTIONS.includes(action) ? version : undefined,
    libraryRefs: auditLibraryRefs(event.libraryRefs),
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
/**
 * What a knowledge search or read released to the AI (C4 §14m S6): at most
 * 25 items and versions. The title is there only when the viewer may read the
 * item now; anything malformed is dropped rather than shown.
 */
export type AuditLibraryRef = { itemID: string; kind: "article" | "file" | "other"; title: string; version: number };
export function auditLibraryRefs(value: unknown): AuditLibraryRef[] {
  if (!Array.isArray(value)) return [];
  const refs: AuditLibraryRef[] = [];
  for (const entry of value.slice(0, 25)) {
    if (!entry || typeof entry !== "object") continue;
    const ref = entry as Record<string, unknown>;
    if (typeof ref.itemID !== "string" || !ref.itemID) continue;
    const version = positiveVersion(ref.version);
    if (version === undefined) continue;
    refs.push({
      itemID: ref.itemID,
      kind: ref.kind === "article" || ref.kind === "file" ? ref.kind : "other",
      title: typeof ref.title === "string" ? ref.title : "",
      version,
    });
  }
  return refs;
}
/** How long a call took, in seconds a shop owner reads at a glance ("0.3 วินาที"), not milliseconds. */
export function auditDuration(value: number, locale: "th" | "en" = "th"): string {
  const second = locale === "en" ? "s" : "วินาที";
  if (value < 50) return locale === "en" ? "under 0.1 s" : "ไม่ถึง 0.1 วินาที";
  if (value < 10_000) return `${(Math.round(value / 100) / 10).toLocaleString("en-US")} ${second}`;
  if (value < 60_000) return `${Math.round(value / 1000)} ${second}`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  const minute = locale === "en" ? "min" : "นาที";
  return seconds ? `${minutes} ${minute} ${seconds} ${second}` : `${minutes} ${minute}`;
}
