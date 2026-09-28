/**
 * ORCA theme: light, dark, or follow the device ("system").
 *
 * The choice is per browser, like the display language: localStorage `orca.theme`
 * on the workspace origin. Nothing is sent to the server and there is no URL param.
 *
 * src/app.html runs the same rules in its boot script before the first paint, so the
 * page never flashes the wrong theme. theme.test.mjs runs that script against
 * routeTheme() and applyTheme() for every case; change both together.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'orca.theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
/**
 * What a browser that never chose gets: follow the device (the owner's choice, 2026-09-29).
 * The boot script in app.html has its own copy; theme.test.mjs keeps the two equal.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function parseThemePreference(value: unknown): ThemePreference {
	return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME_PREFERENCE;
}

/** Storage can be missing or throw (private windows, blocked site data). */
export function readThemePreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
	try {
		return parseThemePreference(storage?.getItem(THEME_KEY));
	} catch {
		return DEFAULT_THEME_PREFERENCE;
	}
}

/**
 * The theme a page shows.
 * - The workspace (/app, and / which redirects there) follows the setting.
 * - Sign-in is always dark, like the public website.
 * - Every other page (invitation, OAuth consent and completion, privacy, terms,
 *   errors) stays light until it is redesigned.
 * Prefixes match whole segments: /apps and /loginx are "other pages".
 */
export function routeTheme(pathname: string, preference: ThemePreference, systemDark: boolean): Theme {
	if (pathname === '/login' || pathname.startsWith('/login/')) return 'dark';
	if (pathname === '/' || pathname === '/app' || pathname.startsWith('/app/'))
		return preference === 'dark' || (preference === 'system' && systemDark) ? 'dark' : 'light';
	return 'light';
}

type ThemeRoot = Pick<HTMLElement, 'classList' | 'setAttribute' | 'getAttribute' | 'removeAttribute'> & {
	style: { colorScheme: string };
};

// Only the latest switch lifts the transition guard, so a quick second switch
// does not lose its frames to the first one's callback.
let switchGeneration = 0;

/**
 * Puts the theme on <html>. Four hooks, kept together:
 * - data-orca-theme: ORCA's own tokens (orca-theme.css)
 * - class "dark": Tailwind `dark:` variants and app.css (Obot parts such as notifications)
 * - data-theme: daisyUI's nanobotlight / nanobotdark (body, inputs, dialogs, toasts)
 * - color-scheme: native scrollbars, form controls and the canvas
 *
 * With `schedule`, a real change sets `data-orca-theme-switching` (orca-theme.css turns
 * transitions off under it) and removes it when `schedule` calls back, so every surface
 * flips at once. Re-applying the theme the page already has sets no guard.
 */
export function applyTheme(root: ThemeRoot, theme: Theme, schedule?: (done: () => void) => void) {
	const guard = !!schedule && root.getAttribute('data-orca-theme') !== theme;
	const generation = guard ? ++switchGeneration : 0;
	if (guard) root.setAttribute('data-orca-theme-switching', '');
	root.setAttribute('data-orca-theme', theme);
	if (theme === 'dark') root.classList.add('dark');
	else root.classList.remove('dark');
	root.setAttribute('data-theme', theme === 'dark' ? 'nanobotdark' : 'nanobotlight');
	root.style.colorScheme = theme;
	if (guard && schedule)
		schedule(() => {
			if (generation === switchGeneration) root.removeAttribute('data-orca-theme-switching');
		});
}
