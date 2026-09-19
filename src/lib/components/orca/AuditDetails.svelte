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
      "ต้องเชื่อมบัญชีต้นทางอีกครั้ง",
      "Source sign-in required",
    ),
    permission_denied: t("ไม่มีสิทธิ์ดำเนินการ", "Permission denied"),
    tool_changed: t(
      "เครื่องมือเปลี่ยนแปลง ต้องตรวจสอบใหม่",
      "Tool changed; review required",
    ),
    invalid_arguments: t(
      "ข้อมูลที่ส่งให้เครื่องมือไม่ถูกต้อง",
      "Invalid tool input",
    ),
    quota_exceeded: t("ใช้งานครบจำนวนที่กำหนด", "Usage limit reached"),
    timeout: t("ระบบต้นทางตอบกลับไม่ทันเวลา", "Source response timed out"),
    canceled: t("คำขอถูกยกเลิก", "Request canceled"),
    upstream_error: t("ติดต่อระบบต้นทางไม่สำเร็จ", "Source request failed"),
    tool_error: t("เครื่องมือรายงานข้อผิดพลาด", "Tool reported an error"),
    invalid_response: t(
      "รูปแบบผลลัพธ์จากระบบต้นทางไม่ถูกต้อง",
      "Invalid source response",
    ),
    unknown: t(
      "ไม่สามารถระบุสาเหตุได้จากประวัตินี้",
      "Cause unavailable in this record",
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
        <dt>{t("รหัสอ้างอิง", "Reference")}</dt>
        <dd class="reference">
          <code>{detail.reference}</code><button
            type="button"
            onclick={copyReference}
            aria-label={t("คัดลอกรหัสอ้างอิง", "Copy reference")}
            title={t("คัดลอกรหัสอ้างอิง", "Copy reference")}
            ><Copy size={14} /></button
          >
        </dd>
      </div>{/if}
    {#if detail.durationMs !== undefined}<div>
        <dt>{t("เวลาประมวลผล", "Execution duration")}</dt>
        <dd>{auditDuration(detail.durationMs)}</dd>
      </div>{/if}
    {#if detail.finishedAt}<div>
        <dt>{t("บันทึกผลเสร็จสิ้น (ไทย)", "Completion recorded (Bangkok)")}</dt>
        <dd>{displayDate(detail.finishedAt)}</dd>
      </div>{/if}
    {#if detail.hubVersion !== undefined}<div>
        <dt>{t("รุ่นการตั้งค่าพื้นที่", "Workspace version")}</dt>
        <dd>{detail.hubVersion}</dd>
      </div>{/if}
    {#if detail.connectionVersion !== undefined}<div>
        <dt>{t("รุ่นการเชื่อมต่อ", "Connection version")}</dt>
        <dd>{detail.connectionVersion}</dd>
      </div>{/if}
    {#if detail.resourceID}<div>
        <dt>{t("รหัสรายการที่เกี่ยวข้อง", "Resource ID")}</dt>
        <dd><code>{detail.resourceID}</code></dd>
      </div>{/if}
    {#if detail.resourceVersion !== undefined}<div>
        <dt>{t("รุ่นรายการที่บันทึก", "Recorded resource version")}</dt>
        <dd>{detail.resourceVersion}</dd>
      </div>{/if}
    {#if detail.schemaHash}<div>
        <dt>{t("รหัสรูปแบบเครื่องมือ", "Tool schema hash")}</dt>
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
        ? t("คัดลอกรหัสอ้างอิงแล้ว", "Reference copied")
        : t(
            "คัดลอกไม่สำเร็จ เลือกรหัสอ้างอิงเพื่อคัดลอกเองได้",
            "Copy failed. Select the reference to copy it manually.",
          )}
    </p>{/if}
</details>

<style>
  .audit-details {
    margin-top: 7px;
    font-size: 11px;
    min-width: 180px;
    max-width: 390px;
  }
  .audit-details.expanded {
    margin-top: 0;
    max-width: none;
    min-width: 0;
  }
  .expanded > summary {
    display: none;
  }
  .expanded dl {
    margin-top: 0;
    padding: 0;
    border: 0;
    background: transparent;
    gap: 18px;
  }
  .expanded dl > div {
    gap: 5px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--k-line, #e5e9e5);
  }
  summary {
    color: #527135;
    cursor: pointer;
    width: fit-content;
  }
  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid #719139;
    outline-offset: 3px;
  }
  dl {
    display: grid;
    gap: 9px;
    margin: 10px 0 0;
    padding: 12px;
    background: #f7f9f3;
    border: 1px solid #e1e7d8;
    border-radius: 8px;
  }
  dl > div {
    display: grid;
    gap: 3px;
  }
  dt {
    color: #677287;
  }
  dd {
    margin: 0;
    color: #2e3944;
    overflow-wrap: anywhere;
  }
  code {
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: 10px;
  }
  .reference {
    display: flex;
    align-items: start;
    gap: 7px;
  }
  .reference code {
    flex: 1;
    min-width: 0;
  }
  button {
    border: 0;
    background: transparent;
    padding: 3px;
    color: #527135;
    cursor: pointer;
  }
  p {
    margin: 7px 0 0;
    color: #657184;
  }
</style>
