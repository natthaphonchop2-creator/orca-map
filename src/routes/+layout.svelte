<script lang="ts">
 import { page } from '$app/state';
 import Notifications from '$lib/components/Notifications.svelte';
 import ReLoginDialog from '$lib/components/ReLoginDialog.svelte';
 import SuccessNotifications from '$lib/components/SuccessNotifications.svelte';
 import { applyTheme, routeTheme } from '$lib/orca/theme';
 import { orcaTheme, watchTheme } from '$lib/orca/theme.svelte';
 import { profile, appPreferences } from '$lib/stores';
 import '../app.css';
 import 'devicon/devicon.min.css';
 // Global on purpose: every rule is scoped to :root[data-orca-theme] or .orca-workspace.orca-app.
 import '$lib/components/orca/orca-theme.css';
 import type { LayoutData } from './$types';
 import { onMount, untrack, type Snippet } from 'svelte';
 let {children,data}:{children:Snippet;data:LayoutData}=$props();
 $effect(()=>{ const p=data.profile; const prefs=data.appPreferences; untrack(()=>{profile.initialize(p);appPreferences.initialize(prefs);}); if(typeof document!=='undefined') document.getElementById('initial-loader')?.classList.add('loaded'); });
 // The boot script in app.html set the first theme. This keeps it right when the person
 // changes it, the device switches light/dark, another tab changes it, or the route changes
 // (/app <-> /login). A real switch turns transitions off for two frames so everything flips at once.
 onMount(watchTheme);
 $effect(()=>{ applyTheme(document.documentElement, routeTheme(page.url.pathname, orcaTheme.preference, orcaTheme.systemDark), (done)=>requestAnimationFrame(()=>requestAnimationFrame(done))); });
</script>
<svelte:head><link rel="stylesheet" href="/orca-assets/fonts.css"/></svelte:head>
{@render children()}
<Notifications/><SuccessNotifications/><ReLoginDialog/>
