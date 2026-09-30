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
	return { orcaError, conflictReasons };
}`).toString('base64'));

const { orcaError, conflictReasons } = errors({ parseErrorContent: (cause) => cause, t: (th) => th, orcaLocale: { value: 'th' } });
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
