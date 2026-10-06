import type { OrcaOwnerInvitationLink, OrcaPlatformCompany, OrcaPlatformOwnerInvitation } from '$lib/services/orca';
import { companyStatus } from './platform-console';

// The platform operator's customer companies (C4 §14e). The platform opens a
// company and hands it to its first owner; from then on the company invites
// its own people, and the platform can't add anyone to it.

/** A company's owner, as the operator's list shows it. */
export type OwnerStatus = 'owned' | 'waiting' | 'expired' | 'none';

export function ownerStatus(company: Pick<OrcaPlatformCompany, 'owners' | 'ownerInvitations'>): OwnerStatus {
	if (company.owners > 0) return 'owned';
	if (company.ownerInvitations.some((invitation) => invitation.status === 'pending')) return 'waiting';
	return company.ownerInvitations.length ? 'expired' : 'none';
}

/**
 * The platform hands over only an active customer company with no owner who
 * can act. A suspended or closed one gets no new owner link: its people can't
 * accept one while it is stopped (C6 §4.2), so "ส่งลิงก์ใหม่" would only make
 * a link that can't be used.
 */
export function canInviteOwner(company: Pick<OrcaPlatformCompany, 'id' | 'owners' | 'status'>): boolean {
	return company.id !== 'default' && company.owners === 0 && companyStatus(company.status) === 'active';
}

/** What could stop the invited person making an account; the invitation stands either way. */
export function signInWarnings(link: Pick<OrcaOwnerInvitationLink, 'googleSignIn' | 'emailDomainAllowed'>): Array<'google' | 'domain'> {
	const warnings: Array<'google' | 'domain'> = [];
	if (!link.googleSignIn) warnings.push('google');
	if (!link.emailDomainAllowed) warnings.push('domain');
	return warnings;
}

/** The domain an email signs in with. */
export function emailDomain(email: string): string {
	return email.slice(email.lastIndexOf('@') + 1);
}

/** A refusal the operator can act on, told apart by the server's message. */
export type PlatformRefusal = 'name-taken' | 'has-owner' | 'waiting' | 'unavailable' | 'closed';

export function platformRefusal(status: number | undefined, message: string): PlatformRefusal | undefined {
	if (status !== 409) return undefined;
	if (message.includes('a company with this name already exists')) return 'name-taken';
	if (message.includes('this company has an owner')) return 'has-owner';
	if (message.includes('invitation for this email is already waiting')) return 'waiting';
	if (message.includes('suspended or removed')) return 'unavailable';
	if (message.includes('already used, revoked or has expired')) return 'closed';
	return undefined;
}

/**
 * "ส่งลิงก์ใหม่": the email the waiting (or expired) owner link went to, so the
 * operator reissues it instead of retyping it; a typo would start a second
 * invitation. The newest pending one first, then the newest expired one.
 */
export function resendEmail(company: Pick<OrcaPlatformCompany, 'ownerInvitations'>): string {
	const newest = (status: 'pending' | 'expired') =>
		company.ownerInvitations.filter((invitation) => invitation.status === status).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0];
	return (newest('pending') ?? newest('expired'))?.email ?? '';
}

/** An expired link already does nothing: there is nothing to revoke. */
export function canRevokeOwnerInvitation(invitation: Pick<OrcaPlatformOwnerInvitation, 'status'>): boolean {
	return invitation.status === 'pending';
}
