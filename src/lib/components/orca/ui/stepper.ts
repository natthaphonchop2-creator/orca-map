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
