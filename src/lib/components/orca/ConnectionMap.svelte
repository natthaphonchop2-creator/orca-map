<script lang="ts">
  import CatalogIcon from "$lib/orca/CatalogIcon.svelte";
  import ToolIcon, { type ToolName } from "$lib/orca/ToolIcon.svelte";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import type { OrcaConnection } from "$lib/services/orca";
  import { ArrowRight, Folder, Plug, ShieldCheck } from "@lucide/svelte";
  import Brand from "./Brand.svelte";

  let {
    connections,
    expanded = false,
    sourceNames = {},
  }: {
    connections: OrcaConnection[];
    expanded?: boolean;
    sourceNames?: Record<string, string>;
  } = $props();
  const clients: { name: ToolName; label: string; company: string }[] = [
    { name: "claude", label: "Claude", company: "Anthropic" },
    { name: "chatgpt", label: "ChatGPT", company: "OpenAI" },
    { name: "cursor", label: "Cursor", company: "Anysphere" },
  ];
  const visibleSources = $derived(
    expanded ? connections : connections.slice(0, 3),
  );
</script>

<section
  class="connection-map"
  class:expanded
  aria-label={t("แผนผังการเชื่อมต่อ", "Connection map")}
>
  <div class="map-column map-sources">
    <div class="map-column-heading">
      <h2>{t("ระบบขององค์กร", "Company systems")}</h2>
      <p>{t("ข้อมูลและเครื่องมือภายใน", "Your internal data and tools")}</p>
    </div>
    <div class="map-node-list">
      {#each visibleSources as connection (connection.id)}
        <a
          class="map-source"
          href={localeHref(
            `/app?view=servers&connection=${encodeURIComponent(connection.id)}`,
          )}
        >
          <CatalogIcon
            name={sourceNames[connection.mcpID] || connection.name}
            size={38}
          />
          <span
            ><strong>{connection.name}</strong><small
              >{connection.description ||
                t("การเชื่อมต่อที่บันทึกไว้", "Saved connection")}</small
            ></span
          >
        </a>
      {:else}
        <div class="map-empty">
          <Plug size={26} /><strong
            >{t("ยังไม่มีการเชื่อมต่อ", "No connections yet")}</strong
          >
          <p>
            {t(
              "เพิ่มระบบที่องค์กรใช้งานเพื่อเริ่มต้น",
              "Add a company system to get started.",
            )}
          </p>
        </div>
      {/each}
    </div>
    {#if !expanded && connections.length > 3}<p class="map-count">
        +{connections.length - 3}
        {t("ระบบเพิ่มเติม", "more systems")}
      </p>{/if}
  </div>
  <div class="map-connector map-connector-in" aria-hidden="true">
    <svg viewBox="0 0 120 200" preserveAspectRatio="none"
      ><path
        d="M0 25 H32 Q52 25 52 48 V77 Q52 98 76 98 H113 M0 100 H113 M0 175 H32 Q52 175 52 153 V120 Q52 101 76 101 H113"
      /><path d="m106 91 8 8-8 8" /></svg
    >
  </div>
  <div class="map-governance">
    <Brand dark />
    <p>
      <ShieldCheck size={18} />{t(
        "สิทธิ์ · เครื่องมือ · กิจกรรม",
        "Permissions · Tools · Activity",
      )}
    </p>
    <span>{t("กำหนดสิทธิ์ผ่าน ORCA", "ORCA access control")}</span>
  </div>
  <div class="map-connector map-connector-out" aria-hidden="true">
    <svg viewBox="0 0 120 200" preserveAspectRatio="none"
      ><path
        d="M0 98 H32 Q52 98 52 77 V48 Q52 25 76 25 H113 M0 100 H113 M0 101 H32 Q52 101 52 120 V153 Q52 175 76 175 H113"
      /><path d="m106 18 8 7-8 7 M106 93 l8 7-8 7 M106 168 l8 7-8 7" /></svg
    >
  </div>
  <div class="map-column map-clients">
    <div class="map-column-heading">
      <h2>{t("ตั้งค่าแอป AI", "AI app setup")}</h2>
      <p>
        {t("เลือกวิธีเชื่อมในพื้นที่ทำงาน", "Choose a setup in a workspace")}
      </p>
    </div>
    <div class="map-node-list">
      {#each clients as client}
        <a class="map-client" href={localeHref("/app?view=workspaces")}
          ><ToolIcon name={client.name} size={36} decorative /><span
            ><strong>{client.label}</strong><small>{client.company}</small
            ></span
          ><ArrowRight size={15} /></a
        >
      {/each}
    </div>
  </div>
  {#if expanded}<p class="map-disclaimer">
      <Folder size={16} />{t(
        "แอป AI เป็นตัวเลือกสำหรับตั้งค่า ไม่ใช่สถานะการเชื่อมต่อ รองรับ MCP ที่ตั้งค่า Authorization header ได้ ตรวจสอบความเข้ากันได้ในพื้นที่ทำงาน",
        "AI apps are setup choices, not live connection status. Workspace access requires MCP with a custom Authorization header; check client compatibility in your workspace.",
      )}
    </p>{/if}
</section>
