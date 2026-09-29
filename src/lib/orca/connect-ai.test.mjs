import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importTypeScript } from './test-import.mjs';

const ai = await importTypeScript(new URL('./connect-ai.ts', import.meta.url));
const th = (thai) => thai;
const en = (_thai, english) => english;
const NOW = Date.parse('2026-09-28T10:30:00+07:00');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const ahead = (days) => new Date(NOW + days * 86_400_000).toISOString();

const connection = (id, name = id) => ({ id, name, mcpID: `src-${id}`, enabled: true, reviewedReadOnly: true, toolNames: ['read'], tools: [{ name: 'read' }] });
const hub = (id, extra = {}) => ({
	id, name: extra.name ?? id, status: 'active', connectionID: 'flow', toolNames: ['read'], sources: [{ connectionID: 'flow', toolNames: ['read'] }],
	memberIDs: ['me'], unitIDs: [], dailyLimit: 100, version: 3, ...extra
});
const session = (id, client, app, created = 5, extra = {}) => ({ id, client, app, createdAt: ago(created), lastRefreshedAt: ago(1), expiresAt: ahead(20), ...extra });

test('access counts ready workspaces the company link reaches, and those with their own sign-in apart', () => {
	const data = {
		currentUserID: 'me', canManage: false, connections: [connection('flow', 'FlowAccount')],
		hubs: [
			hub('b', { name: 'ฝ่ายขาย' }),
			hub('a', { name: 'ฝ่ายบัญชี' }),
			hub('sso', { userSourceID: 'us-1' }),
			hub('draft', { status: 'draft' }),
			hub('other', { memberIDs: ['someone'] }),
			hub('team', { memberIDs: [], effectiveMemberIDs: ['me'] }),
			hub('broken', { sources: [{ connectionID: 'missing', toolNames: ['read'] }] })
		]
	};
	const access = ai.connectAccess(data);
	assert.deepEqual(access.usable.map((item) => item.id), ['team', 'b', 'a'].sort((x, y) => data.hubs.find((h) => h.id === x).name.localeCompare(data.hubs.find((h) => h.id === y).name, 'th')));
	assert.deepEqual(access.ownSignIn.map((item) => item.id), ['sso']);
	assert.deepEqual(access.joinable, [], 'only managers are offered "add me"');
	const manager = ai.connectAccess({ ...data, canManage: true });
	assert.deepEqual(manager.joinable.map((item) => item.id), ['other'], 'never a workspace with its own sign-in, a draft or a broken one');
	assert.deepEqual(ai.connectAccess({ ...data, currentUserID: '' }), { usable: [], ownSignIn: [], joinable: [] });
});

test('with no reachable workspace, one fix: join, own link, finish a workspace, first program, first workspace or ask', () => {
	const flow = connection('flow', 'FlowAccount');
	const base = { currentUserID: 'me', canManage: true, connections: [flow] };
	const fix = (data) => ai.accessFix(data, ai.connectAccess(data));
	assert.equal(fix({ ...base, hubs: [hub('a')] }), null, 'nothing to fix');
	assert.equal(fix({ ...base, hubs: [hub('a', { memberIDs: ['x'] })] }), 'join');
	assert.equal(fix({ ...base, hubs: [hub('a', { memberIDs: ['x'] }), hub('sso', { userSourceID: 'us-1' })] }), 'join', 'joining beats the other link');
	assert.equal(fix({ ...base, hubs: [hub('sso', { userSourceID: 'us-1' })] }), 'own-sign-in');
	assert.equal(fix({ ...base, canManage: false, hubs: [hub('sso', { userSourceID: 'us-1' })] }), 'own-sign-in', 'an employee with access is never told they have none');
	assert.equal(fix({ ...base, canManage: false, hubs: [] }), 'request');
	assert.equal(fix({ ...base, canManage: false, hubs: [hub('a', { memberIDs: ['x'] })] }), 'request', 'employees are never offered "add me"');
	assert.equal(fix({ ...base, hubs: [hub('draft', { status: 'draft' })] }), 'fix-workspace', 'not "create the first" when one exists');
	assert.equal(fix({ ...base, hubs: [hub('old', { status: 'archived' })], connections: [] }), 'add-program');
	assert.equal(fix({ ...base, hubs: [], connections: [{ ...flow, enabled: false }] }), 'add-program', 'a program that is not ready does not count');
	assert.equal(fix({ ...base, hubs: [] }), 'create-workspace');
	assert.equal(ai.namesText(['ฝ่ายบัญชี'], th), 'ฝ่ายบัญชี');
	assert.equal(ai.namesText(['ฝ่ายบัญชี', ' ฝ่ายขาย '], th), 'ฝ่ายบัญชี และ ฝ่ายขาย');
	assert.equal(ai.namesText(['A', 'B', 'C', 'D'], en), 'A, B and 2 more');
	assert.equal(ai.namesText([], th), '');
});

