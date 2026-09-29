import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { importTypeScript, typescriptModuleURL } from './test-import.mjs';

const edit = await importTypeScript(new URL('./workspace-edit.ts', import.meta.url));
const th = (value) => value;
const en = (_th, value) => value;

const read = (name) => ({ name, inputSchema: {}, definition: { name, annotations: { readOnlyHint: true } } });
const write = (name) => ({ name, inputSchema: {}, definition: { name, annotations: { readOnlyHint: false } } });
const destructive = (name) => ({ name, inputSchema: {}, definition: { name, annotations: { readOnlyHint: true, destructiveHint: true } } });
const unannotated = (name) => ({ name, inputSchema: {} });

const flow = {
	id: 'conn-flow', name: 'FlowAccount', description: '', mcpID: 'flow', enabled: true, reviewedTools: true, reviewedReadOnly: false,
	tools: [read('list_invoices'), read('get_invoice'), write('create_quotation'), unannotated('send_email')],
	toolNames: ['list_invoices', 'get_invoice', 'create_quotation', 'send_email'], scopeNote: '', version: 3, createdAt: '', updatedAt: ''
};
const drive = {
	id: 'conn-drive', name: 'Google Drive', description: '', mcpID: 'drive', enabled: true, reviewedTools: true, reviewedReadOnly: true,
	tools: [unannotated('search_files'), unannotated('read_file')], toolNames: ['search_files', 'read_file'], scopeNote: '', version: 1, createdAt: '', updatedAt: ''
};
const hub = {
	id: 'hub-one', name: 'ฝ่ายบัญชี', description: 'เดิม', instructions: 'ตอบเป็นไทย', writeMode: 'approval', userSourceID: '',
	connectionID: 'conn-flow', toolNames: ['list_invoices'], sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }, { connectionID: 'conn-drive', toolNames: ['search_files'] }],
	memberIDs: ['u-owner', 'u-a'], unitIDs: ['legacy'], accessUnitIDs: ['dept-acc'], effectiveMemberIDs: ['u-owner', 'u-a', 'u-b'],
	dailyLimit: 200, status: 'active', version: 7, createdAt: '', updatedAt: '', connectURL: 'https://orca.example.test/mcp/hub-one', usedToday: 12
};

test('a program reviewed as read-only never holds anything; otherwise any change tool or unknown tool does', () => {
	assert.equal(edit.sourceChangesData(drive, ['search_files', 'read_file']), false);
	assert.equal(edit.sourceChangesData(flow, ['list_invoices', 'get_invoice']), false);
	assert.equal(edit.sourceChangesData(flow, ['list_invoices', 'send_email']), true);
	assert.equal(edit.sourceChangesData(flow, ['gone_tool']), true);
	assert.equal(edit.sourceChangesData(flow, []), false);
	assert.equal(edit.sourceChangesData(undefined, ['x']), true);
	assert.deepEqual(edit.readOnlyToolNames(flow), ['list_invoices', 'get_invoice']);
	assert.deepEqual(edit.readOnlyToolNames(drive), ['search_files', 'read_file']);
});

test('a program card reads "อ่านอย่างเดียว · N อย่าง" or "อ่านและแก้ไข", and says when it is narrowed', () => {
	assert.equal(edit.programSummaryLabel(edit.programSummary(drive, drive.toolNames), th), 'อ่านอย่างเดียว · 2 อย่าง');
	assert.equal(edit.programSummaryLabel(edit.programSummary(flow, flow.toolNames), th), 'อ่านและแก้ไข · 4 อย่าง');
	assert.equal(edit.programSummaryLabel(edit.programSummary(flow, ['list_invoices']), th), 'อ่านอย่างเดียว · 1 จาก 4 อย่าง');
	assert.equal(edit.programSummaryLabel(edit.programSummary(flow, ['list_invoices']), en), 'Read only · 1 of 4');
	const withStale = { ...flow, toolNames: [...flow.toolNames, 'not_reviewed'] };
	assert.equal(edit.programSummary(withStale, []).total, 4, 'only reviewed tools count as allowed');
});

test('hubInput starts from the workspace as saved now, keeps every field, applies the patch and sends its version', () => {
	const input = edit.hubInput(hub, { name: 'ใหม่' });
	assert.deepEqual(input, {
		name: 'ใหม่', description: 'เดิม', connectionID: 'conn-flow', toolNames: ['list_invoices'],
		sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }, { connectionID: 'conn-drive', toolNames: ['search_files'] }],
		memberIDs: ['u-owner', 'u-a'], unitIDs: ['legacy'], dailyLimit: 200, status: 'active',
		userSourceID: '', instructions: 'ตอบเป็นไทย', writeMode: 'approval', accessUnitIDs: ['dept-acc'], version: 7
	});
	for (const key of ['effectiveMemberIDs', 'usedToday', 'connectURL', 'id', 'createdAt']) assert.equal(key in input, false, key);
	// The patch never changes the version, and the first program is mirrored.
	const moved = edit.hubInput(hub, { version: 1, sources: [{ connectionID: 'conn-drive', toolNames: ['read_file'] }] });
	assert.equal(moved.version, 7);
	assert.equal(moved.connectionID, 'conn-drive');
	assert.deepEqual(moved.toolNames, ['read_file']);
	// Nothing in the input is shared with the saved workspace.
	moved.sources[0].toolNames.push('x');
	input.memberIDs.push('x');
	assert.deepEqual(hub.memberIDs, ['u-owner', 'u-a']);
});

