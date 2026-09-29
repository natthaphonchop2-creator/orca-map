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

/** A company with no sign-in source has nothing under ขั้นสูง: its people are in ทีม. */
export function advancedFallback(requested: string | null, canManage: boolean, sources: SignInSources): string | undefined {
	return canManage && requested === 'advanced' && sources === 'none' ? '/app?view=members' : undefined;
}
