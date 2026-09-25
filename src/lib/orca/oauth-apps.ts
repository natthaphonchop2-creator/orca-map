import type { OrcaCandidate } from '$lib/services/orca';

export type OAuthAppProvider = 'google' | 'microsoft';

export type OAuthAppConnector = { id: string; name: string; ready: boolean };

/** One operator OAuth app that every connector of a provider signs in through. */
export type ManagedOAuthApp = {
	provider: OAuthAppProvider;
	connectors: OAuthAppConnector[];
	ready: boolean;
	/** Where a single Client ID and secret covers the whole provider; absent when nothing is missing. */
	setupSourceID?: string;
	/** Only the installation owner may enter app credentials. */
	canConfigure: boolean;
	scopes: string[];
};

/** A catalog system that needs its own app registered with the vendor before anyone can sign in. */
export type CustomOAuthApp = { id: string; name: string; endpointHost?: string; canConfigure: boolean };

const PROVIDERS: OAuthAppProvider[] = ['google', 'microsoft'];

// Mirrors pkg/mcp/orca_managed_providers.go. Google connectors fall back to the
// Google Drive app and Microsoft ones store theirs on Outlook, so configuring
// that source once covers every connector of the provider.
const PROVIDER_SETUP_SOURCE: Record<OAuthAppProvider, string> = {
	google: 'default-orca-managed-google-drive',
	microsoft: 'default-orca-managed-microsoft-outlook'
};

const GOOGLE = 'https://www.googleapis.com/auth/';
const CONNECTOR_SCOPES: Record<string, string[]> = {
	'google-drive': [GOOGLE + 'drive.readonly'],
	gmail: [GOOGLE + 'gmail.readonly'],
	'google-calendar': [GOOGLE + 'calendar.calendarlist.readonly', GOOGLE + 'calendar.events.readonly'],
	'google-docs': [GOOGLE + 'documents.readonly'],
	'google-sheets': [GOOGLE + 'spreadsheets.readonly'],
	'google-search-console': [GOOGLE + 'webmasters.readonly'],
	'microsoft-outlook': ['offline_access', 'Mail.Read'],
	'microsoft-calendar': ['offline_access', 'Calendars.ReadBasic'],
	'microsoft-contacts': ['offline_access', 'Contacts.Read'],
	'microsoft-onedrive': ['offline_access', 'Files.Read'],
	// Graph needs Files.ReadWrite for workbook reads; ORCA's Excel tools still only read.
	'microsoft-excel': ['offline_access', 'Files.ReadWrite'],
	'microsoft-word': ['offline_access', 'Files.Read']
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Only canonical managed sources carrying backend-issued provider metadata count. */
function managedMember(candidate: OrcaCandidate, provider: OAuthAppProvider) {
	return candidate.oauthProvider === provider && !!candidate.managedProvider &&
		candidate.id === `default-orca-managed-${candidate.managedProvider}`;
}

export function oauthApps(candidates: OrcaCandidate[]) {
	const managed: ManagedOAuthApp[] = [];
	for (const provider of PROVIDERS) {
		const members = candidates.filter((candidate) => managedMember(candidate, provider));
		if (!members.length) continue;
		const connectors = members
			.map((candidate) => ({ id: candidate.id, name: candidate.name, ready: candidate.setupStatus === 'available' }))
			.sort(byName);
		const missing = members.filter((candidate) => candidate.setupStatus === 'admin_setup_required');
		const preferred = missing.find((candidate) => candidate.id === PROVIDER_SETUP_SOURCE[provider]);
		const scopes = [...new Set(members.flatMap((candidate) => CONNECTOR_SCOPES[candidate.managedProvider!] ?? []))];
		managed.push({
			provider,
			connectors,
			ready: connectors.every((connector) => connector.ready),
			setupSourceID: (preferred ?? missing[0])?.id,
			canConfigure: missing.some((candidate) => candidate.setupCanConfigure),
			scopes
		});
	}
	const custom: CustomOAuthApp[] = candidates
		.filter((candidate) => !candidate.managedProvider && candidate.setupStatus === 'admin_setup_required')
		.map((candidate) => ({ id: candidate.id, name: candidate.name, endpointHost: candidate.endpointHost, canConfigure: !!candidate.setupCanConfigure }))
		.sort(byName);
	// Systems people can sign in to right away: automatic registration or an app already configured.
	const readyToSignIn = candidates.filter((candidate) =>
		!candidate.managedProvider && candidate.setupStatus === 'available' && (candidate.authMethods ?? []).includes('oauth')
	).length;
	return { managed, custom, readyToSignIn };
}
