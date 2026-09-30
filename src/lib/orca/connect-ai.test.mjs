import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importTypeScript } from './test-import.mjs';

const ai = await importTypeScript(new URL('./connect-ai.ts', import.meta.url));
const inApp = await importTypeScript(new URL('./in-app-browser.ts', import.meta.url));
const connection_ = await importTypeScript(new URL('./ai-connection.ts', import.meta.url));
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
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [session('a', 'chatgpt', 'ChatGPT connector')], keys: [] }, NOW), { state: 'connected', app: 'ChatGPT' }, 'a server without hubID: the summary alone, as before');
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [session('a', 'other', '  ')], keys: [] }, NOW, en), { state: 'connected', app: 'AI app' });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [], keys: [{ id: 1, name: 'n8n', hubID: '', createdAt: ago(9), lastUsedAt: ago(3) }] }, NOW), { state: 'connected', reach: { hubs: [], keys: [''] } });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [], keys: [{ id: 1, name: 'unused', hubID: '', createdAt: ago(9) }] }, NOW), { state: 'none' });
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [], keys: [{ id: 1, name: 'expired', hubID: '', createdAt: ago(9), lastUsedAt: ago(3), expiresAt: ago(1) }] }, NOW), { state: 'none' });
	assert.deepEqual(ai.aiConnectionFrom(undefined, NOW), { state: 'none' });
	assert.equal(ai.sessionLabel({ client: 'claude', app: 'claude-code' }, th), 'Claude Code');
	assert.equal(ai.sessionLabel({ client: 'other', app: 'Cursor' }, th), 'Cursor');
});

