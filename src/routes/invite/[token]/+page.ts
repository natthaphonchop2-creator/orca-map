import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = false;

// The page works signed out: it greets the person, then sends them to sign in
// and back here to accept.
export const load: PageLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	const signedIn = Boolean(profile?.id) && !profile?.unauthorized;
	return { token: params.token, signedIn, email: signedIn ? (profile?.email ?? '') : '' };
};
