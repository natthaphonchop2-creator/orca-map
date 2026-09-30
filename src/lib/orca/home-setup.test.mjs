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
	assert.match(page, /const ai = \$derived\(homeAIState\(aiConnection, aiChecked, companyLink\)\);/);
	assert.match(page, /const companyLink = \$derived\(connectAccess\(data\)\.usable\.length > 0\);/);
	assert.doesNotMatch(page, /setAIConnection|MyAIAppsService/, 'Home never sets the pin on its own rules');
	assert.equal(home.aiState, undefined);
	assert.equal(home.activeAISession, undefined);
});

test('the unused-apps alert counts what ตรวจสอบ\'s ไม่ได้ใช้เกิน 30 วัน chip counts', () => {
	const days = (n) => new Date(NOW - n * 86_400_000).toISOString();
	const inventory = {
		sessions: [
			{ id: 's1', app: 'Claude', userID: 'a', createdAt: days(90), lastRefreshedAt: days(31), expiresAt: days(-10) },
			{ id: 's2', app: 'ChatGPT', userID: 'b', createdAt: days(90), lastRefreshedAt: days(2), expiresAt: days(-10) }
		],
		keys: [
			{ id: 1, name: 'n8n', userID: 'a', hubID: '', createdAt: days(40) },
			{ id: 2, name: 'script', userID: 'b', hubID: 'h', createdAt: days(60), lastUsedAt: days(1) }
		]
	};
	assert.equal(home.staleAIApps(inventory, NOW), 2, 'a sign-in not renewed for 31 days and a key never used in 40');
	assert.equal(home.staleAIApps(undefined, NOW), 0);
	assert.equal(home.staleAIApps({ sessions: [], keys: [] }, NOW), 0);
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
	// B1 says no sign-in now, though the person asked before (their sign-in expired or an admin
	// disconnected it): Home must not say their AI works; the step is open again.
	list = home.ownerChecklist(ready, 'none', true);
	assert.equal(list.complete, false);
	assert.equal(list.incomplete, true);
	assert.equal(list.current, 'ai');
	assert.equal(home.employeeChecklist('none', ['signed-in'], true).steps[0].done, false);
	assert.equal(home.employeeChecklist('none', ['signed-in'], true).current, 'ai');
});

