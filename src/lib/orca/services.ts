export type ServiceInterest = 'training' | 'implementation' | 'consultation';

const names: Record<ServiceInterest, { th: string; en: string }> = {
	training: { th: 'อบรม AI สำหรับองค์กร', en: 'Corporate AI training' },
	implementation: {
		th: 'วางระบบ AI และปรับกระบวนการทำงาน',
		en: 'AI implementation and workflow redesign'
	},
	consultation: { th: 'ปรึกษาแนวทางใช้ AI ในองค์กร', en: 'AI consultation' }
};

export function serviceInterestFromQuery(value: string | null): ServiceInterest | '' {
	return value === 'training' || value === 'implementation' || value === 'consultation'
		? value
		: '';
}

export function serviceInterestName(service: ServiceInterest, locale: 'th' | 'en' = 'th') {
	return names[service][locale];
}

/** A stable context reaches the existing Owner inbox without changing its schema. */
export function pilotServiceContext(service: ServiceInterest | '') {
	return service ? `[ORCA service: ${names[service].en}]\n\n` : '';
}

export function pilotUseCaseWithService(useCase: string, service: ServiceInterest | '') {
	return pilotServiceContext(service) + useCase.trim();
}
