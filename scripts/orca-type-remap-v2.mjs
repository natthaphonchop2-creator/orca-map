#!/usr/bin/env node
// W0.2: one more step smaller type across the ORCA workspace (owner, 2026-10-08:
// "ขนาดโดยรวมมันยังดูใหญ่ไป ลดลงอีก"): h1 24 -> 22, body 14 -> 13.5, small 12.5 -> 12.
// The same pure value swap as orca-type-remap.mjs (v1, which already ran and must not run
// again), with its own marker, `orca-type-remap v2`: a file that has it is skipped, so no
// file steps down twice. Values the step leaves (13.5, 13, 12, 11.5 and below) stay.
// Files written at the W0.2 scale by hand carry both markers, so neither script touches them.
//   node scripts/orca-type-remap-v2.mjs            # rewrite in place
//   node scripts/orca-type-remap-v2.mjs --check    # list what would change, write nothing
//   node scripts/orca-type-remap-v2.mjs --since <rev> [--check]
//     As v1's --since: remap only the lines `git diff <rev>` adds (another branch's hunks in a
//     file that is already marked), once per merge, and commit. It stops if <rev> is older
//     than this remap (an added line holds the v2 marker), and a second run against the same
//     <rev> stops too: each run stamps the files it changes with the marker.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOTS = ['src/lib/components/orca', 'src/routes/app', 'src/routes/login', 'src/routes/invite'];
const SKIP = [/\.test\.mjs$/, /marketing\.css$/];
const EXT = /\.(svelte|css)$/;
const MARK = 'orca-type-remap v2';
// old px -> new px (the v1 scale -> W0.2). Unlisted sizes stay.
const MAP = new Map([
	[40, 36], [38, 34], [37, 33], [34, 30], [33, 30], [31, 28], [30, 27], [29, 26], [28, 26], [26, 24], [25, 22],
	[24, 22], [23, 21], [22, 20], [21, 19], [20, 18], [19, 17], [18, 16], [17, 15], [16.5, 15], [16, 15],
	[15.5, 14], [15, 14], [14.5, 13.5], [14, 13.5], [12.5, 12]
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
			throw new Error(`--since ${rev}: ${file} gains a remap v2 marker or stamp since then, so its lines may already be remapped (the remap itself, or an earlier --since run); commit and use a later revision`);
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
		// A --since run stamps the file next to its marker. The stamp holds the marker, so a second
		// run against the same <rev> sees it as an added line and stops (the guard in addedLines)
		// instead of stepping the same lines down again (22 -> 20 -> 18; Codex W0.2 round 1, NOTE 4).
		if (only) {
			const lines = out.split('\n');
			const at = lines.findIndex((line) => line.includes(MARK));
			const html = lines[at].trim().startsWith('<!--');
			lines.splice(at + 1, 0, html ? `<!-- ${MARK}: --since ${since} -->` : `${lines[at].match(/^\s*/)[0]}/* ${MARK}: --since ${since} */`);
			out = lines.join('\n');
		}
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
