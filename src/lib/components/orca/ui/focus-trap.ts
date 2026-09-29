// Keeps Tab inside a modal (ConfirmDialog, Sheet) and returns focus to where it
// was when the modal closes.

export const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab (or Shift+Tab) should go so focus stays inside: the other end when
 * it would leave, or undefined to let the browser move it normally.
 */
export function wrapFocus<T>(items: readonly T[], active: T | null | undefined, backwards: boolean): T | undefined {
	if (!items.length) return undefined;
	const first = items[0];
	const last = items[items.length - 1];
	const index = active == null ? -1 : items.indexOf(active);
	if (index === -1) return backwards ? last : first;
	if (backwards && index === 0) return last;
	if (!backwards && index === items.length - 1) return first;
	return undefined;
}

export function focusableIn(root: ParentNode): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(element) => !element.hasAttribute('inert') && element.getClientRects().length > 0
	);
}

/** A keydown handler for the modal's root element. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | undefined) {
	if (event.key !== 'Tab' || !root) return;
	const target = wrapFocus(focusableIn(root), document.activeElement as HTMLElement | null, event.shiftKey);
	if (target) {
		event.preventDefault();
		target.focus();
	}
}

/** Remembers the focused element now; the returned function puts focus back. */
export function rememberFocus(doc: Pick<Document, 'activeElement'> | undefined = typeof document === 'undefined' ? undefined : document) {
	const previous = doc?.activeElement as (Element & { focus?: () => void; isConnected?: boolean }) | null | undefined;
	return () => {
		if (previous && previous.isConnected !== false && typeof previous.focus === 'function') previous.focus();
	};
}
