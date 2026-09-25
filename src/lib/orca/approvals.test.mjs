import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalTone, argumentEntries, pendingApprovals } from "./approvals.ts";

test("each status has one tone", () => {
  assert.deepEqual(["pending", "running", "succeeded", "failed", "rejected", "expired"].map(approvalTone), ["waiting", "waiting", "ok", "bad", "muted", "muted"]);
});

test("arguments read as label and value, lists of records one per line", () => {
  assert.deepEqual(argumentEntries({ customer: "Synthetic Co", total: 1200, items: [{ sku: "A", qty: 2 }, { sku: "B", tags: ["x"] }], to: ["a@example.test", "b@example.test"], note: null, empty: [] }), [
    ["customer", "Synthetic Co"],
    ["total", "1200"],
    ["items", 'sku: A · qty: 2\nsku: B · tags: ["x"]'],
    ["to", "a@example.test, b@example.test"],
    ["note", "—"],
    ["empty", "—"],
  ]);
  assert.deepEqual(argumentEntries({ address: { city: "Bangkok", zip: 10110 }, flag: false }), [["address", "city: Bangkok · zip: 10110"], ["flag", "false"]]);
  assert.deepEqual(argumentEntries({ mixed: [{ a: 1 }, "b"] }), [["mixed", '{"a":1}, b']]);
  assert.deepEqual(argumentEntries(undefined), []);
  assert.deepEqual(argumentEntries(["a"]), [["", "a"]]);
  assert.deepEqual(argumentEntries("plain"), [["", "plain"]]);
});

test("only waiting requests count as pending", () => {
  assert.deepEqual(pendingApprovals([{ status: "pending" }, { status: "running" }, { status: "expired" }]).length, 1);
});
