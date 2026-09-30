// A stepper held in the address (`&step=`), so a reload or an OAuth popup never
// loses the place. Steps before the current one are done unless the caller
// says otherwise; only done steps and the current one can be opened.

export type StepState = 'done' | 'current' | 'upcoming';
export type StepInput = { id: string; label: string };
export type StepView = StepInput & { number: number; state: StepState; href?: string };

export function stepStates(steps: StepInput[], current: string, done?: readonly string[]): StepView[] {
	const index = Math.max(0, steps.findIndex((step) => step.id === current));
	return steps.map((step, position) => {
		const state: StepState =
			position === index ? 'current' : done ? (done.includes(step.id) ? 'done' : 'upcoming') : position < index ? 'done' : 'upcoming';
		return { ...step, number: position + 1, state };
	});
}

/** The current step from the address, or the first step when it names none or an unknown one. */
export function currentStep(steps: StepInput[], requested: string | null | undefined): string {
	return steps.some((step) => step.id === requested) ? (requested as string) : (steps[0]?.id ?? '');
}

/** The same address with another step; every other parameter is kept. */
export function stepHref(address: string, step: string, parameter = 'step'): string {
	const url = new URL(address, 'https://orca.invalid');
	url.searchParams.set(parameter, step);
	return url.pathname + url.search + url.hash;
}

// ---------------------------------------------------------------------------
// The width rule (Stepper.svelte's container queries). A label never wraps: while
// the stepper itself is at least `stepperFullWidth` wide every label shows on one
// line and the connectors take up the rest; below that only the current step keeps
// its label beside its circle, and the others become circles whose name stays in
// the page for screen readers (and as the circle's tooltip). The rule follows the
// stepper's own width, so it holds with the sidebar open, in a sheet or on a phone.
// ---------------------------------------------------------------------------

/** The sizes Stepper.svelte's CSS uses (px). */
export const STEP_SIZES = {
	circle: 26,
	labelGap: 8,
	/** The shortest connector while every label shows: a 16px line with 10px clear on each side. */
	connector: 36,
	/** A connector while only the current label shows: a 12px line with 8px clear on each side. */
	compactConnector: 28,
	/** The shortest it gets when 28px ones would leave the current label too little room (many steps on a phone): a line of about 5px with about 3.4px clear on each side. */
	tightConnector: 12,
	/** The room the current label keeps before the connectors start to shrink. */
	currentRoom: 64
} as const;

/** The full widths the CSS has a container query for: 280, 320 … 1120px. */
export const STEPPER_FIT_WIDTHS: readonly number[] = Array.from({ length: 22 }, (_, index) => 280 + index * 40);

