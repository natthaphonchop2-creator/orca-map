import { UserService, type Profile } from '$lib/services';
import { compileAppPreferences } from '$lib/stores/appPreferences.svelte';
import type { LayoutLoad } from './$types';
export const ssr = false;
export const prerender = false;
export const load: LayoutLoad = async ({ fetch }) => {
 let profile: Profile | undefined;
 let preferences = compileAppPreferences();
 try { profile = await UserService.getProfile({fetch}); } catch { profile = {id:'',email:'',iconURL:'',role:0,effectiveRole:0,groups:[],unauthorized:true,username:''}; }
 try { preferences = compileAppPreferences(await UserService.listAppPreferences({fetch})); } catch { /* sign-in remains available */ }
 return {profile, appPreferences:preferences};
};