test('hubInput leaves out what the server keeps when absent, and reads legacy single-program workspaces', () => {
	const legacy = { ...hub, sources: undefined, instructions: undefined, writeMode: undefined, accessUnitIDs: null, userSourceID: undefined };
	const input = edit.hubInput(legacy);
	assert.equal('instructions' in input, false);
	assert.equal('writeMode' in input, false);
	assert.equal('accessUnitIDs' in input, false);
	assert.equal('userSourceID' in input, false);
	assert.deepEqual(input.sources, [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }]);
	const empty = edit.hubInput({ ...hub, sources: undefined, connectionID: '', toolNames: [] });
	assert.deepEqual(empty.sources, []);
	assert.equal(empty.connectionID, '');
});

test('patches add and remove on top of what is saved now, so someone else\'s change survives', () => {
	const fresh = { ...hub, memberIDs: ['u-owner', 'u-a', 'u-new'], accessUnitIDs: ['dept-acc', 'dept-new'] };
	assert.deepEqual(edit.membersPatch(fresh, { add: ['u-b', 'u-a'], remove: ['u-owner'] }), { memberIDs: ['u-a', 'u-new', 'u-b'] });
	assert.deepEqual(edit.departmentsPatch(fresh, { remove: ['dept-acc'] }), { accessUnitIDs: ['dept-new'] });
	assert.deepEqual(edit.departmentsPatch({ ...hub, accessUnitIDs: undefined }, { add: ['d'] }), { accessUnitIDs: ['d'] });
	assert.deepEqual(edit.programsPatch(fresh, { 'conn-drive': null, 'conn-new': ['a'] }), {
		sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }, { connectionID: 'conn-new', toolNames: ['a'] }]
	});
	assert.deepEqual(edit.programsPatch(fresh, { 'conn-flow': ['get_invoice', 'list_invoices'] }).sources[0], { connectionID: 'conn-flow', toolNames: ['get_invoice', 'list_invoices'] });
	assert.deepEqual(edit.changedFields({ name: 'a', dailyLimit: 100, writeMode: 'direct' }, { name: 'a', dailyLimit: 150, writeMode: 'approval' }), { dailyLimit: 150, writeMode: 'approval' });
});

test('saveHubPatch GETs the workspace first, PUTs with its version, and turns a 409 into "มีคนแก้พื้นที่นี้พร้อมกัน"', async () => {
	const calls = [];
	const saved = { ...hub, version: 9 };
	const service = {
		hub: async (id) => { calls.push(['get', id]); return { ...hub, version: 8, memberIDs: ['u-owner', 'u-a', 'u-late'] }; },
		save: async (input, id) => { calls.push(['put', id, input.version, input.memberIDs]); return saved; },
		status: (error) => error?.status
	};
	const result = await edit.saveHubPatch('hub-one', (fresh) => edit.membersPatch(fresh, { add: ['u-b'] }), service);
	assert.equal(result, saved);
	assert.deepEqual(calls, [['get', 'hub-one'], ['put', 'hub-one', 8, ['u-owner', 'u-a', 'u-late', 'u-b']]]);

	const conflict = { ...service, save: async () => { throw Object.assign(new Error('409'), { status: 409 }); } };
	await assert.rejects(edit.saveHubPatch('hub-one', () => ({}), conflict), edit.HubConflictError);
	const other = { ...service, save: async () => { throw Object.assign(new Error('boom'), { status: 400 }); } };
	await assert.rejects(edit.saveHubPatch('hub-one', () => ({}), other), /boom/);
	const missing = { ...service, hub: async () => { throw Object.assign(new Error('gone'), { status: 404 }); } };
	await assert.rejects(edit.saveHubPatch('hub-one', () => ({}), missing), /gone/);
	assert.equal(edit.hubConflictMessage(th), 'มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่');
	assert.match(edit.hubRuleMessage('an active Gateway requires a connection, reviewed tools, and members or departments', th), /ต้องมีอย่างน้อย 1 โปรแกรม และ 1 คนหรือแผนก/);
	assert.equal(edit.hubRuleMessage('something else', th), undefined);
});

