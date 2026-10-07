<script lang="ts">
  import { parseErrorContent } from '$lib/errors';
  import { localeHref, t } from '$lib/orca/locale.svelte';
  import { OrcaService, orcaError } from '$lib/services/orca';
  import { Archive, ArchiveRestore, CircleAlert, LoaderCircle, Trash2 } from '@lucide/svelte';
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
  const subject = $derived(kind === 'gateway' ? t('พื้นที่ทำงาน AI', 'AI workspace') : t('โปรแกรม', 'program'));
  const blockedDelete = $derived(action === 'delete' && kind === 'server' && affectedGateways.length > 0);
  const label = $derived(action === 'delete' ? t('ลบ', 'Delete') : action === 'restore' ? t('กู้คืน', 'Restore') : t('จัดเก็บ', 'Archive'));
  // A blocked delete explains what to do next instead of showing a disabled red button.
  const heading = $derived(blockedDelete ? t('ยังลบโปรแกรมนี้ไม่ได้', 'This program cannot be deleted yet') : t(`${label}${subject}`, `${label} ${subject}`));

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
      error = t('มีคนเปลี่ยนข้อมูลนี้ไปแล้ว โหลดข้อมูลล่าสุดแล้วตรวจอีกครั้ง', 'Someone changed this. Reload the latest data and check it again.');
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
        ? t('บันทึกแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ โหลดข้อมูลล่าสุดอีกครั้ง', 'Saved, but the list could not be refreshed. Reload the latest data.')
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
<dialog bind:this={dialog} class="lifecycle-dialog" aria-label={heading}
  oncancel={(event) => { if (pending) event.preventDefault(); }}>
  <form onsubmit={(event) => { event.preventDefault(); void confirm(); }}>
    <div class="dialog-icon" class:danger={action === 'delete' && !blockedDelete} class:warn={blockedDelete}>
      {#if blockedDelete}<CircleAlert size={25} />{:else if action === 'delete'}<Trash2 size={25} />{:else if action === 'restore'}<ArchiveRestore size={25} />{:else}<Archive size={25} />{/if}
    </div>
    <h2>{heading}</h2>
    <p class="entity-name">{snapshot?.name}</p>
    {#if action === 'archive'}
      <p>{kind === 'gateway'
        ? t('พื้นที่ทำงานนี้จะย้ายไปที่ “จัดเก็บแล้ว” AI จะใช้โปรแกรมและความรู้ผ่านพื้นที่นี้ไม่ได้ และคีย์ของพื้นที่นี้จะถูกตัดการเชื่อมต่อ', 'This workspace moves to Archived. AI can no longer use its programs or knowledge, and its keys are disconnected.')
        : t('โปรแกรมนี้จะย้ายไปที่ “จัดเก็บแล้ว” และหยุดทำงาน AI ในทุกพื้นที่ทำงานจะใช้โปรแกรมนี้ไม่ได้ และคีย์ของพื้นที่ทำงานเหล่านั้นจะถูกตัดการเชื่อมต่อ', "This program moves to Archived and stops. AI in every workspace can no longer use it, and those workspaces' keys are disconnected.")}</p>
      <p>{t('กู้คืนได้ภายหลัง แต่ต้องเปิดใช้งานอีกครั้ง และสร้างคีย์ใหม่ถ้ามีคนใช้คีย์', 'You can restore it later. Then turn it on again, and make new keys if anyone used one.')}</p>
    {:else if action === 'restore'}
      <p>{kind === 'gateway'
        ? t('พื้นที่ทำงานนี้จะกลับมาแบบหยุดชั่วคราว ตรวจว่าใครใช้ได้บ้าง แล้วเปิดใช้งานอีกครั้ง', 'This workspace comes back paused. Check who can use it, then turn it on again.')
        : t('โปรแกรมนี้จะกลับมาแบบหยุดชั่วคราว ตรวจสิ่งที่ AI ทำได้ แล้วเปิดใช้อีกครั้งก่อนให้ทีมใช้', 'This program comes back paused. Check what AI can do and turn it on again before your team uses it.')}</p>
    {:else if blockedDelete}
      <p>{t('โปรแกรมนี้ยังอยู่ในพื้นที่ทำงาน AI ด้านล่าง เอาโปรแกรมออกจากพื้นที่ทำงานเหล่านั้น หรือลบพื้นที่ทำงานก่อน (รวมที่จัดเก็บแล้ว) แล้วจึงกลับมาลบโปรแกรมนี้', 'This program is still used by the AI workspaces below. Remove it from those workspaces, or delete them (including archived ones), then come back to delete it.')}</p>
    {:else}
      <p>{kind === 'gateway'
        ? t('พื้นที่ทำงานนี้จะถูกลบและกู้คืนไม่ได้ AI จะใช้โปรแกรมและความรู้ผ่านพื้นที่นี้ไม่ได้ และคีย์ทั้งหมดของพื้นที่นี้จะถูกตัดการเชื่อมต่อ', "This workspace is deleted and can't be restored. AI can no longer use its programs or knowledge, and all its keys are disconnected.")
        : t('โปรแกรมนี้จะถูกลบออกจากรายการและกู้คืนไม่ได้ ถ้าอาจต้องใช้อีก ให้เลือกจัดเก็บแทน', 'This program will be removed from the list and cannot be restored. Choose Archive if you may need it again.')}</p>
    {/if}
    {#if !blockedDelete}<p class="preserved">{t('บัญชีที่เชื่อมไว้ ข้อมูลในโปรแกรม และประวัติการใช้งานยังคงอยู่', 'Connected accounts, data in the programs and activity history are retained.')}</p>{/if}
    {#if affectedGateways.length > 0 && kind === 'server' && action !== 'restore'}
      <div class="affected-gateways">
        <strong>{blockedDelete ? t(`พื้นที่ทำงาน AI ที่ยังใช้โปรแกรมนี้ (${affectedGateways.length})`, `AI workspaces still using this program (${affectedGateways.length})`) : t('พื้นที่ทำงาน AI ที่ได้รับผลกระทบ', 'Affected AI workspaces')}</strong>
        <ul>{#each affectedGateways as gateway}<li><a href={localeHref(`/app?view=hub&hub=${encodeURIComponent(gateway.id)}`)}>{gateway.name}</a></li>{/each}</ul>
      </div>
    {/if}
    {#if error}<div class="dialog-error" role="alert">{error}</div>{/if}
    <div class="dialog-actions">
      <button bind:this={cancelButton} type="button" class="k-button" disabled={pending} onclick={close}>{blockedDelete ? t('ปิด', 'Close') : t('ยกเลิก', 'Cancel')}</button>
      {#if blockedDelete}<!-- nothing to confirm until the workspaces above are cleared -->
      {:else if requiresReload}<button type="button" class="k-button primary" disabled={pending} onclick={reload}>{t('โหลดข้อมูลล่าสุด', 'Reload latest data')}</button>
      {:else}<button type="submit" class="k-button" class:primary={action !== 'delete'} class:danger-solid={action === 'delete'} disabled={pending || completed || !canManage}>
        {#if pending}<LoaderCircle size={16} class="k-spin" aria-hidden="true" />{/if}{pending ? t('กำลังบันทึก…', 'Saving…') : t(`${label}${subject}`, `${label} ${subject}`)}
      </button>{/if}
    </div>
  </form>
</dialog>

<style>
	/* orca-type-remap v2 */
	/* orca-type-remap v1 */
  .lifecycle-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .lifecycle-actions.compact { flex-wrap: nowrap; gap: 4px; }
  .compact .lifecycle-button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--orca-radius, 8px); background: transparent; color: var(--orca-subtle, #6b7280); cursor: pointer; }
  .compact .lifecycle-button:hover { background: var(--orca-hover, #f0f1f3); color: var(--orca-ink, #151823); }
  .compact .lifecycle-button.delete-action:hover { background: var(--orca-deny-bg, #fdecee); color: var(--orca-deny, #b3262f); }
  .compact .lifecycle-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .delete-action { color: var(--orca-deny, #b3262f); }
  .compact .delete-action { color: var(--orca-subtle, #6b7280); }
  /* The dialog lives inside table action cells (white-space: nowrap); reset what it would inherit. */
  .lifecycle-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; border: 1px solid var(--orca-line, #e5e7eb); border-radius: var(--orca-radius-lg, 10px); background: var(--orca-surface, #fff); color: var(--orca-ink, #151823); box-shadow: var(--orca-dialog-shadow, 0 16px 48px -12px rgba(21, 24, 35, 0.28)); white-space: normal; text-align: start; }
  .lifecycle-dialog::backdrop { background: rgba(21, 24, 35, 0.45); }
  /* W0.2: a plain line icon, never on a tile. */
  .dialog-icon { display: flex; color: var(--orca-muted, #5b6270); }
  .dialog-icon.danger { color: var(--orca-deny, #b3262f); }
  .dialog-icon.warn { color: var(--orca-warn, #8a5a00); }
  .dialog-icon :global(svg) { width: 20px; height: 20px; }
  h2 { margin: 16px 0 4px; font-size: 15px; line-height: 1.4; font-weight: 600; }
  p { margin: 10px 0; line-height: 1.7; font-size: 13.5px; color: var(--orca-muted, #5b6270); }
  .entity-name { font-weight: 600; color: var(--orca-ink, #151823); overflow-wrap: anywhere; margin: 0 0 14px; }
  .preserved { font-size: 12px; color: var(--orca-subtle, #6b7280); }
  .affected-gateways { border: 1px solid var(--orca-line, #e5e7eb); background: var(--orca-surface-2, #fafafa); border-radius: var(--orca-radius, 8px); padding: 12px 14px; font-size: 12px; line-height: 1.7; }
  .affected-gateways strong { display: block; color: var(--orca-ink, #151823); }
  ul { padding-left: 20px; margin: 8px 0 0; max-height: 140px; overflow-y: auto; list-style: disc; }
  .affected-gateways a { color: var(--orca-ink, #151823); text-decoration: underline; text-underline-offset: 3px; }
  .dialog-error { margin-top: 14px; color: var(--orca-deny, #b3262f); background: var(--orca-deny-bg, #fdecee); border-radius: var(--orca-radius, 8px); padding: 10px 12px; font-size: 12px; line-height: 1.7; }
  .dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 22px; }
  button:focus-visible, a:focus-visible { outline: 2px solid var(--orca-focus, var(--orca-ink, #151823)); outline-offset: 2px; }
</style>
