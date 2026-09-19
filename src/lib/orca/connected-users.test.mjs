import { importTypeScript } from './test-import.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const { connectedOAuthMembers, unverifiedOAuthMemberCount } = await importTypeScript(new URL('./connected-users.ts', import.meta.url));
const data = {
  canManage: true,
  connections: [{ id: "server-a" }, { id: "server-b" }],
  members: [{ id: "alice" }, { id: "bob" }, { id: "carol" }, { id: "dave" }],
  hubs: [
    {
      id: "gateway-a",
      connectionID: "server-a",
      memberIDs: ["alice", "bob", "carol"],
    },
    { id: "gateway-b", connectionID: "server-b", memberIDs: ["alice", "dave"] },
  ],
};
const response = {
  connectionID: "server-a",
  items: [
    {
      memberID: "alice",
      oauthTokenPresent: true,
      configured: null,
      relevantHubIDs: ["gateway-a", "gateway-b"],
    },
    {
      memberID: "bob",
      oauthTokenPresent: false,
      configured: true,
      relevantHubIDs: ["gateway-a"],
    },
    {
      memberID: "carol",
      oauthTokenPresent: null,
      configured: true,
      relevantHubIDs: ["gateway-a"],
    },
    {
      memberID: "dave",
      oauthTokenPresent: true,
      relevantHubIDs: ["gateway-b"],
    },
    {
      memberID: "removed",
      oauthTokenPresent: true,
      relevantHubIDs: ["gateway-a"],
    },
  ],
};

test("Connected users contains saved OAuth grants, not merely configured or assigned users", () => {
  const rows = connectedOAuthMembers(data, "server-a", response);
  assert.deepEqual(
    rows.map((row) => row.member.id),
    ["alice"],
  );
  assert.deepEqual(
    rows[0].gateways.map((hub) => hub.id),
    ["gateway-a"],
  );
  assert.equal(rows[0].configured, null);
});

test("role, server and membership changes hide stale OAuth evidence", () => {
  assert.deepEqual(
    connectedOAuthMembers({ ...data, canManage: false }, "server-a", response),
    [],
  );
  assert.deepEqual(connectedOAuthMembers(data, "server-b", response), []);
  assert.deepEqual(
    connectedOAuthMembers({ ...data, connections: [] }, "server-a", response),
    [],
  );
  assert.deepEqual(
    connectedOAuthMembers({ ...data, hubs: [] }, "server-a", response),
    [],
  );
  assert.deepEqual(connectedOAuthMembers(data, "server-a"), []);
});

test("unknown authorization remains distinct from a verified absence of OAuth grants", () => {
  assert.equal(unverifiedOAuthMemberCount(data, "server-a", response), 1);
  const allUnknown = {
    ...response,
    items: response.items.map((row) => ({ ...row, oauthTokenPresent: null })),
  };
  assert.deepEqual(connectedOAuthMembers(data, "server-a", allUnknown), []);
  assert.equal(unverifiedOAuthMemberCount(data, "server-a", allUnknown), 3);
  const noGrants = {
    ...response,
    items: response.items.map((row) => ({ ...row, oauthTokenPresent: false })),
  };
  assert.deepEqual(connectedOAuthMembers(data, "server-a", noGrants), []);
  assert.equal(unverifiedOAuthMemberCount(data, "server-a", noGrants), 0);
  assert.equal(
    unverifiedOAuthMemberCount(
      { ...data, canManage: false },
      "server-a",
      allUnknown,
    ),
    0,
  );
  assert.equal(unverifiedOAuthMemberCount(data, "server-b", allUnknown), 0);
});