test('"add me" (เชื่อม AI ของฉัน, คลังความรู้) is one saveHubPatch: fresh GET, whole workspace back with its version, no write when already in', async () => {
	const calls = [];
	const fresh = { ...hub, memberIDs: ['u-owner'], version: 4, sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }] };
	const service = {
		hub: async (id) => { calls.push(['get', id]); return structuredClone(fresh); },
		save: async (input, id) => { calls.push(['put', id, input]); return { ...fresh, ...input, version: 5 }; },
		status: (error) => error?.status
	};
	const saved = await edit.saveHubPatch('hub-one', (current) => edit.joinPatch(current, 'me'), service);
	assert.deepEqual(calls.map((call) => call.slice(0, 2)), [['get', 'hub-one'], ['put', 'hub-one']]);
	const input = calls[1][2];
	assert.equal(input.version, 4);
	assert.deepEqual(input.memberIDs, ['u-owner', 'me']);
	// Everything else goes back as saved, so nothing another admin set is wiped.
	assert.deepEqual(input.sources, [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }]);
	assert.deepEqual(input.accessUnitIDs, ['dept-acc']);
	assert.deepEqual([input.instructions, input.writeMode, input.dailyLimit, input.status, input.description], ['ตอบเป็นไทย', 'approval', 200, 'active', 'เดิม']);
	assert.equal(saved.version, 5);
	// Already a member: no write at all.
	calls.length = 0;
	const again = await edit.saveHubPatch('hub-one', (current) => edit.joinPatch(current, 'u-owner'), service);
	assert.deepEqual(calls.map((call) => call[0]), ['get']);
	assert.equal(again.version, 4);
	assert.equal(edit.joinPatch({ ...fresh, memberIDs: null }, 'me').memberIDs.length, 1, 'a workspace without members yet');
	// Someone else saved in between: the one conflict message.
	const conflict = { ...service, save: async () => { throw Object.assign(new Error('409'), { status: 409 }); } };
	await assert.rejects(edit.saveHubPatch('hub-one', (current) => edit.joinPatch(current, 'me'), conflict), edit.HubConflictError);
});

test('hubInput sends the whole workspace back: a legacy one keeps its program, absent fields stay absent', () => {
	const fresh = {
		...hub, id: 'h', name: 'h', memberIDs: ['a'], accessUnitIDs: ['sales'], unitIDs: ['label'], instructions: 'ตอบภาษาไทย', writeMode: 'approval',
		connectionID: 'c', toolNames: ['t'], sources: [{ connectionID: 'c', toolNames: ['t'] }], userSourceID: 'sso', description: 'd', dailyLimit: 50, status: 'paused', version: 9
	};
	assert.deepEqual(edit.hubInput(fresh, edit.joinPatch(fresh, 'me')), {
		name: 'h', description: 'd', connectionID: 'c', toolNames: ['t'], sources: [{ connectionID: 'c', toolNames: ['t'] }],
		memberIDs: ['a', 'me'], unitIDs: ['label'], accessUnitIDs: ['sales'], userSourceID: 'sso', dailyLimit: 50, status: 'paused',
		instructions: 'ตอบภาษาไทย', writeMode: 'approval', version: 9
	});
	// A legacy workspace without `sources` keeps its one program; a missing list is empty.
	const legacy = edit.hubInput({ ...fresh, sources: undefined, memberIDs: null, accessUnitIDs: undefined, instructions: undefined, writeMode: undefined });
	assert.deepEqual(legacy.sources, [{ connectionID: 'c', toolNames: ['t'] }]);
	assert.deepEqual(legacy.memberIDs, []);
	assert.ok(!('accessUnitIDs' in legacy) && !('instructions' in legacy) && !('writeMode' in legacy), 'absent stays absent, so the server keeps it');
});

