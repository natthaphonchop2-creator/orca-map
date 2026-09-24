<script lang="ts">
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import ConnectionSetupDialog from "./ConnectionSetupDialog.svelte";
  import {
    catalogSetupHref,
    catalogDirectory,
    catalogSetupState,
    filterCatalog,
    googleDriveProvider,
    groupCatalog,
    popularCatalog,
    starterCatalog,
    type CatalogTool,
  } from "$lib/orca/catalog";
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
    CircleCheck,
    CirclePlus,
    Code2,
    Info,
    LoaderCircle,
    Search,
    ShieldCheck,
    Layers3,
    X,
  } from "@lucide/svelte";
  import { onMount, onDestroy, tick } from "svelte";

  let { data, onchanged = async () => {} }: { data: OrcaBootstrap; onchanged?: () => Promise<void> } = $props();
  let setupSourceID = $state<string | null>(null);
  let sources = $state<OrcaCandidate[]>([]);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let category = $state("all");
  let protocol = $state<"all" | "MCP" | "API">("all");
  let tab = $state<"apps" | "tools" | "guides">("apps");
  let generation = 0;
  let catalogToolbar = $state<HTMLDivElement>();
  const directory = $derived(filterCatalog(data.canManage ? catalogDirectory(sources) : sources));
  const allSources = $derived(directory.filter((source) => !source.guideOnly));
  const guideSources = $derived(directory.filter((source) => source.guideOnly));
  const activeSources = $derived(tab === "guides" ? guideSources : allSources);
  const protocolSources = $derived(activeSources.filter((source) => protocol === "all" || source.protocol === protocol));
  const matches = $derived(filterCatalog(protocolSources, query, category));
  const groupedMatches = $derived(groupCatalog(matches));
  const popular = $derived(popularCatalog(allSources, data));
  const starters = $derived(starterCatalog(allSources));
  const isOverview = $derived(tab === "apps" && category === "all" && protocol === "all" && !query.trim());
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
      protocolSources.some((source) => source.categoryId === group.id),
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
  function changeTab(next: "apps" | "tools" | "guides") {
    tab = next;
    query = "";
    category = "all";
    protocol = "all";
  }
  async function changeCategory(next: string) {
    category = next;
    await tick();
    catalogToolbar?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function otherDriveConnections(source: OrcaCandidate) {
    if (!googleDriveProvider(source)) return [];
    const relatedIDs = new Set(
      sources
        .filter(
          (candidate) =>
            candidate.id !== source.id && googleDriveProvider(candidate),
        )
        .map((candidate) => candidate.id),
    );
    return data.connections.filter(
      (connection) =>
        relatedIDs.has(connection.mcpID) &&
        !connection.archivedAt &&
        !connection.deletedAt,
    );
  }
  function sourceConnection(source: CatalogTool) {
    return data.connections.find(
      (connection) =>
        connection.mcpID === source.id &&
        !connection.archivedAt &&
        !connection.deletedAt,
    );
  }
  function sourceHref(source: CatalogTool) {
    if (source.guideOnly) return localeHref("/app?view=servers&add=source");
    const connection = sourceConnection(source);
    return localeHref(
      connection
        ? `/app?view=servers&connection=${encodeURIComponent(connection.id)}`
        : catalogSetupHref(source.id),
    );
  }
  function openSetup(source: CatalogTool) {
    if (!source.guideOnly && catalogSetupState(source).canStart) setupSourceID = source.id;
  }
  async function setupCompleted() {
    await onchanged();
    setupSourceID = null;
    await load();
  }
  function driveProviderLabel(source?: OrcaCandidate) {
    const provider = source && googleDriveProvider(source);
    return provider === "orca"
      ? "ORCA"
      : provider === "google"
        ? "Google"
        : provider === "obot"
          ? "Obot"
          : "";
  }
  onMount(() => {
    void load();
  });
  onDestroy(() => {
    generation += 1;
  });
</script>

{#snippet authBadges(source: CatalogTool)}
  <span class="auth-tags" aria-label={t("วิธีเชื่อมต่อ", "Connection methods")}>
    {#each source.authTags as tag (tag.id)}
      <span
        class="k-badge auth-tag"
        title={t(tag.descriptionTh, tag.descriptionEn)}
      >{t(tag.labelTh, tag.label)}</span>
    {/each}
  </span>
{/snippet}

{#snippet sourceRow(source: CatalogTool)}
  {@const connection = sourceConnection(source)}
  {@const readiness = catalogSetupState(source)}
  {@const otherConnections = otherDriveConnections(source)}
  {@const provider = googleDriveProvider(source)}
  <details class="source-row">
    <summary
      ><span class="app-icon"><CatalogIcon name={source.name} size={24} /></span
      ><span class="source-copy"
        ><strong>{source.name}</strong><span class="source-description"
          >{t(
            source.descriptionTh,
            source.descriptionEn || source.description || source.descriptionTh,
          )}</span
      >{@render authBadges(source)}{#if readiness.label}<span class="k-badge setup-status" class:paused={readiness.kind === "admin_setup_required"}>{t(readiness.labelTh, readiness.label)}</span>{/if}</span
      ><span class="k-badge source-type">{source.protocol}</span>{#if connection}<span
          class="saved-mark"
          title={t("ตั้งค่าไว้ในองค์กรแล้ว", "Already set up in your organization")}
        ><CircleCheck size={16} aria-hidden="true" /></span>{/if}<ChevronDown class="row-chevron" size={16} aria-hidden="true" /></summary
    >
    <div class="source-detail">
      {#if source.reference || provider}
        <details class="integration-guide">
          <summary>{t("วิธีตั้งค่า", "Setup help")}<ChevronDown size={16} aria-hidden="true" /></summary>
          <div class="integration-guide-body">
            {#if source.reference}
            <p class="integration-scope">{t(source.reference.scope[0], source.reference.scope[1])}</p>
            <ol>{#each source.reference.requirements as step}<li>{t(step[0], step[1])}</li>{/each}</ol>
            <div class="documentation-links">{#each source.reference.docs as doc}<a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.label}<ArrowRight size={14} aria-hidden="true" /></a>{/each}</div>
            <small>{t("ตรวจสอบกับเอกสารของผู้ให้บริการ", "Checked against provider documentation")} · {source.reference.checkedOn}</small>
            {/if}
      {#if provider}<p class="source-provider-copy">
          {provider === "orca"
            ? t(
                "ORCA ให้บริการตัวเชื่อม และจัดการการลงชื่อเข้าใช้ด้วยบัญชี Google (OAuth) สำหรับ Google Drive API",
                "ORCA hosts the connector and manages Google sign-in (OAuth) for the Google Drive API.",
              )
            : provider === "obot"
              ? t(
                  "การเชื่อมต่อนี้ใช้บริการของ Obot",
                  "This connection uses Obot’s service.",
                )
              : t(
                  "การเชื่อมต่อนี้ใช้บริการ Google Drive ของ Google",
                  "This connection uses Google’s Google Drive service.",
                )}
        </p>{/if}
          </div>
        </details>
      {/if}
      {#if otherConnections.length}
        <div class="existing-provider-connections">
          <p>
            {t(
              "ระบบอื่นที่องค์กรเชื่อมต่อไว้",
              "Other connected systems in your organization",
            )}
          </p>
          {#each otherConnections as existing (existing.id)}
            <a
              href={localeHref(
                `/app?view=servers&connection=${encodeURIComponent(existing.id)}`,
              )}
            >
              {existing.name} · {driveProviderLabel(
                sources.find((candidate) => candidate.id === existing.mcpID),
              )}<ArrowRight size={14} aria-hidden="true" />
            </a>
          {/each}
        </div>
      {/if}
      {#if !source.guideOnly}<div class="source-actions">
        {#if connection}<a
          class="k-button"
          href={sourceHref(source)}
          >{t("ตั้งค่าระบบ", "System settings")}<ArrowRight size={16} aria-hidden="true" /></a>
        {:else}<button type="button" class="k-button" disabled={!readiness.canStart} onclick={() => openSetup(source)}>
          {t(readiness.actionTh, readiness.action)}{#if readiness.canStart}<ArrowRight size={16} aria-hidden="true" />{/if}
        </button>{/if}
      </div>
      {:else}<div class="source-actions guide-actions">
        <span>{t("ต้องมี URL ของ MCP ที่ใช้งานได้อยู่แล้ว", "Requires a working MCP URL.")}</span>
        <a class="k-button" href={sourceHref(source)}>{source.protocol === "API"
          ? t("เชื่อมต่อผ่านตัวเชื่อม MCP ขององค์กร", "Connect through your MCP adapter")
          : t("เพิ่มระบบด้วย MCP URL", "Add a system with an MCP URL")}<ArrowRight size={16} aria-hidden="true" /></a>
      </div>{/if}
    </div>
  </details>
{/snippet}

<section class="tool-library" aria-label={t("คลังระบบ", "System catalog")}>
  <header class="catalog-heading">
    <div>
      <h1>{t("เพิ่มระบบใหม่", "Add a system")}</h1>
    </div>
    {#if data.canManage}<a
        class="k-button"
        href={localeHref("/app?view=servers&add=source")}
        ><CirclePlus size={16} aria-hidden="true" />{t("เพิ่มระบบด้วย MCP URL", "Add a system with an MCP URL")}</a
      >{/if}
  </header>
  {#if !data.canManage}
    <div class="catalog-empty catalog-panel">
      <ShieldCheck size={28} aria-hidden="true" />
      <h2>{t("ระบบและเครื่องมือของทีม", "Your team’s systems and tools")}</h2>
      <p>
        {t(
          "ผู้ดูแลระบบเป็นผู้เลือกระบบและกำหนดสิทธิ์ ดูเครื่องมือและลิงก์เชื่อม AI ได้ในพื้นที่ทำงาน AI ที่คุณเป็นสมาชิก",
          "Your administrator selects systems and access. View your tools and AI connection link in the AI workspaces you belong to.",
        )}
      </p>
      <a class="k-button small" href={localeHref("/app?view=workspaces")}
        >{t("ดูพื้นที่ทำงาน AI", "View AI workspaces")}<ArrowRight
          size={16}
          aria-hidden="true"
        /></a
      >
    </div>
  {:else}
    <nav
      class="catalog-tabs"
      aria-label={t("มุมมองคลังระบบ", "Catalog view")}
    >
      <button
        class:chosen={tab === "apps"}
        aria-pressed={tab === "apps"}
        onclick={() => changeTab("apps")}
        >{t("ระบบที่เพิ่มได้", "Available systems")}<span
          >{loading ? "…" : allSources.length}</span
        ></button
      >
      <button
        class:chosen={tab === "tools"}
        aria-pressed={tab === "tools"}
        onclick={() => changeTab("tools")}
        >{t("เครื่องมือที่อนุญาต", "Allowed tools")}<span
          >{inventory.length}</span
        ></button
      >
      <button
        class:chosen={tab === "guides"}
        aria-pressed={tab === "guides"}
        onclick={() => changeTab("guides")}
        >{t("คู่มือการเชื่อมต่อเพิ่มเติม", "Other connection guides")}<span>{loading ? "…" : guideSources.length}</span></button>
    </nav>
    <div class="catalog-toolbar" bind:this={catalogToolbar}>
      <div class="catalog-search">
        <Search size={16} aria-hidden="true" /><input
          type="search"
          bind:value={query}
          aria-label={t("ค้นหาในคลังระบบ", "Search the catalog")}
          placeholder={tab !== "tools"
            ? t("ค้นหาระบบตามชื่อหรือประเภทงาน…", "Search systems by name or type of work…")
            : t("ค้นหาชื่อเครื่องมือหรือระบบ…", "Search tools or systems…")}
        />{#if query}<button
            onclick={() => (query = "")}
            aria-label={t("ล้างคำค้น", "Clear search")}
            title={t("ล้างคำค้น", "Clear search")}><X size={16} aria-hidden="true" /></button
          >{/if}
      </div>
      {#if tab !== "tools"}
        <div class="protocol-group">
          <details class="auth-legend">
            <summary><Info size={16} aria-hidden="true" />{t("วิธีเชื่อมต่อ", "Connection methods")}</summary>
            <p>
            <strong>OAuth</strong> {t("ลงชื่อเข้าใช้ด้วยบัญชีของระบบนั้น", "Sign in with that system’s account")}
            <span aria-hidden="true">·</span>
            <strong>{t("คีย์หรือโทเคน", "Secrets")}</strong> {t("ใช้คีย์ API หรือโทเคน", "Use an API key or token")}
            </p>
          </details>
          <div class="protocol-filter" role="group" aria-label={t("รูปแบบการเชื่อมต่อ", "Connection protocol")}>
            {#each ["all", "MCP", "API"] as option}
              <button type="button" class:chosen={protocol === option} aria-pressed={protocol === option} onclick={() => { protocol = option as typeof protocol; category = "all"; }}>
                {option === "all" ? t("ทั้งหมด", "All") : option}
                <span>{option === "all" ? activeSources.length : activeSources.filter((source) => source.protocol === option).length}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <span class="result-count" role="status"
        >{tab !== "tools" ? matches.length : selectedTools.length}
        {t("รายการ", "results")}</span
      >
    </div>
    {#if tab !== "tools"}
      {#if loading}<div class="catalog-empty catalog-panel" role="status">
          <LoaderCircle class="k-spin" size={20} aria-hidden="true" />{t(
            "กำลังโหลดคลังระบบ…",
            "Loading the catalog…",
          )}
        </div>
      {:else if error}<div class="catalog-empty catalog-panel" role="alert">
          <Info size={24} aria-hidden="true" />
          <h2>
            {t("โหลดคลังระบบไม่สำเร็จ", "The system catalog could not be loaded")}
          </h2>
          <p>{error}</p>
          <button class="k-button small" onclick={load}
            >{t("ลองอีกครั้ง", "Try again")}</button
          >
        </div>
      {:else}
        <div class="catalog-layout">
          <nav
            class="category-nav"
            aria-label={t("หมวดงาน", "Work categories")}
          >
            <span class="category-label"
              >{t("เลือกตามประเภทงาน", "Browse by type of work")}</span
            >
            <button
              class:chosen={category === "all"}
              aria-pressed={category === "all"}
              onclick={() => changeCategory("all")}
            >
              <span>{t("ทุกหมวดงาน", "All categories")}</span><span
                class="category-count">{protocolSources.length}</span
              >
            </button>
            {#each groups as group (group.id)}
              <button
                class:chosen={category === group.id}
                aria-pressed={category === group.id}
                onclick={() => changeCategory(group.id)}
              >
                <span>{t(group.th, group.en)}</span><span class="category-count"
                  >{protocolSources.filter(
                    (source) => source.categoryId === group.id,
                  ).length}</span
                >
              </button>
            {/each}
          </nav>
          <div class="catalog-content">
            {#if isOverview}
              <section class="popular-section" aria-labelledby="popular-title">
                <header class="section-heading">
                  <div>
                    <h2 id="popular-title">
                      {t(
                        "ใช้มากที่สุดในองค์กร",
                        "Most used in your organization",
                      )}
                    </h2>
                  </div>
                </header>
                {#if popular.length}
                  <div class="highlight-grid">
                    {#each popular as item (item.source.id)}
                      <a
                        class="highlight-card popular-card"
                        href={sourceHref(item.source)}
                      >
                        <span class="highlight-icon"
                          ><CatalogIcon
                            name={item.source.name}
                            size={24}
                          /></span
                        >
                        <strong>{item.source.name}</strong>
                        {@render authBadges(item.source)}
                        <span class="adoption-count"
                          >{item.gatewayCount}
                          {t("พื้นที่ทำงาน AI ที่เปิดใช้งาน", item.gatewayCount === 1 ? "active AI workspace" : "active AI workspaces")}</span
                        >
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    {/each}
                  </div>
                {:else}
                  <div class="popular-empty">
                    <Layers3 size={16} aria-hidden="true" />
                    <p>
                      {t(
                        "ยังไม่มีพื้นที่ทำงาน AI ที่เปิดใช้งาน",
                        "No active AI workspaces yet.",
                      )}
                    </p>
                  </div>
                {/if}
              </section>
              {#if starters.length}
                <section
                  class="starter-section"
                  aria-labelledby="starter-title"
                >
                  <header class="section-heading">
                    <div>
                      <h2 id="starter-title">
                        {t("ระบบที่แนะนำสำหรับเริ่มต้น", "Recommended systems to start with")}
                      </h2>
                    </div>
                  </header>
                  <div class="highlight-grid">
                    {#each starters as source (source.id)}
                      <a class="highlight-card" href={sourceHref(source)}>
                        <span class="highlight-icon"
                          ><CatalogIcon name={source.name} size={24} /></span
                        >
                        <strong>{source.name}</strong>
                        {@render authBadges(source)}
                        <span
                          >{t(
                            source.descriptionTh,
                            source.descriptionEn ||
                              source.description ||
                              source.descriptionTh,
                          )}</span
                        >
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    {/each}
                  </div>
                </section>
              {/if}
            {/if}
            {#each groupedMatches as group (group.id)}
              <section
                class="category-section"
                aria-labelledby={`catalog-${group.id}`}
              >
                <header class="section-heading">
                  <h2 id={`catalog-${group.id}`}>
                    {t(group.th, group.en)}<span class="section-count"
                      >{group.sources.length}</span
                    >
                  </h2>
                </header>
                <div class="source-list">
                  {#each group.sources as source (source.id)}{@render sourceRow(
                      source,
                    )}{/each}
                </div>
              </section>
            {:else}
              <div class="catalog-empty catalog-panel">
                <Search size={24} aria-hidden="true" />
                <h2>{t("ไม่พบระบบที่ค้นหา", "No matching systems")}</h2>
                <button
                  class="k-button small"
                  onclick={() => {
                    query = "";
                    category = "all";
                    protocol = "all";
                  }}>{t("ล้างตัวกรอง", "Clear filters")}</button
                >
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <div class="tool-list">
        {#each selectedTools as item (item.key)}
          <details class="tool-row">
            <summary
              ><span class="tool-icon" aria-hidden="true"><Code2 size={16} /></span><span class="tool-copy"
                ><strong>{item.tool.name}</strong><span
                  >{item.connection.name}</span
                ></span
              ><span
                class="k-badge state"
                class:active={item.connection.enabled && item.enabled}
                class:paused={!item.connection.enabled || !item.enabled}
                >{!item.connection.enabled
                  ? t("ระบบถูกระงับ", "System paused")
                  : item.enabled
                    ? t("ตรวจสอบแล้ว", "Reviewed")
                    : t("รอตรวจสอบ", "Needs review")}</span
              ><ChevronDown class="row-chevron" size={16} aria-hidden="true" /></summary
            >
            <div class="tool-detail">
              <p>
                {item.tool.description ||
                  t(
                    "เครื่องมือที่อนุญาตจากระบบนี้",
                    "An allowed tool from this system.",
                  )}
              </p>
              <details class="schema">
                <summary
                  >{t("ดูข้อมูลที่เครื่องมือต้องใช้ (Input schema)", "View input schema")}
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
                  >{t("การตั้งค่าระบบและสิทธิ์", "System settings and access")}<ArrowRight
                    size={14}
                    aria-hidden="true"
                  /></a
                >{#if item.hub && item.enabled}<a
                    class="k-button primary"
                    href={localeHref(toolWorkspaceHref(item.hub.id))}
                    >{t("เปิดพื้นที่ทำงาน AI", "Open AI workspace")}<ArrowRight
                      size={16}
                      aria-hidden="true"
                    /></a
                  >{:else}<a
                    class="k-button"
                    href={localeHref("/app?view=workspaces")}
                    >{t("ดูพื้นที่ทำงาน AI", "View AI workspaces")}<ArrowRight
                      size={16}
                      aria-hidden="true"
                    /></a
                  >{/if}
              </div>
            </div>
          </details>
        {:else}<div class="catalog-empty">
            <Code2 size={24} aria-hidden="true" />
            <h2>
              {query
                ? t("ไม่พบเครื่องมือที่ค้นหา", "No matching tools")
                : t("ยังไม่มีเครื่องมือที่อนุญาต", "No allowed tools yet")}
            </h2>
            <p>
              {t(
                "เชื่อมต่อระบบ แล้วเลือกเครื่องมือที่อนุญาตให้ทีมใช้งาน",
                "Connect a system, then choose the tools your team may use.",
              )}
            </p>
            <a class="k-button small" href={localeHref("/app?view=servers")}
              >{t("ไปที่ระบบที่เชื่อมต่อ", "Go to connected systems")}<ArrowRight size={16} aria-hidden="true" /></a
            >
          </div>{/each}
      </div>
    {/if}
  {/if}
</section>

{#if setupSourceID !== null}
  <ConnectionSetupDialog {data} initialSourceID={setupSourceID} onclose={() => setupSourceID = null} oncompleted={setupCompleted} />
{/if}

<style>
  .tool-library {
    min-width: 0;
    color: var(--orca-ink);
  }
  .catalog-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px 24px;
    margin-bottom: 20px;
  }
  .catalog-heading h1 {
    margin: 0;
  }
  .catalog-heading > :global(.k-button) {
    flex: none;
  }
  /* Page tabs: underline, ink when selected. */
  .catalog-tabs {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--orca-line);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .catalog-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: -1px;
    padding: 10px 0 11px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--orca-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .catalog-tabs button:hover {
    color: var(--orca-ink);
  }
  .catalog-tabs button.chosen {
    border-bottom-color: var(--orca-ink);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .catalog-tabs span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    padding: 0 6px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  /* Toolbar: search, then the protocol filter with its label, then the count. */
  .catalog-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    margin-bottom: 16px;
    scroll-margin-top: 76px;
  }
  .catalog-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(360px, 100%);
    height: 36px;
    padding: 0 11px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-subtle);
  }
  .catalog-search:focus-within {
    border-color: var(--orca-ink);
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .catalog-search :global(svg) {
    flex: none;
  }
  .catalog-search input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
    box-shadow: none;
  }
  .catalog-search input::placeholder {
    color: var(--orca-subtle);
  }
  .catalog-search input:focus-visible {
    outline: none;
  }
  /* The field has its own clear button, so the browser's is hidden. */
  .catalog-search input::-webkit-search-cancel-button {
    display: none;
    -webkit-appearance: none;
  }
  .catalog-search button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-right: -6px;
    border: 0;
    border-radius: var(--orca-radius-sm);
    background: none;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .catalog-search button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .protocol-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }
  .auth-legend {
    position: relative;
  }
  .auth-legend summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    color: var(--orca-muted);
    font-size: 13.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .auth-legend summary :global(svg) {
    color: var(--orca-subtle);
  }
  .auth-legend summary:hover,
  .auth-legend[open] summary {
    color: var(--orca-ink);
  }
  .auth-legend p {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 5;
    width: max-content;
    max-width: min(360px, calc(100vw - 32px));
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    box-shadow: var(--orca-popover-shadow);
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  .auth-legend strong {
    color: var(--orca-ink);
    font-weight: 600;
  }
  .auth-legend p > span {
    margin: 0 4px;
  }
  .protocol-filter {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .protocol-filter button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 11px;
    border: 0;
    border-radius: var(--orca-radius-sm);
    background: transparent;
    color: var(--orca-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .protocol-filter button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .protocol-filter button.chosen {
    background: var(--orca-secondary);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .protocol-filter button span {
    color: var(--orca-subtle);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .result-count {
    margin-left: auto;
    color: var(--orca-muted);
    font-size: 13px;
    white-space: nowrap;
  }
  /* Layout: category list on the left, results on the right. */
  .catalog-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }
  .category-nav {
    position: sticky;
    top: 80px;
    display: grid;
    gap: 1px;
  }
  .category-label {
    padding: 4px 10px 8px;
    color: var(--orca-subtle);
    font-size: 12px;
    font-weight: 500;
  }
  .category-nav button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-nav);
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  .category-nav button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .category-nav button.chosen {
    background: var(--orca-secondary);
    color: var(--orca-ink);
    font-weight: 600;
  }
  .category-count {
    color: var(--orca-subtle);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .catalog-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    min-width: 0;
  }
  .section-heading {
    margin-bottom: 12px;
  }
  .section-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .section-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    padding: 0 6px;
    border-radius: var(--orca-radius-sm);
    background: var(--orca-secondary);
    color: var(--orca-nav);
    font-size: 12px;
    font-weight: 500;
  }
  /* Highlight cards: white, bordered, no tint. */
  .highlight-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .highlight-card {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 4px 12px;
    padding: 14px 16px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-ink);
    text-decoration: none;
    transition: border-color 0.12s;
  }
  .highlight-card:hover {
    border-color: var(--orca-line-strong);
  }
  .highlight-icon {
    display: grid;
    place-items: center;
    grid-row: 1 / 4;
    align-self: start;
    width: 36px;
    height: 36px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .highlight-card strong {
    grid-column: 2;
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .highlight-card > :global(.auth-tags) {
    grid-column: 2;
  }
  .highlight-card > span:not(.highlight-icon):not(.auth-tags) {
    grid-column: 2;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.55;
  }
  .highlight-card > :global(svg) {
    grid-column: 3;
    grid-row: 1 / 4;
    color: var(--orca-subtle);
  }
  .popular-empty {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border: 1px dashed var(--orca-line-strong);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-subtle);
  }
  .popular-empty :global(svg) {
    flex-shrink: 0;
  }
  .popular-empty p {
    margin: 0;
    color: var(--orca-muted);
    font-size: 13.5px;
  }
  /* Result rows */
  .source-list,
  .tool-list {
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    overflow: clip;
  }
  .source-row + .source-row,
  .tool-row + .tool-row {
    border-top: 1px solid #eff0f2;
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
    gap: 12px;
    min-width: 0;
    padding: 12px 16px;
  }
  .source-row > summary:hover,
  .tool-row > summary:hover {
    background: var(--orca-surface-2);
  }
  summary:focus-visible,
  .source-actions a:focus-visible,
  .category-nav button:focus-visible,
  .catalog-tabs button:focus-visible {
    outline: 2px solid var(--orca-ink);
    outline-offset: -2px;
  }
  .app-icon,
  .tool-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .tool-icon {
    width: 32px;
    height: 32px;
    border: 0;
    background: var(--orca-secondary);
    color: var(--orca-nav);
  }
  /* Name, badges, then the description on its own line. */
  .source-copy {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    min-width: 0;
  }
  .source-copy strong,
  .tool-copy strong {
    color: var(--orca-ink);
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .source-copy :global(.auth-tags) {
    order: 1;
  }
  .setup-status {
    order: 2;
  }
  .source-description {
    order: 3;
    flex-basis: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.55;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-row[open] .source-description {
    white-space: normal;
  }
  .auth-tags {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .source-type {
    flex-shrink: 0;
  }
  .saved-mark {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: var(--orca-ok);
  }
  .source-row > summary > :global(.row-chevron),
  .tool-row > summary > :global(.row-chevron) {
    flex-shrink: 0;
    color: var(--orca-subtle);
  }
  .source-row[open] > summary > :global(.row-chevron),
  .tool-row[open] > summary > :global(.row-chevron) {
    transform: rotate(180deg);
  }
  .source-detail,
  .tool-detail {
    padding: 4px 16px 16px 64px;
    border-top: 1px solid #eff0f2;
    background: var(--orca-surface-2);
  }
  .tool-detail {
    padding-left: 60px;
  }
  .source-detail > :first-child,
  .tool-detail > :first-child {
    margin-top: 12px;
  }
  .integration-guide {
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .integration-guide > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
    padding: 8px 14px;
    color: var(--orca-muted);
    font-size: 13.5px;
    font-weight: 500;
  }
  .integration-guide > summary:hover {
    color: var(--orca-ink);
  }
  .integration-guide > summary > :global(svg) {
    flex-shrink: 0;
    color: var(--orca-subtle);
  }
  .integration-guide[open] > summary > :global(svg) {
    transform: rotate(180deg);
  }
  .integration-guide-body {
    padding: 2px 14px 14px;
    font-size: 13.5px;
  }
  .integration-scope,
  .source-provider-copy {
    margin: 0 0 10px;
    line-height: 1.7;
  }
  .source-provider-copy {
    color: var(--orca-muted);
  }
  .integration-guide ol {
    display: grid;
    gap: 6px;
    margin: 0;
    padding-left: 22px;
    line-height: 1.7;
  }
  .documentation-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 12px;
  }
  .documentation-links a,
  .existing-provider-connections a,
  .text-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--orca-ink);
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .integration-guide small {
    display: block;
    margin-top: 12px;
    color: var(--orca-subtle);
    font-size: 12px;
  }
  .existing-provider-connections {
    margin-top: 12px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .existing-provider-connections p {
    margin: 0 0 6px;
  }
  .existing-provider-connections a {
    display: flex;
    width: fit-content;
    margin-top: 4px;
    overflow-wrap: anywhere;
  }
  .source-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--orca-line);
  }
  .source-actions > a:not(.text-link),
  .source-actions > button {
    flex-shrink: 0;
    margin-left: auto;
  }
  .source-actions button:disabled {
    cursor: not-allowed;
  }
  .guide-actions > span {
    flex: 1 1 280px;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  /* Allowed tools tab */
  .tool-copy {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }
  .tool-copy strong {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    font-weight: 500;
  }
  .tool-copy > span {
    color: var(--orca-muted);
    font-size: 13px;
  }
  .tool-detail > p {
    margin: 12px 0;
    color: var(--orca-muted);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .schema {
    margin: 12px 0 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  .schema summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .schema summary:hover {
    color: var(--orca-ink);
  }
  .schema summary span {
    color: var(--orca-subtle);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  pre {
    margin: 0;
    padding: 10px 12px;
    border-top: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
    color: var(--orca-nav);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* Empty, loading and error states */
  .catalog-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 200px;
    padding: 32px 24px;
    color: var(--orca-subtle);
    font-size: 14px;
    text-align: center;
  }
  .catalog-panel {
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
  }
  .catalog-empty h2 {
    margin: 4px 0 0;
    color: var(--orca-ink);
    font-size: 15px;
    font-weight: 600;
  }
  .catalog-empty p {
    max-width: 460px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .catalog-empty > :global(.k-button) {
    margin-top: 8px;
  }
  @media (max-width: 1100px) {
    .catalog-layout {
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 20px;
    }
  }
  @media (max-width: 800px) {
    .catalog-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .category-nav {
      position: static;
      display: flex;
      gap: 6px;
      padding-bottom: 4px;
      overflow-x: auto;
    }
    .category-label {
      display: none;
    }
    .category-nav button {
      flex: 0 0 auto;
      min-height: 32px;
      border: 1px solid var(--orca-line);
      background: var(--orca-surface);
      white-space: nowrap;
    }
    .category-nav button.chosen {
      border-color: var(--orca-line-strong);
      background: var(--orca-secondary);
    }
  }
  @media (max-width: 760px) {
    .catalog-heading {
      flex-direction: column;
    }
    .catalog-heading > :global(.k-button) {
      width: 100%;
    }
    .catalog-search {
      width: 100%;
    }
    .source-row > summary,
    .tool-row > summary {
      padding: 12px;
      gap: 10px;
    }
    .source-detail,
    .tool-detail {
      padding: 4px 12px 14px;
    }
    .source-actions {
      flex-direction: column;
      align-items: stretch;
    }
    .source-actions > a:not(.text-link),
    .source-actions > button {
      justify-content: center;
      margin-left: 0;
    }
    .guide-actions > span {
      flex-basis: auto;
    }
    .catalog-tabs {
      gap: 20px;
    }
  }
  @media (max-width: 560px) {
    .highlight-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .catalog-content {
      gap: 24px;
    }
  }
</style>
