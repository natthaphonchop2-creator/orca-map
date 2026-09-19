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
    if (row.configured === false) return t("ยังไม่ครบ", "Not configured");
    return row.configurationEvidence === "credentials_not_inspected"
      ? t("ไม่ได้ตรวจข้อมูลส่วนตัว", "Personal settings not inspected")
      : t("ยังยืนยันไม่ได้", "Not verified");
  }

  function authorizationLabel(row: OrcaConnectionMember) {
    if (response?.oauthSupported === false)
      return t("ไม่ใช้ OAuth", "OAuth not applicable");
    if (row.oauthTokenPresent === true)
      return t("มีการอนุญาตที่บันทึกไว้", "Authorization saved");
    if (row.oauthTokenPresent === false)
      return t("ไม่พบการอนุญาตที่บันทึกไว้", "No saved authorization");
    return t("ยังยืนยันไม่ได้", "Not verified");
  }
</script>

<section
  class="connection-members"
  aria-label={t("ผู้ใช้ของการเชื่อมต่อ", "Connected users")}
>
  <header class="members-heading">
    <div>
      <h2>
        {t("ผู้ใช้ของการเชื่อมต่อ", "Connected users")}{#if response}<span
            >{response.items.length}</span
          >{/if}
      </h2>
      <p>
        {t(
          "สมาชิกที่ถูกกำหนดไว้ในพื้นที่ทำงานของการเชื่อมต่อนี้",
          "Members assigned to workspaces using this connection.",
        )}
      </p>
    </div>
    {#if data.canManage}<button
        class="k-button"
        disabled={loading}
        onclick={() => refresh()}
        ><RefreshCw size={16} class={loading ? "k-spin" : ""} />{t(
          "โหลดใหม่",
          "Refresh",
        )}</button
      >{/if}
  </header>

  {#if !data.canManage}
    <div class="members-message">
      <ShieldCheck size={22} />
      <p>
        {t(
          "เฉพาะผู้ดูแลองค์กรที่ดูข้อมูลสมาชิกในหน้านี้ได้",
          "Only organization administrators can view this member list.",
        )}
      </p>
    </div>
  {:else if loading}
    <div class="members-message" role="status">
      <RefreshCw size={22} class="k-spin" />
      <p>{t("กำลังอ่านสถานะสมาชิก…", "Loading member status…")}</p>
    </div>
  {:else if error}
    <div class="members-message error" role="alert">
      <Info size={22} />
      <p>{error}</p>
    </div>
  {:else if response}
    {#if connection && (!connection.enabled || !(connection.reviewedReadOnly || connection.reviewedTools))}
      <div class="members-notice">
        <Info size={17} />
        <p>
          {t(
            "การเชื่อมต่อนี้ยังไม่เปิดให้ใช้เครื่องมือ แม้จะมีสมาชิกและบัญชีที่ตั้งค่าไว้แล้ว",
            "Tool access is unavailable for this connection even when members have saved account settings.",
          )}
        </p>
      </div>
    {/if}
    {#if response.items.length}
      <div class="members-table-wrap">
        <table>
          <thead
            ><tr
              ><th>{t("สมาชิก ORCA", "ORCA member")}</th><th
                >{t("พื้นที่ทำงาน", "Workspaces")}</th
              ><th>{t("การตั้งค่าบัญชี", "Account settings")}</th><th
                >{t("การอนุญาต OAuth", "OAuth authorization")}</th
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
                          id}<span class:paused={row.pausedHubIDs.includes(id)}
                          >{row.activeHubIDs.includes(id)
                            ? t("เปิดใช้", "Active")
                            : row.pausedHubIDs.includes(id)
                              ? t("พักไว้", "Paused")
                              : t("ฉบับร่าง", "Draft")}</span
                        ></a
                      >{/each}
                  </div></td
                >
                <td
                  ><span
                    class="member-state"
                    class:ready={row.configured === true}
                    >{configurationLabel(row)}</span
                  ></td
                >
                <td
                  ><span
                    class="member-state"
                    class:ready={row.oauthTokenPresent === true}
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
        <Users size={26} />
        <p>
          {t(
            "ยังไม่มีสมาชิกในพื้นที่ทำงานที่ใช้การเชื่อมต่อนี้",
            "No workspace members are assigned to this connection yet.",
          )}
        </p>
      </div>
    {/if}
    <footer class="members-footnote">
      <p>
        <Info size={15} />{t(
          "สถานะนี้อ่านจากข้อมูลที่บันทึกไว้ ยังไม่ได้ตรวจการเข้าถึงกับระบบต้นทาง และไม่เปิดอ่านข้อมูลลับของสมาชิก",
          "This shows stored evidence. Provider access has not been checked and members’ secret settings have not been inspected.",
        )}
      </p>
      <small
        >{t("ตรวจข้อมูลเมื่อ", "Checked")}: {displayDate(
          response.checkedAt,
        )}</small
      >
    </footer>
  {/if}
</section>

<style>
  .connection-members {
    background: white;
    border: 1px solid #e4e8e7;
    border-radius: 12px;
    overflow: hidden;
    color: #203633;
  }
  .members-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 25px 27px;
    border-bottom: 1px solid #edf0ef;
  }
  .members-heading h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.025em;
  }
  .members-heading h2 span {
    border: 1px solid #dce7e4;
    border-radius: 6px;
    padding: 1px 7px;
    font-size: 12px;
    color: #4c6b62;
  }
  .members-heading p {
    margin: 6px 0 0;
    color: #6d7d78;
    font-size: 13px;
    line-height: 1.7;
  }
  .members-message {
    display: flex;
    gap: 13px;
    align-items: center;
    padding: 35px 27px;
    color: #71827b;
    font-size: 14px;
  }
  .members-message p {
    margin: 0;
    line-height: 1.7;
  }
  .members-message.error {
    color: #ac5148;
  }
  .members-table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 650px;
    text-align: left;
  }
  th {
    font-size: 11px;
    font-weight: 600;
    color: #71817a;
    background: #fafcfb;
    padding: 14px 22px;
    border-bottom: 1px solid #e9eeeb;
    white-space: nowrap;
  }
  td {
    font-size: 12px;
    padding: 19px 22px;
    vertical-align: top;
    border-bottom: 1px solid #eef2ef;
    line-height: 1.6;
  }
  td strong {
    font-weight: 600;
    font-size: 13px;
  }
  td small {
    display: block;
    color: #7e8a84;
    font-size: 11px;
    margin-top: 4px;
  }
  .member-workspaces {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .member-workspaces a {
    display: flex;
    gap: 7px;
    align-items: center;
    color: #3f5e53;
    text-decoration: none;
  }
  .member-workspaces a:hover {
    text-decoration: underline;
  }
  .member-workspaces span {
    font-size: 9px;
    background: #edf5ef;
    color: #538469;
    border-radius: 4px;
    padding: 1px 5px;
    white-space: nowrap;
  }
  .member-workspaces span.paused {
    background: #faf1e3;
    color: #a58145;
  }
  .member-state {
    display: inline-block;
    color: #7c887f;
  }
  .member-state.ready {
    color: #4f7c60;
  }
  .members-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 13px 24px;
    background: #fcf8ee;
    color: #927542;
  }
  .members-notice p {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
  }
  .members-footnote {
    padding: 18px 25px;
    background: #fafcfb;
  }
  .members-footnote p {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    color: #738079;
    font-size: 11px;
    line-height: 1.7;
  }
  .members-footnote :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }
  .members-footnote small {
    display: block;
    margin: 8px 0 0 23px;
    color: #8b9690;
    font-size: 10px;
  }
  @media (max-width: 620px) {
    .members-heading {
      padding: 20px;
      gap: 14px;
      flex-wrap: wrap;
    }
    .members-heading h2 {
      font-size: 18px;
    }
    .members-heading p {
      font-size: 12px;
    }
    .members-footnote {
      padding: 16px 20px;
    }
  }
</style>
