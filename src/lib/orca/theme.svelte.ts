import { browser } from '$app/environment';
import {
	DEFAULT_THEME_PREFERENCE,
	SYSTEM_DARK_QUERY,
	THEME_KEY,
	parseThemePreference,
	readThemePreference,
	type ThemePreference
} from './theme';

function storage() {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function systemQuery(): MediaQueryList | undefined {
	try {
		return typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_DARK_QUERY) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The person's choice and the device's current appearance.
 * The page shows routeTheme(pathname, orcaTheme.preference, orcaTheme.systemDark);
 * the root layout applies it.
 */
export const orcaTheme = $state<{ preference: ThemePreference; systemDark: boolean }>({
	preference: browser ? readThemePreference(storage()) : DEFAULT_THEME_PREFERENCE,
	systemDark: browser ? !!systemQuery()?.matches : false
});

/** Remembers the choice in this browser; the root layout re-applies the theme. */
export function setThemePreference(preference: ThemePreference) {
	const value = parseThemePreference(preference);
	orcaTheme.preference = value;
	try {
		window.localStorage.setItem(THEME_KEY, value);
	} catch {
		/* storage is optional: the choice lasts for this page */
	}
}

/**
 * Follows the device (macOS/Windows/iOS switching light and dark, e.g. at sunset)
 * and the choice made in another tab. Call once from the root layout's onMount;
 * it returns the cleanup.
 */
export function watchTheme(): () => void {
	const media = systemQuery();
	const onMedia = () => {
		orcaTheme.systemDark = !!media?.matches;
	};
	const onStorage = (event: StorageEvent) => {
		if (event.key === THEME_KEY || event.key === null) orcaTheme.preference = readThemePreference(storage());
	};
	onMedia();
	const stopMedia = media ? listen(media, onMedia) : () => {};
	window.addEventListener('storage', onStorage);
	return () => {
		stopMedia();
		window.removeEventListener('storage', onStorage);
	};
}

function listen(media: MediaQueryList, onChange: () => void): () => void {
	// Safari before 14 has only the older addListener/removeListener pair.
	if (typeof media.addEventListener === 'function') {
		media.addEventListener('change', onChange);
		return () => media.removeEventListener('change', onChange);
	}
	media.addListener(onChange);
	return () => media.removeListener(onChange);
}
