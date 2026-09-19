import { importTypeScript } from './test-import.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const { selectedToolInventory, toolWorkspaceHref } = await importTypeScript(new URL('./tool-inventory.ts', import.meta.url));

test("inventory preserves connection identity and only offers caller-scoped active workspaces", () => {
  const connection = {
    id: "a",
    tools: [{ name: "search" }, { name: "delete" }],
    toolNames: ["search"],
    enabled: false,
    reviewedReadOnly: true,
  };
  const data = {
    currentUserID: "owner",
    connections: [connection, { ...connection, id: "b", enabled: true }],
    hubs: [
      {
        id: "foreign",
        connectionID: "a",
        status: "active",
        memberIDs: ["employee"],
        toolNames: ["search"],
      },
      {
        id: "paused",
        connectionID: "b",
        status: "paused",
        memberIDs: ["owner"],
        toolNames: ["search"],
      },
      {
        id: "mine",
        connectionID: "b",
        status: "active",
        memberIDs: ["owner"],
        toolNames: ["search"],
      },
    ],
  };
  const records = selectedToolInventory(data);
  assert.equal(records.length, 2);
  assert.notEqual(records[0].key, records[1].key);
  assert.equal(records[0].hub, undefined);
  assert.equal(records[0].enabled, false);
  assert.equal(records[1].hub.id, "mine");
  assert.equal(records[1].enabled, true);
});

test("workspace deep link preserves exact gateway identity", () => {
  const url = new URL(toolWorkspaceHref("hub&other=1"), "https://orca.example");
  assert.equal(url.searchParams.get("hub"), "hub&other=1");
  assert.equal(url.searchParams.get("view"), "hub");
  assert.equal(url.searchParams.size, 2);
  assert.equal(url.hash, "");
});

test('normal tool review enables selected actions while paused and unreviewed connections remain unavailable', () => {
  const connection = { id: 'normal', tools: [{ name: 'update' }, { name: 'delete' }], toolNames: ['update'], enabled: true, reviewedReadOnly: false, reviewedTools: true };
  const rows = selectedToolInventory({ currentUserID: 'owner', hubs: [], connections: [connection, { ...connection, id: 'paused', enabled: false }, { ...connection, id: 'unreviewed', reviewedTools: false }] });
  assert.deepEqual(rows.map(row => row.tool.name), ['update', 'update', 'update']);
  assert.deepEqual(rows.map(row => row.enabled), [true, false, false]);
});
