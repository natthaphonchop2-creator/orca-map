<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { localeHref } from '$lib/orca/locale.svelte';
	import { TEAM_TABS, type TeamTab } from '$lib/orca/navigation';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import { onMount, untrack } from 'svelte';
	import TeamAccess from '../TeamAccess.svelte';

	// view=members: ทีม with its tabs สมาชิก · คำเชิญ · แผนก held in the address
	// (&tab=invitations|departments). The page itself is today's TeamAccess.
	let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
	const requested = $derived(page.url.searchParams.get('tab'));
	// &member= (ค้นหา…, W0.2): the list opens filtered to that person.
	const member = $derived(page.url.searchParams.get('member') ?? '');
	const tab = $derived<TeamTab>((TEAM_TABS as readonly string[]).includes(requested ?? '') ? (requested as TeamTab) : 'members');
	// &invite=1 (Home's "ส่งลิงก์เชิญ"): the invite dialog opens once; a reload does not reopen it.
	const invite = untrack(() => data.canManage && page.url.searchParams.get('invite') === '1');
	onMount(() => {
		if (!page.url.searchParams.has('invite')) return;
		const url = new URL(page.url.href);
		url.searchParams.delete('invite');
		try {
			replaceState(url.pathname + url.search + url.hash, page.state);
		} catch {
			// Before the router starts: the dialog may open again on reload.
		}
	});
	function ontab(next: TeamTab) {
		void goto(localeHref(next === 'members' ? '/app?view=members' : `/app?view=members&tab=${next}`), { keepFocus: true, noScroll: true });
	}
</script>

<div class="arcade-embedded"><TeamAccess {data} {onchanged} {tab} {ontab} {invite} {member} /></div>