// Glyph widths at 14px semibold, rounded up: the wider of ORCA Noto Sans Thai
// (600) and Tahoma Bold, the font stack's fallback while the web font loads or
// if it fails (both measured in the browser, 2026-09-30). Thai vowels and tone
// marks above or below a letter take no width of their own; anything else not
// listed counts as a wide glyph.
const LOWER = [8.4, 8.9, 7.4, 8.9, 8.4, 5.4, 8.9, 9, 4.3, 5.1, 8.5, 4.3, 13.5, 9, 8.7, 8.9, 8.9, 6.2, 7.3, 5.9, 9, 8.2, 12.5, 8.5, 8.1, 7.4];
const UPPER = [9.6, 9.7, 9.4, 10.7, 8.7, 8.2, 10.5, 10.7, 6.8, 7.1, 9.8, 8.1, 13.1, 11.2, 11.1, 9.3, 11.1, 10.2, 8.9, 8.6, 10.5, 9.5, 14.4, 9.6, 9.4, 8.8];
/** U+0E01 (ก) … U+0E5B (๛). */
const THAI = [
	9.6, 9.8, 10.1, 9.7, 9.7, 10.3, 7.9, 8.7, 9.5, 10.5, 10.8, 13.3, 13.4, 9.8, 9.8, 8.5, 11.8, 14.1, 14.4, 9.7, 9.7, 9.6, 10.2, 8.4, 9.6, 9.6, 9.6, 10.3, 10.3, 11.3, 11.3, 9.8, 9.4, 9.4, 7.4, 9.6,
	9.1, 9.8, 7.5, 9.7, 10, 9.1, 10, 11.6, 8.9, 8.9, 7.9, 6.7, 0, 7.5, 7.5, 0, 0, 0, 0, 0, 0, 0, 14, 14, 14, 14, 9.7, 4.8, 8.9, 6.8, 6.8, 7.4, 7.5, 8.7, 0, 0, 0, 0, 0, 0, 0, 0, 8.8, 8.9, 10.1,
	10.9, 9.9, 11, 11, 9.6, 13.6, 10.9, 11.9, 11.3, 14.7
];
const PUNCTUATION: Record<string, number> = {
	' ': 4.2, '.': 4.4, ',': 4.4, ':': 5.1, ';': 5.1, '!': 4.8, "'": 3.9, '"': 6.9, '?': 8, '-': 6.1, '_': 9, '(': 6.4, ')': 6.4, '[': 6.4, ']': 6.4,
	'{': 8.8, '}': 8.8, '/': 8.1, '&': 11, '+': 11.5, '@': 12.9, '…': 14, '·': 5.1
};
function glyphWidth(char: string): number {
	const code = char.charCodeAt(0);
	if (code >= 97 && code <= 122) return LOWER[code - 97];
	if (code >= 65 && code <= 90) return UPPER[code - 65];
	if (code >= 48 && code <= 57) return 9;
	if (code >= 0x0e01 && code <= 0x0e5b) return THAI[code - 0x0e01];
	return PUNCTUATION[char] ?? 15;
}

/** A label's width on one line (px), erring wide: the widths above are each font's widest, plus 1%. */
export function stepLabelWidth(label: string): number {
	return [...label].reduce((sum, char) => sum + glyphWidth(char), 0) * 1.01;
}

/** How wide the stepper must be to show every label on one line (px). */
export function stepperFullWidth(steps: readonly StepInput[]): number {
	const { circle, labelGap, connector } = STEP_SIZES;
	const labels = steps.reduce((sum, step) => sum + circle + labelGap + stepLabelWidth(step.label), 0);
	return Math.ceil(labels + Math.max(0, steps.length - 1) * connector);
}

/** The circles and the one gap beside the current label: what a folded stepper takes besides its connectors (px). */
export function stepperFixedWidth(count: number): number {
	return count * STEP_SIZES.circle + STEP_SIZES.labelGap;
}

/**
 * Circles, connectors and the one gap when only the current label shows, on a
 * stepper `width` wide (px); the current label gets the rest. The connectors are
 * 28px, or shorter (down to 12px) where 28px ones would leave the current label
 * under 64px. Stepper.svelte's --orca-stepper-link and --orca-stepper-compact are
 * the same formula.
 */
export function stepperCompactWidth(count: number, width = Number.POSITIVE_INFINITY): number {
	const { compactConnector, tightConnector, currentRoom } = STEP_SIZES;
	const gaps = Math.max(0, count - 1);
	const fixed = stepperFixedWidth(count);
	const link = Math.max(tightConnector, Math.min((width - fixed - currentRoom) / Math.max(1, gaps), compactConnector));
	return fixed + gaps * link;
}

/**
 * The container-query class of a set of steps: `fit-560` shows every label once
 * the stepper is 560px or wider, `fit-none` never does (only the current one).
 */
export function stepperFit(steps: readonly StepInput[]): string {
	const need = stepperFullWidth(steps);
	const width = STEPPER_FIT_WIDTHS.find((candidate) => candidate >= need);
	return width === undefined ? 'fit-none' : `fit-${width}`;
}

/** Whether a step's label shows: the current one always, the others only when every label fits. */
export function stepLabelShown(state: StepState, stepperWidth: number, steps: readonly StepInput[]): boolean {
	if (state === 'current') return true;
	const fit = stepperFit(steps);
	return fit !== 'fit-none' && stepperWidth >= Number(fit.slice(4));
}

/** The label's class: `keep` (the current step) or `fold` (hidden while the labels don't fit). */
export function stepLabelClass(state: StepState): 'keep' | 'fold' {
	return state === 'current' ? 'keep' : 'fold';
}
