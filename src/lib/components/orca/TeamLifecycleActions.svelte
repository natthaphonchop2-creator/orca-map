<script lang="ts">
  import { t } from '$lib/orca/locale.svelte';
  import { OrcaService, orcaError } from '$lib/services/orca';
  import { getHttpStatusCode } from '$lib/errors';
  import { Archive, RotateCcw, Trash2 } from '@lucide/svelte';
  let { kind, id, name, version, inactive = false, disabled = false, onchanged, onbusy = () => {} }: {
    kind: 'department' | 'member'; id: string; name: string; version: number;
    inactive?: boolean; disabled?: boolean; onchanged: () => Promise<void>; onbusy?: (value: boolean) => void;
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
      stale = true; error = t('ข้อมูลเปลี่ยนแล้ว กรุณาปิดหน้าต่างและตรวจสอบรายการล่าสุดก่อนทำรายการใหม่', 'This record has changed. Close and review the latest record before retrying.'); return;
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
      error = completed ? t('บันทึกแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ กรุณาปิดหน้าต่างและรีเฟรชข้อมูล', 'Saved, but the list could not be refreshed. Close and reload the latest data.') : stale ? t('รายการหรือสิทธิ์เปลี่ยนแล้ว กรุณาปิดหน้าต่างและรีเฟรชก่อนทำรายการใหม่ หากเป็น Owner คนสุดท้าย ต้องแต่งตั้ง Owner อีกคนก่อน', 'The record or permissions changed. Close and refresh before retrying. Appoint another Owner before removing the last Owner.') : orcaError(cause);
      if (completed && dialog.isConnected && !dialog.open) dialog.showModal();
    } finally { saving = false; onbusy(false); }
  }
</script>
<div class="team-lifecycle">
  <button class="k-button quiet small" aria-haspopup="dialog" aria-label={`${inactive ? t('กู้คืน', 'Restore') : kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')} ${name}`} disabled={disabled || saving} onclick={() => open(inactive ? 'restore' : kind === 'member' ? 'suspend' : 'archive')}>
    {#if inactive}<RotateCcw size={14}/>{t('กู้คืน', 'Restore')}{:else}<Archive size={14}/>{kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')}{/if}
  </button>
  <button class="k-button quiet small danger" aria-haspopup="dialog" aria-label={`${kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')} ${name}`} disabled={disabled || saving} onclick={() => open('delete')}><Trash2 size={14}/>{kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')}</button>
</div>
{#if notice}<span class="k-small" role="status">{notice}</span>{/if}
<dialog bind:this={dialog} aria-label={label} oncancel={(event) => {if (saving) event.preventDefault();}}>
  <h2>{label}</h2><p class="subject">{snapshot?.name}</p>
  <p>{action === 'restore'
    ? t('กู้คืนแล้วต้องกำหนดสมาชิกหรือสิทธิ์เข้าถึงใหม่ สิทธิ์และคีย์เดิมที่ถอนแล้วจะไม่กลับมาโดยอัตโนมัติ', 'Restoring requires new membership or access assignments. Revoked permissions and keys do not return automatically.')
    : kind === 'department'
      ? t('ถอนสมาชิกออกจากแผนกนี้และหยุดสิทธิ์ความรู้ที่ให้ผ่านแผนก สมาชิกยังใช้งานส่วนที่ได้รับสิทธิ์จากทางอื่นได้', 'Remove this department’s memberships and its knowledge access. People retain access granted through other memberships.')
      : t('หยุดการเข้าถึง ORCA ของสมาชิก ถอนสิทธิ์ Gateway แผนกและความรู้ที่แบ่งปันโดยตรง รวมถึงยกเลิกคีย์เดิม', 'Stop this member’s ORCA access, remove Gateway, department and direct knowledge grants, and revoke existing keys.')}</p>
  {#if action === 'delete'}<p>{t('นำรายการออกจากหน้าจัดการและกู้คืนจากหน้านี้ไม่ได้ ประวัติการใช้งานและเอกสารยังเก็บไว้', 'Remove this entry from management; it cannot be restored here. Audit history and authored documents are retained.')}</p>{/if}
  {#if error}<p class="k-banner error" role="alert">{error}</p>{/if}
  <div class="k-actions"><button bind:this={cancelButton} class="k-button" disabled={saving} onclick={() => dialog.close()}>{t('ยกเลิก', 'Cancel')}</button><button class="k-button" class:danger={action === 'delete'} disabled={saving || stale || disabled || completed} onclick={confirm}>{saving ? t('กำลังบันทึก…', 'Saving…') : label}</button></div>
</dialog>
<style>
  .team-lifecycle {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .danger {color:#ad303b!important;border-color:#e6c8cc!important}
  dialog {width:min(480px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #dce2eb;border-radius:18px;padding:26px;margin:auto;color:#172033;background:white;box-shadow:0 22px 80px #18203330}
  dialog::backdrop {background:#11182765}
  dialog h2 {font-size:20px;margin:0 0 10px} dialog p {line-height:1.7;font-size:14px;margin:12px 0}.subject {font-weight:700;overflow-wrap:anywhere} dialog .k-actions {margin-top:22px;justify-content:flex-end}
</style>
