import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// scripts/orca-type-remap-v2.mjs (W0.2): a file steps down once. A --since run against
// the same revision twice must stop the second time, not take 22 -> 20 -> 18 (Codex W0.2
// round 1, NOTE 4). Runs the real script in a throwaway git repository.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const script = path.join(root, 'scripts/orca-type-remap-v2.mjs');

function repo(t) {
	const dir = mkdtempSync(path.join(tmpdir(), 'orca-remap-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const git = (...args) => execFileSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', ...args], { cwd: dir, encoding: 'utf8' });
	git('init', '-q');
	mkdirSync(path.join(dir, 'scripts'));
	// The script's roots.
	for (const root of ['src/lib/components/orca', 'src/routes/app', 'src/routes/login', 'src/routes/invite']) mkdirSync(path.join(dir, root), { recursive: true });
	copyFileSync(script, path.join(dir, 'scripts/orca-type-remap-v2.mjs'));
	return { dir, git, run: (...args) => spawnSync(process.execPath, ['scripts/orca-type-remap-v2.mjs', ...args], { cwd: dir, encoding: 'utf8' }) };
}

test('remap v2: a whole run marks each file and never steps a marked file again', (t) => {
	const { dir, run } = repo(t);
	const file = path.join(dir, 'src/lib/components/orca/a.css');
	writeFileSync(file, '.a { font-size: 24px; }\n.b { font-size: 13.5px; }\n');
	assert.equal(run().status, 0);
	assert.equal(readFileSync(file, 'utf8'), '/* orca-type-remap v2 */\n.a { font-size: 22px; }\n.b { font-size: 13.5px; }\n');
	assert.equal(run().status, 0);
	assert.match(readFileSync(file, 'utf8'), /font-size: 22px/, 'the second whole run leaves it');
});

test('remap v2 --since: the added lines of a marked file step once; the same --since again stops', (t) => {
	const { dir, git, run } = repo(t);
	const css = path.join(dir, 'src/lib/components/orca/a.css');
	const svelte = path.join(dir, 'src/lib/components/orca/B.svelte');
	writeFileSync(css, '/* orca-type-remap v2 */\n.a { font-size: 13px; }\n');
	writeFileSync(svelte, '<p>x</p>\n<style>\n\t/* orca-type-remap v2 */\n\t.p { font-size: 13px; }\n</style>\n');
	git('add', '.');
	git('commit', '-qm', 'base');
	const base = git('rev-parse', 'HEAD').trim();
	// Another branch's hunks arrive at the old scale.
	writeFileSync(css, readFileSync(css, 'utf8') + '.new { font-size: 22px; }\n');
	writeFileSync(svelte, readFileSync(svelte, 'utf8').replace('</style>', '\t.q { font-size: 16px; }\n</style>'));
	const first = run('--since', base);
	assert.equal(first.status, 0, first.stderr);
	assert.match(readFileSync(css, 'utf8'), /\.new \{ font-size: 20px; \}/);
	assert.match(readFileSync(css, 'utf8'), /\.a \{ font-size: 13px; \}/, 'old lines stay');
	assert.match(readFileSync(svelte, 'utf8'), /\.q \{ font-size: 15px; \}/);
	assert.match(readFileSync(css, 'utf8'), /\/\* orca-type-remap v2: --since [0-9a-f]+ \*\//, 'the run stamps the file');
	// The same baseline again: it refuses, and nothing steps down a second time.
	const second = run('--since', base);
	assert.notEqual(second.status, 0, 'a second run with the same --since stops');
	assert.match(second.stderr, /gains a remap v2 marker or stamp/);
	assert.match(readFileSync(css, 'utf8'), /\.new \{ font-size: 20px; \}/, 'still 20, never 18');
	assert.match(readFileSync(svelte, 'utf8'), /\.q \{ font-size: 15px; \}/);
	// Committed, a later revision is clean: nothing more to do, and no error.
	git('add', '.');
	git('commit', '-qm', 'remapped');
	const later = run('--since', git('rev-parse', 'HEAD').trim());
	assert.equal(later.status, 0, later.stderr);
	assert.match(readFileSync(css, 'utf8'), /\.new \{ font-size: 20px; \}/);
});
