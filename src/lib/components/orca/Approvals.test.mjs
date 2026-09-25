import { importTypeScript } from "../../orca/test-import.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";

const component = await readFile(new URL("./Approvals.svelte", import.meta.url), "utf8");
const approvals = await importTypeScript(new URL("../../orca/approvals.ts", import.meta.url));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, "")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, dependencies) {
  const { OrcaService, onMount, onDestroy, approvalTone, argumentEntries, orcaLocale, t, toolPresentation, displayDate, memberName, orcaError } = dependencies;
  ${script}
  return {
    load, approve, reject, switchTab, toolLabel, person, workspace, statusLabel, failureLabel, decisionLine,
    get items() { return items; }, get error() { return error; }, get notice() { return notice; },
    get busyID() { return busyID; }, get loaded() { return loaded; }, get tab() { return tab; },
    get confirming() { return confirming; }, get rejecting() { return rejecting; },
    setRejecting(id, value) { rejecting = id; note = value; }, setConfirming(id) { confirming = id; },
  };
}`,
  { filename: "approvals-test.svelte.js", generate: "client" },
).js.code.replaceAll("svelte/internal/client", pathToFileURL(require.resolve("svelte/internal/client")).href);
const { harness } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const data = (canManage = true) => ({
  canManage,
  currentUserID: canManage ? "1" : "2",
  members: [{ id: "1", displayName: "Owner" }, { id: "2", displayName: "Member" }],
  hubs: [{ id: "khh-1", name: "Sales" }],
  connections: [{ id: "khc-1", name: "FlowAccount", tools: [{ name: "create_quote", description: "Create a quotation" }] }],
});
const waiting = (id, extra = {}) => ({ id, createdAt: "2026-09-25T08:00:00Z", expiresAt: "2026-10-02T08:00:00Z", userID: "2", hubID: "khh-1", connectionID: "khc-1", toolName: "create_quote", arguments: { customer: "Synthetic Co" }, status: "pending", ...extra });

function mount(props, service) {
  const calls = { list: [], approve: [], reject: [], changed: 0 };
  let view;
  const stop = effect_root(() => {
    view = harness({ ...props, onchanged: () => calls.changed++ }, {
      ...approvals,
      OrcaService: {
        approvals: async (status, mine) => { calls.list.push([status, mine]); return service.list(status, mine); },
        approveRequest: async (id) => { calls.approve.push(id); return service.approve(id); },
        rejectRequest: async (id, note) => { calls.reject.push([id, note]); return service.reject(id, note); },
      },
      onMount: () => {},
      onDestroy: () => {},
      orcaLocale: { value: "th" },
      t: (th) => th,
      toolPresentation: (tool) => ({ label: tool.description ? `label:${tool.description}` : `raw:${tool.name}` }),
      displayDate: (value) => value ?? "—",
      memberName: (member) => member.displayName || member.id,
      orcaError: (error) => error.message,
    });
  });
  return { view, calls, stop };
}

test("a manager approves a waiting request once and sees what happened", async () => {
  let pending = [waiting("apr-1")];
  let release;
  const { view, calls, stop } = mount({ data: data() }, {
    list: async () => pending,
    approve: (id) => new Promise((resolve) => { release = () => { pending = []; resolve({ ...waiting(id), status: "succeeded", result: "QT-0001" }); }; }),
  });
  try {
    await view.load();
    assert.deepEqual(calls.list, [["pending", false]], "managers list everyone's requests");
    assert.equal(view.items.length, 1);
    assert.equal(view.toolLabel(view.items[0]), "label:Create a quotation");
    assert.equal(view.person("2"), "Member");
    assert.equal(view.workspace("khh-1"), "Sales");
    view.setConfirming("apr-1");
    const first = view.approve(view.items[0]);
    const second = view.approve(view.items[0]);
    await second;
    assert.deepEqual(calls.approve, ["apr-1"], "a double click never sends a second approval");
    assert.equal(view.busyID, "apr-1");
    release();
    await first;
    flush();
    assert.equal(view.busyID, "");
    assert.equal(view.confirming, "");
    assert.match(view.notice, /สำเร็จ/);
    assert.equal(view.items.length, 0);
    assert.equal(calls.changed, 1, "the menu's waiting count refreshes");
  } finally { stop(); }
});

test("an approval that fails or was already decided explains itself and reloads", async () => {
  let answer = { ...waiting("apr-1"), status: "failed", errorCategory: "permission_denied" };
  const { view, calls, stop } = mount({ data: data() }, {
    list: async () => [waiting("apr-1")],
    approve: async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  try {
    await view.load();
    await view.approve(view.items[0]);
    assert.match(view.notice, /ทำไม่สำเร็จ: ผู้ขอไม่มีสิทธิ์ใช้เครื่องมือนี้แล้ว/);
    answer = new Error("This request has already been decided");
    await view.approve(view.items[0]);
    assert.equal(view.error, "This request has already been decided");
    assert.equal(view.notice, "");
    assert.equal(calls.list.length, 3, "each attempt reloads the list");
    assert.equal(calls.changed, 2);
  } finally { stop(); }
});

test("a rejection sends the trimmed note and members only list their own requests", async () => {
  const { view, calls, stop } = mount({ data: data() }, {
    list: async () => [waiting("apr-2")],
    reject: async (id, note) => ({ ...waiting(id), status: "rejected", note }),
  });
  try {
    await view.load();
    view.setRejecting("apr-2", "  Wrong customer  ");
    await view.reject(view.items[0]);
    assert.deepEqual(calls.reject, [["apr-2", "Wrong customer"]]);
    assert.equal(view.rejecting, "");
    assert.match(view.notice, /ปฏิเสธคำขอ/);
  } finally { stop(); }

  const member = mount({ data: data(false) }, { list: async () => [] });
  try {
    await member.view.load();
    assert.deepEqual(member.calls.list, [["pending", true]]);
    assert.equal(member.view.person("9"), "ผู้ที่ไม่ได้เป็นสมาชิกแล้ว");
    assert.equal(member.view.workspace("gone"), "พื้นที่ทำงานที่ถูกลบ");
    assert.equal(member.view.toolLabel(waiting("x", { connectionID: "gone", toolName: "delete_all" })), "raw:delete_all");
  } finally { member.stop(); }
});

test("switching tabs ignores the slower earlier answer", async () => {
  const answers = {};
  const { view, calls, stop } = mount({ data: data() }, {
    list: (status) => new Promise((resolve) => { answers[status] = resolve; }),
  });
  try {
    const pending = view.load();
    view.switchTab("decided");
    assert.equal(view.tab, "decided");
    answers.decided([{ ...waiting("apr-9"), status: "rejected" }]);
    answers.pending([waiting("apr-1")]);
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(view.items.map((item) => item.id), ["apr-9"]);
    assert.deepEqual(calls.list, [["pending", false], ["decided", false]]);
    assert.equal(view.statusLabel("expired"), "หมดเวลา");
    assert.equal(view.decisionLine({ status: "rejected", decidedBy: "1", decidedAt: "2026-09-25T09:00:00Z" }), "ปฏิเสธโดย Owner · 2026-09-25T09:00:00Z");
    assert.equal(view.decisionLine({ status: "failed", decidedBy: "1", decidedAt: "2026-09-25T09:00:00Z" }), "อนุมัติโดย Owner · 2026-09-25T09:00:00Z", "a failed run was still approved");
    assert.match(view.decisionLine({ status: "expired" }), /ไม่ได้ทำงานนี้/);
    assert.equal(view.decisionLine({ status: "succeeded" }), "");
    assert.equal(view.failureLabel("anything"), "ระบบปลายทางแจ้งข้อผิดพลาด");
  } finally { stop(); }
});

test("the inbox compiles without warnings", () => {
  assert.deepEqual(compile(component, { filename: "Approvals.svelte", generate: "client" }).warnings.map((warning) => warning.code), []);
});
