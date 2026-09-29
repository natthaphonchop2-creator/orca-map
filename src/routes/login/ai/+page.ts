import { AI_LOGIN, handoffPageParams } from '$lib/orca/ai-handoff';
import { setPageAccount } from '$lib/services/writes';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// An AI app's sign-in continues here (C4 design §14h). The backend's claim
// sends the browser here, and both sign-ins on /login return here.
export const ssr = false;
export const prerender = false;
export const load: PageLoad = async ({ url, parent }) => {
	const { profile } = await parent();
	const { expired, signed } = handoffPageParams(url.searchParams);
	const signedIn = Boolean(profile?.loaded && !profile.unauthorized);
	// Signed out: sign in first, in AI mode. The expired message needs no account.
	if (!signedIn && !expired) {
		const lang = url.searchParams.get('lang');
		throw redirect(302, lang === 'th' || lang === 'en' ? `${AI_LOGIN}&lang=${lang}` : AI_LOGIN);
	}
	// The page's account is fixed before its first request (X-Orca-Account),
	// so another tab's sign-in can't continue as someone else.
	if (signedIn && profile?.id) setPageAccount(profile.id);
	return {
		expired,
		signed,
		signedIn,
		account: signedIn ? (profile?.id ?? '') : '',
		email: signedIn ? profile?.email || profile?.username || '' : ''
	};
};