test('a sign-in through one workspace\'s own link is never the company link: step 5, the pin and the list say where it reaches (B3 follow-up)', () => {
	const own = (id, hubID, hubName, created = 5, client = 'claude', app = 'Claude') => session(id, client, app, created, { hubID, hubName });
	// Step 5 ("เชื่อม Claude แล้ว") waits for the company link.
	const onlyOwn = { sessions: [own('ws', 'hub-sales', 'ฝ่ายขาย')], keys: [] };
	assert.equal(ai.connectedSession(onlyOwn, 'claude', NOW), undefined);
	const both = { sessions: [own('ws', 'hub-sales', 'ฝ่ายขาย', 1), session('co', 'claude', 'Claude', 60, { hubID: '', hubName: '' })], keys: [] };
	assert.equal(ai.connectedSession(both, 'claude', NOW)?.id, 'co', 'the company link\'s sign-in, though older');
	// A server from before the follow-up sends no hubID: every sign-in counts, as before.
	assert.equal(ai.connectedSession({ sessions: [session('old', 'claude', 'Claude')], keys: [] }, 'claude', NOW)?.id, 'old');
	assert.equal(ai.companyLinkSession({}), true);
	assert.equal(ai.companyLinkSession({ hubID: '' }), true);
	assert.equal(ai.companyLinkSession({ hubID: 'hub-sales' }), false);
	// The pin: the company link first, then a used key, and only then "เฉพาะ …".
	const sales = { id: 'hub-sales', name: 'ฝ่ายขาย', app: 'Claude' };
	assert.deepEqual(ai.aiConnectionFrom(both, NOW, en), { state: 'connected', app: 'Claude', reach: { company: 'Claude', hubs: [sales], keys: [] } }, 'the workspace\'s own sign-in is kept beside it (Codex review 72)');
	assert.deepEqual(ai.aiConnectionFrom(onlyOwn, NOW, en), { state: 'connected', app: 'Claude', only: [sales], reach: { hubs: [sales], keys: [] } });
	const usedKey = { id: 1, name: 'n8n', hubID: '', createdAt: ago(9), lastUsedAt: ago(3) };
	assert.deepEqual(ai.aiConnectionFrom({ ...onlyOwn, keys: [usedKey] }, NOW, en), { state: 'connected', reach: { hubs: [sales], keys: [''] } });
	const two = { sessions: [own('a', 'hub-sales', 'ฝ่ายขาย', 1), own('b', 'hub-acc', '', 2, 'chatgpt', 'ChatGPT'), own('c', 'hub-sales', 'ฝ่ายขาย', 3)], keys: [] };
	// Each workspace once, with its newest sign-in's app; two apps apart name no app (Codex review 71).
	const twoHubs = [sales, { id: 'hub-acc', name: '', app: 'ChatGPT' }];
	assert.deepEqual(ai.aiConnectionFrom(two, NOW, en), { state: 'connected', only: twoHubs, reach: { hubs: twoHubs, keys: [] } }, 'each workspace once, its own app');
	const twoClaude = { sessions: [own('a', 'hub-sales', 'ฝ่ายขาย', 1), own('b', 'hub-acc', 'บัญชี', 2)], keys: [] };
	const twoClaudeHubs = [sales, { id: 'hub-acc', name: 'บัญชี', app: 'Claude' }];
	assert.deepEqual(ai.aiConnectionFrom(twoClaude, NOW, en), { state: 'connected', app: 'Claude', only: twoClaudeHubs, reach: { hubs: twoClaudeHubs, keys: [] } }, 'one app: named');
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [own('x', 'hub-sales', 'ฝ่ายขาย', 5, 'claude', 'Claude')].map((item) => ({ ...item, expiresAt: ago(1) })), keys: [] }, NOW), { state: 'none' }, 'an expired one is nothing');
	assert.equal(connection_.aiConnectionLine(ai.aiConnectionFrom(onlyOwn, NOW, th), th), 'Claude เชื่อมเฉพาะ ฝ่ายขาย');
	assert.equal(connection_.aiConnectionLine(ai.aiConnectionFrom(onlyOwn, NOW, en), en), 'Claude: only ฝ่ายขาย');
	assert.equal(connection_.aiConnectionLine(ai.aiConnectionFrom(two, NOW, th), th), 'เชื่อมเฉพาะ 2 พื้นที่ทำงาน', 'never "Claude" for ChatGPT\'s workspace');
	assert.equal(connection_.aiConnectionLine(ai.aiConnectionFrom(two, NOW, en), en), 'Connected, only 2 workspaces');
	assert.equal(connection_.aiConnectionLine(ai.aiConnectionFrom(twoClaude, NOW, th), th), 'Claude เชื่อมเฉพาะ 2 พื้นที่ทำงาน');
	// คลังความรู้'s "ถามใน …": the app that reaches that workspace (Codex review 71).
	const limited = ai.aiConnectionFrom(two, NOW, en);
	const acc = { id: 'hub-acc' };
	assert.equal(connection_.aiConnectionAppFor(limited, acc), 'ChatGPT');
	assert.equal(connection_.aiConnectionAppFor(limited, { id: 'hub-sales' }), 'Claude');
	assert.equal(connection_.aiConnectionAppFor(limited, { id: 'hub-other' }), '', 'none reaches it');
	assert.equal(connection_.aiConnectionAppFor(limited, undefined), '');
	assert.equal(connection_.aiConnectionAppFor({ state: 'connected', app: 'Claude', only: [{ id: 'hub-acc', name: '', app: 'ChatGPT' }] }, acc), 'ChatGPT', 'the summary alone: still the workspace\'s own app');
	assert.equal(connection_.aiConnectionAppFor({ state: 'connected', app: 'Claude' }, acc), 'Claude', 'the company link reaches every workspace');
	assert.equal(connection_.aiConnectionAppFor({ state: 'connected' }, acc), '', 'a used key names no app');
	assert.equal(connection_.aiConnectionAppFor({ state: 'none', app: 'Claude' }, acc), '');
	assert.equal(connection_.aiConnectionAppFor(undefined, acc), '');
	assert.equal(connection_.aiConnectionLine({ state: 'connected', only: [{ id: 'h', name: '' }] }, th), 'เชื่อมเฉพาะพื้นที่ทำงานเดียว', 'a workspace they cannot see is not named');
	assert.doesNotMatch(connection_.aiConnectionLine(ai.aiConnectionFrom(two, NOW, th), th), /เชื่อมแล้ว/);
	// Whether it reaches a workspace (คลังความรู้): the company link reaches all, a limited one only its own.
	assert.equal(connection_.aiConnectionReaches({ state: 'connected', app: 'Claude' }, acc), true);
	assert.equal(connection_.aiConnectionReaches({ state: 'connected', app: 'Claude' }, undefined), true, 'workspaces at large');
	assert.equal(connection_.aiConnectionReaches({ state: 'connected', only: [{ id: 'hub-sales', name: '' }] }, { id: 'hub-sales' }), true);
	assert.equal(connection_.aiConnectionReaches({ state: 'connected', only: [{ id: 'hub-sales', name: '' }] }, acc), false);
	assert.equal(connection_.aiConnectionReaches({ state: 'connected', only: [{ id: 'hub-sales', name: '' }] }, undefined), false);
	assert.equal(connection_.aiConnectionReaches({ state: 'none' }, { id: 'hub-sales' }), false);
	// The list names where each sign-in reaches.
	const hubs = [{ id: 'hub-sales', name: 'ผู้ช่วยฝ่ายขาย' }];
	assert.equal(ai.sessionScope({ hubID: '' }, hubs, th), 'ทุกพื้นที่ทำงานของฉัน');
	assert.equal(ai.sessionScope({}, hubs, en), 'All my workspaces');
	assert.equal(ai.sessionScope({ hubID: 'hub-sales', hubName: 'ฝ่ายขาย' }, hubs, th), 'เฉพาะ ผู้ช่วยฝ่ายขาย', 'the company\'s own name for it first');
	assert.equal(ai.sessionScope({ hubID: 'hub-gone', hubName: 'ฝ่ายเก่า' }, hubs, th), 'เฉพาะ ฝ่ายเก่า', 'else the server\'s');
	assert.equal(ai.sessionScope({ hubID: 'hub-gone', hubName: '' }, hubs, en), 'One workspace');
});

