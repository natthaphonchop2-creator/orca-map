import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { afterEach, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { importTypeScript, typescriptModuleURL } from './test-import.mjs';

const theme = await importTypeScript(new URL('./theme.ts', import.meta.url));
const html = await readFile(new URL('../../app.html', import.meta.url), 'utf8');
const boot = html.match(/<script id="orca-theme-boot">([\s\S]*?)<\/script>/)?.[1];

function fakeRoot() {
	const attributes = new Map();
	const classes = new Set(['default-scrollbar']);
	return {
		attributes,
		classes,
		style: { colorScheme: '' },
		classList: {
			add: (name) => classes.add(name),
			remove: (name) => classes.delete(name),
			toggle: (name, on) => (on ? classes.add(name) : classes.delete(name), on),
			contains: (name) => classes.has(name)
		},
		setAttribute: (name, value) => attributes.set(name, String(value)),
		getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
		removeAttribute: (name) => attributes.delete(name)
	};
}
const snapshot = (root) => ({
	attributes: Object.fromEntries([...root.attributes].sort()),
	classes: [...root.classes].sort(),
	scheme: root.style.colorScheme
});

// Runs the real <script id="orca-theme-boot"> from app.html with a fake window and document.
const THROWS = Symbol('storage throws');
const GETTER_THROWS = Symbol('localStorage getter throws');
function runBoot({ path, stored, systemDark, matchMedia = true }) {
	const root = fakeRoot();
	const storage = {
		getItem(key) {
			if (stored === THROWS) throw new Error('SecurityError');
			return key === 'orca.theme' && stored !== undefined ? stored : null;
		}
	};
	const window = {
		get localStorage() {
			if (stored === GETTER_THROWS) throw new Error('SecurityError');
			return storage;
		},
		location: { pathname: path },
		matchMedia: matchMedia
			? (query) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark })
			: undefined
	};
	new Function('window', 'document', boot)(window, { documentElement: root });
	return snapshot(root);
}

const paths = [
	'/',
	'/app',
	'/app/',
	'/apps',
	'/login',
	'/login/local',
	'/loginx',
	'/invite/abc',
	'/privacy',
	'/auth/oauth/consent/x',
	'/terms-of-service'
];
const storedValues = [undefined, 'light', 'dark', 'system', 'bogus', '', THROWS, GETTER_THROWS];

test('app.html keeps the boot script and no longer runs the Obot theme script', () => {
	assert.ok(boot, 'app.html keeps <script id="orca-theme-boot">');
	assert.doesNotMatch(html, /getIsDark|localStorage\.getItem\('theme'\)/);
	assert.match(boot, /'orca\.theme'/);
	assert.equal(theme.THEME_KEY, 'orca.theme');
});

test('the boot script picks the same theme, on the same four hooks, as applyTheme(routeTheme())', () => {
	for (const path of paths)
		for (const value of storedValues)
			for (const systemDark of [false, true]) {
				const preference =
					value === THROWS || value === GETTER_THROWS
						? theme.readThemePreference({
								getItem() {
									throw new Error('SecurityError');
								}
							})
						: theme.readThemePreference({ getItem: () => (value === undefined ? null : value) });
				const root = fakeRoot();
				theme.applyTheme(root, theme.routeTheme(path, preference, systemDark));
				assert.deepEqual(
					runBoot({ path, stored: value, systemDark }),
					snapshot(root),
					JSON.stringify({ path, value: String(value), systemDark })
				);
			}
});

test('the boot script and theme.ts share one default', () => {
	assert.equal(boot.match(/var fallback = '(\w+)';/)?.[1], theme.DEFAULT_THEME_PREFERENCE);
	assert.ok(theme.THEME_PREFERENCES.includes(theme.DEFAULT_THEME_PREFERENCE));
	for (const systemDark of [false, true]) {
		const expected = theme.routeTheme('/app', theme.DEFAULT_THEME_PREFERENCE, systemDark);
		assert.equal(runBoot({ path: '/app', stored: undefined, systemDark }).attributes['data-orca-theme'], expected);
		assert.equal(runBoot({ path: '/app', stored: THROWS, systemDark }).attributes['data-orca-theme'], expected);
	}
	// A browser without matchMedia boots as a light device.
	assert.equal(runBoot({ path: '/app', stored: 'system', systemDark: true, matchMedia: false }).attributes['data-orca-theme'], 'light');
});

