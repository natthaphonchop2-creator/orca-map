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

test("ตรวจสอบ keeps the chips and the person in the address, and the histories keep &hub=", async () => {
  const view = await readFile(new URL("./views/OversightView.svelte", import.meta.url), "utf8");
  assert.match(view, /appsFilter\(page\.url\.searchParams\.get\('filter'\)\)/);
  assert.match(view, /page\.url\.searchParams\.get\('holder'\)/);
  assert.match(view, /<ConnectedAIApps data=\{activeData\} filter=\{appsFilterValue\} holder=\{appsHolder\} \/>/);
  assert.match(view, /`\/app\?view=executions\$\{hub\}`/);
  assert.match(view, /`\/app\?view=audit\$\{hub\}`/);
  const audit = await readFile(new URL("./Audit.svelte", import.meta.url), "utf8");
  assert.match(audit, /`\/app\?view=executions\$\{hubQuery\}`/);
  assert.match(audit, /OrcaService\.audit\(id \|\| undefined\)/);
});
