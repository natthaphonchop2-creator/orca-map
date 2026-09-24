import { importTypeScript, typescriptModuleURL } from '../../orca/test-import.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- The compiled script harness must use its matching Svelte client runtime in Node.
import { effect_root, flush, untrack } from 'svelte/internal/client';
import { render } from 'svelte/server';

// Compile the real component's script and run its Svelte state/effects. Only
// props and imported services are injected; no production logic is reimplemented.
const providerSetupURL = new URL('../../orca/oauth-provider-setup.ts', import.meta.url).href;
const { oauthProviderSetup } = await import(providerSetupURL);
const component = await readFile(new URL('./SourceSetup.svelte', import.meta.url), 'utf8');
const catalogURL = await typescriptModuleURL(new URL('../../orca/catalog.ts', import.meta.url));
const { catalogSourceDisplayName, catalogSourceProvider } = await import(catalogURL);
const { providerGuide } = await import(new URL('../../orca/provider-guides.ts', import.meta.url).href);
const apiSetupURL = await typescriptModuleURL(new URL('../../orca/api-connector-setup.ts', import.meta.url));
const { apiConnectorSetup, apiConnectorError } = await import(apiSetupURL);
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[^;]+;/gm, '')
	.replace('$props()', '$state(testProps)');
const require = createRequire(import.meta.url);
const compiled = compileModule(
	`export function harness(testProps, OrcaService, onDestroy, untrack, t, orcaError, window, document, catalogSourceDisplayName, catalogSourceProvider, providerGuide, apiConnectorSetup, apiConnectorError, oauthProviderSetup) {
		${script}
		return {
			safeOAuthURL, createSource, configure,
			configureOAuthClient, clearClientFields, slackAppSetupURL,
			startOAuth, disconnectOAuth, verify, editConfiguration, checkOAuthReturn,
			get state() {
				return { setup, error, notice, connectionReady, oauthRequired, oauthURL,
					oauthWindowOpened, values, sourceEndpoint, clientID, clientSecret, clientFormOpen };
			},
			setContext(id, manager = canCreate) { sourceID = id; canCreate = manager; },
			get providerName() { return providerName; },
      get providerSetup() { return providerSetup; },
			get providerKind() { return providerKind; },
			get providerHost() { return providerHost; },
			get primaryState() { return primaryState; },
			get busy() { return busy; },
			setAccount(input) { values = input; },
			setClient(id, secret) { clientID = id; clientSecret = secret; clientFormOpen = true; },
			setCreate(sourceName, url, auth) { name = sourceName; endpoint = url; authKind = auth; }
		};
	}`,
	{ filename: 'source-setup-test.svelte.js', generate: 'client' }
).js.code.replaceAll(
	'svelte/internal/client',
	pathToFileURL(require.resolve('svelte/internal/client')).href
);
const { harness } = await import(
	'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

function source(sourceID = 'source-one', overrides = {}) {
	return {
		sourceID,
		name: sourceID,
		runtime: 'remote',
		kind: 'entry',
		fields: [],
		requiresURL: false,
		configured: true,
		oauthSupported: true,
		oauthConnected: false,
		oauthClientRequired: false,
		oauthClientConfigured: false,
		oauthRedirectURL: 'https://orca.example.test/oauth/callback',
		...overrides
	};
}
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}
async function settle() {
	flush();
	await new Promise((resolve) => setImmediate(resolve));
	flush();
}
async function setupHarness(context, methods = {}, props = {}) {
	const windowEvents = new EventTarget();
	const timers = new Map();
	let timerID = 0;
	windowEvents.setInterval = (callback, delay) => {
		const id = ++timerID;
		timers.set(id, { callback, delay });
		return id;
	};
	windowEvents.clearInterval = (id) => timers.delete(id);
	const tickTimers = async () => {
		for (const { callback } of [...timers.values()]) callback();
		await settle();
	};
	const popups = [];
	const popupEvents = [];
	windowEvents.open = (...args) => {
		popupEvents.push(['open', ...args]);
		const popup = {
			closed: false,
			document: { title: '', body: { textContent: '' } },
			location: { replace: (url) => popupEvents.push(['navigate', url]) },
			close() {
				this.closed = true;
				popupEvents.push(['close']);
			}
		};
		let opener = windowEvents;
		Object.defineProperty(popup, 'opener', {
			get: () => opener,
			set(value) {
				opener = value;
				popupEvents.push(['opener', value]);
			}
		});
		popups.push(popup);
		return popup;
	};
	const documentEvents = new EventTarget();
	documentEvents.visibilityState = 'visible';
	let view;
	let onDestroy;
	let destroyed = false;
	const stop = effect_root(() => {
		view = harness(
			{ sourceID: 'source-one', canCreate: false, ...props },
			{
				sourceSetup: async (id) => source(id),
				checkSource: async () => ({ ready: false, oauthRequired: true }),
				...methods
			},
			(fn) => (onDestroy = fn),
			untrack,
			(_th, en) => en,
			(cause) => cause.message,
			windowEvents,
			documentEvents,
			catalogSourceDisplayName,
			catalogSourceProvider,
			providerGuide,
			apiConnectorSetup,
			apiConnectorError,
			oauthProviderSetup
		);
	});
	const destroy = () => {
		if (destroyed) return;
		destroyed = true;
		onDestroy();
		stop();
	};
	context.after(destroy);
	await settle();
	return { view, destroy, windowEvents, documentEvents, popups, popupEvents, timers, tickTimers };
}

test('OAuth links accept secure provider URLs and local HTTP only', async (context) => {
	const { view } = await setupHarness(context);
	for (const url of [
		'https://provider.example.test/authorize?state=synthetic',
		'http://localhost:8080/authorize',
		'http://127.0.0.1/authorize',
		'http://[::1]/authorize'
	])
		assert.equal(view.safeOAuthURL(url), new URL(url).href);
	for (const url of [
		'http://provider.example.test/authorize',
		'http://localhost.evil.test/authorize',
		'https://user@provider.example.test/authorize',
		'https://user:password@provider.example.test/authorize',
		'javascript:alert(1)',
		'data:text/html,unsafe',
		'/authorize',
		'invalid'
	])
		assert.throws(() => view.safeOAuthURL(url), /invalid sign-in link/);
});

test('source-ID-only setup uses trusted managed branding without starting OAuth and clears it on a source change', async (context) => {
	let signIns = 0;
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, id === 'source-one' ? {
			name: 'Managed source', endpointHost: '127.0.0.1',
			managedProvider: 'google-drive', oauthProvider: 'google'
		} : { name: 'Local custom source', endpointHost: '127.0.0.1' }),
		startSourceOAuth: async () => { signIns += 1; }
	});
	assert.equal(view.providerName, 'Google Drive');
	assert.equal(view.providerKind, 'orca');
	assert.equal(view.providerHost, '127.0.0.1');
	assert.equal(signIns, 0);
	view.setContext('other-source');
	await settle();
	assert.equal(view.providerName, 'Local custom source');
	assert.equal(view.providerKind, undefined);
	assert.equal(signIns, 0);
});

test('saving account fields checks access immediately and clears entered secrets', async (context) => {
	let checks = 0;
	let submitted;
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { configured: Boolean(submitted) }),
		configureSource: async (_id, fields) => {
			submitted = { ...fields };
			return source();
		},
		checkSource: async () => {
			checks += 1;
			return { ready: true, oauthRequired: false };
		}
	});
	view.setAccount({ token: 'synthetic-token' });
	await view.configure();
	assert.deepEqual(submitted, { token: 'synthetic-token' });
	assert.deepEqual(view.state.values, {});
	assert.equal(view.state.connectionReady, true);
	assert.equal(view.state.setup.configured, true);
	assert.equal(checks, 1);
});

test('manual source creation preserves personal token configuration', async (context) => {
	let submitted;
	let created;
	const { view } = await setupHarness(
		context,
		{
			createRemoteEntry: async (manifest) => {
				submitted = manifest;
				return { id: 'source-new' };
			}
		},
		{
			sourceID: '',
			canCreate: true,
			oncreated: async (id) => {
				created = id;
			}
		}
	);
	view.setCreate('New source', 'https://source.example.test/mcp', 'bearer');
	await view.createSource();
	assert.equal(submitted.remoteConfig.fixedURL, 'https://source.example.test/mcp');
	assert.equal(submitted.remoteConfig.headers[0].key, 'Authorization');
	assert.equal(submitted.remoteConfig.headers[0].prefix, 'Bearer ');
	assert.equal(submitted.remoteConfig.headers[0].sensitive, true);
	assert.equal(created, 'source-new');
});

