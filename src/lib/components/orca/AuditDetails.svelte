<script lang="ts">
  import {
    auditDetailValues,
    auditDuration,
    type AuditErrorCategory,
  } from "$lib/orca/audit-details";
  import { t } from "$lib/orca/locale.svelte";
  import { displayDate, type OrcaAuditEvent } from "$lib/services/orca";
  import { Copy } from "@lucide/svelte";
  let {
    event,
    expanded = false,
  }: { event: OrcaAuditEvent; expanded?: boolean } = $props();
  const detail = $derived(auditDetailValues(event));
  let copyState = $state<"idle" | "copied" | "error">("idle");
  const errors: Record<AuditErrorCategory, string> = $derived({
    authentication_required: t(
      "ต้องลงชื่อเข้าใช้ด้วยบัญชีของระบบนั้นอีกครั้ง",
      "The user must sign in to that system again",
    ),
    permission_denied: t("ไม่มีสิทธิ์ดำเนินการ", "Permission denied"),
    tool_changed: t(
      "เครื่องมือมีการเปลี่ยนแปลง ต้องตรวจสอบเครื่องมืออีกครั้ง",
      "The tool changed and requires another tool review",
    ),
    invalid_arguments: t(
      "ข้อมูลที่ส่งให้เครื่องมือไม่ถูกต้อง",
      "Invalid tool input",
    ),
    quota_exceeded: t("ใช้งานครบเพดานที่กำหนดแล้ว", "Usage limit reached"),
    timeout: t(
      "ระบบที่เชื่อมต่อตอบกลับไม่ทันเวลา",
      "The connected system did not respond in time",
    ),
    canceled: t("คำขอถูกยกเลิก", "Request canceled"),
    upstream_error: t(
      "ติดต่อระบบที่เชื่อมต่อไม่สำเร็จ",
      "The request to the connected system failed",
    ),
    tool_error: t("เครื่องมือแจ้งข้อผิดพลาด", "The tool reported an error"),
    invalid_response: t(
      "ระบบที่เชื่อมต่อส่งผลลัพธ์ในรูปแบบที่ไม่ถูกต้อง",
      "Invalid response from the connected system",
    ),
    unknown: t(
      "ไม่สามารถระบุสาเหตุจากประวัตินี้ได้",
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

<details class="audit-details" class:expanded open={expanded}>
  <summary>{t("รายละเอียด", "Details")}</summary>
  <dl>
    {#if detail.reference}<div>
        <dt>{t("รหัสอ้างอิง", "Reference ID")}</dt>
        <dd class="reference">
          <code>{detail.reference}</code><button
            type="button"
            onclick={copyReference}
            aria-label={t("คัดลอกรหัสอ้างอิง", "Copy reference ID")}
            title={t("คัดลอกรหัสอ้างอิง", "Copy reference ID")}
            ><Copy size={16} /></button
          >
        </dd>
      </div>{/if}
    {#if detail.durationMs !== undefined}<div>
        <dt>{t("ระยะเวลาดำเนินการ", "Duration")}</dt>
        <dd>{auditDuration(detail.durationMs)}</dd>
      </div>{/if}
    {#if detail.finishedAt}<div>
        <dt>{t("เวลาที่ดำเนินการเสร็จ (เวลาไทย)", "Completed at (Bangkok)")}</dt>
        <dd>{displayDate(detail.finishedAt)}</dd>
      </div>{/if}
    {#if detail.hubVersion !== undefined}<div>
        <dt>{t("เวอร์ชันการตั้งค่าพื้นที่ทำงาน", "Workspace version")}</dt>
        <dd>{detail.hubVersion}</dd>
      </div>{/if}
    {#if detail.connectionVersion !== undefined}<div>
        <dt>{t("เวอร์ชันการตั้งค่าระบบที่เชื่อมต่อ", "Connected system version")}</dt>
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
        <dt>{t("รหัสตรวจสอบนิยามเครื่องมือ", "Tool definition hash")}</dt>
        <dd>
          <code title={detail.schemaHash}
            >{expanded
              ? detail.schemaHash
              : `${detail.schemaHash.slice(0, detail.schemaHash.startsWith("sha256:") ? 19 : 12)}…`}</code
          >
        </dd>
      </div>{/if}
    {#if detail.errorCategory}<div>
        <dt>{t("สาเหตุ", "Cause")}</dt>
        <dd>{errors[detail.errorCategory]}</dd>
      </div>{/if}
  </dl>
  {#if copyState !== "idle"}<p role="status">
      {copyState === "copied"
        ? t("คัดลอกรหัสอ้างอิงแล้ว", "Reference ID copied")
        : t(
            "คัดลอกไม่สำเร็จ กรุณาเลือกรหัสอ้างอิงแล้วคัดลอกด้วยตนเอง",
            "Copy failed. Select the reference ID and copy it manually.",
          )}
    </p>{/if}
</details>

<style>
  .audit-details {
    min-width: 180px;
    max-width: 390px;
    margin-top: 8px;
    font-size: 13px;
  }
  .audit-details.expanded {
    min-width: 0;
    max-width: none;
    margin-top: 0;
  }
  .expanded > summary {
    display: none;
  }
  .expanded dl {
    gap: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .expanded dl > div {
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 4px 16px;
    padding: 10px 0;
    border-bottom: 1px solid #eff0f2;
  }
  summary {
    width: fit-content;
    color: var(--orca-ink);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  summary:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--orca-ink);
    outline-offset: 2px;
  }
  dl {
    display: grid;
    gap: 8px;
    margin: 8px 0 0;
    padding: 12px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
  dl > div {
    display: grid;
    gap: 2px;
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
    margin: 8px 0 0;
    color: var(--orca-muted);
    font-size: 12.5px;
  }
  @media (max-width: 480px) {
    .expanded dl > div {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
