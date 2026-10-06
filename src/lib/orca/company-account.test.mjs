import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

// Company accounts (บัญชีกลาง), design §7: what a manager reads about one.
const helpers = await importTypeScript(new URL('./company-account.ts', import.meta.url));
const { personalSources, companyAccountSources } = await importTypeScript(new URL('./personal-connections.ts', import.meta.url));
const th = (thai) => thai;
const account = (id, extra = {}) => ({ id, sourceID: 'books', label: id, status: 'ready', generation: 1, acknowledgedRevision: 1, staged: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '', ...extra });

test('a connection names its company account; the program\'s accounts list ready ones first, then the newest', () => {
	const accounts = [account('old', { createdAt: '2026-09-01T00:00:00Z' }), account('paused', { status: 'needs_reconnect', createdAt: '2026-10-02T00:00:00Z' }), account('other', { sourceID: 'mail' })];
	assert.equal(helpers.connectionAccount({ programAccountID: 'old' }, accounts)?.id, 'old');
	assert.equal(helpers.connectionAccount({}, accounts), undefined, 'each person\'s own account');
	assert.equal(helpers.connectionAccount({ programAccountID: 'gone' }, accounts), undefined);
	assert.deepEqual(helpers.programAccountsFor('books', accounts).map((item) => item.id), ['old', 'paused']);
});

test('each status and paused reason reads as what a manager does next', () => {
	assert.deepEqual(helpers.companyAccountStatus({ status: 'ready' }), { th: 'พร้อมใช้', en: 'Ready', tone: 'ok' });
	assert.equal(helpers.companyAccountStatus({ status: 'needs_reconnect' }).tone, 'deny');
	assert.equal(helpers.companyAccountStatus(undefined).th, 'ไม่พบบัญชีกลาง');
	for (const reason of ['connector_lost_manager', 'policy_changed', 'app_changed', 'record_lost', 'disconnected']) {
		const copy = helpers.pausedReasonCopy(reason);
		assert.ok(copy?.th && copy.en, reason);
	}
	assert.match(helpers.pausedReasonCopy('policy_changed').th, /ยอมรับเงื่อนไขใหม่/);
	assert.equal(helpers.pausedReasonCopy(undefined), undefined);
});

test('a "warn" policy is accepted at its revision: for a new account, and again once the revision moves on', () => {
	const warn2 = { mode: 'warn', revision: 2 };
	assert.equal(helpers.policyStep({ mode: 'allowed', revision: 1 }), 'allowed');
	assert.equal(helpers.policyStep(warn2), 'acknowledge');
	assert.equal(helpers.policyStep({ mode: 'personal_only', revision: 1 }), 'personal-only');
	assert.equal(helpers.policyStep(undefined), 'unknown');
	assert.equal(helpers.needsAcknowledgement(warn2, { acknowledgedRevision: 1 }), true);
	assert.equal(helpers.needsAcknowledgement(warn2, { acknowledgedRevision: 2 }), false);
	assert.equal(helpers.needsAcknowledgement({ mode: 'allowed', revision: 3 }, { acknowledgedRevision: 0 }), false);
	assert.equal(helpers.acknowledgedRevision(warn2, true), 2);
	assert.equal(helpers.acknowledgedRevision(warn2, false), 0, 'never acknowledged without the manager');
	assert.equal(helpers.acknowledgedRevision({ mode: 'allowed', revision: 1 }, true), 0);
	assert.equal(helpers.defaultAccountLabel('FlowAccount', th), 'บัญชีกลาง FlowAccount');
	assert.ok(helpers.defaultAccountLabel('x'.repeat(200), th).length <= 80);
});

test('a program on a company account asks nothing of its members and is listed apart', () => {
	const connection = (id, mcpID, programAccountID) => ({ id, mcpID, name: id, enabled: true, reviewedReadOnly: true, toolNames: ['read'], tools: [{ name: 'read' }], ...(programAccountID ? { programAccountID } : {}) });
	const hub = (id, connectionIDs, status = 'active') => ({ id, name: id, status, connectionID: connectionIDs[0], sources: connectionIDs.map((connectionID) => ({ connectionID, toolNames: ['read'] })), toolNames: ['read'], memberIDs: ['me'] });
	const data = {
		currentUserID: 'me',
		canManage: false,
		connections: [connection('books', 'src-books', 'pac-1'), connection('mail', 'src-mail')],
		hubs: [hub('sales', ['books', 'mail']), hub('paused', ['books'], 'paused')]
	};
	assert.deepEqual(personalSources(data).map((source) => source.sourceID), ['src-mail'], 'only the personal program waits for a sign-in');
	const company = companyAccountSources(data);
	assert.deepEqual(company.map((source) => [source.sourceID, source.hubs.map((item) => item.id)]), [['src-books', ['sales']]]);
});

test('a tick of "accept" holds only for the revision it was made on (Codex CA1 review 2, finding 7)', () => {
	const warn = (revision) => ({ mode: 'warn', revision });
	assert.equal(helpers.acceptanceHolds(warn(2), 2), true);
	assert.equal(helpers.acceptanceHolds(warn(3), 2), false, 'a policy that moved on is not accepted by an older tick');
	assert.equal(helpers.acceptanceHolds(warn(2), 0), false);
	assert.equal(helpers.acceptanceHolds({ mode: 'allowed', revision: 2 }, 2), false, 'nothing to accept');
	assert.equal(helpers.acceptanceHolds(undefined, 1), false);
	assert.equal(helpers.acknowledgedRevision(warn(3), helpers.acceptanceHolds(warn(3), 2)), 0, 'so no acknowledgement is sent');
});