function directSource(id = 'source-one', overrides = {}) {
	return source(id, {
		name: 'Google Drive',
		configured: false,
		oauthClientRequired: true,
		oauthClientConfigured: true,
		...overrides
	});
}

test('Google Drive prepares an empty personal configuration only on the explicit connect click', async (context) => {
	const calls = [];
	let ready = 0;
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => {
				calls.push(['setup', id]);
				return directSource(id, { configured: calls.some(([method]) => method === 'configure') });
			},
			configureSource: async (id, values, url) => {
				calls.push(['configure', id, values, url]);
				return directSource(id, { configured: true });
			},
			checkSource: async (id) => {
				calls.push(['check', id]);
				return { ready: false, oauthRequired: true };
			},
			startSourceOAuth: async (id) => {
				calls.push(['sign-in', id]);
				return { oauthURL: 'https://accounts.example.test/authorize?state=synthetic' };
			}
		},
		{
			onready: async () => {
				ready += 1;
			}
		}
	);
	assert.equal(view.providerName, 'Google Drive');
	assert.deepEqual(calls, [['setup', 'source-one']]);
	await view.startOAuth();
	assert.deepEqual(calls, [
		['setup', 'source-one'],
		['configure', 'source-one', {}, undefined],
		['check', 'source-one'],
		['setup', 'source-one'],
		['sign-in', 'source-one']
	]);
	assert.match(view.state.oauthURL, /^https:/);
	assert.equal(view.state.setup.configured, true);
	assert.equal(view.state.connectionReady, false);
	assert.equal(ready, 0);
});

test('a missing platform client prevents customer mutations even for organization managers', async (context) => {
	const calls = [];
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => directSource(id, { oauthClientConfigured: false }),
			configureSource: async () => {
				calls.push('configure');
			},
			startSourceOAuth: async () => {
				calls.push('sign-in');
			},
			checkSource: async () => {
				calls.push('check');
			}
		},
		{ canCreate: true }
	);
	await view.startOAuth();
	await view.configure();
	await view.verify();
	assert.deepEqual(calls, []);
	assert.equal(view.state.connectionReady, false);
	assert.equal(view.state.oauthURL, '');
});

test('a source switch during personal configuration cannot launch sign-in for the old source', async (context) => {
	const pending = deferred();
	const signIns = [];
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => directSource(id),
		configureSource: async () => pending.promise,
		startSourceOAuth: async (id) => {
			signIns.push(id);
		}
	});
	const connect = view.startOAuth();
	view.setContext('source-two');
	await settle();
	pending.resolve(directSource('source-one', { configured: true }));
	await connect;
	assert.deepEqual(signIns, []);
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.setup.configured, false);
	assert.equal(view.state.oauthURL, '');
});

test('sign-in stops when platform availability changes during personal configuration', async (context) => {
	let signIns = 0;
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => directSource(id),
		configureSource: async (id) =>
			directSource(id, { configured: true, oauthClientConfigured: false }),
		startSourceOAuth: async () => {
			signIns += 1;
		}
	});
	await view.startOAuth();
	assert.equal(signIns, 0);
	assert.equal(view.state.connectionReady, false);
	assert.equal(view.state.oauthURL, '');
	assert.match(view.state.error, /contact the ORCA team/);
});

test('preparing a link does not imply readiness; checking refreshes stored sign-in state', async (context) => {
	let checks = 0;
	let ready = 0;
	let connected = false;
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => source(id, { oauthConnected: connected }),
			startSourceOAuth: async () => ({
				oauthURL: 'https://provider.example.test/authorize?state=synthetic'
			}),
			checkSource: async () => {
				checks += 1;
				connected = checks > 1;
				return { ready: connected, oauthRequired: !connected };
			}
		},
		{
			onready: async () => {
				ready += 1;
			}
		}
	);
	await view.startOAuth();
	assert.match(view.state.oauthURL, /^https:/);
	assert.equal(view.state.connectionReady, false);
	assert.equal(checks, 1);
	assert.equal(ready, 0);
	await view.verify();
	assert.equal(checks, 2);
	assert.equal(ready, 1);
	assert.equal(view.state.connectionReady, true);
	assert.equal(view.state.setup.oauthConnected, true);
	assert.equal(view.state.oauthURL, '');
	view.editConfiguration(true);
	assert.equal(view.state.connectionReady, false);
});

test('an empty OAuth URL checks the connection and cannot claim success when sign-in is still required', async (context) => {
	let checks = 0;
	let ready = 0;
	const { view } = await setupHarness(
		context,
		{
			startSourceOAuth: async () => ({ oauthURL: '' }),
			checkSource: async () => {
				checks += 1;
				return { ready: false, oauthRequired: true };
			}
		},
		{
			onready: async () => {
				ready += 1;
			}
		}
	);
	await view.startOAuth();
	assert.equal(checks, 2);
	assert.equal(ready, 0);
	assert.equal(view.state.connectionReady, false);
	assert.equal(view.state.oauthRequired, true);
	assert.equal(view.state.notice, '');
});

test('late OAuth and disconnect responses cannot update another source', async (context) => {
	const pendingOAuth = deferred();
	const pendingDisconnect = deferred();
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { oauthConnected: id !== 'source-one' }),
		startSourceOAuth: async () => pendingOAuth.promise,
		disconnectSourceOAuth: async () => pendingDisconnect.promise
	});
	const signIn = view.startOAuth();
	view.setContext('source-two');
	await settle();
	view.setAccount({ token: 'new-source-draft' });
	pendingOAuth.resolve({ oauthURL: 'https://provider.example.test/old-source' });
	await signIn;
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.oauthURL, '');
	assert.deepEqual(view.state.values, { token: 'new-source-draft' });
	const disconnect = view.disconnectOAuth();
	view.setContext('source-three');
	await settle();
	pendingDisconnect.resolve({ disconnected: true });
	await disconnect;
	assert.equal(view.state.setup.sourceID, 'source-three');
	assert.equal(view.state.setup.oauthConnected, true);
	assert.equal(view.state.notice, '');
});

test('disconnecting clears stored sign-in and checked readiness', async (context) => {
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { oauthConnected: true }),
		checkSource: async () => ({ ready: true, oauthRequired: false }),
		disconnectSourceOAuth: async () => ({ disconnected: true })
	});
	await view.verify();
	assert.equal(view.state.connectionReady, true);
	await view.disconnectOAuth();
	assert.equal(view.state.setup.oauthConnected, false);
	assert.equal(view.state.connectionReady, false);
	assert.equal(view.state.oauthURL, '');
});

test('permission changes and component destruction clear drafts and invalidate pending work', async (context) => {
	const pendingConfiguration = deferred();
	const pendingOAuth = deferred();
	let signIns = 0;
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => directSource(id),
			configureSource: async () => pendingConfiguration.promise,
			startSourceOAuth: async () => {
				signIns += 1;
			}
		},
		{ canCreate: true }
	);
	const connect = view.startOAuth();
	view.setContext('source-one', false);
	await settle();
	pendingConfiguration.resolve(directSource('source-one', { configured: true }));
	await connect;
	assert.equal(signIns, 0);
	assert.equal(view.state.setup.configured, false);
	assert.equal(view.state.notice, '');
	const { view: closing, destroy } = await setupHarness(context, {
		startSourceOAuth: async () => pendingOAuth.promise
	});
	const signIn = closing.startOAuth();
	closing.setAccount({ token: 'synthetic-token' });
	destroy();
	pendingOAuth.resolve({ oauthURL: 'https://provider.example.test/closed-source' });
	await signIn;
	assert.deepEqual(closing.state.values, {});
	assert.equal(closing.state.oauthURL, '');
});

test('stored sign-in offers check and continue, then compact ready state after the source-aware callback', async (context) => {
	const ready = [];
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => directSource(id, { configured: true, oauthConnected: true }),
			checkSource: async () => ({ ready: true, oauthRequired: false })
		},
		{
			sourceLabel: 'Google Drive · ORCA',
			endpointHost: 'drivemcp.googleapis.com',
			onready: async (id) => {
				ready.push(id);
			}
		}
	);
	assert.equal(view.providerName, 'Google Drive');
	assert.equal(view.primaryState, 'check');
	assert.equal(view.state.connectionReady, false);
	await view.verify();
	assert.deepEqual(ready, ['source-one']);
	assert.equal(view.primaryState, 'ready');
});

