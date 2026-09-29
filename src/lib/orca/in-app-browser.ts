// LINE and Facebook open links in their own in-app browser, where Google
// refuses to sign anyone in (workspace UX critique 13). The sign-in and invite
// pages spot them and ask the person to open the page in Chrome or Safari.

export type InAppBrowser = 'line' | 'facebook';

/** Which in-app browser this is, from its user agent; `undefined` for a real browser. */
export function inAppBrowser(userAgent: string | undefined | null): InAppBrowser | undefined {
	const ua = userAgent ?? '';
	// LINE adds "Line/<version>" (iOS and Android).
	if (/\bLine\/\d/i.test(ua)) return 'line';
	// Facebook, Messenger and Instagram: FBAN/FBAV/FB_IAB/FBIOS, or "Instagram <version>".
	if (/\bFB(?:AN|AV|_IAB|IOS)\b|\bFB4A\b|\bMessenger(?:ForiOS|LiteForiOS)?\b|\bInstagram\s\d/i.test(ua)) return 'facebook';
	return undefined;
}

/** LINE opens a link that carries this parameter in the phone's default browser. */
export function lineExternalURL(href: string): string {
	try {
		const url = new URL(href);
		url.searchParams.set('openExternalBrowser', '1');
		return url.href;
	} catch {
		return href;
	}
}

/** The address to paste into Chrome or Safari: this page, without LINE's parameter. */
export function shareableURL(href: string): string {
	try {
		const url = new URL(href);
		url.searchParams.delete('openExternalBrowser');
		return url.href;
	} catch {
		return href;
	}
}
