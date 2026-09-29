// The logic behind PersonPicker: chips for the chosen people and a search that
// suggests the others.

export type PickerPerson = { id: string; name: string; detail?: string; email?: string };

export const PICKER_SUGGESTIONS = 8;

function fold(value: string) {
	return value.normalize('NFKC').toLocaleLowerCase().trim();
}

/** People not chosen yet whose name, email or detail contains every word typed. */
export function matchPeople(people: readonly PickerPerson[], query: string, selected: readonly string[], limit = PICKER_SUGGESTIONS): PickerPerson[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	const chosen = new Set(selected);
	return people
		.filter((person) => !chosen.has(person.id))
		.filter((person) => {
			const text = fold(`${person.name} ${person.email ?? ''} ${person.detail ?? ''}`);
			return words.every((word) => text.includes(word));
		})
		.slice(0, Math.max(0, limit));
}

export function addPerson(selected: readonly string[], id: string): string[] {
	return selected.includes(id) ? [...selected] : [...selected, id];
}

export function removePerson(selected: readonly string[], id: string, locked: readonly string[] = []): string[] {
	return locked.includes(id) ? [...selected] : selected.filter((item) => item !== id);
}

/** Backspace in an empty search removes the last chip that is not locked. */
export function removeLastPerson(selected: readonly string[], locked: readonly string[] = []): string[] {
	for (let index = selected.length - 1; index >= 0; index -= 1) {
		if (!locked.includes(selected[index])) return selected.filter((_, position) => position !== index);
	}
	return [...selected];
}

/** Arrow keys move through the suggestions and wrap at either end. */
export function moveHighlight(index: number, count: number, step: 1 | -1): number {
	if (count <= 0) return -1;
	if (index < 0) return step === 1 ? 0 : count - 1;
	return (index + step + count) % count;
}

/**
 * The person Enter picks from an open list: the highlighted one (moved to with
 * the arrow keys, even before anything is typed), else a typed search's first
 * match. Nothing when the list is closed or empty.
 */
export function enterChoice<T>(suggestions: readonly T[], highlight: number, query: string, open: boolean): T | undefined {
	if (!open || !suggestions.length) return undefined;
	if (highlight >= 0 && highlight < suggestions.length) return suggestions[highlight];
	return query.trim() ? suggestions[0] : undefined;
}

export function personInitial(name: string): string {
	const first = [...name.trim()].find((character) => /[\p{L}\p{N}]/u.test(character));
	return (first ?? '?').toLocaleUpperCase();
}