test('focus and visibility events do nothing without a pending sign-in', async (context) => {
	let reads = 0;
	let checks = 0;
	const { windowEvents, documentEvents } = await setupHarness(context, {
		sourceSetup: async (id) => {
			reads += 1;
			return directSource(id, { configured: true, oauthConnected: true });
		},
		checkSource: async () => {
			checks += 1;
			return { ready: true, oauthRequired: false };
		}
	});
	windowEvents.dispatchEvent(new Event('focus'));
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	await settle();
	assert.equal(reads, 1);
	assert.equal(checks, 0);
});

test('return events dedupe metadata reads and check only after stored sign-in is confirmed', async (context) => {
	const pendingMetadata = deferred();
	const calls = [];
	const ready = [];
	let reads = 0;
	const { view, windowEvents, documentEvents } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => {
				reads += 1;
				calls.push('metadata');
				if (reads === 3) return pendingMetadata.promise;
				return directSource(id, { configured: true, oauthConnected: reads > 3 });
			},
			startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' }),
			checkSource: async () => {
				calls.push('check');
				return { ready: reads > 3, oauthRequired: reads <= 3 };
			}
		},
		{
			onready: async (id) => {
				ready.push(id);
			}
		}
	);
	await view.startOAuth();
	assert.equal(view.primaryState, 'pending');
	windowEvents.dispatchEvent(new Event('focus'));
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	windowEvents.dispatchEvent(new Event('focus'));
	await settle();
	assert.deepEqual(calls, ['metadata', 'check', 'metadata', 'metadata']);
	pendingMetadata.resolve(directSource('source-one', { configured: true, oauthConnected: false }));
	await settle();
	assert.equal(view.primaryState, 'pending');
	assert.deepEqual(ready, []);
	documentEvents.visibilityState = 'hidden';
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	await settle();
	assert.equal(reads, 3);
	documentEvents.visibilityState = 'visible';
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	windowEvents.dispatchEvent(new Event('focus'));
	await settle();
	assert.deepEqual(calls, ['metadata', 'check', 'metadata', 'metadata', 'metadata', 'check']);
	assert.deepEqual(ready, ['source-one']);
	assert.equal(view.primaryState, 'ready');
	assert.equal(view.state.oauthURL, '');
});

test('pending OAuth completes without browser return events and stops polling after verification', async (context) => {
	let connected = false;
	let starts = 0;
	let checks = 0;
	const ready = [];
	const { view, timers, tickTimers } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { oauthConnected: connected }),
		startSourceOAuth: async () => {
			starts += 1;
			return { oauthURL: 'https://provider.example.test/authorize' };
		},
		checkSource: async () => {
			checks += 1;
			return { ready: connected, oauthRequired: !connected };
		}
	}, { onready: async (id) => ready.push(id) });
	assert.equal(timers.size, 0);
	await view.startOAuth();
	await settle();
	assert.equal(timers.size, 1);
	assert.equal([...timers.values()][0].delay, 3000);
	await tickTimers();
	assert.equal(checks, 1, 'metadata polling must not call tools/check before consent completes');
	assert.equal(view.primaryState, 'pending');
	connected = true;
	await tickTimers();
	assert.equal(view.primaryState, 'ready');
	assert.equal(checks, 2);
	assert.equal(starts, 1, 'polling must never restart OAuth');
	assert.deepEqual(ready, ['source-one']);
	assert.equal(timers.size, 0);
});

test('pending OAuth polling pauses while hidden, dedupes focus checks, and retries early return events', async (context) => {
	let reads = 0;
	let connected = false;
	const pendingMetadata = deferred();
	const { view, windowEvents, documentEvents, tickTimers } = await setupHarness(context, {
		sourceSetup: async (id) => {
			reads += 1;
			if (reads === 3) return pendingMetadata.promise;
			return source(id, { oauthConnected: connected });
		},
		startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' }),
		checkSource: async () => ({ ready: connected, oauthRequired: !connected })
	});
	await view.startOAuth();
	await settle();
	documentEvents.visibilityState = 'hidden';
	await tickTimers();
	assert.equal(reads, 2);
	documentEvents.visibilityState = 'visible';
	windowEvents.dispatchEvent(new Event('focus'));
	await tickTimers();
	await tickTimers();
	assert.equal(reads, 3, 'a slow metadata response cannot overlap another poll');
	pendingMetadata.resolve(source());
	await settle();
	assert.equal(view.primaryState, 'pending');
	connected = true;
	await tickTimers();
	assert.equal(reads, 4);
	assert.equal(view.primaryState, 'ready');
});

test('pending OAuth polling is cancelled when changing source or destroying the component', async (context) => {
	const { view, timers, destroy, tickTimers } = await setupHarness(context, {
		startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' })
	});
	await view.startOAuth();
	await settle();
	assert.equal(timers.size, 1);
	view.setContext('source-two');
	await tickTimers();
	assert.equal(timers.size, 0);
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.oauthURL, '');
	await view.startOAuth();
	await settle();
	assert.equal(timers.size, 1);
	destroy();
	assert.equal(timers.size, 0);
});

test('state notifications stay unready and busy until onready finishes', async (context) => {
	const pendingReady = deferred();
	const states = [];
	const ready = [];
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => directSource(id, { configured: true, oauthConnected: true }),
			checkSource: async () => ({ ready: true, oauthRequired: false })
		},
		{
			onstatechange: (state) => {
				states.push(state);
			},
			onready: async (id) => {
				ready.push(id);
				await pendingReady.promise;
			}
		}
	);
	const check = view.verify();
	await settle();
	assert.deepEqual(ready, ['source-one']);
	assert.deepEqual(states.at(-1), { sourceID: 'source-one', ready: false, busy: true });
	assert.equal(view.state.connectionReady, false);
	pendingReady.resolve();
	await check;
	await settle();
	assert.deepEqual(states.at(-1), { sourceID: 'source-one', ready: true, busy: false });
});

test('a stale return check cannot check another source or surface a late permission error', async (context) => {
	const pendingMetadata = deferred();
	let reads = 0;
	let checks = 0;
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => {
				reads += 1;
				if (reads === 3) return pendingMetadata.promise;
				return directSource(id, { configured: true });
			},
			startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' }),
			checkSource: async () => {
				checks += 1;
				return { ready: false, oauthRequired: true };
			}
		},
		{ canCreate: true }
	);
	await view.startOAuth();
	const returning = view.checkOAuthReturn();
	view.setContext('source-two', false);
	await settle();
	pendingMetadata.reject(new Error('late source-one permission failure'));
	await returning;
	assert.equal(checks, 1);
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.error, '');
	assert.equal(view.state.connectionReady, false);
});

test('a late onready failure cannot overwrite the next source state', async (context) => {
	const pendingReady = deferred();
	const ready = [];
	let reads = 0;
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) =>
				directSource(id, { configured: true, oauthConnected: ++reads > 2 }),
			startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' }),
			checkSource: async () => ({ ready: reads > 2, oauthRequired: reads <= 2 })
		},
		{
			onready: async (id) => {
				ready.push(id);
				await pendingReady.promise;
			}
		}
	);
	await view.startOAuth();
	const returning = view.checkOAuthReturn();
	await settle();
	assert.deepEqual(ready, ['source-one']);
	assert.equal(view.state.connectionReady, false);
	view.setContext('source-two');
	await settle();
	pendingReady.reject(new Error('late discovery failure'));
	await returning;
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.error, '');
	assert.equal(view.state.connectionReady, false);
});

test('destroy removes return listeners and closes the parent readiness state', async (context) => {
	let reads = 0;
	const states = [];
	const { view, destroy, windowEvents, documentEvents } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => {
				reads += 1;
				return directSource(id, { configured: true });
			},
			startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' })
		},
		{
			onstatechange: (state) => {
				states.push(state);
			}
		}
	);
	await view.startOAuth();
	destroy();
	windowEvents.dispatchEvent(new Event('focus'));
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	await settle();
	assert.equal(reads, 2);
	assert.deepEqual(states.at(-1), { sourceID: 'source-one', ready: false, busy: false });
	assert.equal(view.state.oauthURL, '');
});

test('a focus event between a source prop change and its load cannot reuse the old pending link', async (context) => {
	const reads = [];
	const { view, windowEvents } = await setupHarness(context, {
		sourceSetup: async (id) => {
			reads.push(id);
			return directSource(id, { configured: true });
		},
		startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' })
	});
	await view.startOAuth();
	view.setContext('source-two');
	windowEvents.dispatchEvent(new Event('focus'));
	await settle();
	assert.deepEqual(reads, ['source-one', 'source-one', 'source-two']);
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.oauthURL, '');
});

