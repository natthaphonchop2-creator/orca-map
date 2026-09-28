// Page-level bookkeeping for the workspace's rule of one page, one account,
// one company (C4 design §14d, EP4b #2).

// Writes still in flight: from the request until its response is read.
let writes = 0;

export function writesInFlight(): number {
	return writes;
}

/** Runs a write, counting it until it has finished, response and all. */
export async function counted<T>(write: () => Promise<T>): Promise<T> {
	writes++;
	try {
		return await write();
	} finally {
		writes--;
	}
}

// The account this page was opened for, fixed before its first request, like
// its company. Pages outside the workspace fall back to the signed-in profile.
let pageAccount = '';

export function setPageAccount(id: string) {
	if (id && !pageAccount) pageAccount = id;
}

export function pageAccountOr(fallback: string | undefined): string | undefined {
	return pageAccount || fallback || undefined;
}

export const ORCA_ACCOUNT_HEADER = 'X-Orca-Account';
const ORCA_ACCOUNT_CHANGED = 'orca_account_changed';

/** Binds a request to the account this page was opened for, so the server
 * refuses it if another tab has since signed in as someone else. Every
 * request counts, not only ORCA's: a page also creates local accounts and
 * catalog entries through the engine's routes. */
export function accountHeaders(account: string | undefined): Record<string, string> {
	return account ? { [ORCA_ACCOUNT_HEADER]: account } : {};
}

/** Whether a response says this page's account is no longer the session's. */
export function orcaAccountChanged(status: number, body: string): boolean {
	return status === 412 && body.includes(ORCA_ACCOUNT_CHANGED);
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/**
 * Opens the page afresh after the session changed account, at most once in
 * ten seconds: a page that keeps disagreeing with its session shows the error
 * instead of reloading forever. Without storage to remember the last reload,
 * it never reloads by itself; the page asks the person to.
 */
export function reloadForAccount(reload: () => void, storage: Storage | undefined, now = Date.now()): boolean {
	const key = 'orca.accountReload';
	if (!storage) return false;
	try {
		const last = storage.getItem(key);
		if (last && now - Number(last) < 10_000) return false;
		storage.setItem(key, String(now));
	} catch {
		return false;
	}
	reload();
	return true;
}

type PageEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Keeps a page from outliving its account and company: a page the browser
 * restores from its back-forward cache is opened afresh, and leaving while a
 * save is in flight asks first. Returns the cleanup.
 */
export function guardPage(target: PageEvents, reload: () => void, inFlight: () => number = writesInFlight): () => void {
	const onShow = (event: Event) => {
		if ((event as PageTransitionEvent).persisted) reload();
	};
	const onLeave = (event: Event) => {
		if (inFlight() > 0) event.preventDefault();
	};
	target.addEventListener('pageshow', onShow);
	target.addEventListener('beforeunload', onLeave);
	return () => {
		target.removeEventListener('pageshow', onShow);
		target.removeEventListener('beforeunload', onLeave);
	};
}
