import { importTypeScript } from './test-import.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const { filterConnections, connectionPage } = await importTypeScript(new URL('./connection-list.ts', import.meta.url));
const reviewed = {
  id: "ready",
  name: "Google Drive",
  description: "Team documents",
  enabled: true,
  reviewedReadOnly: true,
  toolNames: ["read"],
  tools: [{ name: "read" }],
};
const sources = [
  reviewed,
  { ...reviewed, id: "review", name: "Slack", reviewedReadOnly: false },
  { ...reviewed, id: "paused", name: "Microsoft Learn", enabled: false },
  { ...reviewed, id: "stale", name: "Legacy Drive", tools: [] },
];

test("status filters use complete readiness and keep paused sources separate", () => {
  assert.deepEqual(
    filterConnections(sources, "", "reviewed").map((item) => item.id),
    ["ready"],
  );
  assert.deepEqual(
    filterConnections(sources, "", "needs-review").map((item) => item.id),
    ["review", "stale"],
  );
  assert.deepEqual(
    filterConnections(sources, "", "paused").map((item) => item.id),
    ["paused"],
  );
  assert.deepEqual(filterConnections(sources, "", "all"), sources);
});

test("search matches all words across name and description within the selected status", () => {
  assert.deepEqual(
    filterConnections(sources, "  DRIVE team  ", "all").map((item) => item.id),
    ["ready", "stale"],
  );
  assert.deepEqual(
    filterConnections(sources, "drive team", "reviewed").map((item) => item.id),
    ["ready"],
  );
  assert.equal(filterConnections(sources, "drive missing", "all").length, 0);
});

test("pagination caps a page at ten records and clamps after the filtered result shrinks", () => {
  const records = Array.from({ length: 25 }, (_, index) => index);
  assert.deepEqual(connectionPage(records, 2), {
    items: records.slice(10, 20),
    page: 2,
    pages: 3,
    total: 25,
    start: 11,
    end: 20,
  });
  assert.deepEqual(connectionPage(records.slice(0, 3), 3), {
    items: [0, 1, 2],
    page: 1,
    pages: 1,
    total: 3,
    start: 1,
    end: 3,
  });
  assert.deepEqual(connectionPage([], 4), {
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    start: 0,
    end: 0,
  });
});

test('normal reviewed connections are ready but unreviewed and incomplete policies are not', () => {
  const normal = { ...reviewed, reviewedReadOnly: false, reviewedTools: true };
  assert.equal(filterConnections([normal], '', 'reviewed').length, 1);
  assert.equal(filterConnections([{ ...normal, reviewedTools: false }], '', 'reviewed').length, 0);
  assert.equal(filterConnections([{ ...normal, tools: [] }], '', 'reviewed').length, 0);
});

test('archives stay out of ordinary Server views and deleted records never return', () => {
  const archived = { ...reviewed, id: 'archived', enabled: false, archivedAt: '2026-09-19T00:00:00Z' };
  const deleted = { ...archived, id: 'deleted', deletedAt: '2026-09-19T01:00:00Z' };
  for (const filter of ['all', 'reviewed', 'needs-review', 'paused']) {
    assert.equal(filterConnections([archived, deleted], '', filter).length, 0);
  }
  assert.deepEqual(filterConnections([reviewed, archived, deleted], 'drive', 'archived').map((item) => item.id), ['archived']);
});