test('an existing grant cannot start another sign-in or advance on return events', async (context) => {
	const calls = [];
	const { view, windowEvents, documentEvents } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => directSource(id, { configured: true, oauthConnected: true }),
			configureSource: async () => calls.push('configure'),
			startSourceOAuth: async () => {
				calls.push('start');
				return { oauthURL: 'https://provider.example.test/authorize' };
			},
			checkSource: async () => {
				calls.push('check');
				return { ready: true, oauthRequired: false };
			},
			disconnectSourceOAuth: async () => calls.push('disconnect')
		},
		{ onready: async () => calls.push('ready') }
	);
	await view.startOAuth();
	windowEvents.dispatchEvent(new Event('focus'));
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	await settle();
	assert.deepEqual(calls, []);
	assert.equal(view.state.oauthURL, '');
	assert.equal(view.state.connectionReady, false);
	assert.equal(view.primaryState, 'check');
});

test('an unusable grant requires explicit disconnect before sign-in and permits pending retries', async (context) => {
	let connected = true;
	let disconnects = 0;
	let starts = 0;
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => directSource(id, { configured: true, oauthConnected: connected }),
		checkSource: async () => ({ ready: false, oauthRequired: true }),
		disconnectSourceOAuth: async () => {
			disconnects += 1;
			if (disconnects === 1) throw new Error('Temporary disconnect failure');
			connected = false;
			return { disconnected: true };
		},
		startSourceOAuth: async () => {
			starts += 1;
			return { oauthURL: `https://provider.example.test/authorize?attempt=${starts}` };
		}
	});
	await view.verify();
	assert.equal(view.primaryState, 'reconnect');
	await view.startOAuth();
	assert.equal(starts, 0);
	assert.equal(disconnects, 0);
	await view.disconnectOAuth();
	assert.equal(view.primaryState, 'reconnect');
	assert.equal(view.state.setup.oauthConnected, true);
	assert.match(view.state.error, /Temporary disconnect failure/);
	await view.disconnectOAuth();
	assert.equal(view.primaryState, 'connect');
	assert.equal(view.state.setup.oauthConnected, false);
	assert.equal(view.state.connectionReady, false);
	assert.equal(starts, 0);
	await view.startOAuth();
	assert.equal(view.primaryState, 'pending');
	assert.equal(starts, 1);
	await view.startOAuth();
	assert.equal(view.primaryState, 'pending');
	assert.equal(starts, 2);
	assert.equal(view.state.oauthURL, 'https://provider.example.test/authorize?attempt=2');
});

test('personal preparation that finds an existing grant checks it without another sign-in', async (context) => {
	let starts = 0;
	let prepared = false;
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => directSource(id, { configured: prepared, oauthConnected: prepared }),
		configureSource: async (id) => {
			prepared = true;
			return directSource(id, { configured: true, oauthConnected: true });
		},
		checkSource: async () => ({ ready: true, oauthRequired: false }),
		startSourceOAuth: async () => {
			starts += 1;
			return { oauthURL: 'https://provider.example.test/authorize' };
		}
	});
	await view.startOAuth();
	assert.equal(starts, 0);
	assert.equal(view.primaryState, 'ready');
	assert.equal(view.state.oauthURL, '');
	assert.equal(view.state.connectionReady, true);
});

test('an optional PAT source reserves its popup synchronously and connects without requiring token entry', async (context) => {
	const pendingConfiguration = deferred();
	const calls = [];
	let configured = false;
	const optionalToken = { key: 'AUTHORIZATION', name: 'Access token', required: false, sensitive: true };
	const { view, popups, popupEvents, destroy } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { name: 'GitHub', configured, fields: [optionalToken] }),
		configureSource: async (id, values) => {
			calls.push(['configure', id, { ...values }]);
			return pendingConfiguration.promise;
		},
		checkSource: async () => {
			calls.push(['check']);
			return { ready: false, oauthRequired: true };
		},
		startSourceOAuth: async () => {
			calls.push(['oauth']);
			return { oauthURL: 'https://provider.example.test/authorize' };
		}
	});
	assert.equal(view.primaryState, 'connect');
	const connecting = view.startOAuth();
	assert.equal(popups.length, 1);
	assert.deepEqual(popupEvents, [['open', 'about:blank', '_blank'], ['opener', null]]);
	assert.equal(popups[0].opener, null);
	assert.match(popups[0].document.body.textContent, /Connecting to GitHub/);
	assert.deepEqual(calls, [['configure', 'source-one', {}]]);
	await Promise.all([view.startOAuth(), view.verify(), view.configure()]);
	assert.equal(popups.length, 1);
	assert.equal(calls.length, 1);
	configured = true;
	pendingConfiguration.resolve(source('source-one', { configured, fields: [optionalToken] }));
	await connecting;
	assert.deepEqual(calls, [['configure', 'source-one', {}], ['check'], ['oauth']]);
	assert.deepEqual(popupEvents.at(-1), ['navigate', 'https://provider.example.test/authorize']);
	assert.equal(view.state.oauthWindowOpened, true);
	assert.equal(view.state.connectionReady, false);
	destroy();
	assert.equal(popups[0].closed, false, 'the external provider window remains user-controlled');
});

test('required source fields and account URLs retain their configuration step', async (context) => {
	for (const requirements of [
		{ fields: [{ key: 'READ_ONLY', required: true }] },
		{ fields: [{ key: 'Authorization', required: true, sensitive: true }] },
		{ requiresURL: true }
	]) {
		const calls = [];
		const { view, popups } = await setupHarness(context, {
			sourceSetup: async (id) => source(id, { configured: false, ...requirements }),
			configureSource: async () => calls.push('configure'),
			checkSource: async () => calls.push('check'),
			startSourceOAuth: async () => calls.push('oauth')
		});
		assert.equal(view.primaryState, 'configure');
		await view.startOAuth();
		await view.verify();
		assert.deepEqual(calls, []);
		assert.equal(popups.length, 0);
	}
});

test('saving a required Supabase mode continues through checking and opens provider consent', async (context) => {
	const calls = [];
	let configured = false;
	const fields = [{ key: 'READ_ONLY', required: true }];
	const { view, popupEvents } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { name: 'Supabase', configured, fields }),
		configureSource: async (id, values) => {
			calls.push(['configure', { ...values }]);
			configured = true;
			return source(id, { configured, fields });
		},
		checkSource: async () => {
			calls.push(['check']);
			return { ready: false, oauthRequired: true };
		},
		startSourceOAuth: async () => {
			calls.push(['oauth']);
			return { oauthURL: 'https://provider.example.test/authorize' };
		}
	});
	view.setAccount({ READ_ONLY: 'false' });
	await view.configure();
	assert.deepEqual(calls, [['configure', { READ_ONLY: 'false' }], ['check'], ['oauth']]);
	assert.equal(view.primaryState, 'pending');
	assert.equal(view.state.oauthWindowOpened, true);
	assert.deepEqual(view.state.values, {});
	assert.deepEqual(popupEvents.at(-1), ['navigate', 'https://provider.example.test/authorize']);
});

test('a configured optional PAT is checked without overwriting credentials or starting OAuth', async (context) => {
	const calls = [];
	const { view, popups } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, {
			fields: [{ key: 'AUTHORIZATION', required: false, sensitive: true }]
		}),
		configureSource: async () => calls.push('configure'),
		startSourceOAuth: async () => calls.push('oauth'),
		checkSource: async () => {
			calls.push('check');
			return { ready: true, oauthRequired: false };
		}
	});
	await view.startOAuth();
	assert.deepEqual(calls, ['check']);
	assert.equal(view.primaryState, 'ready');
	assert.equal(view.state.oauthURL, '');
	assert.equal(popups[0].closed, true);
});

test('rejected user-entered bearer tokens return to configuration without OAuth or a popup', async (context) => {
	for (const key of ['AUTHORIZATION', 'Authorization', 'authorization']) {
		const calls = [];
		const { view, popups } = await setupHarness(context, {
			sourceSetup: async (id) => source(id, {
				fields: [{ key, required: false, sensitive: true }]
			}),
			configureSource: async (id, values) => {
				calls.push(['configure', { ...values }]);
				return source(id);
			},
			startSourceOAuth: async () => calls.push(['oauth'])
		});
		view.editConfiguration(true);
		view.setAccount({ [key]: 'synthetic-pat' });
		await view.configure();
		assert.deepEqual(calls, [['configure', { [key]: 'synthetic-pat' }]]);
		assert.equal(view.primaryState, 'configure');
		assert.match(view.state.error, /did not accept this token/);
		assert.equal(view.state.oauthURL, '');
		assert.deepEqual(view.state.values, {});
		assert.equal(popups.length, 0);
	}
});

