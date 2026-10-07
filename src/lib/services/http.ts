import { UNAUTHORIZED_PATHS, UNAUTHORIZED_PATH_PREFIXES } from '$lib/constants';
import { createHttpError } from '$lib/errors';
import { companyStop, stoppedCode } from '$lib/orca/company-stop';
import { loginHref } from '$lib/orca/navigation';
import errors from '$lib/stores/errors.svelte';
import profile from '$lib/stores/profile.svelte';
import { accountHeaders, counted, orcaAccountChanged, pageAccountOr, reloadForAccount, writesInFlight } from './writes';

// For SSR, use VITE_API_TARGET if set (for remote API development)
// For browser, use window.location.origin (requests go through Vite proxy)
const apiTarget = import.meta.env.VITE_API_TARGET as string | undefined;
export let baseURL = 'http://localhost:8080/api';

if (typeof window !== 'undefined') {
	baseURL = baseURL.replace('http://localhost:8080', window.location.origin);
} else if (apiTarget) {
	// SSR: use the configured API target directly
	baseURL = apiTarget.endsWith('/api') ? apiTarget : apiTarget + '/api';
}

// Every request names the account this page was opened for.
function getAuthHeaders(_path: string): Record<string, string> {
	return accountHeaders(pageAccountOr(profile.current.id));
}

// Another tab signed in as someone else: this page belongs to the old
// account, so open it afresh as the new one.
function accountChanged(status: number, body: string) {
	if (typeof window !== 'undefined' && orcaAccountChanged(status, body)) {
		let storage: Storage | undefined;
		try {
			storage = window.sessionStorage;
		} catch {
			storage = undefined;
		}
		reloadForAccount(() => window.location.reload(), storage);
	}
}

export { writesInFlight };

// Once this page's company is suspended or closed, a request for it fails at
// once with the company's 423, never reaching the server; and a 423 for it,
// from any request, stops the page (platform console C6 §4.2, company-stop).
function companyRefusal(path: string): Error | undefined {
	const status = companyStop.refusal(path);
	return status ? createHttpError(423, path, stoppedCode(status)) : undefined;
}

interface GetOptions {
	blob?: boolean;
	/** When true, return response body as plain text (e.g. for text/markdown). */
	text?: boolean;
	fetch?: typeof fetch;
	dontLogErrors?: boolean;
	signal?: AbortSignal;
}

function handle401Redirect() {
	if (typeof window === 'undefined') return;
	const currentPath = window.location.pathname;

	// User was logged in, but the session expired
	// Set expired and re-login dialog will show
	if (profile.current.loaded === true) {
		profile.current.expired = true;
		return;
	}

	// Not logged in, so if the user is
	// not already on an unauthorized page, redirect to it
	if (!UNAUTHORIZED_PATHS.has(currentPath) && !UNAUTHORIZED_PATH_PREFIXES.some((prefix) => currentPath.startsWith(prefix))) {
		window.location.href = loginHref(window.location);
	}
}

export async function doGet(path: string, opts?: GetOptions): Promise<unknown> {
	const resp = await doGetForResponse(path, opts);

	if (opts?.blob) {
		return await resp.blob();
	}

	if (opts?.text) {
		return await resp.text();
	}

	return await resp.json();
}

// Returns a successful raw GET response so callers can consume both its body
// and response headers, as required for file downloads.
export async function doGetForResponse(path: string, opts?: GetOptions): Promise<Response> {
	const f = opts?.fetch || fetch;
	const refused = companyRefusal(path);
	if (refused) throw refused;
	let resp: Response;
	try {
		resp = await f(baseURL + path, {
			headers: {
				...getAuthHeaders(path),
				// Pass the browser timezone as a request header.
				// This is consumed during authentication to set the user's default timezone in Obot.
				// The timezone is plumbed down to tools at runtime as an environment variable.
				'x-obot-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
			},
			// A load for the page's company is aborted when the company stops.
			signal: companyStop.signal(path, opts?.signal)
		});
	} catch (e) {
		throw companyRefusal(path) ?? e;
	}

	if (!resp.ok) {
		if (resp.status === 401) {
			handle401Redirect();
		}
		const body = await resp.text();
		accountChanged(resp.status, body);
		companyStop.notice(resp.status, path, body);
		const e = createHttpError(resp.status, path, body);
		if (opts?.dontLogErrors) {
			throw e;
		}
		errors.items.push(e);
		throw e;
	}

	return resp;
}

