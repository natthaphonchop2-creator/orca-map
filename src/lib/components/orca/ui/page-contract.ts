// The page contract (workspace UX proposal §3.7): an H1 of at most 4 words and
// one line under it of about 80 Thai characters. Thai has no spaces between
// words, so a Thai title is also held to a length that reads as a few words.

export const TITLE_MAX_WORDS = 4;
export const TITLE_MAX_LENGTH = 32;
export const SUBTITLE_MAX_LENGTH = 90;

/** Visible characters: Thai vowels and tone marks do not count on their own. */
export function visibleLength(value: string): number {
	const text = value.trim();
	if (!text) return 0;
	const Segmenter = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment(input: string): Iterable<unknown> } }).Segmenter;
	if (Segmenter) return [...new Segmenter('th', { granularity: 'grapheme' }).segment(text)].length;
	return [...text.replace(/[ัิ-ฺ็-๎]/g, '')].length;
}

export function titleWithinContract(title: string): boolean {
	const words = title.trim().split(/\s+/).filter(Boolean);
	return words.length > 0 && words.length <= TITLE_MAX_WORDS && visibleLength(title) <= TITLE_MAX_LENGTH;
}

export function subtitleWithinContract(subtitle: string | undefined): boolean {
	return !subtitle || (visibleLength(subtitle) <= SUBTITLE_MAX_LENGTH && !/\n/.test(subtitle.trim()));
}
