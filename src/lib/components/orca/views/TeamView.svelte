<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { localeHref } from '$lib/orca/locale.svelte';
	import { TEAM_TABS, type TeamTab } from '$lib/orca/navigation';
	import type { OrcaBootstrap } from '$lib/services/orca';
	import TeamAccess from '../TeamAccess.svelte';

	// view=members: ทีม with its tabs สมาชิก · คำเชิญ · แผนก held in the address
	// (&tab=invitations|departments). The page itself is today's TeamAccess.
	let { data, onchanged }: { data: OrcaBootstrap; onchanged: () => Promise<void> } = $props();
	const requested = $derived(page.url.searchParams.get('tab'));
	const tab = $derived<TeamTab>((TEAM_TABS as readonly string[]).includes(requested ?? '') ? (requested as TeamTab) : 'members');
	function ontab(next: TeamTab) {
		void goto(localeHref(next === 'members' ? '/app?view=members' : `/app?view=members&tab=${next}`), { keepFocus: true, noScroll: true });
	}
</script>

<div class="arcade-embedded"><TeamAccess {data} {onchanged} {tab} {ontab} /></div>
