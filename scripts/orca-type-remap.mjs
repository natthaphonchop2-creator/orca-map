#!/usr/bin/env node
// One step smaller type across the ORCA workspace (owner, 2026-10-07: "ปรับลดขนาดตัวหนังสือทุกหน้า").
// A pure value swap of `font-size: <n>px` (and px numbers inside a font-size clamp()),
// nothing else on the line changes. Idempotent per file: a file is remapped only when it lacks the
// marker comment, so it can be re-run on a merge head after taking another branch's version.
//   node scripts/orca-type-remap.mjs            # rewrite in place
//   node scripts/orca-type-remap.mjs --check    # list what would change, write nothing
//   node scripts/orca-type-remap.mjs --since <rev> [--check]
//     Remap only the lines added in `git diff <rev>` (the working tree against <rev>), whatever the
//     marker says, then mark the file. For hunks another branch adds to a file that is already marked:
//     - before merging, on the other branch:  --since <its fork point>
//     - after merging, on the merge head:     --since <the remapped branch's tip>
//     Run it once per merge and commit: a value alone can't show it was already swapped, so a second
//     run steps the same lines down again. Files must be committed or `git add -N`, untracked ones are
//     not in the diff.
//     It stops if <rev> is older than the remap itself (an added line holds the marker), because the
//     already remapped lines would then be swapped a second time.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOTS = ['src/lib/components/orca', 'src/routes/app', 'src/routes/login', 'src/routes/invite'];
const SKIP = [/\.test\.mjs$/, /marketing\.css$/];
const EXT = /\.(svelte|css)$/;
const MARK = 'orca-type-remap v1';
// old px -> new px. Sizes below 11 px stay.
const MAP = new Map([
	[46, 40], [44, 38], [43, 37], [40, 34], [38, 33], [35, 30],
	[31, 24], [30, 24], [29, 24], [28, 24], [26, 22], [25, 22], [24, 20], [23, 20], [22, 20],
	[21, 18], [20, 18], [19, 18], [18, 16], [17, 16], [16.5, 15], [16, 15], [15.5, 14], [15, 14],
	[14.5, 13.5], [14, 13.5], [13.5, 13], [13, 12.5], [12.5, 12], [12, 11.5], [11.5, 11]
]);
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const since = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : null;
if (argv.includes('--since') && !since) throw new Error('--since needs a git revision');
const swap = (n) => (MAP.has(n) ? MAP.get(n) : n);
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n));

function files(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...files(p));
		else if (EXT.test(p) && !SKIP.some((r) => r.test(p))) out.push(p);
	}
	return out;
}

// file -> Set of 1-based line numbers added in `git diff <rev>` (working tree side).
function addedLines(rev) {
	const diff = execFileSync('git', ['diff', '-U0', '--no-color', '--no-ext-diff', rev, '--', ...ROOTS], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	const map = new Map();
	let file = null;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ')) {
			file = line === '+++ /dev/null' ? null : line.slice(6);
			if (file && !map.has(file)) map.set(file, new Set());
		} else if (file && line.startsWith('@@')) {
			const m = /\+(\d+)(?:,(\d+))?/.exec(line.split('@@')[1]);
			const start = Number(m[1]), count = m[2] === undefined ? 1 : Number(m[2]);
			for (let i = 0; i < count; i++) map.get(file).add(start + i);
		} else if (file && line.startsWith('+') && line.includes(MARK)) {
			throw new Error(`--since ${rev} reaches back past the remap (${file} gains the marker); use a later revision`);
		}
	}
	return map;
}

function remap(text) {
	let n = 0;
	const out = text.replace(/(font-size\s*:\s*)([^;"}\n]+)/g, (all, head, value) => {
		const next = value.replace(/(\d+(?:\.\d+)?)px/g, (m, num) => {
			const v = Number(num), w = swap(v);
			if (w !== v) n++;
			return `${fmt(w)}px`;
		});
		return head + next;
	});
	return { out, n };
}

const targets = since
	? [...addedLines(since)].filter(([f]) => EXT.test(f) && !SKIP.some((r) => r.test(f)) && existsSync(f))
	: ROOTS.flatMap((root) => files(root)).map((f) => [f, null]);

let changed = 0, decls = 0;
for (const [file, only] of targets) {
	const src = readFileSync(file, 'utf8');
	if (!only && src.includes(MARK)) continue;
	let out, n;
	if (only) {
		n = 0;
		out = src
			.split('\n')
			.map((line, i) => {
				if (!only.has(i + 1)) return line;
				const r = remap(line);
				n += r.n;
				return r.out;
			})
			.join('\n');
	} else ({ out, n } = remap(src));
	if (!n) continue;
	changed++; decls += n;
	if (src.includes(MARK)) {
		if (check) console.log(`${relative('.', file)}: ${n}`);
		else writeFileSync(file, out);
		continue;
	}
	// The marker makes a re-run skip the file: a CSS comment, a comment in a Svelte <style>, or an
	// HTML comment at the top of a Svelte file without one.
	const marked = file.endsWith('.css')
		? `/* ${MARK} */\n${out}`
		: /<style[^>]*>/.test(out)
			? out.replace(/<style([^>]*)>/, `<style$1>\n\t/* ${MARK} */`)
			: `<!-- ${MARK} -->\n${out}`;
	if (check) console.log(`${relative('.', file)}: ${n}`);
	else writeFileSync(file, marked);
}
console.log(`${check ? 'would change' : 'changed'} ${decls} font-size values in ${changed} files`);
