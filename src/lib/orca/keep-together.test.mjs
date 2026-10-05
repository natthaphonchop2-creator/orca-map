import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { keepTogether } = await importTypeScript(new URL('./keep-together.ts', import.meta.url));

test('short Thai phrases are kept whole; the rest and other languages pass through', () => {
	assert.deepEqual(keepTogether('ด้วยบัญชีของตัวเอง ตอนนี้', ['ตัวเอง']), [
		{ text: 'ด้วยบัญชีของ', keep: false },
		{ text: 'ตัวเอง', keep: true },
		{ text: ' ตอนนี้', keep: false }
	]);
	assert.deepEqual(keepTogether('ไม่ต้องลงชื่อเข้าใช้เอง', ['เข้าใช้', 'เข้าใช้เอง']), [
		{ text: 'ไม่ต้องลงชื่อ', keep: false },
		{ text: 'เข้าใช้เอง', keep: true }
	], 'the longer phrase at the same place wins');
	assert.deepEqual(keepTogether('เชื่อมครั้งเดียว ครั้งเดียว', ['ครั้งเดียว']).filter((part) => part.keep).length, 2);
	assert.deepEqual(keepTogether('Connect yours now.', ['ตัวเอง']), [{ text: 'Connect yours now.', keep: false }]);
	assert.deepEqual(keepTogether('', ['ตัวเอง']), []);
	assert.equal(keepTogether('ก ข', ['']).map((part) => part.text).join(''), 'ก ข', 'an empty phrase keeps nothing');
});
