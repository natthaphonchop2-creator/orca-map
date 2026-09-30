// How someone in a company on ORCA reaches the ORCA team (owner, 2026-09-30):
// the LINE official account and the team's email. Every "ติดต่อทีม ORCA" in the
// app reads them from here, so a new channel changes one file. A company that is
// not on ORCA yet still asks through the trial-request form (/home?to=start).

type Translate = (th: string, en: string) => string;

/** Also written as is in messages without a link (services/orca.ts errors). */
export const ORCA_SUPPORT_LINE_ID = '@147njpwd';
export const ORCA_SUPPORT_LINE_URL = 'https://line.me/R/ti/p/@147njpwd';
export const ORCA_SUPPORT_EMAIL = 'natthaphon.chop@gmail.com';
export const ORCA_SUPPORT_MAILTO = `mailto:${ORCA_SUPPORT_EMAIL}`;
/** LINE opens in a new tab that can't reach back into ORCA and is sent no referrer. */
export const ORCA_SUPPORT_LINE_REL = 'noopener noreferrer';

export type SupportLink = {
	kind: 'line' | 'email';
	href: string;
	/** The words before the handle, e.g. "ส่งข้อความหาทีม ORCA ทาง LINE". */
	label: string;
	/** The LINE ID or the email address, shown as is. */
	handle: string;
	/** LINE opens in a new tab (rel ORCA_SUPPORT_LINE_REL); the email is a mailto: link. */
	newTab: boolean;
};

/** The two ways to reach the ORCA team, LINE first. `midSentence` starts the English words in lower case. */
export function supportLinks(t: Translate, midSentence = false): SupportLink[] {
	const en = (words: string) => (midSentence ? words[0].toLowerCase() + words.slice(1) : words);
	return [
		{ kind: 'line', href: ORCA_SUPPORT_LINE_URL, label: t('ส่งข้อความหาทีม ORCA ทาง LINE', en('Message the ORCA team on LINE')), handle: ORCA_SUPPORT_LINE_ID, newTab: true },
		{ kind: 'email', href: ORCA_SUPPORT_MAILTO, label: t('อีเมล', en('Email')), handle: ORCA_SUPPORT_EMAIL, newTab: false }
	];
}