test('hubWriteService reads and saves the workspace in the page\'s company, and names a conflict in Thai', async () => {
	const code = stripTypeScriptTypes(await readFile(new URL('../services/orca-workspaces.ts', import.meta.url), 'utf8'))
		.replace(/^import[^;]+;/gm, '')
		.replace(/^export /gm, '');
	const companyURL = await typescriptModuleURL(new URL('./company.ts', import.meta.url));
	const { service, setPageCompany } = await import('data:text/javascript;base64,' + Buffer.from(`import { orcaPath, setPageCompany } from ${JSON.stringify(companyURL)};
export { setPageCompany };
export function service(doGet, OrcaService, parseErrorContent, t, HubConflictError, hubConflictMessage, hubRuleMessage, orcaError) { ${code}; return { hubWriteService, workspaceWriteError }; }`).toString('base64'));
	const calls = [];
	const stored = { ...hub, id: 'h 1', memberIDs: ['a'], version: 4 };
	const { hubWriteService, workspaceWriteError } = service(
		async (path) => { calls.push(['GET', path]); return structuredClone(stored); },
		{ hub: async (input, id) => { calls.push(['PUT', id, input]); return { ...stored, ...input }; } },
		(error) => ({ status: error?.status, message: error?.message ?? '' }),
		th, edit.HubConflictError, edit.hubConflictMessage, edit.hubRuleMessage, () => 'server said no'
	);
	const company = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
	setPageCompany(company, [{ id: company }]);
	try {
		await edit.saveHubPatch('h 1', (fresh) => edit.joinPatch(fresh, 'me'), hubWriteService);
		assert.deepEqual(calls.map((call) => call.slice(0, 2)), [['GET', `/orca/orgs/${company}/hubs/h%201`], ['PUT', 'h 1']]);
		assert.equal(calls[1][2].version, 4);
		assert.deepEqual(calls[1][2].memberIDs, ['a', 'me']);
		calls.length = 0;
		await edit.saveHubPatch('h 1', (fresh) => edit.joinPatch(fresh, 'a'), hubWriteService);
		assert.deepEqual(calls.map((call) => call[0]), ['GET'], 'already a member: no write');
	} finally {
		setPageCompany('default', []);
	}
	assert.equal(workspaceWriteError(new edit.HubConflictError()), 'มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่');
	assert.equal(workspaceWriteError({ status: 409 }), 'มีคนแก้พื้นที่นี้พร้อมกัน โหลดใหม่');
	assert.match(workspaceWriteError({ status: 400, message: 'an active Gateway requires a connection, reviewed tools, and members or departments' }), /ต้องมีอย่างน้อย 1 โปรแกรม/);
	assert.equal(workspaceWriteError({ status: 500 }), 'server said no');
});

test('hubInput never hands back the fresh record\'s own lists', () => {
	const input = edit.hubInput(hub, {});
	assert.notEqual(input.sources, hub.sources);
	assert.notEqual(input.memberIDs, hub.memberIDs);
	assert.notEqual(input.sources[0].toolNames, hub.sources[0].toolNames);
});

const members = [
	{ id: 'u-owner', displayName: 'วิภา', email: 'o@example.test', role: 'owner', status: 'active' },
	{ id: 'u-a', displayName: 'ธนา', email: 'a@example.test', role: 'admin', status: 'active' },
	{ id: 'u-b', displayName: 'มาลี', email: 'b@example.test', role: 'employee' },
	{ id: 'u-gone', displayName: 'อดีต', email: 'g@example.test', role: 'employee', status: 'suspended' }
];
const units = [
	{ id: 'dept-acc', name: 'ฝ่ายบัญชี', kind: 'department', parentID: '', version: 1 },
	{ id: 'dept-old', name: 'เก่า', kind: 'department', parentID: '', version: 1, archivedAt: '2026-01-01' },
	{ id: 'team-x', name: 'ทุกคน', kind: 'team', parentID: '', version: 1 }
];
const form = (overrides = {}) => ({ name: 'ฝ่ายบัญชี', description: '', instructions: '', dailyLimit: 100, writeMode: 'approval', programs: { 'conn-drive': ['search_files'] }, memberIDs: ['u-owner'], accessUnitIDs: [], ...overrides });
const context = { connections: [flow, drive], members, units };

test('the create form reports every problem at once; a draft needs only a name and a valid limit', () => {
	assert.deepEqual(edit.workspaceFormErrors(form(), context, 'active', th), {});
	const empty = form({ name: '  ', programs: {}, memberIDs: [], dailyLimit: 0 });
	const errors = edit.workspaceFormErrors(empty, context, 'active', th);
	assert.deepEqual(Object.keys(errors), [edit.FORM_FIELDS.name, edit.FORM_FIELDS.programs, edit.FORM_FIELDS.people, edit.FORM_FIELDS.limit]);
	assert.equal(errors[edit.FORM_FIELDS.programs], 'เปิดอย่างน้อย 1 โปรแกรม');
	assert.deepEqual(Object.keys(edit.workspaceFormErrors(form({ programs: {}, memberIDs: [] }), context, 'draft', th)), []);
	assert.deepEqual(Object.keys(edit.workspaceFormErrors(form({ name: '' }), context, 'draft', th)), [edit.FORM_FIELDS.name]);
	const bad = edit.workspaceFormErrors(form({ programs: { 'conn-flow': [], 'conn-gone': ['x'] }, memberIDs: ['u-gone'], accessUnitIDs: ['dept-old'] }), context, 'draft', th);
	assert.match(bad[edit.FORM_FIELDS.programs], /FlowAccount: เลือกสิ่งที่ AI ทำได้อย่างน้อย 1 อย่าง/);
	assert.match(bad[edit.FORM_FIELDS.programs], /โปรแกรมที่เลือก ยังใช้ไม่ได้/);
	assert.match(bad[edit.FORM_FIELDS.people], /ถูกระงับ/);
	assert.match(bad[edit.FORM_FIELDS.people], /แผนกที่ถูกจัดเก็บ/);
	assert.match(edit.workspaceFormErrors(form({ programs: { 'conn-flow': ['not_allowed'] } }), context, 'active', th)[edit.FORM_FIELDS.programs], /ไม่อนุญาตแล้ว/);
	assert.ok(edit.workspaceFormErrors(form({ name: 'ก'.repeat(121) }), context, 'active', th)[edit.FORM_FIELDS.name]);
	assert.equal(edit.limitValid(1_000_000), true);
	assert.equal(edit.limitValid(1.5), false);
	assert.equal(edit.limitValid(undefined), false);
});

