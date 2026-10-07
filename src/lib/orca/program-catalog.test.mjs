import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const catalog = await importTypeScript(new URL('./program-catalog.ts', import.meta.url));
const { catalogSource } = await importTypeScript(new URL('./catalog.ts', import.meta.url));
const { appNavigation } = await importTypeScript(new URL('./navigation.ts', import.meta.url));
const {
	PROGRAM_CHIPS, programCategory, programCard, programDisplayName, programLine, recommendedPrograms, pickerPrograms, availableChips,
	programStep, programStepHref, programCancelHref, programReturnHref, programConnectedHref, programEventOutcome, finishAction, teamSizeFor, programStatus, uniqueProgramName,
	draftKey, readDraft, writeDraft, clearDraft, DRAFT_TTL_MS
} = catalog;

const source = (id, name, extra = {}) => ({ id, name, protocol: 'MCP', setupStatus: 'available', ...extra });
const sources = [
	source('s-flow', 'FlowAccount'),
	source('s-peak', 'PEAK'),
	source('s-drive', 'Google Drive', { managedProvider: 'google-drive' }),
	source('default-orca-api-line-messaging', 'LINE Messaging API', { protocol: 'API', managedProvider: 'line-messaging' }),
	source('s-gmail', 'Gmail'),
	source('s-outlook', 'Microsoft Outlook', { setupStatus: 'admin_setup_required', setupCanConfigure: true }),
	source('s-canva', 'Canva', { setupStatus: 'review_required' }),
	source('s-stripe', 'Stripe')
];
const nobody = { connections: [], operator: false };

test('one chip at most: เชื่อมแล้ว opens the program, เร็วๆ นี้ for what the ORCA team still has to set up', () => {
	const tools = sources.map(catalogSource);
	const outlook = tools.find((item) => item.name === 'Microsoft Outlook');
	const canva = tools.find((item) => item.name === 'Canva');
	assert.deepEqual(programCard(tools[0], nobody), { state: 'available' });
	assert.deepEqual(programCard(tools[0], { connections: [{ id: 'c1', mcpID: 's-flow' }], operator: false }), { state: 'connected', connectionID: 'c1' });
	// An archived or deleted connection does not count as connected.
	assert.equal(programCard(tools[0], { connections: [{ id: 'c1', mcpID: 's-flow', archivedAt: 'x' }], operator: false }).state, 'available');
	// Customers see admin setup and review as เร็วๆ นี้; the ORCA team can open them to set them up.
	assert.equal(programCard(outlook, nobody).state, 'soon');
	assert.equal(programCard(canva, nobody).state, 'soon');
	assert.equal(programCard(outlook, { connections: [], operator: true }).state, 'available');
	assert.equal(programCard({ ...outlook, setupCanConfigure: false }, { connections: [], operator: true }).state, 'soon');
	assert.equal(programCard(canva, { connections: [], operator: true }).state, 'available');
	assert.equal(programCard({ ...tools[0], guideOnly: true }, { connections: [], operator: true }).state, 'soon');
});

test('recommended for Thai businesses: FlowAccount, PEAK, Google Drive and LINE OA, filled up to four', () => {
	const tools = sources.map(catalogSource);
	assert.deepEqual(recommendedPrograms(tools).map((item) => item.id), ['s-flow', 's-peak', 's-drive', 'default-orca-api-line-messaging']);
	assert.deepEqual(recommendedPrograms(tools.filter((item) => item.name !== 'PEAK')).map((item) => item.name), ['FlowAccount', 'Google Drive', 'LINE Messaging API', 'Gmail']);
	const line = tools.find((item) => item.id === 'default-orca-api-line-messaging');
	// Both names the owner knows: LINE OA, and the Messaging API it connects through (C4 §14l).
	assert.equal(programDisplayName(line), 'LINE OA (Messaging API)');
	assert.equal(programDisplayName(tools[0]), 'FlowAccount');
	assert.equal(programDisplayName({ id: 'custom-line', name: 'LINE Messaging API' }), 'LINE Messaging API', 'only the native connector is renamed');
	// The LINE line never promises reading customer chats (there is no webhook), and says every send waits for approval.
	assert.doesNotMatch(programLine(line)[0], /แชทลูกค้า/);
	assert.deepEqual(programLine(line), ['ดูสถิติเพื่อน ส่งข้อความ ตั้งริชเมนู ทุกการส่งรอผู้ดูแลอนุมัติ', "Friend statistics, messages and rich menus; every send waits for an admin's approval"]);
	assert.equal(programLine(tools[0])[0], 'ดูใบเสนอราคา ใบแจ้งหนี้ และรายรับรายจ่าย');
	assert.ok(programLine(tools.find((item) => item.name === 'Stripe'))[0]);
});

