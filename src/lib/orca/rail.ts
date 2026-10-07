// The W0.1 rail on a desktop: a 56 px icon rail that opens as a 272 px panel
// over the content (no reflow) after a short hover, or at once on keyboard
// focus; it closes on leaving or Esc, never while keyboard focus is inside.
// Pinned, it stays open and the content moves aside; the pin is remembered in
// this browser (guarded).

export const RAIL_OPEN_MS = 250;
export const RAIL_CLOSE_MS = 150;
export const RAIL_PIN_KEY = 'orca.workspace.rail.pinned';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export type RailState = { open: boolean; pinned: boolean };

export function readPinned(storage: () => Storage | undefined): boolean {
	try {
		return storage()?.getItem(RAIL_PIN_KEY) === '1';
	} catch {
		return false;
	}
}

export function createRail(options: {
	storage: () => Storage | undefined;
	onchange: (state: RailState) => void;
	schedule?: (callback: () => void, ms: number) => unknown;
	cancel?: (handle: unknown) => void;
}) {
	const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
	const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	let open = false;
	let pinned = readPinned(options.storage);
	// Hover and keyboard focus are tracked apart (Codex W0.1 round 1): the
	// panel stays open while either is inside, so leaving with the pointer
	// never hides the control a keyboard user is on.
	let hovered = false;
	let keyboard = false;
	// After Esc the rail stays closed until the pointer or focus leaves it.
	let dismissed = false;
	let timer: unknown;
	const emit = () => options.onchange({ open: pinned || open, pinned });
	const clear = () => {
		if (timer !== undefined) cancel(timer);
		timer = undefined;
	};
	const set = (next: boolean) => {
		clear();
		if (open !== next) {
			open = next;
			emit();
		}
	};
	emit();
	return {
		get state(): RailState {
			return { open: pinned || open, pinned };
		},
		pointerEnter() {
			hovered = true;
			if (pinned || dismissed || open) {
				clear();
				return;
			}
			clear();
			timer = schedule(() => set(true), RAIL_OPEN_MS);
		},
		pointerLeave() {
			hovered = false;
			dismissed = false;
			clear();
			// Keyboard focus is still inside: it stays open until focus leaves.
			if (pinned || !open || keyboard) return;
			timer = schedule(() => set(false), RAIL_CLOSE_MS);
		},
		/** Focus moved to a control inside: keyboard focus (focus-visible) opens it at once; a click's focus does not. */
		focusIn(visible: boolean) {
			keyboard = visible;
			if (visible && !pinned && !dismissed) set(true);
		},
		/** Focus left the rail altogether: it closes unless the pointer is still over it. */
		focusOut() {
			keyboard = false;
			dismissed = false;
			if (pinned || hovered) return;
			set(false);
		},
		/** Esc: closes the panel; true when it handled the key. */
		escape(): boolean {
			if (pinned || !open) return false;
			dismissed = true;
			set(false);
			return true;
		},
		/** Unpinned while the pointer or keyboard focus is on it, the panel stays open as a hover panel. */
		togglePin() {
			pinned = !pinned;
			dismissed = false;
			clear();
			open = pinned ? open : hovered || keyboard;
			try {
				options.storage()?.setItem(RAIL_PIN_KEY, pinned ? '1' : '0');
			} catch {
				// Remembered for this page only.
			}
			emit();
		},
		dispose: clear
	};
}

type FocusNode = {
	matches(selector: string): boolean;
	closest(selector: string): FocusNode | null;
	querySelector(selector: string): FocusNode | null;
	previousElementSibling?: FocusNode | null;
};

/**
 * Before the panel collapses: where focus goes when the control it is on
 * hides on the 56 px rail (ตั้งค่า's caret and pages, the pin). The settings
 * item's own icon, or the ORCA mark beside the pin; null when it stays visible
 * or is not in the rail.
 */
export function railFocusTarget<T extends FocusNode>(active: T | null | undefined, rail: (FocusNode & { contains(node: unknown): boolean }) | null | undefined): T | null {
	if (!active || !rail || !rail.contains(active)) return null;
	const sub = active.closest('.w1-sub');
	if (sub) return (sub.previousElementSibling?.querySelector('a.w1-item') as T | null) ?? null;
	if (active.matches('.w1-caret')) return (active.closest('.w1-group')?.querySelector('a.w1-item') as T | null) ?? null;
	if (active.matches('.w1-pin')) return (rail.querySelector('.w1-brand') as T | null) ?? null;
	return null;
}
