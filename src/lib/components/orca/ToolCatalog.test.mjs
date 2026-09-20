import { importTypeScript, typescriptModuleURL } from '../../orca/test-import.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compileModule } from "svelte/compiler";
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the shipped component's reactive script.
import { effect_root, flush } from "svelte/internal/client";

const component = await readFile(
  new URL("./ToolCatalog.svelte", import.meta.url),
  "utf8",
);
const catalog = await importTypeScript(new URL('../../orca/catalog.ts', import.meta.url));
const { catalogCategories } = await importTypeScript(
  new URL("../../orca/catalog-data.ts", import.meta.url)
);
const script = stripTypeScriptTypes(
  component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1],
)
  .replace(/^\s*import[^;]+;/gm, "")
  .replace("$props()", "$state(testProps)");
const require = createRequire(import.meta.url);
const code = compileModule(
  `export function harness(testProps, dependencies) {
  const { OrcaService, onMount, onDestroy, catalogDirectory, filterCatalog, googleDriveProvider, groupCatalog, popularCatalog, starterCatalog, catalogSetupHref, catalogCategories, selectedToolInventory, orcaError, localeHref } = dependencies;
  ${script}
  return {
    load, otherDriveConnections, driveProviderLabel, sourceHref, sourceConnection, changeTab,
    setQuery(value) { query = value; }, setCategory(value) { category = value; }, setProtocol(value) { protocol = value; },
    get matches() { return matches; },
    get allSources() { return allSources; }, get groupedMatches() { return groupedMatches; },
    get popular() { return popular; }, get starters() { return starters; },
    get isOverview() { return isOverview; }, get selectedTools() { return selectedTools; }
  };
}`,
  { filename: "tool-catalog-test.svelte.js", generate: "client" },
).js.code.replaceAll(
  "svelte/internal/client",
  pathToFileURL(require.resolve("svelte/internal/client")).href,
);
const { harness } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

function dependencies(candidates, inventory = []) {
  return {
    ...catalog,
    catalogCategories,
    OrcaService: { candidates },
    onMount: () => {},
    onDestroy: () => {},
    selectedToolInventory: () => inventory,
    orcaError: (error) => error.message,
    localeHref: (href) => href,
  };
}

test('protocol selection intersects with search and guides do not become configured sources', async () => {
  let view;
  const stop = effect_root(() => {
    view = harness({ data: { canManage: true, connections: [], hubs: [] } }, dependencies(async () => []));
  });
  try {
    await view.load();
    view.setQuery('LINE');
    view.setProtocol('API');
    flush();
    assert.deepEqual(view.matches.map((row) => row.name), ['LINE Messaging API']);
    assert.ok(view.matches.every((row) => row.guideOnly && !view.sourceConnection(row)));
    view.setProtocol('MCP');
    flush();
    assert.deepEqual(view.matches.map((row) => row.name), ['LINE Bot MCP']);
    assert.equal(view.isOverview, false);
    view.changeTab('tools');
    flush();
    assert.equal(view.selectedTools.length, 0);
  } finally { stop(); }
});

test('unavailable integrations open the real add-MCP flow without sending a guide ID to connection setup', async () => {
  let view;
  const stop = effect_root(() => {
    view = harness({ data: { canManage: true, connections: [], hubs: [] } }, dependencies(async () => [
      { id: 'default-orca-tiktok-ads', name: 'TikTok Ads', authMethods: ['oauth'] },
    ]));
  });
  try {
    await view.load();
    flush();
    for (const id of ['guide-shopee-seller-api', 'guide-line-bot-mcp']) {
      const source = view.allSources.find((row) => row.id === id);
      assert.ok(source.guideOnly);
      const href = new URL(view.sourceHref(source), 'https://orca.test');
      assert.equal(href.searchParams.get('view'), 'servers');
      assert.equal(href.searchParams.get('add'), 'source');
      assert.equal(href.searchParams.has('source'), false);
      assert.equal(view.sourceConnection(source), undefined);
    }
    const available = view.allSources.find((row) => row.id === 'default-orca-tiktok-ads');
    const href = new URL(view.sourceHref(available), 'https://orca.test');
    assert.equal(href.searchParams.get('source'), available.id);
    assert.equal(href.searchParams.has('add'), false);
  } finally { stop(); }
});

test("managed catalog choice keeps existing provider connections distinct and available by their saved identities", async () => {
  const managed = {
    id: "default-orca-managed-google-drive",
    name: "Google Drive",
    managedProvider: "google-drive",
    endpointHost: "127.0.0.1",
  };
  const official = {
    id: "official",
    name: "Google Drive · ORCA",
    endpointHost: "drivemcp.googleapis.com",
  };
  const legacy = {
    id: "legacy",
    name: "Google Drive",
    endpointHost: "google-drive-mcp.obot.ai",
  };
  const custom = {
    id: "custom",
    name: "Custom files",
    endpointHost: "127.0.0.1",
  };
  const connections = [
    {
      id: "official connection & source=other",
      mcpID: official.id,
      name: "Company Drive",
    },
    { id: "legacy-connection", mcpID: legacy.id, name: "Earlier Drive" },
    { id: "managed-connection", mcpID: managed.id, name: "New Drive" },
    { id: "custom-connection", mcpID: custom.id, name: "Custom Drive" },
  ];
  const original = structuredClone(connections);
  let view;
  const stop = effect_root(() => {
    view = harness(
      { data: { canManage: true, connections } },
      dependencies(async () => [official, legacy, managed, custom]),
    );
  });
  try {
    await view.load();
    flush();
    assert.equal(view.allSources[0].id, managed.id);
    assert.deepEqual(
      view.otherDriveConnections(managed).map(({ id }) => id),
      [connections[0].id, connections[1].id],
    );
    assert.deepEqual(view.otherDriveConnections(custom), []);
    assert.equal(view.driveProviderLabel(managed), "ORCA");
    assert.equal(view.driveProviderLabel(official), "Google");
    assert.equal(view.driveProviderLabel(legacy), "Obot");
    assert.equal(view.driveProviderLabel(custom), "");
    assert.deepEqual(connections, original);
  } finally {
    stop();
  }
});

