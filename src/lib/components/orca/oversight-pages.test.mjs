import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { render } from "svelte/server";
import { importTypeScript } from "../../orca/test-import.mjs";
import { serverComponent } from "./test-render.mjs";

// ตรวจสอบ's four pages (workspace UX U7): each opens with the page contract's
// header, speaks the glossary's plain Thai, and keeps jargon out of sight.
const contract = await importTypeScript(new URL("./ui/page-contract.ts", import.meta.url));
const { glossary, retiredWords } = await importTypeScript(new URL("../../orca/glossary.ts", import.meta.url));
const apps = await importTypeScript(new URL("../../orca/connected-ai-apps.ts", import.meta.url));
const secrets = await importTypeScript(new URL("../../orca/secrets.ts", import.meta.url));
const access = await importTypeScript(new URL("../../orca/member-access.ts", import.meta.url));
const approvals = await importTypeScript(new URL("../../orca/approvals.ts", import.meta.url));
const auditFilters = await importTypeScript(new URL("../../orca/audit-filters.ts", import.meta.url));
const auditDetails = await importTypeScript(new URL("../../orca/audit-details.ts", import.meta.url));
const tools = await importTypeScript(new URL("../../orca/tool-presentation.ts", import.meta.url));

const FILES = ["ConnectedAIApps.svelte", "ConnectedAppsList.svelte", "Approvals.svelte", "Audit.svelte", "AuditDetails.svelte", "views/OversightView.svelte"];
const data = (canManage) => ({
  canManage,
  canChangeMemberStatus: canManage,
  currentUserID: "u1",
  members: [{ id: "u1", displayName: "วิภา ตัวอย่าง", email: "u1@example.invalid", role: canManage ? "owner" : "employee" }],
  hubs: [],
  connections: [],
  units: [],
});

async function headers(file, props, deps) {
  const seen = [];
  const { warnings, Component } = await serverComponent(new URL(`./${file}`, import.meta.url), {
    ...deps,
    t: (th) => th,
    term: (key, translate) => translate(...glossary[key]),
    localeHref: (path) => path,
    orcaLocale: { value: "th" },
    PageHeader: (_renderer, header) => seen.push(header),
  });
  assert.deepEqual(warnings, [], file);
  // Reading the body is what renders the page.
  assert.ok(render(Component, { props }).body.length, file);
  return seen;
}

test("every oversight page opens with one PageHeader within the page contract", async () => {
  const found = [
    ...(await headers("ConnectedAIApps.svelte", { data: data(true) }, { ...apps, ...secrets, organizationRole: access.organizationRole })),
    ...(await headers("Approvals.svelte", { data: data(true) }, { ...approvals, toolPresentation: tools.toolPresentation, memberName: (m) => m.displayName })),
    ...(await headers("Approvals.svelte", { data: data(false) }, { ...approvals, toolPresentation: tools.toolPresentation, memberName: (m) => m.displayName })),
    ...(await headers("Audit.svelte", { data: data(true), mode: "executions" }, { ...auditFilters, ...auditDetails, toolPresentation: tools.toolPresentation, memberName: (m) => m.displayName })),
    ...(await headers("Audit.svelte", { data: data(true), mode: "administration" }, { ...auditFilters, ...auditDetails, toolPresentation: tools.toolPresentation, memberName: (m) => m.displayName })),
    ...(await headers("Audit.svelte", { data: data(false), mode: "executions" }, { ...auditFilters, ...auditDetails, toolPresentation: tools.toolPresentation, memberName: (m) => m.displayName })),
  ];
  assert.deepEqual(found.map((header) => header.title), [
    "แอป AI ที่เชื่อมอยู่", "รออนุมัติ", "คำขอของฉัน", "ประวัติการใช้งาน", "ประวัติการตั้งค่า", "ประวัติการใช้งาน",
  ], "titles are the glossary's tab names");
  for (const header of found) {
    assert.ok(contract.titleWithinContract(header.title), header.title);
    assert.ok(header.subtitle, `${header.title} has one line under it`);
    assert.ok(contract.subtitleWithinContract(header.subtitle), `${header.title}: ${header.subtitle}`);
    assert.equal(header.action, undefined, `${header.title} has no primary button in its header`);
  }
});

