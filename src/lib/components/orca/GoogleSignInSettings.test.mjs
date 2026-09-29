import { importTypeScript } from "../../orca/test-import.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
import { render } from "svelte/server";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";
import { serverComponent } from "./test-render.mjs";

const file = new URL("./GoogleSignInSettings.svelte", import.meta.url);
const component = await readFile(file, "utf8");
const helpers = {
  ...(await importTypeScript(new URL("../../orca/google-signin.ts", import.meta.url))),
  ...(await importTypeScript(new URL("../../services/orca-u2.ts", import.meta.url))),
};
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, "")
  .replace('typeof window === "undefined" ? "" : window.location.origin', "testOrigin")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, dependencies) {
  const { OrcaService, onMount, onDestroy, consumerDomains, googleRedirectURI, parseDomains, t, orcaError, navigator, document, testOrigin, copyText, backendOrigin, googleClientIDFormat, googleClientSaved, googleRedirectTargets } = dependencies;
  ${script}
  return {
    load, save, toggle, saveSwitch, copyURI,
    set(values) { if ("clientID" in values) clientID = values.clientID; if ("clientSecret" in values) clientSecret = values.clientSecret; if ("domains" in values) domains = values.domains; if ("enabled" in values) enabled = values.enabled; if ("useSuggested" in values) useSuggested = values.useSuggested; },
    get state() { return { setting, clientID, clientSecret, domains, enabled, error, notice, owner, redirectURI, movedOrigin, targets, clientSaved, clientFormat, confirmOff, changingSecret, copied, advancedOpen }; },
  };
}`,
  { filename: "google-signin-settings-test.svelte.js", generate: "client" },
).js.code.replaceAll("svelte/internal/client", pathToFileURL(require.resolve("svelte/internal/client")).href);
const { harness } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

function mount(owner, stored, save, extra = {}) {
  const saves = [];
  const copies = [];
  let view;
  const stop = effect_root(() => {
    view = harness({ data: { platformOperator: owner, unifiedConnectURL: "https://orca-backend.example/mcp/connect", ...extra } }, {
      ...helpers,
      OrcaService: {
        googleSignIn: async () => stored,
        saveGoogleSignIn: async (input) => { saves.push(input); return save ? save(input) : { ...stored, ...input, clientSecret: undefined, secretConfigured: stored.secretConfigured || !!input.clientSecret, version: stored.version + 1 }; },
      },
      onMount: () => {},
      onDestroy: () => {},
      t: (th) => th,
      orcaError: (error) => error.message,
      navigator: { clipboard: { writeText: async (text) => { copies.push(text); } } },
      document: undefined,
      copyText: async (text, clipboard) => { await clipboard.writeText(text); return true; },
      testOrigin: "https://orca-workspace.example",
    });
  });
  return { view, saves, copies, stop };
}

const fresh = { clientID: "", allowedDomains: [], redirectURI: "", enabled: false, secretConfigured: false, version: 0 };
const saved = { clientID: "1-abc.apps.googleusercontent.com", allowedDomains: ["example.co.th"], redirectURI: "https://orca-workspace.example/oauth2/callback", enabled: true, secretConfigured: true, version: 4 };

test("the platform operator saves the client, a typed secret and the company domains", async () => {
  const { view, saves, stop } = mount(true, fresh);
  try {
    await view.load();
    flush();
    assert.equal(view.state.redirectURI, "https://orca-workspace.example/oauth2/callback", "a new setup uses this workspace's address");
    view.set({ clientID: " 1-abc.apps.googleusercontent.com ", clientSecret: " s3cret ", domains: "Example.co.th, @branch.example.co.th", enabled: true });
    await view.save();
    assert.deepEqual(saves[0], { clientID: "1-abc.apps.googleusercontent.com", clientSecret: "s3cret", allowedDomains: ["example.co.th", "branch.example.co.th"], redirectURI: "https://orca-workspace.example/oauth2/callback", enabled: true, version: 0 });
    assert.equal(view.state.clientSecret, "", "the typed secret is cleared after saving");
    assert.equal(view.state.changingSecret, false);
    assert.match(view.state.notice, /เข้าสู่ระบบด้วย Google ได้แล้ว/);
    await view.save();
    assert.equal("clientSecret" in saves[1], false, "a blank secret keeps the saved one");
  } finally { stop(); }
});

test("step 1 lists both redirect URIs: the workspace's and the backend's, where AI apps sign in", async () => {
  const { view, copies, stop } = mount(true, saved);
  try {
    await view.load();
    flush();
    assert.deepEqual(view.state.targets, [
      { uri: "https://orca-workspace.example/oauth2/callback", use: "workspace" },
      { uri: "https://orca-backend.example/oauth2/callback", use: "ai-apps" },
    ]);
    await view.copyURI(view.state.targets[1].uri);
    assert.deepEqual(copies, ["https://orca-backend.example/oauth2/callback"]);
    assert.equal(view.state.copied, "https://orca-backend.example/oauth2/callback");
  } finally { stop(); }
  // Without a company link, the API base is this workspace: one address, not the same one twice.
  const single = mount(true, saved, undefined, { unifiedConnectURL: "" });
  try {
    await single.view.load();
    flush();
    assert.deepEqual(single.view.state.targets.map((item) => item.use), ["workspace"]);
  } finally { single.stop(); }
});

test("other managers, owners included, see the setting but cannot save it, and a moved address is pointed out", async () => {
  const stored = { ...saved, redirectURI: "https://old-workspace.example/oauth2/callback" };
  const { view, saves, stop } = mount(false, stored);
  try {
    await view.load();
    flush();
    assert.equal(view.state.owner, false);
    assert.equal(view.state.domains, "example.co.th");
    assert.equal(view.state.redirectURI, stored.redirectURI, "the saved address wins");
    assert.equal(view.state.movedOrigin, true);
    await view.save();
    await view.toggle();
    await view.saveSwitch(false);
    assert.equal(saves.length, 0);
    assert.equal(view.state.confirmOff, false);
  } finally { stop(); }
});

test("after a move the operator can adopt this page's address, and it is what gets saved", async () => {
  const stored = { ...saved, redirectURI: "https://old-workspace.example/oauth2/callback" };
  const { view, saves, stop } = mount(true, stored);
  try {
    await view.load();
    flush();
    view.set({ useSuggested: true });
    flush();
    assert.equal(view.state.movedOrigin, false);
    assert.equal(view.state.redirectURI, "https://orca-workspace.example/oauth2/callback");
    await view.save();
    assert.equal(saves[0].redirectURI, "https://orca-workspace.example/oauth2/callback");
  } finally { stop(); }
});

test("the switch never saves an address picked on the page but not saved yet", async () => {
  const stored = { ...saved, redirectURI: "https://old-workspace.example/oauth2/callback" };
  const { view, saves, stop } = mount(true, stored);
  try {
    await view.load();
    flush();
    view.set({ useSuggested: true });
    flush();
    await view.toggle();
    await view.saveSwitch(false);
    assert.equal(saves[0].redirectURI, stored.redirectURI, "switching keeps the saved address");
  } finally { stop(); }
});

test("the switch: off asks first, then saves only what is already saved; on needs a saved client", async () => {
  const { view, saves, stop } = mount(true, saved);
  try {
    await view.load();
    flush();
    // An unsaved edit in the form is never sent by the switch.
    view.set({ clientID: "typed-but-not-saved", clientSecret: "draft", domains: "draft.example" });
    await view.toggle();
    assert.equal(view.state.confirmOff, true, "switching off asks in a dialog");
    assert.equal(saves.length, 0);
    await view.saveSwitch(false);
    assert.deepEqual(saves[0], { clientID: saved.clientID, allowedDomains: saved.allowedDomains, redirectURI: saved.redirectURI, enabled: false, version: 4 });
    assert.equal(view.state.enabled, false);
    assert.equal(view.state.confirmOff, false);
    assert.equal(view.state.clientID, "typed-but-not-saved", "the draft stays a draft");
    assert.match(view.state.notice, /ปิดแล้ว/);
    await view.toggle();
    assert.equal(saves[1].enabled, true, "switching on saves at once");
  } finally { stop(); }

  const blank = mount(true, fresh);
  try {
    await blank.view.load();
    flush();
    assert.equal(blank.view.state.clientSaved, false);
    blank.view.set({ clientID: "1-abc.apps.googleusercontent.com" });
    await blank.view.toggle();
    assert.equal(blank.saves.length, 0, "no client and secret saved yet: the switch does nothing");
  } finally { blank.stop(); }
});

test("the domains save leaves an unsaved client edit as a draft and never sends a secret", async () => {
  const { view, saves, stop } = mount(true, saved);
  try {
    await view.load();
    flush();
    view.set({ clientID: "typed.apps.googleusercontent.com", clientSecret: "draft", domains: "example.co.th, branch.example" });
    await view.save("domains");
    assert.deepEqual(saves[0], { clientID: saved.clientID, allowedDomains: ["example.co.th", "branch.example"], redirectURI: saved.redirectURI, enabled: true, version: 4 });
    assert.equal(view.state.clientID, "typed.apps.googleusercontent.com");
    assert.equal(view.state.clientSecret, "", "a typed secret never outlives a save");
    assert.match(view.state.notice, /บันทึกโดเมนแล้ว/);
  } finally { stop(); }
});

test("a refused save explains itself and keeps what was typed", async () => {
  const { view, stop } = mount(true, fresh, () => { throw new Error("add the client ID, client secret, redirect URI and at least one company domain before turning Google sign-in on"); });
  try {
    await view.load();
    view.set({ clientID: "1-abc.apps.googleusercontent.com", domains: "example.co.th", enabled: true });
    await view.save();
    assert.match(view.state.error, /before turning Google sign-in on/);
    assert.equal(view.state.domains, "example.co.th");
    assert.equal(view.state.enabled, true);
  } finally { stop(); }
});

test("Gmail is refused as a joining domain before anything is sent", async () => {
  const { view, saves, stop } = mount(true, fresh);
  try {
    await view.load();
    view.set({ clientID: "1-abc.apps.googleusercontent.com", clientSecret: "s3cret", domains: "example.co.th, Gmail.com", enabled: true });
    await view.save();
    assert.equal(saves.length, 0, "nothing reached ORCA");
    assert.match(view.state.error, /gmail\.com ไม่ได้/);
    assert.equal(view.state.advancedOpen, true, "the collapsed domains open, so the field to fix is in view");
    assert.equal(view.state.domains, "example.co.th, Gmail.com", "what was typed stays to be fixed");
    view.set({ domains: "" });
    await view.save();
    assert.deepEqual(saves[0].allowedDomains, [], "without joining domains, Google serves members and invited people");
    assert.equal(view.state.error, "");
  } finally { stop(); }
});

test("the client ID format hint", async () => {
  const { view, stop } = mount(true, fresh);
  try {
    await view.load();
    flush();
    assert.equal(view.state.clientFormat, "empty");
    view.set({ clientID: "1234-abc.apps.googleusercontent.com" });
    flush();
    assert.equal(view.state.clientFormat, "ok");
    view.set({ clientID: "not a client id" });
    flush();
    assert.equal(view.state.clientFormat, "unusual");
  } finally { stop(); }
});

test("the page follows the mockup's order and never shows a secret value", async () => {
  assert.deepEqual(compile(component, { filename: "GoogleSignInSettings.svelte", generate: "client" }).warnings.map((warning) => `${warning.code}: ${warning.message}`), []);
  // The steps come before the fields they explain, not collapsed under them.
  const steps = component.indexOf("google-steps");
  assert.ok(steps > 0 && steps < component.indexOf('id="google-client-id"'));
  assert.ok(component.indexOf('id="google-client-id"') < component.indexOf('id="google-client-secret"'));
  assert.match(component, /อันที่สองใช้ตอนลูกค้าเชื่อม Claude หรือ ChatGPT/);
  assert.match(component, /ขั้นสูง: ให้คนในโดเมนเข้าร่วมบริษัทหลักอัตโนมัติ/);
  assert.match(component, /<details class="google-card google-advanced" bind:open=\{advancedOpen\}>/, "the domains are collapsed");
  assert.match(component, /let advancedOpen = \$state\(false\);/, "and start collapsed");
  // The secret field is a password input bound to the typed value only; the saved one is a chip.
  assert.match(component, /id="google-client-secret" type="password" bind:value=\{clientSecret\}/);
  assert.doesNotMatch(component, /setting\.clientSecret|value=\{setting/);
  // Step 3 mentions "เปลี่ยน" only when there is a saved secret to change.
  assert.match(component, /\{#if setting\.secretConfigured\}\s*<p class="google-step-detail">[^\n]*แล้วกด/);
  assert.match(component, /\{:else\}\s*<p class="google-step-detail">\{t\("คัดลอกจากหน้า client เดียวกัน/);
  // The switch names its state and why it may be disabled; a copy is announced.
  assert.match(component, /role="switch"[\s\S]*?aria-describedby="google-status-line"/);
  assert.match(component, /<span class="google-sr" role="status">\{copied \?/);
  const { Component } = await serverComponent(file, { ...helpers, t: (_th, en) => en, term: (_key, t) => t("เข้าสู่ระบบด้วย Google", "Sign in with Google"), OrcaService: {}, displayDate: (value) => value });
  const html = render(Component, { props: { data: { platformOperator: true } } }).body;
  assert.match(html, /Loading/);
});