test('program names for the example prompts come from the usable workspaces, once each', () => {
	const connections = [connection('flow', 'FlowAccount'), connection('drive', 'Google Drive')];
	const hubs = [hub('a'), hub('b', { sources: [{ connectionID: 'drive', toolNames: ['read'] }, { connectionID: 'flow', toolNames: ['read'] }] })];
	assert.deepEqual(ai.usableProgramNames(hubs, connections), ['FlowAccount', 'Google Drive']);
	assert.deepEqual(ai.examplePrompts(['FlowAccount', 'Google Drive'], th), ['ORCA มีอะไรให้ใช้บ้าง', 'สรุปข้อมูลล่าสุดใน FlowAccount ให้หน่อย', 'ใน Google Drive มีอะไรที่ฉันดูได้บ้าง']);
	assert.deepEqual(ai.examplePrompts([], en), ['What can I use in ORCA?']);
});

test('the chosen app defaults to Claude and survives storage that throws', () => {
	assert.equal(ai.rememberedApp(undefined), 'claude');
	assert.equal(ai.rememberedApp({ getItem: () => 'codex' }), 'codex');
	assert.equal(ai.rememberedApp({ getItem: () => 'nonsense' }), 'claude');
	assert.equal(ai.rememberedApp({ getItem: () => { throw new Error('blocked'); } }), 'claude');
	assert.equal(ai.appName('other', th), 'แอปอื่น');
	assert.equal(ai.appName('vscode', th), 'VS Code');
	assert.ok(ai.isChatApp('chatgpt') && !ai.isChatApp('codex'));
	assert.equal(ai.connectorName(''), 'ORCA');
	assert.equal(ai.connectorName(' บริษัท ตัวอย่าง '), 'ORCA · บริษัท ตัวอย่าง');
});

test('step 5 is connected by a live sign-in of the chosen app', () => {
	const apps = {
		sessions: [
			session('old', 'claude', 'Claude', 60 * 24 * 3),
			session('gpt', 'chatgpt', 'ChatGPT', 10),
			session('gone', 'claude', 'Claude', 1, { expiresAt: ago(1) }),
			session('cc', 'claude', 'Claude Code', 30),
			session('codex', 'other', 'Codex CLI', 20),
			session('mystery', 'other', 'my-mcp-client', 2)
		],
		keys: []
	};
	assert.equal(ai.connectedSession(apps, 'claude', NOW)?.id, 'old', 'the newest live claude.ai sign-in; the expired one and Claude Code are not it');
	assert.equal(ai.connectedSession(apps, 'chatgpt', NOW)?.id, 'gpt');
	assert.equal(ai.connectedSession(apps, 'codex', NOW)?.id, 'codex');
	assert.equal(ai.connectedSession(apps, 'claude-code', NOW)?.id, 'cc');
	const webOnly = { sessions: [session('web', 'claude', 'Claude', 1)], keys: [] };
	assert.equal(ai.connectedSession(webOnly, 'claude-code', NOW, NOW - 60 * 60_000), undefined, 'a claude.ai sign-in is not Claude Code');
	const codeOnly = { sessions: [session('code', 'claude', 'claude-code', 1)], keys: [] };
	assert.equal(ai.connectedSession(codeOnly, 'claude', NOW), undefined, 'a Claude Code sign-in never shows "เชื่อม Claude แล้ว"');
	assert.equal(ai.connectedSession(codeOnly, 'claude-code', NOW)?.id, 'code');
	assert.equal(ai.connectedSession(apps, 'cursor', NOW), undefined, 'an unknown older app is not Cursor');
	assert.equal(ai.connectedSession(apps, 'cursor', NOW, NOW - 5 * 60_000)?.id, 'mystery', 'a new unknown sign-in since the page opened counts for a developer tool');
	assert.equal(ai.connectedSession(apps, 'other', NOW)?.id, 'mystery', 'the newest sign-in of an app ORCA does not know');
	assert.equal(ai.connectedSession(undefined, 'claude', NOW), undefined);
	assert.deepEqual(ai.liveSessions(apps, NOW).map((item) => item.id), ['mystery', 'gpt', 'codex', 'cc', 'old']);
});

