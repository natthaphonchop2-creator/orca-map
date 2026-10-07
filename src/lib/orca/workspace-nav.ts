// The workspace shell (W0, then W0.1): the rail's sections and the สร้าง menu,
// by role and feature. Pure, so the shell and its tests share it.
// This module imports nothing: the shell passes the glossary's words in.

/** The company's features that turn on parts of the workspace (the bootstrap's `features`). */
export type WorkspaceFeatures = { skills?: boolean } | undefined;

/** Skills shows only when the company's bootstrap says so. Today the server never does. */
export function skillsEnabled(data: { features?: WorkspaceFeatures } | undefined): boolean {
	return data?.features?.skills === true;
}

// ---------------------------------------------------------------------------
// W0.1 (approved 2026-10-07, output/orca-w01): the rail's sections and the
// สร้าง menu, each one data list so a future item is one line.
// ---------------------------------------------------------------------------

/** The company's features that switch parts of the menus on. `docTemplates` is kv2 phase 2a's. */
export type MenuFeatures = { skills?: boolean; docTemplates?: boolean } | undefined;

export type NavIcon =
	| 'home' | 'my-ai' | 'skills' | 'workflows' | 'programs' | 'knowledge' | 'history'
	| 'settings' | 'team' | 'workspaces' | 'company' | 'account' | 'help';

export type NavigationID = 'dashboard' | 'connect-ai' | 'skills' | 'workflows' | 'servers' | 'knowledge' | 'history' | 'settings';

export type NavEntry = {
	id: NavigationID;
	href: string;
	icon: NavIcon;
	/** Greyed and not a link ("เร็วๆ นี้"). */
	soon?: boolean;
	/** Owners and Admins only. */
	manager?: boolean;
	/** Shown only with this company feature. */
	flag?: keyof NonNullable<MenuFeatures>;
	/** ประวัติ: the waiting approvals count (managers). */
	count?: boolean;
};
export type NavSectionID = 'start' | 'ai' | 'data' | 'manage';
export type NavSection = { id: NavSectionID; items: NavEntry[] };

/** The rail, section by section (notes.md "Sidebar"). ตั้งค่า's sub-items come from settingsEntries. */
const SECTIONS: { id: NavSectionID; items: NavEntry[] }[] = [
	{ id: 'start', items: [{ id: 'dashboard', href: '/app', icon: 'home' }] },
	{
		id: 'ai',
		items: [
			{ id: 'connect-ai', href: '/app?view=connect-ai', icon: 'my-ai' },
			{ id: 'skills', href: '/app?view=skills', icon: 'skills', flag: 'skills' },
			// Employees have no Workflows (W0).
			{ id: 'workflows', href: '', icon: 'workflows', soon: true, manager: true }
		]
	},
	{
		id: 'data',
		items: [
			// Employees reach their programs through AI ของฉัน (W0, kept).
			{ id: 'servers', href: '/app?view=servers', icon: 'programs', manager: true },
			{ id: 'knowledge', href: '/app?view=knowledge', icon: 'knowledge' }
		]
	},
	{
		id: 'manage',
		items: [
			{ id: 'history', href: '/app?view=approvals', icon: 'history', count: true },
			{ id: 'settings', href: '/app?view=settings', icon: 'settings' }
		]
	}
];

function visible(entry: { manager?: boolean; flag?: keyof NonNullable<MenuFeatures> }, role: { canManage: boolean; features?: MenuFeatures }) {
	if (entry.manager && !role.canManage) return false;
	if (entry.flag && role.features?.[entry.flag] !== true) return false;
	return true;
}

/**
 * The rail's sections for this viewer. An employee's ประวัติ opens on their
 * requests when a workspace holds writes, else on their own use (W0).
 * A section left empty is dropped.
 */
export function workspaceSections(role: { canManage: boolean; features?: MenuFeatures; requestsApproval?: boolean }): NavSection[] {
	return SECTIONS.map((section) => ({
		id: section.id,
		items: section.items
			.filter((entry) => visible(entry, role))
			.map((entry) =>
				entry.id === 'history' && !role.canManage && !role.requestsApproval ? { ...entry, href: '/app?view=executions' } : entry
			)
	})).filter((section) => section.items.length > 0);
}

