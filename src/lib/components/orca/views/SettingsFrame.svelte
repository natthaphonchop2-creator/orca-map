<script module lang="ts">
	import { OrcaUserSourcesService } from '$lib/services/orca-user-sources';
	import type { SignInSources } from '$lib/orca/settings-sections';
	// Whether the company has sign-in sources (for ขั้นสูง), read once per page
	// and company, as ตั้งค่า always did; ทีม and พื้นที่ทำงาน AI reuse it.
	const read = new Map<string, Promise<SignInSources>>();
	function signInSources(company: string): Promise<SignInSources> {
		let found = read.get(company);
		if (!found) {
			found = OrcaUserSourcesService.list().then(
				(result) => (result.items.length ? 'some' : 'none') as SignInSources,
				() => {
					read.delete(company);
					return 'error' as SignInSources;
				}
			);
			read.set(company, found);
		}
		return found;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { currentCompany } from '$lib/orca/company';
	import { term } from '$lib/orca/glossary';
	import { t } from '$lib/orca/locale.svelte';
	import { SETTINGS_TAB_HREF, settingsTabs, type SettingsTabID } from '$lib/orca/settings-sections';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import PageHeader from '../ui/PageHeader.svelte';
	import PageTabs from '../ui/PageTabs.svelte';
	import { claimPageHeader } from '../ui/page-header-context';

	// ตั้งค่า (W0): one header and one tab bar for บริษัท · ทีม · พื้นที่ทำงาน AI ·
	// บัญชีของฉัน · ขั้นสูง. ทีม (view=members) and พื้นที่ทำงาน AI
	// (view=workspaces) keep their own addresses, pages and role checks; the
	// frame only puts them under ตั้งค่า. ขั้นสูง shows once the company has a
	// sign-in source, as before.
	let {
		data,
		current,
		sources: given,
		children
	}: {
		data: Pick<OrcaBootstrap, 'canManage'>;
		current: SettingsTabID;
		/** ตั้งค่า's own reading, when it has one; otherwise the frame reads it (managers only). */
		sources?: SignInSources;
		children: Snippet;
	} = $props();
	claimPageHeader();
	let loaded = $state<SignInSources>('unknown');
	const sources = $derived(given ?? loaded);
	onMount(() => {
		if (given !== undefined || !data.canManage) return;
		let alive = true;
		void signInSources(currentCompany()).then((value) => {
			if (alive) loaded = value;
		});
		return () => {
			alive = false;
		};
	});
	const labels = $derived<Record<SettingsTabID, string>>({
		company: term('company', t),
		team: term('team', t),
		workspaces: term('workspaces', t),
		account: term('myAccount', t),
		advanced: term('advanced', t)
	});
	const tabs = $derived(settingsTabs(data.canManage === true, sources).map((id) => ({ id, label: labels[id], href: SETTINGS_TAB_HREF[id] })));
</script>

<PageHeader
	title={term('settings', t)}
	subtitle={data.canManage ? t('บริษัท ทีม พื้นที่ทำงาน AI และบัญชีของคุณ', 'Company, team, AI workspaces and your account.') : t('พื้นที่ทำงาน AI และบัญชีของคุณ', 'Your AI workspaces and your account.')}
/>
<PageTabs {tabs} {current} label={t('หมวดการตั้งค่า', 'Settings sections')} />
{@render children()}
