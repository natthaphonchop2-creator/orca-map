<script lang="ts">
  import { t } from '$lib/orca/locale.svelte';
  import { OrcaService, orcaError } from '$lib/services/orca';
  import { getHttpStatusCode } from '$lib/errors';
  import { Archive, Ban, RotateCcw, Trash2 } from '@lucide/svelte';
  let { kind, id, name, version, inactive = false, disabled = false, compact = false, onchanged, onbusy = () => {} }: {
    kind: 'department' | 'member'; id: string; name: string; version: number;
    inactive?: boolean; disabled?: boolean; compact?: boolean; onchanged: () => Promise<void>; onbusy?: (value: boolean) => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let cancelButton: HTMLButtonElement;
  let action = $state<'archive' | 'suspend' | 'restore' | 'delete'>('archive');
  let saving = $state(false);
  let error = $state('');
  let stale = $state(false);
  let snapshot = $state<{ id: string; name: string; kind: 'department' | 'member'; version: number }>();
  let completed = $state(false);
  let notice = $state('');
  const label = $derived(action === 'delete' ? (kind === 'member' ? t('นำสมาชิกออก', 'Remove member') : t('ลบแผนก', 'Delete department')) : action === 'restore' ? t('กู้คืน', 'Restore') : kind === 'member' ? t('ระงับสมาชิก', 'Suspend member') : t('จัดเก็บแผนก', 'Archive department'));
  function open(next: typeof action) {
    if (saving || disabled) return;
    action = next; error = ''; stale = false; notice = ''; completed = false; snapshot = { id, name, kind, version }; dialog.showModal(); cancelButton?.focus();
  }
  async function confirm() {
    if (saving || stale || disabled || completed || !snapshot) return;
    if (id !== snapshot.id || kind !== snapshot.kind || version !== snapshot.version) {
      stale = true; error = t('ข้อมูลนี้มีการเปลี่ยนแปลงแล้ว กรุณาปิดหน้าต่างนี้และตรวจสอบข้อมูลล่าสุดก่อนดำเนินการอีกครั้ง', 'This record has changed. Close this dialog and review the latest data before trying again.'); return;
    }
    saving = true; onbusy(true); error = '';
    try {
      if (kind === 'department') await OrcaService.departmentLifecycle(snapshot.id, action as 'archive' | 'restore' | 'delete', snapshot.version);
      else await OrcaService.memberLifecycle(snapshot.id, action as 'suspend' | 'restore' | 'delete', snapshot.version);
      completed = true;
      dialog.close();
      notice = t('บันทึกแล้ว', 'Saved');
      await onchanged();
    } catch (cause) {
      stale = completed || getHttpStatusCode(cause) === 409;
      error = completed ? t('บันทึกแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณาปิดหน้าต่างนี้และโหลดข้อมูลใหม่', 'Saved, but the list could not be refreshed. Close this dialog and reload the latest data.') : stale ? t('ข้อมูลหรือสิทธิ์มีการเปลี่ยนแปลงแล้ว กรุณาปิดหน้าต่างนี้และโหลดข้อมูลใหม่ก่อนดำเนินการอีกครั้ง หากเป็นเจ้าของระบบคนสุดท้าย ต้องแต่งตั้งเจ้าของระบบคนอื่นก่อน', 'The record or permissions have changed. Close this dialog and refresh before trying again. If this is the last Owner, appoint another Owner first.') : orcaError(cause);
      if (completed && dialog.isConnected && !dialog.open) dialog.showModal();
    } finally { saving = false; onbusy(false); }
  }
</script>
<!-- Compact mode shows icon buttons for table rows; the accessible name comes from aria-label. -->
<div class="team-lifecycle" class:compact>
  <button class="lifecycle-button" class:k-button={!compact} class:small={!compact} aria-haspopup="dialog" aria-label={`${inactive ? t('กู้คืน', 'Restore') : kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')} ${name}`} title={compact ? (inactive ? t('กู้คืน', 'Restore') : kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')) : undefined} disabled={disabled || saving} onclick={() => open(inactive ? 'restore' : kind === 'member' ? 'suspend' : 'archive')}>
    {#if inactive}<RotateCcw size={16} aria-hidden="true" />{#if !compact}{t('กู้คืน', 'Restore')}{/if}{:else}{#if kind === 'member'}<Ban size={16} aria-hidden="true" />{:else}<Archive size={16} aria-hidden="true" />{/if}{#if !compact}{kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')}{/if}{/if}
  </button>
  <button class="lifecycle-button delete-action" class:k-button={!compact} class:small={!compact} class:danger={!compact} aria-haspopup="dialog" aria-label={`${kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')} ${name}`} title={compact ? (kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')) : undefined} disabled={disabled || saving} onclick={() => open('delete')}><Trash2 size={16} aria-hidden="true" />{#if !compact}{kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')}{/if}</button>
</div>
{#if notice}<span class="k-small lifecycle-notice" role="status">{notice}</span>{/if}
<dialog bind:this={dialog} class="team-dialog" aria-label={label} oncancel={(event) => {if (saving) event.preventDefault();}}>
  <div class="dialog-icon" class:danger={action === 'delete'} aria-hidden="true">
    {#if action === 'delete'}<Trash2 size={20} />{:else if action === 'restore'}<RotateCcw size={20} />{:else if kind === 'member'}<Ban size={20} />{:else}<Archive size={20} />{/if}
  </div>
  <h2>{label}</h2><p class="subject">{snapshot?.name}</p>
  <p>{action === 'restore'
    ? t('หลังกู้คืน ต้องกำหนดสมาชิกหรือสิทธิ์การเข้าถึงใหม่ สิทธิ์และคีย์ API ที่ถูกเพิกถอนแล้วจะไม่กลับคืนโดยอัตโนมัติ', 'After restoring, assign membership or access again. Revoked permissions and API keys are not restored automatically.')
    : kind === 'department'
      ? t('นำสมาชิกทั้งหมดออกจากแผนกนี้ และยกเลิกสิทธิ์เข้าถึงความรู้ที่ให้ผ่านแผนกนี้ สมาชิกยังคงใช้สิทธิ์ที่ได้รับจากช่องทางอื่นได้', 'Removes all members from this department and ends knowledge access granted through it. Members keep access granted in other ways.')
      : t('ยุติการเข้าถึง ORCA ของสมาชิกรายนี้ เพิกถอนสิทธิ์ในพื้นที่ทำงาน AI แผนก และความรู้ที่แบ่งปันโดยตรง รวมถึงเพิกถอนคีย์ API ที่มีอยู่', 'Ends this member’s access to ORCA, removes AI workspace, department and direct knowledge access, and revokes existing API keys.')}</p>
  {#if action === 'delete'}<p>{t('รายการนี้จะถูกนำออกจากหน้าจัดการและไม่สามารถกู้คืนจากหน้านี้ได้ ประวัติการใช้งานและเอกสารที่สร้างไว้จะยังคงเก็บรักษาไว้', 'This entry will be removed from management and cannot be restored here. Activity history and authored documents are retained.')}</p>{/if}
  {#if error}<p class="dialog-error" role="alert">{error}</p>{/if}
  <div class="dialog-actions"><button bind:this={cancelButton} class="k-button" disabled={saving} onclick={() => dialog.close()}>{t('ยกเลิก', 'Cancel')}</button><button class="k-button" class:primary={action !== 'delete'} class:danger-solid={action === 'delete'} disabled={saving || stale || disabled || completed} onclick={confirm}>{saving ? t('กำลังบันทึก…', 'Saving…') : label}</button></div>
</dialog>
<style>
  .team-lifecycle { display: flex; flex-wrap: wrap; gap: 8px; }
  .team-lifecycle.compact { flex-wrap: nowrap; gap: 4px; }
  .compact .lifecycle-button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--orca-radius); background: transparent; color: var(--orca-subtle); cursor: pointer; }
  .compact .lifecycle-button:hover:not(:disabled) { background: var(--orca-hover); color: var(--orca-ink); }
  .compact .lifecycle-button.delete-action:hover:not(:disabled) { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .compact .lifecycle-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .lifecycle-notice { color: var(--orca-muted); }
  .team-dialog { width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; margin: auto; padding: 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-ink); box-shadow: 0 16px 48px -12px rgba(21, 24, 35, 0.28); white-space: normal; text-align: start; }
  .team-dialog::backdrop { background: rgba(21, 24, 35, 0.45); }
  .dialog-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--orca-radius); background: var(--orca-secondary); color: var(--orca-nav); }
  .dialog-icon.danger { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .team-dialog h2 { margin: 16px 0 4px; font-size: 18px; line-height: 1.4; font-weight: 600; }
  .team-dialog p { margin: 10px 0; color: var(--orca-muted); font-size: 14px; line-height: 1.7; }
  .team-dialog .subject { margin: 0 0 14px; color: var(--orca-ink); font-weight: 600; overflow-wrap: anywhere; }
  .team-dialog .dialog-error { margin-top: 14px; padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny); font-size: 13px; }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
</style>
