import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';

// Skills (W0): hidden until the company's bootstrap carries `features.skills`;
// the backend is not built, so the client is a typed stub that never calls out.
const { term } = await importTypeScript(new URL('../../orca/glossary.ts', import.meta.url));
const { SkillsService } = await importTypeScript(new URL('../../services/orca-skills.ts', import.meta.url));
const view = new URL('./views/SkillsView.svelte', import.meta.url);
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the Skills client is a stub: no Skills, and no request of any kind', async () => {
	assert.deepEqual(await SkillsService.list(), []);
	const source = await readFile(new URL('../../services/orca-skills.ts', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /^import /m, 'imports nothing, so it cannot reach the network');
	assert.doesNotMatch(source, /fetch|doGet|doPost|XMLHttpRequest|orcaPath/);
});

test('nothing about Skills shows or loads while the flag is off', async () => {
	const page = await readFile(new URL('../../../routes/app/+page.svelte', import.meta.url), 'utf8');
	assert.match(page, /\{:else if view === "skills" && skillsEnabled\(data\)\}<SkillsView data=\{currentData!\} \/>/);
	const home = await readFile(new URL('./WorkspaceDashboard.svelte', import.meta.url), 'utf8');
	assert.match(home, /if \(skillsEnabled\(untrack\(\(\) => data\)\)\)\s*void SkillsService\.list\(\)/, 'the list is only asked for with the flag');
	assert.match(home, /skills=\{skillsEnabled\(data\) \? \(skills \?\? \{ count: 0 \}\) : undefined\}/, 'no tile without it');
	const nav = await readFile(new URL('../../orca/workspace-nav.ts', import.meta.url), 'utf8');
	assert.match(nav, /return data\?\.features\?\.skills === true;/);
});

async function renderSkills(skills, data) {
	// The page as it is once the list has answered.
	const dir = await mkdtemp(join(tmpdir(), 'orca-skills-'));
	try {
		const source = (await readFile(view, 'utf8')).replace('let skills = $state<OrcaSkill[]>();', 'let skills = $state<OrcaSkill[]>(testSkills);').replace("import { onMount } from 'svelte';", "import { onMount } from 'svelte';\n\timport { testSkills } from 'test';");
		const file = join(dir, 'SkillsView.svelte');
		await writeFile(file, source);
		const PageHeader = (await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), {})).Component;
		const { warnings, Component } = await serverComponent(pathToFileURL(file), {
			term, t: (th) => th, onMount: () => {}, memberName: (member) => member.displayName, PageHeader, testSkills: skills, SkillsService
		});
		assert.deepEqual(warnings, []);
		return render(Component, { props: { data } }).body;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('the Skills page: the empty state, starters for managers, and the list layout', async () => {
	const company = (canManage) => ({ canManage, members: [{ id: 'u1', displayName: 'คุณนภา' }], connections: [{ id: 'c1', name: 'FlowAccount' }], hubs: [] });
	let html = await renderSkills([], company(true));
	let plain = text(html);
	assert.match(html, /<h1[^>]*>Skills<\/h1>/);
	assert.match(plain, /งานสำเร็จรูปที่ทีมเรียกใช้ใน AI/);
	assert.match(plain, /ยังไม่มี Skill สร้างครั้งเดียว ทุกคนเรียกใช้ใน ChatGPT หรือ Claude ได้/);
	assert.match(plain, /เริ่มจากตัวอย่าง สรุปยอดขายเดือนนี้ FlowAccount/);
	assert.equal(html.match(/<button type="button" class="k-button small[^"]*" disabled/g)?.length, 3, 'nothing to make until the backend ships');
	html = await renderSkills([], company(false));
	assert.doesNotMatch(text(html), /เริ่มจากตัวอย่าง/, 'employees use Skills, they do not start them');
	html = await renderSkills([
		{ id: 's1', name: 'สรุปยอดขายเดือนนี้', description: 'ยอดขาย ลูกค้าหลัก', connectionIDs: ['c1'], usesKnowledge: false, status: 'published', uses: 86, ownerID: 'u1', updatedAt: '' },
		{ id: 's2', name: 'ค่าใช้จ่ายรายสัปดาห์', description: 'แยกตามหมวด', connectionIDs: [], usesKnowledge: true, status: 'draft', ownerID: 'u1', updatedAt: '' }
	], company(true));
	plain = text(html);
	assert.match(plain, /สรุปยอดขายเดือนนี้ ยอดขาย ลูกค้าหลัก ใช้ 86 ครั้ง · คุณนภา/);
	assert.match(plain, /ค่าใช้จ่ายรายสัปดาห์ แยกตามหมวด \+ คลังความรู้ ฉบับร่าง · คุณนภา/);
	assert.doesNotMatch(plain, /ยังไม่มี Skill/);
});