test('search and chips narrow the programs; เร็วๆ นี้ goes last and setup guides never appear', () => {
	const all = pickerPrograms([...sources, source('guide-x', 'Guide', { guideOnly: true })], { query: '', chip: 'all' }, nobody);
	assert.ok(!all.some((item) => item.id === 'guide-x'));
	assert.deepEqual(all.slice(-2).map((item) => item.name).sort(), ['Canva', 'Microsoft Outlook']);
	assert.deepEqual(pickerPrograms(sources, { query: '', chip: 'accounting' }, nobody).map((item) => item.name).sort(), ['FlowAccount', 'PEAK']);
	assert.deepEqual(pickerPrograms(sources, { query: 'peak', chip: 'all' }, nobody).map((item) => item.name), ['PEAK']);
	assert.deepEqual(pickerPrograms(sources, { query: 'peak', chip: 'finance' }, nobody), []);
	const chips = availableChips(sources);
	assert.equal(chips[0], 'all');
	assert.ok(chips.includes('accounting') && chips.includes('finance'));
	assert.deepEqual(PROGRAM_CHIPS.map((chip) => chip.th), ['ทั้งหมด', 'บัญชี', 'เอกสาร', 'แชท อีเมล และลูกค้า', 'งานขาย', 'การเงิน']);
	assert.equal(PROGRAM_CHIPS.find((chip) => chip.id === 'chat').en, 'Chat, email & customers', 'Outlook and Gmail sit here');
	assert.deepEqual(programCategory(catalogSource(sources[0])), { th: 'บัญชี', en: 'Accounting' });
});

test('the step and the program live in the address; step 4 needs the saved program', () => {
	const at = (search) => programStep(new URLSearchParams(search));
	assert.equal(at('view=add-program'), 'choose');
	assert.equal(at('view=add-program&step=tools'), 'choose', 'no program: only step 1');
	assert.equal(at('view=add-program&source=s'), 'connect');
	assert.equal(at('view=add-program&source=s&step=tools'), 'tools');
	assert.equal(at('view=add-program&source=s&step=done'), 'connect');
	assert.equal(at('view=add-program&source=s&step=done&connection=c'), 'done');
	assert.equal(at('view=add-program&source=s&step=nope'), 'connect');
	const base = '/app?view=add-program&lang=th&org=org-1&return=new';
	assert.equal(programStepHref(base, 'connect', { source: 'a&b' }), '/app?view=add-program&lang=th&org=org-1&return=new&source=a%26b&step=connect');
	assert.equal(programStepHref(`${base}&source=a&step=connect`, 'choose', { source: null }), '/app?view=add-program&lang=th&org=org-1&return=new&step=choose');
	assert.equal(programStepHref(`${base}&source=a&step=tools`, 'done', { connection: 'c1' }), '/app?view=add-program&lang=th&org=org-1&return=new&source=a&step=done&connection=c1');
	assert.equal(programStepHref(`${base}&source=a&step=done&connection=c1`, 'tools'), '/app?view=add-program&lang=th&org=org-1&return=new&source=a&step=tools');
	// A company account rides with its program: kept from step to step, gone with another program or step 1.
	assert.equal(programStepHref(`${base}&source=a&step=connect`, 'tools', { account: 'pac-1' }), '/app?view=add-program&lang=th&org=org-1&return=new&source=a&step=tools&account=pac-1');
	assert.equal(programStepHref(`${base}&source=a&step=tools&account=pac-1`, 'done', { connection: 'c1' }), '/app?view=add-program&lang=th&org=org-1&return=new&source=a&step=done&account=pac-1&connection=c1');
	assert.equal(programStepHref(`${base}&source=a&step=tools&account=pac-1`, 'tools', { account: null }), '/app?view=add-program&lang=th&org=org-1&return=new&source=a&step=tools');
	assert.equal(programStepHref(`${base}&source=a&step=connect&account=pac-1`, 'connect', { source: 'b' }), '/app?view=add-program&lang=th&org=org-1&return=new&source=b&step=connect');
	assert.equal(programStepHref(`${base}&source=a&step=connect&account=pac-1`, 'choose'), '/app?view=add-program&lang=th&org=org-1&return=new&step=choose');
	assert.equal(programCancelHref('new'), '/app?view=new');
	// W0: back to the catalog dialog, or to the onboarding's second screen.
	assert.equal(programCancelHref(null), '/app?view=servers&catalog=1');
	assert.equal(programCancelHref('welcome'), '/app?view=welcome&page=2');
	assert.equal(programReturnHref('new', 'c 1'), '/app?view=new&connection=c%201');
	assert.equal(programReturnHref('welcome', 'c1'), '/app?view=welcome&page=2');
	assert.equal(programReturnHref(null, 'c1'), '/app?view=servers&catalog=1');
	// Every connect address a step builds is already canonical for the page's router.
	for (const href of [programStepHref(base, 'connect', { source: 's' }), programStepHref(base, 'tools', { source: 's' })]) {
		const route = appNavigation(new URLSearchParams(href.split('?')[1]), { role: { canManage: true, platformOperator: false } });
		assert.equal(route.view, 'add-program');
		assert.equal(route.redirect, undefined, href);
	}
	// W0: step 1 is the catalog dialog and step 4 the program's own page; their old addresses go there.
	const route = (href) => appNavigation(new URLSearchParams(href.split('?')[1]), { role: { canManage: true, platformOperator: false } }).redirect;
	assert.equal(route(programStepHref(base, 'choose')), '/app?view=servers&lang=th&org=org-1&return=new&catalog=1');
	assert.equal(route(programStepHref(base, 'done', { source: 's', connection: 'c' })), '/app?view=servers&lang=th&org=org-1&connection=c');
});

