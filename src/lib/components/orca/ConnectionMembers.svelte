<script lang="ts">
  import { localeHref, t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    displayDate,
    memberName,
    orcaError,
    type OrcaBootstrap,
    type OrcaConnectionMember,
    type OrcaConnectionMembers,
  } from "$lib/services/orca";
  import { Info, RefreshCw, ShieldCheck, Users } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  let { data, connectionID }: { data: OrcaBootstrap; connectionID: string } =
    $props();
  let response = $state<OrcaConnectionMembers>();
  let loading = $state(false);
  let error = $state("");
  let requestNumber = 0;
  let abort: AbortController | undefined;
  let alive = true;
  const connection = $derived(
    data.connections.find((item) => item.id === connectionID),
  );

  async function refresh(id = connectionID) {
    abort?.abort();
    const request = ++requestNumber;
    response = undefined;
    error = "";
    if (!data.canManage || !id) {
      loading = false;
      return;
    }
    const controller = new AbortController();
    abort = controller;
    loading = true;
    try {
      const result = await OrcaService.connectionMembers(id, controller.signal);
      if (alive && request === requestNumber && result.connectionID === id)
        response = result;
    } catch (cause) {
      if (alive && request === requestNumber && !controller.signal.aborted)
        error = orcaError(cause);
    } finally {
      if (alive && request === requestNumber) loading = false;
    }
  }

  $effect(() => {
    if (data.canManage && connectionID) void refresh(connectionID);
    else {
      requestNumber++;
      abort?.abort();
      response = undefined;
      loading = false;
    }
  });
  onDestroy(() => {
    alive = false;
    requestNumber++;
    abort?.abort();
  });

  function configurationLabel(row: OrcaConnectionMember) {
    if (row.configured === true) return t("ตั้งค่าแล้ว", "Configured");
    if (row.configured === false) return t("ตั้งค่ายังไม่ครบ", "Incomplete");
    return row.configurationEvidence === "credentials_not_inspected"
      ? t("ไม่ได้ตรวจสอบข้อมูลส่วนตัว", "Personal settings not inspected")
      : t("ยังยืนยันไม่ได้", "Not verified");
  }

  function authorizationLabel(row: OrcaConnectionMember) {
    if (response?.oauthSupported === false)
      return t("ไม่ต้องลงชื่อเข้าใช้ด้วยบัญชี", "Account sign-in not required");
    if (row.oauthTokenPresent === true)
      return t("มีการอนุญาตที่บันทึกไว้", "Authorization saved");
    if (row.oauthTokenPresent === false)
      return t("ไม่พบการอนุญาตที่บันทึกไว้", "No saved authorization");
    return t("ยังยืนยันไม่ได้", "Not verified");
  }
</script>

<section
  class="connection-members"
  aria-label={t("ผู้ใช้ที่เชื่อมบัญชี", "Connected users")}
