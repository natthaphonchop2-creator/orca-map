import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const home = await importTypeScript(new URL('./home-setup.ts', import.meta.url));
const NOW = Date.parse('2026-09-28T10:30:00+07:00');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

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

test('what AI can do in a program follows the one approval rule (program-tools\' toolChangesData)', async () => {
	const { toolChangesData } = await importTypeScript(new URL('./program-tools.ts', import.meta.url));
	assert.equal(toolChangesData(tool('a', { readOnlyHint: true })), false);
	assert.equal(toolChangesData(tool('b', { readOnlyHint: true, destructiveHint: true })), true);
	assert.equal(toolChangesData(tool('c', { readOnlyHint: false })), true);
	assert.equal(toolChangesData(tool('d')), true, 'an unannotated tool may change data');
	// As on the server, only the reviewed definition counts: hints on the tool itself are not read.
	assert.equal(toolChangesData({ name: 'e', inputSchema: {}, annotations: { readOnlyHint: true } }), true);
	const abilities = home.programAbilities({ toolNames: ['list_invoices', 'create_invoice', 'gone'], tools: connection('conn-flow').tools });
	assert.deepEqual(abilities, { total: 3, read: 1, change: 2 }, 'a tool missing from the list may change data');
	assert.equal(home.toolChangesData, undefined, 'no second copy of the rule here');
});

test('Home\'s "เชื่อม AI ของฉัน" step reads the pinned button\'s store, fed by the one B1 client', async () => {
	const page = await readFile(new URL('../components/orca/WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.match(page, /import \{ aiConnection \} from '\$lib\/orca\/ai-connection\.svelte'/);
	assert.match(page, /import \{ refreshAIConnection \} from '\$lib\/services\/orca-ai-apps'/);
	assert.match(page, /aiChecked \? aiConnection\.state : 'unknown'/);
	assert.doesNotMatch(page, /setAIConnection|MyAIAppsService/, 'Home never sets the pin on its own rules');
	assert.equal(home.aiState, undefined);
	assert.equal(home.activeAISession, undefined);
});

test('the first question counts only the viewer\'s own tool calls', () => {
	assert.equal(home.askedAI([call('someone-else')], 'me'), false);
	assert.equal(home.askedAI([call('me', { action: 'hub.update' })], 'me'), false, 'a settings change is not a question');
	assert.equal(home.askedAI([call('me')], 'me'), true);
	assert.equal(home.askedAI([call('me', { action: undefined, method: 'tools/call' })], 'me'), true);
	assert.equal(home.askedAI([call('')], ''), false);
	// A manager's history is everyone's newest 200 events. When it is full, my
	// older call may have dropped out: not finding it proves nothing.
	assert.equal(home.AUDIT_WINDOW, 200);
	const busy = Array.from({ length: home.AUDIT_WINDOW }, (_, i) => call('someone-else', { id: `e${i}` }));
	assert.equal(home.askedAI(busy, 'me', true), undefined);
	assert.equal(home.askedAI([...busy, call('me')], 'me', true), true);
	assert.equal(home.askedAI([call('someone-else')], 'me', false), false);
	// So a busy company whose owner asked long ago stays out of setup mode.
	const ready = company({ connections: [connection('conn-flow')], hubs: [hub('h')] });
	const list = home.ownerChecklist(ready, 'unknown', home.askedAI(busy, 'me', true));
	assert.equal(list.incomplete, false);
	assert.equal(home.homeMode(list, false, true), 'status');
});

test('only active members count as people who can use ORCA', () => {
	const people = [{ id: 'a' }, { id: 'b', status: 'active' }, { id: 'c', status: 'suspended' }, { id: 'd', status: 'removed' }];
	assert.deepEqual(home.activeMembers(people).map((person) => person.id), ['a', 'b']);
});

test('Home\'s mode and title pill: setup, loading, then status; never "ready" while setup is unfinished', () => {
	const th = (thai) => thai;
	const unfinished = { incomplete: true };
	const known = { incomplete: false };
	assert.equal(home.homeMode(unfinished, false, false), 'setup', 'a step known undone shows the checklist at once');
	assert.equal(home.homeMode(known, true, true), 'setup', 'an employee with no usable workspace asks for access');
	assert.equal(home.homeMode(known, false, false), 'loading', 'nothing flashes while the rest loads');
	assert.equal(home.homeMode(known, false, true), 'status');
	assert.deepEqual(home.homeBadge('setup', true, 0, th), { label: 'ยังตั้งค่าไม่เสร็จ', tone: 'warn' });
	assert.equal(home.homeBadge('loading', true, 3, th), undefined);
	assert.deepEqual(home.homeBadge('status', true, 2, th), { label: 'ต้องดูแล 2 เรื่อง', tone: 'warn' });
	assert.deepEqual(home.homeBadge('status', true, 0, th), { label: 'พร้อมใช้งาน', tone: 'ok' });
	assert.deepEqual(home.homeBadge('status', false, 2, th), { label: 'พร้อมใช้งาน', tone: 'ok' }, 'company alerts are for managers');
	for (const mode of ['setup', 'loading', 'status'])
		for (const attention of [0, 1]) assert.notEqual(home.homeBadge(mode, true, attention, th)?.label, 'ระบบพร้อมใช้งาน');
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
	assert.equal(list.steps[1].done, true, 'a workspace an admin has not opened yet does not hold the employee back');
	list = home.employeeChecklist('connected', ['needed', 'waiting'], false);
	assert.equal(list.steps[1].done, false);
	list = home.employeeChecklist('connected', ['waiting'], false);
	assert.equal(list.steps[1].done, undefined, 'nothing usable yet: not known');
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
	// The company gate: someone with no company asks for an invite link, with their email when known.
	assert.equal(home.inviteRequestText(' new.person@example.com ', en), "Could you send me an invite link to our company's ORCA? My email is new.person@example.com.");
	assert.equal(home.inviteRequestText('new.person@example.com', th), 'รบกวนส่งลิงก์เชิญเข้า ORCA ของบริษัทให้หน่อย ใช้อีเมล new.person@example.com');
	assert.equal(home.inviteRequestText('', th), 'รบกวนส่งลิงก์เชิญเข้า ORCA ของบริษัทให้หน่อย');
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