test('step 4: back to the create form, everyone when there is no workspace, otherwise a workspace', () => {
	const hubs = [{ id: 'h1', name: 'Sales', status: 'active' }, { id: 'h2', name: 'Old', status: 'archived' }];
	assert.deepEqual(finishAction({ connectionID: 'c 1', returnTo: 'new', hubs }), { kind: 'return', href: '/app?view=new&connection=c%201' });
	assert.deepEqual(finishAction({ connectionID: 'c1', hubs: [] }), { kind: 'everyone', href: '/app?view=new&everyone=1&connection=c1' });
	assert.deepEqual(finishAction({ connectionID: 'c1', hubs: [hubs[1]] }).kind, 'everyone', 'archived workspaces do not count');
	// The workspace's โปรแกรม tab, with the new program turned on for บันทึก.
	assert.deepEqual(finishAction({ connectionID: 'c 1', hubs }), { kind: 'workspace', hubs: [{ id: 'h1', name: 'Sales', href: '/app?view=hub&hub=h1&tab=programs&add=c%201' }] });
	assert.deepEqual([1, 5, 6, 20, 21, 50, 51].map(teamSizeFor), ['1-5', '1-5', '6-20', '6-20', '21-50', '21-50', '51+']);
});

test('a program is พร้อมใช้, รอเลือกสิ่งที่ AI ทำได้, ต้องตรวจใหม่ (a tool changed since the last review), ระงับ or จัดเก็บแล้ว', () => {
	const ready = { id: 'c', mcpID: 's', enabled: true, reviewedTools: true, reviewedReadOnly: false, toolNames: ['a'], tools: [{ name: 'a' }], updatedAt: '2026-09-28T05:00:00Z' };
	assert.equal(programStatus(ready), 'ready');
	// A tool_changed failure after the last save (the re-review) needs a new review…
	assert.equal(programStatus(ready, { changed: 2, lastFailureAt: '2026-09-28T06:00:00Z' }), 'review');
	// …one from before it is history, so saving on สิ่งที่ AI ทำได้ clears it at once, not after 7 days.
	assert.equal(programStatus(ready, { changed: 2, lastFailureAt: '2026-09-27T05:00:00Z' }), 'ready');
	assert.equal(programStatus(ready, { changed: 0, lastFailureAt: '2026-09-28T06:00:00Z' }), 'ready');
	// No time to compare: keep the warning.
	assert.equal(programStatus(ready, { changed: 1 }), 'review');
	assert.equal(programStatus({ ...ready, updatedAt: '' }, { changed: 1, lastFailureAt: '2026-09-27T05:00:00Z' }), 'review');
	// Never reviewed is its own state, with the same words as Home.
	assert.equal(programStatus({ ...ready, reviewedTools: false }), 'setup');
	assert.equal(programStatus({ ...ready, toolNames: [] }), 'setup');
	assert.equal(catalog.programStatusCopy('setup').th, 'รอเลือกสิ่งที่ AI ทำได้');
	assert.equal(catalog.programStatusCopy('review').th, 'ต้องตรวจใหม่');
	// A listed tool the program no longer offers needs a new review.
	assert.equal(programStatus({ ...ready, toolNames: ['a', 'gone'] }), 'review');
	assert.equal(programStatus({ ...ready, enabled: false }), 'paused');
	assert.equal(programStatus({ ...ready, archivedAt: 'x' }), 'archived');
	assert.equal(uniqueProgramName('FlowAccount', ['flowaccount', 'FlowAccount (2)']), 'FlowAccount (3)');
	assert.equal(uniqueProgramName(' PEAK ', ['FlowAccount']), 'PEAK');
});

