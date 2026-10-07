// ค้นหา… ⌘K (W0, widened in W0.2): what the search lists and how it matches.
// Pure, so the shell and its tests share it. This module imports nothing: the
// shell passes the words and the lists it already has (no new requests).
//
// Owner 2026-10-08, "ปุ่มค้นหาใช้ไม่ได้": it only knew pages, programs and
// workspaces, so a person's name, a knowledge title, a template, a settings tab
// or "เชื่อม…" found nothing and read as broken. It now also lists people,
// knowledge and templates the pages already loaded, settings tabs, the สร้าง
// actions and, on the platform, the customer companies.

/** The groups, in the order the results show them. */
export const JUMP_GROUPS = ['page', 'action', 'setting', 'program', 'workspace', 'person', 'knowledge', 'template', 'company'] as const;
export type JumpGroup = (typeof JUMP_GROUPS)[number];

/** A place ค้นหา… can open: one the viewer can already reach. */
export type JumpTarget = {
	id: string;
	label: string;
	href: string;
	group: JumpGroup;
	/** A second, quieter line: a person's email, a workspace's name, a program's account. */
	hint?: string;
	/** More words it answers to (never shown): "เชื่อม" for เชื่อมโปรแกรม, an email. */
	keywords?: string;
	/** A new page (another company): the link reloads instead of a client navigation. */
	reload?: boolean;
};

type Named = { id?: unknown; name?: unknown; displayName?: unknown; title?: unknown };
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const id = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const list = <T>(value: readonly T[] | null | undefined): readonly T[] => (Array.isArray(value) ? value : []);

/**
 * Lower case without accents or Thai tone and vowel marks, so "เชือม" finds
 * เชื่อม, "cafe" finds Café and "FLOW" finds FlowAccount. NFKD splits ำ into
 * ํ + า and Latin letters from their accents; every combining mark (\p{M},
 * which holds Thai's above and below marks) then goes.
 */
export function foldText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[​-‍﻿]/g, '')
		.toLocaleLowerCase('en')
		.replace(/\s+/g, ' ')
		.trim();
}

/** The words of a query, folded; Thai has no spaces, so each word may be a whole phrase. */
export function queryWords(query: string): string[] {
	return foldText(query).split(' ').filter(Boolean);
}

/**
 * How well a target answers the words: 0 is no match. Every word must appear in
 * its label, hint, keywords or group name; a label that starts with the query
 * ranks first, then a word of the label that does.
 */
export function jumpScore(target: JumpTarget, words: readonly string[], groupLabel = ''): number {
	if (!words.length) return 1;
	const label = foldText(target.label);
	const hay = `${label} ${foldText(target.hint ?? '')} ${foldText(target.keywords ?? '')} ${foldText(groupLabel)}`;
	if (!words.every((word) => hay.includes(word))) return 0;
	const phrase = words.join(' ');
	if (label.startsWith(phrase)) return 4;
	if (label.split(' ').some((part) => part.startsWith(words[0]))) return 3;
	if (label.includes(words[0])) return 2;
	return 1;
}

export type JumpSection = { group: JumpGroup; items: JumpTarget[] };

/**
 * The results, grouped in JUMP_GROUPS order, best first inside a group. With
 * no query: the สร้าง actions and the pages (a short start list). At most
 * `limit` rows in all, and `perGroup` in one group.
 */
export function searchJump(
	targets: readonly JumpTarget[],
	query: string,
	options: { groupLabel?: (group: JumpGroup) => string; limit?: number; perGroup?: number } = {}
): JumpSection[] {
	const words = queryWords(query);
	const limit = options.limit ?? 40;
	const perGroup = options.perGroup ?? (words.length ? 8 : 12);
	const scored = list(targets)
		.filter((target) => target && target.label && target.href)
		.filter((target) => words.length || target.group === 'page' || target.group === 'action')
		.map((target, index) => ({ target, index, score: jumpScore(target, words, options.groupLabel?.(target.group) ?? '') }))
		.filter((entry) => entry.score > 0);
	const sections: JumpSection[] = [];
	let left = limit;
	for (const group of JUMP_GROUPS) {
		if (left <= 0) break;
		const items = scored
			.filter((entry) => entry.target.group === group)
			.sort((a, b) => b.score - a.score || a.index - b.index)
			.slice(0, Math.min(perGroup, left))
			.map((entry) => entry.target);
		if (!items.length) continue;
		sections.push({ group, items });
		left -= items.length;
	}
	return sections;
}

