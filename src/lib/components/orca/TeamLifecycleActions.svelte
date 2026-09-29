<script lang="ts">
  import { t } from '$lib/orca/locale.svelte';
  import { OrcaService, orcaError } from '$lib/services/orca';
  import { getHttpStatusCode } from '$lib/errors';
  import { Archive, Ban, RotateCcw, Trash2 } from '@lucide/svelte';
  // In a menu the row's own menu items open these confirmations through request().
  let { kind, id, name, version, inactive = false, disabled = false, compact = false, menu = false, onchanged, onbusy = () => {} }: {
    kind: 'department' | 'member'; id: string; name: string; version: number;
    inactive?: boolean; disabled?: boolean; compact?: boolean; menu?: boolean; onchanged: () => Promise<void>; onbusy?: (value: boolean) => void;
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
  export function request(next: 'suspend' | 'restore' | 'delete') {
    open(next);
  }
  async function confirm() {
    if (saving || stale || disabled || completed || !snapshot) return;
    if (id !== snapshot.id || kind !== snapshot.kind || version !== snapshot.version) {
      stale = true; error = t('มีคนเปลี่ยนข้อมูลนี้ไปแล้ว ปิดหน้าต่างนี้ ดูข้อมูลล่าสุด แล้วลองอีกครั้ง', 'Someone changed this. Close this dialog, check the latest details, and try again.'); return;
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
      error = completed ? t('บันทึกแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ ปิดหน้าต่างนี้แล้วโหลดหน้าใหม่', "Saved, but the list couldn't refresh. Close this dialog and reload the page.") : stale ? t('ข้อมูลหรือสิทธิ์เปลี่ยนไปแล้ว ปิดหน้าต่างนี้ โหลดหน้าใหม่ แล้วลองอีกครั้ง ถ้าเป็นเจ้าของบริษัทคนสุดท้าย ให้ตั้งคนอื่นเป็นเจ้าของบริษัทก่อน', 'The details or permissions changed. Close this dialog, reload, and try again. If this is the last company owner, make someone else an owner first.') : orcaError(cause);
      if (completed && dialog.isConnected && !dialog.open) dialog.showModal();
    } finally { saving = false; onbusy(false); }
  }
</script>
<!-- Compact mode shows icon buttons for table rows; the accessible name comes from aria-label. -->
{#if !menu}<div class="team-lifecycle" class:compact>
  <button class="lifecycle-button" class:k-button={!compact} class:small={!compact} aria-haspopup="dialog" aria-label={`${inactive ? t('กู้คืน', 'Restore') : kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')} ${name}`} title={compact ? (inactive ? t('กู้คืน', 'Restore') : kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')) : undefined} disabled={disabled || saving} onclick={() => open(inactive ? 'restore' : kind === 'member' ? 'suspend' : 'archive')}>
    {#if inactive}<RotateCcw size={16} aria-hidden="true" />{#if !compact}{t('กู้คืน', 'Restore')}{/if}{:else}{#if kind === 'member'}<Ban size={16} aria-hidden="true" />{:else}<Archive size={16} aria-hidden="true" />{/if}{#if !compact}{kind === 'member' ? t('ระงับ', 'Suspend') : t('จัดเก็บ', 'Archive')}{/if}{/if}
  </button>
  <button class="lifecycle-button delete-action" class:k-button={!compact} class:small={!compact} class:danger={!compact} aria-haspopup="dialog" aria-label={`${kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')} ${name}`} title={compact ? (kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')) : undefined} disabled={disabled || saving} onclick={() => open('delete')}><Trash2 size={16} aria-hidden="true" />{#if !compact}{kind === 'member' ? t('นำออก', 'Remove') : t('ลบ', 'Delete')}{/if}</button>
</div>{/if}
{#if notice}<span class="k-small lifecycle-notice" role="status">{notice}</span>{/if}
<dialog bind:this={dialog} class="team-dialog" aria-label={label} oncancel={(event) => {if (saving) event.preventDefault();}}>
  <div class="dialog-icon" class:danger={action === 'delete'} aria-hidden="true">
    {#if action === 'delete'}<Trash2 size={20} />{:else if action === 'restore'}<RotateCcw size={20} />{:else if kind === 'member'}<Ban size={20} />{:else}<Archive size={20} />{/if}
  </div>
  <h2>{label}</h2><p class="subject">{snapshot?.name}</p>
  <p>{action === 'restore'
    ? t('หลังกู้คืน ต้องเพิ่มคนและสิทธิ์ใหม่เอง สิทธิ์และคีย์ที่ถูกตัดไปแล้วจะไม่กลับมาเอง', "After restoring, add people and access again. Access and keys that were removed don't come back by themselves.")
    : kind === 'department'
      ? t('ทุกคนจะออกจากแผนกนี้ และเลิกเห็นความรู้ที่แชร์ผ่านแผนกนี้ แต่ยังใช้สิ่งที่ได้รับสิทธิ์ทางอื่นได้ตามเดิม', 'Everyone leaves this department and loses the knowledge shared through it. Access they have in other ways stays.')
      : t('คนนี้จะใช้ ORCA ไม่ได้ ORCA จะเอาเขาออกจากพื้นที่ทำงาน AI แผนก และความรู้ที่แชร์ให้โดยตรง และตัดการเชื่อมต่อคีย์ของเขาทั้งหมด', "This person can no longer use ORCA. ORCA takes them out of AI workspaces, departments and knowledge shared with them, and disconnects all their keys.")}</p>
  {#if action === 'delete'}<p>{t('รายการนี้จะหายไปจากหน้านี้และกู้คืนจากที่นี่ไม่ได้ ประวัติการใช้งานและเอกสารที่เคยเขียนไว้ยังเก็บไว้ตามเดิม', "This is removed from this page and can't be restored here. Activity history and anything they wrote are kept.")}</p>{/if}
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
  .team-dialog { width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; margin: auto; padding: 24px; border: 1px solid var(--orca-line); border-radius: var(--orca-radius-lg); background: var(--orca-surface); color: var(--orca-ink); box-shadow: var(--orca-dialog-shadow, 0 16px 48px -12px rgba(21, 24, 35, 0.28)); white-space: normal; text-align: start; }
  .team-dialog::backdrop { background: rgba(21, 24, 35, 0.45); }
  .dialog-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--orca-radius); background: var(--orca-secondary); color: var(--orca-nav); }
  .dialog-icon.danger { background: var(--orca-deny-bg); color: var(--orca-deny); }
  .team-dialog h2 { margin: 16px 0 4px; font-size: 18px; line-height: 1.4; font-weight: 600; }
  .team-dialog p { margin: 10px 0; color: var(--orca-muted); font-size: 14px; line-height: 1.7; }
  .team-dialog .subject { margin: 0 0 14px; color: var(--orca-ink); font-weight: 600; overflow-wrap: anywhere; }
  .team-dialog .dialog-error { margin-top: 14px; padding: 10px 12px; border-radius: var(--orca-radius); background: var(--orca-deny-bg); color: var(--orca-deny); font-size: 13px; }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
</style>
