<script lang="ts">
  import {
    auditDetailValues,
    auditDuration,
    type AuditErrorCategory,
  } from "$lib/orca/audit-details";
  import { t } from "$lib/orca/locale.svelte";
  import { displayDate, type OrcaAuditEvent } from "$lib/services/orca";
  import { Copy } from "@lucide/svelte";
  // One history record's details in the drawer: how long it took, when it
  // finished and why it failed, in words; codes and versions for a developer
  // stay folded under "สำหรับนักพัฒนา".
  let {
    event,
    codes = [],
  }: {
    event: OrcaAuditEvent;
    /** More codes for the developer section, e.g. the person's ID. */
    codes?: { label: string; value: string }[];
  } = $props();
  const detail = $derived(auditDetailValues(event));
  let copyState = $state<"idle" | "copied" | "error">("idle");
  const errors: Record<AuditErrorCategory, string> = $derived({
    authentication_required: t(
      "ต้องเข้าสู่ระบบโปรแกรมนั้นอีกครั้ง",
      "The person must sign in to that program again",
    ),
    permission_denied: t("ไม่มีสิทธิ์ดำเนินการ", "Permission denied"),
    tool_changed: t(
      "ผู้ให้บริการเปลี่ยนสิ่งนี้ ต้องตรวจใหม่ก่อน",
      "The provider changed this; review it again first",
    ),
    invalid_arguments: t(
      "ข้อมูลที่ AI ส่งไปไม่ถูกต้อง",
      "What AI sent was invalid",
    ),
    quota_exceeded: t("ใช้ครบจำนวนที่กำหนดแล้ว", "Usage limit reached"),
    timeout: t(
      "โปรแกรมตอบไม่ทันเวลา",
      "The program did not respond in time",
    ),
    canceled: t("คำขอถูกยกเลิก", "Request canceled"),
    upstream_error: t(
      "ติดต่อโปรแกรมไม่สำเร็จ",
      "The program could not be reached",
    ),
    tool_error: t("โปรแกรมแจ้งข้อผิดพลาด", "The program reported an error"),
    invalid_response: t(
      "โปรแกรมตอบกลับในรูปแบบที่อ่านไม่ได้",
      "The program sent a response ORCA could not read",
    ),
    unknown: t(
      "ประวัตินี้ไม่ได้บอกสาเหตุ",
      "The cause is not available in this record",
    ),
  });
  async function copyReference() {
    if (!detail.reference) return;
    try {
      await navigator.clipboard.writeText(detail.reference);
      copyState = "copied";
    } catch {
      copyState = "error";
    }
  }
  $effect(() => {
    event.id;
    copyState = "idle";
  });
</script>

<div class="audit-details">
  {#if detail.durationMs !== undefined || detail.finishedAt || detail.errorCategory}<dl class="audit-plain">
      {#if detail.durationMs !== undefined}<div>
          <dt>{t("ใช้เวลา", "Duration")}</dt>
          <dd>{auditDuration(detail.durationMs)}</dd>
        </div>{/if}
      {#if detail.finishedAt}<div>
          <dt>{t("เสร็จเมื่อ", "Finished")}</dt>
          <dd>{displayDate(detail.finishedAt)}</dd>
        </div>{/if}
      {#if detail.errorCategory}<div>
          <dt>{t("สาเหตุ", "Cause")}</dt>
          <dd>{errors[detail.errorCategory]}</dd>
        </div>{/if}
    </dl>{/if}
  <details class="audit-dev">
    <summary>{t("สำหรับนักพัฒนา", "For developers")}</summary>
    <dl>
      {#each codes.filter((code) => code.value) as code (code.label)}<div>
          <dt>{code.label}</dt>
          <dd><code>{code.value}</code></dd>
        </div>{/each}
      {#if detail.reference}<div>
          <dt>{t("รหัสอ้างอิง", "Reference ID")}</dt>
          <dd class="reference">
            <code>{detail.reference}</code><button
              type="button"
              onclick={copyReference}
              aria-label={t("คัดลอกรหัสอ้างอิง", "Copy reference ID")}
              title={t("คัดลอกรหัสอ้างอิง", "Copy reference ID")}><Copy size={16} aria-hidden="true" /></button
            >
          </dd>
        </div>{/if}
      {#if detail.hubVersion !== undefined}<div>
          <dt>{t("เวอร์ชันการตั้งค่าพื้นที่ทำงาน", "Workspace version")}</dt>
          <dd>{detail.hubVersion}</dd>
        </div>{/if}
      {#if detail.connectionVersion !== undefined}<div>
          <dt>{t("เวอร์ชันการตั้งค่าโปรแกรม", "Program version")}</dt>
          <dd>{detail.connectionVersion}</dd>
        </div>{/if}
      {#if detail.resourceID}<div>
          <dt>{t("รหัสรายการที่เกี่ยวข้อง", "Related item ID")}</dt>
          <dd><code>{detail.resourceID}</code></dd>
        </div>{/if}
      {#if detail.resourceVersion !== undefined}<div>
          <dt>{t("เวอร์ชันของรายการที่บันทึก", "Recorded item version")}</dt>
          <dd>{detail.resourceVersion}</dd>
        </div>{/if}
      {#if detail.schemaHash}<div>
          <dt>{t("รหัสตรวจสอบสิ่งที่ AI ทำได้", "Tool definition hash")}</dt>
          <dd><code title={detail.schemaHash}>{detail.schemaHash}</code></dd>
        </div>{/if}
    </dl>
    {#if copyState !== "idle"}<p role="status">
        {copyState === "copied"
          ? t("คัดลอกรหัสอ้างอิงแล้ว", "Reference ID copied")
          : t("คัดลอกไม่สำเร็จ เลือกรหัสอ้างอิงแล้วคัดลอกเอง", "Copy failed. Select the reference ID and copy it manually.")}
      </p>{/if}
  </details>
</div>

<style>
  .audit-details {
    min-width: 0;
    font-size: 13px;
  }
  dl {
    display: grid;
    margin: 0;
    padding: 0;
  }
  dl > div {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 4px 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--orca-line-soft);
  }
  dt {
    color: var(--orca-muted);
    font-size: 13px;
  }
  dd {
    min-width: 0;
    margin: 0;
    color: var(--orca-ink);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .audit-dev {
    margin-top: 14px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface-2);
  }
  .audit-dev > summary {
    padding: 10px 14px;
    color: var(--orca-text-2);
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .audit-dev > summary:hover {
    color: var(--orca-ink);
  }
  .audit-dev dl {
    padding: 0 14px 4px;
    border-top: 1px solid var(--orca-line);
  }
  .audit-dev dl > div:last-child {
    border-bottom: 0;
  }
  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--orca-focus, var(--orca-ink));
    outline-offset: 2px;
  }
  .audit-details code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .reference {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .reference code {
    flex: 1;
    min-width: 0;
  }
  .reference button {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--orca-radius);
    background: transparent;
    color: var(--orca-subtle);
    cursor: pointer;
  }
  .reference button:hover {
    background: var(--orca-hover);
    color: var(--orca-ink);
  }
  .audit-details p {
    margin: 0;
    padding: 0 14px 10px;
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  @media (max-width: 480px) {
    dl > div {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
