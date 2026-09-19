export type OrcaPricingPlanId = 'free' | 'team' | 'enterprise';

const names: Record<OrcaPricingPlanId, string> = {
	free: 'Free',
	team: 'Team',
	enterprise: 'Enterprise'
};

export function pricingPlanName(plan: OrcaPricingPlanId) {
	return names[plan];
}

export function pricingPlanFromQuery(value: string | null): OrcaPricingPlanId | '' {
	return value === 'free' || value === 'team' || value === 'enterprise' ? value : '';
}

export function pilotPlanContext(plan: OrcaPricingPlanId | '') {
	return plan ? `[ORCA plan: ${names[plan]}]\n\n` : '';
}

/** Keep plan interest in the existing request and Owner inbox, without creating a subscription. */
export function pilotUseCaseWithPlan(useCase: string, plan: OrcaPricingPlanId | '') {
	return pilotPlanContext(plan) + useCase.trim();
}
