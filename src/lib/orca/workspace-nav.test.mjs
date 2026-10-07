import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';

const { createOptions, skillsEnabled, workspaceNavigation } = await importTypeScript(new URL('./workspace-nav.ts', import.meta.url));

test('the สร้าง dialog offers each role only what it may make', () => {
	const ids = (role) => createOptions(role).map((option) => (option.disabled ? `${option.id} (off)` : option.id));
	assert.deepEqual(ids({ canManage: true, skills: false }), ['workflow (off)', 'connect-ai', 'knowledge']);
	assert.deepEqual(ids({ canManage: true, skills: true }), ['skill', 'workflow (off)', 'connect-ai', 'knowledge']);
	// Employees: no Workflow, and no Skill to make (they use them).
	assert.deepEqual(ids({ canManage: false, skills: true }), ['connect-ai', 'knowledge']);
	assert.deepEqual(ids({ canManage: false, skills: false }), ['connect-ai', 'knowledge']);
	const options = createOptions({ canManage: true, skills: true });
	assert.deepEqual(Object.fromEntries(options.map((option) => [option.id, option.href])), {
		skill: '/app?view=skills',
		workflow: '',
		'connect-ai': '/app?view=connect-ai',
		knowledge: '/app?view=knowledge&kind=knowledge&create=1'
	});
});

test('Skills needs the bootstrap feature, exactly true', () => {
	for (const data of [undefined, {}, { features: undefined }, { features: {} }, { features: { skills: false } }, { features: { skills: 'true' } }, { features: { skills: 1 } }])
		assert.equal(skillsEnabled(data), false, JSON.stringify(data));
	assert.equal(skillsEnabled({ features: { skills: true } }), true);
});

test('the menu by role: Workflows greyed for managers only, Skills behind its feature, ประวัติ for everyone', () => {
	const ids = (role) => workspaceNavigation(role).map((item) => (item.soon ? `${item.id} (soon)` : item.id));
	assert.deepEqual(ids({ canManage: true, skills: false }), ['dashboard', 'workflows (soon)', 'servers', 'connect-ai', 'knowledge', 'history']);
	assert.deepEqual(ids({ canManage: true, skills: true }), ['dashboard', 'skills', 'workflows (soon)', 'servers', 'connect-ai', 'knowledge', 'history']);
	assert.deepEqual(ids({ canManage: false, skills: false }), ['dashboard', 'connect-ai', 'knowledge', 'history']);
	assert.deepEqual(ids({ canManage: false, skills: true }), ['dashboard', 'skills', 'connect-ai', 'knowledge', 'history']);
	const history = (role) => workspaceNavigation(role).find((item) => item.id === 'history').href;
	assert.equal(history({ canManage: true, skills: false }), '/app?view=approvals');
	assert.equal(history({ canManage: false, skills: false }), '/app?view=executions');
	assert.equal(history({ canManage: false, skills: false, requestsApproval: true }), '/app?view=approvals');
	assert.equal(workspaceNavigation({ canManage: true, skills: false }).find((item) => item.id === 'workflows').href, '');
});