test('an AI sign-in that lapsed after setup keeps Home in status mode, with one line to reconnect', () => {
	const th = (thai) => thai;
	const ready = company({ connections: [connection('conn-flow')], hubs: [hub('h')] });
	// Steps 1, 2 and 4 are done (a ready program, an active workspace I use, my own first
	// question) and B1 says no AI now: my sign-in expired or was disconnected.
	let list = home.ownerChecklist(ready, 'none', true);
	assert.equal(list.incomplete, true, 'the checklist still knows step 3 is open');
	assert.equal(home.aiLapsed(list, 'none'), true);
	assert.equal(home.homeMode(list, false, true, true), 'status', 'not the setup checklist again');
	assert.equal(home.homeMode(list, false, false, true), 'loading', 'nothing flashes while the rest loads');
	assert.equal(home.homeMode(list, false, true), 'setup', 'without the rule, as before');
	// The pill counts it as one thing to look at, for any role: it is the viewer's own.
	assert.deepEqual(home.homeBadge('status', true, 0, th, true), { label: 'ต้องดูแล 1 เรื่อง', tone: 'warn' });
	assert.deepEqual(home.homeBadge('status', true, 2, th, true), { label: 'ต้องดูแล 3 เรื่อง', tone: 'warn' });
	assert.deepEqual(home.homeBadge('status', false, 2, th, true), { label: 'ต้องดูแล 1 เรื่อง', tone: 'warn' });
	assert.deepEqual(home.homeBadge('status', false, 0, th), { label: 'พร้อมใช้งาน', tone: 'ok' });

	// Anything else undone, or not proven, is still setup.
	const cases = [
		['never asked', home.ownerChecklist(ready, 'none', false), 'none'],
		['my question unknown (history failed, or a full window)', home.ownerChecklist(ready, 'none', undefined), 'none'],
		['no ready program now', home.ownerChecklist(company({ connections: [connection('conn-flow', { enabled: false })], hubs: [hub('h')] }), 'none', true), 'none'],
		['no active workspace I use', home.ownerChecklist(company({ connections: [connection('conn-flow')], hubs: [hub('h', { status: 'archived' })] }), 'none', true), 'none'],
		['not in the workspace any more', home.ownerChecklist(company({ connections: [connection('conn-flow')], hubs: [hub('h', { memberIDs: ['other'], effectiveMemberIDs: ['other'] })] }), 'none', true), 'none'],
		['an employee who must sign in to a program too', home.employeeChecklist('none', ['signed-in', 'needed'], true), 'none'],
		['an employee who never asked', home.employeeChecklist('none', ['signed-in'], false), 'none']
	];
	for (const [label, checklist, ai] of cases) {
		assert.equal(home.aiLapsed(checklist, ai), false, label);
		assert.equal(home.homeMode(checklist, false, true, home.aiLapsed(checklist, ai)), 'setup', label);
	}
	// Connected, or B1 unknown (an older server: asking proves the AI): nothing lapsed, setup is complete.
	for (const ai of ['connected', 'unknown']) {
		list = home.ownerChecklist(ready, ai, true);
		assert.equal(home.aiLapsed(list, ai), false, ai);
		assert.equal(list.complete, true, ai);
		assert.equal(home.homeMode(list, false, true, false), 'status', ai);
	}
	// An employee: the program sign-ins done, or not known (unknown alone never nags).
	assert.equal(home.aiLapsed(home.employeeChecklist('none', ['signed-in'], true), 'none'), true);
	assert.equal(home.aiLapsed(home.employeeChecklist('none', ['waiting'], true), 'none'), true);
	assert.equal(home.aiLapsed(home.employeeChecklist('none', ['unknown'], true), 'none'), true);
	// An employee with no usable workspace asks for access first, whatever else.
	assert.equal(home.homeMode(home.employeeChecklist('none', ['signed-in'], true), true, true, true), 'setup');
});

