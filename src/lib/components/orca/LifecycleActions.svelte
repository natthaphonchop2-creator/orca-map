<script lang="ts">
  import { parseErrorContent } from '$lib/errors';
  import { localeHref, t } from '$lib/orca/locale.svelte';
  import { OrcaService, orcaError } from '$lib/services/orca';
  import { Archive, ArchiveRestore, LoaderCircle, Trash2 } from '@lucide/svelte';
  import { tick } from 'svelte';

  type Action = 'archive' | 'restore' | 'delete';
  let {
    entity, kind, archived = false, canManage, affectedGateways = [], compact = false,
    onchanged, onreload
  }: {
    entity: { id: string; name: string; version: number };
    kind: 'gateway' | 'server';
    archived?: boolean;
    canManage: boolean;
    affectedGateways?: { id: string; name: string }[];
    compact?: boolean;
    onchanged: (action: Action) => Promise<void>;
    onreload: () => Promise<void>;
  } = $props();
  let dialog: HTMLDialogElement;
  let cancelButton: HTMLButtonElement;
  let action = $state<Action>('archive');
  let snapshot = $state<{ id: string; name: string; version: number }>();
  let pending = $state(false);
  let completed = $state(false);
  let error = $state('');
  let requiresReload = $state(false);
  const subject = $derived(kind === 'gateway' ? 'Gateway' : 'Server');
  const blockedDelete = $derived(action === 'delete' && kind === 'server' && affectedGateways.length > 0);
  const label = $derived(action === 'delete' ? t('ลบ', 'Delete') : action === 'restore' ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive'));

  async function open(next: Action) {
    if (pending || !canManage) return;
    action = next;
    snapshot = { id: entity.id, name: entity.name, version: entity.version };
    completed = false;
    requiresReload = false;
    error = '';
    dialog.showModal();
    await tick();
    cancelButton?.focus();
  }
  function close() {
    if (!pending) dialog.close();
  }
  async function reload() {
    if (pending) return;
    pending = true;
    try {
      await onreload();
      dialog.close();
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      pending = false;
    }
  }
  async function confirm() {
    if (pending || completed || requiresReload || !canManage || !snapshot || blockedDelete) return;
    // Use the version the user reviewed, even if data changed while the dialog was open.
    if (snapshot.id !== entity.id || snapshot.version !== entity.version) {
      requiresReload = true;
      error = t('ข้อมูลเปลี่ยนไปแล้ว โหลดข้อมูลล่าสุดแล้วตรวจสอบอีกครั้ง', 'This record has changed. Reload and review it again.');
      return;
    }
    pending = true;
    error = '';
    try {
      const methods = kind === 'gateway'
        ? { archive: OrcaService.archiveHub, restore: OrcaService.restoreHub, delete: OrcaService.deleteHub }
        : { archive: OrcaService.archiveConnection, restore: OrcaService.restoreConnection, delete: OrcaService.deleteConnection };
      await methods[action](snapshot.id, snapshot.version);
      completed = true;
      dialog.close();
      await onchanged(action);
    } catch (cause) {
      error = completed
        ? t('บันทึกแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุด', 'Saved, but the list could not be refreshed. Reload the latest data.')
        : orcaError(cause);
      requiresReload = completed || parseErrorContent(cause).status === 409;
      if (completed && dialog.isConnected && !dialog.open) dialog.showModal();
    } finally {
      pending = false;
    }
  }
</script>

{#if canManage}
  <div class="lifecycle-actions" class:compact>
    <button type="button" class="k-button small" disabled={pending} aria-haspopup="dialog"
      aria-label={`${archived ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive')} ${entity.name}`}
      onclick={() => open(archived ? 'restore' : 'archive')}>
      {#if archived}<ArchiveRestore size={16} aria-hidden="true" />{:else}<Archive size={16} aria-hidden="true" />{/if}
      {archived ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive')}
    </button>
    <button type="button" class="k-button small delete-action" disabled={pending} aria-haspopup="dialog"
      aria-label={`${t('ลบ', 'Delete')} ${entity.name}`} onclick={() => open('delete')}>
      <Trash2 size={16} aria-hidden="true" />{t('ลบ', 'Delete')}
    </button>
  </div>
{/if}
<dialog bind:this={dialog} class="lifecycle-dialog" aria-label={`${label} ${subject}`}
  oncancel={(event) => { if (pending) event.preventDefault(); }}>
  <form onsubmit={(event) => { event.preventDefault(); void confirm(); }}>
    <div class="dialog-icon" class:danger={action === 'delete'}>
      {#if action === 'delete'}<Trash2 size={25} />{:else if action === 'restore'}<ArchiveRestore size={25} />{:else}<Archive size={25} />{/if}
    </div>
    <h2>{label} {subject}</h2>
    <p class="entity-name">{snapshot?.name}</p>
    {#if action === 'archive'}
      <p>{kind === 'gateway'
        ? t('ย้ายไปแท็บจัดเก็บแล้ว และหยุดการเรียก MCP รวมถึงการเข้าถึงความรู้ผ่าน Gateway นี้ คีย์เดิมจะถูกยกเลิก', 'Move to Archived and stop MCP calls and knowledge access through this Gateway. Existing keys will be revoked.')
        : t('ย้ายไปแท็บจัดเก็บแล้วและปิด Server นี้ ทุก Gateway ที่ใช้งาน Server นี้จะเรียกเครื่องมือไม่ได้ และคีย์เดิมของ Gateway เหล่านั้นจะถูกยกเลิก', 'Move to Archived and disable this server. Every Gateway using it will stop calling tools, and their existing keys will be revoked.')}</p>
      <p>{t('กู้คืนได้ภายหลัง โดยยังต้องเปิดใช้งานและสร้างคีย์ใหม่ก่อนให้ทีมกลับมาใช้', 'You can restore it later. Enable access and issue new keys before your team resumes using it.')}</p>
    {:else if action === 'restore'}
      <p>{kind === 'gateway'
        ? t('นำ Gateway กลับมาในรายการด้วยสถานะระงับ ตรวจสอบสิทธิ์และเปิดใช้งานก่อนสร้างคีย์ใหม่', 'Return this Gateway to the list in Paused status. Review access and activate it before issuing new keys.')
        : t('นำ Server กลับมาในรายการโดยยังปิดใช้งานอยู่ ตรวจสอบการตั้งค่าและเปิดใช้งานก่อนสร้างคีย์ Gateway ใหม่', 'Return this server to the list while keeping it disabled. Review and enable it before issuing new Gateway keys.')}</p>
    {:else}
      <p>{kind === 'gateway'
        ? t('ลบ Gateway ออกจากรายการและยกเลิกคีย์ทั้งหมด การเรียก MCP และการเข้าถึงความรู้ผ่าน Gateway นี้จะหยุดลง ไม่สามารถกู้คืน Gateway นี้ได้', 'Remove this Gateway and revoke all its keys. MCP calls and knowledge access through it will stop. This Gateway cannot be restored.')
        : t('ลบ Server ออกจากรายการ ไม่สามารถกู้คืน Server นี้ได้ หากยังอาจใช้งานอีก ให้เลือกจัดเก็บแทน', 'Remove this server from the list. It cannot be restored. Choose Archive if you may need it again.')}</p>
    {/if}
    <p class="preserved">{t('บัญชีแอปที่เชื่อมไว้ ไฟล์ต้นทาง และประวัติการใช้งานยังคงอยู่', 'Connected app accounts, source files and activity history are retained.')}</p>
    {#if affectedGateways.length > 0 && kind === 'server' && action !== 'restore'}
      <div class="affected-gateways">
        <strong>{action === 'delete' ? t('ต้องลบหรือเปลี่ยน Server ของ Gateway เหล่านี้ก่อน รวมถึงรายการที่จัดเก็บไว้', 'Delete or reassign these Gateways first, including archived ones.') : t('Gateway ที่ได้รับผลกระทบ', 'Affected Gateways')}</strong>
        <ul>{#each affectedGateways as gateway}<li><a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(gateway.id)}`)}>{gateway.name}</a></li>{/each}</ul>
      </div>
    {/if}
    {#if error}<div class="dialog-error" role="alert">{error}</div>{/if}
    <div class="dialog-actions">
      <button bind:this={cancelButton} type="button" class="k-button" disabled={pending} onclick={close}>{t('ยกเลิก', 'Cancel')}</button>
      {#if requiresReload}<button type="button" class="k-button primary" disabled={pending} onclick={reload}>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button>
      {:else}<button type="submit" class="k-button primary" class:danger={action === 'delete'} disabled={pending || blockedDelete || completed || !canManage}>
        {#if pending}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{pending ? t('กำลังบันทึก…', 'Saving…') : `${label} ${subject}`}
      </button>{/if}
    </div>
  </form>
</dialog>

<style>
  .lifecycle-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .lifecycle-actions.compact { gap: 5px; }
  .compact :global(.k-button) { font-size: 11px; padding: 6px 8px; }
  .delete-action { color: #a22d43; }
  .lifecycle-dialog { width: min(540px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 26px; border: 1px solid #dce2ec; border-radius: 17px; background: white; color: #182033; box-shadow: 0 24px 80px #18203333; }
  .lifecycle-dialog::backdrop { background: #111b36a6; }
  .dialog-icon { width: 48px; height: 48px; display: grid; place-items: center; background: #edf2e6; color: #547631; border-radius: 12px; }
  .dialog-icon.danger { background: #fff1f3; color: #ad2d46; }
  h2 { margin: 16px 0 6px; font-size: 23px; line-height: 1.4; font-weight: 700; }
  p { margin: 12px 0; line-height: 1.8; font-size: 14px; }
  .entity-name { font-weight: 650; overflow-wrap: anywhere; margin: 0 0 18px; }
  .preserved { font-size: 12px; color: #647087; }
  .affected-gateways { background: #f7f8fb; border-radius: 9px; padding: 13px; font-size: 13px; line-height: 1.7; }
  ul { padding-left: 20px; margin: 8px 0 0; max-height: 140px; overflow-y: auto; }
  .affected-gateways a { color: #365a87; text-decoration: underline; }
  .dialog-error { margin-top: 14px; color: #a22d43; background: #fff2f4; border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.7; }
  .dialog-actions { display: flex; flex-wrap: wrap; gap: 9px; justify-content: flex-end; margin-top: 24px; }
  .dialog-actions .danger { background: #b62f48; border-color: #b62f48; color: white; }
  button:focus-visible, a:focus-visible { outline: 3px solid #567cbb; outline-offset: 3px; }
</style>
