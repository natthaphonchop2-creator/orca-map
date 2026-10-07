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
		case 'grant_revoked':
			// CA1b design §3.2.5 item 2: the provider will no longer refresh the
			// grant. Never a claim that someone revoked it.
			return {
				th: 'สิทธิ์ที่ Google หรือ Microsoft ให้บัญชีนี้หมดอายุหรือถูกยกเลิก (เช่น เปลี่ยนรหัสผ่าน ยกเลิกการเข้าถึง หรือครบ 7 วันของแอปช่วงทดลอง) ผู้ดูแลต้องเชื่อมใหม่',
				en: "This account's access at Google or Microsoft expired or was revoked (for example after a password change, removed access, or the 7-day limit of a pilot app). A manager must connect it again."
			};
		default:
			return undefined;
	}
}

/** The kinds of personal data a managed program's company account shows everyone allowed (CA1b design §3.1 item 1). */
export type CompanyAccountNotice = 'mail' | 'calendar' | 'contacts' | 'files';

/**
 * The warning a manager accepts before a "warn" program's company account
 * (CA1b design §3.3, O12): what everyone allowed will see, for a managed
 * program's notice, or the generic text; then the program's terms.
 */
export function policyNotice(policy: Pick<OrcaCompanyAccountPolicy, 'notice'> | undefined, programName: string, t: (th: string, en: string) => string): string {
	const terms = t(
		`เงื่อนไขของ ${programName} อาจไม่อนุญาตให้หลายคนใช้บัญชีเดียว บริษัทของคุณรับผิดชอบการใช้ตามเงื่อนไขนั้นเอง`,
		`${programName}'s terms may not allow sharing one login; your company is responsible for following them.`
	);
	switch (policy?.notice) {
		case 'mail':
			return `${t(
				'ทุกคนที่ได้รับอนุญาตจะอ่านอีเมลทั้งกล่องจดหมายของบัญชีนี้ผ่าน AI ได้ รวมถึงอีเมลส่วนตัวที่อยู่ในกล่องนี้ ควรใช้กล่องจดหมายที่ตั้งไว้ใช้ร่วมกัน เช่น office@บริษัท ไม่ใช่ของคนใดคนหนึ่ง',
				"Everyone allowed can read this account's whole mailbox through AI, including any private mail in it. Use a mailbox set up for sharing, such as office@yourcompany, not one person's."
			)} ${terms}`;
		case 'files':
			return `${t('ทุกคนที่ได้รับอนุญาตจะเห็นไฟล์ทุกไฟล์ที่บัญชีนี้เปิดได้ รวมถึงไฟล์ที่คนอื่นแชร์ให้บัญชีนี้', 'Everyone allowed sees every file this account can open, including files others shared with it.')} ${terms}`;
		case 'calendar':
			return `${t('ทุกคนที่ได้รับอนุญาตจะเห็นนัดหมายในปฏิทินของบัญชีนี้', "Everyone allowed sees this account's calendar events.")} ${terms}`;
		case 'contacts':
			return `${t('ทุกคนที่ได้รับอนุญาตจะเห็นรายชื่อผู้ติดต่อของบัญชีนี้', "Everyone allowed sees this account's contacts.")} ${terms}`;
		default:
			return `${t(
				`ทุกคนที่ได้รับอนุญาตจะใช้บัญชี ${programName} นี้ผ่าน AI และเห็นข้อมูลชุดเดียวกัน`,
				`Everyone allowed uses this ${programName} account through AI and sees the same data.`
			)} ${terms}`;
	}
}

/** The managed provider of a program, by ORCA's reserved source IDs; undefined for any other program. */
export function managedProviderOf(sourceID: string): 'google' | 'microsoft' | undefined {
	if (sourceID.startsWith('default-orca-managed-microsoft-')) return 'microsoft';
	if (sourceID.startsWith('default-orca-managed-')) return 'google';
	return undefined;
}

/**
 * The note while a company account is being connected again (CA1b design v3
 * §3.3, round 2 NOTE): the current account keeps working only when it is
 * ready, never after its grant was refused.
 */
export function stageNote(programName: string, account: Pick<OrcaProgramAccount, 'status'> | undefined, t: (th: string, en: string) => string): string {
	const connect = t(`เชื่อม ${programName} ด้วยบัญชีที่จะให้ทุกคนใช้`, `Connect ${programName} with the account everyone will use.`);
	if (account?.status !== 'ready') return connect;
	return `${connect} ${t('บัญชีเดิมยังใช้งานได้จนกว่าบัญชีใหม่จะเชื่อมสำเร็จ', 'The current one keeps working until the new one connects.')}`;
}

/** The classes a managed company account's check answers with (CA1b design §3.2.4). */
export type CompanyAccountCheckCode = 'account_auth' | 'account_permission' | 'provider_busy' | 'provider_unavailable';

/** The class a check's error names first ("account_auth: …"), or undefined. */
export function checkResultCode(message: string | undefined): CompanyAccountCheckCode | undefined {
	const code = message?.trim().split(':', 1)[0];
	return code === 'account_auth' || code === 'account_permission' || code === 'provider_busy' || code === 'provider_unavailable' ? code : undefined;
}

/** What a manager reads for a failed check: only account_auth says to connect again. */
export function checkResultCopy(code: CompanyAccountCheckCode | undefined): { th: string; en: string } | undefined {
	switch (code) {
		case 'account_auth':
			return { th: 'การลงชื่อเข้าใช้ของบัญชีนี้ใช้ไม่ได้แล้ว ผู้ดูแลต้องเชื่อมใหม่', en: "The account's sign-in no longer works; a manager connects it again." };
		case 'account_permission':
			return { th: 'บัญชีนี้ไม่มีสิทธิ์ทำสิ่งนี้ หรือบริการหรือการตั้งค่าของแอดมินปิดกั้นไว้ ตรวจบัญชีหรือสอบถามแอดมินของบัญชีนั้น', en: 'The account has no permission for this, or the service or an admin setting blocks it. Check the account or ask its admin.' };
		case 'provider_busy':
			return { th: 'Google หรือ Microsoft ไม่ว่างในตอนนี้ ลองใหม่ภายหลัง', en: 'Google or Microsoft is busy. Try again later.' };
		case 'provider_unavailable':
			return { th: 'ติดต่อ Google หรือ Microsoft ไม่ได้ ลองใหม่ภายหลัง', en: 'Could not reach Google or Microsoft. Try again later.' };
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

/** A tick of "accept" holds only for the policy revision it was made on (Codex CA1 review 2, finding 7). */
export function acceptanceHolds(policy: OrcaCompanyAccountPolicy | undefined, acceptedRevision: number): boolean {
	return policy?.mode === 'warn' && acceptedRevision > 0 && acceptedRevision === policy.revision;
}

/** A dialog opened for one account still applies only while the connection names that account (finding 6). */
export function stillBoundTo(connection: Pick<OrcaConnection, 'programAccountID'> | undefined, accountID: string): boolean {
	return Boolean(accountID) && connection?.programAccountID === accountID;
}

/** Connect flows on a page: each start or cancel ends the one before, and only the live one acts (finding 5). */
export class ConnectFlows {
	#live = 0;
	start(): number {
		return ++this.#live;
	}
	end(): void {
		this.#live++;
	}
	live(flow: number): boolean {
		return flow > 0 && flow === this.#live;
	}
}