type ResponseHandler = (
	resp: Response,
	path: string,
	opts?: { dontLogErrors?: boolean }
) => Promise<unknown>;

export async function doDelete(
	path: string,
	opts?: {
		signal?: AbortSignal;
		dontLogErrors?: boolean;
		fetch?: typeof fetch;
		responseHandler?: ResponseHandler;
		keepalive?: boolean;
	}
): Promise<unknown> {
	// Counted until its response is handled, so a switch never cuts it off.
	return counted(async () => {
		const refused = companyRefusal(path);
		if (refused) throw refused;
		const f = opts?.fetch || fetch;
		const resp = await f(baseURL + path, {
			method: 'DELETE',
			headers: getAuthHeaders(path),
			...(opts?.keepalive ? { keepalive: true } : { signal: opts?.signal })
		});

		if (!resp.ok && resp.status === 401) {
			handle401Redirect();
		}
		return opts?.responseHandler?.(resp, path, opts) ?? handleResponse(resp, path, opts);
	});
}

export async function doPut(
	path: string,
	input?: string | object | Blob,
	opts?: {
		dontLogErrors?: boolean;
		fetch?: typeof fetch;
		signal?: AbortSignal;
	}
): Promise<unknown> {
	return await doWithBody('PUT', path, input, opts);
}

export async function handleResponse(
	resp: Response,
	path: string,
	opts?: {
		dontLogErrors?: boolean;
	}
): Promise<unknown> {
	if (!resp.ok) {
		const body = await resp.text();
		accountChanged(resp.status, body);
		companyStop.notice(resp.status, path, body);
		const e = createHttpError(resp.status, path, body);
		if (opts?.dontLogErrors) {
			throw e;
		}
		errors.items.push(e);
		throw e;
	}
	if (resp.headers.get('Content-Type')?.includes('application/json')) {
		return resp.json();
	}
	return resp.text();
}

export async function doWithBody(
	method: string,
	path: string,
	input?: string | object | Blob | FormData,
	opts?: {
		dontLogErrors?: boolean;
		fetch?: typeof fetch;
		headers?: Record<string, string>;
		signal?: AbortSignal;
	}
): Promise<unknown> {
	let headers: Record<string, string> | undefined;
	let body: BodyInit | undefined;

	if (input instanceof FormData) {
		// Let the browser automatically set the Content-Type with proper boundary.
		body = input;
		headers = undefined;
	} else if (input instanceof Blob) {
		body = input;
		headers = { 'Content-Type': 'application/octet-stream' };
	} else if (typeof input === 'object' && input !== null) {
		body = JSON.stringify(input);
		headers = { 'Content-Type': 'application/json' };
	} else if (typeof input === 'string') {
		body = input;
		headers = { 'Content-Type': 'text/plain' };
	}

	try {
		// Counted until its response is handled, so a switch never cuts it off.
		return await counted(async () => {
			const refused = companyRefusal(path);
			if (refused) throw refused;
			const f = opts?.fetch || fetch;
			const resp = await f(baseURL + path, {
				method,
				headers: { ...getAuthHeaders(path), ...headers, ...opts?.headers },
				body,
				signal: opts?.signal
			});

			if (!resp.ok && resp.status === 401) {
				handle401Redirect();
			}
			return handleResponse(resp, path, opts);
		});
	} catch (e) {
		if (opts?.dontLogErrors) {
			throw e;
		}
		errors.append(e);
		throw e;
	}
}

