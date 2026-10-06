import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { setPageAccount } from '$lib/services/writes';

export const ssr = false;
export const prerender = false;

// /app/files/<id>: a generated document's page (kv2 phase 2a, plan §2.4).
// It needs an ORCA sign-in, as the person who made the file; signed out, the
// sign-in brings them back here.
export const load: PageLoad = async ({ params, parent, url }) => {
	const { profile } = await parent();
	if (!profile?.id || profile.unauthorized) {
		throw redirect(307, `/login?rd=${encodeURIComponent(url.pathname)}`);
	}
	setPageAccount(profile.id);
	return { id: params.id, email: profile.email ?? '' };
};
