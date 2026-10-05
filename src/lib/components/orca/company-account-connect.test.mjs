import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// Company accounts (บัญชีกลาง), design §7: เพิ่มโปรแกรม's step 2 when the
// manager chooses one company account for the program.
const helpers = await importTypeScript(new URL('../../orca/company-account.ts', import.meta.url));
const th = (thai) => thai;
const text = (html) => html.replace(/<!--[^>]*-->/g, '').replace(/\s+/g, ' ');
const account = (extra = {}) => ({ id: 'pac-1', sourceID: 'src-books', label: 'บัญชีกลาง FlowAccount', status: 'ready', generation: 2, acknowledgedRevision: 1, staged: false, connectedBy: '7', connectedAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', updatedAt: '', ...extra });

async function connect() {
	const { warnings, Component } = await serverComponent(new URL('./programs/CompanyAccountConnect.svelte', import.meta.url), {
		...helpers, t: th, untrack: (fn) => fn(), onMount: () => {}, onDestroy: () => {},
		OrcaService: {}, programSaveError: () => '', orcaError: () => '', parseErrorContent: () => ({}), safeSignInURL: (url) => url
	});
	assert.deepEqual(warnings, []);
	return (props) => text(render(Component, { props: { sourceID: 'src-books', programName: 'FlowAccount', onready: () => {}, ...props } }).body);
}

test('a program with no company account yet: a name for the new one, and the policy\'s warning to accept first', async () => {
	const show = await connect();
	const html = show({ initial: { accounts: [], policy: { mode: 'warn', revision: 2 } } });
	assert.match(html, /ชื่อบัญชีกลาง/);
	assert.match(html, /value="บัญชีกลาง FlowAccount"/);
	assert.match(html, /เงื่อนไขของ FlowAccount อาจไม่อนุญาตให้หลายคนใช้บัญชีเดียว/);
	assert.match(html, /type="checkbox"/);
	assert.match(html, /<button[^>]*disabled[^>]*>ต่อไป</, 'not before the manager accepts');
	const allowed = show({ initial: { accounts: [], policy: { mode: 'allowed', revision: 1 } } });
	assert.doesNotMatch(allowed, /type="checkbox"/, 'an allowed program asks nothing');
});

test('a ready company account of the program is chosen first, and used as it is; never its ID', async () => {
	const show = await connect();
	const html = show({ initial: { accounts: [account(), account({ id: 'pac-9', sourceID: 'src-other', label: 'อีกโปรแกรม' })], policy: { mode: 'warn', revision: 1 } } });
	assert.match(html, /ใช้บัญชีกลางไหน/);
	assert.match(html, /บัญชีกลาง FlowAccount/);
	assert.doesNotMatch(html, /อีกโปรแกรม/, 'only this program\'s accounts');
	assert.match(html, /สร้างบัญชีกลางใหม่/);
	assert.match(html, />ใช้บัญชีนี้</);
	assert.doesNotMatch(html, /type="checkbox"/, 'its acknowledged revision still holds');
	assert.doesNotMatch(html, />pac-1</, 'never the record\'s ID as text');
	const moved = show({ initial: { accounts: [account()], policy: { mode: 'warn', revision: 3 } } });
	assert.match(moved, /type="checkbox"/, 'a policy that moved on is accepted again');
	assert.match(moved, />ต่อไป</);
});

test('a program that allows personal accounts only offers no company account', async () => {
	const show = await connect();
	const html = show({ initial: { accounts: [account()], policy: { mode: 'personal_only', revision: 1 } } });
	assert.match(html, /ให้ใช้ได้เฉพาะบัญชีของแต่ละคน/);
	assert.doesNotMatch(html, /ใช้บัญชีกลางไหน|<button/);
});

test('while the flow reads what AI can do, the step says so and offers nothing to press', async () => {
	const show = await connect();
	const html = show({ pending: 'กำลังดูว่า AI ทำอะไรได้บ้างใน FlowAccount…', initial: { accounts: [account()], policy: { mode: 'allowed', revision: 1 } } });
	assert.match(html, /กำลังดูว่า AI ทำอะไรได้บ้างใน FlowAccount…/);
	assert.doesNotMatch(html, /<button/);
});