test('a blocked popup retains a usable provider link and return events complete the connection', async (context) => {
	let connected = false;
	const { view, windowEvents } = await setupHarness(context, {
		sourceSetup: async (id) => source(id, { oauthConnected: connected }),
		checkSource: async () => ({ ready: connected, oauthRequired: !connected }),
		startSourceOAuth: async () => ({ oauthURL: 'https://provider.example.test/authorize' })
	});
	windowEvents.open = () => null;
	await view.startOAuth();
	assert.equal(view.primaryState, 'pending');
	assert.equal(view.state.oauthURL, 'https://provider.example.test/authorize');
	assert.equal(view.state.oauthWindowOpened, false);
	connected = true;
	windowEvents.dispatchEvent(new Event('focus'));
	await settle();
	assert.equal(view.primaryState, 'ready');
});

test('popup navigation failure closes its blank window and retains the validated fallback link', async (context) => {
	const pendingOAuth = deferred();
	const { view, popups } = await setupHarness(context, {
		startSourceOAuth: async () => pendingOAuth.promise
	});
	const connecting = view.startOAuth();
	await settle();
	popups[0].location.replace = () => { throw new Error('navigation blocked'); };
	pendingOAuth.resolve({ oauthURL: 'https://provider.example.test/authorize' });
	await connecting;
	assert.equal(popups[0].closed, true);
	assert.equal(view.state.oauthWindowOpened, false);
	assert.equal(view.state.oauthURL, 'https://provider.example.test/authorize');
	assert.equal(view.state.error, '');
});

test('closing a reserved popup while OAuth is pending leaves a fallback link without reopening it', async (context) => {
	const pendingOAuth = deferred();
	const { view, popups, popupEvents } = await setupHarness(context, {
		startSourceOAuth: async () => pendingOAuth.promise
	});
	const connecting = view.startOAuth();
	await settle();
	popups[0].close();
	pendingOAuth.resolve({ oauthURL: 'https://provider.example.test/authorize' });
	await connecting;
	assert.equal(popups.length, 1);
	assert.equal(view.state.oauthWindowOpened, false);
	assert.equal(view.state.oauthURL, 'https://provider.example.test/authorize');
	assert.equal(popupEvents.some(([event]) => event === 'navigate'), false);
});

test('failed setup, check, OAuth, and unsafe links close only the reserved blank popup', async (context) => {
	for (const failingStage of ['configure', 'check', 'oauth', 'unsafe-url']) {
		const configured = failingStage !== 'configure';
		const { view, popups, popupEvents } = await setupHarness(context, {
			sourceSetup: async (id) => source(id, { configured }),
			configureSource: async () => { throw new Error('configure failed'); },
			checkSource: async () => {
				if (failingStage === 'check') throw new Error('check failed');
				return { ready: false, oauthRequired: true };
			},
			startSourceOAuth: async () => {
				if (failingStage === 'oauth') throw new Error('oauth failed');
				return { oauthURL: 'javascript:alert(1)' };
			}
		});
		await view.startOAuth();
		assert.equal(popups[0].closed, true, failingStage);
		assert.equal(popupEvents.some(([event]) => event === 'navigate'), false, failingStage);
		assert.equal(view.state.oauthURL, '', failingStage);
		assert.equal(view.busy, false, failingStage);
		assert.match(view.state.error, failingStage === 'unsafe-url' ? /invalid sign-in link/ : /failed/);
	}
});

test('late old-source OAuth cannot navigate or close the new source popup', async (context) => {
	const oldOAuth = deferred();
	const newOAuth = deferred();
	const starts = [];
	const { view, popups, popupEvents } = await setupHarness(context, {
		startSourceOAuth: async (id) => {
			starts.push(id);
			return id === 'source-one' ? oldOAuth.promise : newOAuth.promise;
		}
	});
	const oldConnection = view.startOAuth();
	await settle();
	assert.deepEqual(starts, ['source-one']);
	view.setContext('source-two');
	await settle();
	assert.equal(popups[0].closed, true);
	const newConnection = view.startOAuth();
	await settle();
	assert.equal(popups.length, 2);
	oldOAuth.resolve({ oauthURL: 'https://provider.example.test/old' });
	await oldConnection;
	assert.equal(popups[1].closed, false);
	assert.equal(view.state.oauthURL, '');
	assert.equal(view.busy, true);
	newOAuth.resolve({ oauthURL: 'https://provider.example.test/new' });
	await newConnection;
	assert.equal(view.state.oauthURL, 'https://provider.example.test/new');
	assert.deepEqual(popupEvents.filter(([event]) => event === 'navigate'), [
		['navigate', 'https://provider.example.test/new']
	]);
});

test('unmount during a connection check closes the reserved popup and prevents later OAuth', async (context) => {
	const pendingCheck = deferred();
	let starts = 0;
	const { view, destroy, popups } = await setupHarness(context, {
		checkSource: async () => pendingCheck.promise,
		startSourceOAuth: async () => { starts += 1; }
	});
	const connecting = view.startOAuth();
	assert.equal(popups[0].closed, false);
	destroy();
	assert.equal(popups[0].closed, true);
	pendingCheck.resolve({ ready: false, oauthRequired: true });
	await connecting;
	assert.equal(starts, 0);
	assert.equal(view.state.oauthURL, '');
});

