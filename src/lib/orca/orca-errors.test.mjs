import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { typescriptModuleURL } from './test-import.mjs';

// orcaError(): a 409 whose server message names its reason says that reason
// and what to do next; any other 409 is still "someone changed this".
const code = stripTypeScriptTypes(await readFile(new URL('../services/orca.ts', import.meta.url), 'utf8'))
	.replace(/^import[^;]+;/gm, '')
	.replace(/^export /gm, '');
const companyURL = await typescriptModuleURL(new URL('./company.ts', import.meta.url));
const supportURL = await typescriptModuleURL(new URL('./support.ts', import.meta.url));
const { errors } = await import('data:text/javascript;base64,' + Buffer.from(`import { orcaPath } from ${JSON.stringify(companyURL)};
import { ORCA_SUPPORT_LINE_ID } from ${JSON.stringify(supportURL)};
export function errors(stubs) {
	const { doDelete, doGet, doPatch, doPost, doPut, doWithBody, parseErrorContent, t, orcaLocale } = stubs;
	${code};
	return { orcaError, conflictReasons, sourceReasons };
}`).toString('base64'));

const { orcaError, conflictReasons, sourceReasons } = errors({ parseErrorContent: (cause) => cause, t: (th) => th, orcaLocale: { value: 'th' } });
const refusal = (status, message) => ({ status, message });

test('invitation conflicts say what happened and the next step, never "reload and save again"', () => {
	assert.match(orcaError(refusal(409, 'this email already belongs to a member')), /เป็นสมาชิกของบริษัทอยู่แล้ว.*แท็บ สมาชิก/);
	assert.match(orcaError(refusal(409, 'an invitation for this email is already waiting')), /รออยู่แล้ว.*สร้างลิงก์ใหม่/);
	assert.match(orcaError(refusal(409, 'this person is suspended or removed; restore them instead')), /กู้คืน/);
	assert.match(orcaError(refusal(409, "this account already has a higher role than the invitation; ask the ORCA team")), /บทบาทสูงกว่า.*ติดต่อทีม ORCA ทาง LINE @147njpwd/);
	// "ติดต่อทีม ORCA" names the team's LINE, from $lib/orca/support, in both languages.
	for (const [, thai, english] of conflictReasons.filter(([, thai]) => thai.includes('ติดต่อทีม ORCA'))) {
		assert.match(thai, /ติดต่อทีม ORCA ทาง LINE @147njpwd/);
		assert.match(english, /the ORCA team on LINE \(@147njpwd\)/);
	}
	assert.equal(conflictReasons.filter(([, thai]) => thai.includes('ติดต่อทีม ORCA')).length, 2);
	for (const [message] of conflictReasons) assert.doesNotMatch(orcaError(refusal(409, message)), /มีคนเปลี่ยนข้อมูลนี้/, message);
	// A version conflict is still one.
	assert.match(orcaError(refusal(409, 'conflict')), /มีคนเปลี่ยนข้อมูลนี้ไปแล้ว/);
	// The same words from another status are not a conflict's.
	assert.doesNotMatch(orcaError(refusal(400, 'this email already belongs to a member')), /แท็บ สมาชิก/);
});

test('a break-glass reset refused for a customer\'s Google account says it can never work', () => {
	const text = orcaError(refusal(409, "this person belongs to another company and signs in with Google; an administrator can't set their password"));
	assert.match(text, /เข้าสู่ระบบด้วย Google/);
	assert.match(text, /ไม่ต้องลองอีก/);
	assert.doesNotMatch(text, /โหลดข้อมูลล่าสุด/);
});

// 2026-10-01: Google Drive showed only "the source is not ready". Each step now
// has a code; the person sees it in Thai with what to do, and the code stays.
test('a program that cannot be set up says the step that failed, with its code', () => {
	const drive = orcaError(refusal(424, 'the source is not ready (SRC-13); check your account configuration or ask the organization manager'));
	assert.match(drive, /^เชื่อมโปรแกรมนี้ยังไม่ได้ \(รหัส SRC-13\) เริ่มลงชื่อเข้าใช้กับโปรแกรมไม่สำเร็จ/);
	assert.match(drive, /ส่งรหัสนี้ให้ทีม ORCA ทาง LINE @147njpwd/);
	assert.doesNotMatch(drive, /the source is not ready/);
	for (let n = 1; n <= 17; n++) {
		const code = String(n).padStart(2, '0');
		assert.ok(sourceReasons[code], code);
		assert.match(orcaError(refusal(424, `the source is not ready (SRC-${code}); check your account configuration or ask the organization manager`)), new RegExp(`\\(รหัส SRC-${code}\\) ${sourceReasons[code][0]}`));
	}
	// The text before codes, and a code this page does not know, still read in Thai.
	for (const message of ['the source is not ready; check your account configuration or ask the organization manager', 'the source is not ready (SRC-99); check']) {
		assert.match(orcaError(refusal(424, message)), /^เชื่อมโปรแกรมนี้ยังไม่ได้ ลองอีกครั้ง/, message);
	}
	// Adding a program to a workspace still says what to finish first.
	assert.match(orcaError(refusal(424, 'the source is not ready; complete its connection and sign-in settings, then retry')), /^โปรแกรมนี้ยังเชื่อมไม่ครบ ตั้งค่าการเชื่อมต่อและลงชื่อเข้าใช้ให้เสร็จ/);
	// Another 424, or the same words with another status, keeps its own words.
	assert.equal(orcaError(refusal(424, 'the API token was not accepted')), 'the API token was not accepted');
	const elsewhere = 'the source is not ready (SRC-13); check your account configuration or ask the organization manager';
	assert.equal(orcaError(refusal(502, elsewhere)), elsewhere);
});
