import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const nav = await importTypeScript(new URL('./workspace-nav.ts', import.meta.url));
const keys = await importTypeScript(new URL('./menu-keys.ts', import.meta.url));
const railModule = await importTypeScript(new URL('./rail.ts', import.meta.url));
const { skillsEnabled, workspaceSections, settingsEntries, createMenu, createShortcut, CREATE_GROUPS } = nav;

const ids = (sections) => sections.map((section) => `${section.id}: ${section.items.map((item) => (item.soon ? `${item.id} (soon)` : item.id)).join(' ')}`);

test('Skills needs the bootstrap feature, exactly true', () => {
	for (const data of [undefined, {}, { features: undefined }, { features: {} }, { features: { skills: false } }, { features: { skills: 'true' } }, { features: { skills: 1 } }])
		assert.equal(skillsEnabled(data), false, JSON.stringify(data));
	assert.equal(skillsEnabled({ features: { skills: true } }), true);
});

test('W0.1 rail sections by role and feature: หน้าหลัก, AI, ข้อมูล, จัดการ', () => {
	assert.deepEqual(ids(workspaceSections({ canManage: true })), [
		'start: dashboard', 'ai: connect-ai workflows (soon)', 'data: servers knowledge', 'manage: history settings'
	]);
	assert.deepEqual(ids(workspaceSections({ canManage: true, features: { skills: true } })), [
		'start: dashboard', 'ai: connect-ai skills workflows (soon)', 'data: servers knowledge', 'manage: history settings'
	]);
	// Employees: no Workflows and no โปรแกรม (they reach programs through AI ของฉัน, W0).
	assert.deepEqual(ids(workspaceSections({ canManage: false })), ['start: dashboard', 'ai: connect-ai', 'data: knowledge', 'manage: history settings']);
	assert.deepEqual(ids(workspaceSections({ canManage: false, features: { skills: true } })), ['start: dashboard', 'ai: connect-ai skills', 'data: knowledge', 'manage: history settings']);
	for (const features of [undefined, {}, { skills: 'yes' }]) assert.ok(!workspaceSections({ canManage: true, features }).flatMap((section) => section.items).some((item) => item.id === 'skills'));
	const history = (role) => workspaceSections(role).flatMap((section) => section.items).find((item) => item.id === 'history');
	assert.equal(history({ canManage: true }).href, '/app?view=approvals');
	assert.equal(history({ canManage: true }).count, true);
	assert.equal(history({ canManage: false }).href, '/app?view=executions');
	assert.equal(history({ canManage: false, requestsApproval: true }).href, '/app?view=approvals');
	assert.equal(workspaceSections({ canManage: true }).flatMap((section) => section.items).find((item) => item.id === 'servers').icon, 'programs');
});

test('ตั้งค่า ▾: ทีม, พื้นที่ทำงาน AI, บริษัท, บัญชีของฉัน; employees what they reach today', () => {
	assert.deepEqual(settingsEntries({ canManage: true }).map((item) => `${item.id} ${item.href}`), [
		'team /app?view=members', 'workspaces /app?view=workspaces', 'company /app?view=settings&section=company', 'account /app?view=settings&section=account'
	]);
	assert.deepEqual(settingsEntries({ canManage: false }).map((item) => item.id), ['workspaces', 'account']);
});

const menu = (role) => createMenu({ views: [], ...role }).map((group) => group.map((item) => (item.soon ? `${item.id} (soon)` : item.id)).join(' '));