export type SettingsEntryID = 'team' | 'workspaces' | 'company' | 'account';
export type SettingsEntry = { id: SettingsEntryID; href: string; icon: NavIcon; manager?: boolean };
const SETTINGS: SettingsEntry[] = [
	{ id: 'team', href: '/app?view=members', icon: 'team', manager: true },
	{ id: 'workspaces', href: '/app?view=workspaces', icon: 'workspaces' },
	{ id: 'company', href: '/app?view=settings&section=company', icon: 'company', manager: true },
	{ id: 'account', href: '/app?view=settings&section=account', icon: 'account' }
];
/** ตั้งค่า ▾: ทีม, พื้นที่ทำงาน AI, บริษัท, บัญชีของฉัน; employees keep what they reach today. */
export function settingsEntries(role: { canManage: boolean }): SettingsEntry[] {
	return SETTINGS.filter((entry) => visible(entry, role));
}

// ---------------------------------------------------------------------------
// The สร้าง menu
// ---------------------------------------------------------------------------

export type CreateIcon = 'workspaces' | 'mcp' | 'workflows' | 'skills' | 'agent' | 'knowledge' | 'template' | 'my-ai' | 'invite' | 'company-account';
export type CreateItem = {
	id: 'workspace' | 'program' | 'workflow' | 'skill' | 'agent' | 'knowledge' | 'template' | 'ai' | 'invite' | 'account';
	href: string;
	icon: CreateIcon;
	/** "C แล้ว <key>": the letter's physical key (event.code `Key<key>`). */
	key?: string;
	manager?: boolean;
	flag?: keyof NonNullable<MenuFeatures>;
	soon?: boolean;
	/** The page it opens must exist in this build (เอกสาร arrives with kv2 phase 2a). */
	view?: string;
};

/**
 * One line per item; groups are separated by hairlines. Every href leads to a
 * page that exists today. A group whose items are all hidden is dropped.
 */
export const CREATE_GROUPS: CreateItem[][] = [
	[{ id: 'workspace', href: '/app?view=new', icon: 'workspaces', key: 'W', manager: true }],
	[
		{ id: 'program', href: '/app?view=servers&catalog=1', icon: 'mcp', key: 'P', manager: true },
		{ id: 'workflow', href: '', icon: 'workflows', soon: true }
	],
	[
		{ id: 'skill', href: '/app?view=skills', icon: 'skills', key: 'S', flag: 'skills' },
		{ id: 'agent', href: '', icon: 'agent', soon: true },
		// Members add knowledge today too, so they keep the row (W0).
		{ id: 'knowledge', href: '/app?view=knowledge&kind=knowledge&create=1', icon: 'knowledge', key: 'K' },
		{ id: 'template', href: '/app?view=documents', icon: 'template', key: 'T', manager: true, flag: 'docTemplates', view: 'documents' },
		{ id: 'ai', href: '/app?view=connect-ai', icon: 'my-ai', key: 'M' }
	],
	[
		{ id: 'invite', href: '/app?view=members&tab=invitations&invite=1', icon: 'invite', key: 'I', manager: true },
		{ id: 'account', href: '/app?view=servers&catalog=1&as=company', icon: 'company-account', key: 'A', manager: true }
	]
];

/** The สร้าง menu for this viewer: `views` names the pages this build has. */
export function createMenu(role: { canManage: boolean; features?: MenuFeatures; views: readonly string[] }): CreateItem[][] {
	return CREATE_GROUPS.map((group) => group.filter((item) => visible(item, role) && (!item.view || role.views.includes(item.view)))).filter(
		(group) => group.length > 0
	);
}

/** The item "C then <code>" opens: never one coming soon. */
export function createShortcut(groups: readonly CreateItem[][], code: string): CreateItem | undefined {
	return groups.flat().find((item) => !item.soon && item.key && code === `Key${item.key}`);
}

/** A place ไปที่… ⌘K can open: a page, a program or a workspace the viewer can already reach. */
export type JumpTarget = { id: string; label: string; href: string; group: string };
