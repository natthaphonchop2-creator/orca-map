import type { OrcaHub, OrcaMember, OrcaSecrets } from '$lib/services/orca';

/** A key or sign-in unused this long is worth a second look. */
export const STALE_DAYS = 30;
const DAY = 86_400_000;

export type SecretRow = {
	kind: 'session' | 'key';
	id: string;
	keyID?: number;
	/** The AI app's name, or the key's name. */
	label: string;
	userID: string;
	/** Empty when the holder is no longer a member. */
	member: string;
	/** Held by an owner: only an owner may revoke it. */
	ownerHeld: boolean;
	/** For keys: undefined reaches every workspace; otherwise the workspace's ID and name. */
	hubID?: string;
	hubName?: string;
	createdAt: string;
	lastActiveAt?: string;
	expiresAt?: string;
	neverExpires: boolean;
	stale: boolean;
};

const time = (value?: string) => (value ? Date.parse(value) || 0 : 0);
const newestFirst = (a: SecretRow, b: SecretRow) =>
	(time(b.lastActiveAt) || time(b.createdAt)) - (time(a.lastActiveAt) || time(a.createdAt));

export function secretRows(
	inventory: OrcaSecrets,
	members: Pick<OrcaMember, 'id' | 'displayName' | 'email' | 'role'>[],
	hubs: Pick<OrcaHub, 'id' | 'name'>[],
	now: number,
	/** organizationRole(role) === 'owner', passed in so this module stays dependency-free. */
	isOwner: (role: string | number) => boolean
) {
	const byID = new Map(members.map((member) => [member.id, member]));
	const hubNames = new Map(hubs.map((hub) => [hub.id, hub.name]));
	const holder = (userID: string) => {
		const member = byID.get(userID);
		return { member: member ? member.displayName || member.email || member.id : '', ownerHeld: member ? isOwner(member.role) : false };
	};
	const stale = (lastActive: string | undefined, created: string) => now - (time(lastActive) || time(created)) >= STALE_DAYS * DAY;
	const sessions: SecretRow[] = inventory.sessions
		.map((session) => ({
			kind: 'session' as const,
			id: session.id,
			label: session.app,
			userID: session.userID,
			...holder(session.userID),
			createdAt: session.createdAt,
			lastActiveAt: session.lastRefreshedAt,
			expiresAt: session.expiresAt,
			neverExpires: false,
			stale: stale(session.lastRefreshedAt, session.createdAt)
		}))
		.sort(newestFirst);
	const keys: SecretRow[] = inventory.keys
		.map((key) => ({
			kind: 'key' as const,
			id: String(key.id),
			keyID: key.id,
			label: key.name,
			userID: key.userID,
			...holder(key.userID),
			hubID: key.hubID || undefined,
			hubName: key.hubID ? hubNames.get(key.hubID) : undefined,
			createdAt: key.createdAt,
			lastActiveAt: key.lastUsedAt,
			expiresAt: key.expiresAt,
			neverExpires: !key.expiresAt,
			stale: stale(key.lastUsedAt, key.createdAt)
		}))
		.sort(newestFirst);
	return { sessions, keys };
}

/** Members who hold at least one row, for the "whose access" filter. */
export function secretHolders(rows: SecretRow[]) {
	const seen = new Map<string, string>();
	for (const row of rows) if (!seen.has(row.userID)) seen.set(row.userID, row.member);
	return [...seen].map(([userID, member]) => ({ userID, member })).sort((a, b) => a.member.localeCompare(b.member));
}

/** Only an owner may revoke an owner's access; anyone may revoke their own. */
export function canRevokeSecret(row: SecretRow, viewerID: string, viewerIsOwner: boolean) {
	return !row.ownerHeld || viewerIsOwner || row.userID === viewerID;
}
