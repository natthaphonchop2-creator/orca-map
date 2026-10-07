import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
import { render } from "svelte/server";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";
import { importTypeScript } from "../../orca/test-import.mjs";
import { serverComponent } from "./test-render.mjs";

const apps = await importTypeScript(new URL("../../orca/connected-ai-apps.ts", import.meta.url));
const secrets = await importTypeScript(new URL("../../orca/secrets.ts", import.meta.url));
const access = await importTypeScript(new URL("../../orca/member-access.ts", import.meta.url));
const { glossary } = await importTypeScript(new URL("../../orca/glossary.ts", import.meta.url));
const th = (thai) => thai;
const term = (key, translate) => translate(...glossary[key]);

// Synthetic company: an owner, an admin and an employee, all invented.
const now = Date.parse("2026-09-28T10:30:00+07:00");
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
const ahead = (days) => new Date(now + days * 86_400_000).toISOString();
const members = [
  { id: "owner", displayName: "วิภา ตัวอย่าง", email: "owner@example.invalid", role: "owner" },
  { id: "admin", displayName: "ธนา ทดสอบ", email: "admin@example.invalid", role: "admin" },
  { id: "mali", displayName: "มาลี สมบูรณ์", email: "mali@example.invalid", role: "employee" },
];
const hubs = [
  { id: "sales", name: "ฝ่ายขาย", status: "active", memberIDs: ["owner", "mali"] },
  { id: "acc", name: "ฝ่ายบัญชี", status: "active", memberIDs: ["owner", "admin"] },
];
const inventory = {
  sessions: [
    { id: "s-mali", app: "ChatGPT", userID: "mali", createdAt: ago(9 * 1440), lastRefreshedAt: ago(3 * 1440), expiresAt: ahead(26) },
    { id: "s-owner", app: "Claude", userID: "owner", createdAt: ago(30 * 1440), lastRefreshedAt: ago(60), expiresAt: ahead(29) },
  ],
  keys: [
    { id: 101, name: "Sales report script", userID: "mali", hubID: "sales", createdAt: ago(60 * 1440), lastUsedAt: ago(38 * 1440), expiresAt: ahead(80) },
    { id: 102, name: "Office laptop", userID: "admin", createdAt: ago(20 * 1440), lastUsedAt: ago(300) },
    { id: 103, name: "Owner script", userID: "owner", createdAt: ago(45 * 1440) },
  ],
};
const allRows = () => {
  const { sessions, keys } = secrets.secretRows(inventory, members, hubs, now, (role) => role === "owner");
  return [...sessions, ...keys];
};

async function renderList(viewerID) {
  const { warnings, Component } = await serverComponent(new URL("./ConnectedAppsList.svelte", import.meta.url), {
    ...apps,
    canRevokeSecret: secrets.canRevokeSecret,
    term,
    t: th,
    orcaLocale: { value: "th" },
    StatusPill: (renderer, props) => renderer.push(`<span data-pill="${props.tone ?? "neutral"}">${props.label}</span>`),
  });
  const view = apps.connectedApps(allRows(), { filter: "all", members, viewerID });
  const viewerIsOwner = members.find((member) => member.id === viewerID).role === "owner";
  const html = render(Component, {
    props: { groups: view.groups, hubs, viewerID, viewerIsOwner, now, apps: view.apps, people: view.people, ondisconnect() {}, ondisconnectall() {} },
  }).body;
  return { warnings, html, view };
}
const section = (html, name) => {
  const start = html.indexOf(`>${name}`);
  assert.ok(start > 0, name);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
};

