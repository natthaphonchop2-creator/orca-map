import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { canInviteOwner, emailDomain, ownerStatus, platformRefusal, signInWarnings } = await importTypeScript(new URL('./platform-companies.ts', import.meta.url));
const { canRenewInvitation, invitedByPlatform } = await importTypeScript(new URL('./invitations.ts', import.meta.url));

const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const invitation = (status) => ({ id: `oin-${status}`, email: 'owner@hotel-a.example', expiresAt: '2026-10-05T00:00:00Z', status });

test('a company has an owner, one waiting, a link that expired, or nobody yet', () => {
	assert.equal(ownerStatus({ owners: 1, ownerInvitations: [invitation('pending')] }), 'owned');
	assert.equal(ownerStatus({ owners: 0, ownerInvitations: [invitation('expired'), invitation('pending')] }), 'waiting');
	assert.equal(ownerStatus({ owners: 0, ownerInvitations: [invitation('expired')] }), 'expired');
	assert.equal(ownerStatus({ owners: 0, ownerInvitations: [] }), 'none');
});

test('the platform invites an owner only into a customer company nobody owns', () => {
	assert.equal(canInviteOwner({ id: B, owners: 0 }), true);
	assert.equal(canInviteOwner({ id: B, owners: 1 }), false);
	assert.equal(canInviteOwner({ id: 'default', owners: 0 }), false);
});

test('the operator is warned when the person can\'t make an account yet', () => {
	assert.deepEqual(signInWarnings({ googleSignIn: true, emailDomainAllowed: true }), []);
	assert.deepEqual(signInWarnings({ googleSignIn: false, emailDomainAllowed: true }), ['google']);
	assert.deepEqual(signInWarnings({ googleSignIn: true, emailDomainAllowed: false }), ['domain']);
	assert.deepEqual(signInWarnings({ googleSignIn: false, emailDomainAllowed: false }), ['google', 'domain']);
	assert.equal(emailDomain('owner@hotel-a.example'), 'hotel-a.example');
});

test('only the server\'s own conflicts become specific advice', () => {
	for (const [message, refusal] of [
		['a company with this name already exists', 'name-taken'],
		['this company has an owner; its owners invite people', 'has-owner'],
		['an invitation for this email is already waiting', 'waiting'],
		['this person is suspended or removed; restore them instead', 'unavailable'],
		['this invitation was already used, revoked or has expired', 'closed'],
	]) {
		assert.equal(platformRefusal(409, message), refusal, message);
		assert.equal(platformRefusal(400, message), undefined, `${message} as 400`);
	}
	assert.equal(platformRefusal(409, 'this item changed; reload before saving again'), undefined);
});

test('an owner invitation from the platform names ORCA, and nobody in the company renews it', () => {
	const members = ['4', '5'];
	assert.equal(invitedByPlatform({ role: 'owner', invitedBy: '1' }, members), true);
	assert.equal(invitedByPlatform({ role: 'owner', invitedBy: '4' }, members), false, 'a member who is also the operator is named');
	assert.equal(invitedByPlatform({ role: 'employee', invitedBy: '1' }, members), false, 'a former member is not the platform');
	assert.equal(invitedByPlatform({ role: 'owner' }, members), true);
	for (const canInviteAdmins of [true, false]) {
		assert.equal(canRenewInvitation({ role: 'owner' }, canInviteAdmins), false);
		assert.equal(canRenewInvitation({ role: 'employee' }, canInviteAdmins), true);
		assert.equal(canRenewInvitation({ role: 'admin' }, canInviteAdmins), canInviteAdmins);
	}
});
