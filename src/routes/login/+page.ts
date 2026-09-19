import { safeReturnPath } from '$lib/orca/locale.svelte';
import { UserService, type AuthProvider } from '$lib/services';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;
export const load: PageLoad = async ({ fetch, url, parent }) => {
	const { profile } = await parent();
	const rd = safeReturnPath(url.searchParams.get('rd'));
	if (profile?.loaded && !profile.unauthorized) throw redirect(302, rd);
	let authProviders: AuthProvider[] = [];
	let unavailable = false;
	try {
		authProviders = await UserService.listAuthProviders({ fetch });
	} catch {
		unavailable = true;
	}
	return { authProviders, rd, unavailable };
};