test('the pinned button: any live sign-in, else a key that has been used', () => {
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [session('a', 'chatgpt', 'ChatGPT connector')], keys: [] }, NOW), { state: 'connected', app: 'ChatGPT' });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [session('a', 'other', '  ')], keys: [] }, NOW, en), { state: 'connected', app: 'AI app' });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [], keys: [{ id: 1, name: 'n8n', hubID: '', createdAt: ago(9), lastUsedAt: ago(3) }] }, NOW), { state: 'connected' });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [], keys: [{ id: 1, name: 'unused', hubID: '', createdAt: ago(9) }] }, NOW), { state: 'none' });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [], keys: [{ id: 1, name: 'expired', hubID: '', createdAt: ago(9), lastUsedAt: ago(3), expiresAt: ago(1) }] }, NOW), { state: 'none' });
	assert.deepEqual(ai.aiConnectionFrom(undefined, NOW), { state: 'none' });
	assert.equal(ai.sessionLabel({ client: 'claude', app: 'claude-code' }, th), 'Claude Code');
	assert.equal(ai.sessionLabel({ client: 'other', app: 'Cursor' }, th), 'Cursor');
});

test('dates read as people say them, in Bangkok time', () => {
	assert.equal(ai.relativeWhen(ago(1), NOW, th), 'เมื่อสักครู่');
	assert.equal(ai.relativeWhen(ago(12), NOW, th), '12 นาทีที่แล้ว');
	assert.equal(ai.relativeWhen(ago(180), NOW, en), '3 h ago');
	assert.equal(ai.relativeWhen('2026-09-03T09:00:00+07:00', NOW, th), '3 ก.ย.');
	assert.equal(ai.relativeWhen('nope', NOW, th), '');
	assert.equal(ai.dayLabel(ago(60), NOW, th), 'วันนี้');
	assert.equal(ai.dayLabel('2026-09-27T23:00:00+07:00', NOW, th), 'เมื่อวาน');
	assert.equal(ai.dayLabel('2026-09-28T00:10:00+07:00', NOW, th), 'วันนี้', 'midnight in Bangkok, not UTC');
	assert.equal(ai.shortDate('2025-10-03T09:00:00+07:00', NOW, 'en'), '3 Oct 2025');
	assert.equal(ai.shortDate(undefined, NOW), '—');
});

test('the access request is generic, and its link leaves the LINE browser', () => {
	const url = ai.withExternalBrowser('https://orca.example.test/app?view=workspaces&org=org-1');
	assert.equal(url, 'https://orca.example.test/app?view=workspaces&org=org-1&openExternalBrowser=1');
	const text = ai.accessRequestText({ name: 'มาลี', email: 'mali@example.com', company: 'บริษัท ตัวอย่าง', url }, th);
	assert.match(text, /มาลี · mali@example\.com/);
	assert.match(text, /บริษัท ตัวอย่าง/);
	assert.ok(text.endsWith(url));
	assert.doesNotMatch(text, /MCP|OAuth|คีย์/);
});