test('a new workspace is sent with every program, its approval choice and the default daily limit', () => {
	const input = edit.newHubInput(form({ name: ' ฝ่ายบัญชี ', programs: { 'conn-flow': ['list_invoices'], 'conn-drive': ['read_file'] }, accessUnitIDs: ['dept-acc'], dailyLimit: undefined }), 'active');
	assert.deepEqual(input, {
		name: 'ฝ่ายบัญชี', description: '', instructions: '', writeMode: 'approval',
		sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }, { connectionID: 'conn-drive', toolNames: ['read_file'] }],
		connectionID: 'conn-flow', toolNames: ['list_invoices'], memberIDs: ['u-owner'], accessUnitIDs: ['dept-acc'], unitIDs: [], userSourceID: '',
		dailyLimit: 100, status: 'active'
	});
	assert.equal(edit.newHubInput(form(), 'draft').status, 'draft');
});

test('the sticky summary counts people once across departments and names each program\'s access', () => {
	const departments = [{ unitID: 'dept-acc', memberIDs: ['u-a', 'u-b'] }];
	assert.equal(edit.audienceCount(['u-owner', 'u-a'], ['dept-acc'], departments), 3);
	assert.equal(edit.audienceCount(['u-owner'], ['dept-unknown'], departments), 1);
	assert.deepEqual(edit.formSummaryParts({ name: 'ฝ่ายบัญชี', programs: { 'conn-drive': ['search_files'] } }, [flow, drive], 2, th), ['ฝ่ายบัญชี', 'Google Drive (อ่านอย่างเดียว)', '2 คน']);
	assert.deepEqual(edit.formSummaryParts({ name: '', programs: {} }, [flow, drive], 1, en), ['New workspace', 'No programs yet', '1 person']);
	assert.equal(edit.formChangesData({ 'conn-drive': ['search_files'], 'conn-flow': ['get_invoice'] }, [flow, drive]), false);
	assert.equal(edit.formChangesData({ 'conn-flow': ['create_quotation'] }, [flow, drive]), true);
});

test('a form in progress survives a trip to add a program, once, for an hour, in its own company', () => {
	const store = new Map();
	const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
	edit.saveFormDraft(storage, 'default', form({ name: 'ร่าง' }), 1000);
	assert.equal(edit.takeFormDraft(storage, 'org-other', 2000), undefined);
	const back = edit.takeFormDraft(storage, 'default', 2000);
	assert.equal(back.name, 'ร่าง');
	assert.deepEqual(back.programs, { 'conn-drive': ['search_files'] });
	assert.equal(edit.takeFormDraft(storage, 'default', 2000), undefined, 'read once');
	edit.saveFormDraft(storage, 'default', form(), 0);
	assert.equal(edit.takeFormDraft(storage, 'default', 2 * 60 * 60 * 1000), undefined, 'too old');
	store.set(edit.draftKey('default'), '{not json');
	assert.equal(edit.takeFormDraft(storage, 'default', 0), undefined);
	store.set(edit.draftKey('default'), JSON.stringify({ savedAt: 0, form: { name: 7, programs: { a: ['x', 3] }, memberIDs: 'no', writeMode: 'weird' } }));
	assert.deepEqual(edit.takeFormDraft(storage, 'default', 0), { name: '', description: '', instructions: '', dailyLimit: 100, writeMode: 'approval', programs: { a: ['x'] }, memberIDs: [], accessUnitIDs: [] });
	const throwing = { setItem() { throw new Error('full'); }, getItem() { throw new Error('blocked'); }, removeItem() {} };
	edit.saveFormDraft(throwing, 'default', form());
	assert.equal(edit.takeFormDraft(throwing, 'default'), undefined);
	assert.equal(edit.takeFormDraft(undefined, 'default'), undefined);
});

const company = {
	organization: { displayName: 'บริษัท ตัวอย่าง จำกัด' }, currentUserID: 'u-owner', members, units,
	hubs: [{ ...hub, id: 'hub-archived', name: 'บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท', status: 'archived' }]
};

