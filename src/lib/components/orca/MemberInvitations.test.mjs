import { importTypeScript } from "../../orca/test-import.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";

const component = await readFile(new URL("./MemberInvitations.svelte", import.meta.url), "utf8");
const invitePage = await readFile(new URL("../../../routes/invite/[token]/+page.svelte", import.meta.url), "utf8");
const helpers = await importTypeScript(new URL("../../orca/invitations.ts", import.meta.url));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, "")
  .replace("$bindable(false)", "false")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, dependencies) {
  const { OrcaService, onMount, tick, untrack, invitationLink, invitationTone, lineShareURL, splitInvitations, t, displayDate, memberName, orcaError, window, navigator } = dependencies;
  ${script}
  return {
    load, submit, reissue, revoke, copy, toggleUnit, closed,
    setEmail(value) { email = value; }, setRole(value) { role = value; },
    get items() { return items; }, get groups() { return groups; }, get issued() { return issued; }, get message() { return message; },
    get formError() { return formError; }, get listError() { return listError; }, get notice() { return notice; }, get copied() { return copied; },
    get unitIDs() { return unitIDs; }, get canInviteAdmins() { return canInviteAdmins; }, get inviting() { return inviting; }, get actionID() { return actionID; },
  };
}`,
  { filename: "member-invitations-test.svelte.js", generate: "client" },
).js.code.replaceAll("svelte/internal/client", pathToFileURL(require.resolve("svelte/internal/client")).href);
const { harness } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const data = (owner = true) => ({
  canManage: true,
  canManageRoles: owner,
  currentUserID: "1",
  organization: { displayName: "Synthetic Co." },
  members: [{ id: "1", displayName: "Owner" }],
  units: [
    { id: "u-sales", name: "Sales", kind: "department" },
    { id: "u-old", name: "Old", kind: "department", archivedAt: "2026-09-01" },
  ],
});
const invitation = (id, extra = {}) => ({ id, createdAt: "2026-09-26T01:00:00Z", expiresAt: "2026-10-03T01:00:00Z", email: `${id}@example.test`, role: "employee", unitIDs: [], status: "pending", invitedBy: "1", ...extra });

function mount(props, service) {
  const calls = { invite: [], reissue: [], revoke: [], changed: 0, copied: [] };
  let view;
  const stop = effect_root(() => {
    view = harness({ ...props, onchanged: () => calls.changed++ }, {
      ...helpers,
      OrcaService: {
        invitations: async () => service.list(),
        invite: async (...args) => { calls.invite.push(args); return service.invite(...args); },
        reissueInvitation: async (id) => { calls.reissue.push(id); return service.reissue(id); },
        revokeInvitation: async (id) => { calls.revoke.push(id); return service.revoke(id); },
      },
      onMount: () => {},
      tick: async () => {},
      untrack: (fn) => fn(),
      t: (th) => th,
      displayDate: (value) => value ?? "—",
      memberName: (member) => member.displayName,
      orcaError: (error) => error.message,
      window: { location: { origin: "https://orca.example.test" } },
      navigator: { clipboard: { writeText: async (text) => { calls.copied.push(text); } } },
    });
  });
  return { view, calls, stop };
}

test("a manager invites by email and gets a one-time link, a LINE share and a message", async () => {
  let list = [];
  const { view, calls, stop } = mount({ data: data() }, {
    list: async () => list,
    invite: async (email, role, unitIDs) => {
      const created = invitation("somchai", { email: email.toLowerCase(), role, unitIDs });
      list = [created];
      return { invitation: created, token: "tok_EN-123" };
    },
  });
  try {
    await view.submit();
    assert.match(view.formError, /กรุณากรอกอีเมล/, "an empty email is caught before any request");
    assert.equal(calls.invite.length, 0);
    view.setEmail("  Somchai@Example.test ");
    view.setRole("admin");
    view.toggleUnit("u-sales");
    await view.submit();
    assert.deepEqual(calls.invite, [["Somchai@Example.test", "admin", ["u-sales"]]]);
    assert.equal(view.issued.link, "https://orca.example.test/invite/tok_EN-123");
    assert.match(view.message, /Synthetic Co\./);
    assert.match(view.message, /https:\/\/orca\.example\.test\/invite\/tok_EN-123$/);
    assert.equal(view.items.length, 1, "the list reloads");
    assert.equal(calls.changed, 1);
    await view.copy(view.issued.link, "link");
    assert.deepEqual(calls.copied, ["https://orca.example.test/invite/tok_EN-123"]);
    assert.equal(view.copied, "link");
    view.closed();
    assert.equal(view.issued, undefined, "closing forgets the link; it is never shown again");
    assert.equal(view.inviting, false);
  } finally { stop(); }
});

test("an admin who is not an owner can only invite members", async () => {
  const { view, calls, stop } = mount({ data: data(false) }, {
    list: async () => [],
    invite: async (email, role) => ({ invitation: invitation("x", { role }), token: "t" }),
  });
  try {
    assert.equal(view.canInviteAdmins, false);
    view.setEmail("x@example.test");
    view.setRole("admin");
    await view.submit();
    assert.equal(calls.invite[0][1], "employee");
  } finally { stop(); }
});

test("a new link reopens the dialog with the fresh link, and revoking needs its own step", async () => {
  let list = [invitation("late", { status: "expired" }), invitation("done", { status: "accepted", acceptedAt: "2026-09-25T00:00:00Z" })];
  const { view, calls, stop } = mount({ data: data() }, {
    list: async () => list,
    reissue: async (id) => { list = [invitation(id), list[1]]; return { invitation: list[0], token: "fresh" }; },
    revoke: async (id) => { list = [invitation(id, { status: "revoked" }), list[1]]; return list[0]; },
  });
  try {
    await view.load();
    assert.deepEqual(view.groups.open.map((item) => item.id), ["late"]);
    assert.deepEqual(view.groups.closed.map((item) => item.id), ["done"]);
    await view.reissue(view.groups.open[0]);
    assert.deepEqual(calls.reissue, ["late"]);
    assert.equal(view.issued.renewed, true);
    assert.equal(view.issued.link, "https://orca.example.test/invite/fresh");
    assert.equal(view.inviting, true, "the dialog opens to show the new link");
    await view.revoke(view.groups.open[0]);
    assert.deepEqual(calls.revoke, ["late"]);
    assert.match(view.notice, /ยกเลิกคำเชิญของ late@example\.test แล้ว/);
    assert.deepEqual(view.groups.open, []);
  } finally { stop(); }
});

test("a failed request explains itself and keeps the list", async () => {
  const { view, stop } = mount({ data: data() }, {
    list: async () => [invitation("a")],
    invite: async () => { throw new Error("an invitation for this email is already waiting"); },
    revoke: async () => { throw new Error("this invitation was already used, revoked or has expired"); },
  });
  try {
    await view.load();
    view.setEmail("a@example.test");
    await view.submit();
    assert.equal(view.formError, "an invitation for this email is already waiting");
    assert.equal(view.issued, undefined);
    await view.revoke(view.groups.open[0]);
    assert.equal(view.listError, "this invitation was already used, revoked or has expired");
    assert.equal(view.actionID, "");
  } finally { stop(); }
});

test("the invitation pieces compile without warnings", () => {
  for (const [filename, source] of [["MemberInvitations.svelte", component], ["+page.svelte", invitePage]]) {
    assert.deepEqual(compile(source, { filename, generate: "client" }).warnings.map((warning) => `${warning.code}: ${warning.message}`), [], filename);
  }
});
