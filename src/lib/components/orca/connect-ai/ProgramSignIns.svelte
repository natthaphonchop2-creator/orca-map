<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { CircleAlert, RefreshCw } from '@lucide/svelte';
	import CatalogIcon from '$lib/orca/CatalogIcon.svelte';
	import { workspaceToolingReady } from '$lib/orca/activation';
	import { catalogSourceDisplayName } from '$lib/orca/catalog';
	import { sourceAccountState } from '$lib/orca/connection-presentation';
	import { namesText } from '$lib/orca/connect-ai';
	import { gatewayHasMember } from '$lib/orca/gateway-sources';
	import { t } from '$lib/orca/locale.svelte';
	import { companyAccountSources, personalAccountReader, personalSetup, personalSources, type PersonalSetup, type PersonalSource } from '$lib/orca/personal-connections';
	import { OrcaService, type OrcaBootstrap } from '$lib/services/orca';
	import Sheet from '../ui/Sheet.svelte';
	import SourceSetup from '../SourceSetup.svelte';

	// "อีก 1 ขั้น: ลงชื่อเข้าใช้ {โปรแกรม} ของคุณ" for every program in this
	// person's workspaces that still needs their own account, then the ones
	// already signed in (to sign in again). Signing in opens the program's
	// setup in a side panel. A program on a company account (บัญชีกลาง) needs
	// nothing from members: it is listed as such, with no button.
	let { data, onshown }: { data: OrcaBootstrap; /** The section is on the page (an "#accounts" link scrolls to it then). */ onshown?: () => void } = $props();
	type AccountRecord = { status: 'loading' | 'ready' | 'error'; setup?: PersonalSetup };
	let accounts = $state<Record<string, AccountRecord>>({});
	let accountUserID = $state('');
	let signingIn = $state<{ sourceID: string; name: string }>();
	let sheetOpen = $state(false);
	const own: Record<string, AccountRecord> = $derived(accountUserID === data.currentUserID ? accounts : {});
	const sources = $derived(personalSources(data));
	const companySources = $derived(companyAccountSources(data));
	const scope = $derived(
		JSON.stringify({
			user: data.currentUserID,
			manager: data.canManage,
			sources: sources.map((source) => ({
				id: source.sourceID,
				readable: source.canReadSetup,
				connections: source.connections.map((item) => [item.id, item.version]),
				hubs: source.hubs.map((item) => [item.id, item.version, item.status])
			}))
		})
	);
	const reader = personalAccountReader(
		async (sourceID, signal) => personalSetup(await OrcaService.sourceSetup(sourceID, signal), sourceID),
		(event) => {
			const known = accounts[event.sourceID];
			// Checking again keeps the last answer on screen: the rows (and the button focus returns
			// to after the sign-in panel closes) don't vanish while it loads.
			if (event.status === 'loading' && known?.status === 'ready') return;
			accounts[event.sourceID] = event.status === 'ready' ? { status: 'ready', setup: event.value } : { status: event.status };
		}
	);
	function refresh() {
		// Another person (a new session in this tab) starts from nothing.
		if (accountUserID !== data.currentUserID) accounts = {};
		accountUserID = data.currentUserID;
		reader.replace(sources.filter((source) => source.canReadSetup).map((source) => source.sourceID));
	}
	$effect(() => {
		if (scope) untrack(refresh);
	});
	onDestroy(() => reader.dispose());

	/** Signing in needs an active, ready workspace of this person that uses the program. */
	function canSignIn(source: PersonalSource) {
		const hub = source.hubs.find((item) => item.id === source.manageHubID);
		return !!hub && gatewayHasMember(hub, data.currentUserID) && hub.status === 'active' && workspaceToolingReady(hub, source.connections);
	}
	function accountState(source: PersonalSource) {
		const account = own[source.sourceID];
		if (!source.canReadSetup || !canSignIn(source)) return 'unavailable';
		if (!account || account.status === 'loading') return 'loading';
		if (account.status === 'error') return 'unknown';
		if (account.setup?.oauthClientRequired && !account.setup.oauthClientConfigured) return 'client-needed';
		return sourceAccountState(account.setup);
	}
	type Row = { source: PersonalSource; name: string; state: string; workspaces: string };
	const rows = $derived<Row[]>(
		sources.map((source) => {
			const setup = own[source.sourceID]?.setup;
			return {
				source,
				state: accountState(source),
				name: catalogSourceDisplayName({ name: setup?.name || source.connections[0].name, endpointHost: setup?.endpointHost, managedProvider: setup?.managedProvider }),
				// The workspaces that wait for this sign-in, as in "…ของฝ่ายบัญชีได้".
				workspaces: namesText(
					source.hubs.filter((hub) => hub.status === 'active' && workspaceToolingReady(hub, source.connections)).map((hub) => hub.name),
					t
				)
			};
		})
	);
	const pending = $derived(rows.filter((row) => row.state === 'account-needed' || row.state === 'not-configured'));
	const blocked = $derived(rows.filter((row) => row.state === 'client-needed' || row.state === 'unknown'));
	const signedIn = $derived(rows.filter((row) => row.state === 'account-connected' || row.state === 'configured'));
	const shown = $derived(pending.length + blocked.length + signedIn.length + companySources.length > 0);
	$effect(() => {
		if (shown) untrack(() => onshown?.());
	});
	function open(row: Row) {
		signingIn = { sourceID: row.source.sourceID, name: row.name };
		sheetOpen = true;
	}