test('the สร้าง menu by role and flag: groups with hairlines, a group left empty is dropped', () => {
	assert.deepEqual(menu({ canManage: true }), ['workspace', 'program workflow (soon)', 'agent (soon) knowledge ai', 'invite account']);
	assert.deepEqual(menu({ canManage: true, features: { skills: true, docTemplates: true }, views: ['documents'] }), [
		'workspace', 'program workflow (soon)', 'skill agent (soon) knowledge template ai', 'invite account'
	]);
	// เทมเพลตเอกสาร needs its flag and its page in this build (it arrives with kv2 phase 2a).
	assert.ok(!menu({ canManage: true, features: { docTemplates: true }, views: [] }).join(' ').includes('template'));
	assert.ok(!menu({ canManage: true, features: {}, views: ['documents'] }).join(' ').includes('template'));
	// Members: only what they may use; no manager rows, no empty groups.
	assert.deepEqual(menu({ canManage: false }), ['agent (soon) knowledge ai']);
	assert.deepEqual(menu({ canManage: false, features: { skills: true, docTemplates: true }, views: ['documents'] }), ['agent (soon) knowledge ai']);
	for (const role of [{ canManage: false }, { canManage: false, features: { skills: true, docTemplates: true }, views: ['documents'] }, { canManage: false, canCreateSkills: 'true', features: { skills: true } }, { canManage: false, canCreateSkills: true }]) {
		const rows = createMenu({ views: [], ...role }).flat().map((item) => item.id);
		for (const id of ['workspace', 'program', 'workflow', 'skill', 'template', 'invite', 'account']) assert.ok(!rows.includes(id), `a member never sees ${id}: ${JSON.stringify(role)}`);
	}
	// Skill: a member a manager allowed (bootstrap canCreateSkills, exactly true; not built yet), and only with the Skills feature.
	assert.deepEqual(menu({ canManage: false, canCreateSkills: true, features: { skills: true } }), ['skill agent (soon) knowledge ai']);
	assert.equal(createShortcut(createMenu({ canManage: false, canCreateSkills: true, features: { skills: true }, views: [] }), 'KeyS').id, 'skill');
	assert.equal(createShortcut(createMenu({ canManage: false, features: { skills: true }, views: [] }), 'KeyS'), undefined, 'no C then S for a member without the grant');
	// Workflow is the managers' (W0), even while it is coming soon.
	assert.equal(CREATE_GROUPS.flat().find((item) => item.id === 'workflow').manager, true);
	assert.equal(CREATE_GROUPS.flat().find((item) => item.id === 'skill').manager, true);
	// Every live row leads to a page that exists today.
	const hrefs = Object.fromEntries(CREATE_GROUPS.flat().map((item) => [item.id, item.href]));
	assert.deepEqual(hrefs, {
		workspace: '/app?view=new', program: '/app?view=servers&catalog=1', workflow: '', skill: '/app?view=skills', agent: '',
		knowledge: '/app?view=knowledge&kind=knowledge&create=1', template: '/app?view=documents', ai: '/app?view=connect-ai',
		invite: '/app?view=members&tab=invitations&invite=1', account: '/app?view=servers&catalog=1&as=company'
	});
	assert.equal(CREATE_GROUPS.flat().find((item) => item.id === 'program').icon, 'mcp', 'the MCP mark');
	for (const item of CREATE_GROUPS.flat()) assert.equal(!!item.soon, !item.key, `${item.id}: a shortcut exactly when it is live`);
});

test('shortcuts read event.code: C then a letter works on a Thai layout ({key:"แ", code:"KeyC"})', () => {
	let clock = 0;
	const sequence = keys.createSequence(() => clock);
	const groups = createMenu({ canManage: true, features: { skills: true }, views: [] });
	assert.deepEqual(sequence.read({ key: 'แ', code: 'KeyC' }), { action: 'armed' });
	clock += 300;
	const next = sequence.read({ key: 'ร', code: 'KeyP' });
	assert.deepEqual(next, { action: 'pick', code: 'KeyP' });
	assert.equal(createShortcut(groups, next.code).id, 'program');
	assert.equal(createShortcut(groups, 'KeyS').id, 'skill');
	assert.equal(createShortcut(groups, 'KeyT'), undefined, 'a hidden row has no shortcut');
	assert.equal(createShortcut(createMenu({ canManage: false, views: [] }), 'KeyW'), undefined, 'members cannot open a manager row by its keys');
	// Too slow: the sequence is gone.
	sequence.read({ key: 'c', code: 'KeyC' });
	clock += keys.SEQUENCE_MS + 1;
	assert.deepEqual(sequence.read({ key: 'p', code: 'KeyP' }), { action: 'none' });
	// Shift+C is a capital letter, not the sequence.
	assert.deepEqual(sequence.read({ key: 'C', code: 'KeyC', shiftKey: true }), { action: 'none' });
	// ⌘K and Ctrl+K by code, also on a Thai layout ("า").
	assert.equal(keys.isJumpShortcut({ key: 'า', code: 'KeyK', metaKey: true }), true);
	assert.equal(keys.isJumpShortcut({ key: 'k', code: 'KeyK', ctrlKey: true }), true);
	assert.equal(keys.isJumpShortcut({ key: 'k', code: 'KeyK' }), false);
	assert.equal(keys.isJumpShortcut({ key: 'k', code: 'KeyK', metaKey: true, altKey: true }), false);
});

