#!/usr/bin/env node
// One step smaller type across the ORCA workspace (owner, 2026-10-07: "ปรับลดขนาดตัวหนังสือทุกหน้า").
// A pure value swap of `font-size: <n>px` (and px numbers inside a font-size clamp()),
// nothing else on the line changes. Idempotent per file: a file is remapped only when it lacks the
// marker comment, so it can be re-run on a merge head after taking another branch's version.
//   node scripts/orca-type-remap.mjs            # rewrite in place
//   node scripts/orca-type-remap.mjs --check    # list what would change, write nothing
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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
const check = process.argv.includes('--check');
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

let changed = 0, decls = 0;
for (const root of ROOTS) for (const file of files(root)) {
	const src = readFileSync(file, 'utf8');
	if (src.includes(MARK)) continue;
	let n = 0;
	const out = src.replace(/(font-size\s*:\s*)([^;"}\n]+)/g, (all, head, value) => {
		const next = value.replace(/(\d+(?:\.\d+)?)px/g, (m, num) => {
			const v = Number(num), w = swap(v);
			if (w !== v) n++;
			return `${fmt(w)}px`;
		});
		return head + next;
	});
	if (!n) continue;
	changed++; decls += n;
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
