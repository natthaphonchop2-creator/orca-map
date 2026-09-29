// The toast queue behind Toast.svelte: short confirmations ("สร้างแล้ว") that
// leave by themselves. At most three show at once; the oldest goes first.

export type ToastTone = 'ok' | 'info' | 'error';
export type ToastItem = { id: number; message: string; tone: ToastTone };
export type ToastOptions = { tone?: ToastTone; timeout?: number };

export const TOAST_TIMEOUT_MS = 5000;
export const TOAST_LIMIT = 3;

export function createToastQueue(
	publish: (items: ToastItem[]) => void,
	schedule: (callback: () => void, ms: number) => unknown = setTimeout,
	cancel: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
) {
	let items: ToastItem[] = [];
	let nextID = 1;
	const timers = new Map<number, unknown>();
	function update(next: ToastItem[]) {
		items = next;
		publish(items);
	}
	function dismiss(id: number) {
		const timer = timers.get(id);
		if (timer !== undefined) cancel(timer);
		timers.delete(id);
		if (items.some((item) => item.id === id)) update(items.filter((item) => item.id !== id));
	}
	function push(message: string, options: ToastOptions = {}) {
		const text = message.trim();
		if (!text) return 0;
		const item: ToastItem = { id: nextID++, message: text, tone: options.tone ?? 'ok' };
		const next = [...items, item];
		while (next.length > TOAST_LIMIT) {
			const oldest = next.shift()!;
			const timer = timers.get(oldest.id);
			if (timer !== undefined) cancel(timer);
			timers.delete(oldest.id);
		}
		update(next);
		// An error stays until it is dismissed.
		const timeout = options.timeout ?? (item.tone === 'error' ? 0 : TOAST_TIMEOUT_MS);
		if (timeout > 0) timers.set(item.id, schedule(() => dismiss(item.id), timeout));
		return item.id;
	}
	function clear() {
		for (const timer of timers.values()) cancel(timer);
		timers.clear();
		update([]);
	}
	return { push, dismiss, clear, get items() { return items; } };
}
