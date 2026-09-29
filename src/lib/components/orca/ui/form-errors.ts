// Every error of a form at once (the old wizard showed one at a time): a list
// at the top whose items jump to their fields.

export type FormError = { field?: string; message: string };

/** Accepts `{ fieldID: message }` or a list; drops empty messages and repeats. */
export function formErrors(input: Record<string, string | undefined | null | false> | readonly FormError[] | undefined): FormError[] {
	const list: FormError[] = Array.isArray(input)
		? [...(input as readonly FormError[])]
		: Object.entries((input ?? {}) as Record<string, string | undefined | null | false>).map(([field, message]) => ({ field, message: message || '' }));
	const seen = new Set<string>();
	return list
		.map((error) => ({ ...error, message: error.message.trim() }))
		.filter((error) => {
			const key = `${error.field ?? ''}\u0000${error.message}`;
			if (!error.message || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export function formErrorTitle(count: number, t: (th: string, en: string) => string): string {
	return count === 1 ? t('แก้ไข 1 จุดก่อนบันทึก', 'Fix 1 thing before saving') : t(`แก้ไข ${count} จุดก่อนบันทึก`, `Fix ${count} things before saving`);
}
