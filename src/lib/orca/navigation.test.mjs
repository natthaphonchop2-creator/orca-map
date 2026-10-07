import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const source = stripTypeScriptTypes(
  await readFile(new URL("./navigation.ts", import.meta.url), "utf8"),
);
const navigation = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const { appNavigation, activeNavigationView, safeReturnPath, platformHref, RETIRED_VIEWS, RETIRED_SETTINGS_SECTIONS, APP_VIEWS, TEAM_INVITE_HREF } = navigation;

const owner = { canManage: true, platformOperator: false, canReviewPilotRequests: false };
const employee = { canManage: false, platformOperator: false, canReviewPilotRequests: false };
const operator = { canManage: true, platformOperator: true, canReviewPilotRequests: true };
const hubs = [{ id: "hub-one" }, { id: "hub-sso", userSourceID: "company-idp" }];

/** Where an address lands: the view and the canonical address. */
function land(search, { role = owner, hash = "", withHubs = hubs } = {}) {
  const route = appNavigation(new URLSearchParams(search), { hash, role, hubs: withHubs ?? undefined });
  const query = route.params.toString();
  return { view: route.view, href: `/app${query ? `?${query}` : ""}${route.hash}`, redirect: route.redirect, route };
}
function redirects(search, expected, options) {
  const result = land(search, options);
  assert.equal(result.href, expected, search);
  assert.equal(result.redirect, expected, `${search} redirects`);
  return result;
}
function stays(search, view, options) {
  const result = land(search, options);
  assert.equal(result.redirect, undefined, `${search} stays`);
  assert.equal(result.view, view, search);
  return result;
}

test("post-auth returns still reject external, encoded-separator and login-loop paths", () => {
  for (const value of ["//example.invalid/", "/\\example.invalid/", "/%2fexample.invalid/", "/%2F%2fexample.invalid/", "/%252fexample.invalid/", "/%255cexample.invalid/", "/%5cexample.invalid/", "/%0dexample.invalid/", "/\n/example.invalid/", "https://example.invalid/", "javascript:alert(1)", "/login", "/", null]) {
    assert.equal(safeReturnPath(value), "/app", String(value));
  }
  for (const value of ["/app?view=hub&hub=khh-test&lang=en", "/admin/users", "/app?next=https%3A%2F%2Fexample.invalid#help"]) {
    assert.equal(safeReturnPath(value), value);
  }
});

// §2.5, one row at a time.
test("Home: /app stays the dashboard", () => {
  stays("", "dashboard");
  stays("lang=th", "dashboard");
});

test("view=new stays the create form, and a stray step is dropped", () => {
  stays("view=new", "new");
  stays("view=new&connection=conn-one", "new");
  redirects("view=new&step=tools", "/app?view=new");
});

test("workspace tabs: tools becomes โปรแกรม and access becomes คน", () => {
  stays("view=hub&hub=hub-one&tab=overview", "hub");
  redirects("view=hub&hub=hub-one&tab=tools", "/app?view=hub&hub=hub-one&tab=programs");
  redirects("view=hub&hub=hub-one&tab=access", "/app?view=hub&hub=hub-one&tab=people");
  redirects("view=hub&hub=hub-one&tab=unknown", "/app?view=hub&hub=hub-one");
});

test("the workspace connect tab becomes เชื่อม AI ของฉัน; a new workspace lands on ภาพรวม", () => {
  redirects("view=hub&hub=hub-one&tab=connect", "/app?view=connect-ai");
  redirects("view=hub&hub=hub-one&tab=connect&created=1", "/app?view=hub&hub=hub-one&tab=overview&created=1");
  // Before the workspace list has loaded nothing is decided yet.
  const waiting = land("view=hub&hub=hub-one&tab=connect", { withHubs: null });
  assert.equal(waiting.redirect, undefined);
});

test("overview becomes the AI workspace list", () => {
  stays("view=workspaces", "workspaces");
  redirects("view=overview", "/app?view=workspaces");
});

test("Knowledge stays", () => {
  stays("view=knowledge&hub=hub-one", "knowledge");
});