test('LINE and Facebook in-app browsers are recognised, ordinary browsers are not', () => {
	assert.equal(ai.inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/13.16.0'), 'line');
	assert.equal(ai.inAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36 Line/13.16.1/IAB'), 'line');
	assert.equal(ai.inAppBrowser('Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0]'), 'facebook');
	assert.equal(ai.inAppBrowser('Mozilla/5.0 (Linux; Android 14) Instagram 300.0'), 'facebook');
	assert.equal(ai.inAppBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'), null);
	assert.equal(ai.inAppBrowser('Mozilla/5.0 Outline/1.0'), null);
	assert.equal(ai.inAppBrowser(undefined), null);
});

test('developer keys: 30 days by default, never-expiring for owners and admins only, names within 120 bytes', () => {
	assert.equal(ai.DEFAULT_KEY_DAYS, 30);
	assert.deepEqual(ai.keyExpiryOptions(false), [1, 7, 14, 30]);
	assert.deepEqual(ai.keyExpiryOptions(true), [1, 7, 14, 30, 0]);
	assert.equal(ai.keyExpiryError(0, false, th), 'เลือกอายุของคีย์');
	assert.equal(ai.keyExpiryError(0, true, th), '');
	assert.equal(ai.keyExpiryError(45, true, th), 'เลือกอายุของคีย์');
	assert.match(ai.keyNameError('  ', th), /ตั้งชื่อคีย์/);
	assert.equal(ai.keyNameError('ก'.repeat(40), th), '');
	assert.match(ai.keyNameError('ก'.repeat(41), th), /ยาวเกินไป/, '41 Thai letters are 123 bytes');
	assert.equal(ai.keyNameError('a'.repeat(120), th), '');
	const hubs = [{ id: 'h1', name: 'ฝ่ายขาย' }];
	assert.equal(ai.keyScope({ hubID: '' }, hubs, th), 'ทุกพื้นที่ทำงานของฉัน');
	assert.equal(ai.keyScope({ hubID: 'h1' }, hubs, th), 'เฉพาะ ฝ่ายขาย');
	assert.equal(ai.keyScope({ hubID: 'hidden' }, hubs, th), 'พื้นที่ทำงานเดียว');
});

test('developer tools get their own setup, by sign-in or by key; nothing secret is in it', () => {
	const names = { server: 'orca', keyEnv: 'ORCA_MCP_KEY', vscodeInput: 'orca-key' };
	const endpoint = 'https://orca.example.test/api/orca/mcp';
	const codex = ai.devSetup('codex', endpoint, true, names);
	assert.deepEqual(codex.commands, [`codex mcp add orca --url '${endpoint}'`, 'codex mcp login orca']);
	assert.equal(codex.configPath, '~/.codex/config.toml');
	const codexKey = ai.devSetup('codex', endpoint, false, names);
	assert.match(codexKey.commands[0], /--bearer-token-env-var ORCA_MCP_KEY/);
	assert.match(codexKey.config, /bearer_token_env_var = "ORCA_MCP_KEY"/);
	assert.match(ai.devSetup('cursor', endpoint, true, names).installLink, /^cursor:\/\//);
	assert.equal(ai.devSetup('vscode', endpoint, false, names).installLink, '', 'VS Code asks for a key through inputs instead');
	assert.equal(ai.devSetup('claude', endpoint, true, names).config, '');
	assert.deepEqual(ai.devSetup('codex', 'not a url', true, names), { commands: [], installLink: '', config: '', configPath: '~/.codex/config.toml', docsUrl: 'https://developers.openai.com/codex/mcp' });
	assert.match(ai.devAfterStep('codex', true, th, names), /คำสั่งที่สอง/);
	assert.match(ai.devAfterStep('claude-code', false, en, names), /ORCA_MCP_KEY/);
	assert.equal(ai.devAfterStep('other', true, th, names), '');
	assert.match(ai.otherAppInstructions(endpoint, true, 'บริษัท ตัวอย่าง', names), /Authentication: OAuth/);
	assert.match(ai.otherAppInstructions(endpoint, false, '', names), /Bearer <personal-key>/);
	for (const app of ['claude-code', 'codex', 'cursor', 'vscode', 'windsurf']) {
		const setup = ai.devSetup(app, endpoint, false, names);
		assert.doesNotMatch(JSON.stringify(setup), /orca-example-key|sk-/, app);
	}
});

test('"add me" sends the whole workspace from a fresh read, with its version', () => {
	const fresh = hub('h', {
		name: 'บัญชี', description: 'd', instructions: 'ตอบเป็นไทย', writeMode: 'approval', memberIDs: ['a'], unitIDs: ['u'], accessUnitIDs: ['dept'],
		userSourceID: '', dailyLimit: 250, version: 9, sources: [{ connectionID: 'flow', toolNames: ['read', 'list'] }], connectURL: 'x', usedToday: 3
	});
	const input = ai.hubInputWithMember(fresh, 'me');
	assert.deepEqual(input, {
		name: 'บัญชี', description: 'd', connectionID: 'flow', toolNames: ['read'], sources: [{ connectionID: 'flow', toolNames: ['read', 'list'] }],
		memberIDs: ['a', 'me'], unitIDs: ['u'], accessUnitIDs: ['dept'], userSourceID: '', dailyLimit: 250, status: 'active', version: 9,
		instructions: 'ตอบเป็นไทย', writeMode: 'approval'
	});
	assert.notEqual(input.sources, fresh.sources, 'a copy, never the fresh record itself');
	assert.deepEqual(ai.hubInputWithMember({ ...fresh, memberIDs: ['me'] }, 'me').memberIDs, ['me'], 'never twice');
	const legacy = ai.hubInputFrom({ ...fresh, sources: undefined, accessUnitIDs: undefined, instructions: undefined, writeMode: undefined });
	assert.ok(!('sources' in legacy) && !('accessUnitIDs' in legacy) && !('instructions' in legacy) && !('writeMode' in legacy), 'absent stays absent, so the server keeps it');
});

test('the poller checks now, keeps a rhythm while waiting, and stops when told or hidden', async () => {
	const timers = [];
	const schedule = (callback, ms) => { timers.push({ callback, ms }); return timers.length; };
	const cancelled = [];
	let visible = true;
	const answers = ['continue', 'continue', 'stop'];
	let runs = 0;
	const poller = ai.createPoller(async () => { runs += 1; return answers.shift() ?? 'stop'; }, { interval: 4000, visible: () => visible, schedule, cancel: (handle) => cancelled.push(handle) });
	await poller.poke();
	assert.equal(runs, 1);
	assert.equal(timers.length, 1);
	assert.equal(timers[0].ms, 4000);
	assert.ok(poller.waiting);
	await timers[0].callback();
	assert.equal(runs, 2);
	visible = false;
	await timers[1].callback();
	assert.equal(runs, 2, 'no request while the page is hidden');
	assert.equal(timers.length, 2);
	assert.equal(poller.waiting, false);
	visible = true;
	await poller.poke();
	assert.equal(runs, 3, 'shown again: checks at once');
	assert.equal(timers.length, 2, '"stop" ends the rhythm');
	poller.stop();
	await poller.poke();
	assert.equal(runs, 3);
});

test('the poller survives a failed check and runs again after a poke during a run', async () => {
	const timers = [];
	let release;
	let runs = 0;
	const poller = ai.createPoller(async () => {
		runs += 1;
		if (runs === 1) await new Promise((resolve) => (release = resolve));
		if (runs === 2) throw new Error('network');
		return 'stop';
	}, { interval: 10, schedule: (callback) => { timers.push(callback); return timers.length; }, cancel: () => {} });
	const first = poller.poke();
	void poller.poke();
	release();
	await first;
	assert.equal(runs, 2, 'the poke during the first run ran once more');
	assert.equal(timers.length, 1, 'a failed check keeps polling');
	await timers[0]();
	assert.equal(runs, 3);
	assert.equal(timers.length, 1);
});

test('only a plain company link is offered for copying', () => {
	assert.equal(ai.validConnectLink('https://orca.example.test/api/orca/mcp'), true);
	assert.equal(ai.validConnectLink(' https://orca.example.test/mcp '), true);
	for (const value of [undefined, '', '   ', 'ftp://x/mcp', 'https://user:pass@x/mcp', 'https://x/mcp?key=1', 'not a url'])
		assert.equal(ai.validConnectLink(value), false, String(value));
});
