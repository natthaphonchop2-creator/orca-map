import type { OrcaInvitation } from '$lib/services/orca';

/** The link a manager shares. The token is its only secret and is shown once. */
export function invitationLink(origin: string, token: string): string {
	return `${origin.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`;
}

/** LINE's share link opens the chat picker with the message already filled in. */
export function lineShareURL(text: string): string {
	return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

export type InvitationTone = 'waiting' | 'ok' | 'muted' | 'bad';

export function invitationTone(status: OrcaInvitation['status']): InvitationTone {
	return status === 'pending' ? 'waiting' : status === 'accepted' ? 'ok' : status === 'expired' ? 'bad' : 'muted';
}

/** Waiting and expired invitations need a manager; accepted and revoked ones are history. */
export function splitInvitations(items: OrcaInvitation[]) {
	return {
		open: items.filter((item) => item.status === 'pending' || item.status === 'expired'),
		closed: items.filter((item) => item.status === 'accepted' || item.status === 'revoked')
	};
}

/**
 * Only the platform makes owner invitations, handing a company to its first
 * owner; one whose inviter isn't a member of this company is the platform's.
 */
export function invitedByPlatform(item: Pick<OrcaInvitation, 'role' | 'invitedBy'>, memberIDs: string[]): boolean {
	return item.role === 'owner' && !memberIDs.includes(item.invitedBy ?? '');
}

/** Any manager renews an employee's link and only an owner an admin's; nobody in a company renews an owner's. */
export function canRenewInvitation(item: Pick<OrcaInvitation, 'role'>, canInviteAdmins: boolean): boolean {
	return item.role === 'employee' || (item.role === 'admin' && canInviteAdmins);
}
