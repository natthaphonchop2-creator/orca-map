import { OrcaService } from '$lib/services/orca';
import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = false;

// The page works signed out: it greets the person, then sends them to sign in
// and back here to accept. With Google on, a new person can make their account
// with the invited email's Google account.
export const load: PageLoad = async ({ params, parent, fetch }) => {
	const { profile } = await parent();
	const signedIn = Boolean(profile?.id) && !profile?.unauthorized;
	let google = false;
	if (!signedIn) {
		try {
			google = (await OrcaService.signInMethods(fetch)).google === true;
		} catch {
			google = false;
		}
	}
	return { token: params.token, signedIn, email: signedIn ? (profile?.email ?? '') : '', google };
};