test('source setup renders provider branding, native API fields and permission-gated OAuth setup', async () => {
	const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
	const iconsURL = moduleURL(
		'export const Check = () => {}, ExternalLink = () => {}, Info = () => {}, KeyRound = () => {}, Plug = () => {}, RefreshCw = () => {}, Unplug = () => {};'
	);
	const serverModule = (content, filename, aliases) => {
		let code = compile(content, { filename, generate: 'server' }).js.code;
		for (const [name, url] of Object.entries({
			'svelte/internal/server': pathToFileURL(require.resolve('svelte/internal/server')).href,
			svelte: pathToFileURL(require.resolve('svelte')).href,
			'@lucide/svelte': iconsURL,
      '$lib/orca/oauth-provider-setup': providerSetupURL,
			...aliases
		})) {
			code = code
				.replaceAll(`'${name}'`, JSON.stringify(url))
				.replaceAll(`"${name}"`, JSON.stringify(url));
		}
		return moduleURL(code);
	};
	const iconURL = serverModule(
		await readFile(new URL('../../orca/CatalogIcon.svelte', import.meta.url), 'utf8'),
		'CatalogIcon.svelte',
		{ './catalog-data': await typescriptModuleURL(new URL('../../orca/catalog-data.ts', import.meta.url)) }
	);
	const { default: SourceSetup } = await import(
		serverModule(component, 'SourceSetup.svelte', {
			'$lib/orca/CatalogIcon.svelte': iconURL,
			'$lib/orca/catalog': catalogURL,
			'$lib/orca/api-connector-setup': apiSetupURL,
			'$lib/orca/provider-guides': new URL('../../orca/provider-guides.ts', import.meta.url).href,
			'$lib/orca/locale.svelte': moduleURL('export const t = (_th, en) => en;'),
			'$lib/services/orca': moduleURL(
				'export const OrcaService = {}; export const orcaError = (error) => error.message;'
			)
		})
	);
  for (const [id, host, review] of [
    ['default-asana-877addce', 'mcp.asana.com', false],
    ['default-harvey-3c6d44ac', 'api.harvey.ai', true],
    ['default-dropbox-8dc6ea2b', 'mcp.dropbox.com', true],
  ]) {
    const seeded = component
      .replace('let setup = $state<OrcaSourceSetup>();', `let setup = $state<OrcaSourceSetup>(${JSON.stringify(source(id, {
        configured: false, oauthClientRequired: id.includes('dropbox') ? false : true,
        oauthClientCanConfigure: true, endpointHost: host,
        setupStatus: review ? 'review_required' : 'admin_setup_required',
      }))});`)
      .replace(/let clientFormOpen = \$state\(false\);/, 'let clientFormOpen = $state(true);');
    const { default: ProviderSetup } = await import(serverModule(seeded, `ProviderSetup-${id}.svelte`, {
      '$lib/orca/CatalogIcon.svelte': iconURL,
      '$lib/orca/catalog': catalogURL,
      '$lib/orca/api-connector-setup': apiSetupURL,
      '$lib/orca/provider-guides': new URL('../../orca/provider-guides.ts', import.meta.url).href,
      '$lib/orca/locale.svelte': moduleURL('export const t = (_th, en) => en;'),
      '$lib/services/orca': moduleURL('export const OrcaService = {}; export const orcaError = (error) => error.message;'),
    }));
    const body = render(ProviderSetup, { props: { sourceID: id, canCreate: true } }).body;
    const profile = oauthProviderSetup(id, host);
    assert.ok(body.includes(profile.actionURL));
    assert.ok(body.includes(profile.appType));
    const help = body.match(/<details([^>]*class="client-provider-help[^"]*"[^>]*)>([\s\S]*?)<\/details>/);
    assert.ok(help, 'provider instructions are grouped in a disclosure');
    assert.doesNotMatch(help[1], /\bopen(?:\s|=|$)/);
    assert.match(help[2], /App setup instructions/);
    if (review) {
      assert.match(body, /needs provider review/);
      assert.doesNotMatch(body, /id="source-client-secret"|Save app/);
    } else {
      assert.match(body, /Open Asana Developer Console/);
      assert.match(body, /id="source-client-secret"[^>]*type="password"/);
    }
  }

  for (const [provider, name, logo] of [
    ['gmail', 'Gmail', '/orca/catalog/gmail.svg'],
    ['microsoft-outlook', 'Microsoft Outlook', '/orca/catalog/outlook.svg'],
    ['microsoft-calendar', 'Microsoft Calendar', '/orca/catalog/calendar.svg'],
    ['microsoft-contacts', 'Microsoft Contacts', '/orca/catalog/contact.svg'],
  ]) {
    const id = `default-orca-managed-${provider}`;
    const seeded = component.replace('let setup = $state<OrcaSourceSetup>();',
      `let setup = $state<OrcaSourceSetup>(${JSON.stringify(source(id, {
        name: 'Backend label', endpointHost: '127.0.0.1', managedProvider: provider,
        oauthClientRequired: true, oauthClientConfigured: true, oauthClientCanConfigure: false,
      }))});`);
    const { default: ManagedSetup } = await import(serverModule(seeded, `ManagedSetup-${provider}.svelte`, {
      '$lib/orca/CatalogIcon.svelte': iconURL,
      '$lib/orca/catalog': catalogURL,
      '$lib/orca/api-connector-setup': apiSetupURL,
      '$lib/orca/provider-guides': new URL('../../orca/provider-guides.ts', import.meta.url).href,
      '$lib/orca/locale.svelte': moduleURL('export const t = (_th, en) => en;'),
      '$lib/services/orca': moduleURL('export const OrcaService = {}; export const orcaError = (error) => error.message;'),
    }));
    const body = render(ManagedSetup, { props: { sourceID: id } }).body;
    assert.ok(body.includes(`Connect ${name}`));
    assert.ok(body.includes(`src="${logo}"`));
    assert.ok(body.includes(`Sign in to your own ${name} account and authorize ORCA`));
    assert.doesNotMatch(body, /127\.0\.0\.1|Obot|Client Secret|source-client-id|Open Microsoft Entra|Open Google Auth Platform/);
  }

	for (const endpointHost of ['drivemcp.googleapis.com', 'google-drive-mcp.obot.ai']) {
		const { body } = render(SourceSetup, {
			props: { sourceID: 'exact-source', sourceLabel: 'Google Drive · ORCA', endpointHost }
		});
		assert.match(body, /<h3[^>]*>Connect Google Drive<\/h3>/);
		assert.match(body, /<img[^>]+src="\/orca\/tools\/google-drive\.svg"/);
		assert.doesNotMatch(body, /Google Drive · (?:ORCA|Obot)/);
		const details = body.match(/<details([^>]*)>([\s\S]*?)<\/details>/);
		assert.ok(details);
		assert.doesNotMatch(details[1], /\bopen(?:\s|=|$)/);
		assert.ok(details[2].includes(endpointHost));
		assert.ok(details[2].includes('consent page'));
		if (endpointHost === 'google-drive-mcp.obot.ai') assert.ok(details[2].includes('Obot'));
	}
	const custom = render(SourceSetup, {
		props: {
			sourceID: 'custom',
			sourceLabel: 'Google Drive · Hotel',
			endpointHost: 'drivemcp.googleapis.com.hotel.invalid'
		}
	}).body;
	assert.match(custom, /Connect Google Drive · Hotel/);
	assert.doesNotMatch(custom, /src="\/orca\/tools\/google-drive\.svg"/);
	const managed = render(SourceSetup, {
		props: {
			sourceID: 'default-orca-managed-google-drive', sourceLabel: 'Managed source',
			endpointHost: '127.0.0.1', managedProvider: 'google-drive'
		}
	}).body;
	assert.match(managed, /<h3[^>]*>Connect Google Drive<\/h3>/);
	assert.match(managed, /src="\/orca\/tools\/google-drive\.svg"/);
	assert.match(managed, /Sign in to your own Google Drive account and authorize ORCA/);
	assert.doesNotMatch(managed, /127\.0\.0\.1|Google Cloud project/);
	assert.match(managed, /Accounts connected through another provider require a separate sign-in/);
	assert.doesNotMatch(managed, /Obot|Google’s Google Drive service/);
	for (const [id, fields, label] of [
    ['default-orca-api-facebook-pages', [
      { key: 'Authorization', name: 'Page access token', required: true, sensitive: true },
      { key: 'FACEBOOK_PAGE_ID', name: 'Page ID', required: true, sensitive: false }
    ], 'โทเคนของเพจ Facebook'],
    ['default-orca-api-line-messaging', [
      { key: 'Authorization', name: 'Channel access token', required: true, sensitive: true }
    ], 'โทเคนของ LINE OA'],
    ['default-orca-api-instagram', [
      { key: 'Authorization', name: 'Instagram access token', required: true, sensitive: true },
      { key: 'INSTAGRAM_ACCOUNT_ID', name: 'Account ID', required: true, sensitive: false }
    ], 'โทเคนของ Instagram']
  ]) {
    // Seed only the async service result; compile the real template unchanged.
    const seeded = component.replace('let setup = $state<OrcaSourceSetup>();',
      `let setup = $state<OrcaSourceSetup>(${JSON.stringify(nativeApiSource(id, { fields }))});`);
    const { default: NativeSetup } = await import(serverModule(seeded, 'NativeSourceSetup.svelte', {
      '$lib/orca/CatalogIcon.svelte': iconURL,
      '$lib/orca/catalog': catalogURL,
      '$lib/orca/api-connector-setup': apiSetupURL,
      '$lib/orca/provider-guides': new URL('../../orca/provider-guides.ts', import.meta.url).href,
      '$lib/orca/locale.svelte': moduleURL('export const t = (th, _en) => th;'),
      '$lib/services/orca': moduleURL('export const OrcaService = {}; export const orcaError = (error) => error.message;')
    }));
    const native = render(NativeSetup, { props: { sourceID: id, sourceLabel: apiConnectorSetup(id).name } }).body;
    assert.ok(native.includes(label));
    assert.match(native, /บันทึกและทดสอบบัญชี/);
    assert.match(native, /กรอกข้อมูลบัญชี/);
    assert.match(native, /type="password"/);
    assert.match(native, /aria-describedby="source-help-0"/);
    const help = native.match(/<details([^>]*)class="source-provider[^>]*>([\s\S]*?)<\/details>/);
    assert.ok(help, 'account field help is grouped into one setup section');
    assert.doesNotMatch(help[1], /\bopen(?:\s|=|$)/);
    assert.match(help[2], /วิธีตั้งค่า/);
    assert.match(help[2], /id="source-help-0"/);
    assert.doesNotMatch(native, /API adapter|ติดตั้งตัวเชื่อม|เปิดหน้าขอสิทธิ์ให้เมื่อจำเป็น/);
    if (fields.length > 1) assert.match(native, /inputmode="numeric"/);
  }
	for (const [canConfigure, formOpen] of [[false, true], [true, false], [true, true]]) {
		const seeded = component
			.replace('let setup = $state<OrcaSourceSetup>();',
				`let setup = $state<OrcaSourceSetup>(${JSON.stringify(source('slack', {
					oauthClientRequired: true, oauthClientCanConfigure: canConfigure,
					endpointHost: 'mcp.slack.com'
				}))});`)
			.replace('let clientFormOpen = $state(false);', `let clientFormOpen = $state(${formOpen});`);
		const { default: OAuthSetup } = await import(serverModule(seeded, 'OAuthSourceSetup.svelte', {
			'$lib/orca/CatalogIcon.svelte': iconURL,
			'$lib/orca/catalog': catalogURL,
			'$lib/orca/api-connector-setup': apiSetupURL,
			'$lib/orca/provider-guides': new URL('../../orca/provider-guides.ts', import.meta.url).href,
			'$lib/orca/locale.svelte': moduleURL('export const t = (_th, en) => en;'),
			'$lib/services/orca': moduleURL('export const OrcaService = {}; export const orcaError = (error) => error.message;')
		}));
		const body = render(OAuthSetup, { props: { sourceID: 'slack', sourceLabel: 'Slack Workspace', canCreate: true } }).body;
		if (!canConfigure) {
			assert.match(body, /An ORCA platform administrator must set up the app/);
			assert.doesNotMatch(body, /Set up app|Client Secret|Create ORCA Slack app/);
		} else if (!formOpen) {
			assert.match(body, /Set up app/);
			assert.doesNotMatch(body, /Client Secret|Create ORCA Slack app/);
		} else {
			assert.match(body, /Create ORCA Slack app/);
			assert.match(body, /Public channels · Read-only/);
			assert.match(body, /id="source-client-secret"[^>]*type="password"/);
			assert.match(body, /id="source-client-callback"[^>]*readonly[^>]*value="https:\/\/orca.example.test\/oauth\/callback"/);
			assert.match(body, /Save app/);
		}
	}
	const localCustom = render(SourceSetup, {
		props: { sourceID: 'custom-local', sourceLabel: 'Custom files', endpointHost: '127.0.0.1' }
	}).body;
	assert.doesNotMatch(localCustom, /ORCA hosts the connector|google-drive\.svg/);
	assert.match(
		await readFile(
			new URL('../../../../static/orca/tools/google-drive.svg', import.meta.url),
			'utf8'
		),
		/<svg\s/
	);
});

function nativeApiSource(id, overrides = {}) {
  return source(id, {
    configured: false, oauthSupported: false,
    fields: [
      { key: 'Authorization', name: 'Page access token', description: '', required: true, sensitive: true },
      { key: 'FACEBOOK_PAGE_ID', name: 'Page ID', description: '', required: true, sensitive: false }
    ],
    ...overrides
  });
}

test('native API account setup saves and checks once before exposing tools without opening OAuth', async (context) => {
  const id = 'default-orca-api-facebook-pages';
  const calls = [];
  let configured = false;
  const { view, popups } = await setupHarness(context, {
    sourceSetup: async (sourceID) => nativeApiSource(sourceID, { configured }),
    configureSource: async (sourceID, values) => {
      calls.push(['configure', sourceID, { ...values }]);
      configured = true;
      return nativeApiSource(sourceID, { configured });
    },
    checkSource: async (sourceID) => {
      calls.push(['check', sourceID]);
      return { ready: true, oauthRequired: false };
    },
    startSourceOAuth: async () => { throw new Error('Native token setup must not start OAuth'); }
  }, { sourceID: id, onready: async (sourceID) => calls.push(['ready', sourceID]) });
  assert.equal(view.primaryState, 'configure');
  const credentials = { Authorization: 'synthetic-test-token', FACEBOOK_PAGE_ID: '12345' };
  view.setAccount(credentials);
  await view.configure();
  assert.deepEqual(calls, [['configure', id, credentials], ['check', id], ['ready', id]]);
  assert.equal(view.primaryState, 'ready');
  assert.equal(popups.length, 0);
  assert.deepEqual(view.state.values, {}, 'the component does not retain credentials after submitting');
});

test('a rejected native API account stays editable and never advances to tools', async (context) => {
  const id = 'default-orca-api-facebook-pages';
  let configured = false;
  let ready = 0;
  const { view, popups } = await setupHarness(context, {
    sourceSetup: async (sourceID) => nativeApiSource(sourceID, { configured }),
    configureSource: async (sourceID) => {
      configured = true;
      return nativeApiSource(sourceID, { configured });
    },
    checkSource: async () => { throw new Error('The Page token is invalid or expired.'); }
  }, { sourceID: id, onready: async () => ready++ });
  view.setAccount({ Authorization: 'synthetic-invalid-token', FACEBOOK_PAGE_ID: '12345' });
  await view.configure();
  assert.equal(view.primaryState, 'configure');
  assert.equal(view.state.connectionReady, false);
  assert.match(view.state.error, /invalid or expired/);
  assert.equal(ready, 0);
  assert.equal(popups.length, 0);
  assert.deepEqual(view.state.values, {});
});

test('platform owner can configure the app without falsely marking the personal account connected', async (context) => {
	const calls = [];
	const initial = (id) =>
		source(id, { configured: false, oauthClientRequired: true, oauthClientCanConfigure: true });
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) => initial(id),
		configureSourceOAuthClient: async (id, clientID, clientSecret) => {
			calls.push({ id, clientID, clientSecret });
			assert.equal(view.state.clientSecret, '');
			return { ...initial(id), oauthClientConfigured: true };
		}
	});
	assert.equal(view.primaryState, 'unavailable');
	view.setClient(' fixture-id ', ' fixture-secret ');
	await view.configureOAuthClient();
	assert.deepEqual(calls, [
		{ id: 'source-one', clientID: 'fixture-id', clientSecret: 'fixture-secret' }
	]);
	assert.equal(view.state.clientSecret, '');
	assert.equal(view.primaryState, 'connect');
	assert.equal(view.state.connectionReady, false);
	assert.equal(view.state.setup.oauthConnected, false);
});

