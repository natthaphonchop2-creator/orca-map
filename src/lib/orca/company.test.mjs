import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const company = await importTypeScript(new URL('./company.ts', import.meta.url));
const { chooseCompany, companyDenied, companySwitch, invitationReturnPath, keepCompany, orcaPath, reloadForAddress, rememberCompany, rememberedCompany, resolvePlace, setPageCompany, validCompanyID } = company;

const A = 'org-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const choice = (id, displayName = id) => ({ id, displayName, role: 'employee', canManage: false });

function memoryStorage() {
	const values = new Map();
	return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

function onPage(id, companies) {
	setPageCompany(id, companies);
	return () => setPageCompany('default', []);
}

test('company IDs are "default" or an org UUID, nothing else', () => {
	assert.equal(validCompanyID('default'), true);
	assert.equal(validCompanyID(B), true);
	for (const id of ['', 'Default', 'org-', `${B}x`, B.toUpperCase(), '../default', null, undefined, 42]) {
		assert.equal(validCompanyID(id), false, String(id));
	}
});

test('an explicit company wins, then the remembered one, then the only one', () => {
	const both = [choice('default'), choice(B)];
	// Explicit, even one this person doesn't have: the server decides.
	assert.deepEqual(chooseCompany(A, B, both), { kind: 'company', id: A, companies: both });
	assert.deepEqual(chooseCompany('not-a-company', B, both), { kind: 'company', id: B, companies: both });
	// Remembered, only while the person still has it.
	assert.deepEqual(chooseCompany(null, B, both), { kind: 'company', id: B, companies: both });
	assert.deepEqual(chooseCompany(null, A, both), { kind: 'choose', companies: both });
	// Otherwise the only company, the chooser for several, and nothing for none.
	assert.deepEqual(chooseCompany(null, null, [choice(B)]), { kind: 'company', id: B, companies: [choice(B)] });
	assert.deepEqual(chooseCompany(null, null, both), { kind: 'choose', companies: both });
	assert.deepEqual(chooseCompany(null, null, []), { kind: 'none' });
	// An older server gives no list: "default", as before companies.
	assert.deepEqual(chooseCompany(null, B, undefined), { kind: 'company', id: 'default' });
	assert.deepEqual(chooseCompany(B, null, undefined), { kind: 'company', id: B, companies: undefined });
});

test('an explicit company outside the person\'s own list is denied, an unknown list is not', () => {
	assert.equal(companyDenied({ kind: 'company', id: A, companies: [choice(B)] }), true);
	assert.equal(companyDenied({ kind: 'company', id: A, companies: [] }), true);
	assert.equal(companyDenied({ kind: 'company', id: B, companies: [choice(B)] }), false);
	assert.equal(companyDenied({ kind: 'company', id: B }), false);
	assert.equal(companyDenied({ kind: 'choose', companies: [] }), false);
});

test('API paths: "default" keeps its legacy paths, another company gets its own', () => {
	assert.equal(orcaPath('/bootstrap'), '/orca/bootstrap');
	const done = onPage(B, [choice(B)]);
	try {
		assert.equal(orcaPath('/bootstrap'), `/orca/orgs/${B}/bootstrap`);
		assert.equal(orcaPath('/hubs/x/keys'), `/orca/orgs/${B}/hubs/x/keys`);
		assert.equal(orcaPath('/keys', 'default'), '/orca/keys');
	} finally {
		done();
	}
	assert.equal(orcaPath('/bootstrap'), '/orca/bootstrap');
});

test('links keep the company when it isn\'t "default" or the person has several', () => {
	const link = (path) => {
		const url = new URL(path, 'https://orca.invalid');
		keepCompany(url);
		return url.pathname + url.search;
	};
	// Only "default": links stay exactly as before companies.
	assert.equal(link('/app?view=members'), '/app?view=members');
	let done = onPage('default', [choice('default'), choice(B)]);
	try {
		assert.equal(link('/app?view=members'), '/app?view=members&org=default');
	} finally {
		done();
	}
	done = onPage(B, [choice(B)]);
	try {
		assert.equal(link('/app?view=members'), `/app?view=members&org=${B}`);
		assert.equal(link(`/app?org=${A}`), `/app?org=${A}`, 'an explicit company is kept');
		assert.equal(link('/login?rd=%2Fapp'), '/login?rd=%2Fapp', 'only workspace links');
	} finally {
		done();
	}
});

test('the remembered company is kept per account, and only as a valid ID', () => {
	const storage = memoryStorage();
	rememberCompany('7', B, storage);
	rememberCompany('8', 'default', storage);
	rememberCompany('9', 'not-a-company', storage);
	rememberCompany('', B, storage);
	assert.equal(rememberedCompany('7', storage), B);
	assert.equal(rememberedCompany('8', storage), 'default');
	assert.equal(rememberedCompany('9', storage), null);
	assert.equal(rememberedCompany('', storage), null);
	assert.deepEqual([...storage.values.values()].sort(), [B, 'default'].sort(), 'nothing but company IDs');
	storage.values.set('orca.company.7', '<script>');
	assert.equal(rememberedCompany('7', storage), null);
	const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
	assert.equal(rememberedCompany('7', broken), null);
	assert.doesNotThrow(() => rememberCompany('7', B, broken));
});

test('a switch waits for saves in flight and does nothing for this page\'s company', () => {
	const done = onPage(B, [choice('default'), choice(B)]);
	try {
		assert.equal(companySwitch(B, 0), 'stay');
		assert.equal(companySwitch('default', 1), 'wait');
		assert.equal(companySwitch('default', 0), 'go');
	} finally {
		done();
	}
});

test('an accepted invitation opens its company\'s page, and nothing else', () => {
	assert.equal(invitationReturnPath({ returnTo: `/app?org=${B}` }), `/app?org=${B}`);
	assert.equal(invitationReturnPath({ returnTo: '/app?org=default' }), '/app?org=default');
	for (const returnTo of ['https://evil.example/app?org=default', '//evil.example/app?org=default', '/app?org=nope', `/app?org=${B}&next=/x`, '/login', '']) {
		assert.equal(invitationReturnPath({ returnTo }), '/app', returnTo);
	}
	assert.equal(invitationReturnPath(undefined), '/app');
});

test('only a server without the list opens "default"; any other failure opens nothing', async () => {
	const missing = (error) => error.status === 404;
	const fail = (status) => async () => { throw Object.assign(new Error(`${status}`), { status }); };
	// An older server: no list, so "default" as before companies.
	assert.deepEqual(await resolvePlace(fail(404), missing, null, B), { kind: 'company', id: 'default' });
	// Unavailable, refused or offline: no company is picked, not even the remembered one.
	for (const status of [401, 403, 500, 503]) {
		assert.deepEqual(await resolvePlace(fail(status), missing, null, B), { kind: 'error' }, String(status));
	}
	assert.deepEqual(await resolvePlace(async () => { throw new TypeError('Failed to fetch'); }, missing, null, B), { kind: 'error' });
	assert.deepEqual(await resolvePlace(fail(503), missing, B, null), { kind: 'error' }, 'even an explicit company waits for the list');
	// A list: the usual precedence.
	assert.deepEqual(await resolvePlace(async () => [choice('default'), choice(B)], missing, null, B), { kind: 'company', id: B, companies: [choice('default'), choice(B)] });
});

test('an address naming another company opens it afresh, but a failed list never reloads by itself', () => {
	const inB = { kind: 'company', id: B, companies: [choice(B)] };
	assert.equal(reloadForAddress(inB, B), false);
	assert.equal(reloadForAddress(inB, 'default'), true);
	assert.equal(reloadForAddress(inB, null), false);
	assert.equal(reloadForAddress(inB, 'not-a-company'), false);
	// The chooser and the no-company page have no company: any company counts.
	assert.equal(reloadForAddress({ kind: 'choose', companies: [choice('default'), choice(B)] }, B), true);
	assert.equal(reloadForAddress({ kind: 'none' }, 'default'), true);
	// The list failed with org=B in the address: reloading would fail again, forever.
	assert.equal(reloadForAddress({ kind: 'error' }, B), false);
	assert.equal(reloadForAddress({ kind: 'error' }, 'default'), false);
});
