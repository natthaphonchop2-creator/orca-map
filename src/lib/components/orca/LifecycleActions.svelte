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
  const subject = $derived(kind === 'gateway' ? t('พื้นที่ทำงาน AI', 'AI workspace') : t('ระบบที่เชื่อมต่อ', 'connected system'));
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
      error = t('ข้อมูลนี้มีการเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดแล้วตรวจสอบอีกครั้ง', 'This record has changed. Reload the latest data and review it again.');
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
  <!-- Compact mode shows icon buttons for table rows; the accessible name comes from aria-label. -->
  <div class="lifecycle-actions" class:compact>
    <button type="button" class="lifecycle-button" class:k-button={!compact} class:small={!compact} disabled={pending} aria-haspopup="dialog"
      aria-label={`${archived ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive')} ${entity.name}`}
      title={compact ? (archived ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive')) : undefined}
      onclick={() => open(archived ? 'restore' : 'archive')}>
      {#if archived}<ArchiveRestore size={16} aria-hidden="true" />{:else}<Archive size={16} aria-hidden="true" />{/if}
      {#if !compact}{archived ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive')}{/if}
    </button>
    <button type="button" class="lifecycle-button delete-action" class:k-button={!compact} class:small={!compact} class:danger={!compact} disabled={pending} aria-haspopup="dialog"
      aria-label={`${t('ลบ', 'Delete')} ${entity.name}`} title={compact ? t('ลบ', 'Delete') : undefined} onclick={() => open('delete')}>
      <Trash2 size={16} aria-hidden="true" />{#if !compact}{t('ลบ', 'Delete')}{/if}
    </button>
  </div>
{/if}
<dialog bind:this={dialog} class="lifecycle-dialog" aria-label={t(`${label}${subject}`, `${label} ${subject}`)}
  oncancel={(event) => { if (pending) event.preventDefault(); }}>
  <form onsubmit={(event) => { event.preventDefault(); void confirm(); }}>
    <div class="dialog-icon" class:danger={action === 'delete'}>
      {#if action === 'delete'}<Trash2 size={25} />{:else if action === 'restore'}<ArchiveRestore size={25} />{:else}<Archive size={25} />{/if}
    </div>
    <h2>{t(`${label}${subject}`, `${label} ${subject}`)}</h2>
    <p class="entity-name">{snapshot?.name}</p>
    {#if action === 'archive'}
      <p>{kind === 'gateway'
        ? t('พื้นที่ทำงานนี้จะย้ายไปอยู่ในรายการที่จัดเก็บแล้ว แอป AI จะเรียกใช้เครื่องมือและเข้าถึงความรู้ผ่านพื้นที่ทำงานนี้ไม่ได้ และคีย์เดิมทั้งหมดจะถูกยกเลิก', 'This workspace moves to Archived. AI apps can no longer call tools or access knowledge through it, and all existing keys will be revoked.')
        : t('ระบบนี้จะย้ายไปอยู่ในรายการที่จัดเก็บแล้วและถูกปิดใช้งาน พื้นที่ทำงาน AI ทุกแห่งที่ใช้ระบบนี้จะเรียกใช้เครื่องมือของระบบนี้ไม่ได้ และคีย์เดิมของพื้นที่ทำงานเหล่านั้นจะถูกยกเลิก', 'This system moves to Archived and is disabled. Every AI workspace that uses it will stop calling its tools, and the existing keys for those workspaces will be revoked.')}</p>
      <p>{t('กู้คืนได้ภายหลัง แต่ต้องเปิดใช้งานและสร้างคีย์ใหม่ก่อนให้ทีมกลับมาใช้งาน', 'You can restore it later. Activate it and issue new keys before your team uses it again.')}</p>
    {:else if action === 'restore'}
      <p>{kind === 'gateway'
        ? t('พื้นที่ทำงานนี้จะกลับมาในรายการด้วยสถานะระงับ กรุณาตรวจสอบสิทธิ์และเปิดใช้งานก่อนสร้างคีย์ใหม่', 'This workspace returns to the list with Paused status. Review access and activate it before issuing new keys.')
        : t('ระบบนี้จะกลับมาในรายการโดยยังปิดใช้งานอยู่ กรุณาตรวจสอบการตั้งค่าและเปิดใช้งานก่อนสร้างคีย์ใหม่ของพื้นที่ทำงาน AI', 'This system returns to the list and remains disabled. Review and enable it before issuing new AI workspace keys.')}</p>
    {:else}
      <p>{kind === 'gateway'
        ? t('พื้นที่ทำงานนี้จะถูกลบออกจากรายการ และคีย์ทั้งหมดจะถูกยกเลิก การเรียกใช้เครื่องมือและการเข้าถึงความรู้ผ่านพื้นที่ทำงานนี้จะหยุดลง และไม่สามารถกู้คืนได้', 'This workspace will be removed and all its keys revoked. Tool calls and knowledge access through it will stop. It cannot be restored.')
        : t('ระบบนี้จะถูกลบออกจากรายการและไม่สามารถกู้คืนได้ หากอาจต้องใช้งานอีก กรุณาเลือกจัดเก็บแทน', 'This system will be removed from the list and cannot be restored. Choose Archive if you may need it again.')}</p>
    {/if}
    <p class="preserved">{t('บัญชีที่เชื่อมไว้ ข้อมูลในระบบที่เชื่อมต่อ และประวัติการใช้งานยังคงอยู่', 'Connected accounts, data in the connected systems and activity history are retained.')}</p>
    {#if affectedGateways.length > 0 && kind === 'server' && action !== 'restore'}
      <div class="affected-gateways">
        <strong>{action === 'delete' ? t('กรุณาลบพื้นที่ทำงาน AI ต่อไปนี้ หรือนำระบบนี้ออกจากพื้นที่ทำงานเหล่านั้นก่อน รวมถึงรายการที่จัดเก็บแล้ว', 'Delete these AI workspaces or remove this system from them first, including archived ones.') : t('พื้นที่ทำงาน AI ที่ได้รับผลกระทบ', 'Affected AI workspaces')}</strong>
        <ul>{#each affectedGateways as gateway}<li><a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(gateway.id)}`)}>{gateway.name}</a></li>{/each}</ul>
      </div>
    {/if}
    {#if error}<div class="dialog-error" role="alert">{error}</div>{/if}
    <div class="dialog-actions">
      <button bind:this={cancelButton} type="button" class="k-button" disabled={pending} onclick={close}>{t('ยกเลิก', 'Cancel')}</button>
      {#if requiresReload}<button type="button" class="k-button primary" disabled={pending} onclick={reload}>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button>
      {:else}<button type="submit" class="k-button primary" class:danger={action === 'delete'} disabled={pending || blockedDelete || completed || !canManage}>
        {#if pending}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{pending ? t('กำลังบันทึก…', 'Saving…') : t(`${label}${subject}`, `${label} ${subject}`)}
      </button>{/if}
    </div>
  </form>
</dialog>

<style>
  .lifecycle-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .lifecycle-actions.compact { flex-wrap: nowrap; gap: 4px; }
  .compact .lifecycle-button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--orca-radius, 8px); background: transparent; color: var(--orca-subtle, #6b7280); cursor: pointer; }
  .compact .lifecycle-button:hover { background: var(--orca-hover, #f0f1f3); color: var(--orca-ink, #151823); }
  .compact .lifecycle-button.delete-action:hover { background: var(--orca-deny-bg, #fdecee); color: var(--orca-deny, #b3262f); }
  .compact .lifecycle-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .delete-action { color: var(--orca-deny, #b3262f); }
  .compact .delete-action { color: var(--orca-subtle, #6b7280); }
  .lifecycle-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; border: 1px solid var(--orca-line, #e5e7eb); border-radius: var(--orca-radius-lg, 10px); background: #fff; color: var(--orca-ink, #151823); box-shadow: 0 16px 48px -12px rgba(21, 24, 35, 0.28); }
  .lifecycle-dialog::backdrop { background: rgba(21, 24, 35, 0.45); }
  .dialog-icon { width: 40px; height: 40px; display: grid; place-items: center; background: var(--orca-secondary, #f4f4f5); color: var(--orca-nav, #3f4452); border-radius: var(--orca-radius, 8px); }
  .dialog-icon.danger { background: var(--orca-deny-bg, #fdecee); color: var(--orca-deny, #b3262f); }
  .dialog-icon :global(svg) { width: 20px; height: 20px; }
  h2 { margin: 16px 0 4px; font-size: 18px; line-height: 1.4; font-weight: 600; }
  p { margin: 10px 0; line-height: 1.7; font-size: 14px; color: var(--orca-muted, #5b6270); }
  .entity-name { font-weight: 600; color: var(--orca-ink, #151823); overflow-wrap: anywhere; margin: 0 0 14px; }
  .preserved { font-size: 13px; color: var(--orca-subtle, #6b7280); }
  .affected-gateways { border: 1px solid var(--orca-line, #e5e7eb); background: var(--orca-surface-2, #fafafa); border-radius: var(--orca-radius, 8px); padding: 12px 14px; font-size: 13px; line-height: 1.7; }
  ul { padding-left: 20px; margin: 8px 0 0; max-height: 140px; overflow-y: auto; }
  .affected-gateways a { color: var(--orca-ink, #151823); text-decoration: underline; text-underline-offset: 3px; }
  .dialog-error { margin-top: 14px; color: var(--orca-deny, #b3262f); background: var(--orca-deny-bg, #fdecee); border-radius: var(--orca-radius, 8px); padding: 10px 12px; font-size: 13px; line-height: 1.7; }
  .dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 22px; }
  .dialog-actions .danger { background: var(--orca-deny, #b3262f) !important; border-color: var(--orca-deny, #b3262f) !important; color: #fff !important; }
  button:focus-visible, a:focus-visible { outline: 2px solid var(--orca-ink, #151823); outline-offset: 2px; }
</style>