test('organization manager UI cannot configure global app credentials without server capability', async (context) => {
	let calls = 0;
	const { view } = await setupHarness(
		context,
		{
			sourceSetup: async (id) => source(id, { oauthClientRequired: true }),
			configureSourceOAuthClient: async () => {
				calls++;
			}
		},
		{ canCreate: true }
	);
	view.setClient('fixture-id', 'fixture-secret');
	await view.configureOAuthClient();
	assert.equal(calls, 0);
});

test('app credential failures do not echo secrets and late responses cannot change another source', async (context) => {
	const pending = deferred();
	let fail = true;
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) =>
			source(id, { oauthClientRequired: true, oauthClientCanConfigure: true }),
		configureSourceOAuthClient: async () => {
			if (fail) throw new Error('provider error fixture-secret');
			return pending.promise;
		}
	});
	view.setClient('fixture-id', 'fixture-secret');
	await view.configureOAuthClient();
	assert.equal(view.state.clientSecret, '');
	assert.doesNotMatch(view.state.error, /fixture-secret/);
	fail = false;
	view.setClient('fixture-id', 'fixture-secret');
	const saving = view.configureOAuthClient();
	view.setContext('source-two');
	await settle();
	pending.resolve(source('source-one', { oauthClientConfigured: true }));
	await saving;
	assert.equal(view.state.setup.sourceID, 'source-two');
	assert.equal(view.state.setup.oauthClientConfigured, false);
	assert.equal(view.state.clientSecret, '');
});

test('Slack setup manifest uses the server callback, ORCA branding and public read scopes', async (context) => {
	const { view } = await setupHarness(context, {
		sourceSetup: async (id) =>
			source(id, { endpointHost: 'mcp.slack.com', oauthClientRequired: true })
	});
	const url = new URL(view.slackAppSetupURL());
	assert.equal(url.origin, 'https://api.slack.com');
	const manifest = JSON.parse(url.searchParams.get('manifest_json'));
	assert.equal(manifest.display_information.name, 'ORCA');
	assert.equal(manifest.settings.is_mcp_enabled, true);
	assert.equal(manifest.oauth_config.pkce_enabled, true);
	assert.deepEqual(manifest.oauth_config.redirect_urls, [
		'https://orca.example.test/oauth/callback'
	]);
	assert.ok(manifest.oauth_config.scopes.user.includes('search:read.public'));
	assert.ok(
		manifest.oauth_config.scopes.user.every((s) => !s.includes('write') && !s.includes('private'))
	);
});


