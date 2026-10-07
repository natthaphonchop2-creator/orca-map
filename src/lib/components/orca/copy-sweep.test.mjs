import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { importTypeScript } from '../../orca/test-import.mjs';

// The copy sweep (workspace UX U9): every Thai string the workspace, the sign-in
// page and the invitation page show follows the glossary. Catalog data and the
// providers' own menu names (other apps' words) are not ORCA's copy.
const { retiredWords } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const root = new URL('../../../../', import.meta.url);
const NOT_COPY = new Set([
	'src/lib/orca/glossary.ts',
	'src/lib/orca/catalog-data.ts',
	'src/lib/orca/integration-directory.ts',
	'src/lib/orca/social-integration-references.ts',
	'src/lib/orca/oauth-provider-setup.ts',
	'src/lib/orca/provider-guides.ts',
	// The public website's pieces, not the workspace.
	'src/lib/orca/LandingNav.svelte',
	'src/lib/orca/ToolEcosystem.svelte',
	'src/lib/orca/pilot-intake.svelte.ts',
	'src/lib/orca/services.ts',
	'src/lib/orca/pricing.ts'
]);

async function files(dir) {
	const found = [];
	for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) found.push(...(await files(path)));
		else if (/\.(svelte|ts)$/.test(entry.name) && !/\.test\./.test(entry.name) && !NOT_COPY.has(path)) found.push(path);
	}
	return found;
}

/** The Thai half of every t('ไทย', 'English') call, and every { th: 'ไทย', en: … } text a screen shows through t(copy.th, copy.en). */
function thaiCopy(source) {
	const calls = [...source.matchAll(/(?<![\w$.])t\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((match) => match[2]);
	const copies = [...source.matchAll(/(?<![\w$])th:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((match) => match[2]);
	return [...calls, ...copies].filter((text) => /[฀-๿]/.test(text));
}

const SOURCES = [
	...(await files('src/lib/components/orca')),
	...(await files('src/lib/orca')),
	...(await files('src/routes/app')),
	...(await files('src/routes/login')),
	...(await files('src/routes/invite'))
];

test('no screen calls a connected program "ระบบ" or asks with a chain of "กรุณา"', async () => {
	const banned = [
		...retiredWords.map(([th]) => th),
		'กรุณา',
		'ผู้ดูแลระบบ',
		'ผู้ดูแลแพลตฟอร์ม',
		'สมาชิกทั่วไป',
		'เพิกถอน',
		'ลิงก์เชื่อม AI',
		'Orca Cloud',
		'ยกเลิกการเชื่อม'
	];
	assert.ok(SOURCES.length > 100, 'the sweep reads the whole workspace');
	for (const file of SOURCES) {
		const source = await readFile(new URL(file, root), 'utf8');
		for (const text of thaiCopy(source)) {
			for (const word of banned) assert.ok(!text.includes(word), `${file}: “${text}” uses ${word}`);
			// "ระบบ" stays only in เข้าสู่ระบบ / ออกจากระบบ and the theme's ตามระบบ.
			const rest = text.replaceAll('เข้าสู่ระบบ', '').replaceAll('ออกจากระบบ', '').replaceAll('ตามระบบ', '');
			assert.ok(!rest.includes('ระบบ'), `${file}: “${text}” says ระบบ for a program`);
		}
	}
});

test('a customer sign-in never shows the app set-up, the host or who runs the connector', async () => {
	const setup = await readFile(new URL('src/lib/components/orca/SourceSetup.svelte', root), 'utf8');
	// Only the ORCA team's platform pages pass `operator`.
	assert.match(setup, /const canConfigureClient = \$derived\(operator && /);
	assert.match(setup, /\{:else if operator && providerKind === "obot"\}/);
	assert.match(setup, /\{#if operator && providerHost && !apiGuide/);
	for (const file of ['src/lib/components/orca/connect-ai/ProgramSignIns.svelte']) {
		assert.doesNotMatch(await readFile(new URL(file, root), 'utf8'), /<SourceSetup[^>]*\boperator\b/, file);
	}
	for (const file of ['src/lib/components/orca/OAuthApps.svelte', 'src/lib/components/orca/platform/PlatformCatalog.svelte']) {
		assert.match(await readFile(new URL(file, root), 'utf8'), /<SourceSetup\s+operator\b/, file);
	}
});
