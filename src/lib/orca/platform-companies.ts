import type { OrcaOwnerInvitationLink, OrcaPlatformCompany } from '$lib/services/orca';

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

/** The platform hands over only a customer company with no owner who can act. */
export function canInviteOwner(company: Pick<OrcaPlatformCompany, 'id' | 'owners'>): boolean {
	return company.id !== 'default' && company.owners === 0;
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