test('after the viewer\'s own disconnect, an earlier question never ticks "เชื่อม AI" again (Codex release review 70)', () => {
	const th = (thai) => thai;
	const ready = company({ connections: [connection('conn-flow')], hubs: [hub('h')] });
	// Home's state from the shared store: B1's answer once Home's own read is back.
	assert.equal(home.homeAIState({ state: 'connected' }, false), 'unknown', 'before Home\'s read: not known');
	assert.equal(home.homeAIState({ state: 'connected' }, true), 'connected');
	assert.equal(home.homeAIState({ state: 'unknown' }, true), 'unknown', 'an older server: the first question still proves it');
	// I disconnected one of my own AI apps on this page (ตรวจสอบ or เชื่อม AI ของฉัน).
	assert.equal(home.homeAIState({ state: 'unknown', disconnected: true }, true), 'revoked', 'the read after it failed: only B1 can say what is left');
	assert.equal(home.homeAIState({ state: 'unknown', disconnected: true }, false), 'revoked');
	assert.equal(home.homeAIState({ state: 'connected', disconnected: true }, false), 'revoked', 'never an older state before Home\'s own read');
	assert.equal(home.homeAIState({ state: 'none', disconnected: true }, true), 'none', 'B1 answered after it');
	assert.equal(home.homeAIState({ state: 'connected', disconnected: true }, true), 'connected', 'another AI app is still connected');

	// My question from before the disconnect is still in the history: it proves nothing now.
	let list = home.ownerChecklist(ready, 'revoked', true);
	assert.deepEqual(list.steps.map((step) => step.done), [true, true, undefined, true]);
	assert.equal(list.steps.find((step) => step.id === 'ai').state, 'current', '"เชื่อม AI" is not ticked');
	assert.equal(list.complete, false, 'no "ตั้งค่าเสร็จแล้ว"');
	assert.equal(list.incomplete, false, 'not "not connected" either: that is not known');
	assert.equal(home.employeeChecklist('revoked', ['signed-in'], true).steps[0].done, undefined);
	assert.equal(home.employeeChecklist('revoked', ['signed-in'], true).complete, false);
	// Setup was done before: status mode with the banner, one thing to look at.
	assert.equal(home.aiLapsed(list, 'revoked'), true);
	assert.equal(home.homeMode(list, false, true, true), 'status');
	assert.deepEqual(home.homeBadge('status', true, 0, th, true), { label: 'ต้องดูแล 1 เรื่อง', tone: 'warn' });
	assert.equal(home.aiLapsed(home.employeeChecklist('revoked', ['signed-in'], true), 'revoked'), true);
	// Setup not done yet: the checklist, with "เชื่อม AI" open.
	list = home.ownerChecklist(ready, 'revoked', false);
	assert.equal(home.aiLapsed(list, 'revoked'), false);
	assert.equal(home.homeMode(list, false, true, false), 'setup');
	assert.equal(list.current, 'ai');
	// Once B1 answers, it decides as before.
	assert.equal(home.ownerChecklist(ready, 'connected', true).complete, true);
	assert.equal(home.aiLapsed(home.ownerChecklist(ready, 'none', true), 'none'), true);
	// The old-server fallback is separate: on a page where nothing was disconnected, asking proves it.
	assert.equal(home.ownerChecklist(ready, 'unknown', true).complete, true);
	assert.equal(home.aiLapsed(home.ownerChecklist(ready, 'unknown', true), 'unknown'), false);
});

test('an AI connected only through workspaces\' own links never ticks "เชื่อม AI" for the company link (B3 follow-up)', () => {
	const ready = company({ connections: [connection('conn-flow')], hubs: [hub('h')] });
	const limited = { state: 'connected', app: 'Claude', only: [{ id: 'h-own', name: 'ฝ่ายขาย' }] };
	assert.equal(home.homeAIState(limited, true), 'limited', 'the company link has workspaces for me');
	assert.equal(home.homeAIState(limited, true, true), 'limited');
	assert.equal(home.homeAIState(limited, true, false), 'connected', 'every workspace of mine has its own sign-in: those links are mine');
	assert.equal(home.homeAIState(limited, false), 'unknown', 'before Home\'s own read');
	assert.equal(home.homeAIState({ state: 'connected', app: 'Claude', only: [] }, true), 'connected');
	assert.equal(home.homeAIState({ ...limited, disconnected: true }, true), 'limited');
	let list = home.ownerChecklist(ready, 'limited', true);
	assert.deepEqual(list.steps.map((step) => step.done), [true, true, false, true]);
	assert.equal(list.complete, false, 'no "ตั้งค่าเสร็จแล้ว"');
	assert.equal(home.aiLapsed(list, 'limited'), true, 'after setup: status mode with the banner');
	assert.equal(home.homeMode(list, false, true, true), 'status');
	list = home.ownerChecklist(ready, 'limited', false);
	assert.equal(list.current, 'ai');
	assert.equal(home.homeMode(list, false, true, home.aiLapsed(list, 'limited')), 'setup');
	assert.equal(home.employeeChecklist('limited', ['signed-in'], true).steps[0].done, false);
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
	// The company is always named, "default" too, so the admin opens the one the message is about (Codex release review 67).
	assert.equal(home.workspacesLink('https://orca.example.test', 'default'), 'https://orca.example.test/app?view=workspaces&org=default');
	assert.equal(home.workspacesLink('https://orca.example.test', ''), 'https://orca.example.test/app?view=workspaces&org=default');
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