test('a dialog applies only to the account it was opened for (finding 6)', () => {
	assert.equal(helpers.stillBoundTo({ programAccountID: 'pac-a' }, 'pac-a'), true);
	assert.equal(helpers.stillBoundTo({ programAccountID: 'pac-b' }, 'pac-a'), false, 'a refresh moved the connection to another account');
	assert.equal(helpers.stillBoundTo({}, 'pac-a'), false);
	assert.equal(helpers.stillBoundTo({ programAccountID: '' }, ''), false);
});

test('only the live connect flow acts: a start or a cancel ends the one before (finding 5)', () => {
	const flows = new helpers.ConnectFlows();
	assert.equal(flows.live(0), false);
	const first = flows.start();
	assert.equal(flows.live(first), true);
	flows.end();
	assert.equal(flows.live(first), false, 'cancelled: its poll binds nothing');
	const second = flows.start();
	const third = flows.start();
	assert.equal(flows.live(second), false, 'another start ends it');
	assert.equal(flows.live(third), true);
});

// CA1b (managed Google and Microsoft company accounts), slice CA1b-5.
const thai = (th) => th;
const english = (_th, en) => en;

test('a managed program\'s notice says what everyone will see, then its terms; any other program keeps the generic text', () => {
	const mail = helpers.policyNotice({ notice: 'mail' }, 'Gmail', thai);
	assert.match(mail, /อีเมลทั้งกล่องจดหมาย/);
	assert.match(mail, /office@บริษัท/);
	assert.match(mail, /บริษัทของคุณรับผิดชอบการใช้ตามเงื่อนไขนั้นเอง/, 'the terms sentence follows');
	assert.match(helpers.policyNotice({ notice: 'mail' }, 'Gmail', english), /whole mailbox/);
	assert.match(helpers.policyNotice({ notice: 'files' }, 'Drive', english), /every file this account can open, including files others shared with it/);
	assert.match(helpers.policyNotice({ notice: 'calendar' }, 'Calendar', english), /calendar events/);
	assert.match(helpers.policyNotice({ notice: 'contacts' }, 'Contacts', english), /contacts/);
	for (const policy of [{}, undefined, { notice: 'weird' }]) {
		const generic = helpers.policyNotice(policy, 'Books', english);
		assert.match(generic, /uses this Books account through AI and sees the same data/);
		assert.match(generic, /Books's terms may not allow sharing one login/);
	}
	assert.notEqual(helpers.policyNotice({ notice: 'files' }, 'Drive', english), helpers.policyNotice({ notice: 'mail' }, 'Drive', english));
});

test('a refused grant reads as expired or revoked, and a manager connects again', () => {
	const copy = helpers.pausedReasonCopy('grant_revoked');
	assert.match(copy.th, /หมดอายุหรือถูกเพิกถอน/);
	assert.match(copy.th, /ผู้ดูแลต้องเชื่อมใหม่/);
	assert.match(copy.en, /expired or was revoked/);
	assert.match(copy.en, /A manager must connect it again/);
});

test('a check names its class, and only account_auth asks to connect again', () => {
	assert.equal(helpers.checkResultCode('account_auth: the account\'s sign-in no longer works'), 'account_auth');
	assert.equal(helpers.checkResultCode(' provider_busy: Google or Microsoft is busy'), 'provider_busy');
	assert.equal(helpers.checkResultCode('the program did not accept these account details'), undefined);
	assert.equal(helpers.checkResultCode(undefined), undefined);
	for (const code of ['account_auth', 'account_permission', 'provider_busy', 'provider_unavailable']) {
		const copy = helpers.checkResultCopy(code);
		assert.ok(copy?.th && copy.en, code);
		assert.equal(/connects? it again|เชื่อมใหม่/.test(copy.en + copy.th), code === 'account_auth', code);
	}
	assert.equal(helpers.checkResultCopy(undefined), undefined);
});

test('the reserved managed programs are told apart from every other program', () => {
	assert.equal(helpers.managedProviderOf('default-orca-managed-gmail'), 'google');
	assert.equal(helpers.managedProviderOf('default-orca-managed-google-drive'), 'google');
	assert.equal(helpers.managedProviderOf('default-orca-managed-microsoft-outlook'), 'microsoft');
	assert.equal(helpers.managedProviderOf('default-orca-flowaccount'), undefined);
	assert.equal(helpers.managedProviderOf('orca-managed-gmail'), undefined);
});

test('while connecting again, the current account keeps working only when it is ready (CA1b round 2 NOTE)', () => {
	const ready = helpers.stageNote('Gmail', { status: 'ready' }, english);
	assert.match(ready, /Connect Gmail with the account everyone will use\./);
	assert.match(ready, /keeps working/);
	for (const status of ['needs_reconnect', 'connecting', 'disconnected']) {
		assert.doesNotMatch(helpers.stageNote('Gmail', { status }, english), /keeps working/, status);
		assert.doesNotMatch(helpers.stageNote('Gmail', { status }, thai), /ยังใช้งานได้/, status);
	}
	assert.doesNotMatch(helpers.stageNote('Gmail', undefined, english), /keeps working/);
});