test('a workspace with its own sign-in is named with the app of a sign-in limited to it; the list cannot say which way in a sign-in used, so what may reach counts and is named only where the list shows it (Codex reviews 72 and 73)', () => {
	const own = (id, hubID, created, client, app) => session(id, client, app, created, { hubID, hubName: '' });
	const sso = { id: 'hub-h', userSourceID: 'sso-1' };
	const plain = { id: 'hub-s' };
	// An older Claude sign-in through the company's link, a newer ChatGPT one through H's own link.
	const status = ai.aiConnectionFrom({ sessions: [own('gpt', 'hub-h', 1, 'chatgpt', 'ChatGPT'), own('co', '', 60, 'claude', 'Claude')], keys: [] }, NOW, en);
	assert.equal(connection_.aiConnectionLine(status, th), 'Claude เชื่อมแล้ว', 'the pin still names the company link');
	assert.equal(connection_.aiConnectionReaches(status, sso), true);
	assert.equal(connection_.aiConnectionAppFor(status, sso), 'ChatGPT', 'never "ถามใน Claude" for H: its own link\'s sign-in is the one shown to reach it');
	assert.equal(connection_.aiConnectionAppFor(status, plain), 'Claude', 'a workspace on the company link');
	// Another SSO workspace: the company's link reaches it if that sign-in chose its SSO, which the list does not say (Codex review 73).
	assert.equal(connection_.aiConnectionReaches(status, { id: 'hub-h2', userSourceID: 'sso-1' }), true, 'counted: never "not connected" for what may work');
	assert.equal(connection_.aiConnectionAppFor(status, { id: 'hub-h2', userSourceID: 'sso-1' }), '', 'not named');
	// The company's link alone: an SSO sign-in there reaches an SSO workspace (backend orcaOAuthHubCheck), an ORCA account the others.
	const company = ai.aiConnectionFrom({ sessions: [own('co', '', 5, 'claude', 'Claude')], keys: [] }, NOW, en);
	assert.equal(connection_.aiConnectionReaches(company, sso), true);
	assert.equal(connection_.aiConnectionAppFor(company, sso), '', 'not named: it may have used an ORCA account');
	assert.equal(connection_.aiConnectionReaches(company, plain), true);
	assert.equal(connection_.aiConnectionAppFor(company, plain), 'Claude');
	assert.equal(connection_.aiConnectionReaches(company, undefined), true, 'workspaces at large');
	assert.equal(connection_.aiConnectionAppFor(company, undefined), 'Claude');
	// Only sign-ins limited to other workspaces: nothing reaches H.
	const elsewhere = ai.aiConnectionFrom({ sessions: [own('gpt', 'hub-x', 1, 'chatgpt', 'ChatGPT')], keys: [] }, NOW, en);
	assert.equal(connection_.aiConnectionReaches(elsewhere, sso), false);
	assert.equal(connection_.aiConnectionReaches(elsewhere, plain), false);
	assert.equal(connection_.aiConnectionAppFor(elsewhere, sso), '');
	// A server without hubID cannot say: every sign-in counts, as before.
	const older = ai.aiConnectionFrom({ sessions: [session('old', 'claude', 'Claude')], keys: [] }, NOW, en);
	assert.equal(older.reach, undefined);
	assert.equal(connection_.aiConnectionAppFor(older, sso), 'Claude');
	// A workspace on the company link with its own link's sign-in beside it: either may be from another way in
	// (an SSO sign-in on the company's link, or one from before it left SSO), so two apps name none (Codex review 73).
	const mixed = ai.aiConnectionFrom({ sessions: [own('co', '', 1, 'claude', 'Claude'), own('gpt', 'hub-s', 30, 'chatgpt', 'ChatGPT')], keys: [] }, NOW, en);
	assert.equal(connection_.aiConnectionReaches(mixed, plain), true);
	assert.equal(connection_.aiConnectionAppFor(mixed, plain), '', 'never ChatGPT\'s old sign-in over the working company Claude');
	assert.equal(connection_.aiConnectionAppFor(mixed, { id: 'hub-t' }), 'Claude');
	const same = ai.aiConnectionFrom({ sessions: [own('co', '', 1, 'claude', 'Claude'), own('cl', 'hub-s', 30, 'claude', 'Claude')], keys: [] }, NOW, en);
	assert.equal(connection_.aiConnectionAppFor(same, plain), 'Claude', 'one app: named');
	const ownOnly = ai.aiConnectionFrom({ sessions: [own('gpt', 'hub-s', 30, 'chatgpt', 'ChatGPT')], keys: [] }, NOW, en);
	assert.equal(connection_.aiConnectionAppFor(ownOnly, plain), 'ChatGPT', 'only its own link\'s sign-in: named');
	// A used key reaches every workspace (SSO too) or its own one, and names no app.
	const key = (hubID, used = true) => ({ id: hubID.length + 1, name: 'n8n', hubID, createdAt: ago(9), ...(used ? { lastUsedAt: ago(3) } : {}) });
	const anyKey = ai.aiConnectionFrom({ sessions: [], keys: [key('')] }, NOW, en);
	assert.equal(connection_.aiConnectionReaches(anyKey, sso), true);
	assert.equal(connection_.aiConnectionAppFor(anyKey, sso), '');
	assert.equal(connection_.aiConnectionAppFor(anyKey, plain), '');
	const hKey = ai.aiConnectionFrom({ sessions: [own('co', '', 5, 'claude', 'Claude')], keys: [key('hub-h')] }, NOW, en);
	assert.deepEqual(hKey.reach, { company: 'Claude', hubs: [], keys: ['hub-h'] });
	assert.equal(connection_.aiConnectionReaches(hKey, sso), true, 'a key for H');
	assert.equal(connection_.aiConnectionAppFor(hKey, sso), '', 'the key names no app, and Claude is not shown to reach H');
	const otherKey = ai.aiConnectionFrom({ sessions: [], keys: [key('hub-x')] }, NOW, en);
	assert.equal(connection_.aiConnectionReaches(otherKey, sso), false, 'a key for another workspace');
	assert.equal(connection_.aiConnectionReaches(otherKey, plain), false);
	assert.equal(connection_.aiConnectionReaches(otherKey, { id: 'hub-x' }), true);
	assert.equal(connection_.aiConnectionReaches(otherKey, undefined), false);
	const elsewhereKey = ai.aiConnectionFrom({ sessions: [own('gpt', 'hub-x', 1, 'chatgpt', 'ChatGPT')], keys: [key('hub-x'), key('', false)] }, NOW, en);
	assert.equal(connection_.aiConnectionReaches(elsewhereKey, sso), false, 'an unused key reaches nothing');
	assert.equal(connection_.aiConnectionReaches(elsewhereKey, { id: 'hub-x' }), true);
	// A used key for every workspace beside a sign-in limited to another: it reaches them, never named with that sign-in's ChatGPT.
	const keyAndElsewhere = ai.aiConnectionFrom({ sessions: [own('gpt', 'hub-x', 1, 'chatgpt', 'ChatGPT')], keys: [key('')] }, NOW, en);
	assert.deepEqual(keyAndElsewhere.reach, { hubs: [{ id: 'hub-x', name: '', app: 'ChatGPT' }], keys: [''] });
	assert.equal(connection_.aiConnectionAppFor(keyAndElsewhere, { id: 'hub-x' }), 'ChatGPT', 'its own workspace');
	for (const hub of [sso, plain]) {
		assert.equal(connection_.aiConnectionReaches(keyAndElsewhere, hub), true);
		assert.equal(connection_.aiConnectionAppFor(keyAndElsewhere, hub), '', 'a key names no app');
	}
});

