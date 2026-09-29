<script lang="ts">
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import { OrcaService, type OrcaBootstrap, type OrcaConnection } from '$lib/services/orca';
	import AddProgramFlow from './programs/AddProgramFlow.svelte';
	import Sheet from './ui/Sheet.svelte';

	// เชื่อมโปรแกรม from the workspace form: the same add-program steps in a side
	// sheet (never a modal on a modal). It finishes by handing back the saved
	// program, or one the company already connected; the form picks it.
	let {
		data,
		initialSourceID = '',
		onclose,
		oncompleted
	}: {
		data: OrcaBootstrap;
		initialSourceID?: string;
		onclose: () => void;
		oncompleted: (connection: OrcaConnection) => Promise<void>;
	} = $props();
	let open = $state(true);
	let busy = $state(false);
	let refreshed = $state<OrcaBootstrap>();
	const current = $derived(refreshed ?? data);

	// The form's own data is refreshed by the caller after completion; the sheet keeps its copy current meanwhile.
	async function refresh() {
		try {
			refreshed = await OrcaService.bootstrap();
		} catch {
			// The saved program still comes back through oncompleted.
		}
	}
</script>

<Sheet bind:open {busy} title={term('addProgram', t)} description={t('เลือกโปรแกรม เชื่อมบัญชี แล้วเลือกสิ่งที่ AI ทำได้', 'Choose a program, connect it, then choose what AI can do.')} onclose={onclose}>
	<AddProgramFlow
		data={current}
		mode="sheet"
		{initialSourceID}
		onchanged={refresh}
		onbusychange={(value) => (busy = value)}
		{oncompleted}
	/>
</Sheet>
