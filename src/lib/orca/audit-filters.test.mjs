import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DELETED_CONNECTIONS,
  auditEventMode,
  auditFilterOptions,
  auditPage,
  filterAuditEvents,
  isUnresolvedConnection,
} from "./audit-filters.ts";

const now = Date.parse("2026-09-18T12:00:00Z");
const base = {
  userID: "u1",
  hubID: "h1",
  connectionID: "c1",
  outcome: "success",
};
const events = [
  {
    ...base,
    id: "run-1",
    action: "tools.call",
    toolName: "ReadFiles",
    createdAt: "2026-09-18T10:00:00Z",
    durationMs: 0,
  },
  {
    ...base,
    id: "run-2",
    action: "tools.call",
    toolName: "ReadFiles",
    createdAt: "2026-09-17T10:00:00Z",
    userID: "u2",
    outcome: "error",
    errorCategory: "authentication_required",
  },
  {
    ...base,
    id: "run-3",
    action: "library.call",
    toolName: "GetKnowledge",
    createdAt: "2026-09-10T10:00:00Z",
    outcome: "denied",
  },
  {
    ...base,
    id: "admin-1",
    action: "key.create",
    createdAt: "2026-09-18T11:00:00Z",
    toolName: "MisleadingToolField",
  },
  {
    ...base,
    id: "admin-2",
    action: "library.update",
    resourceID: "library-item",
    createdAt: "2026-09-16T11:00:00Z",
  },
  {
    ...base,
    id: "admin-3",
    action: "template.preview",
    createdAt: "2026-09-15T11:00:00Z",
  },
];
const names = {
  users: { u1: "Alice Chen", u2: "Bob" },
  connections: { c1: "Shared Drive" },
  hubs: { h1: "Research team" },
};

test("runtime actions and explicit legacy methods remain separate from administrative events", () => {
  assert.deepEqual(
    filterAuditEvents(events, "executions").map((event) => event.id),
    ["run-1", "run-2", "run-3"],
  );
  assert.deepEqual(
    filterAuditEvents(events, "administration").map((event) => event.id),
    ["admin-1", "admin-2", "admin-3"],
  );
  assert.equal(
    auditEventMode({
      ...base,
      action: "connection.update",
      method: "tools/call",
      toolName: "Read",
    }),
    "administration",
  );
  assert.equal(auditEventMode({ ...base, method: "tools/call" }), "executions");
  assert.equal(auditEventMode({ ...base, action: "tools/call" }), "executions");
  assert.equal(
    auditEventMode({ ...base, action: "mcp.request" }),
    "executions",
  );
});

test("metadata search matches all words across identities, connection names and execution IDs", () => {
  assert.deepEqual(
    filterAuditEvents(
      events,
      "executions",
      { query: " ALICE drive run-1 " },
      names,
    ).map((event) => event.id),
    ["run-1"],
  );
  assert.deepEqual(
    filterAuditEvents(
      events,
      "administration",
      { query: "library-item" },
      names,
    ).map((event) => event.id),
    ["admin-2"],
  );
  assert.deepEqual(
    filterAuditEvents(
      [{ ...events[0], message: "private-payload" }],
      "executions",
      { query: "private-payload" },
    ),
    [],
  );
});

test("outcome, user, connection, tool and date filters are intersections within loaded records", () => {
  assert.deepEqual(
    filterAuditEvents(
      events,
      "executions",
      {
        outcome: "error",
        userID: "u2",
        connectionID: "c1",
        toolName: "ReadFiles",
        timeRange: "7d",
      },
      names,
      now,
    ).map((event) => event.id),
    ["run-2"],
  );
  assert.equal(
    filterAuditEvents(events, "executions", { outcome: "error", userID: "u1" })
      .length,
    0,
  );
  assert.deepEqual(
    filterAuditEvents(
      events,
      "executions",
      { timeRange: "24h" },
      names,
      now,
    ).map((event) => event.id),
    ["run-1"],
  );
  assert.equal(
    filterAuditEvents(events, "administration", { action: "library.update" })
      .length,
    1,
  );
});

