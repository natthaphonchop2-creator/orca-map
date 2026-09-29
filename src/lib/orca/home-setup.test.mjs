import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const home = await importTypeScript(new URL('./home-setup.ts', import.meta.url));
const NOW = Date.parse('2026-09-28T10:30:00+07:00');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const ahead = (days) => new Date(NOW + days * 86_400_000).toISOString();

const tool = (name, annotations) => ({ name, inputSchema: {}, ...(annotations === undefined ? {} : { definition: { annotations } }) });
const connection = (id, extra = {}) => ({
	id, name: id === 'conn-flow' ? 'FlowAccount' : id, description: '', mcpID: `default-orca-${id.replace('conn-', '')}`,
	tools: [tool('list_invoices', { readOnlyHint: true }), tool('create_invoice', { readOnlyHint: false })],
	toolNames: ['list_invoices', 'create_invoice'], scopeNote: '', reviewedReadOnly: false, reviewedTools: true,
	enabled: true, version: 1, createdAt: ago(100), updatedAt: ago(50), ...extra
});
const hub = (id, extra = {}) => ({
	id, name: id, description: '', connectionID: 'conn-flow', toolNames: ['list_invoices'],
	sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }], memberIDs: ['me'], unitIDs: [],
	effectiveMemberIDs: ['me'], dailyLimit: 100, status: 'active', version: 1, createdAt: ago(40), updatedAt: ago(30), connectURL: '', usedToday: 0, ...extra
});
const company = (extra = {}) => ({ currentUserID: 'me', connections: [], hubs: [], ...extra });
const call = (userID, extra = {}) => ({ id: `e-${userID}`, createdAt: ago(5), userID, hubID: 'h', action: 'tools.call', outcome: 'success', ...extra });

test('only a tool the provider marks read-only (and not destructive) counts as viewing data', () => {
	assert.equal(home.toolChangesData(tool('a', { readOnlyHint: true })), false);
	assert.equal(home.toolChangesData(tool('b', { readOnlyHint: true, destructiveHint: true })), true);
	assert.equal(home.toolChangesData(tool('c', { readOnlyHint: false })), true);
	assert.equal(home.toolChangesData(tool('d')), true, 'an unannotated tool may change data');
	assert.equal(home.toolChangesData(undefined), true, 'a tool missing from the list may change data');
	// Annotations on the tool itself (older shape) are read too.
	assert.equal(home.toolChangesData({ name: 'e', inputSchema: {}, annotations: { readOnlyHint: true } }), false);
	const abilities = home.programAbilities({ toolNames: ['list_invoices', 'create_invoice', 'gone'], tools: connection('conn-flow').tools });
	assert.deepEqual(abilities, { total: 3, read: 1, change: 2 });
});

test('B1: an unexpired sign-in means connected; nothing read means unknown', () => {
	const claude = { id: 's1', app: 'Claude Desktop', client: 'claude', createdAt: ago(60), lastRefreshedAt: ago(10), expiresAt: ahead(20) };
	const expired = { ...claude, id: 's2', client: 'chatgpt', expiresAt: ago(1) };
	assert.equal(home.aiState(undefined, NOW), 'unknown');
	assert.equal(home.aiState(null, NOW), 'unknown');
	assert.equal(home.aiState({ sessions: [], keys: [{ id: 1, name: 'k', hubID: '', createdAt: ago(1) }] }, NOW), 'none', 'a key is not an AI sign-in');
	assert.equal(home.aiState({ sessions: [expired], keys: [] }, NOW), 'none');
	assert.equal(home.aiState({ sessions: [expired, claude], keys: [] }, NOW), 'connected');
	assert.equal(home.aiAppName(home.activeAISession({ sessions: [claude], keys: [] }, NOW)), 'Claude');
	assert.equal(home.aiAppName({ client: 'chatgpt', app: 'x' }), 'ChatGPT');
	assert.equal(home.aiAppName({ client: 'other', app: ' Cursor ' }), 'Cursor');
	assert.equal(home.aiAppName(undefined), '');
});

test('the first question counts only the viewer\'s own tool calls', () => {
	assert.equal(home.askedAI([call('someone-else')], 'me'), false);
	assert.equal(home.askedAI([call('me', { action: 'hub.update' })], 'me'), false, 'a settings change is not a question');
	assert.equal(home.askedAI([call('me')], 'me'), true);
	assert.equal(home.askedAI([call('me', { action: undefined, method: 'tools/call' })], 'me'), true);
	assert.equal(home.askedAI([call('')], ''), false);
});