export type JumpSources = {
	/** On the platform's pages: its pages, the help page and the customer companies. */
	platformMode?: boolean;
	canManage?: boolean;
	/** The rail's pages (the shell's labels), ช่วยเหลือ included. */
	pages?: readonly { id: string; label: string; href: string; soon?: boolean }[];
	/** ตั้งค่า's tabs. */
	settings?: readonly { id: string; label: string; href: string }[];
	/** The สร้าง menu's rows the viewer has, with their labels and extra words. */
	actions?: readonly { id: string; label: string; href: string; soon?: boolean; keywords?: string }[];
	connections?: readonly (Named & { archivedAt?: unknown; deletedAt?: unknown })[] | null;
	hubs?: readonly (Named & { status?: unknown })[] | null;
	members?: readonly (Named & { email?: unknown; status?: unknown })[] | null;
	/** A person's display name (the shell's memberName). */
	memberName?: (member: never) => string;
	/** What a page already loaded: the knowledge library's and the document templates' titles. */
	knowledge?: readonly { id: string; title: string; hubID: string; kind?: string; hubName?: string }[] | null;
	templates?: readonly { id: string; title: string; hubID: string; hubName?: string }[] | null;
	/** The companies the switcher lists. */
	companies?: readonly (Named & { status?: unknown })[] | null;
	currentCompany?: string;
	/** Where a company opens: its platform page, or its own workspace (a new page). */
	platformCompanyHref?: (id: string) => string;
	companyHref?: (id: string) => string;
};

/**
 * Every place the viewer can reach, from what the shell already holds. It
 * never throws on a missing or partial field (a live bootstrap may leave one
 * out): an entry without an id or a name is skipped.
 */
export function buildJumpTargets(sources: JumpSources): JumpTarget[] {
	const targets: JumpTarget[] = [];
	const seen = new Set<string>();
	const add = (target: JumpTarget) => {
		if (!target.label || !target.href || seen.has(target.id)) return;
		seen.add(target.id);
		targets.push(target);
	};
	for (const page of list(sources.pages)) if (!page.soon) add({ id: `page:${page.id}`, label: text(page.label), href: page.href, group: 'page' });
	if (sources.platformMode) {
		for (const choice of list(sources.companies)) {
			const key = id(choice?.id);
			const name = text(choice?.displayName) || text(choice?.name);
			if (key && name && sources.platformCompanyHref) add({ id: `company:${key}`, label: name, href: sources.platformCompanyHref(key), group: 'company' });
		}
		return targets;
	}
	for (const action of list(sources.actions)) if (!action.soon) add({ id: `action:${action.id}`, label: text(action.label), href: action.href, group: 'action', keywords: action.keywords });
	for (const entry of list(sources.settings)) add({ id: `setting:${entry.id}`, label: text(entry.label), href: entry.href, group: 'setting' });
	if (sources.canManage)
		for (const connection of list(sources.connections)) {
			const key = id(connection?.id);
			if (!key || connection.archivedAt || connection.deletedAt) continue;
			add({ id: `program:${key}`, label: text(connection.name), href: `/app?view=servers&connection=${encodeURIComponent(key)}`, group: 'program' });
		}
	const hubNames = new Map<string, string>();
	for (const hub of list(sources.hubs)) {
		const key = id(hub?.id);
		if (!key || hub.status === 'archived' || hub.status === 'deleted') continue;
		hubNames.set(key, text(hub.name));
		add({ id: `hub:${key}`, label: text(hub.name), href: `/app?view=hub&hub=${encodeURIComponent(key)}`, group: 'workspace' });
	}
	// People: the team page is for Owners and Admins, so only they find people.
	if (sources.canManage)
		for (const member of list(sources.members)) {
			const key = id(member?.id);
			if (!key || (member.status && member.status !== 'active')) continue;
			let name = '';
			try {
				name = text(sources.memberName?.(member as never)) || text(member.displayName);
			} catch {
				name = text(member.displayName);
			}
			const email = text(member.email);
			add({ id: `person:${key}`, label: name || email, href: `/app?view=members&member=${encodeURIComponent(key)}`, group: 'person', hint: name ? email : undefined, keywords: email });
		}
	for (const item of list(sources.knowledge)) {
		const key = id(item?.id);
		const hub = id(item?.hubID);
		if (!key || !hub) continue;
		const kind = item.kind === 'template' || item.kind === 'file' ? item.kind : 'knowledge';
		add({ id: `knowledge:${key}`, label: text(item.title), href: `/app?view=knowledge&hub=${encodeURIComponent(hub)}&kind=${kind}&item=${encodeURIComponent(key)}`, group: 'knowledge', hint: item.hubName || hubNames.get(hub) || undefined });
	}
	for (const item of list(sources.templates)) {
		const key = id(item?.id);
		const hub = id(item?.hubID);
		if (!key || !hub) continue;
		add({ id: `template:${key}`, label: text(item.title), href: `/app?view=documents&hub=${encodeURIComponent(hub)}&template=${encodeURIComponent(key)}`, group: 'template', hint: item.hubName || hubNames.get(hub) || undefined });
	}
	// Another of the person's companies: a new page, like the switcher.
	if (list(sources.companies).length > 1 && sources.companyHref)
		for (const choice of list(sources.companies)) {
			const key = id(choice?.id);
			const name = text(choice?.displayName) || text(choice?.name);
			if (!key || !name || key === sources.currentCompany) continue;
			add({ id: `company:${key}`, label: name, href: sources.companyHref(key), group: 'company', reload: true });
		}
	return targets;
}
