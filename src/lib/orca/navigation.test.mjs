import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const source = stripTypeScriptTypes(
  await readFile(new URL("./navigation.ts", import.meta.url), "utf8"),
);
const { appNavigation, activeNavigationView, safeReturnPath } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const resolve = (search) => appNavigation(new URLSearchParams(search));

test("post-auth returns still reject external, encoded-separator and login-loop paths", () => {
  for (const value of ["//example.invalid/", "/\\example.invalid/", "/%2fexample.invalid/", "/%2F%2fexample.invalid/", "/%252fexample.invalid/", "/%255cexample.invalid/", "/%5cexample.invalid/", "/%0dexample.invalid/", "/\n/example.invalid/", "https://example.invalid/", "javascript:alert(1)", "/login", "/", null]) {
    assert.equal(safeReturnPath(value), "/app", String(value));
  }
  for (const value of ["/app?view=hub&hub=khh-test&lang=en", "/admin/users", "/app?next=https%3A%2F%2Fexample.invalid#help"]) {
    assert.equal(safeReturnPath(value), value);
  }
});

test("Connections now means OAuth app administration and personal accounts remain separate", () => {
  assert.deepEqual(resolve("view=connections"), { view: "connected-apps", connectionDetail: false });
  assert.equal(resolve("view=connections&section=apps").view, "connected-apps");
  assert.equal(resolve("view=connections&section=unknown").view, "connected-apps");
  assert.equal(resolve("view=connected-apps").view, "connected-apps");
  assert.equal(activeNavigationView("connections"), "connected-apps");
  for (const path of ["view=accounts&lang=th", "view=connections&section=accounts&lang=en"]) {
    assert.deepEqual(resolve(path), { view: "accounts", connectionDetail: false });
  }
  assert.equal(activeNavigationView("accounts"), "accounts");
  assert.notEqual(activeNavigationView("accounts"), "connected-apps");
});

test("legacy source and policy details become Servers before applying section aliases", () => {
  for (const route of ["connections", "servers"]) {
    for (const detail of ["source=provider%2Fone", "connection=policy%26two", "add=source"]) {
      const params = new URLSearchParams(`view=${route}&section=accounts&${detail}&tab=tools&lang=th`);
      const original = params.toString();
      assert.deepEqual(appNavigation(params), { view: "servers", connectionDetail: true });
      assert.equal(params.toString(), original);
      assert.equal(params.get("tab"), "tools");
    }
  }
  assert.equal(resolve("view=connections&source=&connection=&add=other").connectionDetail, false);
  assert.deepEqual(resolve("view=servers"), { view: "servers", connectionDetail: false });
  assert.equal(resolve("view=connections&status=needs-review").view, "servers");
});

test("Connected users can select a connection without entering the Servers editor", () => {
  const params = new URLSearchParams("view=connected-users&connection=policy-1&lang=th");
  assert.deepEqual(appNavigation(params), { view: "connected-users", connectionDetail: false });
  assert.equal(params.get("connection"), "policy-1");
});

test("Organization, Members and API keys preserve Settings deep-link compatibility", () => {
  assert.equal(resolve("view=settings&section=organization").view, "organization");
  assert.equal(resolve("view=settings&section=members").view, "members");
  assert.equal(resolve("view=settings&section=keys").view, "api-keys");
  assert.equal(resolve("view=settings&section=preferences").view, "settings");
  assert.equal(resolve("view=settings&section=additional").view, "settings");
});

test("Gateway routes preserve identity, edit state, tabs and locale", () => {
  for (const route of ["hub", "new", "overview", "workspaces"]) {
    const params = new URLSearchParams(`view=${route}&hub=team%26one&edit=keep%2Fid&tab=connect&lang=en`);
    const original = params.toString();
    assert.equal(appNavigation(params).view, route);
    assert.equal(appNavigation(params).connectionDetail, false);
    assert.equal(params.toString(), original);
    assert.equal(activeNavigationView(route), "workspaces");
  }
});

test("planned headings retain distinct routes while Knowledge and Playground keep prior behavior", () => {
  for (const view of ["projects", "user-sources", "secrets", "user-verification", "contextual-access", "logging-policy", "billing"]) {
    assert.equal(resolve(`view=${view}`).view, view);
    assert.equal(activeNavigationView(view), view);
  }
  assert.equal(resolve("view=knowledge&hub=my-hub").view, "knowledge");
  // Knowledge (Orca Cloud) is its own destination in the navigation.
  assert.equal(activeNavigationView("knowledge"), "knowledge");
  assert.equal(activeNavigationView("pilots"), "settings");
  // Admin audit sits under the same Activity destination as tool executions.
  assert.equal(activeNavigationView("audit"), "executions");
  assert.equal(activeNavigationView("executions"), "executions");
  assert.equal(resolve("view=playground").view, "dashboard");
  assert.equal(resolve("").view, "dashboard");
});
