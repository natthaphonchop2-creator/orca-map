import { importTypeScript } from "../../orca/test-import.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";
import { render } from "svelte/server";
import { serverComponent } from "./test-render.mjs";

const component = await readFile(new URL("./Approvals.svelte", import.meta.url), "utf8");
const approvals = await importTypeScript(new URL("../../orca/approvals.ts", import.meta.url));
const programTools = await importTypeScript(new URL("../../orca/program-tools.ts", import.meta.url));
const { glossary } = await importTypeScript(new URL("../../orca/glossary.ts", import.meta.url));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, "")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, dependencies) {
  const { OrcaService, onMount, onDestroy, tick, approvalTone, argumentEntries, canRetry, failureText, lineSend, sameSendApprovedAt, orcaLocale, t, term, eventToolLabel, displayDate, memberName, orcaError, showToast } = dependencies;
  ${script}
  return {
    load, approve, reject, retry, switchTab, toolLabel, person, requester, inputSchema, workspace, statusLabel, failureLabel, decisionLine,
    get items() { return items; }, get error() { return error; }, get notice() { return notice; },
    get busyID() { return busyID; }, get loaded() { return loaded; }, get tab() { return tab; },
    get confirming() { return confirming; }, get rejecting() { return rejecting; }, get retrying() { return retrying; },
    get approving() { return approving; }, get declining() { return declining; }, get rerunning() { return rerunning; }, get approvingSend() { return approvingSend; },
    get now() { return now; }, pillTone,
    setRejecting(id, value) { rejecting = id; note = value; }, setConfirming(id) { confirming = id; }, setRetrying(id) { retrying = id; },
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
  const calls = { list: [], approve: [], reject: [], retry: [], changed: 0, toasts: [] };
  let view;
  const stop = effect_root(() => {
    view = harness({ ...props, onchanged: () => calls.changed++ }, {
      ...approvals,
      OrcaService: {
        approvals: async (status, mine) => { calls.list.push([status, mine]); return service.list(status, mine); },
        approveRequest: async (id) => { calls.approve.push(id); return service.approve(id); },
        rejectRequest: async (id, note) => { calls.reject.push([id, note]); return service.reject(id, note); },
        retryRequest: async (id) => { calls.retry.push(id); return service.retry(id); },
      },
      onMount: () => {},
      onDestroy: () => {},
      tick: async () => {},
      orcaLocale: { value: "th" },
      t: (th) => th,
      term: (key, translate) => translate(...glossary[key]),
      showToast: (message, options) => calls.toasts.push([message, options?.tone ?? "ok"]),
      eventToolLabel: programTools.eventToolLabel,
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
    assert.equal(view.toolLabel(view.items[0]), "Create a quotation", "the program's words for the tool, as on its own page");
    assert.equal(view.person("2"), "Member");
    assert.equal(view.workspace("khh-1"), "Sales");
    view.setConfirming("apr-1");
    flush();
    assert.equal(view.approving?.id, "apr-1", "approving asks in a modal first");
    assert.equal(view.declining, undefined);
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
    assert.deepEqual(calls.toasts, [[view.notice, "ok"]]);
    assert.equal(view.approving, undefined, "the modal closes");
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
    assert.match(view.notice, /ทำไม่สำเร็จ: คนที่ขอไม่มีสิทธิ์ทำสิ่งนี้แล้ว/);
    assert.deepEqual(calls.toasts.at(-1), [view.notice, "error"], "a failed run stays on screen until closed");
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
    flush();
    assert.equal(view.declining?.id, "apr-2", "rejecting asks in a modal with an optional reason");
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
    assert.equal(member.view.toolLabel(waiting("x", { connectionID: "gone", toolName: "delete_all" })), programTools.toolCopy({ name: "delete_all" }).label);
    // Your own requests say "คุณ", not your name.
    assert.equal(member.view.requester("2"), "คุณ");
    assert.equal(member.view.requester("1"), "Owner");
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
    assert.equal(view.failureLabel("anything"), "โปรแกรมแจ้งข้อผิดพลาด");
    assert.equal(view.failureLabel("timeout"), "โปรแกรมตอบช้าเกินไป");
    assert.deepEqual(["pending", "running", "succeeded", "failed", "rejected", "expired"].map(view.pillTone), ["warn", "warn", "ok", "deny", "neutral", "neutral"]);
  } finally { stop(); }
});

// LINE Messaging API v2 (design §14l).
const lineData = () => ({ ...data(), connections: [{ id: "khc-line", name: "LINE OA (Messaging API)", mcpID: "default-orca-api-line-messaging", tools: [] }] });
const lineSend = (id, extra = {}) => waiting(id, { connectionID: "khc-line", toolName: "line_push_text", arguments: { userId: "U0123456789abcdef0123456789abcdef", recipientName: "สมชาย", text: "ออเดอร์พร้อมรับแล้ว" }, ...extra });

test("a waiting LINE send says what it sends, and the list alone tells whether it repeats an approved one", async () => {
  const again = lineSend("apr-1", { sameApprovedAt: "2026-09-30T08:00:00Z" });
  const { view, calls, stop } = mount({ data: lineData() }, { list: async () => [again, lineSend("apr-2")] });
  try {
    await view.load();
    assert.deepEqual(calls.list, [["pending", false]], "the server matches the same send; no second list, no limit");
    assert.equal(view.items.length, 2);
    view.setConfirming("apr-1");
    flush();
    assert.equal(view.approvingSend?.recipientName, "สมชาย", "the confirm dialog names who gets it");
  } finally { stop(); }
});

test("a LINE send LINE didn't answer is retried once with the same request, never re-requested", async () => {
  const unknown = lineSend("apr-5", { status: "failed", errorCategory: "unknown_outcome", decidedBy: "1", decidedAt: new Date().toISOString(), attempts: 1, retryable: true });
  let release;
  const { view, calls, stop } = mount({ data: lineData() }, {
    list: async () => [unknown],
    retry: (id) => new Promise((resolve) => { release = () => resolve({ ...unknown, id, status: "succeeded", attempts: 2, result: '{"accepted":true,"acceptedEarlier":true}' }); }),
  });
  try {
    await view.load();
    assert.match(view.failureLabel(unknown.errorCategory), /อย่าขอส่งใหม่/);
    view.setRetrying("apr-5");
    flush();
    assert.equal(view.rerunning?.id, "apr-5", "retrying asks in a modal first");
    const first = view.retry(view.items[0]);
    await view.retry(view.items[0]);
    assert.deepEqual(calls.retry, ["apr-5"], "a double click never runs it twice");
    release();
    await first;
    flush();
    assert.equal(view.retrying, "");
    assert.match(view.notice, /รับ .* ไว้ตั้งแต่ครั้งก่อนแล้ว จึงไม่ได้ส่งซ้ำ/, "LINE's 409: accepted before, not sent again");
    assert.deepEqual(calls.toasts.at(-1), [view.notice, "ok"]);
    assert.equal(calls.changed, 1);
  } finally { stop(); }
  const accepted = mount({ data: lineData() }, { list: async () => [unknown], retry: async () => ({ ...unknown, status: "succeeded", attempts: 2, result: '{"accepted":true,"acceptedEarlier":false}' }) });
  try {
    await accepted.view.load();
    await accepted.view.retry(accepted.view.items[0]);
    assert.match(accepted.view.notice, /LINE รับ .* แล้ว$/, "accepted, not \"customers received it\"");
    assert.doesNotMatch(accepted.view.notice, /ลูกค้าได้รับ/);
  } finally { accepted.stop(); }
  const failing = mount({ data: lineData() }, { list: async () => [unknown], retry: async () => ({ ...unknown, errorCategory: "unknown_outcome", attempts: 2 }) });
  try {
    await failing.view.load();
    await failing.view.retry(failing.view.items[0]);
    assert.match(failing.view.notice, /ยังไม่สำเร็จ: ORCA ยังไม่รู้ว่า LINE ส่งข้อความนี้ไปแล้วหรือยัง/);
    assert.deepEqual(failing.calls.toasts.at(-1), [failing.view.notice, "error"]);
  } finally { failing.stop(); }
  const refused = mount({ data: lineData() }, { list: async () => [unknown], retry: async () => { throw new Error("เกิน 23 ชั่วโมงหลังการส่งครั้งแรกแล้ว ลองซ้ำด้วยรหัสกันส่งซ้ำเดิมไม่ได้ ตรวจในแชต LINE OA ก่อนว่าส่งไปหรือยัง แล้วค่อยขอส่งใหม่"); } });
  try {
    await refused.view.load();
    await refused.view.retry(refused.view.items[0]);
    assert.match(refused.view.error, /ตรวจในแชต LINE OA/);
  } finally { refused.stop(); }
});

// Owner decision 1 of design §14l, rendered: 30 days after the decision the
// card says the details were deleted, in place of the message and result.
test("a redacted request's card reads “ลบรายละเอียดแล้วหลัง 30 วัน” instead of its message, and shows no result", async () => {
  const gone = lineSend("apr-7", { status: "succeeded", decidedBy: "1", decidedAt: "2026-08-30T08:00:00Z", arguments: { redacted: true }, result: '{"redacted":true}', redacted: true });
  const kept = lineSend("apr-8", { status: "succeeded", decidedBy: "1", decidedAt: "2026-09-30T08:00:00Z", result: '{"accepted":true}' });
  const fields = waiting("apr-9", { status: "rejected", decidedBy: "1", decidedAt: "2026-08-30T08:00:00Z", note: "Wrong customer", arguments: { redacted: true }, redacted: true });
  const seeded = component
    .replace("let items = $state<OrcaApproval[]>([]);", `let items = $state<OrcaApproval[]>(${JSON.stringify([gone, kept, fields])});`)
    .replace("let loaded = $state(false);", "let loaded = $state(true);")
    .replace('let tab = $state<"pending" | "decided">("pending");', 'let tab = $state<"pending" | "decided">("decided");');
  assert.notEqual(seeded, component);
  const dir = await mkdtemp(join(tmpdir(), "orca-approvals-"));
  const file = join(dir, "SeededApprovals.svelte");
  await writeFile(file, seeded);
  const { warnings, Component } = await serverComponent(pathToFileURL(file), {
    ...approvals, OrcaService: {}, onMount: () => {}, onDestroy: () => {}, tick: async () => {}, orcaLocale: { value: "th" }, t: (th) => th,
    term: (key, translate) => translate(...glossary[key]), eventToolLabel: programTools.eventToolLabel, displayDate: (value) => value ?? "—",
    memberName: (member) => member.displayName || member.id, orcaError: (error) => error.message, showToast: () => {},
  });
  assert.deepEqual(warnings, []);
  const body = render(Component, { props: { data: { ...lineData(), connections: [...lineData().connections, ...data().connections] } } }).body;
  const cards = Object.fromEntries([...body.matchAll(/<article[^>]*aria-labelledby="approval-(apr-\d+)"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => [match[1], match[2]]));
  assert.deepEqual(Object.keys(cards), ["apr-7", "apr-8", "apr-9"]);
  for (const id of ["apr-7", "apr-9"]) {
    assert.match(cards[id], /class="approval-redacted[^"]*"[^>]*>[\s\S]*ลบรายละเอียดแล้วหลัง 30 วัน/, id);
    assert.doesNotMatch(cards[id], /redacted&quot;|"redacted"|ผลลัพธ์จากโปรแกรม|approval-args|line-send/, id);
  }
  assert.match(cards["apr-7"], /อนุมัติโดย Owner/, "the decision stays");
  assert.match(cards["apr-9"], /เหตุผล: Wrong customer/, "the reason stays");
  assert.match(cards["apr-8"], /ออเดอร์พร้อมรับแล้ว/);
  assert.match(cards["apr-8"], /ผลลัพธ์จากโปรแกรม/);
  assert.doesNotMatch(cards["apr-8"], /ลบรายละเอียดแล้ว/);
});

test("the inbox compiles without warnings", () => {
  assert.deepEqual(compile(component, { filename: "Approvals.svelte", generate: "client" }).warnings.map((warning) => warning.code), []);
});
