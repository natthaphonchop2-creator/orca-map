import { googleSignInReason } from '$lib/orca/google-signin';
import { safeReturnPath } from '$lib/orca/locale.svelte';
import { aiLoginMode, AI_HANDOFF_PAGE, AI_HANDOFF_RETURN } from '$lib/orca/ai-handoff';
import { UserService, type AuthProvider } from '$lib/services';
import { OrcaService } from '$lib/services/orca';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;
export const load: PageLoad = async ({ fetch, url, parent }) => {
	const { profile } = await parent();
	// An AI app's sign-in (§14h): both sign-ins return to the hand-off page with
	// this fixed address, never one built from the query.
	const ai = aiLoginMode(url.searchParams);
	const rd = ai ? AI_HANDOFF_RETURN : safeReturnPath(url.searchParams.get('rd'));
	const signedIn = Boolean(profile?.loaded && !profile.unauthorized);
	// Someone already signed in may try Google to confirm an email for an
	// invitation; if Google refuses, show why instead of sending them straight back.
	// Already signed in for an AI app: the hand-off page asks which account first.
	if (signedIn && !googleSignInReason(url.searchParams.get('error'))) throw redirect(302, ai ? AI_HANDOFF_PAGE : rd);
	let authProviders: AuthProvider[] = [];
	let unavailable = false;
	try {
		authProviders = await UserService.listAuthProviders({ fetch });
	} catch {
		unavailable = true;
	}
	// Google is offered only when an owner turned it on; the password stays.
	let google = false;
	try {
		google = (await OrcaService.signInMethods(fetch)).google === true;
	} catch {
		google = false;
	}
	return { authProviders, rd, ai, unavailable, google, signedIn };
};
