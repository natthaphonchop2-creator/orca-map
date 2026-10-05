// Company accounts (บัญชีกลาง), company accounts design §7: one program
// account a manager connects once, used by every member's calls through AI.
// Members never see or change it. "บัญชีของบริษัท" already means company
// sign-in, so the UI says บัญชีกลาง. The server checks every call.
import type { OrcaCompanyAccountPolicy, OrcaConnection, OrcaProgramAccount } from '$lib/services/orca';

export type CompanyAccountTone = 'ok' | 'warn' | 'neutral' | 'deny';

/** The company account a connection names, when it is in company mode and the account is listed. */
export function connectionAccount(connection: Pick<OrcaConnection, 'programAccountID'> | undefined, accounts: readonly OrcaProgramAccount[]) {
	const id = connection?.programAccountID;
	return id ? accounts.find((account) => account.id === id) : undefined;
}

/** The company's accounts for one program, ready ones first, then the newest. */
export function programAccountsFor(sourceID: string, accounts: readonly OrcaProgramAccount[]) {
	return accounts
		.filter((account) => account.sourceID === sourceID)
		.sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready') || b.createdAt.localeCompare(a.createdAt));
}

/** A company account's state, in a manager's words. */
export function companyAccountStatus(account: Pick<OrcaProgramAccount, 'status'> | undefined): { th: string; en: string; tone: CompanyAccountTone } {
	switch (account?.status) {
		case 'ready':
			return { th: 'พร้อมใช้', en: 'Ready', tone: 'ok' };
		case 'connecting':
			return { th: 'ยังไม่ได้เชื่อม', en: 'Not connected yet', tone: 'warn' };
		case 'needs_reconnect':
			return { th: 'ต้องเชื่อมใหม่', en: 'Needs reconnecting', tone: 'deny' };
		case 'disconnected':
			return { th: 'ตัดการเชื่อมต่อแล้ว', en: 'Disconnected', tone: 'neutral' };
		default:
			return { th: 'ไม่พบบัญชีกลาง', en: 'Company account not found', tone: 'deny' };
	}
}

/** Why a company account stopped serving, and what a manager does about it. */
export function pausedReasonCopy(reason: string | undefined): { th: string; en: string } | undefined {
	switch (reason) {
		case 'connector_lost_manager':
			return { th: 'คนที่เชื่อมบัญชีนี้ไว้ไม่ได้เป็นผู้ดูแลแล้ว ผู้ดูแลต้องเชื่อมใหม่', en: 'The person who connected it is no longer a manager. A manager must connect it again.' };
		case 'policy_changed':
			return { th: 'เงื่อนไขการใช้บัญชีกลางของโปรแกรมนี้เปลี่ยน ผู้ดูแลต้องยอมรับเงื่อนไขใหม่แล้วเชื่อมใหม่', en: "This program's company account terms changed. A manager must accept them and connect it again." };
		case 'app_changed':
			return { th: 'แอปที่ใช้ลงชื่อเข้าโปรแกรมนี้เปลี่ยน ผู้ดูแลต้องเชื่อมใหม่', en: "The app used to sign in to this program changed. A manager must connect it again." };
		case 'record_lost':
			return { th: 'ข้อมูลการเชื่อมของบัญชีนี้หายไป ผู้ดูแลต้องเชื่อมใหม่', en: 'Its connection details are gone. A manager must connect it again.' };
		case 'disconnected':
			return { th: 'ผู้ดูแลตัดการเชื่อมต่อไว้ AI ใช้บัญชีนี้ไม่ได้จนกว่าจะเชื่อมใหม่', en: "A manager disconnected it. AI can't use it until it is connected again." };
		default:
			return undefined;
	}
}

/** What a program's policy asks of a manager before a company account. */
export function policyStep(policy: OrcaCompanyAccountPolicy | undefined): 'allowed' | 'acknowledge' | 'personal-only' | 'unknown' {
	if (!policy) return 'unknown';
	if (policy.mode === 'allowed') return 'allowed';
	if (policy.mode === 'warn') return 'acknowledge';
	return 'personal-only';
}

/** A "warn" policy at a revision the account hasn't acknowledged: a manager accepts it before connecting again. */
export function needsAcknowledgement(policy: OrcaCompanyAccountPolicy | undefined, account: Pick<OrcaProgramAccount, 'acknowledgedRevision'> | undefined): boolean {
	return policy?.mode === 'warn' && (account?.acknowledgedRevision ?? 0) !== policy.revision;
}

/** The revision a manager acknowledges with the policy's warning, or 0 when none is needed. */
export function acknowledgedRevision(policy: OrcaCompanyAccountPolicy | undefined, accepted: boolean): number {
	return policy?.mode === 'warn' && accepted ? policy.revision : 0;
}

/** A first label for a program's company account. */
export function defaultAccountLabel(programName: string, t: (th: string, en: string) => string): string {
	return t(`บัญชีกลาง ${programName}`.trim(), `${programName} company account`.trim()).slice(0, 80);
}
