import { importTypeScript } from "../../orca/test-import.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
import { render } from "svelte/server";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root } from "svelte/internal/client";
import { serverComponent } from "./test-render.mjs";

const file = new URL("./PlatformCompanies.svelte", import.meta.url);
const component = await readFile(file, "utf8");
const helpers = {
  ...(await importTypeScript(new URL("../../orca/platform-companies.ts", import.meta.url))),
  ...(await importTypeScript(new URL("../../orca/invitations.ts", import.meta.url))),
  ...(await importTypeScript(new URL("../../services/orca-u2.ts", import.meta.url))),
};
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1]).replace(/^\s*import[^;]+;/gm, "");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(dependencies) {
  const { OrcaService, onMount, tick, parseErrorContent, invitationLink, lineShareURL, t, canInviteOwner, emailDomain, ownerStatus, platformRefusal, signInWarnings, displayDate, orcaError, externalBrowserLink, window, navigator } = dependencies;
  ${script}
  return {
    load, loadGoogle, show, openCompany, inviteOwner, revoke, copy, explain,
    setName(value) { name = value; }, setEmail(value) { email = value; }, setRevoking(value) { revoking = value; },
    get items() { return items; }, get loaded() { return loaded; }, get listError() { return listError; }, get step() { return step; },
    get target() { return target; }, get justOpened() { return justOpened; }, get formError() { return formError; }, get issued() { return issued; },
    get message() { return message; }, get copied() { return copied; }, get revoking() { return revoking; }, get actionID() { return actionID; },
    get revokingTarget() { return revokingTarget; }, get googleOn() { return googleOn; }, get customers() { return customers; },
  };
}`,
  { filename: "platform-companies-test.svelte.js", generate: "client" },
).js.code.replaceAll("svelte/internal/client", pathToFileURL(require.resolve("svelte/internal/client")).href);
const { harness } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const B = "org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const company = (id, extra = {}) => ({ id, displayName: id === "default" ? "ORCA" : "Hotel A", createdAt: "2026-09-28T01:00:00Z", seats: 0, owners: 0, ownerInvitations: [], ...extra });
// A refusal as the API client throws it: the status and the server's message.
const refusal = (status, message) => Object.assign(new Error(message), { status });

function mount(service) {
  const calls = { open: [], invite: [], revoke: [], copied: [] };
  let view;
  const stop = effect_root(() => {
    view = harness({
      ...helpers,
      OrcaService: {
        platformCompanies: async () => service.list(),
        openCompany: async (...args) => { calls.open.push(args); return service.open(...args); },
        inviteCompanyOwner: async (...args) => { calls.invite.push(args); return service.invite(...args); },
        revokeCompanyOwnerInvitation: async (...args) => { calls.revoke.push(args); return service.revoke(...args); },
        googleSignIn: async () => { if (service.google === undefined) throw new Error("unavailable"); return { enabled: service.google }; },
      },
      onMount: () => {},
      tick: async () => {},
      parseErrorContent: (error) => ({ status: error.status, message: error.message }),
      t: (th) => th,
      displayDate: (value) => value ?? "—",
      orcaError: (error) => `generic: ${error.message}`,
      window: { location: { origin: "https://orca.example.test" } },
      navigator: { clipboard: { writeText: async (text) => { calls.copied.push(text); } } },
    });
  });
  return { view, calls, stop };
}

test("the operator opens a company, then invites its owner and gets the link once", async () => {
  let list = [company("default", { seats: 3, owners: 1 })];
  const { view, calls, stop } = mount({
    list: async () => list,
    open: async (displayName) => {
      const opened = company(B, { displayName });
      list = [...list, opened];
      return opened;
    },
    invite: async (id, email) => {
      list = list.map((item) => (item.id === id ? { ...item, ownerInvitations: [{ id: "oin-1", email, expiresAt: "2026-10-05T01:00:00Z", status: "pending" }] } : item));
      return { invitation: { id: "oin-1", email, role: "owner", expiresAt: "2026-10-05T01:00:00Z" }, token: "tok_OWNER-1", companyID: id, reissued: false, googleSignIn: true, emailDomainAllowed: true };
    },
  });
  try {
    await view.load();
    assert.equal(view.loaded, true);
    assert.deepEqual(view.items.map((item) => item.id), ["default"]);
    await view.show("open");
    await view.openCompany();
    assert.match(view.formError, /กรุณากรอกชื่อบริษัท/, "an empty name is caught before any request");
    assert.equal(calls.open.length, 0);
    view.setName("  Hotel A ");
    await view.openCompany();
    assert.deepEqual(calls.open, [["Hotel A"]]);
    assert.equal(view.step, "invite");
    assert.equal(view.target.id, B);
    assert.equal(view.justOpened, true);
    assert.deepEqual(view.items.map((item) => item.id), ["default", B], "the list reloads");

    await view.inviteOwner();
    assert.match(view.formError, /กรุณากรอกอีเมลของเจ้าของบริษัท/);
    assert.equal(calls.invite.length, 0);
    view.setEmail(" owner@hotel-a.example ");
    await view.inviteOwner();
    assert.deepEqual(calls.invite, [[B, "owner@hotel-a.example"]]);
    assert.equal(view.step, "issued");
    assert.equal(view.issued.link, "https://orca.example.test/invite/tok_OWNER-1");
    assert.match(view.message, /เจ้าของ Hotel A/);
    assert.match(view.message, /Google/);
    // Sent by LINE, the link opens in the phone's browser, where Google sign-in works (critique 13).
    assert.match(view.message, /https:\/\/orca\.example\.test\/invite\/tok_OWNER-1\?openExternalBrowser=1$/);
    assert.equal(view.items[1].ownerInvitations.length, 1);
    await view.copy(view.issued.link, "link");
    assert.deepEqual(calls.copied, ["https://orca.example.test/invite/tok_OWNER-1"]);

    // Opening the dialog again starts over: the link is never shown twice.
    await view.show("invite", view.items[1]);
    assert.equal(view.issued, undefined);
    assert.equal(view.step, "invite");
    assert.equal(view.justOpened, false);
  } finally { stop(); }
});

test("the server's refusals come back as advice the operator can act on", async () => {
  const { view, stop } = mount({
    list: async () => [company(B, { owners: 1 })],
    open: async () => { throw refusal(409, "a company with this name already exists"); },
    invite: async () => { throw refusal(409, "this company has an owner; its owners invite people"); },
    revoke: async () => { throw refusal(409, "this invitation was already used, revoked or has expired"); },
  });
  try {
    await view.load();
    await view.show("open");
    view.setName("Hotel A");
    await view.openCompany();
    assert.match(view.formError, /มีบริษัทชื่อนี้แล้ว/);
    assert.equal(view.step, "open");
    await view.show("invite", view.items[0]);
    view.setEmail("owner@hotel-a.example");
    await view.inviteOwner();
    assert.match(view.formError, /บริษัทนี้มีเจ้าของแล้ว/);
    assert.equal(view.issued, undefined);
    await view.revoke(view.items[0], "oin-1");
    assert.match(view.listError, /คำเชิญนี้ถูกใช้หรือยกเลิกไปแล้ว/, "shown after the list reloads");
    assert.equal(view.actionID, "");
    // Anything else keeps the workspace's usual wording.
    assert.equal(view.explain(refusal(409, "this item changed; reload before saving again")), "generic: this item changed; reload before saving again");
    assert.match(view.explain(refusal(409, "an invitation for this email is already waiting")), /มีคำเชิญอื่นของบริษัทนี้รออีเมลนี้อยู่/);
    assert.match(view.explain(refusal(409, "this person is suspended or removed; restore them instead")), /ถูกระงับในบริษัทนี้/);
  } finally { stop(); }
});

test("the Google chip above the list says whether owners can make an account", async () => {
  for (const [google, expected] of [[true, true], [false, false], [undefined, undefined]]) {
    const { view, stop } = mount({ list: async () => [], google });
    try {
      await view.loadGoogle();
      assert.equal(view.googleOn, expected, String(google));
    } finally { stop(); }
  }
});

test("revoking asks in a dialog about exactly one invitation of one company", async () => {
  const list = [company(B, { ownerInvitations: [{ id: "oin-1", email: "owner@hotel-a.example", expiresAt: "2026-10-01T00:00:00Z", status: "pending" }] }), company("default", { owners: 1 })];
  const { view, stop } = mount({ list: async () => list });
  try {
    await view.load();
    assert.equal(view.revokingTarget, undefined);
    view.setRevoking("oin-1");
    assert.equal(view.revokingTarget.company.id, B);
    assert.equal(view.revokingTarget.invitation.email, "owner@hotel-a.example");
    assert.deepEqual(view.customers.map((item) => item.id), [B], "the ORCA team's own company is not a customer");
  } finally { stop(); }
});

test("revoking an owner invitation needs its own step and reloads the list", async () => {
  let list = [company(B, { ownerInvitations: [{ id: "oin-1", email: "owner@hotel-a.example", expiresAt: "2026-09-01T00:00:00Z", status: "expired" }] })];
  const { view, calls, stop } = mount({
    list: async () => list,
    revoke: async (id, invitationID) => { list = [company(id)]; return { id: invitationID, status: "revoked" }; },
  });
  try {
    await view.load();
    view.setRevoking("oin-1");
    await view.revoke(view.items[0], "oin-1");
    assert.deepEqual(calls.revoke, [[B, "oin-1"]]);
    assert.equal(view.revoking, "");
    assert.deepEqual(view.items[0].ownerInvitations, []);
  } finally { stop(); }
});

test("the section and its first dialog step render, and the component compiles without warnings", async () => {
  assert.deepEqual(compile(component, { filename: "PlatformCompanies.svelte", generate: "client" }).warnings.map((warning) => `${warning.code}: ${warning.message}`), []);
  const PageHeader = (renderer, props) => { renderer.push(`<h1>${props.title}</h1><p>${props.subtitle}</p>`); props.action?.(renderer); };
  const { Component } = await serverComponent(file, { ...helpers, t: (_th, en) => en, displayDate: (value) => value, OrcaService: {}, PageHeader });
  const html = render(Component).body;
  assert.match(html, /Customer companies/);
  assert.match(html, /You are not a member of these companies/);
  assert.match(html, /Open a company/);
  // The Google-off warning in the owner link dialog links to the platform's Google section.
  assert.match(component, /warning === "google"[\s\S]*?href=\{localeHref\(platformHref\("signin"\)\)\} target="_blank"/);
  // The owner's link shows only once: following the Google link never closes the dialog.
  assert.doesNotMatch(component.slice(component.indexOf('warning === "google"'), component.indexOf("{:else}", component.indexOf('warning === "google"'))), /dialog\?\.close\(\)/);
  // Revoking is a modal confirmation, never a pair of buttons in the row.
  assert.match(component, /<ConfirmDialog[\s\S]*?tone="danger"/);
  assert.doesNotMatch(component, /ยืนยันยกเลิก/);
  assert.match(html, /Loading companies/);
  assert.match(html, /<input id="company-name"[^>]*maxlength="120"/);
  assert.match(html, /A new company has no members yet, you included/);
  // The link and its warnings exist only after an invitation is made.
  assert.doesNotMatch(html, /company-owner-link/);
});
