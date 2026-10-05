// The platform console, phase PC1 (C6): what its pages and the customer's
// pages work out from what the server returns. Nothing here calls the API,
// and the server decides every look and every change.

import { validCompanyID } from './company';
import { PLATFORM_COMPANY_TABS } from './navigation';

type Translate = (th: string, en: string) => string;

/** A company's status (C6 §3.1). An older server sends none: active. */
export type CompanyStatus = 'active' | 'suspended' | 'closed';

/** Anything the page does not know is treated as not open (fail closed). */
export function companyStatus(value: unknown): CompanyStatus {
	if (value === undefined || value === null || value === '' || value === 'active') return 'active';
	return value === 'suspended' ? 'suspended' : 'closed';
}

/** The fixed messages a company's people see (owner decision P5): never the reason. */
export const SUSPENDED_MESSAGE_TH = 'บริษัทนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อ ORCA';
export const CLOSED_MESSAGE_TH = 'บริษัทนี้ปิดการใช้งานแล้ว';

export function stoppedMessage(status: Exclude<CompanyStatus, 'active'>, t: Translate): string {
	return status === 'closed'
		? t(CLOSED_MESSAGE_TH, 'This company is closed.')
		: t(SUSPENDED_MESSAGE_TH, 'This company is suspended for now. Please contact ORCA.');
}

/**
 * A company route's refusal of a company that is not active: 423 with
 * orca_company_suspended or orca_company_closed, or on the data plane the
 * fixed message itself.
 */
export function stoppedFromRefusal(status: number | undefined, message: string): Exclude<CompanyStatus, 'active'> | undefined {
	if (status !== 423) return undefined;
	return message.includes('orca_company_closed') || message.includes(CLOSED_MESSAGE_TH) ? 'closed' : 'suspended';
}

/** The status in a list, in words; nothing for an active company. */
export function companyStatusNote(status: CompanyStatus, t: Translate): string {
	if (status === 'suspended') return t('ระงับการใช้งานชั่วคราว', 'Suspended');
	if (status === 'closed') return t('ปิดการใช้งานแล้ว', 'Closed');
	return '';
}

/** "ใกล้หมดสัญญา" within 30 days, "หมดสัญญาแล้ว" once past (C6 §3.3); the operator decides. */
export function contractNote(state: string | undefined, end: string | undefined, t: Translate): string {
	if (!end) return '';
	if (state === 'ended') return t(`หมดสัญญาแล้ว (${end})`, `Contract ended (${end})`);
	if (state === 'ending') return t(`ใกล้หมดสัญญา (${end})`, `Contract ends soon (${end})`);
	return t(`สัญญาถึง ${end}`, `Contract until ${end}`);
}

/** The company page's tabs in PC1; the other views come with PC2. */
export const DETAIL_TABS = PLATFORM_COMPANY_TABS;
export type DetailTab = (typeof DETAIL_TABS)[number];

export function detailTab(value: string | null | undefined): DetailTab {
	return (DETAIL_TABS as readonly string[]).includes(value ?? '') ? (value as DetailTab) : 'overview';
}

/** A customer company's page in the platform area (always in the default company). */
export function platformCompanyHref(id: string, tab: DetailTab = 'overview'): string {
	const query = new URLSearchParams({ org: 'default', view: 'platform', section: 'companies' });
	if (validCompanyID(id)) query.set('company', id);
	if (tab !== 'overview') query.set('tab', tab);
	return `/app?${query.toString()}`;
}

/** The areas a look names, as the company's own history shows them. */
export function platformAreaName(area: string | undefined, t: Translate): string {
	switch (area) {
		case 'overview':
			return t('ภาพรวมบริษัท', 'the company overview');
		case 'members':
			return t('รายชื่อสมาชิก', 'the member list');
		case 'workspaces':
			return t('พื้นที่ทำงาน', 'the workspaces');
		case 'connections':
			return t('โปรแกรมที่เชื่อม', 'the connected programs');
		case 'accounts':
			return t('บัญชีกลาง', 'the company accounts');
		case 'audit':
			return t('ประวัติการใช้งาน', 'the history');
		case 'library':
			return t('คลังความรู้', 'the knowledge library');
		case 'approvals':
			return t('คำขออนุมัติ', 'the approval requests');
		case 'invitations':
			return t('คำเชิญ', 'the invitations');
	}
	return t('ข้อมูลบริษัท', 'company data');
}

type AuditRow = { userID?: string; action?: string; resourceID?: string };

/** How a customer company's history names what ORCA did in it (P6). */
export function platformAuditLabel(event: AuditRow, t: Translate): string | undefined {
	if (event.userID !== 'platform') return undefined;
	switch (event.action) {
		case 'platform.view':
			return t(`ORCA ดูข้อมูล${platformAreaName(event.resourceID, t)}`, `ORCA viewed ${platformAreaName(event.resourceID, t)}`);
		case 'platform.suspend':
			return t('ORCA ระงับการใช้งานบริษัทชั่วคราว', 'ORCA suspended the company');
		case 'platform.restore':
			return t('ORCA เปิดให้ใช้งานบริษัทอีกครั้ง', 'ORCA restored the company');
		case 'platform.rename':
			return t('ORCA เปลี่ยนชื่อบริษัท', 'ORCA renamed the company');
	}
	return undefined;
}

/**
 * Consecutive looks by ORCA at the same area are shown as one row with how
 * many times (C6 §4.1): every look is still recorded; only the display
 * groups them.
 */
export function groupPlatformViews<T extends AuditRow>(events: T[]): Array<T & { repeated?: number }> {
	const result: Array<T & { repeated?: number }> = [];
	for (const event of events) {
		const last = result.at(-1);
		if (
			last &&
			event.userID === 'platform' &&
			event.action === 'platform.view' &&
			last.userID === 'platform' &&
			last.action === 'platform.view' &&
			last.resourceID === event.resourceID
		) {
			result[result.length - 1] = { ...last, repeated: (last.repeated ?? 1) + 1 };
			continue;
		}
		result.push({ ...event });
	}
	return result;
}

/** What a profile form would be refused for, checked again by the server (C6 §4.4). */
export type ProfileProblem = 'taxID' | 'email' | 'dates' | 'price' | 'notes';

export function profileProblems(input: {
	taxID?: string;
	contactEmail?: string;
	contractStart?: string;
	contractEnd?: string;
	monthlyPrice?: string;
	notes?: string;
}): ProfileProblem[] {
	const problems: ProfileProblem[] = [];
	const taxID = input.taxID?.trim() ?? '';
	if (taxID && !/^[0-9]{13}$/.test(taxID)) problems.push('taxID');
	const email = input.contactEmail?.trim() ?? '';
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('email');
	const start = input.contractStart?.trim() ?? '';
	const end = input.contractEnd?.trim() ?? '';
	const date = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
	if ((start && !date.test(start)) || (end && !date.test(end)) || (start && end && end < start)) problems.push('dates');
	const price = input.monthlyPrice?.trim() ?? '';
	if (price && !/^[0-9]{1,9}$/.test(price)) problems.push('price');
	if ([...(input.notes ?? '')].length > 4000) problems.push('notes');
	return problems;
}

/** The price field as whole baht, or none. */
export function priceValue(value: string): number | null {
	const price = value.trim();
	return /^[0-9]{1,9}$/.test(price) ? Number(price) : null;
}
