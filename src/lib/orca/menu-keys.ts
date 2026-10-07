// Keyboard rules the W0.1 shell shares: menus (arrows, Home, End skip disabled
// rows) and the global shortcuts (C then a letter, ⌘K), read by event.code so
// they work on a Thai layout, where event.key is "แ" for the C key.

/** The row arrows, Home or End move to; disabled rows are skipped. -1 when there is none. */
export function menuMove(disabled: readonly boolean[], current: number, key: string): number {
	const enabled = disabled.map((off, index) => (off ? -1 : index)).filter((index) => index >= 0);
	if (!enabled.length) return -1;
	if (key === 'Home') return enabled[0];
	if (key === 'End') return enabled[enabled.length - 1];
	const at = enabled.indexOf(current);
	if (key === 'ArrowDown') return at === -1 ? enabled[0] : enabled[(at + 1) % enabled.length];
	if (key === 'ArrowUp') return at === -1 ? enabled[enabled.length - 1] : enabled[(at - 1 + enabled.length) % enabled.length];
	return current;
}

export type KeyLike = { key: string; code: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; target?: unknown };

/** Typing in a field: inputs, textareas, selects and anything contenteditable. */
export function typingIn(target: unknown): boolean {
	const element = target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null | undefined;
	if (!element) return false;
	if (element.isContentEditable) return true;
	if (/^(INPUT|TEXTAREA|SELECT)$/i.test(element.tagName ?? '')) return true;
	return !!element.closest?.('[contenteditable=""], [contenteditable="true"]');
}

/** ⌘K or Ctrl+K: ไปที่…, wherever focus is. */
export function isJumpShortcut(event: KeyLike): boolean {
	return event.code === 'KeyK' && (event.metaKey === true || event.ctrlKey === true) && !event.altKey;
}

export const SEQUENCE_MS = 1200;

/**
 * "C then <letter>": `read` takes each keydown and says what to do. C arms the
 * sequence; the next key's code within SEQUENCE_MS picks the item. Ignored
 * while typing in a field and with Ctrl, Cmd or Alt held.
 */
export function createSequence(now: () => number = () => Date.now()) {
	let armedAt = -Infinity;
	return {
		read(event: KeyLike): { action: 'none' } | { action: 'armed' } | { action: 'pick'; code: string } {
			if (event.metaKey || event.ctrlKey || event.altKey || typingIn(event.target)) {
				armedAt = -Infinity;
				return { action: 'none' };
			}
			if (now() - armedAt <= SEQUENCE_MS) {
				armedAt = -Infinity;
				return /^Key[A-Z]$/.test(event.code) ? { action: 'pick', code: event.code } : { action: 'none' };
			}
			if (event.code === 'KeyC' && !event.shiftKey) {
				armedAt = now();
				return { action: 'armed' };
			}
			return { action: 'none' };
		},
		reset() {
			armedAt = -Infinity;
		}
	};
}
