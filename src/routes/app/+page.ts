import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { chooseCompany, companyPinned, rememberedCompany, setPageCompany, type CompanyPlace, type OrcaCompanyChoice } from '$lib/orca/company';
import { OrcaService } from '$lib/services/orca';

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
	const explicit = url.searchParams.get('org');
	place ??= (async () => {
		let companies: OrcaCompanyChoice[] | undefined;
		try {
			companies = await OrcaService.companies();
		} catch {
			// An older server has no list: open "default", as before companies.
			companies = undefined;
		}
		const chosen = chooseCompany(explicit, rememberedCompany(profile.id), companies);
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
