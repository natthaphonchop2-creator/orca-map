import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalTone, argumentEntries, argumentLabel, canRetry, failureText, hubAsksApproval, isLineWrite, LINE_SOURCE, lineSend, pendingApprovals, sameSendApproved } from "./approvals.ts";

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

test("a LINE send reads in Thai on the approval card: the user ID, recipient name, text and the silent switch", async () => {
  const { lineTools } = await import(new URL("./line-messaging-tools.fixture.mjs", import.meta.url).href);
  const push = lineTools.find((tool) => tool.name === "line_push_text");
  const args = { userId: "U0123456789abcdef0123456789abcdef", recipientName: "ลูกค้าตัวอย่าง", text: "สวัสดีค่ะ\nโปรโมชันเดือนนี้", notificationDisabled: true };
  assert.deepEqual(argumentEntries(args, push.inputSchema), [
    ["รหัสผู้ใช้ LINE", "U0123456789abcdef0123456789abcdef"],
    ["ชื่อผู้รับ", "ลูกค้าตัวอย่าง"],
    ["ข้อความ", "สวัสดีค่ะ\nโปรโมชันเดือนนี้"],
    ["ส่งแบบไม่มีเสียงแจ้งเตือน", "true"],
  ]);
  assert.deepEqual(argumentEntries(args, push.inputSchema, "en").map(([label]) => label), ["LINE user ID", "Recipient name", "Text", "Send without a notification sound"]);
  const link = lineTools.find((tool) => tool.name === "line_user_richmenu_link");
  assert.deepEqual(argumentEntries({ userId: "U0123456789abcdef0123456789abcdef", richMenuId: "richmenu-0123456789abcdef0123456789abcdef" }, link.inputSchema).map(([label]) => label), ["รหัสผู้ใช้ LINE", "รหัสริชเมนู"]);
  assert.equal(argumentLabel("requestId"), "รหัสคำขอของ LINE");
});

// LINE Messaging API v2 (design §14l): the approver reads a send as customers
// will, a LINE answer is explained in plain words, and a send LINE didn't
// answer offers the same-key retry instead of a new request.
const line = [{ id: "c-line", mcpID: LINE_SOURCE }, { id: "c-remote", mcpID: "some-remote-line-bot" }];
const hour = 60 * 60 * 1000;
const now = Date.parse("2026-09-30T12:00:00Z");
const at = (hours) => new Date(now - hours * hour).toISOString();
const push = { id: "kap-1", connectionID: "c-line", toolName: "line_push_text", status: "pending", arguments: { userId: "U0123456789abcdef0123456789abcdef", recipientName: "สมชาย", text: "ออเดอร์พร้อมรับแล้ว\nขอบคุณค่ะ https://example.test/x", notificationDisabled: true } };

test("a LINE send reads as its message and recipient, only on ORCA's own LINE connector", () => {
  assert.deepEqual(lineSend(push, line), { kind: "push", text: "ออเดอร์พร้อมรับแล้ว\nขอบคุณค่ะ https://example.test/x", recipientName: "สมชาย", recipientShort: "U0123…cdef", silent: true });
  assert.deepEqual(lineSend({ ...push, toolName: "line_broadcast_text", arguments: { text: "ลดราคา" } }, line), { kind: "broadcast", text: "ลดราคา", silent: false });
  // A remote server with the same tool name is not ORCA's LINE connector.
  assert.equal(lineSend({ ...push, connectionID: "c-remote" }, line), undefined);
  assert.equal(lineSend({ ...push, toolName: "line_default_richmenu_set", arguments: { richMenuId: "richmenu-0" } }, line), undefined);
  assert.equal(lineSend({ ...push, arguments: { userId: "U1", recipientName: "x" } }, line), undefined, "no text, no preview");
  assert.equal(isLineWrite({ ...push, toolName: "line_user_richmenu_unlink" }, line), true);
  assert.equal(isLineWrite({ ...push, toolName: "line_profile_get" }, line), false);
  assert.equal(isLineWrite({ ...push, connectionID: "c-remote" }, line), false);
});