test('the one-click plan: everyone active including me, the program\'s allowed tools, approval when anything changes data', () => {
	const plan = edit.everyonePlan(company, flow);
	assert.equal(plan.name, 'บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท');
	assert.deepEqual(plan.memberIDs, ['u-owner', 'u-a', 'u-b']);
	assert.deepEqual(plan.toolNames, flow.toolNames);
	assert.equal(plan.changesData, true);
	assert.equal(plan.department, undefined, 'a team named ทุกคน is not the department');
	assert.equal(plan.existing, undefined, 'an archived company-wide workspace is not reused');
	assert.equal(edit.everyoneSummary(plan, th), 'ทุกคน 3 คน · ต้องอนุมัติก่อน');
	const readOnly = edit.everyonePlan(company, drive);
	assert.equal(edit.everyoneSummary(readOnly, th), 'ทุกคน 3 คน · อ่านอย่างเดียว');
	const everyone = { id: 'dept-all', name: ' ทุกคน ', kind: 'department', parentID: '', version: 2 };
	assert.equal(edit.everyonePlan({ ...company, units: [...units, everyone] }, drive).department, everyone);
	assert.equal(edit.everyoneDepartment([{ ...everyone, archivedAt: 'x' }]), undefined);
	assert.equal(edit.companyWideName('  '), 'ORCA · ทั้งบริษัท');
	assert.deepEqual(edit.everyonePlan({ ...company, currentUserID: 'u-outsider' }, drive).memberIDs, ['u-owner', 'u-a', 'u-b'], 'someone who is not an active member is never put in the department');
});

function everyoneService(overrides = {}) {
	const calls = [];
	const service = {
		createUnit: async (input) => { calls.push(['unit', input]); return { id: 'dept-new', name: input.name, kind: 'department', parentID: '', version: 1 }; },
		departments: async () => { calls.push(['departments']); return [{ unitID: 'dept-new', memberIDs: [], version: 0 }]; },
		saveDepartment: async (id, memberIDs, version) => { calls.push(['department', id, memberIDs, version]); },
		createHub: async (input) => { calls.push(['hub', input]); return { ...hub, ...input, id: 'hub-new' }; },
		hub: {
			hub: async (id) => { calls.push(['get', id]); return { ...hub, id, writeMode: '', status: 'paused' }; },
			save: async (input, id) => { calls.push(['put', id, input]); return { ...hub, ...input, id }; },
			status: (error) => error?.status
		},
		onstep: (step) => calls.push(['step', step]),
		...overrides
	};
	return { calls, service };
}

test('the one click makes "ทุกคน" once, fills it with everyone, then an active workspace granting it with approval', async () => {
	const { calls, service } = everyoneService();
	const created = await edit.runEveryone(edit.everyonePlan(company, flow), service);
	assert.equal(created.id, 'hub-new');
	assert.deepEqual(calls.map((call) => call[0] === 'step' ? `step:${call[1]}` : call[0]), ['step:department', 'unit', 'step:members', 'departments', 'department', 'step:workspace', 'hub']);
	assert.deepEqual(calls[1][1], { name: 'ทุกคน', kind: 'department', parentID: '' });
	assert.deepEqual(calls[4].slice(1), ['dept-new', ['u-owner', 'u-a', 'u-b'], 0]);
	const input = calls.at(-1)[1];
	assert.equal(input.name, 'บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท');
	assert.equal(input.status, 'active');
	assert.equal(input.writeMode, 'approval');
	assert.deepEqual(input.accessUnitIDs, ['dept-new']);
	assert.deepEqual(input.memberIDs, []);
	assert.deepEqual(input.sources, [{ connectionID: 'conn-flow', toolNames: flow.toolNames }]);
	assert.equal(input.dailyLimit, 100);
});

test('the one click reuses the department, keeps people already in it, and skips a save that changes nothing', async () => {
	const everyone = { id: 'dept-all', name: 'ทุกคน', kind: 'department', parentID: '', version: 2 };
	const plan = edit.everyonePlan({ ...company, units: [...units, everyone] }, drive);
	const { calls, service } = everyoneService({
		departments: async () => [{ unitID: 'dept-all', memberIDs: ['u-owner', 'u-a', 'u-b', 'u-extra'], version: 4 }]
	});
	await edit.runEveryone(plan, service);
	assert.equal(calls.some((call) => call[0] === 'unit' || call[0] === 'department'), false);
	const second = everyoneService({ departments: async () => [{ unitID: 'dept-all', memberIDs: ['u-extra'], version: 4 }] });
	await edit.runEveryone(plan, second.service);
	assert.deepEqual(second.calls.find((call) => call[0] === 'department').slice(1), ['dept-all', ['u-extra', 'u-owner', 'u-a', 'u-b'], 4]);
});