test("the catalog is the catalog dialog on โปรแกรม (W0)", () => {
  redirects("view=catalog", "/app?view=servers&catalog=1");
  redirects("view=catalog&lang=en", "/app?view=servers&lang=en&catalog=1");
  // The old step 1 too, keeping the way back to the create form.
  redirects("view=add-program", "/app?view=servers&catalog=1");
  redirects("view=add-program&return=new", "/app?view=servers&return=new&catalog=1");
  redirects("view=add-program&source=s1&step=choose", "/app?view=servers&catalog=1");
  stays("view=servers&catalog=1", "servers");
  redirects("view=servers&catalog=yes", "/app?view=servers");
  redirects("view=servers&catalog=1&connection=conn-one", "/app?view=servers&connection=conn-one");
  redirects("view=knowledge&catalog=1", "/app?view=knowledge");
});

test("the old step 4 is the program's own page; connecting one stays its own page (W0)", () => {
  redirects("view=add-program&source=s1&step=done&connection=conn-one", "/app?view=servers&connection=conn-one");
  redirects("view=add-program&source=s1&step=done&account=pac-1&connection=conn-one&return=new", "/app?view=servers&connection=conn-one");
  stays("view=add-program&source=s1&step=connect", "add-program");
  stays("view=add-program&source=s1&step=tools&account=pac-1", "add-program");
  stays("view=add-program&source=s1&step=connect&return=welcome", "add-program");
});

test("the programs list stays", () => {
  stays("view=servers", "servers");
  stays("view=servers&status=needs-review", "servers");
});

test("add=source opens the catalog dialog (W0)", () => {
  redirects("view=servers&add=source", "/app?view=servers&catalog=1");
});

test("a program to set up is step 2 of adding it", () => {
  redirects("view=servers&source=default-orca-peak", "/app?view=add-program&source=default-orca-peak&step=connect");
  redirects("view=servers&source=provider%2Fone&lang=th", "/app?view=add-program&source=provider%2Fone&lang=th&step=connect");
});

test("one program stays its detail page", () => {
  const route = stays("view=servers&connection=conn-one", "servers").route;
  assert.equal(route.connectionDetail, true);
  assert.equal(land("view=servers").route.connectionDetail, false);
});

test("My accounts is the program-accounts part of เชื่อม AI ของฉัน", () => {
  redirects("view=accounts", "/app?view=connect-ai#accounts");
  redirects("view=connections&section=accounts&lang=en", "/app?view=connect-ai&lang=en#accounts");
  redirects("view=accounts", "/app?view=connect-ai#accounts", { role: employee });
});

test("Connected users is a program's คนที่เชื่อมบัญชีแล้ว tab", () => {
  redirects("view=connected-users", "/app?view=servers");
  redirects("view=connected-users&connection=conn-one&lang=th", "/app?view=servers&connection=conn-one&lang=th&tab=members");
});

test("Organization is Settings › บริษัท", () => {
  redirects("view=organization", "/app?view=settings&section=company");
  redirects("view=settings&section=organization", "/app?view=settings&section=company");
});

test("Members is ทีม", () => {
  stays("view=members", "members");
  redirects("view=settings&section=members", "/app?view=members");
});

test("API keys and Settings › Connect AI are เชื่อม AI ของฉัน", () => {
  redirects("view=api-keys", "/app?view=connect-ai");
  redirects("view=settings&section=keys", "/app?view=connect-ai");
  redirects("view=settings&section=ai", "/app?view=connect-ai");
  redirects("view=settings&section=ai", "/app?view=connect-ai", { role: employee });
});

test("Settings › Additional features is Knowledge", () => {
  redirects("view=settings&section=additional", "/app?view=knowledge");
});

test("Settings › Customer companies is the platform's บริษัทลูกค้า, for the ORCA team only", () => {
  redirects("view=settings&section=companies", "/app?view=platform&section=companies", { role: operator });
  redirects("view=settings&section=companies", "/app?view=settings", { role: owner });
  redirects("view=settings&section=companies", "/app?view=settings", { role: employee });
});

test("pilot requests are the platform's คำขอทดลองใช้", () => {
  redirects("view=settings&section=owner", "/app?view=platform&section=pilots", { role: operator });
  redirects("view=pilots", "/app?view=platform&section=pilots", { role: operator });
  // Anyone else: never the platform.
  redirects("view=pilots", "/app", { role: owner });
  redirects("view=settings&section=owner", "/app?view=settings", { role: owner });
});

