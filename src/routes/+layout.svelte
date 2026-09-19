<script lang="ts">
 import Notifications from '$lib/components/Notifications.svelte';
 import ReLoginDialog from '$lib/components/ReLoginDialog.svelte';
 import SuccessNotifications from '$lib/components/SuccessNotifications.svelte';
 import { profile, appPreferences } from '$lib/stores';
 import '../app.css';
 import 'devicon/devicon.min.css';
 import type { LayoutData } from './$types';
 import { untrack, type Snippet } from 'svelte';
 let {children,data}:{children:Snippet;data:LayoutData}=$props();
 $effect(()=>{ const p=data.profile; const prefs=data.appPreferences; untrack(()=>{profile.initialize(p);appPreferences.initialize(prefs);}); if(typeof document!=='undefined') {document.documentElement.setAttribute('data-theme','nanobotlight');document.documentElement.classList.remove('dark');document.getElementById('initial-loader')?.classList.add('loaded');} });
</script>
<svelte:head><link rel="stylesheet" href="/orca-assets/fonts.css"/></svelte:head>
{@render children()}
<Notifications/><SuccessNotifications/><ReLoginDialog/>