test('shortcuts are ignored while typing in a field and with Ctrl, Cmd or Alt held', () => {
	const sequence = keys.createSequence(() => 0);
	for (const target of [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }, { tagName: 'SPAN', closest: (selector) => (selector.includes('contenteditable') ? {} : null) }]) {
		assert.deepEqual(sequence.read({ key: 'แ', code: 'KeyC', target }), { action: 'none' }, JSON.stringify(target));
	}
	for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) assert.deepEqual(sequence.read({ key: 'c', code: 'KeyC', [modifier]: true }), { action: 'none' }, modifier);
	// Armed, then a key typed into a field: nothing opens.
	assert.deepEqual(sequence.read({ key: 'c', code: 'KeyC', target: { tagName: 'BUTTON' } }), { action: 'armed' });
	assert.deepEqual(sequence.read({ key: 'p', code: 'KeyP', target: { tagName: 'INPUT' } }), { action: 'none' });
	assert.equal(keys.typingIn({ tagName: 'BUTTON' }), false);
});

test('menu keys: arrows wrap and skip greyed rows, Home and End jump to the ends', () => {
	const disabled = [false, false, true, false, true, false];
	assert.equal(keys.menuMove(disabled, -1, 'ArrowDown'), 0);
	assert.equal(keys.menuMove(disabled, 1, 'ArrowDown'), 3, 'skips the greyed row');
	assert.equal(keys.menuMove(disabled, 5, 'ArrowDown'), 0, 'wraps');
	assert.equal(keys.menuMove(disabled, 3, 'ArrowUp'), 1);
	assert.equal(keys.menuMove(disabled, 0, 'ArrowUp'), 5);
	assert.equal(keys.menuMove(disabled, 3, 'Home'), 0);
	assert.equal(keys.menuMove(disabled, 0, 'End'), 5);
	assert.equal(keys.menuMove([true, true], -1, 'ArrowDown'), -1);
});

function fakeRail(stored = null) {
	const timers = [];
	const states = [];
	const store = new Map(stored === null ? [] : [[railModule.RAIL_PIN_KEY, stored]]);
	const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
	const rail = railModule.createRail({
		storage: () => storage,
		onchange: (state) => states.push(state),
		schedule: (callback, ms) => {
			const timer = { callback, ms, done: false };
			timers.push(timer);
			return timer;
		},
		cancel: (timer) => (timer.done = true)
	});
	const run = (ms) => {
		for (const timer of timers) if (!timer.done && timer.ms === ms) {
			timer.done = true;
			timer.callback();
		}
	};
	return { rail, timers, states, store, run };
}

test('the rail: hover opens after 250 ms, leaving closes after 150 ms, keyboard focus opens at once', () => {
	const { rail, timers, run } = fakeRail();
	assert.deepEqual(rail.state, { open: false, pinned: false });
	rail.pointerEnter();
	assert.equal(timers.at(-1).ms, railModule.RAIL_OPEN_MS);
	assert.equal(rail.state.open, false, 'not before the delay');
	run(railModule.RAIL_OPEN_MS);
	assert.equal(rail.state.open, true);
	rail.pointerLeave();
	assert.equal(timers.at(-1).ms, railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, true);
	run(railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, false);
	// A quick pass does not open it.
	rail.pointerEnter();
	rail.pointerLeave();
	run(railModule.RAIL_OPEN_MS);
	assert.equal(rail.state.open, false);
	// Keyboard focus: at once; a click's focus: no.
	rail.focusIn(false);
	assert.equal(rail.state.open, false);
	rail.focusIn(true);
	assert.equal(rail.state.open, true);
	rail.focusOut();
	assert.equal(rail.state.open, false);
});

test('the rail: Esc closes it and it stays closed until the pointer or focus leaves', () => {
	const { rail, run } = fakeRail();
	rail.focusIn(true);
	assert.equal(rail.escape(), true);
	assert.equal(rail.state.open, false);
	rail.focusIn(true);
	rail.pointerEnter();
	run(railModule.RAIL_OPEN_MS);
	assert.equal(rail.state.open, false, 'stays closed after Esc');
	assert.equal(rail.escape(), false, 'nothing to close');
	rail.pointerLeave();
	rail.pointerEnter();
	run(railModule.RAIL_OPEN_MS);
	assert.equal(rail.state.open, true, 'opens again once the pointer left and came back');
});