test("sign-in sources: Google is the platform's; a company's SSO is Settings › ขั้นสูง", () => {
  redirects("view=user-sources", "/app?view=platform&section=signin", { role: operator });
  redirects("view=user-sources", "/app?view=settings&section=advanced", { role: owner });
  redirects("view=user-sources", "/app?view=settings&section=account", { role: employee });
});

test("OAuth apps are the platform's; customers see their programs", () => {
  redirects("view=connected-apps", "/app?view=platform&section=oauth-apps", { role: operator });
  redirects("view=connected-apps", "/app?view=servers", { role: owner });
  redirects("view=connections", "/app?view=servers", { role: owner });
  redirects("view=connections&section=apps", "/app?view=platform&section=oauth-apps", { role: operator });
  // An employee who follows it ends at their own program accounts.
  redirects("view=connected-apps", "/app?view=connect-ai#accounts", { role: employee });
});

test("secrets keeps its id and lights AI ของฉัน (W0: ทั้งบริษัท); employees get their own AI apps", () => {
  stays("view=secrets", "secrets");
  assert.equal(activeNavigationView("secrets"), "connect-ai");
  redirects("view=secrets", "/app?view=connect-ai", { role: employee });
});

test("approvals keep their id for managers and for an employee's own requests", () => {
  stays("view=approvals", "approvals");
  stays("view=approvals", "approvals", { role: employee });
});

test("activity and settings history keep their workspace filter", () => {
  stays("view=executions", "executions");
  stays("view=audit", "audit");
  const executions = stays("view=executions&hub=hub-one", "executions");
  assert.equal(executions.route.params.get("hub"), "hub-one");
  const audit = stays("view=audit&hub=hub-one&lang=en", "audit");
  assert.equal(audit.route.params.get("hub"), "hub-one");
  // W0: the three tabs light ประวัติ.
  for (const view of ["approvals", "executions", "audit"]) assert.equal(activeNavigationView(view), "history");
});

test("help stays", () => {
  stays("view=help", "help");
});

test("the five placeholder views are gone and land on /app", () => {
  for (const view of ["projects", "user-verification", "contextual-access", "logging-policy", "billing"]) {
    redirects(`view=${view}`, "/app");
    redirects(`view=${view}&lang=en`, "/app?lang=en");
  }
});

test("playground and the legacy Connections page keep their mapping", () => {
  redirects("view=playground", "/app");
  redirects("view=connections&status=needs-review", "/app?view=servers&status=needs-review");
  redirects("view=connections&connection=conn-one&tab=tools", "/app?view=servers&connection=conn-one&tab=tools");
  redirects("view=connections&source=default-orca-peak", "/app?view=add-program&source=default-orca-peak&step=connect");
});

// The critique's item 9.
test("view=new&edit=ID edits on the workspace (ตั้งค่า)", () => {
  redirects("view=new&edit=hub-one", "/app?view=hub&hub=hub-one&tab=settings");
  redirects("view=new&edit=keep%2Fid&lang=en", "/app?view=hub&lang=en&hub=keep%2Fid&tab=settings");
});

test("view=new&edit=ID&step=tools opens the workspace's โปรแกรม tab", () => {
  redirects("view=new&edit=hub-one&step=tools", "/app?view=hub&hub=hub-one&tab=programs");
  redirects("view=hub&hub=hub-one&tab=settings&step=tools", "/app?view=hub&hub=hub-one&tab=programs");
  redirects("view=hub&hub=hub-one&tab=settings&step=other", "/app?view=hub&hub=hub-one&tab=settings");
});

test("a program's tabs: the account tab folds into ภาพรวม, the others stay", () => {
  redirects("view=servers&connection=conn-one&tab=account", "/app?view=servers&connection=conn-one&tab=overview");
  for (const tab of ["overview", "tools", "members", "activity", "workspaces"]) stays(`view=servers&connection=conn-one&tab=${tab}`, "servers");
});

test("settings&section=preferences is บัญชีของฉัน", () => {
  redirects("view=settings&section=preferences", "/app?view=settings&section=account");
  redirects("view=settings&section=general", "/app?view=settings&section=account");
  stays("view=settings&section=account", "settings", { role: employee });
  redirects("view=settings&section=nonsense", "/app?view=settings");
});

