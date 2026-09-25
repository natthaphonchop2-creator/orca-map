import type { OrcaApproval } from '$lib/services/orca';

export type ApprovalTone = 'waiting' | 'ok' | 'bad' | 'muted';

const tones: Record<OrcaApproval['status'], ApprovalTone> = {
	pending: 'waiting',
	running: 'waiting',
	succeeded: 'ok',
	failed: 'bad',
	rejected: 'muted',
	expired: 'muted'
};

export function approvalTone(status: OrcaApproval['status']): ApprovalTone {
	return tones[status] ?? 'muted';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

// Text stays as written; a list of records reads one record per line; anything
// nested deeper is compact JSON, so nothing the manager approves is hidden.
function readable(value: unknown, nested = false): string {
	if (value === null || value === undefined) return '—';
	if (typeof value === 'string') return value;
	if (typeof value !== 'object') return String(value);
	if (nested) return JSON.stringify(value);
	if (Array.isArray(value)) {
		if (!value.length) return '—';
		return value.every(isRecord) ? value.map((item) => recordLine(item)).join('\n') : value.map((item) => readable(item, true)).join(', ');
	}
	return recordLine(value as Record<string, unknown>);
}

function recordLine(record: Record<string, unknown>): string {
	const entries = Object.entries(record);
	return entries.length ? entries.map(([key, item]) => `${key}: ${readable(item, true)}`).join(' · ') : '—';
}

/** Top-level fields as label and readable value, in the order the AI app sent them. */
export function argumentEntries(value: unknown): [string, string][] {
	if (value === null || value === undefined) return [];
	if (!isRecord(value)) return [['', readable(value)]];
	return Object.entries(value).map(([key, item]) => [key, readable(item)]);
}

export function pendingApprovals(items: OrcaApproval[]) {
	return items.filter((item) => item.status === 'pending');
}
