import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalTone, argumentEntries, argumentLabel, pendingApprovals } from "./approvals.ts";

test("each status has one tone", () => {
  assert.deepEqual(["pending", "running", "succeeded", "failed", "rejected", "expired"].map(approvalTone), ["waiting", "waiting", "ok", "bad", "muted", "muted"]);
});

test("arguments read as plain labels and values, lists of records one per line", () => {
  assert.deepEqual(argumentEntries({ customer: "Synthetic Co", total: 1200, items: [{ sku: "A", qty: 2 }, { sku: "B", tags: ["x"] }], to: ["a@example.test", "b@example.test"], note: null, empty: [] }), [
    ["ลูกค้า", "Synthetic Co"],
    ["ยอดรวม", "1200"],
    ["รายการ", 'รหัสสินค้า: A · จำนวน: 2\nรหัสสินค้า: B · แท็ก: ["x"]'],
    ["ถึง", "a@example.test, b@example.test"],
    ["หมายเหตุ", "—"],
    ["Empty", "—"],
  ]);
  assert.deepEqual(argumentEntries({ address: { city: "Bangkok", zip: 10110 }, flag: false }), [["ที่อยู่", "เมือง: Bangkok · รหัสไปรษณีย์: 10110"], ["Flag", "false"]]);
  assert.deepEqual(argumentEntries({ mixed: [{ a: 1 }, "b"] }), [["Mixed", '{"a":1}, b']]);
  assert.deepEqual(argumentEntries(undefined), []);
  assert.deepEqual(argumentEntries(["a"]), [["", "a"]]);
  assert.deepEqual(argumentEntries("plain"), [["", "plain"]]);
});

test("the approval card never shows raw English keys: the provider's titles, known words, then spaced words", () => {
  // The fixture's create_quotation: customer and a list of items with name, quantity and price.
  const args = { customer: "ลูกค้าตัวอย่าง ก", items: [{ name: "บริการติดตั้ง", quantity: 2, price: 4500 }] };
  assert.deepEqual(argumentEntries(args), [["ลูกค้า", "ลูกค้าตัวอย่าง ก"], ["รายการ", "ชื่อ: บริการติดตั้ง · จำนวน: 2 · ราคา: 4500"]]);
  assert.deepEqual(argumentEntries(args, undefined, "en"), [["Customer", "ลูกค้าตัวอย่าง ก"], ["Items", "Name: บริการติดตั้ง · Quantity: 2 · Price: 4500"]]);
  // A provider that titles its fields wins, nested ones too.
  const schema = { type: "object", properties: { customer: { type: "string", title: "ชื่อลูกค้าในใบเสนอราคา" }, items: { type: "array", items: { type: "object", properties: { price: { title: "ราคาต่อหน่วย (บาท)" } } } } } };
  assert.deepEqual(argumentEntries(args, schema), [["ชื่อลูกค้าในใบเสนอราคา", "ลูกค้าตัวอย่าง ก"], ["รายการ", "ชื่อ: บริการติดตั้ง · จำนวน: 2 · ราคาต่อหน่วย (บาท): 4500"]]);
  assert.equal(argumentLabel("unitPrice"), "ราคาต่อหน่วย");
  assert.equal(argumentLabel("shipping_method"), "Shipping method");
});

test("only waiting requests count as pending", () => {
  assert.deepEqual(pendingApprovals([{ status: "pending" }, { status: "running" }, { status: "expired" }]).length, 1);
});