test("the #connect-ai hash goes to เชื่อม AI ของฉัน", () => {
  redirects("view=hub&hub=hub-one", "/app?view=connect-ai", { hash: "#connect-ai" });
});

test("employees opening programs or add-program go to their own program accounts", () => {
  for (const search of ["view=servers", "view=add-program", "view=servers&add=source", "view=servers&source=default-orca-peak", "view=catalog", "view=servers&connection=conn-one&tab=account", "view=servers&connection=conn-one&tab=tools"]) {
    redirects(search, "/app?view=connect-ai#accounts", { role: employee });
  }
});

test("tab=connect on a workspace with its own sign-in stays on ภาพรวม", () => {
  redirects("view=hub&hub=hub-sso&tab=connect", "/app?view=hub&hub=hub-sso&tab=overview#connect-ai");
  stays("view=hub&hub=hub-sso&tab=overview", "hub", { hash: "#connect-ai" });
});

// New areas.
test("the platform area is the ORCA team's, one section at a time", () => {
  stays("view=platform&section=overview", "platform", { role: operator });
  for (const section of ["companies", "pilots", "signin", "oauth-apps", "catalog", "breakglass"]) {
    stays(`view=platform&section=${section}`, "platform", { role: operator });
    assert.equal(activeNavigationView("platform", section), `platform:${section}`);
  }
  redirects("view=platform", "/app?view=platform&section=overview", { role: operator });
  redirects("view=platform&section=nope&hub=x", "/app?view=platform&section=overview", { role: operator });
  redirects("view=platform&section=pilots", "/app?view=platform&section=overview", { role: { ...operator, canReviewPilotRequests: false } });
  for (const role of [owner, employee]) redirects("view=platform&section=companies", "/app", { role });
  assert.equal(platformHref("signin"), "/app?org=default&view=platform&section=signin");
});

test("a customer company's page keeps its company and tab, for the ORCA team only (C6 PC1)", () => {
  const B = "org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  stays(`view=platform&section=companies&company=${B}`, "platform", { role: operator });
  stays(`view=platform&section=companies&company=${B}&tab=manage`, "platform", { role: operator });
  redirects(`view=platform&section=companies&company=${B}&tab=overview`, `/app?view=platform&section=companies&company=${B}`, { role: operator });
  redirects(`view=platform&section=companies&company=${B}&tab=raw-audit`, `/app?view=platform&section=companies&company=${B}`, { role: operator });
  stays("view=platform&section=companies&company=default", "platform", { role: operator });
  redirects("view=platform&section=companies&company=../x&tab=manage", "/app?view=platform&section=companies", { role: operator });
  redirects(`view=platform&section=signin&company=${B}`, "/app?view=platform&section=signin", { role: operator });
  for (const role of [owner, employee]) redirects(`view=platform&section=companies&company=${B}`, "/app", { role });
});

test("ทีม tabs live in the address; employees go Home (they only receive their own row)", () => {
  stays("view=members&tab=invitations", "members");
  stays("view=members&tab=departments", "members");
  redirects("view=members&tab=members", "/app?view=members");
  redirects("view=members&tab=other", "/app?view=members");
  redirects("view=members&tab=departments", "/app", { role: employee });
  redirects("view=members", "/app", { role: employee });
  redirects("view=members&lang=th&org=org-12345678-1234-4234-8234-123456789012", "/app?lang=th&org=org-12345678-1234-4234-8234-123456789012", { role: employee });
  // The old settings address lands there too, for an employee.
  redirects("view=settings&section=members", "/app", { role: employee });
  stays("view=members", "members", { role: owner });
  // Home's "ส่งลิงก์เชิญ": the invite dialog opens for managers; employees never invite.
  assert.equal(TEAM_INVITE_HREF, "/app?view=members&tab=invitations&invite=1");
  stays("view=members&tab=invitations&invite=1", "members", { role: owner });
  redirects("view=members&tab=invitations&invite=1", "/app", { role: employee });
});

test("Settings: บริษัท and ขั้นสูง are for Owners and Admins", () => {
  stays("view=settings&section=company", "settings");
  stays("view=settings&section=advanced", "settings");
  redirects("view=settings&section=company", "/app?view=settings&section=account", { role: employee });
  redirects("view=settings&section=advanced", "/app?view=settings&section=account", { role: employee });
});

