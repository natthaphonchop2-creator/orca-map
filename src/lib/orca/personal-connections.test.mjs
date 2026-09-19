import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const source = stripTypeScriptTypes(
  await readFile(new URL("./personal-connections.ts", import.meta.url), "utf8"),
).replace(
  /['"]\.\/activation['"]/,
  JSON.stringify(new URL("./activation.ts", import.meta.url).href),
);
const { personalSources, personalSetup, personalAccountReader } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

const connection = (id, mcpID = id) => ({
  id,
  mcpID,
  name: id,
  enabled: true,
  reviewedReadOnly: true,
  toolNames: ["read"],
  tools: [{ name: "read" }],
});
const hub = (id, connectionID, members = ["me"], status = "active") => ({
  id,
  name: id,
  connectionID,
  status,
  memberIDs: members,
  toolNames: ["read"],
});

test("personal sources dedupe provider IDs and require explicit current-user membership even for managers", () => {
  const data = {
    currentUserID: "me",
    canManage: true,
    connections: [
      connection("one", "shared"),
      connection("two", "shared"),
      connection("foreign"),
    ],
    hubs: [hub("h1", "one"), hub("h2", "two"), hub("h3", "foreign", ["other"])],
  };
  const records = personalSources(data);
  assert.equal(records.length, 1);
  assert.equal(records[0].sourceID, "shared");
  assert.deepEqual(
    records[0].hubs.map((item) => item.id),
    ["h1", "h2"],
  );
  assert.deepEqual(
    records[0].connections.map((item) => item.id),
    ["one", "two"],
  );
  assert.equal(records[0].canReadSetup, true);
});

test("members cannot query setup for inactive or unreviewed sources; an active reviewed gateway takes precedence", () => {
  const data = {
    currentUserID: "me",
    canManage: false,
    connections: [
      connection("one"),
      { ...connection("two"), reviewedReadOnly: false },
    ],
    hubs: [hub("paused", "one", ["me"], "paused"), hub("needs-review", "two")],
  };
  assert.ok(personalSources(data).every((item) => !item.canReadSetup));
  data.hubs.push(hub("active", "one"));
  const record = personalSources(data).find((item) => item.sourceID === "one");
  assert.equal(record.canReadSetup, true);
  assert.equal(record.manageHubID, "active");
  const ownerRecords = personalSources({ ...data, canManage: true });
  assert.ok(ownerRecords.every((item) => item.canReadSetup));
});

test("the UI retains only safe account metadata and rejects a response for another source", () => {
  const response = {
    sourceID: "one",
    name: "Example",
    endpointHost: "127.0.0.1",
    managedProvider: "google-drive",
    oauthProvider: "google",
    configured: true,
    oauthSupported: true,
    oauthConnected: true,
    oauthClientRequired: false,
    oauthClientConfigured: false,
    fields: [{ key: "TOKEN" }],
    oauthRedirectURL: "https://callback.example",
    unexpected: "sensitive",
  };
  assert.deepEqual(
    Object.keys(personalSetup(response, "one")).sort(),
    [
      "sourceID",
      "name",
      "endpointHost",
      "managedProvider",
      "oauthProvider",
      "configured",
      "oauthSupported",
      "oauthConnected",
      "oauthClientRequired",
      "oauthClientConfigured",
    ].sort(),
  );
  assert.equal(personalSetup(response, "one").managedProvider, "google-drive");
  assert.equal(personalSetup(response, "one").endpointHost, "127.0.0.1");
  assert.throws(() => personalSetup(response, "another"));
});

const turn = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const pending = [];
  const updates = [];
  let active = 0;
  let peak = 0;
  const reader = personalAccountReader(
    (id, signal) =>
      new Promise((resolve, reject) => {
        active += 1;
        peak = Math.max(peak, active);
        pending.push({
          id,
          signal,
          resolve(value) {
            active -= 1;
            resolve(value);
          },
          reject(error) {
            active -= 1;
            reject(error);
          },
        });
      }),
    (event) => updates.push(event),
  );
  return { reader, pending, updates, peak: () => peak };
}

test("account reader caps concurrency at four and never publishes superseded reads", async () => {
  const f = fixture();
  f.reader.replace(["a", "b", "c", "d", "e", "e"]);
  assert.equal(f.pending.length, 4);
  f.reader.replace(["fresh"]);
  assert.ok(f.pending.every((item) => item.signal.aborted));
  assert.equal(
    f.pending.length,
    4,
    "new requests wait even if an aborted transport has not settled",
  );
  f.pending[0].resolve("stale");
  await turn();
  assert.equal(f.pending.length, 5);
  assert.equal(f.pending[4].id, "fresh");
  f.pending[4].resolve("current");
  for (const item of f.pending.slice(1, 4)) item.resolve("stale");
  await turn();
  assert.equal(f.peak(), 4);
  assert.deepEqual(
    f.updates.filter((item) => item.status === "ready"),
    [{ sourceID: "fresh", status: "ready", value: "current" }],
  );
  assert.equal(
    f.pending.some((item) => item.id === "e"),
    false,
  );
  f.reader.dispose();
});

test("per-source retries preserve the concurrency budget and disposal cancels callbacks", async () => {
  const f = fixture();
  f.reader.replace(["a"]);
  f.reader.retry("a");
  assert.equal(f.pending[0].signal.aborted, true);
  f.pending[1].resolve("new");
  f.pending[0].resolve("old");
  await turn();
  assert.deepEqual(
    f.updates.filter((item) => item.status === "ready"),
    [{ sourceID: "a", status: "ready", value: "new" }],
  );
  f.reader.retry("a");
  const count = f.updates.length;
  f.reader.dispose();
  assert.equal(f.pending[2].signal.aborted, true);
  f.pending[2].reject(new Error("aborted"));
  await turn();
  assert.equal(f.updates.length, count);
});