</script>

{#if shown}
	<section class="ca-programs" id="accounts" aria-label={t('บัญชีโปรแกรมของคุณ', 'Your program accounts')}>
		{#each pending as row (row.source.sourceID)}
			<article class="ca-next">
				<span class="ca-logo"><CatalogIcon name={row.name} size={28} /></span>
				<div class="ca-copy">
					<h2>{t(`อีก 1 ขั้น: ลงชื่อเข้าใช้ ${row.name} ของคุณ`, `One more step: sign in to your ${row.name}`)}</h2>
					<p>{row.workspaces
						? t(`AI จะดึงข้อมูล ${row.name} ของ${row.workspaces}ได้ เมื่อคุณลงชื่อเข้าใช้ด้วยบัญชีตัวเอง`, `AI can reach ${row.name} for ${row.workspaces} once you sign in with your own account.`)
						: t(`AI จะดึงข้อมูล ${row.name} ให้คุณได้ เมื่อคุณลงชื่อเข้าใช้ด้วยบัญชีตัวเอง`, `AI can reach ${row.name} for you once you sign in with your own account.`)}</p>
					<p class="ca-own">{t(`ไม่มีบัญชีของตัวเอง? ขอให้ผู้ดูแลเพิ่มผู้ใช้ใน ${row.name} อย่าใช้บัญชีร่วมกับคนอื่น`, `No account of your own? Ask your admin to add a ${row.name} user for you. Don't share someone else's.`)}</p>
				</div>
				<button type="button" class="k-button ca-go" onclick={() => open(row)}>{t(`ลงชื่อเข้าใช้ ${row.name}`, `Sign in to ${row.name}`)}</button>
			</article>
		{/each}
		{#each blocked as row (row.source.sourceID)}
			<article class="ca-next quiet">
				<span class="ca-logo"><CatalogIcon name={row.name} size={28} /></span>
				<div class="ca-copy">
					{#if row.state === 'client-needed'}
						<h2>{t(`${row.name}: รอทีม ORCA ตั้งค่าการลงชื่อเข้าใช้`, `${row.name}: waiting for the ORCA team to set up sign-in`)}</h2>
						<p>{t('เมื่อตั้งค่าเสร็จ ปุ่มลงชื่อเข้าใช้จะขึ้นที่นี่', 'Once it is set up, the sign-in button appears here.')}</p>
					{:else}
						<h2><CircleAlert size={16} aria-hidden="true" />{t(`อ่านสถานะบัญชี ${row.name} ไม่สำเร็จ`, `Could not read your ${row.name} account`)}</h2>
						<p>{t('ลองอีกครั้ง หรือโหลดหน้านี้ใหม่', 'Try again, or reload this page.')}</p>
					{/if}
				</div>
				{#if row.state === 'unknown'}<button type="button" class="k-button small" onclick={() => reader.retry(row.source.sourceID)}><RefreshCw size={14} aria-hidden="true" />{t('ลองอีกครั้ง', 'Try again')}</button>{/if}
			</article>
		{/each}
		{#if companySources.length}
			<div class="ca-signed">
				<h2>{t('โปรแกรมที่ใช้บัญชีกลาง', 'Programs on a company account')}</h2>
				<p>{t('ผู้ดูแลเชื่อมบัญชีเดียวไว้ให้ทุกคน คุณไม่ต้องลงชื่อเข้าใช้เอง ถ้า AI ใช้ไม่ได้ ให้แจ้งผู้ดูแล', 'A manager connected one account for everyone, so you never sign in yourself. If AI can’t use it, tell a manager.')}</p>
				<ul>
					{#each companySources as source (source.sourceID)}
						<li>
							<span class="ca-logo small"><CatalogIcon name={source.name} size={22} /></span>
							<span class="ca-signed-copy"><b>{source.name}</b><span class="ca-done">{t('ใช้บัญชีกลาง', 'Uses the company account')}</span></span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if signedIn.length}
			<div class="ca-signed">
				<h2>{t('โปรแกรมที่คุณลงชื่อเข้าใช้แล้ว', 'Programs you signed in to')}</h2>
				<p>{t('ถ้า AI ดึงข้อมูลจากโปรแกรมไหนไม่ได้ ให้กด ลงชื่อเข้าใช้ใหม่ ที่โปรแกรมนั้น', 'If AI can’t reach a program, choose Sign in again on it.')}</p>
				<ul>
					{#each signedIn as row (row.source.sourceID)}
						<li>
							<span class="ca-logo small"><CatalogIcon name={row.name} size={22} /></span>
							<span class="ca-signed-copy"><b>{row.name}</b><span class="ca-done">{row.state === 'account-connected' ? t('ลงชื่อเข้าใช้ไว้แล้ว', 'Signed in') : t('บันทึกบัญชีไว้แล้ว', 'Account saved')}</span></span>
							<button type="button" class="k-button small" onclick={() => open(row)} aria-label={t(`ลงชื่อเข้าใช้ ${row.name} ใหม่`, `Sign in to ${row.name} again`)}>{t('ลงชื่อเข้าใช้ใหม่', 'Sign in again')}</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
{/if}

{#if signingIn}
	<Sheet
		bind:open={sheetOpen}
		title={t(`ลงชื่อเข้าใช้ ${signingIn.name}`, `Sign in to ${signingIn.name}`)}
		description={t('ใช้บัญชีของคุณเอง AI จะทำได้เฉพาะสิ่งที่บัญชีนี้ทำได้', 'Use your own account. AI can do only what this account can.')}
		onclose={refresh}
	>
		<SourceSetup sourceID={signingIn.sourceID} sourceLabel={signingIn.name} />
	</Sheet>
{/if}

<style>
	/* orca-type-remap v1 */
	.ca-programs {
		display: grid;
		gap: 14px;
		scroll-margin-top: 80px;
	}
	.ca-next {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 18px 20px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.ca-next.quiet {
		background: var(--orca-surface-2);
	}
	.ca-logo {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--orca-line);
		border-radius: 10px;
		background: var(--orca-logo-tile);
		color: var(--orca-text-2);
	}
	.ca-logo.small {
		width: 34px;
		height: 34px;
		border-radius: 8px;
	}
	.ca-logo :global(.orca-catalog-icon) {
		padding: 0 !important;
		background: transparent !important;
	}
	/* A program without a logo keeps the plain tile, in both themes. */
	.ca-logo:has(:global(.orca-catalog-icon-fallback)) {
		background: var(--orca-secondary);
	}
	.ca-copy {
		flex: 1;
		min-width: 0;
	}
	.ca-copy h2 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		color: var(--orca-ink);
		font-size: 15px;
		font-weight: 650;
		line-height: 1.45;
	}
	.ca-copy h2 :global(svg) {
		flex: none;
		color: var(--orca-warn);
	}
	.ca-copy p {
		margin: 2px 0 0;
		color: var(--orca-muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.ca-copy p.ca-own {
		margin-top: 6px;
		color: var(--orca-text-2);
		font-size: 12.5px;
	}
	.ca-go {
		flex: none;
		min-height: 42px !important;
		padding: 0 16px !important;
		font-weight: 600 !important;
	}
	.ca-signed {
		margin-top: 12px;
	}
	.ca-signed h2 {
		margin: 0;
		color: var(--orca-ink);
		font-size: 14px;
		font-weight: 650;
	}
	.ca-signed > p {
		margin: 2px 0 10px;
		color: var(--orca-muted);
		font-size: 13px;
	}
	.ca-signed ul {
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
		list-style: none;
	}
	.ca-signed li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-top: 1px solid var(--orca-line-soft);
	}
	.ca-signed li:first-child {
		border-top: 0;
	}
	.ca-signed-copy {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.ca-signed b {
		color: var(--orca-ink);
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.4;
	}
	.ca-done {
		color: var(--orca-ok);
		font-size: 12px;
		font-weight: 600;
	}
	@container ca (max-width: 560px) {
		.ca-next {
			flex-wrap: wrap;
			align-items: flex-start;
			padding: 16px;
		}
		.ca-copy {
			flex-basis: calc(100% - 60px);
		}
		.ca-go {
			width: 100%;
		}
	}
</style>
