// The W0.1 rail on a desktop: a 56 px icon rail that opens as a 272 px panel
// over the content (no reflow) after a short hover, or at once on keyboard
// focus; it closes on leaving or Esc. Pinned, it stays open and the content
// moves aside; the pin is remembered in this browser (guarded).

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
			if (pinned || dismissed || open) {
				clear();
				return;
			}
			clear();
			timer = schedule(() => set(true), RAIL_OPEN_MS);
		},
		pointerLeave() {
			dismissed = false;
			clear();
			if (pinned || !open) return;
			timer = schedule(() => set(false), RAIL_CLOSE_MS);
		},
		/** Keyboard focus (focus-visible) opens it at once; a click's focus does not. */
		focusIn(visible: boolean) {
			if (visible && !pinned && !dismissed) set(true);
		},
		/** Focus left the rail altogether. */
		focusOut() {
			dismissed = false;
			if (!pinned) set(false);
		},
		/** Esc: closes the panel; true when it handled the key. */
		escape(): boolean {
			if (pinned || !open) return false;
			dismissed = true;
			set(false);
			return true;
		},
		togglePin() {
			pinned = !pinned;
			dismissed = false;
			clear();
			if (!pinned) open = false;
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
