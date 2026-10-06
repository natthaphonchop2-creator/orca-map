// One place where a page learns that its company stopped (platform console
// C6 §4.2, Codex PC1 review 1 MAJOR 4). Any request for this page's company
// that the server refuses with 423 and the company's status, from a poll, a
// timer, a load or a save, stops the whole page at once: the page opens the
// suspended page (CompanyGate) in place of the workspace, every load still on
// its way for the company is aborted, and every later request for it fails at
// once with the same 423, without reaching the server. A page acts for one
// company for its whole life, so it never starts again; a reload asks anew.

import { currentCompany, DEFAULT_COMPANY } from './company';
import { stoppedFromRefusal, type CompanyStatus } from './platform-console';

export type StoppedStatus = Exclude<CompanyStatus, 'active'>;

/** The code a company route answers with 423, which the gate reads. */
export function stoppedCode(status: StoppedStatus): string {
	return status === 'closed' ? 'orca_company_closed' : 'orca_company_suspended';
}

/**
 * Whether a request path acts for `company`: its routes under
 * /orca/orgs/<id>/. ORCA's own company (the legacy /orca/… paths) is never
 * suspended or closed, and the platform's routes and the person's company
 * list are nobody's company, so none of them can stop a page.
 */
export function companyScopedPath(path: string, company: string): boolean {
	if (company === DEFAULT_COMPANY) return false;
	const route = path.split(/[?#]/, 1)[0];
	const prefix = `/orca/orgs/${company}`;
	return route === prefix || route.startsWith(`${prefix}/`);
}

export type CompanyStop = ReturnType<typeof createCompanyStop>;

/** A page's stop, for the company `company()` names. */
export function createCompanyStop(company: () => string) {
	let stopped: StoppedStatus | undefined;
	const controller = new AbortController();
	const listeners = new Set<(status: StoppedStatus) => void>();

	function stop(status: StoppedStatus) {
		if (stopped === status || stopped === 'closed') return;
		stopped = status;
		if (!controller.signal.aborted) controller.abort();
		for (const listener of [...listeners]) listener(status);
	}

	return {
		/** "suspended" or "closed" once this page's company stopped. */
		stopped: () => stopped,
		scoped: (path: string) => companyScopedPath(path, company()),
		/**
		 * Reads a refused answer: a 423 with the company's status, for a
		 * request of this page's company, stops the page. Anything else, and
		 * another company's or the platform's answer, changes nothing.
		 */
		notice(status: number | undefined, path: string, body: string): StoppedStatus | undefined {
			if (!companyScopedPath(path, company())) return undefined;
			const refused = stoppedFromRefusal(status, body);
			if (refused) stop(refused);
			return refused;
		},
		/** The status a request for `path` is refused with now, before it goes out. */
		refusal(path: string): StoppedStatus | undefined {
			return stopped && companyScopedPath(path, company()) ? stopped : undefined;
		},
		/** The signal a load for `path` runs under: aborted when the company stops. */
		signal(path: string, signal?: AbortSignal): AbortSignal | undefined {
			if (!companyScopedPath(path, company())) return signal;
			if (!signal) return controller.signal;
			return anySignal([signal, controller.signal]);
		},
		/** Aborted when this page's company stops; none for ORCA's own company, which never does. */
		pageSignal(): AbortSignal | undefined {
			return company() === DEFAULT_COMPANY ? undefined : controller.signal;
		},
		/** Calls `listener` once the company stops (at once if it has). */
		subscribe(listener: (status: StoppedStatus) => void): () => void {
			if (stopped) listener(stopped);
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		stop
	};
}

function anySignal(signals: AbortSignal[]): AbortSignal {
	const any = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
	if (any) return any(signals);
	const controller = new AbortController();
	for (const signal of signals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			break;
		}
		signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
	}
	return controller.signal;
}

/** This page's stop: the one every request and every page shares. */
export const companyStop = createCompanyStop(currentCompany);

/** Calls `listener` once this page's company stops. */
export function onCompanyStop(listener: (status: StoppedStatus) => void): () => void {
	return companyStop.subscribe(listener);
}

/** Whether this page's company stopped: "suspended", "closed" or nothing. */
export function companyStopped(): StoppedStatus | undefined {
	return companyStop.stopped();
}