test("LINE's answers read in plain words; an unknown category keeps the general sentence", () => {
  for (const category of ["provider_token", "provider_access", "provider_not_found", "provider_rejected", "provider_quota", "provider_rate_limited", "recipient_mismatch", "unknown_outcome", "approval_required", "audit_unconfirmed"]) {
    assert.notEqual(failureText(category), failureText("something_new"), category);
    assert.notEqual(failureText(category, "en"), failureText("something_new", "en"), category);
  }
  assert.match(failureText("unknown_outcome"), /อย่าขอส่งใหม่/);
  assert.match(failureText("unknown_outcome"), /ลองอีกครั้ง \(ไม่ส่งซ้ำ\)/);
  assert.match(failureText("provider_rate_limited"), /ยังไม่มีอะไรถูกส่ง/);
  assert.equal(failureText(undefined), "โปรแกรมแจ้งข้อผิดพลาด");
  assert.equal(failureText("constructor"), "โปรแกรมแจ้งข้อผิดพลาด", "only the table's own keys");
});

test("retry (no double send) is offered only for a LINE write whose outcome is unknown, within 23 hours and 4 runs", () => {
  const failed = { ...push, status: "failed", errorCategory: "unknown_outcome", decidedAt: at(1), attempts: 1 };
  assert.equal(canRetry(failed, line, now), true);
  for (const category of ["audit_unconfirmed", "timeout", "canceled"]) assert.equal(canRetry({ ...failed, errorCategory: category }, line, now), true, category);
  assert.equal(canRetry({ ...failed, errorCategory: "provider_rate_limited" }, line, now), false, "a final answer is not retried");
  assert.equal(canRetry({ ...failed, errorCategory: "recipient_mismatch" }, line, now), false);
  assert.equal(canRetry({ ...failed, status: "succeeded" }, line, now), false);
  assert.equal(canRetry({ ...failed, decidedAt: at(23) }, line, now), false, "23 hours after the first run");
  assert.equal(canRetry({ ...failed, decidedAt: at(22.9) }, line, now), true);
  assert.equal(canRetry({ ...failed, attempts: 4 }, line, now), false);
  assert.equal(canRetry({ ...failed, attempts: 3 }, line, now), true);
  assert.equal(canRetry({ ...failed, decidedAt: undefined }, line, now), false);
  assert.equal(canRetry({ ...failed, connectionID: "c-remote" }, line, now), false, "only LINE's writes carry a retry key");
  assert.equal(canRetry({ ...failed, toolName: "line_profile_get" }, line, now), false);
});

test("the same LINE send approved in the last 24 hours is flagged, whatever the key order", () => {
  const reordered = { text: push.arguments.text, notificationDisabled: true, recipientName: "สมชาย", userId: push.arguments.userId };
  const sent = { id: "kap-0", connectionID: "c-line", toolName: "line_push_text", status: "succeeded", decidedAt: at(2), arguments: reordered };
  assert.equal(sameSendApproved(push, [sent], line, now), sent);
  assert.equal(sameSendApproved(push, [{ ...sent, status: "failed", errorCategory: "unknown_outcome" }], line, now)?.id, "kap-0", "it may have been sent");
  assert.equal(sameSendApproved(push, [{ ...sent, status: "failed", errorCategory: "provider_rate_limited" }], line, now), undefined, "nothing was sent");
  assert.equal(sameSendApproved(push, [{ ...sent, status: "rejected" }], line, now), undefined);
  assert.equal(sameSendApproved(push, [{ ...sent, decidedAt: at(25) }], line, now), undefined, "older than a day");
  assert.equal(sameSendApproved(push, [{ ...sent, arguments: { ...reordered, text: "อีกข้อความ" } }], line, now), undefined);
  assert.equal(sameSendApproved(push, [{ ...sent, connectionID: "c-other" }], line, now), undefined);
  assert.equal(sameSendApproved(push, [{ ...push, status: "succeeded", decidedAt: at(1) }], line, now), undefined, "not itself");
});

test("members see their requests wherever a LINE write waits, even in a workspace that runs at once", () => {
  assert.equal(hubAsksApproval({ status: "active", writeMode: "approval", sources: [] }, line), true);
  assert.equal(hubAsksApproval({ status: "active", writeMode: "direct", sources: [{ connectionID: "c-line", toolNames: ["line_profile_get", "line_broadcast_text"] }] }, line), true);
  assert.equal(hubAsksApproval({ status: "active", writeMode: "", connectionID: "c-line", toolNames: ["line_user_richmenu_link"] }, line), true, "legacy single-source fields");
  assert.equal(hubAsksApproval({ status: "active", writeMode: "direct", sources: [{ connectionID: "c-line", toolNames: ["line_profile_get"] }] }, line), false, "reads only");
  assert.equal(hubAsksApproval({ status: "active", writeMode: "direct", sources: [{ connectionID: "c-remote", toolNames: ["line_broadcast_text"] }] }, line), false);
  assert.equal(hubAsksApproval({ status: "archived", writeMode: "approval", sources: [] }, line), false);
});
