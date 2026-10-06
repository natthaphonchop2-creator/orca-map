// The platform console's PC1 helpers (C6): the status the customer's pages
// show, the operator's company page, and how a company's history names what
// ORCA did in it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const console_ = await importTypeScript(new URL('./platform-console.ts', import.meta.url));
const B = 'org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const th = (thai) => thai;
const en = (_thai, english) => english;

test('a status the page does not know is never treated as open', () => {
	assert.equal(console_.companyStatus('active'), 'active');
	assert.equal(console_.companyStatus(undefined), 'active', 'an older server sends none');
	assert.equal(console_.companyStatus('suspended'), 'suspended');
	assert.equal(console_.companyStatus('closed'), 'closed');
	assert.equal(console_.companyStatus('paused'), 'closed');
});

test("a company's people see only the fixed message (P5)", () => {
	assert.equal(console_.stoppedMessage('suspended', th), 'บริษัทนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อ ORCA');
	assert.equal(console_.stoppedMessage('closed', th), 'บริษัทนี้ปิดการใช้งานแล้ว');
	assert.equal(console_.stoppedFromRefusal(423, 'orca_company_suspended'), 'suspended');
	assert.equal(console_.stoppedFromRefusal(423, 'orca_company_closed'), 'closed');
	assert.equal(console_.stoppedFromRefusal(423, console_.SUSPENDED_MESSAGE_TH), 'suspended', 'the data plane sends the message itself');
	assert.equal(console_.stoppedFromRefusal(423, console_.CLOSED_MESSAGE_TH), 'closed');
	assert.equal(console_.stoppedFromRefusal(403, 'orca_company_suspended'), undefined);
	assert.equal(console_.stoppedFromRefusal(undefined, ''), undefined);
	assert.equal(console_.companyStatusNote('active', th), '');
	assert.equal(console_.companyStatusNote('suspended', th), 'ระงับการใช้งานชั่วคราว');
});

test('the contract end is marked, and nothing else happens at it', () => {
	assert.equal(console_.contractNote('', '', th), '');
	assert.equal(console_.contractNote('', '2026-12-31', th), 'สัญญาถึง 31 ธ.ค. 2569');
	assert.equal(console_.contractNote('ending', '2026-10-20', th), 'ใกล้หมดสัญญา (20 ต.ค. 2569)');
	assert.equal(console_.contractNote('ended', '2026-10-01', en, 'en'), 'Contract ended (1 Oct 2026)');
	// Never the ISO day, in either language.
	for (const state of ['', 'ending', 'ended']) assert.doesNotMatch(console_.contractNote(state, '2026-12-31', th), /\d{4}-\d{2}-\d{2}/);
});

test("a customer company's page lives in the platform area, in the default company", () => {
	assert.equal(console_.platformCompanyHref(B), `/app?org=default&view=platform&section=companies&company=${B}`);
	assert.equal(console_.platformCompanyHref(B, 'manage'), `/app?org=default&view=platform&section=companies&company=${B}&tab=manage`);
	assert.equal(console_.platformCompanyHref('../evil'), '/app?org=default&view=platform&section=companies', 'only a company ID');
	assert.equal(console_.detailTab('members'), 'members');
	assert.equal(console_.detailTab('raw-audit'), 'overview', 'PC2 views are not here yet');
	assert.equal(console_.detailTab(null), 'overview');
});

test("a company's history names ORCA's looks and changes, grouped when consecutive", () => {
	const view = (resourceID, id) => ({ id, userID: 'platform', action: 'platform.view', resourceID });
	assert.equal(console_.platformAuditLabel(view('members'), th), 'ORCA ดูข้อมูลรายชื่อสมาชิก');
	assert.equal(console_.platformAuditLabel(view('overview'), en), 'ORCA viewed the company overview');
	assert.equal(console_.platformAuditLabel({ userID: 'platform', action: 'platform.suspend' }, th), 'ORCA ระงับการใช้งานบริษัทชั่วคราว');
	assert.equal(console_.platformAuditLabel({ userID: 'platform', action: 'platform.restore' }, th), 'ORCA เปิดให้ใช้งานบริษัทอีกครั้ง');
	assert.equal(console_.platformAuditLabel({ userID: '7', action: 'platform.view' }, th), undefined, "only the platform's own rows");
	const grouped = console_.groupPlatformViews([
		view('members', 1),
		view('members', 2),
		view('members', 3),
		view('overview', 4),
		{ id: 5, userID: '7', action: 'hub.update' },
		view('overview', 6),
	]);
	assert.deepEqual(
		grouped.map((event) => [event.id, event.repeated ?? 1]),
		[
			[1, 3],
			[4, 1],
			[5, 1],
			[6, 1],
		],
		'only consecutive looks at the same area, and nothing is dropped',
	);
});

