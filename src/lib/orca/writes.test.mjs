import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const writes = await importTypeScript(new URL('../services/writes.ts', import.meta.url));
const { counted, guardPage, orcaAccountChanged, orcaAccountHeaders, reloadForAccount, writesInFlight } = writes;

function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

test('a write counts until it has finished, response body and all', async () => {
	const body = deferred();
	const write = counted(async () => {
		await Promise.resolve(); // the headers arrive
		return body.promise; // the body is still being read
	});
	await Promise.resolve();
	assert.equal(writesInFlight(), 1, 'still counted while the body is read');
	body.resolve('created key');
	assert.equal(await write, 'created key');
	assert.equal(writesInFlight(), 0);
	await assert.rejects(counted(async () => { throw new Error('refused'); }), /refused/);
	assert.equal(writesInFlight(), 0, 'a failed write stops counting too');
});

test('ORCA requests name the page\'s account; others and signed-out pages don\'t', () => {
	assert.deepEqual(orcaAccountHeaders('/orca/keys', '7'), { 'X-Orca-Account': '7' });
	assert.deepEqual(orcaAccountHeaders('/orca/orgs/org-x/bootstrap', '7'), { 'X-Orca-Account': '7' });
	assert.deepEqual(orcaAccountHeaders('/me', '7'), {});
	assert.deepEqual(orcaAccountHeaders('/local-auth/users', '7'), {});
	assert.deepEqual(orcaAccountHeaders('/orca/keys', undefined), {});
	assert.deepEqual(orcaAccountHeaders('/orca/keys', ''), {});
});

test('only the server\'s account refusal counts as an account change', () => {
	assert.equal(orcaAccountChanged(412, '{"error":"orca_account_changed"}'), true);
	assert.equal(orcaAccountChanged(412, 'MCP server requires authentication'), false);
	assert.equal(orcaAccountChanged(409, 'orca_account_changed'), false);
});

test('an account change reloads the page at most once in ten seconds', () => {
	const values = new Map();
	const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
	let reloads = 0;
	const reload = () => reloads++;
	assert.equal(reloadForAccount(reload, storage, 100_000), true);
	assert.equal(reloadForAccount(reload, storage, 105_000), false, 'no reload loop');
	assert.equal(reloads, 1);
	assert.equal(reloadForAccount(reload, storage, 111_000), true);
	assert.equal(reloads, 2);
	// Without storage it still reloads, once per call.
	const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
	assert.equal(reloadForAccount(reload, broken, 0), true);
	assert.equal(reloadForAccount(reload, undefined, 0), true);
	assert.equal(reloads, 4);
});

test('a page restored from the back-forward cache opens afresh, and leaving mid-save asks first', () => {
	const listeners = new Map();
	const target = {
		addEventListener: (name, listener) => listeners.set(name, listener),
		removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
	};
	let reloads = 0;
	let inFlight = 0;
	const stop = guardPage(target, () => reloads++, () => inFlight);
	listeners.get('pageshow')({ persisted: false });
	assert.equal(reloads, 0, 'an ordinary load');
	listeners.get('pageshow')({ persisted: true });
	assert.equal(reloads, 1, 'restored from the cache: a new page');
	const leave = () => {
		let prevented = false;
		listeners.get('beforeunload')({ preventDefault: () => { prevented = true; } });
		return prevented;
	};
	assert.equal(leave(), false, 'nothing saving: leave freely');
	inFlight = 1;
	assert.equal(leave(), true, 'a save in flight: the browser asks');
	stop();
	assert.equal(listeners.size, 0);
});
