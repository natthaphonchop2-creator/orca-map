// Thai has no spaces, so a browser may break a line inside a short phrase
// ("ตัว|เอง"). keepTogether splits a text around the phrases given, so the
// page can keep each of them on one line (white-space: nowrap); text in
// another language passes through whole.
export type KeptPart = { text: string; keep: boolean };

export function keepTogether(text: string, phrases: readonly string[]): KeptPart[] {
	const parts: KeptPart[] = [];
	let rest = text;
	while (rest) {
		let at = -1;
		let found = '';
		for (const phrase of phrases) {
			const index = phrase ? rest.indexOf(phrase) : -1;
			if (index >= 0 && (at < 0 || index < at || (index === at && phrase.length > found.length))) {
				at = index;
				found = phrase;
			}
		}
		if (at < 0) {
			parts.push({ text: rest, keep: false });
			break;
		}
		if (at > 0) parts.push({ text: rest.slice(0, at), keep: false });
		parts.push({ text: found, keep: true });
		rest = rest.slice(at + found.length);
	}
	return parts;
}