test('the profile form checks what the server checks', () => {
	assert.deepEqual(console_.profileProblems({}), []);
	assert.deepEqual(console_.profileProblems({ taxID: '0105555012345', contactEmail: 'billing@b.example', contractStart: '2026-10-01', contractEnd: '2027-09-30', monthlyPrice: '4900' }), []);
	assert.deepEqual(console_.profileProblems({ taxID: '010555501234' }), ['taxID']);
	assert.deepEqual(console_.profileProblems({ contactEmail: 'not an email' }), ['email']);
	assert.deepEqual(console_.profileProblems({ contractStart: '2027-01-02', contractEnd: '2027-01-01' }), ['dates']);
	// The price may carry thousands separators, only in the right places.
	assert.deepEqual(console_.profileProblems({ monthlyPrice: '4,900' }), []);
	assert.deepEqual(console_.profileProblems({ monthlyPrice: '12,900' }), []);
	assert.deepEqual(console_.profileProblems({ monthlyPrice: '49,00' }), ['price']);
	assert.deepEqual(console_.profileProblems({ monthlyPrice: '4900.50' }), ['price']);
	assert.deepEqual(console_.profileProblems({ monthlyPrice: '1,234,567,890' }), ['price'], 'more than nine digits');
	assert.deepEqual(console_.profileProblems({ notes: 'ก'.repeat(4001) }), ['notes']);
	assert.equal(console_.priceValue(' 4900 '), 4900);
	assert.equal(console_.priceValue(''), null);
	assert.equal(console_.priceValue('12,900'), 12900, 'the commas are display only');
	assert.equal(console_.priceValue('123,456,789'), 123456789);
	assert.equal(console_.priceValue('12,90'), null);
	// The field shows the price with separators, and keeps what isn't a price as typed.
	assert.equal(console_.priceText(12900), '12,900');
	assert.equal(console_.priceText('12900'), '12,900');
	assert.equal(console_.priceText(' 4,900 '), '4,900');
	assert.equal(console_.priceText(null), '');
	assert.equal(console_.priceText('12,90'), '12,90');
	assert.equal(console_.priceValue(console_.priceText(123456789)), 123456789, 'shown, then read back');
});

test('the private fields: writing needs a key, reading the key that sealed them (Codex PC1 review 1 MINOR 6)', () => {
	assert.deepEqual(console_.privateFieldsState({ sensitiveState: 'off', sensitiveWritable: false }), { writable: false, cause: 'no-key', unreadable: false });
	assert.deepEqual(console_.privateFieldsState({ sensitiveState: 'unreadable', sensitiveWritable: false }), { writable: false, cause: 'no-key', unreadable: true }, 'stored, and no key here at all');
	assert.deepEqual(console_.privateFieldsState({ sensitiveState: 'unreadable', sensitiveWritable: true }), { writable: true, cause: 'unreadable', unreadable: true }, 'another key replaces them');
	assert.deepEqual(console_.privateFieldsState({ sensitiveState: 'set', sensitiveWritable: true }), { writable: true, cause: 'kept', unreadable: false });
	assert.deepEqual(console_.privateFieldsState({ sensitiveState: 'empty', sensitiveWritable: true }), { writable: true, cause: 'kept', unreadable: false });
	assert.equal(console_.privateFieldsState({ sensitiveState: 'set' }).writable, false, 'no word from the server: fail closed');
	assert.equal(console_.privateFieldsState(undefined).writable, false);
	assert.equal(console_.encryptionOffRefusal(409, 'profile_encryption_off'), true);
	assert.equal(console_.encryptionOffRefusal(409, 'this item changed; reload before saving again'), false);
	assert.equal(console_.encryptionOffRefusal(400, 'profile_encryption_off'), false);
});

test('"เปลี่ยนชื่อ" waits for a trimmed name that differs', () => {
	assert.equal(console_.renameReady('', 'Hotel A'), false);
	assert.equal(console_.renameReady('   ', 'Hotel A'), false);
	assert.equal(console_.renameReady('Hotel A', 'Hotel A'), false);
	assert.equal(console_.renameReady('  Hotel A ', 'Hotel A'), false, 'spaces alone are no change');
	assert.equal(console_.renameReady('Hotel A2', 'Hotel A'), true);
	assert.equal(console_.renameReady('Hotel A', undefined), true);
});

test("รายการที่เกี่ยวข้อง for ORCA's rows is the area or the company in words, never an ID", () => {
	const view = (resourceID) => ({ userID: 'platform', action: 'platform.view', resourceID });
	assert.equal(console_.platformAuditRelated(view('members'), th), 'รายชื่อสมาชิก');
	assert.equal(console_.platformAuditRelated(view('overview'), th), 'ภาพรวมบริษัท');
	assert.equal(console_.platformAuditRelated(view('overview'), en), 'the company overview');
	assert.equal(console_.platformAuditRelated(view('something-new'), th), 'ข้อมูลบริษัท', 'an area this page does not know');
	assert.equal(console_.platformAuditRelated(view(''), th), '—');
	const change = (action) => ({ userID: 'platform', action, resourceID: B });
	for (const action of ['platform.suspend', 'platform.restore', 'platform.rename']) {
		assert.equal(console_.platformAuditRelated(change(action), th, 'Hotel A'), 'Hotel A');
		assert.equal(console_.platformAuditRelated(change(action), th), 'ข้อมูลบริษัท');
	}
	assert.equal(console_.platformAuditRelated({ userID: '7', action: 'platform.view', resourceID: 'members' }, th), undefined, "only the platform's own rows");
	assert.equal(console_.platformAuditRelated({ userID: 'platform', action: 'invitation.create', resourceID: 'oin-1' }, th), undefined);
});
