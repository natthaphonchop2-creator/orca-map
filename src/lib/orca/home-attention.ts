// หน้าหลัก's ต้องดูแล (W0): what needs someone now, one row each with one
// button, shown only when there is something. It takes over from the first-run
// checklist (OwnerSetup / EmployeeSetup) and the old status view's alerts, with
// the same counts and the same words where a page already says them.
import type { OrcaBootstrap, OrcaConnection, OrcaConnectionHealth, OrcaProgramAccount } from '$lib/services/orca';
import { connectionReady } from './activation';
import { connectionAccount, pausedReasonCopy } from './company-account';
import { attentionCounts, teamProgram, usableWorkspaces, workspacesWithoutMe, type AccountState, type AIState, type Done } from './home-setup';
import { programStatus } from './program-catalog';
import { STALE_DAYS } from './secrets';

type Translate = (th: string, en: string) => string;

/** One ต้องดูแล row. `logo` is a program's catalog name; `copy` is text the button copies instead of a link. */
export type AttentionRow = {
	id: string;
	title: string;
	meta?: string;
	logo?: string;
	action: { label: string; href?: string; copy?: string };
};

/** The word for a program that has to be connected again: the same on the row and the โปรแกรม tile. */
export const RECONNECT_WORD = { th: 'ต้องเชื่อมใหม่', en: 'Needs reconnecting' } as const;

/** Programs whose company account (บัญชีกลาง) needs connecting again. Unknown accounts: none. */
export function programsToReconnect(connections: readonly OrcaConnection[], accounts: readonly OrcaProgramAccount[] | undefined): OrcaConnection[] {
	if (!accounts) return [];
	return connections.filter(
		(connection) => !connection.archivedAt && !connection.deletedAt && connectionAccount(connection, accounts)?.status === 'needs_reconnect'
	);
}

/**
 * The viewer's AI, for its row: nothing while it is unknown or connected;
 * `never` when B1 says none and the viewer has never asked AI anything (a
 * first connection, not a lapse); `lapsed` for every other case, which
 * AIReconnectBanner words (expired, disconnected, limited, unreached).
 */
export function aiAttention(ai: AIState, checked: boolean, asked: Done): 'never' | 'lapsed' | undefined {
	if (!checked || ai === 'connected' || ai === 'unknown') return undefined;
	if (ai === 'none' && asked === false) return 'never';
	if (ai === 'revoked' && asked !== true) return undefined;
	return 'lapsed';
}

export type ManagerAttentionInput = {
	data: Pick<OrcaBootstrap, 'hubs' | 'connections' | 'currentUserID'>;
	pendingApprovals: number;
	accounts?: readonly OrcaProgramAccount[];
	health?: Map<string, Pick<OrcaConnectionHealth, 'changed' | 'lastFailureAt'>>;
	staleApps: number;
	iconName: (connection: OrcaConnection) => string;
};