test("before the company's data loads, only rules that don't depend on the viewer apply", () => {
  const route = appNavigation(new URLSearchParams("view=user-sources"));
  assert.equal(route.view, "user-sources");
  assert.equal(route.redirect, undefined);
  assert.equal(appNavigation(new URLSearchParams("view=catalog")).view, "servers");
});

test("redirects never change the address they were given, and keep language and company", () => {
  const params = new URLSearchParams("view=settings&section=organization&lang=en&org=org-12345678-1234-4234-8234-123456789012");
  const original = params.toString();
  const route = appNavigation(params, { role: owner });
  assert.equal(params.toString(), original);
  assert.equal(route.params.get("lang"), "en");
  assert.equal(route.params.get("org"), "org-12345678-1234-4234-8234-123456789012");
});

const everyAddress = [
  "", "view=new", "view=new&step=tools", "view=hub&hub=hub-one&tab=tools", "view=hub&hub=hub-one&tab=access", "view=hub&hub=hub-one&tab=connect",
  "view=hub&hub=hub-one&tab=connect&created=1", "view=hub&hub=hub-sso&tab=connect", "view=overview", "view=workspaces", "view=knowledge", "view=catalog",
  "view=servers", "view=servers&add=source", "view=servers&source=s-one", "view=servers&connection=c-one&tab=account", "view=accounts",
  "view=connected-users", "view=connected-users&connection=c-one", "view=organization", "view=members", "view=members&tab=members", "view=api-keys",
  "view=settings", "view=settings&section=ai", "view=settings&section=keys", "view=settings&section=additional", "view=settings&section=companies",
  "view=settings&section=owner", "view=settings&section=organization", "view=settings&section=preferences", "view=settings&section=members",
  "view=pilots", "view=user-sources", "view=connected-apps", "view=connections", "view=secrets", "view=approvals", "view=executions&hub=hub-one",
  "view=audit&hub=hub-one", "view=help", "view=projects", "view=billing", "view=playground", "view=new&edit=hub-one", "view=new&edit=hub-one&step=tools",
  "view=platform", "view=platform&section=signin",
];

test("every redirect lands on a live view and is already canonical (no redirect loops)", () => {
  for (const role of [owner, employee, operator]) {
    for (const search of everyAddress) {
      const first = land(search, { role });
      assert.ok(APP_VIEWS.includes(first.view), `${search} as ${JSON.stringify(role)} → ${first.view}`);
      const [path, hash = ""] = first.href.split("#");
      const again = appNavigation(new URLSearchParams(path.replace(/^\/app\??/, "")), { hash: hash ? `#${hash}` : "", role, hubs });
      assert.equal(again.redirect, undefined, `${search} → ${first.href} is canonical`);
    }
  }
});

test("the sidebar highlight doesn't jump while an old address redirects", () => {
  for (const search of everyAddress) {
    const requested = new URLSearchParams(search);
    const view = requested.get("view") || "dashboard";
    if (["user-sources", "connected-apps", "pilots", "connections", "platform"].includes(view)) continue; // depends on who is looking
    if (view === "settings" && ["companies", "owner", "members", "ai", "keys", "additional"].includes(requested.get("section"))) continue;
    if (view === "hub" && requested.get("tab") === "connect") continue;
    const landed = land(search);
    assert.equal(
      activeNavigationView(view, requested.get("section")),
      activeNavigationView(landed.view, landed.route.params.get("section")),
      search,
    );
  }
});

