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
	/** The shortest connector while only the current label shows: 12px with 8px clear on each side. */
	compactConnector: 28
} as const;

/** The full widths the CSS has a container query for: 280, 320 … 1120px. */
export const STEPPER_FIT_WIDTHS: readonly number[] = Array.from({ length: 22 }, (_, index) => 280 + index * 40);

// Glyph widths of ORCA Noto Sans Thai at 14px semibold, rounded up (measured in
// the browser, 2026-09-30). Thai vowels and tone marks above or below a letter
// take no width of their own; anything else not listed counts as a wide glyph.
const LOWER = [8.3, 8.8, 7.1, 8.8, 8.2, 5.2, 8.8, 9, 4.1, 4.1, 8.3, 4.1, 13.5, 9, 8.6, 8.8, 8.8, 6.2, 6.9, 5.7, 9, 7.7, 11.7, 7.9, 7.7, 6.8];
const UPPER = [9.4, 9.3, 8.7, 10.4, 7.9, 7.6, 10.2, 10.6, 5.2, 4.4, 9.1, 7.7, 13.1, 11.1, 11.1, 8.7, 11.1, 9.1, 7.7, 8.3, 10.5, 8.9, 13.4, 9, 8.5, 8.1];
const THAI_WIDTHS: [RegExp, number][] = [
	[/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/, 0],
	[/[ะเโใไ]/, 5],
	[/[าำๅ]/, 6],
	[/[ญฌณฒ๚๛]/, 13],
	[/[พฟฬ๗]/, 10.4],
	[/[ฅฑตศษผฝ]/, 9.4],
	[/[\u0e00-\u0e7f]/, 8.9]
];
function glyphWidth(char: string): number {
	const code = char.charCodeAt(0);
	if (code >= 97 && code <= 122) return LOWER[code - 97];
	if (code >= 65 && code <= 90) return UPPER[code - 65];
	if (code >= 48 && code <= 57) return 8.1;
	if (char === ' ') return 3.7;
	if (/[.,:;!']/.test(char)) return 4;
	if (/[-()[\]{}/]/.test(char)) return 5.7;
	for (const [glyphs, width] of THAI_WIDTHS) if (glyphs.test(char)) return width;
	return 13;
}

/** A label's width on one line (px), erring wide. */
export function stepLabelWidth(label: string): number {
	return [...label].reduce((sum, char) => sum + glyphWidth(char), 0) * 1.03;
}

/** How wide the stepper must be to show every label on one line (px). */
export function stepperFullWidth(steps: readonly StepInput[]): number {
	const { circle, labelGap, connector } = STEP_SIZES;
	const labels = steps.reduce((sum, step) => sum + circle + labelGap + stepLabelWidth(step.label), 0);
	return Math.ceil(labels + Math.max(0, steps.length - 1) * connector);
}

/** Circles, connectors and the one gap when only the current label shows (px): the room the current label leaves. */
export function stepperCompactWidth(count: number): number {
	const { circle, labelGap, compactConnector } = STEP_SIZES;
	return count * circle + labelGap + Math.max(0, count - 1) * compactConnector;
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