/** Owners and Admins: approvals, programs to reconnect or review, workspaces and AI apps, and what setup still lacks. */
export function managerAttention(input: ManagerAttentionInput, t: Translate): AttentionRow[] {
	const { data, health } = input;
	const live = data.connections.filter((connection) => !connection.archivedAt && !connection.deletedAt);
	const rows: AttentionRow[] = [];
	if (input.pendingApprovals > 0)
		rows.push({
			id: 'approvals',
			title: t(`รออนุมัติ ${input.pendingApprovals} รายการ`, `${input.pendingApprovals} waiting for approval`),
			meta: t('AI ขอแก้ข้อมูลในโปรแกรม รอผู้ดูแลอนุมัติ', 'AI asked to change data in a program and waits for a manager'),
			action: { label: t('ดูคำขอ', 'See requests'), href: '/app?view=approvals' }
		});
	for (const connection of programsToReconnect(live, input.accounts)) {
		const reason = pausedReasonCopy(connectionAccount(connection, input.accounts ?? [])?.pausedReason);
		rows.push({
			id: `reconnect:${connection.id}`,
			title: t(`${connection.name} ${RECONNECT_WORD.th}`, `${connection.name}: ${RECONNECT_WORD.en.toLowerCase()}`),
			meta: reason ? t(reason.th, reason.en) : t('บัญชีกลางของโปรแกรมนี้ใช้ไม่ได้ AI จึงใช้โปรแกรมนี้ไม่ได้', "Its company account stopped working, so AI can't use it"),
			logo: input.iconName(connection),
			action: { label: t('เชื่อมใหม่', 'Reconnect'), href: `/app?view=servers&connection=${encodeURIComponent(connection.id)}` }
		});
	}
	const statuses = live.map((connection) => programStatus(connection, health?.get(connection.id)));
	const setupNeeded = statuses.filter((status) => status === 'setup').length;
	const review = statuses.filter((status) => status === 'review').length;
	const paused = statuses.filter((status) => status === 'paused').length;
	if (setupNeeded > 0)
		rows.push({
			id: 'setup',
			title: t(`โปรแกรมรอเลือกสิ่งที่ AI ทำได้ ${setupNeeded} โปรแกรม`, `${setupNeeded} ${setupNeeded === 1 ? 'program needs' : 'programs need'} you to choose what AI can do`),
			action: { label: t('เลือก', 'Choose'), href: '/app?view=servers&status=needs-review' }
		});
	if (review > 0)
		rows.push({
			id: 'review',
			title: t(`โปรแกรมที่ต้องตรวจใหม่ ${review} โปรแกรม`, `${review} ${review === 1 ? 'program needs' : 'programs need'} a new review`),
			meta: t('บางอย่างในโปรแกรมเปลี่ยนไป ตรวจใหม่ก่อน AI จึงใช้สิ่งนั้นได้', 'Something in it changed. Review it again so AI can use it.'),
			action: { label: t('ตรวจ', 'Review'), href: '/app?view=servers&status=needs-review' }
		});
	const blocked = attentionCounts(data).blocked;
	if (blocked > 0)
		rows.push({
			id: 'blocked',
			title: t(`พื้นที่ทำงานที่ยังใช้ไม่ได้ ${blocked} แห่ง`, `${blocked} workspaces are not usable`),
			meta: t('มีโปรแกรมที่หยุดชั่วคราว หรือยังไม่ได้เลือกสิ่งที่ AI ทำได้', 'A program is paused or not reviewed yet'),
			action: { label: t('ดู', 'View'), href: '/app?view=workspaces' }
		});
	if (paused > 0)
		rows.push({
			id: 'paused',
			title: t(`โปรแกรมที่หยุดชั่วคราว ${paused} โปรแกรม`, `${paused} programs are paused`),
			meta: t('ทีมใช้ไม่ได้จนกว่าจะเปิดอีกครั้ง', "Your team can't use them until they're resumed"),
			action: { label: t('ดู', 'View'), href: '/app?view=servers' }
		});
	if (input.staleApps > 0)
		rows.push({
			id: 'stale',
			title: t(`มี ${input.staleApps} แอป AI ที่ไม่ได้ใช้เกิน ${STALE_DAYS} วัน`, `${input.staleApps} AI apps unused for ${STALE_DAYS}+ days`),
			action: { label: t('ดู', 'View'), href: '/app?view=secrets&filter=stale' }
		});
	// What the first-run checklist asked for, while it is still missing.
	if (!data.connections.some(connectionReady) && !live.length)
		rows.push({
			id: 'program',
			title: t('ยังไม่ได้เชื่อมโปรแกรม', 'No program connected yet'),
			meta: t('เชื่อมโปรแกรมที่บริษัทใช้ แล้ว AI จะช่วยทำงานกับข้อมูลนั้นได้', 'Connect a program your company uses so AI can work with it'),
			action: { label: t('เชื่อมโปรแกรม', 'Connect a program'), href: '/app?view=servers&catalog=1' }
		});
	const program = teamProgram(data);
	const theirs = usableWorkspaces(data).length === 0 ? workspacesWithoutMe(data)[0] : undefined;
	if (theirs)
		// A ready workspace the viewer is not in: add themselves instead of making another.
		rows.push({
			id: 'team',
			title: t(`คุณยังไม่ได้อยู่ใน ${theirs.name}`, `You're not in ${theirs.name} yet`),
			meta: t('เพิ่มตัวเองแล้ว AI ของคุณจะใช้พื้นที่ทำงานนี้ได้', 'Add yourself so your AI can use this workspace'),
			action: { label: t('เพิ่มตัวเอง', 'Add yourself'), href: `/app?view=hub&hub=${encodeURIComponent(theirs.id)}&tab=people` }
		});
	else if (program && usableWorkspaces(data).length === 0)
		rows.push({
			id: 'team',
			title: t(`ทีมยังใช้ ${program.name} กับ AI ไม่ได้`, `Your team can't use ${program.name} with AI yet`),
			meta: t('ยังไม่มีพื้นที่ทำงาน AI ที่คุณอยู่', "There's no AI workspace you're in yet"),
			logo: input.iconName(program),
			action: { label: t('ให้ทุกคนใช้', 'Let everyone use it'), href: `/app?view=new&everyone=1&connection=${encodeURIComponent(program.id)}` }
		});
	return rows;
}

export type EmployeeAttentionInput = {
	accounts: readonly { id: string; name: string; icon: string; state: AccountState }[];
	noWorkspace: boolean;
	requestText: string;
};

/** Employees: their own sign-ins to programs, and asking for access when no workspace is theirs. */
export function employeeAttention(input: EmployeeAttentionInput, t: Translate): AttentionRow[] {
	const rows: AttentionRow[] = [];
	if (input.noWorkspace)
		rows.push({
			id: 'access',
			title: t('ยังไม่มีพื้นที่ทำงาน AI ที่คุณใช้ได้', "There's no AI workspace you can use yet"),
			meta: t('ขอสิทธิ์จากผู้ดูแล ส่งข้อความนี้ให้ผู้ดูแลบริษัท', 'Ask an admin for access: send them this message'),
			action: { label: t('คัดลอกข้อความขอสิทธิ์', 'Copy the request'), copy: input.requestText }
		});
	for (const account of input.accounts)
		if (account.state === 'needed')
			rows.push({
				id: `account:${account.id}`,
				title: t(`ลงชื่อเข้าใช้ ${account.name}`, `Sign in to ${account.name}`),
				meta: t('AI ใช้โปรแกรมนี้ด้วยบัญชีของคุณเอง', 'AI uses this program with your own account'),
				logo: account.icon,
				action: { label: t('ลงชื่อเข้าใช้', 'Sign in'), href: '/app?view=connect-ai#accounts' }
			});
	return rows;
}
