<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy } from "svelte";
  import {
    ArrowRight,
    Info,
    RefreshCw,
    Search,
    ShieldCheck,
    Users,
  } from "@lucide/svelte";
  import {
    connectedOAuthMembers,
    unverifiedOAuthMemberCount,
  } from "$lib/orca/connected-users";
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    displayDate,
    memberName,
    orcaError,
    type OrcaBootstrap,
    type OrcaConnectionMembers,
  } from "$lib/services/orca";

  let { data }: { data: OrcaBootstrap } = $props();
  let selected = $state("");
  let query = $state("");
  let response = $state<OrcaConnectionMembers>();
  let loading = $state(false);
  let error = $state("");
  let generation = 0;
  let controller: AbortController | undefined;
  let alive = true;
  const rows = $derived(connectedOAuthMembers(data, selected, response));
  const unverifiedCount = $derived(
    unverifiedOAuthMemberCount(data, selected, response),
  );
  const incomplete = $derived(
    unverifiedCount > 0 || response?.oauthSupported === null,
  );
  const visible = $derived(
    rows.filter(({ member }) =>
      `${memberName(member)} ${member.email}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    ),
  );

  $effect(() => {
    const requested = page.url.searchParams.get("connection");
    if (requested)
      selected = data.connections.some((item) => item.id === requested)
        ? requested
        : "";
    else if (!data.connections.some((item) => item.id === selected))
      selected = data.connections[0]?.id ?? "";
  });
  async function refresh(
    id = selected,
    canManage = data.canManage,
    userID = data.currentUserID,
  ) {
    controller?.abort();
    const request = ++generation;
    response = undefined;
    error = "";
    loading = false;
    if (!canManage || !id || !data.connections.some((item) => item.id === id))
      return;
    const current = new AbortController();
    controller = current;
    loading = true;
    const valid = () =>
      alive &&
      request === generation &&
      !current.signal.aborted &&
      data.canManage &&
      data.currentUserID === userID &&
      selected === id;
    try {
      const result = await OrcaService.connectionMembers(id, current.signal);
      if (valid() && result.connectionID === id) response = result;
    } catch (cause) {
      if (valid()) error = orcaError(cause);
    } finally {
      if (valid()) loading = false;
    }
  }
  $effect(() => {
    void refresh(selected, data.canManage, data.currentUserID);
  });
  onDestroy(() => {
    alive = false;
    generation++;
    controller?.abort();
  });
</script>

<div class="connection-heading">
  <div>
    <h1>{t("ผู้ใช้ที่เชื่อมบัญชี", "Connected users")}</h1>
    <p>
      {t(
        "ดูสมาชิกที่มีการอนุญาต OAuth บันทึกไว้ แยกตามระบบต้นทาง",
        "View members with saved OAuth authorization for each server.",
      )}
    </p>
  </div>
  {#if data.canManage}<button
      class="k-button"
      onclick={() => refresh()}
      disabled={loading || !selected}
      ><RefreshCw size={16} class={loading ? "k-spin" : ""} />{t(
        "โหลดใหม่",
        "Refresh",
      )}</button
    >{/if}
</div>

{#if !data.canManage}
  <section class="connection-detail-panel">
    <ShieldCheck size={24} />
    <h2>{t("สำหรับผู้ดูแลองค์กร", "Organization administrators only")}</h2>
    <p>
      {t(
        "คุณจัดการบัญชีของตัวเองได้จากเมนูบัญชีของฉัน",
        "Manage your own sign-ins from My accounts.",
      )}
    </p>
    <a class="k-button" href={localeHref("/app?view=accounts")}
      >{t("บัญชีของฉัน", "My accounts")}<ArrowRight size={16} /></a
    >
  </section>
{:else if !data.connections.length}
  <section class="connection-detail-panel">
    <Users size={24} />
    <h2>{t("ยังไม่มีระบบต้นทางที่ตั้งค่าไว้", "No configured servers yet")}</h2>
    <p>
      {t(
        "เริ่มจาก Tool Catalog แล้วกำหนดสมาชิกใน MCP Gateway เพื่อให้สมาชิกเชื่อมบัญชีของตัวเอง",
        "Start with Tool Catalog, then assign members in an MCP Gateway so they can connect their own accounts.",
      )}
    </p>
    <a class="k-button" href={localeHref("/app?view=catalog")}
      >Tool Catalog<ArrowRight size={16} /></a
    >
  </section>
{:else}
  <section class="connection-detail-panel">
    <div class="connected-user-controls">
      <label
        >{t("ระบบต้นทาง (Server)", "Server")}<select bind:value={selected}
          ><option value="" disabled>{t("เลือกระบบ", "Select a server")}</option
          >{#each data.connections as item (item.id)}<option value={item.id}
              >{item.name}</option
            >{/each}</select
        ></label
      >
      <label
        >{t("ค้นหาสมาชิก", "Search members")}<span class="connected-user-search"
          ><Search size={17} /><input
            bind:value={query}
            type="search"
            placeholder={t("ชื่อหรืออีเมล", "Name or email")}
          /></span
        ></label
      >
    </div>
    <p class="connected-user-scope">
      {t(
        "แสดงเฉพาะสมาชิกใน MCP Gateways ของ Server ที่เลือก บัญชีที่ยังไม่อนุญาต OAuth จะไม่อยู่ในรายการนี้",
        "Shows members of the selected server’s MCP Gateways. Accounts without saved OAuth authorization are excluded.",
      )}
    </p>
    {#if loading}<p role="status">
        <RefreshCw size={18} class="k-spin" />{t(
          "กำลังอ่านสถานะ…",
          "Loading authorization status…",
        )}
      </p>
    {:else if error}<div class="k-banner error" role="alert">
        <Info size={18} />{error}
      </div>
    {:else if response}
      {#if incomplete}<div class="k-banner" role="status">
          <Info size={18} />
          <p>
            {t(
              "ยังยืนยันสถานะการอนุญาตได้ไม่ครบ รายการด้านล่างแสดงเฉพาะบัญชีที่ตรวจพบ OAuth เท่านั้น กรุณาโหลดใหม่เพื่อตรวจอีกครั้ง",
              "Some authorization status could not be verified. Only confirmed OAuth grants appear below. Refresh to check again.",
            )}
          </p>
        </div>{/if}
      {#if visible.length}<div class="connection-table-wrap">
          <table class="connection-table">
            <thead
              ><tr
                ><th>{t("สมาชิก ORCA", "ORCA member")}</th><th
                  >{t("การอนุญาต", "Authorization")}</th
                ><th>MCP Gateways</th></tr
              ></thead
            ><tbody
              >{#each visible as row (row.memberID)}<tr
                  ><td
                    ><strong>{memberName(row.member)}</strong
                    >{#if memberName(row.member) !== row.member.email}<small
                        >{row.member.email}</small
                      >{/if}</td
                  ><td
                    ><span class="connection-status reviewed"
                      >{t(
                        "มีการอนุญาต OAuth",
                        "OAuth authorization saved",
                      )}</span
                    ></td
                  ><td
                    ><div class="connected-user-gateways">
                      {#each row.gateways as gateway (gateway.id)}<a
                          href={localeHref(
                            `/app?view=hub&hub=${encodeURIComponent(gateway.id)}&tab=access`,
                          )}>{gateway.name}</a
                        >{/each}
                    </div></td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      {:else}<div class="connected-user-empty">
          <Users size={30} />
          <h2>
            {query
              ? t("ไม่พบสมาชิกที่ค้นหา", "No matching members")
              : incomplete
                ? t(
                    "ยังยืนยันบัญชีที่เชื่อมไม่ได้",
                    "Authorization status is unverified",
                  )
                : t(
                    "ยังไม่พบผู้ใช้ที่อนุญาต OAuth",
                    "No connected users found",
                  )}
          </h2>
          <p>
            {t(
              "การเพิ่มสมาชิกในองค์กรหรือการบันทึก Server เพียงอย่างเดียว ยังไม่ใช่การเชื่อมบัญชีของสมาชิก",
              "Adding an organization member or saving a server does not authorize that member’s account.",
            )}
          </p>
        </div>{/if}
      <footer class="connected-user-scope">
        {t("ตรวจข้อมูลเมื่อ", "Checked")}: {displayDate(response.checkedAt)} · {t(
          "เป็นสถานะการอนุญาตที่บันทึกไว้ ไม่ใช่ผลทดสอบการเรียกเครื่องมือ",
          "Saved authorization status; tool execution has not been tested here.",
        )}
      </footer>
    {/if}
  </section>
{/if}

<style>
  .connected-user-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .connected-user-controls label {
    display: grid;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .connected-user-controls select,
  .connected-user-search {
    min-width: 0;
    border: 1px solid #dbe0e7;
    border-radius: 7px;
    padding: 10px 12px;
    background: white;
  }
  .connected-user-search {
    display: flex;
    gap: 9px;
    align-items: center;
  }
  .connected-user-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
  }
  .connected-user-search:focus-within {
    outline: 2px solid #769738;
    outline-offset: 2px;
  }
  .connected-user-scope {
    font-size: 12px;
    line-height: 1.7;
    color: #677383;
    margin-block: 18px;
  }
  .connected-user-empty {
    display: grid;
    gap: 10px;
    justify-items: center;
    text-align: center;
    padding: 36px 18px;
    color: #677383;
  }
  .connected-user-empty h2 {
    color: #273142;
    font-size: 18px;
    margin: 0;
  }
  .connected-user-empty p {
    max-width: 580px;
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
  }
  .connected-user-gateways {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  td small {
    display: block;
    margin-top: 4px;
    color: #677383;
  }
  @media (max-width: 600px) {
    .connected-user-controls {
      grid-template-columns: 1fr;
    }
  }
</style>