test("catalog category, search, and selected tools remain independent and links keep provider identity", async () => {
  const flow = { id: "flow & account=other", name: "FlowAccount" };
  const peak = { id: "peak", name: "PEAK" };
  const slack = { id: "slack", name: "Slack Workspace" };
  const connections = [
    { id: "old-flow", mcpID: flow.id, archivedAt: "2026-09-19" },
    {
      id: "flow-current & source=wrong",
      mcpID: flow.id,
      enabled: true,
      reviewedTools: true,
      toolNames: ["read"],
    },
  ];
  const data = {
    canManage: true,
    connections,
    hubs: [
      {
        id: "flow-hub",
        connectionID: connections[1].id,
        status: "active",
        toolNames: ["read"],
      },
    ],
  };
  const inventory = [
    { connection: { name: "FlowAccount" }, tool: { name: "read_invoice" } },
  ];
  let view;
  const stop = effect_root(() => {
    view = harness(
      { data },
      dependencies(async () => [slack, flow, peak], inventory),
    );
  });
  try {
    await view.load();
    flush();
    assert.equal(view.isOverview, true);
    assert.ok(view.groupedMatches.some(({ id }) => id === 'accounting'));
    assert.equal(view.popular[0].gatewayCount, 1);
    assert.deepEqual(
      view.starters.map(({ name }) => name),
      ["FlowAccount", "PEAK", "Slack Workspace"],
    );
    view.setCategory("accounting");
    flush();
    assert.deepEqual(
      view.groupedMatches.map(({ id }) => id),
      ["accounting"],
    );
    assert.equal(view.isOverview, false);
    view.setQuery("พีค");
    flush();
    assert.deepEqual(
      view.groupedMatches[0].sources.map(({ id }) => id),
      ["peak"],
    );
    const flowUrl = new URL(
      view.sourceHref(catalog.catalogSource(flow)),
      "https://orca.test",
    );
    assert.equal(flowUrl.searchParams.get("connection"), connections[1].id);
    assert.equal(flowUrl.searchParams.has("source"), false);
    const peakUrl = new URL(
      view.sourceHref(catalog.catalogSource(peak)),
      "https://orca.test",
    );
    assert.equal(peakUrl.searchParams.get("source"), "peak");
    view.changeTab("tools");
    flush();
    assert.equal(view.selectedTools.length, 1);
    view.setQuery("missing");
    flush();
    assert.equal(view.selectedTools.length, 0);
    view.changeTab("apps");
    flush();
    assert.equal(view.isOverview, true);
    assert.ok(view.groupedMatches.some(({ id }) => id === 'accounting'));
  } finally {
    stop();
  }
});

test("members without management permission do not fetch the admin catalog", async () => {
  let calls = 0;
  let view;
  const stop = effect_root(() => {
    view = harness(
      { data: { canManage: false, connections: [], hubs: [] } },
      dependencies(async () => {
        calls++;
        return [];
      }),
    );
  });
  try {
    await view.load();
    assert.equal(calls, 0);
    assert.deepEqual(view.allSources, []);
  } finally {
    stop();
  }
});

test("loaded catalog auth metadata remains attached to each source through grouping, recommendations, and search", async () => {
  const oauth = { id: "flow", name: "FlowAccount", authMethods: ["oauth"] };
  const secrets = { id: "peak", name: "PEAK", authMethods: ["secrets"] };
  const both = { id: "slack", name: "Slack Workspace", authMethods: ["oauth", "secrets"] };
  const unknown = { id: "custom", name: "Custom MCP", oauthProvider: "custom" };
  let view;
  const stop = effect_root(() => {
    view = harness(
      { data: { canManage: true, connections: [], hubs: [] } },
      dependencies(async () => [oauth, secrets, both, unknown]),
    );
  });
  try {
    await view.load();
    flush();
    assert.deepEqual(
      view.starters.map((source) => [source.id, source.authTags.map((tag) => tag.id)]),
      [["flow", ["oauth"]], ["peak", ["secrets"]], ["slack", ["oauth", "secrets"]]],
    );
    assert.deepEqual(view.allSources.find((source) => source.id === "custom").authTags.map((tag) => tag.id), ["unknown"]);
    view.setQuery("Slack");
    flush();
    assert.deepEqual(view.groupedMatches.flatMap((group) => group.sources).map((source) => [source.id, source.authTags.map((tag) => tag.id)]), [["slack", ["oauth", "secrets"]]]);
    view.setQuery("PEAK");
    flush();
    assert.deepEqual(view.groupedMatches[0].sources[0].authTags.map((tag) => tag.id), ["secrets"]);
  } finally {
    stop();
  }
});