test('owner checklist: each step is done from data that exists, in order', () => {
	let list = home.ownerChecklist(company(), 'none', false);
	assert.deepEqual(list.steps.map((s) => [s.id, s.state]), [['program', 'current'], ['team', 'todo'], ['ai', 'todo'], ['ask', 'todo']]);
	assert.equal(list.doneCount, 0);
	assert.equal(list.remainingMinutes, 10);
	assert.equal(list.incomplete, true);

	// A saved but unreviewed program is not step 1.
	list = home.ownerChecklist(company({ connections: [connection('conn-flow', { reviewedTools: false })] }), 'none', false);
	assert.equal(list.current, 'program');

	// A ready program: step 2 is next, 6 minutes left.
	list = home.ownerChecklist(company({ connections: [connection('conn-flow')] }), 'none', false);
	assert.equal(list.current, 'team');
	assert.equal(list.remainingMinutes, 6);

	// A workspace I'm not in, or a draft, does not finish step 2.
	for (const hubs of [[hub('h', { effectiveMemberIDs: ['other'], memberIDs: ['other'] })], [hub('h', { status: 'draft' })]])
		assert.equal(home.ownerChecklist(company({ connections: [connection('conn-flow')], hubs }), 'none', false).current, 'team');

	const ready = company({ connections: [connection('conn-flow')], hubs: [hub('h')] });
	assert.equal(home.ownerChecklist(ready, 'none', false).current, 'ai');
	assert.equal(home.ownerChecklist(ready, 'connected', false).current, 'ask');
	list = home.ownerChecklist(ready, 'connected', true);
	assert.equal(list.complete, true);
	assert.equal(list.incomplete, false);
	assert.equal(list.doneCount, 4);
	assert.equal(list.current, undefined);
});

test('until B1 answers, connecting AI is merged with the first question', () => {
	const ready = company({ connections: [connection('conn-flow')], hubs: [hub('h')] });
	// Still loading: nothing is known about steps 3 and 4, so Home does not nag yet.
	let list = home.ownerChecklist(ready, 'unknown', undefined);
	assert.equal(list.incomplete, false);
	assert.equal(list.complete, false);
	// An older server without B1: asking proves the AI is connected.
	list = home.ownerChecklist(ready, 'unknown', false);
	assert.deepEqual(list.steps.map((s) => s.done), [true, true, false, false]);
	list = home.ownerChecklist(ready, 'unknown', true);
	assert.equal(list.complete, true);
	// B1 says no sign-in, but the person asked (their session since expired): both done.
	assert.equal(home.ownerChecklist(ready, 'none', true).complete, true);
});

test('employee checklist: AI, then a sign-in per program, then the first question', () => {
	let list = home.employeeChecklist('none', ['signed-in', 'needed'], false);
	assert.deepEqual(list.steps.map((s) => [s.id, s.state]), [['ai', 'current'], ['accounts', 'todo'], ['ask', 'todo']]);
	assert.equal(list.remainingMinutes, 7);
	list = home.employeeChecklist('connected', ['signed-in', 'needed'], false);
	assert.equal(list.current, 'accounts');
	list = home.employeeChecklist('connected', ['signed-in', 'waiting'], false);
	assert.equal(list.steps[1].done, false, 'a workspace an admin has not opened yet keeps step 2 open');
	list = home.employeeChecklist('connected', ['signed-in', 'checking'], true);
	assert.equal(list.steps[1].done, undefined, 'still checking is not known');
	assert.equal(list.incomplete, false);
	list = home.employeeChecklist('connected', ['signed-in', 'signed-in'], true);
	assert.equal(list.complete, true);
	assert.deepEqual(['account-connected', 'configured', 'account-needed', 'not-configured', 'unverified'].map(home.accountStateFrom), ['signed-in', 'signed-in', 'needed', 'needed', 'unknown']);
});

