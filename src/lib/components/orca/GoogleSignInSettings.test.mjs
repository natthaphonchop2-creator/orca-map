import { importTypeScript } from "../../orca/test-import.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compile, compileModule } from "svelte/compiler";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";

const component = await readFile(new URL("./GoogleSignInSettings.svelte", import.meta.url), "utf8");
const helpers = await importTypeScript(new URL("../../orca/google-signin.ts", import.meta.url));
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^\s*import[^;]+;/gm, "")
  .replace('typeof window === "undefined" ? "" : window.location.origin', "testOrigin")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, dependencies) {
  const { OrcaService, onMount, googleRedirectURI, parseDomains, t, orcaError, navigator, testOrigin } = dependencies;
  ${script}
  return {
    load, save,
    set(values) { if ("clientID" in values) clientID = values.clientID; if ("clientSecret" in values) clientSecret = values.clientSecret; if ("domains" in values) domains = values.domains; if ("enabled" in values) enabled = values.enabled; },
    get state() { return { setting, clientID, clientSecret, domains, enabled, error, notice, owner, redirectURI, movedOrigin }; },
  };
}`,
  { filename: "google-signin-settings-test.svelte.js", generate: "client" },
).js.code.replaceAll("svelte/internal/client", pathToFileURL(require.resolve("svelte/internal/client")).href);
const { harness } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

function mount(owner, stored, save) {
  const saves = [];
  let view;
  const stop = effect_root(() => {
    view = harness({ data: { canManageRoles: owner } }, {
      ...helpers,
      OrcaService: {
        googleSignIn: async () => stored,
        saveGoogleSignIn: async (input) => { saves.push(input); return save ? save(input) : { ...stored, ...input, clientSecret: undefined, secretConfigured: stored.secretConfigured || !!input.clientSecret, version: stored.version + 1 }; },
      },
      onMount: () => {},
      t: (th) => th,
      orcaError: (error) => error.message,
      navigator: { clipboard: { writeText: async () => {} } },
      testOrigin: "https://orca-workspace.example",
    });
  });
  return { view, saves, stop };
}

const fresh = { clientID: "", allowedDomains: [], redirectURI: "", enabled: false, secretConfigured: false, version: 0 };

test("an owner saves the client, a typed secret and the company domains", async () => {
  const { view, saves, stop } = mount(true, fresh);
  try {
    await view.load();
    flush();
    assert.equal(view.state.redirectURI, "https://orca-workspace.example/oauth2/callback", "a new setup uses this workspace's address");
    view.set({ clientID: " 1-abc.apps.googleusercontent.com ", clientSecret: " s3cret ", domains: "Example.co.th, @branch.example.co.th", enabled: true });
    await view.save();
    assert.deepEqual(saves[0], { clientID: "1-abc.apps.googleusercontent.com", clientSecret: "s3cret", allowedDomains: ["example.co.th", "branch.example.co.th"], redirectURI: "https://orca-workspace.example/oauth2/callback", enabled: true, version: 0 });
    assert.equal(view.state.clientSecret, "", "the typed secret is cleared after saving");
    assert.match(view.state.notice, /เข้าสู่ระบบด้วย Google ได้แล้ว/);
    await view.save();
    assert.equal("clientSecret" in saves[1], false, "a blank secret keeps the saved one");
  } finally { stop(); }
});

test("admins see the setting but cannot save it, and a moved address is pointed out", async () => {
  const stored = { clientID: "1-abc.apps.googleusercontent.com", allowedDomains: ["example.co.th"], redirectURI: "https://old-workspace.example/oauth2/callback", enabled: true, secretConfigured: true, version: 4 };
  const { view, saves, stop } = mount(false, stored);
  try {
    await view.load();
    flush();
    assert.equal(view.state.owner, false);
    assert.equal(view.state.domains, "example.co.th");
    assert.equal(view.state.redirectURI, stored.redirectURI, "the saved address wins");
    assert.equal(view.state.movedOrigin, true);
    await view.save();
    assert.equal(saves.length, 0);
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

test("the settings card compiles without warnings", () => {
  assert.deepEqual(compile(component, { filename: "GoogleSignInSettings.svelte", generate: "client" }).warnings.map((warning) => `${warning.code}: ${warning.message}`), []);
});
