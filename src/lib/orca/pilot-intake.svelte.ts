import { browser } from '$app/environment';
import type { PilotRequestInput } from '$lib/services/orca';
import type { OrcaPricingPlanId } from './pricing';
import type { ServiceInterest } from './services';

export type IntakeError =
	| ''
	| 'name'
	| 'organization'
	| 'description-short'
	| 'description-long'
	| 'rate-limit'
	| 'invalid'
	| 'unconfirmed';

function emptyDetails() {
	return {
		name: '',
		email: '',
		organization: '',
		teamSize: '6-20' as PilotRequestInput['teamSize'],
		useCase: '',
		consent: false,
		website: ''
	};
}

// Client memory only: navigation can resume the form without putting contact
// details in URLs, browser storage or the server-rendered page. Submission state
// also survives navigation so a late response cannot silently lose its receipt.
export const pilotIntake = $state({
	details: emptyDetails(),
	selectedPlan: '' as OrcaPricingPlanId | '',
	selectedService: '' as ServiceInterest | '',
	entryContext: null as {
		plan: OrcaPricingPlanId | '';
		service: ServiceInterest | '';
	} | null,
	error: '' as IntakeError,
	submitting: false,
	receipt: null as {
		reference: string;
		status: 'received';
		plan: OrcaPricingPlanId | '';
		service: ServiceInterest | '';
	} | null,
	attempt: null as { key: string; input: PilotRequestInput } | null
});

export function applyRequestedPlan(plan: OrcaPricingPlanId | '', newRequest = false) {
	applyRequestedIntake(plan, '', newRequest);
}

export function applyRequestedIntake(
	plan: OrcaPricingPlanId | '',
	service: ServiceInterest | '',
	newRequest = false
) {
	if (!browser || pilotIntake.submitting) return;
	if (newRequest && pilotIntake.receipt) pilotIntake.receipt = null;
	const requestedPlan = service ? '' : plan;
	const sameEntry =
		pilotIntake.entryContext?.plan === requestedPlan &&
		pilotIntake.entryContext?.service === service;
	// A service inquiry and a platform plan are separate contact intents. Keep
	// the contact draft, but never carry a hidden plan into a service request.
	// Returning from Privacy must also preserve a manually changed plan.
	if (newRequest || !sameEntry) {
		pilotIntake.selectedService = service;
		pilotIntake.selectedPlan = requestedPlan;
	}
	pilotIntake.entryContext = { plan: requestedPlan, service };
}

export function pilotAttempt(input: PilotRequestInput) {
	if (!browser) throw new Error('Pilot submissions require a browser session.');
	const previous = pilotIntake.attempt;
	// Switching the UI language after an uncertain result is still the same
	// request. Retry the exact original payload and key unless its content changes.
	const content = (value: PilotRequestInput) => JSON.stringify({ ...value, locale: '' });
	if (!previous || content(previous.input) !== content(input)) {
		pilotIntake.attempt = { key: crypto.randomUUID(), input };
	}
	return pilotIntake.attempt!;
}

export function receivePilotRequest(
	result: { reference: string; status: 'received' },
	plan: OrcaPricingPlanId | '',
	service: ServiceInterest | '' = ''
) {
	if (!browser) return;
	pilotIntake.receipt = { ...result, plan: service ? '' : plan, service };
	pilotIntake.details = emptyDetails();
	pilotIntake.attempt = null;
	pilotIntake.error = '';
}
