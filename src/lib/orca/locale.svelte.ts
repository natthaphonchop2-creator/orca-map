import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import { keepCompany } from './company';

export type OrcaLocale = 'th' | 'en';
export const orcaLocale = $state<{ value: OrcaLocale }>({ value: 'th' });

export function initializeLocale() {
	if (!browser) return;
	const requested = new URL(window.location.href).searchParams.get('lang');
	let saved: string | null = null;
	try {
		saved = window.localStorage.getItem('orca.locale');
	} catch {
		/* storage is optional */
	}
	applyLocale(requested === 'en' || requested === 'th' ? requested : saved === 'en' ? 'en' : 'th');
}

function applyLocale(value: OrcaLocale) {
	orcaLocale.value = value;
	if (browser) {
		document.documentElement.lang = value;
		try {
			window.localStorage.setItem('orca.locale', value);
		} catch {
			/* storage is optional */
		}
	}
}

export function setLocale(value: OrcaLocale) {
	applyLocale(value);
	if (browser) {
		const url = new URL(window.location.href);
		url.searchParams.set('lang', value);
		replaceState(url, page.state);
	}
}

export function t(th: string, en: string) {
	return orcaLocale.value === 'en' ? en : th;
}

export function localeHref(path: string) {
	const url = new URL(path, 'https://orca.invalid');
	url.searchParams.set('lang', orcaLocale.value);
	// Links inside the workspace stay in this page's company.
	keepCompany(url);
	return url.pathname + url.search + url.hash;
}

export { safeReturnPath } from './navigation';
