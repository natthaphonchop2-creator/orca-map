import assert from "node:assert/strict";
import { test } from "node:test";
import { auditDetailValues, auditDuration } from "./audit-details.ts";

test("legacy records do not invent execution metadata", () => {
  assert.deepEqual(auditDetailValues({ id: "event-1", version: 3 }), {
    reference: "event-1",
    hubVersion: undefined,
    connectionVersion: undefined,
    resourceVersion: undefined,
    resourceID: undefined,
    finishedAt: undefined,
    durationMs: undefined,
    schemaHash: undefined,
    errorCategory: undefined,
  });
  assert.equal(auditDetailValues({ hubID: "hub-1", version: 3 }).hubVersion, 3);
  assert.equal(auditDetailValues({ durationMs: 0 }).durationMs, 0);
  assert.equal(auditDuration(0), "0 ms");
  assert.equal(auditDuration(1250), "1.25 s");
});

test("administrative resource versions are not mislabeled as Hub versions", () => {
  const library = auditDetailValues({
    action: "library.update",
    hubID: "hub-1",
    resourceID: "item-1",
    version: 7,
  });
  assert.equal(library.hubVersion, undefined);
  assert.equal(library.resourceVersion, 7);
  assert.equal(library.resourceID, "item-1");
  const connection = auditDetailValues({
    action: "connection.update",
    version: 4,
  });
  assert.equal(connection.connectionVersion, 4);
  assert.equal(connection.hubVersion, undefined);
  assert.equal(connection.resourceVersion, undefined);
  assert.equal(
    auditDetailValues({ action: "tools.call", hubID: "hub-1", version: 2 })
      .hubVersion,
    2,
  );
  assert.equal(
    auditDetailValues({ action: "unknown", hubID: "hub-1", version: 9 })
      .resourceVersion,
    undefined,
  );
});

test("completion metadata uses recorded timestamps only and does not infer completion from status", () => {
  assert.equal(auditDetailValues({ outcome: "success" }).finishedAt, undefined);
  assert.equal(
    auditDetailValues({ finishedAt: "not a timestamp" }).finishedAt,
    undefined,
  );
  assert.equal(
    auditDetailValues({ finishedAt: "2026-09-18T01:20:00Z" }).finishedAt,
    "2026-09-18T01:20:00Z",
  );
});
test("details only expose validated hashes, numeric metadata and allowlisted error categories", () => {
  const hash = "sha256:" + "a".repeat(64);
  assert.equal(auditDetailValues({ toolSchemaHash: hash }).schemaHash, hash);
  assert.equal(
    auditDetailValues({ toolSchemaHash: "unexpected private value" })
      .schemaHash,
    undefined,
  );
  assert.equal(
    auditDetailValues({ errorCategory: "authentication_required" })
      .errorCategory,
    "authentication_required",
  );
  assert.equal(
    auditDetailValues({ errorCategory: "provider response with token" })
      .errorCategory,
    "unknown",
  );
  for (const invalid of [-1, Infinity, NaN, 1.5, "5", null]) {
    assert.equal(
      auditDetailValues({ durationMs: invalid }).durationMs,
      undefined,
    );
    assert.equal(
      auditDetailValues({ connectionVersion: invalid }).connectionVersion,
      undefined,
    );
  }
});
