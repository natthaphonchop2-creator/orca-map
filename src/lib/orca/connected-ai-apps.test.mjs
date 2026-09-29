import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./test-import.mjs";

const apps = await importTypeScript(new URL("./connected-ai-apps.ts", import.meta.url));
const { secretRows } = await importTypeScript(new URL("./secrets.ts", import.meta.url));
const {
  APPS_FILTERS, agoLabel, appKind, appReach, appsFilter, avatarTone, canDisconnectAll, connectedApps, connectedAppsHref,
  disconnectEach, initial, shortDate, shortName, timeAgo,
} = apps;

// Synthetic people and apps shaped like the mockup: 7 apps from 4 people.
const now = Date.parse("2026-09-28T10:30:00+07:00");
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
const ahead = (days) => new Date(now + days * 86_400_000).toISOString();
const members = [
  { id: "owner", displayName: "วิภา ตัวอย่าง", email: "owner@example.invalid", role: "owner" },
  { id: "admin", displayName: "ธนา ทดสอบ", email: "admin@example.invalid", role: "admin" },
  { id: "mali", displayName: "มาลี สมบูรณ์", email: "mali@example.invalid", role: "employee" },
  { id: "siri", displayName: "ศิริ ทดลอง", email: "siri@example.invalid", role: 4 },
  { id: "idle", displayName: "Idle Person", email: "idle@example.invalid", role: "employee" },
];
const hubs = [
  { id: "sales", name: "ฝ่ายขาย", status: "active", memberIDs: ["owner", "mali"], effectiveMemberIDs: ["owner", "mali"] },
  { id: "acc", name: "ฝ่ายบัญชี", status: "active", memberIDs: ["owner"], effectiveMemberIDs: ["owner", "admin", "siri"] },
  { id: "draft", name: "ร่าง", status: "draft", memberIDs: ["admin"] },
];
const inventory = {
  sessions: [
    { id: "s1", app: "ChatGPT", userID: "mali", createdAt: ago(9 * 1440), lastRefreshedAt: ago(3 * 1440), expiresAt: ahead(26) },
    { id: "s2", app: "Claude", userID: "mali", createdAt: ago(4 * 1440), lastRefreshedAt: ago(1440), expiresAt: ahead(12) },
    { id: "s3", app: "Claude", userID: "owner", createdAt: ago(30 * 1440), lastRefreshedAt: ago(60), expiresAt: ahead(29) },
    { id: "s4", app: "ChatGPT", userID: "owner", createdAt: ago(12 * 1440), lastRefreshedAt: ago(6 * 1440), expiresAt: ahead(21) },
  ],
  keys: [
    { id: 101, name: "Sales report script", userID: "mali", hubID: "sales", createdAt: ago(60 * 1440), lastUsedAt: ago(38 * 1440), expiresAt: ahead(80) },
    { id: 102, name: "Office laptop", userID: "admin", createdAt: ago(20 * 1440), lastUsedAt: ago(300) },
    { id: 103, name: "Month-end script", userID: "siri", hubID: "acc", createdAt: ago(40 * 1440), expiresAt: ahead(53) },
  ],
};
const isOwner = (role) => role === "owner";
const rows = () => {
  const { sessions, keys } = secretRows(inventory, members, hubs, now, isOwner);
  return [...sessions, ...keys];
};
const model = (options = {}) => connectedApps(rows(), { filter: "all", members, viewerID: "owner", ...options });

test("the chips and the person live in the address; anything else is everything", () => {
  assert.deepEqual(APPS_FILTERS, ["all", "stale", "noexpiry"]);
  assert.equal(appsFilter("stale"), "stale");
  assert.equal(appsFilter("noexpiry"), "noexpiry");
  for (const value of [null, undefined, "", "STALE", "all", "expired"]) assert.equal(appsFilter(value), "all");
  assert.equal(connectedAppsHref(), "/app?view=secrets");
  assert.equal(connectedAppsHref("stale"), "/app?view=secrets&filter=stale");
  assert.equal(connectedAppsHref("all", "user 1&x"), "/app?view=secrets&holder=user+1%26x");
  assert.equal(connectedAppsHref("noexpiry", "mali"), "/app?view=secrets&filter=noexpiry&holder=mali");
});

