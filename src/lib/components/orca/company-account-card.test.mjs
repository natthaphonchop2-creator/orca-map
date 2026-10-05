import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// Company accounts (บัญชีกลาง), design §7: the program page's card for
// managers, and the program page around it.
const helpers = await importTypeScript(new URL('../../orca/company-account.ts', import.meta.url));
const glossary = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const navigation = await importTypeScript(new URL('../../orca/navigation.ts', import.meta.url));
const tools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
const catalogHelpers = await importTypeScript(new URL('../../orca/program-catalog.ts', import.meta.url));
const catalog = await importTypeScript(new URL('../../orca/catalog.ts', import.meta.url));
const gatewaySources = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const activation = await importTypeScript(new URL('../../orca/activation.ts', import.meta.url));
const th = (thai) => thai;
const text = (html) => html.replace(/<!--[^>]*-->/g, '').replace(/\s+/g, ' ');
const spy = (calls, name) => (renderer, props) => {
	calls.push({ name, props });
	props?.children?.(renderer);
};
const connection = (extra = {}) => ({ id: 'c1', name: 'FlowAccount', description: '', mcpID: 'src-books', toolNames: ['read'], tools: [{ name: 'read', inputSchema: {} }], scopeNote: '', reviewedReadOnly: true, reviewedTools: true, enabled: true, version: 3, createdAt: '', updatedAt: '', ...extra });
const account = (extra = {}) => ({ id: 'pac-1', sourceID: 'src-books', label: 'บัญชีกลาง FlowAccount', status: 'ready', generation: 2, acknowledgedRevision: 1, staged: false, connectedBy: '7', connectedAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', updatedAt: '', ...extra });

async function card() {
	const calls = [];
	const { warnings, Component } = await serverComponent(new URL('./programs/CompanyAccountCard.svelte', import.meta.url), {
		...helpers, t: th, untrack: (fn) => fn(), onMount: () => {}, onDestroy: () => {},
		OrcaService: {}, ProgramService: {}, programSaveError: () => '', orcaError: () => '', displayDate: () => '2 ต.ค. 2569', safeSignInURL: (url) => url, showToast: () => {},
		StatusPill: spy(calls, 'StatusPill'), ConfirmDialog: spy(calls, 'ConfirmDialog')
	});
	assert.deepEqual(warnings, []);
	const show = (props) => {
		calls.length = 0;
		return text(render(Component, { props: { programName: 'FlowAccount', members: [{ id: '7', displayName: 'คุณเอ', email: 'a@example.invalid' }], onchanged: async () => {}, ...props } }).body);
	};
	return { calls, show };
}

test('each person\'s own account: a manager may turn on a company account unless the program allows personal accounts only', async () => {
	const { show } = await card();
	const personal = show({ connection: connection(), initial: { accounts: [], policy: { mode: 'warn', revision: 1 } } });
	assert.match(personal, /แต่ละคนใช้บัญชี FlowAccount ของตัวเอง/);
	assert.match(personal, />ใช้บัญชีกลาง</);
	const personalOnly = show({ connection: connection(), initial: { accounts: [], policy: { mode: 'personal_only', revision: 1 } } });
	assert.match(personalOnly, /ให้ใช้ได้เฉพาะบัญชีของแต่ละคน/);
	assert.doesNotMatch(personalOnly, />ใช้บัญชีกลาง</);
});

test('a company account in use: its name, who connected it, its state, and Replace, Check, Disconnect and back to personal accounts', async () => {
	const { calls, show } = await card();
	const html = show({ connection: connection({ programAccountID: 'pac-1' }), initial: { accounts: [account()], policy: { mode: 'warn', revision: 1 } } });
	assert.match(html, /ทุกคนใช้บัญชีกลาง FlowAccount บัญชีเดียว/);
	assert.match(html, /บัญชีกลาง FlowAccount/);
	assert.match(html, /คุณเอ · 2 ต.ค. 2569/);
	assert.equal(calls.find((call) => call.name === 'StatusPill')?.props.label, 'พร้อมใช้');
	for (const action of ['เปลี่ยนบัญชีหรือคีย์', 'ตรวจการเชื่อมต่อ', 'ตัดการเชื่อมต่อ', 'ให้แต่ละคนใช้บัญชีของตัวเอง']) assert.match(html, new RegExp(`>${action}<`), action);
	assert.doesNotMatch(html, /ms1orca|pac-1/, 'never its record or ID');
	assert.equal(calls.filter((call) => call.name === 'ConfirmDialog').length, 2);
});

test('a policy that changed asks the manager to accept it before connecting again', async () => {
	const { show } = await card();
	const html = show({
		connection: connection({ programAccountID: 'pac-1' }),
		initial: { accounts: [account({ status: 'needs_reconnect', pausedReason: 'policy_changed' })], policy: { mode: 'warn', revision: 2 } }
	});
	assert.match(html, /ต้องยอมรับเงื่อนไขใหม่แล้วเชื่อมใหม่/);
	assert.match(html, /type="checkbox"/);
	assert.match(html, /<button[^>]*disabled[^>]*>เชื่อมใหม่</, 'not before the manager accepts');
	assert.doesNotMatch(html, />ตรวจการเชื่อมต่อ</, 'nothing to check while paused');
	const accepted = show({ connection: connection({ programAccountID: 'pac-1' }), initial: { accounts: [account({ status: 'needs_reconnect', pausedReason: 'connector_lost_manager' })], policy: { mode: 'warn', revision: 1 } } });
	assert.doesNotMatch(accepted, /type="checkbox"/, 'the same revision needs no new acceptance');
	assert.match(accepted, /ไม่ได้เป็นผู้ดูแลแล้ว/);
});

test('the program page on a company account: the card, no "your account" card and no signed-in people tab', async () => {
	const calls = [];
	const deps = {
		t: th, localeHref: (href) => href, orcaLocale: { value: 'th' }, ...glossary, ...navigation, ...tools, ...catalogHelpers, ...catalog, ...gatewaySources, ...activation,
		page: { url: new URL('https://orca.invalid/app?view=servers&connection=c1') }, goto: async () => {},
		OrcaService: {}, ProgramService: {}, displayDate: () => '', orcaError: () => '', statusLabels: {}, showToast: () => {},
		StatusPill: () => {}, ConfirmDialog: () => {}, LifecycleActions: () => {}, ProgramToolsTab: () => {}, ConnectionMembers: () => {}, ProgramLogo: () => {},
		ProgramAccount: spy(calls, 'ProgramAccount'), CompanyAccountCard: spy(calls, 'CompanyAccountCard')
	};
	const { warnings, Component } = await serverComponent(new URL('./programs/ProgramDetail.svelte', import.meta.url), deps);
	assert.deepEqual(warnings, []);
	const page = (extra) => text(render(Component, { props: { data: { canManage: true, platformOperator: false, connections: [connection(extra)], hubs: [], members: [] }, connectionID: 'c1', onchanged: async () => {} } }).body);
	const company = page({ programAccountID: 'pac-1' });
	assert.equal(calls.filter((call) => call.name === 'CompanyAccountCard').length, 1);
	assert.equal(calls.filter((call) => call.name === 'ProgramAccount').length, 0);
	assert.doesNotMatch(company, /tab=members"/);
	assert.doesNotMatch(company, /บัญชีของคุณ/);
	calls.length = 0;
	const personal = page({});
	assert.equal(calls.filter((call) => call.name === 'ProgramAccount').length, 1);
	assert.match(personal, /tab=members"/);
});
