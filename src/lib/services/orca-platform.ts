import type { MCPCatalogEntryServerManifest } from './admin/types';
import type { OrcaBreakGlassLogin, OrcaCandidate, OrcaGoogleSignIn, OrcaMember, OrcaPlatformCompany, PilotRequest, PilotStatus } from './orca';
import { googleRedirectURI } from '../orca/google-signin';
import { canInviteOwner, ownerStatus } from '../orca/platform-companies';

// The ORCA team's platform area (workspace UX W1, U2): what its pages work out
// from the lists the API already returns. Nothing here calls the API; every
// page keeps using OrcaService, and the server still decides every write.

// ---------------------------------------------------------------------------
// Google sign-in: the two addresses Google must know.
// ---------------------------------------------------------------------------

/** The origin of an http(s) address, or "" when it is not one. */
function httpOrigin(value: string | undefined): string {
	if (!value) return '';
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
	} catch {
		return '';
	}
}

/**
 * The backend's public origin: the company's ORCA link carries it (Claude and
 * ChatGPT sign in there). Without one, the API base, which in a browser is the
 * workspace's own origin (its requests go through the workspace's proxy).
 */
export function backendOrigin(unifiedConnectURL: string | undefined, apiBase: string): string {
	return httpOrigin(unifiedConnectURL) || httpOrigin(apiBase);
}

/** Why an address is registered: signing in to the workspace, or AI apps signing in. */
export type GoogleRedirectUse = 'workspace' | 'ai-apps';
export type GoogleRedirectTarget = { uri: string; use: GoogleRedirectUse };

/**
 * Every redirect URI the Google client must list: the workspace's (the saved
 * one, or this page's) and the backend's, where a customer signs in while
 * connecting Claude or ChatGPT. One address when both are the same.
 */
export function googleRedirectTargets(workspaceRedirect: string, backend: string): GoogleRedirectTarget[] {
	const targets: GoogleRedirectTarget[] = [];
	if (workspaceRedirect) targets.push({ uri: workspaceRedirect, use: 'workspace' });
	const second = backend ? googleRedirectURI(backend) : '';
	if (second && second !== workspaceRedirect) targets.push({ uri: second, use: 'ai-apps' });
	return targets;
}

/** A Google OAuth client ID ends in .apps.googleusercontent.com. */
export function googleClientIDFormat(value: string): 'empty' | 'ok' | 'unusual' {
	const id = value.trim();
	if (!id) return 'empty';
	return /^[a-z0-9][a-z0-9-]*\.apps\.googleusercontent\.com$/i.test(id) ? 'ok' : 'unusual';
}

/** Google sign-in can be switched on once a client ID and its secret are saved. */
export function googleClientSaved(setting: Pick<OrcaGoogleSignIn, 'clientID' | 'secretConfigured'> | undefined): boolean {
	return !!setting?.clientID.trim() && setting.secretConfigured === true;
}

// ---------------------------------------------------------------------------
// ภาพรวมแพลตฟอร์ม: counts from the company and pilot lists (UI only).
// ---------------------------------------------------------------------------

export type PlatformCounts = {
	/** Customer companies: every company but the ORCA team's own. */
	customers: number;
	owned: number;
	waiting: number;
	expired: number;
	noOwner: number;
	/** People who can use a customer company now. */
	customerSeats: number;
	/**
	 * The owner to-do, all from one set: active customer companies with no
	 * owner, the ones that get the invite button (canInviteOwner). A suspended
	 * or closed company is in none of these: it gets no owner link.
	 */
	ownerTodo: {
		/** Their owner link expired. */
		expired: number;
		/** Nobody was ever invited. */
		notInvited: number;
		/** A link is out and the owner hasn't accepted yet. */
		waiting: number;
	};
	/** ownerTodo.expired + ownerTodo.notInvited: the companies that need a link now. */
	needOwner: number;
	/** Suspended or closed customer companies with no owner: not a to-do, but not "every company has an owner" either. */
	stoppedWithoutOwner: number;
	pilots: Record<PilotStatus, number> & { total: number; open: number };
};

export const PILOT_STATUSES: readonly PilotStatus[] = ['received', 'contacted', 'qualified', 'closed'];

export function platformCounts(companies: readonly OrcaPlatformCompany[], pilots: readonly Pick<PilotRequest, 'status'>[] = []): PlatformCounts {
	const customers = companies.filter((company) => company.id !== 'default');
	const status = customers.map((company) => ownerStatus(company));
	const count = (value: string) => status.filter((item) => item === value).length;
	const invitable = customers.map((company) => canInviteOwner(company));
	const todo = (value: string) => status.filter((item, index) => item === value && invitable[index]).length;
	const ownerTodo = { expired: todo('expired'), notInvited: todo('none'), waiting: todo('waiting') };
	const byStatus = Object.fromEntries(PILOT_STATUSES.map((value) => [value, pilots.filter((item) => item.status === value).length])) as Record<PilotStatus, number>;
	return {
		customers: customers.length,
		owned: count('owned'),
		waiting: count('waiting'),
		expired: count('expired'),
		noOwner: count('none'),
		customerSeats: customers.reduce((sum, company) => sum + (Number.isFinite(company.seats) ? company.seats : 0), 0),
		ownerTodo,
		needOwner: ownerTodo.expired + ownerTodo.notInvited,
		stoppedWithoutOwner: status.filter((item, index) => item !== 'owned' && !invitable[index]).length,
		pilots: { ...byStatus, total: pilots.length, open: pilots.length - byStatus.closed }
	};
}

