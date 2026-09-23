<script lang="ts">
  import Connections from '$lib/components/orca/Connections.svelte';
  import { t } from '$lib/orca/locale.svelte';
  import { OrcaService, type OrcaBootstrap, type OrcaConnection } from '$lib/services/orca';
  import { X } from '@lucide/svelte';
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
    <div>
      <h2 id="connection-dialog-heading" bind:this={heading} tabindex="-1">{t('ตั้งค่าการเชื่อมต่อ', 'Set up connection')}</h2>
    </div>
    <button class="dialog-close" type="button" disabled={busy} onclick={close} aria-label={t('ปิดหน้าตั้งค่าการเชื่อมต่อ', 'Close connection setup')}>
      <X size={20} />
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
  .connection-dialog {
    width: min(760px, calc(100vw - 32px));
    max-width: none;
    max-height: min(860px, calc(100dvh - 40px));
    margin: auto;
    padding: 0;
    border: 1px solid var(--k-line, #dfe4dc);
    border-radius: 18px;
    background: var(--k-surface, #fff);
    color: var(--k-text, #1b241b);
    box-shadow: 0 24px 80px #14201838;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .connection-dialog::backdrop { background: #111a1d73; }
  header { position: sticky; top: 0; z-index: 2; background: var(--k-surface, #fff); display: flex; align-items: flex-start; gap: 20px; padding: 24px 28px; border-bottom: 1px solid var(--k-line, #dfe4dc); }
  header > div { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 22px; line-height: 1.4; }
  .dialog-close { display: grid; place-items: center; flex: 0 0 40px; min-height: 40px; border: 1px solid var(--k-line, #dfe4dc); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; }
  .dialog-close:disabled { opacity: .4; cursor: wait; }
  .dialog-body { padding: 24px 28px 28px; }
  .dialog-body :global(.k-panel) { margin-bottom: 16px; }
  .dialog-body :global(.k-grid-2) { grid-template-columns: 1fr; }
  .dialog-body :global(.k-field input), .dialog-body :global(.k-field select), .dialog-body :global(.k-field textarea) { max-width: 100%; }
  @media (max-width: 600px) {
    .connection-dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); border-radius: 14px; }
    header { padding: 18px; }
    .dialog-body { padding: 18px; }
    h2 { font-size: 19px; }
    .dialog-body :global(.k-panel) { padding: 16px; }
  }
</style>