export async function doPost(
	path: string,
	input: string | object | Blob,
	opts?: {
		dontLogErrors?: boolean;
		fetch?: typeof fetch;
		headers?: Record<string, string>;
		signal?: AbortSignal;
	}
): Promise<unknown> {
	return await doWithBody('POST', path, input, opts);
}

export async function doPatch(
	path: string,
	input?: string | object | Blob,
	opts?: {
		dontLogErrors?: boolean;
		fetch?: typeof fetch;
		signal?: AbortSignal;
	}
): Promise<unknown> {
	return await doWithBody('PATCH', path, input, opts);
}

/** The part of XMLHttpRequest an upload uses (a test passes its own). */
export interface UploadRequest {
	open(method: string, url: string): void;
	setRequestHeader(name: string, value: string): void;
	send(body: FormData): void;
	abort(): void;
	readonly status: number;
	readonly responseText: string;
	upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null; onload?: (() => void) | null };
	onload: (() => void) | null;
	onerror: (() => void) | null;
	onabort: (() => void) | null;
}

/**
 * A multipart POST with upload progress (fetch has none): the knowledge
 * library's file uploads. Like doPost it names the page's account, counts as
 * a write until its answer is read, and fails with the same HttpError. The
 * browser sets the multipart type, its boundary and the body's length.
 */
export function doUpload(
	path: string,
	form: FormData,
	opts?: {
		/** Bytes of the body sent so far, and the body's size (0 when unknown). */
		onprogress?: (loaded: number, total: number) => void;
		/** The whole body was sent: a cancel or a lost answer after this leaves its outcome unknown. */
		onsent?: () => void;
		signal?: AbortSignal;
		dontLogErrors?: boolean;
		request?: () => UploadRequest;
	}
): Promise<unknown> {
	return counted(
		() =>
			new Promise<unknown>((resolve, reject) => {
				const aborted = () => {
					const error = new Error('The upload was cancelled');
					error.name = 'AbortError';
					return error;
				};
				if (opts?.signal?.aborted) {
					reject(aborted());
					return;
				}
				const refused = companyRefusal(path);
				if (refused) {
					reject(refused);
					return;
				}
				const request: UploadRequest = opts?.request?.() ?? (new XMLHttpRequest() as unknown as UploadRequest);
				const stop = () => request.abort();
				const done = () => opts?.signal?.removeEventListener('abort', stop);
				request.open('POST', baseURL + path);
				for (const [name, value] of Object.entries(getAuthHeaders(path))) request.setRequestHeader(name, value);
				request.upload.onprogress = (event) => opts?.onprogress?.(event.loaded, event.lengthComputable ? event.total : 0);
				// The whole body is on its way: from here the server may store it even if no answer comes back.
				request.upload.onload = () => opts?.onsent?.();
				request.onload = () => {
					done();
					const body = request.responseText ?? '';
					if (request.status < 200 || request.status >= 300) {
						if (request.status === 401) handle401Redirect();
						accountChanged(request.status, body);
						companyStop.notice(request.status, path, body);
						const e = createHttpError(request.status, path, body);
						if (!opts?.dontLogErrors) errors.items.push(e);
						reject(e);
						return;
					}
					try {
						resolve(body ? JSON.parse(body) : {});
					} catch {
						resolve(body);
					}
				};
				request.onerror = () => {
					done();
					reject(new TypeError('The upload did not reach ORCA'));
				};
				request.onabort = () => {
					done();
					reject(aborted());
				};
				opts?.signal?.addEventListener('abort', stop, { once: true });
				request.send(form);
			})
	);
}

export type Fetcher = typeof fetch;

export type PaginatedResponse<T> = {
	items: T[] | null;
	total: number;
	offset: number;
	limit: number;
};