test('provider review blocks new OAuth and credential writes without hiding existing-account checks', async (context) => {
  for (const entry of [
    { sourceID: 'default-harvey-3c6d44ac', endpointHost: 'api.harvey.ai', oauthClientRequired: true },
    { sourceID: 'default-dropbox-8dc6ea2b', endpointHost: 'mcp.dropbox.com', oauthClientRequired: false },
  ]) {
    let oauthStarts = 0;
    let writes = 0;
    const { view } = await setupHarness(context, {
      sourceSetup: async (id) => source(id, { ...entry, configured: false, setupStatus: 'review_required', setupReason: 'provider_review', oauthClientCanConfigure: true }),
      configureSourceOAuthClient: async () => { writes++; },
      configureSource: async () => { writes++; },
      startSourceOAuth: async () => { oauthStarts++; },
    }, { sourceID: entry.sourceID, canCreate: true });
    assert.equal(view.primaryState, 'unavailable');
    assert.ok(view.providerSetup.actionURL.startsWith('https://'));
    view.setClient('synthetic-client', 'synthetic-secret');
    await view.configureOAuthClient();
    await view.startOAuth();
    await view.configure();
    assert.equal(writes, 0);
    assert.equal(oauthStarts, 0);
  }
  let checks = 0;
  const { view } = await setupHarness(context, {
    sourceSetup: async (id) => source(id, { configured: true, setupStatus: 'review_required', oauthConnected: true }),
    checkSource: async () => { checks++; return { ready: true, oauthRequired: false }; },
  });
  assert.equal(view.primaryState, 'check');
  await view.verify();
  assert.equal(checks, 1);
  assert.equal(view.primaryState, 'ready');
});

test('provider instructions follow the current source and never a lookalike display name', async (context) => {
  const { view } = await setupHarness(context, {
    sourceSetup: async (id) => source(id, {
      name: 'Asana', endpointHost: id === 'source-one' ? 'mcp.asana.com' : 'mcp.asana.com.evil.test',
      oauthClientRequired: true, oauthClientCanConfigure: id === 'source-one',
    }),
  });
  assert.equal(view.providerSetup.appType, 'MCP app');
  view.setClient('synthetic-id', 'synthetic-secret');
  view.setContext('other-source');
  await settle();
  assert.equal(view.providerSetup, undefined);
  assert.equal(view.state.clientSecret, '');
  assert.equal(view.state.clientFormOpen, false);
});


test('opening app setup shows fields immediately only after current backend authorization', async (context) => {
  const states = [
    { oauthClientRequired: true, oauthClientCanConfigure: true, expectOpen: true },
    { oauthClientRequired: true, oauthClientCanConfigure: false, expectOpen: false },
    { oauthClientRequired: true, oauthClientCanConfigure: true, oauthClientConfigured: true, expectOpen: false },
    { oauthClientRequired: false, oauthClientCanConfigure: true, expectOpen: false },
    { oauthClientRequired: true, oauthClientCanConfigure: true, endpointHost: 'api.harvey.ai', setupStatus: 'review_required', expectOpen: false },
  ];
  for (const { expectOpen, ...state } of states) {
    const { view } = await setupHarness(context, {
      sourceSetup: async (id) => source(id, { configured: false, endpointHost: 'mcp.slack.com', ...state }),
    }, { canCreate: true });
    assert.equal(view.state.clientFormOpen, expectOpen);
    assert.equal(view.state.clientSecret, '');
  }
  const pending = deferred();
  const { view } = await setupHarness(context, {
    sourceSetup: async (id) => id === 'source-one' ? pending.promise : source(id, { oauthClientRequired: true, oauthClientCanConfigure: false }),
  }, { canCreate: true });
  assert.equal(view.state.clientFormOpen, false, 'the loading state cannot infer owner access');
  view.setContext('other-source');
  await settle();
  pending.resolve(source('source-one', { oauthClientRequired: true, oauthClientCanConfigure: true }));
  await settle();
  assert.equal(view.state.setup.sourceID, 'other-source');
  assert.equal(view.state.clientFormOpen, false, 'a stale owner response must not open another source form');
});


test('Slack app setup requests the public read profile and requires backend confirmation', async (context) => {
  for (const confirmed of [true, false]) {
    const calls = [];
    const initial = (id) => source(id, {
      endpointHost: 'mcp.slack.com', configured: false,
      oauthClientRequired: true, oauthClientCanConfigure: true,
    });
    const { view } = await setupHarness(context, {
      sourceSetup: async (id) => initial(id),
      configureSourceOAuthClient: async (id, clientID, clientSecret, scopeProfile) => {
        calls.push({ id, scopeProfile });
        assert.equal(view.state.clientSecret, '');
        return { ...initial(id), oauthClientConfigured: true,
          ...(confirmed ? { oauthScopeProfile: scopeProfile } : {}) };
      },
    });
    view.setClient('fixture-id', 'fixture-secret');
    await view.configureOAuthClient();
    assert.deepEqual(calls, [{ id: 'source-one', scopeProfile: 'slack-public-read-v1' }]);
    assert.equal(view.state.setup.oauthClientConfigured, confirmed);
    assert.equal(view.state.setup.oauthConnected, false);
    assert.equal(view.state.connectionReady, false);
    assert.equal(view.state.clientSecret, '');
    assert.equal(view.primaryState, confirmed ? 'connect' : 'unavailable');
    assert.equal(Boolean(view.state.error), !confirmed);
  }
});

test('Slack scope profile does not carry into a different provider after changing sources', async (context) => {
  const calls = [];
  const initial = (id) => source(id, {
    endpointHost: id === 'source-one' ? 'mcp.slack.com' : 'mcp.asana.com',
    configured: false, oauthClientRequired: true, oauthClientCanConfigure: true,
  });
  const { view } = await setupHarness(context, {
    sourceSetup: async (id) => initial(id),
    configureSourceOAuthClient: async (id, clientID, clientSecret, scopeProfile) => {
      calls.push({ id, scopeProfile });
      return { ...initial(id), oauthClientConfigured: true };
    },
  });
  view.setContext('source-two');
  await settle();
  view.setClient('fixture-id', 'fixture-secret');
  await view.configureOAuthClient();
  assert.deepEqual(calls, [{ id: 'source-two', scopeProfile: undefined }]);
  assert.equal(view.primaryState, 'connect');
  assert.equal(view.state.setup.oauthConnected, false);
});


test('managed Gmail and Microsoft operator setup does not alter member sign-in or infer identity from localhost', async (context) => {
  for (const provider of ['gmail', 'microsoft-outlook', 'microsoft-excel']) {
    const id = `default-orca-managed-${provider}`;
    const { view } = await setupHarness(context, {
      sourceSetup: async (sourceID) => source(sourceID, { name: 'Managed provider', endpointHost: '127.0.0.1', managedProvider: provider, oauthClientRequired: true, oauthClientConfigured: false, oauthClientCanConfigure: false })
    }, { sourceID: id });
    assert.equal(view.primaryState, 'unavailable');
    assert.equal(view.providerSetup.key, `managed-${provider}`);
    assert.equal(view.state.clientFormOpen, false);
    assert.equal(view.state.oauthURL, '');
  }
  const configured = await setupHarness(context, {
    sourceSetup: async (sourceID) => source(sourceID, { name: 'Managed provider', endpointHost: '127.0.0.1', managedProvider: 'gmail', oauthClientRequired: true, oauthClientConfigured: true })
  }, { sourceID: 'default-orca-managed-gmail' });
  assert.equal(configured.view.providerName, 'Gmail');
  assert.equal(configured.view.primaryState, 'connect');
  assert.equal(configured.view.state.clientFormOpen, false);
});

test('managed operator guides require exact source and trusted metadata and distinguish API scopes', () => {
  for (const provider of ['google-drive', 'gmail', 'google-calendar', 'google-docs', 'google-sheets', 'google-search-console', 'microsoft-outlook', 'microsoft-calendar', 'microsoft-contacts', 'microsoft-onedrive', 'microsoft-excel', 'microsoft-word']) {
    const id = `default-orca-managed-${provider}`;
    assert.equal(oauthProviderSetup(id, '127.0.0.1'), undefined);
    assert.equal(oauthProviderSetup('custom', '127.0.0.1', provider), undefined);
    assert.equal(oauthProviderSetup(id, '127.0.0.1', 'unknown'), undefined);
    const guide = oauthProviderSetup(id, '127.0.0.1', provider);
    assert.equal(guide.key, `managed-${provider}`);
    assert.equal(new URL(guide.actionURL).protocol, 'https:');
    assert.doesNotMatch(JSON.stringify(guide), /MCP Tool User|obot|service account|Application permission/);
    assert.match(JSON.stringify(guide), /ORCA/);
  }
  const excel = oauthProviderSetup('default-orca-managed-microsoft-excel', '127.0.0.1', 'microsoft-excel');
  assert.match(JSON.stringify(excel.steps), /Files.ReadWrite/);
  assert.match(JSON.stringify(excel.steps), /only reads data/);
});
