// Settings after the split (workspace UX proposal §2.4): บริษัท (Owners and
// Admins), บัญชีของฉัน (everyone) and ขั้นสูง — a company's own sign-in
// sources, shown only once the company has one.

export type SettingsSectionID = 'company' | 'account' | 'advanced';
/** Whether the company has sign-in sources: not asked (members), loading, none, some, or unreadable. */
export type SignInSources = 'unknown' | 'none' | 'some' | 'error';

export function settingsSections(canManage: boolean, sources: SignInSources): SettingsSectionID[] {
	if (!canManage) return ['account'];
	return sources === 'some' || sources === 'error' ? ['company', 'account', 'advanced'] : ['company', 'account'];
}

/** The section to show for `?section=`; ขั้นสูง stays reachable while its sources load. */
export function settingsSection(requested: string | null, canManage: boolean, sources: SignInSources): SettingsSectionID {
	if (!canManage) return 'account';
	if (requested === 'advanced') return sources === 'none' ? 'company' : 'advanced';
	return requested === 'account' ? 'account' : 'company';
}

/**
 * A company with no sign-in source has nothing under ขั้นสูง: Settings opens
 * บริษัท, where the person asked to be (not another section like ทีม).
 */
export function advancedFallback(requested: string | null, canManage: boolean, sources: SignInSources): string | undefined {
	return canManage && requested === 'advanced' && sources === 'none' ? '/app?view=settings&section=company' : undefined;
}

/** ตั้งค่า's tabs after W0: ทีม and พื้นที่ทำงาน AI moved in. Employees: their workspaces and their account. */
export type SettingsTabID = 'company' | 'team' | 'workspaces' | 'account' | 'advanced';
export function settingsTabs(canManage: boolean, sources: SignInSources): SettingsTabID[] {
	if (!canManage) return ['workspaces', 'account'];
	const sections = settingsSections(true, sources);
	return ['company', 'team', 'workspaces', 'account', ...(sections.includes('advanced') ? (['advanced'] as const) : [])];
}

/** Where each tab lives: ทีม and พื้นที่ทำงาน AI keep their own addresses. */
export const SETTINGS_TAB_HREF: Record<SettingsTabID, string> = {
	company: '/app?view=settings&section=company',
	team: '/app?view=members',
	workspaces: '/app?view=workspaces',
	account: '/app?view=settings&section=account',
	advanced: '/app?view=settings&section=advanced'
};
