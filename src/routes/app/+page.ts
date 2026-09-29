import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { companyPinned, DEFAULT_COMPANY, rememberedCompany, resolvePlace, setPageCompany, type CompanyPlace } from '$lib/orca/company';
import { parseErrorContent } from '$lib/errors';
import { OrcaService } from '$lib/services/orca';
import { setPageAccount } from '$lib/services/writes';

export const ssr = false;
export const prerender = false;

// A page picks its company once, before its first request, and keeps it.
// Another `org` in the address loads a new page (see +page.svelte).
let place: Promise<CompanyPlace> | undefined;

export const load: PageLoad = async ({ parent, url }) => {
	const { profile } = await parent();
	if (!profile?.id || profile.unauthorized) {
		const rd = `${url.pathname}${url.search}`;
		throw redirect(307, `/login?rd=${encodeURIComponent(rd)}`);
	}
	// Every request this page makes names this account, its first included.
	setPageAccount(profile.id);
	// The platform area (the ORCA team's) always opens the default company,
	// whatever company another address or tab chose (workspace UX critique 12).
	const platform = url.searchParams.get('view') === 'platform';
	if (platform && url.searchParams.has('org') && url.searchParams.get('org') !== DEFAULT_COMPANY) {
		const target = new URL(url);
		target.searchParams.set('org', DEFAULT_COMPANY);
		throw redirect(307, `${target.pathname}${target.search}${target.hash}`);
	}
	const explicit = platform ? DEFAULT_COMPANY : url.searchParams.get('org');
	place ??= (async () => {
		// An older server has no list (404): it opens "default", as before
		// companies. Any other failure opens nothing.
		const chosen = await resolvePlace(OrcaService.companies, (error) => parseErrorContent(error).status === 404, explicit, rememberedCompany(profile.id));
		if (chosen.kind === 'company') setPageCompany(chosen.id, chosen.companies);
		return chosen;
	})();
	const chosen = await place;
	// Keep the company in the address, so a reload or a copied link stays in
	// it whatever another tab chooses. Done here, before the page renders:
	// the router can't change the address while the first page mounts.
	if (chosen.kind === 'company' && companyPinned() && !url.searchParams.has('org')) {
		const target = new URL(url);
		target.searchParams.set('org', chosen.id);
		throw redirect(307, `${target.pathname}${target.search}${target.hash}`);
	}
	return { place: chosen, account: profile.id };
};