test("no component links to a retired view", async () => {
  const root = new URL("../../", import.meta.url);
  const files = [];
  async function walk(url) {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      const next = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      if (entry.isDirectory()) await walk(next);
      else if (/\.(svelte|ts|js)$/.test(entry.name) && !/\.test\./.test(entry.name) && !next.pathname.endsWith("/orca/navigation.ts")) files.push(next);
    }
  }
  await walk(root);
  assert.ok(files.length > 50, "scanned the source tree");
  const retired = new RegExp(`[?&]view=(?:${RETIRED_VIEWS.join("|")})(?![\\w-])`);
  const retiredSettings = new RegExp(`view=settings&section=(?:${RETIRED_SETTINGS_SECTIONS.join("|")})(?![\\w-])`);
  const patterns = [
    [retired, "a retired view id"],
    [retiredSettings, "a retired settings section"],
    [/view=servers&(?:source|add)=/, "adding a program from the programs list (use view=add-program)"],
    [/view=new&edit=/, "the old edit form (use the workspace's ตั้งค่า tab)"],
    [/[?&]tab=connect(?![\w-])/, "the old workspace connect tab (use view=connect-ai)"],
    [/href=["'{`(]*#connect-ai/, "the old #connect-ai anchor"],
  ];
  // Old tab names, checked line by line: a workspace link with tools/access,
  // a program link with its folded account tab.
  const linePatterns = [
    [/view=hub&/, /[?&]tab=(?:tools|access)(?![\w-])/, "an old workspace tab (use programs or people)"],
    [/view=servers&/, /[?&]tab=account(?![\w-])/, "a program's old account tab (use overview)"],
  ];
  const found = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const [pattern, reason] of patterns) {
      const match = text.match(pattern);
      if (match) found.push(`${file.pathname.split("/src/")[1]}: ${match[0]} (${reason})`);
    }
    for (const line of text.split("\n")) {
      for (const [where, pattern, reason] of linePatterns) {
        const match = where.test(line) && line.match(pattern);
        if (match) found.push(`${file.pathname.split("/src/")[1]}: ${match[0]} (${reason})`);
      }
    }
  }
  assert.deepEqual(found, []);
});

// ---------------------------------------------------------------------------
// W0, the calm workspace
// ---------------------------------------------------------------------------

test("W0: ประวัติ opens its first tab for each role, keeping a workspace filter", () => {
  redirects("view=history", "/app?view=approvals", { role: owner });
  redirects("view=history", "/app?view=executions", { role: employee });
  redirects("view=history&hub=hub-one&lang=en", "/app?view=executions&hub=hub-one&lang=en", { role: employee });
  // Before the viewer is known it waits; nothing is guessed.
  const waiting = appNavigation(new URLSearchParams("view=history"));
  assert.equal(waiting.view, "history");
  assert.equal(waiting.redirect, undefined);
  assert.equal(activeNavigationView("history"), "history");
});

test("W0: ทีม and พื้นที่ทำงาน AI live under ตั้งค่า, at their own addresses", () => {
  redirects("view=settings&section=team", "/app?view=members", { role: owner });
  redirects("view=settings&section=team&tab=invitations", "/app?view=members&tab=invitations", { role: owner });
  redirects("view=settings&section=workspaces", "/app?view=workspaces", { role: owner });
  redirects("view=settings&section=workspaces", "/app?view=workspaces", { role: employee });
  // ทีม stays the managers' (rule 7): an employee still goes Home.
  redirects("view=settings&section=team", "/app", { role: employee });
  for (const view of ["members", "workspaces", "hub", "new"]) assert.equal(activeNavigationView(view), "settings", view);
  stays("view=members&tab=invitations", "members");
  stays("view=workspaces", "workspaces", { role: employee });
});

test("W0: Skills opens only with the company's skills feature", () => {
  for (const features of [undefined, {}, { skills: false }, { skills: "true" }, { libraryV2: true }])
    for (const role of [owner, employee]) redirects("view=skills", "/app", { role: { ...role, features } });
  stays("view=skills", "skills", { role: { ...owner, features: { skills: true } } });
  stays("view=skills", "skills", { role: { ...employee, features: { skills: true } } });
  assert.equal(activeNavigationView("skills"), "skills");
  assert.ok(APP_VIEWS.includes("skills"));
});

test("W0: the onboarding is for Owners and Admins, and keeps only its page", () => {
  stays("view=welcome", "welcome", { role: owner });
  stays("view=welcome&page=2", "welcome", { role: owner });
  redirects("view=welcome&page=3", "/app?view=welcome", { role: owner });
  redirects("view=welcome&page=2&source=x", "/app?view=welcome&page=2", { role: owner });
  redirects("view=welcome", "/app", { role: employee });
  redirects("view=welcome&page=2", "/app", { role: employee });
  assert.equal(activeNavigationView("welcome"), "dashboard");
  assert.ok(APP_VIEWS.includes("welcome"));
});