test('the one click reads the department again once after a 409, and gives up after a second', async () => {
	let reads = 0;
	let saves = 0;
	const { service } = everyoneService({
		departments: async () => [{ unitID: 'dept-new', memberIDs: [], version: reads++ }],
		saveDepartment: async (_id, _members, version) => { saves += 1; if (version === 0) throw Object.assign(new Error('409'), { status: 409 }); }
	});
	await edit.runEveryone(edit.everyonePlan(company, drive), service);
	assert.equal(saves, 2);
	const always = everyoneService({ saveDepartment: async () => { throw Object.assign(new Error('409'), { status: 409 }); } });
	await assert.rejects(edit.runEveryone(edit.everyonePlan(company, drive), always.service), /409/);
});

test('a company-wide workspace made before gets the program added, the department granted and stays on approval', async () => {
	const existing = { ...hub, id: 'hub-all', name: 'บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท', status: 'paused' };
	const plan = edit.everyonePlan({ ...company, hubs: [existing] }, drive);
	assert.equal(plan.existing, existing);
	const { calls, service } = everyoneService();
	await edit.runEveryone(plan, service);
	const put = calls.find((call) => call[0] === 'put');
	assert.equal(put[1], 'hub-all');
	assert.deepEqual(put[2].sources.map((source) => source.connectionID), ['conn-flow', 'conn-drive']);
	assert.deepEqual(put[2].sources[1].toolNames, ['search_files', 'read_file'], 'the program\'s saved tools are kept and the rest added');
	assert.deepEqual(put[2].accessUnitIDs, ['dept-acc', 'dept-new']);
	assert.equal(put[2].status, 'active');
	assert.equal('writeMode' in put[2], false, 'a read-only program leaves the saved mode alone');
	const writes = everyoneService();
	await edit.runEveryone(edit.everyonePlan({ ...company, hubs: [existing] }, flow), writes.service);
	assert.equal(writes.calls.find((call) => call[0] === 'put')[2].writeMode, 'approval');
});

test('a retry after a failed one click reuses the "ทุกคน" it already made instead of making a second', async () => {
	let made;
	let fail = true;
	const first = everyoneService({
		createHub: async () => { if (fail) throw Object.assign(new Error('boom'), { status: 500 }); return { ...hub, id: 'hub-new' }; }
	});
	first.service.ondepartment = (unit) => { made = unit; };
	const plan = edit.everyonePlan(company, drive);
	await assert.rejects(edit.runEveryone(plan, first.service), /boom/);
	assert.equal(made?.id, 'dept-new', 'the new department is reported before the later steps');
	fail = false;
	const again = everyoneService();
	await edit.runEveryone({ ...plan, department: made }, again.service);
	assert.equal(again.calls.some((call) => call[0] === 'unit'), false, 'no second department');
	assert.deepEqual(again.calls.find((call) => call[0] === 'hub')[1].accessUnitIDs, ['dept-new']);
});

test('adding the program to a company-wide workspace drops tools the program no longer allows', async () => {
	const existing = { ...hub, id: 'hub-all', name: 'บริษัท ตัวอย่าง จำกัด · ทั้งบริษัท', sources: [{ connectionID: 'conn-drive', toolNames: ['dropped_tool', 'read_file'] }] };
	const { calls, service } = everyoneService({ hub: { hub: async () => existing, save: async (input, id) => { calls.push(['put', id, input]); return { ...existing, ...input }; }, status: (error) => error?.status } });
	await edit.runEveryone(edit.everyonePlan({ ...company, hubs: [existing] }, drive), service);
	assert.deepEqual(calls.find((call) => call[0] === 'put')[2].sources, [{ connectionID: 'conn-drive', toolNames: ['read_file', 'search_files'] }]);
});

test('my AI reaches a workspace through a sign-in, a key for every workspace or a key for this one', () => {
	assert.equal(edit.aiReachesWorkspace({ sessions: [], keys: [] }, 'hub-one'), false);
	assert.equal(edit.aiReachesWorkspace({ sessions: [{ id: 's' }], keys: [] }, 'hub-one'), true);
	assert.equal(edit.aiReachesWorkspace({ sessions: [], keys: [{ hubID: '' }] }, 'hub-one'), true);
	assert.equal(edit.aiReachesWorkspace({ sessions: [], keys: [{ hubID: 'hub-one' }] }, 'hub-one'), true);
	assert.equal(edit.aiReachesWorkspace({ sessions: [], keys: [{ hubID: 'hub-other' }] }, 'hub-one'), false, 'a key for another workspace');
});

