// The W0 shell (calm workspace, approved 2026-10-07): the sidebar's items and
// the สร้าง dialog's rows, by role. Pure, so the shell and its tests share it.
// This module imports nothing: the shell passes the glossary's words in.

/** The company's features that turn on parts of the workspace (the bootstrap's `features`). */
export type WorkspaceFeatures = { skills?: boolean } | undefined;

/** Skills shows only when the company's bootstrap says so. Today the server never does. */
export function skillsEnabled(data: { features?: WorkspaceFeatures } | undefined): boolean {
	return data?.features?.skills === true;
}

export type NavigationID = 'dashboard' | 'skills' | 'workflows' | 'servers' | 'connect-ai' | 'knowledge' | 'history';

export type WorkspaceNavItem = {
	id: NavigationID;
	href: string;
	/** Greyed and not a link ("เร็วๆ นี้"). */
	soon?: boolean;
};

/**
 * The company's menu. Owners and Admins: หน้าหลัก · Skills · Workflows (เร็วๆ นี้) ·
 * โปรแกรม · AI ของฉัน · คลังความรู้ · ประวัติ. Employees: หน้าหลัก · Skills ·
 * AI ของฉัน · คลังความรู้ · ประวัติ (their own requests and usage); they have no
 * Workflows and reach their programs through AI ของฉัน, as before.
 * Skills shows only with the company's `skills` feature.
 */
export function workspaceNavigation(role: { canManage: boolean; skills: boolean; requestsApproval?: boolean }): WorkspaceNavItem[] {
	const items: WorkspaceNavItem[] = [{ id: 'dashboard', href: '/app' }];
	if (role.skills) items.push({ id: 'skills', href: '/app?view=skills' });
	if (role.canManage) {
		items.push({ id: 'workflows', href: '', soon: true });
		items.push({ id: 'servers', href: '/app?view=servers' });
	}
	items.push({ id: 'connect-ai', href: '/app?view=connect-ai' });
	items.push({ id: 'knowledge', href: '/app?view=knowledge' });
	// An employee's ประวัติ opens on their requests when a workspace holds writes, else on their own use.
	items.push({ id: 'history', href: role.canManage || role.requestsApproval ? '/app?view=approvals' : '/app?view=executions' });
	return items;
}

export type CreateOptionID = 'skill' | 'workflow' | 'connect-ai' | 'knowledge';
export type CreateOption = { id: CreateOptionID; href: string; disabled?: boolean };

/**
 * The สร้าง dialog's rows. Skill: Owners and Admins, with the company's
 * `skills` feature. Workflow: Owners and Admins, shown greyed (เร็วๆ นี้).
 * เชื่อม AI and เพิ่มความรู้: everyone (members add knowledge today too).
 */
export function createOptions(role: { canManage: boolean; skills: boolean }): CreateOption[] {
	const options: CreateOption[] = [];
	if (role.canManage && role.skills) options.push({ id: 'skill', href: '/app?view=skills' });
	if (role.canManage) options.push({ id: 'workflow', href: '', disabled: true });
	options.push({ id: 'connect-ai', href: '/app?view=connect-ai' });
	options.push({ id: 'knowledge', href: '/app?view=knowledge&kind=knowledge&create=1' });
	return options;
}

/** A place ไปที่… ⌘K can open: a page, a program or a workspace the viewer can already reach. */
export type JumpTarget = { id: string; label: string; href: string; group: string };
