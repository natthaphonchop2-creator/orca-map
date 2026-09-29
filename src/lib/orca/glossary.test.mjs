import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { glossary, term, retiredWords } = await importTypeScript(new URL('./glossary.ts', import.meta.url));

test('every term has Thai and English, and the menu names match the owner-approved words', () => {
	for (const [key, [th, en]] of Object.entries(glossary)) {
		assert.ok(th.trim() && en.trim(), key);
		assert.match(th, /[฀-๿]|ORCA|AI|SSO|OAuth|Google/, `${key} is Thai first`);
	}
	const menu = ['home', 'programs', 'workspaces', 'knowledge', 'team', 'oversight'].map((key) => term(key, (th) => th));
	assert.deepEqual(menu, ['หน้าหลัก', 'โปรแกรมที่เชื่อม', 'พื้นที่ทำงาน AI', 'คลังความรู้', 'ทีม', 'ตรวจสอบ']);
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
