<script lang="ts">
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import { catalogSetupHref, filterCatalog, googleDriveProvider } from "$lib/orca/catalog";
  import { catalogCategories } from "$lib/orca/catalog-data";
  import {
    selectedToolInventory,
    toolWorkspaceHref,
  } from "$lib/orca/tool-inventory";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    orcaError,
    type OrcaBootstrap,
    type OrcaCandidate,
  } from "$lib/services/orca";
  import {
    ArrowRight,
    ChevronDown,
    CirclePlus,
    Code2,
    Info,
    LoaderCircle,
    Search,
    ShieldCheck,
    X,
  } from "@lucide/svelte";
  import { onMount, onDestroy } from "svelte";

  let { data }: { data: OrcaBootstrap } = $props();
  let sources = $state<OrcaCandidate[]>([]);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let category = $state("all");
  let tab = $state<"apps" | "tools">("apps");
  let generation = 0;
  const allSources = $derived(filterCatalog(sources));
  const matches = $derived(filterCatalog(sources, query, category));
  const inventory = $derived(selectedToolInventory(data));
  const selectedTools = $derived(
    inventory.filter(({ connection, tool }) =>
      `${connection.name} ${tool.name} ${tool.description || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    ),
  );
  const groups = $derived(
    catalogCategories.filter((group) =>
      allSources.some((source) => source.categoryId === group.id),
    ),
  );
  async function load() {
    if (!data.canManage) {
      loading = false;
      return;
    }
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const result = await OrcaService.candidates();
      if (current === generation) sources = result;
    } catch (cause) {
      if (current === generation) error = orcaError(cause);
    } finally {
      if (current === generation) loading = false;
    }
  }
  function changeTab(next: "apps" | "tools") {
    tab = next;
    query = "";
    category = "all";
  }
  function otherDriveConnections(source: OrcaCandidate) {
    if (!googleDriveProvider(source)) return [];
    const relatedIDs = new Set(sources
      .filter((candidate) => candidate.id !== source.id && googleDriveProvider(candidate))
      .map((candidate) => candidate.id));
    return data.connections.filter((connection) => relatedIDs.has(connection.mcpID));
  }
  function driveProviderLabel(source?: OrcaCandidate) {
    const provider = source && googleDriveProvider(source);
    return provider === "orca" ? "ORCA" : provider === "google" ? "Google" : provider === "obot" ? "Obot" : "";
  }
  onMount(() => {
    void load();
  });
  onDestroy(() => {
    generation += 1;
  });
</script>

<section class="tool-library" aria-label={t("คลังเครื่องมือ", "Tool catalog")}>
  <header class="catalog-heading">
    <div>
      <h1>Tool Catalog</h1>
      <p>
        {t(
          "ค้นหาแอป เชื่อมบัญชี แล้วเลือกเครื่องมือให้ทีมใช้งาน",
          "Find apps, connect accounts, and choose tools for your team.",
        )}
      </p>
    </div>
    {#if data.canManage}<a
        class="k-button"
        href={localeHref("/app?view=servers&add=source")}
        ><CirclePlus size={16} />{t("เพิ่ม MCP ของคุณ", "Add MCP server")}</a
      >{/if}
  </header>
  {#if !data.canManage}
    <div class="catalog-empty">
      <ShieldCheck size={28} />
      <h2>{t("เครื่องมือสำหรับทีมของคุณ", "Tools for your team")}</h2>
      <p>
        {t(
          "ผู้ดูแลเป็นผู้เลือกแอปและสิทธิ์ คุณดูเครื่องมือและวิธีเชื่อมต่อได้ใน MCP Gateway ที่ได้รับสิทธิ์",
          "Your administrator selects apps and access. View your tools and connection details in an authorized MCP Gateway.",
        )}
      </p>
      <a class="k-button" href={localeHref("/app?view=workspaces")}
        >{t("เปิด MCP Gateways", "Open MCP Gateways")}<ArrowRight
          size={16}
        /></a
      >
    </div>
  {:else}
    <nav
      class="catalog-tabs"
      aria-label={t("ประเภทคลังเครื่องมือ", "Catalog view")}
    >
      <button
        class:chosen={tab === "apps"}
        aria-pressed={tab === "apps"}
        onclick={() => changeTab("apps")}
        >{t("แอปและ MCP", "Apps & MCP")}<span
          >{loading ? "…" : allSources.length}</span
        ></button
      >
      <button
        class:chosen={tab === "tools"}
        aria-pressed={tab === "tools"}
        onclick={() => changeTab("tools")}
        >{t("เครื่องมือที่เลือก", "Selected tools")}<span
          >{inventory.length}</span
        ></button
      >
    </nav>
    <div class="catalog-toolbar">
      <div class="catalog-search">
        <Search size={17} /><input
          type="search"
          bind:value={query}
          aria-label={t("ค้นหาเครื่องมือ", "Search tools")}
          placeholder={tab === "apps"
            ? t("ค้นหาแอปหรือ MCP…", "Search apps or MCP servers…")
            : t("ค้นหาชื่อเครื่องมือหรือระบบ…", "Search tools or connections…")}
        />{#if query}<button
            onclick={() => (query = "")}
            aria-label={t("ล้างคำค้น", "Clear search")}><X size={15} /></button
          >{/if}
      </div>
      {#if tab === "apps"}<select
          bind:value={category}
          aria-label={t("หมวดเครื่องมือ", "Tool category")}
          ><option value="all">{t("ทุกหมวด", "All categories")}</option
          >{#each groups as group}<option value={group.id}
              >{t(group.th, group.en)}</option
            >{/each}</select
        >{/if}
      <span class="result-count" role="status"
        >{tab === "apps" ? matches.length : selectedTools.length}
        {t("รายการ", "results")}</span
      >
    </div>
    {#if tab === "apps"}
      {#if loading}<div class="catalog-empty" role="status">
          <LoaderCircle class="k-spin" size={23} />{t(
            "กำลังโหลดแอป…",
            "Loading apps…",
          )}
        </div>
      {:else if error}<div class="catalog-empty" role="alert">
          <Info size={26} />
          <h2>
            {t("โหลดคลังเครื่องมือไม่สำเร็จ", "Could not load the catalog")}
          </h2>
          <p>{error}</p>
          <button class="k-button" onclick={load}
            >{t("ลองอีกครั้ง", "Retry")}</button
          >
        </div>
      {:else}
        <div class="source-list">
          {#each matches as source (source.id)}
            {@const connection = data.connections.find(
              (item) => item.mcpID === source.id,
            )}
            {@const otherConnections = otherDriveConnections(source)}
            {@const provider = googleDriveProvider(source)}
            {@const group = catalogCategories.find(
              (item) => item.id === source.categoryId,
            )}
            <details class="source-row">
              <summary
                ><span class="app-icon"
                  ><CatalogIcon name={source.name} size={27} /></span
                ><span class="source-copy"
                  ><strong>{source.name}</strong><span
                    >{t(
                      source.descriptionTh,
                      source.description || source.descriptionTh,
                    )}</span
                  ></span
                ><span class="source-category"
                  >{group ? t(group.th, group.en) : "MCP"}</span
                ><span class="source-type">MCP</span>{#if connection}<span
                    class="saved-dot"
                    title={t(
                      "มีการตั้งค่าในองค์กร",
                      "Configured in your organization",
                    )}
                  ></span>{/if}<ChevronDown size={15} /></summary
              >
              <div class="source-detail">
                <p>
                  {t(
                    source.descriptionTh,
                    source.description || source.descriptionTh,
                  )}
                </p>
                {#if provider}<p class="source-provider-copy">{provider === "orca"
                  ? t("ORCA ให้บริการ connector และจัดการ OAuth สำหรับ Google Drive API", "ORCA hosts the connector and manages OAuth for the Google Drive API.")
                  : provider === "obot"
                    ? t("การเชื่อมต่อนี้ผ่านบริการของ Obot", "This connection uses Obot’s service.")
                    : t("การเชื่อมต่อนี้ใช้บริการ Google Drive ของ Google", "This connection uses Google’s Google Drive service.")}</p>{/if}
                {#if otherConnections.length}
                  <div class="existing-provider-connections">
                    <p>{t("การเชื่อมต่อเดิมขององค์กรยังใช้บัญชีและสิทธิ์แยกกัน", "Existing organization connections keep their separate accounts and permissions.")}</p>
                    {#each otherConnections as existing (existing.id)}
                      <a href={localeHref(`/app?view=servers&connection=${encodeURIComponent(existing.id)}`)}>
                        {existing.name} · {driveProviderLabel(sources.find((candidate) => candidate.id === existing.mcpID))}<ArrowRight size={14} />
                      </a>
                    {/each}
                  </div>
                {/if}
                <div class="source-actions">
                  <span
                    ><ShieldCheck size={15} />{connection
                      ? t(
                          "มีการตั้งค่าแล้ว · ตรวจบัญชีและสิทธิ์ก่อนใช้",
                          "Configured · check account and permissions before use",
                        )
                      : t(
                          "เชื่อมบัญชีและเลือกเครื่องมือก่อนใช้งาน",
                          "Connect your account and select tools before use",
                        )}</span
                  ><a
                    class="k-button"
                    href={localeHref(
                      connection
                        ? `/app?view=servers&connection=${encodeURIComponent(connection.id)}`
                        : catalogSetupHref(source.id),
                    )}
                    >{connection
                      ? t("ตั้งค่า Server", "Server settings")
                      : provider === "orca"
                        ? t("เชื่อมต่อผ่าน ORCA", "Connect with ORCA")
                        : t("เชื่อมต่อแอป", "Connect app")}<ArrowRight
                      size={15}
                    /></a
                  >
                </div>
              </div>
            </details>
          {:else}<div class="catalog-empty">
              <Search size={28} />
              <h2>{t("ไม่พบแอปที่ค้นหา", "No matching apps")}</h2>
              <button
                class="k-button"
                onclick={() => {
                  query = "";
                  category = "all";
                }}>{t("ล้างตัวกรอง", "Clear filters")}</button
              >
            </div>{/each}
        </div>
      {/if}
    {:else}
      <p class="catalog-note">
        {t(
          "เครื่องมือจากการเชื่อมต่อที่ผู้ดูแลเลือกไว้ เปิด MCP Gateway เพื่อดูสิทธิ์และวิธีเชื่อมแอป AI ของคุณ",
          "Tools selected by an administrator. Open an MCP Gateway to review access and connect your AI app.",
        )}
      </p>
      <div class="tool-list">
        {#each selectedTools as item (item.key)}
          <details class="tool-row">
            <summary
              ><Code2 size={17} /><span class="tool-copy"
                ><strong>{item.tool.name}</strong><span
                  >{item.connection.name}</span
                ></span
              ><span class="state" class:enabled={item.enabled}
                >{!item.connection.enabled
                  ? t("ระบบระงับ", "Paused")
                  : item.enabled
                    ? t("ตรวจเครื่องมือแล้ว", "Tools reviewed")
                    : t("รอตรวจสอบ", "Needs review")}</span
              ><ChevronDown size={15} /></summary
            >
            <div class="tool-detail">
              <p>
                {item.tool.description ||
                  t(
                    "เครื่องมือที่เลือกจากระบบนี้",
                    "A selected tool from this connection.",
                  )}
              </p>
              <details class="schema">
                <summary
                  >{t("ดูโครงสร้างข้อมูลที่รับ", "Input schema")}
                  <span>JSON</span></summary
                >
                <pre>{JSON.stringify(item.tool.inputSchema, null, 2)}</pre>
              </details>
              <div class="source-actions">
                <a
                  class="text-link"
                  href={localeHref(
                    `/app?view=servers&connection=${encodeURIComponent(item.connection.id)}`,
                  )}
                  >{t("การตั้งค่าและสิทธิ์", "Settings & access")}<ArrowRight
                    size={14}
                  /></a
                >{#if item.hub && item.enabled}<a
                    class="k-button primary"
                    href={localeHref(toolWorkspaceHref(item.hub.id))}
                    >{t("เปิด MCP Gateway", "Open MCP Gateway")}<ArrowRight
                      size={14}
                    /></a
                  >{:else}<a
                    class="k-button"
                    href={localeHref("/app?view=workspaces")}
                    >{t("ดู MCP Gateways", "View MCP Gateways")}<ArrowRight
                      size={14}
                    /></a
                  >{/if}
              </div>
            </div>
          </details>
        {:else}<div class="catalog-empty">
            <Code2 size={28} />
            <h2>
              {query
                ? t("ไม่พบเครื่องมือที่ค้นหา", "No matching tools")
                : t("ยังไม่ได้เลือกเครื่องมือ", "No selected tools yet")}
            </h2>
            <p>
              {t(
                "เชื่อมต่อแอป แล้วเลือกเครื่องมือที่ต้องการให้ทีมใช้งาน",
                "Connect an app, then select the tools your team needs.",
              )}
            </p>
            <a class="k-button" href={localeHref("/app?view=servers")}
              >{t("ไปที่ Servers", "Go to Servers")}<ArrowRight
                size={16}
              /></a
            >
          </div>{/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .tool-library {
    min-width: 0;
    color: var(--k-ink, #17202d);
  }
  .catalog-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 27px;
    line-height: 1.4;
    font-weight: 650;
    letter-spacing: -0.035em;
    margin: 0;
  }
  .catalog-heading p {
    margin: 6px 0 0;
    color: #73808e;
    font-size: 13px;
    line-height: 1.7;
  }
  .catalog-tabs {
    display: flex;
    gap: 24px;
    border-bottom: 1px solid #e3e7eb;
    margin-bottom: 18px;
  }
  .catalog-tabs button {
    display: flex;
    gap: 9px;
    align-items: center;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 11px 0;
    color: #79818c;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .catalog-tabs button.chosen {
    color: #19202c;
    border-bottom-color: #7c9d32;
    font-weight: 600;
  }
  .catalog-tabs span {
    background: #f0f2f4;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
  }
  .catalog-toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 16px;
  }
  .catalog-search {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 11px;
    border: 1px solid #e0e4e8;
    border-radius: 6px;
    background: white;
    color: #8a929f;
    width: min(390px, 100%);
    min-width: 0;
  }
  .catalog-search:focus-within {
    outline: 2px solid #79943e;
    outline-offset: 2px;
  }
  .catalog-search input {
    width: 100%;
    min-width: 0;
    padding: 10px 0;
    border: 0;
    outline: none;
    background: transparent;
    color: #273142;
    font: inherit;
    font-size: 12px;
    box-shadow: none;
  }
  .catalog-search button {
    display: grid;
    place-items: center;
    border: 0;
    background: none;
    color: inherit;
    padding: 3px;
    cursor: pointer;
  }
  select {
    padding: 9px 28px 9px 10px;
    border: 1px solid #e0e4e8;
    border-radius: 6px;
    background: white;
    color: #4b5666;
    font: inherit;
    font-size: 12px;
    max-width: 230px;
  }
  .result-count {
    margin-left: auto;
    color: #828b98;
    white-space: nowrap;
    font-size: 11px;
  }
  .source-list,
  .tool-list {
    border: 1px solid #e3e7eb;
    border-radius: 8px;
    overflow: clip;
    background: white;
  }
  .source-row + .source-row,
  .tool-row + .tool-row {
    border-top: 1px solid #e8ebef;
  }
  summary {
    list-style: none;
    cursor: pointer;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .source-row > summary,
  .tool-row > summary {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 15px 17px;
    min-width: 0;
  }
  .source-row > summary:hover,
  .tool-row > summary:hover {
    background: #fafbf8;
  }
  summary:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid #779a32;
    outline-offset: -2px;
  }
  .app-icon {
    width: 38px;
    height: 38px;
    border: 1px solid #eef0f2;
    border-radius: 7px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .source-copy,
  .tool-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .source-copy strong,
  .tool-copy strong {
    color: #253044;
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .source-copy > span {
    font-size: 11px;
    line-height: 1.6;
    color: #78818e;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .source-category {
    color: #89919c;
    font-size: 11px;
    flex-basis: 150px;
  }
  .source-type,
  .state {
    font-size: 10px;
    padding: 3px 7px;
    border: 1px solid #e6e9ed;
    border-radius: 4px;
    color: #73808c;
    white-space: nowrap;
  }
  .state.enabled {
    color: #526c29;
    background: #f0f7e5;
    border-color: #e0eaca;
  }
  .saved-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #82a63f;
    flex-shrink: 0;
  }
  .source-row > summary > :global(svg),
  .tool-row > summary > :global(svg) {
    color: #8c94a0;
    flex-shrink: 0;
  }
  .source-row[open] > summary > :global(svg:last-child),
  .tool-row[open] > summary > :global(svg:last-child) {
    transform: rotate(180deg);
  }
  .source-detail,
  .tool-detail {
    padding: 2px 18px 18px 69px;
    background: #fcfdfa;
  }
  .source-detail > p,
  .tool-detail > p {
    font-size: 12px;
    color: #6c7684;
    margin: 0 0 16px;
    line-height: 1.7;
  }
  .source-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .existing-provider-connections {
    border-top: 1px solid #e6e9e1;
    padding-top: 12px;
    margin-bottom: 16px;
    font-size: 12px;
    color: #6c7684;
  }
  .existing-provider-connections p {
    margin: 0 0 8px;
  }
  .existing-provider-connections a {
    display: flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    margin-top: 6px;
    color: #51662d;
    overflow-wrap: anywhere;
  }
  .source-actions > span {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: #778370;
  }
  .text-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #637835;
  }
  .catalog-note {
    font-size: 12px;
    line-height: 1.7;
    color: #7b8592;
    margin: 0 0 15px;
  }
  .tool-copy strong {
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .tool-copy > span {
    color: #85909c;
    font-size: 11px;
  }
  .tool-detail {
    padding-left: 48px;
  }
  .schema {
    margin: 14px 0;
    border: 1px solid #e4e8ee;
    border-radius: 6px;
    background: white;
  }
  .schema summary {
    padding: 10px 12px;
    font-size: 11px;
    display: flex;
    justify-content: space-between;
  }
  .schema summary span {
    color: #8b929f;
    font-family: monospace;
  }
  pre {
    margin: 0;
    padding: 12px;
    background: #f7f8fa;
    color: #3c4859;
    font-size: 11px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .catalog-empty {
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 13px;
    color: #7c8794;
    padding: 24px;
  }
  .catalog-empty h2 {
    font-size: 18px;
    color: #2a3543;
    margin: 0;
  }
  .catalog-empty p {
    font-size: 13px;
    max-width: 450px;
    margin: 0;
    line-height: 1.7;
  }
  @media (max-width: 1000px) {
    .source-category {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .catalog-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
    }
    h1 {
      font-size: 24px;
    }
    .catalog-toolbar {
      flex-wrap: wrap;
    }
    .catalog-search {
      width: 100%;
    }
    .source-row > summary,
    .tool-row > summary {
      padding: 13px 11px;
      gap: 9px;
    }
    .source-type {
      display: none;
    }
    .source-detail,
    .tool-detail {
      padding: 8px 14px 16px;
    }
    .source-actions {
      align-items: flex-start;
      flex-direction: column;
    }
    .catalog-tabs {
      gap: 18px;
    }
    .state {
      font-size: 9px;
    }
  }
</style>