test('the workspace follows the choice; sign-in is dark; other pages stay light', () => {
	assert.equal(theme.routeTheme('/app', 'dark', false), 'dark');
	assert.equal(theme.routeTheme('/app/', 'dark', false), 'dark');
	assert.equal(theme.routeTheme('/', 'dark', false), 'dark');
	assert.equal(theme.routeTheme('/app', 'light', true), 'light');
	assert.equal(theme.routeTheme('/app', 'system', true), 'dark');
	assert.equal(theme.routeTheme('/app', 'system', false), 'light');
	assert.equal(theme.routeTheme('/login', 'light', false), 'dark');
	assert.equal(theme.routeTheme('/login/local', 'light', false), 'dark');
	assert.equal(theme.routeTheme('/loginx', 'dark', true), 'light');
	assert.equal(theme.routeTheme('/invite/abc', 'dark', true), 'light');
	assert.equal(theme.routeTheme('/auth/oauth/consent/x', 'dark', true), 'light');
	assert.equal(theme.routeTheme('/apps', 'dark', true), 'light');
});

test('unknown or unreadable choices fall back to the default', () => {
	assert.equal(theme.parseThemePreference('purple'), theme.DEFAULT_THEME_PREFERENCE);
	assert.equal(theme.parseThemePreference(null), theme.DEFAULT_THEME_PREFERENCE);
	for (const value of theme.THEME_PREFERENCES) assert.equal(theme.parseThemePreference(value), value);
	assert.equal(theme.readThemePreference(undefined), theme.DEFAULT_THEME_PREFERENCE);
	assert.equal(
		theme.readThemePreference({
			getItem() {
				throw new Error('blocked');
			}
		}),
		theme.DEFAULT_THEME_PREFERENCE
	);
});

test('applyTheme sets all four hooks and is idempotent', () => {
	const root = fakeRoot();
	theme.applyTheme(root, 'dark');
	assert.deepEqual(snapshot(root), {
		attributes: { 'data-orca-theme': 'dark', 'data-theme': 'nanobotdark' },
		classes: ['dark', 'default-scrollbar'],
		scheme: 'dark'
	});
	const once = snapshot(root);
	theme.applyTheme(root, 'dark');
	assert.deepEqual(snapshot(root), once);
	theme.applyTheme(root, 'light');
	assert.deepEqual(snapshot(root), {
		attributes: { 'data-orca-theme': 'light', 'data-theme': 'nanobotlight' },
		classes: ['default-scrollbar'],
		scheme: 'light'
	});
});

test('a real switch turns transitions off until the scheduled frame; re-applying the same theme does not', () => {
	const root = fakeRoot();
	theme.applyTheme(root, 'light');
	let pending;
	theme.applyTheme(root, 'dark', (done) => (pending = done));
	assert.equal(root.getAttribute('data-orca-theme-switching'), '');
	pending();
	assert.equal(root.getAttribute('data-orca-theme-switching'), null);

	let called = false;
	theme.applyTheme(root, 'dark', () => (called = true));
	assert.equal(called, false);
	assert.equal(root.getAttribute('data-orca-theme-switching'), null);

	// Two quick switches: the first one's callback must not lift the second one's guard.
	const queue = [];
	theme.applyTheme(root, 'light', (done) => queue.push(done));
	theme.applyTheme(root, 'dark', (done) => queue.push(done));
	queue[0]();
	assert.equal(root.getAttribute('data-orca-theme-switching'), '');
	queue[1]();
	assert.equal(root.getAttribute('data-orca-theme-switching'), null);
	assert.equal(root.getAttribute('data-orca-theme'), 'dark');
});

// ---------- theme.svelte.ts: the real rune module, with only $app/environment substituted ----------

const require = createRequire(import.meta.url);
const runeSource = compileModule(
	stripTypeScriptTypes(await readFile(new URL('./theme.svelte.ts', import.meta.url), 'utf8')),
	{ filename: 'theme.svelte.js', generate: 'client' }
)
	.js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href)
	.replaceAll("'$app/environment'", JSON.stringify('data:text/javascript,export const browser = true;'))
	.replaceAll("'./theme'", JSON.stringify(await typescriptModuleURL(new URL('./theme.ts', import.meta.url))));