test("apps are grouped by person, the ones needing a look first, with counts for the chips", () => {
  const view = model();
  assert.deepEqual(view.counts, { all: 7, stale: 2, noexpiry: 1 });
  assert.equal(view.apps, 7);
  assert.equal(view.people, 4);
  // Unused access first, then keys that never expire, then more apps, then by name.
  assert.deepEqual(view.groups.map((group) => group.userID), ["mali", "siri", "admin", "owner"]);
  const mali = view.groups[0];
  assert.equal(mali.name, "มาลี สมบูรณ์");
  assert.equal(mali.role, "employee");
  assert.deepEqual(mali.rows.map((row) => row.kind), ["session", "session", "key"], "sign-ins before keys");
  assert.equal(mali.stale, 1);
  assert.equal(view.groups.find((group) => group.userID === "siri").role, "employee", "numeric roles too");
  assert.equal(view.groups.find((group) => group.userID === "owner").isViewer, true);
  assert.equal(view.holder, undefined);
});

test("a chip narrows the rows but a person's group still counts everything they connected", () => {
  const stale = model({ filter: "stale" });
  assert.deepEqual(stale.groups.map((group) => [group.userID, group.rows.length, group.all.length]), [["mali", 1, 3], ["siri", 1, 1]]);
  assert.equal(stale.apps, 2);
  assert.deepEqual(stale.counts, { all: 7, stale: 2, noexpiry: 1 });
  const never = model({ filter: "noexpiry" });
  assert.deepEqual(never.groups.map((group) => group.rows.map((row) => row.label)), [["Office laptop"]]);
});

test("holder and search narrow the people, and the chips count within them", () => {
  const one = model({ holder: "mali" });
  assert.deepEqual(one.groups.map((group) => group.userID), ["mali"]);
  assert.deepEqual(one.counts, { all: 3, stale: 1, noexpiry: 0 });
  assert.deepEqual(one.holder, { id: "mali", name: "มาลี สมบูรณ์" });
  const nobody = model({ holder: "idle" });
  assert.equal(nobody.groups.length, 0);
  assert.equal(nobody.holder.name, "Idle Person", "a member with nothing connected is still named");
  assert.equal(model({ holder: "gone" }).holder, undefined);
  assert.deepEqual(model({ query: "  ศิริ " }).groups.map((group) => group.userID), ["siri"]);
  assert.deepEqual(model({ query: "ADMIN@example" }).groups.map((group) => group.userID), ["admin"], "by e-mail, any case");
  assert.equal(model({ query: "nobody" }).apps, 0);
});

test("someone who is no longer a member comes first, without a role", () => {
  const leaver = { id: 9, name: "Old laptop", userID: "left", createdAt: ago(2 * 1440), lastUsedAt: ago(10) };
  const { sessions, keys } = secretRows({ ...inventory, keys: [...inventory.keys, leaver] }, members, hubs, now, isOwner);
  const view = connectedApps([...sessions, ...keys], { filter: "all", members, viewerID: "owner" });
  assert.equal(view.groups[0].userID, "left");
  assert.equal(view.groups[0].name, "");
  assert.equal(view.groups[0].role, undefined);
});

test("an admin never gets disconnect-all on an owner's group, and one app needs no disconnect-all", () => {
  const groups = Object.fromEntries(model().groups.map((group) => [group.userID, group]));
  assert.equal(canDisconnectAll(groups.owner, "admin", false), false, "admin looking at the owner");
  assert.equal(canDisconnectAll(groups.owner, "owner", true), true);
  assert.equal(canDisconnectAll(groups.mali, "admin", false), true);
  assert.equal(canDisconnectAll(groups.siri, "owner", true), false, "a single app has its own button");
  // Another owner may disconnect all of an owner's apps; an admin may disconnect their own.
  assert.equal(canDisconnectAll(groups.owner, "other-owner", true), true);
  assert.equal(canDisconnectAll({ all: groups.owner.all.map((row) => ({ ...row, userID: "admin" })) }, "admin", false), true);
});

