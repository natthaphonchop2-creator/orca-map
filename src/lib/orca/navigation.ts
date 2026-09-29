/** Keep post-auth return paths local through both browser and Go URL decoding. */
export function safeReturnPath(value: string | null | undefined, fallback = '/app') {
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value))
		return fallback;
	try {
		const url = new URL(value, 'https://orca.invalid');
		// Route paths do not need encoded separators, controls or nested percent
		// escapes. Query values remain encoded and may legitimately contain URLs.
		if (/%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)) return fallback;
		if (
			url.origin !== 'https://orca.invalid' ||
			url.pathname.startsWith('/login') ||
			url.pathname === '/'
		)
			return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}

/** Sign in again and come back to this page, including its view and filters. */
export function loginHref(location: { pathname: string; search: string }) {
	return `/login?rd=${encodeURIComponent(location.pathname + location.search)}`;
}

// ---------------------------------------------------------------------------
// The workspace's views (workspace UX proposal §2). Every old address still
// works: appNavigation() turns it into its new home (§2.5 and the critique's
// item 9), and activeNavigationView() names the sidebar item that stays lit.
// ---------------------------------------------------------------------------

/** The company's own sections of the platform area (the ORCA team only). */
export const PLATFORM_SECTIONS = ['overview', 'companies', 'pilots', 'signin', 'oauth-apps', 'catalog', 'breakglass'] as const;
export type PlatformSection = (typeof PLATFORM_SECTIONS)[number];
/** ตรวจสอบ: four views that share one tab bar; each keeps its own id. */
export const OVERSIGHT_VIEWS = ['approvals', 'executions', 'audit', 'secrets'] as const;
/** ทีม: the tabs of view=members. */
export const TEAM_TABS = ['members', 'invitations', 'departments'] as const;
export type TeamTab = (typeof TEAM_TABS)[number];
/** Settings after the split: บริษัท, บัญชีของฉัน and (with a sign-in source) ขั้นสูง. */
export const SETTINGS_SECTIONS = ['company', 'account', 'advanced'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
/** The tabs of an AI workspace. `settings` is the edit form until U5 edits in place. */
export const HUB_TABS = ['overview', 'programs', 'people', 'settings'] as const;

/** The views a page can show today. */
export const APP_VIEWS = [
	'dashboard', 'servers', 'add-program', 'workspaces', 'new', 'hub', 'knowledge', 'members',
	...OVERSIGHT_VIEWS, 'connect-ai', 'settings', 'help', 'platform'
] as const;

/** View ids that no longer exist. Old links still land somewhere (appNavigation). */
export const RETIRED_VIEWS = [
	'overview', 'catalog', 'accounts', 'connected-users', 'organization', 'api-keys', 'user-sources',
	'connected-apps', 'pilots', 'connections', 'playground',
	'projects', 'user-verification', 'contextual-access', 'logging-policy', 'billing'
] as const;

/** Old settings sections: each now lives elsewhere or has a new name. */
export const RETIRED_SETTINGS_SECTIONS = ['general', 'preferences', 'organization', 'members', 'keys', 'ai', 'additional', 'companies', 'owner'] as const;

/** What the redirects may know about the viewer. Unknown before the first load. */
export type NavigationRole = {
	canManage?: boolean;
	platformOperator?: boolean;
	canReviewPilotRequests?: boolean;
};
/** Workspaces the viewer can open; `userSourceID` means its own sign-in. */
export type NavigationHub = { id: string; userSourceID?: string };

export type AppRoute = {
	/** The view to render. */
	view: string;
	/** `view=servers` for one program (program detail). */
	connectionDetail: boolean;
	/** The canonical address when it differs from the one asked for. */
	redirect?: string;
	/** The canonical parameters (a copy; the input is never changed). */
	params: URLSearchParams;
	/** The canonical hash, with its "#", or "". */
	hash: string;
};

const PLACEHOLDER_VIEWS = new Set(['projects', 'user-verification', 'contextual-access', 'logging-policy', 'billing']);

/**
 * Resolves the page's view and its new home.
 * `role` and `hubs` come from the company's bootstrap; without them only the
 * rules that do not depend on who is looking apply, so a page applies its
 * redirects once its data has loaded.
 */
export function appNavigation(
	params: URLSearchParams,
	options: { hash?: string; role?: NavigationRole; hubs?: readonly NavigationHub[] } = {}
): AppRoute {
	const p = new URLSearchParams(params);
	let hash = options.hash && options.hash !== '#' ? options.hash : '';
	const role = options.role;
	const manager = role ? role.canManage === true : undefined;
	const operator = role ? role.platformOperator === true : undefined;
	let view = p.get('view') || 'dashboard';
	const go = (next: string) => {
		view = next;
		if (next === 'dashboard') p.delete('view');
		else p.set('view', next);
	};
	const only = (...keep: string[]) => {
		for (const key of [...p.keys()]) if (!['view', 'lang', 'org', ...keep].includes(key)) p.delete(key);
	};

	// 1. Legacy aliases that never depended on the viewer.
	if (view === 'playground') {
		go('dashboard');
		only();
	} else if (PLACEHOLDER_VIEWS.has(view)) {
		go('dashboard');
		only();
	} else if (view === 'overview') go('workspaces');
	else if (view === 'connections') {
		// The first Connections page: details were programs, `accounts` the person's own.
		if (p.get('source') || p.get('connection') || p.get('add') === 'source' || p.has('status')) {
			go('servers');
			p.delete('section');
		} else if (p.get('section') === 'accounts') {
			go('accounts');
			p.delete('section');
		} else {
			go('connected-apps');
			p.delete('section');
		}
	}

	// 2. Settings sections that moved out, or were renamed.
	if (view === 'settings') {
		const section = p.get('section');
		if (section === 'organization') p.set('section', 'company');
		else if (section === 'preferences' || section === 'general') p.set('section', 'account');
		else if (section === 'members') {
			go('members');
			p.delete('section');
		} else if (section === 'keys' || section === 'ai') {
			go('connect-ai');
			p.delete('section');
		} else if (section === 'additional') {
			go('knowledge');
			p.delete('section');
		} else if (section === 'companies' || section === 'owner') {
			// Platform pages, for the ORCA team only; anyone else stays in Settings.
			if (operator === false) p.delete('section');
			else {
				go('platform');
				p.set('section', section === 'owner' ? 'pilots' : 'companies');
			}
		} else if (section !== null && !(SETTINGS_SECTIONS as readonly string[]).includes(section)) p.delete('section');
	}

	// 3. Views that became part of another page.
	if (view === 'organization') {
		go('settings');
		only();
		p.set('section', 'company');
	} else if (view === 'api-keys') {
		go('connect-ai');
		only();
	} else if (view === 'accounts') {
		go('connect-ai');
		only();
		hash = '#accounts';
	} else if (view === 'connected-users') {
		// Program detail › คนที่เชื่อมบัญชีแล้ว.
		const connection = p.get('connection');
		go('servers');
		only('connection');
		if (connection) p.set('tab', 'members');
	} else if (view === 'catalog') {
		go('add-program');
		only();
	} else if (view === 'pilots') {
		go('platform');
		only();
		p.set('section', 'pilots');
	} else if (view === 'user-sources' && role) {
		// Google sign-in is the platform's; a company's own SSO is under Settings › ขั้นสูง.
		if (operator) {
			go('platform');
			only();
			p.set('section', 'signin');
		} else {
			go('settings');
			only();
			p.set('section', 'advanced');
		}
	} else if (view === 'connected-apps' && role) {
		if (operator) {
			go('platform');
			only();
			p.set('section', 'oauth-apps');
		} else {
			go('servers');
			only();
		}
	}

	// 4. Programs: the list and one program stay; adding one is its own page.
	if (view === 'servers') {
		if (!p.get('connection') && p.get('add') === 'source') {
			go('add-program');
			p.delete('add');
			p.delete('source');
		} else if (!p.get('connection') && p.get('source')) {
			go('add-program');
			p.delete('add');
			p.set('step', 'connect');
		} else if (p.get('connection')) {
			p.delete('add');
			p.delete('source');
			// The account tab folds into ภาพรวม.
			if (p.get('tab') === 'account') p.set('tab', 'overview');
		}
	}
	if ((view === 'servers' || view === 'add-program') && manager === false) {
		// Employees sign in to their own program accounts from เชื่อม AI ของฉัน.
		go('connect-ai');
		only();
		hash = '#accounts';
	}

	// 5. AI workspaces: editing happens on the workspace, not in the create form.
	if (view === 'new' && p.get('edit')) {
		const edit = p.get('edit')!;
		const tools = p.get('step') === 'tools';
		go('hub');
		p.delete('edit');
		p.delete('step');
		p.delete('connection');
		p.set('hub', edit);
		p.set('tab', tools ? 'programs' : 'settings');
	} else if (view === 'new') p.delete('step');
	if (view === 'hub') {
		const tab = p.get('tab');
		if (tab === 'tools') p.set('tab', 'programs');
		else if (tab === 'access') p.set('tab', 'people');
		if (tab === 'connect' || hash === '#connect-ai') {
			const record = options.hubs?.find((hub) => hub.id === p.get('hub'));
			if (p.get('created') === '1') {
				// "Created" lands on ภาพรวม.
				p.set('tab', 'overview');
				if (hash === '#connect-ai') hash = '';
			} else if (record?.userSourceID) {
				// Only a workspace with its own sign-in keeps its own link, on ภาพรวม.
				p.set('tab', 'overview');
				hash = '#connect-ai';
			} else if (options.hubs) {
				go('connect-ai');
				only();
				hash = '';
			}
		} else if (tab === 'settings' && p.get('step') && p.get('step') !== 'tools') p.delete('step');
		else if (tab !== 'settings') p.delete('step');
		// An old connect tab waits for the workspace list before it is resolved.
		const waiting = p.get('tab') === 'connect' && !options.hubs;
		if (!waiting && p.get('tab') && !(HUB_TABS as readonly string[]).includes(p.get('tab')!)) p.delete('tab');
	}

	// 6. ตรวจสอบ: the ids stay; activity keeps its workspace filter (`hub`).
	if (view === 'secrets' && manager === false) {
		go('connect-ai');
		only();
	}

	// 7. ทีม tabs.
	if (view === 'members') {
		const tab = p.get('tab');
		if (tab && (!(TEAM_TABS as readonly string[]).includes(tab) || (manager === false && tab !== 'members'))) p.delete('tab');
		if (p.get('tab') === 'members') p.delete('tab');
	}

	// 8. Settings: บริษัท and ขั้นสูง are for Owners and Admins.
	if (view === 'settings' && manager === false && (p.get('section') === 'company' || p.get('section') === 'advanced')) p.set('section', 'account');

	// 9. The platform area: the ORCA team only, one of its sections.
	if (view === 'platform') {
		if (operator === false) {
			go('dashboard');
			only();
		} else {
			const section = p.get('section');
			if (!section || !(PLATFORM_SECTIONS as readonly string[]).includes(section)) p.set('section', 'overview');
			if (p.get('section') === 'pilots' && role && role.canReviewPilotRequests !== true) p.set('section', 'overview');
			only('section');
		}
	}

	if (hash === '#accounts' && view !== 'connect-ai') hash = '';
	const connectionDetail = view === 'servers' && Boolean(p.get('connection'));
	const before = canonicalSearch(params, options.hash && options.hash !== '#' ? options.hash : '');
	const after = canonicalSearch(p, hash);
	return { view, connectionDetail, params: p, hash, ...(before !== after ? { redirect: `/app${after}` } : {}) };
}

function canonicalSearch(params: URLSearchParams, hash: string) {
	const search = params.toString();
	return `${search ? `?${search}` : ''}${hash}`;
}

/** The sidebar item for a view, so the highlight never jumps while an old address redirects. */
export function activeNavigationView(view: string, section?: string | null): string {
	if (view === 'dashboard' || view === 'playground' || PLACEHOLDER_VIEWS.has(view)) return 'dashboard';
	if (['servers', 'add-program', 'catalog', 'connected-users', 'connections', 'connected-apps'].includes(view)) return 'servers';
	if (['overview', 'new', 'hub', 'workspaces'].includes(view)) return 'workspaces';
	if ((OVERSIGHT_VIEWS as readonly string[]).includes(view)) return 'oversight';
	if (view === 'members') return 'members';
	if (view === 'connect-ai' || view === 'api-keys' || view === 'accounts') return 'connect-ai';
	if (view === 'organization' || view === 'user-sources') return 'settings';
	if (view === 'pilots') return 'platform:pilots';
	if (view === 'platform') return `platform:${section && (PLATFORM_SECTIONS as readonly string[]).includes(section) ? section : 'overview'}`;
	return view;
}

/** The platform area always opens the default company (critique 12). */
export function platformHref(section: PlatformSection = 'overview') {
	return `/app?org=default&view=platform&section=${section}`;
}

/** Programs added by an MCP link: the platform's program catalog (the ORCA team only). */
export function addByLinkHref() {
	return platformHref('catalog');
}