test('the invite message points to เชื่อม AI ของฉัน in the phone\'s browser, in this company', () => {
	assert.equal(edit.connectAILink('https://orca.example.test', 'default'), 'https://orca.example.test/app?view=connect-ai&openExternalBrowser=1');
	const other = edit.connectAILink('https://orca.example.test/', 'org-11111111-2222-4333-8444-555555555555');
	assert.equal(new URL(other).searchParams.get('org'), 'org-11111111-2222-4333-8444-555555555555');
	assert.equal(new URL(other).searchParams.get('openExternalBrowser'), '1');
	const message = edit.workspaceInviteMessage({ company: 'บริษัท ตัวอย่าง', workspace: 'ฝ่ายบัญชี', programs: ['FlowAccount', 'Google Drive'], link: 'https://x.test/app?view=connect-ai&openExternalBrowser=1' }, th);
	assert.match(message, /ฝ่ายบัญชี/);
	assert.match(message, /FlowAccount, Google Drive/);
	assert.match(message, /เชื่อม AI ของฉัน/);
	assert.ok(message.endsWith('https://x.test/app?view=connect-ai&openExternalBrowser=1'));
	assert.doesNotMatch(message, /MCP|OAuth|คีย์/);
	assert.match(edit.samplePrompt('FlowAccount', th), /ใบแจ้งหนี้/);
	assert.match(edit.samplePrompt('Something', en), /Something/);
	assert.match(edit.samplePrompt('LINE OA', th), /ข้อความสำคัญ/);
	assert.doesNotMatch(edit.samplePrompt('Pipeline CRM', th), /ข้อความสำคัญ/, 'LINE is a word, not any "line"');
});

test('the one-click and create addresses stay put, and the old edit forms land on the tabs', async () => {
	const { appNavigation } = await importTypeScript(new URL('./navigation.ts', import.meta.url));
	const owner = { canManage: true, platformOperator: false };
	const land = (search) => appNavigation(new URLSearchParams(search), { role: owner, hubs: [{ id: 'hub-one' }] });
	assert.equal(land('view=new&everyone=1&connection=conn-flow').redirect, undefined);
	assert.equal(land('view=new&connection=conn-flow').redirect, undefined);
	assert.equal(land('view=hub&hub=hub-one&created=1').redirect, undefined);
	assert.equal(land('view=new&edit=hub-one').redirect, '/app?view=hub&hub=hub-one&tab=settings');
	assert.equal(land('view=new&edit=hub-one&step=tools').redirect, '/app?view=hub&hub=hub-one&tab=programs');
	assert.equal(land('view=hub&hub=hub-one&tab=settings&step=tools').redirect, '/app?view=hub&hub=hub-one&tab=programs');
});

test('the first change action added on โปรแกรม turns approval on; a workspace already changing data directly keeps its choice', () => {
	const connections = [flow, drive];
	// hub-sales: runs changes at once, read-only so far.
	const direct = { ...hub, writeMode: 'direct', sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices'] }] };
	const adding = { 'conn-flow': ['list_invoices', 'create_quotation'] };
	assert.equal(edit.approvalTurnsOn(direct, edit.programsPatch(direct, adding).sources, connections), true);
	assert.deepEqual(edit.programsSavePatch(direct, adding, connections), {
		sources: [{ connectionID: 'conn-flow', toolNames: ['list_invoices', 'create_quotation'] }],
		writeMode: 'approval'
	});
	// No writeMode at all is the backend's direct.
	assert.equal(edit.programsSavePatch({ ...direct, writeMode: undefined }, adding, connections).writeMode, 'approval');
	// A program turned on from add-program step 4 with its change actions (&add=).
	const peak = { ...flow, id: 'conn-peak', name: 'PEAK' };
	assert.equal(edit.programsSavePatch(direct, { 'conn-peak': peak.toolNames }, [...connections, peak]).writeMode, 'approval');
	// Only reading added: nothing to approve.
	assert.equal(edit.programsSavePatch(direct, { 'conn-drive': ['search_files'] }, connections).writeMode, undefined);
	// Already direct with change actions: the owner chose it, so it stays.
	const chosen = { ...direct, sources: [{ connectionID: 'conn-flow', toolNames: ['create_quotation'] }] };
	assert.equal(edit.approvalTurnsOn(chosen, [{ connectionID: 'conn-flow', toolNames: ['create_quotation', 'send_email'] }], connections), false);
	assert.equal(edit.programsSavePatch(chosen, { 'conn-flow': ['create_quotation', 'send_email'] }, connections).writeMode, undefined);
	// Approval already on: never sent back to direct, and nothing extra is sent.
	assert.equal(edit.programsSavePatch(hub, adding, connections).writeMode, undefined);
	assert.equal(edit.hubInput(hub, edit.programsSavePatch(hub, adding, connections)).writeMode, 'approval');
	assert.equal(edit.sourcesChangeData([{ connectionID: 'conn-drive', toolNames: ['search_files'] }], connections), false);
	assert.equal(edit.sourcesChangeData([{ connectionID: 'gone', toolNames: ['x'] }], connections), true);
});
