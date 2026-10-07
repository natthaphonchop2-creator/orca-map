import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

// ค้นหา… ⌘K (W0.2): what it lists, how it groups, and how it matches Thai and English.
const { buildJumpTargets, searchJump, foldText, queryWords, jumpScore, JUMP_GROUPS } = await importTypeScript(new URL('./jump-targets.ts', import.meta.url));

const owner = {
	canManage: true,
	pages: [
		{ id: 'dashboard', label: 'หน้าหลัก', href: '/app' },
		{ id: 'servers', label: 'โปรแกรม', href: '/app?view=servers' },
		{ id: 'workflows', label: 'Workflows', href: '', soon: true },
		{ id: 'help', label: 'ช่วยเหลือ', href: '/app?view=help' }
	],
	settings: [
		{ id: 'team', label: 'ทีม', href: '/app?view=members' },
		{ id: 'company', label: 'บริษัท', href: '/app?view=settings&section=company' }
	],
	actions: [
		{ id: 'program', label: 'เชื่อมโปรแกรม', href: '/app?view=servers&catalog=1', keywords: 'สร้าง เชื่อม connect program' },
		{ id: 'invite', label: 'ชวนสมาชิก', href: '/app?view=members&tab=invitations&invite=1', keywords: 'สร้าง เชิญ invite' },
		{ id: 'agent', label: 'ORCA Agent', href: '', soon: true }
	],
	connections: [
		{ id: 'c-flow', name: 'FlowAccount' },
		{ id: 'c-old', name: 'Old', archivedAt: '2026-01-01' },
		{ id: 'c-café', name: 'Café POS' }
	],
	hubs: [
		{ id: 'hub-1', name: 'ผู้ช่วยบัญชี', status: 'active' },
		{ id: 'hub-2', name: 'เก่า', status: 'archived' }
	],
	members: [
		{ id: '7', displayName: 'มานพ ใจดี', email: 'manop@example.test' },
		{ id: '8', displayName: 'นภา ศรีสุข', email: 'napa@example.test' },
		{ id: '9', displayName: '', email: 'kong@example.test' },
		{ id: '10', displayName: 'ออกไปแล้ว', email: 'gone@example.test', status: 'removed' }
	],
	memberName: (member) => member.displayName,
	knowledge: [{ id: 'k1', title: 'นโยบายคืนสินค้า', hubID: 'hub-1', kind: 'knowledge' }],
	templates: [{ id: 't1', title: 'Daily Briefing', hubID: 'hub-1' }],
	companies: [{ id: 'default', displayName: 'ทีม ORCA' }, { id: 'org-b', displayName: 'สยามเฮิร์บ จำกัด' }],
	currentCompany: 'default',
	companyHref: (id) => `/app?org=${id}`,
	platformCompanyHref: (id) => `/app?org=default&view=platform&section=companies&company=${id}`
};
const labels = (sections) => sections.map((section) => `${section.group}: ${section.items.map((item) => item.label).join(', ')}`);

test('the targets: pages, actions, settings, programs, workspaces, people, knowledge, templates and other companies', () => {
	const targets = buildJumpTargets(owner);
	const by = (group) => targets.filter((target) => target.group === group).map((target) => target.label);
	assert.deepEqual(by('page'), ['หน้าหลัก', 'โปรแกรม', 'ช่วยเหลือ'], 'a coming-soon page is not a place to go');
	assert.deepEqual(by('action'), ['เชื่อมโปรแกรม', 'ชวนสมาชิก'], 'no coming-soon action');
	assert.deepEqual(by('setting'), ['ทีม', 'บริษัท']);
	assert.deepEqual(by('program'), ['FlowAccount', 'Café POS'], 'an archived program is gone');
	assert.deepEqual(by('workspace'), ['ผู้ช่วยบัญชี'], 'an archived workspace is gone');
	assert.deepEqual(by('person'), ['มานพ ใจดี', 'นภา ศรีสุข', 'kong@example.test'], 'a removed person is gone; no name shows the email');
	assert.deepEqual(by('knowledge'), ['นโยบายคืนสินค้า']);
	assert.deepEqual(by('template'), ['Daily Briefing']);
	assert.deepEqual(by('company'), ['สยามเฮิร์บ จำกัด'], 'the other company, not the one open');
	const find = (id) => targets.find((target) => target.id === id);
	assert.equal(find('person:8').href, '/app?view=members&member=8', 'by id: no name or email in the address');
	assert.equal(find('person:8').hint, 'napa@example.test');
	assert.equal(find('knowledge:k1').href, '/app?view=knowledge&hub=hub-1&kind=knowledge&item=k1');
	assert.equal(find('knowledge:k1').hint, 'ผู้ช่วยบัญชี', 'its workspace');
	assert.equal(find('template:t1').href, '/app?view=documents&hub=hub-1&template=t1');
	assert.equal(find('program:c-flow').href, '/app?view=servers&connection=c-flow');
	assert.equal(find('hub:hub-1').href, '/app?view=hub&hub=hub-1');
	assert.equal(find('company:org-b').reload, true, 'another company is a new page');
	assert.equal(new Set(targets.map((target) => target.id)).size, targets.length, 'no duplicates');
});

test('an employee finds no programs and no people (their pages are for Owners and Admins)', () => {
	const targets = buildJumpTargets({ ...owner, canManage: false });
	assert.ok(!targets.some((target) => target.group === 'program' || target.group === 'person'));
	assert.ok(targets.some((target) => target.group === 'workspace'));
	assert.ok(targets.some((target) => target.group === 'knowledge'));
});