test("where an app pulls data from: a key's workspace, or the holder's active workspaces", () => {
  const byLabel = Object.fromEntries(rows().map((row) => [`${row.userID}:${row.label}`, row]));
  assert.deepEqual(appReach(byLabel["mali:Sales report script"], hubs), { kind: "one", name: "ฝ่ายขาย", only: true });
  assert.deepEqual(appReach(byLabel["mali:ChatGPT"], hubs), { kind: "one", name: "ฝ่ายขาย", only: true });
  assert.deepEqual(appReach(byLabel["owner:Claude"], hubs), { kind: "all" }, "every active workspace");
  assert.deepEqual(appReach(byLabel["admin:Office laptop"], hubs), { kind: "one", name: "ฝ่ายบัญชี", only: true }, "inherited access counts; a draft does not");
  assert.deepEqual(appReach({ userID: "idle" }, hubs), { kind: "none" });
  assert.deepEqual(appReach({ userID: "owner" }, [hubs[0], hubs[1], { id: "x", name: "X", status: "active", memberIDs: [] }]), { kind: "some", names: ["ฝ่ายขาย", "ฝ่ายบัญชี"] });
  assert.deepEqual(appReach({ userID: "mali" }, [hubs[0]]), { kind: "one", name: "ฝ่ายขาย", only: false }, "the only workspace is not 'only'");
  assert.deepEqual(appReach({ userID: "mali", hubID: "gone" }, hubs), { kind: "one", name: undefined, only: true });
});

test("last use reads in days for sign-ins (renewals) and in minutes or hours for keys", () => {
  const t = (th) => th;
  const label = (value, precise) => agoLabel(timeAgo(value, now, precise), t);
  assert.equal(label(ago(0.5), true), "เมื่อสักครู่");
  assert.equal(label(ago(12), true), "12 นาทีก่อน");
  assert.equal(label(ago(300), true), "5 ชั่วโมงก่อน");
  assert.equal(label(ago(300), false), "วันนี้");
  // 10:30 in Bangkok: 11 hours ago was yesterday evening.
  assert.equal(label(ago(11 * 60), false), "เมื่อวาน");
  assert.equal(label(ago(3 * 1440), false), "3 วันก่อน");
  assert.equal(label(ago(38 * 1440), true), "38 วันก่อน");
  assert.equal(label(new Date(now + 60_000).toISOString(), false), "วันนี้", "a clock ahead of ours is today");
  assert.equal(label(undefined, true), "—");
  assert.equal(label("not a date", true), "—");
  assert.equal(agoLabel({ unit: "days", count: 2 }, (_th, en) => en), "2 days ago");
});

test("dates, names and avatars", () => {
  assert.equal(shortDate("2026-10-24T03:00:00Z", "th"), "24 ต.ค. 2569");
  assert.equal(shortDate("2026-10-24T20:00:00Z", "en"), "25 Oct 2026", "in Bangkok time");
  assert.equal(shortDate(undefined, "th"), "—");
  assert.equal(shortName("มาลี สมบูรณ์"), "มาลี");
  assert.equal(shortName("  Jordan   Sample "), "Jordan");
  assert.equal(shortName("someone@example.invalid"), "someone");
  assert.equal(shortName(""), "");
  assert.equal(initial("มาลี สมบูรณ์"), "ม");
  assert.equal(initial("เกศินี ใจดี"), "ก", "a leading vowel is not the initial");
  assert.equal(initial("jordan"), "J");
  assert.equal(avatarTone("owner", "owner"), "ink");
  assert.ok(["citron", "ok", "quiet"].includes(avatarTone("mali", "employee")));
  assert.equal(avatarTone("mali", "employee"), avatarTone("mali", "admin"), "a person keeps their tone");
  assert.equal(appKind({ kind: "session", label: "Claude Desktop" }), "claude");
  assert.equal(appKind({ kind: "session", label: "ChatGPT" }), "chatgpt");
  assert.equal(appKind({ kind: "session", label: "OpenAI Agent" }), "chatgpt");
  assert.equal(appKind({ kind: "session", label: "n8n" }), "other");
  assert.equal(appKind({ kind: "key", label: "Claude Code" }), "key");
});

test("disconnect-all goes through each item's own endpoint, in turn, and reports X of Y", async () => {
  const calls = [];
  const seen = [];
  const result = await disconnectEach(["a", "b", "c"], async (item) => {
    calls.push(item);
    if (item === "b") throw new Error("already gone");
  }, (attempted, total) => seen.push(`${attempted}/${total}`));
  assert.deepEqual(calls, ["a", "b", "c"], "one failure never stops the rest");
  assert.deepEqual(result, { done: 2, total: 3, failed: ["b"] });
  assert.deepEqual(seen, ["1/3", "2/3", "3/3"]);
  let running = 0;
  let most = 0;
  await disconnectEach([1, 2, 3], async () => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    running -= 1;
  });
  assert.equal(most, 1, "never two at once");
  assert.deepEqual(await disconnectEach([], async () => {}), { done: 0, total: 0, failed: [] });
});