assert.match(runeSource, /data:text\/javascript,export const browser = true;/);
assert.doesNotMatch(runeSource, /['"]\.\/theme['"]|\$app\/environment/);
let instance = 0;
// A fresh module per test, so its initial state is read from that test's fake window.
const loadStore = () =>
	import('data:text/javascript;base64,' + Buffer.from(`${runeSource}\n// ${++instance}`).toString('base64'));

function fakeWindow({ stored, systemDark = false, legacyMedia = false, storageThrows = false } = {}) {
	const store = new Map(stored === undefined ? [] : [['orca.theme', stored]]);
	const mediaListeners = new Set();
	const windowListeners = new Set();
	const media = { matches: systemDark };
	if (legacyMedia) {
		media.addListener = (listener) => mediaListeners.add(listener);
		media.removeListener = (listener) => mediaListeners.delete(listener);
	} else {
		media.addEventListener = (type, listener) => type === 'change' && mediaListeners.add(listener);
		media.removeEventListener = (type, listener) => type === 'change' && mediaListeners.delete(listener);
	}
	const window = {
		get localStorage() {
			if (storageThrows) throw new Error('SecurityError');
			return {
				getItem: (key) => (store.has(key) ? store.get(key) : null),
				setItem: (key, value) => store.set(key, String(value))
			};
		},
		matchMedia: (query) => {
			assert.equal(query, '(prefers-color-scheme: dark)');
			return media;
		},
		addEventListener: (type, listener) => type === 'storage' && windowListeners.add(listener),
		removeEventListener: (type, listener) => type === 'storage' && windowListeners.delete(listener)
	};
	return {
		window,
		store,
		mediaListeners,
		windowListeners,
		setSystemDark(dark) {
			media.matches = dark;
			for (const listener of [...mediaListeners]) listener({ matches: dark });
		},
		otherTab(key, value) {
			if (key === null) store.clear();
			else if (value === null) store.delete(key);
			else store.set(key, value);
			for (const listener of [...windowListeners]) listener({ key });
		}
	};
}

const realWindow = globalThis.window;
afterEach(() => {
	if (realWindow === undefined) delete globalThis.window;
	else globalThis.window = realWindow;
});

test('the store starts from this browser: stored choice, else the default; blocked storage is harmless', async () => {
	globalThis.window = fakeWindow({ stored: 'dark', systemDark: true }).window;
	assert.deepEqual({ ...(await loadStore()).orcaTheme }, { preference: 'dark', systemDark: true });

	globalThis.window = fakeWindow({ stored: 'bogus' }).window;
	assert.deepEqual({ ...(await loadStore()).orcaTheme }, { preference: theme.DEFAULT_THEME_PREFERENCE, systemDark: false });

	const blocked = fakeWindow({ storageThrows: true, systemDark: true });
	globalThis.window = blocked.window;
	const store = await loadStore();
	assert.deepEqual({ ...store.orcaTheme }, { preference: theme.DEFAULT_THEME_PREFERENCE, systemDark: true });
	store.setThemePreference('dark');
	assert.equal(store.orcaTheme.preference, 'dark', 'the choice lasts for this page without storage');
});

test('setThemePreference remembers a valid choice in orca.theme', async () => {
	const fake = fakeWindow();
	globalThis.window = fake.window;
	const store = await loadStore();
	store.setThemePreference('system');
	assert.equal(store.orcaTheme.preference, 'system');
	assert.equal(fake.store.get('orca.theme'), 'system');
	store.setThemePreference('purple');
	assert.equal(store.orcaTheme.preference, theme.DEFAULT_THEME_PREFERENCE);
	assert.equal(fake.store.get('orca.theme'), theme.DEFAULT_THEME_PREFERENCE);
});

for (const legacyMedia of [false, true])
	test(`watchTheme follows the device and other tabs, and cleans up (${legacyMedia ? 'addListener fallback' : 'addEventListener'})`, async () => {
		const fake = fakeWindow({ stored: 'system', systemDark: false, legacyMedia });
		globalThis.window = fake.window;
		const store = await loadStore();
		const stop = store.watchTheme();
		assert.equal(fake.mediaListeners.size, 1);
		assert.equal(fake.windowListeners.size, 1);

		fake.setSystemDark(true);
		assert.equal(store.orcaTheme.systemDark, true);
		fake.setSystemDark(false);
		assert.equal(store.orcaTheme.systemDark, false);

		fake.otherTab('orca.theme', 'dark');
		assert.equal(store.orcaTheme.preference, 'dark');
		fake.otherTab('orca.locale', 'en');
		assert.equal(store.orcaTheme.preference, 'dark', 'other keys are ignored');
		fake.otherTab(null);
		assert.equal(store.orcaTheme.preference, theme.DEFAULT_THEME_PREFERENCE, 'cleared storage means the default');

		stop();
		assert.equal(fake.mediaListeners.size, 0);
		assert.equal(fake.windowListeners.size, 0);
	});

test('watchTheme works without matchMedia', async () => {
	const fake = fakeWindow({ stored: 'system' });
	delete fake.window.matchMedia;
	globalThis.window = fake.window;
	const store = await loadStore();
	assert.equal(store.orcaTheme.systemDark, false);
	const stop = store.watchTheme();
	assert.equal(store.orcaTheme.systemDark, false);
	stop();
});