test('the pin: connected names the app, none says so, unknown (no B1 on this server) says nothing', () => {
	assert.equal(connection_.aiConnectionLine({ state: 'connected', app: 'Claude' }, th), 'Claude เชื่อมแล้ว');
	assert.equal(connection_.aiConnectionLine({ state: 'connected' }, en), 'Connected');
	assert.equal(connection_.aiConnectionLine({ state: 'none' }, th), 'ยังไม่ได้เชื่อม');
	assert.equal(connection_.aiConnectionLine({ state: 'unknown' }, th), '', 'never "ยังไม่ได้เชื่อม" when it cannot tell');
	assert.equal(connection_.aiConnectionLine(undefined, th), '');
	// An expired sign-in is not a connection.
	assert.deepEqual(ai.aiConnectionFrom({ sessions: [session('a', 'claude', 'Claude', 5, { expiresAt: ago(1) })], keys: [] }, NOW), { state: 'none' });
});

test('the app buttons: Claude\'s connectors page, and ChatGPT itself (no unverified deep link)', () => {
	assert.equal(ai.CONNECTOR_PAGES.claude, 'https://claude.ai/settings/connectors');
	assert.equal(ai.CONNECTOR_PAGES.chatgpt, 'https://chatgpt.com/');
	for (const url of Object.values(ai.CONNECTOR_PAGES)) assert.doesNotMatch(url, /#/, 'no fragment routes we cannot check');
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
	const url = inApp.lineExternalURL('https://orca.example.test/app?view=workspaces&org=org-1');
	assert.equal(url, 'https://orca.example.test/app?view=workspaces&org=org-1&openExternalBrowser=1');
	const text = ai.accessRequestText({ name: 'มาลี', email: 'mali@example.com', company: 'บริษัท ตัวอย่าง', url }, th);
	assert.match(text, /มาลี · mali@example\.com/);
	assert.match(text, /บริษัท ตัวอย่าง/);
	assert.ok(text.endsWith(url));
	assert.doesNotMatch(text, /MCP|OAuth|คีย์/);
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
