import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { glossary, term, retiredWords } = await importTypeScript(new URL('./glossary.ts', import.meta.url));

test('every term has Thai and English, and the menu names match the owner-approved words', () => {
	for (const [key, [th, en]] of Object.entries(glossary)) {
		assert.ok(th.trim() && en.trim(), key);
		// Skills and Workflows stay in English in both languages (owner, 2026-10-07).
		assert.match(th, /[฀-๿]|ORCA|AI|SSO|OAuth|Google|^Skills$|^Workflows$/, `${key} is Thai first`);
	}
	// W0's menu (calm workspace, approved 2026-10-07).
	const menu = ['home', 'skills', 'workflows', 'programs', 'myAI', 'knowledge', 'history', 'settings', 'help'].map((key) => term(key, (th) => th));
	assert.deepEqual(menu, ['หน้าหลัก', 'Skills', 'Workflows', 'โปรแกรม', 'AI ของฉัน', 'คลังความรู้', 'ประวัติ', 'ตั้งค่า', 'ช่วยเหลือ']);
	assert.deepEqual(['team', 'workspaces'].map((key) => term(key, (th) => th)), ['ทีม', 'พื้นที่ทำงาน AI'], 'ตั้งค่า tabs');
	assert.deepEqual(['waitingApproval', 'usageTab', 'settingsTab'].map((key) => term(key, (th) => th)), ['รออนุมัติ', 'การใช้งาน', 'การตั้งค่า'], 'ประวัติ tabs');
	assert.equal(term('connectMyAI', (th) => th), 'เชื่อม AI ของฉัน');
	assert.equal(term('connectMyAI', (_th, en) => en), 'Connect my AI');
	assert.equal(term('companyOwner', (th) => th), 'เจ้าของบริษัท');
	assert.equal(term('orcaTeam', (th) => th), 'ทีม ORCA');
});

test('no glossary term uses a word the glossary retired', () => {
	const words = retiredWords.map(([th]) => th);
	for (const [key, [th]] of Object.entries(glossary)) {
		for (const word of words) assert.ok(!th.includes(word), `${key}: ${th} contains ${word}`);
	}
});
