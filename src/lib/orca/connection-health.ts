import type { OrcaConnectionHealth } from '$lib/services/orca';

export type HealthTone = 'ok' | 'warn' | 'bad' | 'idle';

export type HealthView = {
	tone: HealthTone;
	succeeded: number;
	/** Calls the system itself answered: successes plus its own failures. */
	attempts: number;
	needsSignIn: number;
	/** A tool changed at the vendor, so an administrator must review it again. */
	changed: boolean;
	lastFailureAt?: string;
	lastFailureCategory?: string;
};

const tones: Record<OrcaConnectionHealth['status'], HealthTone> = { healthy: 'ok', degraded: 'warn', failing: 'bad', idle: 'idle' };

/** A system missing from the report had no finished calls in the window, so it is idle. */
export function connectionHealthView(item: OrcaConnectionHealth | undefined): HealthView {
	if (!item) return { tone: 'idle', succeeded: 0, attempts: 0, needsSignIn: 0, changed: false };
	return {
		tone: tones[item.status] ?? 'idle',
		succeeded: item.succeeded,
		attempts: item.succeeded + item.failed,
		needsSignIn: item.needsSignIn,
		changed: item.changed > 0,
		lastFailureAt: item.lastFailureAt,
		lastFailureCategory: item.lastFailureCategory
	};
}

export function healthByConnection(items: OrcaConnectionHealth[]) {
	return new Map(items.map((item) => [item.connectionID, item]));
}
