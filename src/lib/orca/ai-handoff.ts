// An AI app's ORCA sign-in on this workspace's login (C4 design §14h, W1-B4).
//
// The backend sends the browser to /orca/oauth/handoff/begin, which this
// server proxies: the backend claims the sign-in for this browser (an HttpOnly
// cookie only the mint and the confirm receive) and sends it to /login/ai.
// There the signed-in person continues: the page asks the backend for a
// one-time code and opens /orca/oauth/handoff?code=…, which this server
// redirects to the backend, where ORCA's consent page names the company and
// the account. The page never sees a state, the company or the AI app.
//
// Every address here is a constant path on this origin, plus at most one code
// in the backend's own format. Nothing the server answers is ever followed as
// a URL.
import { accountHeaders } from '../services/writes';
import { stoppedFromRefusal } from './platform-console';

/** The hand-off page. */
export const AI_HANDOFF_PAGE = '/login/ai';
/** Where both sign-ins (password and Google) return in AI mode: the page, continuing once by itself. */
export const AI_HANDOFF_RETURN = '/login/ai?signed=1';
/** The sign-in page in AI mode. */
export const AI_LOGIN = '/login?ai=1';
/** Mints the one-time code (backend, through this server's /api proxy). Never under a company's path. */
export const AI_HANDOFF_MINT_PATH = '/api/orca/ai-sign-in/handoff';
/** Redeems the code on the backend's origin (this server redirects it there). */
export const AI_HANDOFF_REDEEM_PATH = '/orca/oauth/handoff';
/** Break-glass: the backend's own sign-in page for the same sign-in. */
export const AI_HANDOFF_FALLBACK = '/orca/oauth/fallback';
/** "ใช้บัญชีอื่น": sign out here, then sign in again in AI mode. */
export const AI_SWITCH_ACCOUNT = `/oauth2/sign_out?rd=${encodeURIComponent(AI_LOGIN)}`;

// orcaRandom() on the backend: 32 random bytes, base64url, no padding.
const CODE = /^[A-Za-z0-9_-]{43}$/;

/** A hand-off code in the backend's exact format (orcaChallengePattern). */
export function validHandoffCode(value: unknown): value is string {
	return typeof value === 'string' && CODE.test(value);
}

/** Where the page goes with a code: the constant redemption path. Undefined for anything that isn't a code. */
export function handoffRedeemHref(code: unknown): string | undefined {
	return validHandoffCode(code) ? `${AI_HANDOFF_REDEEM_PATH}?code=${encodeURIComponent(code)}` : undefined;
}

/** Whether /login is signing someone in for an AI app: `ai=1`, or a return to the hand-off page. */
export function aiLoginMode(params: URLSearchParams): boolean {
	if (params.getAll('ai').includes('1')) return true;
	const rd = params.get('rd');
	if (!rd || !rd.startsWith('/') || rd.startsWith('//')) return false;
	try {
		return new URL(rd, 'https://orca.invalid').pathname === AI_HANDOFF_PAGE;
	} catch {
		return false;
	}
}

export type HandoffPageParams = {
	/** The backend could not claim the sign-in (`error=expired`). */
	expired: boolean;
	/** The person just signed in on /login for this (`signed=1`): continue once by itself. */
	signed: boolean;
};

/** The hand-off page's own parameters. Only the exact values count; anything else is ignored. */
export function handoffPageParams(params: URLSearchParams): HandoffPageParams {
	const one = (key: string, value: string) => {
		const values = params.getAll(key);
		return values.length === 1 && values[0] === value;
	};
	return { expired: one('error', 'expired'), signed: one('signed', '1') };
}

/**
 * The page continues by itself only once, only right after the sign-in, and
 * only for a signed-in person. Any site can link to /login/ai?signed=1, so this
 * skips nothing: ORCA's consent page still names the account and needs a click.
 */
export function shouldContinueBySelf(page: HandoffPageParams & { signedIn: boolean; tried: boolean }): boolean {
	return page.signed && page.signedIn && !page.expired && !page.tried;
}

export type HandoffDecision = 'continue' | 'cancel';

export type HandoffOutcome =
	/** Open the redemption: the only navigation the page makes with a code. */
	| { kind: 'redeem'; href: string }
	/** 403 not_member: this account isn't in the company the AI app asked for. No code was made. */
	| { kind: 'not-member' }
	/** 404: the sign-in is gone, was started in another browser, or this server can't hand it off. */
	| { kind: 'expired' }
	/** 412: another tab signed in as someone else; the page reloads as that account. */
	| { kind: 'account-changed' }
	/** 401: signed out since the page opened. */
	| { kind: 'signed-out' }
	/**
	 * 423: the company is suspended or closed (platform console C6 §4.2). Only
	 * its own member, signed in, is told; no code was made.
	 */
	| { kind: 'stopped'; status: 'suspended' | 'closed' }
	/** Anything else: try again. */
	| { kind: 'retry' };

/** What a mint answer means for the page. The server writes its refusals as plain text. */
export function handoffOutcome(status: number, body: string, json?: unknown): HandoffOutcome {
	if (status === 200) {
		// Only the code is read. A URL in the answer, of any name, is never followed.
		const href = handoffRedeemHref(json && typeof json === 'object' ? (json as { code?: unknown }).code : undefined);
		return href ? { kind: 'redeem', href } : { kind: 'retry' };
	}
	if (status === 403 && body.includes('not_member')) return { kind: 'not-member' };
	if (status === 404) return { kind: 'expired' };
	if (status === 412 && body.includes('orca_account_changed')) return { kind: 'account-changed' };
	if (status === 401) return { kind: 'signed-out' };
	const stopped = stoppedFromRefusal(status, body);
	if (stopped) return { kind: 'stopped', status: stopped };
	return { kind: 'retry' };
}

type Fetch = (input: string, init: RequestInit) => Promise<Pick<Response, 'status' | 'text'>>;

/**
 * Asks the backend for a one-time code for this browser's AI sign-in, as the
 * account this page shows (`X-Orca-Account`): another tab's account gets 412
 * before anything is made. A page that doesn't know its account asks nothing.
 */
export async function mintHandoff(decision: HandoffDecision, account: string, fetcher: Fetch): Promise<HandoffOutcome> {
	if (!account) return { kind: 'retry' };
	let response: Pick<Response, 'status' | 'text'>;
	try {
		response = await fetcher(AI_HANDOFF_MINT_PATH, {
			method: 'POST',
			credentials: 'same-origin',
			cache: 'no-store',
			headers: { 'Content-Type': 'application/json', ...accountHeaders(account) },
			body: JSON.stringify({ decision })
		});
	} catch {
		return { kind: 'retry' };
	}
	let body = '';
	try {
		body = await response.text();
	} catch {
		return { kind: 'retry' };
	}
	let json: unknown;
	if (response.status === 200) {
		try {
			json = JSON.parse(body);
		} catch {
			return { kind: 'retry' };
		}
	}
	return handoffOutcome(response.status, body, json);
}