test("the pages speak plain Thai: no retired word, no jargon", async () => {
  const banned = [...retiredWords.map(([th]) => th), "เครื่องมือ", "ระบบที่เชื่อม", "เพิกถอน", "ให้ออกจากระบบ", "คีย์ API", "OAuth", "MCP", "Secrets"];
  for (const file of FILES) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    const thai = [...source.matchAll(/\bt\(\s*(["'`])((?:(?!\1)[\s\S])*)\1/g)].map((match) => match[2]);
    assert.ok(thai.length || file.includes("OversightView"), `${file} has Thai copy`);
    for (const text of thai) for (const word of banned) assert.ok(!text.includes(word), `${file}: “${text}” uses ${word}`);
  }
});

test("disconnecting is one word everywhere, and the connect page keeps its one name", async () => {
  const list = await readFile(new URL("./ConnectedAppsList.svelte", import.meta.url), "utf8");
  const page = await readFile(new URL("./ConnectedAIApps.svelte", import.meta.url), "utf8");
  assert.match(list, /term\('disconnect', t\)/);
  assert.match(page, /confirmLabel=\{term\('disconnect', t\)\}/);
  assert.match(page, /เชื่อม AI ของฉัน/);
  assert.doesNotMatch(page + list, /<select/, "no native select for the page's choices");
});

test("แอป AI ที่เชื่อม (now AI ของฉัน › ทั้งบริษัท) keeps the chips and the person in the address, and the histories keep &hub=", async () => {
  const frame = await readFile(new URL("./views/MyAIFrame.svelte", import.meta.url), "utf8");
  assert.match(frame, /appsFilter\(page\.url\.searchParams\.get\('filter'\)\)/);
  assert.match(frame, /page\.url\.searchParams\.get\('holder'\)/);
  assert.match(frame, /<ConnectedAIApps \{data\} \{filter\} \{holder\} \/>/);
  const page = await readFile(new URL("../../../routes/app/+page.svelte", import.meta.url), "utf8");
  assert.match(page, /\{:else if view === "secrets" && data\.canManage\}<MyAIFrame data=\{currentData!\} \/>/, "Owners and Admins only, on the data without archived records");
  const view = await readFile(new URL("./views/OversightView.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(view, /<ConnectedAIApps|import ConnectedAIApps|href: '\/app\?view=secrets'/, 'the tab moved out of ประวัติ');
  assert.match(view, /`\/app\?view=executions\$\{hub\}`/);
  assert.match(view, /`\/app\?view=audit\$\{hub\}`/);
  const audit = await readFile(new URL("./Audit.svelte", import.meta.url), "utf8");
  assert.match(audit, /`\/app\?view=executions\$\{hubQuery\}`/);
  assert.match(audit, /OrcaService\.audit\(id \|\| undefined\)/);
  // The workspace chosen in a history's filter goes with the tab links (Codex release review 64).
  assert.match(view, /const hub = \$derived\(chosenHub \? `&hub=\$\{encodeURIComponent\(chosenHub\)\}` : ''\);/);
  assert.equal(view.match(/<Audit [^>]*onhubchange=\{\(id\) => \(chosenHub = id\)\}/g)?.length, 2);
  assert.match(view, /\$effect\(\(\) => \{\s*chosenHub = hubID;\s*\}\);/, 'a new address still wins');
  assert.match(audit, /\$effect\(\(\) => \{\s*onhubchange\?\.\(selectedHubID\);\s*\}\);/);
});

test("W0: ประวัติ is one page with three tabs; an employee's are their own requests and use", async () => {
  const { term } = await importTypeScript(new URL("../../orca/glossary.ts", import.meta.url));
  const base = { term, t: (th) => th, localeHref: (path) => path };
  const PageHeader = (await serverComponent(new URL("./ui/PageHeader.svelte", import.meta.url), { pageHeaderClaimed: () => false })).Component;
  const PageTabs = (await serverComponent(new URL("./ui/PageTabs.svelte", import.meta.url), base)).Component;
  const shown = [];
  const { warnings, Component } = await serverComponent(new URL("./views/OversightView.svelte", import.meta.url), {
    ...base, hubAsksApproval: approvals.hubAsksApproval, untrack: (fn) => fn(), PageHeader, PageTabs,
    Approvals: () => shown.push("Approvals"), Audit: (_r, props) => shown.push(`Audit:${props.mode}:${props.showModeTabs}`)
  });
  assert.deepEqual(warnings, []);
  const tabs = (html) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)/g)].map(([, href, label]) => `${label} ${href}`);
  let html = render(Component, { props: { data: data(true), view: "approvals", pendingApprovals: 4 } }).body;
  assert.match(html, /<h1[^>]*>ประวัติ<\/h1>/);
  assert.equal(html.match(/<h1/g)?.length, 1);
  assert.deepEqual(tabs(html), ["รออนุมัติ /app?view=approvals", "การใช้งาน /app?view=executions", "การตั้งค่า /app?view=audit"]);
  assert.match(html, /aria-label="รออนุมัติ 4"/);
  assert.match(html, /<a href="\/app\?view=approvals" aria-current="page"/);
  html = render(Component, { props: { data: data(true), view: "executions", hubID: "hub one" } }).body;
  assert.deepEqual(tabs(html).slice(1), ["การใช้งาน /app?view=executions&amp;hub=hub%20one", "การตั้งค่า /app?view=audit&amp;hub=hub%20one"], "the workspace filter rides along");
  assert.deepEqual(shown.slice(-1), ["Audit:executions:false"], "the frame's tabs replace Audit's own");
  // An employee without writes waiting: their use and their settings changes.
  html = render(Component, { props: { data: data(false), view: "executions" } }).body;
  assert.deepEqual(tabs(html), ["การใช้งาน /app?view=executions", "การตั้งค่า /app?view=audit"]);
  // With a workspace that holds writes for approval: คำขอของฉัน first, never a count.
  const writes = { ...data(false), hubs: [{ id: "h", status: "active", writeMode: "approval" }] };
  html = render(Component, { props: { data: writes, view: "executions", pendingApprovals: 3 } }).body;
  assert.deepEqual(tabs(html), ["คำขอของฉัน /app?view=approvals", "การใช้งาน /app?view=executions", "การตั้งค่า /app?view=audit"]);
  assert.doesNotMatch(html, /คำขอของฉัน 3/);
  assert.doesNotMatch(html, /แอป AI ที่เชื่อม|ตรวจสอบ/);
});
