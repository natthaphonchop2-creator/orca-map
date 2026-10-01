import assert from "node:assert/strict";
import { test } from "node:test";
import { auditDetailValues, auditDuration, auditLibraryRefs } from "./audit-details.ts";

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
    fileVersion: undefined,
    libraryRefs: [],
  });
  assert.equal(auditDetailValues({ hubID: "hub-1", version: 3 }).hubVersion, 3);
  assert.equal(auditDetailValues({ durationMs: 0 }).durationMs, 0);
  // Seconds, not milliseconds (the history table is for a shop owner).
  assert.equal(auditDuration(0), "ไม่ถึง 0.1 วินาที");
  assert.equal(auditDuration(277), "0.3 วินาที");
  assert.equal(auditDuration(1050), "1.1 วินาที");
  assert.equal(auditDuration(1000), "1 วินาที");
  assert.equal(auditDuration(12_400), "12 วินาที");
  assert.equal(auditDuration(75_000), "1 นาที 15 วินาที");
  assert.equal(auditDuration(120_000), "2 นาที");
  assert.equal(auditDuration(1250, "en"), "1.3 s");
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

test("knowledge library v2 records name the file's version, the reasons a file failed, and what the AI received", () => {
  // A file's own events carry the file's version, never mistaken for the workspace's or the item's.
  for (const action of ["library.file.upload", "library.file.replace", "library.file.ready", "library.file.partial", "library.file.failed", "library.file.publish", "library.file.reextract", "library.file.download"]) {
    const detail = auditDetailValues({ action, hubID: "hub-1", resourceID: "orl-1", version: 3 });
    assert.equal(detail.fileVersion, 3, action);
    assert.equal(detail.hubVersion, undefined, action);
    assert.equal(detail.resourceVersion, undefined, action);
  }
  // Options that read nothing again record version 0: no version is shown.
  assert.equal(auditDetailValues({ action: "library.file.options", hubID: "hub-1", version: 0 }).fileVersion, undefined);
  assert.equal(auditDetailValues({ action: "library.file.options", hubID: "hub-1", version: 4 }).fileVersion, 4);
  // The item's own changes keep the item's version.
  for (const action of ["library.takeover", "library.audience.live", "library.audience.list"]) {
    const detail = auditDetailValues({ action, hubID: "hub-1", version: 9 });
    assert.equal(detail.resourceVersion, 9, action);
    assert.equal(detail.fileVersion, undefined, action);
  }
  for (const category of ["file_too_large", "file_unsupported", "file_hostile", "file_encrypted", "extract_timeout", "extract_memory", "extract_failed", "storage_error"])
    assert.equal(auditDetailValues({ errorCategory: category }).errorCategory, category);
  assert.equal(auditDetailValues({ errorCategory: "a raw parser message" }).errorCategory, "unknown", "anything else is never echoed");
  // What a search released: items and versions, a title only when the server sent one; malformed entries dropped.
  const refs = auditDetailValues({
    action: "tools.call",
    libraryRefs: [
      { itemID: "orl-a", kind: "article", title: "นโยบายคืนสินค้า", version: 4 },
      { itemID: "orl-f", kind: "file", title: "", version: 2 },
      { itemID: "", kind: "file", title: "x", version: 1 },
      { itemID: "orl-x", kind: "file", title: "x", version: 0 },
      { itemID: "orl-y", kind: "<b>odd</b>", title: 7, version: 1 },
      "orl-z",
    ],
  }).libraryRefs;
  assert.deepEqual(refs, [
    { itemID: "orl-a", kind: "article", title: "นโยบายคืนสินค้า", version: 4 },
    { itemID: "orl-f", kind: "file", title: "", version: 2 },
    { itemID: "orl-y", kind: "other", title: "", version: 1 },
  ]);
  assert.equal(auditLibraryRefs(Array.from({ length: 40 }, (_, i) => ({ itemID: `orl-${i}`, kind: "file", title: "", version: 1 }))).length, 25, "at most the 25 a call releases");
  assert.deepEqual(auditLibraryRefs(undefined), []);
});