// ---------------------------------------------------------------------------
// คลังโปรแกรม: the shared catalog, by what the ORCA team has to do.
// ---------------------------------------------------------------------------

export type CatalogState = 'ready' | 'app-setup' | 'review' | 'unchecked';

/** What a catalog program needs before customers can connect it. */
export function catalogState(candidate: Pick<OrcaCandidate, 'setupStatus'>): CatalogState {
	switch (candidate.setupStatus) {
		case 'available':
			return 'ready';
		case 'admin_setup_required':
			return 'app-setup';
		case 'review_required':
			return 'review';
		default:
			return 'unchecked';
	}
}

/** An app the ORCA team sets up once per provider on แอป OAuth ของโปรแกรม. */
export function sharedProviderApp(candidate: Pick<OrcaCandidate, 'oauthProvider'>): boolean {
	return candidate.oauthProvider === 'google' || candidate.oauthProvider === 'microsoft';
}

export function catalogSummary(candidates: readonly OrcaCandidate[]) {
	const summary: Record<CatalogState, OrcaCandidate[]> = { ready: [], 'app-setup': [], review: [], unchecked: [] };
	for (const candidate of candidates) summary[catalogState(candidate)].push(candidate);
	return {
		...summary,
		total: candidates.length,
		/** Programs waiting for the ORCA team, those needing an app first. */
		attention: [...summary['app-setup'], ...summary.review]
	};
}

/** How people sign in to a program added by its MCP link. */
export type RemoteAuth = 'none' | 'bearer';

/** An MCP link ORCA accepts: https (http only on this computer), no password, query or fragment. */
export function validMCPLink(raw: string): boolean {
	try {
		const url = new URL(raw.trim());
		return (
			(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
		);
	} catch {
		return false;
	}
}

/**
 * The shared catalog entry for a program added by its MCP link, as SourceSetup
 * has always made it: one remote server per person, and with "bearer" each
 * person's own access token (never a shared one).
 */
export function remoteEntryManifest(name: string, endpoint: string, auth: RemoteAuth, shortDescription: string): MCPCatalogEntryServerManifest {
	return {
		name: name.trim(),
		shortDescription,
		runtime: 'remote',
		serverUserType: 'singleUser',
		remoteConfig: {
			fixedURL: endpoint.trim(),
			...(auth === 'bearer'
				? {
						headers: [
							{
								key: 'Authorization',
								name: 'Access token',
								description: 'Personal upstream access token',
								required: true,
								sensitive: true,
								value: '',
								prefix: 'Bearer '
							}
						]
					}
				: {})
		}
	} as MCPCatalogEntryServerManifest;
}

/** Filters the catalog by name, description or address, ignoring case. */
export function searchCatalog<T extends Pick<OrcaCandidate, 'name' | 'description' | 'endpointHost'>>(items: readonly T[], query: string): T[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [...items];
	return items.filter((item) => `${item.name} ${item.description ?? ''} ${item.endpointHost ?? ''}`.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// บัญชีฉุกเฉิน: the password logins the server lists (backend B6).
// ---------------------------------------------------------------------------

export type PasswordAccountState = 'active' | 'waiting' | 'suspended' | 'removed';
export type PasswordAccountRow = {
	account: OrcaBreakGlassLogin;
	/** The default company's member with the row's userID, for their name. */
	member?: OrcaMember;
	state: PasswordAccountState;
	/** The signed-in person's own login. */
	self: boolean;
	/** A reset is offered on an active or waiting login; the server decides. */
	canReset: boolean;
};

/**
 * One row per login, exactly as GET /local-auth/users lists them (oldest
 * first). The server already keeps only the ORCA team's company's password
 * logins that no customer company has, and says each one's account there:
 * no userID means it has none yet, so it waits for a sign-in. A suspended or
 * removed account keeps its row, without a reset: it can't open the company
 * whatever its password.
 */
export function passwordAccounts(accounts: readonly OrcaBreakGlassLogin[], members: readonly OrcaMember[], currentUserID: string): PasswordAccountRow[] {
	const current = passwordListCurrent(accounts);
	return accounts.map((account) => {
		const state: PasswordAccountState = !account.userID ? 'waiting' : account.status === 'suspended' ? 'suspended' : account.status === 'removed' ? 'removed' : 'active';
		return {
			account,
			member: account.userID ? members.find((member) => member.id === account.userID) : undefined,
			state,
			self: !!account.userID && account.userID === currentUserID,
			canReset: current && (state === 'active' || state === 'waiting')
		};
	});
}

/**
 * Whether the list is B6's: every row says who chose its password. A server
 * from before B6 (while ORCA updates, the workspace first) lists every Local
 * login, customers' Google-only ones too, with no account, role or status, so
 * its rows can't be read as the ORCA team's and are offered no reset (Codex
 * release review 63).
 */
export function passwordListCurrent(accounts: readonly OrcaBreakGlassLogin[]): boolean {
	return accounts.every((account) => account.passwordOrigin === 'admin' || account.passwordOrigin === 'self');
}

// ---------------------------------------------------------------------------
// Messages sent by LINE open outside LINE, where Google sign-in works.
// ---------------------------------------------------------------------------

/** LINE opens a link carrying openExternalBrowser=1 in the phone's browser (critique 13). */
export function externalBrowserLink(link: string): string {
	try {
		const url = new URL(link);
		url.searchParams.set('openExternalBrowser', '1');
		return url.toString();
	} catch {
		return link;
	}
}
