import assert from "node:assert/strict";
import { test } from "node:test";
import { oauthApps } from "./oauth-apps.ts";

const managed = (key, provider, setupStatus, extra = {}) => ({
  id: `default-orca-managed-${key}`,
  name: key,
  managedProvider: key,
  oauthProvider: provider,
  authMethods: ["oauth"],
  setupStatus,
  ...(setupStatus === "admin_setup_required" ? { setupReason: "oauth_client_missing", setupCanConfigure: true } : {}),
  ...extra,
});

test("a configured provider is ready and offers no setup", () => {
  const { managed: apps } = oauthApps([
    managed("gmail", "google", "available"),
    managed("google-drive", "google", "available"),
  ]);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].provider, "google");
  assert.equal(apps[0].ready, true);
  assert.equal(apps[0].setupSourceID, undefined);
  assert.equal(apps[0].canConfigure, false);
  assert.deepEqual(apps[0].connectors.map((c) => c.name), ["gmail", "google-drive"]);
  assert.deepEqual(apps[0].scopes, [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
});

test("Google setup targets the Drive source, whose app every Google connector falls back to", () => {
  const { managed: apps } = oauthApps([
    managed("gmail", "google", "admin_setup_required"),
    managed("google-drive", "google", "admin_setup_required"),
    managed("google-sheets", "google", "admin_setup_required"),
  ]);
  assert.equal(apps[0].ready, false);
  assert.equal(apps[0].setupSourceID, "default-orca-managed-google-drive");
  assert.equal(apps[0].canConfigure, true);
});

test("Microsoft setup targets Outlook, and otherwise the first connector still missing an app", () => {
  const all = oauthApps([
    managed("microsoft-word", "microsoft", "admin_setup_required"),
    managed("microsoft-outlook", "microsoft", "admin_setup_required"),
  ]).managed[0];
  assert.equal(all.setupSourceID, "default-orca-managed-microsoft-outlook");
  const partial = oauthApps([
    managed("microsoft-outlook", "microsoft", "available"),
    managed("microsoft-word", "microsoft", "admin_setup_required"),
  ]).managed[0];
  assert.equal(partial.ready, false);
  assert.equal(partial.setupSourceID, "default-orca-managed-microsoft-word");
  assert.ok(partial.scopes.includes("Files.Read") && partial.scopes.includes("offline_access"));
  assert.equal(partial.scopes.filter((scope) => scope === "offline_access").length, 1);
});

test("only the installation owner can configure, and forged provider rows are ignored", () => {
  const apps = oauthApps([
    managed("microsoft-outlook", "microsoft", "admin_setup_required", { setupCanConfigure: false }),
    // A row claiming a managed provider under a non-canonical id is not a managed connector.
    { id: "default-evil", name: "Evil", managedProvider: "gmail", oauthProvider: "google", setupStatus: "admin_setup_required", setupCanConfigure: true },
  ]).managed;
  assert.deepEqual(apps.map((app) => app.provider), ["microsoft"]);
  assert.equal(apps[0].canConfigure, false);
  assert.equal(apps[0].setupSourceID, "default-orca-managed-microsoft-outlook");
});

test("systems needing their own vendor app are listed by name; ready OAuth systems are counted", () => {
  const { custom, readyToSignIn, managed: apps } = oauthApps([
    { id: "default-zoom", name: "Zoom", endpointHost: "mcp.zoom.us", authMethods: ["oauth"], setupStatus: "admin_setup_required", setupCanConfigure: true },
    { id: "default-asana", name: "Asana", endpointHost: "mcp.asana.com", authMethods: ["oauth"], setupStatus: "admin_setup_required" },
    { id: "default-notion", name: "Notion", authMethods: ["oauth"], setupStatus: "available" },
    { id: "default-linear", name: "Linear", authMethods: ["oauth", "secrets"], setupStatus: "available" },
    { id: "default-key", name: "Key only", authMethods: ["secrets"], setupStatus: "available" },
    { id: "default-review", name: "Review", authMethods: ["oauth"], setupStatus: "review_required" },
    managed("gmail", "google", "available"),
  ]);
  assert.deepEqual(custom.map((app) => [app.name, app.canConfigure]), [["Asana", false], ["Zoom", true]]);
  assert.equal(readyToSignIn, 2);
  assert.equal(apps.length, 1);
});

test("saved vendor apps are listed apart and are not counted as needing no app", () => {
  const { custom, configuredCustom, readyToSignIn, probeSourceID } = oauthApps([
    { id: "default-slack", name: "Slack Workspace", endpointHost: "mcp.slack.com", authMethods: ["oauth"], setupStatus: "available", oauthApp: "configured" },
    { id: "default-zoom", name: "Zoom", authMethods: ["oauth"], setupStatus: "admin_setup_required", setupCanConfigure: true, oauthApp: "missing" },
    { id: "default-notion", name: "Notion", authMethods: ["oauth"], setupStatus: "available" },
  ]);
  assert.deepEqual(custom.map((app) => [app.name, app.configured]), [["Zoom", false]]);
  assert.deepEqual(configuredCustom.map((app) => [app.name, app.configured, app.endpointHost]), [["Slack Workspace", true, "mcp.slack.com"]]);
  assert.equal(readyToSignIn, 1);
  assert.equal(probeSourceID, "default-slack");
});

test("provider apps are managed through the source every connector falls back to", () => {
  const google = oauthApps([
    managed("gmail", "google", "available"),
    managed("google-drive", "google", "available"),
    managed("google-docs", "google", "available"),
  ]);
  assert.equal(google.managed[0].manageSourceID, "default-orca-managed-google-drive");
  assert.equal(google.probeSourceID, "default-orca-managed-google-drive");
  // Without a Drive connector, any member reaches the whole provider on the server.
  const docsOnly = oauthApps([managed("google-docs", "google", "available")]);
  assert.equal(docsOnly.managed[0].manageSourceID, "default-orca-managed-google-docs");
});

test("no managed connectors means no provider cards", () => {
  assert.deepEqual(oauthApps([]), { managed: [], custom: [], configuredCustom: [], readyToSignIn: 0, probeSourceID: undefined });
});
