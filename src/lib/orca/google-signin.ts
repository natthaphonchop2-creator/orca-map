/** The address Google returns to; it must be registered on the Google client. */
export function googleRedirectURI(origin: string): string {
	return `${origin.replace(/\/+$/, '')}/oauth2/callback`;
}

/** Starts Google sign-in through the password provider, returning to rd. */
export function googleStartHref(origin: string, rd: string, provider: { namespace?: string; id: string }): string {
	const destination = new URL('/oauth2/start', origin);
	destination.searchParams.set('rd', rd);
	destination.searchParams.set('obot-auth-provider', `${provider.namespace ?? 'default'}/${provider.id}`);
	destination.searchParams.set('via', 'google');
	return destination.pathname + destination.search;
}

/** Splits what an owner types into domains: commas, spaces or new lines, "@" allowed. */
export function parseDomains(value: string): string[] {
	const domains: string[] = [];
	for (const part of value.split(/[\s,;]+/)) {
		const domain = part.trim().replace(/^@/, '').toLowerCase();
		if (domain && !domains.includes(domain)) domains.push(domain);
	}
	return domains;
}

/** Anyone can make an account in Google's consumer domains, so they never let people join by themselves. */
export function consumerDomains(domains: string[]): string[] {
	return domains.filter((domain) => domain === 'gmail.com' || domain === 'googlemail.com');
}

export type GoogleSignInReason =
	| 'off'
	| 'unreachable'
	| 'expired'
	| 'cancelled'
	| 'unverified'
	| 'domain'
	| 'workspace'
	| 'organization'
	| 'member'
	| 'failed';

/** The reason in /login?error=google_<reason>, or undefined for other errors. */
export function googleSignInReason(error: string | null): GoogleSignInReason | undefined {
	if (!error?.startsWith('google_')) return undefined;
	const reason = error.slice('google_'.length);
	return (['off', 'unreachable', 'expired', 'cancelled', 'unverified', 'domain', 'workspace', 'organization', 'member'] as const).find((value) => value === reason) ?? 'failed';
}