test("the list: one group per person with role, count, tags, reach, last use and expiry", async () => {
  const { warnings, html } = await renderList("owner");
  assert.deepEqual(warnings, []);
  assert.equal(html.match(/<section class="cx-group/g)?.length, 3);
  const mali = section(html, "มาลี สมบูรณ์");
  assert.match(mali, /data-pill="neutral">พนักงาน/);
  assert.match(mali, /เชื่อม 2 แอป/);
  assert.match(mali, /class="cx-tag[^"]*">เข้าสู่ระบบ</);
  assert.match(mali, /class="cx-tag[^"]*">คีย์</);
  assert.match(mali, /เฉพาะ<\/span> (?:<!--[^>]*-->)*ฝ่ายขาย/);
  assert.match(mali, /38 วันก่อน/);
  assert.match(mali, /3 วันก่อน/);
  assert.match(mali, /24 ต.ค. 2569/);
  const owner = section(html, "วิภา ตัวอย่าง");
  assert.match(owner, /<i[^>]*>\s*\(คุณ\)<\/i>/);
  assert.match(owner, /data-pill="citron">เจ้าของบริษัท/);
  assert.match(owner, /ทุกพื้นที่ทำงาน/);
  assert.match(owner, /ยังไม่เคยใช้/);
  assert.match(owner, /สร้างเมื่อ 45 วันก่อน/);
  assert.match(owner, /data-pill="warn">ไม่หมดอายุ/);
  assert.match(html, /<b[^>]*>ใช้งานล่าสุด<\/b>\s*ของแอปแบบเข้าสู่ระบบ นับจากครั้งที่แอปต่ออายุการเชื่อมต่อ/, "sign-in last use counts from the last renewal");
  assert.match(html, /5 แอป จาก 3 คน/);
  // An owner may disconnect anything: every row has its button, and groups with two or more apps have disconnect-all.
  assert.equal(html.match(/class="k-button small cx-revoke/g)?.length, 5);
  assert.equal(html.match(/cx-all/g)?.length, 2);
  assert.doesNotMatch(html, /เฉพาะเจ้าของบริษัท/);
});

test("an admin looking at an owner sees เฉพาะเจ้าของบริษัท, never a button or disconnect-all", async () => {
  const { html } = await renderList("admin");
  const owner = section(html, "วิภา ตัวอย่าง");
  assert.doesNotMatch(owner, /cx-revoke|cx-all/);
  assert.equal(owner.match(/เฉพาะเจ้าของบริษัท<\/span>/g)?.length, 2);
  const mali = section(html, "มาลี สมบูรณ์");
  assert.match(mali, /aria-label="ตัดการเชื่อมต่อทั้งหมดของ มาลี สมบูรณ์"/);
  assert.match(mali, /aria-label="ตัดการเชื่อมต่อ ChatGPT ของ มาลี สมบูรณ์"/);
  const own = section(html, "ธนา ทดสอบ");
  assert.match(own, /cx-revoke/, "an admin disconnects their own");
});

// The page's script, with its services replaced (the Approvals.test.mjs pattern).
const component = await readFile(new URL("./ConnectedAIApps.svelte", import.meta.url), "utf8");
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, "")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, deps) {
  const { OrcaService, onMount, onDestroy, tick, APPS_FILTERS, appKind, connectedApps, connectedAppsHref, disconnectEach, shortName, term, localeHref, t, organizationRole, STALE_DAYS, secretRows, orcaError, showToast } = deps;
  ${script}
  return {
    refresh, askOne, askAll, disconnectOne, disconnectPerson,
    get view() { return view; }, get error() { return error; }, get dialogError() { return dialogError; },
    get singleOpen() { return singleOpen; }, get personOpen() { return personOpen; }, get busy() { return busy; },
    get personItems() { return personItems; }, get personConfirm() { return personConfirm; }, get singleTitle() { return singleTitle; },
    get singleMessage() { return singleMessage; }, get personTitle() { return personTitle; }, get emptyMessage() { return emptyMessage; },
    setQuery(value) { query = value; },
  };
}`,
  { filename: "connected-ai-apps-test.svelte.js", generate: "client" },
).js.code.replaceAll("svelte/internal/client", pathToFileURL(require.resolve("svelte/internal/client")).href);
const { harness } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

function mount(viewerID, service = {}) {
  const calls = { list: 0, session: [], key: [], toasts: [] };
  let current = structuredClone(inventory);
  let view;
  const data = { canManage: true, canChangeMemberStatus: true, currentUserID: viewerID, members, hubs };
  const stop = effect_root(() => {
    view = harness({ data, filter: "all", holder: "" }, {
      ...apps,
      ...secrets,
      organizationRole: access.organizationRole,
      OrcaService: {
        secrets: async () => { calls.list += 1; return service.list ? service.list(current, calls.list) : current; },
        revokeSecretSession: async (id) => {
          calls.session.push(id);
          if (service.fail?.includes(id)) throw new Error("gone");
          current = { ...current, sessions: current.sessions.filter((item) => item.id !== id) };
          if (service.vanish?.includes(id)) throw new Error("item not found");
          return { revoked: true };
        },
        revokeSecretKey: async (id) => {
          calls.key.push(id);
          if (service.fail?.includes(id)) throw new Error("gone");
          current = { ...current, keys: current.keys.filter((item) => item.id !== id) };
          if (service.vanish?.includes(id)) throw new Error("key not found");
          return { revoked: true };
        },
      },
      onMount: () => {},
      onDestroy: () => {},
      tick: async () => {},
      term,
      t: th,
      localeHref: (path) => path,
      orcaError: (error) => error.message,
      showToast: (message) => calls.toasts.push(message),
    });
  });
  return { view, calls, stop };
}
const group = (view, userID) => view.view.groups.find((item) => item.userID === userID);

test("disconnecting one app asks in a modal, calls its own endpoint once and says so", async () => {
  const { view, calls, stop } = mount("owner");
  try {
    await view.refresh();
    flush();
    const mali = group(view, "mali");
    const chatgpt = mali.rows.find((row) => row.label === "ChatGPT");
    view.askOne(chatgpt, mali);
    flush();
    assert.equal(view.singleOpen, true);
    assert.equal(view.singleTitle, "ตัดการเชื่อมต่อ ChatGPT ของ มาลี?");
    assert.equal(view.singleMessage, "ChatGPT ของมาลีจะดึงข้อมูลบริษัทไม่ได้ทันที ถ้ายังต้องใช้ มาลีเชื่อมใหม่เองได้");
    const first = view.disconnectOne();
    const second = view.disconnectOne();
    await Promise.all([first, second]);
    flush();
    assert.deepEqual(calls.session, ["s-mali"], "a double click never sends twice");
    assert.deepEqual(calls.key, []);
    assert.equal(view.singleOpen, false);
    assert.deepEqual(calls.toasts, ["ตัดการเชื่อมต่อ ChatGPT ของ มาลี แล้ว"]);
    assert.equal(calls.list, 2, "the list reloads");
    assert.equal(group(view, "mali").all.length, 1);
    // A key is named as a key, and goes to the key endpoint by its number.
    const key = group(view, "mali").rows[0];
    view.askOne(key, group(view, "mali"));
    assert.equal(view.singleTitle, "ตัดการเชื่อมต่อ คีย์ “Sales report script” ของ มาลี?");
    await view.disconnectOne();
    assert.deepEqual(calls.key, [101]);
  } finally { stop(); }
});

test("a failed disconnect keeps the modal open with a plain reason, and reloads", async () => {
  const { view, calls, stop } = mount("owner", { fail: ["s-mali"] });
  try {
    await view.refresh();
    flush();
    const mali = group(view, "mali");
    view.askOne(mali.rows[0], mali);
    await view.disconnectOne();
    flush();
    assert.equal(view.singleOpen, true);
    assert.match(view.dialogError, /ตัดการเชื่อมต่อไม่สำเร็จ/);
    assert.deepEqual(calls.toasts, []);
    assert.equal(calls.list, 2);
  } finally { stop(); }
});

test("disconnect-all loops over each item and reports ตัดแล้ว X จาก Y", async () => {
  const { view, calls, stop } = mount("admin");
  try {
    await view.refresh();
    flush();
    view.askAll(group(view, "mali"));
    flush();
    assert.equal(view.personOpen, true);
    assert.equal(view.personTitle, "ตัดการเชื่อมต่อทั้งหมดของ มาลี?");
    assert.deepEqual(view.personItems.map((row) => row.label), ["ChatGPT", "Sales report script"]);
    assert.equal(view.personConfirm, "ตัดทั้งหมด");
    await view.disconnectPerson();
    flush();
    assert.deepEqual(calls.session, ["s-mali"]);
    assert.deepEqual(calls.key, [101]);
    assert.equal(view.personOpen, false);
    assert.deepEqual(calls.toasts, ["ตัดแล้ว 2 จาก 2 · แอป AI ของมาลีใช้ข้อมูลบริษัทไม่ได้แล้ว"]);
    assert.equal(group(view, "mali"), undefined);
  } finally { stop(); }
});

test("a partial disconnect-all stays open, lists what is left and offers to try again", async () => {
  const { view, calls, stop } = mount("owner", { fail: [101] });
  try {
    await view.refresh();
    flush();
    view.askAll(group(view, "mali"));
    await view.disconnectPerson();
    flush();
    assert.deepEqual(calls.session, ["s-mali"]);
    assert.deepEqual(calls.key, [101]);
    assert.equal(view.personOpen, true);
    assert.match(view.dialogError, /^ตัดแล้ว 1 จาก 2 อีก 1 รายการตัดไม่สำเร็จ/);
    assert.equal(view.personConfirm, "ลองอีกครั้ง");
    assert.deepEqual(view.personItems.map((row) => row.label), ["Sales report script"]);
    assert.deepEqual(calls.toasts, []);
  } finally { stop(); }
});

test("trying again after a partial disconnect-all sends only what failed, even when the reload failed", async () => {
  const failing = [101];
  const { view, calls, stop } = mount("owner", {
    fail: failing,
    // The reload after the first attempt does not come back.
    list: (current, count) => { if (count === 2) throw new Error("offline"); return current; },
  });
  try {
    await view.refresh();
    flush();
    view.askAll(group(view, "mali"));
    await view.disconnectPerson();
    flush();
    assert.deepEqual(calls.session, ["s-mali"]);
    assert.equal(view.error, "offline");
    assert.equal(view.personConfirm, "ลองอีกครั้ง");
    assert.equal(view.personItems.length, 2, "the stale list still shows both");
    failing.length = 0;
    await view.disconnectPerson();
    flush();
    assert.deepEqual(calls.session, ["s-mali"], "the sign-in that was already disconnected is not sent again");
    assert.deepEqual(calls.key, [101, 101]);
    assert.equal(view.personOpen, false);
    assert.deepEqual(calls.toasts, ["ตัดแล้ว 1 จาก 1 · แอป AI ของมาลีใช้ข้อมูลบริษัทไม่ได้แล้ว"]);
  } finally { stop(); }
});

test("when what failed turns out to be gone already, the dialog closes and says so", async () => {
  const { view, calls, stop } = mount("owner", { vanish: [101] });
  try {
    await view.refresh();
    flush();
    view.askAll(group(view, "mali"));
    await view.disconnectPerson();
    flush();
    assert.deepEqual(calls.key, [101]);
    assert.equal(view.personOpen, false, "nothing is left to try again");
    assert.deepEqual(calls.toasts, ["แอป AI ของมาลีใช้ข้อมูลบริษัทไม่ได้แล้ว"]);
    assert.equal(group(view, "mali"), undefined);
  } finally { stop(); }
});

test("the app tile: Claude and ChatGPT as their real logo files (W0), an icon otherwise, hidden from screen readers", async () => {
  const { warnings, Component } = await serverComponent(new URL("./AIAppTile.svelte", import.meta.url), {
    KeyRound: (renderer) => renderer.push("<svg data-icon=\"key\"></svg>"),
    Sparkles: (renderer) => renderer.push("<svg data-icon=\"app\"></svg>"),
    ToolIcon: (renderer, props) => renderer.push(`<img data-logo="${props.name}" data-size="${props.size}">`),
  });
  assert.deepEqual(warnings, []);
  const tile = (kind, size) => render(Component, { props: { kind, size } }).body;
  const claude = tile("claude");
  assert.match(claude, /<span class="ai-app-tile kind-claude[^"]*"[^>]*>(?:<!--[^>]*-->)*<img data-logo="claude" data-size="20">(?:<!--[^>]*-->)*<\/span>/);
  assert.match(claude, /aria-hidden="true"/);
  assert.match(claude, /--ai-tile-size: 32px;/);
  assert.match(tile("chatgpt", 24), /kind-chatgpt[^>]*--ai-tile-size: 24px;[^>]*>(?:<!--[^>]*-->)*<img data-logo="chatgpt"/);
  const source = await readFile(new URL("./AIAppTile.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(source.slice(source.indexOf("<style>")), /#[0-9a-f]{3,6}\b/i, "no letter tiles in brand colours");
  assert.match(tile("key"), /data-icon="key"/);
  assert.match(tile("other"), /data-icon="app"/);
});

test("the empty states say what is missing", async () => {
  const { view, stop } = mount("owner");
  try {
    await view.refresh();
    view.setQuery("ไม่มีชื่อนี้");
    flush();
    assert.equal(view.view.apps, 0);
    assert.equal(view.emptyMessage, "ไม่พบคนที่ชื่อตรงกับ “ไม่มีชื่อนี้”");
  } finally { stop(); }
});

test("the page loads nothing for a non-manager and compiles without warnings", async () => {
  assert.match(component, /onMount\(\(\) => \{\s*if \(data\.canManage\) void refresh\(\);/);
  for (const file of ["ConnectedAIApps.svelte", "ConnectedAppsList.svelte", "AIAppTile.svelte"]) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.deepEqual(compile(source, { filename: file, generate: "client" }).warnings.map((warning) => warning.code), [], file);
  }
});