>
  <header class="members-heading">
    <div>
      <h2>
        {t("ผู้ใช้ที่เชื่อมบัญชี", "Connected users")}{#if response}<span
            >{response.items.length}</span
          >{/if}
      </h2>
      <p>
        {t(
          "สมาชิกที่ได้รับสิทธิ์ในพื้นที่ทำงาน AI ที่ใช้ระบบนี้",
          "Members assigned to AI workspaces that use this system.",
        )}
      </p>
    </div>
    {#if data.canManage}<button
        class="k-button small"
        disabled={loading}
        onclick={() => refresh()}
        ><RefreshCw size={16} class={loading ? "k-spin" : ""} aria-hidden="true" />{t(
          "โหลดอีกครั้ง",
          "Refresh",
        )}</button
      >{/if}
  </header>

  {#if !data.canManage}
    <div class="members-message">
      <ShieldCheck size={20} aria-hidden="true" />
      <p>
        {t(
          "เฉพาะผู้ดูแลระบบเท่านั้นที่ดูรายชื่อสมาชิกในหน้านี้ได้",
          "Only administrators can view this member list.",
        )}
      </p>
    </div>
  {:else if loading}
    <div class="members-message" role="status">
      <RefreshCw size={20} class="k-spin" aria-hidden="true" />
      <p>{t("กำลังโหลดสถานะสมาชิก…", "Loading member status…")}</p>
    </div>
  {:else if error}
    <div class="members-message error" role="alert">
      <Info size={20} aria-hidden="true" />
      <p>{error}</p>
    </div>
  {:else if response}
    {#if connection && (!connection.enabled || !(connection.reviewedReadOnly || connection.reviewedTools))}
      <div class="members-notice">
        <Info size={16} aria-hidden="true" />
        <p>
          {t(
            "ระบบนี้ยังไม่เปิดให้ใช้เครื่องมือ แม้สมาชิกจะตั้งค่าบัญชีไว้แล้วก็ตาม",
            "Tools in this system are not available yet, even for members with saved account settings.",
          )}
        </p>
      </div>
    {/if}
    {#if response.items.length}
      <div class="members-table-wrap">
        <table>
          <thead
            ><tr
              ><th scope="col">{t("สมาชิก", "Member")}</th><th scope="col"
                >{t("พื้นที่ทำงาน AI", "AI workspaces")}</th
              ><th scope="col">{t("การตั้งค่าบัญชี", "Account settings")}</th><th scope="col"
                >{t("การอนุญาต (OAuth)", "Authorization (OAuth)")}</th
              ></tr
            ></thead
          >
          <tbody>
            {#each response.items as row (row.memberID)}
              {@const member = data.members.find(
                (item) => item.id === row.memberID,
              )}
              <tr>
                <td
                  ><strong>{member ? memberName(member) : row.memberID}</strong
                  >{#if member?.email && memberName(member) !== member.email}<small
                      >{member.email}</small
                    >{/if}</td
                >
                <td
                  ><div class="member-workspaces">
                    {#each row.relevantHubIDs as id (id)}<a
                        href={localeHref(
                          `/app?view=hub&hub=${encodeURIComponent(id)}`,
                        )}
                        >{data.hubs.find((hub) => hub.id === id)?.name ||
                          id}<span
                          class="k-badge"
                          class:active={row.activeHubIDs.includes(id)}
                          class:paused={row.pausedHubIDs.includes(id)}
                          >{row.activeHubIDs.includes(id)
                            ? t("เปิดใช้งาน", "Active")
                            : row.pausedHubIDs.includes(id)
                              ? t("ระงับ", "Paused")
                              : t("ฉบับร่าง", "Draft")}</span
                        ></a
                      >{/each}
                  </div></td
                >
                <td
                  ><span
                    class="k-badge member-state"
                    class:active={row.configured === true}
                    >{configurationLabel(row)}</span
                  ></td
                >
                <td
                  ><span
                    class="k-badge member-state"
                    class:active={row.oauthTokenPresent === true}
                    >{authorizationLabel(row)}</span
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="members-message">
        <Users size={20} aria-hidden="true" />
        <p>
          {t(
            "ยังไม่มีสมาชิกในพื้นที่ทำงาน AI ที่ใช้ระบบนี้",
            "No members are assigned to AI workspaces that use this system yet.",
          )}
        </p>
      </div>
    {/if}
    <footer class="members-footnote">
      <p>
        <Info size={16} aria-hidden="true" />{t(
          "สถานะนี้มาจากข้อมูลที่บันทึกไว้ ยังไม่ได้ตรวจสอบการเข้าถึงกับระบบ และไม่ได้เปิดอ่านข้อมูลลับของสมาชิก",
          "This status comes from saved records. Access to the system has not been checked, and members’ secret settings have not been inspected.",
        )}
      </p>
      <small
        >{t("ตรวจสอบข้อมูลเมื่อ", "Checked")}: {displayDate(
          response.checkedAt,
        )}</small
      >
    </footer>
  {/if}
</section>

<style>
  .connection-members {
    min-width: 0;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius-lg);
    background: var(--orca-surface);
    color: var(--orca-ink);
    overflow: hidden;
  }
  .members-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 16px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--orca-line);
  }
  .members-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .members-heading h2 span {
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
  .members-heading p {
    margin: 2px 0 0;
    color: var(--orca-muted);
    font-size: 13px;
  }
  .members-heading > :global(.k-button) {
    flex: none;
  }
  .members-message {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 32px 18px;
    color: var(--orca-subtle);
    font-size: 14px;
  }
  .members-message :global(svg) {
    flex-shrink: 0;
  }
  .members-message p {
    margin: 0;
    color: var(--orca-muted);
    line-height: 1.7;
  }
  .members-message.error,
  .members-message.error p {
    color: var(--orca-deny);
  }
  .members-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
    color: var(--orca-warn);
  }
  .members-notice :global(svg) {
    flex-shrink: 0;
    margin-top: 3px;
  }
  .members-notice p {
    margin: 0;
    color: var(--orca-ink);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .members-table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
    text-align: start;
  }
  th {
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
  td {
    padding: 10px 14px;
    border-bottom: 1px solid #eff0f2;
    font-size: 14px;
    line-height: 1.5;
    vertical-align: middle;
  }
  th:first-child,
  td:first-child {
    padding-left: 18px;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover td {
    background: var(--orca-surface-2);
  }
  td strong {
    display: block;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  td small {
    display: block;
    margin-top: 2px;
    color: var(--orca-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .member-workspaces {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .member-workspaces a {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--orca-ink);
    text-decoration: none;
  }
  .member-workspaces a:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .member-state {
    white-space: normal;
  }
  .members-footnote {
    padding: 12px 18px;
    border-top: 1px solid var(--orca-line);
    background: var(--orca-surface-2);
  }
  .members-footnote p {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    color: var(--orca-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  .members-footnote :global(svg) {
    flex-shrink: 0;
    margin-top: 3px;
    color: var(--orca-subtle);
  }
  .members-footnote small {
    display: block;
    margin: 4px 0 0 24px;
    color: var(--orca-subtle);
    font-size: 12px;
  }
  @media (max-width: 760px) {
    .members-heading {
      flex-wrap: wrap;
      padding: 14px 16px;
    }
    .members-footnote {
      padding: 12px 16px;
    }
  }
</style>
