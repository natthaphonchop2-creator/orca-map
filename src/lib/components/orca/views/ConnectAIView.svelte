<script lang="ts">
	import { aiConnectionLine } from '$lib/orca/ai-connection';
	import { aiConnection } from '$lib/orca/ai-connection.svelte';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import MyConnections from '../MyConnections.svelte';
	import OrcaMCPAccess from '../OrcaMCPAccess.svelte';
	import PageHeader from '../ui/PageHeader.svelte';

	// view=connect-ai: เชื่อม AI ของฉัน. Until U3 builds the page from the
	// mockup, it mounts the parts that do this job today: the company link and
	// keys (OrcaMCPAccess) and the person's own program accounts (#accounts).
	let { data }: { data: OrcaBootstrap } = $props();
	const connected = $derived(aiConnection.state === 'connected');
</script>

<PageHeader
	title={term('connectMyAI', t)}
	subtitle={t('ให้ Claude หรือ ChatGPT ใช้ข้อมูลบริษัทได้ ทำครั้งเดียว ประมาณ 3 นาที ไม่ต้องใช้คีย์', 'Let Claude or ChatGPT use company data. Once, about 3 minutes, no key needed.')}
	status={{ label: aiConnectionLine(aiConnection, t), tone: connected ? 'ok' : 'neutral' }}
/>
<OrcaMCPAccess {data} />
<div id="accounts" class="connect-ai-accounts">
	<MyConnections {data} embedded />
</div>

<style>
	.connect-ai-accounts {
		scroll-margin-top: 80px;
	}
</style>
