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

<div class="users">
<header class="users-head">
  <div>
    <h1>{t("ผู้ใช้ที่เชื่อมบัญชี", "Connected users")}</h1>
    <p class="k-subtitle">
      {t(
        "ดูสมาชิกที่ลงชื่อเข้าใช้ด้วยบัญชีของตนและอนุญาตการเข้าถึงไว้ แยกตามระบบ",
        "View members who have signed in with their own account and authorized access, by system.",
      )}
    </p>
  </div>
  {#if data.canManage}<button
      class="k-button"
      onclick={() => refresh()}
      disabled={loading || !selected}
      ><RefreshCw size={16} class={loading ? "k-spin" : ""} aria-hidden="true" />{t(
        "โหลดอีกครั้ง",
        "Refresh",
      )}</button
    >{/if}
</header>

{#if !data.canManage}
  <section class="users-panel users-empty">
    <ShieldCheck size={24} aria-hidden="true" />
    <h2>{t("สำหรับผู้ดูแลระบบเท่านั้น", "Administrators only")}</h2>
    <p>
      {t(
        "จัดการบัญชีของคุณเองได้ที่เมนู “บัญชีที่เชื่อมไว้”",
        "Manage your own accounts in My accounts.",
      )}
    </p>
    <a class="k-button small" href={localeHref("/app?view=accounts")}
      >{t("บัญชีที่เชื่อมไว้", "My accounts")}<ArrowRight size={16} aria-hidden="true" /></a
    >
  </section>
{:else if !data.connections.length}
  <section class="users-panel users-empty">
    <Users size={24} aria-hidden="true" />
    <h2>{t("ยังไม่มีระบบที่เชื่อมต่อ", "No connected systems yet")}</h2>
    <p>
      {t(
        "เพิ่มระบบจากคลังระบบ แล้วกำหนดสมาชิกในพื้นที่ทำงาน AI เพื่อให้สมาชิกเชื่อมบัญชีของตนได้",
        "Add a system from the system catalog, then assign members in an AI workspace so that they can connect their own accounts.",
      )}
    </p>
    <a class="k-button small" href={localeHref("/app?view=catalog")}
      >{t("เพิ่มระบบ", "Add a system")}<ArrowRight size={16} aria-hidden="true" /></a
    >
  </section>
{:else}
  <section class="users-body">
    <div class="connected-user-controls">
      <label
        >{t("ระบบ", "System")}<select bind:value={selected}
          ><option value="" disabled>{t("เลือกระบบ", "Select a system")}</option
          >{#each data.connections as item (item.id)}<option value={item.id}
              >{item.name}</option
            >{/each}</select
        ></label
      >
      <label
        >{t("ค้นหาสมาชิก", "Search members")}<span class="connected-user-search"
          ><Search size={16} aria-hidden="true" /><input
            bind:value={query}
            type="search"
            placeholder={t("ชื่อหรืออีเมล", "Name or email")}
          /></span
        ></label
      >
    </div>
    <p class="connected-user-scope">
      {t(
        "แสดงเฉพาะสมาชิกในพื้นที่ทำงาน AI ที่ใช้ระบบที่เลือก บัญชีที่ยังไม่ได้อนุญาตการเข้าถึง (OAuth) จะไม่แสดงในรายการนี้",
        "Shows members of the AI workspaces that use the selected system. Accounts without a saved authorization (OAuth) are not listed.",
      )}
    </p>
    {#if loading}<p class="users-loading" role="status">
        <RefreshCw size={16} class="k-spin" aria-hidden="true" />{t(
          "กำลังโหลดสถานะการอนุญาต…",
          "Loading authorization status…",
        )}
      </p>
    {:else if error}<div class="k-banner error users-banner" role="alert">
        <Info size={16} aria-hidden="true" />{error}
      </div>
    {:else if response}
      {#if incomplete}<div class="k-banner users-banner" role="status">
          <Info size={16} aria-hidden="true" />
          <p>
            {t(
              "ยืนยันสถานะการอนุญาตได้ไม่ครบทุกบัญชี รายการด้านล่างแสดงเฉพาะบัญชีที่ยืนยันการอนุญาตแล้ว กรุณาโหลดอีกครั้งเพื่อตรวจสอบใหม่",
              "Some authorization statuses could not be verified. Only confirmed authorizations are listed below. Refresh to check again.",
            )}
          </p>
        </div>{/if}
      <div class="users-panel">
        {#if visible.length}<div class="users-table-wrap">
            <table class="users-table">
              <thead
                ><tr
                  ><th scope="col">{t("สมาชิก", "Member")}</th><th scope="col"
                    >{t("การอนุญาต", "Authorization")}</th
                  ><th scope="col">{t("พื้นที่ทำงาน AI", "AI workspaces")}</th></tr
                ></thead
              ><tbody
                >{#each visible as row (row.memberID)}<tr
                    ><td class="users-member"
                      ><strong>{memberName(row.member)}</strong
                      >{#if memberName(row.member) !== row.member.email}<small
                          >{row.member.email}</small
                        >{/if}</td
                    ><td class="users-auth"
                      ><span class="k-badge active"
                        >{t(
                          "มีการอนุญาตที่บันทึกไว้",
                          "Authorization saved",
                        )}</span
                      ></td
                    ><td class="users-gateways"
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
        {:else}<div class="users-empty">
            <Users size={24} aria-hidden="true" />
            <h2>
              {query
                ? t("ไม่พบสมาชิกที่ค้นหา", "No matching members")
                : incomplete
                  ? t(
                      "ยังยืนยันสถานะการอนุญาตไม่ได้",
                      "Authorization status could not be verified",
                    )
                  : t(
                      "ยังไม่มีผู้ใช้ที่เชื่อมบัญชี",
                      "No connected users yet",
                    )}
            </h2>
            <p>
              {t(
                "การเพิ่มสมาชิกหรือการบันทึกระบบไม่ได้เชื่อมบัญชีของสมาชิกโดยอัตโนมัติ สมาชิกแต่ละคนต้องลงชื่อเข้าใช้ด้วยบัญชีของตนเอง",
                "Adding a member or saving a system does not connect the member’s account. Each member must sign in with their own account.",
              )}
            </p>
          </div>{/if}
        <footer class="users-foot">
          {t("ตรวจสอบข้อมูลเมื่อ", "Checked")}: {displayDate(response.checkedAt)} · {t(
            "ข้อมูลนี้เป็นสถานะการอนุญาตที่บันทึกไว้ ไม่ใช่ผลการทดสอบเรียกใช้เครื่องมือ",
            "This is the saved authorization status, not the result of a tool test.",
          )}
        </footer>
      </div>
    {/if}
  </section>
{/if}
</div>

<style>
  .users {
    min-width: 0;
    color: var(--orca-ink);
  }
  .users-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px 24px;
    margin-bottom: 20px;
  }
  .users-head h1 {
    margin: 0;
  }
  .users-head > :global(.k-button) {
    flex: none;
  }
  .connected-user-controls {
    display: grid;
    grid-template-columns: minmax(0, 280px) minmax(0, 320px);
    gap: 16px;
  }
  .connected-user-controls label {
    display: grid;
    gap: 6px;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 600;
  }
  .connected-user-controls select,
  .connected-user-search {
    min-width: 0;
    height: 36px;
    border: 1px solid var(--orca-line-strong);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
    color: var(--orca-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 400;
  }
  .connected-user-controls select {
    padding: 0 10px;
  }
  .connected-user-controls select:focus-visible,
  .connected-user-search:focus-within {
    outline: none;
    border-color: var(--orca-ink);
    box-shadow: 0 0 0 3px rgba(21, 24, 35, 0.1);
  }
  .connected-user-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    color: var(--orca-subtle);
  }
  .connected-user-search :global(svg) {
    flex: none;
  }
  .connected-user-search input {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--orca-ink);
    font: inherit;
  }
  .connected-user-search input::placeholder {
    color: var(--orca-subtle);
  }
  .connected-user-search input:focus-visible {
    outline: none;
  }
  .connected-user-scope {
    margin: 12px 0 16px;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  .users-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 14px;
  }
  .users .users-banner {
    margin: 0 0 16px;
  }
  .users-banner p {
    margin: 0;
  }
  .users-panel {
    min-width: 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    overflow: hidden;
  }
  .users-table-wrap {
    overflow-x: auto;
  }
  .users-table {
    width: 100%;
    border-collapse: collapse;
    text-align: start;
  }
  .users-table th {
    height: 40px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
    color: var(--orca-nav);
    font-size: 13px;
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .users-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #eff0f2;
    font-size: 14px;
    vertical-align: middle;
  }
  .users-table tbody tr:last-child td {
    border-bottom: 0;
  }
  .users-table tbody tr:hover td {
    background: var(--orca-surface-2);
  }
  .users-member strong {
    display: block;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .users-member small {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .connected-user-gateways {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .connected-user-gateways a {
    color: var(--orca-ink);
    text-decoration: underline;
    text-decoration-color: var(--orca-line-strong);
    text-underline-offset: 3px;
  }
  .connected-user-gateways a:hover {
    text-decoration-color: var(--orca-ink);
  }
  .users-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 40px 24px;
    color: var(--orca-subtle);
    text-align: center;
  }
  .users-empty h2 {
    margin: 4px 0 0;
    color: var(--orca-ink);
    font-size: 15px;
    font-weight: 600;
  }
  .users-empty p {
    max-width: 480px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .users-empty > :global(.k-button) {
    margin-top: 8px;
  }
  .users-foot {
    padding: 10px 18px;
    border-top: 1px solid var(--orca-line);
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  @media (max-width: 760px) {
    .users-head {
      flex-direction: column;
    }
    .users-head > :global(.k-button) {
      width: 100%;
    }
    .connected-user-controls {
      grid-template-columns: minmax(0, 1fr);
    }
    /* Rows stack on phones: member and authorization, then workspaces. */
    .users-table,
    .users-table tbody {
      display: block;
    }
    .users-table thead {
      display: none;
    }
    .users-table tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #eff0f2;
    }
    .users-table tbody tr:last-child {
      border-bottom: 0;
    }
    .users-table td,
    .users-table tbody tr:hover td {
      padding: 0;
      border: 0;
      background: none;
    }
    .users-gateways {
      grid-column: 1 / -1;
    }
    .users-foot {
      padding-inline: 16px;
    }
  }
</style>