test("time sort is deterministic, never mutates input, and places invalid timestamps last", () => {
  const source = [
    { ...events[0], id: "b" },
    { ...events[0], id: "a" },
    { ...events[0], id: "bad", createdAt: "invalid" },
  ];
  assert.deepEqual(
    filterAuditEvents(source, "executions", { sort: "newest" }).map(
      (event) => event.id,
    ),
    ["b", "a", "bad"],
  );
  assert.deepEqual(
    filterAuditEvents(source, "executions", { sort: "oldest" }).map(
      (event) => event.id,
    ),
    ["a", "b", "bad"],
  );
  assert.deepEqual(
    source.map((event) => event.id),
    ["b", "a", "bad"],
  );
  assert.deepEqual(
    filterAuditEvents(source, "executions", { timeRange: "7d" }, {}, now).map(
      (event) => event.id,
    ),
    ["b", "a"],
  );
});

test("pagination stays bounded after filtering and labels empty sets without invented rows", () => {
  const records = Array.from({ length: 58 }, (_, index) => index);
  assert.deepEqual(auditPage(records, 3, 25), {
    items: records.slice(50),
    page: 3,
    pages: 3,
    total: 58,
    start: 51,
    end: 58,
  });
  assert.deepEqual(auditPage(records.slice(0, 2), 3, 25), {
    items: [0, 1],
    page: 1,
    pages: 1,
    total: 2,
    start: 1,
    end: 2,
  });
  assert.deepEqual(auditPage([], 0, 25), {
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    start: 0,
    end: 0,
  });
  assert.equal(auditPage(records, NaN, 0).items.length, 20);
  assert.equal(
    auditPage(Array.from({ length: 200 }), 1, 500).items.length,
    100,
  );
});

test("filter choices contain only distinct values present in the loaded event set", () => {
  assert.deepEqual(auditFilterOptions(events, "userID"), ["u1", "u2"]);
  assert.deepEqual(
    auditFilterOptions(
      events.filter((event) => auditEventMode(event) === "executions"),
      "toolName",
    ),
    ["GetKnowledge", "ReadFiles"],
  );
  assert.deepEqual(
    auditFilterOptions(
      [{ ...base }, { ...base, connectionID: "" }],
      "connectionID",
    ),
    ["c1"],
  );
});

test("every deleted system shares one filter value; sign-in sources are not systems", () => {
  const runs = [
    { id: "a", action: "tools.call", connectionID: "khc-live", userID: "u1", hubID: "h1", outcome: "success", createdAt: "2026-09-18T10:00:00Z" },
    { id: "b", action: "tools.call", connectionID: "khc-gone-1", userID: "u1", hubID: "h1", outcome: "success", createdAt: "2026-09-18T09:00:00Z" },
    { id: "c", action: "tools.call", connectionID: "khc-gone-2", userID: "u1", hubID: "h1", outcome: "error", createdAt: "2026-09-18T08:00:00Z" },
    { id: "d", action: "user_source.update", connectionID: "src-1", userID: "u1", hubID: "", outcome: "success", createdAt: "2026-09-18T07:00:00Z" },
  ];
  const names = { connections: { "khc-live": "FlowAccount" } };
  assert.deepEqual(filterAuditEvents(runs, "executions", { connectionID: DELETED_CONNECTIONS }, names, now).map((event) => event.id), ["b", "c"]);
  assert.deepEqual(filterAuditEvents(runs, "executions", { connectionID: "khc-live" }, names, now).map((event) => event.id), ["a"]);
  assert.equal(isUnresolvedConnection(runs[3], names), false);
  assert.equal(isUnresolvedConnection({ id: "e", action: "tools.call" }, names), false, "no system at all is not a deleted one");
});
