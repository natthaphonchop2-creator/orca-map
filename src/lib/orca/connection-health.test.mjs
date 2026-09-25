import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionHealthView, healthByConnection } from "./connection-health.ts";

const item = (status, extra = {}) => ({ connectionID: "khc-1", status, calls: 0, succeeded: 0, failed: 0, changed: 0, needsSignIn: 0, toolErrors: 0, ...extra });

test("each status maps to one tone, and attempts leave out the caller's own mistakes", () => {
  assert.equal(connectionHealthView(item("healthy", { calls: 12, succeeded: 10 })).tone, "ok");
  const degraded = connectionHealthView(item("degraded", { calls: 30, succeeded: 19, failed: 1, changed: 1 }));
  assert.deepEqual([degraded.tone, degraded.attempts, degraded.changed], ["warn", 20, true]);
  const failing = connectionHealthView(item("failing", { failed: 3, lastFailureCategory: "timeout", lastFailureAt: "2026-09-25T10:00:00Z" }));
  assert.deepEqual([failing.tone, failing.lastFailureCategory], ["bad", "timeout"]);
  assert.equal(connectionHealthView(item("idle", { calls: 4 })).tone, "idle");
});

test("a system without finished calls in the window is idle", () => {
  assert.deepEqual(connectionHealthView(undefined), { tone: "idle", succeeded: 0, attempts: 0, needsSignIn: 0, changed: false });
  const byID = healthByConnection([item("healthy"), { ...item("failing"), connectionID: "khc-2" }]);
  assert.equal(byID.get("khc-2").status, "failing");
  assert.equal(byID.get("khc-missing"), undefined);
});
