// Copying text for CopyField: the clipboard API first, then a hidden textarea
// for browsers (or embedded webviews) that refuse it.

type ClipboardLike = { writeText(text: string): Promise<void> } | undefined;
type DocumentLike =
	| {
			createElement(tag: 'textarea'): HTMLTextAreaElement;
			body: { appendChild(node: Node): unknown; removeChild(node: Node): unknown };
			execCommand?(command: string): boolean;
			activeElement?: Element | null;
	  }
	| undefined;

export async function copyText(text: string, clipboard: ClipboardLike, doc?: DocumentLike): Promise<boolean> {
	if (!text) return false;
	try {
		if (clipboard) {
			await clipboard.writeText(text);
			return true;
		}
	} catch {
		// Fall through to the textarea copy.
	}
	if (!doc?.execCommand) return false;
	// Selecting the hidden textarea takes focus; it goes back to the copy button after.
	const previous = doc.activeElement as (Element & { focus?: () => void }) | null | undefined;
	const area = doc.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	doc.body.appendChild(area);
	try {
		area.select();
		return doc.execCommand('copy') === true;
	} catch {
		return false;
	} finally {
		doc.body.removeChild(area);
		if (previous && typeof previous.focus === 'function') previous.focus();
	}
}

/** How long "คัดลอกแล้ว" stays before the button reads its label again. */
export const COPIED_FEEDBACK_MS = 2000;

/** One timer per field: a second copy restarts it instead of stacking timers. */
export function copyFeedback(
	onchange: (copied: boolean) => void,
	schedule: (callback: () => void, ms: number) => unknown = setTimeout,
	cancel: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	ms = COPIED_FEEDBACK_MS
) {
	let handle: unknown;
	return {
		copied() {
			if (handle !== undefined) cancel(handle);
			onchange(true);
			handle = schedule(() => {
				handle = undefined;
				onchange(false);
			}, ms);
		},
		dispose() {
			if (handle !== undefined) cancel(handle);
			handle = undefined;
		}
	};
}