test('on the platform: its pages and the customer companies, nothing of a company', () => {
	const targets = buildJumpTargets({ ...owner, platformMode: true, pages: [{ id: 'platform:companies', label: 'บริษัทลูกค้า', href: '/app?org=default&view=platform&section=companies' }] });
	assert.deepEqual(targets.map((target) => `${target.group} ${target.label}`), ['page บริษัทลูกค้า', 'company ทีม ORCA', 'company สยามเฮิร์บ จำกัด']);
	assert.equal(targets[2].href, '/app?org=default&view=platform&section=companies&company=org-b');
	assert.ok(!targets[2].reload, 'a platform page, not a new page');
});

test('a live bootstrap with missing fields never throws: entries without an id or a name are skipped', () => {
	assert.deepEqual(buildJumpTargets({}), []);
	const targets = buildJumpTargets({
		canManage: true,
		pages: [{ id: 'dashboard', label: 'หน้าหลัก', href: '/app' }],
		connections: null,
		hubs: [null, { id: 'h', name: undefined }, { name: 'no id' }, { id: 'ok', name: 'ฝ่ายขาย' }],
		members: [undefined, { id: 5 }, { id: '6', email: 'only@example.test' }],
		memberName: () => {
			throw new Error('a member without a name');
		},
		knowledge: [{ id: 'k', title: 'x' }, { id: 'k2', hubID: 'ok', title: '  ' }],
		companies: 'not a list'
	});
	assert.deepEqual(targets.map((target) => target.id), ['page:dashboard', 'hub:ok', 'person:6']);
});

test('folding: Thai tone and vowel marks, Latin accents and case do not matter', () => {
	assert.equal(foldText('เชื่อม'), foldText('เชือม'), 'a missing tone mark');
	assert.equal(foldText('Café'), 'cafe');
	assert.equal(foldText('  FlowAccount  '), 'flowaccount');
	assert.equal(foldText('ทำ'), foldText('ทํา'), 'ำ typed as ํ + า');
	assert.deepEqual(queryWords('  นภา   ศรี '), [foldText('นภา'), foldText('ศรี')]);
});

test('matching: Thai and English, by name, email or the extra words, best first', () => {
	const targets = buildJumpTargets(owner);
	const search = (query) => labels(searchJump(targets, query));
	assert.deepEqual(search('นภา'), ['person: นภา ศรีสุข']);
	assert.deepEqual(search('นภ'), ['person: นภา ศรีสุข'], 'a part of a name');
	assert.deepEqual(search('napa@'), ['person: นภา ศรีสุข'], 'by email');
	assert.deepEqual(search('flow'), ['program: FlowAccount']);
	assert.deepEqual(search('FLOWACCOUNT'), ['program: FlowAccount']);
	assert.deepEqual(search('cafe'), ['program: Café POS'], 'without the accent');
	assert.deepEqual(search('เชือม'), ['action: เชื่อมโปรแกรม'], 'เชื่อม without its tone mark offers เชื่อมโปรแกรม');
	assert.deepEqual(search('connect'), ['action: เชื่อมโปรแกรม']);
	assert.deepEqual(search('เชิญ'), ['action: ชวนสมาชิก'], 'by the words a row answers to');
	assert.deepEqual(search('คืนสินค้า'), ['knowledge: นโยบายคืนสินค้า']);
	assert.deepEqual(search('daily'), ['template: Daily Briefing']);
	assert.deepEqual(search('ทีม'), ['setting: ทีม'], 'ทีม ORCA, the company open now, is not offered');
	assert.deepEqual(search('สยาม'), ['company: สยามเฮิร์บ จำกัด']);
	assert.deepEqual(search('ผู้ช่วย'), ['workspace: ผู้ช่วยบัญชี', 'knowledge: นโยบายคืนสินค้า', 'template: Daily Briefing'], 'knowledge and templates answer to their workspace too');
	assert.deepEqual(search('zzqx'), [], 'nothing: the dialog shows its empty state');
	// Every word must match.
	assert.deepEqual(search('นภา zz'), []);
});

test('grouping: groups in a fixed order; with no query only pages and actions', () => {
	assert.deepEqual(JUMP_GROUPS, ['page', 'action', 'setting', 'program', 'workspace', 'person', 'knowledge', 'template', 'company']);
	const targets = buildJumpTargets(owner);
	assert.deepEqual(searchJump(targets, '').map((section) => section.group), ['page', 'action']);
	const all = searchJump(targets, 'a');
	const order = all.map((section) => JUMP_GROUPS.indexOf(section.group));
	assert.deepEqual(order, [...order].sort((a, b) => a - b));
	// A label that starts with the query ranks before one that only contains it.
	const many = [
		{ id: 'a', label: 'ขายส่ง', href: '/a', group: 'workspace' },
		{ id: 'b', label: 'ฝ่ายขาย', href: '/b', group: 'workspace' }
	];
	assert.deepEqual(searchJump(many, 'ขาย')[0].items.map((item) => item.id), ['a', 'b']);
	assert.ok(jumpScore(many[0], queryWords('ขาย')) > jumpScore(many[1], queryWords('ขาย')));
	// The group's own name finds its rows: "โปรแกรม" lists the programs too.
	const programs = searchJump(targets, 'โปรแกรม', { groupLabel: (group) => (group === 'program' ? 'โปรแกรม' : '') });
	assert.ok(programs.some((section) => section.group === 'program' && section.items.length === 2));
	// At most `limit` rows.
	const lots = Array.from({ length: 60 }, (_, index) => ({ id: `w${index}`, label: `ฝ่าย ${index}`, href: `/w${index}`, group: 'workspace' }));
	assert.equal(searchJump(lots, 'ฝ่าย', { perGroup: 100 }).flatMap((section) => section.items).length, 40);
});