test('the draft keeps ticked tools per company and program, and survives broken or throwing storage', () => {
	const store = new Map();
	const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
	const key = draftKey('org-1');
	assert.equal(key, 'orca.addProgram.org-1');
	writeDraft(storage, key, { sourceID: 's', toolNames: ['a', 'a', 'b'], preset: 'read', name: 'F', note: 'n' }, 1000);
	assert.deepEqual(readDraft(storage, key, 's', 2000), { v: 1, sourceID: 's', toolNames: ['a', 'b'], preset: 'read', name: 'F', note: 'n', at: 1000 });
	assert.equal(readDraft(storage, key, 'other', 2000), undefined, 'another program starts fresh');
	assert.equal(readDraft(storage, key, 's', 1000 + DRAFT_TTL_MS + 1), undefined, 'an old draft is ignored');
	store.set(key, JSON.stringify({ v: 1, sourceID: 's', toolNames: [1], preset: 'read', name: '', note: '', at: 1000 }));
	assert.equal(readDraft(storage, key, 's', 2000), undefined);
	store.set(key, JSON.stringify({ v: 1, sourceID: 's', toolNames: [], preset: 'admin', name: '', note: '', at: 1000 }));
	assert.equal(readDraft(storage, key, 's', 2000), undefined);
	store.set(key, '{broken');
	assert.equal(readDraft(storage, key, 's', 2000), undefined);
	clearDraft(storage, key);
	assert.equal(store.has(key), false);
	const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
	assert.equal(readDraft(throwing, key, 's'), undefined);
	assert.doesNotThrow(() => writeDraft(throwing, key, { sourceID: 's', toolNames: [], preset: 'read', name: '', note: '' }));
	assert.doesNotThrow(() => clearDraft(throwing, key));
	assert.equal(readDraft(undefined, key, 's'), undefined);
});

test('a program the company already connected opens its page, or goes back to the create form it came from', () => {
	assert.equal(programConnectedHref('c 1', null), '/app?view=servers&connection=c%201');
	assert.equal(programConnectedHref('c1', 'new'), '/app?view=new&connection=c1');
	// Both addresses are already canonical for the page's router.
	for (const href of [programConnectedHref('c1', null), programConnectedHref('c1', 'new')]) {
		const route = appNavigation(new URLSearchParams(href.split('?')[1]), { role: { canManage: true, platformOperator: false } });
		assert.equal(route.redirect, undefined, href);
	}
});

test('a program the catalog has no words for gets a plain line, never "ระบบ … MCP"', () => {
	const custom = catalogSource(source('custom-stock', 'ระบบคลังสินค้าเดิม', { description: 'Internal MCP' }));
	assert.deepEqual(programLine(custom), ['โปรแกรมที่ทีม ORCA เพิ่มไว้', 'A program the ORCA team added']);
	for (const line of programLine(custom)) assert.doesNotMatch(line, /MCP|ระบบ/);
	// Known programs keep their own line.
	assert.deepEqual(programLine(catalogSource(source('s-flow', 'FlowAccount'))), ['ดูใบเสนอราคา ใบแจ้งหนี้ และรายรับรายจ่าย', 'Quotations, invoices, income and expenses']);
});

test('history results use the audit page\'s words; a received call is never shown as waiting for approval', () => {
	assert.deepEqual(programEventOutcome('admitted'), { th: 'รับคำขอแล้ว', en: 'Received', tone: 'neutral' });
	assert.equal(programEventOutcome('success').tone, 'ok');
	assert.equal(programEventOutcome('denied').th, 'ไม่ได้รับอนุญาต');
	assert.equal(programEventOutcome('timeout').tone, 'deny');
	assert.equal(programEventOutcome('error').th, 'ไม่สำเร็จ');
	assert.deepEqual(programEventOutcome('something-new'), { th: 'ไม่ทราบผล', en: 'Unknown', tone: 'neutral' });
	for (const outcome of ['success', 'admitted', 'denied', 'timeout', 'error', undefined]) assert.doesNotMatch(programEventOutcome(outcome).th, /อนุมัติ/);
});
