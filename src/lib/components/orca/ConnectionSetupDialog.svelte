<script lang="ts">
  import Connections from '$lib/components/orca/Connections.svelte';
  import { t } from '$lib/orca/locale.svelte';
  import { OrcaService, type OrcaBootstrap, type OrcaConnection } from '$lib/services/orca';
  import { Plug, X } from '@lucide/svelte';
  import { onMount } from 'svelte';

  let {
    data,
    initialSourceID = '',
    onclose,
    oncompleted,
  }: {
    data: OrcaBootstrap;
    initialSourceID?: string;
    onclose: () => void;
    oncompleted: (connection: OrcaConnection) => Promise<void>;
  } = $props();
  let dialog: HTMLDialogElement;
  let heading: HTMLHeadingElement;
  let refreshedData = $state<OrcaBootstrap>();
  let busy = $state(false);
  const activeData = $derived(refreshedData ?? data);

  function close() {
    if (!busy) onclose();
  }
  async function refresh() {
    refreshedData = await OrcaService.bootstrap();
  }
  onMount(() => {
    const opener = document.activeElement;
    dialog.showModal();
    heading.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  });
</script>

<dialog
  bind:this={dialog}
  class="connection-dialog"
  aria-labelledby="connection-dialog-heading"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <header>
    <span class="dialog-icon" aria-hidden="true"><Plug size={20} /></span>
    <div>
      <h2 class="dialog-title" id="connection-dialog-heading" bind:this={heading} tabindex="-1">{t('เชื่อมต่อระบบ', 'Connect a system')}</h2>
    </div>
    <button class="dialog-close" type="button" disabled={busy} onclick={close} aria-label={t('ปิดหน้าต่างเชื่อมต่อระบบ', 'Close the system connection dialog')} title={t('ปิด', 'Close')}>
      <X size={16} aria-hidden="true" />
    </button>
  </header>
  <div class="dialog-body" aria-busy={busy}>
    <Connections
      data={activeData}
      {initialSourceID}
      initiallyAddSource
      embedded
      onchanged={refresh}
      onbusychange={(value) => busy = value}
      {oncompleted}
    />
  </div>
</dialog>

<style>
  /* This dialog loads before the shared workspace CSS, so shared-class overrides carry extra classes. */
  .connection-dialog {
    width: min(760px, calc(100vw - 32px));
    max-width: none;
    max-height: min(860px, calc(100dvh - 40px));
    margin: auto;
    padding: 0;
    border: 1px solid var(--orca-line, #e5e7eb);
    border-radius: var(--orca-radius-lg, 10px);
    background: var(--orca-surface, #fff);
    color: var(--orca-ink, #151823);
    box-shadow: 0 16px 48px -12px rgba(21, 24, 35, 0.28);
    overflow: auto;
    overscroll-behavior: contain;
  }
  .connection-dialog::backdrop {
    background: rgba(21, 24, 35, 0.45);
  }
  header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--orca-line, #e5e7eb);
    background: var(--orca-surface, #fff);
  }
  header > div {
    flex: 1;
    min-width: 0;
  }
  .dialog-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--orca-radius, 8px);
    background: var(--orca-secondary, #f4f4f5);
    color: var(--orca-nav, #3f4452);
  }
  .connection-dialog .dialog-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
  }
  .dialog-close {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--orca-radius, 8px);
    background: transparent;
    color: var(--orca-subtle, #6b7280);
    cursor: pointer;
  }
  .dialog-close:hover {
    background: var(--orca-hover, #f0f1f3);
    color: var(--orca-ink, #151823);
  }
  .dialog-close:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .dialog-body {
    padding: 20px 24px 24px;
  }
  /* Top-level step panels only; the account setup nested inside a step stays flat. */
  .connection-dialog .dialog-body :global(.k-panel:not(.source-setup)) {
    margin-bottom: 16px;
  }
  .dialog-body :global(.k-grid-2) {
    grid-template-columns: 1fr;
  }
  .dialog-body :global(.k-field input),
  .dialog-body :global(.k-field select),
  .dialog-body :global(.k-field textarea) {
    max-width: 100%;
  }
  @media (max-width: 600px) {
    .connection-dialog {
      width: calc(100vw - 16px);
      max-height: calc(100dvh - 16px);
    }
    header {
      padding: 14px 16px;
    }
    .dialog-body {
      padding: 16px;
    }
    .connection-dialog .dialog-body :global(.k-panel:not(.source-setup)) {
      padding: 16px;
    }
  }
</style>
