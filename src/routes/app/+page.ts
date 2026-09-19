import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ parent, url }) => {
	const { profile } = await parent();
	if (!profile?.id || profile.unauthorized) {
		const rd = `${url.pathname}${url.search}`;
		throw redirect(307, `/login?rd=${encodeURIComponent(rd)}`);
	}
};