test('the rail: the pin keeps it open, is remembered, and survives a broken storage', () => {
	const { rail, store, run } = fakeRail();
	rail.togglePin();
	assert.deepEqual(rail.state, { open: true, pinned: true });
	assert.equal(store.get(railModule.RAIL_PIN_KEY), '1');
	rail.pointerLeave();
	run(railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, true, 'leaving does not close a pinned rail');
	assert.equal(rail.escape(), false, 'Esc leaves a pinned rail alone');
	rail.togglePin();
	assert.deepEqual(rail.state, { open: false, pinned: false });
	assert.equal(store.get(railModule.RAIL_PIN_KEY), '0');
	assert.deepEqual(fakeRail('1').rail.state, { open: true, pinned: true }, 'a reload keeps the pin');
	const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
	const offline = railModule.createRail({ storage: () => broken, onchange: () => {} });
	assert.deepEqual(offline.state, { open: false, pinned: false });
	offline.togglePin();
	assert.deepEqual(offline.state, { open: true, pinned: true });
	offline.dispose();
});

test('the rail: keyboard focus inside keeps it open when the pointer leaves; it closes when focus leaves too', () => {
	const { rail, run } = fakeRail();
	rail.pointerEnter();
	run(railModule.RAIL_OPEN_MS);
	rail.focusIn(true);
	rail.pointerLeave();
	run(railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, true, 'a keyboard user is still in it');
	rail.focusOut();
	assert.equal(rail.state.open, false);
	// Focus leaves while the pointer is still over it: it stays open for the pointer.
	rail.pointerEnter();
	run(railModule.RAIL_OPEN_MS);
	rail.focusIn(true);
	rail.focusOut();
	assert.equal(rail.state.open, true);
	rail.pointerLeave();
	run(railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, false);
	// A click's focus does not hold it open: leaving closes it (the shell moves that focus first).
	rail.pointerEnter();
	run(railModule.RAIL_OPEN_MS);
	rail.focusIn(false);
	rail.pointerLeave();
	run(railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, false);
});

test('the rail: unpinning with the pointer or keyboard focus on it keeps it open as a hover panel', () => {
	let { rail, run } = fakeRail('1');
	rail.focusIn(true);
	rail.togglePin();
	assert.deepEqual(rail.state, { open: true, pinned: false }, 'the pin button a keyboard user pressed stays on screen');
	rail.focusOut();
	assert.deepEqual(rail.state, { open: false, pinned: false });
	({ rail, run } = fakeRail('1'));
	rail.pointerEnter();
	rail.togglePin();
	assert.deepEqual(rail.state, { open: true, pinned: false });
	rail.pointerLeave();
	run(railModule.RAIL_CLOSE_MS);
	assert.equal(rail.state.open, false);
	({ rail } = fakeRail('1'));
	rail.togglePin();
	assert.deepEqual(rail.state, { open: false, pinned: false }, 'nobody on it: it closes');
});

test('before the rail collapses, focus on a control it hides moves to one it keeps', () => {
	const node = (name, { matches = [], parent = null, children = {} } = {}) => {
		const self = {
			name,
			parent,
			previousElementSibling: null,
			matches: (selector) => matches.includes(selector),
			closest: (selector) => {
				for (let at = self; at; at = at.parent) if (at.matches(selector)) return at;
				return null;
			},
			querySelector: (selector) => children[selector] ?? null
		};
		return self;
	};
	const settingsLink = node('settings link');
	const brand = node('brand');
	const group = node('group', { matches: ['.w1-group'], children: { 'a.w1-item': settingsLink } });
	const sub = node('sub', { matches: ['.w1-sub'] });
	sub.previousElementSibling = group;
	const subitem = node('ทีม', { parent: sub });
	const caret = node('caret', { matches: ['.w1-caret'], parent: group });
	const pin = node('pin', { matches: ['.w1-pin'] });
	const home = node('หน้าหลัก');
	const inside = new Set([subitem, caret, pin, home, settingsLink, brand]);
	const railNode = { ...node('rail', { children: { '.w1-brand': brand } }), contains: (item) => inside.has(item) };
	assert.equal(railModule.railFocusTarget(subitem, railNode), settingsLink, 'ตั้งค่า › ทีม → the ตั้งค่า icon');
	assert.equal(railModule.railFocusTarget(caret, railNode), settingsLink, 'the caret → the ตั้งค่า icon');
	assert.equal(railModule.railFocusTarget(pin, railNode), brand, 'the pin → the ORCA mark beside it');
	assert.equal(railModule.railFocusTarget(home, railNode), null, 'an icon the rail keeps: stays');
	assert.equal(railModule.railFocusTarget(node('main'), railNode), null, 'focus outside the rail: untouched');
	assert.equal(railModule.railFocusTarget(null, railNode), null);
});