test('workspaces and programs the viewer can use', () => {
	const data = company({
		connections: [connection('conn-flow'), connection('conn-peak', { updatedAt: ago(1) }), connection('conn-off', { enabled: false })],
		hubs: [hub('mine'), hub('theirs', { effectiveMemberIDs: ['other'], memberIDs: ['other'] })]
	});
	assert.deepEqual(home.usableWorkspaces(data).map((h) => h.id), ['mine']);
	assert.deepEqual(home.workspacesWithoutMe(data).map((h) => h.id), ['theirs']);
	assert.deepEqual(home.askablePrograms(data).map((c) => c.id), ['conn-flow'], 'the programs of my workspaces first');
	assert.deepEqual(home.askablePrograms(company({ connections: data.connections })).map((c) => c.id), ['conn-flow', 'conn-peak'], 'else the company\'s ready ones');
	assert.equal(home.teamProgram(data).id, 'conn-peak', 'the one-click starts from a ready program no workspace uses yet');
	assert.equal(home.teamProgram(company({ connections: [connection('conn-flow')], hubs: [hub('h')] })).id, 'conn-flow');
	assert.equal(home.teamProgram(company()), undefined);
	const counts = home.attentionCounts(company({ connections: [connection('conn-flow'), connection('conn-new', { reviewedTools: false }), connection('conn-off', { enabled: false })], hubs: [hub('h', { sources: [{ connectionID: 'conn-off', toolNames: ['list_invoices'] }] })] }));
	assert.deepEqual(counts, { ready: 1, paused: 1, review: 1, blocked: 1, total: 3 });
});

test('copy: first names, a first question per program, and the access request', () => {
	const th = (thai) => thai;
	const en = (_thai, english) => english;
	assert.equal(home.firstName('วิภา ตัวอย่าง'), 'วิภา');
	assert.equal(home.firstName(''), '');
	assert.equal(home.firstName(undefined), '');
	assert.equal(home.firstPrompt({ name: 'FlowAccount', mcpID: 'default-orca-flowaccount' }, th), 'สรุปใบแจ้งหนี้ที่ค้างชำระจาก FlowAccount');
	assert.equal(home.firstPrompt({ name: 'Google Drive', mcpID: 'default-orca-managed-google-drive' }, en), 'Find the latest documents in Google Drive and summarize them');
	assert.equal(home.firstPrompt({ name: 'ระบบเดิม', mcpID: 'custom-x' }, th), 'ดูข้อมูลล่าสุดจาก ระบบเดิม แล้วสรุปให้หน่อย');
	assert.equal(home.workspacesLink('https://orca.example.test', 'default'), 'https://orca.example.test/app?view=workspaces');
	assert.equal(home.workspacesLink('https://orca.example.test', 'org-b'), 'https://orca.example.test/app?view=workspaces&org=org-b');
	const text = home.accessRequestText({ name: 'มาลี', email: 'mali@example.com', company: 'บริษัท ก', link: 'https://orca.example.test/app?view=workspaces' }, th);
	assert.match(text, /มาลี \(mali@example\.com\)/);
	assert.match(text, /บริษัท ก/);
	// A message that may go through LINE opens in the phone's own browser (critique 13).
	assert.match(text, /https:\/\/orca\.example\.test\/app\?view=workspaces&openExternalBrowser=1$/);
	assert.match(home.accessRequestText({ name: '', email: '', company: 'X', link: 'https://a.test/app' }, en), /^Please add me to/);
});

test('per-viewer flags survive a storage that throws', () => {
	const key = home.homeFlagKey('setup-dismissed', 'org-b', 'user-1');
	assert.equal(key, 'orca.home.setup-dismissed.org-b.user-1');
	assert.notEqual(home.homeFlagKey('setup-dismissed', 'default', 'user-1'), key, 'each company has its own flag');
	const store = new Map();
	const storage = () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
	assert.equal(home.readHomeFlag(storage, key), false);
	assert.equal(home.writeHomeFlag(storage, key), true);
	assert.equal(home.readHomeFlag(storage, key), true);
	const throwing = () => {
		throw new Error('SecurityError');
	};
	assert.equal(home.readHomeFlag(throwing, key), false);
	assert.equal(home.writeHomeFlag(throwing, key), false);
	const broken = () => ({ getItem: throwing, setItem: throwing });
	assert.equal(home.readHomeFlag(broken, key), false);
	assert.equal(home.writeHomeFlag(broken, key), false);
	assert.equal(home.readHomeFlag(() => undefined, key), false);
});
